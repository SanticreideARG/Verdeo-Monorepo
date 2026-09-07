/**
 * Escribe sólo los artículos de ayuda.
 *
 * `seed.ts` también toca permisos, roles y concesiones. Correrlo en producción para corregir un
 * texto de ayuda arriesga pisar configuración que alguien ajustó a mano, así que esta parte se
 * puede aplicar sola.
 *
 * Es un upsert por `key`: reescribe el texto de los que ya están y agrega los nuevos. Un artículo
 * que alguien editó desde la pantalla de Ayuda vuelve al texto de fábrica, que es lo que se quiere
 * cuando lo que cambió es la app.
 */
import { createDatabase } from './index.js';
import { DEFAULT_HELP_ARTICLES } from './help-articles.js';
import { helpArticles } from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is required');

const { client, db } = createDatabase(databaseUrl);

try {
  for (const article of DEFAULT_HELP_ARTICLES) {
    await db
      .insert(helpArticles)
      .values(article)
      .onConflictDoUpdate({
        set: {
          active: true,
          body: article.body,
          category: article.category,
          ordinal: article.ordinal,
          requiredPermission: article.requiredPermission ?? null,
          title: article.title,
          updatedAt: new Date(),
        },
        target: helpArticles.key,
      });
  }
  console.log(`Artículos de ayuda escritos: ${String(DEFAULT_HELP_ARTICLES.length)}`);
} finally {
  await client.end();
}
