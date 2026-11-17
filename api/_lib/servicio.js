// Servicio central: programación, envío, apertura, tomas, cierre, cancelación y reenvío de formularios.
import { CONFIG_DEFAULT, PRODUCTOS_T3, UBICACIONES_T3 } from '../../shared/catalog.js';
import {
  elegirTomas, elegirProductos, programarSemana, proximaFranja, partesLocales, lunesDe, sumarDias,
  randomToken, randomCode, esNegativa, calcularPuntaje, pct, aplicaATienda,
} from '../../shared/logic.js';
import { leerTablas, agregarFilas, actualizarFilas, parseJson, configDesde, preguntasDesde, tomasDesde } from './sheets.js';
import * as slack from './slack.js';
import { evaluarToma } from './gemini.js';
import { descargar } from './drive.js';
import { error } from './http.js';

const TABLAS = ['Config', 'Tiendas', 'Preguntas', 'Tomas', 'Formularios', 'Evidencias', 'Respuestas', 'Usuarios'];

export async function cargar(tablas = TABLAS) {
  const t = await leerTablas(tablas);
  return {
    config: configDesde(t.Config, CONFIG_DEFAULT),
    tiendas: (t.Tiendas || []).filter((x) => String(x.activa).toUpperCase() !== 'NO'),
    preguntas: preguntasDesde(t.Preguntas || []),
    tomas: tomasDesde(t.Tomas || []),
    formularios: t.Formularios || [],
    evidencias: t.Evidencias || [],
    respuestas: t.Respuestas || [],
    usuarios: t.Usuarios || [],
  };
}

const nuevoId = (pref) => `${pref}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomToken(5)}`;
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

function tiendaDe(ctx, id) {
  const t = ctx.tiendas.find((x) => x.id === id);
  if (!t) throw error(404, `Tienda ${id} no encontrada`);
  return t;
}

/* ---------------- Armado de formularios ---------------- */

// Incumplimiento ponderado de una tienda por toma en los últimos 90 días.
function fallasPorToma(ctx, tiendaId) {
  const desde = Date.now() - 90 * 86400000;
  const porNum = Object.fromEntries(ctx.preguntas.map((p) => [p.num, p]));
  const acc = {};
  for (const r of ctx.respuestas) {
    if (r.tienda_id !== tiendaId || Date.parse(r.fecha) < desde) continue;
    const p = porNum[Number(r.pregunta)];
    if (!p?.toma) continue;
    const a = (acc[p.toma] ||= { n: 0, f: 0 });
    a.n += 1;
    if (esNegativa(p, r.respuesta_final || r.respuesta)) a.f += 1;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.n ? v.f / v.n : 0]));
}

function tomasUsadasEnMes(ctx, tiendaId, mes) {
  return ctx.formularios
    .filter((f) => f.tienda_id === tiendaId && String(f.enviado_at).slice(0, 7) === mes && f.estado === 'completado')
    .flatMap((f) => String(f.tomas).split(',').filter(Boolean));
}

// Cadena de un formulario: el original y sus reenvíos.
export function cadena(ctx, form) {
  const raiz = form.origen_id || form.id;
  return ctx.formularios.filter((f) => f.id === raiz || f.origen_id === raiz);
}

export function nuevoFormulario({ tienda, tipo, cuando, origen = null, reenvioN = 0, reenviadoPor = '' }) {
  return {
    id: nuevoId('F'),
    token: '',
    tienda_id: tienda.id,
    tipo,
    estado: 'programado',
    programado_para: iso(cuando),
    origen_id: origen ? (origen.origen_id || origen.id) : '',
    reenvio_n: reenvioN,
    reenviado_por: reenviadoPor,
  };
}

