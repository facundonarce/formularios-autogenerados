// Helpers para las funciones serverless de Vercel.
export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function bodyDe(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  return host ? `https://${host}` : '';
}

export function manejar(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(e);
      json(res, e.status || 500, { error: e.message || 'Error interno' });
    }
  };
}

export function error(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
