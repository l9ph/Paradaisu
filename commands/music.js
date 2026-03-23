import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { BOT_MESSAGES } from "../messages.js";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import play from "play-dl";

const SEARCH_LIMIT = 10;
const AUTOCOMPLETE_LIMIT = 10;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_MS = 5000;
const YOUTUBE_COOKIE = process.env.YOUTUBE_COOKIE?.trim();
const PLAYDL_USERAGENTS = (process.env.PLAYDL_USERAGENTS || "")
  .split("||")
  .map((x) => x.trim())
  .filter(Boolean);

const musicStates = new Map();
let playDlSetupPromise;

function buildTrackFromResult(r) {
  const fallbackVideoId = r?.videoId;
  const resolvedUrl =
    typeof r?.url === "string" && r.url.trim()
      ? r.url.trim()
      : fallbackVideoId
        ? `https://www.youtube.com/watch?v=${fallbackVideoId}`
        : "";

  return {
    title: r.title || "Sin título",
    url: resolvedUrl,
    duration:
      r.durationRaw ||
      (typeof r.durationInSec === "number" ? `${r.durationInSec}s` : "desconocida"),
  };
}

function truncate(text, max = 100) {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function isValidHttpUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function scoreMusicLikeResult(item) {
  const title = String(item?.title || "").toLowerCase();
  const channel = String(item?.channel?.name || "").toLowerCase();
  let score = 0;

  // Priorizamos resultados tipo YouTube Music (Topic / audio oficial).
  if (channel.endsWith(" - topic")) score += 8;
  if (title.includes("official audio")) score += 5;
  if (title.includes("audio oficial")) score += 5;
  if (title.includes("audio")) score += 2;

  // Penalizamos videos más "visuales" para alejarse de videos normales.
  if (title.includes("official video")) score -= 6;
  if (title.includes("video oficial")) score -= 6;
  if (title.includes("lyric")) score -= 2;
  if (title.includes("en vivo") || title.includes("live")) score -= 2;

  return score;
}

function sortMusicLike(results) {
  return [...results].sort((a, b) => scoreMusicLikeResult(b) - scoreMusicLikeResult(a));
}

async function searchMusicByName(query, limit = SEARCH_LIMIT) {
  const targetLimit = Math.max(limit * 2, 12);
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`YouTube search HTTP ${res.status}`);
  const html = await res.text();

  const marker = "var ytInitialData = ";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error("No ytInitialData marker");
  const start = markerIndex + marker.length;
  const end = html.indexOf(";</script>", start);
  if (end < 0) throw new Error("No ytInitialData end");
  const jsonText = html.slice(start, end);
  const initialData = JSON.parse(jsonText);

  const videos = [];
  const stack = [initialData];
  while (stack.length > 0 && videos.length < targetLimit) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;

    if (node.videoRenderer?.videoId) {
      videos.push(node.videoRenderer);
      continue;
    }

    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    for (const value of Object.values(node)) stack.push(value);
  }

  const mapped = videos
    .map((v) => {
      const title =
        v?.title?.runs?.map((r) => r?.text).filter(Boolean).join("") ||
        v?.title?.simpleText ||
        "Sin título";
      const channelName =
        v?.ownerText?.runs?.[0]?.text || v?.longBylineText?.runs?.[0]?.text || "";
      const durationRaw = v?.lengthText?.simpleText || "desconocida";
      return {
        title,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        durationRaw,
        channel: { name: channelName },
      };
    })
    .filter((x) => x.url && x.title);

  if (mapped.length === 0) throw new Error("No video results parsed");
  return sortMusicLike(mapped).slice(0, limit);
}

function getMusicState(guildId) {
  return musicStates.get(guildId) || null;
}

function isRateLimitedError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("429") || msg.includes("rate limit");
}

function isBotCheckError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("confirm you’re not a bot") || msg.includes("confirm you're not a bot");
}

async function ensurePlayDlSetup() {
  if (playDlSetupPromise) return playDlSetupPromise;
  playDlSetupPromise = (async () => {
    const token = {};
    if (YOUTUBE_COOKIE) token.youtube = { cookie: YOUTUBE_COOKIE };
    if (PLAYDL_USERAGENTS.length > 0) token.useragent = PLAYDL_USERAGENTS;
    if (Object.keys(token).length === 0) return;
    await play.setToken(token);
    console.log("[music] play-dl token configurado (cookie/useragent).");
  })().catch((err) => {
    playDlSetupPromise = null;
    console.error("[music] No se pudo configurar play-dl token:", err);
  });
  return playDlSetupPromise;
}

function cleanupGuildState(guildId) {
  const state = musicStates.get(guildId);
  if (!state) return;
  try {
    state.player.stop();
  } catch {}
  try {
    state.connection.destroy();
  } catch {}
  musicStates.delete(guildId);
}

