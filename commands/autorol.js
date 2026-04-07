import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { DEFAULT_EMBED_BANNER_URL } from "../embedDefaults.js";
import { BOT_MESSAGES } from "../messages.js";

/** Emoji en el menú (ID). Rellena `roleId` cuando los tengas. */
const COLOR_OPTIONS = [
  {
    label: "Blanco",
    value: "c_blanco",
    emojiId: "1486050135115956326",
    roleId: "1135590889562062898",
  },
  {
    label: "Negro",
    value: "c_negro",
    emojiId: "1486050106448019537",
    roleId: "1135590813531914392",
  },
  {
    label: "Rojo",
    value: "c_rojo",
    emojiId: "1486049933139251200",
    roleId: "1135590989478760629",
  },
  {
    label: "Azul",
    value: "c_azul",
    emojiId: "1486049972972425336",
    roleId: "1135590337381941268",
  },
  {
    label: "Amarillo",
    value: "c_amarillo",
    emojiId: "1486050070381072514",
    roleId: "1135590736784543774",
  },
  {
    label: "Verde",
    value: "c_verde",
    emojiId: "1486050041020944515",
    roleId: "1135590647747854426",
  },
  {
    label: "Morado",
    value: "c_morado",
    emojiId: "1486050006786904246",
    roleId: "1135590473516462213",
  },
  {
    label: "Rosa",
    value: "c_rosa",
    emojiId: "1486049280228851803",
    roleId: "1135591120882126878",
  },
];

/** Rellena `roleId` cuando los tengas. Puedes elegir varios a la vez. */
const BOSS_OPTIONS = [
  { label: "Elder Primadon", value: "b_elder", roleId: "1486048116191920240" },
  { label: "Enmity", value: "b_enmity", roleId: "1486048361156186303" },
  { label: "Titus", value: "b_titus", roleId: "1486048358358585475" },
];

const EXTRA_OPTIONS = [
  { label: "Hellmode", value: "x_hellmode", roleId: "1487311586358988852" },
  { label: "Scrims", value: "x_scrims", roleId: "1487148273255846110" },
  { label: "Juegos", value: "x_juegos", roleId: "1487148491254796539" },
];

/** Mención al publicar el panel con `/autorol`. */
const AUTOROL_PANEL_PING_ROLE_ID = "1450312932184424539";

function buildColorSelectMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId("autorol:select:colors")
    .setPlaceholder("Elige un color")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      COLOR_OPTIONS.map((c) => {
        const row = { label: c.label, value: c.value };
        if (c.emojiId?.trim()) row.emoji = { id: c.emojiId.trim() };
        return row;
      }),
    );
}

function buildBossSelectMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId("autorol:select:bosses")
    .setPlaceholder("Elige boss(es)")
    .setMinValues(1)
    .setMaxValues(BOSS_OPTIONS.length)
    .addOptions(
      BOSS_OPTIONS.map((b) => ({
        label: b.label,
        value: b.value,
      })),
    );
}

function buildExtraSelectMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId("autorol:select:extra")
    .setPlaceholder("Extra (varias opciones)")
    .setMinValues(1)
    .setMaxValues(EXTRA_OPTIONS.length)
    .addOptions(
      EXTRA_OPTIONS.map((e) => ({
        label: e.label,
        value: e.value,
      })),
    );
}

async function ensureMember(interaction) {
  if (!interaction.inGuild()) return null;
  try {
    return await interaction.guild.members.fetch(interaction.user.id);
  } catch {
    return interaction.member;
  }
}

async function assignConfigurableRoles({
  interaction,
  member,
  entries,
  values,
  mode,
}) {
  const selected = new Set(values);
  const toAdd = entries.filter((e) => selected.has(e.value) && e.roleId?.trim());
  const missingConfig = entries.filter(
    (e) => selected.has(e.value) && !e.roleId?.trim(),
  );

  if (toAdd.length === 0) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        missingConfig.length > 0
          ? BOT_MESSAGES.autorol.roleMissingConfig
          : BOT_MESSAGES.autorol.noConfiguredRoles,
    });
    return;
  }

  const missingLabels = missingConfig.map((e) => e.label).join(", ");

  const me = interaction.guild.members.me;
  for (const { roleId, label } of toAdd) {
    const role = interaction.guild.roles.cache.get(roleId.trim());
    if (!role) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.autorol.roleDoesNotExist(label),
      });
      return;
    }
    if (me.roles.highest.comparePositionTo(role) <= 0) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: BOT_MESSAGES.autorol.roleHierarchyError,
      });
      return;
    }
  }

  try {
    if (mode === "colors") {
      let m = member;
      try {
        m = await interaction.guild.members.fetch({
          user: interaction.user.id,
          force: true,
        });
      } catch {
        /* usar member recibido */
      }

      const allColorIds = COLOR_OPTIONS.map((c) => c.roleId.trim()).filter(Boolean);
      const idToLabel = new Map(
        COLOR_OPTIONS.filter((c) => c.roleId?.trim()).map((c) => [
          c.roleId.trim(),
          c.label,
        ]),
      );
      const removedLabels = [
        ...new Set(
          allColorIds
            .filter((rid) => m.roles.cache.has(rid))
            .map((rid) => idToLabel.get(rid))
            .filter(Boolean),
        ),
      ];

      for (const rid of allColorIds) {
        if (!m.roles.cache.has(rid)) continue;
        await m.roles.remove(rid).catch(() => {});
      }

      const opt = toAdd[0];
      await m.roles.add(opt.roleId.trim());

      const hadPrevious =
        removedLabels.length > 0 &&
        !(
          removedLabels.length === 1 &&
          removedLabels[0] === opt.label
        );
      const content = hadPrevious
        ? BOT_MESSAGES.autorol.removedAndAssigned(
            removedLabels.join(", "),
            opt.label,
          )
        : BOT_MESSAGES.autorol.assignedColor(opt.label);

      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content,
      });
      return;
    }

    if (mode === "bosses") {
      const allBossIds = BOSS_OPTIONS.map((b) => b.roleId.trim()).filter(Boolean);
      for (const rid of allBossIds) {
        if (member.roles.cache.has(rid)) await member.roles.remove(rid);
      }
      await member.roles.add(toAdd.map((x) => x.roleId.trim()));
      let msg = BOT_MESSAGES.autorol.bossesUpdated(
        toAdd.map((x) => x.label).join(", "),
      );
      if (missingLabels)
        msg += BOT_MESSAGES.autorol.missingSomeRoles(missingLabels);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: msg,
      });
      return;
    }

    if (mode === "extra") {
      const allExtraIds = EXTRA_OPTIONS.map((e) => e.roleId.trim()).filter(Boolean);
      for (const rid of allExtraIds) {
        if (member.roles.cache.has(rid)) await member.roles.remove(rid);
      }
      await member.roles.add(toAdd.map((x) => x.roleId.trim()));
      let extraMsg = BOT_MESSAGES.autorol.extraUpdated(
        toAdd.map((x) => x.label).join(", "),
      );
      if (missingLabels)
        extraMsg += BOT_MESSAGES.autorol.missingSomeRoles(missingLabels);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: extraMsg,
      });
    }
  } catch (err) {
    console.error("[autorol] Asignar roles:", err);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        BOT_MESSAGES.autorol.assignError,
    });
  }
}

