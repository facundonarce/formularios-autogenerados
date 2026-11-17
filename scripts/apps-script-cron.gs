/**
 * Disparador de la tarea programada desde Google Apps Script.
 * Vercel Hobby solo permite crons diarios; con esto se llama a /api/cron cada 5 minutos.
 *
 * 1. Pegá este código en un proyecto de Apps Script (puede ser el del Sheet).
 * 2. En Propiedades del script cargá APP_URL (ej. https://auditoria.vercel.app) y CRON_SECRET.
 * 3. Ejecutá crearDisparador() una sola vez.
 */
function llamarCron() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('APP_URL') + '/api/cron?secret=' + encodeURIComponent(props.getProperty('CRON_SECRET'));
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log(r.getResponseCode() + ' ' + r.getContentText().slice(0, 500));
}

function crearDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'llamarCron') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('llamarCron').timeBased().everyMinutes(5).create();
}
