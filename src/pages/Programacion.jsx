import { useMemo, useState } from 'react';
import { CalendarClock, Settings2, Send } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { Card, CardTitle, Tabla, Selector, Boton, Badge, Aviso, LinkCopiable } from '../components/ui.jsx';
import { fecha, fechaHora, TONO_ESTADO, nombreEstado } from '../lib/format.js';

function Parametro({ k, v, nota }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-borde/50 last:border-0">
      <div><div className="text-xs text-tx">{k}</div>{nota && <div className="text-[10px] text-muted">{nota}</div>}</div>
      <div className="text-xs font-semibold text-tx tabular-nums text-right">{v}</div>
    </div>
  );
}

export default function Programacion() {
  const { data, d, accion } = useDatos();
  const c = data.config;
  const [tienda, setTienda] = useState(data.tiendas[0]?.id);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null);

  const proximos = useMemo(() => d.formularios
    .filter((f) => ['programado', 'enviado', 'abierto'].includes(f.estado))
    .sort((a, b) => String(a.programado_para).localeCompare(b.programado_para)), [d]);

  async function probar() {
    setOcupado(true);
    try {
      const r = await accion({ accion: 'programar_ahora', tienda, tipo: 'semanal' });
      setMsg({ tono: 'ok', texto: 'Formulario enviado. Aparece en la tablet de la tienda (pantalla de espera) o abrilo con este link:', link: r.link });
    } catch (e) { setMsg({ tono: 'mal', texto: e.message }); } finally { setOcupado(false); }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4 items-start">
      <Card className="lg:col-span-2">
        <CardTitle icon={CalendarClock} extra={<span className="text-[11px] text-muted">Hora local de cada tienda</span>}>Próximos y en curso</CardTitle>
        <Tabla columnas={[
          { key: 'tienda', titulo: 'Tienda', ancho: 170, valor: (f) => f.tienda.nombre, render: (f) => <div><div className="font-semibold text-tx">{f.tienda.nombre}</div><div className="text-[10px] text-muted">{f.tienda.pais}</div></div> },
          { key: 'dia', titulo: 'Día', valor: (f) => f.programado_para, render: (f) => fecha(f.programado_para, f.tienda.timezone) },
          { key: 'hora', titulo: 'Hora', num: true, render: (f) => fechaHora(f.programado_para, f.tienda.timezone).slice(-5) },
          { key: 'tipo', titulo: 'Tipo', render: (f) => <span className="inline-flex gap-1">{f.tipo === 'mensual' ? 'Mensual' : 'Semanal'}{Number(f.reenvio_n) > 0 && <Badge tono="marca">R{f.reenvio_n}</Badge>}</span> },
          { key: 'estado', titulo: 'Estado', render: (f) => <Badge tono={TONO_ESTADO[f.estado]}>{nombreEstado(f.estado)}</Badge> },
          { key: 'link', titulo: '', render: (f) => f.link ? <a href={f.link} target="_blank" rel="noreferrer" className="text-marca font-semibold">Abrir</a> : null },
        ]} filas={proximos} vacio="No hay formularios programados" maxAlto="calc(100vh - 240px)" />
        <p className="text-[11px] text-muted mt-2">Las tomas, los productos y el código se eligen recién al momento del envío; hasta ese momento nadie los conoce.</p>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardTitle icon={Settings2}>Reglas vigentes</CardTitle>
          <Parametro k="Franjas" v={String(c.franjas).replace(',', ' y ')} nota="Hora local; se pueden pisar por tienda" />
          <Parametro k="Formularios semanales por tienda" v={c.formularios_semanales} />
          <Parametro k="Tomas por formulario" v={c.tomas_por_formulario} />
          <Parametro k="Tiempo para abrir" v={`${c.ventana_apertura_min} min`} nota={`Recordatorio a los ${c.recordatorio_min} min`} />
          <Parametro k="Tiempo para completar" v={`${c.ventana_completar_min} min`} />
          <Parametro k="Días hábiles" v={String(c.dias_habiles).split(',').map((n) => ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'][n]).join(' ')} />
          <Parametro k="Reenvíos por formulario" v={c.max_reenvios} nota="Los hace un responsable desde Reenvíos" />
          <Parametro k="Umbral de confianza IA" v={c.umbral_confianza} />
          <Parametro k="Cruce con cámaras" v={`${Math.round(Number(c.cruce_camaras) * 100)}%`} />
          <p className="text-[10px] text-muted mt-2">Se editan en la pestaña Config del Google Sheet.</p>
        </Card>
        {data.usuario?.rol === 'admin' && (
          <Card>
            <CardTitle icon={Send}>Enviar formulario de prueba</CardTitle>
            <div className="space-y-2">
              <Selector value={tienda} onChange={setTienda} opciones={data.tiendas.map((t) => ({ value: t.id, label: t.nombre }))} />
              <Boton variante="primario" icon={Send} cargando={ocupado} onClick={probar} className="w-full">Enviar ahora</Boton>
              {msg && <Aviso tono={msg.tono}>{msg.texto}</Aviso>}
              {msg?.link && <LinkCopiable url={msg.link} />}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
