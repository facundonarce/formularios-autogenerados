// Drawer con el detalle de un formulario: datos, cadena de reenvíos, evidencias y respuestas por toma.
import { useState } from 'react';
import { Video, Mic, CheckCircle2, AlertTriangle, Clock, ExternalLink, Sparkles } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { Drawer, Card, CardTitle, Badge, Tabla, Guion, LinkCopiable, Boton, Aviso } from './ui.jsx';
import { fechaHora, pct, colorPct, TONO_ESTADO, nombreEstado } from '../lib/format.js';
import { esNegativa, NO_RELEVABLE, norm } from '../../shared/logic.js';
import { MODULOS } from '../../shared/catalog.js';

export function BadgeRespuesta({ pregunta, valor }) {
  if (!valor) return <Guion />;
  if (norm(valor) === NO_RELEVABLE) return <Badge tono="neutro">No se ve</Badge>;
  return <Badge tono={esNegativa(pregunta, valor) ? 'mal' : 'ok'}>{valor}</Badge>;
}

function Dato({ k, v }) {
  return <div><div className="text-[10px] uppercase font-bold text-muted">{k}</div><div className="text-xs text-tx mt-0.5">{v || <Guion />}</div></div>;
}

export default function DetalleFormulario({ form, onCerrar }) {
  const { d, data, accion } = useDatos();
  const [reev, setReev] = useState({ cargando: false, msg: null });
  if (!form) return null;
  const conError = form.evidencias.filter((e) => e.error).length;
  const puede = ['admin', 'responsable'].includes(data.usuario?.rol);
  async function reevaluar() {
    setReev({ cargando: true, msg: null });
    try {
      const r = await accion({ accion: 'reevaluar', formulario: form.id });
      setReev({ cargando: false, msg: { tono: r.errores?.length ? 'mal' : 'ok', texto: r.errores?.length ? `Evaluadas ${r.evaluadas}. Errores: ${r.errores.join(' · ')}` : `Listo: ${r.evaluadas} tomas evaluadas.` } });
    } catch (e) {
      setReev({ cargando: false, msg: { tono: 'mal', texto: e.message } });
    }
  }
  const umbral = Number(data.config.umbral_confianza);
  const tz = form.tienda.timezone;
  const tomas = String(form.tomas || '').split(',').filter(Boolean);

  return (
    <Drawer abierto onCerrar={onCerrar} titulo={`${form.tienda.nombre} · ${form.tipo === 'mensual' ? 'Relevamiento mensual' : 'Formulario semanal'}`}
      subtitulo={`${form.id} · hora local de la tienda (${tz.replace('America/', '').replace(/_/g, ' ')})`}>
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge tono={TONO_ESTADO[form.estado]}>{nombreEstado(form.estado)}</Badge>
          {Number(form.reenvio_n) > 0 && <Badge tono="marca">Reenvío {form.reenvio_n}</Badge>}
          {form.cruce_camaras === 'SI' && <Badge tono={form.cruce_resultado === 'no_coincide' ? 'mal' : form.cruce_resultado ? 'ok' : 'medio'}>Cruce cámaras: {form.cruce_resultado ? form.cruce_resultado.replace('_', ' ') : 'pendiente'}</Badge>}
          {form.puntaje?.total != null && <span className={`ml-auto text-xl font-bold tabular-nums ${colorPct(form.puntaje.total)}`}>{pct(form.puntaje.total)}</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Dato k="Programado" v={fechaHora(form.programado_para, tz)} />
          <Dato k="Enviado" v={fechaHora(form.enviado_at, tz)} />
          <Dato k="Abierto" v={fechaHora(form.abierto_at, tz)} />
          <Dato k="Completado" v={fechaHora(form.completado_at, tz)} />
          {form.cancel_motivo && <Dato k="Motivo de cancelación" v={form.cancel_motivo} />}
          {form.reenviado_por && <Dato k="Reenviado por" v={form.reenviado_por} />}
          <Dato k="Reenvíos usados" v={`${form.reenviosUsados} de ${d.max}`} />
        </div>
        {form.link && (
          <div className="mt-4">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Link del formulario (un solo uso)</div>
            <LinkCopiable url={form.link} />
          </div>
        )}
        {form.productos?.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Productos pedidos en T3</div>
            <ul className="text-xs text-tx2 list-disc pl-4 space-y-0.5">{form.productos.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
      </Card>

      {conError > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-tx2"><b className="text-mal">{conError} {conError === 1 ? 'toma quedó' : 'tomas quedaron'} sin evaluar</b> por un error de la IA. Los videos están guardados en Drive y se reintentan solos cada 5 minutos (hasta 6 veces), o podés reintentar ahora.</div>
            <Boton variante="primario" icon={Sparkles} cargando={reev.cargando} disabled={!puede} onClick={reevaluar}>Reevaluar con IA</Boton>
          </div>
          {reev.msg && <div className="mt-3"><Aviso tono={reev.msg.tono}>{reev.msg.texto}</Aviso></div>}
        </Card>
      )}

      {form.puntaje && (
        <Card>
          <CardTitle>Puntaje por módulo</CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {MODULOS.map((m) => {
              const x = form.puntaje.modulos[m];
              return (
                <div key={m} className="rounded-xl border border-borde p-2.5" title={x.pct != null ? `En juego: ${x.enJuego.toFixed(1)} | Descuento: ${x.descuento.toFixed(1)}` : ''}>
                  <div className="text-[10px] text-muted uppercase font-bold">{m}</div>
                  <div className={`text-base font-bold tabular-nums ${colorPct(x.pct)}`}>{pct(x.pct)}</div>
                  <div className="text-[10px] text-muted tabular-nums">{x.evaluadas ? `${x.incidencias} inc. / ${x.evaluadas}` : 'sin evaluar'}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {form.cadena.length > 1 && (
        <Card>
          <CardTitle>Cadena de reenvíos</CardTitle>
          <div className="space-y-1.5">
            {[...form.cadena].sort((a, b) => Number(a.reenvio_n || 0) - Number(b.reenvio_n || 0)).map((x) => (
              <div key={x.id} className={`flex items-center gap-2 text-xs ${x.id === form.id ? 'font-bold text-tx' : 'text-tx2'}`}>
                <span className="w-20">{Number(x.reenvio_n) ? `Reenvío ${x.reenvio_n}` : 'Original'}</span>
                <Badge tono={TONO_ESTADO[x.estado]}>{nombreEstado(x.estado)}</Badge>
                <span className="text-muted tabular-nums">{fechaHora(x.enviado_at || x.programado_para, tz)}</span>
                <span className="text-muted">· {String(x.tomas).replace(/,/g, ', ')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tomas.map((tid) => {
        const toma = d.tomaPorId[tid] || { nombre: tid };
        const ev = form.evidencias.find((e) => e.toma === tid);
        const resp = form.respuestas.filter((r) => d.preguntaPorNum[Number(r.pregunta)]?.toma === tid);
        return (
          <Card key={tid}>
            <CardTitle icon={Video} extra={ev ? (
              <span className="flex items-center gap-2 text-[11px] text-muted">
                <span className="tabular-nums">{ev.segundos}s</span>
                {ev.codigo_ok && <span className="inline-flex items-center gap-1"><Mic className="w-3 h-3" />Código {ev.codigo_ok === 'SI' ? <CheckCircle2 className="w-3.5 h-3.5 text-ok" /> : <AlertTriangle className="w-3.5 h-3.5 text-mal" />}</span>}
              </span>
            ) : <Badge tono="neutro">Sin evidencia</Badge>}>{tid} · {toma.nombre}</CardTitle>
            {ev?.url ? (
              <a href={ev.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-borde bg-sec h-20 mb-3 text-xs font-semibold text-marca hover:bg-marca-bg">
                <Video className="w-4 h-4" /> Ver video en Google Drive <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : ev ? (
              <div className="rounded-xl border border-dashed border-borde bg-sec h-28 mb-3 flex items-center justify-center text-[11px] text-muted">
                <Video className="w-4 h-4 mr-1.5" /> Video de la toma (en el modo demo no hay archivos)
              </div>
            ) : null}
            {ev?.error && <div className="text-[11px] text-mal mb-2">Error al evaluar{/^\[(\d+)\]/.test(ev.error) ? ` (intento ${ev.error.match(/^\[(\d+)\]/)[1]})` : ''}: {ev.error.replace(/^\[\d+\]\s*/, '')}</div>}
            {resp.length > 0 && (
              <Tabla densa columnas={[
                { key: 'pregunta', titulo: 'N°', render: (r) => r.pregunta },
                { key: 'texto', titulo: 'Pregunta', ancho: 260, render: (r) => <span className="text-tx">{d.preguntaPorNum[Number(r.pregunta)]?.texto}</span> },
                { key: 'respuesta', titulo: 'IA', render: (r) => <BadgeRespuesta pregunta={d.preguntaPorNum[Number(r.pregunta)]} valor={r.respuesta} /> },
                { key: 'confianza', titulo: 'Conf.', num: true, render: (r) => <span className={Number(r.confianza) < umbral ? 'text-medio font-semibold' : ''}>{r.confianza}</span> },
                { key: 'final', titulo: 'Final', render: (r) => r.revision === 'pendiente'
                  ? <Badge tono="medio"><Clock className="w-3 h-3 mr-0.5" />Revisar</Badge>
                  : <BadgeRespuesta pregunta={d.preguntaPorNum[Number(r.pregunta)]} valor={r.respuesta_final || r.respuesta} /> },
                { key: 'motivo', titulo: 'Motivo', ancho: 200, render: (r) => <span className="text-[11px]">{r.motivo}{Number(r.segundo) >= 0 ? <span className="text-muted"> · seg. {r.segundo}</span> : ''}</span> },
              ]} filas={resp} />
            )}
          </Card>
        );
      })}
    </Drawer>
  );
}
