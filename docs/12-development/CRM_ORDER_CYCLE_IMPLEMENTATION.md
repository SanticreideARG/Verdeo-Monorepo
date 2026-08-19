# CRM and order cycle — implementation baseline

## Purpose

This baseline provides the backend and first dedicated CRM dashboard slice. PostgreSQL is authoritative;
the UI consumes these contracts and does not reconstruct customer or order rules.

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
- deterministic full-line replacement for draft/confirmed orders, including Intuitivo resolution, dietary
  instructions, integer total recalculation, and an immutable pre-change revision;
- stable order pagination and filters by status, customer, cycle, date range, zone, public number, or name;
- audited CSV export with spreadsheet-formula protection and a 5000-row safety limit;
- configurable message templates with channel, semantic action key, scope, activation, and exact variable
  validation;
- idempotent address geocoding requests with normalized candidates, explicit no-match/failure states,
  operator confirmation or correction, rejection, audit, and provider-neutral contracts;
- audit records and `CUSTOMER_UPDATED`/template domain events in the same transaction as each mutation;
- closed-cycle and reversal policy enforced in the order domain engine.

## Dashboard slice

`/app/clientes` provides a permission-filtered customer directory and sensitive detail view. Staff can
search by the fields allowed by their session, create and update the customer core, add configurable
contact identities and addresses, inspect associated orders, and open location links. Address validation
starts an idempotent geocoding request and renders persisted candidates; staff must confirm a candidate or
enter corrected coordinates. A provider failure is shown as an operational state rather than losing the
written address.

The screen never infers city, sector, operational zone, contact type, provider, or currency. These values
come from API data or operator input, and mutation controls require the same sensitive-data permissions as
their endpoints.

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

## Geocoding baseline

`POST .../geocoding` persists a `PENDING` request before invoking the configured adapter. The current MVP
adapter only accepts a location URL that already contains coordinates. A provider result is validated,
deduplicated and limited to 20 candidates before persistence. Reusing the same idempotency key returns the
original request and never calls the adapter twice.

An operator must confirm a stored candidate or supply corrected coordinates. Confirmation updates the
address atomically, marks other unresolved requests for that address as `SUPERSEDED`, and never infers an
operational zone. Rejection and provider failure return the address to `NEEDS_LOCATION`; written address
and location URL are preserved. API DTOs omit provider error details and raw provider responses.

## Still OPEN / next slices

- external geocoding provider selection, secret/configuration UI, confidence policy, and operator map UI;
- configurable city/sector/operational-zone catalogs;
- duplicate suggestion plus previewed, reversible merge/unmerge;
- explicit revision restore workflow (revisions are readable now, but restoration remains a deliberate
  future mutation);
- Excel export (filtered pagination, status/revision history, and safe CSV are implemented);
- conversations/messages, idempotent inbound events, provider adapters, and outbound delivery receipts;
- template version history and actual send records;
- production and logistics state machines as separate aggregates.

The CRM/order baseline migrations are `0004_overrated_ezekiel.sql`, `0005_worthless_felicia_hardy.sql`,
and `0006_lean_black_knight.sql` under `packages/db/migrations`.
