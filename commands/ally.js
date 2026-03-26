import {
  ActionRowBuilder,
  Colors,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { MongoClient, ObjectId } from "mongodb";
import { DEFAULT_EMBED_BANNER_URL } from "../embedDefaults.js";

const ALLY_COLLECTION = "ally_links";
const modalCustomId = "ally:modal:add";
const removeSelectCustomId = "ally:select:remove";

let mongoClient;
let mongoDb;

function mongoConfigOk() {
  return (
    typeof process.env.MONGODB_URI === "string" &&
    process.env.MONGODB_URI.trim() !== ""
  );
}

async function getAllyCollection() {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB?.trim() || "paradaisu";
  if (!uri) throw new Error("MONGODB_URI_MISSING");

  if (!mongoClient) mongoClient = new MongoClient(uri);
  if (!mongoDb) {
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
  }
  return mongoDb.collection(ALLY_COLLECTION);
}

function normalize(input) {
  return String(input || "").trim();
}

function allyEmbedForChannel(guildName, entries) {
  const description =
    entries.length === 0
      ? "No hay allys registrados por ahora."
      : entries
          .map(
            (x, i) =>
              `${i + 1}. **${x.guildName}**\nDiscord: ${x.discordLink}`,
          )
          .join("\n\n");

  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle("Allys")
    .setDescription(description)
    .setImage(DEFAULT_EMBED_BANNER_URL)
    .setFooter({ text: guildName })
    .setTimestamp();
}

export const allyCommand = {
  data: new SlashCommandBuilder()
    .setName("ally")
    .setDescription("Gestiona allys y publica la lista.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Agregar un ally (modal)"),
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Eliminar uno o varios allys"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("publicar")
        .setDescription("Publicar embed de allys en este canal"),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        ephemeral: true,
        content: "Este comando solo se puede usar en un servidor.",
      });
      return;
    }

    if (!mongoConfigOk()) {
      await interaction.reply({
        ephemeral: true,
        content:
          "Falta configurar `MONGODB_URI` en `.env` para usar `/ally`.",
      });
      return;
    }

    const sub = interaction.options.getSubcommand(false);

    if (!sub || sub === "publicar") {
      try {
        const col = await getAllyCollection();
        const entries = await col
          .find({ guildId: interaction.guildId })
          .sort({ guildName: 1 })
          .toArray();

        const embed = allyEmbedForChannel(interaction.guild.name, entries);
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({
          ephemeral: true,
          content: "Lista de allys publicada en este canal.",
        });
      } catch (err) {
        console.error("[ally] publicar:", err);
        await interaction.reply({
          ephemeral: true,
          content: "No pude publicar la lista de allys.",
        });
      }
      return;
    }

    if (sub === "add") {
      const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle("Agregar ally");

      const guildName = new TextInputBuilder()
        .setCustomId("guild_name")
        .setLabel("Nombre guild")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const discordLink = new TextInputBuilder()
        .setCustomId("discord_link")
        .setLabel("Link discord")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(guildName),
        new ActionRowBuilder().addComponents(discordLink),
      );

      await interaction.showModal(modal);
      return;
    }

    if (sub === "remove") {
      try {
        const col = await getAllyCollection();
        const entries = await col
          .find({ guildId: interaction.guildId })
          .sort({ guildName: 1 })
          .toArray();

        if (entries.length === 0) {
          await interaction.reply({
            ephemeral: true,
            content: "No hay allys registrados para eliminar.",
          });
          return;
        }

        const options = entries.slice(0, 25).map((x) => ({
          label: x.guildName.slice(0, 100),
          description: x.discordLink.slice(0, 100),
          value: String(x._id),
        }));

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(removeSelectCustomId)
            .setPlaceholder("Selecciona ally(s) para eliminar")
            .setMinValues(1)
            .setMaxValues(options.length)
            .addOptions(options),
        );

        await interaction.reply({
          ephemeral: true,
          components: [row],
        });
      } catch (err) {
        console.error("[ally] remove list:", err);
        await interaction.reply({
          ephemeral: true,
          content: "No pude cargar la lista de allys.",
        });
      }
    }
  },
};

export async function handleAllyInteraction(interaction) {
  if (interaction.isModalSubmit() && interaction.customId === modalCustomId) {
    if (!interaction.inGuild()) return true;
    if (!mongoConfigOk()) {
      await interaction.reply({
        ephemeral: true,
        content: "Falta `MONGODB_URI` para guardar allys.",
      });
      return true;
    }

    const guildName = normalize(
      interaction.fields.getTextInputValue("guild_name"),
    );
    const discordLink = normalize(
      interaction.fields.getTextInputValue("discord_link"),
    );

    if (!guildName || !discordLink) {
      await interaction.reply({
        ephemeral: true,
        content: "Nombre guild y Link discord son obligatorios.",
      });
      return true;
    }

    try {
      const col = await getAllyCollection();
      await col.insertOne({
        guildId: interaction.guildId,
        guildName,
        discordLink,
        createdBy: interaction.user.id,
        createdAt: new Date(),
      });
      await interaction.reply({
        ephemeral: true,
        content: `Ally agregado: **${guildName}**.`,
      });
    } catch (err) {
      console.error("[ally] add:", err);
      await interaction.reply({
        ephemeral: true,
        content: "No pude guardar el ally en MongoDB.",
      });
    }
    return true;
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === removeSelectCustomId
  ) {
    if (!interaction.inGuild()) return true;
    if (!mongoConfigOk()) {
      await interaction.reply({
        ephemeral: true,
        content: "Falta `MONGODB_URI` para eliminar allys.",
      });
      return true;
    }

    const ids = interaction.values
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (ids.length === 0) {
      await interaction.reply({
        ephemeral: true,
        content: "No se recibieron IDs válidos para eliminar.",
      });
      return true;
    }

    try {
      const col = await getAllyCollection();
      const result = await col.deleteMany({
        guildId: interaction.guildId,
        _id: { $in: ids },
      });
      await interaction.reply({
        ephemeral: true,
        content: `Allys eliminados: **${result.deletedCount}**.`,
      });
    } catch (err) {
      console.error("[ally] remove:", err);
      await interaction.reply({
        ephemeral: true,
        content: "No pude eliminar los allys en MongoDB.",
      });
    }
    return true;
  }

  return false;
}
