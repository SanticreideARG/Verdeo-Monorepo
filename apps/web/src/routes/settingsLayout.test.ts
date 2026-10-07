import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const routesFolder = dirname(fileURLToPath(import.meta.url));

/**
 * El submenú del Panel de control tiene que montarse ADENTRO del panel.
 *
 * El diseño de dos columnas es `.dashboard-panel:has(> .settings-nav)`: sólo se activa si el submenú
 * es hijo directo del panel. Montado al lado —como hermano, antes de la sección— el selector no
 * coincide, el submenú queda arriba a todo el ancho y el contenido cae debajo de él en lugar de
 * seguir a su derecha.
 *
 * Ocho de las trece pantallas lo montaban afuera, y la única forma de enterarse era abrir cada una:
 * el CSS no falla, simplemente no se aplica. Este test lee los archivos porque es lo único que ve el
 * error donde ocurre.
 */
describe('Panel de control', () => {
  const files = readdirSync(routesFolder).filter((name) => name.endsWith('.tsx'));
  const withNav = files.filter((name) =>
    readFileSync(join(routesFolder, name), 'utf8').includes('<SettingsTabs'),
  );

  // Si el recorrido no encuentra las pantallas, el test de abajo pasaría sin haber mirado nada.
  it('encuentra las pantallas que montan el submenú', () => {
    expect(withNav.length).toBeGreaterThanOrEqual(13);
  });

  it('monta el submenú adentro del panel en cada una', () => {
    const misplaced: string[] = [];
    for (const name of withNav) {
      const lines = readFileSync(join(routesFolder, name), 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.includes('<SettingsTabs')) return;
        // La línea anterior que no está en blanco tiene que abrir el panel.
        let previous = index - 1;
        while (previous >= 0 && lines[previous]?.trim() === '') previous -= 1;
        if (!/<section className="dashboard-panel">\s*$/.test(lines[previous] ?? '')) {
          misplaced.push(`${name}:${String(index + 1)}`);
        }
      });
    }

    expect(misplaced).toEqual([]);
  });
});
