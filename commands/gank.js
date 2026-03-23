import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { BOT_MESSAGES } from "../messages.js";

const GANK_ROLE_ID = "1455724641174814803";
const GANK_SKIP_CUSTOM_ID = "gank:skip";
const PHOTO_WAIT_MS = 60_000;

/** @type {Map<string, { key: string, userId: string, channelId: string, channel: import('discord.js').TextChannel, interaction: import('discord.js').ChatInputCommandInteraction, servidor: string, vs: string, ally: string, waitingSince: number, timeoutId: ReturnType<typeof setTimeout> | null, finalized: boolean }>} */
const pendingPhotoPrompts = new Map();

let messageHandlerRegistered = false;

function sessionKey(channelId, userId) {
  return `${channelId}:${userId}`;
}

function buildGankEmbed(servidor, vs, ally, imageUrl) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(BOT_MESSAGES.gank.embedTitle(servidor))
    .setDescription(BOT_MESSAGES.gank.embedBody(vs, ally));

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}

function isNonImageAttachment(att) {
  const type = att.contentType ?? "";
  if (type.startsWith("video/") || type.startsWith("audio/")) return true;
  return /\.(mp4|mov|avi|mkv|webm|mp3|wav|pdf|zip|rar)$/i.test(att.name ?? "");
}

function pickImageFromMessage(message) {
  for (const att of message.attachments.values()) {
    if (isNonImageAttachment(att)) continue;

    const url = att.url || att.proxyURL;
    if (url) {
      return { url, message };
    }
  }

  const sticker = message.stickers?.first?.();
  if (sticker?.url) {
    return { url: sticker.url, message };
  }

  const embedImage = message.embeds.find((e) => e.image?.url)?.image?.url;
  if (embedImage) {
    return { url: embedImage, message };
  }

  const cdnInContent = message.content?.match(
    /https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/[^\s>]+/i,
  );
  if (cdnInContent?.[0]) {
    return { url: cdnInContent[0], message };
  }

  return null;
}

async function resolveMessageWithMedia(message) {
  let current = message;

  if (current.partial) {
    try {
      current = await current.fetch();
    } catch {
      // seguir con el mensaje parcial
    }
  }

  for (let i = 0; i < 4; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      try {
        current = await message.channel.messages.fetch(message.id);
      } catch {
        continue;
      }
    }

    const picked = pickImageFromMessage(current);
    if (picked) {
      return { message: current, url: picked.url };
    }
  }

  return null;
}

function messageBelongsToSession(message, session) {
  if (message.author.id !== session.userId) return false;
  if (message.channelId !== session.channelId) return false;
  if (message.createdTimestamp < session.waitingSince) return false;
  return true;
}

async function publishGank(session, imageUrl, buttonInteraction, photoMessage) {
  if (session.finalized) return false;
  session.finalized = true;
  if (session.timeoutId) clearTimeout(session.timeoutId);
  pendingPhotoPrompts.delete(session.key);

  const embed = buildGankEmbed(session.servidor, session.vs, session.ally, imageUrl);

  try {
    await session.channel.send({
      content: `||<@&${GANK_ROLE_ID}>||`,
      embeds: [embed],
      allowedMentions: { roles: [GANK_ROLE_ID] },
    });
  } catch (err) {
    console.error("[gank]", err);
    const errorContent = BOT_MESSAGES.gank.sendError;
    if (buttonInteraction) {
      if (buttonInteraction.deferred || buttonInteraction.replied) {
        await buttonInteraction.editReply({ content: errorContent, components: [] });
      } else {
        await buttonInteraction.update({ content: errorContent, components: [] });
      }
    } else {
      await session.interaction.editReply({ content: errorContent, components: [] });
    }
    return false;
  }

  if (photoMessage) {
    try {
      await photoMessage.delete();
    } catch {
      // sin permiso para borrar
    }
  }

  const okContent = imageUrl
    ? BOT_MESSAGES.gank.sentWithPhoto
    : BOT_MESSAGES.gank.sent;

  if (buttonInteraction) {
    if (buttonInteraction.deferred || buttonInteraction.replied) {
      await buttonInteraction.editReply({ content: okContent, components: [] });
    } else {
      await buttonInteraction.update({ content: okContent, components: [] });
    }
  } else {
    await session.interaction.editReply({ content: okContent, components: [] });
  }

  return true;
}

