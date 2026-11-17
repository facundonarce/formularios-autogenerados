// Endpoints del panel. Requieren ingreso con Google y un usuario cargado en la hoja Usuarios.
//   GET  /api/admin                                → dataset completo para el panel
//   POST /api/admin { accion: 'reenviar', formulario, cuando: 'ahora' | 'franja' }   (admin, responsable)
//   POST /api/admin { accion: 'no_realizado', formulario }                            (admin, responsable)
//   POST /api/admin { accion: 'revisar', respuesta, valor }                           (admin, responsable)
//   POST /api/admin { accion: 'cruce', formulario, coincide }                         (admin)
//   POST /api/admin { accion: 'programar_ahora', tienda, tipo }                       (admin) — prueba manual
import { json, bodyDe, manejar, error, appUrl } from './_lib/http.js';
import { usuarioDesde, exigirRol } from './_lib/auth.js';
import { cargar, dataset, reenviar, marcarNoRealizado, revisar, registrarCruce, nuevoFormulario, despachar } from './_lib/servicio.js';
import { agregarFilas, leerTablas } from './_lib/sheets.js';

export default manejar(async (req, res) => {
  const ctx = await cargar();
  const usuario = await usuarioDesde(req, ctx.usuarios);

  if (req.method === 'GET') return json(res, 200, { ...dataset(ctx, appUrl(req)), usuario });
  if (req.method !== 'POST') throw error(405, 'Método no permitido');

  const b = bodyDe(req);
  switch (b.accion) {
    case 'reenviar':
      exigirRol(usuario, 'admin', 'responsable');
      return json(res, 200, await reenviar(ctx, b.formulario, usuario, b.cuando, appUrl(req)));
    case 'no_realizado':
      exigirRol(usuario, 'admin', 'responsable');
      return json(res, 200, await marcarNoRealizado(ctx, b.formulario));
    case 'revisar':
      exigirRol(usuario, 'admin', 'responsable');
      return json(res, 200, await revisar(ctx, b.respuesta, b.valor, usuario));
    case 'cruce':
      exigirRol(usuario, 'admin');
      return json(res, 200, await registrarCruce(ctx, b.formulario, !!b.coincide, usuario));
    case 'programar_ahora': {
      exigirRol(usuario, 'admin');
      const tienda = ctx.tiendas.find((t) => t.id === b.tienda);
      if (!tienda) throw error(404, 'Tienda no encontrada');
      const f = nuevoFormulario({ tienda, tipo: b.tipo || 'semanal', cuando: new Date() });
      await agregarFilas('Formularios', [f]);
      ctx.formularios = (await leerTablas(['Formularios'])).Formularios;
      const enviado = await despachar(ctx, ctx.formularios.find((x) => x.id === f.id), appUrl(req));
      return json(res, 200, { ok: true, id: f.id, link: `${appUrl(req)}/f/${enviado.token}` });
    }
    default:
      throw error(400, 'Acción desconocida');
  }
});
