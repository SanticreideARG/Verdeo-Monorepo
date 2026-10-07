import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const SITE = 'a0000000-0000-4000-8000-000000000009';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const FAMILY_KETO = 'f0000000-0000-4000-8000-000000000001';
const FAMILY_VEGAN = 'f0000000-0000-4000-8000-000000000002';
const SIZE_250 = 'f1000000-0000-4000-8000-000000000001';
const SIZE_400 = 'f1000000-0000-4000-8000-000000000002';
const KETO_250 = 'f2000000-0000-4000-8000-000000000001';
const KETO_400 = 'f2000000-0000-4000-8000-000000000002';
const VEGAN_400 = 'f2000000-0000-4000-8000-000000000003';
const OFFER_KETO_250 = 'f3000000-0000-4000-8000-000000000001';
const OFFER_KETO_400 = 'f3000000-0000-4000-8000-000000000002';
const OFFER_VEGAN_400 = 'f3000000-0000-4000-8000-000000000003';
const ANA = 'c0000000-0000-4000-8000-000000000001';
const BETO = 'c0000000-0000-4000-8000-000000000002';
const CARLA = 'c0000000-0000-4000-8000-000000000003';
const ANA_ISABEL = 'c0000000-0000-4000-8000-000000000004';
const ORDER_ANA = '0a000000-0000-4000-8000-000000000001';
const ORDER_BETO = '0a000000-0000-4000-8000-000000000002';

/*
 * Un menú vigente con Keto en dos tamaños y Vegan sólo en 400, y cuatro clientes:
 * - Ana, con celular guardado con espacios y guiones, y con email.
 * - Beto, con el celular cargado como "teléfono" y no como WhatsApp.
 * - Carla, ARCHIVADA, con celular: un cliente archivado no recibe pedidos nuevos.
 * - Ana Isabel Vega, sin ningún dato de contacto: sólo se la puede encontrar por el nombre.
 *
 * Ana tiene un pedido confirmado de Keto 400 ×2. Beto tiene uno igual, pero CANCELADO.
 */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'repro', 'Repro', 'ZZZ');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 40', now() - interval '1 day', now() + interval '1 day',
          now() + interval '3 days');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CYCLE}', 'PUBLISHED');

  insert into product_families (id, code, display_name, kind) values
    ('${FAMILY_KETO}', 'paleo-keto', 'Menú Paleo & Keto', 'FIXED'),
    ('${FAMILY_VEGAN}', 'vegan', 'Menú Vegan', 'FIXED');
  insert into product_sizes (id, code, display_name) values
    ('${SIZE_250}', '250', '250'), ('${SIZE_400}', '400', '400');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name) values
    ('${KETO_250}', '${FAMILY_KETO}', '${SIZE_250}', 'keto-250', '250'),
    ('${KETO_400}', '${FAMILY_KETO}', '${SIZE_400}', 'keto-400', '400'),
    ('${VEGAN_400}', '${FAMILY_VEGAN}', '${SIZE_400}', 'vegan-400', '400');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor) values
    ('${MENU}', '${SIZE_250}', 2000000), ('${MENU}', '${SIZE_400}', 2500000);
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id) values
    ('${OFFER_KETO_250}', '${MENU}', '${KETO_250}'),
    ('${OFFER_KETO_400}', '${MENU}', '${KETO_400}'),
    ('${OFFER_VEGAN_400}', '${MENU}', '${VEGAN_400}');

  insert into customers (id, display_name, status) values
    ('${ANA}', 'Ana Pérez', 'active'),
    ('${BETO}', 'Beto Díaz', 'active'),
    ('${CARLA}', 'Carla Gómez', 'archived'),
    ('${ANA_ISABEL}', 'Ana Isabel Vega', 'active');
  insert into customer_identities (customer_id, type, value_normalized, value_display) values
    ('${ANA}', 'whatsapp', '+5491155550101', '+54 9 11 5555-0101'),
    ('${ANA}', 'email', 'ana@example.com', 'ana@example.com'),
    ('${BETO}', 'phone', '1155550102', '11 5555 0102'),
    ('${CARLA}', 'whatsapp', '+5491155550103', '+54 9 11 5555 0103');

  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source, status,
                      delivery_date, delivery_address_snapshot, payment_expectation, total_minor,
                      operating_site_id)
  values
    ('${ORDER_ANA}', 'ZZZ-00001', '${ANA}', '${CYCLE}', '${MENU}', 'email', 'CONFIRMED',
     '2026-10-08', 'Calle 1', 'Efectivo', 5000000, '${SITE}'),
    ('${ORDER_BETO}', 'ZZZ-00002', '${BETO}', '${CYCLE}', '${MENU}', 'email', 'CANCELLED',
     '2026-10-08', 'Calle 2', 'Efectivo', 5000000, '${SITE}');
  insert into order_items (order_id, product_variant_id, offering_id, product_name_snapshot,
                          variant_snapshot, quantity_units, unit_price_minor, total_minor) values
    ('${ORDER_ANA}', '${KETO_400}', '${OFFER_KETO_400}', 'Menú Paleo & Keto', '400', 2, 2500000, 5000000),
    ('${ORDER_BETO}', '${KETO_400}', '${OFFER_KETO_400}', 'Menú Paleo & Keto', '400', 2, 2500000, 5000000);
