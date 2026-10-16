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

  /*
   * Cada sección del panel, detrás de la puerta (`SettingsGate`). Una sección nueva que se agrega
   * al submenú y no a la puerta la ve el operador escribiendo la dirección, aunque no esté en su
   * menú: este test la encuentra.
   */
  it('pone cada sección del panel detrás de la llave del Panel de control', () => {
    const tabs = readFileSync(join(routesFolder, '..', 'lib', 'settingsCatalog.ts'), 'utf8');
    const app = readFileSync(join(routesFolder, 'App.tsx'), 'utf8');
    // Apariencia es la preferencia de uno mismo: la tiene cualquiera.
    const hrefs = [...tabs.matchAll(/href: '([^']+)'/g)]
      .map((match) => match[1] ?? '')
      .filter((href) => href !== '/app/ajustes/apariencia');
    // Más el inicio del panel, que no es una sección pero entra por la misma puerta.
    hrefs.push('/app/ajustes');
    expect(hrefs.length).toBeGreaterThanOrEqual(16);

    const ungated = hrefs.filter((href) => {
      const route = app.split(/\r?\n/).findIndex((line) => line.includes(`path="${href}"`));
      if (route === -1) return true;
      const lines = app
        .split(/\r?\n/)
        .slice(route, route + 4)
        .join(' ');
      return !lines.includes('<SettingsGate>');
    });
    expect(ungated).toEqual([]);
  });
});
