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

### General

- `calendar.use`
- `backups.manage`
- `settings.access` — entrar al Panel de control (ver "El Panel de control", abajo).

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
armar y publicar rutas, registrar y conciliar cobros, encuestas, calendario, chat interno y el
redactado con IA del catálogo V1.

Queda afuera a propósito: usuarios, roles y excepciones; crear ciudades y zonas; borrar, fusionar o
restringir un cliente y ver sus datos sensibles; revertir un estado o forzar un ciclo cerrado; editar
y publicar el landing; la auditoría; los respaldos; los artículos de ayuda; proveedores,
presupuestos y prompts de IA; reemplazar un menú ya distribuido; ajustar excedentes; y forzar un
cobro.

### El Panel de control (auditoría del 2026-10-15)

La configuración general es **sólo de quien administra**. Entrar al panel pide `settings.access`,
que el operador no trae; además, cada sección sigue pidiendo su propio permiso.

Hacía falta una llave aparte porque varios permisos de sección los tiene el operador para trabajar
(`sites.read` para elegir zona en un pedido, `payments.read` para registrar un cobro,
`production.read` para cocina), y con ellos entraba al panel y veía zonas, días de reparto, menú,
métodos de pago y direcciones. No podía cambiar nada —la API pide para guardar permisos que el
operador no tiene—, pero la configuración no es de su trabajo.

La puerta está en un solo lugar: `SettingsGate` envuelve cada ruta del panel en `App.tsx` (sin la
llave, vuelve al inicio) y la entrada del menú lateral pide la misma llave. Un test
(`settingsLayout.test.ts`) falla si una sección del submenú queda sin puerta. La API no cambia: el
operador sigue leyendo zonas, días y métodos de pago desde las pantallas donde los usa.

| Sección del panel   | Para entrar                 | Para cambiar (API)             | Operador                                  |
| ------------------- | --------------------------- | ------------------------------ | ----------------------------------------- |
| Zonas geográficas   | `sites.read`                | `sites.manage`, `zones.manage` | no                                        |
| Días de reparto     | `sites.read`                | `sites.manage`                 | no                                        |
| Menú personalizado  | `production.read`           | `production.generate`          | no                                        |
| Métodos de pago     | `payments.read`             | `payments.override`            | no                                        |
| Usuarios            | `users.read`                | `users.*`, `roles.manage`      | no                                        |
| Correo (Resend)     | `ai.providers.manage`       | `ai.providers.manage`          | no                                        |
| Cuentas de WhatsApp | `messaging.accounts.manage` | ídem                           | no                                        |
| Mensajes guardados  | `messages.templates.manage` | ídem                           | no (los usa con `messages.templates.use`) |
| Enlaces de chat     | `chat.links.manage`         | ídem                           | no                                        |
| IA y plantillas     | `ai.providers.manage`       | ídem                           | no                                        |
| Contenidos          | `cms.read`                  | `cms.edit`, `cms.publish`      | no                                        |
| Asistente de la web | `cms.read`                  | `cms.edit`, `cms.publish`      | no                                        |
| Auditoría           | `audit.read`                | —                              | no                                        |
| Estado del sistema  | `audit.read`                | —                              | no                                        |
| Direcciones         | `sites.read`                | `sites.manage`                 | no                                        |
| Respaldos           | `backups.manage`            | ídem                           | no                                        |
| Apariencia          | —                           | la propia                      | **sí** (también desde la barra)           |

Todas esas secciones requieren además `settings.access`. Fuera del panel, el operador conserva
Pedidos, Clientes, Periodos, Cocina, Etiquetas, Rutas y repartos, Mensajes, Avisos, Encuestas,
Calendario y chat. Las **estadísticas de ventas** (`stats.read`) son sólo del superadmin
(decisión del 2026-10-15); los cobros (`payments.record`, `payments.settle`) siguen en el operador. Workbench de IA (`ai.prompts.manage`) es del administrador.

Para dársela a alguien que no es superadmin: una excepción `allow` de `settings.access` desde
Usuarios. En una base en uso, el permiso aparece y se le concede al superadmin con
`pnpm db:seed-permissions --produccion`.

### repartidor

Eliminado (septiembre de 2026). El reparto no se gestiona con cuentas: quien reparte abre el enlace
de la ruta del día (`/reparto/:token`), que vence, no es un usuario del sistema y no da acceso al
panel. Lo que ese enlace puede hacer está fijado por el contrato de la hoja, no por permisos.

### cliente

Sólo su perfil/pedidos públicos autenticados.

### cocina

Eliminado (septiembre de 2026). Cocina recibe información exportada; no entra al panel.
