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

### As built (fusión, sin reversa)

Construido en `packages/db/src/repositories/customer-merge.ts`, expuesto como
`GET /api/v1/customers/merge-candidates` (permiso `customers.merge`) y
`POST /api/v1/customers/merge` (`customers.merge` + `customers.view_sensitive`), con el diálogo
"Fusionar duplicados" en Clientes.

Qué cumple del flujo de arriba: elección explícita del sobreviviente por parte del operador (3), una
única transacción (4), re-chequeo de conflictos de identidad dentro de ella (5), movimiento o
reconciliación relación por relación (7), la ficha fusionada queda como lápida —`status = 'merged'`
más `merged_into_customer_id`— sin destruir historia (8), y auditoría `customer.merged` dentro de la
misma transacción (9).

Qué **no** está y hay que decirlo:

- **No hay preview** (paso 2). El diálogo muestra candidatos y nombres, no un diff de conflictos.
- **No hay linaje por relación** (paso 6). Se guarda a dónde fue la ficha, no de dónde vino cada
  pedido o domicilio, así que **unmerge no es reconstruible** con lo que hay hoy: haría falta una
  tabla de linaje escrita antes de mover referencias. `customers.unmerge` sigue en el catálogo de
  permisos sin endpoint detrás.
- **No se emite `CUSTOMER_MERGED`** como evento de dominio; por ahora sólo el registro de auditoría.

Dos decisiones que el documento no anticipaba, tomadas contra el esquema real:

- **Se rechaza** fusionar dos fichas que tengan cuenta de acceso (`customer_logins` es único en ambos
  lados): plegarlas obligaría a descartar una en silencio y alguien perdería el acceso sin enterarse.
  Cuál sobrevive no es una decisión del motor.
- **Los candidatos no se detectan por contacto activo compartido.** El índice único parcial sobre
  `(type, value_normalized) where active` vuelve ese estado inalcanzable, así que agrupar identidades
  activas no devolvería nada nunca. Las dos señales que sí ocurren son el mismo contacto con un lado
  desactivado, y el mismo nombre.

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
or Excel `.xlsx` file. Headers are recognized loosely (`contact-import.ts`, `FIELD_RULES`): case,
accents and punctuation are ignored, exact names are tried first and then partial ones, and the header
row is the first of the top 10 rows that has a name column (real sheets carry blank or title rows above).
Required: a name column ("Nombre", "Nombre y apellido", "Cliente", `nombre_completo`, or "Nombre" +
"Apellido", which are joined). Optional: "Celular"/"Móvil" (stored as phone **and** as an unverified
WhatsApp identity — in Argentina a mobile is the WhatsApp), "WhatsApp", "Teléfono", "Email"/"Mail",
"Dirección"/"Domicilio", "Barrio" (stored as `sector`, resolved to its `neighborhoods` row, and appended to the written address to help the
locator), "Localidad" (`city`), "Enlace"/"Link", "Forma de pago" and "Observaciones" (`internalNotes`).
A payment method written inside the address or the notes ("Mitre 400 transferencia", "… POR
TRANSFERENCIA") is stripped out and stored as "Forma de pago preferida: …" in the customer's internal
notes (`extractPayment`); there is no dedicated field for it yet. Blank rows are skipped. Addresses are
created in `NEEDS_LOCATION` state. Mobile and WhatsApp numbers are stored canonical
(`+549` + ten digits, `canonicalArgentinePhone`), like the ones that arrive with orders.

**Reconciliation (conciliador).** The import is two steps. `POST /api/v1/customers/import/preview`
parses the sheet and reconciles every row against existing customers
(`reconcileCustomerImport`) without writing anything: each row comes back as `new`, `existing`
(with the customer it matches and whether by WhatsApp, phone or email) or `repeated` (same contact
as an earlier row). Phones are compared by their ten-digit key (`argentinePhoneKey`), and against
**every active identity, archived customers included**: those still hold the number in the unique
index, which is what made a whole import fail with a bare "ya existe un registro" (2026-10-12).
`POST /api/v1/customers/import` re-runs the reconciliation, creates only the `new` rows and returns
the same per-row list with `imported`/`skipped`, which the dialog shows as the post-import check.
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

## Pedidos asociados con su composición (2026-10-16)

En la ficha del cliente, cada pedido asociado muestra, debajo de sus datos de siempre (número,
estado, fecha de entrega y total), lo que llevó: `2× Keto 400`, y en un Intuitivo los platos que
eligió. Además, el período del pedido y "Del stock" cuando salió del stock. El número abre el
detalle del pedido.

`getCustomer` trae para cada pedido `items` (variedad, tamaño, cantidad y platos elegidos),
`cycleAlias` y `source`, con dos consultas más para los cien pedidos de la ficha (ítems y platos),
no una por pedido.
