import { describe, expect, it } from 'vitest';

import { describeTarget, readEnvKey, resolveDatabaseUrl } from './require-database-url.js';

const ENV_FILE = [
  '# Producción',
  'DATABASE_URL_PROD="postgresql://admin:secreto@db.example.neon.tech/verdeo"',
  'DATABASE_URL_DEV=postgresql://dev:dev@localhost/verdeo',
  'OTRA=cosa',
].join('\n');

function sources(overrides: {
  argv?: string[];
  env?: Record<string, string>;
  envFile?: string | undefined;
}) {
  return {
    argv: overrides.argv ?? ['node', 'script.ts'],
    env: overrides.env ?? {},
    envFile: () => ('envFile' in overrides ? overrides.envFile : ENV_FILE),
  };
}

describe('resolveDatabaseUrl', () => {
  /*
   * El caso que justifica todo: producción se pide con una palabra, y esa palabra alcanza.
   *
   * Antes hacía falta copiar una línea larga que la terminal parte en dos, y copiada rota el
   * comando corría sin la variable. Pasó cuatro veces seguidas.
   */
  it('lee la base de producción del .env cuando se pide --produccion', () => {
    const result = resolveDatabaseUrl(
      'db:migrate',
      sources({ argv: ['node', 'migrate.ts', '--produccion'] }),
    );

    expect(result).toEqual({
      source: 'produccion',
      url: 'postgresql://admin:secreto@db.example.neon.tech/verdeo',
    });
  });

  /*
   * Producción nunca es la de por defecto. Si un script de mantenimiento corriera contra el `.env`
   * sin que nadie lo pidiera, "correrlo sin pensar" apuntaría a producción.
   */
  it('no usa el .env si no se pidió --produccion', () => {
    const result = resolveDatabaseUrl('db:migrate', sources({}));

    expect(result).toHaveProperty('error');
  });

  it('el error dice cómo pedir producción con una sola palabra', () => {
    const result = resolveDatabaseUrl('db:migrate', sources({}));

    expect('error' in result && result.error).toContain('pnpm db:migrate --produccion');
  });

  it('usa DATABASE_URL cuando viene por variable', () => {
    const result = resolveDatabaseUrl(
      'db:migrate',
      sources({ env: { DATABASE_URL: 'postgresql://x:x@localhost/otra' } }),
    );

    expect(result).toEqual({ source: 'env', url: 'postgresql://x:x@localhost/otra' });
  });

  /*
   * Dos bases a la vez es una contradicción y no se resuelve eligiendo una: adivinar cuál quiso la
   * persona es justo el error que esto existe para evitar.
   */
  it('se niega cuando se piden las dos bases a la vez', () => {
    const result = resolveDatabaseUrl(
      'db:migrate',
      sources({
        argv: ['node', 'migrate.ts', '--produccion'],
        env: { DATABASE_URL: 'postgresql://x:x@localhost/otra' },
      }),
    );

    expect('error' in result && result.error).toContain('dos bases distintas');
  });

  it('avisa cuando no hay .env', () => {
    const result = resolveDatabaseUrl(
      'db:migrate',
      sources({ argv: ['node', 'migrate.ts', '--produccion'], envFile: undefined }),
    );

    expect('error' in result && result.error).toContain('no encuentro el archivo .env');
  });

  it('avisa cuando el .env no tiene la clave', () => {
    const result = resolveDatabaseUrl(
      'db:migrate',
      sources({ argv: ['node', 'migrate.ts', '--produccion'], envFile: 'OTRA=cosa' }),
    );

    expect('error' in result && result.error).toContain('DATABASE_URL_PROD');
  });

  // Una clave presente pero vacía no es una base: conectaría a ningún lado con un error confuso.
  it('trata la clave vacía como ausente', () => {
    const result = resolveDatabaseUrl(
      'db:migrate',
      sources({ argv: ['node', 'migrate.ts', '--produccion'], envFile: 'DATABASE_URL_PROD=' }),
    );

    expect(result).toHaveProperty('error');
  });

  // Otras banderas del script no se confunden con ésta.
  it('convive con las demás banderas del script', () => {
    const result = resolveDatabaseUrl(
      'db:wipe-operations',
      sources({ argv: ['node', 'wipe.ts', '--dry-run', '--produccion'] }),
    );

    expect(result).toMatchObject({ source: 'produccion' });
  });
});

describe('readEnvKey', () => {
  it('lee el valor con comillas dobles', () => {
    expect(readEnvKey(ENV_FILE, 'DATABASE_URL_PROD')).toBe(
      'postgresql://admin:secreto@db.example.neon.tech/verdeo',
    );
  });

  it('lee el valor sin comillas', () => {
    expect(readEnvKey(ENV_FILE, 'DATABASE_URL_DEV')).toBe('postgresql://dev:dev@localhost/verdeo');
  });

  it('lee el valor con comillas simples', () => {
    expect(readEnvKey("CLAVE='valor'", 'CLAVE')).toBe('valor');
  });

  // Un comentario que menciona la clave no es la clave.
  it('ignora los comentarios', () => {
    expect(readEnvKey('# DATABASE_URL_PROD=viejo\nOTRA=1', 'DATABASE_URL_PROD')).toBeUndefined();
  });

  // `DATABASE_URL_PROD_VIEJA` no es `DATABASE_URL_PROD`: la clave se compara entera.
  it('no confunde una clave con otra que empieza igual', () => {
    expect(readEnvKey('DATABASE_URL_PROD_VIEJA=x', 'DATABASE_URL_PROD')).toBeUndefined();
  });

  it('acepta finales de línea de Windows', () => {
    expect(readEnvKey('A=1\r\nDATABASE_URL_PROD=url\r\nB=2', 'DATABASE_URL_PROD')).toBe('url');
  });
});

describe('describeTarget', () => {
  /*
   * Lo que se imprime en una terminal que puede verse: el servidor y nada más. La clave que va en
   * la URL no tiene por qué quedar en un historial de pantalla.
   */
  it('muestra el servidor y nunca el usuario ni la clave', () => {
    const target = describeTarget('postgresql://admin:secreto@db.example.neon.tech/verdeo');

    expect(target).toBe('db.example.neon.tech');
    expect(target).not.toContain('secreto');
    expect(target).not.toContain('admin');
  });

  it('no se rompe con una URL ilegible', () => {
    expect(describeTarget('esto no es una url')).toContain('no se pudo leer');
  });
});
