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
7. medio de pago;
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

## Exportar la lista de pedidos

Una sola ruta, `GET /api/v1/orders/export`, con los mismos filtros que la pantalla (`cycleId`,
`status`, `search`, `zone`, `from`, `to`, `customerId`) y dos presentaciones:

- **`format=csv`** (por defecto): para meter los pedidos en otra herramienta. Una fila por pedido,
  BOM para que Excel abra bien los acentos, y toda celda de texto que empieza con `=`, `+`, `-` o
  `@` va precedida de un apóstrofo — un número de WhatsApp con `+` es una fórmula para una planilla.
- **`format=xlsx`**: el formulario consolidado, para abrirlo, mirarlo y reenviarlo. Tres hojas, cada
  una con la semana en el título porque el nombre del archivo se pierde apenas alguien lo reenvía:
  _Pedidos_ (la lista tal como se ve, con la composición de cada Intuitivo apilada dentro de la
  celda y el total en pesos, no en centavos, para que la columna se pueda sumar), _Conciliado_
  (cuántas unidades y cuántos pedidos de cada menú y tamaño, sin los cancelados, que no se producen)
  y _Por zona_ (paradas, unidades y plata por zona). `xlsx` 0.18 descarta estilos de celda y paneles
  fijos al escribir; sobreviven los anchos de columna y el autofiltro.

**`maskSurnames=1`** deja el nombre de pila y reduce el resto a iniciales ("Ana Isabella Vega" →
"Ana I. V."). Las dos pantallas de pedidos tienen el tilde "Ocultar apellidos", que vale tanto para
lo que se muestra como para lo que se exporta: una planilla se reenvía todavía más fácil que una
pantalla, y el nombre de pila alcanza para saber de quién es cada vianda. Se dejan las iniciales, y
no se borran, para que dos "Ana" sigan siendo dos personas distinguibles.

Las columnas de las dos pantallas —"Ver pedidos" y "Tomar y confirmar"— salen del mismo catálogo
(`apps/web/src/lib/orderColumns.tsx`) y todas ordenan al tocar su encabezado. `sortValue` devuelve
el dato y no lo que se ve: "Total" compara números y no `$ 1.000` contra `$ 900` como texto, y
"Estado" ordena por el orden en que se trabaja un pedido (borrador, confirmado, listo, entregado,
cancelado) y no alfabéticamente.
