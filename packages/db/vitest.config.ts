import { defineConfig } from 'vitest/config';

// Migration rehearsals boot a real PostgreSQL engine per test, which the 5s default does not fit.
export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 30_000,
    /*
     * De a una suite por vez, y no es una preferencia de estilo.
     *
     * Cada archivo levanta su propio PGlite —un PostgreSQL entero compilado a WebAssembly— y en
     * paralelo la máquina se queda sin memoria: `Zone Allocation failed - process out of memory`, y
     * media docena de suites cayendo con "PGlite failed to initialize". El síntoma engaña, porque
     * parece que fallaron los tests cuando lo que faltó fue RAM. Pasó dos veces en el mismo día,
     * las dos como una falla del gate que no era real.
     *
     * Cuesta unos minutos más y hace que un rojo signifique siempre lo mismo: algo se rompió.
     */
    maxWorkers: 1,
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
