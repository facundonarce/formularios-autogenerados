import { useState } from 'react';
import { Send, CalendarClock, XCircle, RotateCcw, Info } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { Card, CardTitle, Tabla, Boton, Badge, Modal, Aviso } from '../components/ui.jsx';
import DetalleFormulario from '../components/DetalleFormulario.jsx';
import { fechaHora, hace, TONO_ESTADO, nombreEstado } from '../lib/format.js';

export default function Reenvios() {
  const { data, d, accion } = useDatos();
  const [confirmar, setConfirmar] = useState(null); // { form, tipo }
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sel, setSel] = useState(null);
  const puede = ['admin', 'responsable'].includes(data.usuario?.rol);

  async function ejecutar() {
    setOcupado(true);
    try {
      const { form, tipo } = confirmar;
      if (tipo === 'no_realizado') await accion({ accion: 'no_realizado', formulario: form.id });
      else await accion({ accion: 'reenviar', formulario: form.id, cuando: tipo });
      setMsg({ tono: 'ok', texto: tipo === 'no_realizado' ? `${form.tienda.nombre}: marcado como No realizado.` : `${form.tienda.nombre}: se ${tipo === 'ahora' ? 'envió' : 'programó'} un formulario nuevo con otras tomas.` });
    } catch (e) {
      setMsg({ tono: 'mal', texto: e.message });
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  }

  const columnas = [
    { key: 'tienda', titulo: 'Tienda', ancho: 180, valor: (f) => f.tienda.nombre, render: (f) => <div><div className="font-semibold text-tx">{f.tienda.nombre}</div><div className="text-[10px] text-muted">{f.tienda.pais}</div></div> },
    { key: 'estado', titulo: 'Estado', render: (f) => <Badge tono={TONO_ESTADO[f.estado]}>{nombreEstado(f.estado)}</Badge> },
    { key: 'motivo', titulo: 'Motivo', render: (f) => f.estado === 'vencido' ? 'No se abrió a tiempo' : (f.cancel_motivo || 'Cancelado por la tienda') },
    { key: 'cuando', titulo: 'Cuándo', valor: (f) => f.enviado_at, render: (f) => <span title={fechaHora(f.enviado_at, f.tienda.timezone)}>{hace(f.enviado_at)}</span> },
    { key: 'usados', titulo: 'Reenvíos', num: true, valor: (f) => f.reenviosUsados, render: (f) => <span className={f.reenviosUsados >= d.max ? 'text-mal font-semibold' : ''}>{f.reenviosUsados} / {d.max}</span> },
    { key: 'acciones', titulo: '', render: (f) => (
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Boton variante="primario" icon={Send} disabled={!puede || f.reenviosUsados >= d.max} onClick={() => setConfirmar({ form: f, tipo: 'ahora' })}>Reenviar ahora</Boton>
        <Boton icon={CalendarClock} disabled={!puede || f.reenviosUsados >= d.max} onClick={() => setConfirmar({ form: f, tipo: 'franja' })}>Próxima franja</Boton>
        <Boton variante="peligro" icon={XCircle} disabled={!puede} onClick={() => setConfirmar({ form: f, tipo: 'no_realizado' })}>No realizado</Boton>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <Aviso tono="marca">
        <span className="inline-flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-px shrink-0 text-marca" />
          Formularios que la tienda canceló (por ejemplo, porque entró un cliente) o que no se abrieron a tiempo. Cada reenvío manda un formulario
          distinto (otras tomas y otros productos). Máximo {d.max} reenvíos por formulario; si no se reenvía en 72 h queda como No realizado.</span>
      </Aviso>
      {msg && <Aviso tono={msg.tono}>{msg.texto}</Aviso>}
      <Card>
        <CardTitle icon={RotateCcw}>Pendientes de reenvío</CardTitle>
        <Tabla columnas={columnas} filas={d.pendientesReenvio} onFila={setSel} vacio="No hay formularios pendientes de reenvío" />
      </Card>

      <Modal abierto={!!confirmar} onCerrar={() => setConfirmar(null)} titulo={confirmar?.tipo === 'no_realizado' ? 'Marcar como No realizado' : 'Reenviar formulario'}>
        {confirmar && (
          <div className="space-y-4">
            <p className="text-xs text-tx2">
              {confirmar.tipo === 'no_realizado'
                ? `El formulario de ${confirmar.form.tienda.nombre} queda como No realizado y no se vuelve a enviar.`
                : confirmar.tipo === 'ahora'
                  ? `Se envía ahora mismo un formulario nuevo a ${confirmar.form.tienda.nombre}; aparece en la tablet de la tienda. Va a ser el reenvío ${confirmar.form.reenviosUsados + 1} de ${d.max}.`
                  : `Se programa un formulario nuevo para ${confirmar.form.tienda.nombre} en la próxima franja (10 a 11 o 14 a 15, hora local). Va a ser el reenvío ${confirmar.form.reenviosUsados + 1} de ${d.max}.`}
            </p>
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setConfirmar(null)}>Volver</Boton>
              <Boton variante={confirmar.tipo === 'no_realizado' ? 'peligro' : 'primario'} cargando={ocupado} onClick={ejecutar}>Confirmar</Boton>
            </div>
          </div>
        )}
      </Modal>
      {sel && <DetalleFormulario form={d.formularios.find((f) => f.id === sel.id)} onCerrar={() => setSel(null)} />}
    </div>
  );
}
