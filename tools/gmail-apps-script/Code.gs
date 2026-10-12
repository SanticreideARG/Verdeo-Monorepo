/**
 * Verdeo — importar solos los pedidos que llegan por mail a esta cuenta de Gmail.
 *
 * Corre dentro de la cuenta (Google Apps Script), cada 5 minutos. Busca los mails del formulario del
 * sitio que todavía no mandó, los manda a la API de Verdeo firmados con un secreto, y les pone la
 * etiqueta "verdeo-importado" para no mandarlos de nuevo. Si la API no responde, no los etiqueta y
 * los reintenta en la vuelta siguiente: la API reconoce un mail repetido por su id y no lo duplica.
 *
 * No crea pedidos: en Verdeo quedan en "Pedidos por correo para revisar" hasta que alguien los
 * aprueba. Instalación en README.md, en esta misma carpeta.
 */

/** Los mails a mandar: los del formulario, los no mandados todavía, de la última semana. */
var QUERY = 'subject:"Pedido online" -label:verdeo-importado newer_than:7d';
var LABEL = 'verdeo-importado';
/** Cuántos hilos por vuelta: de sobra para los pedidos de cinco minutos. */
var BATCH = 20;

function importarPedidos() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('VERDEO_URL');
  var secret = props.getProperty('VERDEO_SECRET');
  if (!url || !secret) {
    throw new Error('Faltan VERDEO_URL o VERDEO_SECRET en las propiedades del script.');
  }
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);

  var threads = GmailApp.search(QUERY, 0, BATCH);
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    var allSent = true;
    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];
      if (!/Pedido online/i.test(message.getSubject())) continue;
      if (!send(url, secret, message)) allSent = false;
    }
    // Sólo se etiqueta si todo el hilo llegó: lo que falló se reintenta en la próxima vuelta.
    if (allSent) threads[t].addLabel(label);
  }
}

/** Manda un mail firmado. Devuelve si la API lo recibió (nuevo o repetido). */
function send(url, secret, message) {
  var payload = JSON.stringify({
    body: message.getPlainBody(),
    date: message.getDate().toISOString(),
    from: message.getFrom(),
    messageId: message.getId(),
    subject: message.getSubject(),
  });
  var bytes = Utilities.computeHmacSha256Signature(payload, secret, Utilities.Charset.UTF_8);
  var signature = bytes
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
  var response = UrlFetchApp.fetch(url, {
    contentType: 'application/json; charset=utf-8',
    headers: { 'x-verdeo-signature': 'sha256=' + signature },
    method: 'post',
    muteHttpExceptions: true,
    payload: payload,
  });
  var code = response.getResponseCode();
  if (code !== 200) {
    console.warn(
      'Verdeo respondió ' +
        code +
        ' para "' +
        message.getSubject() +
        '": ' +
        response.getContentText().slice(0, 300),
    );
    return false;
  }
  return true;
}

/** Correr una sola vez: deja programado importarPedidos cada 5 minutos. */
function instalarDisparador() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'importarPedidos')
      ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('importarPedidos').timeBased().everyMinutes(5).create();
}
