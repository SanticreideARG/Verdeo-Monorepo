import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import {
  PostgresOperationsService,
  type CustomerInput,
} from './repositories/postgres-operations-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const SITE = 'a0000000-0000-4000-8000-000000000009';
const ZONE = '0d000000-0000-4000-8000-000000000001';
const ARCHIVADO = 'c0000000-0000-4000-8000-000000000001';

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function base() {
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
  // Un cliente archivado que todavía tiene su WhatsApp activo: es lo que hacía fallar la
  // importación entera con un "ya existe" sin decir quién.
  await client.exec(`
    insert into operating_sites (id, slug, display_name, order_prefix)
    values ('${SITE}', 'caba', 'CABA', 'CABA');
    insert into geographic_zones (id, operating_site_id, slug, display_name)
    values ('${ZONE}', '${SITE}', 'general', 'Zona General');
    insert into customers (id, display_name, status) values ('${ARCHIVADO}', 'Ana Vieja', 'archived');
    insert into customer_identities (customer_id, type, value_display, value_normalized, "primary")
    values ('${ARCHIVADO}', 'whatsapp', '+54 9 11 5555-0101', '+5491155550101', true);
  `);
  close = () => client.close();
  const db = drizzle(client, { schema }) as unknown as Database;
  return {
    client,
    service: new PostgresOperationsService(db, {
      geocode: () => Promise.resolve([]),
      key: 'prueba',
    }),
  };
}

const contexto = { correlationId: 'c', requestId: 'r', source: 'test' };

function cliente(nombre: string, telefono: string, barrio?: string): CustomerInput {
  return {
    addresses: [
      {
        geocodingStatus: 'NEEDS_LOCATION',
        geographicZoneId: ZONE,
        label: 'Casa',
        primary: true,
        ...(barrio ? { sector: barrio } : {}),
        source: 'spreadsheet_import',
        writtenAddress: `Calle ${nombre} 100`,
      },
    ],
    displayName: nombre,
    identities: [
      {
        primary: true,
        source: 'spreadsheet_import',
        type: 'whatsapp',
        value: telefono,
        verified: false,
      },
    ],
    operatingSiteId: SITE,
    phone: telefono,
  };
}

describe('reconcileCustomerImport', () => {
  it('marca nuevo, existente (aunque esté archivado y escrito distinto) y repetido', async () => {
    const { service } = await base();

    const filas = await service.reconcileCustomerImport([
      cliente('Ana Nueva', '1155550101'),
      cliente('Beto', '+5491155550202'),
      cliente('Beto otra vez', '11 5555-0202'),
    ]);

    expect(filas[0]).toMatchObject({
      match: {
        customerId: ARCHIVADO,
        displayName: 'Ana Vieja',
        matchedBy: 'whatsapp',
        status: 'archived',
      },
      status: 'existing',
    });
    expect(filas[1]).toMatchObject({ match: null, status: 'new' });
    expect(filas[2]).toMatchObject({ repeatedOf: 1, status: 'repeated' });
  });

  // Planilla real: la misma persona sin teléfono, cargada varias veces con la misma dirección.
  it('sin teléfono ni correo, reconoce por nombre y dirección', async () => {
    const { service } = await base();
    const sinTelefono = (nombre: string, direccion: string): CustomerInput => {
      const base = cliente(nombre, '');
      return {
        addresses: base.addresses?.map((address) => ({ ...address, writtenAddress: direccion })),
        displayName: base.displayName,
        operatingSiteId: base.operatingSiteId,
      };
    };
    await service.importCustomers([sinTelefono('Lucía Paz', 'Ruta 151 km 3')], contexto);

    const filas = await service.reconcileCustomerImport([
      sinTelefono('Ricardo Sanchez', 'por ruta 151, tranquera azul'),
      sinTelefono('ricardo  sánchez', 'Por ruta 151 tranquera azul'),
      sinTelefono('Ricardo Sanchez', 'Otra casa 200'),
      sinTelefono('LUCIA PAZ', 'ruta 151 km 3'),
    ]);

    expect(filas.map((fila) => fila.status)).toEqual(['new', 'repeated', 'new', 'existing']);
    expect(filas[1]).toMatchObject({ repeatedOf: 0 });
    expect(filas[3]?.match).toMatchObject({ displayName: 'Lucía Paz', matchedBy: 'address' });
  });
});

