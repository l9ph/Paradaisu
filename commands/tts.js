import { Readable } from "node:stream";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
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
import { MongoClient } from "mongodb";
import ffmpegStatic from "ffmpeg-static";
import { prepareTextForSpeech, synthesizeEdgeTts } from "../lib/edgeTts.js";
import {
  DEFAULT_VOICE_ID,
  displayNameForVoiceId,
  ensureEdgeVoicesLoaded,
  getEdgeVoice,
  isValidEdgeVoiceId,
  resolveStoredVoiceId,
  searchEdgeVoiceChoices,
} from "../lib/edgeVoices.js";
import { BOT_MESSAGES } from "../messages.js";

const TTS_STOP_CUSTOM_ID = "tts:stop";
const TTS_VOICE_SEARCH_ID = "tts:voice-search";
const TTS_VOICE_MODAL_ID = "tts:voice-modal";
const TTS_VOICE_SELECT_ID = "tts:voice-select";
const TTS_VOICES_COLLECTION = "tts_voices";
const MAX_READ_LENGTH = 500;

const URL_IN_TEXT_REGEX =
  /https?:\/\/[^\s<>]+|www\.[^\s<>]+|discord\.gg\/[^\s<>]+|discord\.com\/invite\/[^\s<>]+/i;

/** @type {Map<string, { guildId: string, listenChannelIds: Set<string>, voiceChannelId: string, hostUserId: string, statusChannelId?: string, statusMessageId?: string, connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, queue: { userId: string, displayName: string, content: string, isLink?: boolean }[], processing: boolean }>} */
const ttsSessions = new Map();

function messageHasLink(message, content) {
  if (URL_IN_TEXT_REGEX.test(content)) return true;

  for (const embed of message.embeds) {
    if (embed.url || embed.video?.url || embed.image?.url || embed.thumbnail?.url) {
      return true;
    }
  }

  return false;
}

/** @type {Map<string, string>} userId → Edge voice name */
const voiceCache = new Map();

let ttsHandlerRegistered = false;
let mongoClient;
let mongoDb;

if (ffmpegStatic) {
  process.env.FFMPEG_PATH = ffmpegStatic;
}

function mongoConfigOk() {
  return (
    typeof process.env.MONGODB_URI === "string" &&
    process.env.MONGODB_URI.trim() !== ""
  );
}

async function getTtsVoicesCollection() {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB?.trim() || "paradaisu";
  if (!uri) throw new Error("MONGODB_URI_MISSING");

  if (!mongoClient) mongoClient = new MongoClient(uri);
  if (!mongoDb) {
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
  }
  return mongoDb.collection(TTS_VOICES_COLLECTION);
}

export async function getUserEdgeVoice(userId) {
  const cached = voiceCache.get(userId);
  if (cached) return cached;

  if (!mongoConfigOk()) {
    return DEFAULT_VOICE_ID;
  }

  try {
    const col = await getTtsVoicesCollection();
    const doc = await col.findOne({ userId });
    const voice = resolveStoredVoiceId(doc);
    voiceCache.set(userId, voice);
    return voice;
  } catch (err) {
    console.error("[tts] mongo get:", err);
    return DEFAULT_VOICE_ID;
  }
}

async function saveUserVoice(userId, voiceId) {
  const col = await getTtsVoicesCollection();
  await col.updateOne(
    { userId },
    {
      $set: { userId, voiceId, updatedAt: new Date() },
      $unset: { personaId: "" },
    },
    { upsert: true },
  );
  voiceCache.set(userId, voiceId);
}

function activeTtsEmbed(voiceChannel) {
  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(BOT_MESSAGES.tts.embedActiveTitle)
    .setDescription(BOT_MESSAGES.tts.embedActiveBody(voiceChannel));
}

function stoppedTtsEmbed() {
  return new EmbedBuilder()
    .setColor(Colors.DarkGrey)
    .setTitle(BOT_MESSAGES.tts.embedStoppedTitle);
}

function voicePickerEmbed(query, resultCount) {
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(BOT_MESSAGES.tts.voicePickerTitle)
    .setDescription(BOT_MESSAGES.tts.voicePickerBody(query, resultCount));
}

