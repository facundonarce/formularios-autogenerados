import { useMemo, useState } from 'react';
import { Download, ClipboardList } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { useAccionesHeader } from '../components/Shell.jsx';
import { Card, Tabla, Toolbar, Selector, Buscador, Toggle, Boton, Badge, Guion } from '../components/ui.jsx';
import DetalleFormulario from '../components/DetalleFormulario.jsx';
import { fechaHora, pct, colorPct, TONO_ESTADO, nombreEstado, aCsv } from '../lib/format.js';
import { ESTADOS } from '../../shared/catalog.js';

export default function Formularios() {
  const { d } = useDatos();
  const [estado, setEstado] = useState('todos');
  const [pais, setPais] = useState('Todos');
  const [tipo, setTipo] = useState('todos');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);

  const filas = useMemo(() => d.formularios
    .filter((f) => (estado === 'todos' || f.estado === estado)
      && (pais === 'Todos' || f.tienda.pais === pais)
      && (tipo === 'todos' || f.tipo === tipo)
      && (!q || `${f.tienda.nombre} ${f.id}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.estado === 'programado') - (b.estado === 'programado') || String(b.fechaRef).localeCompare(a.fechaRef)), [d, estado, pais, tipo, q]);

  const columnas = [
    { key: 'tienda', titulo: 'Tienda', ancho: 180, valor: (f) => f.tienda.nombre, render: (f) => <div><div className="font-semibold text-tx">{f.tienda.nombre}</div><div className="text-[10px] text-muted">{f.id}</div></div> },
    { key: 'fechaRef', titulo: 'Fecha (local)', valor: (f) => f.fechaRef, render: (f) => <span className="tabular-nums">{fechaHora(f.fechaRef, f.tienda.timezone)}</span> },
    { key: 'tipo', titulo: 'Tipo', render: (f) => <span className="inline-flex gap-1">{f.tipo === 'mensual' ? 'Mensual' : 'Semanal'}{Number(f.reenvio_n) > 0 && <Badge tono="marca">R{f.reenvio_n}</Badge>}</span> },
    { key: 'estado', titulo: 'Estado', render: (f) => <Badge tono={TONO_ESTADO[f.estado]}>{nombreEstado(f.estado)}</Badge>, csv: (f) => f.estado },
    { key: 'tomas', titulo: 'Tomas', render: (f) => f.tomas ? <span className="text-[11px]">{String(f.tomas).replace(/,/g, ' · ')}</span> : <Guion /> },
    { key: 'incidencias', titulo: 'Incidencias', num: true, render: (f) => f.puntaje ? f.incidencias : <Guion /> },
    { key: 'revisar', titulo: 'A revisar', num: true, valor: (f) => f.pendientesRevision, render: (f) => f.pendientesRevision ? <span className="text-medio font-semibold">{f.pendientesRevision}</span> : <Guion /> },
    { key: 'puntaje', titulo: 'Puntaje', num: true, valor: (f) => f.puntaje?.total ?? null, render: (f) => f.puntaje?.total != null ? <span className={`font-bold ${colorPct(f.puntaje.total)}`}>{pct(f.puntaje.total)}</span> : <Guion />, csv: (f) => f.puntaje?.total != null ? (f.puntaje.total * 100).toFixed(1) : '' },
  ];

  useAccionesHeader(<Boton icon={Download} onClick={() => aCsv(columnas, filas, 'formularios')}>Exportar CSV</Boton>, [filas]);

  return (
    <div className="space-y-4">
      <Card>
        <Toolbar>
          <Buscador value={q} onChange={setQ} placeholder="Buscar tienda o ID…" />
          <Selector etiqueta="Estado" value={estado} onChange={setEstado} opciones={[{ value: 'todos', label: 'Todos' }, ...Object.entries(ESTADOS).map(([value, label]) => ({ value, label }))]} />
          <Selector etiqueta="País" value={pais} onChange={setPais} opciones={['Todos', ...d.paises]} />
          <Toggle value={tipo} onChange={setTipo} opciones={[{ value: 'todos', label: 'Todos' }, { value: 'semanal', label: 'Semanales' }, { value: 'mensual', label: 'Mensuales' }]} />
          <span className="ml-auto text-[11px] text-muted tabular-nums inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />{filas.length.toLocaleString('es-AR')} formularios</span>
        </Toolbar>
        <Tabla columnas={columnas} filas={filas} onFila={setSel} maxAlto="calc(100vh - 260px)" />
      </Card>
      {sel && <DetalleFormulario form={d.formularios.find((f) => f.id === sel.id)} onCerrar={() => setSel(null)} />}
    </div>
  );
}
