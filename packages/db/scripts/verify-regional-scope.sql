-- Verification for migrations 0008 and 0009. Read-only: it inspects, it never writes.
--
--   psql "$DATABASE_URL" -f packages/db/scripts/verify-regional-scope.sql
--
-- Every row must report PASS. A FAIL means the backfill left data the new model cannot represent,
-- and neither migration has a down script, so the response is to restore the snapshot.

\echo '== Mandatory columns =='

select 'variants without size' as check,
       count(*) as found,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result
from product_variants where product_size_id is null
union all
select 'addresses without zone', count(*),
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from customer_addresses where geographic_zone_id is null
union all
select 'orders without operation', count(*),
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from orders where operating_site_id is null
union all
select 'orders whose zone belongs to another operation', count(*),
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from orders o
join geographic_zones z on z.id = o.geographic_zone_id
where z.operating_site_id <> o.operating_site_id
union all
select 'operations without an order counter', count(*),
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from operating_sites s
where not exists (select 1 from operating_site_order_counters c where c.operating_site_id = s.id)
union all
select 'customers without a membership', count(*),
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from customers c
where not exists (select 1 from customer_operating_sites m where m.customer_id = c.id)
union all
select 'active users without a membership', count(*),
       case when count(*) = 0 then 'WARN: they will only see what sites.access_all grants' else 'PASS' end
from users u
where u.status = 'active'
  and not exists (select 1 from user_operating_sites m where m.user_id = u.id);

\echo ''
\echo '== Price model: every surviving row here is a deliberate per-variety exception =='

select f.display_name as variety,
       s.code as size,
       o.unit_price_minor as override_minor,
       p.unit_price_minor as size_price_minor
from weekly_menu_offerings o
join product_variants v on v.id = o.product_variant_id
join product_families f on f.id = v.product_family_id
join product_sizes s on s.id = v.product_size_id
left join weekly_menu_prices p
       on p.weekly_menu_id = o.weekly_menu_id and p.product_size_id = v.product_size_id
where o.unit_price_minor is not null
order by f.display_name, s.code;

\echo ''
\echo '== Composable variety: exactly one COMPOSABLE family is expected =='

select code, display_name, kind from product_families order by kind desc, code;

\echo ''
\echo '== Regional numbering: the initial operation must resume above its historical series =='

select s.display_name, s.order_prefix, c.last_order_number,
       (select count(*) from orders o where o.operating_site_id = s.id) as orders_held
from operating_site_order_counters c
join operating_sites s on s.id = c.operating_site_id
order by s.sort_order, s.display_name;

\echo ''
\echo '== Operator follow-up: addresses still parked in the migration zone =='

select z.display_name as zone,
       s.display_name as operation,
       count(a.id) as addresses_to_reclassify
from geographic_zones z
join operating_sites s on s.id = z.operating_site_id
left join customer_addresses a on a.geographic_zone_id = z.id
where z.slug = 'sin-clasificar'
group by z.display_name, s.display_name;
