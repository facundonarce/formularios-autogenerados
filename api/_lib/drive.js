// Videos en Google Drive. La cuenta de servicio no tiene espacio propio, así que los archivos
// van a una carpeta dentro de una UNIDAD COMPARTIDA donde la cuenta de servicio es "Administrador de contenido".
//
// La tablet manda el video en partes (de a 2,5 MB, por el límite de 4,5 MB por request de Vercel)
// y esta función las reenvía a una sesión de subida reanudable de Drive.
import { google } from 'googleapis';
import crypto from 'node:crypto';
import { credentials } from './sheets.js';
import { error } from './http.js';

let _auth;
function auth() {
  if (_auth) return _auth;
  const { client_email, private_key } = credentials();
  _auth = new google.auth.JWT({ email: client_email, key: private_key, scopes: ['https://www.googleapis.com/auth/drive'] });
  return _auth;
}
async function bearer() {
  const { token } = await auth().getAccessToken();
  return `Bearer ${token}`;
}

export const PARTE_BYTES = 10 * 256 * 1024; // 2,5 MB (Drive pide múltiplos de 256 KB)

export async function iniciarSubida({ nombre, mime, size }) {
  const carpeta = process.env.DRIVE_FOLDER_ID;
  if (!carpeta) throw new Error('Falta DRIVE_FOLDER_ID');
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: await bearer(),
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify({ name: nombre, parents: [carpeta], mimeType: mime }),
  });
  const sesion = r.headers.get('location');
  if (!r.ok || !sesion) throw new Error(`Drive: no se pudo iniciar la subida (${r.status} ${await r.text()})`);
  return sesion;
}

/** Sube una parte. Devuelve { completo: false } o { completo: true, id, webViewLink }. */
export async function subirParte({ sesion, bytes, inicio, total }) {
  const fin = inicio + bytes.byteLength - 1;
  const r = await fetch(sesion, {
    method: 'PUT',
    redirect: 'manual',
    headers: { 'Content-Length': String(bytes.byteLength), 'Content-Range': `bytes ${inicio}-${fin}/${total}` },
    body: bytes,
  });
  if (r.status === 308) return { completo: false };
  if (r.status === 200 || r.status === 201) {
    const f = await r.json();
    return { completo: true, id: f.id, webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` };
  }
  throw new Error(`Drive: falló la subida de una parte (${r.status} ${await r.text()})`);
}

export async function descargar(id) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: await bearer() } });
  if (!r.ok) throw new Error(`Drive: no se pudo leer el video (${r.status})`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), mime: (r.headers.get('content-type') || 'video/webm').split(';')[0] };
}

/* La sesión de subida viaja firmada a la tablet para no releer el Sheet en cada parte. */
const SECRETO = () => process.env.APP_SECRET || process.env.CRON_SECRET || 'cambiar-este-secreto';

export function firmar(datos) {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  const firma = crypto.createHmac('sha256', SECRETO()).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function verificar(ticket) {
  const [cuerpo, firma] = String(ticket || '').split('.');
  const esperada = crypto.createHmac('sha256', SECRETO()).update(cuerpo || '').digest('base64url');
  if (!firma || firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) throw error(401, 'Subida no autorizada');
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  if (Date.now() > datos.exp) throw error(410, 'La subida venció');
  return datos;
}
