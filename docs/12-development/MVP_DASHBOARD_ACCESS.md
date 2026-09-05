# MVP Dashboard Access

## Scope

This sprint enables the Staff dashboard without waiting for OAuth or transactional email. Access is limited
to manually provisioned accounts. There is no public signup. Password recovery sí existe — ver "Recuperación de contraseña (as built)".

Implemented controls:

- normalized unique email attached to the existing `User`;
- `AuthIdentity` with provider `password` so OAuth can be linked later;
- scrypt password hashes with per-password random salt;
- 32-character random provisioning passwords shown only once;
- five-failure account lock for 15 minutes;
- opaque, hashed, revocable sessions with configurable eight-hour default duration;
- Secure/HttpOnly/SameSite cookie policy;
- generic invalid-credential responses;
- successful/failed login and provisioning audit events without passwords;
- `/login` form and authenticated `/app` dashboard;
- dashboard modules derived from effective permissions, never role names.

## Required order

Do not use a database credential that has appeared in chat or logs.

1. Rotate the Neon credential.
2. Update the local secret store and Vercel API variables.
3. Apply migrations.
4. Seed roles and permissions.
5. Provision the first superadmin.
6. Configure Web/API origins and cookie policy.
7. Deploy and run the smoke tests below.

```powershell
pnpm db:migrate
pnpm db:seed
pnpm auth:provision-user -- --email santi.creide@gmail.com --role superadmin --display-name "Santiago"
```

The provisioning command prints the generated password once. Copy it directly into a password manager.
Do not paste it into chat, commit it, store it in a ticket, or rerun provisioning for an existing email.

## Test users

Test users are protected by an explicit non-production gate and use the reserved `.test` domain:

```powershell
$env:NODE_ENV = 'development'
$env:ALLOW_TEST_USER_SEED = 'true'
pnpm auth:seed-test-users
```

This provisions one account for each seeded role: `superadmin`, `operador`, `repartidor`, `cocina`, and
`cliente`. Existing accounts are skipped. Generated passwords appear only in the command output. Never set
`ALLOW_TEST_USER_SEED` in Production or point this command at the production database.

Roles other than `superadmin` intentionally inherit only the permissions configured in PostgreSQL. The test
seed does not invent a permission matrix.

## Vercel configuration

### Web project

- `VITE_API_URL=https://<api-project-or-domain>`

### API project

- `APP_URL=https://<web-project-or-domain>`
- `API_URL=https://<api-project-or-domain>`
- `DATABASE_URL=<rotated pooled Neon URL>`
- `SESSION_SECRET=<at least 32 high-entropy characters>`
- `SESSION_TTL_HOURS=8`
- `SESSION_COOKIE_SAME_SITE=None` when Web and API use separate `*.vercel.app` hosts;
- `SESSION_COOKIE_SAME_SITE=Lax` when Web and API use sibling custom domains under the same site.

`SameSite=None` is always emitted with `Secure`. Prefer sibling custom domains for the final deployment.

## Smoke tests

1. Invalid credentials return the same `401` response for known and unknown emails.
2. A valid provisioned account receives an HttpOnly cookie and reaches `/app`.
3. Refreshing `/app` preserves the session.
4. Logout revokes the server-side session and clears the cookie.
5. A sixth invalid attempt during the lock window remains rejected.
6. A disabled user cannot authenticate or reuse an existing session.
7. The superadmin sees modules from effective permissions.
8. Other test roles see only permissions assigned in PostgreSQL.
9. No response, log, audit event, or browser storage contains a password or raw session token.

## Deferred after MVP

- OAuth provider adapter and account linking;
- email confirmation and Resend adapter;
- rotación de credenciales obligatoria (forzar el cambio en el próximo ingreso);
- globally distributed login rate limiting/WAF policy;
- MFA and recovery policy;
- removal of password login after OAuth adoption, if approved.

## Apariencia por usuario (as built)

Tema, fuente y tamaño de texto se guardan en `user_appearance` (una fila por usuario, todas las
columnas opcionales) y se leen y escriben con `GET`/`PATCH /api/v1/me/appearance`. Sin permiso: es
la preferencia de uno mismo, y cualquiera que pueda entrar puede elegir con qué letra trabaja.

Nueve temas, agrupados por tono en el panel: claros `natural`, `cielo`, `arena`, `papel`; oscuros
`bosque`, `aurora`, `carbon`, `cacao`, `marea`. `papel` es el de contraste alto y sin viñeta, para
pantallas pobres o a pleno sol.

