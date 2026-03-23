import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const TICKET_STAFF_ROLE_IDS = [];

const TICKET_CATEGORY_ID = "";

function summaryEmbed(title, fields) {
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(title)
    .addFields(fields)
    .setTimestamp();
}

function memberCanReviewTicket(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const ids = TICKET_STAFF_ROLE_IDS.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) return false;
  return ids.some((id) => member.roles.cache.has(id));
}

async function createWaitingChannel(guild, creator, embed) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: guild.members.me.id,
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
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const channelData = {
    name: `espera-${creator.id}`,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
  };
  const cat = TICKET_CATEGORY_ID?.trim();
  if (cat) channelData.parent = cat;

  const channel = await guild.channels.create(channelData);

  const staffEmbed = EmbedBuilder.from(embed).addFields({
    name: "Enviado por (Discord)",
    value: `${creator} (\`${creator.id}\`)`,
    inline: false,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:reviewed:${creator.id}`)
      .setLabel("Revisado")
      .setStyle(ButtonStyle.Success),
  );

  await channel.send({ embeds: [staffEmbed], components: [row] });
  return channel;
}

async function submitTicketToChannel(interaction, embed) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const channel = await createWaitingChannel(interaction.guild, interaction.user, embed);
    await interaction.editReply({
      content: `Ticket creado. Canal de espera: ${channel}`,
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
    .setDescription("Abre la encuesta de ticket (PvP, PvE, Ally)"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Encuesta")
      .setDescription("Elige una opción:");

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

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};

export async function handleTicketInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("ticket:reviewed:")) {
      if (!interaction.inGuild()) return true;
      const creatorId = interaction.customId.split(":")[2];
      if (!memberCanReviewTicket(interaction.member)) {
        await interaction.reply({
          content: "No tienes permiso para marcar tickets como revisados.",
          ephemeral: true,
        });
        return true;
      }

      try {
        const u = await interaction.client.users.fetch(creatorId);
        await u.send({ content: "Tu ticket ha sido revisado." });
      } catch (err) {
        console.error("[ticket] MD al usuario:", err);
        await interaction.reply({
          content:
            "No pude enviar el mensaje directo al usuario (MD cerrados o bloqueo).",
          ephemeral: true,
        });
        return true;
      }

      const disabled = ButtonBuilder.from(interaction.component).setDisabled(true);
      await interaction.update({
        embeds: [...interaction.message.embeds],
        components: [new ActionRowBuilder().addComponents(disabled)],
      });
      return true;
    }

    if (interaction.customId === "ticket:pvp") {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket:pvp:estilo")
          .setPlaceholder("Estilo de juego")
          .addOptions(
            { label: "PvP", value: "pvp" },
            { label: "Support", value: "support" },
            { label: "Trackstar", value: "trackstar" },
          ),
      );
      await interaction.reply({
        ephemeral: true,
        content: "Elige tu estilo de juego:",
        components: [row],
      });
      return true;
    }

    if (interaction.customId === "ticket:pve") {
      const modal = new ModalBuilder()
        .setCustomId("ticket_modal:pve")
        .setTitle("Cuestionario PvE");

      const ticketUser = new TextInputBuilder()
        .setCustomId("ticket_user")
        .setLabel("User")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Tu usuario / nick / @")
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

      modal.addComponents(
        new ActionRowBuilder().addComponents(ticketUser),
        new ActionRowBuilder().addComponents(jefes),
        new ActionRowBuilder().addComponents(carrear),
      );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === "ticket:ally") {
      const modal = new ModalBuilder()
        .setCustomId("ticket_modal:ally")
        .setTitle("Cuestionario Ally");

      const ticketUser = new TextInputBuilder()
        .setCustomId("ticket_user")
        .setLabel("User")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Tu usuario / nick / @")
        .setRequired(true);

      const info = new TextInputBuilder()
        .setCustomId("ally_info")
        .setLabel("Presentación / información")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ticketUser),
        new ActionRowBuilder().addComponents(info),
      );

      await interaction.showModal(modal);
      return true;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticket:pvp:estilo") {
      const estilo = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal:pvp:${estilo}`)
        .setTitle("Cuestionario PvP");

      const ticketUser = new TextInputBuilder()
        .setCustomId("ticket_user")
        .setLabel("User")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Tu usuario / nick / @")
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

      modal.addComponents(
        new ActionRowBuilder().addComponents(ticketUser),
        new ActionRowBuilder().addComponents(guilds),
        new ActionRowBuilder().addComponents(elo),
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

      const embed = summaryEmbed("Ticket — PvP", [
        { name: "User", value: ticketUser.slice(0, 1024), inline: false },
        { name: "Estilo de juego", value: estiloLabel, inline: true },
        { name: "Guilds anteriores", value: guilds.slice(0, 1024), inline: false },
        { name: "Mayor Elo", value: elo.slice(0, 1024), inline: true },
      ]);

      await submitTicketToChannel(interaction, embed);
      return true;
    }

    if (customId === "ticket_modal:pve") {
      const ticketUser = fields.getTextInputValue("ticket_user");
      const jefes = fields.getTextInputValue("jefes");
      const carrear = fields.getTextInputValue("carrear");

      const embed = summaryEmbed("Ticket — PvE", [
        { name: "User", value: ticketUser.slice(0, 1024), inline: false },
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
      ]);

      await submitTicketToChannel(interaction, embed);
      return true;
    }

    if (customId === "ticket_modal:ally") {
      const ticketUser = fields.getTextInputValue("ticket_user");
      const info = fields.getTextInputValue("ally_info");

      const embed = summaryEmbed("Ticket — Ally", [
        { name: "User", value: ticketUser.slice(0, 1024), inline: false },
        { name: "Información", value: info.slice(0, 1024), inline: false },
      ]);

      await submitTicketToChannel(interaction, embed);
      return true;
    }
  }

  return false;
}
