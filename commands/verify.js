import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { BOT_MESSAGES } from "../messages.js";

const VERIFY_ROLE_IDS = {
  ally: [
    "1450312932184424539",
    "1455724641174814803",
    "1455726823093571779",
    "1239313717452214372",
  ],
  allyleader: [
    "1450312932184424539",
    "1455724641174814803",
    "1455726823093571779",
    "1239706274006958132",
  ],
  paradaisu: [
    "1450312932184424539",
    "1455724641174814803",
    "1455726823093571779",
    "1457017254804717723",
  ],
};

const verifyVariantLabels = {
  ally: "Ally",
  allyleader: "Ally Leader",
  paradaisu: "Miembro de Paradaisu",
};

function roleIdsForTipo(tipo) {
  const raw = VERIFY_ROLE_IDS[tipo];
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id).trim()).filter(Boolean);
}

function canViewChannel(member, channel) {
  if (!channel?.permissionsFor) return true;
  return channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel);
}

function verifyStaffMessage(target, tipo, sobre) {
  if (tipo === "denegado") {
    const rechazoLabel = verifyVariantLabels[sobre];
    return (
      `**Verificación**\n` +
      `Se rechazó la petición de **${target.tag}**.\n` +
      `• Tipo: Denegado\n` +
      `• Petición: ${rechazoLabel}\n` +
      `— Paradaisu`
    );
  }

  const label = verifyVariantLabels[tipo];
  return (
    `**Verificación**\n` +
    `Se verificó a **${target.tag}**.\n` +
    `• Tipo: ${label}\n` +
    `— Paradaisu`
  );
}

function verifyDmMessage(tipo, sobre) {
  if (tipo === "denegado") {
    const rechazoLabel = verifyVariantLabels[sobre];
    return `Tu petición como **${rechazoLabel}** fue rechazada.\n— Paradaisu`;
  }

  const label = verifyVariantLabels[tipo];
  return `Has sido verificado en **Paradaisu**, ahora eres **${label}**.\n— Paradaisu`;
}

export const verifyCommand = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verifica a un usuario con un tipo concreto")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) =>
      option
        .setName("usuario")
        .setDescription("Usuario a verificar")
        .setAutocomplete(true)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("tipo")
        .setDescription("Variante de verificación")
        .setRequired(true)
        .addChoices(
          { name: "Ally", value: "ally" },
          { name: "Ally Leader", value: "allyleader" },
          { name: "Paradaisu", value: "paradaisu" },
          { name: "Denegado", value: "denegado" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("sobre")
        .setDescription(
          "Obligatorio si tipo es Denegado: que peticion se rechaza",
        )
        .setRequired(false)
        .addChoices(
          { name: "Ally", value: "ally" },
          { name: "Ally Leader", value: "allyleader" },
          { name: "Paradaisu", value: "paradaisu" },
        ),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase().trim();
    if (!interaction.inGuild()) {
      await interaction.respond([]);
      return;
    }

    let members;
    try {
      if (focused.length > 0) {
        members = await interaction.guild.members.search({
          query: focused,
          limit: 25,
        });
      } else {
        members = await interaction.guild.members.fetch({ limit: 100 });
      }
    } catch {
      await interaction.respond([]);
      return;
    }

    const choices = [...members.values()]
      .filter((member) => canViewChannel(member, interaction.channel))
      .slice(0, 25)
      .map((member) => ({
        name: member.displayName,
        value: member.id,
      }));

    await interaction.respond(choices);
  },

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: BOT_MESSAGES.common.serverOnly,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetId = interaction.options.getString("usuario", true);
    const tipo = interaction.options.getString("tipo", true);
    const sobre = interaction.options.getString("sobre");

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let target;
      try {
        target = await interaction.client.users.fetch(targetId);
      } catch {
        await interaction.editReply({
          content:
            "No encontré al usuario seleccionado. Vuelve a escribir `/verify` y elígelo desde el autocompletado.",
        });
        return;
      }

      if (tipo === "denegado" && !sobre) {
        await interaction.editReply({
          content:
            "Si el tipo es **Denegado**, debes elegir **sobre** (Ally, Ally Leader o Paradaisu): es la petición que se rechaza.",
        });
        return;
      }

      const roleIds = roleIdsForTipo(tipo);
      if (roleIds.length > 0) {
        try {
          const member = await interaction.guild.members.fetch({ user: targetId });
          await member.roles.add(roleIds);
        } catch (err) {
          console.error("[verify] No se pudo asignar roles:", err);
          await interaction.editReply({
            content:
              "No pude asignar los roles. Revisa `VERIFY_ROLE_IDS` en `commands/verify.js`, que el bot tenga **Gestionar roles**, que su rol esté **por encima** de los roles a dar y que **Server Members Intent** esté activo en el portal del bot.",
          });
          return;
        }
      }

      let dmFailed = false;
      try {
        const dmRecipient = await interaction.client.users.fetch(target.id);
        await dmRecipient.send({
          content: verifyDmMessage(tipo, sobre),
        });
      } catch (err) {
        console.error("[verify] No se pudo enviar DM al usuario:", err);
        dmFailed = true;
      }

      let content = verifyStaffMessage(target, tipo, sobre);
      if (dmFailed) {
        content += `\n\nNo pude enviar DM a **${target.tag}**. En Discord: Ajustes de usuario → Privacidad y seguridad → activa **Permitir mensajes directos de los miembros del servidor** para **${interaction.guild.name}** (o abre tú el MD con el bot).`;
      }

      await interaction.editReply({ content });
    } catch (err) {
      console.error("[verify] Error inesperado:", err);
      const msg = "Ocurrio un error inesperado al ejecutar el comando. Revisa la consola del bot.";
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: msg });
        } else {
          await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
      } catch {
      }
    }
  },
};
