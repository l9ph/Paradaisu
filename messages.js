export const BOT_MESSAGES = {
  common: {
    serverOnly: "Este comando solo se puede usar en un servidor.",
    serverOnlyShort: "Este comando solo funciona en servidores.",
    serverOnlyForm: "Este formulario solo funciona en un servidor.",
    onlyInThisGuildChannel: "Elige un canal de texto de **este** servidor.",
    channelMustBeTextOrNews: "El canal tiene que ser de texto o anuncios.",
    onlyWorksInGuild: "Esto solo funciona dentro de un servidor.",
  },

  moderation: {
    cannotTargetSelfOrBotBan: "No puedes banearte a ti mismo ni al bot.",
    cannotTargetSelfOrBotKick: "No puedes expulsarte a ti mismo ni al bot.",
    cannotTargetSelfOrBotMute: "No puedes mutearte a ti mismo ni al bot.",
    memberNotFound: "No encontré al usuario dentro de este servidor.",
    invalidDuration: "Duración inválida.",
    textChannelOnly: "Este comando solo funciona en canales de texto.",
    banOk: (targetTag, reason) => `${targetTag} fue baneado. Razón: ${reason}`,
    kickOk: (targetTag, reason) => `${targetTag} fue expulsado. Razón: ${reason}`,
    muteOk: (targetTag, durationLabel, reason) =>
      `${targetTag} muteado por ${durationLabel}. Razón: ${reason}`,
    clearOk: (count, channel) => `**${count}** mensajes eliminados en ${channel}`,
  },

  anuncio: {
    channelInvalid: "Usa este comando en un canal de texto o anuncios.",
    emptyMessage: "El mensaje no puede estar vacío.",
    missingBotPerms:
      "No tengo permiso para ver el canal, enviar mensajes o insertar embeds aquí.",
    sent: "Anuncio publicado.",
    sendError: "No se pudo enviar el anuncio. Revisa permisos del bot y del canal.",
    title: "Anuncio Paradaisu",
    footer: "Paradaisu",
  },

  music: {
    queryRequired: "Escribe un nombre o URL.",
    mustBeInVoice: "Debes estar en un canal de voz para usar /play.",
    noResults: "No encontré resultados para esa búsqueda.",
    pickTrack: "Selecciona qué canción quieres reproducir:",
    searchError: "No pude buscar canciones en este momento.",
    nothingPlaying: "No hay música reproduciéndose.",
    skipped: "Canción saltada.",
    noActiveMusic: "No hay música activa.",
    stopped: "Música detenida y cola limpiada.",
    notConnected: "No estoy conectado a ningún canal de voz.",
    leftVoice: "Salí del canal de voz.",
    pickerExpired: "Este selector ya expiró. Usa /play otra vez.",
    pickerOtherGuild: "Este selector no corresponde a este servidor.",
    pickerOnlyAuthor: "Solo quien ejecutó /play puede usar este selector.",
    pickerInvalid: "Selección inválida. Usa /play de nuevo.",
    mustJoinSameVoice:
      "Ya estoy reproduciendo en otro canal de voz. Entra a ese canal o usa /leave.",
    cannotJoinVoice: "No pude conectarme al canal de voz.",
    playNow: (title) => `Reproduciendo ahora: **${title}**`,
    queued: (title) => `Añadido a la cola: **${title}**`,
  },

  boss: {
    invalidBoss: "Boss inválido.",
    finishOnlyHost: "Solo la persona que hosteó puede terminar el host.",
  },

  ticket: {
    created: (channel) => `Ticket creado. Tu canal: ${channel}`,
    panelSent: (channel) => `Prueba publicada en ${channel}.`,
    deletedByAdmin: "Canal eliminado por administración.",
    reviewedPvp: (creatorId) =>
      `<@${creatorId}> tu ticket fue leído, ahora podrás ponerte de acuerdo con un Hoster.`,
    reviewedDefault: (creatorId) =>
      `<@${creatorId}> tu ticket fue leído. Espera respuesta.`,
  },

  verify: {
    // Se deja por compatibilidad/centralización futura.
  },

  ally: {
    panelUpdated: "Panel de allies creado/actualizado en este canal.",
    panelUpdateError: "No pude crear/actualizar el panel de allies.",
    noAlliesToRemove: "No hay allies registrados para eliminar.",
    noAlliesToEdit: "No hay allies registrados para editar.",
    loadListError: "No pude cargar la lista de allies.",
    loadEditListError: "No pude cargar la lista de allies para editar.",
    missingMongoSave: "Falta `MONGODB_URI` para guardar allies.",
    missingMongoDelete: "Falta `MONGODB_URI` para eliminar allies.",
    missingMongoEdit: "Falta `MONGODB_URI` para editar allies.",
    guildNameRequired: "Nombre guild es obligatorio.",
    saveError: "No pude guardar el ally en MongoDB.",
    invalidIdsToDelete: "No se recibieron IDs válidos para eliminar.",
    deleteError: "No pude eliminar los allies en MongoDB.",
    invalidIdToEdit: "ID de ally inválido para editar.",
    allyNotFoundRetry: "No encontré ese ally. Prueba de nuevo.",
    openEditFormError: "No pude abrir el formulario de edición.",
    allyNotFoundToEdit: "No encontré ese ally para editar.",
    editSaveError: "No pude guardar la edición del ally.",
  },

  autorol: {
    roleMissingConfig:
      "La opción que elegiste aún no tiene rol configurado en el bot. Avísale a un administrador.",
    noConfiguredRoles: "No hay roles configurados para esa selección.",
    roleDoesNotExist: (label) =>
      `El rol configurado para **${label}** no existe en el servidor.`,
    roleHierarchyError:
      "No puedo asignar ese rol: está por encima de mi rol más alto. Mueve el rol del bot arriba.",
    assignError:
      "No pude asignar el rol. Comprueba que el bot tenga **Gestionar roles** y que su rol esté por encima de los roles a asignar.",
    targetChannelPermsError:
      "No tengo permiso para **ver**, **enviar mensajes** e **insertar enlaces** en ese canal.",
    panelSent: (target) => `Panel enviado a ${target}.`,
    removedAndAssigned: (removed, assigned) =>
      `Te quité **${removed}** y te asigné **${assigned}**.`,
    assignedColor: (label) => `Listo: te asigné el color **${label}**.`,
    bossesUpdated: (labels) => `Listo: roles de boss actualizados (**${labels}**).`,
    extraUpdated: (labels) => `Listo: roles Extra actualizados (**${labels}**).`,
    missingSomeRoles: (labels) =>
      `\n*(Algunas opciones elegidas aún no tienen rol: ${labels})*`,
  },
};

