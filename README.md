# Carestino BI · Auditoría Autogestionada (prototipo)

Formularios sorpresa que completa el encargado de cada tienda desde la tablet, con tomas de video en vivo
evaluadas por IA, y un panel para seguir puntajes, reenviar formularios y revisar respuestas.

- **Frontend:** React + Vite + Tailwind (design system Carestino BI) · `src/`
- **Backend:** funciones serverless de Vercel · `api/`
- **Base de datos:** Google Sheets (una pestaña por tabla) · `api/_lib/sheets.js`
- **Videos:** Google Drive, en una carpeta de una unidad compartida (la tablet sube en partes de 2,5 MB vía `/api/upload`)
- **IA:** Gemini, que analiza el video completo (imagen + audio del código) · `api/_lib/gemini.js`
- **Avisos:** pantalla fija en la tablet de cada tienda (`/t/<clave>`) que suena cuando llega un formulario. El bot de Slack (`api/_lib/slack.js`) queda listo para la etapa 2: sin `SLACK_BOT_TOKEN` no manda nada.
- **Lógica compartida y testeada:** puntaje, sorteo de tomas, franjas y zonas horarias · `shared/`

## Probar sin configurar nada (modo demo)

```bash
npm install
npm run dev:demo
```

Abre el panel con datos de ejemplo (30 tiendas, 7 semanas). La pantalla de la tablet está en `/#/t/demo`.

## Estructura

```
api/
  admin.js        GET dataset del panel · POST reenviar, no_realizado, revisar, cruce, programar_ahora
  form.js         GET abrir (token de un solo uso) · GET ?tienda=<clave> (pantalla de espera) · POST toma, terminar, cancelar
  upload.js       subida del video a Google Drive en partes (sesión reanudable)
  cron.js         tarea programada cada 5 min: programa, envía, recuerda, vence y cierra
  _lib/           sheets, drive, auth (Google), slack, gemini, servicio (reglas de negocio)
shared/
  catalog.js      tomas, configuración por defecto, usuarios, estructura del Sheet
  catalog-data.js 74 preguntas con módulo, impacto, toma y texto de incidencia; 30 tiendas
  logic.js        puntaje, sorteo de tomas y productos, programación por franja y zona horaria
src/
  pages/          Resumen, Formularios, Reenvíos, Revisión, Programación, Tiendas, Preguntas, Tablet, Espera
  components/     Shell (sidebar + header), UI kit, detalle de formulario
scripts/
  seed-sheet.mjs       crea las pestañas y carga el catálogo inicial en el Sheet
  apps-script-cron.gs  disparador cada 5 minutos desde Apps Script
tests/                 node --test (lógica + servicio con Sheet en memoria)
```

## Cómo funciona

1. **Programación** (`/api/cron`, cada 5 min): cada lunes sortea para cada tienda un día hábil y un minuto dentro
   de las franjas 10–11 o 14–15 (hora local), dejando 25 min para que todo entre en la franja. No repite el día
   de la semana anterior ni manda dos con menos de 2 días. Una vez por mes programa el relevamiento mensual.
2. **Envío:** a la hora sorteada recién se eligen las tomas (T3 casi siempre; el resto ponderado por las fallas de la
   tienda), los productos de T3, el código de 4 dígitos y el token. La pantalla de espera de la tablet lo detecta
   (consulta cada 60 s), suena y muestra "Empezar ahora". En la etapa 2 se suma el aviso por Slack.
3. **Tablet:** 15 min para abrir (recordatorio a los 10), 10 min para completar. Solo cámara en vivo, sin galería.
   Cada video empieza con el código dicho en voz alta. Un intento de regrabación por toma.
4. **IA:** cada toma se manda a Gemini con sus preguntas. Respuestas con confianza < 70 o con código no escuchado
   quedan "pendientes" y no suman hasta que alguien las revisa.
5. **Cancelar:** si entra un cliente, el encargado cancela. Un responsable decide desde **Reenvíos** si reenvía
   (ahora o en la próxima franja), siempre con otras tomas y productos. Máximo 2 reenvíos; si nadie lo reenvía en
   72 h queda *No realizado*.
6. **Cruce con cámaras:** el 25% de los formularios completados aparece en **Revisión** para cotejar con la grabación.
   Si no coincide, el administrador lo anula.
7. **Puntaje:** por módulo = 1 − descuentos ÷ pesos de las preguntas evaluadas (Alto 0,6 · Medio 0,3 · Bajo 0,1;
   Regular y Mala descuentan). Total = promedio de módulos. El mensual acumula todos los formularios del mes.

## Puesta en marcha

