import { describe, expect, it } from 'vitest';

import { orderRowActions } from './orderRowActions.js';

const todos = [
  'orders.confirm',
  'orders.edit',
  'orders.cancel',
  'orders.revert_status',
  'orders.delete',
];
const claves = (lista: { key: string }[]) => lista.map((action) => action.key);

describe('orderRowActions', () => {
  it('un borrador deja a la vista confirmar y manda cancelar al menú', () => {
    const { menu, primary } = orderRowActions({ status: 'DRAFT' }, todos);
    expect(primary?.key).toBe('confirm');
    expect(claves(menu)).toEqual(['view', 'cancel', 'delete']);
  });

  it('uno confirmado deja a la vista marcar listo', () => {
    const { menu, primary } = orderRowActions({ status: 'CONFIRMED' }, todos);
    expect(primary?.key).toBe('ready');
    expect(claves(menu)).toEqual(['view', 'cancel', 'delete']);
  });

  // Revertir es una excepción: va al menú, no a la vista.
  it('uno listo no tiene paso que siga a la vista, y revertir queda en el menú', () => {
    const { menu, primary } = orderRowActions({ status: 'READY' }, todos);
    expect(primary).toBeNull();
    expect(claves(menu)).toEqual(['view', 'revert', 'delete']);
  });

  it('respeta los permisos: sin permisos sólo queda ver el detalle', () => {
    const { menu, primary } = orderRowActions({ status: 'DRAFT' }, []);
    expect(primary).toBeNull();
    expect(claves(menu)).toEqual(['view']);
  });

  it('eliminar se marca como peligroso', () => {
    const { menu } = orderRowActions({ status: 'DELIVERED' }, ['orders.delete']);
    expect(menu.find((action) => action.key === 'delete')?.tone).toBe('danger');
  });
});
