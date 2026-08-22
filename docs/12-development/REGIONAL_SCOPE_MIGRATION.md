# Regional scope — migration runbook

## Purpose

Migrations `0008` and `0009` turn the regional model from schema into enforced behaviour. Both rewrite
existing rows, so they need a rehearsal against a copy before Preview or Production.

`0008` moves menu prices from the variety to the size. `0009` makes the operation mandatory on orders,
the zone mandatory on addresses, and replaces global order numbering with a regional one.

## What 0009 assumes

- **Neuquén is the initial operation.** It is created only when the installation has no operation yet,
  with slug `neuquen` and prefix `NQN`. An installation that already created operations through
  `/app/ajustes/zonas` keeps them; the lowest `sort_order` active operation receives historical data.
- **A landing zone is created.** Existing addresses have no zone, and the column becomes mandatory, so
  the migration creates a real zone `sin-clasificar` ("Sin clasificar") in the initial operation and
  assigns every existing address to it. The previous free-text `operational_zone` is preserved.
- **Existing users and customers keep the access they had.** Every active user gets a membership in the
  initial operation, and every customer gets one too. Nobody gains access they did not have: before this
  migration there was no scoping at all and one operation existed.
- **Order numbering continues.** The initial operation's counter starts at the current order count, so
  the first regional number lands above the historical `Nxxxxx` series. Already emitted public numbers
  are never rewritten.

## Rehearsal status

Both migrations are rehearsed automatically against a real PostgreSQL engine (PGlite, in process)
by `packages/db/src/migrations.test.ts`, which runs inside `pnpm check`. It proves three things on
every commit: a clean database reproduces from the repository alone, pre-regional rows backfill
without leaving a null in any newly mandatory column, and the composite key refuses an order whose
zone belongs to another operation.

That covers the SQL. It does not cover **your data**, which is what the checklist below is for.

## Rehearsal checklist

Run against a restored copy, not the live database.

1. Apply `0008` and `0009` in order: `pnpm db:migrate`.
2. Run the verification script; every row must report `PASS`:

   ```bash
   psql "$DATABASE_URL" -f packages/db/scripts/verify-regional-scope.sql
   ```

What the script reports, and how to read it:

- **Mandatory columns.** Every row must say `PASS`. A `FAIL` means the backfill left data the new model
  cannot represent. Active users without a membership report `WARN`, not `FAIL`: they can still work if
  they hold `sites.access_all`, and otherwise they need a membership assigned.
- **Price model.** Each row listed is a variety that priced differently from its size and therefore
  survived as a permanent override. An empty list is the expected outcome; a long one means the old
  data had real price divergence worth reviewing before it becomes policy.
- **Composable variety.** Exactly one `COMPOSABLE` family is expected. If yours is not coded
  `intuitivo`, `0008` will not have found it — set its `kind` manually once, and from then on the
  engine reads the column rather than the name.
- **Regional numbering.** The initial operation must show `last_order_number` equal to the number of
  orders it holds, so the first regional number lands above the historical series.
- **Operator follow-up.** The count of addresses still parked in `sin-clasificar`.

## After applying

Two follow-ups are operator work, not code:

- **Reclassify the `sin-clasificar` addresses** into their real zones from `/app/clientes`. The zone is
  what decides which operation an order belongs to, so an unclassified address will keep sending its
  orders to the initial operation.
- **Assign user memberships** in `user_operating_sites` for anyone who should see more than the initial
  operation, and grant `sites.access_all` to whoever needs the consolidated global view.

## Rollback

Neither migration is reversible by a down script: `0008` collapses per-variety prices into a per-size
list and `0009` drops the global numbering default. Rolling back means restoring the pre-migration
snapshot, which is why both must be rehearsed on a copy first.
