# Payments & Cash Settlement

## Estados

- `PENDING`
- `TO_SETTLE`
- `PAID`

`TO_SETTLE`: efectivo ya cobrado por repartidor y aún no rendido.

## Modelo

No usar un único campo mutable para representar toda la historia.

### Payment

Transacción/registro de pago.

### CashCollection

- orderId
- amount
- collectedBy
- collectedAt

### CashSettlement

- collectionId
- amount
- settledBy
- receivedBy
- settledAt

## Método esperado vs real

Guardar:

- método solicitado/esperado;
- transacciones reales.

El cliente puede cambiar método en cualquier momento según operación.

## Dashboard

- pendiente total;
- pagado;
- a rendir;
- efectivo por repartidor;
- rendiciones del día/ciclo.

## Futuro Mercado Pago

Integración por adapter/webhook. No marcar pago por texto del cliente; conciliar con evidencia/proveedor o confirmación autorizada.

## As built (Fase 8 — esqueleto)

Tablas `payments`, `cash_collections`, `cash_settlements` (migración 0020, additiva). Servicio
`PostgresPaymentsService`.

- **`payments.status` es un resumen derivado, nunca la fuente**: `cash_collections`/
  `cash_settlements` son las filas de transacción real de las que ese estado se calcula; una
  rendición referencia una cobranza en vez de reescribirla, así que el historial sobrevive aunque
  el pedido ya esté `PAID`.
- **`recordCollection` clasifica por método**: efectivo pasa a `TO_SETTLE` (hay plata en mano que
  rendir); cualquier otro método (transferencia, un cobro de Mercado Pago confirmado a mano hoy) va
  directo a `PAID`, porque no hay paso de efectivo-en-mano que rendir.
- **`settleCollection` recién marca `PAID`** cuando no queda ninguna cobranza sin rendir para ese
  pedido — soporta correctamente varias cobranzas parciales si algún día existen, aunque en la
  práctica hoy casi siempre es una por pedido.
- Dashboard con los cinco números de la sección anterior en `/api/v1/payments/dashboard`; pantalla
  en `/app/pagos`.

**Diferido**: adapter de Mercado Pago (webhook + conciliación), UI para rendiciones/liquidaciones
parciales más allá de la rendición 1:1 de una cobranza.

## Dado de baja: la sección Pagos se reemplazó por un tilde

Todo lo de arriba se construyó y **nunca se usó**: al darlo de baja, `payments`, `cash_collections`,
`cash_settlements` y `transfer_reconciliations` tenían cero filas en producción. Tres estados,
rendiciones de repartidor y conciliación de transferencias para una operación que sólo necesitaba
saber si un pedido está cobrado.

En su lugar, la lista de pedidos tiene una columna **Cobrado** con un tilde
(`POST /api/v1/orders/:id/paid`, permiso `orders.edit`). Se guarda `orders.paid_at` y
`orders.paid_by_user_id`, y queda auditado como `order.marked_paid` / `order.marked_unpaid`: es una
afirmación sobre plata, y destildar tiene que poder rastrearse igual que tildar.

Lo que **sí** sobrevive: el catálogo de métodos de pago (Ajustes → Métodos de pago) alimenta el "Pago
esperado" de cada pedido. Qué se espera cobrar y si se cobró son dos cosas distintas.

Las tablas no se borraron. Están vacías y sin uso, pero eliminarlas es una migración destructiva sin
nada que ganar; si mañana hace falta una contabilidad de verdad, el modelo de arriba sigue descrito
acá y las tablas siguen ahí.
