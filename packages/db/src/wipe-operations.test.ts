import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import * as schema from './schema/index.js';
import { countOperations, findLatestCycle, wipeOperations } from './wipe-operations.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const SITE = 'a0000000-0000-4000-8000-000000000009';
const ZONE = '0d000000-0000-4000-8000-000000000001';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const ADDRESS = '0c000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ORDER = '0a000000-0000-4000-8000-000000000001';
const ROUTE = '0b000000-0000-4000-8000-000000000011';
const USER = 'f0000000-0000-4000-8000-000000000001';
const OLD_CYCLE = 'd0000000-0000-4000-8000-000000000002';
const OLD_MENU = 'e0000000-0000-4000-8000-000000000002';
const OLD_OFFERING = 'f3000000-0000-4000-8000-000000000002';
const FAMILY = '0b000000-0000-4000-8000-000000000001';
const SIZE = '0e000000-0000-4000-8000-000000000001';
const VARIANT = '0f000000-0000-4000-8000-000000000001';
const SURVEY = '0b000000-0000-4000-8000-000000000021';

/*
 * La semilla pone algo en cada una de las cuatro `restrict` que el borrado tiene que saltear
 * —pedido, parada, cobro, rendición— más lo que cuelga por `cascade`. Sin una fila en cada barrera
 * el test pasaría igual con un orden equivocado, que es exactamente lo que no queremos.
 */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix, origin_latitude, origin_longitude)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP', 0, 0);
  insert into geographic_zones (id, operating_site_id, slug, display_name)
  values ('${ZONE}', '${SITE}', 'centro', 'Centro');
  insert into users (id, display_name) values ('${USER}', 'Isabella');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'Ana Gómez');
  insert into customer_identities (customer_id, type, value_normalized, value_display)
  values ('${CUSTOMER}', 'whatsapp', '5492995550101', '+54 9 299 555 0101');
  insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id,
                                  operational_zone)
  values ('${ADDRESS}', '${CUSTOMER}', 'Casa', 'Calle 1', '${ZONE}', 'Centro');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_id, delivery_address_snapshot,
                      payment_expectation, total_minor, operating_site_id)
  values ('${ORDER}', 'CIP-00001', '${CUSTOMER}', '${CYCLE}', '${MENU}', 'web', 'DELIVERED',
          '2026-08-26', '${ADDRESS}', 'Calle 1', 'Efectivo', 25000, '${SITE}');

  insert into product_families (id, code, display_name, kind)
  values ('${FAMILY}', 'keto', 'Menú Keto', 'FIXED');
  insert into product_sizes (id, code, display_name) values ('${SIZE}', '400', '400 g');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('${VARIANT}', '${FAMILY}', '${SIZE}', 'keto-400', 'Keto 400');
  insert into order_items (order_id, product_variant_id, product_name_snapshot, variant_snapshot,
                           quantity_units, unit_price_minor, total_minor)
  values ('${ORDER}', '${VARIANT}', 'Menú Keto', '400', 1, 25000, 25000);

  -- Un período más viejo, cargado DESPUÉS del más nuevo. "El último cargado" por orden de alta
  -- sería éste; por fecha de cierre es Semana 34. Es la distinción que el comando tiene que hacer.
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${OLD_CYCLE}', 'Semana 33', '2026-08-13T12:00:00Z', '2026-08-18T23:00:00Z',
          '2026-08-19T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${OLD_MENU}', '${OLD_CYCLE}', 'PUBLISHED');
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
  values ('${OLD_OFFERING}', '${OLD_MENU}', '${VARIANT}');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor)
  values ('${OLD_MENU}', '${SIZE}', 2500000);

  insert into delivery_routes (id, operating_site_id, delivery_date, status)
  values ('${ROUTE}', '${SITE}', '2026-08-26', 'published');
  insert into delivery_stops (route_id, order_id, sequence, status)
  values ('${ROUTE}', '${ORDER}', 1, 'delivered');

  insert into cash_collections (id, order_id, amount_minor, method, collected_by_user_id)
  values ('0b000000-0000-4000-8000-000000000031', '${ORDER}', 25000, 'efectivo', '${USER}');
  insert into cash_settlements (collection_id, amount_minor, settled_by_user_id, received_by_user_id)
  values ('0b000000-0000-4000-8000-000000000031', 25000, '${USER}', '${USER}');

  insert into surveys (id, title) values ('${SURVEY}', 'Cómo estuvo');
  insert into survey_responses (survey_id, customer_id) values ('${SURVEY}', '${CUSTOMER}');

  insert into messaging_webhook_events (external_id, payload)
  values ('wamid.test', '{"from":"5492995550101","text":"hola"}'::jsonb);

  insert into manual_notices (customer_id, order_id, body, status, template_key)
  values ('${CUSTOMER}', '${ORDER}', 'Hola Ana', 'sent', 'aviso-semanal');
