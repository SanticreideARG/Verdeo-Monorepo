# Domain Model

## Auth / RBAC

- `User`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `UserPermissionOverride`
- `Session`

## CRM

### Customer

Entidad comercial interna con UUID.

Campos conceptuales:

- id
- public/display name
- firstName
- lastName
- status
- primaryAddressId
- createdAt/updatedAt

### CustomerIdentity

Identidad externa:

- customerId
- type: whatsapp/email/instagram/facebook
- value
- messagingAccountId opcional
- verified
- primary
- active

Un identificador externo no puede pertenecer simultáneamente a dos clientes activos.

### CustomerAddress

- customerId
- label
- streetAddress
- city
- sector
- propertyType
- unit/apartment
- accessNotes
- latitude
- longitude
- geocodingStatus
- active

Dos clientes distintos pueden compartir domicilio.

### CustomerPreference

Preferencias persistentes:

- dietary
- delivery
- other

### CustomerRestriction

- warning
- debtor
- banned

Con reason, createdBy, timestamps, active.

### CustomerMerge

Merge/unmerge auditable. Debe conservar procedencia de identidades, pedidos y conversaciones para poder revertir.

## Catálogo

### ProductFamily

Configurable. Inicial:

- Real
- Keto
- Anti-Age
- Detox
- Intuitivo

No hardcodear enum.

### ProductVariant

- productFamilyId
- code/displayName: `250` / `400`
- mealsPerUnit: 5
- active

Todos los 250 comparten inicialmente precio; todos los 400 comparten otro, pero el modelo debe permitir precios más flexibles.

### WeeklyMenu

- salesCycleId
- status draft/published
- publishedAt
- revision

### WeeklyMenuItem

Nombre del plato por ahora. Un plato puede aparecer en varias variedades.

### WeeklyMenuComposition

Asocia cinco platos a cada variedad base semanal.

### IntuitiveComposition

Por `OrderItem`. Cinco slots; puede repetir platos. Intuitivo 250 sólo usa platos 250 y 400 sólo 400.

Cualquier modificación a la composición base transforma comercialmente el pedido en Intuitivo.

### PriceList / Price

Preparar arquitectura para listas de precios futuras aunque V1 use una sola.

## Orders

### SalesCycle

- UUID
- alias visible
- openAt
- partialKitchenCutoffAt
- closeAt
- status

### Order

- UUID
- publicNumber global, ej. `N00453`
- customerId
- salesCycleId
- status
- source
- operationalZoneId
- deliveryDate
- paymentExpectation
- timestamps

### OrderItem

Snapshot obligatorio:

- productVariantId
- productNameSnapshot
- variantSnapshot
- quantityUnits
- unitPrice
- discount
- surcharge
- total

Una unidad = cinco comidas. No hay máximo de unidades.

### OrderDietaryInstruction

Puede copiar preferencias del cliente o ser específica del pedido.

### OrderStatusHistory

Toda transición.

### OrderChangeReason

Para cancelación/reprogramación: catálogo sugerido + `other` + texto opcional.

## Payments

- `Payment`
- `CashCollection`
- `CashSettlement`

Separar método esperado de transacciones reales.

## Production

- `KitchenBatch`
- `KitchenSnapshot`
- `ProductionRequirement`
- `ProductionAdjustment`
- `ProductionReport`
- `ProductionSurplus`

## Logistics

- `Delivery`
- `DeliveryRoute`
- `DeliveryRouteStop`
- `DeliveryWindow`
- `DeliveryAttempt` (preparado aunque V1 sea simple)
- `GeographicZone`

## Messaging

- `MessagingAccount`
- `Conversation`
- `ConversationParticipant`
- `Message`
- `MessageDelivery`
- `MessageTemplate`
- `MarketingConsent`

## CMS

- `Page`
- `PageSection`
- `PageRevision`
- `SiteSetting`
- `MediaAsset`

## AI

- `AIProviderConfig`
- `AIModelConfig`
- `AITask`
- `AIPrompt`
- `AIPromptVersion`
- `AIExecution`
- `AIBudget`
- `AIUsage`
- `BrandProfile`

## Audit

- `AuditEvent`
- actor
- action
- entityType/entityId
- before/after o diff
- request/correlation ID
- source
- timestamp
