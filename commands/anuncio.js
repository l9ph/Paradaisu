import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

const ANUNCIO_ROLE_ID = "1450312932184424539";
const ANUNCIO_COLOR = 2326507;
const ANUNCIO_THUMB_URL =
  "https://media.discordapp.net/attachments/588518991551528960/1489377590916677802/5bece49ed04c92f29e2eafc0fc42dfd1.png?ex=69d03278&is=69cee0f8&hm=8725378348ace84649692769e06dd1235ee891b05c52e0a8bfbeaf58d2c60a62&=&format=webp&quality=lossless";

export const anuncioCommand = {
  data: new SlashCommandBuilder()
    .setName("anuncio")
    .setDescription("Publica un anuncio con embed en este canal.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("mensaje")
        .setDescription("Texto del anuncio")
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Este comando solo se puede usar en un servidor.",
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
        content: "Usa este comando en un canal de texto o anuncios.",
      });
      return;
    }

    const mensaje = interaction.options.getString("mensaje", true).trim();
    if (!mensaje) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "El mensaje no puede estar vacío.",
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
        content:
          "No tengo permiso para ver el canal, enviar mensajes o insertar embeds aquí.",
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(ANUNCIO_COLOR)
      .setTitle("Anuncio Paradaisu")
      .setDescription(mensaje)
      .setThumbnail(ANUNCIO_THUMB_URL)
      .setFooter({
        text: "Paradaisu",
        iconURL: ANUNCIO_THUMB_URL,
      });

    try {
      await channel.send({
        content: `<@&${ANUNCIO_ROLE_ID}>`,
        embeds: [embed],
        allowedMentions: { roles: [ANUNCIO_ROLE_ID] },
      });
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Anuncio publicado.",
      });
    } catch (err) {
      console.error("[anuncio]", err);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "No se pudo enviar el anuncio. Revisa permisos del bot y del canal.",
      });
    }
  },
};
