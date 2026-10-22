# Arreglos del 2026-10-22 — plan

Cuatro pedidos del cliente, en el orden en que llegaron.

## A. Sobrante del período anterior, a la venta en el período nuevo

**El caso**: al cerrar la semana A quedaron 3 Keto 250 y 1 Keto 400 sin vender. Se quieren vender en
la semana B, junto con el stock propio de B.

**Hoy**: el stock (`production_stock`) es de un solo período. Al cerrar A, lo que no se vendió se da
de baja solo. En B no hay forma de decir "además tengo 4 viandas de A".

**Propuesta**:

- El stock de un período tiene dos orígenes: **"para este período"** (lo que se cocina de más, como
  hoy) y **"sobrante de un período anterior"** (ya cocinado). En la tabla, una columna `origin`
  (`planned` | `carry_over`) y, para el sobrante, de qué período viene.
- **El sobrante no se cocina**: no suma a la planilla de cocina ni a "Stock para el cierre". **Sí se
  vende**: suma a lo disponible para "Sale del stock" al cargar un pedido.
- **Cómo se carga**: al cerrar A, en lugar de dar de baja el remanente sin preguntar, el cierre
  ofrece "Pasar el sobrante al período siguiente", con lo que quedó ya completo y editable. Además,
  en Cocina de B, un bloque "Sobrante de períodos anteriores" con − / + para corregirlo a mano.
- **Precio**: el de la semana en que se vende (B).
- **Etiquetas**: el sobrante ya tiene su etiqueta de A. No se vuelve a imprimir.

## B. Elegir la fecha de entrega al crear un pedido (escritorio)

**Hoy**: si la ciudad tiene un solo día de reparto, la carga de pedidos muestra la fecha como texto
fijo. Además, el servidor corrige cualquier fecha que no sea día de reparto. En "Editar pedido" sí
hay "Otra fecha".

**Propuesta**: lo mismo que en la edición. El selector de días de reparto y, abajo, "Otra fecha" con
un calendario, en todos los tamaños de pantalla. El servidor respeta la fecha elegida a mano, sin
cambiarla por la de siempre, igual que al editar.

## C. "NUEVO" al lado del nombre

**Para qué**: saber a quién mandarle las recomendaciones para descongelar, que se mandan la primera
vez que compra.

**Propuesta**: un tilde "Cliente nuevo" en el pedido.

- Se marca solo cuando el cliente no tiene pedidos anteriores (no cancelados) y se puede sacar o
  poner a mano. Es del pedido y no del cliente, porque "nuevo" es cierto la primera vez y deja de
  serlo después.
- Se ve como una etiqueta **NUEVO** al lado del nombre: en la lista de Pedidos (tarjetas y columnas),
  en la ficha del pedido y donde se decida en la pregunta 3.

## D. La hoja "Conciliado" como la planilla de ejemplo

**El modelo** (imagen del cliente): una sola columna de cantidades.

- **Menús estándar** separados por variedad, un renglón por tamaño (KETO 400, KETO 250), con un
  renglón vacío entre variedades.
- **Intuitivos**: un renglón por pedido, con el **nombre del cliente y el tamaño** ("Gustavo Fastuca
  400") y su cantidad.
- **TOTAL** al pie.
- **Estilo**: letra grande en negrita, bordes finos, nombres a la izquierda y números a la derecha.

**Cómo**: reemplaza la hoja "Conciliado" actual, como segunda hoja de la planilla, después de
"Pedido". Se escribe con `xlsx-js-style`, igual que "Pedido".

## Fases

1. **D** (planilla) y **B** (fecha): cambios acotados, sin datos nuevos.
2. **C** (NUEVO): en el cliente (calculado, con interruptor manual) y la columna "¿Es nuevo?" en Pedidos.
3. **A** (sobrante): migración del stock, cierre de período, Cocina y "Sale del stock".

## Preguntas

Las respuestas quedan en la sección Decisiones.

## Decisiones (2026-10-22)

1. **Sobrante (A)**: el cierre de A propone pasar lo que quedó sin vender a B, ya completo, y en
   Cocina de B se corrige con − / +.
2. **NUEVO (C)**: es del **cliente**, no del pedido. Se calcula solo (un cliente con a lo sumo un
   pedido no cancelado es nuevo) y se puede forzar a mano con un interruptor en la ficha del cliente.
   En Pedidos va como columna "¿Es nuevo?" del selector de columnas. No va en etiquetas, reparto ni
   planilla.
3. **Conciliado (D)**: variedades en el orden del menú, 400 antes que 250, con el stock sumado.

## Estado

- **D hecho**: la hoja "Conciliado" (segunda de la planilla) copia la del cliente: una columna de
  cantidades, menús estándar en el orden del menú y de mayor a menor tamaño (el stock suma), un
  renglón vacío entre variedades, los Intuitivos uno por pedido con nombre y tamaño, y TOTAL al pie
  (fórmula). Letra Arial 16 en negrita, bordes finos. La hoja "Pedido" también va en el orden del menú
  y de mayor a menor tamaño. El orden sale de `familyOrder` del resumen de cocina (el orden en que se
  cargaron las variedades del menú del período).
- **B hecho**: al crear un pedido, el selector de días de reparto tiene "Otra fecha" y, con un solo
  día, hay un calendario en lugar de texto fijo. La fecha elegida a mano viaja con
  `deliveryDateIsCustom` y el servidor la respeta.
- **C hecho**: `customers.is_new_override` (migración 0069; null = automático). Es nuevo si se
  marcó a mano o, si no, con a lo sumo un pedido no cancelado. La ficha muestra la etiqueta NUEVO y el
  interruptor "Cliente nuevo" (dice si es automático o a mano); Pedidos tiene la columna "¿Es nuevo?".
- **A hecho**: `production_stock` suma `origin` (`planned` | `carry_over`) y `from_sales_cycle_id`
  (migración 0070; el índice único pasa a incluir `origin`). El sobrante suma a lo disponible para
  vender (`sobrante` en el informe de excedente) y no a la planilla de cocina. Al cerrar, el diálogo
  muestra lo que quedó sin vender y "Pasarlo al período siguiente para venderlo" (por defecto sí):
  sale de A como baja con ese motivo y entra al período siguiente (el de apertura más cercana) como
  sobrante; sin período siguiente, avisa en vez de perderlo. En Cocina, "Sobrante de períodos
  anteriores" con − / + por variedad, también para cargarlo a mano si A ya se cerró. API:
  `GET/PUT /api/v1/production/:cycleId/carry-over` y `carryToNext` en el cierre.
  `convert-stock-customer.sql` actualizado al índice nuevo.
