import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { BOT_MESSAGES, GUILD_NAME } from "../messages.js";

const ANUNCIO_ROLE_ID = "1450312932184424539";
const ANUNCIO_COLOR = 2326507;

const MODAL_CUSTOM_ID = "anuncio:modal";
const INPUT_TITLE = "anuncio_titulo";
const INPUT_DESCRIPTION = "anuncio_descripcion";
const INPUT_IMAGE = "anuncio_img";

function isValidImageUrl(url) {
  return /^https?:\/\/[^\s<>]+$/i.test(url);
}

function buildAnuncioModal() {
  return new ModalBuilder()
    .setCustomId(MODAL_CUSTOM_ID)
    .setTitle(BOT_MESSAGES.anuncio.modalTitle.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(INPUT_TITLE)
          .setLabel("Título")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(256)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(INPUT_DESCRIPTION)
          .setLabel("Descripción")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(4000)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(INPUT_IMAGE)
          .setLabel("Imagen (URL, opcional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(1024)
          .setRequired(false),
      ),
    );
}

export const anuncioCommand = {
  data: new SlashCommandBuilder()
    .setName("anuncio")
    .setDescription("Publica un anuncio con embed en este canal.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    ) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.anuncio.channelInvalid,
      });
      return;
    }

    const me = interaction.guild.members.me;
    const perms = channel.permissionsFor(me);
    if (
      !perms ||
      !perms.has(PermissionFlagsBits.ViewChannel) ||
      !perms.has(PermissionFlagsBits.SendMessages) ||
      !perms.has(PermissionFlagsBits.EmbedLinks)
    ) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.anuncio.missingBotPerms,
      });
      return;
    }

    await interaction.showModal(buildAnuncioModal());
  },
};

export async function handleAnuncioInteraction(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (interaction.customId !== MODAL_CUSTOM_ID) return false;

  if (!interaction.inGuild()) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.common.serverOnly,
    });
    return true;
  }

  const channel = interaction.channel;
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.anuncio.channelInvalid,
    });
    return true;
  }

  const titulo = interaction.fields.getTextInputValue(INPUT_TITLE)?.trim() ?? "";
  const descripcion =
    interaction.fields.getTextInputValue(INPUT_DESCRIPTION)?.trim() ?? "";
  const imagen = interaction.fields.getTextInputValue(INPUT_IMAGE)?.trim() ?? "";

  if (!titulo || !descripcion) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.anuncio.emptyTitleOrDescription,
    });
    return true;
  }

  const embedTitle = titulo.slice(0, 256);
  const embedDescription = descripcion.slice(0, 4096);

  const me = interaction.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (
    !perms ||
    !perms.has(PermissionFlagsBits.ViewChannel) ||
    !perms.has(PermissionFlagsBits.SendMessages) ||
    !perms.has(PermissionFlagsBits.EmbedLinks)
  ) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.anuncio.missingBotPerms,
    });
    return true;
  }

  const embed = new EmbedBuilder()
    .setColor(ANUNCIO_COLOR)
    .setTitle(embedTitle)
    .setDescription(embedDescription)
    .setFooter({ text: GUILD_NAME });

  if (imagen && isValidImageUrl(imagen)) {
    embed.setImage(imagen);
  }

  try {
    await channel.send({
      content: `<@&${ANUNCIO_ROLE_ID}>`,
      embeds: [embed],
      allowedMentions: { roles: [ANUNCIO_ROLE_ID] },
    });
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.anuncio.sent,
    });
  } catch (err) {
    console.error("[anuncio]", err);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.anuncio.sendError,
    });
  }

  return true;
}
