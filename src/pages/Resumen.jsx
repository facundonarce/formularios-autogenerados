import { useMemo, useState } from 'react';
import { ClipboardCheck, RotateCcw, ScanEye, Gauge, Download, Store } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { useAccionesHeader } from '../components/Shell.jsx';
import { Card, CardTitle, Kpi, Tabla, Toolbar, Selector, Toggle, Boton, Badge, Guion } from '../components/ui.jsx';
import { pct, colorPct, fecha, aCsv, TONO_ESTADO, nombreEstado } from '../lib/format.js';
import { MODULOS, PESOS } from '../../shared/catalog.js';
import { esNegativa } from '../../shared/logic.js';

const NOMBRE_MES = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

export default function Resumen() {
  const { data, d } = useDatos();
  const [mes, setMes] = useState(d.meses[0]);
  const [pais, setPais] = useState('Todos');
  const [tipo, setTipo] = useState('todas');

  const puntajes = useMemo(() => d.puntajeMensual(mes), [d, mes]);

  const filas = useMemo(() => data.tiendas
    .filter((t) => (pais === 'Todos' || t.pais === pais) && (tipo === 'todas' || t.tipo === tipo))
    .map((t) => {
      const forms = d.formularios.filter((f) => f.tienda_id === t.id && String(f.fechaRef).slice(0, 7) === mes && f.tipo === 'semanal');
      const completados = forms.filter((f) => f.estado === 'completado').length;
      const enviados = forms.filter((f) => !['programado'].includes(f.estado) && !f.origen_id).length;
      const ultimo = [...forms].filter((f) => f.estado !== 'programado').sort((a, b) => String(b.fechaRef).localeCompare(a.fechaRef))[0];
      return { id: t.id, tienda: t, nombre: t.nombre, pais: t.pais, tipo: t.tipo, completados, enviados, puntaje: puntajes[t.id], ultimo };
    }), [data, d, mes, pais, tipo, puntajes]);

  const kpis = useMemo(() => {
    const delMes = d.formularios.filter((f) => String(f.fechaRef).slice(0, 7) === mes && f.tipo === 'semanal' && f.estado !== 'programado' && filas.some((x) => x.id === f.tienda_id));
    const originales = delMes.filter((f) => !f.origen_id);
    const resueltos = originales.filter((f) => f.cadena.some((x) => x.estado === 'completado'));
    const totales = filas.map((f) => f.puntaje?.total).filter((v) => v != null);
    return {
      completitud: originales.length ? resueltos.length / originales.length : null,
      originales: originales.length,
      resueltos: resueltos.length,
      promedio: totales.length ? totales.reduce((a, b) => a + b, 0) / totales.length : null,
    };
  }, [d, mes, filas]);

  const columnas = [
    { key: 'nombre', titulo: 'Tienda', ancho: 190, render: (f) => <div><div className="text-tx font-semibold">{f.nombre}</div><div className="text-[10px] text-muted">{f.pais} · {f.tipo === 'reseller' ? 'Reseller' : 'Oficial'}</div></div> },
    { key: 'forms', titulo: 'Formularios', num: true, valor: (f) => f.completados, render: (f) => f.enviados ? <span className="tabular-nums"><b className="text-tx">{f.completados}</b><span className="text-muted"> / {f.enviados}</span></span> : <Guion />,
      title: (f) => `Completados: ${f.completados} | Enviados (sin contar reenvíos): ${f.enviados}`, csv: (f) => `${f.completados}/${f.enviados}` },
    ...MODULOS.map((m) => ({
      key: m, titulo: m, num: true, valor: (f) => f.puntaje?.modulos[m]?.pct ?? null,
      render: (f) => {
        const x = f.puntaje?.modulos[m];
        return x?.pct != null ? <span className={`font-semibold ${colorPct(x.pct)}`}>{pct(x.pct)}</span> : <Guion />;
      },
      title: (f) => {
        const x = f.puntaje?.modulos[m];
        return x?.pct != null ? `En juego: ${x.enJuego.toFixed(1)} | Descuento: ${x.descuento.toFixed(1)} | Incidencias: ${x.incidencias} de ${x.evaluadas} preguntas` : 'Sin preguntas evaluadas en el mes';
      },
      csv: (f) => f.puntaje?.modulos[m]?.pct != null ? (f.puntaje.modulos[m].pct * 100).toFixed(1) : '',
    })),
    { key: 'total', titulo: 'Total', num: true, valor: (f) => f.puntaje?.total ?? null,
      render: (f) => f.puntaje?.total != null ? <span className={`font-bold ${colorPct(f.puntaje.total)}`}>{pct(f.puntaje.total)}</span> : <Guion />,
      title: () => 'Promedio de los módulos con preguntas evaluadas en el mes', csv: (f) => f.puntaje?.total != null ? (f.puntaje.total * 100).toFixed(1) : '' },
    { key: 'ultimo', titulo: 'Último formulario', valor: (f) => f.ultimo?.fechaRef || null,
      render: (f) => f.ultimo ? <span className="inline-flex items-center gap-1.5">{fecha(f.ultimo.fechaRef, f.tienda.timezone)} <Badge tono={TONO_ESTADO[f.ultimo.estado]}>{nombreEstado(f.ultimo.estado)}</Badge></span> : <Guion />,
      csv: (f) => f.ultimo ? `${f.ultimo.fechaRef} ${f.ultimo.estado}` : '' },
  ];

  useAccionesHeader(<Boton icon={Download} onClick={() => aCsv(columnas, filas, `puntajes-${mes}`)}>Exportar CSV</Boton>, [filas, mes]);

  // Incidencias más frecuentes del mes.
  const top = useMemo(() => {
    const acc = {};
    for (const f of d.formularios) {
      if (f.estado !== 'completado' || String(f.fechaRef).slice(0, 7) !== mes || !filas.some((x) => x.id === f.tienda_id)) continue;
      for (const r of f.respuestas) {
        const p = d.preguntaPorNum[Number(r.pregunta)];
        if (!p) continue;
        const a = (acc[p.num] ||= { p, n: 0, f: 0 });
        const v = String(r.respuesta_final || r.respuesta).toUpperCase();
        if (r.revision === 'pendiente' || v.startsWith('NO SE')) continue;
        a.n += 1;
        if (esNegativa(p, v)) a.f += 1;
      }
    }
    return Object.values(acc).filter((a) => a.n >= 5).map((a) => ({ ...a, tasa: a.f / a.n })).sort((a, b) => b.tasa - a.tasa).slice(0, 8);
  }, [d, mes, filas]);

  return (
    <div className="space-y-4">
      <Toolbar>
        <Selector etiqueta="Mes" value={mes} onChange={setMes} opciones={d.meses.map((m) => ({ value: m, label: NOMBRE_MES(m) }))} />
        <Selector etiqueta="País" value={pais} onChange={setPais} opciones={['Todos', ...d.paises]} />
        <Toggle value={tipo} onChange={setTipo} opciones={[{ value: 'todas', label: 'Todas' }, { value: 'oficial', label: 'Oficiales' }, { value: 'reseller', label: 'Resellers' }]} />
      </Toolbar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi etiqueta="Puntaje promedio" icon={Gauge} valor={pct(kpis.promedio)} tono={kpis.promedio >= 0.95 ? 'ok' : kpis.promedio >= 0.85 ? 'medio' : 'mal'} detalle={`${filas.filter((f) => f.puntaje).length} tiendas con datos`} />
        <Kpi etiqueta="Completitud" icon={ClipboardCheck} valor={pct(kpis.completitud, 0)} detalle={`${kpis.resueltos} de ${kpis.originales} formularios (con reenvíos)`} />
        <Kpi etiqueta="Pendientes de reenvío" icon={RotateCcw} valor={d.pendientesReenvio.length} tono={d.pendientesReenvio.length ? 'marca' : undefined} detalle="Cancelados o vencidos" />
        <Kpi etiqueta="Para revisar" icon={ScanEye} valor={d.respuestasPendientes.length + d.crucesPendientes.length} tono={d.respuestasPendientes.length ? 'medio' : undefined} detalle={`${d.respuestasPendientes.length} respuestas · ${d.crucesPendientes.length} cruces con cámaras`} />
      </div>

      <Card>
        <CardTitle icon={Store} extra={<span className="text-[11px] text-muted">Pasá el mouse por un % para ver el cálculo</span>}>Puntaje por tienda · {NOMBRE_MES(mes)}</CardTitle>
        <Tabla columnas={columnas} filas={filas} ordenInicial={{ key: 'total', dir: 'asc' }} />
      </Card>

      <Card>
        <CardTitle icon={ScanEye}>Incidencias más frecuentes del mes</CardTitle>
        <Tabla densa columnas={[
          { key: 'num', titulo: 'N°', render: (a) => a.p.num },
          { key: 'texto', titulo: 'Pregunta', render: (a) => <span className="text-tx">{a.p.texto}</span> },
          { key: 'modulo', titulo: 'Módulo', render: (a) => a.p.modulo },
          { key: 'impacto', titulo: 'Impacto', render: (a) => <Badge tono={a.p.impacto === 'Alto' ? 'mal' : a.p.impacto === 'Medio' ? 'medio' : 'neutro'}>{a.p.impacto} · {PESOS[a.p.impacto]}</Badge> },
          { key: 'casos', titulo: 'Casos', num: true, render: (a) => `${a.f} / ${a.n}` },
          { key: 'tasa', titulo: 'Incumplimiento', num: true, render: (a) => <span className="font-semibold text-tx">{pct(a.tasa, 0)}</span> },
        ]} filas={top.map((a) => ({ ...a, id: a.p.num }))} />
      </Card>
    </div>
  );
}