// Al despachar se eligen tomas, productos, token y código: hasta ese momento nadie los conoce.
export async function despachar(ctx, form, baseUrl) {
  const tienda = tiendaDe(ctx, form.tienda_id);
  const ahora = new Date();
  let tomas;
  let productos = [];
  if (form.tipo === 'mensual') {
    tomas = ctx.tomas.filter((t) => t.tipo === 'mensual' && (!t.solo || t.solo === tienda.tipo)).map((t) => t.id);
  } else {
    const previas = form.origen_id ? cadena(ctx, form).filter((f) => f.id !== form.id) : [];
    const excluir = previas.flatMap((f) => String(f.tomas).split(',').filter(Boolean));
    const excluirProd = previas.flatMap((f) => parseJson(f.productos, [])).map((s) => PRODUCTOS_T3.find((p) => String(s).toLowerCase().includes(p))).filter(Boolean);
    tomas = elegirTomas({
      tomas: ctx.tomas,
      n: Number(ctx.config.tomas_por_formulario),
      fallasPorToma: fallasPorToma(ctx, tienda.id),
      usadasMes: tomasUsadasEnMes(ctx, tienda.id, iso(ahora).slice(0, 7)),
      excluir,
      forzarT3: !excluir.includes('T3'),
    });
    if (tomas.includes('T3')) productos = elegirProductos({ productos: PRODUCTOS_T3, ubicaciones: UBICACIONES_T3, excluir: excluirProd });
  }
  const token = randomToken(28);
  const codigo = randomCode();
  const canal = tienda.slack_channel || process.env.SLACK_FALLBACK_CHANNEL || '';
  const msg = await slack.avisarFormulario({
    canal, tienda, url: `${baseUrl}/f/${token}`, tipo: form.tipo,
    minutosApertura: ctx.config.ventana_apertura_min, esReenvio: Number(form.reenvio_n) > 0,
  });
  const cambios = {
    _row: form._row, token, codigo, tomas: tomas.join(','), productos, estado: 'enviado',
    enviado_at: iso(ahora), slack_channel: msg.channel || canal, slack_ts: msg.ts || '',
  };
  if (form._row) await actualizarFilas('Formularios', [cambios]);
  Object.assign(form, cambios);
  return form;
}

/* ---------------- Tarea programada (cada 5 minutos) ---------------- */

