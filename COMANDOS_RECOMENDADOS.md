# Comandos recomendados para Martyrium

Recomendaciones para ampliar el bot según lo que ya tienes: **verify**, **ticket**, **autorol**, **anuncio**, **gank**, **boss**, **ally**, **tts**, **ban/kick/mute/clear**. Pensado para un servidor de guild / MMO con voz, allies y moderación. **126 ideas** en total (48 solo de diversión y comunidad).

**Leyenda de prioridad**
- **Alta** — encaja directo con tu uso actual y poco mantenimiento
- **Media** — muy útil pero requiere más trabajo o permisos
- **Baja** — divertido o opcional; hazlo si sobra tiempo

---

## Guerra, gank y mundo (12)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 1 | `/war announce` | Publicar guerra con servidor, hora y rol de ping (similar a gank pero plantilla fija) | Alta |
| 2 | `/war cancel` | Anular el último anuncio de guerra del canal | Media |
| 3 | `/gank edit` | Editar un gank reciente (mensaje + embed) sin rehacer todo | Media |
| 4 | `/gank list` | Listar ganks recientes del servidor (paginado) | Baja |
| 5 | `/boss timer` | Temporizador de respawn de boss con aviso en canal | Alta |
| 6 | `/boss next` | Ver próximos bosses programados por el staff | Media |
| 7 | `/scout` | Reporte rápido: zona, enemigos vistos, foto opcional | Alta |
| 8 | `/rally` | Convocatoria “reunión en X canal de voz” con botón unirse | Media |
| 9 | `/presence` | Quién está en voz / quién falta para un evento (lista efímera) | Media |
| 10 | `/server status` | Estado del servidor de juego (online/offline/mantenimiento) manual o API | Media |
| 11 | `/territory` | Mapa o lista de territorios controlados (embed editable por staff) | Baja |
| 12 | `/killfeed` | Registrar kill importante (víctima, asesino, servidor) en canal de feeds | Baja |

---

## Allies y diplomacia (6)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 13 | `/ally note` | Nota interna sobre un ally (solo staff, MongoDB) | Media |
| 14 | `/ally search` | Buscar ally por nombre parcial | Media |
| 15 | `/ally pact` | Marcar ally como “pacto activo / suspendido” con color en el panel | Media |
| 16 | `/diplomacy log` | Canal de log automático al add/remove/edit ally | Alta |
| 17 | `/embargo` | Lista negra de guilds (no ally) con aviso al mencionarlas | Baja |
| 18 | `/merge-request` | Formulario para solicitar merge / alianza (modal → ticket) | Baja |

---

## TTS y voz (8)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 19 | `/tts leave` | Sacar al bot de voz sin buscar el mensaje del embed | Alta |
| 20 | `/tts status` | Ver si TTS está activo, canal y quién lo inició | Media |
| 21 | `/tts volume` | Volumen por usuario (MongoDB) | Media |
| 22 | `/tts speed` | Velocidad de lectura por usuario | Media |
| 23 | `/tts skip` | Saltar el audio que está sonando ahora | Media |
| 24 | `/tts mute-user` | No leer mensajes de un usuario concreto en la sesión | Alta |
| 25 | `/tts lang-server` | Idioma por defecto del servidor si no tiene voz guardada | Baja |
| 26 | `/soundboard` | Clip corto predefinido en voz (requiere más trabajo) | Baja |

---

## Moderación (10)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 27 | `/warn` | Advertencia con historial en MongoDB | Alta |
| 28 | `/warnings` | Ver warns de un usuario | Alta |
| 29 | `/unwarn` | Quitar un warn por ID | Media |
| 30 | `/timeout` | Alias claro de mute con duraciones preset | Media |
| 31 | `/unmute` | Quitar mute/timeout explícito | Alta |
| 32 | `/slowmode` | Activar slowmode en el canal actual | Media |
| 33 | `/lock` | Bloquear canal (denegar enviar mensajes @everyone) | Alta |
| 34 | `/unlock` | Desbloquear canal | Alta |
| 35 | `/nuke` | Borrar N mensajes + confirmación con botón | Media |
| 36 | `/modlog` | Enlace o resumen del caso (usuario + acciones recientes) | Media |

---

## Tickets y verify (6)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 37 | `/ticket close` | Cerrar ticket con razón y transcript | Alta |
| 38 | `/ticket add` | Añadir usuario al ticket | Alta |
| 39 | `/ticket remove` | Quitar usuario del ticket | Media |
| 40 | `/ticket claim` | Staff reclama el ticket | Media |
| 41 | `/verify history` | Historial de verificaciones de un usuario | Media |
| 42 | `/apply` | Postulación genérica (modal → canal staff) | Alta |

