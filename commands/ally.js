import {
  ActionRowBuilder,
  Colors,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { MongoClient, ObjectId } from "mongodb";

const ALLY_EMBED_IMAGE_URL =
  "https://images-ext-1.discordapp.net/external/N_CetSKMoMcw0pTvrHDAT13TtTuakN3xfyqno2PvPZo/https/cdn.nekotina.com/guilds/1133248786773327994/03c2ccd0-8540-4382-86c4-22e3bfd5bf9d.jpg?format=webp";

const ALLY_COLLECTION = "ally_links";
const ALLY_META_COLLECTION = "ally_panel_meta";
const modalCustomId = "ally:modal:add";
const removeSelectCustomId = "ally:select:remove";
const editSelectCustomId = "ally:select:edit";

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

async function getAllyMetaCollection() {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB?.trim() || "paradaisu";
  if (!uri) throw new Error("MONGODB_URI_MISSING");

  if (!mongoClient) mongoClient = new MongoClient(uri);
  if (!mongoDb) {
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
  }
  return mongoDb.collection(ALLY_META_COLLECTION);
}

function normalize(input) {
  return String(input || "").trim();
}

function allyEmbedForChannel(guildName, entries) {
  const fields =
    entries.length === 0
      ? [{ name: "Sin allys", value: "No hay allys registrados.", inline: true }]
      : entries.slice(0, 25).map((x) => ({
          name: x.guildName.slice(0, 256),
          value: x.discordLink.slice(0, 1024),
          inline: true,
        }));

  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle("Paradaisu Allies")
    .addFields(fields)
    .setImage(ALLY_EMBED_IMAGE_URL)
    .setFooter({ text: guildName })
    .setTimestamp();
}

async function getStoredPanelRef(guildId) {
  const meta = await getAllyMetaCollection();
  return meta.findOne({ guildId });
}

async function setStoredPanelRef(guildId, channelId, messageId) {
  const meta = await getAllyMetaCollection();
  await meta.updateOne(
    { guildId },
    {
      $set: {
        guildId,
        channelId,
        messageId,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

async function refreshStoredAllyEmbed(interaction) {
  const ref = await getStoredPanelRef(interaction.guildId);
  if (!ref?.channelId || !ref?.messageId) return { ok: false, reason: "missing_ref" };

  const col = await getAllyCollection();
  const entries = await col
    .find({ guildId: interaction.guildId })
    .sort({ guildName: 1 })
    .toArray();
  const embed = allyEmbedForChannel(interaction.guild.name, entries);

  try {
    const channel = await interaction.guild.channels.fetch(ref.channelId);
    if (!channel?.isTextBased?.()) return { ok: false, reason: "bad_channel" };
    const msg = await channel.messages.fetch(ref.messageId);
    await msg.edit({ embeds: [embed] });
    return { ok: true };
  } catch {
    return { ok: false, reason: "not_found" };
  }
}

async function createOrReplacePanelInCurrentChannel(interaction) {
  const channel = interaction.channel;
  if (!channel?.isTextBased?.()) throw new Error("CHANNEL_NOT_TEXT");

  const col = await getAllyCollection();
  const entries = await col
    .find({ guildId: interaction.guildId })
    .sort({ guildName: 1 })
    .toArray();
  const embed = allyEmbedForChannel(interaction.guild.name, entries);

  const sent = await channel.send({ embeds: [embed] });
  await setStoredPanelRef(interaction.guildId, channel.id, sent.id);
}

export const allyCommand = {
  data: new SlashCommandBuilder()
    .setName("ally")
    .setDescription("Gestiona allys y el panel")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Agregar un ally"),
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Eliminar uno o varios allys"),
    )
    .addSubcommand((sub) =>
      sub.setName("edit").setDescription("Editar un ally existente"),
    )
    .addSubcommand((sub) =>
      sub.setName("embed").setDescription("Crear o actualizar el panel de allys"),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Este comando solo se puede usar en un servidor.",
      });
      return;
    }

    if (!mongoConfigOk()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content:
          "Falta configurar `MONGODB_URI` en `.env` para usar `/ally`.",
      });
      return;
    }

    const sub = interaction.options.getSubcommand(true);
    if (sub === "embed") {
      try {
        await createOrReplacePanelInCurrentChannel(interaction);
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "Panel de allys creado/actualizado en este canal.",
        });
      } catch (err) {
        console.error("[ally] embed:", err);
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "No pude crear/actualizar el panel de allys.",
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
            flags: MessageFlags.Ephemeral,
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
          flags: MessageFlags.Ephemeral,
          components: [row],
        });
      } catch (err) {
        console.error("[ally] remove list:", err);
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "No pude cargar la lista de allys.",
        });
      }
    }

    if (sub === "edit") {
      try {
        const col = await getAllyCollection();
        const entries = await col
          .find({ guildId: interaction.guildId })
          .sort({ guildName: 1 })
          .toArray();

        if (entries.length === 0) {
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "No hay allys registrados para editar.",
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
            .setCustomId(editSelectCustomId)
            .setPlaceholder("Selecciona un ally para editar")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options),
        );

        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          components: [row],
        });
      } catch (err) {
        console.error("[ally] edit list:", err);
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "No pude cargar la lista de allys para editar.",
        });
      }
      return;
    }
  },
};

