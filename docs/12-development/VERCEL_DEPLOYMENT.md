# Vercel Deployment Runbook

## Objective

Deploy Verdeo SCA as two Vercel projects connected to the same GitHub monorepo:

| Vercel project | Root directory | Workload                                  | Suggested domain      |
| -------------- | -------------- | ----------------------------------------- | --------------------- |
| `verdeo-web`   | `apps/web`     | Vite SPA and public/staff/delivery UI     | primary Verdeo domain |
| `verdeo-api`   | `apps/api`     | Hono on Vercel Functions, Node.js runtime | `api.<domain>`        |

This keeps deployments and logs separate while preserving shared packages and a single source repository.
V1 must use the Node.js runtime, not Edge, because the documented architecture requires full Node.js
compatibility for PostgreSQL, document generation, and provider adapters.

## Current readiness

### Ready

- GitHub repository and `main` branch;
- pnpm workspace with a root lockfile and explicit package names/dependencies;
- Node.js version declared in `.nvmrc` and root `package.json`;
- production build scripts for Web and API;
- `.vercel/` ignored by Git;
- environment variables validated by Zod;
- API health endpoint and request IDs;
- GitHub Actions quality gate.
- Vite SPA rewrite in `apps/web/vercel.json`;
- Hono Web-standard Function entrypoint and catch-all rewrite in `apps/api`;
- API framework autodetection disabled so only `api/index.ts` owns serverless routing;
- empty `apps/api/public` output retained for Vercel's framework-neutral build contract;
- production package exports compiled to `dist` and verified during the Vercel build.
- Web production deployment observed loading `/pedido` directly on 2026-08-17.

### API deployment adapter

`apps/api/src/server.ts` uses `@hono/node-server` and opens a TCP port for local Node development.
`apps/api/api/index.ts` is the separate Vercel Function entrypoint and creates the same Hono application
without calling `serve()`.

Implemented shape:

```text
apps/api/
├─ api/
│  └─ index.ts          # Vercel Function entrypoint
├─ src/
│  ├─ app.ts            # shared createApp factory
│  ├─ runtime.ts        # env/logger/database/session composition root
│  └─ server.ts         # local Node entrypoint only
└─ vercel.json          # catch-all rewrite/function configuration
```

The Vercel entrypoint:

1. parse server environment variables;
2. create the structured logger;
3. create the Hono app through `createApp`;
4. export an explicit Web-standard `{ fetch(request) }` object that delegates to Hono;
5. never listen on a port;
6. retain the original request path when the catch-all rewrite invokes the function.

The Web SPA rewrite is now verified by a direct deployed `/pedido` request. The remaining adapter gate is
to validate the API function, database-backed `/api/v1/me`, and catch-all rewrite in a Preview Deployment.
Do not reuse old community instructions that force Edge runtime or disable request parsing without evidence
from the current Vercel/Hono versions.

Internal `@verdeo/*` packages expose TypeScript source only through `types`/`development` conditions and
compiled `dist` JavaScript for production imports. `pnpm build:vercel` builds every internal package used
directly by the API and runs a runtime-resolution check before Vercel packages the Function. This prevents
a Function from emitting an import to a missing `node_modules/@verdeo/*/src/index.ts` path.

## Repository changes required

### Web SPA routing

