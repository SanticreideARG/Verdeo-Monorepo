-- Diagnóstico del stock viejo (STOCK_COMO_PEDIDO_PLAN.md, sección 9). SÓLO LECTURA.
--
-- Antes de pasar el stock a pedidos, hay que saber qué hay cargado de cada una de las cinco formas
-- en que se manejó: pedidos del cliente "STOCK", "Stock para el cierre" (production_stock), sus bajas
-- (surplus_writeoffs), los lotes de períodos anteriores (stock_lots) y las ventas desde el stock.
--
-- Cómo se corre: en el editor SQL de Neon, todo junto. Va dentro de una transacción de sólo lectura
-- que termina en ROLLBACK: si por error hubiera algo que escribe, la base lo rechaza. No cambia nada.
-- Cada consulta muestra un resultado; copiá o descargá cada uno (o sacales captura) y pasámelos.
--
-- Los resultados no traen nombres, teléfonos ni domicilios de clientes: sólo números de pedido,
-- períodos, ciudades, variedades y cantidades.

BEGIN TRANSACTION READ ONLY;

-- 1. RESUMEN: cuánto hay de cada forma de stock ---------------------------------------------------
with stock_customers as (
  select id from customers where upper(trim(display_name)) = 'STOCK'
),
lot_sold as (
  select oi.stock_lot_id, sum(oi.quantity_units)::int as sold
  from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'CANCELLED'
  where oi.stock_lot_id is not null
  group by oi.stock_lot_id
)
select '1. Pedidos del cliente STOCK (no cancelados)' as origen,
       count(distinct o.id)::int as registros,
       coalesce(sum(oi.quantity_units), 0)::int as viandas,
       round(coalesce(sum(oi.total_minor), 0) / 100.0, 2) as importe_pesos
from orders o
join order_items oi on oi.order_id = o.id
where o.customer_id in (select id from stock_customers) and o.status <> 'CANCELLED'
union all
select '2. Stock para el cierre (production_stock)', count(*)::int, coalesce(sum(quantity_units), 0)::int, null
from production_stock
union all
select '3. Bajas del stock (surplus_writeoffs)', count(*)::int, coalesce(sum(quantity_units), 0)::int, null
from surplus_writeoffs
union all
select '4. Lotes de períodos anteriores: cargado', count(*)::int, coalesce(sum(quantity_units), 0)::int, null
from stock_lots
union all
select '4b. Lotes: vendido desde pedidos', count(*)::int, coalesce(sum(sold), 0)::int, null
from lot_sold
union all
select '4c. Lotes: disponible sin vencer',
       count(*) filter (where l.quantity_units - l.written_off_units - coalesce(s.sold, 0) > 0)::int,
       coalesce(sum(greatest(l.quantity_units - l.written_off_units - coalesce(s.sold, 0), 0))
                filter (where l.expires_at >= now()), 0)::int,
       null
from stock_lots l left join lot_sold s on s.stock_lot_id = l.id
where l.expires_at >= now()
union all
select '4d. Lotes: disponible ya vencido',
       count(*)::int,
       coalesce(sum(greatest(l.quantity_units - l.written_off_units - coalesce(s.sold, 0), 0)), 0)::int,
       null
from stock_lots l left join lot_sold s on s.stock_lot_id = l.id
where l.expires_at < now() and l.quantity_units - l.written_off_units - coalesce(s.sold, 0) > 0
union all
select '5. Ventas desde el stock del período (opportunity_sale, no canceladas)',
       count(distinct o.id)::int, coalesce(sum(oi.quantity_units), 0)::int,
       round(coalesce(sum(oi.total_minor), 0) / 100.0, 2)
from orders o join order_items oi on oi.order_id = o.id
where o.source = 'opportunity_sale' and o.status <> 'CANCELLED'
union all
select '6. Pedidos cancelados que pasaron a stock', count(*)::int, null, round(coalesce(sum(total_minor), 0) / 100.0, 2)
from orders where cancelled_to_stock;

-- 2. PEDIDOS DEL CLIENTE "STOCK" que siguen vivos (los que hay que resolver a mano) --------------
-- "Vivo": no cancelado, y todavía sin entregar o de un período que no terminó.
select o.public_number as pedido,
       sc.alias as periodo,
       sc.status as estado_periodo,
       os.display_name as ciudad,
       o.status as estado_pedido,
       o.delivery_date as entrega,
       o.payment_expectation as medio_de_pago,
       (o.paid_at is not null) as cobrado,
       round(o.total_minor / 100.0, 2) as importe_pesos,
       string_agg(oi.product_name_snapshot || ' ' || oi.variant_snapshot || ' × ' || oi.quantity_units, ', '
                  order by oi.product_name_snapshot) as viandas
from orders o
join sales_cycles sc on sc.id = o.sales_cycle_id
join operating_sites os on os.id = o.operating_site_id
join order_items oi on oi.order_id = o.id
where o.customer_id in (select id from customers where upper(trim(display_name)) = 'STOCK')
  and o.status <> 'CANCELLED'
  and (o.status <> 'DELIVERED' or sc.close_at >= now())
group by o.id, sc.alias, sc.status, sc.open_at, os.display_name
order by sc.open_at desc, os.display_name, o.public_number;

