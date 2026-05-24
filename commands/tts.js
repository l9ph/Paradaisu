import { Readable } from "node:stream";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  MessageFlags,
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
import { MongoClient } from "mongodb";
import ffmpegStatic from "ffmpeg-static";
import { synthesizeEdgeTts } from "../lib/edgeTts.js";
import { BOT_MESSAGES } from "../messages.js";

const TTS_STOP_CUSTOM_ID = "tts:stop";
const TTS_VOICES_COLLECTION = "tts_voices";
const MAX_READ_LENGTH = 500;

/** Agente de voz Edge (persona) → nombre neural de Microsoft */
export const TTS_VOICE_PERSONAS = [
  { id: "elvira", name: "Elvira (España)", voice: "es-ES-ElviraNeural" },
  { id: "alvaro", name: "Álvaro (España)", voice: "es-ES-AlvaroNeural" },
  { id: "dalia", name: "Dalia (México)", voice: "es-MX-DaliaNeural" },
  { id: "jorge", name: "Jorge (México)", voice: "es-MX-JorgeNeural" },
  { id: "jenny", name: "Jenny (EE. UU.)", voice: "en-US-JennyNeural" },
  { id: "guy", name: "Guy (EE. UU.)", voice: "en-US-GuyNeural" },
  { id: "sonia", name: "Sonia (Reino Unido)", voice: "en-GB-SoniaNeural" },
  { id: "francisca", name: "Francisca (Brasil)", voice: "pt-BR-FranciscaNeural" },
  { id: "antonio", name: "Antônio (Brasil)", voice: "pt-BR-AntonioNeural" },
  { id: "denise", name: "Denise (Francia)", voice: "fr-FR-DeniseNeural" },
  { id: "henri", name: "Henri (Francia)", voice: "fr-FR-HenriNeural" },
];

const DEFAULT_VOICE_PERSONA = TTS_VOICE_PERSONAS[0];
const personaById = new Map(TTS_VOICE_PERSONAS.map((p) => [p.id, p]));

/** @type {Map<string, { guildId: string, listenChannelIds: Set<string>, voiceChannelId: string, hostUserId: string, connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, queue: { text: string, userId: string }[], processing: boolean }>} */
const ttsSessions = new Map();

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

function edgeVoiceForPersonaId(personaId) {
  const persona = personaById.get(personaId);
  return persona?.voice ?? DEFAULT_VOICE_PERSONA.voice;
}

export async function getUserEdgeVoice(userId) {
  const cached = voiceCache.get(userId);
  if (cached) return cached;

  if (!mongoConfigOk()) {
    return DEFAULT_VOICE_PERSONA.voice;
  }

  try {
    const col = await getTtsVoicesCollection();
    const doc = await col.findOne({ userId });
    const voice = edgeVoiceForPersonaId(doc?.personaId);
    voiceCache.set(userId, voice);
    return voice;
  } catch (err) {
    console.error("[tts] mongo get:", err);
    return DEFAULT_VOICE_PERSONA.voice;
  }
}

async function saveUserVoicePersona(userId, personaId) {
  const col = await getTtsVoicesCollection();
  await col.updateOne(
    { userId },
    { $set: { userId, personaId, updatedAt: new Date() } },
    { upsert: true },
  );
  voiceCache.set(userId, edgeVoiceForPersonaId(personaId));
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

async function processTtsQueue(session) {
  if (session.processing) return;
  session.processing = true;

  while (session.queue.length > 0) {
    const item = session.queue.shift();
    if (!item?.text) continue;

    try {
      await speakText(session, item.text, item.userId);
    } catch (err) {
      console.error("[tts]", err);
    }
  }

  session.processing = false;
}

function enqueueTts(session, text, userId) {
  session.queue.push({ text, userId });
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
  enqueueTts(session, line.slice(0, MAX_READ_LENGTH), message.author.id);
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

async function executeTtsJoin(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.mustBeInVoice,
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

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: BOT_MESSAGES.tts.started(voiceChannel),
    components: stopButtonRow(),
  });
}

async function executeTtsIdioma(interaction) {
  const personaId = interaction.options.getString("agentedevoz", true);
  const persona = personaById.get(personaId);

  if (!persona) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.voiceNotFound,
    });
    return;
  }

  if (!mongoConfigOk()) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.mongoMissing,
    });
    return;
  }

  try {
    await saveUserVoicePersona(interaction.user.id, personaId);
  } catch (err) {
    console.error("[tts] mongo save:", err);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.tts.voiceSaveError,
    });
    return;
  }

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: BOT_MESSAGES.tts.voiceSaved(persona.name),
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
        .setDescription("Elige tu agente de voz (no une al bot al canal).")
        .addStringOption((option) =>
          option
            .setName("agentedevoz")
            .setDescription("Persona / voz para leerte en TTS")
            .setRequired(true)
            .addChoices(
              ...TTS_VOICE_PERSONAS.map((p) => ({
                name: p.name,
                value: p.id,
              })),
            ),
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
