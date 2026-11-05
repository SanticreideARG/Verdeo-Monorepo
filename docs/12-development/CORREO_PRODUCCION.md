# Correo en producción: remitente (Resend) y pedidos por mail (listener de Gmail)

Instructivo para dejar el correo de Verdeo andando en producción. Son dos tareas separadas, que se
pueden hacer en cualquier orden:

|                                       | Para qué                                                                               | Dónde se configura                                                                 | Qué hace falta                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **A. Envío** (Resend)                 | Verdeo **manda** correos: enlaces de acceso, avisos de pedido, pruebas                 | Resend + DNS de `verdeo.com.ar` + [Panel de control → Correo](/app/ajustes/correo) | Acceso al DNS del dominio y una cuenta de Resend del negocio |
| **B. Pedidos por mail** (Apps Script) | Verdeo **recibe** los pedidos del formulario del sitio que llegan al Gmail del negocio | Vercel (proyecto de la API) + Google Apps Script dentro del Gmail del negocio      | Entrar al Gmail del negocio y a Vercel                       |

Direcciones de producción:

- Panel: `https://verdeo-monorepo-web.vercel.app`
- API: `https://verdeo-monorepo-api.vercel.app`

## Las credenciales

- La contraseña del Gmail del negocio, la clave de Resend (`re_…`) y los secretos que se generan
  acá **no se escriben en el repositorio, ni en un chat, ni en un documento compartido**. Van
  directo del lugar donde se generan al lugar donde se cargan.
- Entrar al Gmail del negocio, a Resend y a Vercel lo hace una persona, con su propia sesión. Si el
  Gmail tiene verificación en dos pasos, mejor: no cambia nada de lo que sigue.
- La clave de Resend se ve **una sola vez**. Si se pierde, se crea otra y se revoca la vieja.

### Generar un secreto (en Windows, sin instalar nada)

En una terminal del repo (PowerShell o Git Bash) — Node ya está instalado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Da una línea larga de letras y números. Se usa para `AI_CONFIG_ENCRYPTION_KEY` y para
`INBOUND_EMAIL_SECRET` (un valor **distinto** para cada una).

## Antes de empezar: la clave de cifrado

En Vercel, proyecto de la **API** → Settings → Environment Variables, tiene que existir
`AI_CONFIG_ENCRYPTION_KEY` (32 bytes en base64). Cifra las claves guardadas en la base, la de Resend
y la del proveedor de IA. Lo más probable es que ya esté, porque Hera usa una clave guardada: si en
la pantalla de Correo aparece "Falta configurar la clave de cifrado del servidor", falta ésta.

Si hay que crearla: generar un secreto (arriba), cargarlo en entorno **Production** y volver a
desplegar la API (Deployments → el último → Redeploy). **No cambiarla nunca después**: las claves
guardadas con la anterior dejan de poder leerse y hay que volver a cargarlas todas.

---

## A. El envío (Resend)

El remitente tiene que ser una dirección **de un dominio verificado en Resend**. Un Gmail
(`@gmail.com`) **no sirve como remitente**: Resend no deja verificar un dominio que no es tuyo, así
que los envíos se rechazan o terminan en spam. El remitente va a ser del dominio del sitio, por
ejemplo `pedidos@verdeo.com.ar`. El Gmail del negocio sí puede ser la dirección de **respuesta**.

### A.1 Cuenta de Resend del negocio

Entrar a <https://resend.com> y crear la cuenta **con el correo del negocio**, no con uno personal:
así la cuenta queda con Verdeo aunque cambie quién la administra.

### A.2 Verificar el dominio

1. Resend → **Domains** → **Add domain**. Conviene un subdominio, `mail.verdeo.com.ar`: los
   registros de correo no se mezclan con los del dominio principal ni con el correo que ya
   tenga `verdeo.com.ar`. Región: la que ofrezca más cerca (São Paulo si está, si no Estados Unidos).
2. Resend muestra los registros DNS: **MX** y **TXT (SPF)** para el envío, **TXT (DKIM)** con
   nombre `resend._domainkey…`, y opcionalmente **DMARC**.
3. Cargarlos **exactamente igual** donde se administra el DNS de `verdeo.com.ar` (NIC Argentina,
   Cloudflare, el hosting del sitio…). Cuidado con el nombre: algunos paneles agregan el dominio
   solos, así que `send.mail` se escribe tal cual y no `send.mail.verdeo.com.ar`.