function voiceSavedEmbed(label) {
  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(BOT_MESSAGES.tts.voiceSavedTitle)
    .setDescription(BOT_MESSAGES.tts.voiceSavedBody(label));
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

function voiceSearchButtonRow() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(TTS_VOICE_SEARCH_ID)
        .setLabel(BOT_MESSAGES.tts.voiceSearchButton)
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function voiceSelectRow(choices) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(TTS_VOICE_SELECT_ID)
        .setPlaceholder(BOT_MESSAGES.tts.voiceSelectPlaceholder)
        .addOptions(
          choices.map((c) => ({
            label: c.name,
            value: c.value,
          })),
        ),
    ),
  ];
}

async function playOnPlayer(player, resource) {
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 10_000);
  await entersState(player, AudioPlayerStatus.Idle, 120_000);
}

async function speakText(session, text, userId) {
  const voice = await getUserEdgeVoice(userId);
  const audioBuffer = await synthesizeEdgeTts(text, { voice });
  const stream = Readable.from(audioBuffer);
  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
  await playOnPlayer(session.player, resource);
}

function appendToQueueItem(item, spokenContent) {
  item.content = `${item.content}. ${spokenContent}`.trim();
}

/** Une mensajes seguidos del mismo usuario en un solo bloque de cola. */
function pullNextQueueItem(session) {
  const first = session.queue.shift();
  if (!first) return null;

  while (session.queue[0]?.userId === first.userId) {
    const next = session.queue.shift();
    if (!next) break;
    if (first.isLink || next.isLink) {
      session.queue.unshift(next);
      break;
    }
    if (next.content) appendToQueueItem(first, next.content);
  }

  return first;
}

async function processTtsQueue(session) {
  if (session.processing) return;
  session.processing = true;

  while (session.queue.length > 0) {
    const item = pullNextQueueItem(session);
    if (!item) continue;
    if (!item.isLink && !item.content) continue;

    const line = item.isLink
      ? BOT_MESSAGES.tts.readLinkLine(item.displayName)
      : BOT_MESSAGES.tts.readLine(item.displayName, item.content);

    try {
      await speakText(session, line.slice(0, MAX_READ_LENGTH), item.userId);
    } catch (err) {
      console.error("[tts]", err);
    }
  }

  session.processing = false;
}

function enqueueTts(session, displayName, spokenContent, userId, isLink = false) {
  const last = session.queue.at(-1);

  if (last?.userId === userId && isLink && last.isLink) {
    void processTtsQueue(session);
    return;
  }

  if (last?.userId === userId && !isLink && !last.isLink) {
    appendToQueueItem(last, spokenContent);
    void processTtsQueue(session);
    return;
  }

  session.queue.push({
    userId,
    displayName,
    content: isLink ? "" : spokenContent,
    isLink,
  });
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

function shouldReadMessage(message, session, member) {
  if (!session.listenChannelIds.has(message.channelId)) return false;
  if (message.channelId === session.voiceChannelId) return true;
  return member?.voice?.channelId === session.voiceChannelId;
}

async function handleTtsChatMessage(message) {
  if (!message.guild || message.author.bot) return;

  const session = ttsSessions.get(message.guild.id);
  if (!session) return;

  const content = message.content?.trim() ?? "";
  if (content.startsWith("/")) return;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

  if (!shouldReadMessage(message, session, member)) return;

  const displayName =
    member?.displayName ?? message.author.displayName ?? message.author.username;

  if (messageHasLink(message, content)) {
    enqueueTts(session, displayName, "", message.author.id, true);
    return;
  }

  if (!content) return;

  const spokenContent = prepareTextForSpeech(content);
  if (!spokenContent) return;

  enqueueTts(session, displayName, spokenContent, message.author.id);
}

export function registerTtsMessageHandler(client) {
  if (ttsHandlerRegistered) return;
  ttsHandlerRegistered = true;

  client.on(Events.MessageCreate, (message) => {
    void handleTtsChatMessage(message);
  });
}

async function handleTtsStopButton(interaction) {
  const session = ttsSessions.get(interaction.guildId);
  if (!session) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.notActive,
    });
    return true;
  }

  stopTtsSession(interaction.guildId);

  await interaction.update({
    embeds: [stoppedTtsEmbed()],
    components: [],
  });
  return true;
}

