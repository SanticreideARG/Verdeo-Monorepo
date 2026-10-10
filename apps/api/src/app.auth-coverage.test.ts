import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/*
 * Toda ruta que lee la sesión tiene que tener antes su `requireAuthentication`.
 *
 * Catorce rutas la leían sin que nadie la hubiera resuelto —el calendario, los fondos de etiquetas,
 * el tablero, los respaldos, las pruebas de IA y de correo— y respondían 500 en cada llamada. Los
 * tests de cada ruta no lo veían porque arman la app con la sesión ya puesta. Esto mira el código:
 * es tosco, pero es la única forma de que una ruta nueva sin su `use` no llegue a producción.
 */
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.ts'), 'utf8');

function protectedPrefixes(): string[] {
  return [...source.matchAll(/app\.use\('([^']+)',\s*requireAuthentication/g)].map(
    (match) => match[1] ?? '',
  );
}

function isCovered(path: string, uses: readonly string[]): boolean {
  return uses.some((use) =>
    use.endsWith('/*')
      ? path === use.slice(0, -2) || path.startsWith(use.slice(0, -1))
      : path === use,
  );
}

function routesReadingSession(): string[] {
  const routes: string[] = [];
  const pattern = /app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const rest = source.slice(match.index + match[0].length, match.index + 4_000);
    const next = rest.search(/\n {2}app\.(get|post|put|patch|delete|use)\(/);
    const body = next >= 0 ? rest.slice(0, next) : rest;
    if (/context\.get\('session'\)/.test(body)) {
      routes.push(`${(match[1] ?? '').toUpperCase()} ${match[2] ?? ''}`);
    }
  }
  return routes;
}

describe('cobertura de autenticación', () => {
  it('encuentra rutas que leen la sesión (si no, el test no estaría mirando nada)', () => {
    expect(routesReadingSession().length).toBeGreaterThan(50);
  });

  it('toda ruta que lee la sesión exige iniciar sesión antes', () => {
    const uses = protectedPrefixes();
    const sinCobertura = routesReadingSession().filter(
      (route) => !isCovered(route.split(' ')[1] ?? '', uses),
    );
    expect(sinCobertura).toEqual([]);
  });
});
