import { createDatabase } from './index.js';
import { PostgresPasswordUserProvisioner } from './repositories/index.js';

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const databaseUrl = process.env.DATABASE_URL;
const email = readArgument('email');
const roleKey = readArgument('role');
const displayName = readArgument('display-name');

if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!email || !roleKey || !displayName) {
  throw new Error('Usage: --email <email> --role <role-key> --display-name <name>');
}

const { client, db } = createDatabase(databaseUrl);

try {
  const provisioner = new PostgresPasswordUserProvisioner(db);
  const user = await provisioner.provision({ displayName, email, roleKey });

  console.log('User provisioned. Copy this password now; it will not be shown again.');
  console.log(`Email: ${user.email}`);
  console.log(`Password: ${user.password}`);
  console.log(`Role: ${user.roleKey}`);
} finally {
  await client.end();
}
