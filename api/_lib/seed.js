// Prepara el Google Sheet: crea las pestañas con encabezados y carga el catálogo inicial.
// No pisa pestañas que ya tengan datos. Lo usan /api/setup y scripts/seed-sheet.mjs.
import { sheetsClient } from './sheets.js';
import { SHEET_SCHEMA, PREGUNTAS, TIENDAS, TOMAS, USUARIOS, CONFIG_DEFAULT } from '../../shared/catalog.js';
import { randomToken } from '../../shared/logic.js';

export async function prepararSheet() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('Falta SHEET_ID');
  const sheets = sheetsClient();
  const log = [];

  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const existentes = new Set(meta.data.sheets.map((s) => s.properties.title));
  const faltan = Object.keys(SHEET_SCHEMA).filter((t) => !existentes.has(t));
  if (faltan.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: faltan.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) },
    });
    log.push(`Pestañas creadas: ${faltan.join(', ')}`);
  }

  const semillas = {
    Config: Object.entries(CONFIG_DEFAULT).map(([clave, valor]) => ({ clave, valor })),
    // Cada tienda recibe una clave para el link fijo de su tablet (/t/<clave>).
    Tiendas: TIENDAS.map((t) => ({ ...t, clave: randomToken(16) })),
    Preguntas: PREGUNTAS,
    Tomas: TOMAS,
    Usuarios: USUARIOS,
  };

  for (const [tabla, headers] of Object.entries(SHEET_SCHEMA)) {
    const actual = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tabla}!A1:A3` });
    if ((actual.data.values?.length || 0) > 1) { log.push(`${tabla}: ya tenía datos, no se tocó`); continue; }
    const datos = (semillas[tabla] || []).map((o) => headers.map((h) => o[h] ?? ''));
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${tabla}!A1`, valueInputOption: 'RAW',
      requestBody: { values: [headers, ...datos] },
    });
    log.push(`${tabla}: encabezados${datos.length ? ` + ${datos.length} filas` : ''}`);
  }
  return log;
}
