// Bot de Slack: publica el aviso con botón en el canal de cada tienda, recuerda en el hilo
// y actualiza el mensaje. Necesita SLACK_BOT_TOKEN (scope chat:write) y el bot invitado a cada canal.
async function slack(metodo, body) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.log(`[slack simulado] ${metodo}`, JSON.stringify(body).slice(0, 300));
    return { ok: true, ts: `sim-${Date.now()}`, channel: body.channel };
  }
  const r = await fetch(`https://slack.com/api/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) console.error(`Slack ${metodo}:`, data.error);
  return data;
}

export async function avisarFormulario({ canal, tienda, url, tipo, minutosApertura, esReenvio }) {
  const titulo = tipo === 'mensual' ? 'Relevamiento mensual' : 'Auditoría autogestionada';
  const texto = `${esReenvio ? 'Nuevo formulario (reenvío)' : titulo} para ${tienda.nombre}. Tenés ${minutosApertura} minutos para empezarlo desde la tablet.`;
  return slack('chat.postMessage', {
    channel: canal,
    text: texto,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `<!here> *${esReenvio ? 'Nuevo formulario (reenvío)' : titulo}* · ${tienda.nombre}\nTenés *${minutosApertura} minutos* para empezarlo desde la tablet. Una vez abierto, hay que terminarlo.` } },
      { type: 'actions', elements: [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Empezar auditoría' }, url }] },
    ],
  });
}

export async function recordar({ canal, ts, minutosRestantes }) {
  return slack('chat.postMessage', { channel: canal, thread_ts: ts, text: `Recordatorio: quedan ${minutosRestantes} minutos para empezar el formulario.` });
}

export async function actualizarAviso({ canal, ts, texto }) {
  if (!ts || String(ts).startsWith('sim-')) return { ok: true };
  return slack('chat.update', { channel: canal, ts, text: texto, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: texto } }] });
}

export async function enHilo({ canal, ts, texto }) {
  return slack('chat.postMessage', { channel: canal, thread_ts: ts && !String(ts).startsWith('sim-') ? ts : undefined, text: texto });
}

export async function avisarAuditoria(texto) {
  const canal = process.env.SLACK_AUDIT_CHANNEL;
  if (!canal) return console.log('[auditoría]', texto);
  return slack('chat.postMessage', { channel: canal, text: texto });
}
