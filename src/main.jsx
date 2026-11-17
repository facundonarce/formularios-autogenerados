import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth, BotonGoogle } from './lib/auth.jsx';
import { DatosProvider } from './lib/datos.jsx';
import { DEMO } from './lib/api.js';
import Shell from './components/Shell.jsx';
import Resumen from './pages/Resumen.jsx';
import Formularios from './pages/Formularios.jsx';
import Reenvios from './pages/Reenvios.jsx';
import Revision from './pages/Revision.jsx';
import Programacion from './pages/Programacion.jsx';
import Tiendas from './pages/Tiendas.jsx';
import Preguntas from './pages/Preguntas.jsx';
import Tablet from './pages/Tablet.jsx';
import Espera from './pages/Espera.jsx';

function Login() {
  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-borde shadow-2xs p-8 w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-xl border border-borde p-1.5 mx-auto"><img src={`${import.meta.env.BASE_URL}isologo.svg`} alt="" className="w-full h-full" /></div>
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <span className="text-lg font-bold text-tx">CARESTINO</span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-marca-bg text-marca">BI</span>
        </div>
        <div className="text-[11px] text-muted">Auditoría Autogestionada</div>
        <p className="text-xs text-tx2 mt-6 mb-4">Ingresá con tu cuenta de Google. Solo pueden entrar los usuarios habilitados.</p>
        <BotonGoogle />
      </div>
    </div>
  );
}

function Panel() {
  const { token, salir } = useAuth();
  if (!token) return <Login />;
  return (
    <DatosProvider onSesionVencida={salir}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Resumen />} />
          <Route path="formularios" element={<Formularios />} />
          <Route path="reenvios" element={<Reenvios />} />
          <Route path="revision" element={<Revision />} />
          <Route path="programacion" element={<Programacion />} />
          <Route path="tiendas" element={<Tiendas />} />
          <Route path="preguntas" element={<Preguntas />} />
          <Route path="*" element={<Resumen />} />
        </Route>
      </Routes>
    </DatosProvider>
  );
}

// El demo publicado como página estática usa HashRouter (no hay rewrites del servidor).
const Router = DEMO ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/f/:token" element={<Tablet />} />
          <Route path="/t/:clave" element={<Espera />} />
          <Route path="/*" element={<Panel />} />
        </Routes>
      </AuthProvider>
    </Router>
  </StrictMode>,
);
