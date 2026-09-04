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
