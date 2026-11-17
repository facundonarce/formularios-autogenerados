// Definiciones compartidas entre el frontend, las funciones /api y el script de carga.
export { PESOS, MODULOS, PREGUNTAS, TIENDAS } from './catalog-data.js';

// Tomas guiadas. Las T* van en el formulario semanal; las M* en el relevamiento mensual.
export const TOMAS = [
  { id: 'T1', nombre: 'Fachada y vidriera', tipo: 'semanal', medio: 'video', segundos_min: 20,
    instruccion: 'Parate en la vereda frente a la tienda. Grabá la fachada completa y después recorré la vidriera de punta a punta, despacio.' },
  { id: 'T2', nombre: 'Recorrido del salón', tipo: 'semanal', medio: 'video', segundos_min: 30,
    instruccion: 'Desde la entrada, recorré todo el salón despacio, mostrando pisos, tarimas, espejos, plantas y la TV. Terminá enfocando el display del aire o un termómetro.' },
  { id: 'T3', nombre: 'Productos al azar', tipo: 'semanal', medio: 'video', segundos_min: 25,
    instruccion: 'Mostrá de cerca, dando la vuelta completa, cada uno de los productos indicados. Incluí el cartel de precio de cada uno.' },
  { id: 'T4', nombre: 'Sector caja', tipo: 'semanal', medio: 'video', segundos_min: 15,
    instruccion: 'Grabá la caja de frente y el mostrador completo, incluyendo los planes de financiación visibles.' },
  { id: 'T5', nombre: 'Equipo', tipo: 'semanal', medio: 'video', segundos_min: 15,
    instruccion: 'Grabá a todo el equipo presente, incluido vos, con el uniforme y la credencial visibles de cerca.' },
  { id: 'T6', nombre: 'Depósito', tipo: 'semanal', medio: 'video', segundos_min: 30,
    instruccion: 'Recorré los pasillos y estanterías del depósito, acercándote a las etiquetas de las cajas. Mostrá también las escaleras y el sector de insumos.' },
  { id: 'T7', nombre: 'Baño', tipo: 'semanal', medio: 'video', segundos_min: 15,
    instruccion: 'Grabá el baño completo, mostrando papel, toallas, jabón y desodorante de ambiente.' },
  { id: 'T8', nombre: 'Elementos de limpieza', tipo: 'semanal', medio: 'video', segundos_min: 10,
    instruccion: 'Grabá el sector de insumos de limpieza y los utensilios (trapo, microfibras, escoba).' },
  { id: 'M1', nombre: 'Botiquín', tipo: 'mensual', medio: 'video', segundos_min: 10,
    instruccion: 'Abrí el botiquín y mostrá su contenido completo.' },
  { id: 'M2', nombre: 'Cartelería', tipo: 'mensual', medio: 'video', segundos_min: 15,
    instruccion: 'Mostrá el cartel de horarios en la puerta, el de mascotas, el de "Estamos filmando" y el cartel de salida del depósito.' },
  { id: 'M3', nombre: 'Equipamiento', tipo: 'mensual', medio: 'video', segundos_min: 15,
    instruccion: 'Mostrá la plancha vertical, el prolongador del plumero y las tablets (con la portada en pantalla).' },
  { id: 'M4', nombre: 'Aire acondicionado', tipo: 'mensual', medio: 'video', segundos_min: 15,
    instruccion: 'Mostrá los equipos de aire y extraé un filtro para mostrarlo de cerca.' },
  { id: 'M5', nombre: 'Insumos', tipo: 'mensual', medio: 'video', segundos_min: 10,
    instruccion: 'Mostrá el stock de fajas y guantes, y las bolsas de cartón.' },
  { id: 'M6', nombre: 'Sistema NICOX', tipo: 'mensual', medio: 'video', segundos_min: 10, solo: 'reseller',
    instruccion: 'Mostrá la pantalla del sistema NICOX en uso.' },
];

// Categorías y ubicaciones para armar los productos de T3.
export const PRODUCTOS_T3 = ['el cochecito', 'la butaca para auto', 'la cuna', 'la silla de comer', 'la mochila', 'el practicuna', 'el andador', 'la bañera'];
export const UBICACIONES_T3 = ['más cerca de la caja', 'más cerca de la entrada', 'más alejado de la vidriera', 'en la tarima principal', 'más cerca del espejo'];

export const CONFIG_DEFAULT = {
  franjas: '10:00-11:00,14:00-15:00',      // hora local de cada tienda
  ventana_apertura_min: 15,                 // minutos para abrir el link
  recordatorio_min: 10,                     // recordatorio en el hilo
  ventana_completar_min: 10,                // minutos para completar una vez abierto
  tomas_por_formulario: 4,
  formularios_semanales: 1,
  dias_habiles: '1,2,3,4,5,6',              // 1 = lunes ... 7 = domingo
  max_reenvios: 2,
  umbral_confianza: 70,
  cruce_camaras: 0.25,                      // proporción de formularios para cotejar con cámaras
  feriados: '',                             // ej: AR:2026-12-08,PE:2026-12-08
};

export const USUARIOS = [
  { email: 'facundoarce@biamex.com', nombre: 'Facundo Arce', rol: 'admin' },
  { email: 'reporting@carestino.com', nombre: 'Reporting', rol: 'responsable' },
];

// Estados de un formulario.
export const ESTADOS = {
  programado: 'Programado',
  enviado: 'Enviado',
  abierto: 'En curso',
  completado: 'Completado',
  cancelado: 'Cancelado',
  vencido: 'Vencido',
  no_realizado: 'No realizado',
  anulado: 'Anulado',
};

// Estructura del Google Sheet: una pestaña por tabla, la primera fila son los encabezados.
export const SHEET_SCHEMA = {
  Tiendas: ['id', 'nombre', 'tipo', 'pais', 'timezone', 'clave', 'slack_channel', 'activa', 'franjas'],
  Preguntas: ['num', 'texto', 'modulo', 'impacto', 'positivo', 'tipo_respuesta', 'aplica_a', 'tratamiento', 'toma', 'texto_incidencia'],
  Tomas: ['id', 'nombre', 'tipo', 'medio', 'segundos_min', 'instruccion', 'solo'],
  Formularios: ['id', 'token', 'tienda_id', 'tipo', 'estado', 'programado_para', 'enviado_at', 'recordado_at', 'abierto_at', 'completado_at',
    'tomas', 'productos', 'codigo', 'origen_id', 'reenvio_n', 'reenviado_por', 'cancel_motivo', 'slack_channel', 'slack_ts', 'cruce_camaras', 'cruce_resultado', 'cruce_por'],
  Evidencias: ['id', 'formulario_id', 'toma', 'archivo_id', 'url', 'segundos', 'codigo_ok', 'creado_at', 'evaluado_at', 'error'],
  Respuestas: ['id', 'formulario_id', 'tienda_id', 'fecha', 'pregunta', 'respuesta', 'confianza', 'motivo', 'segundo', 'revision', 'respuesta_final', 'revisado_por', 'revisado_at'],
  Usuarios: ['email', 'nombre', 'rol'],
  Config: ['clave', 'valor'],
};