async function tryPublishFromMessage(session, message) {
  if (session.finalized || !messageBelongsToSession(message, session)) return false;

  const picked = await resolveMessageWithMedia(message);
  if (!picked) return false;

  await publishGank(session, picked.url, null, picked.message);
  return true;
}

function startPhotoWait(session) {
  session.timeoutId = setTimeout(async () => {
    if (session.finalized) return;

    session.finalized = true;
    pendingPhotoPrompts.delete(session.key);

    try {
      await session.interaction.editReply({
        content: BOT_MESSAGES.gank.photoPromptExpired,
        components: [],
      });
    } catch {
      // interacción expirada
    }
  }, PHOTO_WAIT_MS);
}

function skipPhotoRow() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(GANK_SKIP_CUSTOM_ID)
        .setLabel(BOT_MESSAGES.gank.skipPhotoButton)
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function handlePotentialGankPhoto(message) {
  if (!message.guild || message.author?.bot) return;

  const key = sessionKey(message.channelId, message.author.id);
  const session = pendingPhotoPrompts.get(key);
  if (!session || session.finalized) return;

  try {
    await tryPublishFromMessage(session, message);
  } catch (err) {
    console.error("[gank]", err);
  }
}

export function registerGankMessageHandler(client) {
  if (messageHandlerRegistered) return;
  messageHandlerRegistered = true;

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;
    await handlePotentialGankPhoto(message);
  });

  client.on(Events.MessageUpdate, async (_oldMessage, message) => {
    if (pendingPhotoPrompts.size === 0) return;
    if (!message.guild || message.author?.bot) return;
    await handlePotentialGankPhoto(message);
  });
}

export async function handleGankInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== GANK_SKIP_CUSTOM_ID) return false;

  const key = sessionKey(interaction.channelId, interaction.user.id);
  const session = pendingPhotoPrompts.get(key);

  if (!session || session.finalized) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.gank.photoPromptExpired,
    });
    return true;
  }

  await publishGank(session, null, interaction, null);
  return true;
}

export const gankCommand = {
  data: new SlashCommandBuilder()
    .setName("gank")
    .setDescription("Publica un aviso de gank con embed.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("servidor")
        .setDescription("Servidor donde es el gank")
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("vs")
        .setDescription("Rival / VS")
        .setRequired(true)
        .setMaxLength(500),
    )
    .addStringOption((option) =>
      option
        .setName("ally")
        .setDescription("Ally")
        .setRequired(true)
        .setMaxLength(500),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.common.serverOnly,
      });
      return;
    }

    const channel = interaction.channel;
    if (
      !channel?.isTextBased?.() ||
      channel.isDMBased() ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    ) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.gank.channelInvalid,
      });
      return;
    }

    const me = interaction.guild.members.me;
    const perms = channel.permissionsFor(me);
    if (
      !perms ||
      !perms.has(PermissionFlagsBits.ViewChannel) ||
      !perms.has(PermissionFlagsBits.ReadMessageHistory) ||
      !perms.has(PermissionFlagsBits.SendMessages) ||
      !perms.has(PermissionFlagsBits.EmbedLinks)
    ) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.gank.missingBotPerms,
      });
      return;
    }

    const servidor = interaction.options.getString("servidor", true).trim();
    if (!servidor) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.gank.emptyServidor,
      });
      return;
    }

    const vs = interaction.options.getString("vs", true).trim();
    const ally = interaction.options.getString("ally", true).trim();
    if (!vs || !ally) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.gank.emptyVsOrAlly,
      });
      return;
    }

    const key = sessionKey(interaction.channelId, interaction.user.id);
    const existing = pendingPhotoPrompts.get(key);
    if (existing && !existing.finalized) {
      if (existing.timeoutId) clearTimeout(existing.timeoutId);
      pendingPhotoPrompts.delete(key);
    }

    const session = {
      key,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      channel,
      interaction,
      servidor,
      vs,
      ally,
      waitingSince: 0,
      timeoutId: null,
      finalized: false,
    };

    pendingPhotoPrompts.set(key, session);

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.gank.photoPrompt,
      components: skipPhotoRow(),
    });

    session.waitingSince = Date.now();
    startPhotoWait(session);
  },
};
