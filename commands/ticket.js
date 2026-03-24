import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  EmbedBuilder,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const TICKET_STAFF_ROLE_IDS = ["1450309317889884270"];

const TICKET_CATEGORY_ID = "";

function summaryEmbed(title, fields) {
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(title)
    .addFields(fields)
    .setTimestamp();
}

function memberCanUseTicketWaitButton(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function slugifyChannelSegment(raw, fallback) {
  const s = String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || String(fallback);
}

async function createWaitingChannel(
  guild,
  creator,
  embed,
  ticketTipo,
  allowCreatorAfterReviewed = false,
) {
  const tipoSlug = String(ticketTipo).toLowerCase().replace(/[^a-z0-9-]/g, "");
  let member;
  try {
    member = await guild.members.fetch({ user: creator.id });
  } catch {
    member = null;
  }
  const displayRaw =
    member?.displayName ?? member?.user?.username ?? creator.username;
  const displaySlug = slugifyChannelSegment(displayRaw, creator.id);
  const channelName = `ticket-${tipoSlug}-${displaySlug}`.slice(0, 100);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: creator.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    },
    {
      id: guild.members.me.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  for (const roleId of TICKET_STAFF_ROLE_IDS.map((x) => String(x).trim()).filter(Boolean)) {
    overwrites.push({
      id: roleId,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    });
  }

  const channelData = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
  };
  const cat = TICKET_CATEGORY_ID?.trim();
  if (cat) channelData.parent = cat;

  const channel = await guild.channels.create(channelData);

  const staffEmbed = EmbedBuilder.from(embed).addFields({
    name: "Enviado por",
    value: `Ticket creado por ${creator}`,
    inline: false,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `ticket:reviewed:${creator.id}:${allowCreatorAfterReviewed ? "unlock" : "locked"}`,
      )
      .setLabel("Leído")
      .setStyle(ButtonStyle.Success),
  );

  await channel.send({ embeds: [staffEmbed], components: [row] });
  return channel;
}

async function submitTicketToChannel(
  interaction,
  embed,
  ticketTipo,
  allowCreatorAfterReviewed = false,
) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const channel = await createWaitingChannel(
      interaction.guild,
      interaction.user,
      embed,
      ticketTipo,
      allowCreatorAfterReviewed,
    );
    await interaction.editReply({
      content: `Ticket creado. Tu canal: ${channel}`,
    });
  } catch (err) {
    console.error("[ticket] No se pudo crear el canal:", err);
    await interaction.editReply({
      content:
        "No se pudo crear el canal de espera. El bot necesita **Gestionar canales** y debes configurar al menos un ID en `TICKET_STAFF_ROLE_IDS` en `commands/ticket.js` (o usa un rol con permisos de administrador para revisar).",
    });
  }
}

export const ticketCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription(
      "Publica la encuesta de ticket en un canal (solo dueño o administradores).",
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName("canal")
        .setDescription("Canal donde publicar la encuesta")
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

    const isOwner = interaction.guild.ownerId === interaction.user.id;
    const isAdmin =
      interaction.member?.permissions?.has(
        PermissionFlagsBits.Administrator,
      ) ?? false;

    if (!isOwner && !isAdmin) {
      await interaction.reply({
        content:
          "Solo el **dueño del servidor** o un **administrador** puede usar `/ticket`.",
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
          "No tengo permiso para **ver**, **enviar mensajes** y **insertar enlaces** en ese canal.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Tryout")
      .setDescription(
        "Genera aquí tu ticket para TryOut y espera respuesta.\n\nElige entre estas opciones",
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:pvp")
        .setLabel("PvP")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("ticket:pve")
        .setLabel("PvE")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("ticket:ally")
        .setLabel("Ally")
        .setStyle(ButtonStyle.Primary),
    );

    await target.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: `Prueba publicada en ${target}.`,
      ephemeral: true,
    });
  },
};