Tres decisiones que conviene no deshacer sin querer:

- **La escala de texto se aplica a `html`, no al shell.** La hoja está escrita en `rem`, que es
  relativa a la raíz; puesta en cualquier otro nodo no movería nada. Como efecto, la preferencia
  también alcanza a las pantallas públicas, que es lo esperable de una preferencia de accesibilidad.
- **Ninguna fuente del selector se descarga.** Son las que el navegador ya tiene más la que la app
  ya carga. Una preferencia de legibilidad que tarda en llegar no sirve.
- **El servidor no valida los valores.** Qué temas y qué fuentes existen es del catálogo del
  frontend; encerrarlo en la API obligaría a desplegarla para agregar un tema, y el fallo que
  evitaría — una preferencia que nombra un tema que ya no existe — se resuelve al renderizar,
  cayendo al de por defecto. Sólo se acota el largo, que es lo que protege a la base.

`localStorage` sigue existiendo, pero como arranque: pinta bien en el primer frame y evita el
parpadeo mientras llega la preferencia de la cuenta, que es la que manda.

## Recuperación de contraseña (as built)

Hasta ahora la única forma de recuperar una cuenta era que otra persona con `users.edit` la
reseteara desde `POST /api/v1/users/:id/password`. Eso deja sin salida a la primera cuenta de una
instalación y obliga a alguien a conocer la contraseña de otro.

Tres endpoints nuevos, sobre la tabla `password_reset_tokens` (sólo el hash, TTL 30 minutos, un
solo uso, cinco pedidos por cuenta cada 15 minutos):

- `POST /api/v1/public/auth/password/request` — público. **Contesta lo mismo siempre**: exista la
  cuenta, esté dada de baja, se haya limitado por frecuencia, o incluso si el correo no está
  configurado. Contestar distinto convertiría al endpoint en una forma de averiguar quién trabaja
  acá. Es el mismo criterio del enlace mágico de clientes.
- `POST /api/v1/public/auth/password/confirm` — público, porque quien llega no puede entrar.
- `POST /api/v1/me/password` — cambiar la propia sabiendo la actual.

En el frontend: `/recuperar` (una sola pantalla para las dos mitades del trámite, con y sin token),
el enlace "Olvidé mi contraseña" en `/login`, y la sección Contraseña en Mi perfil.

Dos decisiones que conviene no deshacer:

- **Consumir un enlace revoca todas las sesiones abiertas de esa cuenta.** Si el motivo del cambio
  es que entró alguien más, dejarle la sesión viva vuelve inútil al cambio. También se levanta el
  bloqueo por intentos fallidos, que es una de las razones por las que se llega a esta pantalla.
- **Cambiar la propia contraseña revoca las otras sesiones pero no la que hace el cambio.** Echar a
  alguien de la pantalla donde acaba de elegir una contraseña nueva lo lleva a pensar que falló.

El mínimo de 12 caracteres es el mismo de `LoginRequestSchema`, y no es cosmético: una más corta se
guardaría bien y después no serviría para entrar — exactamente la cuenta imposible de depurar que
este flujo existe para evitar.

## Celular y PWA (as built)

**Los puntos de quiebre del shell viven al final de `styles.css`, y ahí tienen que quedarse.**
Estaban repartidos en dos grupos, uno antes y otro después del bloque "Neon-inspired density pass",
que redeclara los mismos selectores sin media query: con igual especificidad ganaba el de abajo, así
que la regla que colapsa el hero a una columna nunca se aplicaba. Si se agrega otra capa de estilos,
va **antes** de esa sección.

En pantallas de hasta 680px:

- **el hero se esconde**, queda sólo la tarjeta de sprint a ancho completo. Es una frase de
  bienvenida: en escritorio adorna, en un teléfono empuja el trabajo abajo del pliegue;
- **la barra superior queda con lo que se usa a cada rato**: menú, ciudad y perfil. La ciudad no se
  saca por ADR-031 — determina qué pedidos, qué menú y qué rutas se ven;
- **estado, calendario y apariencia bajan al cajón**. Se mueve el nodo, no se duplica: se decide con
  `useNarrowViewport()` y no con CSS, porque CSS puede esconder pero no cambiar de padre, y una
  segunda copia de `PresenceControl` significaría el doble de latidos contra la API;
