# Orders & Sales Cycles

## Orígenes

- web
- whatsapp
- instagram
- facebook
- email
- phone
- manual
- opportunity_sale

Un pedido puede involucrar más de un canal durante su negociación. Guardar origen inicial y/o eventos de canal sin forzar una única explicación.

## Pedido web

Guest checkout permitido. No obligar a crear cuenta.

Pasos:

1. seleccionar variedad/tamaño;
2. Intuitivo: seleccionar cinco platos;
3. cantidad;
4. datos cliente;
5. dirección/geocoding;
6. disponibilidad;
7. pago esperado;
8. resumen;
9. confirmar.

## Draft

Conversaciones incompletas generan `DRAFT`.
Debe existir cola/listado de drafts para seguimiento.

## Confirmación

No se requiere una segunda confirmación después de enviar el resumen. El mensaje post-confirmación debe poder incluir automáticamente:

- nombre;
- número de pedido;
- detalle;
- cantidad;
- precio;
- día de entrega;
- consulta/confirmación de disponibilidad.

## Edición

Pedidos editables por conveniencia operativa. Toda modificación queda en log.

## Cancelación

Permitida por operador salvo pedido entregado.
Motivos sugeridos + `Otros` + texto opcional.

## Reprogramación

Permitida. Método de pago puede modificarse en cualquier momento. Dirección/fecha se consideran bloqueables al publicar hoja de ruta, salvo override autorizado.

## Public number

Secuencia global legible:
`N00453`

No reiniciar por semana.
