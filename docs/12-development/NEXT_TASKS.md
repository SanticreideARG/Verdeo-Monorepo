# Next Tasks

## Purpose

This document turns the next roadmap block into an executable sequence. It covers infrastructure required
to run the current foundation, completion of Auth/RBAC/Audit, and the first CRM slice.

The implementation must continue to follow `AGENTS.md`. Any unresolved choice listed as **OPEN** must be
decided or recorded before code depends on it.

## Current baseline

Available on `main`:

- pnpm monorepo with strict TypeScript and CI;
- React/Vite public shell;
- Hono API with a standard error envelope, request IDs, structured logs, and health endpoint;
- Zod contracts and environment parsing;
- provider-neutral session primitives;
- dynamic permission resolution with per-user `allow` and `deny` overrides;
- initial Auth/RBAC/Audit/domain-event database schema, migration, and seed;
- PostgreSQL session lookup, active-user enforcement, effective permission resolution, `/api/v1/me`, and
  PostgreSQL audit sink;
- owned-session listing/revocation, reusable permission middleware, and a PII-minimized `users.read`
  directory endpoint;
- MVP credential login, audited provisioning commands, account lockout, and protected `/app` dashboard;
- persisted menu/customer/order engine, guest checkout, order status history, and deterministic kitchen
  output;
- encrypted AI provider configuration API and Staff UI foundation;
- Vercel Web deployment with direct `/pedido` SPA routing verified;
- automated checks through `pnpm check`.

## Recommended execution order

```text
DB-001 Neon environments
  -> DB-002 migration credentials and migration run
  -> DB-003 seed and first-superadmin bootstrap
  -> DEPLOY-001 Vercel entrypoints/configuration
  -> DEPLOY-002 Web/API Vercel projects and previews
  -> AUTH-001 authentication provider decision
  -> AUTH-002 session repository and middleware
  -> RBAC-001 permission repository and guards
  -> AUDIT-001 transactional audit persistence
  -> ADMIN-001 user/role administration API
  -> CRM-001 customer schema and contracts
  -> CRM-002 customer CRUD and identity matching
  -> CRM-003 addresses, preferences, and restrictions
  -> CRM-004 merge/unmerge
```

AI, WhatsApp, web ordering, and operational modules should not bypass these primitives.

## Current MVP priority

The order vertical slice is implemented in code. The immediate release path is now:

```text
rotate exposed Neon credential
  -> apply migrations 0000..0003 to Preview
  -> seed RBAC + provision superadmin
  -> validate menu -> customer -> order -> confirm -> kitchen against PostgreSQL
  -> deploy/smoke-test API and Web on Vercel
  -> add Prompt Registry + provider adapters + human-approved template generation
```

OAuth, email confirmation, messaging integrations, and customer self-service authentication remain
secondary until the operational order flow passes the Preview release gate. See `MVP_ORDER_ENGINE.md`.

Vercel tasks may start in parallel with DB-001, but production deployment remains blocked until environment,
migration, domain, and security gates in `VERCEL_DEPLOYMENT.md` are satisfied.

## Task register

### DB-001 — Create Neon environments

**Depends on:** account/project access.

**Deliverables:**

- development database;
- preview/test database strategy;
- production database isolated from development;
- pooled application connection and migration/admin connection;
- secrets stored outside Git.

**Acceptance:** API can connect from the intended runtime and no secret appears in logs, frontend bundles,
Git history, or CI output.

### DB-002 — Apply and verify migrations

**Depends on:** DB-001.

**Deliverables:**

- initial Drizzle migration applied;
- migration command documented for CI/deploy;
- schema verification report;
- failure and retry procedure.

**Acceptance:** applying migrations twice is safe, all expected constraints and indexes exist, and a fresh
database can be reproduced from the repository.

### DB-003 — Seed roles, permissions, and first superadmin

**Depends on:** DB-002 and an approved bootstrap identity.

**Deliverables:**

- idempotent permission/role seed;
- one-time first-superadmin bootstrap flow;
- bootstrap audit event;
- removal or disabling of bootstrap capability after use.

