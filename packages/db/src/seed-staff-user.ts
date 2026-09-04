/**
 * Creates (or updates) a staff account with a password, and assigns it a role.
 *
 * The provisioning path the app uses generates a random password and mails an invite. This is for
 * the case where you need a known account right now — setting up a colleague during development,
 * or getting back in when nobody can.
 *
 * Credentials come from the environment rather than the file, so a real password never lands in
 * git history:
 *
 *   STAFF_EMAIL=alguien@ejemplo.com STAFF_PASSWORD=... STAFF_ROLE=superadmin \
 *     pnpm --filter @verdeo/db exec tsx src/seed-staff-user.ts
 *
 * Idempotent: run it again to change the password or the role of an account that already exists.
 */
import { hashPassword } from '@verdeo/auth';
import { eq } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { passwordCredentials, roles, userRoles, users } from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const email = process.env.STAFF_EMAIL?.trim().toLowerCase();
const password = process.env.STAFF_PASSWORD;
const roleKey = process.env.STAFF_ROLE?.trim() ?? 'superadmin';
const displayName = process.env.STAFF_NAME?.trim();

if (!email || !password) {
  throw new Error('STAFF_EMAIL and STAFF_PASSWORD are required');
}

async function main() {
  const { client, db } = createDatabase(databaseUrl!);

  try {
    const [role] = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(eq(roles.key, roleKey))
      .limit(1);
    if (!role) throw new Error(`No existe el rol "${roleKey}".`);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailNormalized, email!))
      .limit(1);

    const userId =
      existing?.id ??
      (
        await db
          .insert(users)
          .values({
            displayName: displayName ?? email!.split('@')[0] ?? email!,
            emailNormalized: email!,
            status: 'active',
          })
          .returning({ id: users.id })
      )[0]?.id;
    if (!userId) throw new Error('No se pudo crear el usuario');

    // Same scrypt encoding the login path verifies against — never a plaintext column.
    const passwordHash = await hashPassword(password!);
    await db
      .insert(passwordCredentials)
      .values({ passwordChangedAt: new Date(), passwordHash, userId })
      .onConflictDoUpdate({
        set: { failedAttempts: 0, lockedUntil: null, passwordChangedAt: new Date(), passwordHash },
        target: passwordCredentials.userId,
      });

    await db.insert(userRoles).values({ roleId: role.id, userId }).onConflictDoNothing();

    console.log(`${existing ? 'Actualizada' : 'Creada'} la cuenta ${email}`);
    console.log(`  rol: ${role.name} (${roleKey})`);
    console.log(`  entrá en /login con esa dirección y la contraseña que pasaste.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
