// Flujo del encargado en la tablet: link de un solo uso, tomas en video en vivo, código en voz alta,
// temporizador y opción de cancelar si entra un cliente. No permite subir archivos de la galería.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Circle, Square, RotateCcw, Send, CheckCircle2, AlertTriangle, Timer, Mic, UserRound, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';

function elegirMime() {
  const opciones = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
  return opciones.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

function Pantalla({ children }) {
  return (
    <div className="min-h-screen bg-app flex flex-col">
      <header className="bg-white border-b border-borde px-5 py-3 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl border border-borde p-1"><img src={`${import.meta.env.BASE_URL}isologo.svg`} alt="" className="w-full h-full" /></div>
        <span className="text-lg font-bold text-tx">CARESTINO</span>
        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-marca-bg text-marca">Auditoría</span>
      </header>
      <main className="flex-1 w-full max-w-3xl mx-auto p-5">{children}</main>
    </div>
  );
}

function BotonGrande({ variante = 'primario', icon: Icon, children, ...p }) {
  const v = variante === 'primario' ? 'bg-marca text-white' : variante === 'peligro' ? 'bg-white border border-borde text-mal' : 'bg-white border border-borde text-tx';
  return (
    <button className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-bold disabled:opacity-50 ${v}`} {...p}>
      {Icon && <Icon className="w-5 h-5" />}{children}
    </button>
  );
}

function useCuentaRegresiva(limite) {
  const [resto, setResto] = useState(null);
  useEffect(() => {
    if (!limite) return;
    const t = () => setResto(Math.max(0, Math.round((new Date(limite) - Date.now()) / 1000)));
    t();
    const id = setInterval(t, 1000);
    return () => clearInterval(id);
  }, [limite]);
  return resto;
}

function Reloj({ segundos }) {
  if (segundos == null) return null;
  const m = Math.floor(segundos / 60);
  const s = String(segundos % 60).padStart(2, '0');
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold tabular-nums ${segundos < 120 ? 'bg-mal-bg text-mal' : 'bg-sec text-tx'}`}>
      <Timer className="w-4 h-4" />{m}:{s}
    </span>
  );
}