export async function tick(baseUrl, ahora = new Date()) {
  const ctx = await cargar();
  const log = [];
  const nuevos = [];

  // 1) Programar el formulario semanal (y el mensual) de cada tienda.
  for (const tienda of ctx.tiendas) {
    const hoy = partesLocales(ahora, tienda.timezone);
    const lunes = lunesDe(hoy.fecha);
    const deTienda = ctx.formularios.filter((f) => f.tienda_id === tienda.id && !f.origen_id);
    const enSemana = (f) => {
      const p = partesLocales(new Date(f.programado_para), tienda.timezone).fecha;
      return p >= lunes && p <= sumarDias(lunes, 6);
    };
    const semanales = deTienda.filter((f) => f.tipo === 'semanal');
    const objetivo = Number(ctx.config.formularios_semanales) || 1;
    const yaEnSemana = semanales.filter(enSemana).length;
    if (yaEnSemana < objetivo) {
      const anterior = semanales.map((f) => f.programado_para).sort().pop();
      const cuando = programarSemana({ tienda, config: ctx.config, ahora, anterior });
      if (cuando) {
        nuevos.push(nuevoFormulario({ tienda, tipo: 'semanal', cuando }));
        log.push(`Programado semanal ${tienda.nombre}`);
      }
    }
    // Mensual: una vez por mes, en una semana al azar.
    const mes = hoy.fecha.slice(0, 7);
    const mensualMes = deTienda.some((f) => f.tipo === 'mensual' && String(f.programado_para).slice(0, 7) === mes);
    const yaPlanificadoSemana = deTienda.some((f) => f.tipo === 'mensual' && enSemana(f));
    if (!mensualMes && !yaPlanificadoSemana && hoy.weekday === 1 && hoy.hh < 9) {
      const [y, m] = mes.split('-').map(Number);
      const finMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const semanasRestantes = Math.max(1, Math.ceil((finMes - hoy.d + 1) / 7));
      if (Math.random() < 1 / semanasRestantes) {
        const cuando = programarSemana({ tienda, config: ctx.config, ahora });
        if (cuando) nuevos.push(nuevoFormulario({ tienda, tipo: 'mensual', cuando }));
      }
    }
  }
  if (nuevos.length) {
    await agregarFilas('Formularios', nuevos);
    // Recargar para tener _row de los nuevos.
    ctx.formularios = (await leerTablas(['Formularios'])).Formularios;
  }

  const cambios = [];
  const ap = Number(ctx.config.ventana_apertura_min);
  const rec = Number(ctx.config.recordatorio_min);
  const comp = Number(ctx.config.ventana_completar_min);

  for (const f of ctx.formularios) {
    const t = ctx.tiendas.find((x) => x.id === f.tienda_id);
    if (!t) continue;
    // 2) Despachar los que llegaron a su horario.
    if (f.estado === 'programado' && new Date(f.programado_para) <= ahora) {
      await despachar(ctx, f, baseUrl);
      log.push(`Enviado ${f.id} a ${t.nombre}`);
      continue;
    }
    const enviado = f.enviado_at ? new Date(f.enviado_at) : null;
    // 3) Recordatorio.
    if (f.estado === 'enviado' && !f.recordado_at && enviado && ahora - enviado >= rec * 60000) {
      await slack.recordar({ canal: f.slack_channel, ts: f.slack_ts, minutosRestantes: Math.max(1, ap - rec) });
      cambios.push({ _row: f._row, recordado_at: iso(ahora) });
    }
    // 4) Vencidos: no se abrieron a tiempo, quedan pendientes de reenvío.
    if (f.estado === 'enviado' && enviado && ahora - enviado >= ap * 60000) {
      cambios.push({ _row: f._row, estado: 'vencido', token: '' });
      await slack.actualizarAviso({ canal: f.slack_channel, ts: f.slack_ts, texto: `Formulario vencido sin abrir · ${t.nombre}` });
      await slack.avisarAuditoria(`Formulario ${f.id} de ${t.nombre} venció sin abrirse. Queda pendiente de reenvío en el panel.`);
      log.push(`Vencido ${f.id}`);
    }
    // 5) Abiertos que superaron el tiempo: se cierran con lo grabado.
    if (f.estado === 'abierto' && f.abierto_at && ahora - new Date(f.abierto_at) >= (comp + 3) * 60000) {
      await finalizar(ctx, f, { motivo: 'tiempo' });
      log.push(`Cerrado por tiempo ${f.id}`);
    }
    // 6) Cancelados o vencidos sin reenvío después de 72 h: No realizado.
    if (['cancelado', 'vencido'].includes(f.estado) && enviado && ahora - enviado >= 72 * 3600000) {
      const tieneHijo = ctx.formularios.some((x) => x.origen_id && x.origen_id === (f.origen_id || f.id) && Number(x.reenvio_n) > Number(f.reenvio_n || 0));
      if (!tieneHijo) cambios.push({ _row: f._row, estado: 'no_realizado' });
    }
  }
  await actualizarFilas('Formularios', cambios);
  return { ok: true, programados: nuevos.length, acciones: log };
}

/* ---------------- Flujo en la tablet ---------------- */

function porToken(ctx, token) {
  const f = token && ctx.formularios.find((x) => x.token === token);
  if (!f) throw error(404, 'Este link no es válido o ya se usó.');
  return f;
}

function payloadTablet(ctx, f) {
  const tienda = tiendaDe(ctx, f.tienda_id);
  const ids = String(f.tomas).split(',').filter(Boolean);
  const hechas = new Set(ctx.evidencias.filter((e) => e.formulario_id === f.id).map((e) => e.toma));
  const limite = new Date(new Date(f.abierto_at).getTime() + Number(ctx.config.ventana_completar_min) * 60000);
  return {
    id: f.id,
    tienda: { nombre: tienda.nombre, pais: tienda.pais },
    tipo: f.tipo,
    codigo: f.codigo,
    limite: iso(limite),
    productos: parseJson(f.productos, []),
    tomas: ids.map((id) => {
      const t = ctx.tomas.find((x) => x.id === id) || { id, nombre: id, instruccion: '' };
      return { id, nombre: t.nombre, instruccion: t.instruccion, segundos_min: t.segundos_min, hecha: hechas.has(id) };
    }),
  };
}

