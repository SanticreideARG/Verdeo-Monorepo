# Neon Setup and Migration Runbook

## Scope

This runbook prepares PostgreSQL/Neon for development and later deployment. It does not authorize placing
production credentials in the repository or reusing development credentials in production.

## Environment model

Use isolated data boundaries:

- **local/development:** developer testing and disposable data;
- **preview/test:** CI integration and pre-production verification;
- **production:** real operational data with restricted access.

Neon branches may implement preview isolation, but production must not be used as a development branch.

## Connection roles

Maintain two connection purposes:

1. **Application runtime:** pooled/serverless connection with only the privileges required by the API.
2. **Migration administration:** direct connection allowed to create or alter schema objects.

The current tooling reads `DATABASE_URL`. Before deployment automation, add a separately named migration
secret if the selected Neon configuration uses different URLs. Never expose either URL through `VITE_*`
variables.

If a connection string or password is pasted into chat, an issue, a log, or another non-secret channel,
treat it as compromised even if the repository never contained it. Rotate the Neon role password, update
the Vercel API environments with the new pooled URL, redeploy, verify connectivity, and only then revoke the
old credential. Do not use the exposed value for migration or verification.

As of 2026-08-17, the Neon database has been reported as created. Migration and schema verification remain
pending until a rotated credential is available through an approved secret store.

## Local preparation

1. Copy the environment template.

   ```powershell
   Copy-Item .env.example .env
   ```

2. Replace only local values in `.env`. Keep `.env` ignored by Git.

3. Install dependencies.

   ```powershell
   corepack enable
   pnpm install --frozen-lockfile
   ```

4. Apply migrations and seed catalog data.

   ```powershell
   pnpm db:migrate
   pnpm db:seed
   ```

The seed creates configurable role and permission records. It does not create a default user or password.

## Verification

Verify after a clean migration:

- Drizzle migration journal exists;
- the ten foundation tables exist;
- UUID defaults use `gen_random_uuid()`;
- unique indexes protect normalized email, provider identity, role key, permission key, and session token
  hash;
- foreign keys use the documented delete behavior;
- audit indexes cover entity, actor, time, and correlation ID;
- pending domain events can be queried by publication/time;
- the seed can be run twice without duplicates.

Run the repository quality gate after database verification:

```powershell
pnpm check
```

## First-superadmin bootstrap

ADR-020 permits a temporary, manually provisioned password account for the MVP dashboard. After migration
and role seed, run the authenticated operator command documented in `MVP_DASHBOARD_ACCESS.md`. It creates
the `User`, `AuthIdentity`, scrypt credential, role assignment, and audit event in one transaction, then
shows a random password once.

There is still no default password, public bootstrap endpoint, or automatic privilege assignment based only
on an email claim. OAuth linking and MFA remain required follow-up work for the long-term superadmin policy.

## Backup and recovery gate

Before production data is accepted:

- define retention and point-in-time recovery settings;
- restrict who can create/restore branches or backups;
- perform a restore into a non-production target;
- verify migrations and application read access against the restored data;
- record recovery time, responsible person, and evidence of the test.

## Failure handling

- Never edit an applied migration.
- If migration execution fails, preserve the logs without connection strings.
- Inspect the database migration journal before retrying.
- Create a corrective migration for schema changes.
- Restore only after identifying the exact target and recovery point.
- Do not run destructive cleanup against production to make a migration pass.

## OPEN decisions

- Neon organization/project ownership;
- region closest to the production runtime;
- preview branch lifecycle and retention;
- runtime versus migration database roles;
- first-superadmin identity;
- backup retention and recovery objectives.
