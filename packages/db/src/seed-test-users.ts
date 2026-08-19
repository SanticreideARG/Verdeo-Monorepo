import { createDatabase } from './index.js';
import { PostgresPasswordUserProvisioner, UserAlreadyExistsError } from './repositories/index.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_TEST_USER_SEED !== 'true') {
  throw new Error('Test-user seed requires non-production NODE_ENV and ALLOW_TEST_USER_SEED=true');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const testUsers = [
  { displayName: 'Test Superadmin', email: 'superadmin@verdeo.test', roleKey: 'superadmin' },
  { displayName: 'Test Operador', email: 'operador@verdeo.test', roleKey: 'operador' },
  { displayName: 'Test Repartidor', email: 'repartidor@verdeo.test', roleKey: 'repartidor' },
  { displayName: 'Test Cocina', email: 'cocina@verdeo.test', roleKey: 'cocina' },
  { displayName: 'Test Cliente', email: 'cliente@verdeo.test', roleKey: 'cliente' },
] as const;

const { client, db } = createDatabase(databaseUrl);

try {
  const provisioner = new PostgresPasswordUserProvisioner(db);

  for (const testUser of testUsers) {
    try {
      const user = await provisioner.provision(testUser);
      console.log(`${user.roleKey}: ${user.email} | ${user.password}`);
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        console.log(`${testUser.roleKey}: already exists, skipped`);
        continue;
      }
      throw error;
    }
  }
} finally {
  await client.end();
}