describe('barrios', () => {
  it('se crean al importar y "Núñez" y "nuñez" son el mismo barrio', async () => {
    const { client, service } = await base();

    await service.importCustomers(
      [cliente('Carla', '+5491155550303', 'Núñez'), cliente('Dora', '+5491155550404', ' nuñez ')],
      contexto,
    );

    const { rows } = await client.query<{ display_name: string; total: number }>(`
      select n.display_name, count(a.id)::int as total
      from neighborhoods n join customer_addresses a on a.neighborhood_id = n.id
      group by n.display_name`);
    expect(rows).toEqual([{ display_name: 'Núñez', total: 2 }]);
  });

  // Desde "Todas las ciudades" la planilla se rechazaba entera aunque la zona ya estaba elegida.
  it('sin ciudad elegida arriba, toma la ciudad de la zona del domicilio', async () => {
    const { client, service } = await base();
    const sinCiudad = { ...cliente('Fede', '+5491155550606'), operatingSiteId: null };

    await service.importCustomers([sinCiudad], contexto);

    const { rows } = await client.query<{ operating_site_id: string }>(
      `select operating_site_id from customer_operating_sites`,
    );
    expect(rows).toEqual([{ operating_site_id: SITE }]);
  });

  it('un domicilio sin barrio queda sin barrio', async () => {
    const { client, service } = await base();
    await service.importCustomers([cliente('Eva', '+5491155550505')], contexto);
    const { rows } = await client.query<{ neighborhood_id: string | null }>(
      `select neighborhood_id from customer_addresses`,
    );
    expect(rows[0]?.neighborhood_id).toBeNull();
  });
});

// Cambio de política (2026-11-05): los archivados no salen en las listas, sólo pidiéndolos.
describe('clientes archivados', () => {
  it('no salen en la lista ni en la búsqueda por teléfono, sí pidiéndolos por estado', async () => {
    const { client, service } = await base();
    await client.exec(`insert into customers (display_name) values ('Ana Activa');`);

    const lista = await service.listCustomers({ limit: 30 }, true);
    expect(lista.items.map((cliente) => cliente.displayName)).toEqual(['Ana Activa']);
    const porTelefono = await service.listCustomers({ limit: 30, search: '1155550101' }, true);
    expect(porTelefono.items).toEqual([]);

    const archivados = await service.listCustomers({ limit: 30, status: 'archived' }, true);
    expect(archivados.items.map((cliente) => cliente.id)).toEqual([ARCHIVADO]);
  });
});

// Buscar sin importar las tildes (2026-11-06), en los dos sentidos y en mayúsculas.
describe('búsqueda de clientes', () => {
  it('encuentra con o sin tilde', async () => {
    const { client, service } = await base();
    await client.exec(
      `insert into customers (display_name) values ('Martín Núñez'), ('JOSÉ PÉREZ'), ('Maria Lopez');`,
    );
    const nombres = async (search: string) =>
      (await service.listCustomers({ limit: 30, search }, false)).items
        .map((cliente) => cliente.displayName)
        .sort();

    expect(await nombres('nunez')).toEqual(['Martín Núñez']);
    expect(await nombres('Martin')).toEqual(['Martín Núñez']);
    expect(await nombres('jose perez')).toEqual(['JOSÉ PÉREZ']);
    expect(await nombres('maría lópez')).toEqual(['Maria Lopez']);
  });
});

// "100 clientes (hay más)" no decía el padrón (2026-11-07): la primera página trae el total.
describe('total de clientes', () => {
  it('viene en la primera página sin búsqueda, y sin más páginas es lo que vino', async () => {
    const { client, service } = await base();
    await client.exec(
      `insert into customers (display_name) values ('Uno'), ('Dos'), ('Tres'), ('Cuatro');`,
    );
    const primera = await service.listCustomers({ limit: 2 }, false);
    expect(primera.items).toHaveLength(2);
    expect(primera.total).toBe(4);

    const todas = await service.listCustomers({ limit: 30 }, false);
    expect(todas.total).toBe(4);
  });
});

