# Supabase OAuth Setup Runbook

## Objetivo

Configurar Supabase Auth como broker de identidad OAuth para el panel Staff de Verdeo, comenzando con
Google, sin reemplazar la base operativa Neon ni el RBAC interno.

Este runbook cubre la preparación de Google Cloud, Supabase, los proyectos Web/API de Vercel, el entorno
local y las verificaciones necesarias antes de habilitar OAuth en producción.

## Estado de implementación

El adaptador base está implementado:

- Web inicia Google OAuth mediante Supabase con PKCE;
- `/auth/callback` intercambia el código y entrega el access token a la API una sola vez;
- `POST /api/v1/auth/oauth/exchange` valida el token contra Supabase Auth;
- la API vincula únicamente usuarios internos activos y preprovisionados;
- Neon persiste `AuthIdentity(provider = 'supabase', providerSubject = sub)`;
- la API emite la cookie opaca HttpOnly existente y audita vínculo, éxito y rechazo;
- el token Supabase se elimina del estado local después del intercambio.

Quedan pendientes las variables reales por entorno, el smoke test con Google, invitaciones administrativas,
MFA/recuperación y el panel completo de usuarios.

## Arquitectura objetivo

```text
Google OAuth
  -> Supabase Auth verifica la identidad
  -> Web recibe el callback PKCE
  -> Web entrega el access token de Supabase a la API
  -> API valida firma, issuer, audience, expiración y email verificado
  -> API vincula provider + providerSubject con AuthIdentity
  -> API resuelve User, roles, permisos y membresías operativas en Neon
  -> API crea la sesión opaca propia de Verdeo
  -> navegador recibe la cookie Secure + HttpOnly de Verdeo
```

Responsabilidades:

| Componente    | Responsabilidad                                                               | No debe decidir                            |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| Google        | autenticar la cuenta Google                                                   | roles, permisos o zonas de Verdeo          |
| Supabase Auth | ejecutar OAuth y emitir/verificar identidad                                   | autorización operativa                     |
| Neon          | almacenar usuarios, identidades vinculadas, sesiones, RBAC, zonas y auditoría | credenciales Google                        |
| API Verdeo    | vincular identidad, autorizar y emitir sesión interna                         | confiar en datos sin validar               |
| Web Verdeo    | iniciar OAuth y completar el callback PKCE                                    | guardar claves secretas o asignar permisos |

`DATABASE_URL` debe seguir apuntando a Neon. Conectar Supabase desde el Marketplace de Vercel puede añadir
variables PostgreSQL adicionales; no deben reemplazar `DATABASE_URL` ni convertirse en una base operativa
paralela.

## Decisiones de seguridad para el primer release

- Proveedor inicial recomendado: Google mediante Supabase Auth.
- No habrá registro público de personal.
- Una identidad OAuth sólo podrá acceder si corresponde a un `User` interno activo previamente creado o a
  una invitación explícita vigente.
- El primer enlace automático requiere email verificado y coincidencia exacta con `email_normalized`.
- El identificador estable guardado en `AuthIdentity.providerSubject` será el `sub` del usuario de Supabase,
  no el email.
- Supabase nunca asignará roles, permisos, región o zona desde `user_metadata` o `app_metadata`.
- Las asignaciones RBAC y geográficas seguirán administrándose en Verdeo y deberán auditarse.
- El login por contraseña existente permanecerá disponible durante el rollout y servirá como rollback.
- `SUPABASE_SECRET_KEY` será exclusivamente server-side y sólo se añadirá cuando la API implemente
  invitaciones o acciones administrativas.

La política definitiva de dominios permitidos, MFA, recuperación y tratamiento de usuarios aún no
provisionados permanece **OPEN**. Hasta resolverla, el comportamiento seguro es denegar el acceso sin crear
roles automáticamente.

## Prerrequisitos

- proyecto Supabase disponible;
- acceso administrativo al proyecto Google Cloud que será dueño del cliente OAuth;
- proyectos Vercel Web y API conectados al monorepo;
- URL Web de producción y, antes de liberar producción, el dominio final;
- `DATABASE_URL`, `SESSION_SECRET`, `APP_URL` y `API_URL` actuales funcionando en la API;
- al menos un superadmin interno probado con el login temporal por contraseña;
- acceso a los logs de Supabase, API y Vercel para el smoke test.

No continúes con producción si el superadmin sólo puede entrar mediante el nuevo proveedor. Primero debe
existir y probarse la ruta de recuperación.

## 1. Conectar Supabase a Vercel

La instalación de Supabase puede existir en Vercel sin estar todavía vinculada a ambos proyectos. En la
pantalla de la integración:

1. Seleccioná **Connect to Project**.
2. Vinculá el recurso al proyecto Web.
3. Vinculá el mismo recurso al proyecto API si la API utilizará validación de tokens o invitaciones.
4. Revisá por separado los scopes Development, Preview y Production.
5. Confirmá las variables creadas, pero no copies valores secretos al proyecto Web.
6. No modifiques `DATABASE_URL`; debe conservar la conexión de Neon.
7. Hacé un nuevo deployment después de cambiar variables. Un deployment existente no toma valores nuevos.

La integración oficial puede sincronizar variables como `SUPABASE_URL`, claves publishable/secret y
aliases `NEXT_PUBLIC_*`. Verdeo usa Vite, por lo que los aliases del navegador se crean manualmente con
prefijo `VITE_`.

## 2. Crear el cliente OAuth en Google Cloud

1. Abrí Google Cloud Console y elegí o creá el proyecto propietario de la autenticación de Verdeo.
2. Configurá la pantalla de consentimiento OAuth:
   - nombre visible de la aplicación;
   - email de soporte;
   - dominios autorizados cuando exista el dominio final;
   - contactos técnicos;
   - audiencia interna o externa según la política real de cuentas.
3. Durante pruebas, agregá las cuentas autorizadas como test users si Google mantiene la aplicación en modo
   de prueba.
4. Creá una credencial **OAuth client ID** de tipo **Web application**.
5. En **Authorized JavaScript origins**, agregá sólo orígenes exactos utilizados por la Web, por ejemplo:
   - `http://127.0.0.1:5173`;
   - `http://localhost:5173` si también se usa ese host;
   - `https://verdeo-monorepo-web.vercel.app`;
   - `https://<dominio-final>` cuando esté definido.
6. En **Authorized redirect URIs**, copiá exactamente el callback que muestra Supabase en
   **Authentication > Providers > Google**:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

7. Guardá el Client ID y Client Secret en un gestor de secretos hasta cargarlos en Supabase.

El redirect URI de Google es el callback de Supabase. No es `/auth/callback` de Verdeo y no debe apuntar a
Vercel directamente.

## 3. Configurar Google en Supabase

Usá **Authentication > Sign In / Providers > Google**. No habilites **Authentication > OAuth Server**:
esa función beta sirve para convertir el proyecto Supabase en proveedor OAuth de aplicaciones externas y
requiere una pantalla propia como `/oauth/consent`; no participa del login Google de Verdeo.

1. Abrí **Authentication > Providers > Google**.
2. Activá el proveedor.
3. Cargá el Client ID y Client Secret de Google Cloud.
4. Guardá y verificá que el callback mostrado por Supabase coincida carácter por carácter con el registrado
   en Google Cloud.
5. No habilites acceso operativo basándote sólo en un dominio de email. El dominio puede ser una regla de
   admisión adicional, pero la API debe seguir exigiendo un usuario o invitación interna.

## 4. Configurar URLs en Supabase Auth

En **Authentication > URL Configuration**:

1. Configurá **Site URL** con la Web estable de producción:

   ```text
   https://verdeo-monorepo-web.vercel.app
   ```

   Sustituila por el dominio definitivo cuando esté disponible.

2. Agregá a **Redirect URLs** todos los callbacks exactos que la aplicación enviará en `redirectTo`:

   ```text
   http://127.0.0.1:5173/auth/callback
   http://localhost:5173/auth/callback
   https://verdeo-monorepo-web.vercel.app/auth/callback
   https://<dominio-final>/auth/callback
   ```

3. Para Preview, preferí una URL estable de callback o registrá explícitamente el host que se probará. No
   uses un wildcard amplio sobre todos los proyectos `*.vercel.app`.
4. Confirmá que invitaciones y recuperación usan un `redirectTo` incluido en la misma allowlist.

`Site URL` funciona como destino por defecto. No reemplaza la lista de redirect URLs permitidas.

## 5. Matriz de variables

### Proyecto Vercel Web

Sólo variables públicas:

| Variable                        | Valor                                   | Entornos                         |
| ------------------------------- | --------------------------------------- | -------------------------------- |
| `VITE_API_URL`                  | origen de la API correspondiente        | Development, Preview, Production |
| `VITE_SUPABASE_URL`             | mismo valor que `SUPABASE_URL`          | Development, Preview, Production |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clave `sb_publishable_...` del proyecto | Development, Preview, Production |

