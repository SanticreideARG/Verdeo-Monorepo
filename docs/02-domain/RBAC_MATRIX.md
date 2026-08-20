# RBAC y matriz de privilegios

## Principio

Los roles son conjuntos de permisos. Un usuario puede tener varios roles y overrides individuales `allow/deny`.

No usar `if role === ...` como autorización.

## Permisos iniciales

### Usuarios

- `users.read`
- `users.create`
- `users.edit`
- `users.disable`
- `roles.read`
- `roles.manage`
- `permissions.override`

### Clientes

- `customers.read`
- `customers.create`
- `customers.edit`
- `customers.merge`
- `customers.unmerge`
- `customers.restrict`
- `customers.view_sensitive`

### Operaciones y zonas

- `sites.read`
- `sites.manage`
- `zones.manage`

### Pedidos

- `orders.read`
- `orders.create`
- `orders.edit`
- `orders.confirm`
- `orders.cancel`
- `orders.revert_status`
- `orders.override_cycle_lock`

### Mensajería

- `messages.read`
- `messages.send`
- `messages.templates.use`
- `messages.templates.manage`
- `messaging.accounts.manage`

### Producción

- `production.read`
- `production.generate`
- `production.report`
- `production.adjust_surplus`

### Rutas/reparto

- `routes.read`
- `routes.manage`
- `routes.publish`
- `delivery.execute`
- `delivery.trigger_messages`

### Pagos

- `payments.read`
- `payments.record`
- `payments.settle`
- `payments.override`

### CMS

- `cms.read`
- `cms.edit`
- `cms.publish`

### IA

- `ai.use`
- `ai.custom_instruction`
- `ai.prompts.manage`
- `ai.providers.manage`
- `ai.budgets.manage`
- `ai.models.select`
- `ai.images.generate`

### Auditoría

- `audit.read`
- `audit.export`

## Roles por defecto

### superadmin

Todos los permisos.

### operador

CRM, pedidos, mensajes, producción, rutas, pagos y contenido según configuración. Puede recibir gestión de usuarios.

### repartidor

Sólo su operación de delivery, cobro y triggers permitidos.

### cliente

Sólo su perfil/pedidos públicos autenticados.

### cocina

Reservado. Inicialmente sin cuenta.
