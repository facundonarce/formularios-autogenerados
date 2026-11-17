// Prueba de punta a punta del servicio con un Sheet en memoria (sin Google, Slack ni Gemini reales).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { SHEET_SCHEMA, PREGUNTAS, TIENDAS, TOMAS, USUARIOS, CONFIG_DEFAULT } from '../shared/catalog.js';

const db = {
  Config: Object.entries(CONFIG_DEFAULT).map(([clave, valor]) => ({ clave, valor: String(valor) })),
  Tiendas: TIENDAS.slice(0, 3).map((t) => ({ ...t, activa: 'SI' })),
  Preguntas: PREGUNTAS.map((p) => ({ ...p, num: String(p.num) })),
  Tomas: TOMAS.map((t) => ({ ...t, segundos_min: String(t.segundos_min), solo: t.solo || '' })),
  Formularios: [], Evidencias: [], Respuestas: [], Usuarios: USUARIOS,
};
const filas = (t) => db[t].map((o, i) => ({ ...Object.fromEntries(SHEET_SCHEMA[t].map((h) => [h, o[h] == null ? '' : typeof o[h] === 'object' ? JSON.stringify(o[h]) : String(o[h])])), _row: i + 2 }));

mock.module('../api/_lib/sheets.js', {
  namedExports: {
    leerTablas: async (n) => Object.fromEntries(n.map((t) => [t, filas(t)])),
    agregarFilas: async (t, objs) => { db[t].push(...objs.map((o) => ({ ...o }))); },
    actualizarFilas: async (t, cambios) => { for (const { _row, ...c } of cambios) Object.assign(db[t][_row - 2], c); },
    parseJson: (v, f) => { if (!v) return f; try { return JSON.parse(v); } catch { return f; } },
    configDesde: (fs, d) => { const c = { ...d }; for (const f of fs || []) c[f.clave] = f.valor; return c; },
    preguntasDesde: (fs) => fs.map((p) => ({ ...p, num: Number(p.num) })),
    tomasDesde: (fs) => fs.map((t) => ({ ...t, segundos_min: Number(t.segundos_min) })),
  },
});
mock.module('../api/_lib/gemini.js', {
  namedExports: {
    evaluarToma: async ({ preguntas, codigo }) => ({
      codigo_escuchado: codigo,
      respuestas: preguntas.map((p, i) => ({ pregunta: p.num, respuesta: p.tipo_respuesta === 'escala' ? (i === 0 ? 'Regular' : 'Buena') : 'Si', confianza: i === 1 ? 50 : 90, motivo: 'x', segundo: 3 })),
    }),
  },
});

mock.module('../api/_lib/drive.js', {
  namedExports: { descargar: async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'video/webm' }) },
});

const s = await import('../api/_lib/servicio.js');
const admin = { email: 'facundoarce@biamex.com', rol: 'admin' };
const semanal = (i) => db.Formularios.filter((f) => f.tipo === 'semanal' && !f.origen_id)[i];

test('tick programa un semanal por tienda y no duplica', async () => {
  const lunes = new Date('2026-11-16T12:00:00Z');
  await s.tick('https://x', lunes);
  assert.equal(db.Formularios.filter((f) => f.tipo === 'semanal').length, 3);
  await s.tick('https://x', new Date(lunes.getTime() + 5 * 60000));
  assert.equal(db.Formularios.filter((f) => f.tipo === 'semanal').length, 3);
});

