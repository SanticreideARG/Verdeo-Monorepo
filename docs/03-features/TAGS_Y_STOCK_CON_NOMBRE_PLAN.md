# Tags personalizables y stock con nombre: plan

Pedido del 2026-11-28. Estado: **en curso**: fases 1 (tags) y 2 (planillas) hechas; fase 3 (stock con nombre) pendiente.

## 1. Tags personalizables

Hoy hay un solo tag, "Nuevo". Es fijo y sale de los datos (primera compra). Hace falta poder
aclarar cosas en los menús, como "Sin semillas", que es el primer caso. El sistema tiene que quedar
listo para el próximo.

Hoy las aclaraciones no tienen dónde ir:

- Las _indicaciones dietarias_ del pedido están apagadas: eran texto libre.
- Las _restricciones del cliente_ son texto libre y no llegan a cocina.

Un tag es un dato con nombre, color y reglas.

### Qué es un tag (Ajustes → Tags)

| Parámetro                   | Valores                                          | Para qué                                                                           |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Nombre                      | "Sin semillas"                                   | El texto de la pill.                                                               |
| Color                       | paleta de ~10 colores legibles en claro y oscuro | El color de la pill.                                                               |
| Se aplica a                 | Clientes · Pedidos · Ambos                       | Dónde se puede poner.                                                              |
| Ciudades                    | todas, o una lista                               | Sólo se ofrece y se ve en esas ciudades.                                           |
| Sale en planillas de cocina | sí / no                                          | Aparece en la planilla de producción (Excel, PDF y WhatsApp).                      |
| Columna con check           | sí / no                                          | La planilla suma una lista de los pedidos con ese tag y una casilla ☐ para marcar. |
| Activo                      | sí / no                                          | Se archiva en lugar de borrarse: los pedidos viejos lo siguen mostrando.           |

### Cómo se aplica

- **En un cliente**: pills en la ficha, con "+ Tag" para agregar y una × para sacar.
- **En un pedido**: lo mismo, en la ficha y al cargarlo.
- **Herencia**: un tag del cliente marca todos sus pedidos. Se calcula al leer, no se copia. En el
  pedido se ve con la aclaración "del cliente" y se saca desde el cliente.
- **Dónde se ve la pill**: lista de pedidos, ficha del pedido, ficha y lista de clientes, hoja de
  reparto y planilla de pedidos (Excel).

### Modelo (una migración)

- `tags`: nombre, color, se aplica a, si sale en cocina, si lleva columna con check, activo, orden.
- `tag_sites`: tag y ciudad. Sin filas, el tag vale para todas.
- `customer_tags` y `order_tags`: cada una con su tag, quién lo puso y cuándo. Ambas se auditan.

## 2. Stock de semanas anteriores, con el nombre de quien lo compra

Hoy una vianda que sale de un lote del stock:

- no se cocina, no lleva etiqueta y no figura en las etiquetas del período, porque ya tiene la de
  cuando se cocinó;
- en la planilla de pedidos se ve como "(stock de Noviembre 2)";
- en la hoja de reparto aparece como cualquier vianda, sin decir que es del stock.

Pero hay que etiquetarla con el nombre del comprador, como un Intuitivo.

**Propuesta**: la vianda del stock **se trata como un Intuitivo para etiquetas y reparto**, sin
dejar de ser lo que es. No cambia la variedad, ni el precio, ni las estadísticas, ni el stock.

- **Etiquetas**: en el generador, un grupo nuevo, "Del stock, con nombre". Lleva una vertical por
  vianda, con el nombre del cliente, la variedad, el tamaño y "Stock Nov 2". Se anota como impresa
  igual que las demás. El pedido suelto también la imprime.
- **Hoja de reparto**: la vianda dice "Keto 250 · stock de Noviembre 2" y el nombre, para que quien
  arma el reparto sepa cuál es.
