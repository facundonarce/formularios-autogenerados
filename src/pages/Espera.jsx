// Pantalla fija de la tablet de cada tienda (/t/<clave>). Consulta cada 60 segundos si hay
// un formulario pendiente y, cuando llega, muestra el botón para empezarlo.
// Reemplaza el aviso por Slack mientras se prueba el funcionamiento del formulario.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BellRing, Clock, Loader2, AlertTriangle, Camera } from 'lucide-react';
import { api, DEMO } from '../lib/api.js';

const CADA_MS = 60000;

export default function Espera() {
  const { clave } = useParams();
  const navegar = useNavigate();
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const avisado = useRef(null);

  useEffect(() => {
    let vivo = true;
    async function consultar() {
      try {
        const r = await api.pendiente(clave);
        if (!vivo) return;
        setEstado(r);
        setError(null);
        if (r.pendiente && avisado.current !== r.pendiente.token) {
          avisado.current = r.pendiente.token;
          try { navigator.vibrate?.([300, 150, 300]); } catch { /* sin vibración */ }
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.35].forEach((t) => {
              const o = ctx.createOscillator(); const g = ctx.createGain();
              o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
              o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
            });
          } catch { /* el navegador puede bloquear el sonido */ }
        }
      } catch (e) {
        if (vivo) setError(e.message);
      }
    }
    consultar();
    const id = setInterval(consultar, DEMO ? 30000 : CADA_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { vivo = false; clearInterval(id); clearInterval(reloj); };
  }, [clave]);

  const p = estado?.pendiente;
  const resto = p ? Math.max(0, Math.round((new Date(p.vence) - ahora) / 1000)) : null;

  return (
    <div className={`min-h-screen flex flex-col ${p ? 'bg-marca' : 'bg-app'}`}>
      <header className={`px-5 py-3 flex items-center gap-2.5 border-b ${p ? 'bg-marca border-white/20' : 'bg-white border-borde'}`}>
        <div className="w-9 h-9 rounded-xl border border-borde bg-white p-1"><img src={`${import.meta.env.BASE_URL}isologo.svg`} alt="" className="w-full h-full" /></div>
        <span className={`text-lg font-bold ${p ? 'text-white' : 'text-tx'}`}>CARESTINO</span>
        <span className="ml-auto text-sm font-semibold opacity-80" style={{ color: p ? '#fff' : undefined }}>{estado?.tienda?.nombre}</span>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        {error && !estado ? (
          <div className="text-center"><AlertTriangle className="w-10 h-10 text-medio mx-auto mb-3" /><div className="text-lg font-bold text-tx">{error}</div></div>
        ) : !estado ? (
          <Loader2 className="w-8 h-8 text-marca girar" />
        ) : p ? (
          <div className="text-center text-white max-w-md w-full">
            <BellRing className="w-14 h-14 mx-auto mb-4 pulso" />
            <div className="text-3xl font-bold">{p.estado === 'abierto' ? 'Tenés un formulario en curso' : 'Tenés un formulario nuevo'}</div>
            <p className="text-lg opacity-90 mt-2">{p.tipo === 'mensual' ? 'Relevamiento mensual' : 'Auditoría autogestionada'}</p>
            {p.estado === 'enviado' && resto != null && (
              <div className="mt-5 inline-flex items-center gap-2 bg-white/15 rounded-xl px-4 py-2 text-xl font-bold tabular-nums">
                <Clock className="w-5 h-5" />{Math.floor(resto / 60)}:{String(resto % 60).padStart(2, '0')} para empezar
              </div>
            )}
            <button onClick={() => navegar(`/f/${p.token}`)}
              className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white text-marca px-5 py-5 text-xl font-bold">
              <Camera className="w-6 h-6" />{p.estado === 'abierto' ? 'Continuar' : 'Empezar ahora'}
            </button>
          </div>
        ) : (
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-ok-bg flex items-center justify-center mx-auto mb-4"><span className="w-3 h-3 rounded-full bg-ok pulso" /></div>
            <div className="text-2xl font-bold text-tx">Sin formularios pendientes</div>
            <p className="text-sm text-tx2 mt-2">Dejá esta pantalla abierta. Cuando llegue un formulario, la tablet suena y aparece el botón para empezar.</p>
            <p className="text-[11px] text-muted mt-6">Última consulta: {new Date(estado.consultado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}{error ? ` · ${error}` : ''}</p>
          </div>
        )}
      </main>
    </div>
  );
}