test('despacho, apertura, toma, cierre y puntaje', async () => {
  const f = semanal(0);
  f.programado_para = new Date(Date.now() - 60000).toISOString();
  await s.tick('https://x', new Date());
  assert.equal(f.estado, 'enviado');
  assert.ok(f.token && f.codigo && f.tomas.split(',').length === 4);
  const p = await s.abrir(f.token);
  assert.equal(f.estado, 'abierto');
  assert.equal(p.tomas.length, 4);
  const toma = p.tomas[0].id;
  const r = await s.registrarToma({ token: f.token, toma, archivo: { id: 'drive123', link: 'https://drive/x' }, segundos: 30, mime: 'video/webm' });
  assert.equal(r.codigo_ok, 'SI');
  const resp = db.Respuestas.filter((x) => x.formulario_id === f.id);
  assert.ok(resp.length > 0);
  assert.ok(resp.some((x) => x.revision === 'pendiente'));
  await assert.rejects(() => s.registrarToma({ token: f.token, toma, archivo: { id: 'x', link: 'u' }, segundos: 30 }), /ya se cargó/);
  assert.equal(db.Evidencias[0].archivo_id, 'drive123');
  await s.terminar(f.token);
  assert.equal(f.estado, 'completado');
  assert.equal(f.token, '');
  await assert.rejects(() => s.abrir(f.token), /no es válido/);
});

test('pantalla de espera de la tablet', async () => {
  db.Tiendas.forEach((t, i) => { t.clave = `clave${i}`; });
  const f = semanal(1);
  f.programado_para = new Date(Date.now() - 60000).toISOString();
  await s.tick('https://x', new Date());
  const tienda = db.Tiendas.find((t) => t.id === f.tienda_id);
  const r = await s.pendienteDeTienda(tienda.clave);
  assert.equal(r.pendiente.token, f.token);
  await assert.rejects(() => s.pendienteDeTienda('nada'), /inválido/);
});

test('cancelar y reenviar hasta 2 veces con tomas distintas', async () => {
  const f = semanal(1);
  const tomas1 = f.tomas.split(',');
  await s.cancelar(f.token, 'Entró un cliente');
  assert.equal(f.estado, 'cancelado');

  let ctx = await s.cargar();
  await s.reenviar(ctx, f.id, admin, 'ahora', 'https://x');
  const r1 = db.Formularios.find((x) => x.origen_id === f.id && Number(x.reenvio_n) === 1);
  assert.equal(r1.estado, 'enviado');
  const solapadas = r1.tomas.split(',').filter((t) => tomas1.includes(t));
  assert.equal(solapadas.length, 0, `reenvío repite tomas: ${solapadas}`);

  ctx = await s.cargar();
  await assert.rejects(() => s.reenviar(ctx, f.id, admin, 'ahora', 'https://x'), /Solo se reenvían|activo/);

  await s.cancelar(r1.token, 'Entró un cliente');
  ctx = await s.cargar();
  await s.reenviar(ctx, r1.id, admin, 'franja', 'https://x');
  const r2 = db.Formularios.find((x) => x.origen_id === f.id && Number(x.reenvio_n) === 2);
  assert.equal(r2.estado, 'programado');

  r2.estado = 'vencido';
  ctx = await s.cargar();
  await assert.rejects(() => s.reenviar(ctx, r2.id, admin, 'ahora', 'https://x'), /2 reenvíos/);
});

test('vencido sin abrir a los 15 minutos', async () => {
  const f = semanal(2);
  f.programado_para = new Date(Date.now() - 60000).toISOString();
  await s.tick('https://x', new Date());
  assert.equal(f.estado, 'enviado');
  await s.tick('https://x', new Date(Date.now() + 11 * 60000));
  assert.ok(f.recordado_at);
  await s.tick('https://x', new Date(Date.now() + 16 * 60000));
  assert.equal(f.estado, 'vencido');
});

test('reevaluar tomas que quedaron con error', async () => {
  const f = semanal(0);
  const toma = String(f.tomas).split(',')[1];
  db.Evidencias.push({ id: 'E-err', formulario_id: f.id, toma, archivo_id: 'drive999', url: 'https://drive/y', error: 'Gemini caído' });
  const antes = db.Respuestas.length;
  const ctx = await s.cargar();
  const r = await s.reevaluar(ctx, f.id);
  assert.equal(r.evaluadas, 1);
  assert.ok(db.Respuestas.length > antes);
  assert.equal(db.Evidencias.find((e) => e.id === 'E-err').error, '');
  await assert.rejects(async () => s.reevaluar(await s.cargar(), f.id), /No hay tomas/);
});
