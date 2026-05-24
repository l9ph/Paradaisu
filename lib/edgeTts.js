import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { WebSocket } from "ws";

const baseUrl = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const webSocketURL = `wss://${baseUrl}/edge/v1?TrustedClientToken=${token}`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 Edg/103.0.1264.44";

function uuid() {
  return randomUUID().replaceAll("-", "");
}

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function synthesizeEdgeTts(text, options = {}) {
  const {
    voice = "es-ES-ElviraNeural",
    volume = "+0%",
    rate = "+0%",
    pitch = "+0Hz",
  } = options;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${webSocketURL}&ConnectionId=${uuid()}`, {
      host: "speech.platform.bing.com",
      origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      headers: { "User-Agent": USER_AGENT },
    });

    const audioData = [];

    ws.on("message", (rawData, isBinary) => {
      if (!isBinary) {
        if (rawData.toString("utf8").includes("turn.end")) {
          resolve(Buffer.concat(audioData));
          ws.close();
        }
        return;
      }

      const separator = "Path:audio\r\n";
      const index = rawData.indexOf(separator);
      if (index === -1) return;
      audioData.push(rawData.subarray(index + separator.length));
    });

    ws.on("error", reject);

    const speechConfig = JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: false,
              wordBoundaryEnabled: false,
            },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          },
        },
      },
    });

    const configMessage =
      `X-Timestamp:${Date()}\r\n` +
      "Content-Type:application/json; charset=utf-8\r\n" +
      "Path:speech.config\r\n\r\n" +
      speechConfig;

    ws.on("open", () => {
      ws.send(configMessage, { compress: true }, (configError) => {
        if (configError) {
          reject(configError);
          return;
        }

        const ssmlMessage =
          `X-RequestId:${uuid()}\r\n` +
          "Content-Type:application/ssml+xml\r\n" +
          `X-Timestamp:${Date()}Z\r\n` +
          "Path:ssml\r\n\r\n" +
          "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
          `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
          `${escapeXml(text)}</prosody></voice></speak>`;

        ws.send(ssmlMessage, { compress: true }, (ssmlError) => {
          if (ssmlError) reject(ssmlError);
        });
      });
    });
  });
}
