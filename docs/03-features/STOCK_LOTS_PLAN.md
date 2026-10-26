# Stock por lotes: vender sobrante de cualquier período — plan

Pedido (2026-10-23): vender viandas que quedaron de períodos anteriores (no sólo del anterior: dos o
tres atrás), saber de qué período es cada una ("keto oct 2", "keto oct 3"), que el sistema registre
solo lo que sobró y lo pase adelante, y poder cargarlo en un pedido. Estado: **hecho** (2026-10-24), con las respuestas del usuario.

## Lo que hay hoy y por qué no alcanza

- `production_stock` tiene una fila por período, origen (`planned` | `carry_over`), variedad y
  tamaño. El sobrante pasa **sólo al período siguiente** y **se junta**: un Keto 400 de Oct 2 y uno
  de Oct 3 quedan en la misma fila, sin poder distinguirlos (el índice único no incluye de qué
  período viene).
- Pasarlo es un paso del cierre: si no se hace, el sobrante se pierde; si se hace dos cierres
  seguidos, el de hace dos períodos se suma al del anterior y se pierde de dónde venía.
- "Sale del stock" ofrece sólo las variedades del menú de **esta** semana, y el pedido queda con los
  platos de esta semana, aunque la vianda sea de otra.
- Una venta del stock se marca con el origen "Del stock", que pisa por dónde entró el pedido
  (mail, WhatsApp): el informe no puede saber si el cliente nuevo entró por mail o por WhatsApp.
- No hay ciudad: el stock es del período, y hoy hay stock en Buenos Aires y en Córdoba.

## El modelo propuesto: lotes

Un **lote** son viandas ya cocinadas de un período, de una variedad y un tamaño, en una ciudad:
"4 Keto 400 de Oct 2 en Buenos Aires". Vive **hasta que se vende o se da de baja**, no hasta que
termina un período: no hay que pasarlo de semana en semana.

- **`stock_lots`**: ciudad, período en que se cocinó, variedad, tamaño, cantidad inicial, notas,
  quién y cuándo. Lo **disponible** se calcula: inicial − vendidas − bajas.
- **`stock_lot_movements`**: cada venta (con su pedido) y cada baja (con su motivo), para que lo
  disponible se explique solo y quede en la auditoría.
- **Nombre corto del período** ("Oct 2"): lo que se ve al lado de cada lote. Sale del nombre del
  período y se puede corregir a mano, una vez, en el período.

### Que el sistema lo interprete solo

Al **cerrar un período**, lo que se cocinó de más y no se vendió (el stock planificado de ese
período, menos lo vendido) se convierte **solo** en lotes de ese período. Sin diálogo ni paso extra:
se avisa en el feed ("Quedaron 2 Keto 400 y 1 Real 250 de Oct 3") y se puede corregir después en
Cocina → Stock (contar de nuevo, dar de baja lo que se tiró).

### Venderlo en un pedido

En "Nuevo pedido", además de las variedades de la semana, una sección **"Del stock"** con los lotes
disponibles de la ciudad, de más nuevo a más viejo y en la jerarquía de productos:

> Keto 400 · **Oct 3** · quedan 2
> Keto 400 · **Oct 2** · queda 1
> Real 250 · **Oct 2** · quedan 3

- Se elige el lote; el ítem del pedido queda atado a él (`stock_lot_id`) y lleva sus platos (los de
  esa semana, no los de ésta).
- No deja vender más de lo que queda (como hoy).
- El precio es el normal de esta semana (como hoy, decisión 2 del plan de stock).
- El pedido conserva su origen real (mail, WhatsApp…): que tenga ítems del stock es un dato del
  ítem, no del pedido. Un pedido puede mezclar viandas de la semana y del stock.

### Dónde se ve el período

- **Planilla de pedidos** (y Reparto): "KETO · Oct 2" en las columnas de días, como lo escriben hoy.
- **Cocina**: lo vendido del stock no suma a lo que hay que cocinar (ya está cocinado).
- **Etiquetas**: la vianda del stock ya tiene su etiqueta de cuando se cocinó; no se reimprime.
- **Cocina → Stock**: los lotes vivos con lo disponible, por ciudad, con "dar de baja".
- **Feed**: aviso de los lotes que quedan de hace más de N períodos (ver preguntas).

### Lo que pasa con lo de hoy

Una migración convierte el sobrante (`origin = carry_over`) en lotes de su período de origen, y el
stock planificado sigue siendo lo que se cocina de más en el período en curso. "Pasar el sobrante al
período siguiente" del cierre se reemplaza por la conversión automática.