// Clientes 2 (2026-11-07): orden, filtros y lo que cada cliente lleva pedido.
describe('lista de Clientes 2', () => {
  const CICLO = 'b0000000-0000-4000-8000-000000000001';
  const MENU = 'b0000000-0000-4000-8000-000000000002';
  async function conPedidos() {
    const { client, service } = await base();
    await client.exec(`
      insert into customers (id, display_name, created_at) values
        ('c1000000-0000-4000-8000-000000000001', 'Zoe Frecuente', '2026-01-01T00:00:00Z'),
        ('c1000000-0000-4000-8000-000000000002', 'Ángel Deudor', '2026-02-01T00:00:00Z'),
        ('c1000000-0000-4000-8000-000000000003', 'Beto Sin Pedidos', '2026-03-01T00:00:00Z');
      insert into customer_operating_sites (customer_id, operating_site_id)
      select id, '${SITE}' from customers where id::text like 'c1%';
    `);
    await client.exec(`
      insert into customer_addresses (customer_id, geographic_zone_id, label, written_address, "primary", latitude, longitude)
      values ('c1000000-0000-4000-8000-000000000001', '${ZONE}', 'Casa', 'Calle Zoe 1', true, -34.6, -58.4),
             ('c1000000-0000-4000-8000-000000000002', '${ZONE}', 'Casa', 'Calle Ángel 2', true, null, null);
      insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at, status)
      values ('${CICLO}', 'Semana 36', '2026-09-01T12:00:00Z', '2026-09-05T23:00:00Z', '2026-09-06T22:00:00Z', 'CLOSED');
      insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CICLO}', 'PUBLISHED');
      insert into orders (public_number, customer_id, sales_cycle_id, weekly_menu_id, source, status,
                          delivery_date, delivery_address_snapshot, payment_expectation, total_minor,
                          operating_site_id, paid_at)
      values
        ('T-1', 'c1000000-0000-4000-8000-000000000001', '${CICLO}', '${MENU}', 'manual', 'DELIVERED', '2026-09-08', 'x', 'efectivo', 1000, '${SITE}', now()),
        ('T-2', 'c1000000-0000-4000-8000-000000000001', '${CICLO}', '${MENU}', 'manual', 'DELIVERED', '2026-09-15', 'x', 'efectivo', 1000, '${SITE}', now()),
        ('T-3', 'c1000000-0000-4000-8000-000000000001', '${CICLO}', '${MENU}', 'manual', 'CANCELLED', '2026-09-22', 'x', 'efectivo', 9000, '${SITE}', null),
        ('T-4', 'c1000000-0000-4000-8000-000000000002', '${CICLO}', '${MENU}', 'manual', 'DELIVERED', '2026-09-01', 'x', 'efectivo', 5000, '${SITE}', null);
    `);
    return service;
  }
  const nombres = (page: { items: { displayName: string }[] }) =>
    page.items.map((cliente) => cliente.displayName);

  it('ordena por nombre sin tildes y trae los números de cada uno', async () => {
    const service = await conPedidos();
    const page = await service.browseCustomers({ limit: 30, operatingSiteId: SITE }, true);
    expect(nombres(page)).toEqual(['Ángel Deudor', 'Beto Sin Pedidos', 'Zoe Frecuente']);
    expect(page.total).toBe(3);
    const zoe = page.items.find((cliente) => cliente.displayName === 'Zoe Frecuente');
    expect(zoe).toMatchObject({
      debtMinor: 0,
      isNew: false,
      lastOrderDate: '2026-09-15',
      located: true,
      orderCount: 2,
      primaryAddress: 'Calle Zoe 1',
      siteName: 'CABA',
      spentMinor: 2000,
      zoneName: 'Zona General',
    });
    const angel = page.items.find((cliente) => cliente.displayName === 'Ángel Deudor');
    expect(angel).toMatchObject({ debtMinor: 5000, isNew: true, located: false });
  });

  it('ordena por último pedido, cantidad y gastado', async () => {
    const service = await conPedidos();
    const por = async (sort: 'last_order' | 'orders' | 'spent' | 'created') =>
      nombres(await service.browseCustomers({ limit: 30, sort }, false));
    expect(await por('last_order')).toEqual(['Zoe Frecuente', 'Ángel Deudor', 'Beto Sin Pedidos']);
    expect(await por('orders')).toEqual(['Zoe Frecuente', 'Ángel Deudor', 'Beto Sin Pedidos']);
    expect(await por('spent')).toEqual(['Ángel Deudor', 'Zoe Frecuente', 'Beto Sin Pedidos']);
    expect((await por('created'))[0]).toBe('Beto Sin Pedidos');
  });

  it('filtra con deuda, sin ubicar, nuevos y dormidos', async () => {
    const service = await conPedidos();
    const con = async (filtro: Parameters<typeof service.browseCustomers>[0]) =>
      nombres(await service.browseCustomers(filtro, false));
    expect(await con({ limit: 30, withDebt: true })).toEqual(['Ángel Deudor']);
    expect(await con({ limit: 30, unlocated: true })).toEqual(['Ángel Deudor']);
    expect(await con({ limit: 30, isNew: false })).toEqual(['Zoe Frecuente']);
    expect(await con({ limit: 30, inactiveWeeks: 4 })).toEqual(['Ángel Deudor', 'Zoe Frecuente']);
    expect(await con({ limit: 30, zoneId: ZONE })).toEqual(['Ángel Deudor', 'Zoe Frecuente']);
  });

  it('pagina por desplazamiento con el total en la primera página', async () => {
    const service = await conPedidos();
    const primera = await service.browseCustomers({ limit: 2 }, false);
    expect(nombres(primera)).toEqual(['Ángel Deudor', 'Beto Sin Pedidos']);
    expect(primera.total).toBe(3);
    expect(primera.nextOffset).toBe(2);
    const segunda = await service.browseCustomers({ limit: 2, offset: 2 }, false);
    expect(nombres(segunda)).toEqual(['Zoe Frecuente']);
    expect(segunda.nextOffset).toBeNull();
  });

  it('busca también por teléfono en la misma consulta', async () => {
    const { client, service } = await base();
    await client.exec(`
      insert into customers (id, display_name) values ('c2000000-0000-4000-8000-000000000001', 'Carla');
      insert into customer_identities (customer_id, type, value_display, value_normalized, "primary")
      values ('c2000000-0000-4000-8000-000000000001', 'phone', '11 5555-0202', '+5491155550202', true);
    `);
    const page = await service.browseCustomers({ limit: 30, search: '(011) 15 5555-0202' }, true);
    expect(nombres(page)).toEqual(['Carla']);
    expect(page.total).toBe(1);
  });
});
