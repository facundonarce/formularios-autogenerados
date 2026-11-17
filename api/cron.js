// Tarea programada: corre cada 5 minutos. Programa, envía, recuerda, vence y cierra formularios.
// Se protege con CRON_SECRET: Vercel Cron manda "Authorization: Bearer <CRON_SECRET>";
// un disparador externo (Apps Script, cron-job.org) puede mandar ?secret=<CRON_SECRET>.
import { json, manejar, error, appUrl } from './_lib/http.js';
import { tick } from './_lib/servicio.js';

export default manejar(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const ok = !secret || req.headers.authorization === `Bearer ${secret}` || req.query.secret === secret;
  if (!ok) throw error(401, 'No autorizado');
  json(res, 200, await tick(appUrl(req)));
});