Si la instalación creó `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, no alcanza para
esta aplicación: `NEXT_PUBLIC_` pertenece a Next.js y Vite sólo expone variables `VITE_`.

Nunca crear en Web:

- `VITE_SUPABASE_SECRET_KEY`;
- `VITE_SUPABASE_JWT_SECRET`;
- `VITE_DATABASE_URL`;
- una variable `VITE_` que contenga secretos de Google, sesión, IA, WhatsApp o cifrado.

### Proyecto Vercel API

| Variable                   | Uso                                             | Exposición                               |
| -------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `DATABASE_URL`             | Neon, fuente operativa de Verdeo                | server-only                              |
| `SUPABASE_URL`             | issuer/proyecto de la identidad                 | server-only                              |
| `SUPABASE_PUBLISHABLE_KEY` | consultas de Auth compatibles con clave pública | server-only                              |
| `SUPABASE_SECRET_KEY`      | invitaciones y administración de Auth           | server-only; agregar sólo al implementar |
| `SESSION_SECRET`           | sesión interna de Verdeo                        | server-only                              |
| `APP_URL`                  | origen Web confiable                            | server-only                              |
| `API_URL`                  | origen público de la API                        | server-only                              |

No es necesario entregar `SUPABASE_JWT_SECRET` a la Web. Para proyectos con claves asimétricas, la API debe
validar JWT contra el JWKS del proyecto. Para una configuración legacy HS256, debe validar mediante el
endpoint Auth `/user` con la clave publishable en vez de copiar un secreto al navegador.

## 6. Configuración local

La API carga el `.env` raíz. Usá valores server-side en:

```text
D:\Verdeo-SCA-Project-Library\.env
```

Ejemplo sin secretos reales:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
# Sólo después de implementar invitaciones server-side:
# SUPABASE_SECRET_KEY=sb_secret_REEMPLAZAR
```

Vite debe leer las variables públicas desde:

```text
D:\Verdeo-SCA-Project-Library\apps\web\.env.local
```

```dotenv
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
```

Ambos archivos están ignorados por Git. No pegues valores reales en documentación, issues, logs, capturas
o commits.

## 7. Contrato de implementación en Verdeo

### Inicio y callback Web

1. El botón **Continuar con Google** llama a `signInWithOAuth` con Google y un `redirectTo` construido desde
   un origen permitido.
2. La librería usa PKCE; el callback Web intercambia el `code` por una sesión Supabase.
3. La Web obtiene el access token y lo envía una sola vez al endpoint de intercambio de la API.
4. El token no debe guardarse en Zustand persistente, `localStorage` propio, query strings, analytics ni
   logs.
5. Después de crear la sesión Verdeo puede cerrarse la sesión transitoria de Supabase si el adaptador no la
   necesita para renovación. Esta decisión debe quedar probada para no romper el callback PKCE.

### Validación y vínculo en API

Antes de crear una sesión Verdeo, la API debe:

1. validar firma o consultar Auth con el mecanismo oficial aplicable;
2. validar `iss`, proyecto esperado, expiración y, cuando corresponda, audience;
3. exigir email verificado para el primer vínculo;
4. buscar primero `AuthIdentity(provider = 'supabase', providerSubject = sub)`;
5. si no existe, permitir el vínculo sólo contra un `User` activo preaprovisionado o una invitación válida;
6. insertar la identidad con restricción única y dentro de una transacción;
7. rechazar conflictos donde el `sub` o email ya estén asociados de forma incompatible;
8. resolver permisos y membresías desde Neon;
9. emitir la sesión opaca existente y su cookie HttpOnly;
10. auditar éxito, rechazo, vínculo y conflicto sin persistir tokens.

No se debe usar `email` como `providerSubject`, porque puede cambiar. Tampoco se debe crear un usuario con
permisos por el mero hecho de que Google o Supabase autenticaron su cuenta.

## 8. Flujo futuro del panel de usuarios

El flujo administrativo recomendado es:

```text
superadmin con users.create
  -> crea User interno sin permisos implícitos
  -> asigna roles y zonas mediante endpoints RBAC auditados
  -> API genera/consume invitación idempotente
  -> API llama inviteUserByEmail con SUPABASE_SECRET_KEY
  -> usuario completa OAuth o invitación
  -> API vincula el sub verificado al User preexistente
  -> acceso efectivo depende de User activo + RBAC + membresía geográfica
```

Reglas:

- `SUPABASE_SECRET_KEY` sólo se usa en la API;
- invitar y asignar permisos son acciones distintas;
- reintentar una invitación no debe duplicar usuarios ni asignaciones;
- deshabilitar el `User` interno bloquea el acceso aunque Supabase conserve la identidad;
- revocar sesiones internas debe tener efecto inmediato;
- un administrador regional no puede asignar zonas o permisos fuera de su alcance;
- creación, reenvío, aceptación, vínculo, cambio de rol, cambio de zona y revocación generan auditoría.

## 9. Checklist local

