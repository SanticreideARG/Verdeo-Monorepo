# MVP Order Engine Runbook

## Delivered vertical slice

The MVP now supports this persisted flow:

```text
configurable weekly menu
  -> publish menu and open sales cycle
  -> register or resolve customer
  -> create DRAFT staff order or CONFIRMED guest order
  -> confirm / ready / deliver / cancel through the documented state machine
  -> calculate a deterministic kitchen consolidation
```

PostgreSQL is the source of truth. Order items preserve product, variant, price, composition, quantity,
adjustment, and total snapshots. The readable order number uses a global PostgreSQL sequence (`N00001`,
`N00002`, ...); UUID remains the internal identifier.

## Database migrations

- `0002_tranquil_toad_men.sql`: customers and identities, catalog, sales cycles, weekly menus, orders,
  item snapshots, dietary instructions, and status history;
- `0003_medical_tyger_tiger.sql`: encrypted AI provider configuration metadata.

After rotating the previously exposed Neon credential, apply the release in this order:

```powershell
pnpm db:migrate
pnpm db:seed
pnpm auth:provision-user -- --email santi.creide@gmail.com --role superadmin --display-name "Santiago"
```

The provisioning command prints the generated password once. Store it in a password manager and do not
copy it into source, logs, issues, or Vercel variables.

## API surface

Public:

- `GET /api/v1/public/menu/current`;
- `POST /api/v1/public/orders` (guest checkout, confirmed immediately).

Staff, protected by resolved permissions:

- `GET|POST /api/v1/customers`;
- `GET|POST /api/v1/menus`;
- `POST /api/v1/menus/:id/publish`;
- `GET|POST /api/v1/orders`;
- `POST /api/v1/orders/:id/status`;
- `GET /api/v1/production/:cycleId`;
- `GET|PUT /api/v1/ai/providers`.

Every input uses shared Zod contracts. Customer contacts are returned only with
`customers.view_sensitive`. Mutations create audit records in the same transaction; customer and order
creation also append domain events.

## Business guarantees

- one unit contains the configurable `mealsPerUnit` snapshot (five in the current operation);
- an Intuitivo composition has exactly five published dishes from the same variant universe;
- repetitions are allowed;
- changing a base composition stores the order item commercially as `Intuitivo`;
- totals use integer minor units and are never calculated by an LLM;
- kitchen includes `CONFIRMED`, `READY`, and `DELIVERED` demand, excludes drafts/cancellations, aggregates
  base units, preserves named dietary exceptions, and lists every Intuitivo composition;
- status reversals require explicit confirmation and audit;
- cancellation requires a reason; delivered orders cannot be cancelled.

## Staff and guest UI

- `/pedido`: published menu, base/Intuitivo selection, customer details, delivery data, dietary notes, and
  guest confirmation;
- `/app`: permission-aware module links;
- `/app/operaciones`: customers, menu builder/publish, order intake/status, kitchen output, and AI provider
  configuration.

The pages were inspected at desktop width and 390 × 844. The document had no horizontal overflow and no
browser console warnings/errors under contract-compatible mocked API responses.

## AI/template foundation

Provider records are data, not hardcoded choices. API keys entered through the Staff UI are encrypted with
AES-256-GCM using server-only `AI_CONFIG_ENCRYPTION_KEY`; only a last-four mask is returned. Generate the
key once with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

This release intentionally does not invoke a model yet. Prompt Registry/versioning, capability routing,
budgets, structured-output validation, execution logs, and human approval remain required before the
template generator can run against a provider.

## Remaining MVP validation

1. Rotate the Neon password and replace Vercel/local database variables.
2. Apply migrations and seed against an isolated preview branch.
3. Provision the superadmin and test the complete flow with PostgreSQL.
4. Verify Vercel cookies/CORS between the actual Web and API origins.
5. Add database integration tests for mutation + audit rollback and concurrent customer identity creation.
6. Add cycle-lock override behavior after the OPEN cutoff policy is decided.
7. Add rate limiting/abuse protection to the public order endpoint before a public production launch.
8. Implement Prompt Registry and provider adapters before enabling template generation.
