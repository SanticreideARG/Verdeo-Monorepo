# Estados simplificados (2026-11-09)

Pedido: dejar de seguir los pedidos listos o en proceso, y que las hojas de ruta no queden inamovibles.

## Pedidos

- Borrador → Confirmado → Entregado. Cancelado no cambia. Revertir un Entregado lo devuelve a Confirmado, con motivo.
- Migración `0081_sin_estado_listo`: los pedidos en Listo pasan a Confirmado y queda anotado en su historial.
- `READY` sigue en el tipo y en los filtros de lectura: el historial viejo lo nombra, y un pedido que haya quedado en Listo entre el despliegue y la migración no se pierde. Ningún camino nuevo lleva a Listo.
- Sale "Marcar listos" por zona, con `POST /orders/ready-batch`. Un pedido suelto se marca entregado desde el menú o desde su detalle.

## Hojas de ruta

- Un solo estado a la vista. La columna `status` no cambia y no hay migración: `draft` y `published` se tratan igual.
- Toda hoja se edita, se borra y da su enlace desde que se crea. Es orden interno, no un documento: borrarla no toca los pedidos.
- Sin botón "Guardar cambios": cada cambio ya se guarda en el momento (definido con el usuario).
- El reparto pasa a "en la calle" al generar el enlace, que es lo que antes hacía publicar.
- `publishRoute` y su endpoint quedan sin uso desde la pantalla.
