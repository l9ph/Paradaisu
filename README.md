# Paradaisu — bot de Discord

Bot en Node.js con el comando slash **`/verify`** para asignar roles (Ally, Ally Leader, Paradaisu), notificar al usuario por MD y responder solo al staff de forma efímera.

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- Una aplicación de bot en el [Portal de desarrolladores de Discord](https://discord.com/developers/applications)

## Instalación

```bash
git clone <tu-repo>.git
cd Paradaisu
npm install
```

Copia el ejemplo de variables y rellénalo:

```bash
copy .env.example .env
```

En Windows PowerShell puedes usar `Copy-Item .env.example .env`.

## Configuración

### `.env` (solo el token)

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DISCORD_TOKEN` | Sí | Token del bot (Bot → Reset Token). **No lo subas a Git.** |

### `index.js` (servidor y roles)

En **`index.js`** define:

- **`GUILD_ID`**: ID del servidor donde vive el bot (un solo guild). Con esto los slash commands se registran en ese servidor (casi al instante). Si lo dejas vacío `""`, los comandos se registran de forma global (puede tardar hasta ~1 h).
- **`VERIFY_ROLE_IDS`**: por cada tipo (`ally`, `allyleader`, `paradaisu`), un array con uno o más IDs de rol (strings). Ejemplo:

```js
const GUILD_ID = "123456789012345678";

const VERIFY_ROLE_IDS = {
  ally: ["111111111111111111", "222222222222222222"],
  allyleader: ["333333333333333333"],
  paradaisu: ["444444444444444444"],
};
```

## Discord: permisos e intents

En el portal del bot:

1. **Bot** → activa **Intent de miembros del servidor** (*Server Members Intent*) si vas a asignar roles.
2. Invita el bot con permisos de **Gestionar roles** (y que su rol quede por encima de los roles que debe asignar).
3. En OAuth2, incluye los scopes `bot` y `applications.commands`.

## Ejecución

```bash
npm start
```

## Subir el código a GitHub

1. Crea un repositorio vacío en GitHub (sin `.gitignore` ni README si quieres usar solo los de este proyecto).
2. En la carpeta **`Paradaisu`** (no en la carpeta de usuario entera), ejecuta:

   ```bash
   git init
   git add .
   git commit -m "Bot Paradaisu: /verify y configuración"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```

3. Comprueba en GitHub que **no** aparezca `.env` ni `node_modules/`.

## Seguridad

- El archivo **`.env` está en `.gitignore`**: no lo subas.
- Si alguna vez subiste un token, **regenera el token** en el portal y actualiza `.env`.

## Licencia

Uso interno / según indiques en el repositorio.
