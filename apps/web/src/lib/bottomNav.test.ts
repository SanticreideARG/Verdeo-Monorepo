import { describe, expect, it } from 'vitest';

import { bottomNavLayout } from './bottomNav.js';

describe('bottomNavLayout', () => {
  // Pedidos, Cocina | logo | Rutas, Clientes: el logo queda arriba del botón de inicio de Android.
  it('con cuatro accesos no muestra "Más" y deja dos de cada lado', () => {
    expect(bottomNavLayout(4)).toEqual({ left: 2, showMore: false });
  });

  it('con tres accesos agrega "Más" para emparejar los lados', () => {
    expect(bottomNavLayout(3)).toEqual({ left: 2, showMore: true });
  });

  it('el logo queda en el medio con cualquier cantidad', () => {
    for (const entries of [1, 2, 3, 4, 5, 6]) {
      const { left, showMore } = bottomNavLayout(entries);
      const right = entries - left + (showMore ? 1 : 0);
      expect(left).toBe(right);
    }
  });
});
