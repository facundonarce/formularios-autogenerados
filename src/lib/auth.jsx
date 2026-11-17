// Ingreso con Google (Google Identity Services). El ID token se manda al backend en cada pedido.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DEMO, setTokenGoogle } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const KEY = 'carestino-auditoria-token';

function expirado(token) {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return exp * 1000 < Date.now() + 60000;
  } catch { return true; }
}

export function AuthProvider({ children }) {
  // El token se pasa al cliente de API en el mismo momento en que cambia (no en un efecto),
  // porque el panel pide los datos apenas se monta y los efectos de los hijos corren antes que los del padre.
  const [token, setTokenState] = useState(() => {
    if (DEMO) return 'demo';
    let t = null;
    try { t = sessionStorage.getItem(KEY); } catch { /* sin storage */ }
    t = t && !expirado(t) ? t : null;
    setTokenGoogle(t);
    return t;
  });
  const setToken = useCallback((t) => {
    if (!DEMO) {
      setTokenGoogle(t);
      try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* sin storage */ }
    }
    setTokenState(t);
  }, []);

  const [motivo, setMotivo] = useState(null);
  const salir = useCallback((razon) => {
    setToken(null);
    setMotivo(typeof razon === 'string' ? razon : null);
    window.google?.accounts?.id?.disableAutoSelect?.();
  }, [setToken]);
  const ingresar = useCallback((t) => { setMotivo(null); setToken(t); }, [setToken]);

  return <Ctx.Provider value={{ token, setToken: ingresar, salir, motivo, demo: DEMO }}>{children}</Ctx.Provider>;
}

export function BotonGoogle() {
  const { setToken, motivo } = useAuth();
  const ref = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) { setError('Falta configurar VITE_GOOGLE_CLIENT_ID'); return; }
    const init = () => {
      // Sin auto_select después de un rechazo, para no entrar en un bucle de ingreso.
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => setToken(r.credential), auto_select: !motivo });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es' });
    };
    if (window.google?.accounts?.id) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    s.onerror = () => setError('No se pudo cargar el ingreso con Google');
    document.head.appendChild(s);
  }, [setToken, motivo]);

  return (
    <div className="flex flex-col items-center gap-2">
      {motivo && <div className="w-full rounded-xl border border-mal/30 bg-mal-bg px-3 py-2 text-[11px] text-mal text-left">{motivo}</div>}
      <div ref={ref} />
      {error && <div className="text-[11px] text-mal">{error}</div>}
    </div>
  );
}
