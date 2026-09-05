import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import {
  CustomerMergeError,
  findMergeCandidates,
  mergeCustomers,
} from './repositories/customer-merge.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function migratedDatabase() {
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
  return {
    client,
    close: () => client.close(),
    db: drizzle(client, { schema }) as unknown as Database,
  };
}

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

const SURVIVOR = 'c0000000-0000-4000-8000-000000000001';
const MERGED = 'c0000000-0000-4000-8000-000000000002';
const SITE = 'a0000000-0000-4000-8000-000000000001';
const ZONE = 'b0000000-0000-4000-8000-000000000001';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function seeded() {
  const database = await migratedDatabase();
  close = database.close;
  const { client } = database;

  await client.exec(`
    insert into operating_sites (id, slug, display_name, order_prefix)
    values ('${SITE}', 'merge-test', 'Ciudad de prueba', 'MRG');
    insert into geographic_zones (id, operating_site_id, slug, display_name)
    values ('${ZONE}', '${SITE}', 'centro', 'Centro');
    insert into customers (id, display_name) values
      ('${SURVIVOR}', 'Camila Rojas'),
      ('${MERGED}', 'Camila R.');
    insert into customer_operating_sites (customer_id, operating_site_id) values
      ('${SURVIVOR}', '${SITE}'), ('${MERGED}', '${SITE}');
  `);

  return { client, db: database.db };
}

async function addIdentity(
  client: PGlite,
  customerId: string,
  type: string,
  value: string,
  primary = true,
) {
  await client.exec(`
    insert into customer_identities (customer_id, type, value_normalized, value_display, "primary")
    values ('${customerId}', '${type}', '${value}', '${value}', ${primary});
  `);
}

async function addAddress(client: PGlite, customerId: string, label: string, primary = true) {
  await client.exec(`
    insert into customer_addresses (customer_id, label, written_address, geographic_zone_id, "primary")
    values ('${customerId}', '${label}', 'Calle 123', '${ZONE}', ${primary});
  `);
}

