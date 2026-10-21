# Platos con su menú de origen, Intuitivo desarmado en cocina y "Por cobrar" — plan

Pedido del usuario (2026-10-20), con una captura de la hoja "Pedido" de la planilla de cocina:

1. En la planilla de cocina, el Intuitivo no tiene que ir como un renglón propio ("INTUITIVO 400"):
   tiene que **desarmarse en los platos que lo componen**, porque es un menú hecho con platos de los
   otros menús.
2. Eso plantea a qué renglón va un plato que se repite en dos menús. La respuesta: **un plato con el
   mismo nombre en dos menús distintos son dos platos distintos**. Un "Lomo con cebolla" de Keto no es
   el de Anti-Age. Esto toca el sistema entero: la carga de pedidos, el armado de períodos, cocina,
   etiquetas. En el Intuitivo se guarda el menú del que viene cada plato.
3. Una sección nueva para los clientes que no pagaron cuando se cierra el período, con la lista y el
   detalle de sus pedidos impagos.

## Cómo está hoy

- Cada plato del menú es un renglón de `weekly_menu_items`: una variedad de la semana (`offering_id`)
  y su posición (`slot`, del 1 al 5). Dentro de un menú, el plato **ya tiene identidad propia**: el
  plato 3 de Keto 400 es distinto del plato 3 de Anti-Age 400 aunque los dos se llamen igual.
- El Intuitivo, en cambio, **elige por nombre**. Las opciones salen de todos los platos publicados
  para ese tamaño, juntados por nombre (`sizeUniverse` en `resolveOrderItems`), y lo elegido se guarda
  como texto en `order_item_selections.dish_name_snapshot`. Si dos menús tienen un plato con el mismo
  nombre, el Intuitivo ve uno solo y no hay forma de saber de cuál salió.
- Por eso "Platos a preparar (Intuitivos)" en Cocina suma por nombre, y la hoja "Pedido" no sabe en
  qué renglón ni en qué columna poner los platos de un Intuitivo.

## Parte 1 — El plato es "plato N del menú X"

### Datos

- `order_item_selections` suma **`source_menu_item_id`** (→ `weekly_menu_items.id`, `on delete set
null`): el plato exacto que se eligió. Desde ahí se llega al menú de origen (familia y tamaño) y a su
  posición, o sea a su día.
- Además se guarda **`source_family_snapshot`** (por ejemplo "Keto"): si mañana se borra o se rehace el
  menú de la semana, el pedido sigue diciendo de dónde venía cada plato. `dish_name_snapshot` sigue
  igual.
- **Pedidos viejos**: se completa el origen cuando el nombre aparece en un solo menú del tamaño. Si
  aparece en dos o más, queda sin origen (ver la pregunta 3).

### Carga de pedidos (interna, formulario del sitio, Mi cuenta, importador)

- El Intuitivo deja de elegir por nombre: elige un plato de un menú. La lista se agrupa por menú
  ("Keto", "Anti-Age"…), así que un plato repetido aparece dos veces, cada una bajo su menú.
- Al pedido se manda el id del plato (`selectedDishIds`) en lugar del nombre. Durante la transición el
  servidor sigue aceptando nombres, y los resuelve sólo si no hay ambigüedad. Si la hay, rechaza el
  pedido y pide elegir de qué menú.
- Donde se muestra lo elegido (ficha del pedido, vista rápida, cocina, etiquetas) se ve el origen:
  "Lomo con cebolla · Keto".

### Armado de períodos

- Cada menú ya carga sus platos por separado, así que no cambia la forma de cargarlos.
- Lo que cambia es que **nada junta platos por nombre**: el autocompletado puede sugerir nombres, pero
  cada uno queda en su menú.

### Cocina

- **Hoja "Pedido"**: desaparece el renglón "INTUITIVO 400". Cada plato de un Intuitivo suma una
  porción en el renglón **de su menú de origen y del tamaño del Intuitivo**, en la columna de **su
  posición** (plato 3 = miércoles). Por ejemplo, un Intuitivo 400 con el plato 3 de Keto suma 1 en
  KETO 400, columna MIÉRCOLES. Por eso las columnas de un renglón **pueden dejar de ser iguales**:
  ahora reflejan lo que de verdad hay que cocinar de cada plato.
- **"Platos a preparar (Intuitivos)"** suma por plato con su menú ("Lomo con cebolla · Keto 3"), no por
  nombre.
- Las otras hojas (Conciliado, Intuitivos por cliente) siguen igual, más el origen de cada plato.

### Etiquetas

- El campo "Platos de la vianda" de un Intuitivo muestra el origen si se pide (opción del formato).
- Las de cocina, una por plato, salen con su menú.

## Parte 2 — "Por cobrar" (nombre propuesto; alternativas: "Saldos pendientes", "Cuentas a cobrar")

### La idea

Al cerrar un período, los pedidos que **no están cobrados** (sin `paid_at`) y **no están cancelados**
pasan a "Por cobrar". La sección muestra:

- **Una lista por cliente**: nombre, teléfono o WhatsApp, cuántos pedidos debe, el total y la deuda más
  vieja (por ejemplo "hace 3 semanas"). Se ordena por monto o por antigüedad.
- **El detalle de cada cliente**: cada pedido impago con su período, su número, la fecha de entrega, lo
  que llevó y el monto, y el acceso a la ficha del pedido.