export async function abrir(token) {
  const ctx = await cargar(['Config', 'Tiendas', 'Tomas', 'Formularios', 'Evidencias']);
  const f = porToken(ctx, token);
  const ahora = new Date();
  if (f.estado === 'enviado') {
    const vence = new Date(new Date(f.enviado_at).getTime() + Number(ctx.config.ventana_apertura_min) * 60000);
    if (ahora > vence) throw error(410, 'El tiempo para empezar este formulario terminó.');
    await actualizarFilas('Formularios', [{ _row: f._row, estado: 'abierto', abierto_at: iso(ahora) }]);
    f.estado = 'abierto';
    f.abierto_at = iso(ahora);
    await slack.actualizarAviso({ canal: f.slack_channel, ts: f.slack_ts, texto: `Formulario en curso · empezado ${ahora.toISOString().slice(11, 16)} UTC` });
  }
  if (f.estado !== 'abierto') throw error(410, 'Este formulario ya no está disponible.');
  const p = payloadTablet(ctx, f);
  if (ahora > new Date(new Date(p.limite).getTime() + 3 * 60000)) throw error(410, 'Se terminó el tiempo de este formulario.');
  return p;
}

// Pantalla de espera de la tablet: devuelve el formulario pendiente de la tienda, si hay.
export async function pendienteDeTienda(clave) {
  const ctx = await cargar(['Config', 'Tiendas', 'Formularios']);
  const tienda = clave && ctx.tiendas.find((t) => t.clave && t.clave === clave);
  if (!tienda) throw error(404, 'Link de tienda inválido');
  const ahora = Date.now();
  const ap = Number(ctx.config.ventana_apertura_min) * 60000;
  const comp = (Number(ctx.config.ventana_completar_min) + 3) * 60000;
  const f = ctx.formularios.find((x) => x.tienda_id === tienda.id && x.token && (
    (x.estado === 'enviado' && ahora - new Date(x.enviado_at) < ap)
    || (x.estado === 'abierto' && ahora - new Date(x.abierto_at) < comp)));
  return {
    tienda: { nombre: tienda.nombre },
    pendiente: f ? { token: f.token, tipo: f.tipo, estado: f.estado, vence: iso(new Date(new Date(f.enviado_at).getTime() + ap)) } : null,
    consultado: iso(new Date()),
  };
}

export function validarSubida(ctx, token) {
  const f = porToken(ctx, token);
  if (f.estado !== 'abierto') throw error(410, 'Este formulario ya no acepta videos.');
  return f;
}

export async function registrarToma({ token, toma, archivo, segundos, mime }) {
  const ctx = await cargar();
  const f = validarSubida(ctx, token);
  const tienda = tiendaDe(ctx, f.tienda_id);
  const tomaDef = ctx.tomas.find((t) => t.id === toma);
  if (!tomaDef || !String(f.tomas).split(',').includes(toma)) throw error(400, 'Toma inválida');
  if (ctx.evidencias.some((e) => e.formulario_id === f.id && e.toma === toma)) throw error(409, 'Esta toma ya se cargó');

  if (!archivo?.id) throw error(400, 'Falta el video');
  const ev = { id: nuevoId('E'), formulario_id: f.id, toma, archivo_id: archivo.id, url: archivo.link, segundos, creado_at: iso(new Date()) };
  const preguntas = ctx.preguntas.filter((p) => p.toma === toma && aplicaATienda(p, tienda.tipo));
  let resultado;
  try {
    const video = await descargar(archivo.id);
    resultado = await evaluarToma({ bytes: video.bytes, mime: mime || video.mime, toma: tomaDef, preguntas, productos: parseJson(f.productos, []), codigo: f.codigo, tienda });
    ev.codigo_ok = String(resultado.codigo_escuchado || '').replace(/\D/g, '') === String(f.codigo) ? 'SI' : 'NO';
    ev.evaluado_at = iso(new Date());
  } catch (e) {
    ev.error = e.message;
  }
  await agregarFilas('Evidencias', [ev]);
  if (resultado) {
    const umbral = Number(ctx.config.umbral_confianza);
    await agregarFilas('Respuestas', resultado.respuestas.map((r) => ({
      id: nuevoId('R'), formulario_id: f.id, tienda_id: tienda.id, fecha: iso(new Date()),
      pregunta: r.pregunta, respuesta: r.respuesta, confianza: r.confianza, motivo: r.motivo, segundo: r.segundo ?? -1,
      // Si el código no coincide, todo va a revisión.
      revision: Number(r.confianza) < umbral || ev.codigo_ok === 'NO' ? 'pendiente' : 'ok',
    })));
  }
  return { ok: true, evaluada: !!resultado, codigo_ok: ev.codigo_ok || null };
}

