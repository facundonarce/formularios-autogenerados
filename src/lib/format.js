import { ESTADOS } from '../../shared/catalog.js';
import { pct } from '../../shared/logic.js';

export { pct };

export function fechaHora(iso, timeZone) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es-AR', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

export function fecha(iso, timeZone) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('es-AR', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

export function hace(iso) {
  if (!iso) return '-';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export const TONO_ESTADO = {
  programado: 'neutro', enviado: 'marca', abierto: 'marca', completado: 'ok',
  cancelado: 'medio', vencido: 'medio', no_realizado: 'mal', anulado: 'mal',
};
export const nombreEstado = (e) => ESTADOS[e] || e;

export function tonoPct(v) {
  if (v == null) return 'neutro';
  if (v >= 0.95) return 'ok';
  if (v >= 0.85) return 'medio';
  return 'mal';
}

export function colorPct(v) {
  return { ok: 'text-ok', medio: 'text-medio', mal: 'text-mal', neutro: 'text-muted' }[tonoPct(v)];
}

export function aCsv(columnas, filas, nombre) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [columnas.map((c) => esc(c.titulo)).join(',')];
  for (const f of filas) lineas.push(columnas.map((c) => esc(c.csv ? c.csv(f) : c.valor ? c.valor(f) : f[c.key])).join(','));
  const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
