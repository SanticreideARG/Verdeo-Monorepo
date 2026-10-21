-- Pasar a la ficha del cliente las direcciones que quedaron sólo en sus pedidos (2026-10-20).
--
-- Hasta la versión de esta fecha, la dirección escrita al cargar un pedido se guardaba sólo en el
-- pedido: el cliente quedaba sin domicilio en su ficha. Pasó sobre todo en Córdoba, que no tenía
-- zonas (un domicilio necesita zona). Esto crea los domicilios que faltan a partir de esos pedidos
-- y ata cada pedido al suyo. Desde esa versión ya no hace falta: el pedido lo hace solo.
--
-- Sólo toma las ciudades que tienen **exactamente una zona activa**: con una sola no hay dudas de
-- dónde va el domicilio. Si una ciudad tiene varias, sus pedidos quedan como están y se resuelven
-- desde el asistente de ubicaciones. Crear antes la zona de Córdoba (Panel de control → Zonas).
--
-- Se corre en el editor SQL de Neon, en dos pasos. Bajar antes un respaldo (/app/respaldos).
--
-- PASO 1 — VISTA PREVIA: correr sólo el SELECT. No cambia nada.
-- PASO 2 — CORRER el bloque BEGIN … COMMIT.

-- PASO 1 ----------------------------------------------------------------------------------------
with single_zone as (
  select operating_site_id, min(id::text)::uuid as zone_id
  from geographic_zones
  where active
  group by operating_site_id
  having count(*) = 1
)
select s.display_name as ciudad, count(*) as pedidos_sin_domicilio,
       count(distinct o.customer_id) as clientes
from orders o
join single_zone z on z.operating_site_id = o.operating_site_id
join operating_sites s on s.id = o.operating_site_id
where o.delivery_address_id is null
  and o.status <> 'CANCELLED'
  and trim(o.delivery_address_snapshot) <> ''
group by s.display_name
order by s.display_name;

-- PASO 2 ----------------------------------------------------------------------------------------
begin;

-- Un domicilio por cliente y dirección (sin repetir las que el cliente ya tiene), con lo último que
-- se escribió de la línea 2 y del enlace de ubicación.
with single_zone as (
  select operating_site_id, min(id::text)::uuid as zone_id
  from geographic_zones
  where active
  group by operating_site_id
  having count(*) = 1
),
pending as (
  select distinct on (o.customer_id, lower(regexp_replace(trim(o.delivery_address_snapshot), '\s+', ' ', 'g')))
         o.customer_id,
         z.zone_id,
         regexp_replace(trim(o.delivery_address_snapshot), '\s+', ' ', 'g') as written,
         o.delivery_address_line2 as line2,
         o.delivery_location_url_snapshot as location_url
  from orders o
  join single_zone z on z.operating_site_id = o.operating_site_id
  where o.delivery_address_id is null
    and o.status <> 'CANCELLED'
    and trim(o.delivery_address_snapshot) <> ''
    and not exists (
      select 1 from customer_addresses a
      where a.customer_id = o.customer_id and a.active
        and lower(regexp_replace(trim(a.written_address), '\s+', ' ', 'g'))
          = lower(regexp_replace(trim(o.delivery_address_snapshot), '\s+', ' ', 'g'))
    )
  order by o.customer_id, lower(regexp_replace(trim(o.delivery_address_snapshot), '\s+', ' ', 'g')),
           o.created_at desc
)
insert into customer_addresses (customer_id, geographic_zone_id, label, written_address, unit,
                                location_url, "primary", source, geocoding_status)
select customer_id, zone_id, 'Pedido', written, line2, location_url, false, 'order', 'NEEDS_LOCATION'
from pending;

-- El cliente que no tenía ningún domicilio principal pasa a tener como principal el más reciente.
with latest as (
  select distinct on (a.customer_id) a.id
  from customer_addresses a
  where a.active and a.source = 'order'
    and not exists (
      select 1 from customer_addresses p
      where p.customer_id = a.customer_id and p.active and p."primary"
    )
  order by a.customer_id, a.created_at desc
)
update customer_addresses set "primary" = true where id in (select id from latest);

-- Cada pedido, atado al domicilio con su misma dirección, de la misma ciudad.
update orders o
set delivery_address_id = a.id,
    geographic_zone_id = coalesce(o.geographic_zone_id, a.geographic_zone_id),
    updated_at = now()
from customer_addresses a
join geographic_zones z on z.id = a.geographic_zone_id
where o.delivery_address_id is null
  and o.status <> 'CANCELLED'
  and a.customer_id = o.customer_id
  and a.active
  and z.operating_site_id = o.operating_site_id
  and lower(regexp_replace(trim(a.written_address), '\s+', ' ', 'g'))
    = lower(regexp_replace(trim(o.delivery_address_snapshot), '\s+', ' ', 'g'));

commit;