function voiceSearchModal() {
  return new ModalBuilder()
    .setCustomId(TTS_VOICE_MODAL_ID)
    .setTitle(BOT_MESSAGES.tts.voiceModalTitle)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("query")
          .setLabel(BOT_MESSAGES.tts.voiceModalLabel)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setPlaceholder(BOT_MESSAGES.tts.voiceModalPlaceholder),
      ),
    );
}

async function handleTtsVoiceSearchButton(interaction) {
  await interaction.showModal(voiceSearchModal());
  return true;
}

async function handleTtsVoiceModal(interaction) {
  const query = interaction.fields.getTextInputValue("query").trim();

  try {
    await ensureEdgeVoicesLoaded();
  } catch (err) {
    console.error("[tts] voces:", err);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.voicesLoadError,
    });
    return true;
  }

  const choices = searchEdgeVoiceChoices(query);
  if (choices.length === 0) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.voiceNoResults(query),
    });
    return true;
  }

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [voicePickerEmbed(query, choices.length)],
    components: voiceSelectRow(choices),
  });
  return true;
}

async function handleTtsVoiceSelect(interaction) {
  const voiceId = interaction.values[0];

  if (!isValidEdgeVoiceId(voiceId)) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.voiceNotFound,
    });
    return true;
  }

  if (!mongoConfigOk()) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.mongoMissing,
    });
    return true;
  }

  try {
    await saveUserVoice(interaction.user.id, voiceId);
  } catch (err) {
    console.error("[tts] mongo save:", err);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.voiceSaveError,
    });
    return true;
  }

  const label = displayNameForVoiceId(voiceId);

  await interaction.update({
    embeds: [voiceSavedEmbed(label)],
    components: [],
  });
  return true;
}

export async function handleTtsInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === TTS_STOP_CUSTOM_ID) {
      return handleTtsStopButton(interaction);
    }
    if (interaction.customId === TTS_VOICE_SEARCH_ID) {
      return handleTtsVoiceSearchButton(interaction);
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === TTS_VOICE_MODAL_ID) {
    return handleTtsVoiceModal(interaction);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === TTS_VOICE_SELECT_ID) {
    return handleTtsVoiceSelect(interaction);
  }

  return false;
}

async function executeTtsJoin(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.mustBeInVoice,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased?.()) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.textChannelRequired,
    });
    return;
  }

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

  const statusMessage = await channel.send({
    embeds: [activeTtsEmbed(voiceChannel)],
    components: stopButtonRow(),
  });

  session.statusChannelId = channel.id;
  session.statusMessageId = statusMessage.id;

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: BOT_MESSAGES.tts.joinAck(voiceChannel),
  });
}

async function executeTtsIdioma(interaction) {
  try {
    await ensureEdgeVoicesLoaded();
  } catch (err) {
    console.error("[tts] voces:", err);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.voicesLoadError,
    });
    return;
  }

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(BOT_MESSAGES.tts.voicePickerIntroTitle)
        .setDescription(BOT_MESSAGES.tts.voicePickerIntroBody),
    ],
    components: voiceSearchButtonRow(),
  });
}

export const ttsCommand = {
  data: new SlashCommandBuilder()
    .setName("tts")
    .setDescription("TTS en canal de voz: unirse o elegir tu agente de voz.")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Entra a tu canal de voz y lee mensajes del chat de voz."),
    )
    .addSubcommand((sub) =>
      sub
        .setName("idioma")
        .setDescription("Elige tu agente de voz (no une al bot al canal)."),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.common.serverOnly,
      });
      return;
    }

    const sub = interaction.options.getSubcommand(true);

    if (sub === "idioma") {
      await executeTtsIdioma(interaction);
      return;
    }

    if (sub === "join") {
      await executeTtsJoin(interaction);
    }
  },
};
