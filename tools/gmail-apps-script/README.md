# Pedidos por mail: script de Gmail

`Code.gs` corre dentro de la cuenta de Gmail que recibe los pedidos del sitio y los manda solos a
Verdeo, donde quedan en **Pedidos → Pedidos por correo para revisar** hasta que alguien los aprueba.
Por qué así y no de otra forma: `docs/12-development/INBOUND_LISTENERS_PLAN.md`.

## Instalación (una sola vez, unos diez minutos)

1. **El secreto.** Generá uno largo (por ejemplo con `openssl rand -hex 32`) y cargalo en Vercel, en
   el proyecto de la **API**, como variable `INBOUND_EMAIL_SECRET`. Volvé a desplegar la API para que
   la tome. Sin esta variable, la API rechaza todos los mails.
2. **El proyecto de Apps Script.** Entrá a <https://script.google.com> **con la cuenta de Gmail que
   recibe los pedidos** → _Nuevo proyecto_. Borrá lo que trae y pegá el contenido de `Code.gs`.
   Ponele un nombre ("Verdeo pedidos").
3. **Las propiedades.** _Configuración del proyecto_ (el engranaje) → _Propiedades del script_:
   - `VERDEO_URL`: la dirección de la API más `/api/v1/inbound/email`, por ejemplo
     `https://<dominio-de-la-api>/api/v1/inbound/email`.
   - `VERDEO_SECRET`: el mismo secreto del paso 1.
4. **Los permisos.** Elegí la función `importarPedidos` y apretá _Ejecutar_. Google pide permiso para
   leer Gmail y conectarse a servicios externos. Como el script es tuyo y no está publicado, avisa
   que "Google no verificó esta app": _Configuración avanzada_ → _Ir a Verdeo pedidos_ → _Permitir_.
5. **Probar.** Con un mail de pedido sin etiquetar en la bandeja, `importarPedidos` lo manda y le pone
   la etiqueta `verdeo-importado`. En Verdeo aparece en Pedidos, y en _Panel de control → Estado del
   sistema → Correo entrante_ se ve la hora del último recibido.
6. **Dejarlo andando.** Elegí `instalarDisparador` y apretá _Ejecutar_ una vez. Desde ahí corre solo
   cada 5 minutos.

## Si algo no anda

- **No aparece nada en Verdeo**: en Apps Script, _Ejecuciones_ muestra cada corrida y su error. Un 403
  es secreto distinto entre Vercel y el script (o falta `INBOUND_EMAIL_SECRET`); un 400 es un mail con
  un formato que la API no esperaba.
- **Volver a mandar un mail**: quitale la etiqueta `verdeo-importado` en Gmail. La API reconoce los
  repetidos y no duplica nada.
- **Cambiar qué mails se mandan**: la constante `QUERY` usa la misma búsqueda que el buscador de Gmail.

El script versionado acá es la referencia: si se cambia en Apps Script, copiá el cambio a este
archivo.
