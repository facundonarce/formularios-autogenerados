// Endpoints públicos que usa la tablet. Se autentican con el token de un solo uso del formulario.
//   GET  /api/form?token=...                       → abre el formulario (marca la apertura)
//   GET  /api/form?tienda=<clave>                  → pantalla de espera de la tablet: ¿hay formulario pendiente?
//   POST /api/form { token, accion: 'toma', toma, url, segundos, mime }
//   POST /api/form { token, accion: 'terminar' }
//   POST /api/form { token, accion: 'cancelar', motivo }
import { json, bodyDe, manejar, error } from './_lib/http.js';
import { abrir, registrarToma, terminar, cancelar, pendienteDeTienda } from './_lib/servicio.js';

export default manejar(async (req, res) => {
  if (req.method === 'GET') {
    if (req.query.tienda) return json(res, 200, await pendienteDeTienda(String(req.query.tienda)));
    return json(res, 200, await abrir(String(req.query.token || '')));
  }
  if (req.method !== 'POST') throw error(405, 'Método no permitido');
  const b = bodyDe(req);
  if (b.accion === 'toma') return json(res, 200, await registrarToma(b));
  if (b.accion === 'terminar') return json(res, 200, await terminar(b.token));
  if (b.accion === 'cancelar') return json(res, 200, await cancelar(b.token, b.motivo));
  throw error(400, 'Acción desconocida');
});
