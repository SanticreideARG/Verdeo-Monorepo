/**
 * Verdeo — importar solos los pedidos que llegan por mail a esta cuenta de Gmail.
 *
 * Corre dentro de la cuenta (Google Apps Script), cada 5 minutos. Busca los mails del formulario del
 * sitio, los manda a la API de Verdeo firmados con un secreto y les pone la etiqueta
 * "verdeo-importado". Si la API no responde, se reintentan en la vuelta siguiente: la API reconoce
 * un mail repetido por su id y no lo duplica.
 *
 * Al terminar, le cuenta a Verdeo cómo le fue (Panel de control → Estado del sistema → Correo
 * entrante): enseguida si encontró o falló algo, y si no, cada 30 minutos. Así se ve si el script
 * dejó de correr, que antes no dejaba rastro.
 *
 * No crea pedidos: en Verdeo quedan en "Pedidos por correo para revisar" hasta que alguien los
 * aprueba. Instalación en README.md, en esta misma carpeta.
 */

var VERSION = '2026-11-11';
var SUBJECT = 'subject:"Pedido online"';
var LABEL = 'verdeo-importado';
/** Cuántas conversaciones por búsqueda: de sobra para los pedidos de cinco minutos. */
var BATCH = 50;
/** Sin novedades, cada cuánto se reporta igual que el script sigue vivo. */
var QUIET_REPORT_MINUTES = 30;
/** Margen al buscar desde la corrida anterior: Gmail fecha algunos mails unos minutos antes. */
var OVERLAP_MINUTES = 15;

/*
 * Por qué dos búsquedas (2026-11-11). Gmail junta en una conversación los mails con el mismo
 * asunto, y la etiqueta queda en la conversación: un pedido nuevo que caía en una conversación ya
 * etiquetada no aparecía en "-label:verdeo-importado" y no se mandaba nunca. Ahora se busca también
 * todo lo que llegó desde la corrida anterior, con o sin etiqueta, y se mira mail por mail.
 */
function importarPedidos() {
  var started = new Date();
  var props = PropertiesService.getScriptProperties();
  var stats = { duplicates: 0, failed: 0, found: 0, sentNew: 0 };
  var lastError = null;
  var url = props.getProperty('VERDEO_URL');
  var secret = props.getProperty('VERDEO_SECRET');
  if (!url || !secret) {
    throw new Error('Faltan VERDEO_URL o VERDEO_SECRET en las propiedades del script.');
  }

  try {
    var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
    var since = Number(props.getProperty('ULTIMA_CORRIDA_OK') || 0);
    var cutoff = since ? since - OVERLAP_MINUTES * 60 * 1000 : started.getTime() - 24 * 3600 * 1000;

    var threads = {};
    var pending = GmailApp.search(SUBJECT + ' -label:' + LABEL + ' newer_than:7d', 0, BATCH);
    var recent = GmailApp.search(SUBJECT + ' after:' + Math.floor(cutoff / 1000), 0, BATCH);
    pending.concat(recent).forEach(function (thread) {
      threads[thread.getId()] = thread;
    });

    Object.keys(threads).forEach(function (id) {
      var thread = threads[id];
      var labeled = thread.getLabels().some(function (l) {
        return l.getName() === LABEL;
      });
      var allSent = true;
      thread.getMessages().forEach(function (message) {
        if (!/Pedido online/i.test(message.getSubject())) return;
        // En una conversación ya etiquetada, sólo lo que llegó desde la corrida anterior.
        if (labeled && message.getDate().getTime() < cutoff) return;
        stats.found++;
        var result = send(url, secret, message);
        if (result.ok) {
          if (result.duplicate) stats.duplicates++;
          else stats.sentNew++;
        } else {
          stats.failed++;
          allSent = false;
          lastError = result.error;
        }
      });
      // Sólo se etiqueta si todo llegó: lo que falló se reintenta en la próxima vuelta.
      if (allSent && !labeled) thread.addLabel(label);
    });

    // La marca avanza sólo si no falló nada: si no, la próxima corrida vuelve a mirar lo mismo.
    if (stats.failed === 0) props.setProperty('ULTIMA_CORRIDA_OK', String(started.getTime()));
  } catch (error) {
    lastError = String(error && error.message ? error.message : error);
    report(url, secret, props, started, stats, lastError, true);
    throw error;
  }
  report(url, secret, props, started, stats, lastError, false);
}