export async function handleAllyInteraction(interaction) {
  if (interaction.isModalSubmit() && interaction.customId === modalCustomId) {
    if (!interaction.inGuild()) return true;
    if (!mongoConfigOk()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
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
      const refreshed = await refreshStoredAllyEmbed(interaction);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: refreshed.ok
          ? `Ally agregado: **${guildName}**. Panel actualizado.`
          : `Ally agregado: **${guildName}**. Usa \`/ally embed\` para crear/revincular el panel.`,
      });
    } catch (err) {
      console.error("[ally] add:", err);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
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
      const refreshed = await refreshStoredAllyEmbed(interaction);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: refreshed.ok
          ? `Allys eliminados: **${result.deletedCount}**. Panel actualizado.`
          : `Allys eliminados: **${result.deletedCount}**. Usa \`/ally embed\` para crear/revincular el panel.`,
      });
    } catch (err) {
      console.error("[ally] remove:", err);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "No pude eliminar los allys en MongoDB.",
      });
    }
    return true;
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === editSelectCustomId
  ) {
    if (!interaction.inGuild()) return true;
    if (!mongoConfigOk()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Falta `MONGODB_URI` para editar allys.",
      });
      return true;
    }

    const allyId = interaction.values?.[0];
    let oid;
    try {
      oid = new ObjectId(allyId);
    } catch {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "ID de ally inválido para editar.",
      });
      return true;
    }

    try {
      const col = await getAllyCollection();
      const doc = await col.findOne({ guildId: interaction.guildId, _id: oid });
      if (!doc) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "No encontré ese ally. Prueba de nuevo.",
        });
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId(`ally:modal:edit:${String(doc._id)}`)
        .setTitle("Editar ally");

      const guildName = new TextInputBuilder()
        .setCustomId("guild_name")
        .setLabel("Nombre guild")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(doc.guildName || "").slice(0, 100));

      const discordLink = new TextInputBuilder()
        .setCustomId("discord_link")
        .setLabel("Link discord")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(doc.discordLink || "").slice(0, 100));

      modal.addComponents(
        new ActionRowBuilder().addComponents(guildName),
        new ActionRowBuilder().addComponents(discordLink),
      );

      await interaction.showModal(modal);
    } catch (err) {
      console.error("[ally] edit select:", err);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "No pude abrir el formulario de edición.",
      });
    }
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("ally:modal:edit:")) {
    if (!interaction.inGuild()) return true;
    if (!mongoConfigOk()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Falta `MONGODB_URI` para editar allys.",
      });
      return true;
    }

    const allyId = interaction.customId.replace("ally:modal:edit:", "");
    let oid;
    try {
      oid = new ObjectId(allyId);
    } catch {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "ID de ally inválido para editar.",
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
        flags: MessageFlags.Ephemeral,
        content: "Nombre guild y Link discord son obligatorios.",
      });
      return true;
    }

    try {
      const col = await getAllyCollection();
      const result = await col.updateOne(
        { guildId: interaction.guildId, _id: oid },
        {
          $set: {
            guildName,
            discordLink,
            updatedBy: interaction.user.id,
            updatedAt: new Date(),
          },
        },
      );
      if (!result.matchedCount) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "No encontré ese ally para editar.",
        });
        return true;
      }

      const refreshed = await refreshStoredAllyEmbed(interaction);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: refreshed.ok
          ? `Ally editado: **${guildName}**. Panel actualizado.`
          : `Ally editado: **${guildName}**. Usa \`/ally embed\` para crear/revincular el panel.`,
      });
    } catch (err) {
      console.error("[ally] edit save:", err);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "No pude guardar la edición del ally.",
      });
    }
    return true;
  }

  return false;
}
