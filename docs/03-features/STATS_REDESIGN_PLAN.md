# Estadísticas renovadas (2026-10-28)

## Objetivo

Darle a Estadísticas una lectura más clara y una base para crecer:

- indicadores arriba;
- un carrusel de gráficos en lugar del gráfico único;
- un feed de eventos ("Lo que pasó");
- un análisis contable por período y ciudad.

## Pantalla

1. **Indicadores**: Pedidos, Vendido, Cobrado (%), Ticket promedio y Clientes.
   - Con "Desde" y "Hasta" cargados, cada uno se compara solo con el mismo largo de tiempo justo antes. Ya no hay casilla "Comparar".
   - Sin rango no hay comparación: sería todo el historial contra nada.
   - "Cobrado" no lleva comparación: un porcentaje contra otro porcentaje confunde más de lo que dice.
2. **Carrusel** (`StatsHeroCarousel`).
   - Muestra un gráfico a la vez y pasa solo cada 7 segundos, con fundido y deslizamiento.
   - Se frena con el mouse encima, con el foco adentro o con la pausa. Se maneja con las flechas.
   - Con "menos movimiento" pedido al sistema, arranca en pausa y sin transición.
   - Gráficos:
     - ingresos por fecha de entrega;
     - ventas por período;
     - cobrado y por cobrar;
     - clientes nuevos y recurrentes;
     - mezcla de menús (al 100%: los 4 menús con más unidades y "Otros").
   - Los gráficos por período muestran los últimos 8 períodos del filtro.
3. **Lo que pasó** (`StatsEventsFeed`): al lado del carrusel en pantalla ancha, debajo en una angosta.
4. **Demanda**: las tortas por variedad y por tamaño, como antes.
5. **Análisis contable** (`StatsAccountingTable`): reemplaza "Por zona" y "Por semana".
   - Tiene una fila por período y ciudad, más el total.
   - Al tocar una fila se abre el detalle por medio de pago, con clientes, unidades, ticket y cancelados a stock.
   - Se descarga en Excel.

## Criterio contable

Es el mismo del informe del período (`cycleReport`). Si dieran distinto, ninguno de los dos serviría.

| Columna               | Cálculo                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Bruto                 | Σ precio unitario × cantidad de los ítems                                                                                        |
| Descuentos / Recargos | Σ de los ítems. Recargos solo aparece si alguna fila tiene                                                                       |
| Ajustes               | Neto − (bruto − descuentos + recargos). Solo aparece si no da cero                                                               |
| Neto vendido          | Σ total del pedido, sin cancelados ni cliente STOCK                                                                              |
| Cobrado               | Neto de los pedidos con `paid_at`                                                                                                |
| Por cobrar            | Neto − cobrado                                                                                                                   |
| Desde stock           | Ítems atados a un lote (`stock_lot_id`). Solo aparece si alguna fila tiene                                                       |
| Cancelados            | Monto y cantidad. **No suman**                                                                                                   |
| Cancelados a stock    | Cancelados ya cocinados que pasaron al stock                                                                                     |
| Nuevos                | Clientes cuyo **primer pedido de su historia** es de ese período, para que achicar las fechas no vuelva nuevos a clientes viejos |

Los filtros son los mismos del resto de la página: fechas de entrega y ciudad.

**Límite:** no se guardan costos, así que no hay margen ni ganancia. Es la parte de ingresos y cobranza.

## Eventos ("Lo que pasó")

Se calculan al momento, sin tabla, sobre el período en curso: el que eligen los consejos del tablero.

| Tipo     | Cuándo aparece                                                                                                                                               | Tono         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Cocina   | Cancelados que salieron en una planilla y no pasaron al stock (caso 2026-10-28)                                                                              | rojo         |
| Ausentes | Clientes que pidieron los 3 períodos anteriores y en este no                                                                                                 | rojo         |
| Cobro    | Pedidos sin efectivo sin cobrar, a 2 días del cierre o después                                                                                               | ámbar        |
| Mezcla   | Un menú pasa la mitad de las unidades. O cae a dos tercios o menos (con al menos 6 unidades antes, y solo cuando el período ya juntó tanto como el anterior) | azul / ámbar |
| Récord   | Más pedidos, o mejor ticket (con 5 pedidos o más), que todos los anteriores. Hacen falta al menos 3 para comparar                                            | verde        |
| Hito     | Cruzar un múltiplo de 25 clientes. Primer período con pedidos en una ciudad                                                                                  | verde        |

Lo urgente va primero.

## API

- `GET /api/v1/stats/periods`: filas por período y ciudad, más la mezcla por período. Con `?format=xlsx` baja un Excel con dos hojas: "Por período y ciudad" y "Por medio de pago". Pide `stats.read`.
- `GET /api/v1/stats/events`: los eventos. Pide `stats.read` y respeta la ciudad.

## Etapa 2 (pendiente)

- Guardar los eventos: historial, "visto" por persona y aviso de los importantes.
- Margen: cargar costos por vianda o gastos por período.