4. Volver a Resend → **Verify DNS records**. Tarda de minutos a unas horas. Queda en **Verified**
   cuando los tres registros obligatorios están en verde.

Si no se sabe dónde está el DNS: <https://nic.ar> → buscar `verdeo.com.ar` → la sección de
delegación dice qué servidores DNS usa (por ejemplo `*.ns.cloudflare.com` es Cloudflare).

### A.3 La clave de API

Resend → **API Keys** → **Create API key**:

- Nombre: `Verdeo producción`.
- Permiso: **Sending access** (no "Full access").
- Dominio: sólo el verificado.

Se muestra una sola vez y empieza con `re_`. Copiarla y pegarla directo en el paso siguiente.

### A.4 Cargarla en Verdeo

[Panel de control → Integraciones → Correo](/app/ajustes/correo) (hace falta un usuario con permiso
de Panel de control, como el superadmin):

| Campo                          | Valor                                                            |
| ------------------------------ | ---------------------------------------------------------------- |
| **Clave de API de Resend**     | La del paso A.3. Dejar el campo vacío conserva la que ya estaba. |
| **Dirección remitente**        | Una del dominio verificado: `pedidos@mail.verdeo.com.ar`         |
| **Nombre remitente**           | `Verdeo`                                                         |
| **Responder a (opcional)**     | El Gmail del negocio: ahí llegan las respuestas de los clientes  |
| **Activar el envío de correo** | Tildado                                                          |

→ **Guardar**.

### A.5 Probar

En la misma pantalla, **Probar el envío** → una dirección propia → **Enviar prueba**.

- Llega a la bandeja de entrada: listo.
- Llega a spam: falta DMARC o todavía están propagando los registros. Agregar el DMARC que propone
  Resend y probar de nuevo en unas horas.
- "El dominio no está verificado": falta terminar A.2.
- "Falta configurar la clave de cifrado del servidor": ver "Antes de empezar".

Si antes se usaba una clave personal de Resend, revocarla cuando la prueba ande (Resend → API Keys
→ la vieja → Revoke).

---

## B. Los pedidos por mail (el listener de Gmail)

El formulario del sitio manda cada pedido al Gmail del negocio. Un script de Google Apps Script,
que corre **dentro de esa cuenta de Gmail**, cada 5 minutos busca los mails de pedido nuevos y se los
manda a la API firmados con un secreto. En Verdeo quedan en **Pedidos → Pedidos por correo para
revisar** hasta que alguien los aprueba: nunca se crea un pedido sin que una persona lo vea.

No hace falta darle a Verdeo la contraseña del Gmail: el script corre en Google, con los permisos
que la cuenta le da al instalarlo. Por qué se eligió así:
[INBOUND_LISTENERS_PLAN.md](INBOUND_LISTENERS_PLAN.md).

### B.1 El secreto compartido

1. Generar un secreto (ver arriba). Es distinto del de cifrado.
2. Vercel → proyecto de la **API** → Settings → Environment Variables → nueva:
   - Nombre: `INBOUND_EMAIL_SECRET`
   - Valor: el secreto
   - Entorno: **Production**
3. Volver a desplegar la API (Deployments → el último → **Redeploy**). Sin esta variable la API
   rechaza todos los mails (403).

Dejar el secreto a mano (en el portapapeles) para el paso B.3; después no hace falta guardarlo en
ningún lado: si se pierde, se genera otro y se cambia en los dos lugares.

### B.2 El script

1. Entrar a <https://script.google.com> **con la cuenta del Gmail del negocio** (si el navegador
   tiene varias cuentas, revisar arriba a la derecha que sea ésa) → **Nuevo proyecto**.
2. Arriba, cambiar "Proyecto sin título" por `Verdeo pedidos`.
3. Borrar todo lo que trae el editor y pegar el contenido completo de
   [`tools/gmail-apps-script/Code.gs`](../../tools/gmail-apps-script/Code.gs) → guardar (ícono de
   disquete).

### B.3 Las propiedades del script

**Configuración del proyecto** (el engranaje, a la izquierda) → abajo de todo, **Propiedades del
script** → **Agregar propiedad del script**, dos veces:

| Propiedad       | Valor                                                         |
| --------------- | ------------------------------------------------------------- |
| `VERDEO_URL`    | `https://verdeo-monorepo-api.vercel.app/api/v1/inbound/email` |
| `VERDEO_SECRET` | El mismo valor de `INBOUND_EMAIL_SECRET` (B.1)                |

