-- Limpieza de los datos de prueba antes del arranque de producción, para el SQL Editor de Neon.
--
-- Hace lo mismo que `pnpm db:purge-test-data` (packages/db/src/purge-test-data.ts):
--   * conserva el período en curso (el que contiene este momento; si no hay, el último que empezó)
--     y todo lo cargado para él;
--   * borra los períodos anteriores con sus menús, pedidos, cobros, rendiciones, conciliaciones,
--     paradas, las rutas que quedan vacías y la producción;
--   * borra los clientes creados antes del período en curso que no tienen pedidos que queden;
--   * renumera los pedidos que quedan desde 00001 por ciudad y deja el contador en el último;
--   * deja un evento en la auditoría.
--
-- PASO 1 — VISTA PREVIA: correr sólo la consulta de abajo. No cambia nada.
-- PASO 2 — BORRADO: correr el bloque BEGIN … COMMIT. Bajar antes un respaldo (/app/respaldos).

-- ===================================== PASO 1 ===============================================
with kept as (
  select id, alias, open_at from sales_cycles
  where open_at <= now()
  order by (close_at >= now()) desc, open_at desc
  limit 1
),
old_cycles as (
  select c.id, c.alias, c.open_at from sales_cycles c, kept k
  where c.open_at < k.open_at and c.id <> k.id
),
old_orders as (
  select o.id from orders o where o.sales_cycle_id in (select id from old_cycles)
)
select 1 as orden, 'SE CONSERVA el período' as que, alias as detalle, open_at::date::text as fecha
from kept
union all
select 2, 'se borra el período', alias, open_at::date::text from old_cycles
union all
select 3, 'pedidos que se borran', count(*)::text, null from old_orders
union all
select 4, 'se borra el cliente', cu.display_name, cu.created_at::date::text
from customers cu, kept k
where cu.created_at < k.open_at
  and not exists (
    select 1 from orders o where o.customer_id = cu.id and o.id not in (select id from old_orders))
union all
select 5, 'se CONSERVA (cargado antes, pero pidió en el período)', cu.display_name,
  cu.created_at::date::text
from customers cu, kept k
where cu.created_at < k.open_at
  and exists (
    select 1 from orders o where o.customer_id = cu.id and o.id not in (select id from old_orders))
union all
select 6, 'renumeración', public_number || ' → ' || nuevo, null
from (
  select o.public_number, s.order_prefix || '-' || lpad(
      (row_number() over (partition by o.operating_site_id order by o.created_at, o.id))::text,
      5, '0') as nuevo
  from orders o join operating_sites s on s.id = o.operating_site_id
  where o.id not in (select id from old_orders)
) r
where public_number <> nuevo
order by 1, 3;

-- ===================================== PASO 2 ===============================================
BEGIN;

create temp table purge_kept on commit drop as
select id, alias, open_at from sales_cycles
where open_at <= now()
order by (close_at >= now()) desc, open_at desc
limit 1;

create temp table purge_cycles on commit drop as
select c.id, c.alias from sales_cycles c, purge_kept k
where c.open_at < k.open_at and c.id <> k.id;

create temp table purge_orders on commit drop as
select id from orders where sales_cycle_id in (select id from purge_cycles);

-- Lo que impide borrar un pedido (restrict): rendiciones, cobros, conciliaciones y paradas.
delete from cash_settlements where collection_id in (
  select id from cash_collections where order_id in (select id from purge_orders));
delete from cash_collections where order_id in (select id from purge_orders);
delete from transfer_reconciliations where order_id in (select id from purge_orders);
delete from delivery_stops where order_id in (select id from purge_orders);
-- Las rutas que quedaron vacías y son de antes del período en curso.
delete from delivery_routes r
where r.delivery_date < (select open_at::date from purge_kept)
  and not exists (select 1 from delivery_stops s where s.route_id = r.id);
-- Ítems, historial, revisiones, pagos e indicaciones se van en cascada con el pedido.
delete from orders where id in (select id from purge_orders);
delete from weekly_menus where sales_cycle_id in (select id from purge_cycles);
-- Producción real, fotos y bajas de excedente se van en cascada con el período.
delete from sales_cycles where id in (select id from purge_cycles);

-- Clientes ficticios: cargados antes del período en curso y sin pedidos que queden.
create temp table purge_customers on commit drop as
select c.id from customers c, purge_kept k
where c.created_at < k.open_at
  and not exists (select 1 from orders o where o.customer_id = c.id);
-- Las conversaciones apuntan a la identidad con restrict: se van antes que el cliente.
delete from messaging_conversations
where customer_id in (select id from purge_customers)
   or customer_identity_id in (
     select id from customer_identities where customer_id in (select id from purge_customers));
delete from customers where id in (select id from purge_customers);

-- Renumerar desde 00001 por ciudad, en el orden en que se cargaron. En dos pasos: el número es
-- único y pasar directo de 00118 a 00001 puede chocar con otro.
update orders set public_number = 'TMP-' || id::text;
update orders o set public_number = n.nuevo
from (
  select o2.id, s.order_prefix || '-' || lpad(
      (row_number() over (partition by o2.operating_site_id order by o2.created_at, o2.id))::text,
      5, '0') as nuevo
  from orders o2 join operating_sites s on s.id = o2.operating_site_id
) n
where n.id = o.id;
insert into operating_site_order_counters (operating_site_id, last_order_number)
select s.id, (select count(*) from orders o where o.operating_site_id = s.id)::int
from operating_sites s
on conflict (operating_site_id) do update
  set last_order_number = excluded.last_order_number, updated_at = now();

-- La auditoría no se borra: la limpieza deja su propio evento.
insert into audit_events (actor_type, action, entity_type, entity_id, after, metadata,
                          request_id, correlation_id, source)
select 'system', 'maintenance.test_data_purged', 'sales_cycle', k.id::text,
  jsonb_build_object(
    'cycles', (select count(*) from purge_cycles),
    'orders', (select count(*) from purge_orders),
    'customers', (select count(*) from purge_customers)),
  jsonb_build_object(
    'keptCycle', k.alias,
    'deletedCycles', (select coalesce(jsonb_agg(alias), '[]'::jsonb) from purge_cycles)),
  gen_random_uuid()::text, gen_random_uuid()::text, 'neon-sql-editor'
from purge_kept k;

COMMIT;