`;

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function sembrada(): Promise<{ client: PGlite; db: Database }> {
  const client = new PGlite();
  await client.waitReady;
  for (const file of readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
      await client.exec(statement);
    }
  }
  await client.exec(seed);
  close = () => client.close();
  return { client, db: drizzle(client, { schema }) as unknown as Database };
}

async function cuantos(client: PGlite, tabla: string, donde = 'true'): Promise<number> {
  const result = await client.query<{ n: number }>(
    `select count(*)::int as n from ${tabla} where ${donde}`,
  );
  return result.rows[0]?.n ?? 0;
}

/** ¿Sigue estando esa fila? Es la pregunta que importa, no cuántas hay. */
async function existe(client: PGlite, tabla: string, id: string): Promise<boolean> {
  const result = await client.query<{ n: number }>(
    `select count(*)::int as n from ${tabla} where id = $1`,
    [id],
  );
  return (result.rows[0]?.n ?? 0) > 0;
}

describe('vaciar los datos de operación', () => {
  /*
   * El caso que justifica el script. `orders.customer_id`, `delivery_stops.order_id`,
   * `cash_collections.order_id` y `cash_settlements.collection_id` son `restrict`: con el orden
   * equivocado Postgres tumba la transacción entera y no se borra nada.
   */
  it('borra todo lo operativo sin chocar con ninguna clave foránea restrict', async () => {
    const { db } = await sembrada();

    await wipeOperations(db);

    expect(await countOperations(db)).toEqual({
      avisos: 0,
      clientes: 0,
      cobros: 0,
      conciliaciones: 0,
      conversaciones: 0,
      eventos: 0,
      paradas: 0,
      pedidos: 0,
      periodos: 2,
      rendiciones: 0,
      respuestas: 0,
    });
  });

  it('se lleva en cascada lo que cuelga del pedido y del cliente', async () => {
    const { client, db } = await sembrada();

    await wipeOperations(db);

    expect(await cuantos(client, 'order_items')).toBe(0);
    expect(await cuantos(client, 'customer_addresses')).toBe(0);
    expect(await cuantos(client, 'customer_identities')).toBe(0);
    expect(await cuantos(client, 'order_status_history')).toBe(0);
  });

  /*
   * Lo que se configuró para poder abrir no se toca. Si el vaciado se llevara el catálogo, la
   * limpieza previa a producción costaría rehacer ciudades, zonas, menús y precios.
   */
  it('deja intacto el catálogo', async () => {
    const { client, db } = await sembrada();

    await wipeOperations(db);

    /*
     * Se afirma que sobrevivió lo sembrado, y no un total: las migraciones traen filas propias
     * —una ciudad por defecto, entre otras— y un número exacto convertiría cada migración futura
     * en un test roto que no dice nada sobre el vaciado.
     */
    for (const tabla of [
      'operating_sites',
      'geographic_zones',
      'sales_cycles',
      'weekly_menus',
      'product_variants',
      'product_families',
      'users',
      'surveys',
    ]) {
      expect(await cuantos(client, tabla)).toBeGreaterThan(0);
    }
    expect(await existe(client, 'operating_sites', SITE)).toBe(true);
    expect(await existe(client, 'sales_cycles', CYCLE)).toBe(true);
    expect(await existe(client, 'users', USER)).toBe(true);
  });

  /*
   * La ruta sobrevive a sus paradas: es del período, no del cliente. El CLI avisa que quedó vacía
   * en vez de borrarla, porque borrar una hoja de ruta es otra decisión.
   */
  it('deja la hoja de ruta, aunque se quede sin paradas', async () => {
    const { client, db } = await sembrada();

    await wipeOperations(db);

    expect(await cuantos(client, 'delivery_routes')).toBe(1);
    expect(await cuantos(client, 'delivery_stops')).toBe(0);
  });

  it('se puede correr dos veces', async () => {
    const { db } = await sembrada();

    await wipeOperations(db);
    await expect(wipeOperations(db)).resolves.toBeUndefined();
  });

  /*
   * Por defecto se conservan TODOS los períodos: son parte del catálogo, y rehacerlos —menús,
   * precios, platos— es trabajo que un vaciado de clientes no tiene por qué destruir.
   */
  it('conserva todos los períodos si no se pide otra cosa', async () => {
    const { client, db } = await sembrada();

    await wipeOperations(db);

    expect(await existe(client, 'sales_cycles', CYCLE)).toBe(true);
    expect(await existe(client, 'sales_cycles', OLD_CYCLE)).toBe(true);
    expect(await existe(client, 'weekly_menus', OLD_MENU)).toBe(true);
  });

  /*
   * "El último" es por fecha de cierre, no por orden de alta.
   *
   * El período viejo se insertó después: por orden de alta sería "el último cargado", que es justo
   * la semana que nadie quiere conservar.
   */
  it('elige como último el de cierre más reciente, no el cargado más tarde', async () => {
    const { db } = await sembrada();

    const ultimo = await findLatestCycle(db);

    expect(ultimo).toMatchObject({ alias: 'Semana 34', id: CYCLE });
  });

  it('con keepOnlyCycleId borra los demás períodos y deja el elegido', async () => {
    const { client, db } = await sembrada();

    await wipeOperations(db, { keepOnlyCycleId: CYCLE });

    expect(await existe(client, 'sales_cycles', CYCLE)).toBe(true);
    expect(await existe(client, 'weekly_menus', MENU)).toBe(true);
    expect(await existe(client, 'sales_cycles', OLD_CYCLE)).toBe(false);
    expect(await existe(client, 'weekly_menus', OLD_MENU)).toBe(false);
  });

  // La oferta y el precio cuelgan del menú por cascade: se van solos, sin nombrarlos.
  it('se lleva las ofertas y los precios del período borrado', async () => {
    const { client, db } = await sembrada();

    await wipeOperations(db, { keepOnlyCycleId: CYCLE });

    expect(await existe(client, 'weekly_menu_offerings', OLD_OFFERING)).toBe(false);
    expect(await cuantos(client, 'weekly_menu_prices', `weekly_menu_id = '${OLD_MENU}'`)).toBe(0);
  });

  // Lo que no es de ningún período no se toca: el catálogo de variedades y tamaños sigue entero.
  it('conserva el catálogo de variedades al borrar períodos', async () => {
    const { client, db } = await sembrada();

    await wipeOperations(db, { keepOnlyCycleId: CYCLE });

    expect(await existe(client, 'product_variants', VARIANT)).toBe(true);
    expect(await existe(client, 'product_sizes', SIZE)).toBe(true);
  });
});