---

## Anuncios y embeds (5)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 43 | `/anuncio programado` | Programar anuncio para fecha/hora (cron o cola) | Media |
| 44 | `/embed` | Crear embed simple por modal (título, desc, color) | Alta |
| 45 | `/embed edit` | Editar último embed del bot en el canal | Media |
| 46 | `/poll` | Encuesta con reacciones o botones | Alta |
| 47 | `/remind` | Recordatorio “en 2h” para el usuario o el canal | Media |

---

## Roles y miembros (6)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 48 | `/rol add` | Dar rol a usuario | Alta |
| 49 | `/rol remove` | Quitar rol | Alta |
| 50 | `/rol info` | Ver roles de un miembro | Media |
| 51 | `/nick` | Cambiar apodo (con permiso) | Media |
| 52 | `/whois` | Info Discord: cuenta, join, roles, warns | Alta |
| 53 | `/avatar` | Avatar grande de un usuario | Baja |

---

## Utilidad e información (7)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 54 | `/help` | Lista de comandos por categoría (ephemeral o embed) | Alta |
| 55 | `/ping` | Latencia del bot y API | Media |
| 56 | `/uptime` | Tiempo online del bot | Baja |
| 57 | `/serverinfo` | Info del servidor Discord | Media |
| 58 | `/channelinfo` | Info del canal actual | Baja |
| 59 | `/invite` | Enlace de invitación del bot | Baja |
| 60 | `/rules` | Enviar reglas fijas (embed configurable) | Alta |

---

## Diversión y comunidad (48)

### Aleatorio y memes rápidos

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 61 | `/8ball` | Respuesta sí/no/absurda a una pregunta | Baja |
| 62 | `/dice` | Tirada `2d6`, `1d20`, etc. | Baja |
| 63 | `/coinflip` | Cara o cruz | Baja |
| 64 | `/rps` | Piedra, papel o tijera vs bot o vs usuario | Baja |
| 65 | `/random` | Número aleatorio entre min y max | Baja |
| 66 | `/choose` | Elige una opción entre varias (`a,b,c`) | Baja |
| 67 | `/rate` | “Qué tan X es…” del 0 al 10 (meme) | Baja |
| 68 | `/mock` | Texto En MiNgUnCaS (spoof, sin ping) | Baja |
| 69 | `/reverse` | Texto al revés | Baja |
| 70 | `/emojify` | Convierte texto a emojis regionales | Baja |
| 71 | `/clap` | Texto con 👏 entre 👏 palabras | Baja |
| 72 | `/f` | Pagar respetos (contador F en el canal) | Media |
| 73 | `/press x` | Botón “Press X to pay respects” | Baja |

### Social y ship

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 74 | `/ship` | Compatibilidad % entre dos usuarios + nombre ship | Media |
| 75 | `/hug` | Abrazo con GIF/imagen (usuario opcional) | Baja |
| 76 | `/pat` | Palmada en la cabeza | Baja |
| 77 | `/slap` | Bofetada meme (sin daño real) | Baja |
| 78 | `/kiss` | Beso meme | Baja |
| 79 | `/roast` | “Roast” suave aleatorio (modo SFW por defecto) | Media |
| 80 | `/compliment` | Cumplido aleatorio a un usuario | Baja |
| 81 | `/marry` | “Casarse” con otro (rol simbólico o MongoDB) | Baja |
| 82 | `/divorce` | Quitar pareja del `/marry` | Baja |
| 83 | `/rival` | Declarar rivalidad meme entre dos users | Baja |

### Frases, quotes y cultura del servidor

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 84 | `/quote add` | Guardar frase célebre del servidor | Media |
| 85 | `/quote random` | Frase aleatoria guardada | Media |
| 86 | `/quote top` | Frases más votadas | Baja |
| 87 | `/wouldyou` | “¿Qué preferirías…?” aleatorio | Baja |
| 88 | `/truth` | Verdad incómoda (SFW) | Baja |
| 89 | `/dare` | Reto suave (SFW, staff puede desactivar) | Baja |
| 90 | `/topic` | Tema de conversación aleatorio | Baja |
| 91 | `/icebreaker` | Rompehielos para voz o chat | Media |
| 92 | `/mantra` | Frase motivacional o absurda del día | Baja |

### Juegos ligeros (sin economía)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 93 | `/trivia` | Pregunta múltiple opción con puntos en MongoDB | Media |
| 94 | `/trivialeader` | Ranking de trivia del mes | Baja |
| 95 | `/hangman` | Ahorcado en el canal (letras con botones) | Media |
| 96 | `/guess` | Adivina número 1–100 con pistas | Baja |
| 97 | `/rpsladder` | Ranking de piedra/papel/tijera | Baja |
| 98 | `/bingo` | Cartón de bingo para eventos de voz | Baja |
| 99 | `/roulette` | Ruleta rusa meme (sin kick real; solo texto) | Baja |
| 100 | `/impostor` | Asigna roles en MD para mini juego entre amigos | Baja |