### 1. Proyecto de Google Cloud y cuenta de servicio
1. Entrá a https://console.cloud.google.com, creá un proyecto (ej. `carestino-auditoria`).
2. *APIs y servicios → Biblioteca*: habilitá **Google Sheets API** y **Google Drive API**.
3. *IAM y administración → Cuentas de servicio → Crear cuenta de servicio* (ej. `auditoria-app`). No hace falta darle roles.
4. Entrá a la cuenta creada → *Claves → Agregar clave → JSON*. Se descarga un archivo: ese contenido va en
   `GOOGLE_SERVICE_ACCOUNT_JSON`. Anotá el email de la cuenta (termina en `iam.gserviceaccount.com`).

### 2. Google Sheet
1. Compartí el Sheet con el email de la cuenta de servicio como **Editor**.
2. Cargá la estructura y el catálogo. Lo más simple, con la app ya publicada en Vercel: abrí una vez
   `https://<tu-app>.vercel.app/api/setup?secret=<CRON_SECRET>` (también verifica el acceso a la carpeta de Drive).
   O desde tu computadora:
   ```bash
   SHEET_ID=1iPrFot9cloWPBidueNQdu3NKd1cH3PMSS0lWMHBM3q8 GOOGLE_SERVICE_ACCOUNT_JSON="$(cat clave.json)" npm run seed
   ```
   Crea las pestañas Config, Tiendas, Preguntas, Tomas, Formularios, Evidencias, Respuestas y Usuarios, y le genera a
   cada tienda una `clave` para el link de su tablet.

### 3. Carpeta de videos en Google Drive
La cuenta de servicio no tiene espacio propio, así que los videos tienen que ir a una **unidad compartida**:
1. En Drive → *Unidades compartidas → Nueva* (ej. `Auditoría autogestionada`). Adentro, creá una carpeta `Videos`.
2. *Administrar miembros* de la unidad: agregá el email de la cuenta de servicio como **Administrador de contenido**.
   Sumá también a quienes revisan (para poder abrir los videos desde el panel).
3. Abrí la carpeta `Videos` y copiá su ID de la URL (`drive.google.com/drive/folders/<ID>`) en `DRIVE_FOLDER_ID`.

### 4. ID de cliente de Google (ingreso al panel)
1. En el mismo proyecto: *APIs y servicios → Pantalla de consentimiento de OAuth*. Tipo de usuario **Interno** si
   todos los usuarios son del mismo Google Workspace; si no, **Externo** y agregalos como usuarios de prueba.
   Completá nombre de la app y email de soporte; no hace falta agregar permisos (scopes).
2. *APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth*.
3. Tipo de aplicación: **Aplicación web**. Nombre: `Panel auditoría`.
4. *Orígenes de JavaScript autorizados*: la URL de Vercel (ej. `https://auditoria-carestino.vercel.app`) y
   `http://localhost:5173`. No hace falta cargar URIs de redireccionamiento.
5. Crear. Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`) en `GOOGLE_CLIENT_ID` y
   `VITE_GOOGLE_CLIENT_ID`. El secreto del cliente no se usa.

### 5. Gemini
Generá una API key en https://aistudio.google.com/apikey y cargala en `GEMINI_API_KEY`.

### 6. GitHub + Vercel
1. Subí el repo a GitHub e importalo en Vercel (framework: Vite).
2. Cargá las variables de `.env.example`.
3. Deploy. Si la URL final cambia, agregala en los orígenes autorizados del ID de cliente.

### 7. Tarea programada cada 5 minutos
En el plan Hobby de Vercel los crons son diarios, así que se dispara desde Apps Script:
pegá `scripts/apps-script-cron.gs`, cargá `APP_URL` y `CRON_SECRET` en las propiedades del script y ejecutá
`crearDisparador()` una vez. (Con Vercel Pro se puede usar `crons` en `vercel.json` con `*/5 * * * *`.)

### 8. Tablets y prueba
1. En el panel → **Tiendas** → *Copiar link* de cada tienda y abrilo una vez en su tablet. Conviene dejarla en esa
   pantalla (y agregarla a la pantalla de inicio). Ahí aparece cada formulario nuevo.
2. **Programación** → *Enviar formulario de prueba* (solo administrador) manda uno en el momento y muestra su link.

### Etapa 2: Slack
Crear una app en api.slack.com con scope de bot `chat:write`, instalarla, invitar el bot a los canales y cargar
`SLACK_BOT_TOKEN`, `SLACK_AUDIT_CHANNEL` y el ID de canal de cada tienda en la columna `slack_channel`.

## Tests

```bash
npm test
```

## Pendientes conocidos del prototipo
- Penalidad de un formulario *No realizado*: hoy queda registrado pero no descuenta puntaje.
- Volcado al Sheet de auditoría actual (formato ancho de `audit_retail_v2_base`): las respuestas quedan en formato
  largo en la pestaña Respuestas; falta el script de integración.
- Google Sheets no maneja bien escrituras simultáneas; para el volumen de 30 tiendas alcanza, pero la plataforma
  central conviene montarla sobre una base de datos.
- Los videos se ven desde el panel con el link de Drive: hace falta ser miembro de la unidad compartida.
- La sesión de Google dura 1 hora; después pide ingresar de nuevo.
