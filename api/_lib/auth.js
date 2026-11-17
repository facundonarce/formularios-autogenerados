// Ingreso al panel con cuenta de Google. El frontend manda el ID token de Google
// en Authorization: Bearer <token>; acá se verifica y se busca el email en la hoja Usuarios.
import { OAuth2Client } from 'google-auth-library';
import { error } from './http.js';

const client = new OAuth2Client();

export async function usuarioDesde(req, usuarios) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw error(401, 'Sesión no iniciada');
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw error(401, 'Sesión vencida. Volvé a ingresar.');
  }
  const email = String(payload.email || '').toLowerCase();
  const u = usuarios.find((x) => String(x.email).toLowerCase() === email);
  if (!u || !payload.email_verified) throw error(403, `${email} no tiene acceso al panel`);
  return { email, nombre: u.nombre || payload.name, rol: u.rol, foto: payload.picture };
}

export function exigirRol(usuario, ...roles) {
  if (!roles.includes(usuario.rol)) throw error(403, 'Tu rol no permite esta acción');
}
