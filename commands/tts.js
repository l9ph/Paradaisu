import { Readable } from "node:stream";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import ffmpegStatic from "ffmpeg-static";
import { getAllAudioBase64 } from "google-tts-api";
import { BOT_MESSAGES } from "../messages.js";

const TTS_STOP_CUSTOM_ID = "tts:stop";
const MAX_READ_LENGTH = 500;

/** @type {Map<string, { guildId: string, listenChannelIds: Set<string>, voiceChannelId: string, hostUserId: string, lang: string, connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, queue: string[], processing: boolean }>} */
const ttsSessions = new Map();

let ttsHandlerRegistered = false;

if (ffmpegStatic) {
  process.env.FFMPEG_PATH = ffmpegStatic;
}

async function playOnPlayer(player, resource) {
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 10_000);
  await entersState(player, AudioPlayerStatus.Idle, 120_000);
}

async function speakText(session, text) {
  const parts = await getAllAudioBase64(text, {
    lang: session.lang,
    slow: false,
  });

  for (const part of parts) {
    const stream = Readable.from(Buffer.from(part.base64, "base64"));
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });
    await playOnPlayer(session.player, resource);
  }
}

async function processTtsQueue(session) {
  if (session.processing) return;
  session.processing = true;

  while (session.queue.length > 0) {
    const text = session.queue.shift();
    if (!text) continue;

    try {
      await speakText(session, text);
    } catch (err) {
      console.error("[tts]", err);
    }
  }

  session.processing = false;
}

function enqueueTts(session, text) {
  session.queue.push(text);
  void processTtsQueue(session);
}

function stopTtsSession(guildId) {
  const session = ttsSessions.get(guildId);
  if (!session) return null;

  ttsSessions.delete(guildId);
  session.queue.length = 0;
  session.connection.destroy();
  return session;
}

function stopButtonRow() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(TTS_STOP_CUSTOM_ID)
        .setLabel(BOT_MESSAGES.tts.stopButton)
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function shouldReadMessage(message, session, member) {
  if (!session.listenChannelIds.has(message.channelId)) return false;
  if (message.channelId === session.voiceChannelId) return true;
  return member?.voice?.channelId === session.voiceChannelId;
}

async function handleTtsChatMessage(message) {
  if (!message.guild || message.author.bot) return;

  const session = ttsSessions.get(message.guild.id);
  if (!session) return;

  const content = message.content?.trim();
  if (!content || content.startsWith("/")) return;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

  if (!shouldReadMessage(message, session, member)) return;

  const displayName =
    member?.displayName ?? message.author.displayName ?? message.author.username;

  const line = BOT_MESSAGES.tts.readLine(displayName, content);
  enqueueTts(session, line.slice(0, MAX_READ_LENGTH));
}

export function registerTtsMessageHandler(client) {
  if (ttsHandlerRegistered) return;
  ttsHandlerRegistered = true;

  client.on(Events.MessageCreate, (message) => {
    void handleTtsChatMessage(message);
  });
}

export async function handleTtsInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== TTS_STOP_CUSTOM_ID) return false;

  const session = ttsSessions.get(interaction.guildId);
  if (!session) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.notActive,
    });
    return true;
  }

  if (interaction.user.id !== session.hostUserId) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.stopOnlyHost,
    });
    return true;
  }

  stopTtsSession(interaction.guildId);
  await interaction.update({
    content: BOT_MESSAGES.tts.stopped,
    components: [],
  });
  return true;
}

export const ttsCommand = {
  data: new SlashCommandBuilder()
    .setName("tts")
    .setDescription("Entra a tu voz y lee mensajes del chat del canal de voz.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("idioma")
        .setDescription("Idioma de la voz")
        .setRequired(false)
        .addChoices(
          { name: "Español", value: "es" },
          { name: "English", value: "en" },
          { name: "Português", value: "pt" },
          { name: "Français", value: "fr" },
        ),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.common.serverOnly,
      });
      return;
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.tts.mustBeInVoice,
      });
      return;
    }

    const lang = interaction.options.getString("idioma") ?? "es";
    const guildId = interaction.guild.id;

    stopTtsSession(guildId);

    const connection = joinVoiceChannel({
      guildId,
      channelId: voiceChannel.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    connection.subscribe(player);

    player.on("error", (err) => {
      console.error("[tts] player", err);
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      console.error("[tts]", err);
      connection.destroy();
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.tts.playError,
      });
      return;
    }

    const listenChannelIds = new Set([voiceChannel.id, interaction.channelId]);

    const session = {
      guildId,
      listenChannelIds,
      voiceChannelId: voiceChannel.id,
      hostUserId: interaction.user.id,
      lang,
      connection,
      player,
      queue: [],
      processing: false,
    };

    ttsSessions.set(guildId, session);

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (ttsSessions.get(guildId) === session) {
        ttsSessions.delete(guildId);
      }
    });

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.started(voiceChannel),
      components: stopButtonRow(),
    });
  },
};
