// Agente evaluador: manda el video de una toma a Gemini con las preguntas que cubre
// y recibe una respuesta por pregunta, con confianza, motivo y segundo del video.
const BASE = 'https://generativelanguage.googleapis.com';
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const INLINE_MAX = 18 * 1024 * 1024;

function opcionesDe(p) {
  return p.tipo_respuesta === 'escala' ? ['Buena', 'Regular', 'Mala', 'No se puede relevar'] : ['Si', 'No', 'No se puede relevar'];
}

export function armarPrompt({ toma, preguntas, productos, codigo, tienda }) {
  const lista = preguntas.map((p) => {
    const esperada = p.tipo_respuesta === 'escala' ? 'Buena' : (p.positivo === 'SI' ? 'Si' : 'No');
    return `- [${p.num}] ${p.texto}\n  Opciones: ${opcionesDe(p).join(' / ')}. Respuesta esperada si todo está bien: ${esperada}.\n  Ejemplo de incidencia: "${p.texto_incidencia}"`;
  }).join('\n');
  return `Sos auditor de tiendas de Carestino (productos para bebés). Evaluás un video grabado en vivo por el encargado de "${tienda.nombre}".

Toma: ${toma.nombre}. Instrucción que recibió el encargado: "${toma.instruccion}"
${productos?.length && toma.id === 'T3' ? `Productos que debía mostrar: ${productos.join('; ')}.` : ''}

1) Al comienzo del video el encargado debe decir en voz alta el código ${codigo}. Indicá qué código escuchaste.
2) Respondé cada pregunta SOLO con lo que se ve o escucha en el video. Si algo no se llega a ver con claridad, respondé "No se puede relevar". No supongas.
3) Sé estricto como un auditor externo: polvo visible, productos mal plegados, cintos sueltos, cajas abolladas o cosas fuera de lugar son incidencias.
4) confianza: 0 a 100. motivo: una frase corta y concreta. segundo: segundo del video donde se ve (o -1).

Preguntas:
${lista}`;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    codigo_escuchado: { type: 'STRING' },
    respuestas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          pregunta: { type: 'INTEGER' },
          respuesta: { type: 'STRING' },
          confianza: { type: 'INTEGER' },
          motivo: { type: 'STRING' },
          segundo: { type: 'NUMBER' },
        },
        required: ['pregunta', 'respuesta', 'confianza', 'motivo'],
      },
    },
  },
  required: ['codigo_escuchado', 'respuestas'],
};

async function subirArchivo(bytes, mime, key) {
  const start = await fetch(`${BASE}/upload/v1beta/files?key=${key}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: `toma-${Date.now()}` } }),
  });
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini: no se pudo iniciar la subida del video');
  const fin = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Length': String(bytes.byteLength) },
    body: bytes,
  });
  let { file } = await fin.json();
  for (let i = 0; i < 20 && file.state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await (await fetch(`${BASE}/v1beta/${file.name}?key=${key}`)).json();
  }
  if (file.state !== 'ACTIVE') throw new Error('Gemini: el video no quedó listo para analizar');
  return { file_data: { mime_type: mime, file_uri: file.uri } };
}

export async function evaluarToma({ bytes, mime, toma, preguntas, productos, codigo, tienda }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Falta GEMINI_API_KEY');
  const tipo = (mime || 'video/webm').split(';')[0];
  const media = bytes.byteLength <= INLINE_MAX
    ? { inline_data: { mime_type: tipo, data: Buffer.from(bytes).toString('base64') } }
    : await subirArchivo(bytes, tipo, key);

  const res = await fetch(`${BASE}/v1beta/models/${MODEL()}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [media, { text: armarPrompt({ toma, preguntas, productos, codigo, tienda }) }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini: ${data?.error?.message || res.status}`);
  const texto = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}';
  const out = JSON.parse(texto);
  const validas = new Set(preguntas.map((p) => p.num));
  out.respuestas = (out.respuestas || []).filter((x) => validas.has(Number(x.pregunta)));
  for (const p of preguntas) {
    if (!out.respuestas.find((x) => Number(x.pregunta) === p.num)) {
      out.respuestas.push({ pregunta: p.num, respuesta: 'No se puede relevar', confianza: 0, motivo: 'Sin respuesta del modelo', segundo: -1 });
    }
  }
  return out;
}
