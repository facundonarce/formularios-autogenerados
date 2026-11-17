// App Shell: sidebar fijo + header con breadcrumb, título y acciones globales.
import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, RotateCcw, ScanEye, CalendarClock, Store, ListChecks, RefreshCw, LogOut, Menu, X, Tablet,
} from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { useAuth } from '../lib/auth.jsx';
import { hace } from '../lib/format.js';
import { Boton, Spinner } from './ui.jsx';

export const RUTAS = [
  { path: '/', titulo: 'Resumen', modulo: 'Auditoría', icon: LayoutDashboard },
  { path: '/formularios', titulo: 'Formularios', modulo: 'Auditoría', icon: ClipboardList },
  { path: '/reenvios', titulo: 'Reenvíos', modulo: 'Gestión', icon: RotateCcw, badge: 'reenvios' },
  { path: '/revision', titulo: 'Revisión', modulo: 'Gestión', icon: ScanEye, badge: 'revision' },
  { path: '/programacion', titulo: 'Programación', modulo: 'Configuración', icon: CalendarClock },
  { path: '/tiendas', titulo: 'Tiendas', modulo: 'Configuración', icon: Store },
  { path: '/preguntas', titulo: 'Preguntas y tomas', modulo: 'Configuración', icon: ListChecks },
];

const AccionesCtx = createContext(() => {});
export function useAccionesHeader(nodo, deps = []) {
  const set = useContext(AccionesCtx);
  useEffect(() => { set(nodo); return () => set(null); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

function Sidebar({ abierto, cerrar }) {
  const { data, d, cargando } = useDatos();
  const { salir, demo } = useAuth();
  const u = data?.usuario;
  const badges = { reenvios: d?.pendientesReenvio.length, revision: (d?.respuestasPendientes.length || 0) + (d?.crucesPendientes.length || 0) };
  return (
    <aside className={`fixed lg:static inset-y-0 left-0 z-40 h-screen w-64 shrink-0 bg-white border-r border-borde flex flex-col transition-transform ${abierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl border border-borde p-1 flex items-center justify-center">
            <img src={`${import.meta.env.BASE_URL}isologo.svg`} alt="" className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold text-tx">CARESTINO</span>
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-marca-bg text-marca">BI</span>
          </div>
          <button className="ml-auto lg:hidden p-1 text-tx2" onClick={cerrar}><X className="w-4 h-4" /></button>
        </div>
        <div className="text-[11px] text-muted mt-1.5">Auditoría Autogestionada</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 flex flex-col gap-0.5">
        {['Auditoría', 'Gestión', 'Configuración'].map((grupo) => (
          <div key={grupo} className="mb-2">
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase font-bold text-muted tracking-wide">{grupo}</div>
            {RUTAS.filter((r) => r.modulo === grupo).map((r) => (
              <NavLink key={r.path} to={r.path} end={r.path === '/'} onClick={cerrar}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-marca-bg text-marca font-bold' : 'text-tx2 hover:bg-sec hover:text-tx'}`}>
                <r.icon className="w-4 h-4" />
                <span className="flex-1">{r.titulo}</span>
                {r.badge && badges[r.badge] > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-marca text-white tabular-nums">{badges[r.badge]}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-3 space-y-3">
        {demo && (
          <NavLink to="/t/demo" className="flex items-center gap-2 rounded-xl border border-dashed border-marca/40 bg-marca-bg px-3 py-2 text-xs font-semibold text-marca">
            <Tablet className="w-4 h-4" /> Ver la tablet del encargado
          </NavLink>
        )}
        <div className="rounded-xl border border-borde p-3">
          {data ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold text-tx">
                <span className={`w-2 h-2 rounded-full ${demo ? 'bg-medio' : 'bg-ok'} pulso`} />
                {demo ? 'Dataset demo' : 'Dataset Conectado'}
              </div>
              <div className="text-[11px] text-muted mt-1 tabular-nums">{d.registros.toLocaleString('es-AR')} registros · {data.tiendas.length} tiendas</div>
              <div className="text-[11px] text-muted">{cargando ? 'Sincronizando…' : `Sincronizado ${hace(data.sincronizado)}`}</div>
            </>
          ) : <Spinner texto="Conectando dataset…" />}
        </div>
        {u && (
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-full bg-marca-bg text-marca flex items-center justify-center text-xs font-bold overflow-hidden">
              {u.foto ? <img src={u.foto} alt="" className="w-full h-full object-cover" /> : (u.nombre || u.email).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-tx truncate">{u.nombre || u.email}</div>
              <div className="text-[11px] text-muted capitalize">{u.rol}</div>
            </div>
            {!demo && <button onClick={salir} title="Salir" className="p-1.5 rounded-lg hover:bg-sec text-muted"><LogOut className="w-4 h-4" /></button>}
          </div>
        )}
      </div>
    </aside>
  );
}

export default function Shell() {
  const { pathname } = useLocation();
  const ruta = RUTAS.find((r) => r.path === pathname) || RUTAS[0];
  const { recargar, cargando, data, error } = useDatos();
  const [acciones, setAcciones] = useState(null);
  const [menu, setMenu] = useState(false);

  return (
    <AccionesCtx.Provider value={setAcciones}>
      <div className="flex h-screen bg-app">
        {menu && <div className="fixed inset-0 z-30 bg-tx/20 lg:hidden" onClick={() => setMenu(false)} />}
        <Sidebar abierto={menu} cerrar={() => setMenu(false)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="bg-app px-4 sm:px-6 pt-5 pb-3">
            <div className="text-[10px] text-muted uppercase tracking-wide">PANEL &gt; {ruta.modulo} &gt; {ruta.titulo}</div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-1.5">
              <div className="flex items-center gap-2.5">
                <button className="lg:hidden p-1 -ml-1 text-tx2" onClick={() => setMenu(true)}><Menu className="w-5 h-5" /></button>
                <ruta.icon className="w-6 h-6 text-marca" />
                <h1 className="text-xl font-bold text-tx">{ruta.titulo}</h1>
              </div>
              <div className="flex items-center gap-2">
                {acciones}
                <Boton icon={RefreshCw} onClick={recargar} cargando={cargando}>Sincronizar</Boton>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 pb-8">
            {error && !data ? (
              <div className="max-w-xl mt-6 rounded-2xl border border-mal/30 bg-mal-bg p-4 text-xs text-tx">
                <div className="font-bold text-mal mb-1">No se pudo cargar el dataset</div>{error}
              </div>
            ) : !data ? (
              <div className="h-64 flex items-center justify-center"><Spinner texto="Cargando modelo de datos de auditoría…" /></div>
            ) : <Outlet />}
          </main>
        </div>
      </div>
    </AccionesCtx.Provider>
  );
}