→ **Guardar propiedades del script**.

### B.4 Dar permisos y probar una vez

1. Volver al editor (`< >` a la izquierda). En el selector de funciones de arriba elegir
   `importarPedidos` → **Ejecutar**.
2. Google pide autorización: elegir la cuenta del negocio. Como el script es propio y no está
   publicado, avisa "Google no verificó esta app": **Configuración avanzada** → **Ir a Verdeo
   pedidos (no seguro)** → **Permitir**. Pide leer y etiquetar Gmail y conectarse a servicios
   externos (la API de Verdeo): es lo que hace el script, nada más.
3. Abajo aparece el **Registro de ejecución**. Sin errores, terminó bien.

### B.5 Dejarlo andando solo

En el selector de funciones elegir `instalarDisparador` → **Ejecutar**, **una sola vez**. Crea un
disparador que corre `importarPedidos` cada 5 minutos. Se ve en **Activadores** (el reloj, a la
izquierda): tiene que haber uno solo. Si hay dos, borrar uno.

### B.6 Comprobar que llega

- Con un mail de pedido en la bandeja (asunto **"Pedido online"**, de los últimos 7 días), correr
  `importarPedidos` o esperar 5 minutos. En Gmail el mail queda con la etiqueta `verdeo-importado`.
- En Verdeo aparece en **Pedidos → Pedidos por correo para revisar** y como alerta en el tablero.
- [Panel de control → Estado del sistema](/app/sistema) → **Correo entrante (Gmail)**
  muestra la hora del último recibido.

### Qué mails toma

Los que tienen el asunto **"Pedido online"**, de los últimos 7 días y sin la etiqueta
`verdeo-importado`. La búsqueda es la constante `QUERY` del script, escrita igual que en el buscador
de Gmail. Si el formulario del sitio cambia el asunto, hay que cambiarla en Apps Script **y** en
`tools/gmail-apps-script/Code.gs` del repo, que es la referencia.

### Si algo no anda

En Apps Script, **Ejecuciones** (a la izquierda) muestra cada corrida; al abrir una se ven sus avisos. Un mail que la API no aceptó aparece como `Verdeo respondió <código> para "<asunto>"` y queda sin etiquetar, así que se reintenta solo en la corrida siguiente:

| Lo que se ve                         | Qué es                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Verdeo respondió 403`               | El secreto no coincide entre Vercel y el script, o falta `INBOUND_EMAIL_SECRET`, o no se volvió a desplegar la API después de cargarlo |
| `Verdeo respondió 400`               | Un mail con un formato que la API no esperaba: avisar con el asunto y la fecha del mail                                                |
| `Faltan VERDEO_URL o VERDEO_SECRET…` | Faltan las propiedades del paso B.3                                                                                                    |
| Corre sin errores pero no llega nada | No hay mails que cumplan la búsqueda: revisar el asunto y que no tengan ya la etiqueta                                                 |

Para volver a mandar un mail: sacarle la etiqueta `verdeo-importado` en Gmail. La API reconoce los
repetidos por el id del mail y no duplica nada.

Para cambiar el secreto: generar uno nuevo, cargarlo en Vercel (y Redeploy) y en `VERDEO_SECRET`.
Entre un paso y el otro los envíos fallan con 403 y se reintentan solos en la corrida siguiente.

---

## Lista final

- [ ] `AI_CONFIG_ENCRYPTION_KEY` existe en la API de Vercel
- [ ] Dominio verificado en Resend (Verified)
- [ ] Clave de Resend con "Sending access" cargada en Panel de control → Correo, envío activado
- [ ] La prueba de envío llegó a la bandeja de entrada, no a spam
- [ ] `INBOUND_EMAIL_SECRET` cargado en la API de Vercel y API redesplegada
- [ ] Script `Verdeo pedidos` en el Gmail del negocio, con `VERDEO_URL` y `VERDEO_SECRET`
- [ ] Un solo activador cada 5 minutos
- [ ] Un pedido de prueba apareció en "Pedidos por correo para revisar"
- [ ] Estado del sistema muestra la hora del último correo recibido

## Lo que no cambia

La cuenta con la que se entra al panel sigue siendo la de cada persona: es su usuario, no el
remitente. Configurar el correo no crea ni cambia usuarios.
