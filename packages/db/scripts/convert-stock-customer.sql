-- Convertir el "cliente" STOCK en stock del período (STOCK_PLAN.md, regla 6).
--
-- Hasta ahora el stock se cargaba como pedidos de un cliente llamado STOCK, y por eso sumaba a las
-- ventas, aparecía en pedidos, en etiquetas con cliente, en repartos y en rutas. Esto pasa sus
-- pedidos del período en curso a la tabla de stock (production_stock), borra esos pedidos y archiva
-- el cliente. Lo que se cocina no cambia: los mismos números pasan de "pedidos" a "stock".
--
-- Se corre en el editor SQL de Neon, en dos pasos. Requiere la migración 0061.
--
-- PASO 1 — VISTA PREVIA: correr sólo el SELECT de abajo. No cambia nada. Mirar que el cliente,
-- el período y las cantidades sean los esperados.
--
-- PASO 2 — CONVERSIÓN: correr el bloque BEGIN … COMMIT. Bajar antes un respaldo (/app/respaldos).
--
-- Los pedidos de períodos anteriores no se tocan: el stock es sólo de su período.

-- PASO 1 ----------------------------------------------------------------------------------------
with kept as (
  select id, alias from sales_cycles
  where open_at <= now()
  order by (close_at >= now()) desc, open_at desc
  limit 1
),
stock_customers as (
  select id, display_name from customers where upper(trim(display_name)) = 'STOCK'
),
stock_orders as (
  select o.id, o.public_number from orders o
  where o.customer_id in (select id from stock_customers)
    and o.sales_cycle_id = (select id from kept)
    and o.status <> 'CANCELLED'
)
select 'período' as que, (select alias from kept) as detalle, null::int as unidades
union all
select 'cliente', string_agg(display_name || ' (' || id::text || ')', ', '), null
from stock_customers
union all
select 'pedidos', string_agg(public_number, ', ' order by public_number), count(*)::int
from stock_orders
union all
select 'stock: ' || i.product_name_snapshot || ' ' || i.variant_snapshot, null,
  sum(i.quantity_units)::int
from order_items i
where i.order_id in (select id from stock_orders)
group by i.product_name_snapshot, i.variant_snapshot;

-- PASO 2 ----------------------------------------------------------------------------------------
BEGIN;

create temp table stock_kept on commit drop as
select id, alias from sales_cycles
where open_at <= now()
order by (close_at >= now()) desc, open_at desc
limit 1;

create temp table stock_customers on commit drop as
select id from customers where upper(trim(display_name)) = 'STOCK';

create temp table stock_orders on commit drop as
select o.id from orders o
where o.customer_id in (select id from stock_customers)
  and o.sales_cycle_id = (select id from stock_kept)
  and o.status <> 'CANCELLED';

-- Las cantidades, sumadas a lo que ya hubiera cargado desde Cocina.
insert into production_stock (sales_cycle_id, family_name, variant_name, quantity_units, notes)
select k.id, i.product_name_snapshot, i.variant_snapshot, sum(i.quantity_units)::int,
  'Convertido del cliente STOCK'
from order_items i, stock_kept k
where i.order_id in (select id from stock_orders)
group by k.id, i.product_name_snapshot, i.variant_snapshot
having sum(i.quantity_units) > 0
on conflict (sales_cycle_id, family_name, variant_name) do update
  set quantity_units = production_stock.quantity_units + excluded.quantity_units,
      updated_at = now();

-- Lo que impide borrar un pedido (restrict): rendiciones, cobros, conciliaciones y paradas.
delete from cash_settlements where collection_id in (
  select id from cash_collections where order_id in (select id from stock_orders));
delete from cash_collections where order_id in (select id from stock_orders);
delete from transfer_reconciliations where order_id in (select id from stock_orders);
delete from delivery_stops where order_id in (select id from stock_orders);
-- Ítems, historial, revisiones, pagos e indicaciones se van en cascada con el pedido. Los números
-- de pedido no se renumeran: quedan huecos, pero ningún número ya comunicado cambia.
delete from orders where id in (select id from stock_orders);

-- El cliente queda archivado, no borrado: sus pedidos de otros períodos lo siguen nombrando.
update customers set status = 'archived', updated_at = now()
where id in (select id from stock_customers);

insert into audit_events (actor_type, action, entity_type, entity_id, after, metadata,
                          request_id, correlation_id, source)
select 'system', 'production.stock_customer_converted', 'sales_cycle', k.id::text,
  jsonb_build_object(
    'orders', (select count(*) from stock_orders),
    'stock', (select coalesce(jsonb_agg(jsonb_build_object(
        'familyName', s.family_name, 'variantName', s.variant_name,
        'quantityUnits', s.quantity_units)), '[]'::jsonb)
      from production_stock s where s.sales_cycle_id = k.id)),
  jsonb_build_object('cycle', k.alias,
    'customers', (select coalesce(jsonb_agg(id), '[]'::jsonb) from stock_customers)),
  gen_random_uuid()::text, gen_random_uuid()::text, 'neon-sql-editor'
from stock_kept k;

COMMIT;