React Router needs a fallback so a direct request to `/pedido`, `/login`, `/app`, or `/delivery` returns
`index.html` instead of a platform 404. Add `apps/web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

If same-origin API proxying is added later, its `/api/:path*` rewrite must appear before the SPA fallback.
Never create a user-controlled arbitrary external rewrite destination.

### API function routing

Add a Vercel Function under `apps/api/api` and route the API project paths to that function. The final
configuration must preserve these public paths:

- `/health`;
- `/api/v1/*`;
- `/webhooks/*` when messaging is implemented.

Test `GET`, JSON `POST`, request bodies, cookies, CORS, and webhook raw-body/signature handling. A successful
`GET /health` alone is not sufficient evidence that the adapter is correct.

### Build output

Vercel detects Vite and its default `dist` output. Suggested Web settings:

- Framework Preset: `Vite`;
- Build Command: `pnpm build` from the `apps/web` project;
- Output Directory: `dist`;
- Node.js: version compatible with the root `>=22` requirement;
- Skip deployments for unaffected projects: enabled.

The API Function is compiled by Vercel from the TypeScript file under `api/`. Its existing `pnpm build`
remains useful as a standalone production-build check, but must not replace the function entrypoint.

## Create the Vercel projects

1. In the Vercel team, import `SanticreideARG/Verdeo-Monorepo`.
2. Create `verdeo-web` with Root Directory `apps/web`.
3. Confirm Vite framework detection and `dist` output.
4. Enable access to source files outside the Root Directory so pnpm workspace metadata and future shared
   packages are available.
5. Enable skip-unaffected-project behavior.
6. Import the same GitHub repository again as `verdeo-api`.
7. Set Root Directory to `apps/api` and enable outside-root workspace sources.
8. Keep Framework Preset as `Other`; `apps/api/vercel.json` pins this with `"framework": null`.
9. Configure the Node.js Function entrypoint and route settings.
10. Keep `main` as the Production Branch.
11. Protect previews when they can display operational or customer data.

Vercel creates Preview Deployments for non-production branches and Production Deployments from the
production branch. Do not use a production database for arbitrary previews.

## Environment variables

### Web project

Only browser-safe values may use the `VITE_` prefix:

- `VITE_API_URL`: public API origin when direct cross-origin requests are used;
- `VITE_SUPABASE_URL`: public Supabase project URL after the OAuth adapter is implemented;
- `VITE_SUPABASE_PUBLISHABLE_KEY`: public Supabase publishable key after the OAuth adapter is implemented;
- future public analytics/site identifiers after privacy review.

The Web Vite config also maps the official Supabase Marketplace aliases
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to those two specific browser values. It
does not expose the complete `NEXT_PUBLIC_` prefix or any server-only Supabase variable.

Never place database URLs, session secrets, provider API keys, Meta secrets, or encryption keys in Web
project variables exposed to Vite.

### API project

Foundation variables:

- `NODE_ENV=production`;
- `LOG_LEVEL`;
- `APP_URL`;
- `API_URL`;
- `DATABASE_URL` using the Neon pooled/serverless application connection;
- `SESSION_SECRET` with at least 32 high-entropy characters.
- `SESSION_TTL_HOURS=8` for the MVP default;
- `SESSION_COOKIE_SAME_SITE=None` for separate Vercel preview hosts, or `Lax` for sibling custom domains.
- `AI_CONFIG_ENCRYPTION_KEY`: optional until configuring providers; required before accepting an API key
  from the Staff UI. It must be a base64-encoded 32-byte random value and must never use a `VITE_` prefix.

Future server-only variables include OAuth, Meta, AI, geocoding, storage, and encryption secrets. Add them
only when the owning adapter is implemented.

For the planned Supabase OAuth adapter, the API will use `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` to validate identity. `SUPABASE_SECRET_KEY` is required only for server-side
administrative operations such as invitations and must never use a `VITE_` prefix. The Vercel Marketplace
integration may also add Supabase PostgreSQL variables; they must not replace Verdeo's Neon `DATABASE_URL`.
See `SUPABASE_OAUTH_SETUP.md` for the complete setup and verification runbook.

### Environment separation

Configure values independently for Development, Preview, and Production. Environment-variable updates only
affect new deployments, so secret rotation requires redeploying every affected project/environment before
the previous credential is revoked.

Use `VERCEL_ENV`/`VERCEL_TARGET_ENV` only to identify the deployment environment. Do not treat the branch
name as authorization or as a secret selector without validation.

## Database and migration policy

- The API runtime uses a pooled Neon connection.
- Migration credentials remain server/CI-only and should use a separate direct/admin connection when Neon
  configuration requires it.
- Never run migrations during module import, function cold start, or every API request.
- Never run production migrations independently from both Web and API builds in parallel.
- Apply a migration once through an explicit release job or approved operator step.
- Prefer backward-compatible expand/migrate/contract releases so the previous deployment can still run
  during rollout and rollback.
- Preview deployments use an isolated Neon branch/database and synthetic data.
- Seed is idempotent, but first-superadmin bootstrap is a separate controlled operation.

Recommended production sequence for schema-changing releases:

```text
GitHub Actions pnpm check
  -> create Preview Deployments
  -> apply migration to preview database
  -> API contract/security smoke tests
  -> operator approval
  -> apply backward-compatible production migration once
  -> promote/deploy API
  -> smoke-test API
  -> promote/deploy Web
  -> observe
```

The exact automation remains OPEN until Vercel and Neon ownership/credentials are available.

## CORS, cookies, and origins

- `APP_URL` is an exact trusted browser origin, not `*`.
- Credentialed requests must not use wildcard CORS.
- Add preview origins through an explicit environment-aware allowlist; never accept any `*.vercel.app`
  origin without validating the project/team host.
- Production auth cookies are `Secure`, `HttpOnly`, and use the narrowest domain/path possible.
- Decide whether the final browser flow uses direct `api.<domain>` requests or a same-origin `/api` proxy
  before freezing cookie `SameSite`/domain policy.
- OAuth callback URLs must be registered separately for Preview and Production or previews must use a
  controlled callback host.

## Domains and DNS

Before attaching the real Verdeo domain:

1. identify the current DNS owner and registrar;
2. record existing website, mail, WhatsApp verification, and other DNS records;
3. add the Web domain without deleting unrelated records;
4. add an API subdomain if using direct API requests;
5. verify TLS and redirects;
6. update `APP_URL`, `API_URL`, CORS, OAuth callback, and webhook URLs;
7. redeploy after environment changes;
8. validate both apex/`www` policy and public QR/token links.

DNS changes are external and potentially disruptive. Resolve exact target records before editing them.

## Preview verification

### Web

- `/`, `/pedido`, and `/login` load directly and after refresh;
- assets return successful cacheable responses;
- no server secret appears in built JS or page source;
- mobile width, focus order, keyboard navigation, and AA contrast pass;
- frontend uses the intended Preview API origin.

### API

- `/health` returns `200`, version, timestamp, and `x-request-id`;
- unknown route returns the standard `404` envelope;
- `/api/v1/me` returns `401` without a session;
- `/api/v1/auth/login` returns a generic `401` for invalid credentials and a Secure/HttpOnly cookie for a
  provisioned account;
- `/api/v1/sessions` returns `401` without a session and never serializes token material;
- `/api/v1/users` returns `403` for a session without `users.read`;
- `/api/v1/public/menu/current` returns the published Preview menu and `POST /api/v1/public/orders` creates
  a contract-valid order without requiring an account;
- authenticated customer/menu/order/production mutations enforce their documented dynamic permissions;
- `/api/v1/ai/providers` never returns encrypted or plaintext API key material;
- JSON `POST` body and validation errors work through the Vercel adapter;
- CORS rejects unapproved origins and permits the configured Web origin;
- database connectivity uses the Preview database only;
- logs redact authorization, token, key, secret, and password fields;
- cold start and concurrent requests do not exhaust database connections.

### Release gate

- GitHub Actions and Vercel builds both pass;
- migration status is known;
- critical smoke tests pass;
- no PII exists in preview test data;
- owner/operator approval is recorded before first production release.

## Observability and alerts

Configure Vercel logs/observability for:

- API error rate and latency;
- function duration, memory, and cold starts;
- database connection failures;
- failed authentication;
- webhook/message failures when implemented;
- request/correlation ID search;
- deployment and rollback markers.

Do not rely only on Vercel logs for business audit. `AuditEvent` remains an immutable PostgreSQL record.

## Rollback

1. Identify whether the incident is Web-only, API-only, configuration, or database-related.
2. Preserve deployment/log/request IDs.
3. Use Vercel Instant Rollback or `vercel rollback <deployment-id-or-url>` for the affected project.
4. Verify domain assignment and critical smoke tests.
5. Remember that a rollback restores the previous deployment configuration snapshot; recently changed
   environment variables may not be present.
6. Do not reverse a database migration blindly. Use a tested corrective migration or documented restore.
7. After resolution, promote an approved deployment to restore normal production auto-assignment.

Rollback capability depends on the Vercel plan: Hobby supports the immediately previous production
deployment, while broader history requires Pro/Enterprise.

## Troubleshooting workspace module resolution

### `ERR_MODULE_NOT_FOUND ... @verdeo/<package>/src/index.ts`

This means a Vercel Function emitted a runtime import to TypeScript workspace source that was not copied
into the Function bundle.

The repository prevents this by:

- exporting `src/index.ts` only for TypeScript types and the explicit `development` condition;
- exporting `dist/index.js` for production `import`/`default` conditions;
- building direct API workspace dependencies in `pnpm build:vercel`;
- failing the build unless `import.meta.resolve()` points those dependencies to `dist`;
- exposing the API through `apps/api/api/index.ts` instead of treating `src/app.ts` as a Function.

If the error persists after this fix:

1. verify the deployment uses a commit containing the fix;
2. set the Vercel project Root Directory to `apps/api`;
3. enable source access outside the Root Directory for pnpm workspace packages;
4. remove any dashboard override that deploys `src/app.ts` directly;
5. confirm the build runs the `buildCommand` from `apps/api/vercel.json`;
6. confirm the build log contains `Verified compiled runtime exports for 8 workspace packages.`;
7. redeploy without the previous build cache;
8. inspect the deployed Function path—it should originate from `api/index.ts`, not `src/app.ts`.

Do not fix the error by committing `node_modules`, exposing all source files through broad include globs, or
copying workspace code manually into the API app.

## Task register

### DEPLOY-001 — Add Vercel entrypoints/configuration

- add Web SPA rewrite;
- add API Web-function entrypoint and catch-all routing;
- keep local Node server separate;
- add adapter tests for paths, JSON bodies, cookies, and CORS.

### DEPLOY-002 — Create and connect projects

- create `verdeo-web` and `verdeo-api`;
- set Root Directories and workspace-source access;
- set `main` as Production Branch;
- enable skip-unaffected behavior and preview protection.

### DEPLOY-003 — Configure environments and domains

- add Development/Preview/Production variables;
- connect isolated Neon targets;
- configure Web/API domains, CORS, OAuth callbacks, and webhook URLs;
- document secret owners and rotation.

### DEPLOY-004 — Release and recovery automation

- add explicit migration/release workflow;
- add Preview and Production smoke tests;
- configure alerts;
- execute and record a rollback drill;
- execute and record a database restore drill before real data.

## Definition of done

- two projects deploy from the same GitHub monorepo;
- Web deep links work on refresh;
- API runs as a Node.js Vercel Function without opening a port;
- shared workspace packages resolve during builds;
- previews use isolated environment values and non-production data;
- CORS/cookies use explicit trusted origins;
- migrations run exactly once through a controlled release step;
- production domains, health checks, logging, alerts, and rollback are verified;
- no secret or unnecessary PII appears in client bundles, logs, or deployment output;
- `pnpm check`, GitHub Actions, Vercel builds, and smoke tests pass.

## OPEN decisions

- Vercel team and plan;
- exact project names and production domains;
- deployment region aligned with Neon;
- direct API origin versus same-origin Web rewrite;
- preview protection and preview-database lifecycle;
- production promotion policy: automatic from `main` or manual promotion;
- migration workflow owner and approval policy;
- alert destinations and incident owner.

## Official references

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel build and Root Directory configuration](https://vercel.com/docs/builds/configure-a-build)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel environments](https://vercel.com/docs/deployments/environments)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- [Vercel rollback](https://vercel.com/docs/cli/rollback)
- [Hono runtime entrypoints](https://hono.dev/docs/getting-started/basic)

## Trabajos programados (as built)

Dos crones, ambos en `apps/api/vercel.json`, autenticados con `Authorization: Bearer $CRON_SECRET`
—que es la cabecera que Vercel manda sola cuando esa variable existe— y **expuestos en GET y en
POST**.

El GET no es un detalle: **los Cron Jobs de Vercel invocan con GET**. `/api/v1/cron/chat-retention`
estuvo registrado sólo como POST, así que el cron diario le pegó a un 404 desde que se creó y la
purga de mensajes nunca corrió. Un trabajo que existe en el panel y devuelve 404 no deja rastro que
alguien vaya a mirar. El POST se conserva para dispararlos a mano.

- `chat-retention` (04:00) — borra los mensajes vencidos.
- `keep-alive` (13:00) — mantiene despierto el proyecto de Supabase.

### Por qué existe keep-alive

Los proyectos gratuitos de Supabase se pausan tras unos días sin actividad. Uno pausado no sólo deja
sin ingreso por Google: **rompe el build del frontend**, que lee las variables de Supabase al
compilar. Vercel lo informa como `Integration provisioning error / Resource provisioning failed`, que
no menciona a Supabase por ningún lado.

El costo real no es el rato que el proyecto está pausado: es que **producción se queda congelada en
el último commit que llegó a construirse**. Todo lo que se mergeó después existe en `main` y no
existe en el sitio, y lo que se ve son síntomas sueltos que parecen bugs — un enlace para blanquear
la contraseña que no funciona, una pantalla nueva que no aparece —. Pasó dos veces.

### Qué cuenta como actividad (y qué no)

La primera versión de este trabajo llamaba a `/auth/v1/settings`, y **no alcanzó**: el cron corría
todos los días, el log decía que Supabase respondía, y el proyecto se pausó igual. Esa ruta la
contesta la configuración de Auth sin tocar Postgres, así que para Supabase el proyecto seguía sin
actividad.

Lo que cuenta es **llegar a la base**. Con la sola clave publicable, la forma de llegar es PostgREST,
así que el trabajo hace un `upsert` contra una tabla `keep_alive`. Es un upsert de una fila con `id`
fijo y no un insert: mantener vivo el proyecto no puede costar una tabla que crece para siempre. La
fila queda con la fecha de la última corrida, que de paso responde "¿esto está funcionando?" sin
tener que buscar en los logs.

Se conserva el ping a `/auth/v1/settings` como **canario** —dice si el proyecto responde— y se
informa aparte de la escritura. Juntos bajo un mismo nombre fue lo que escondió el problema durante
semanas.

### La tabla, una sola vez

En el SQL Editor del proyecto de Supabase:

```sql
create table if not exists public.keep_alive (
  id int primary key,
  touched_at timestamptz not null default now()
);

alter table public.keep_alive enable row level security;

-- La clave publicable viaja en el bundle del navegador, así que esta política es pública por
-- definición. Es aceptable porque la tabla no guarda nada: lo peor que puede hacer alguien es
-- escribir una fecha distinta en la única fila que tiene.
create policy keep_alive_anon_upsert on public.keep_alive
  for all to anon using (true) with check (true);
```

Sin la tabla, el trabajo responde 200 igual y el cuerpo dice `supabaseWrite.ok: false` con el error
de PostgREST, que distingue "la tabla no existe" de "existe y `anon` no la puede escribir".

### Comprobarlo

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<api>/api/v1/cron/keep-alive
```

Tiene que responder `supabaseWrite: { ok: true }`. Si responde 403, falta `CRON_SECRET` en
producción — y sin ella el cron tampoco hace nada, porque Vercel manda esa cabecera sólo cuando la
variable existe.

De paso toca Neon con un `select 1`. No hace falta para mantenerlo vivo —Neon reanuda el cómputo al
conectarse— pero convierte el trabajo en un canario diario.

**Devuelve 200 aunque un ping falle**, y el estado va en el cuerpo. Un cron que responde error se
reintenta y Vercel lo desactiva tras varios fallos seguidos: justo cuando más falta hace que siga
pasando, porque el proyecto está por pausarse.

**Lo que esto no garantiza:** Supabase no documenta su heurística de inactividad y la cambió antes.
Una escritura diaria contra Postgres es lo más parecido a actividad real que se puede hacer sin
clave de servicio, pero la única garantía dura es un plan pago. Si se vuelve a pausar con
`supabaseWrite.ok: true` en los logs, ya no hay nada que ajustar del lado del código.

### Historial paralelo en Supabase (`audit_mirror`)

El mismo trabajo, después de escribir `keep_alive`, copia a Supabase los eventos de auditoría que
todavía no están. Sirve de respaldo del historial y de actividad real y diaria en el proyecto.

- **Se copia después, no al escribir cada evento.** Se lee de `audit_events` ya confirmada, así que
  un pedido que se deshace no deja una copia de algo que no pasó, y una caída de Supabase no puede
  romper un pedido. Lo que no se copió hoy se copia en la próxima corrida (hasta 500 por vez).
- **Repetir es seguro.** Se copia por `id` con upsert; el cursor es la fecha del último evento copiado.
- **Sólo identifica el evento**: acción, entidad, id de entidad, tipo de actor, id de usuario,
  solicitud y fecha. **No viajan** el antes/después ni los metadatos, que es donde aparecen
  nombres, direcciones y teléfonos de clientes.
- Si la copia falla, el cron igual responde 200 y el cuerpo trae `auditMirror: { ok: false, detail }`.

La tabla, una sola vez, en el SQL Editor de Supabase:

```sql
create table if not exists public.audit_mirror (
  id uuid primary key,
  occurred_at timestamptz not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  actor_type text not null,
  actor_user_id uuid,
  request_id text not null,
  correlation_id text not null,
  source text not null
);

create index if not exists audit_mirror_occurred_at_idx on public.audit_mirror (occurred_at desc);

alter table public.audit_mirror enable row level security;

-- Misma salvedad que keep_alive: la clave publicable es pública. Acá se escribe y se lee el
-- historial, pero sin datos de clientes. Si más adelante se guarda algo más sensible, hay que
-- pasar a una clave de servicio en lugar de abrir esta política.
create policy audit_mirror_anon on public.audit_mirror
  for all to anon using (true) with check (true);
```

### Estado del sistema (Panel de control → Estado del sistema)

Permiso `audit.read` (no hay un permiso nuevo para no sumar un paso de siembra en producción).

- **Modal de la barra** (ícono de servidores, en todo el tablero y el panel): un medidor por
  servidor —Neon, Supabase (acceso) y Supabase (base de datos)— con latencia y detalle. El punto de
  color es el peor de los tres.
- **Página `/app/sistema`**: lo anterior, más latencia de la aplicación (mediana, p95 y peor),
  estado de la copia paralela, el **mapa de tablas** agrupado por tema (filas estimadas, tamaño y
  relaciones por clave foránea) y el **log de errores** del servidor.
- **Latencia de la aplicación**: es de la instancia que contestó, no de toda la plataforma (un
  servicio sin estado levanta varias, cada una con su memoria). Sirve para ver "anda lento ahora".
- **Errores**: los 500 se guardan en `server_errors` (migración 0053), 30 días, con el número de
  solicitud para buscar el detalle en los logs de Vercel. Sin cuerpos de pedido ni datos de clientes.
- Cada sonda falla por separado: si Supabase no contesta, la base principal se sigue midiendo.

### El respaldo en GitHub Actions

El cron de Vercel falla de dos formas silenciosas: sin `CRON_SECRET` en producción el endpoint
responde 403 y el trabajo no hace nada, y si el endpoint falla varias veces seguidas Vercel
desactiva el cron. En los dos casos nadie se entera hasta que el proyecto se pausa.

`.github/workflows/keep-alive.yml` llama al mismo endpoint todas las mañanas, unas horas antes, y
**falla ruidosamente** si la escritura no salió: GitHub manda un correo cuando un workflow
programado falla, que es la señal que faltaba.

Necesita dos secretos del repositorio (Settings → Secrets → Actions):

- `KEEP_ALIVE_URL`: `https://<api>/api/v1/cron/keep-alive`
- `CRON_SECRET`: el mismo valor que tiene la API en Vercel.

Sin ellos el trabajo se saltea con un mensaje en lugar de fallar todos los días, que sería ruido
sin información.
