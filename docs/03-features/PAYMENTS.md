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