/* ---------------- Grabadora de una toma ---------------- */
function Grabadora({ toma, codigo, onListo, simulada }) {
  const video = useRef(null);
  const stream = useRef(null);
  const rec = useRef(null);
  const partes = useRef([]);
  const inicio = useRef(0);
  const [estado, setEstado] = useState('preparando'); // preparando | lista | grabando | revisar | sin_camara
  const [seg, setSeg] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [intentos, setIntentos] = useState(0);
  const mime = useRef(elegirMime());

  const abrirCamara = useCallback(async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      if (video.current) { video.current.srcObject = stream.current; video.current.muted = true; await video.current.play().catch(() => {}); }
      setEstado('lista');
    } catch {
      setEstado(simulada ? 'lista' : 'sin_camara');
    }
  }, [simulada]);

  useEffect(() => {
    abrirCamara();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, [abrirCamara]);

  useEffect(() => {
    if (estado !== 'grabando') return;
    const id = setInterval(() => setSeg(Math.floor((Date.now() - inicio.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [estado]);

  function empezar() {
    partes.current = [];
    inicio.current = Date.now();
    setSeg(0);
    if (stream.current) {
      const r = new MediaRecorder(stream.current, { mimeType: mime.current || undefined, videoBitsPerSecond: 1_500_000 });
      r.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
      r.onstop = () => {
        const tipo = r.mimeType || mime.current || 'video/webm';
        const blob = new Blob(partes.current, { type: tipo });
        setResultado({ blob, url: URL.createObjectURL(blob), segundos: Math.round((Date.now() - inicio.current) / 1000), mime: tipo });
        setEstado('revisar');
      };
      r.start(1000);
      rec.current = r;
    }
    setEstado('grabando');
  }

  function detener() {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    else { setResultado({ blob: null, url: null, segundos: seg, mime: 'video/webm' }); setEstado('revisar'); }
  }

  function regrabar() {
    setIntentos((n) => n + 1);
    setResultado(null);
    setEstado('lista');
    if (video.current && stream.current) { video.current.srcObject = stream.current; video.current.play().catch(() => {}); }
  }

  const minimo = toma.segundos_min || 10;

  if (estado === 'sin_camara') {
    return (
      <div className="rounded-2xl border border-mal/30 bg-mal-bg p-5 text-sm text-tx">
        <AlertTriangle className="w-5 h-5 text-mal mb-2" />
        No se pudo usar la cámara. Revisá que la tablet le haya dado permiso de cámara y micrófono al navegador y volvé a intentar.
        <div className="mt-3"><BotonGrande variante="secundario" icon={Camera} onClick={abrirCamara}>Reintentar</BotonGrande></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-tx aspect-video">
        {estado === 'revisar' && resultado?.url
          ? <video src={resultado.url} controls playsInline className="w-full h-full object-contain" />
          : <video ref={video} playsInline muted className="w-full h-full object-cover" />}
        {simulada && !stream.current && estado !== 'revisar' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 text-sm gap-2"><Camera className="w-8 h-8" />Cámara simulada (demo)</div>
        )}
        {estado === 'grabando' && (
          <>
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-mal text-white rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums">
              <Circle className="w-3 h-3 fill-white pulso" />{seg}s
            </div>
            {seg < 4 && (
              <div className="absolute inset-x-0 bottom-0 bg-tx/70 text-white text-center py-3 text-lg font-bold">
                <Mic className="inline w-5 h-5 mr-1.5 -mt-1" />Decí en voz alta: <span className="tabular-nums tracking-widest text-marca-bg">{codigo}</span>
              </div>
            )}
          </>
        )}
        {estado === 'preparando' && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-white girar" /></div>}
      </div>

      {estado === 'lista' && <BotonGrande icon={Circle} onClick={empezar}>Grabar</BotonGrande>}
      {estado === 'grabando' && (
        <BotonGrande variante={seg >= minimo ? 'primario' : 'secundario'} icon={Square} disabled={seg < minimo} onClick={detener}>
          {seg < minimo ? `Seguí grabando (${minimo - seg}s)` : 'Terminar toma'}
        </BotonGrande>
      )}
      {estado === 'revisar' && (
        <div className="grid grid-cols-2 gap-3">
          <BotonGrande variante="secundario" icon={RotateCcw} disabled={intentos >= 1} onClick={regrabar}>{intentos >= 1 ? 'Sin más intentos' : 'Volver a grabar'}</BotonGrande>
          <BotonGrande icon={Send} onClick={() => onListo(resultado)}>Enviar toma</BotonGrande>
        </div>
      )}
    </div>
  );
}

/* ---------------- Página ---------------- */
export default function Tablet() {
  const { token } = useParams();
  const demo = token === 'demo';
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [paso, setPaso] = useState('inicio'); // inicio | toma | enviando | fin | cancelado
  const [indice, setIndice] = useState(0);
  const [cancelar, setCancelar] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const resto = useCuentaRegresiva(form?.limite);
  const terminado = useRef(false);

  useEffect(() => {
    api.abrir(token).then((f) => {
      setForm(f);
      const i = f.tomas.findIndex((t) => !t.hecha);
      if (i > 0) { setIndice(i); setPaso('toma'); }
    }).catch((e) => setError(e.message));
  }, [token]);

  const finalizar = useCallback(async () => {
    if (terminado.current) return;
    terminado.current = true;
    try { await api.terminar(token); } catch { /* el cierre por tiempo lo hace la tarea programada */ }
    setPaso('fin');
  }, [token]);

  useEffect(() => {
    if (resto === 0 && form && !['fin', 'cancelado'].includes(paso)) finalizar();
  }, [resto, form, paso, finalizar]);

  async function enviarToma(res) {
    const toma = form.tomas[indice];
    setPaso('enviando');
    setAviso(null);
    setProgreso(0);
    try {
      const r = await api.enviarToma({ token, toma: toma.id, blob: res.blob, segundos: res.segundos, mime: res.mime, onProgreso: setProgreso });
      if (r.codigo_ok === 'NO') setAviso('No se escuchó bien el código en el video. La toma igual se guardó.');
    } catch (e) {
      setAviso(`No se pudo enviar la toma: ${e.message}`);
    }
    if (indice + 1 < form.tomas.length) { setIndice(indice + 1); setPaso('toma'); } else { await finalizar(); }
  }

  async function confirmarCancelacion(motivo) {
    try { await api.cancelar(token, motivo); } catch { /* sin conexión: queda registrado por vencimiento */ }
    setCancelar(false);
    setPaso('cancelado');
  }

  if (error) {
    return (
      <Pantalla>
        <div className="bg-white rounded-2xl border border-borde p-6 text-center mt-10">
          <AlertTriangle className="w-10 h-10 text-medio mx-auto mb-3" />
          <div className="text-lg font-bold text-tx">{error}</div>
          <p className="text-sm text-tx2 mt-2">Si necesitás un formulario nuevo, avisá a auditoría.</p>
        </div>
      </Pantalla>
    );
  }
  if (!form) return <Pantalla><div className="flex justify-center mt-16"><Loader2 className="w-8 h-8 text-marca girar" /></div></Pantalla>;

  if (paso === 'fin' || paso === 'cancelado') {
    return (
      <Pantalla>
        <div className="bg-white rounded-2xl border border-borde p-8 text-center mt-10">
          {paso === 'fin' ? <CheckCircle2 className="w-12 h-12 text-ok mx-auto mb-3" /> : <AlertTriangle className="w-12 h-12 text-medio mx-auto mb-3" />}
          <div className="text-xl font-bold text-tx">{paso === 'fin' ? '¡Listo, gracias!' : 'Formulario cancelado'}</div>
          <p className="text-sm text-tx2 mt-2">{paso === 'fin'
            ? 'Las tomas se enviaron. Ya podés seguir con tu trabajo.'
            : 'Auditoría va a decidir si te envía un formulario nuevo. Va a aparecer en esta tablet.'}</p>
          {demo && <a href="#/" className="inline-block mt-4 text-sm text-marca font-semibold">Volver al panel</a>}
        </div>
      </Pantalla>
    );
  }

  const toma = form.tomas[indice];
  return (
    <Pantalla>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-xs text-muted">{form.tipo === 'mensual' ? 'Relevamiento mensual' : 'Auditoría autogestionada'}</div>
          <div className="text-xl font-bold text-tx">{form.tienda.nombre}</div>
        </div>
        <Reloj segundos={resto} />
      </div>

      {paso === 'inicio' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-borde p-5 space-y-3">
            <p className="text-base text-tx">Vas a grabar <b>{form.tomas.length} videos cortos</b>. Tenés <b>10 minutos</b> para terminar y no se puede volver a abrir más tarde.</p>
            <ul className="text-sm text-tx2 space-y-1.5">
              {form.tomas.map((t, i) => <li key={t.id} className="flex gap-2"><span className="w-5 h-5 rounded-full bg-marca-bg text-marca text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>{t.nombre}</li>)}
            </ul>
          </div>
          <div className="bg-marca-bg rounded-2xl border border-marca/20 p-5 text-center">
            <div className="text-sm text-tx2"><Mic className="inline w-4 h-4 mr-1 -mt-0.5" />Al empezar cada video, decí en voz alta este código:</div>
            <div className="text-5xl font-bold text-marca tracking-[.3em] tabular-nums mt-2">{form.codigo}</div>
          </div>
          <BotonGrande icon={Camera} onClick={() => setPaso('toma')}>Empezar</BotonGrande>
        </div>
      )}

      {(paso === 'toma' || paso === 'enviando') && (
        <div className="space-y-4">
          <div className="flex gap-1.5">
            {form.tomas.map((t, i) => <div key={t.id} className={`h-1.5 flex-1 rounded-full ${i < indice ? 'bg-ok' : i === indice ? 'bg-marca' : 'bg-borde'}`} />)}
          </div>
          <div className="bg-white rounded-2xl border border-borde p-5">
            <div className="text-xs text-muted font-bold uppercase">Toma {indice + 1} de {form.tomas.length}</div>
            <div className="text-lg font-bold text-tx mt-0.5">{toma.nombre}</div>
            <p className="text-sm text-tx2 mt-1.5">{toma.instruccion}</p>
            {toma.id === 'T3' && form.productos?.length > 0 && (
              <ol className="mt-3 space-y-1.5">
                {form.productos.map((p, i) => <li key={p} className="text-sm text-tx bg-sec rounded-xl px-3 py-2"><b className="text-marca mr-1.5">{i + 1}.</b>{p}</li>)}
              </ol>
            )}
            <p className="text-[11px] text-muted mt-3">Mínimo {toma.segundos_min} segundos, sin cortar. Código: <b className="tabular-nums text-tx">{form.codigo}</b></p>
          </div>
          {aviso && <div className="rounded-xl bg-medio-bg border border-medio/30 px-3 py-2 text-sm text-tx2">{aviso}</div>}
          {paso === 'enviando'
            ? (
              <div className="bg-white rounded-2xl border border-borde p-8 flex flex-col items-center gap-3 text-sm text-tx2">
                <Loader2 className="w-8 h-8 text-marca girar" />
                {progreso < 100 ? `Subiendo el video… ${progreso}%` : 'Analizando la toma…'}
                <div className="w-full max-w-xs h-2 rounded-full bg-sec overflow-hidden"><div className="h-full bg-marca transition-all" style={{ width: `${progreso}%` }} /></div>
                <span className="text-[11px] text-muted">No cierres esta pantalla.</span>
              </div>
            )
            : <Grabadora key={toma.id} toma={toma} codigo={form.codigo} onListo={enviarToma} simulada={token === 'demo'} />}
        </div>
      )}

      {!['enviando'].includes(paso) && (
        <div className="mt-6">
          <BotonGrande variante="peligro" icon={UserRound} onClick={() => setCancelar(true)}>Cancelar: estoy atendiendo</BotonGrande>
        </div>
      )}

      {cancelar && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-tx/40" onClick={() => setCancelar(false)} />
          <div className="relative bg-white rounded-2xl border border-borde w-full max-w-md p-5 space-y-3">
            <div className="text-lg font-bold text-tx">¿Por qué cancelás?</div>
            <p className="text-sm text-tx2">El formulario se anula sin puntaje y queda registrado. Auditoría puede enviarte uno nuevo.</p>
            {['Entró un cliente', 'Hay mucha gente en la tienda', 'Estoy solo/a en la tienda'].map((m) => (
              <BotonGrande key={m} variante="secundario" onClick={() => confirmarCancelacion(m)}>{m}</BotonGrande>
            ))}
            <button className="w-full text-sm text-muted py-2" onClick={() => setCancelar(false)}>Seguir con el formulario</button>
          </div>
        </div>
      )}
      {demo && <p className="text-center text-[11px] text-muted mt-6">Modo demo: no se suben videos ni se envía nada. <a href="#/" className="text-marca font-semibold">Volver al panel</a></p>}
    </Pantalla>
  );
}