export async function handleTicketInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === "ticket:delete-channel") {
      if (!interaction.inGuild()) return true;
      if (!memberCanUseTicketWaitButton(interaction.member)) {
        await interaction.reply({
          content:
            "Solo los **administradores** del servidor pueden eliminar este canal.",
          ephemeral: true,
        });
        return true;
      }

      await interaction.reply({
        content: "Canal eliminado por administración.",
      });
      await interaction.channel.delete("Ticket finalizado y eliminado");
      return true;
    }

    if (interaction.customId.startsWith("ticket:reviewed:")) {
      if (!interaction.inGuild()) return true;
      const [, , creatorId, unlockMode] = interaction.customId.split(":");
      const shouldUnlockCreator = unlockMode === "unlock";
      if (!memberCanUseTicketWaitButton(interaction.member)) {
        await interaction.reply({
          content:
            "Solo los **administradores** del servidor pueden usar este botón.",
          ephemeral: true,
        });
        return true;
      }

      const disabled = ButtonBuilder.from(interaction.component).setDisabled(true);
      await interaction.update({
        embeds: [...interaction.message.embeds],
        components: [new ActionRowBuilder().addComponents(disabled)],
      });

      if (shouldUnlockCreator) {
        try {
          await interaction.channel.permissionOverwrites.edit(creatorId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
        } catch (err) {
          console.error("[ticket] No se pudieron actualizar permisos:", err);
        }

        await interaction.channel.send({
          content: `<@${creatorId}> tu ticket fue leído, ahora puedes escribir en este canal mientras esperas respuesta del staff.`,
        });
      } else {
        await interaction.channel.send({
          content: `<@${creatorId}> tu ticket fue leído. Espera respuesta del staff.`,
        });
      }

      const closeEmbed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle("Gestión del ticket")
        .setDescription(
          "Este ticket ya fue leído. Si ya no se necesita, puedes eliminar este canal.",
        )
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket:delete-channel")
          .setLabel("Eliminar canal")
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.channel.send({
        embeds: [closeEmbed],
        components: [closeRow],
      });
      return true;
    }

    if (interaction.customId === "ticket:pvp") {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket:pvp:estilo")
          .setPlaceholder("Tipo pvp")
          .addOptions(
            { label: "PvP", value: "pvp" },
            { label: "Support", value: "support" },
            { label: "Trackstar", value: "trackstar" },
          ),
      );
      await interaction.reply({
        ephemeral: true,
        components: [row],
      });
      return true;
    }

    if (interaction.customId === "ticket:pve") {
      const modal = new ModalBuilder()
        .setCustomId("ticket_modal:pve")
        .setTitle("Prueba para PvE");

      const ticketUser = new TextInputBuilder()
        .setCustomId("ticket_user")
        .setLabel("User de roblox")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const jefes = new TextInputBuilder()
        .setCustomId("jefes")
        .setLabel("¿Qué jefes dominas? (separados por comas)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const carrear = new TextInputBuilder()
        .setCustomId("carrear")
        .setLabel("¿Puedes carrear Enmity o Elder Primadon?")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Indica cuál, ambos o no")
        .setRequired(true);

      const region = new TextInputBuilder()
        .setCustomId("region")
        .setLabel("Región")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const edad = new TextInputBuilder()
        .setCustomId("edad")
        .setLabel("Edad")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ticketUser),
        new ActionRowBuilder().addComponents(jefes),
        new ActionRowBuilder().addComponents(carrear),
        new ActionRowBuilder().addComponents(region),
        new ActionRowBuilder().addComponents(edad),
      );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === "ticket:ally") {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket:ally:rol")
          .setPlaceholder("Tipo de Ally")
          .addOptions(
            { label: "Ally", value: "ally" },
            { label: "Ally Leader", value: "allyleader" },
          ),
      );
      await interaction.reply({
        ephemeral: true,
        components: [row],
      });
      return true;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticket:ally:rol") {
      const rol = interaction.values[0];
      if (rol === "allyleader") {
        const modal = new ModalBuilder()
          .setCustomId("ticket_modal:allyleader")
          .setTitle("Prueba para Ally Leader");

        const ticketUser = new TextInputBuilder()
          .setCustomId("ticket_user")
          .setLabel("User de roblox")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const allyGuild = new TextInputBuilder()
          .setCustomId("ally_guild")
          .setLabel("Tu guild")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const mayorTop = new TextInputBuilder()
          .setCustomId("mayor_top_pvp")
          .setLabel("Mayor top alcanzado (PvP)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const region = new TextInputBuilder()
          .setCustomId("region")
          .setLabel("Región")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const edad = new TextInputBuilder()
          .setCustomId("edad")
          .setLabel("Edad")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(ticketUser),
          new ActionRowBuilder().addComponents(allyGuild),
          new ActionRowBuilder().addComponents(mayorTop),
          new ActionRowBuilder().addComponents(region),
          new ActionRowBuilder().addComponents(edad),
        );

        await interaction.showModal(modal);
        return true;
      }

      const scopeRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket:ally:alcance")
          .setPlaceholder("Solo / En guild")
          .addOptions(
            { label: "Solo", value: "solo" },
            { label: "En guild", value: "guild" },
          ),
      );
      await interaction.update({
        components: [scopeRow],
      });
      return true;
    }

    if (interaction.customId === "ticket:ally:alcance") {
      const alcance = interaction.values[0];
      if (alcance === "solo") {
        const modal = new ModalBuilder()
          .setCustomId("ticket_modal:ally:solo")
          .setTitle("Prueba para Ally (solo)");

        const ticketUser = new TextInputBuilder()
          .setCustomId("ticket_user")
          .setLabel("User de roblox")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const eloMax = new TextInputBuilder()
          .setCustomId("elo_max")
          .setLabel("Mayor elo alcanzado")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const region = new TextInputBuilder()
          .setCustomId("region")
          .setLabel("Región")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const edad = new TextInputBuilder()
          .setCustomId("edad")
          .setLabel("Edad")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(ticketUser),
          new ActionRowBuilder().addComponents(eloMax),
          new ActionRowBuilder().addComponents(region),
          new ActionRowBuilder().addComponents(edad),
        );

        await interaction.showModal(modal);
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId("ticket_modal:ally:guild")
        .setTitle("Prueba para Ally (guild)");

      const ticketUser = new TextInputBuilder()
        .setCustomId("ticket_user")
        .setLabel("User de roblox")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const guildName = new TextInputBuilder()
        .setCustomId("guild_name")
        .setLabel("¿De qué guild eres?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const eloMax = new TextInputBuilder()
        .setCustomId("elo_max")
        .setLabel("Mayor elo alcanzado")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const region = new TextInputBuilder()
        .setCustomId("region")
        .setLabel("Región")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const edad = new TextInputBuilder()
        .setCustomId("edad")
        .setLabel("Edad")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ticketUser),
        new ActionRowBuilder().addComponents(guildName),
        new ActionRowBuilder().addComponents(eloMax),
        new ActionRowBuilder().addComponents(region),
        new ActionRowBuilder().addComponents(edad),
      );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === "ticket:pvp:estilo") {
      const estilo = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal:pvp:${estilo}`)
        .setTitle("Prueba para PvP");

      const ticketUser = new TextInputBuilder()
        .setCustomId("ticket_user")
        .setLabel("User de roblox")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const guilds = new TextInputBuilder()
        .setCustomId("guilds")
        .setLabel("Guilds anteriores")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const elo = new TextInputBuilder()
        .setCustomId("elo")
        .setLabel("Mayor Elo")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const region = new TextInputBuilder()
        .setCustomId("region")
        .setLabel("Región")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const edad = new TextInputBuilder()
        .setCustomId("edad")
        .setLabel("Edad")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ticketUser),
        new ActionRowBuilder().addComponents(guilds),
        new ActionRowBuilder().addComponents(elo),
        new ActionRowBuilder().addComponents(region),
        new ActionRowBuilder().addComponents(edad),
      );

      await interaction.showModal(modal);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    const { customId, fields } = interaction;

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Este formulario solo funciona en un servidor.",
        ephemeral: true,
      });
      return true;
    }

    if (customId.startsWith("ticket_modal:pvp:")) {
      const estiloRaw = customId.replace("ticket_modal:pvp:", "");
      const estiloLabel =
        { pvp: "PvP", support: "Support", trackstar: "Trackstar" }[estiloRaw] ??
        estiloRaw;
      const ticketUser = fields.getTextInputValue("ticket_user");
      const guilds = fields.getTextInputValue("guilds");
      const elo = fields.getTextInputValue("elo");
      const region = fields.getTextInputValue("region");

      const embed = summaryEmbed("Ticket — PvP", [
        { name: "User de roblox", value: ticketUser.slice(0, 1024), inline: false },
        { name: "Tipo pvp", value: estiloLabel, inline: true },
        { name: "Guilds anteriores", value: guilds.slice(0, 1024), inline: false },
        { name: "Mayor Elo", value: elo.slice(0, 1024), inline: true },
        { name: "Región", value: region.slice(0, 1024), inline: true },
      ]);

      await submitTicketToChannel(interaction, embed, "pvp", estiloRaw === "pvp");
      return true;
    }

    if (customId === "ticket_modal:pve") {
      const ticketUser = fields.getTextInputValue("ticket_user");
      const jefes = fields.getTextInputValue("jefes");
      const carrear = fields.getTextInputValue("carrear");
      const region = fields.getTextInputValue("region");

      const embed = summaryEmbed("Ticket — PvE", [
        { name: "User de roblox", value: ticketUser.slice(0, 1024), inline: false },
        {
          name: "¿Qué jefes dominas?",
          value: jefes.slice(0, 1024),
          inline: false,
        },
        {
          name: "Carrear Enmity / Elder Primadon",
          value: carrear.slice(0, 1024),
          inline: false,
        },
        { name: "Región", value: region.slice(0, 1024), inline: true },
      ]);

      await submitTicketToChannel(interaction, embed, "pve");
      return true;
    }

    if (customId === "ticket_modal:ally:solo") {
      const ticketUser = fields.getTextInputValue("ticket_user");
      const eloMax = fields.getTextInputValue("elo_max");
      const region = fields.getTextInputValue("region");

      const embed = summaryEmbed("Ticket — Ally (solo)", [
        { name: "Tipo", value: "Ally - Solo", inline: true },
        { name: "User de roblox", value: ticketUser.slice(0, 1024), inline: false },
        { name: "Mayor elo alcanzado", value: eloMax.slice(0, 1024), inline: false },
        { name: "Región", value: region.slice(0, 1024), inline: true },
      ]);

      await submitTicketToChannel(interaction, embed, "ally-solo");
      return true;
    }

    if (customId === "ticket_modal:ally:guild") {
      const ticketUser = fields.getTextInputValue("ticket_user");
      const guildName = fields.getTextInputValue("guild_name");
      const eloMax = fields.getTextInputValue("elo_max");
      const region = fields.getTextInputValue("region");

      const embed = summaryEmbed("Ticket — Ally (guild)", [
        { name: "Tipo", value: "Ally - Guild", inline: true },
        { name: "User de roblox", value: ticketUser.slice(0, 1024), inline: false },
        { name: "Guild", value: guildName.slice(0, 1024), inline: false },
        { name: "Mayor elo alcanzado", value: eloMax.slice(0, 1024), inline: false },
        { name: "Región", value: region.slice(0, 1024), inline: true },
      ]);

      await submitTicketToChannel(interaction, embed, "ally-guild");
      return true;
    }

    if (customId === "ticket_modal:allyleader") {
      const ticketUser = fields.getTextInputValue("ticket_user");
      const allyGuild = fields.getTextInputValue("ally_guild");
      const mayorTop = fields.getTextInputValue("mayor_top_pvp");
      const region = fields.getTextInputValue("region");

      const embed = summaryEmbed("Ticket — Ally Leader", [
        { name: "Tipo", value: "Ally Leader", inline: true },
        { name: "User de roblox", value: ticketUser.slice(0, 1024), inline: false },
        { name: "Guild", value: allyGuild.slice(0, 1024), inline: false },
        {
          name: "Mayor top (PvP)",
          value: mayorTop.slice(0, 1024),
          inline: true,
        },
        { name: "Región", value: region.slice(0, 1024), inline: true },
      ]);

      await submitTicketToChannel(interaction, embed, "allyleader");
      return true;
    }
  }

  return false;
}
