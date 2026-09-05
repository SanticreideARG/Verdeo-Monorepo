import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.js';

interface CreateDatabaseOptions {
  maxConnections?: number;
}

export function createDatabase(databaseUrl: string, options: CreateDatabaseOptions = {}) {
  const client = postgres(databaseUrl, {
    max: options.maxConnections ?? 5,
    prepare: false,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];

export * from './repositories/index.js';
export * from './schema/index.js';

/**
 * Un `select 1`, para que quien quiera saber si la base responde no tenga que inventarse una
 * consulta ni depender de drizzle desde afuera del paquete.
 */
export async function pingDatabase(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}