**Acceptance:** no default password exists and rerunning the seed does not duplicate records or remove
operator-managed configuration.

### AUTH-001 — Decide the long-term staff authentication provider

**Depends on:** owner decision.

**Deliverables:** proposed ADR updated to `Accepted`, provider configuration, redirect URLs, and account
recovery/MFA policy for superadmins.

**Status:** in progress. ADR-029 accepts Supabase Auth as broker and Google as the initial provider. The Web
PKCE callback, API token verification, safe identity linking, and internal session exchange are implemented;
invitations, MFA, recovery, and production smoke testing remain.

**OPEN:** permitted identity domains/accounts, MFA/recovery policy, and final production callback URLs.

### DEPLOY-001 to DEPLOY-004 — Vercel delivery

**Depends on:** GitHub repository; production completion also depends on DB-001/DB-002 and approved domains.

See `VERCEL_DEPLOYMENT.md` for the two-project topology, Hono function adaptation, SPA routing,
environments, migrations, domains, smoke tests, observability, and rollback.

### AUTH-002 — Complete session authentication

**Depends on:** AUTH-001.

**Deliverables:** callback adapter, session repository, secure cookie, authentication middleware, session
revocation, `/me`, logout, and expired-session handling.

**Acceptance:** raw session tokens are never persisted or logged; disabled users and revoked/expired
sessions cannot authenticate.

**Status:** in progress. Database-backed authentication middleware, `/api/v1/me`, current-session logout,
owned-session listing/revocation, Supabase/Google callback exchange, and secure cookie issuance are
implemented. Invitations and administrative all-user revocation remain.

### RBAC-001 — Enforce dynamic authorization

**Depends on:** AUTH-002.

**Deliverables:** permission snapshot repository, API guard, domain-level authorization, cache invalidation,
and deny-by-default behavior.

**Acceptance:** no authorization branch checks a role name; individual `deny` overrides role grants.

**Status:** in progress. Session authentication resolves active-role grants plus user overrides without
role-name checks. The reusable endpoint guard is exercised by `GET /api/v1/users`, and session ownership is
enforced in SQL. Broader domain guards and resource-scoped repositories remain.

### AUDIT-001 — Persist audit events transactionally

**Depends on:** DB-002.

**Deliverables:** PostgreSQL `AuditSink`, diff/redaction policy, correlation propagation, query API, and
tests proving audit creation for successful relevant mutations.

**Acceptance:** the business mutation and its required audit record commit or roll back together.

**Status:** in progress. `PostgresAuditSink` exists and current-session logout writes revocation plus audit
inside one transaction. A database integration rollback test and the remaining business mutations still
need to prove the same coupling.

### ADMIN-001 — User, role, and permission administration

**Depends on:** AUTH-002, RBAC-001, AUDIT-001.

**Deliverables:** validated API endpoints and a minimal Staff UI for users, roles, assignments, overrides,
disable, and session revocation.

**Acceptance:** privilege escalation, self-lockout edge cases, and audit visibility are tested.

**Status:** started. `GET /api/v1/users` provides cursor-paginated identifiers, display names, statuses, and
creation timestamps behind `users.read`; it intentionally omits normalized email. Mutations and detailed
views remain pending.

### CRM-001 to CRM-004 — Customer foundation

**Depends on:** RBAC-001 and AUDIT-001.

See `CRM_IMPLEMENTATION.md` for schema, services, endpoints, security, and test cases.

## Definition of done for this block

- migrations are reproducible in a clean environment;
- staff authentication is operational and revocable;
- every protected endpoint uses dynamic permissions;
- relevant mutations create audit and domain events;
- Customer, identities, addresses, preferences, restrictions, and reversible merge are implemented;
- Zod validates all system boundaries;
- no delivery DTO or public response exposes CRM PII;
- unit, integration, contract, security, and API tests pass;
- `pnpm check` passes on the branch and in GitHub Actions;
- new decisions are reflected in the ADR index.