/** Manda un mail firmado. La API contesta `duplicate` si ya lo tenía. */
function send(url, secret, message) {
  var response = post(url, secret, {
    body: message.getPlainBody(),
    date: message.getDate().toISOString(),
    from: message.getFrom(),
    messageId: message.getId(),
    subject: message.getSubject(),
  });
  var code = response.getResponseCode();
  if (code !== 200) {
    var error =
      'Verdeo respondió ' +
      code +
      ' para "' +
      message.getSubject() +
      '": ' +
      response.getContentText().slice(0, 300);
    console.warn(error);
    return { error: error, ok: false };
  }
  var duplicate = false;
  try {
    duplicate = JSON.parse(response.getContentText()).status === 'duplicate';
  } catch (ignored) {
    // Una respuesta 200 sin JSON igual es una entrega.
  }
  return { duplicate: duplicate, ok: true };
}

/**
 * Cuenta la corrida a Verdeo: siempre si hubo mails nuevos, errores o fallas, y si no, una vez cada 30
 * minutos con cuántas corridas tranquilas hubo en el medio. Que no llegue el reporte no corta nada.
 */
function report(url, secret, props, started, stats, error, force) {
  var now = Date.now();
  var lastReport = Number(props.getProperty('ULTIMO_REPORTE') || 0);
  var quiet = Number(props.getProperty('CORRIDAS_SIN_NOVEDAD') || 0);
  // Un repetido no es novedad: cada corrida vuelve a mirar los últimos minutos por las dudas.
  var news = force || error || stats.sentNew > 0 || stats.failed > 0;
  if (!news && now - lastReport < QUIET_REPORT_MINUTES * 60 * 1000) {
    props.setProperty('CORRIDAS_SIN_NOVEDAD', String(quiet + 1));
    return;
  }
  try {
    var response = post(url.replace(/\/email\/?$/, '/run'), secret, {
      duplicates: stats.duplicates,
      durationMs: now - started.getTime(),
      error: error ? String(error).slice(0, 1000) : null,
      failed: stats.failed,
      found: stats.found,
      quietRuns: quiet,
      ranAt: started.toISOString(),
      scriptVersion: VERSION,
      sentNew: stats.sentNew,
    });
    if (response.getResponseCode() === 200) {
      props.setProperty('ULTIMO_REPORTE', String(now));
      props.setProperty('CORRIDAS_SIN_NOVEDAD', '0');
    } else {
      console.warn('El reporte de la corrida no llegó: ' + response.getResponseCode());
    }
  } catch (reportError) {
    console.warn('El reporte de la corrida no llegó: ' + reportError);
  }
}

/** Un POST firmado con HMAC-SHA256 del cuerpo, como lo espera la API. */
function post(url, secret, body) {
  var payload = JSON.stringify(body);
  var bytes = Utilities.computeHmacSha256Signature(payload, secret, Utilities.Charset.UTF_8);
  var signature = bytes
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
  return UrlFetchApp.fetch(url, {
    contentType: 'application/json; charset=utf-8',
    headers: { 'x-verdeo-signature': 'sha256=' + signature },
    method: 'post',
    muteHttpExceptions: true,
    payload: payload,
  });
}

/** Correr una sola vez: deja programado importarPedidos cada 5 minutos (y borra los anteriores). */
function instalarDisparador() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'importarPedidos')
      ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('importarPedidos').timeBased().everyMinutes(5).create();
}
