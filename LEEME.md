# AulaMeet

Videollamadas desde el navegador: salas con enlace, compartir pantalla, anfitrión,
filtros de fondo, chat, levantar la mano y reacciones. Se instala como aplicación
(PWA) y puede compilarse como APK con GitHub.

## Cómo está hecho

| Parte | Tecnología | Dónde vive |
|---|---|---|
| Aplicación | React + Vite (PWA) | GitHub Pages |
| Video y audio | LiveKit (WebRTC) | LiveKit Cloud |
| Pases de entrada y controles de anfitrión | 2 funciones (`sala`, `moderar`) | Supabase Edge Functions |

No usa base de datos. Las llaves de LiveKit solo están en Supabase, nunca en el navegador.

## Puesta en marcha

### 1. LiveKit Cloud
1. Crea una cuenta en https://cloud.livekit.io y un proyecto.
2. En **Settings → Keys** copia la **URL** (`wss://...livekit.cloud`), la **API Key** y el **API Secret**.

### 2. Supabase
1. Crea un proyecto (o usa uno que tengas). Anota su **Project ID** (Settings → General).
2. En **Edge Functions → Secrets** agrega:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
3. Crea un token de acceso en https://supabase.com/dashboard/account/tokens (lo usa GitHub para subir las funciones).

### 3. GitHub
1. Crea un repositorio y sube esta carpeta a la rama `main`.
2. En **Settings → Secrets and variables → Actions**:
   - Secreto `SUPABASE_ACCESS_TOKEN`: el token del paso anterior.
   - Variable `SUPABASE_PROJECT_ID`: el Project ID.
   - Variable `VITE_API_URL`: `https://TU-PROJECT-ID.supabase.co/functions/v1`
3. En **Settings → Pages**, en *Source* elige **GitHub Actions**.
4. En la pestaña **Actions** ejecuta **Publicar funciones** y luego **Publicar web**.
   Después se ejecutan solas con cada cambio.

La aplicación queda en `https://TU-USUARIO.github.io/TU-REPOSITORIO/`.
En el celular, Chrome ofrece "Instalar aplicación" desde el menú.

### 4. APK (opcional)
En **Actions → Compilar APK → Run workflow**. La APK aparece al final de la ejecución,
en *Artifacts*. Si creas una etiqueta `v1.0.0`, además se adjunta a un Release para
descargarla desde el navegador del teléfono.

Sin llave de firma se genera una APK de prueba. Para publicar actualizaciones que se
instalen sobre la versión anterior, crea una llave una sola vez y guárdala bien:

```
keytool -genkeypair -v -keystore firma.jks -alias aulameet -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 firma.jks
```

y agrega los secretos `ANDROID_KEYSTORE_BASE64` (el texto que imprime el segundo comando),
`ANDROID_KEYSTORE_PASSWORD` y `ANDROID_KEY_ALIAS` (`aulameet`). Si pierdes la llave,
los usuarios tendrán que desinstalar para actualizar.

## Probar en tu computadora

```
npm install
cp .env.example .env      # y escribe tu VITE_API_URL
npm run dev
```

## Cómo funciona el anfitrión

- Quien crea la reunión recibe una clave que se guarda en ese navegador; con ella entra
  como anfitrión. El enlace de invitación no la incluye.
- El anfitrión puede silenciar, sacar participantes, nombrar a otros anfitriones,
  bloquear la entrada y terminar la reunión.
- Si el anfitrión abre la reunión desde otro dispositivo, entra como participante.
  (Las cuentas de usuario llegarán con la plataforma escolar.)
- Una sala vacía se cierra a los 10 minutos; el anfitrión puede reabrirla con el mismo enlace.

## Ajustes rápidos

- Nombre y colores: `vite.config.ts`, `index.html`, `src/estilos.css`.
- Máximo de participantes y tiempo de cierre: `supabase/functions/sala/index.ts`.
- Calidad de video: `src/Reunion.tsx` (`opcionesSala`).
- Identificador de la app Android: `capacitor.config.json`.