describe('mergeCustomers', () => {
  it('moves orders, identities and addresses onto the survivor', async () => {
    const { client, db } = await seeded();
    await addIdentity(client, SURVIVOR, 'email', 'camila@ejemplo.com');
    await addIdentity(client, MERGED, 'phone', '+5492995550000');
    await addAddress(client, SURVIVOR, 'Casa');
    await addAddress(client, MERGED, 'Trabajo');

    const result = await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    expect(result).toMatchObject({ movedAddresses: 1, movedIdentities: 1, retiredIdentities: 0 });
    const identities = await client.query<{ n: number }>(
      `select count(*)::int as n from customer_identities where customer_id = '${SURVIVOR}' and active = true`,
    );
    expect(identities.rows[0]?.n).toBe(2);
  });

  /**
   * Two *active* records can never share a contact — the partial unique index on (type, value)
   * where active forbids it. The reachable duplicate is the deactivated one: the trace left when
   * that index rejected the contact and somebody opened a second record instead. Moving it would
   * hand the survivor two rows for one phone, so it stays retired.
   */
  it('retires an identity the survivor already holds instead of duplicating it', async () => {
    const { client, db } = await seeded();
    await addIdentity(client, SURVIVOR, 'phone', '+5492995550000');
    await client.exec(`
      insert into customer_identities (customer_id, type, value_normalized, value_display, "primary", active)
      values ('${MERGED}', 'phone', '+5492995550000', '+5492995550000', false, false);
    `);

    const result = await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    expect(result).toMatchObject({ movedIdentities: 0, retiredIdentities: 1 });
    const active = await client.query<{ n: number }>(
      `select count(*)::int as n from customer_identities where value_normalized = '+5492995550000' and active = true`,
    );
    expect(active.rows[0]?.n).toBe(1);
  });

  // One active primary per customer is enforced by a partial unique index.
  it('never brings a second primary address across', async () => {
    const { client, db } = await seeded();
    await addAddress(client, SURVIVOR, 'Casa', true);
    await addAddress(client, MERGED, 'Otra casa', true);

    await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    const primaries = await client.query<{ n: number }>(
      `select count(*)::int as n from customer_addresses where customer_id = '${SURVIVOR}' and "primary" = true and active = true`,
    );
    expect(primaries.rows[0]?.n).toBe(1);
  });

  // The membership is keyed on (customer, site); both being in one city must not collide.
  it('drops a membership the survivor already has rather than colliding', async () => {
    const { client, db } = await seeded();

    await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    const rows = await client.query<{ n: number }>(
      `select count(*)::int as n from customer_operating_sites where customer_id = '${MERGED}'`,
    );
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('keeps the merged record as a tombstone pointing at the survivor', async () => {
    const { client, db } = await seeded();

    await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    const row = await client.query<{ merged_into_customer_id: string; status: string }>(
      `select status, merged_into_customer_id from customers where id = '${MERGED}'`,
    );
    // Deleted would break every link and printed order that still names it.
    expect(row.rows[0]).toMatchObject({ merged_into_customer_id: SURVIVOR, status: 'merged' });
  });

  /**
   * customer_logins is unique on both sides, so folding two accounts would silently sever one
   * person's access. Refused, because which login survives is not this function's decision.
   */
  it('refuses when both customers have a login account', async () => {
    const { client, db } = await seeded();
    await client.exec(`
      insert into users (id, display_name, email_normalized) values
        ('d0000000-0000-4000-8000-000000000001', 'A', 'a@ejemplo.com'),
        ('d0000000-0000-4000-8000-000000000002', 'B', 'b@ejemplo.com');
      insert into customer_logins (user_id, customer_id) values
        ('d0000000-0000-4000-8000-000000000001', '${SURVIVOR}'),
        ('d0000000-0000-4000-8000-000000000002', '${MERGED}');
    `);

    await expect(
      mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT),
    ).rejects.toThrow(CustomerMergeError);

    // And nothing moved: the whole thing is one transaction.
    const still = await client.query<{ n: number }>(
      `select count(*)::int as n from customer_logins where customer_id = '${MERGED}'`,
    );
    expect(still.rows[0]?.n).toBe(1);
  });

  it('moves a lone login across', async () => {
    const { client, db } = await seeded();
    await client.exec(`
      insert into users (id, display_name, email_normalized)
      values ('d0000000-0000-4000-8000-000000000002', 'B', 'b@ejemplo.com');
      insert into customer_logins (user_id, customer_id)
      values ('d0000000-0000-4000-8000-000000000002', '${MERGED}');
    `);

    await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    const row = await client.query<{ customer_id: string }>(
      `select customer_id from customer_logins`,
    );
    expect(row.rows[0]?.customer_id).toBe(SURVIVOR);
  });

  it('refuses to merge a record into itself, or one already merged', async () => {
    const { db } = await seeded();

    await expect(
      mergeCustomers(db, { mergedId: SURVIVOR, survivorId: SURVIVOR }, CONTEXT),
    ).rejects.toThrow(CustomerMergeError);

    await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);
    // Merging into a tombstone would bury the data a level deeper each time.
    await expect(
      mergeCustomers(db, { mergedId: SURVIVOR, survivorId: MERGED }, CONTEXT),
    ).rejects.toThrow(CustomerMergeError);
  });

  it('records the merge in the audit trail', async () => {
    const { client, db } = await seeded();

    await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    const events = await client.query<{ action: string; entity_id: string }>(
      `select action, entity_id from audit_events where action = 'customer.merged'`,
    );
    expect(events.rows[0]).toMatchObject({ action: 'customer.merged', entity_id: MERGED });
  });
});

describe('findMergeCandidates', () => {
  it('suggests records sharing a name, and hides them once merged', async () => {
    const { client, db } = await seeded();
    await client.exec(`update customers set display_name = 'Camila Rojas' where id = '${MERGED}'`);

    const before = await findMergeCandidates(db, 20);
    expect(before).toContainEqual(
      expect.objectContaining({ reason: 'same-name', value: 'Camila Rojas' }),
    );

    /*
     * Un nombre por ficha, aunque los dos nombres sean el mismo. El diálogo empareja ids con
     * nombres por posición, así que un arreglo más corto deja fichas sin nombre — y en el grupo
     * "mismo nombre" los nombres son idénticos siempre, que es donde más duele.
     */
    const candidate = before.find((item) => item.reason === 'same-name');
    expect(candidate?.customerNames).toHaveLength(candidate?.customerIds.length ?? 0);
    expect(candidate?.customerNames).toEqual(['Camila Rojas', 'Camila Rojas']);

    await mergeCustomers(db, { mergedId: MERGED, survivorId: SURVIVOR }, CONTEXT);

    // A tombstone is not a candidate: suggesting it again would offer to merge what was merged.
    expect(await findMergeCandidates(db, 20)).toEqual([]);
  });

  it('suggests a contact one record holds active and another holds deactivated', async () => {
    const { client, db } = await seeded();
    await addIdentity(client, SURVIVOR, 'phone', '+5492995550000');
    await client.exec(`
      insert into customer_identities (customer_id, type, value_normalized, value_display, "primary", active)
      values ('${MERGED}', 'phone', '+5492995550000', '+5492995550000', false, false);
    `);

    expect(await findMergeCandidates(db, 20)).toContainEqual(
      expect.objectContaining({ reason: 'duplicate-contact', value: '+5492995550000' }),
    );
  });
});
