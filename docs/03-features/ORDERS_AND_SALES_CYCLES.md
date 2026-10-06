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

## Varias variedades en un pedido

El contrato acepta `items` como lista desde siempre: un pedido con dos viandas distintas nunca
estuvo limitado del lado del servidor. Lo que mandaba una sola era el formulario.

El carrito es deliberadamente discreto. El pedido de una variedad —que son casi todos— sigue
siendo elegir y guardar, sin un paso nuevo: **lo que quedó elegido arriba entra solo como un
renglón más al guardar**. "Agregar otra variedad" suma lo elegido a la lista y limpia los
selectores, para que no quede contado dos veces. Quien nunca pide dos variedades no ve el carrito.

Un Intuitivo a medio elegir **no se descarta en silencio**: se corta con un mensaje. Quien eligió
tres platos de cinco cree que los cargó, y el pedido saldría sin esa vianda.

La misma variedad puede ir en dos renglones. No es un duplicado a fusionar: dos Intuitivos del
mismo tamaño con composiciones distintas son dos renglones legítimos del mismo pedido.

Las reglas viven en `apps/web/src/lib/orderCart.ts`, no dentro de la pantalla, por la misma razón
que `menuPayload`: son cosas que se rompen sin hacer ruido y adentro de un componente no hay forma
de probarlas.

El carrito se guarda con `usePersistedState` (sessionStorage), que es lo que usa el armador de
menús para sus arreglos de variedades. `useFormDraft` no sirve acá: fotografía el DOM del
formulario, y una lista que crece y se achica no tiene un input detrás.

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

## Eliminar, que no es cancelar

Cancelar deja el pedido a la vista con estado `CANCELLED` y su motivo, que es lo correcto para una
venta que existió y no se concretó: el historial tiene que poder explicarla. **Eliminar es otra
cosa**: es para lo que nunca fue una venta —las pruebas que quedaron de antes de abrir— y saca la
fila. No hay estado nuevo ni papelera.

`DELETE /api/v1/orders/:id` pide `orders.delete`, un permiso que **no viene con ningún rol**, ni
siquiera con el de operador: se concede a mano a quien lo necesite, y quitarlo apaga la
funcionalidad sin tocar código. El cuerpo lleva un `reason` obligatorio.

Borra en el orden que las claves foráneas `restrict` imponen —rendiciones, cobros, conciliaciones,
parada de reparto, avisos manuales y recién ahí el pedido—, acotado a ese pedido. Lo que cuelga
por `cascade` (ítems, platos elegidos, indicaciones, historial de estados, revisiones, pagos) se va
solo. Es el mismo orden que `wipe-operations.ts`, por el mismo motivo: con otro, Postgres tumba la
transacción sin borrar nada.

**Se borra aunque tenga plata cobrada.** Quien lo pide es dueño de ese dato y la pantalla se lo
dice antes de confirmar; lo que no se hace es borrarlo en silencio.

Lo único que queda es el evento de auditoría `order.deleted`, y por eso lleva una **foto** en el
cuerpo —número público, cliente, estado, fecha de entrega, total y cuánto se había cobrado— en
lugar de sólo el `entityId`. Después del borrado no hay fila a la que apuntar: un evento que sólo
dijera "se borró el pedido tal id" no respondería la única pregunta que alguien va a hacer, que es
cuál era.

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

## Importar pedidos desde una planilla

Un segundo origen de pedidos, al lado del formulario y del pedido web: la planilla que alguien ya
armó por fuera del sistema. Es intencionalmente de dos pasos.

**Paso 1 — `POST /api/v1/orders/import/preview`.** Recibe el archivo (CSV o `.xlsx`, hasta 5 MB y
500 filas) y no escribe nada. El parser (`apps/api/src/integrations/order-import.ts`) acepta varias
formas de nombrar cada columna —«Cliente» o «Nombre», «Teléfono» o «WhatsApp», «Tamaño» o
«Tamano»— porque la planilla la arma una persona y no un sistema. Sólo `cliente` es obligatorio;
`cantidad` sin columna vale 1. Una fila sin nombre o con una cantidad imposible se saltea y las
demás entran: una fila mal cargada no puede voltear el archivo entero. El número de fila que se
informa es el que se ve en Excel, encabezado incluido, para que «revisá la fila 4» mande a corregir
la fila correcta.

Después el servicio (`previewOrderImport`) resuelve, fila por fila, con qué cliente de la base
coincide y qué oferta del menú publicado corresponde a esa variedad y tamaño. El matcheo de cliente
va de lo más fuerte a lo más débil: teléfono normalizado, nombre exacto sin tildes ni mayúsculas, y
si no hubo nada, los nombres parecidos como candidatos. **Un nombre parecido nunca se da por bueno
solo.** Importar a ciegas crea clientes duplicados: la misma persona escrita «Ana Vega» en la
planilla y «Ana Isabel Vega» en la base queda como dos registros, y el día que hay que llamarla
nadie sabe cuál mirar; unir dos clientes es lo único de todo esto que no tiene vuelta atrás.

**Paso 2 — `POST /api/v1/orders/import`.** Recibe las filas ya resueltas por una persona, con el
`customerId` elegido o `null` para crear el cliente con el nombre y el teléfono de la planilla. Los
pedidos entran como **borradores**, igual que los que llegan por la web: una planilla es un dato de
afuera y alguien tiene que confirmarlos. Una fila que falla no frena a las demás — la respuesta
trae `created` y un `failed` con el número de fila y el motivo, porque rechazar las cien por una es
hacer repetir todo el trabajo.

Las filas cuya variedad y tamaño no están en el menú publicado de la ciudad quedan afuera, a la
vista y atenuadas: se ve cuántas son y por qué, pero no se puede decidir nada sobre ellas hasta
corregir el menú o la planilla. Las dos rutas piden `orders.create`.
