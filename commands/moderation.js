import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

function isGuild(interaction) {
  return Boolean(interaction?.inGuild?.());
}

function targetIsSelfOrBot(interaction, targetId) {
  return (
    targetId === interaction.user.id ||
    targetId === interaction.client.user.id
  );
}

async function fetchMemberSafe(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

function reasonWithModerator(interaction, baseReason) {
  const actor = interaction.user?.tag || interaction.user?.username || "unknown";
  return `${baseReason} - ${actor}`;
}

export const banCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea a un usuario")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Usuario a banear")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("razon")
        .setDescription("Razón del ban")
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!isGuild(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Este comando solo se puede usar en un servidor.",
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const baseReason =
      interaction.options.getString("razon", false)?.trim() || "Sin razón";
    const reason = reasonWithModerator(interaction, baseReason);

    if (targetIsSelfOrBot(interaction, target.id)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "No puedes banearte a ti mismo ni al bot.",
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await interaction.guild.members.ban(target.id, {
        reason,
        deleteMessageSeconds: 0,
      });
      await interaction.editReply({
        content: `✅ ${target.tag} fue baneado. Razón: ${reason}`,
      });
    } catch (err) {
      console.error("[mod] ban:", err);
      await interaction.editReply({
        content:
          "No pude banear al usuario. Revisa jerarquía de roles y permisos de baneo.",
      });
    }
  },
};

export const kickCommand = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un usuario")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Usuario a expulsar")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("razon")
        .setDescription("Razón del kick")
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!isGuild(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Este comando solo se puede usar en un servidor.",
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const baseReason =
      interaction.options.getString("razon", false)?.trim() || "Sin razón";
    const reason = reasonWithModerator(interaction, baseReason);

    if (targetIsSelfOrBot(interaction, target.id)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "No puedes expulsarte a ti mismo ni al bot.",
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const member = await fetchMemberSafe(interaction.guild, target.id);
      if (!member) {
        await interaction.editReply({
          content: "No encontré al usuario dentro de este servidor.",
        });
        return;
      }
      await member.kick(reason);
      await interaction.editReply({
        content: `✅ ${target.tag} fue expulsado. Razón: ${reason}`,
      });
    } catch (err) {
      console.error("[mod] kick:", err);
      await interaction.editReply({
        content:
          "No pude expulsar al usuario. Revisa jerarquía de roles y permisos de expulsión.",
      });
    }
  },
};

const MUTE_DURATIONS = {
  s60: { label: "60 segundos", ms: 60 * 1000 },
  m5: { label: "5 mins", ms: 5 * 60 * 1000 },
  m10: { label: "10 mins", ms: 10 * 60 * 1000 },
  h1: { label: "1 hora", ms: 60 * 60 * 1000 },
  d1: { label: "1 dia", ms: 24 * 60 * 60 * 1000 },
  w1: { label: "1 semana", ms: 7 * 24 * 60 * 60 * 1000 },
};

export const muteCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Aplica timeout a un usuario")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Usuario a mutear")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duracion")
        .setDescription("Duración del timeout")
        .setRequired(true)
        .addChoices(
          { name: "60 segundos", value: "s60" },
          { name: "5 mins", value: "m5" },
          { name: "10 mins", value: "m10" },
          { name: "1 hora", value: "h1" },
          { name: "1 dia", value: "d1" },
          { name: "1 semana", value: "w1" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("razon")
        .setDescription("Razón del timeout")
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!isGuild(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Este comando solo se puede usar en un servidor.",
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const durationKey = interaction.options.getString("duracion", true);
    const baseReason =
      interaction.options.getString("razon", false)?.trim() || "Sin razón";
    const reason = reasonWithModerator(interaction, baseReason);
    const duration = MUTE_DURATIONS[durationKey];

    if (!duration) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Duración inválida.",
      });
      return;
    }
    if (targetIsSelfOrBot(interaction, target.id)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "No puedes mutearte a ti mismo ni al bot.",
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const member = await fetchMemberSafe(interaction.guild, target.id);
      if (!member) {
        await interaction.editReply({
          content: "No encontré al usuario dentro de este servidor.",
        });
        return;
      }
      await member.timeout(duration.ms, reason);
      await interaction.editReply({
        content: `✅ ${target.tag} muteado por ${duration.label}. Razón: ${reason}`,
      });
    } catch (err) {
      console.error("[mod] mute:", err);
      await interaction.editReply({
        content:
          "No pude aplicar timeout. Revisa jerarquía de roles y permisos de moderación.",
      });
    }
  },
};

export const clearCommand = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Limpia mensajes del canal actual")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("cantidad")
        .setDescription("Cantidad de mensajes a borrar (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),

  async execute(interaction) {
    if (!isGuild(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Este comando solo se puede usar en un servidor.",
      });
      return;
    }

    const cantidad = interaction.options.getInteger("cantidad", true);
    const channel = interaction.channel;
    if (!channel?.isTextBased?.() || !channel.bulkDelete) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Este comando solo funciona en canales de texto.",
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      // bulkDelete ignora mensajes >14 días cuando filterOld=true
      const deleted = await channel.bulkDelete(cantidad, true);
      await interaction.editReply({
        content: `**${deleted.size}** mensajes eliminados en ${channel}`,
      });
    } catch (err) {
      console.error("[mod] clear:", err);
      await interaction.editReply({
        content:
          "No pude borrar mensajes. Revisa permisos de gestionar mensajes en este canal.",
      });
    }
  },
};
