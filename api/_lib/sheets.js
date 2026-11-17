// Acceso al Google Sheet que funciona como base de datos.
// Cada pestaña es una tabla; la fila 1 tiene los encabezados (ver SHEET_SCHEMA).
import { google } from 'googleapis';
import { SHEET_SCHEMA } from '../../shared/catalog.js';

let _client;

export function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, '\n') };
}

export function sheetsClient() {
  if (_client) return _client;
  const { client_email, private_key } = credentials();
  const auth = new google.auth.JWT({ email: client_email, key: private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  _client = google.sheets({ version: 'v4', auth });
  return _client;
}

const SPREADSHEET_ID = () => {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('Falta SHEET_ID');
  return id;
};

function colLetter(n) {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Lee varias pestañas en una sola llamada. Devuelve { Tabla: [ {col: valor, _row: n} ] } */
export async function leerTablas(nombres) {
  let res;
  try {
    res = await sheetsClient().spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID(),
      ranges: nombres.map((n) => `${n}!A1:ZZ`),
      valueRenderOption: 'FORMATTED_VALUE',
    });
  } catch (e) {
    if (/Unable to parse range/i.test(e.message)) {
      throw new Error('El Google Sheet todavía no está preparado (faltan pestañas). Abrí /api/setup?secret=<CRON_SECRET> una vez.');
    }
    throw e;
  }
  const out = {};
  res.data.valueRanges.forEach((vr, i) => {
    const [header = [], ...rows] = vr.values || [];
    out[nombres[i]] = rows
      .map((r, idx) => {
        const o = { _row: idx + 2 };
        header.forEach((h, j) => { o[h] = r[j] ?? ''; });
        return o;
      })
      .filter((o) => Object.keys(o).some((k) => k !== '_row' && o[k] !== ''));
  });
  return out;
}

function aFila(tabla, obj) {
  return SHEET_SCHEMA[tabla].map((h) => {
    const v = obj[h];
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

export async function agregarFilas(tabla, objetos) {
  if (!objetos.length) return;
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${tabla}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: objetos.map((o) => aFila(tabla, o)) },
  });
}

/** Actualiza filas existentes (necesitan _row). Solo escribe las columnas indicadas en `cambios`. */
export async function actualizarFilas(tabla, cambios) {
  if (!cambios.length) return;
  const headers = SHEET_SCHEMA[tabla];
  const data = [];
  for (const { _row, ...campos } of cambios) {
    for (const [k, v] of Object.entries(campos)) {
      const j = headers.indexOf(k);
      if (j < 0) continue;
      data.push({ range: `${tabla}!${colLetter(j)}${_row}`, values: [[typeof v === 'object' && v !== null ? JSON.stringify(v) : v ?? '']] });
    }
  }
  if (!data.length) return;
  await sheetsClient().spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: { valueInputOption: 'RAW', data },
  });
}

export function parseJson(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

/** Config como objeto, con los valores por defecto para lo que falte. */
export function configDesde(filas, defaults) {
  const c = { ...defaults };
  for (const f of filas || []) if (f.clave) c[f.clave] = f.valor;
  return c;
}

/** Normaliza tipos de la hoja Preguntas. */
export function preguntasDesde(filas) {
  return filas.map((p) => ({ ...p, num: Number(p.num) }));
}

export function tomasDesde(filas) {
  return filas.map((t) => ({ ...t, segundos_min: Number(t.segundos_min) || 10 }));
}
