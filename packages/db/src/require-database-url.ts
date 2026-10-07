import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La URL de la base, o un error que dice cómo pasarla.
 *
 * Contra qué base corre algo que borra datos o aplica migraciones tiene que decirlo quien lo corre,
 * en el mismo renglón, y no un `.env` que puede estar apuntando a otro lado. Por eso la base de
 * producción no es nunca la de por defecto: hay que pedirla con `--produccion`.
 *
 * ## Por qué existe `--produccion`
 *
 * Antes la única forma era anteponer una línea larga —`DATABASE_URL="$(grep … .env | sed … | tr …)"`—
 * y esa línea se copiaba desde el mensaje de error. La terminal parte los renglones largos, así que
 * lo copiado salía roto, el comando corría sin la variable y el error volvía a aparecer. Pasó cuatro
 * veces seguidas. Un error que dice qué hacer pero cuya instrucción no sobrevive a copiarla es la
 * mitad de un error.
 *
 * `--produccion` dice lo mismo que la línea larga con una palabra: lee `DATABASE_URL_PROD` del
 * `.env`. Sigue siendo explícito, en el mismo renglón, y sólo toca esa clave. Y antes de que el
 * script haga nada imprime a qué servidor va a apuntar, porque lo que más cuesta de equivocar con
 * esto es la base, no el comando.
 *
 * No se llama `--prod` porque pnpm ya usa ese nombre para otra cosa.
 */

/** La raíz del repositorio: este archivo está en `packages/db/src`. */
const ROOT_ENV = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env');

/**
 * El valor de una clave de un `.env`, sin cargar el resto.
 *
 * No se usa `process.loadEnvFile`: mete todo el archivo en `process.env`, y un script de
 * mantenimiento no tiene por qué heredar las claves de la API, del correo y de la IA sólo para
 * aplicar una migración.
 */
export function readEnvKey(contents: string, key: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.startsWith(`${key}=`)) continue;
    const raw = trimmed.slice(key.length + 1).trim();
    // Con o sin comillas: lo escribe quien edita el archivo, y las dos formas son normales.
    return raw.replace(/^(['"])(.*)\1$/, '$2') || undefined;
  }
  return undefined;
}

/** Sólo el servidor, nunca usuario ni clave: esto se imprime en una terminal que puede verse. */
export function describeTarget(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(una URL que no se pudo leer)';
  }
}

export interface DatabaseUrlSources {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  /** El contenido del `.env`, o `undefined` si no existe. Inyectable para poder probar. */
  envFile: () => string | undefined;
}

export type DatabaseUrlResult = { source: 'env' | 'produccion'; url: string } | { error: string };

/** La decisión, sin efectos: es lo que se prueba. */
export function resolveDatabaseUrl(script: string, sources: DatabaseUrlSources): DatabaseUrlResult {
  const pidioProduccion = sources.argv.includes('--produccion');
  const explicita = sources.env['DATABASE_URL'];

  /*
   * Las dos a la vez es una contradicción y no se resuelve eligiendo una.
   *
   * Quien escribe `DATABASE_URL=… pnpm x --produccion` está diciendo dos bases distintas, y
   * adivinar cuál quiso es exactamente el error que este archivo existe para evitar.
   */
  if (pidioProduccion && explicita) {
    return {
      error:
        'Pediste --produccion y además pasaste DATABASE_URL: son dos bases distintas y no sé cuál ' +
        'querés. Dejá una sola de las dos.',
    };
  }

  if (explicita) return { source: 'env', url: explicita };

  if (pidioProduccion) {
    const contents = sources.envFile();
    if (contents === undefined) {
      return {
        error: 'Pediste --produccion pero no encuentro el archivo .env en la raíz del repositorio.',
      };
    }
    const url = readEnvKey(contents, 'DATABASE_URL_PROD');
    if (!url) {
      return {
        error: 'Pediste --produccion pero el .env no tiene DATABASE_URL_PROD, o está vacía.',
      };
    }
    return { source: 'produccion', url };
  }

  return {
    error: [
      'Falta decir contra qué base corre esto.',
      '',
      'Contra la base de producción:',
      `  pnpm ${script} --produccion`,
      '',
      'Contra otra base, pasándola a mano:',
      `  DATABASE_URL="postgresql://usuario:clave@host/base" pnpm ${script}`,
    ].join('\n'),
  };
}

export function requireDatabaseUrl(script: string): string {
  const result = resolveDatabaseUrl(script, {
    argv: process.argv,
    env: process.env,
    envFile: () => {
      try {
        return readFileSync(ROOT_ENV, 'utf8');
      } catch {
        return undefined;
      }
    },
  });
  if ('error' in result) throw new Error(result.error);

  // Antes de tocar nada: a qué servidor va a apuntar esto. Es lo último que se puede frenar.
  console.log(
    `→ ${script} contra ${describeTarget(result.url)} (${result.source === 'produccion' ? 'producción, por --produccion' : 'DATABASE_URL'})`,
  );
  return result.url;
}
