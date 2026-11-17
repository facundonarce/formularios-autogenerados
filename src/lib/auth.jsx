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
  const [token, setToken] = useState(() => {
    if (DEMO) return 'demo';
    const t = sessionStorage.getItem(KEY);
    return t && !expirado(t) ? t : null;
  });

  useEffect(() => {
    setTokenGoogle(DEMO ? null : token);
    if (!DEMO) token ? sessionStorage.setItem(KEY, token) : sessionStorage.removeItem(KEY);
  }, [token]);

  const salir = useCallback(() => {
    setToken(null);
    window.google?.accounts?.id?.disableAutoSelect?.();
  }, []);

  return <Ctx.Provider value={{ token, setToken, salir, demo: DEMO }}>{children}</Ctx.Provider>;
}

export function BotonGoogle() {
  const { setToken } = useAuth();
  const ref = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) { setError('Falta configurar VITE_GOOGLE_CLIENT_ID'); return; }
    const init = () => {
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => setToken(r.credential), auto_select: true });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es' });
    };
    if (window.google?.accounts?.id) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    s.onerror = () => setError('No se pudo cargar el ingreso con Google');
    document.head.appendChild(s);
  }, [setToken]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} />
      {error && <div className="text-[11px] text-mal">{error}</div>}
    </div>
  );
}
