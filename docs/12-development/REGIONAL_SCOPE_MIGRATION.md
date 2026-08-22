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

## Rehearsal checklist

Run against a restored copy, not the live database.

1. Apply `0008` and `0009` in order.
2. `select count(*) from product_variants where product_size_id is null;` must be `0`.
3. `select count(*) from customer_addresses where geographic_zone_id is null;` must be `0`.
4. `select count(*) from orders where operating_site_id is null;` must be `0`.
5. `select count(*) from weekly_menu_offerings where unit_price_minor is not null;` — every row here is
   a variety that priced differently from its size. A high count means the old data had real price
   divergence worth reviewing before it becomes a permanent override.
6. `select display_name, last_order_number from operating_site_order_counters join operating_sites on id = operating_site_id;`
   must show the initial operation at the historical order count.
7. Confirm the composable variety: `select code, display_name, kind from product_families;`. If the
   composable variety is not coded `intuitivo`, update its `kind` manually — `0008` recognises existing
   rows by code only once, and from then on the engine reads `kind`.

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
