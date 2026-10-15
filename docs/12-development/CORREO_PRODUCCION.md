# Correo en producción: remitente y pedidos por mail

Instructivo para dejar el correo de Verdeo andando en producción. Son dos cosas separadas:

|                                            | Para qué                                                               | Dónde se configura                            | Qué necesita                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| **Envío** (Resend)                         | Verdeo **manda** correos: enlaces de acceso, avisos de pedido, pruebas | Panel de control → Integraciones → **Correo** | Una cuenta de Resend con el dominio de Verdeo verificado y una clave de API |
| **Pedidos por mail** (Gmail + Apps Script) | Verdeo **recibe** los pedidos que llegan al Gmail del sitio            | Vercel (API) + Google Apps Script             | Un secreto compartido (`INBOUND_EMAIL_SECRET`)                              |

No dependen una de la otra: se pueden hacer en cualquier orden.

## Antes de empezar

1. Las migraciones y los permisos al día (sin `settings.access` no se ve el Panel de control):

   ```bash
   pnpm db:migrate --produccion
   pnpm db:seed-permissions --produccion
   ```

2. En Vercel, proyecto de la **API**, tiene que existir `AI_CONFIG_ENCRYPTION_KEY` (32 bytes en
   base64). Es la que cifra las claves guardadas, incluida la de Resend. Si en Correo aparece
   "Falta configurar la clave de cifrado del servidor", falta ésta. Para generarla:

   ```bash
   openssl rand -base64 32
   ```

   Cargarla y volver a desplegar la API. **No cambiarla después**: las claves guardadas con la
   anterior dejan de poder leerse y hay que volver a cargarlas.

## 1. El remitente de producción (Resend)

El remitente tiene que ser una dirección **de un dominio verificado en Resend**. Un Gmail
(`@gmail.com`) no sirve como remitente: Resend no deja verificar dominios que no son tuyos, así que
todo envío desde ahí se rechaza o termina en spam. Lo correcto es algo como
`pedidos@verdeo.com.ar` o `hola@verdeo.com.ar`.

### 1.1 Verificar el dominio

1. Entrar a <https://resend.com> con la cuenta del negocio (no la personal) → **Domains** →
   **Add domain** → `verdeo.com.ar` (o un subdominio como `mail.verdeo.com.ar`, que deja el
   dominio principal tranquilo).
2. Resend muestra registros DNS (SPF/MX, DKIM y opcionalmente DMARC). Cargarlos **tal cual** donde
   se administra el DNS del dominio (NIC Argentina, Cloudflare, el hosting…).
3. Volver a Resend y tocar **Verify**. Puede tardar de minutos a unas horas en propagar.

### 1.2 La clave de API

Resend → **API Keys** → **Create API key**, con permiso **Sending access** y restringida al dominio
de Verdeo. Se ve una sola vez (empieza con `re_`): copiarla directo al paso siguiente.

### 1.3 Cargarlo en Verdeo

Panel de control → Integraciones → **Correo**:

- **Clave de API de Resend**: la del paso anterior. Si ya había una (la personal), pegar la nueva
  la reemplaza; dejar el campo vacío conserva la guardada.
- **Dirección remitente**: la del dominio verificado, por ejemplo `pedidos@verdeo.com.ar`.
- **Nombre remitente**: `Verdeo`.
- **Responder a** (opcional): adonde llegan las respuestas de los clientes. Puede ser el Gmail del
  negocio; no hace falta que esté verificado.
- Tildar **Activar el envío de correo** → **Guardar**.

### 1.4 Probar

En la misma pantalla, **Probar el envío** → una dirección propia → **Enviar prueba**. Si dice que el
dominio no está verificado, falta el paso 1.1. Revisar que llegue a la bandeja de entrada y no a
spam.

Cuando la prueba anda, se puede borrar la clave personal en Resend (API Keys → la vieja → Revoke).

## 2. Pedidos por mail (el listener de Gmail)

El formulario del sitio manda cada pedido a un Gmail. Un script de Google Apps Script, que corre
**dentro de esa cuenta de Gmail**, cada 5 minutos busca los mails de pedido nuevos y se los manda a
Verdeo firmados con un secreto. En Verdeo quedan en **Pedidos → Pedidos por correo para revisar**
hasta que alguien los aprueba. Detalle técnico: `tools/gmail-apps-script/README.md`.

### 2.1 El secreto

1. Generar uno largo:

   ```bash
   openssl rand -hex 32
   ```

2. Vercel → proyecto de la **API** → Settings → Environment Variables → `INBOUND_EMAIL_SECRET` =
   ese valor (entorno Production) → volver a desplegar la API. Sin esta variable la API rechaza
   todos los mails (403).

### 2.2 El script

1. Entrar a <https://script.google.com> **con la cuenta de Gmail que recibe los pedidos del sitio**
   (no con la personal, salvo que sea la misma) → **Nuevo proyecto** → nombre "Verdeo pedidos".
2. Borrar lo que trae y pegar el contenido de `tools/gmail-apps-script/Code.gs`.
3. **Configuración del proyecto** (engranaje) → **Propiedades del script** → agregar:
   - `VERDEO_URL` = `https://<dominio-de-la-api>/api/v1/inbound/email`
   - `VERDEO_SECRET` = el mismo valor del paso 2.1.
4. Elegir la función `importarPedidos` → **Ejecutar**. Google pide permisos para leer Gmail y
   conectarse a servicios externos. Como el script es propio y no está publicado, avisa "Google no
   verificó esta app": **Configuración avanzada** → **Ir a Verdeo pedidos** → **Permitir**.
5. Elegir `instalarDisparador` → **Ejecutar** una vez. Desde ahí corre solo cada 5 minutos.

### 2.3 Probar

- Con un mail de pedido sin la etiqueta `verdeo-importado` en la bandeja, correr `importarPedidos`:
  el mail queda etiquetado y el pedido aparece en Verdeo para revisar (y como alerta en el
  tablero).
- Panel de control → **Estado del sistema** → **Correo entrante** muestra la hora del último
  recibido.

### Qué mails toma

Los que tienen el asunto **"Pedido online"**, de los últimos 7 días, sin la etiqueta
`verdeo-importado`. Si el formulario del sitio cambia de asunto, hay que cambiar la constante
`QUERY` en el script (y en `Code.gs` del repo).

### Si algo no anda

- **No aparece nada en Verdeo**: en Apps Script, **Ejecuciones** muestra cada corrida y su error.
  - 403: el secreto no coincide entre Vercel y el script, o falta `INBOUND_EMAIL_SECRET`.
  - 400: un mail con un formato que la API no esperaba.
- **Volver a mandar un mail**: sacarle la etiqueta `verdeo-importado` en Gmail. La API reconoce los
  repetidos y no duplica.

## Lo que no cambia

La cuenta con la que entrás al panel (el superadmin) sigue siendo tu correo personal: es tu
usuario, no el remitente. Si querés que el negocio tenga su propia cuenta de administrador, se da
de alta en Panel de control → Usuarios y se le asigna el rol superadmin.
