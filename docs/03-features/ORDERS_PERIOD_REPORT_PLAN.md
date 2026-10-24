# Informe de pedidos del período, en columnas largas — plan

Pedido del usuario (2026-10-23): un informe de los pedidos del período "en columnas largas", lo más
parecido posible al que hoy se arma a mano en Excel, pero mejorado. Estado: **hecho** (2026-10-23), con las respuestas del usuario.

## Cómo es el informe actual

Analizado sobre una planilla real de una ciudad (sólo la estructura; ningún dato de clientes entra
al repositorio). Un libro por ciudad, y por cada semana tres hojas:

| Hoja                   | Qué es                                     | En Verdeo                        |
| ---------------------- | ------------------------------------------ | -------------------------------- |
| "OCTUBRE n"            | Los pedidos, en columnas largas            | **Lo que hay que hacer**         |
| "OCTUBRE n REPARTO"    | Lo mismo, con una sola columna de variedad | Variante de la anterior          |
| "octubre n produccion" | Lo que hay que cocinar, por variedad y día | Ya está: hoja "Pedido" de Cocina |

La hoja de pedidos:

- **Arriba**, el día ("LUNES 24 de …") y una barra con la hora de carga ("9:15 cargar").
- **Encabezado** gris: horario · (columna sin título) · ZONA · Dirección · Nombre · Pedido · cinco
  columnas, una por día (lunes a viernes) · Venta · Celular · notas.
- **Un renglón por vianda**: un pedido de tres viandas son tres renglones con los mismos datos.
  La venta va sólo en el primero.
- **Pedido** es el tamaño (400 / 250). Las **cinco columnas de días** dicen la variedad de cada
  comida ("keto", "vegetariano"…); una vianda de tres comidas deja dos vacías. En la hoja de reparto,
  en lugar de las cinco va una sola, con la variedad o, en un Intuitivo, el nombre del cliente.
- **Secciones por día de entrega**: una barra negra ("MARTES") separa un día del siguiente. Dentro
  del día, en el orden del recorrido.
- **Colores a mano**: nombres en naranja, ventas en verde o en rojo, horarios en amarillo.
- **A la derecha**, un resumen: cuántas viandas de cada variedad y tamaño ("KETO 400 · 7"), los
  Intuitivos uno por cliente, y el TOTAL.
- Lo que hoy se escribe a mano adentro de otras celdas: el medio de pago dentro de la dirección
  ("… transferencia"), una segunda franja o una duración en la columna sin título ("10 a 12",
  "40m", "1h"), notas sueltas ("otro cel", "10 a favor").

## El nuestro

Una hoja nueva, **"Pedidos del período"**, en el mismo libro que ya sale de Pedidos (que hoy tiene
la lista, el resumen por producto y por zona). Mismo esqueleto que el actual, con los datos que el
sistema ya tiene en su lugar:

| Columna       | Sale de                                              | Mejora sobre el actual                  |
| ------------- | ---------------------------------------------------- | --------------------------------------- |
| Horario       | Franja horaria del pedido                            | —                                       |
| Zona          | Zona del pedido                                      | —                                       |
| Dirección     | Domicilio, en dos renglones (calle / detalle)        | Sin el medio de pago mezclado           |
| Nombre        | Cliente                                              | En naranja si es **NUEVO**, solo        |
| Pedido        | Tamaño                                               | —                                       |
| Lun … Vie     | Variedad de cada comida; en un Intuitivo, sus platos | Los platos del Intuitivo, a la vista    |
| Venta         | Total del pedido, en el primer renglón               | Verde si está cobrado, rojo si no, solo |
| Medio de pago | Efectivo / transferencia                             | Columna propia                          |
| Celular       | WhatsApp del cliente                                 | —                                       |
| Notas         | Indicaciones alimentarias y notas del pedido         | —                                       |
| N°            | Número de pedido                                     | Para encontrarlo en el sistema          |

- **Un renglón por vianda**, como ahora; los renglones que repiten el pedido van con el texto en
  gris, para que se vea dónde empieza cada uno.
- **Secciones por día de entrega** con la barra negra del día, y dentro del día en el orden de la
  ruta publicada (si no hay ruta, por franja y zona).
- **Resumen a la derecha**, como ahora, en la jerarquía de productos (PRODUCT_ORDER.md): variedad y
  tamaño, Intuitivos por cliente, TOTAL. Con fórmulas (CONTAR.SI.CONJUNTO), así una corrección a mano
  en la planilla se refleja en el resumen.
