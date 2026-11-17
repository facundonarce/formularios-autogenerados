import { useMemo, useState } from 'react';
import { ListChecks, Video } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { Card, CardTitle, Tabla, Toolbar, Selector, Buscador, Badge, Guion } from '../components/ui.jsx';
import { pct } from '../lib/format.js';
import { MODULOS, PESOS } from '../../shared/catalog.js';

const TRAT = { azar: ['Al azar', 'marca'], mensual: ['Mensual', 'medio'], camaras: ['Cámaras', 'neutro'], declarativa: ['Declarativa', 'neutro'] };

export default function Preguntas() {
  const { data } = useDatos();
  const [modulo, setModulo] = useState('Todos');
  const [trat, setTrat] = useState('todos');
  const [q, setQ] = useState('');
  const filas = useMemo(() => data.preguntas
    .filter((p) => (modulo === 'Todos' || p.modulo === modulo) && (trat === 'todos' || p.tratamiento === trat) && (!q || p.texto.toLowerCase().includes(q.toLowerCase())))
    .map((p) => ({ ...p, id: p.num })), [data, modulo, trat, q]);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={Video}>Tomas guiadas</CardTitle>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {data.tomas.map((t) => {
            const n = data.preguntas.filter((p) => p.toma === t.id).length;
            return (
              <div key={t.id} className="rounded-xl border border-borde p-3">
                <div className="flex items-center gap-1.5">
                  <Badge tono={t.tipo === 'semanal' ? 'marca' : 'medio'}>{t.id}</Badge>
                  <span className="text-xs font-bold text-tx">{t.nombre}</span>
                  <span className="ml-auto text-[10px] text-muted tabular-nums">{n} preg. · {t.segundos_min}s mín.</span>
                </div>
                <p className="text-[11px] text-tx2 mt-1.5 leading-snug">{t.instruccion}</p>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <CardTitle icon={ListChecks}>Preguntas con puntaje ({filas.length})</CardTitle>
        <Toolbar>
          <Buscador value={q} onChange={setQ} placeholder="Buscar pregunta…" />
          <Selector etiqueta="Módulo" value={modulo} onChange={setModulo} opciones={['Todos', ...MODULOS]} />
          <Selector etiqueta="Tratamiento" value={trat} onChange={setTrat} opciones={[{ value: 'todos', label: 'Todos' }, ...Object.entries(TRAT).map(([value, [label]]) => ({ value, label }))]} />
        </Toolbar>
        <Tabla densa maxAlto="calc(100vh - 300px)" columnas={[
          { key: 'num', titulo: 'N°', num: true },
          { key: 'texto', titulo: 'Pregunta', ancho: 320, render: (p) => <span className="text-tx">{p.texto}</span> },
          { key: 'modulo', titulo: 'Módulo' },
          { key: 'impacto', titulo: 'Impacto', render: (p) => <Badge tono={p.impacto === 'Alto' ? 'mal' : p.impacto === 'Medio' ? 'medio' : 'neutro'}>{p.impacto} · {PESOS[p.impacto]}</Badge> },
          { key: 'aplica_a', titulo: 'Aplica a', render: (p) => ({ ambos: 'Ambos', oficial: 'Oficial', reseller: 'Reseller' }[p.aplica_a] || 'Ambos') },
          { key: 'tratamiento', titulo: 'Tratamiento', render: (p) => <Badge tono={TRAT[p.tratamiento]?.[1]}>{TRAT[p.tratamiento]?.[0]}</Badge> },
          { key: 'toma', titulo: 'Toma', render: (p) => p.toma || <Guion /> },
          { key: 'incumplimiento_2026', titulo: 'Incumpl. externa 2026', num: true, valor: (p) => p.incumplimiento_2026 ?? null, render: (p) => p.incumplimiento_2026 != null ? pct(p.incumplimiento_2026, 0) : <Guion /> },
        ]} filas={filas} />
      </Card>
    </div>
  );
}
