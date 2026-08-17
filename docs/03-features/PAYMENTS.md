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