// Vuelve a evaluar con IA las tomas de un formulario que quedaron con error (por ejemplo, si falló Gemini).
export async function reevaluar(ctx, formId) {
  const f = ctx.formularios.find((x) => x.id === formId);
  if (!f) throw error(404, 'Formulario no encontrado');
  const tienda = tiendaDe(ctx, f.tienda_id);
  const pendientes = ctx.evidencias.filter((e) => e.formulario_id === f.id && e.error && e.archivo_id);
  if (!pendientes.length) throw error(400, 'No hay tomas con error para reevaluar');
  const umbral = Number(ctx.config.umbral_confianza);
  let ok = 0;
  const errores = [];
  for (const ev of pendientes) {
    const tomaDef = ctx.tomas.find((t) => t.id === ev.toma);
    const preguntas = ctx.preguntas.filter((p) => p.toma === ev.toma && aplicaATienda(p, tienda.tipo));
    try {
      const video = await descargar(ev.archivo_id);
      const r = await evaluarToma({ bytes: video.bytes, mime: video.mime, toma: tomaDef, preguntas, productos: parseJson(f.productos, []), codigo: f.codigo, tienda });
      const codigoOk = String(r.codigo_escuchado || '').replace(/\D/g, '') === String(f.codigo) ? 'SI' : 'NO';
      await agregarFilas('Respuestas', r.respuestas.map((x) => ({
        id: nuevoId('R'), formulario_id: f.id, tienda_id: tienda.id, fecha: ev.creado_at || iso(new Date()),
        pregunta: x.pregunta, respuesta: x.respuesta, confianza: x.confianza, motivo: x.motivo, segundo: x.segundo ?? -1,
        revision: Number(x.confianza) < umbral || codigoOk === 'NO' ? 'pendiente' : 'ok',
      })));
      await actualizarFilas('Evidencias', [{ _row: ev._row, error: '', codigo_ok: codigoOk, evaluado_at: iso(new Date()) }]);
      ok += 1;
    } catch (e) {
      errores.push(`${ev.toma}: ${e.message}`);
      await actualizarFilas('Evidencias', [{ _row: ev._row, error: e.message }]);
    }
  }
  return { ok: true, evaluadas: ok, errores };
}

export async function finalizar(ctx, f, { motivo = 'completo' } = {}) {
  const tienda = tiendaDe(ctx, f.tienda_id);
  const cruce = Math.random() < Number(ctx.config.cruce_camaras) ? 'SI' : 'NO';
  await actualizarFilas('Formularios', [{ _row: f._row, estado: 'completado', completado_at: iso(new Date()), token: '', cruce_camaras: cruce }]);
  await slack.actualizarAviso({ canal: f.slack_channel, ts: f.slack_ts, texto: `Formulario completado${motivo === 'tiempo' ? ' (cerrado por tiempo)' : ''} · ${tienda.nombre}` });
  const porNum = Object.fromEntries(ctx.preguntas.map((p) => [p.num, p]));
  const resp = ctx.respuestas.filter((r) => r.formulario_id === f.id);
  const { total } = calcularPuntaje(resp, porNum, tienda.tipo);
  const inc = resp.filter((r) => r.revision !== 'pendiente' && esNegativa(porNum[Number(r.pregunta)] || {}, r.respuesta)).length;
  if (resp.length) {
    await slack.enHilo({ canal: f.slack_channel, ts: f.slack_ts, texto: `Resultado preliminar: ${pct(total)} · ${inc} incidencias. Lo vas a ver completo en el panel.` });
  }
}

export async function terminar(token) {
  const ctx = await cargar();
  const f = porToken(ctx, token);
  if (f.estado !== 'abierto') throw error(410, 'Este formulario ya no está abierto.');
  await finalizar(ctx, f);
  return { ok: true };
}

export async function cancelar(token, motivo) {
  const ctx = await cargar(['Config', 'Tiendas', 'Formularios']);
  const f = porToken(ctx, token);
  if (!['enviado', 'abierto'].includes(f.estado)) throw error(410, 'Este formulario ya no se puede cancelar.');
  const tienda = tiendaDe(ctx, f.tienda_id);
  await actualizarFilas('Formularios', [{ _row: f._row, estado: 'cancelado', cancel_motivo: motivo || 'Atendiendo clientes', token: '' }]);
  await slack.actualizarAviso({ canal: f.slack_channel, ts: f.slack_ts, texto: `Formulario cancelado por la tienda · ${motivo || 'Atendiendo clientes'}` });
  await slack.avisarAuditoria(`${tienda.nombre} canceló el formulario ${f.id} (${motivo || 'atendiendo clientes'}). Queda pendiente de reenvío en el panel.`);
  return { ok: true };
}