- **Cobrar desde ahí**: tildar un pedido como cobrado (lo mismo que la columna "Cobrado" de Pedidos),
  uno por uno o "Cobrar todo". Lo que se cobra sale de la lista solo.
- **Avisar**: un botón que arma el mensaje de WhatsApp con el detalle de lo adeudado, para mandar desde
  tu teléfono, igual que los avisos de hoy.

### Cómo se arma

- **Es una vista y no una copia**: la lista sale de los pedidos (período cerrado, sin cobrar, no
  cancelado). Así no hay dos registros que puedan contradecirse: se cobra en Pedidos y desaparece de
  "Por cobrar", y al revés.
- "Pasa automáticamente al cerrar" se cumple sin mover nada: cerrar el período es lo que hace que sus
  impagos aparezcan. Se guarda la fecha de cierre, para saber desde cuándo se debe.
- En la ficha del cliente, una línea "Debe $ X en N pedidos" y su lista.
- Permiso propio, `receivables.read` (y cobrar con el de hoy, `orders.edit` o el de cobros), para
  decidir quién ve las deudas.
- En el tablero, una alerta: "12 clientes con pagos pendientes, $ 480.000".

## Fases

1. **Origen del plato**: migración (`source_menu_item_id`, `source_family_snapshot`, completar los
   viejos), servidor que acepta ids, selector agrupado por menú en la carga interna, ficha y cocina con
   el origen.
2. **Hoja "Pedido" con el Intuitivo desarmado** y "Platos a preparar" por plato y menú.
3. **El resto de los lugares donde se elige o se muestra**: formulario del sitio, Mi cuenta,
   importador, etiquetas.
4. **"Por cobrar"**: la sección, el detalle por cliente, cobrar desde ahí, el aviso por WhatsApp, la
   línea en la ficha del cliente y la alerta del tablero.

## Decisiones (2026-10-20)

1. **Renglón y columna**: el plato de un Intuitivo suma en el renglón de **su menú con el tamaño del
   Intuitivo**, en la columna de su posición. Un Intuitivo 400 con el plato 3 de Keto suma 1 en
   KETO 400, columna MIÉRCOLES.
2. **Tamaño**: el Intuitivo sigue eligiendo sólo entre los menús de su mismo tamaño.
3. **Pedidos viejos con un nombre repetido**: quedan **sin origen**. En cocina salen en un renglón
   aparte, "SIN MENÚ DE ORIGEN", para resolverlos a mano. No se inventa nada.
4. **Qué pasa a la sección**: los pedidos de un **período cerrado**, no cancelados y sin cobrar.
5. **Nombre**: **"Por cobrar"**.

## Estado (2026-10-20)

**Fases 1 y 2 hechas; de la 3, el formulario del sitio.**

- **Datos** (migración 0068): `order_item_selections` suma `source_menu_item_id`,
  `source_family_snapshot` y `source_slot`. Los pedidos viejos se completaron sólo cuando el nombre
  estaba en un único menú fijo del mismo tamaño y semana; el resto quedó sin origen. Probado en
  `packages/db/src/dish-identity.test.ts`.
- **Servidor**: el renglón acepta `selectedDishes: [{ dishName, familyName }]` y busca ese plato en
  ese menú; si no está, rechaza el pedido y dice cuál. `selectedDishNames` sigue para el importador y
  la IA: ubica los nombres que están en un solo menú y deja sin origen los repetidos. Los platos
  cargados en el propio Intuitivo no cuentan como origen.
- **Web**: el selector del Intuitivo (carga interna, edición del pedido y formulario del sitio) elige
  "este plato de este menú". Un plato repetido aparece en los dos grupos y se cuenta aparte. La ficha,
  la vista rápida, el carrito y Cocina muestran "Plato (Menú)".
- **Cocina**: "Platos a preparar" cuenta por menú y nombre. En la hoja "Pedido" el Intuitivo ya no es
  un renglón: cada plato suma en el renglón de su menú con el tamaño del Intuitivo, en la columna de
  su día. Los que no tienen origen salen en "SIN MENÚ DE ORIGEN", con las porciones en la última
  columna. Las hojas Intuitivos y Platos a preparar, el texto de WhatsApp y la impresión llevan el menú
  de cada plato.
- **Falta**: etiquetas con el origen (fase 3) y "Por cobrar" (fase 4).

## Estado (2026-10-21): "Por cobrar" hecho

- `GET /api/v1/receivables` (`payments.read`, con sesión y la ciudad elegida arriba; `?customerId=` para
  la ficha): los pedidos de períodos cerrados, no cancelados, sin cobrar y con monto, agrupados por
  cliente, con su contacto, cada pedido (período, entrega, qué llevó, medio de pago, monto) y la
  entrega más vieja. Es una consulta sobre los pedidos, no una tabla aparte.
- Pantalla `/app/por-cobrar` (menú Pedidos → Por cobrar): total general y clientes, ordenar por monto o
  por antigüedad, cada cliente se despliega con sus pedidos, "Cobrado" por pedido y "Cobrar todo"
  (con `orders.edit`, el mismo tilde de Pedidos), y "Avisar por WhatsApp" con el detalle y el total.
- Ficha del cliente: "Debe $ X en N pedidos de períodos cerrados", con enlace.
- **Cambió respecto del plan**: el permiso es `payments.read` (el de ver cobros, que ya tienen los
  operadores) en lugar de uno nuevo. **Falta**: la alerta en el tablero.