export const autorolCommand = {
  data: new SlashCommandBuilder()
    .setName("autorol")
    .setDescription(
      "Publica el panel de auto-roles (colores, bosses y extra) en un canal.",
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName("canal")
        .setDescription("Canal donde publicar el panel")
        .setRequired(true)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
        ),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: BOT_MESSAGES.common.serverOnly,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const target = interaction.options.getChannel("canal", true);
    if (
      !target ||
      !("guild" in target) ||
      target.guildId !== interaction.guild.id
    ) {
      await interaction.reply({
        content: BOT_MESSAGES.common.onlyInThisGuildChannel,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (
      target.type !== ChannelType.GuildText &&
      target.type !== ChannelType.GuildAnnouncement
    ) {
      await interaction.reply({
        content: BOT_MESSAGES.common.channelMustBeTextOrNews,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const me = interaction.guild.members.me;
    const perms = target.permissionsFor(me);
    if (
      !perms ||
      !perms.has(PermissionFlagsBits.ViewChannel) ||
      !perms.has(PermissionFlagsBits.SendMessages) ||
      !perms.has(PermissionFlagsBits.EmbedLinks)
    ) {
      await interaction.reply({
        content: BOT_MESSAGES.autorol.targetChannelPermsError,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Auto roles")
      .setDescription("Elige tus roles.")
      .setImage(DEFAULT_EMBED_BANNER_URL);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("autorol:colors")
        .setLabel("Colores")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("autorol:bosses")
        .setLabel("Bosses")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("autorol:extra")
        .setLabel("Extra")
        .setStyle(ButtonStyle.Success),
    );

    await target.send({
      content: `<@&${AUTOROL_PANEL_PING_ROLE_ID}>`,
      embeds: [embed],
      components: [row],
      allowedMentions: { roles: [AUTOROL_PANEL_PING_ROLE_ID] },
    });
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: BOT_MESSAGES.autorol.panelSent(target),
    });
  },
};

export async function handleAutorolInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === "autorol:colors") {
      const row = new ActionRowBuilder().addComponents(buildColorSelectMenu());
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        components: [row],
      });
      return true;
    }
    if (interaction.customId === "autorol:bosses") {
      const row = new ActionRowBuilder().addComponents(buildBossSelectMenu());
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        components: [row],
      });
      return true;
    }
    if (interaction.customId === "autorol:extra") {
      const row = new ActionRowBuilder().addComponents(buildExtraSelectMenu());
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        components: [row],
      });
      return true;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "autorol:select:colors") {
      const member = await ensureMember(interaction);
      if (!member) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: BOT_MESSAGES.common.onlyWorksInGuild,
        });
        return true;
      }
      await assignConfigurableRoles({
        interaction,
        member,
        entries: COLOR_OPTIONS,
        values: interaction.values,
        mode: "colors",
      });
      return true;
    }

    if (interaction.customId === "autorol:select:bosses") {
      const member = await ensureMember(interaction);
      if (!member) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: BOT_MESSAGES.common.onlyWorksInGuild,
        });
        return true;
      }
      await assignConfigurableRoles({
        interaction,
        member,
        entries: BOSS_OPTIONS,
        values: interaction.values,
        mode: "bosses",
      });
      return true;
    }

    if (interaction.customId === "autorol:select:extra") {
      const member = await ensureMember(interaction);
      if (!member) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: BOT_MESSAGES.common.onlyWorksInGuild,
        });
        return true;
      }
      await assignConfigurableRoles({
        interaction,
        member,
        entries: EXTRA_OPTIONS,
        values: interaction.values,
        mode: "extra",
      });
      return true;
    }
  }

  return false;
}