## Preguntas para cerrar el plan

1. **Ciudad**: ¿el stock es por ciudad (Buenos Aires, Córdoba…)? Entiendo que sí.
2. **Nombre del período**: ¿"Oct 2" sale bien del nombre del período, o prefieren escribirlo ustedes
   en cada período?
3. **Al cerrar**: ¿la conversión en lotes es automática y se corrige después (propuesta), o prefieren
   confirmarla en el cierre?
4. **Vencimiento**: ¿hasta cuántos períodos atrás se puede vender? ¿Avisamos a partir de cierta
   antigüedad (por ejemplo, más de 3 períodos) o se da de baja solo?
5. **Precio**: ¿siempre el normal de la semana, o el stock viejo puede ir con descuento?
6. **Un casillero en la ficha del cliente** (lo que sugirieron): con los lotes no haría falta, porque
   el período queda en el ítem del pedido. ¿Les sirve así?

## Fases (una vez confirmado)

1. Modelo: `stock_lots`, `stock_lot_movements`, nombre corto del período; migración del sobrante.
2. Cierre: lo que sobra pasa solo a lotes; aviso en el feed.
3. Nuevo pedido: "Del stock" con los lotes; el ítem atado al lote y con sus platos.
4. Cocina → Stock (lotes por ciudad, baja), planilla de pedidos con el período, ayuda.

## Respuestas (2026-10-24) y cómo quedó

1. **Por ciudad.** `stock_lots.operating_site_id`. Al cerrar, la ciudad de cada lote es la que más
   vendió esa variedad y tamaño en el período; si no se vendió, la del menú; se puede pasar a otra
   ciudad (`PATCH /api/v1/stock-lots/:id`).
2. **El nombre del período, el cargado.** "Keto 400 · Octubre 2".
3. **Automático al cerrar**, sólo se avisa (en la pantalla del cierre); se corrige después en Cocina.
   Lo que sobra sale del período como baja con el motivo "pasó al stock de períodos anteriores".
4. **Un mes máximo**: `expires_at` = cierre del período + 30 días. Vencido, no se ofrece ni se acepta;
   en Cocina figura como vencido para darlo de baja.
5. **Precio normal** de la semana (el de la opción del menú elegido de la misma variedad y tamaño).
6. **En Nuevo pedido**, debajo de "Sale del stock": "Stock de períodos anteriores" con los lotes de la
   ciudad del menú elegido que ese menú puede vender. Un pedido puede ser sólo del stock.

- Modelo (migración 0073): `stock_lots` y `order_items.stock_lot_id`. Lo disponible se calcula
  (cargado − dado de baja − vendido en pedidos no cancelados): cancelar un pedido devuelve la vianda.
  El sobrante viejo (`production_stock` con `origin = carry_over`) pasa a lotes en la migración.
- Lo vendido de un lote no se cocina, no lleva etiqueta y no cuenta en el excedente del período.
- El pedido conserva su origen; el ítem dice de qué período es (pedido, lista, planilla de pedidos).
- Se sacaron "Pasar el sobrante al período siguiente" del cierre y la carga manual del sobrante
  (`/production/:cycleId/carry-over`).
- La ciudad de un lote se cambia en Cocina → Stock (selector en cada lote), para corregir la que
  asignó el cierre (2026-10-24).

## Cancelados ya cocinados (2026-10-25)

- El diálogo de cancelar ofrece **"Pasar las viandas a stock"** si el pedido estaba confirmado,
  listo o entregado (`toStock` en `POST /orders/:id/status`). Se pregunta: a veces el cliente se lo
  lleva igual.
- **Fijo**: se suma al lote de su variedad, tamaño, período y ciudad (o lo abre). Al cerrar el
  período, el sobrante se suma a ese mismo lote (`addToVarietyLot`): un solo "Keto 400 · Octubre 4".
- **Intuitivo**: abre un lote propio con sus platos (`stock_lots.dish_selections`, con menú y día) y
  el pedido de origen (`source_order_id`). Se vende con el Intuitivo del menú del mismo tamaño;
  lleva los platos del lote aunque no estén en el menú de la semana, al precio del Intuitivo con esa
  cantidad de platos.
- **Sin doble conteo**: `orders.cancelled_to_stock` hace que el excedente del período siga contando
  esas viandas como consumidas (están en el lote).
- **Reactivar**: las viandas salen del lote (el lote del Intuitivo se borra). Si ya se vendieron, no
  se puede reactivar.
- Lo que el pedido ya sacaba de un lote vuelve solo a ese lote al cancelarse.
- Migración 0074.