- **barra inferior con las cuatro pantallas del turno** (Pedidos, Cocina, Rutas, Chat) más "Más",
  que abre el mismo cajón. Abajo porque es donde llega el pulgar, y 56px de alto útil porque por
  debajo de eso el dedo empieza a errar;
- **los widgets muestran el número primero** y la etiqueta debajo — se miran de reojo, no se leen —
  y **los que no tienen datos se esconden**, porque una tarjeta entera para no decir nada es peor
  que nada.

### PWA

`vite-plugin-pwa` genera el service worker, que era **la única pieza que faltaba**: Android Chrome no
ofrece instalar una app que no tenga uno. El manifiesto sigue siendo `public/site.webmanifest`
escrito a mano, y el plugin va con `manifest: false` a propósito — dejar que genere otro daría dos
manifiestos compitiendo por el mismo `<link>`. `start_url` apunta a `/app` y hay atajos a la hoja de
ruta y a tomar un pedido.

**No se cachea nada de la API.** Guardar respuestas serviría un pedido cancelado como si siguiera
activo, y quién ve qué dato viejo es una decisión de negocio, no una opción de build. El offline real
—la hoja de ruta del repartidor, con su fecha a la vista— queda para después del piloto.

**Pendiente de diseño:** un ícono _maskable_. El actual es un círculo casi a sangre, así que
declararlo como tal haría que Android le recorte el anillo verde con su propia máscara. Hace falta
una versión con el logo al 80% dentro del lienzo.

### El tablero del teléfono es otra pantalla

`MobileDashboard` se renderiza en vez del tablero de escritorio, no además. La decisión es de React
(`useNarrowViewport`) y no de CSS, porque lo que cambia no es el tamaño sino el contenido: esconder
con `display: none` lo que igual se arma cuesta el mismo trabajo y deja el nodo en el árbol.

Qué queda afuera en un teléfono, y por qué:

- **la tarjeta de sprint** — habla del estado del software, no del negocio;
- **la grilla de módulos** — era navegación por tercera vez después de la barra inferior y el cajón,
  y dos de sus tarjetas apuntaban a anclas muertas (`#reparto`, `#usuarios`) anunciándose como
  "próximo sprint" cuando esas pantallas estaban construidas hace rato. Los enlaces quedaron
  corregidos también para escritorio;
- **el tablero de widgets** — los widgets por defecto son pedidos sin confirmar y mensajes sin leer,
  así que con la bandeja vacía quedaban dos tarjetas con un cero justo abajo de un "Nada pendiente".
  Elegir widgets es trabajo de escritorio y ahí sigue estando.

Lo que queda contesta una sola pregunta: qué está esperando, y qué se puede empezar ahora. Filas y
no tarjetas — en el alto de una tarjeta entran tres filas, y lo que importa es cuántas cosas hay.
Sólo se listan las que tienen algo: una fila que dice cero no es información.

**El estado vacío distingue "cargando" de "no hay nada".** Decir "Todo al día" antes de que lleguen
los datos es afirmar durante segundos, y sobre lo único que la pantalla existe para responder, algo
que todavía no se sabe.

### Tablas y pantallas de escritorio

**`DataTable`** declara las columnas una sola vez y de ahí salen dos formas: tabla en escritorio,
una tarjeta por fila en teléfono. Una tabla de ocho columnas en 375px no se arregla con
`overflow-x`: obliga a arrastrar de lado para leer una fila y se pierde de vista la columna que dice
de qué fila se trata. Escribir las dos formas por separado sería garantizar que dentro de unos meses
digan cosas distintas.

La usa hoy el excedente de Cocina, que era **la única tabla real de la app**. Un barrido de las nueve
pantallas de consulta a 375px no encontró ninguna otra que desborde: Pedidos y Pagos ya venían
resueltos con tarjetas.

**`DeskWorkNotice`** avisa, en pantalla angosta, en las ocho pantallas que son trabajo de escritorio
(menú semanal, contenidos, workbench de IA, usuarios, estadísticas, auditoría, encuestas, ajustes).
Dice qué **sí** se puede hacer desde el teléfono en cada una, en vez de un genérico.

No bloquea, a propósito. Bloquear sería decidir por alguien que quizás está en la calle y sin otra
opción; dejar un formulario de doce campos apretado sin decir nada sería peor todavía.
