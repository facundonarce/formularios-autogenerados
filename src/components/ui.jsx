// UI Kit Carestino BI: tarjetas, badges, botones, filtros, toggle, tablas, drawer y modal.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, X, Copy, Check } from 'lucide-react';

export function Card({ className = '', children, ...p }) {
  return <div className={`bg-white rounded-2xl border border-borde shadow-2xs p-4 sm:p-5 ${className}`} {...p}>{children}</div>;
}

export function CardTitle({ icon: Icon, children, extra }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-sm font-bold text-tx flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-muted" />}{children}</h3>
      {extra}
    </div>
  );
}

const TONOS = {
  ok: 'bg-ok-bg text-ok',
  mal: 'bg-mal-bg text-mal',
  medio: 'bg-medio-bg text-medio',
  marca: 'bg-marca-bg text-marca',
  neutro: 'bg-sec text-tx2',
};
export function Badge({ tono = 'neutro', children, title }) {
  return <span title={title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${TONOS[tono]}`}>{children}</span>;
}

export function Boton({ variante = 'secundario', icon: Icon, children, cargando, className = '', ...p }) {
  const base = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const v = {
    primario: 'bg-marca text-white hover:brightness-95',
    secundario: 'bg-white border border-borde text-tx hover:bg-sec',
    peligro: 'bg-white border border-borde text-mal hover:bg-mal-bg',
    fantasma: 'text-tx2 hover:bg-sec',
  }[variante];
  return (
    <button className={`${base} ${v} ${className}`} disabled={cargando || p.disabled} {...p}>
      {cargando ? <Loader2 className="w-3.5 h-3.5 girar" /> : Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

export function Selector({ value, onChange, opciones, etiqueta }) {
  return (
    <label className="inline-flex items-center gap-1.5 bg-app border border-borde rounded-xl px-3 py-1.5 text-xs text-tx2">
      {etiqueta && <span className="text-muted">{etiqueta}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent outline-none text-tx font-medium cursor-pointer">
        {opciones.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}

export function Buscador({ value, onChange, placeholder = 'Buscar…' }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="bg-app border border-borde rounded-xl px-3 py-1.5 text-xs text-tx placeholder:text-muted outline-none focus:border-marca w-44" />
  );
}

export function Toggle({ value, onChange, opciones }) {
  return (
    <div className="inline-flex bg-sec p-0.5 rounded-xl border border-borde">
      {opciones.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${value === o.value ? 'bg-white text-marca shadow-2xs' : 'text-tx2 hover:text-tx'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children }) {
  return <div className="flex flex-wrap items-center gap-2 mb-3">{children}</div>;
}

export function Kpi({ etiqueta, valor, detalle, tono, icon: Icon }) {
  const color = { ok: 'text-ok', mal: 'text-mal', medio: 'text-medio', marca: 'text-marca' }[tono] || 'text-tx';
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between text-[11px] text-muted font-medium uppercase tracking-wide">
        {etiqueta}{Icon && <Icon className="w-4 h-4" />}
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-1.5 ${color}`}>{valor}</div>
      {detalle && <div className="text-[11px] text-muted mt-0.5">{detalle}</div>}
    </Card>
  );
}

/**
 * Tabla de datos. columnas: [{ key, titulo, num?, render?(fila), valor?(fila), title?(fila), ancho? }]
 * La primera columna queda fija al hacer scroll horizontal.
 */
