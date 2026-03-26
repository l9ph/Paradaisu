import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { MongoClient } from "mongodb";
import { allyCommand, handleAllyInteraction } from "./commands/ally.js";
import {
  autorolCommand,
  handleAutorolInteraction,
} from "./commands/autorol.js";
import { ticketCommand, handleTicketInteraction } from "./commands/ticket.js";
import { verifyCommand } from "./commands/verify.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Falta DISCORD_TOKEN en el archivo .env");
  process.exit(1);
}

const GUILD_ID = "1133248786773327994";

const commandModules = [verifyCommand, ticketCommand, autorolCommand, allyCommand];
const slashCommands = commandModules.map((command) => command.data.toJSON());
const commandByName = new Map(
  slashCommands.map((data, index) => [data.name, commandModules[index]]),
);

async function verifyMongoOnStartup() {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB?.trim() || "paradaisu";
  if (!uri) {
    console.warn("[mongo] MONGODB_URI no está configurado. /ally no funcionará.");
    return;
  }

  let client;
  try {
    client = new MongoClient(uri);
    await client.connect();
    await client.db(dbName).command({ ping: 1 });
    console.log(`[mongo] Conexión OK (${dbName}).`);
  } catch (err) {
    console.error("[mongo] No se pudo conectar al iniciar:", err);
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Conectado como ${readyClient.user.tag}`);
  await verifyMongoOnStartup();

  const guildIdConfigured = typeof GUILD_ID === "string" && GUILD_ID.trim() !== "";

  if (guildIdConfigured) {
    await readyClient.application.commands.set([]);
    console.log(
      "Comandos globales limpiados (solo se usarán los del servidor en GUILD_ID).",
    );

    try {
      const guild = await readyClient.guilds.fetch(GUILD_ID.trim());
      await guild.commands.set(slashCommands);
      console.log(
        `Slash commands sincronizados (guild, instantáneo): ${guild.name} (${GUILD_ID.trim()})`,
      );
    } catch (err) {
      console.error(
        `[GUILD_ID] No se pudo registrar comandos en el servidor ${GUILD_ID}:`,
        err,
      );
    }
  } else {
    const guilds = await readyClient.guilds.fetch();
    for (const [guildId] of guilds) {
      try {
        const guild = await readyClient.guilds.fetch(guildId);
        await guild.commands.set([]);
      } catch (err) {
        console.error(
          `[global-sync] No se pudo limpiar comandos de guild ${guildId}:`,
          err,
        );
      }
    }

    await readyClient.application.commands.set(slashCommands);
    console.log(
      "Slash commands registrados globalmente (pueden tardar hasta ~1 h en aparecer). " +
        "Para actualización instantánea, define `GUILD_ID` en `index.js`.",
    );
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commandByName.get(interaction.commandName);
    if (command?.autocomplete) await command.autocomplete(interaction);
    return;
  }

  if (await handleAllyInteraction(interaction)) return;

  if (await handleAutorolInteraction(interaction)) return;

  if (await handleTicketInteraction(interaction)) return;

  if (!interaction.isChatInputCommand()) return;

  const command = commandByName.get(interaction.commandName);
  if (command?.execute) await command.execute(interaction);
});

client.login(token);
