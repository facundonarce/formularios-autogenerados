// Lógica de negocio pura (sin red ni Sheets). La usan las funciones /api, el modo demo y los tests.
import { PESOS, MODULOS } from './catalog.js';

/* ---------------- Respuestas y puntaje ---------------- */

export const NO_RELEVABLE = 'NO SE PUEDE RELEVAR';

export function norm(v) {
  return String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Una respuesta descuenta si es distinta a la esperada. En las de escala, Regular y Mala descuentan.
export function esNegativa(pregunta, respuesta) {
  const r = norm(respuesta);
  if (!r || r === NO_RELEVABLE) return false;
  if (pregunta.tipo_respuesta === 'escala') return r === 'REGULAR' || r === 'MALA';
  return r !== norm(pregunta.positivo);
}

// Respuesta que cuenta: la revisada si existe; las pendientes de revisión no cuentan todavía.
export function respuestaVigente(row) {
  if (row.revision === 'pendiente') return null;
  return row.respuesta_final || row.respuesta;
}

export function aplicaATienda(pregunta, tipoTienda) {
  return !pregunta.aplica_a || pregunta.aplica_a === 'ambos' || pregunta.aplica_a === tipoTienda;
}

/**
 * Puntaje por módulo: 1 - descuentos / pesos de las preguntas evaluadas.
 * El total es el promedio de los módulos que tuvieron preguntas evaluadas.
 * respuestas: filas de la hoja Respuestas (de una tienda y un período).
 */
export function calcularPuntaje(respuestas, preguntasPorNum, tipoTienda) {
  const mod = Object.fromEntries(MODULOS.map((m) => [m, { enJuego: 0, descuento: 0, incidencias: 0, evaluadas: 0 }]));
  for (const row of respuestas) {
    const p = preguntasPorNum[Number(row.pregunta)];
    if (!p || !mod[p.modulo] || !aplicaATienda(p, tipoTienda)) continue;
    const r = respuestaVigente(row);
    if (r == null || !String(r).trim() || norm(r) === NO_RELEVABLE) continue;
    const peso = PESOS[p.impacto] || 0;
    const m = mod[p.modulo];
    m.enJuego += peso;
    m.evaluadas += 1;
    if (esNegativa(p, r)) { m.descuento += peso; m.incidencias += 1; }
  }
  const modulos = {};
  const pcts = [];
  for (const [nombre, m] of Object.entries(mod)) {
    const pct = m.enJuego > 0 ? Math.max(0, 1 - m.descuento / m.enJuego) : null;
    modulos[nombre] = { ...m, pct };
    if (pct != null) pcts.push(pct);
  }
  const total = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  return { modulos, total };
}

// Puntaje máximo de cada módulo según el catálogo (suma de pesos por tipo de tienda).
export function puntajesMaximos(preguntas, tipoTienda) {
  const out = Object.fromEntries(MODULOS.map((m) => [m, 0]));
  for (const p of preguntas) {
    if (p.tratamiento === 'camaras' || !aplicaATienda(p, tipoTienda)) continue;
    out[p.modulo] = Math.round(((out[p.modulo] || 0) + (PESOS[p.impacto] || 0)) * 10) / 10;
  }
  return out;
}

/* ---------------- Azar ---------------- */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomToken(len = 24) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export function randomCode(rng = Math.random) {
  return String(1000 + Math.floor(rng() * 9000));
}

function weightedPick(items, weightOf, rng) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let x = rng() * total;
  for (const it of items) {
    x -= weightOf(it);
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Elige las tomas de un formulario semanal.
 * - T3 (productos) entra casi siempre.
 * - El resto se pondera por el incumplimiento reciente de la tienda en cada toma
 *   y se favorecen las que todavía no salieron en el mes.
 * - excluir: tomas ya vistas (reenvíos); se evitan mientras queden alternativas.
 */
export function elegirTomas({ tomas, n = 4, fallasPorToma = {}, usadasMes = [], excluir = [], rng = Math.random, forzarT3 = true }) {
  const semanales = tomas.filter((t) => t.tipo === 'semanal');
  const elegidas = [];
  let pool = semanales.filter((t) => !excluir.includes(t.id));
  if (pool.length < n) pool = semanales.slice();
  if (forzarT3 && rng() < 0.9 && pool.find((t) => t.id === 'T3')) {
    elegidas.push('T3');
  }
  while (elegidas.length < n && elegidas.length < pool.length) {
    const resto = pool.filter((t) => !elegidas.includes(t.id));
    const t = weightedPick(resto, (t) => {
      const falla = fallasPorToma[t.id] ?? 0.1;
      const nueva = usadasMes.includes(t.id) ? 1 : 2.5;
      return (0.15 + falla) * nueva;
    }, rng);
    elegidas.push(t.id);
  }
  return elegidas;
}

export function elegirProductos({ productos, ubicaciones, n = 3, excluir = [], rng = Math.random }) {
  const pool = productos.filter((p) => !excluir.includes(p));
  const base = pool.length >= n ? pool : productos;
  const out = [];
  const usados = new Set();
  while (out.length < n && usados.size < base.length) {
    const p = base[Math.floor(rng() * base.length)];
    if (usados.has(p)) continue;
    usados.add(p);
    const fem = p.startsWith('la ');
    out.push(`${p[0].toUpperCase()}${p.slice(1)} exhibid${fem ? 'a' : 'o'} ${ubicaciones[Math.floor(rng() * ubicaciones.length)]}`);
  }
  return out;
}

/* ---------------- Fechas y zonas horarias ---------------- */

export function partesLocales(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, weekday: wd, fecha: `${p.year}-${p.month}-${p.day}` };
}

function offsetMs(date, timeZone) {
  const p = partesLocales(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

// Convierte una fecha/hora local de una zona a un Date (UTC).
export function localAUtc(y, m, d, hh, mm, timeZone) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const first = new Date(guess.getTime() - offsetMs(guess, timeZone));
  return new Date(guess.getTime() - offsetMs(first, timeZone));
}

export function sumarDias(fechaIso, n) {
  const [y, m, d] = fechaIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function parseFranjas(txt) {
  return String(txt || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [a, b] = s.split('-');
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return { desde: ah * 60 + (am || 0), hasta: bh * 60 + (bm || 0) };
  });
}

// Lunes (fecha local ISO) de la semana de una fecha.
export function lunesDe(fechaIso) {
  const [y, m, d] = fechaIso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return sumarDias(fechaIso, 1 - wd);
}

function esFeriado(fechaIso, pais, feriados) {
  const code = { 'Argentina': 'AR', 'México': 'MX', 'Colombia': 'CO', 'Ecuador': 'EC', 'Chile': 'CL', 'Uruguay': 'UY', 'Panamá': 'PA', 'Costa Rica': 'CR', 'Paraguay': 'PY', 'Perú': 'PE' }[pais];
  return String(feriados || '').split(',').map((s) => s.trim()).includes(`${code}:${fechaIso}`);
}

/**
 * Elige el momento del aviso dentro de una franja: entre el inicio y (fin - apertura - completar),
 * para que el formulario entero entre en la franja.
 */
export function momentoEnFranja(fechaIso, franja, tienda, config, rng = Math.random) {
  const margen = Number(config.ventana_apertura_min) + Number(config.ventana_completar_min);
  const ultimo = Math.max(franja.desde, franja.hasta - margen);
  const minuto = franja.desde + Math.floor(rng() * (ultimo - franja.desde + 1));
  const [y, m, d] = fechaIso.split('-').map(Number);
  return localAUtc(y, m, d, Math.floor(minuto / 60), minuto % 60, tienda.timezone);
}

/**
 * Programa el formulario semanal de una tienda para la semana de `ahora`.
 * Reglas: días hábiles, sin feriados, al menos 2 días desde el anterior,
 * no el mismo día de la semana que la semana pasada, y no en el pasado.
 */
export function programarSemana({ tienda, config, ahora, anterior, rng = Math.random }) {
  const hoy = partesLocales(ahora, tienda.timezone);
  const lunes = lunesDe(hoy.fecha);
  const habiles = String(config.dias_habiles).split(',').map(Number);
  const franjas = parseFranjas(tienda.franjas || config.franjas);
  const prevFecha = anterior ? partesLocales(new Date(anterior), tienda.timezone) : null;
  const candidatos = [];
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    if (!habiles.includes(i + 1)) continue;
    if (fecha < hoy.fecha) continue;
    if (esFeriado(fecha, tienda.pais, config.feriados)) continue;
    if (prevFecha) {
      const diff = (Date.parse(fecha) - Date.parse(prevFecha.fecha)) / 86400000;
      if (diff < 2) continue;
      if (i + 1 === prevFecha.weekday && diff <= 7) continue;
    }
    for (const f of franjas) {
      const margen = Number(config.ventana_apertura_min) + Number(config.ventana_completar_min);
      if (fecha === hoy.fecha && hoy.hh * 60 + hoy.mm > f.hasta - margen) continue;
      candidatos.push({ fecha, franja: f });
    }
  }
  if (!candidatos.length) return null;
  const c = candidatos[Math.floor(rng() * candidatos.length)];
  let cuando = momentoEnFranja(c.fecha, c.franja, tienda, config, rng);
  if (cuando < ahora) cuando = new Date(ahora.getTime() + 60000);
  return cuando;
}

// Próxima franja disponible desde `ahora` (para reenvíos "en la próxima franja").
export function proximaFranja({ tienda, config, ahora, rng = Math.random }) {
  const habiles = String(config.dias_habiles).split(',').map(Number);
  const franjas = parseFranjas(tienda.franjas || config.franjas);
  const hoy = partesLocales(ahora, tienda.timezone);
  const margen = Number(config.ventana_apertura_min) + Number(config.ventana_completar_min);
  for (let i = 0; i < 10; i++) {
    const fecha = sumarDias(hoy.fecha, i);
    const [y, m, d] = fecha.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
    if (!habiles.includes(wd) || esFeriado(fecha, tienda.pais, config.feriados)) continue;
    for (const f of franjas) {
      if (i === 0 && hoy.hh * 60 + hoy.mm > f.hasta - margen) continue;
      if (i === 0 && hoy.hh * 60 + hoy.mm >= f.desde) {
        return new Date(ahora.getTime() + 60000);
      }
      return momentoEnFranja(fecha, f, tienda, config, rng);
    }
  }
  return null;
}

/* ---------------- Utilidades de presentación ---------------- */

export function pct(v, dec = 1) {
  if (v == null || Number.isNaN(v)) return '-';
  return `${(v * 100).toFixed(dec).replace('.', ',')}%`;
}

export function mesDe(iso) {
  return String(iso || '').slice(0, 7);
}