export function Tabla({ columnas, filas, onFila, vacio = 'Sin datos para estos filtros', densa, maxAlto, ordenInicial }) {
  const [orden, setOrden] = useState(ordenInicial || null);
  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const col = columnas.find((c) => c.key === orden.key);
    const get = col?.valor || ((f) => f[orden.key]);
    return [...filas].sort((a, b) => {
      const x = get(a); const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * (orden.dir === 'asc' ? 1 : -1);
    });
  }, [filas, orden, columnas]);
  const py = densa ? 'py-1.5' : 'py-2.5';
  return (
    <div className="overflow-auto rounded-xl border border-borde" style={maxAlto ? { maxHeight: maxAlto } : undefined}>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-20">
          <tr>
            {columnas.map((c, i) => (
              <th key={c.key} style={c.ancho ? { minWidth: c.ancho } : undefined}
                onClick={() => setOrden((o) => ({ key: c.key, dir: o?.key === c.key && o.dir === 'desc' ? 'asc' : 'desc' }))}
                className={`bg-sec text-muted text-[10px] uppercase font-bold py-2 px-3 border-b border-borde cursor-pointer select-none whitespace-nowrap ${c.num ? 'text-right' : 'text-left'} ${i === 0 ? 'sticky left-0 z-10' : ''}`}>
                <span className="inline-flex items-center gap-1">
                  {c.titulo}
                  {orden?.key === c.key && (orden.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.length === 0 && (
            <tr><td colSpan={columnas.length} className="text-center text-muted py-8">{vacio}</td></tr>
          )}
          {ordenadas.map((f, idx) => (
            <tr key={f.id || idx} onClick={onFila ? () => onFila(f) : undefined}
              className={`group border-b border-borde/50 hover:bg-sec transition-colors ${onFila ? 'cursor-pointer' : ''}`}>
              {columnas.map((c, i) => (
                <td key={c.key} title={c.title ? c.title(f) : undefined}
                  className={`px-3 ${py} ${c.num ? 'text-right tabular-nums' : 'text-left'} ${i === 0 ? 'sticky left-0 z-10 bg-white group-hover:bg-sec font-medium text-tx' : 'text-tx2'}`}>
                  {c.render ? c.render(f) : (f[c.key] ?? <Guion />)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Guion() {
  return <span className="text-muted">-</span>;
}

export function Drawer({ abierto, onCerrar, titulo, subtitulo, children, ancho = 'max-w-3xl' }) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-tx/20" onClick={onCerrar} />
      <div className={`relative w-full ${ancho} h-full bg-app border-l border-borde overflow-y-auto`}>
        <div className="sticky top-0 z-10 bg-white border-b border-borde px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-bold text-tx">{titulo}</div>
            {subtitulo && <div className="text-[11px] text-muted mt-0.5">{subtitulo}</div>}
          </div>
          <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-sec text-tx2"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ abierto, onCerrar, titulo, children }) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-tx/30" onClick={onCerrar} />
      <div className="relative bg-white rounded-2xl border border-borde shadow-2xs w-full max-w-md p-5">
        <div className="text-base font-bold text-tx mb-3">{titulo}</div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ texto }) {
  return <div className="flex items-center gap-2 text-xs text-muted"><Loader2 className="w-4 h-4 girar text-marca" />{texto}</div>;
}

export function Aviso({ tono = 'medio', children }) {
  const c = { ok: 'bg-ok-bg text-ok border-ok/20', mal: 'bg-mal-bg text-mal border-mal/20', medio: 'bg-medio-bg text-tx2 border-medio/30', marca: 'bg-marca-bg text-tx2 border-marca/20' }[tono];
  return <div className={`rounded-xl border px-3 py-2 text-xs ${c}`}>{children}</div>;
}

export function Copiar({ texto, etiqueta = 'Copiar' }) {
  const [ok, setOk] = useState(false);
  async function copiar(e) {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(texto); } catch {
      const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* sin portapapeles */ } t.remove();
    }
    setOk(true); setTimeout(() => setOk(false), 1500);
  }
  return <Boton icon={ok ? Check : Copy} onClick={copiar}>{ok ? 'Copiado' : etiqueta}</Boton>;
}

export function LinkCopiable({ url }) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate bg-sec border border-borde rounded-lg px-2 py-1.5 text-[11px] text-tx2">{url}</code>
      <Copiar texto={url} />
    </div>
  );
}
