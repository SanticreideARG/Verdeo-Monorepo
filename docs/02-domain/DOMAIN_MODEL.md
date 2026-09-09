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

### Baja de cliente

Un cliente **sin pedidos** se borra de verdad: es el caso del duplicado, la prueba o el contacto
cargado dos veces, y archivarlo sólo ensucia la lista para siempre. Sus identidades, domicilios,
preferencias y restricciones se van con él por cascada; una conversación queda huérfana y no
borrada, porque el mensaje existió.

Un cliente **con pedidos** se archiva (`status = archived`). La clave foránea de `orders` es
`restrict` justamente para que esto no sea una decisión: borrarlo destruiría el historial de venta,
la facturación y la trazabilidad de la auditoría. Se puede reactivar cambiándole el estado.

Los dos casos quedan auditados, y en el borrado el registro se escribe antes de borrar la fila: si
no, no quedaría quién dice qué se borró ni con qué nombre.

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