### Guild / inside jokes (encaja con Martyrium)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 101 | `/gankroll` | “¿Ganamos el gank?” porcentaje meme | Media |
| 102 | `/bosscall` | Frase épica aleatoria al llamar boss | Baja |
| 103 | `/allycheck` | “¿Es ally o enemigo?” respuesta aleatoria joke | Baja |
| 104 | `/skillissue` | Meme skill issue (SFW) | Baja |
| 105 | `/ratio` | “Ratio + L” meme (usar con moderación) | Baja |
| 106 | `/copium` | Frase de copium/hopium aleatoria | Baja |
| 107 | `/manifest` | “Manifestando victoria en…” | Baja |
| 108 | `/summon` | “@rol vengan a voz” con formato gracioso | Media |

### Voz, eventos y presencia

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 109 | `/birthday set` | Registrar cumpleaños | Media |
| 110 | `/birthday list` | Próximos cumpleaños del mes | Baja |
| 111 | `/voice roulette` | Elige al azar quién habla siguiente en VC | Media |
| 112 | `/hotseat` | Preguntas al azar para una persona en voz | Baja |
| 113 | `/karaoke` | Sugerir canción para karaoke (solo texto; sin música) | Baja |
| 114 | `/awards` | Nominar a alguien a un premio meme del mes | Media |
| 115 | `/voteaward` | Votar nominaciones del `/awards` | Media |

### Imagen y perfil (ligero)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 116 | `/avatar` | Avatar grande de un usuario | Baja |
| 117 | `/banner` | Banner de perfil Discord | Baja |
| 118 | `/wanted` | Póster “WANTED” con avatar | Media |
| 119 | `/jail` | Filtro meme “jailed” sobre avatar | Baja |
| 120 | `/triggered` | GIF triggered meme con avatar | Baja |

### Top 8 diversión para Martyrium

1. `/quote add` + `/quote random` — crea cultura del servidor  
2. `/ship` — engagement alto, fácil de hacer  
3. `/f` o `/press x` — ritual cuando alguien muere en juego  
4. `/gankroll` / `/bosscall` — inside jokes de tu nicho  
5. `/icebreaker` — útil antes de wars en voz  
6. `/awards` + `/voteaward` — evento mensual de comunidad  
7. `/voice roulette` — dinámica en canal de voz  
8. `/wanted` — memes visuales con avatar  

---

## Admin, logs y seguridad (6)

| # | Comando sugerido | Descripción breve | Prioridad |
|---|------------------|-------------------|-----------|
| 121 | `/config` | Ver configuración del bot en el guild | Media |
| 122 | `/setlog` | Canal de logs (mod, gank, ally, verify) | Alta |
| 123 | `/backup roles` | Exportar lista de roles (staff) | Baja |
| 124 | `/audit` | Últimos eventos de moderación del bot | Media |
| 125 | `/blacklist word` | Palabras que auto-borran o avisan | Media |
| 126 | `/maintenance` | Modo mantenimiento: solo staff usa comandos | Baja |

---

## Resumen: top 10 para implementar primero

1. `/warn` + `/warnings` — complementa ban/kick/mute  
2. `/lock` / `/unlock` — moderación de canal muy usada  
3. `/tts leave` + `/tts mute-user` — mejora TTS sin mucho código  
4. `/embed` — anuncios rápidos sin modal pesado de anuncio  
5. `/poll` — votaciones de horarios de war/gank  
6. `/whois` — staff pregunta todo el tiempo  
7. `/help` — onboarding de comandos  
8. `/setlog` — un solo sitio para logs de gank/ally/mod  
9. `/ticket close` + `/ticket add` — tickets completos  
10. `/war announce` o `/scout` — extiende tu nicho de guild  

---

## Notas técnicas

- Discord permite **100 comandos slash** por aplicación; con subcomandos cuentan como uno. Agrupa por `/mod`, `/war`, `/tts`, `/ticket`.  
- Prioriza **comandos efímeros** para errores y **embeds públicos** solo cuando haga falta (como ya haces con gank y TTS).  
- Reutiliza **MongoDB** para warns, voces TTS, allies y config de logs.  
- Evita duplicar música si el foco es TTS + guerra; el audio compite por el mismo canal de voz.  

---

*Generado como guía de producto para Martyrium. Ajusta nombres y prioridades según cómo juegue tu comunidad.*