- **Total por día** al pie de cada sección (viandas y venta).
- Encabezado fijo al desplazar, filtros en el encabezado, y la hoja lista para imprimir (A4
  apaisada, al ancho de la página).
- Filtros del sistema: el período, y opcionalmente una zona o un reparto.

Lo que **no** se copia: la hora de carga escrita a mano ("9:15 cargar") y la columna sin título,
hasta saber qué es (ver preguntas).

## Preguntas para cerrar el plan

1. La columna sin título (B): "10 a 12", "1.02", "25min", "1h"… ¿qué es? ¿La franja que se le
   confirma al cliente, o el tiempo estimado del recorrido?
2. Los colores: ¿naranja en el nombre es cliente nuevo? ¿Verde/rojo en la venta es cobrado/debe?
   ¿Amarillo en el horario es un horario estricto?
3. Las cinco columnas de días: en el sistema todas las comidas de una vianda fija son de la misma
   variedad. ¿Se mantienen las cinco (como ahora) o alcanza con una columna de variedad (como la hoja
   de reparto) y las cinco sólo para los platos del Intuitivo?
4. ¿Hace falta también la versión "REPARTO" como hoja aparte, o con la nuestra alcanza?
5. La hora de carga del día: ¿se quiere en el informe? Se podría tomar de la ruta publicada.

## Fases (una vez confirmadas las preguntas)

1. Datos: el período con sus pedidos, viandas, franja, ruta y cobro, en `@verdeo/orders` (puro, con
   tests).
2. La hoja en `orders-excel.ts` con `xlsx-js-style` (colores, barras, fórmulas, impresión).
3. Botón en Pedidos ("Informe del período") y en el cierre del período; ayuda y documentación.

## Respuestas (2026-10-23) y cómo quedó

1. La columna B es el **tiempo estimado de ruta**: "Tiempo de ruta", calculado
   (`estimateRouteMinutes` en `@verdeo/routing`) desde el origen de la operación, en el orden de la
   ruta del día (la publicada o, si no hay, la última propuesta): distancia en línea recta × 1,35 a
   25 km/h, más 5 minutos por parada anterior. Sin ruta o sin coordenadas, vacío.
2. Los colores, como norma: naranja = cliente NUEVO (en el nombre), verde/rojo = cobrado/no cobrado
   (en la venta), amarillo = franja pedida por el cliente (en el horario).
3. Se mantienen las cinco columnas de días: la variedad en tantas como comidas tenga la vianda; en
   un Intuitivo, sus platos.
4. Va también la hoja "Reparto".
5. Se mantiene la barra de carga: "Carga · <reparto y su horario>". La hora de carga no está en el
   sistema; se completa a mano.

- Datos: `buildPeriodReport` (`packages/orders/src/period-report.ts`, con tests) y
  `periodOrdersReport` en el servicio.
- Planilla: `apps/api/src/orders-period-report.ts` (`xlsx-js-style`), `GET /api/v1/orders/period-report`
  (`orders.read`; período obligatorio, zona y reparto opcionales).
- Pantalla: botón "Informe del período" en Pedidos (dentro de "Columnas").
- Diferencias con el plan: el resumen va con valores y el TOTAL con fórmula (no CONTAR.SI.CONJUNTO:
  en la hoja de pedidos el Intuitivo no tiene una columna de variedad que contar); sin filtros en el
  encabezado (las barras de día los romperían) ni paneles fijos (la librería no los escribe).

## Ajustes con la planilla real (2026-10-23)

- **Intuitivo**: en negrita cursiva y con el **menú de cada plato en la columna de su día**
  ("VEGETARIANO" lunes, miércoles, jueves y viernes; "KETO" el martes), un renglón por menú; dos
  platos del mismo menú el mismo día abren otro renglón (`composableRows`). Sale del menú y el día de
  origen que ya guarda cada plato elegido.
- **Nuevos**: rosado (`F8CBAD`) si el pedido entró por mail, más oscuro (`E26B0A`) si entró por
  WhatsApp, anaranjado claro si entró por otro lado.
- **Venta**: verde/rojo sólo en las transferencias; el efectivo va sin color.
- La columna de medio de pago se llama **"Pago"** (transferencia o efectivo), en lugar de escribirlo
  en la dirección.
- El período de una vianda del stock ("KETO · Oct 2") queda para el plan de lotes
  ([STOCK_LOTS_PLAN.md](STOCK_LOTS_PLAN.md)).