-- 3. PEDIDOS DEL CLIENTE "STOCK" por período (el histórico, para saber cuánto hay) --------------
select sc.alias as periodo,
       sc.status as estado_periodo,
       os.display_name as ciudad,
       count(distinct o.id)::int as pedidos,
       count(distinct o.id) filter (where o.status = 'CANCELLED')::int as cancelados,
       count(distinct o.id) filter (where o.paid_at is not null)::int as cobrados,
       sum(oi.quantity_units) filter (where o.status <> 'CANCELLED')::int as viandas,
       round(coalesce(sum(oi.total_minor) filter (where o.status <> 'CANCELLED'), 0) / 100.0, 2) as importe_pesos
from orders o
join sales_cycles sc on sc.id = o.sales_cycle_id
join operating_sites os on os.id = o.operating_site_id
join order_items oi on oi.order_id = o.id
where o.customer_id in (select id from customers where upper(trim(display_name)) = 'STOCK')
group by sc.alias, sc.status, sc.open_at, os.display_name
order by sc.open_at desc, os.display_name;

-- 4. STOCK PARA EL CIERRE y sus bajas, por período, ciudad y variedad ---------------------------
select sc.alias as periodo,
       sc.status as estado_periodo,
       coalesce(os.display_name, '(sin ciudad)') as ciudad,
       coalesce(ps.family_name, w.family_name) as variedad,
       coalesce(ps.variant_name, w.variant_name) as tamano,
       coalesce(ps.cargado, 0) as cargado,
       coalesce(w.bajas, 0) as bajas,
       ps.origenes
from (
  select sales_cycle_id, operating_site_id, family_name, variant_name,
         sum(quantity_units)::int as cargado, string_agg(distinct origin, ', ') as origenes
  from production_stock group by 1, 2, 3, 4
) ps
full join (
  select sales_cycle_id, operating_site_id, family_name, variant_name, sum(quantity_units)::int as bajas
  from surplus_writeoffs group by 1, 2, 3, 4
) w on w.sales_cycle_id = ps.sales_cycle_id
   and w.operating_site_id is not distinct from ps.operating_site_id
   and w.family_name = ps.family_name and w.variant_name = ps.variant_name
join sales_cycles sc on sc.id = coalesce(ps.sales_cycle_id, w.sales_cycle_id)
left join operating_sites os on os.id = coalesce(ps.operating_site_id, w.operating_site_id)
order by sc.open_at desc, ciudad, variedad, tamano;

-- 5. LOTES DE PERÍODOS ANTERIORES: cargado, vendido, dado de baja, disponible y vencimiento ------
with lot_sold as (
  select oi.stock_lot_id, sum(oi.quantity_units)::int as sold
  from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'CANCELLED'
  where oi.stock_lot_id is not null
  group by oi.stock_lot_id
)
select sc.alias as periodo,
       os.display_name as ciudad,
       l.family_name as variedad,
       l.variant_name as tamano,
       l.notes as nombre,
       (l.dish_selections is not null) as es_intuitivo,
       (l.source_order_id is not null) as viene_de_pedido_cancelado,
       l.quantity_units as cargado,
       coalesce(s.sold, 0) as vendido,
       l.written_off_units as bajas,
       l.quantity_units - l.written_off_units - coalesce(s.sold, 0) as disponible,
       l.expires_at::date as vence,
       case when l.expires_at < now() then 'vencido' else 'vigente' end as estado
from stock_lots l
join sales_cycles sc on sc.id = l.sales_cycle_id
join operating_sites os on os.id = l.operating_site_id
left join lot_sold s on s.stock_lot_id = l.id
order by (l.expires_at < now()), l.expires_at, os.display_name;

-- 6. CONTROLES: cosas que no deberían pasar y que la migración tiene que contemplar --------------
select 'Stock para el cierre sin ciudad (la 0077 debió asignarla)' as control, count(*)::int as casos
from production_stock where operating_site_id is null
union all
select 'Bajas sin ciudad', count(*)::int from surplus_writeoffs where operating_site_id is null
union all
select 'Lotes con más vendido + bajas que cargado', count(*)::int
from stock_lots l
where l.quantity_units < l.written_off_units + coalesce((
  select sum(oi.quantity_units) from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'CANCELLED'
  where oi.stock_lot_id = l.id), 0)
union all
select 'Pedidos del cliente STOCK marcados como cobrados', count(*)::int
from orders
where customer_id in (select id from customers where upper(trim(display_name)) = 'STOCK') and paid_at is not null
union all
select 'Pedidos del cliente STOCK en una hoja de ruta', count(*)::int
from orders
where customer_id in (select id from customers where upper(trim(display_name)) = 'STOCK') and delivery_run_id is not null
union all
select 'Clientes llamados STOCK', count(*)::int
from customers where upper(trim(display_name)) = 'STOCK'
union all
select 'Ventas desde el stock en períodos abiertos', count(*)::int
from orders o join sales_cycles sc on sc.id = o.sales_cycle_id
where o.source = 'opportunity_sale' and o.status <> 'CANCELLED' and sc.status <> 'CLOSED';

ROLLBACK;
