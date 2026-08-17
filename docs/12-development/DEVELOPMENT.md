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

OAuth provider selection, production database credentials, and the first superadmin bootstrap remain deployment decisions.
