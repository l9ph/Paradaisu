import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { BOT_MESSAGES } from "../messages.js";

const BOSS_CONFIG = {
  enmity: { label: "Enmity", roleId: "1486048361156186303" },
  elder: { label: "Elder", roleId: "1486048116191920240" },
  titus: { label: "Titus", roleId: "1486048358358585475" },
};
const HOST_VOICE_CATEGORY_ID = "1133248787519897683";
const HOST_ALLOWED_ROLE_ID = "1450312932184424539";

export const bossCommand = {
  data: new SlashCommandBuilder()
    .setName("boss")
    .setDescription("Publica host para un boss")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("boss")
        .setDescription("Boss que vas a hostear")
        .setRequired(true)
        .addChoices(
          { name: "Enmity", value: "enmity" },
          { name: "Elder", value: "elder" },
          { name: "Titus", value: "titus" },
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

    const bossKey = interaction.options.getString("boss", true);
    const cfg = BOSS_CONFIG[bossKey];
    if (!cfg) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.boss.invalidBoss,
      });
      return;
    }

    let voiceChannel;
    try {
      const baseName = `host-${cfg.label.toLowerCase()}-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
      const channelName = baseName || `host-${cfg.label.toLowerCase()}`;

      voiceChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: HOST_VOICE_CATEGORY_ID,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
            ],
          },
          {
            id: HOST_ALLOWED_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
          },
          {
            id: interaction.guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
      });

      // Intentar mover al host al canal recién creado.
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member?.voice) await member.voice.setChannel(voiceChannel).catch(() => {});
    } catch (err) {
      console.error("[boss] crear canal de voz:", err);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content:
          "No pude crear el canal de voz. Revisa permisos del bot y la categoría configurada.",
      });
      return;
    }

    const roleMention = `<@&${cfg.roleId}>`;
    const hostMention = `<@${interaction.user.id}>`;
    const title = `${cfg.label} Host`;
    const description = `${hostMention} esta hosteando ${cfg.label} entra a ${voiceChannel}`;

    const embed = new EmbedBuilder()
      .setColor(2326507)
      .setTitle(title)
      .setDescription(description);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`boss:end:${interaction.user.id}:${voiceChannel.id}`)
        .setLabel("Terminar host")
        .setStyle(ButtonStyle.Danger),
    );

    const hostMessage = await interaction.reply({
      content: `${roleMention}`,
      allowedMentions: { roles: [cfg.roleId] },
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    // Si el host no entra en 1 minuto al canal creado, se cancela solo.
    setTimeout(async () => {
      try {
        const member = await interaction.guild.members
          .fetch(interaction.user.id)
          .catch(() => null);
        const joinedTarget = member?.voice?.channelId === voiceChannel.id;
        if (joinedTarget) return;

        await hostMessage.delete().catch(() => {});
        await voiceChannel.delete("Host cancelado: el host no se unió en 1 minuto").catch(() => {});
      } catch {
        // Ignorar errores de cleanup.
      }
    }, 60_000);
  },
};

export async function handleBossInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("boss:end:")) return false;

  if (!interaction.inGuild()) return true;
  const [, , hostId, channelId] = interaction.customId.split(":");
  if (interaction.user.id !== hostId) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.boss.finishOnlyHost,
    });
    return true;
  }

  try {
    await interaction.message.delete();
  } catch {
    // Si falla por permisos o ya no existe, ignorar.
  }

  if (channelId) {
    try {
      const channel = await interaction.guild.channels.fetch(channelId);
      if (channel) await channel.delete("Host finalizado");
    } catch {
      // Ignorar si ya no existe o faltan permisos.
    }
  }

  try {
    await interaction.deferUpdate();
  } catch {
    // Mensaje ya eliminado, no hace falta responder.
  }

  return true;
}
