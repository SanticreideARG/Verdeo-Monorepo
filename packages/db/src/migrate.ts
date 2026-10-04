import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabase } from './index.js';
import { requireDatabaseUrl } from './require-database-url.js';

const databaseUrl = requireDatabaseUrl('db:migrate');

const { client, db } = createDatabase(databaseUrl);

try {
  await migrate(db, { migrationsFolder: './migrations' });
} finally {
  await client.end();
}
