import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { WebSocket } from "ws";

const BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;
const MAX_TEXT_BYTES = 4096;

const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

let clockSkewSeconds = 0;

function uuid() {
  return randomUUID().replaceAll("-", "");
}

function generateSecMsGec() {
  let ticks = Date.now() / 1000 + clockSkewSeconds;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const strToHash = `${Math.floor(ticks)}${TRUSTED_CLIENT_TOKEN}`;
  return createHash("sha256").update(strToHash, "ascii").digest("hex").toUpperCase();
}

function generateMuid() {
  return randomBytes(16).toString("hex").toUpperCase();
}

function wsHeaders() {
  return {
    "User-Agent": USER_AGENT,
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    Cookie: `muid=${generateMuid()};`,
  };
}

function dateToString() {
  return new Date().toUTCString().replace(
    "GMT",
    "GMT+0000 (Coordinated Universal Time)",
  );
}

function removeIncompatibleCharacters(text) {
  return [...text]
    .map((char) => {
      const code = char.charCodeAt(0);
      if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)) {
        return " ";
      }
      return char;
    })
    .join("");
}

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function splitTextByByteLength(text) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= MAX_TEXT_BYTES) return [text];

  const chunks = [];
  let remaining = bytes;

  while (remaining.length > MAX_TEXT_BYTES) {
    let splitAt = remaining.lastIndexOf("\n", MAX_TEXT_BYTES);
    if (splitAt < 0) splitAt = remaining.lastIndexOf(" ", MAX_TEXT_BYTES);
    if (splitAt < 0) {
      splitAt = MAX_TEXT_BYTES;
      while (splitAt > 0) {
        try {
          remaining.subarray(0, splitAt).toString("utf8");
          break;
        } catch {
          splitAt -= 1;
        }
      }
    }

    const chunk = remaining.subarray(0, splitAt).toString("utf8").trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.subarray(splitAt > 0 ? splitAt : 1);
  }

  const tail = remaining.toString("utf8").trim();
  if (tail) chunks.push(tail);
  return chunks.length > 0 ? chunks : [text];
}

function parseHeaders(raw) {
  const headers = {};
  for (const line of raw.toString("utf8").split("\r\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    headers[line.slice(0, index)] = line.slice(index + 1);
  }
  return headers;
}

function buildSsml(text, voice, volume, rate, pitch) {
  return (
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
    `${escapeXml(text)}</prosody></voice></speak>`
  );
}

async function syncClockSkew() {
  try {
    const resp = await fetch(VOICE_LIST_URL, {
      headers: {
        ...wsHeaders(),
        Authority: "speech.platform.bing.com",
        Accept: "*/*",
      },
    });
    const dateHeader = resp.headers.get("date");
    if (!dateHeader) return;
    const serverTime = Date.parse(dateHeader) / 1000;
    if (Number.isFinite(serverTime)) {
      clockSkewSeconds += serverTime - Date.now() / 1000;
    }
  } catch {
    // Si falla la sync, seguimos con el reloj local.
  }
}

function synthesizeChunk(text, options) {
  const {
    voice = "es-ES-ElviraNeural",
    volume = "+0%",
    rate = "+0%",
    pitch = "+0Hz",
  } = options;

  const url =
    `${WSS_URL}&ConnectionId=${uuid()}` +
    `&Sec-MS-GEC=${generateSecMsGec()}` +
    `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      host: "speech.platform.bing.com",
      headers: wsHeaders(),
      perMessageDeflate: true,
    });

    const audioData = [];
    let settled = false;

    const finish = (err, buffer) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(buffer);
    };

    ws.on("message", (rawData, isBinary) => {
      if (!isBinary) {
        const headers = parseHeaders(rawData);
        if (headers.Path === "turn.end") {
          finish(null, Buffer.concat(audioData));
          ws.close();
        }
        return;
      }

      if (rawData.length < 2) return;

      const headerLength = rawData.readUInt16BE(0);
      if (headerLength + 2 > rawData.length) return;

      const headerPart = rawData.subarray(2, 2 + headerLength);
      const body = rawData.subarray(2 + headerLength);
      const headers = parseHeaders(headerPart);

      if (headers.Path === "audio" && body.length > 0) {
        audioData.push(body);
      }
    });

    ws.on("error", (err) => finish(err));
    ws.on("close", () => {
      if (!settled) {
        finish(new Error("Edge TTS cerró la conexión sin audio"));
      }
    });

    const configMessage =
      `X-Timestamp:${dateToString()}\r\n` +
      "Content-Type:application/json; charset=utf-8\r\n" +
      "Path:speech.config\r\n\r\n" +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{' +
      '"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"' +
      '},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}';

    ws.on("open", () => {
      ws.send(configMessage, { compress: true }, (configError) => {
        if (configError) {
          finish(configError);
          return;
        }

        const ssml = buildSsml(text, voice, volume, rate, pitch);
        const ssmlMessage =
          `X-RequestId:${uuid()}\r\n` +
          "Content-Type:application/ssml+xml\r\n" +
          `X-Timestamp:${dateToString()}Z\r\n` +
          "Path:ssml\r\n\r\n" +
          ssml;

        ws.send(ssmlMessage, { compress: true }, (ssmlError) => {
          if (ssmlError) finish(ssmlError);
        });
      });
    });
  });
}

export async function synthesizeEdgeTts(text, options = {}) {
  const cleaned = removeIncompatibleCharacters(String(text ?? "").trim());
  if (!cleaned) {
    throw new Error("Texto TTS vacío");
  }

  const chunks = splitTextByByteLength(cleaned);
  const audioParts = [];

  for (const chunk of chunks) {
    let lastError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        audioParts.push(await synthesizeChunk(chunk, options));
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === 0 && message.includes("403")) {
          await syncClockSkew();
          continue;
        }
        throw err;
      }
    }

    if (lastError) throw lastError;
  }

  return Buffer.concat(audioParts);
}