async function playNext(guildId) {
  const state = musicStates.get(guildId);
  if (!state) return;
  let next = state.queue.shift();
  while (next && !isValidHttpUrl(next.url)) {
    console.warn("[music] track omitido por URL inválida:", next);
    next = state.queue.shift();
  }
  if (!next) {
    state.current = null;
    return;
  }

  try {
    await ensurePlayDlSetup();
    const stream = await play.stream(next.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    state.current = next;
    next._retries = 0;
    state.player.play(resource);
  } catch (err) {
    console.error("[music] Error reproduciendo track:", err);
    state.current = null;
    if (isBotCheckError(err)) {
      console.error(
        "[music] YouTube pidió validación anti-bot. Configura YOUTUBE_COOKIE en .env para estabilizar reproducción.",
      );
      setTimeout(() => {
        void playNext(guildId);
      }, 500);
      return;
    }
    if (isRateLimitedError(err)) {
      const retries = Number(next?._retries || 0);
      if (retries < MAX_RATE_LIMIT_RETRIES) {
        next._retries = retries + 1;
        state.queue.unshift(next);
        setTimeout(() => {
          void playNext(guildId);
        }, RATE_LIMIT_RETRY_MS);
        return;
      }
    }
    setTimeout(() => {
      void playNext(guildId);
    }, 250);
  }
}

function createGuildState(interaction, voiceChannelId) {
  const guildId = interaction.guild.id;
  const connection = joinVoiceChannel({
    guildId,
    channelId: voiceChannelId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  connection.subscribe(player);

  const state = {
    guildId,
    voiceChannelId,
    connection,
    player,
    queue: [],
    current: null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    void playNext(guildId);
  });
  player.on("error", (err) => {
    console.error("[music] AudioPlayer error:", err);
    void playNext(guildId);
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    musicStates.delete(guildId);
  });

  musicStates.set(guildId, state);
  return state;
}

async function enqueueTrack(interaction, track) {
  const guildId = interaction.guild.id;
  const memberVoice = interaction.member?.voice?.channel;
  if (!memberVoice) return { ok: false, error: BOT_MESSAGES.music.mustBeInVoice };
  if (!track || !isValidHttpUrl(track.url)) {
    return { ok: false, error: "No pude leer una URL válida para esa canción." };
  }

  let state = getMusicState(guildId);
  if (state) {
    const connection = getVoiceConnection(guildId);
    const activeChannelId =
      connection?.joinConfig?.channelId || state.connection.joinConfig.channelId;
    if (activeChannelId && activeChannelId !== memberVoice.id) {
      return {
        ok: false,
        error: BOT_MESSAGES.music.mustJoinSameVoice,
      };
    }
  } else {
    state = createGuildState(interaction, memberVoice.id);
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      cleanupGuildState(guildId);
      return { ok: false, error: BOT_MESSAGES.music.cannotJoinVoice };
    }
  }

  state.queue.push(track);
  if (state.player.state.status === AudioPlayerStatus.Idle && !state.current) {
    await playNext(guildId);
    return { ok: true, startedNow: true };
  }
  return { ok: true, startedNow: false };
}

export const playCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Busca y reproduce música")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("music")
        .setDescription("Nombre de canción o artista")
        .setAutocomplete(true)
        .setRequired(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused()?.trim();
    if (!focused || focused.length < 2) {
      await interaction.respond([]);
      return;
    }

    try {
      await ensurePlayDlSetup();
      const results = await searchMusicByName(focused, AUTOCOMPLETE_LIMIT);
      await interaction.respond(
        results.slice(0, 25).map((r) => ({
          name: truncate(`${r.title} • ${r.channel?.name || "Canal desconocido"}`, 100),
          value: truncate(r.url || focused, 100),
        })),
      );
    } catch (err) {
      console.error("[music] autocomplete:", err);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.common.serverOnlyShort,
      });
      return;
    }

    const query = interaction.options.getString("music", true).trim();
    if (!query) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.music.queryRequired,
      });
      return;
    }

    if (!interaction.member?.voice?.channel) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.music.mustBeInVoice,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await ensurePlayDlSetup();
      let selectedTrack;
      if (isValidHttpUrl(query)) {
        selectedTrack = {
          title: "Canción seleccionada",
          url: query,
          duration: "desconocida",
        };
      } else {
        const results = await searchMusicByName(query, SEARCH_LIMIT);
        const tracks = (results || [])
          .map(buildTrackFromResult)
          .filter((t) => isValidHttpUrl(t.url))
          .slice(0, SEARCH_LIMIT);
        if (tracks.length === 0) {
          await interaction.editReply({
            content: BOT_MESSAGES.music.noResults,
          });
          return;
        }
        selectedTrack = tracks[0];
      }

      const result = await enqueueTrack(interaction, selectedTrack);
      if (!result.ok) {
        await interaction.editReply({ content: result.error });
        return;
      }
      await interaction.editReply({
        content: result.startedNow
          ? BOT_MESSAGES.music.playNow(selectedTrack.title)
          : BOT_MESSAGES.music.queued(selectedTrack.title),
      });
    } catch (err) {
      console.error("[music] /play search:", err);
      await interaction.editReply({
        content: BOT_MESSAGES.music.searchError,
      });
    }
  },
};

export const skipCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Salta la canción actual")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.common.serverOnlyShort,
      });
      return;
    }
    const state = getMusicState(interaction.guild.id);
    if (!state || (!state.current && state.queue.length === 0)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.music.nothingPlaying,
      });
      return;
    }
    state.player.stop();
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.music.skipped,
    });
  },
};

export const stopCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Detiene la música y limpia la cola")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.common.serverOnlyShort,
      });
      return;
    }
    const state = getMusicState(interaction.guild.id);
    if (!state) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.music.noActiveMusic,
      });
      return;
    }
    state.queue.length = 0;
    state.player.stop();
    state.current = null;
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.music.stopped,
    });
  },
};

export const leaveCommand = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Saca al bot del canal de voz")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.common.serverOnlyShort,
      });
      return;
    }
    const state = getMusicState(interaction.guild.id);
    if (!state) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.music.notConnected,
      });
      return;
    }
    cleanupGuildState(interaction.guild.id);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.music.leftVoice,
    });
  },
};

export async function handleMusicInteraction(interaction) {
  return false;
}