`;

let client: PGlite;
let operations: PostgresOperationsService;

beforeAll(async () => {
  client = new PGlite();
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
  operations = new PostgresOperationsService(
    drizzle(client, { schema }) as unknown as Database,
    {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never,
  );
}, 60_000);

afterAll(async () => {
  await client.close();
});

const fila = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Alguien Nuevo',
  email: null as string | null,
  items: [{ quantityUnits: 1, size: '400', variety: 'Menú Paleo & Keto' }],
  phone: null as string | null,
  rowNumber: 1,
  ...overrides,
});

async function preview(row: ReturnType<typeof fila>) {
  const result = await operations.previewOrderImport([row], null);
  return { ...result, match: result.matches[0] };
}

describe('previewOrderImport: reconocer al cliente', () => {
  /*
   * El mismo celular escrito de cuatro maneras tiene que dar el mismo cliente. Comparar el texto
   * crea un cliente nuevo por cada forma.
   */
  it('reconoce el celular escrito de cualquier manera', async () => {
    for (const phone of [
      '+5491155550101',
      '1155550101',
      '01155550101',
      '91155550101',
      '+54 11 5555-0101',
    ]) {
      const { match } = await preview(fila({ phone }));

      expect(match?.customerMatch).toMatchObject({ customerId: ANA, kind: 'telefono' });
    }
  });

  it('reconoce un celular cargado como teléfono y no como WhatsApp', async () => {
    const { match } = await preview(fila({ phone: '+5491155550102' }));

    expect(match?.customerMatch).toMatchObject({ customerId: BETO, kind: 'telefono' });
  });

  it('reconoce por email cuando no hay celular', async () => {
    const { match } = await preview(fila({ email: 'ANA@Example.com' }));

    expect(match?.customerMatch).toMatchObject({ customerId: ANA, kind: 'email' });
  });

  /*
   * Dos señales fuertes que discrepan son justo el caso en que una persona tiene que mirar. Se
   * elige el celular, pero el cliente del email queda como candidato: callarlo sería elegir una de
   * las dos sin decirlo.
   */
  it('ofrece como candidato al cliente del email cuando el celular apunta a otro', async () => {
    const { match } = await preview(fila({ email: 'ana@example.com', phone: '1155550102' }));

    expect(match?.customerMatch.customerId).toBe(BETO);
    expect(match?.customerMatch.candidates).toEqual([expect.objectContaining({ customerId: ANA })]);
  });

  // Un cliente archivado ya no recibe pedidos nuevos: su celular no lo reconoce.
  it('no reconoce a un cliente archivado', async () => {
    const { match } = await preview(fila({ phone: '1155550103' }));

    expect(match?.customerMatch).toMatchObject({ customerId: null, kind: 'nuevo' });
  });

  // Sin código de área no hay forma de saber de qué ciudad es: sus últimos dígitos unirían clientes.
  it('no reconoce un celular sin código de área', async () => {
    const { match } = await preview(fila({ phone: '5555 0101' }));

    expect(match?.customerMatch.kind).toBe('nuevo');
  });

  it('ofrece los nombres parecidos como candidatos y no los da por buenos', async () => {
    const { match } = await preview(fila({ customerName: 'Ana Vega' }));

    expect(match?.customerMatch).toMatchObject({ customerId: null, kind: 'parecidos' });
    expect(match?.customerMatch.candidates).toEqual([
      expect.objectContaining({ customerId: ANA_ISABEL }),
    ]);
  });

  /*
   * Un nombre de una sola palabra no ofrece candidatos: "Ana" a secas sería parecida a cada Ana de
   * la base, y una lista larga de candidatos sin ninguna señal es peor que ninguna.
   */
  it('no ofrece candidatos a partir de una sola palabra', async () => {
    const { match } = await preview(fila({ customerName: 'Ana' }));

    expect(match?.customerMatch).toMatchObject({ candidates: [], kind: 'nuevo' });
  });

  it('reconoce el nombre exacto sin tildes ni mayúsculas', async () => {
    const { match } = await preview(fila({ customerName: 'beto diaz' }));

    expect(match?.customerMatch).toMatchObject({ customerId: BETO, kind: 'nombre' });
  });
});

describe('previewOrderImport: emparejar con el menú', () => {
  it('empareja cada variedad con su oferta', async () => {
    const { match } = await preview(
      fila({
        items: [
          { quantityUnits: 2, size: '400', variety: 'Menú Paleo & Keto' },
          { quantityUnits: 1, size: '400', variety: 'Menú Vegan' },
        ],
      }),
    );

    expect(match?.itemMatches).toEqual([OFFER_KETO_400, OFFER_VEGAN_400]);
  });

  // Vegan no se publicó en 250: se dice con null, y una persona elige. No se adivina.
  it('devuelve null para una variedad que no está en el menú', async () => {
    const { match } = await preview(
      fila({ items: [{ quantityUnits: 1, size: '250', variety: 'Menú Vegan' }] }),
    );

    expect(match?.itemMatches).toEqual([null]);
  });

  it('ofrece las ofertas del menú para elegir a mano, ordenadas', async () => {
    const { offerings } = await preview(fila());

    expect(offerings.map((oferta) => oferta.label)).toEqual([
      'Menú Paleo & Keto 250',
      'Menú Paleo & Keto 400',
      'Menú Vegan 400',
    ]);
  });
});

describe('previewOrderImport: pedidos repetidos', () => {
  /*
   * Pegar dos veces los mismos emails es lo más probable que va a pasar. Sin esto cada pegado
   * duplica los pedidos.
   */
  it('avisa cuando el cliente ya tiene un pedido igual en el período', async () => {
    const { match } = await preview(
      fila({
        items: [{ quantityUnits: 2, size: '400', variety: 'Menú Paleo & Keto' }],
        phone: '1155550101',
      }),
    );

    expect(match?.duplicateOf).toBe('ZZZ-00001');
  });

  // Otra cantidad es otro pedido: dos viandas no son tres.
  it('no avisa si la cantidad es distinta', async () => {
    const { match } = await preview(
      fila({
        items: [{ quantityUnits: 3, size: '400', variety: 'Menú Paleo & Keto' }],
        phone: '1155550101',
      }),
    );

    expect(match?.duplicateOf).toBeNull();
  });

  it('no avisa si la variedad es otra', async () => {
    const { match } = await preview(
      fila({
        items: [{ quantityUnits: 2, size: '400', variety: 'Menú Vegan' }],
        phone: '1155550101',
      }),
    );

    expect(match?.duplicateOf).toBeNull();
  });

  // Un pedido cancelado no existe a efectos de esto: volver a pedirlo es legítimo.
  it('ignora los pedidos cancelados', async () => {
    const { match } = await preview(
      fila({
        items: [{ quantityUnits: 2, size: '400', variety: 'Menú Paleo & Keto' }],
        phone: '1155550102',
      }),
    );

    expect(match?.customerMatch.customerId).toBe(BETO);
    expect(match?.duplicateOf).toBeNull();
  });

  // Con una variedad sin emparejar no hay forma de saber si es el mismo pedido.
  it('no compara cuando alguna variedad no se reconoce', async () => {
    const { match } = await preview(
      fila({
        items: [
          { quantityUnits: 2, size: '400', variety: 'Menú Paleo & Keto' },
          { quantityUnits: 1, size: '250', variety: 'Menú Vegan' },
        ],
        phone: '1155550101',
      }),
    );

    expect(match?.duplicateOf).toBeNull();
  });

  it('un cliente nuevo no puede tener un pedido repetido', async () => {
    const { match } = await preview(fila());

    expect(match?.duplicateOf).toBeNull();
  });
});
