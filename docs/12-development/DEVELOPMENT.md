# Development

## Requirements

- Node.js 22 or newer.
- pnpm 11.22.0 through Corepack.
- PostgreSQL-compatible database; Neon is the preferred hosted service.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

On Windows PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

The web app uses `http://localhost:5173` and the API uses `http://localhost:3000` by default.

## Quality gates

```bash
pnpm check
```

This command verifies formatting, lint, strict TypeScript, tests, and production builds.

## Database changes

1. Change files under `packages/db/src/schema`.
2. Run `pnpm db:generate` with `DATABASE_URL` available.
3. Review the generated SQL and metadata.
4. Run `pnpm db:migrate` against a local/test database.
5. Include domain and repository tests with the feature.

Never edit an already-applied migration. Create a new migration instead.

## Current implementation status

The first foundation slice includes:

- workspace and CI configuration;
- Hono API shell with correlation IDs, structured logs, CORS, error envelope, and health check;
- React/Vite/Tailwind public shell;
- Zod contracts and environment validation;
- provider-neutral session primitives;
- dynamic RBAC resolution and initial permission seed catalog;
- Audit Core and domain event boundaries;
- initial Drizzle schema and migration for auth, RBAC, audit, and event outbox records.
- Vercel Web/API configuration with compiled runtime exports for internal workspace packages.
- PostgreSQL-backed session authentication, owned-session management, and transactional revocation audit.
- enforced `users.read` middleware and a PII-minimized, cursor-paginated user directory endpoint.
- manually provisioned password login, account lockout, and protected Staff dashboard for the MVP sprint.
- persisted customer, weekly-menu, order, state-history, and deterministic kitchen-output vertical slice.
- guest checkout at `/pedido` and the Staff operations center at `/app/operaciones`.
- encrypted, permission-protected AI provider configuration foundation.

OAuth and email confirmation are deferred until after the MVP dashboard sprint. The first superadmin can be
provisioned after rotating the Neon credential by following `MVP_DASHBOARD_ACCESS.md`.

## Next implementation block

- `NEXT_TASKS.md`: ordered task register and definition of done.
- `NEON_SETUP.md`: database environment, migration, seed, and recovery runbook.
- `AUTH_RBAC_AUDIT_IMPLEMENTATION.md`: security foundation design and test matrix.
- `CRM_IMPLEMENTATION.md`: customer-domain schema, services, API, privacy, and merge/unmerge plan.
- `VERCEL_DEPLOYMENT.md`: Web/API projects, environments, domains, release gates, and rollback.
- `MVP_DASHBOARD_ACCESS.md`: credential login, provisioning, Vercel cookie settings, and smoke tests.
- `MVP_ORDER_ENGINE.md`: order-engine guarantees, migrations, endpoints, UI, AI configuration, and release
  validation.