/* ---------------- Acciones del panel ---------------- */

export async function reenviar(ctx, formId, usuario, cuando, baseUrl) {
  const f = ctx.formularios.find((x) => x.id === formId);
  if (!f) throw error(404, 'Formulario no encontrado');
  if (!['cancelado', 'vencido'].includes(f.estado)) throw error(400, 'Solo se reenvían formularios cancelados o vencidos');
  const ch = cadena(ctx, f);
  const n = Math.max(...ch.map((x) => Number(x.reenvio_n || 0)));
  if (n >= Number(ctx.config.max_reenvios)) throw error(400, `Ya se usaron los ${ctx.config.max_reenvios} reenvíos de este formulario`);
  if (ch.some((x) => ['programado', 'enviado', 'abierto', 'completado'].includes(x.estado))) throw error(400, 'Este formulario ya tiene un reenvío activo o completado');
  const tienda = tiendaDe(ctx, f.tienda_id);
  const fecha = cuando === 'ahora' ? new Date() : proximaFranja({ tienda, config: ctx.config, ahora: new Date() });
  const nuevo = nuevoFormulario({ tienda, tipo: f.tipo, cuando: fecha, origen: f, reenvioN: n + 1, reenviadoPor: usuario.email });
  await agregarFilas('Formularios', [nuevo]);
  if (cuando === 'ahora') {
    ctx.formularios = (await leerTablas(['Formularios'])).Formularios;
    const fila = ctx.formularios.find((x) => x.id === nuevo.id);
    await despachar(ctx, fila, baseUrl);
  }
  return { ok: true, id: nuevo.id, programado_para: nuevo.programado_para };
}

export async function marcarNoRealizado(ctx, formId) {
  const f = ctx.formularios.find((x) => x.id === formId);
  if (!f || !['cancelado', 'vencido'].includes(f.estado)) throw error(400, 'Solo para formularios cancelados o vencidos');
  await actualizarFilas('Formularios', [{ _row: f._row, estado: 'no_realizado' }]);
  return { ok: true };
}

export async function revisar(ctx, respuestaId, respuestaFinal, usuario) {
  const r = ctx.respuestas.find((x) => x.id === respuestaId);
  if (!r) throw error(404, 'Respuesta no encontrada');
  await actualizarFilas('Respuestas', [{ _row: r._row, revision: 'revisada', respuesta_final: respuestaFinal, revisado_por: usuario.email, revisado_at: iso(new Date()) }]);
  return { ok: true };
}

export async function registrarCruce(ctx, formId, coincide, usuario) {
  const f = ctx.formularios.find((x) => x.id === formId);
  if (!f) throw error(404, 'Formulario no encontrado');
  await actualizarFilas('Formularios', [{
    _row: f._row, cruce_resultado: coincide ? 'coincide' : 'no_coincide', cruce_por: usuario.email,
    ...(coincide ? {} : { estado: 'anulado' }),
  }]);
  return { ok: true };
}

// Datos para el panel (sin tokens ni códigos).
export function dataset(ctx, baseUrl = '') {
  return {
    config: ctx.config,
    preguntas: ctx.preguntas,
    tomas: ctx.tomas,
    formularios: ctx.formularios.map(({ token, codigo, _row, ...f }) => ({
      ...f, productos: parseJson(f.productos, []),
      link: token && ['enviado', 'abierto'].includes(f.estado) ? `${baseUrl}/f/${token}` : '',
    })),
    tiendas: ctx.tiendas.map(({ _row, ...t }) => ({ ...t, link_tablet: t.clave ? `${baseUrl}/t/${t.clave}` : '' })),
    evidencias: ctx.evidencias.map(({ _row, ...e }) => e),
    respuestas: ctx.respuestas.map(({ _row, ...r }) => r),
    usuarios: ctx.usuarios.map(({ _row, ...u }) => u),
    sincronizado: new Date().toISOString(),
  };
}
