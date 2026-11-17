// Carga inicial del Google Sheet desde la app publicada (una sola vez):
//   https://<tu-app>.vercel.app/api/setup?secret=<CRON_SECRET>
// Verifica además el acceso a la carpeta de videos de Drive.
import { json, manejar, error } from './_lib/http.js';
import { prepararSheet } from './_lib/seed.js';
import { credentials } from './_lib/sheets.js';
import { google } from 'googleapis';

export default manejar(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.query.secret !== secret) throw error(401, 'Falta ?secret= con el valor de CRON_SECRET');
  const sheet = await prepararSheet();

  let drive;
  try {
    const { client_email, private_key } = credentials();
    const auth = new google.auth.JWT({ email: client_email, key: private_key, scopes: ['https://www.googleapis.com/auth/drive'] });
    const r = await google.drive({ version: 'v3', auth }).files.get({ fileId: process.env.DRIVE_FOLDER_ID, fields: 'id,name,driveId,capabilities(canAddChildren)', supportsAllDrives: true });
    drive = r.data.capabilities?.canAddChildren
      ? `OK: carpeta "${r.data.name}"${r.data.driveId ? ' en unidad compartida' : ' (OJO: no está en una unidad compartida)'}`
      : `La cuenta de servicio ve la carpeta "${r.data.name}" pero no puede subir archivos`;
  } catch (e) {
    drive = `Error con DRIVE_FOLDER_ID: ${e.message}`;
  }
  json(res, 200, { sheet, drive, cuenta_de_servicio: credentials().client_email });
});
