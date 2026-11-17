import { useMemo, useState } from 'react';
import { ScanEye, Cctv, Check, X, Info } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { Card, CardTitle, Tabla, Boton, Badge, Toggle, Aviso, Guion } from '../components/ui.jsx';
import DetalleFormulario, { BadgeRespuesta } from '../components/DetalleFormulario.jsx';
import { fechaHora, hace } from '../lib/format.js';

export default function Revision() {
  const { data, d, accion } = useDatos();
  const [vista, setVista] = useState('respuestas');
  const [ocupado, setOcupado] = useState(null);
  const [msg, setMsg] = useState(null);
  const [sel, setSel] = useState(null);
  const rol = data.usuario?.rol;

  async function hacer(id, body) {
    setOcupado(id);
    try { await accion(body); setMsg(null); } catch (e) { setMsg(e.message); } finally { setOcupado(null); }
  }

  const respuestas = useMemo(() => [...d.respuestasPendientes].sort((a, b) => Number(a.confianza) - Number(b.confianza)), [d]);

  const colResp = [
    { key: 'tienda', titulo: 'Tienda', ancho: 160, valor: (r) => r.tienda?.nombre, render: (r) => <div><div className="font-semibold text-tx">{r.tienda?.nombre}</div><div className="text-[10px] text-muted">{hace(r.fecha)}</div></div> },
    { key: 'pregunta', titulo: 'Pregunta', ancho: 280, render: (r) => <div><span className="text-muted">{r.pregunta} · {r.preguntaObj?.toma} · </span><span className="text-tx">{r.preguntaObj?.texto}</span></div> },
    { key: 'respuesta', titulo: 'IA dijo', render: (r) => <BadgeRespuesta pregunta={r.preguntaObj} valor={r.respuesta} /> },
    { key: 'confianza', titulo: 'Conf.', num: true, render: (r) => <span className="text-medio font-semibold">{r.confianza}</span> },
    { key: 'motivo', titulo: 'Motivo', ancho: 200, render: (r) => <span className="text-[11px]">{r.motivo}{Number(r.segundo) >= 0 && <span className="text-muted"> · seg. {r.segundo}</span>}</span> },
    { key: 'acciones', titulo: 'Respuesta final', render: (r) => {
      const ops = r.preguntaObj?.tipo_respuesta === 'escala' ? ['Buena', 'Regular', 'Mala'] : ['Si', 'No'];
      return (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {[...ops, 'No se puede relevar'].map((o) => (
            <Boton key={o} variante={o === r.respuesta ? 'primario' : 'secundario'} className="!px-2" cargando={ocupado === `${r.id}${o}`}
              onClick={() => hacer(`${r.id}${o}`, { accion: 'revisar', respuesta: r.id, valor: o })}>{o === 'No se puede relevar' ? 'No se ve' : o}</Boton>
          ))}
        </div>
      );
    } },
  ];

  const colCruce = [
    { key: 'tienda', titulo: 'Tienda', ancho: 170, valor: (f) => f.tienda.nombre, render: (f) => <div><div className="font-semibold text-tx">{f.tienda.nombre}</div><div className="text-[10px] text-muted">{f.id}</div></div> },
    { key: 'ventana', titulo: 'Ventana a revisar (hora local)', render: (f) => (
      <span className="tabular-nums">{fechaHora(new Date(new Date(f.abierto_at).getTime() - 30 * 60000).toISOString(), f.tienda.timezone)} → {fechaHora(f.completado_at, f.tienda.timezone).slice(-5)}</span>
    ), title: () => '30 minutos antes de abrir el formulario hasta que se completó' },
    { key: 'tomas', titulo: 'Tomas', render: (f) => String(f.tomas).replace(/,/g, ' · ') },
    { key: 'incidencias', titulo: 'Incidencias IA', num: true, render: (f) => f.puntaje ? f.incidencias : <Guion /> },
    { key: 'acciones', titulo: '', render: (f) => (
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Boton icon={Check} disabled={rol !== 'admin'} cargando={ocupado === `${f.id}si`} onClick={() => hacer(`${f.id}si`, { accion: 'cruce', formulario: f.id, coincide: true })}>Coincide</Boton>
        <Boton variante="peligro" icon={X} disabled={rol !== 'admin'} cargando={ocupado === `${f.id}no`} onClick={() => hacer(`${f.id}no`, { accion: 'cruce', formulario: f.id, coincide: false })}>No coincide · anular</Boton>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle value={vista} onChange={setVista} opciones={[
          { value: 'respuestas', label: `Baja confianza (${d.respuestasPendientes.length})` },
          { value: 'cruces', label: `Cruce con cámaras (${d.crucesPendientes.length})` },
        ]} />
      </div>
      {msg && <Aviso tono="mal">{msg}</Aviso>}
      {vista === 'respuestas' ? (
        <>
          <Aviso tono="marca"><span className="inline-flex gap-1.5"><Info className="w-3.5 h-3.5 mt-px text-marca shrink-0" />Respuestas de la IA con confianza menor a {data.config.umbral_confianza}, o de videos donde no se escuchó bien el código. No suman al puntaje hasta que alguien las confirma. Hacé clic en una fila para ver el video.</span></Aviso>
          <Card>
            <CardTitle icon={ScanEye}>Respuestas para revisar</CardTitle>
            <Tabla columnas={colResp} filas={respuestas} onFila={(r) => setSel(r.form)} vacio="No hay respuestas pendientes de revisión" maxAlto="calc(100vh - 300px)" />
          </Card>
        </>
      ) : (
        <>
          <Aviso tono="marca"><span className="inline-flex gap-1.5"><Info className="w-3.5 h-3.5 mt-px text-marca shrink-0" />Se elige al azar el {Math.round(Number(data.config.cruce_camaras) * 100)}% de los formularios completados. Compará la grabación de las cámaras en esa ventana con lo que muestran los videos. Si no coincide, el formulario se anula. Solo el rol Administrador puede resolver cruces.</span></Aviso>
          <Card>
            <CardTitle icon={Cctv}>Cruces pendientes</CardTitle>
            <Tabla columnas={colCruce} filas={d.crucesPendientes} onFila={setSel} vacio="No hay cruces pendientes" maxAlto="calc(100vh - 300px)" />
          </Card>
        </>
      )}
      {sel && <DetalleFormulario form={d.formularios.find((f) => f.id === sel.id)} onCerrar={() => setSel(null)} />}
    </div>
  );
}
