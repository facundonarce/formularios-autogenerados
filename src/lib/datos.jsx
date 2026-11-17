// Contexto de datos del panel: carga el dataset una vez y expone índices y derivados memorizados.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { calcularPuntaje } from '../../shared/logic.js';

const Ctx = createContext(null);
export const useDatos = () => useContext(Ctx);

export function DatosProvider({ children, onSesionVencida }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setData(await api.dataset());
      setError(null);
    } catch (e) {
      if (e.status === 401) onSesionVencida?.();
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [onSesionVencida]);

  useEffect(() => { recargar(); }, [recargar]);

  const accion = useCallback(async (body) => {
    const r = await api.accion(body);
    await recargar();
    return r;
  }, [recargar]);

  const derivados = useMemo(() => (data ? derivar(data) : null), [data]);

  return <Ctx.Provider value={{ data, d: derivados, error, cargando, recargar, accion }}>{children}</Ctx.Provider>;
}

function derivar(data) {
  const tiendaPorId = Object.fromEntries(data.tiendas.map((t) => [t.id, t]));
  const preguntaPorNum = Object.fromEntries(data.preguntas.map((p) => [Number(p.num), p]));
  const tomaPorId = Object.fromEntries(data.tomas.map((t) => [t.id, t]));
  const formPorId = Object.fromEntries(data.formularios.map((f) => [f.id, f]));
  const max = Number(data.config.max_reenvios);

  const respPorForm = {};
  for (const r of data.respuestas) (respPorForm[r.formulario_id] ||= []).push(r);
  const evPorForm = {};
  for (const e of data.evidencias) (evPorForm[e.formulario_id] ||= []).push(e);

  const cadenas = {};
  for (const f of data.formularios) (cadenas[f.origen_id || f.id] ||= []).push(f);

  const formularios = data.formularios.map((f) => {
    const cadena = cadenas[f.origen_id || f.id] || [f];
    const reenviosUsados = Math.max(0, ...cadena.map((x) => Number(x.reenvio_n || 0)));
    const resp = respPorForm[f.id] || [];
    const tienda = tiendaPorId[f.tienda_id];
    const puntaje = resp.length && tienda ? calcularPuntaje(resp, preguntaPorNum, tienda.tipo) : null;
    return {
      ...f,
      tienda,
      cadena,
      reenviosUsados,
      respuestas: resp,
      evidencias: evPorForm[f.id] || [],
      puntaje,
      incidencias: puntaje ? Object.values(puntaje.modulos).reduce((s, m) => s + m.incidencias, 0) : 0,
      pendientesRevision: resp.filter((r) => r.revision === 'pendiente').length,
      fechaRef: f.enviado_at || f.programado_para,
    };
  }).filter((f) => f.tienda);

  const pendientesReenvio = formularios.filter((f) => {
    if (!['cancelado', 'vencido'].includes(f.estado)) return false;
    const activos = f.cadena.some((x) => ['programado', 'enviado', 'abierto', 'completado'].includes(x.estado));
    const esUltimo = Number(f.reenvio_n || 0) === f.reenviosUsados;
    return !activos && esUltimo;
  });

  const respuestasPendientes = data.respuestas
    .filter((r) => r.revision === 'pendiente')
    .map((r) => {
      const f = formularios.find((x) => x.id === r.formulario_id);
      return { ...r, form: f, tienda: tiendaPorId[r.tienda_id], preguntaObj: preguntaPorNum[Number(r.pregunta)] };
    })
    .filter((r) => r.form && r.form.estado !== 'anulado');

  const crucesPendientes = formularios.filter((f) => f.estado === 'completado' && f.cruce_camaras === 'SI' && !f.cruce_resultado);

  // Puntaje mensual por tienda (acumula los formularios completados del mes; excluye anulados).
  function puntajeMensual(mes) {
    const porTienda = {};
    for (const f of formularios) {
      if (f.estado !== 'completado' || String(f.fechaRef).slice(0, 7) !== mes) continue;
      (porTienda[f.tienda_id] ||= []).push(...f.respuestas);
    }
    return Object.fromEntries(data.tiendas.map((t) => [t.id, porTienda[t.id] ? calcularPuntaje(porTienda[t.id], preguntaPorNum, t.tipo) : null]));
  }

  const meses = [...new Set(formularios.map((f) => String(f.fechaRef).slice(0, 7)))].filter(Boolean).sort().reverse();
  const registros = data.formularios.length + data.respuestas.length + data.evidencias.length;

  return {
    tiendaPorId, preguntaPorNum, tomaPorId, formPorId, max,
    formularios, pendientesReenvio, respuestasPendientes, crucesPendientes,
    puntajeMensual, meses, registros, paises: [...new Set(data.tiendas.map((t) => t.pais))].sort(),
  };
}
