# CRM and order cycle — implementation baseline

## Purpose

This baseline completes the backend shape required before designing the operational dashboard. PostgreSQL
is authoritative; the UI will consume these contracts and will not reconstruct customer or order rules.

## Implemented vertical slice

- customer creation and update with full/display name and internal notes;
- normalized external identities for phone, WhatsApp, email, and configurable future channels;
- a single active primary identity per customer and channel;
- multiple active/inactive addresses with written address, city, sector, operational zone, property data,
  access notes, location URL, coordinates, geocoding state, and atomic primary selection;
- dietary/delivery/other preferences through configurable category keys;
- commercial restrictions with actor, reason, activation/resolution, and sensitive DTO filtering;
- stable customer pagination and search by name, plus contact search only for sessions allowed to view PII;
- customer detail with associated order history;
- optional order-to-address reference plus immutable address/location snapshots;
- audited order reprogramming for address, location, delivery date, payment expectation, and notes;
- configurable message templates with channel, semantic action key, scope, activation, and exact variable
  validation;
- audit records and `CUSTOMER_UPDATED`/template domain events in the same transaction as each mutation;
- closed-cycle and reversal policy enforced in the order domain engine.

## Order invariants

1. A persisted order always references an active customer and a published menu.
2. If `deliveryAddressId` is supplied, it must be an active address owned by that customer.
3. Prices, names, composition, delivery address, and location link are snapshots.
4. Money is calculated in integer minor units by the order engine.
5. Cancellation and every reversal require a reason; reversal also requires explicit confirmation.
6. A closed sales cycle blocks changes to commercial commitment unless the actor has
   `orders.override_cycle_lock`.
7. Forward fulfillment after close remains possible: `CONFIRMED -> READY -> DELIVERED`.
8. `DELIVERED -> CANCELLED` is never valid.

## Privacy and authorization

- `customers.read` returns the minimum identification and order fields.
- identities, addresses, internal notes, preferences, and restrictions require
  `customers.view_sensitive` in detail/list DTOs.
- customer core mutations require `customers.edit`; creation uses `customers.create`. Contact, address,
  preference, and restriction endpoints additionally require `customers.view_sensitive` so mutation
  responses cannot bypass PII filtering.
- restrictions require `customers.restrict`.
- message templates require `messages.templates.use` to read and `messages.templates.manage` to change.
- delivery-specific endpoints must never reuse the CRM detail DTO.

## Still OPEN / next slices

- geocoding provider adapter and operator confirmation UI;
- configurable city/sector/operational-zone catalogs;
- duplicate suggestion plus previewed, reversible merge/unmerge;
- audited line-item/composition editing with deterministic total recalculation;
- filtered order pagination, complete status history, CSV/Excel exports;
- conversations/messages, idempotent inbound events, provider adapters, and outbound delivery receipts;
- template version history and actual send records;
- production and logistics state machines as separate aggregates.

The migration for this baseline is `packages/db/migrations/0004_overrated_ezekiel.sql`.
