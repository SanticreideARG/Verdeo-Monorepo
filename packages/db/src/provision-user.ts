import { createDatabase } from './index.js';
import { PostgresPasswordUserProvisioner } from './repositories/index.js';
import { requireDatabaseUrl } from './require-database-url.js';

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = readArgument('email');
const roleKey = readArgument('role');
const displayName = readArgument('display-name');
const siteSlug = readArgument('site');

const databaseUrl = requireDatabaseUrl('auth:provision-user');
if (!email || !roleKey || !displayName) {
  throw new Error('Usage: --email <email> --role <role-key> --display-name <name> [--site <slug>]');
}

const { client, db } = createDatabase(databaseUrl);

try {
  const provisioner = new PostgresPasswordUserProvisioner(db);
  const user = await provisioner.provision({ displayName, email, roleKey, siteSlug });

  console.log('User provisioned. Copy this password now; it will not be shown again.');
  console.log(`Email: ${user.email}`);
  console.log(`Password: ${user.password}`);
  console.log(`Role: ${user.roleKey}`);
  // Sin ciudad, quien no sea superadmin entra y no ve nada: conviene que el script lo diga.
  console.log(siteSlug ? `Ciudad: ${siteSlug}` : 'Ciudad: ninguna (sólo sirve para un superadmin)');
} finally {
  await client.end();
}
