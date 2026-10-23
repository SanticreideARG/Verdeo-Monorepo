/**
 * Publica en el feed las novedades del sistema que todavía no están (`release-notes.ts`).
 *
 * Van para todas las ciudades, con la etiqueta "Novedad del sistema" y sin autor: el feed las firma
 * "Verdeo". No pisa nada: una novedad ya publicada (mismo texto, sin borrar) se saltea, así que se
 * puede correr después de cada migración sin repetir las anteriores.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { RELEASE_NOTES } from './release-notes.js';
import { requireDatabaseUrl } from './require-database-url.js';
import { feedPosts } from './schema/index.js';

const databaseUrl = requireDatabaseUrl('db:seed-release-notes');

const { client, db } = createDatabase(databaseUrl);

try {
  const published = await db
    .select({ body: feedPosts.body })
    .from(feedPosts)
    .where(and(eq(feedPosts.tag, 'novedad'), isNull(feedPosts.deletedAt)));
  const already = new Set(published.map((post) => post.body));
  let count = 0;
  for (const note of RELEASE_NOTES) {
    if (already.has(note.body)) continue;
    await db.insert(feedPosts).values({
      authorUserId: null,
      body: note.body,
      operatingSiteId: null,
      tag: 'novedad',
    });
    count += 1;
    console.log(`Publicada: ${note.key}`);
  }
  console.log(
    `Novedades publicadas: ${String(count)} (ya estaban: ${String(RELEASE_NOTES.length - count)})`,
  );
} finally {
  await client.end();
}