- [ ] El login por contraseña existente continúa funcionando.
- [ ] El botón Google abre el proyecto y cliente correctos.
- [ ] El callback vuelve a `/auth/callback` sin exponer tokens en la URL final.
- [ ] La API rechaza un token expirado, de otro proyecto o con issuer incorrecto.
- [ ] Un usuario interno activo y preaprovisionado obtiene sesión Verdeo.
- [ ] Una cuenta desconocida queda denegada o pendiente sin roles.
- [ ] Un usuario interno deshabilitado no puede ingresar.
- [ ] Recargar `/app` conserva la sesión interna.
- [ ] Logout revoca la sesión Verdeo y limpia la cookie.
- [ ] No aparece `SUPABASE_SECRET_KEY`, JWT secret ni credenciales Google en el bundle Web.
- [ ] Logs y auditoría no contienen access tokens, refresh tokens, cookies ni secretos.

## 10. Checklist Preview y Production

- [ ] Los callbacks exactos de cada entorno están registrados en Supabase.
- [ ] Google contiene el callback de Supabase exacto y los orígenes Web necesarios.
- [ ] Web tiene sólo `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` públicas.
- [ ] API conserva `DATABASE_URL` de Neon.
- [ ] `APP_URL`, `API_URL`, CORS y cookie `SameSite` corresponden a la topología desplegada.
- [ ] Se ejecutó un redeploy de Web y API después de cambiar variables.
- [ ] El smoke test cubre login, callback, `/api/v1/me`, refresh, logout y usuario deshabilitado.
- [ ] Las cuentas no provisionadas no reciben acceso.
- [ ] Existe un operador con login de recuperación probado antes de habilitar el botón a todos.

## 11. Diagnóstico

| Síntoma                                               | Causa probable                                           | Verificación/corrección                                           |
| ----------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `redirect_uri_mismatch` en Google                     | callback Supabase distinto al registrado                 | copiar el callback exacto de Providers > Google a Google Cloud    |
| Supabase rechaza el redirect                          | `/auth/callback` no está en Redirect URLs                | agregar el callback Web exacto del entorno                        |
| `VITE_SUPABASE_URL` es `undefined`                    | se usó sólo el alias `NEXT_PUBLIC_*` o faltó redeploy    | crear el alias `VITE_*` en Web y redeployar                       |
| OAuth termina pero la API responde `401`              | token de otro proyecto, expirado o validación incorrecta | revisar `iss`, JWKS/proyecto, reloj y variables API               |
| OAuth funciona pero no abre dashboard                 | no existe vínculo/usuario activo o faltan permisos       | revisar `AuthIdentity`, estado del `User`, RBAC y membresía       |
| Usuario desconocido entra con privilegios             | provisión automática insegura                            | deshabilitarla; exigir usuario/invitación y resolver RBAC en Neon |
| Cookie no queda guardada                              | CORS, `Secure`, dominio o `SameSite` incorrectos         | revisar `APP_URL`, origen API y política de cookies               |
| La API falla al conectar datos tras instalar Supabase | `DATABASE_URL` fue reemplazada                           | restaurar la URL Neon y redeployar la API                         |
| Invitación vuelve a una URL incorrecta                | `redirectTo` no permitido y se usó Site URL              | agregar el destino exacto a Redirect URLs                         |
| Preview funciona sólo en un deployment                | callback ligado a un host efímero                        | adoptar callback Preview estable o registrar el host controlado   |

## 12. Rollback

1. Ocultá o deshabilitá el botón OAuth mediante configuración/deployment.
2. Desactivá Google en Supabase sólo si es necesario cortar todos los inicios nuevos.
3. Conservá `User`, `AuthIdentity`, RBAC y auditoría; no borres vínculos durante el incidente.
4. Mantené el login por contraseña para los operadores de recuperación aprobados.
5. Revocá sesiones internas comprometidas desde Verdeo.
6. Rotá el Client Secret de Google o `SUPABASE_SECRET_KEY` si pudieron exponerse.
7. Actualizá variables y redeployá antes de invalidar definitivamente la credencial anterior.
8. Registrá el incidente y validá nuevamente el checklist antes de reactivar OAuth.

## Datos pendientes antes de producción

- dominio Web final y dominio API final;
- política de Preview y callback estable;
- cuentas o dominios admitidos;
- comportamiento para usuarios autenticados pero no provisionados;
- exigencia y recuperación de MFA para superadmins;
- dueño operativo de altas, bajas e invitaciones;
- política de expiración/renovación de la sesión Supabase transitoria;
- remitente y branding de emails de invitación;
- destino de alertas de fallos de login y conflictos de identidad.

## Referencias oficiales

- [Supabase en Vercel Marketplace](https://supabase.com/docs/guides/integrations/vercel-marketplace)
- [Login con Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [OAuth con supabase-js](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [JWT y JWKS](https://supabase.com/docs/guides/auth/jwts)
- [Validación de claims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [Gestión de usuarios](https://supabase.com/docs/guides/auth/users)
- [Invitar por email](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