- **"Permitir generar el cambio"**: una casilla por ítem en la ficha del pedido, "Etiqueta con
  nombre". Viene marcada en toda vianda del stock y se puede desmarcar si la etiqueta original
  alcanza.

## Decisiones (2026-11-28)

1. **Planillas**: cada tag decide, en cada planilla (producción, hoja de reparto y planilla de
   pedidos en Excel), si **no sale**, si va **al final del nombre** del cliente ("María Pérez · Sin
   semillas") o si lleva **columna con ☐**. Reemplaza a los dos parámetros sueltos de la tabla de
   arriba ("Sale en planillas de cocina" y "Columna con check").
2. **No se imprime en la etiqueta** de la vianda.
3. **Herencia calculada siempre**: sacarle el tag a un cliente lo saca de todos sus pedidos, también
   los de períodos cerrados.
4. **Stock con nombre, siempre y desmarcable**: toda vianda del stock vendida lleva etiqueta con el
   nombre del comprador; una casilla por ítem la saca.

## Cómo quedó

### Fase 1: tags (2026-11-28)

- Migración 0088:
  - `tags` con nombre único sin distinguir mayúsculas, color, `applies_to`, `production_sheet`,
    `delivery_sheet` y `orders_sheet` (OFF, NAME o CHECK), `active` y `sort_order`.
  - `tag_sites`, `customer_tags` y `order_tags`.
  - `order_items.name_label`, para la fase 3.
  - Trae el tag "Sin semillas" (ámbar, clientes y pedidos, todas las ciudades).
- `repositories/tags.ts`:
  - `tagsByOrder`: los tags propios del pedido más los de su cliente, filtrados por la ciudad del
    pedido. Si un tag está en los dos lados, cuenta como propio.
  - `tagsByCustomer`: los tags propios del cliente.
- `OrderSchema.tags`: cada tag lleva `fromCustomer` y su modo en cada planilla.
  `OrderSchema.operatingSiteId`.
- `CustomerDetailSchema.tags`.
- API:
  - `GET /api/v1/tags`: con `orders.read` o `customers.read`.
  - `POST /api/v1/tags` y `PATCH /api/v1/tags/:id`: con `settings.access`.
  - `PUT /api/v1/customers/:id/tags`: con `customers.edit`.
  - `PUT /api/v1/orders/:id/tags`: con `orders.edit`.
  - Al poner un tag se valida que esté activo, que se aplique a ese tipo y, en un pedido, que valga
    en su ciudad. Uno archivado que ya estaba se conserva.
  - Auditoría: `tag.created`, `tag.updated`, `customer.tags_changed` y `order.tags_changed`.
- Web:
  - Ajustes → Tags (`TagsSettingsPage`).
  - `TagEditor` en la ficha del pedido y en la del cliente.
  - `TagPills` al lado del nombre en la lista de pedidos.
  - Las pills (`.tag-pill[data-color]`) son de color sólido con texto blanco y se leen en los dos
    temas.

### Fase 2: planillas (2026-11-28)

- **Planilla de producción**:
  - `kitchenSummary.tagged`: una lista por tag con `production_sheet` distinto de OFF, con
    pedido, cliente y viandas.
  - En Excel va una hoja por tag; en PDF y WhatsApp, una sección.
  - El modo CHECK agrega la casilla ☐.
  - El modo NAME, además, pega el tag al nombre del cliente ("Lola · Sin semillas"). Se ve en
    Intuitivos y excepciones.
  - La planilla congelada de antes no tiene la lista: el contrato la completa con `[]`.
- **Planilla de pedidos** (`orders-period-report.ts`):
  - `PeriodReportOrder.tags`.
  - `nameWithTags`: el tag al final del nombre.
  - `tagCheckColumns`: una columna con ☐ por tag, al final de la hoja. En "Pedidos" la casilla va
    en el primer renglón del pedido y en "Reparto", en cada bulto.
  - Usa `orders_sheet` para la hoja "Pedidos" y `delivery_sheet` para "Reparto".
