// Cliente de datos. En modo demo (VITE_DEMO=true) todo corre en memoria con datos de ejemplo.
import { generarDemo } from '../demo/mock.js';
import { TOMAS, CONFIG_DEFAULT, PRODUCTOS_T3, UBICACIONES_T3 } from '../../shared/catalog.js';
import { elegirTomas, elegirProductos, proximaFranja } from '../../shared/logic.js';

export const DEMO = import.meta.env.VITE_DEMO === 'true';

let tokenGoogle = null;

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => mal(new Error('No se pudo leer el video'));
    r.readAsDataURL(blob);
  });
}
export function setTokenGoogle(t) { tokenGoogle = t; }

async function pedir(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(tokenGoogle ? { Authorization: `Bearer ${tokenGoogle}` } : {}), ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || `Error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data;
}

/* ---------------- Demo en memoria ---------------- */
let demo = null;
const demoDb = () => (demo ||= generarDemo(new Date()));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const clonar = (x) => JSON.parse(JSON.stringify(x));
const USUARIO_DEMO = { email: 'facundoarce@biamex.com', nombre: 'Facundo Arce', rol: 'admin' };

async function accionDemo(b) {
  await espera(350);
  const db = demoDb();
  const f = db.formularios.find((x) => x.id === b.formulario);
  if (b.accion === 'reenviar') {
    const raiz = f.origen_id || f.id;
    const cadena = db.formularios.filter((x) => x.id === raiz || x.origen_id === raiz);
    const n = Math.max(...cadena.map((x) => Number(x.reenvio_n || 0)));
    if (n >= Number(CONFIG_DEFAULT.max_reenvios)) throw new Error(`Ya se usaron los ${CONFIG_DEFAULT.max_reenvios} reenvíos de este formulario`);
    const tienda = db.tiendas.find((t) => t.id === f.tienda_id);
    const cuando = b.cuando === 'ahora' ? new Date() : proximaFranja({ tienda, config: CONFIG_DEFAULT, ahora: new Date() });
    const excluir = cadena.flatMap((x) => String(x.tomas).split(','));
    const tomas = elegirTomas({ tomas: TOMAS, n: 4, excluir, forzarT3: !excluir.includes('T3') });
    const nuevo = {
      id: `F-R${Date.now() % 100000}`, tienda_id: f.tienda_id, tipo: f.tipo, origen_id: raiz, reenvio_n: n + 1,
      reenviado_por: USUARIO_DEMO.email, programado_para: cuando.toISOString(),
      estado: b.cuando === 'ahora' ? 'enviado' : 'programado', enviado_at: b.cuando === 'ahora' ? new Date().toISOString() : '',
      tomas: tomas.join(','), productos: tomas.includes('T3') ? elegirProductos({ productos: PRODUCTOS_T3, ubicaciones: UBICACIONES_T3 }) : [],
    };
    db.formularios.push(nuevo);
    return { ok: true, id: nuevo.id };
  }
  if (b.accion === 'no_realizado') { f.estado = 'no_realizado'; return { ok: true }; }
  if (b.accion === 'revisar') {
    const r = db.respuestas.find((x) => x.id === b.respuesta);
    Object.assign(r, { revision: 'revisada', respuesta_final: b.valor, revisado_por: USUARIO_DEMO.email });
    return { ok: true };
  }
  if (b.accion === 'cruce') {
    Object.assign(f, { cruce_resultado: b.coincide ? 'coincide' : 'no_coincide', cruce_por: USUARIO_DEMO.email });
    if (!b.coincide) f.estado = 'anulado';
    return { ok: true };
  }
  if (b.accion === 'programar_ahora') return { ok: true, id: 'demo', link: `${location.origin}${location.pathname}#/f/demo` };
  throw new Error('Acción desconocida');
}

/* ---------------- API pública ---------------- */
export const api = {
  async dataset() {
    if (DEMO) { await espera(600); return { ...clonar(demoDb()), sincronizado: new Date().toISOString(), usuario: USUARIO_DEMO }; }
    return pedir('/api/admin');
  },
  async accion(body) {
    if (DEMO) return accionDemo(body);
    return pedir('/api/admin', { method: 'POST', body: JSON.stringify(body) });
  },
  // Tablet
  async abrir(token) {
    if (DEMO) {
      await espera(500);
      const tomas = ['T3', 'T1', 'T6', 'T5'].map((id) => ({ ...TOMAS.find((t) => t.id === id), hecha: false }));
      return {
        id: 'F-DEMO', tienda: { nombre: 'Tienda Recoleta', pais: 'Argentina' }, tipo: 'semanal', codigo: '4821',
        limite: new Date(Date.now() + 10 * 60000).toISOString(),
        productos: ['El cochecito exhibido más cerca de la caja', 'La butaca para auto exhibida en la tarima principal', 'La cuna exhibida más cerca del espejo'],
        tomas,
      };
    }
    return pedir(`/api/form?token=${encodeURIComponent(token)}`);
  },
  // Sube el video a Google Drive en partes (vía /api/upload) y después pide la evaluación.
  async enviarToma({ token, toma, blob, segundos, mime, onProgreso }) {
    if (DEMO) {
      for (let p = 0; p <= 100; p += 25) { onProgreso?.(p); await espera(250); }
      await espera(800);
      return { ok: true, evaluada: true, codigo_ok: 'SI' };
    }
    const tipo = (mime || blob.type || 'video/webm').split(';')[0];
    const { ticket, parte } = await pedir('/api/upload', { method: 'POST', body: JSON.stringify({ accion: 'iniciar', token, toma, mime: tipo, size: blob.size }) });
    let archivo = null;
    for (let inicio = 0; inicio < blob.size; inicio += parte) {
      const trozo = blob.slice(inicio, Math.min(inicio + parte, blob.size));
      const datos = await aBase64(trozo);
      let r;
      for (let intento = 0; ; intento++) {
        try {
          r = await pedir('/api/upload', { method: 'POST', body: JSON.stringify({ accion: 'parte', ticket, inicio, total: blob.size, datos }) });
          break;
        } catch (e) {
          if (intento >= 2) throw e;
          await espera(1500 * (intento + 1));
        }
      }
      onProgreso?.(Math.round(((inicio + trozo.size) / blob.size) * 100));
      if (r.completo) archivo = r.archivo;
    }
    if (!archivo) throw new Error('El video no terminó de subirse');
    return pedir('/api/form', { method: 'POST', body: JSON.stringify({ token, accion: 'toma', toma, archivo, segundos, mime: tipo }) });
  },
  // Pantalla de espera de la tablet de una tienda.
  async pendiente(clave) {
    if (DEMO) {
      await espera(400);
      return { tienda: { nombre: 'Tienda Recoleta' }, pendiente: { token: 'demo', tipo: 'semanal', estado: 'enviado', vence: new Date(Date.now() + 12 * 60000).toISOString() }, consultado: new Date().toISOString() };
    }
    return pedir(`/api/form?tienda=${encodeURIComponent(clave)}`);
  },
  async terminar(token) {
    if (DEMO) { await espera(500); return { ok: true }; }
    return pedir('/api/form', { method: 'POST', body: JSON.stringify({ token, accion: 'terminar' }) });
  },
  async cancelar(token, motivo) {
    if (DEMO) { await espera(500); return { ok: true }; }
    return pedir('/api/form', { method: 'POST', body: JSON.stringify({ token, accion: 'cancelar', motivo }) });
  },
};
