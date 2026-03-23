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
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import ffmpegStatic from "ffmpeg-static";
import { getAllAudioUrls } from "google-tts-api";
import { BOT_MESSAGES } from "../messages.js";

const TTS_STOP_CUSTOM_ID = "tts:stop";
const MAX_READ_LENGTH = 500;

/** @type {Map<string, { guildId: string, textChannelId: string, voiceChannelId: string, hostUserId: string, lang: string, connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, queue: string[], processing: boolean, interaction: import('discord.js').ChatInputCommandInteraction }>} */
const ttsSessions = new Map();

let ttsHandlerRegistered = false;

if (ffmpegStatic) {
  process.env.FFMPEG_PATH = ffmpegStatic;
}

function playOnPlayer(player, resource) {
  return new Promise((resolve, reject) => {
    const onIdle = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      player.off(AudioPlayerStatus.Idle, onIdle);
      player.off("error", onError);
    };

    player.on(AudioPlayerStatus.Idle, onIdle);
    player.on("error", onError);
    player.play(resource);
  });
}

async function speakText(session, text) {
  const parts = getAllAudioUrls(text, {
    lang: session.lang,
    slow: false,
    host: "https://translate.google.com",
  });

  for (const part of parts) {
    const resource = createAudioResource(part.url, { inlineVolume: true });
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

async function handleTtsChatMessage(message) {
  if (!message.guild || message.author.bot) return;

  const session = ttsSessions.get(message.guild.id);
  if (!session) return;
  if (message.channelId !== session.textChannelId) return;

  const content = message.content?.trim();
  if (!content || content.startsWith("/")) return;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (member?.voice?.channelId !== session.voiceChannelId) return;

  const displayName =
    member.displayName ?? message.author.displayName ?? message.author.username;

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
    .setDescription("Entra a tu voz y lee mensajes de este canal de texto.")
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

    const channel = interaction.channel;
    if (!channel?.isTextBased?.() || channel.isDMBased()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.tts.textChannelRequired,
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
      selfDeaf: true,
    });

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    connection.subscribe(player);

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

    const session = {
      guildId,
      textChannelId: interaction.channelId,
      voiceChannelId: voiceChannel.id,
      hostUserId: interaction.user.id,
      lang,
      connection,
      player,
      queue: [],
      processing: false,
      interaction,
    };

    ttsSessions.set(guildId, session);

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (ttsSessions.get(guildId) === session) {
        ttsSessions.delete(guildId);
      }
    });

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.started(channel, voiceChannel),
      components: stopButtonRow(),
    });
  },
};
