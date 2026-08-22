# CRM and Customer Identity Implementation

## Objective

Build the first operational domain on top of Auth/RBAC/Audit. `Customer` is the commercial record and does
not require login. `User` remains an authentication identity; linking the two is a later explicit flow.

## Scope

- Customer CRUD;
- external identities;
- addresses and geocoding state;
- preferences and commercial restrictions;
- duplicate suggestions;
- reversible merge/unmerge;
- audit and domain events;
- validated API contracts and minimal Staff UI.

Customer login, marketing automation, messaging history import, and delivery views are outside this slice.

## Data model

### Customer

- UUID internal ID;
- display name, first name, last name;
- configurable status;
- optional primary address reference;
- UTC timestamps.

### CustomerIdentity

- UUID, customer ID, type, normalized value;
- optional messaging account ID;
- verified, primary, and active flags;
- source/provenance timestamps.

An active normalized external identity cannot belong to two active customers. Identity types are data or
validated strings, not a business catalog embedded in authorization logic.

### CustomerAddress

- label and written address;
- city, sector, and operational zone references;
- property type, unit/apartment, and access notes;
- latitude/longitude;
- geocoding status and active flag;
- provenance and UTC timestamps.

Two customers may share an address. Address equality must not imply customer identity equality.

### Preference and restriction

- preferences grouped as dietary, delivery, or other;
- restrictions such as warning, debtor, or banned with reason, creator, timestamps, and active state;
- order-specific dietary instructions remain snapshots on the order and are not silently overwritten when
  CRM preferences change.

### CustomerMerge

Store source customer, target customer, actor, reason, timestamps, and enough lineage to restore moved
identities, orders, conversations, addresses, and other relationships.

## Normalization policy

Normalization occurs before repository uniqueness checks:

- phone: normalized international form when country context is known;
- email: trimmed and case-normalized according to the selected policy;
- names: whitespace cleanup for search, never used alone as an automatic merge key;
- address: preserve user-entered text alongside structured/geocoded fields.

Invalid phone numbers may be stored as unverified contact notes only if the final data model explicitly
supports it; they must not be imported as verified identities.

## Geocoding flow

```text
written address
  -> GeocodingProvider adapter
  -> candidate match(es)
  -> operator/customer confirmation or correction
  -> latitude/longitude + city + sector + status
```

If the provider cannot resolve a usable location, persist the address with `NEEDS_LOCATION`. Do not discard
the written address. Provider payloads stay behind the adapter and are not the source of truth.

## Initial API surface

- `GET /customers`
- `POST /customers`
- `GET /customers/:id`
- `PATCH /customers/:id`
- `POST /customers/:id/identities`
- `PATCH /customers/:id/identities/:identityId`
- `POST /customers/:id/addresses`
- `PATCH /customers/:id/addresses/:addressId`
- `POST /customers/:id/preferences`
- `POST /customers/:id/restrictions`
- `PATCH /customers/:id/restrictions/:restrictionId`
- `POST /customers/duplicate-suggestions`
- `POST /customers/:targetId/merge`
- `POST /customers/:id/unmerge`

List endpoints use cursor pagination and explicit filters. Search responses should return the minimum fields
needed to identify a customer. Sensitive fields require `customers.view_sensitive`.

## Domain services

### CustomerService

Creates and updates the core customer record, validates permission and status changes, emits events, and
records audit.

### CustomerIdentityService

Normalizes values, enforces active uniqueness, verifies provenance, changes primary identity atomically,
and resolves inbound identities without creating duplicates on retries.

### CustomerAddressService

Preserves written input, invokes `GeocodingProvider`, manages primary address atomically, and records
location status without assuming city or zone.

### CustomerRestrictionService

Requires `customers.restrict`, stores a reason and actor, and prevents restriction details from leaking to
customers or delivery endpoints.

### CustomerMergeService

Provides preview, explicit confirmation, transactional merge, audit, and reversible lineage. It must reject
ambiguous or unsafe automatic merges.

## Merge/unmerge workflow

1. Load source and target with required relations.
2. Generate a preview of field conflicts and relationships to move.
3. Require `customers.merge` and explicit confirmation.
4. Lock both records in a deterministic order.
5. Re-check identity conflicts inside the transaction.
6. Persist lineage before moving references.
7. Move or reconcile approved relationships.
8. Mark the source inactive/merged without destroying history.
9. Write audit and `CUSTOMER_MERGED` event in the transaction.

Unmerge requires `customers.unmerge`, reconstructs relationships from stored lineage, reports conflicts
created after the merge, and never overwrites newer data silently.

## Audit and events

Required domain events:

- `CUSTOMER_CREATED`;
- `CUSTOMER_UPDATED`;
- `CUSTOMER_MERGED`;
- `CUSTOMER_UNMERGED`.

Identity, address, preference, and restriction changes are audit-relevant even when represented as a
customer update event. Do not include more PII in event payloads than consumers require.

## Staff UI slice

- searchable customer list with filters and pagination;
- customer detail with overview, identities, addresses, preferences, restrictions, orders placeholder, and
  audit timeline;
- create/edit forms with server-side validation messages;
- geocoding candidate confirmation;
- merge preview and high-friction confirmation;
- clear sensitive-data visibility based on permissions.

### Spreadsheet contact import

Staff members with `customers.create` may import up to 500 contacts from the first sheet of a CSV UTF-8
or Excel `.xlsx` file. Required column: `nombre_completo`. Optional columns are `whatsapp`, `telefono`,
`email`, `direccion`, and `enlace_ubicacion`; the latter two create an address in `NEEDS_LOCATION` state.
The API parses and validates the file server-side, then creates all customer records, identities, addresses,
audits, and events in one database transaction. A malformed row or a duplicate active identity rolls the
whole import back; no partial upload is retained.

Zustand may store filters and local drafts, not the authoritative customer cache.

## Test matrix

### Unit

- identity normalization;
- active identity uniqueness;
- primary identity/address changes;
- geocoding success, ambiguous result, and failure;
- restriction activation/deactivation;
- merge preview, merge, unmerge, and post-merge conflict handling.

### Integration/API

- CRUD persistence and transactions;
- permission deny for each mutation group;
- Zod rejection of malformed UUIDs and payloads;
- duplicate concurrent identity creation;
- mutation plus audit/event atomicity;
- cursor pagination stability;
- geocoding adapter mocked;
- merge/unmerge preserves relationship lineage.

### Security/privacy

- IDOR between unauthorized operational scopes;
- `customers.view_sensitive` field filtering;
- restriction details absent from public/delivery DTOs;
- no contact details in delivery-shaped responses;
- no full PII in logs or error details.

## Acceptance criteria

- PostgreSQL remains the sole source of truth;
- all inputs are validated by shared Zod contracts;
- identities use normalized partial uniqueness for active ownership;
- geocoding is replaceable through an adapter;
- merge is previewed, confirmed, audited, transactional, and reversible;
- no automatic merge occurs by name alone;
- sensitive response fields are permission-aware at DTO level;
- domain/API/security tests and `pnpm check` pass.

## OPEN decisions

- exact customer status catalog;
- phone country/default normalization context;
- city, sector, and operational-zone catalog;
- geocoding provider and confidence threshold;
- which preferences copy into a new order by default;
- restriction catalog versus free-form reasons;
- conflict policy for unmerge after later edits;
- final Customer-to-User linking method.
