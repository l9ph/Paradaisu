import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

function summaryEmbed(title, fields) {
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(title)
    .addFields(fields)
    .setTimestamp();
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

      const info = new TextInputBuilder()
        .setCustomId("ally_info")
        .setLabel("Presentación / información")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(info));

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
        new ActionRowBuilder().addComponents(guilds),
        new ActionRowBuilder().addComponents(elo),
      );

      await interaction.showModal(modal);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    const { customId, user, fields } = interaction;

    if (customId.startsWith("ticket_modal:pvp:")) {
      const estiloRaw = customId.replace("ticket_modal:pvp:", "");
      const estiloLabel =
        { pvp: "PvP", support: "Support", trackstar: "Trackstar" }[estiloRaw] ??
        estiloRaw;
      const guilds = fields.getTextInputValue("guilds");
      const elo = fields.getTextInputValue("elo");

      await interaction.reply({
        ephemeral: true,
        embeds: [
          summaryEmbed("Respuestas — PvP", [
            { name: "User", value: `${user}`, inline: false },
            { name: "Estilo de juego", value: estiloLabel, inline: true },
            { name: "Guilds anteriores", value: guilds.slice(0, 1024), inline: false },
            { name: "Mayor Elo", value: elo.slice(0, 1024), inline: true },
          ]),
        ],
      });
      return true;
    }

    if (customId === "ticket_modal:pve") {
      const jefes = fields.getTextInputValue("jefes");
      const carrear = fields.getTextInputValue("carrear");

      await interaction.reply({
        ephemeral: true,
        embeds: [
          summaryEmbed("Respuestas — PvE", [
            { name: "User", value: `${user}`, inline: false },
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
          ]),
        ],
      });
      return true;
    }

    if (customId === "ticket_modal:ally") {
      const info = fields.getTextInputValue("ally_info");

      await interaction.reply({
        ephemeral: true,
        embeds: [
          summaryEmbed("Respuestas — Ally", [
            { name: "User", value: `${user}`, inline: false },
            { name: "Información", value: info.slice(0, 1024), inline: false },
          ]),
        ],
      });
      return true;
    }
  }

  return false;
}
