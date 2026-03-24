import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";

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
      ephemeral: true,
      content:
        missingConfig.length > 0
          ? "La opción que elegiste aún no tiene rol configurado en el bot. Avísale a un administrador."
          : "No hay roles configurados para esa selección.",
    });
    return;
  }

  const missingLabels = missingConfig.map((e) => e.label).join(", ");

  const me = interaction.guild.members.me;
  for (const { roleId, label } of toAdd) {
    const role = interaction.guild.roles.cache.get(roleId.trim());
    if (!role) {
      await interaction.reply({
        ephemeral: true,
        content: `El rol configurado para **${label}** no existe en el servidor.`,
      });
      return;
    }
    if (me.roles.highest.comparePositionTo(role) <= 0) {
      await interaction.reply({
        ephemeral: true,
        content:
          "No puedo asignar ese rol: está por encima de mi rol más alto. Mueve el rol del bot arriba.",
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
        ? `Te quité **${removedLabels.join(", ")}** y te asigné **${opt.label}**.`
        : `Listo: te asigné el color **${opt.label}**.`;

      await interaction.reply({
        ephemeral: true,
        content,
      });
      return;
    }

    const allBossIds = BOSS_OPTIONS.map((b) => b.roleId.trim()).filter(Boolean);
    for (const rid of allBossIds) {
      if (member.roles.cache.has(rid)) await member.roles.remove(rid);
    }
    await member.roles.add(toAdd.map((x) => x.roleId.trim()));
    let msg = `Listo: roles de boss actualizados (**${toAdd.map((x) => x.label).join(", ")}**).`;
    if (missingLabels)
      msg += `\n*(Algunas opciones elegidas aún no tienen rol: ${missingLabels})*`;
    await interaction.reply({
      ephemeral: true,
      content: msg,
    });
  } catch (err) {
    console.error("[autorol] Asignar roles:", err);
    await interaction.reply({
      ephemeral: true,
      content:
        "No pude asignar el rol. Comprueba que el bot tenga **Gestionar roles** y que su rol esté por encima de los roles a asignar.",
    });
  }
}

export const autorolCommand = {
  data: new SlashCommandBuilder()
    .setName("autorol")
    .setDescription(
      "Publica el panel de auto-roles (colores y bosses) en un canal.",
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
        content: "Este comando solo se puede usar en un servidor.",
        ephemeral: true,
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
        content: "Elige un canal de texto de **este** servidor.",
        ephemeral: true,
      });
      return;
    }

    if (
      target.type !== ChannelType.GuildText &&
      target.type !== ChannelType.GuildAnnouncement
    ) {
      await interaction.reply({
        content: "El canal tiene que ser de texto o anuncios.",
        ephemeral: true,
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
        content:
          "No tengo permiso para **ver**, **enviar mensajes** e **insertar enlaces** en ese canal.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Auto roles")
      .setDescription(
        "Elige tus roles.",
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("autorol:colors")
        .setLabel("Colores")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("autorol:bosses")
        .setLabel("Bosses")
        .setStyle(ButtonStyle.Secondary),
    );

    await target.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      ephemeral: true,
      content: `Panel enviado a ${target}.`,
    });
  },
};

export async function handleAutorolInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === "autorol:colors") {
      const row = new ActionRowBuilder().addComponents(buildColorSelectMenu());
      await interaction.reply({
        ephemeral: true,
        components: [row],
      });
      return true;
    }
    if (interaction.customId === "autorol:bosses") {
      const row = new ActionRowBuilder().addComponents(buildBossSelectMenu());
      await interaction.reply({
        ephemeral: true,
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
          ephemeral: true,
          content: "Esto solo funciona dentro de un servidor.",
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
          ephemeral: true,
          content: "Esto solo funciona dentro de un servidor.",
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
  }

  return false;
}
