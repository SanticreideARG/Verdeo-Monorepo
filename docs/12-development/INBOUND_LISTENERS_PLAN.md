# Escuchar Gmail (y WhatsApp) sin servidor propio — análisis

Estado: **análisis, nada construido**. Pedido: importar solos los emails de pedidos que llegan a una
cuenta de Gmail, con prioridad para una solución _serverless_; si no la hay, montar un servidor
"listener" para Gmail y WhatsApp.

## Conclusión

**No hace falta un servidor para ninguno de los dos.**

- **WhatsApp ya es serverless.** La API oficial (Cloud API de Meta) avisa por webhook, y el webhook
  ya existe (`POST /api/v1/webhooks/whatsapp`). Un servidor sólo haría falta para la vía no oficial
  (WhatsApp Web automatizado: Baileys, whatsapp-web.js), que necesita una conexión abierta todo el
  tiempo, viola los términos de WhatsApp y termina en números bloqueados. **No se recomienda.**
- **Gmail se puede escuchar sin servidor** de tres maneras; la recomendada es la primera.

## Opciones para Gmail

### A. Google Apps Script en la propia cuenta (recomendada para empezar)

Un script de Google que vive en la cuenta de Gmail, corre cada 1 a 5 minutos (disparador por
tiempo) y manda a la API los mails nuevos de pedidos.

1. Busca los mails del formulario (`subject:"Pedido online" -label:verdeo-importado`).
2. Por cada uno manda `{ messageId, from, subject, date, body }` a
   `POST /api/v1/integrations/email/inbound`, firmado con un secreto compartido.
3. Si la API responde bien, le pone la etiqueta `verdeo-importado`. Así no se repite, y si la API
   está caída se reintenta en la próxima vuelta.

- **A favor**: gratis, sin Google Cloud, sin app de OAuth que verificar ni tokens que vencen
  (corre como el dueño de la cuenta), sin servidor. Se instala en diez minutos pegando el script.
- **En contra**: demora de hasta un minuto (no es instantáneo); el script vive en la cuenta de Google
  y no en el repositorio (se versiona igual, copiándolo a `tools/gmail-apps-script/`); cuotas de
  Apps Script (de sobra para decenas de mails por día).

### B. Gmail API con aviso por Pub/Sub (tiempo real)

`users.watch` deja a Gmail avisando cada cambio a un tema de Google Pub/Sub, que lo empuja a un
endpoint de la API. La API pide los mails nuevos con `users.history.list`.

- **A favor**: instantáneo, todo desde el repositorio, estándar.
- **En contra**: proyecto en Google Cloud, Pub/Sub, y una app de OAuth con permiso de lectura de
  Gmail, que Google trata como **permiso restringido**: en modo de prueba los tokens vencen a los 7
  días, y publicarla pide verificación. El `watch` vence cada 7 días y hay que renovarlo (el cron
  diario alcanza). Más piezas para el mismo resultado.
- **Cuándo**: si la demora de un minuto de la opción A llega a molestar, o si la cuenta es de Google
  Workspace (ahí la app puede ser interna y se evita la verificación).

### C. Reenvío a un servicio de correo entrante

Una regla de Gmail reenvía los mails de pedidos a una casilla de un proveedor (Cloudflare Email
Routing con un Worker, Postmark, SendGrid Inbound Parse, Resend) que los entrega por webhook.

- **A favor**: sin código en Google, instantáneo.
- **En contra**: los pedidos pasan por un tercero más; Gmail exige verificar la dirección de
  reenvío; otro proveedor y otra cuenta que mantener.

### Descartado: sondear Gmail desde el cron de Vercel

Los crons del plan actual corren **una vez por día** (los dos que hay hoy son diarios). Para leer
cada pocos minutos haría falta el plan pago de Vercel o un cron externo; la opción A hace lo mismo
gratis y desde adentro de Google.

## Qué se construye del lado de Verdeo (sirve para A, B y C)

1. **`POST /api/v1/integrations/email/inbound`**: recibe el mail, verifica la firma (HMAC con un
   secreto, mismo patrón que `CRON_SECRET`) y lo guarda **una sola vez por `messageId`**
   (idempotente: el script puede reintentar sin duplicar).
2. **Bandeja de "Pedidos entrantes"**: los mails recibidos pasan por el parser que ya existe
   (`parseOrderEmails`, el de "Pegar emails") y quedan en una lista para revisar, con el mismo
   diálogo de importación de hoy (cliente encontrado o nuevo, variedad, duplicados, consultas).
3. **Aviso**: un número en el menú ("3 pedidos entrantes") y, opcional, un aviso en el chat.
4. **Estado del sistema**: la última recepción y los rechazados (firma inválida, mail que no se
   pudo leer), para saber si el script dejó de correr.

## Decisiones abiertas

1. **¿Importar solos o revisar antes?** Propongo **revisar antes** al principio: los mails ya
   traen sorpresas (consultas en cero, variedades con otro nombre, teléfonos raros). Cuando la
   bandeja muestre que casi todo entra limpio, se puede pasar a crear borradores solos y dejar en la
   bandeja sólo lo dudoso.
2. **¿Qué cuenta?** Si es una cuenta de Google Workspace, la opción B se simplifica mucho. Si es
   una @gmail.com común, la A es claramente la mejor.
3. **¿Cuándo sí un servidor?** Sólo si aparece algo que necesite una conexión abierta todo el
   tiempo o trabajos de más de unos minutos (lo que una función de Vercel no aguanta). Para eso
   alcanza una instancia chica en Fly.io, Railway o Render. Hoy no hay nada en esa lista.

## Plan

| Paso | Qué                                                                                  |
| ---- | ------------------------------------------------------------------------------------ |
| 1    | Endpoint de entrada firmado e idempotente, y tabla de mails recibidos                |
| 2    | Bandeja "Pedidos entrantes" reusando el parser y el diálogo de importación           |
| 3    | Script de Apps Script versionado en el repositorio, con instrucciones de instalación |
| 4    | Estado del sistema: última recepción y rechazados                                    |
| 5    | (Más adelante) crear borradores solos para lo que entra limpio                       |
