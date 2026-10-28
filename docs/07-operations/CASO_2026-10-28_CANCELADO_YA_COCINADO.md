# Caso 2026-10-28 — Pedido cancelado que ya estaba cocinado

## Caso

**Período:** Octubre 4 (Córdoba). **Pedido:** Adriana Mariani, Intuitivo 250 × 1, $70.000, transferencia sin
cobrar, entrega 26 de octubre. Tomado el 21 de octubre por WhatsApp.

1. Isabella descargó la planilla de cocina ("Descargar planilla") y la mandó a producción. El pedido de
   Adriana estaba en esa planilla y se cocinó.
2. Después el pedido se canceló. En el diálogo de cancelar no se tildó "Pasar las viandas a stock".
3. Al volver a descargar la planilla, el pedido ya no aparecía. No quedaba registro de qué pedidos había
   llevado la planilla anterior: el consolidado guardado (`production_snapshots`) tiene sólo totales y se
   pisa en cada descarga.
4. La vianda existe —cocinada, sin cobrar—, pero no figura en ningún lado: no está en el stock
   ("Noviembre no tiene Stock de períodos anteriores") ni en lo vendido.
5. Además, el pie de la lista de Pedidos daba **$2.625.000** y el informe del período **$2.695.000**, y
   parecía que el informe contaba el pedido cancelado.

## Análisis

**El informe del período no suma al cancelado.** Su "Total vendido" sale sólo de pedidos no cancelados
y sin el cliente STOCK (`cycleReport`, `ne(orders.status, 'CANCELLED')`). El cancelado aparece aparte, en
"Pedidos cancelados: 1" y "Monto cancelado (no suma): $70.000".

**La diferencia de $70.000 viene del pie de la lista.** La lista de Pedidos se carga de a 30 ("Cargar
más") y el pie sumaba sólo las filas cargadas. En la captura había "Cargar más", así que faltaban
pedidos por cargar. Lo más probable: 31 pedidos en el período (30 vigentes y el cancelado), la primera
página trae 30 y uno vigente de $70.000 queda afuera, y por eso la diferencia parecía el cancelado.
Se verifica con:

```sql
select o.status,
       upper(trim(c.display_name)) = 'STOCK' as es_stock,
       count(*) as pedidos,
       sum(o.total_minor) / 100.0 as total
from orders o
join sales_cycles s on s.id = o.sales_cycle_id
join customers c on c.id = o.customer_id
where s.alias = 'Octubre 4'
group by 1, 2
order by 1, 2;
```

La suma de los no cancelados y no STOCK tiene que dar $2.695.000.

**La causa de fondo es que el sistema no sabía qué había ido a cocina.** "Ya cocinado" se infería sólo
del estado del pedido (confirmado, listo o entregado), y la decisión de pasar a stock dependía de que
quien cancela se acordara de tildar la casilla. Nada avisaba que el pedido ya estaba en una planilla
mandada, ni había forma de corregirlo después de cancelar sin reactivar el pedido.

**Contabilidad entre períodos.** Que la producción quede en Octubre 4 y la venta en otro período es lo
correcto, y el modelo de lotes ya lo hace así: el lote pertenece al período en que se cocinó, y la venta
desde el lote cuenta en el período en que se vende (su informe, su cobro), sin volver a sumar a cocina.

## Resolución

### Para este pedido

1. Abrir el pedido de Adriana → **"Pasar sus viandas a stock"**. Arma el mismo lote que se habría armado al
   cancelar: Intuitivo 250 de Octubre 4, con sus platos, atado al pedido. Queda en "Stock de períodos
   anteriores" y se vende desde Nuevo pedido con el Intuitivo de la semana.
2. No cargarlo además con "Cargar un Intuitivo de un período anterior": quedaría dos veces.
3. La deuda ya estaba bien: un cancelado no figura en Por cobrar.

### Para que no se repita

| Qué                                         | Dónde                                          | Cómo                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada planilla queda anotada con sus pedidos | `kitchen_sheets` (migración 0076), al exportar | Descargar, imprimir o copiar la planilla guarda qué pedidos llevaba, quién y cuándo, y el contenido para volver a bajarla igual.                                       |
| Qué cambió desde la última planilla         | Cocina, arriba del consolidado                 | Pedidos nuevos, cancelados y cambiados desde la última que salió. Un cancelado que estaba en la planilla y no pasó al stock se marca en rojo.                          |
| Volver a bajar una planilla tal como salió  | Cocina → "Planillas enviadas"                  | Para ver exactamente qué se mandó a producción.                                                                                                                        |
| Aviso al cancelar                           | Diálogo de cancelar                            | Si el pedido ya salió en una planilla, lo dice y deja tildado "Pasar las viandas a stock".                                                                             |
| Corregir después                            | Ficha del pedido cancelado                     | "Pasar sus viandas a stock" (`POST /api/v1/orders/:id/to-stock`).                                                                                                      |
| El informe lo muestra                       | Informe del período                            | Hoja "Cancelados": uno por uno, si salió en la planilla y si pasó al stock ("No — revisar" cuando salió y no pasó). En el resumen, los cancelados ya cocinados aparte. |
| El pie de la lista no confunde              | Pedidos                                        | Con la lista partida, el pie muestra los totales de todo lo filtrado (desde el servidor), con el mismo criterio que el informe.                                        |

### Pendiente de producción

`pnpm db:migrate --produccion` (0075 y 0076), `pnpm db:seed-help --produccion`,
`pnpm db:seed-release-notes --produccion`. Las planillas se anotan desde el deploy en adelante: las de
antes no tienen registro.
