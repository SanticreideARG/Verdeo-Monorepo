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
- `customers.delete`
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

La lista exacta de cada rol es data, en `packages/db/src/role-defaults.ts`, y la aplica
`pnpm db:seed-permissions` —que concede lo que falta y nunca quita, porque un permiso dado a mano
desde la pantalla de roles es una decisión de la operación—. Lo de abajo describe el criterio; lo
que manda es ese archivo.

### operador

Quien atiende la semana: clientes (leer, crear, editar), pedidos (leer, crear, editar, confirmar,
cancelar), mensajes y plantillas, lo que cocina tiene que producir y su informe, distribuir el menú,
armar y publicar rutas, registrar y conciliar cobros, estadísticas, calendario, chat interno y el
redactado con IA del catálogo V1.

Queda afuera a propósito: usuarios, roles y excepciones; crear ciudades y zonas; borrar, fusionar o
restringir un cliente y ver sus datos sensibles; revertir un estado o forzar un ciclo cerrado; editar
y publicar el landing; la auditoría; los respaldos; los artículos de ayuda; proveedores,
presupuestos y prompts de IA; reemplazar un menú ya distribuido; ajustar excedentes; y forzar un
cobro.

### repartidor

Sus propias paradas y los mensajes de entrega. Nunca `routes.manage`/`routes.publish` —no se
reasigna paradas— ni nada de `payments.*`: en la app de reparto ve si el pedido está pagado o
cuánto cobrar, y con eso alcanza. Tampoco `customers.read`.

### cliente

Sólo su perfil/pedidos públicos autenticados.

### cocina

Eliminado (septiembre de 2026). Cocina recibe información exportada; no entra al panel.
