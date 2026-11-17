// Datos de ejemplo para el modo demo: 30 tiendas, 7 semanas de formularios y respuestas.
import { PREGUNTAS, TIENDAS, TOMAS, CONFIG_DEFAULT, USUARIOS, PRODUCTOS_T3, UBICACIONES_T3 } from '../../shared/catalog.js';
import { mulberry32, elegirTomas, elegirProductos, programarSemana, proximaFranja, aplicaATienda, partesLocales } from '../../shared/logic.js';

export function generarDemo(ahora = new Date()) {
  const rng = mulberry32(20261117);
  const formularios = [];
  const evidencias = [];
  const respuestas = [];
  const tiendas = TIENDAS.map((t) => ({ ...t, clave: 'demo', slack_channel: '', _calidad: 0.4 + rng() * 0.7 }));
  let seq = 1;
  const id = (p) => `${p}-${String(seq++).padStart(5, '0')}`;

  const semanas = 7;
  for (const tienda of tiendas) {
    let anterior = null;
    for (let w = semanas - 1; w >= 0; w--) {
      const base = new Date(ahora.getTime() - w * 7 * 86400000);
      // Lunes de esa semana a las 07:00 locales aprox.
      const p = partesLocales(base, tienda.timezone);
      const lunes = new Date(base.getTime() - ((p.weekday - 1) * 86400000) - (p.hh * 3600000) + 4 * 3600000);
      let cuando = programarSemana({ tienda, config: CONFIG_DEFAULT, ahora: lunes, anterior, rng });
      if (!cuando) continue;
      anterior = cuando.toISOString();
      const enFuturo = cuando > ahora;
      const f = {
        id: id('F'), tienda_id: tienda.id, tipo: 'semanal', programado_para: cuando.toISOString(),
        origen_id: '', reenvio_n: 0, reenviado_por: '', productos: [], tomas: '',
      };
      formularios.push(f);
      if (enFuturo) { f.estado = 'programado'; continue; }
      despacharDemo(f, cuando);
      const azar = rng();
      if (w === 0 && ahora - cuando < 15 * 60000) { f.estado = 'enviado'; continue; }
      if (azar < 0.06) {
        f.estado = 'cancelado'; f.cancel_motivo = 'Entró un cliente';
        if (w > 0 || rng() < 0.4) {
          const r = { ...f, id: id('F'), origen_id: f.id, reenvio_n: 1, reenviado_por: 'reporting@carestino.com' };
          const c2 = proximaFranja({ tienda, config: CONFIG_DEFAULT, ahora: new Date(cuando.getTime() + 40 * 60000), rng });
          r.programado_para = c2.toISOString();
          despacharDemo(r, c2, f.tomas.split(','));
          formularios.push(r);
          completar(r, tienda, c2);
        }
      } else if (azar < 0.1) {
        f.estado = w > 1 ? 'no_realizado' : 'vencido';
      } else {
        completar(f, tienda, cuando);
      }
    }
    // Un relevamiento mensual por tienda en noviembre.
    const semanaMensual = new Date(ahora.getTime() - (7 + Math.floor(rng() * 2) * 7) * 86400000);
    const pm = partesLocales(semanaMensual, tienda.timezone);
    const lunesM = new Date(semanaMensual.getTime() - ((pm.weekday - 1) * 86400000) - (pm.hh * 3600000) + 4 * 3600000);
    const cm = programarSemana({ tienda, config: CONFIG_DEFAULT, ahora: lunesM, rng }) || lunesM;
    const m = { id: id('F'), tienda_id: tienda.id, tipo: 'mensual', programado_para: cm.toISOString(), origen_id: '', reenvio_n: 0, productos: [] };
    m.tomas = TOMAS.filter((t) => t.tipo === 'mensual' && (!t.solo || t.solo === tienda.tipo)).map((t) => t.id).join(',');
    m.enviado_at = m.programado_para;
    formularios.push(m);
    completar(m, tienda, new Date(m.programado_para));
  }

  function despacharDemo(f, cuando, excluir = []) {
    f.tomas = elegirTomas({ tomas: TOMAS, n: 4, excluir, rng, forzarT3: !excluir.includes('T3') }).join(',');
    if (f.tomas.includes('T3')) f.productos = elegirProductos({ productos: PRODUCTOS_T3, ubicaciones: UBICACIONES_T3, rng });
    f.enviado_at = cuando.toISOString();
  }

  function completar(f, tienda, cuando) {
    f.estado = 'completado';
    f.abierto_at = new Date(cuando.getTime() + (2 + rng() * 9) * 60000).toISOString();
    f.completado_at = new Date(new Date(f.abierto_at).getTime() + (3 + rng() * 5) * 60000).toISOString();
    f.cruce_camaras = rng() < 0.25 ? 'SI' : 'NO';
    if (f.cruce_camaras === 'SI' && Date.parse(f.completado_at) < ahora - 3 * 86400000) {
      f.cruce_resultado = rng() < 0.93 ? 'coincide' : 'no_coincide';
      f.cruce_por = 'facundoarce@biamex.com';
      if (f.cruce_resultado === 'no_coincide') f.estado = 'anulado';
    }
    for (const toma of f.tomas.split(',')) {
      const segs = 18 + Math.floor(rng() * 25);
      evidencias.push({ id: id('E'), formulario_id: f.id, toma, url: '', segundos: segs, codigo_ok: rng() < 0.97 ? 'SI' : 'NO', creado_at: f.completado_at, evaluado_at: f.completado_at });
      for (const p of PREGUNTAS.filter((q) => q.toma === toma && aplicaATienda(q, tienda.tipo))) {
        const base = (p.incumplimiento_2026 ?? 0.05) * tienda._calidad;
        const mala = rng() < base;
        let resp;
        if (rng() < 0.03) resp = 'No se puede relevar';
        else if (p.tipo_respuesta === 'escala') resp = mala ? (rng() < 0.75 ? 'Regular' : 'Mala') : 'Buena';
        else resp = mala ? (p.positivo === 'SI' ? 'No' : 'Si') : (p.positivo === 'SI' ? 'Si' : 'No');
        const conf = rng() < 0.08 ? Math.round(45 + rng() * 24) : Math.round(72 + rng() * 27);
        const reciente = Date.parse(f.completado_at) > ahora - 4 * 86400000;
        const revision = conf < 70 ? (reciente ? 'pendiente' : 'revisada') : 'ok';
        respuestas.push({
          id: id('R'), formulario_id: f.id, tienda_id: tienda.id, fecha: f.completado_at, pregunta: p.num, respuesta: resp,
          confianza: conf, motivo: mala ? p.texto_incidencia : 'Se ve correcto en el video', segundo: Math.floor(rng() * segs),
          revision, respuesta_final: revision === 'revisada' ? resp : '', revisado_por: revision === 'revisada' ? 'reporting@carestino.com' : '',
        });
      }
    }
  }

  // Algunos pendientes de reenvío recientes para mostrar el flujo.
  const recientes = formularios.filter((f) => f.estado === 'completado' && f.tipo === 'semanal' && !f.origen_id && ahora - new Date(f.enviado_at) < 3 * 86400000);
  recientes.slice(0, 3).forEach((f, i) => {
    f.estado = i === 1 ? 'vencido' : 'cancelado';
    f.cancel_motivo = i === 1 ? '' : ['Entró un cliente', '', 'Hay mucha gente en la tienda'][i];
    delete f.abierto_at; delete f.completado_at; f.cruce_camaras = '';
    for (let k = respuestas.length - 1; k >= 0; k--) if (respuestas[k].formulario_id === f.id) respuestas.splice(k, 1);
    for (let k = evidencias.length - 1; k >= 0; k--) if (evidencias[k].formulario_id === f.id) evidencias.splice(k, 1);
  });

  return {
    config: CONFIG_DEFAULT,
    tiendas: tiendas.map(({ _calidad, ...t }) => ({ ...t, link_tablet: typeof location !== 'undefined' ? `${location.origin}${location.pathname}#/t/demo` : '' })),
    preguntas: PREGUNTAS,
    tomas: TOMAS,
    formularios,
    evidencias,
    respuestas,
    usuarios: USUARIOS,
    sincronizado: ahora.toISOString(),
  };
}
