// Subida de videos a Google Drive en partes.
//   POST /api/upload { accion: 'iniciar', token, toma, mime, size }  → { ticket, parte }
//   POST /api/upload { accion: 'parte', ticket, inicio, total, datos (base64) } → { completo, archivo? }
import { json, bodyDe, manejar, error } from './_lib/http.js';
import { cargar, validarSubida } from './_lib/servicio.js';
import { iniciarSubida, subirParte, firmar, verificar, PARTE_BYTES } from './_lib/drive.js';

export default manejar(async (req, res) => {
  if (req.method !== 'POST') throw error(405, 'Método no permitido');
  const b = bodyDe(req);

  if (b.accion === 'iniciar') {
    const ctx = await cargar(['Config', 'Tiendas', 'Formularios']);
    const f = validarSubida(ctx, b.token);
    if (!String(f.tomas).split(',').includes(b.toma)) throw error(400, 'Toma inválida');
    if (!(b.size > 0) || b.size > 80 * 1024 * 1024) throw error(400, 'Tamaño de video inválido');
    const mime = String(b.mime || 'video/webm').split(';')[0];
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const fecha = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const sesion = await iniciarSubida({ nombre: `${fecha}_${f.tienda_id}_${f.id}_${b.toma}.${ext}`, mime, size: b.size });
    const ticket = firmar({ sesion, formulario: f.id, toma: b.toma, total: b.size, exp: Date.now() + 30 * 60000 });
    return json(res, 200, { ticket, parte: PARTE_BYTES });
  }

  if (b.accion === 'parte') {
    const t = verificar(b.ticket);
    const bytes = Buffer.from(String(b.datos || ''), 'base64');
    if (!bytes.length || Number(b.total) !== t.total) throw error(400, 'Parte inválida');
    const r = await subirParte({ sesion: t.sesion, bytes, inicio: Number(b.inicio), total: t.total });
    return json(res, 200, r.completo ? { completo: true, archivo: { id: r.id, link: r.webViewLink } } : { completo: false });
  }

  throw error(400, 'Acción desconocida');
});
