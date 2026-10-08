import { describe, expect, it } from 'vitest';

import { historyActor } from './orderHistory.js';

describe('historyActor', () => {
  it('dice el nombre de quien hizo el cambio', () => {
    expect(
      historyActor({
        actorDisplayName: 'Isabella',
        actorUserId: 'u1',
        fromStatus: 'DRAFT',
        reason: null,
      }),
    ).toBe('Isabella');
  });

  // Un pedido de la web lo carga el cliente: no tiene usuario porque no es una cuenta del equipo.
  it('dice que el alta sin usuario la hizo el cliente desde la web', () => {
    expect(
      historyActor({ actorDisplayName: null, actorUserId: null, fromStatus: null, reason: null }),
    ).toBe('el cliente, desde la web');
  });

  /*
   * La entrega confirmada con el enlace del repartidor no tiene usuario, pero trae su motivo. Decir
   * además "sin usuario" es repetir lo que el motivo ya explica.
   */
  it('no agrega nada cuando no hay usuario pero el motivo ya lo explica', () => {
    expect(
      historyActor({
        actorDisplayName: null,
        actorUserId: null,
        fromStatus: 'READY',
        reason: 'Entrega confirmada desde el enlace de la ruta',
      }),
    ).toBeNull();
  });

  it('dice "sin usuario" cuando nada más explica el cambio', () => {
    expect(
      historyActor({
        actorDisplayName: null,
        actorUserId: null,
        fromStatus: 'READY',
        reason: null,
      }),
    ).toBe('sin usuario');
  });

  // Tiene id pero la unión no encuentra al usuario: mostrarlo como "nadie" sería mentir.
  it('avisa cuando el usuario ya no existe en lugar de dejar el cambio sin autor', () => {
    expect(
      historyActor({
        actorDisplayName: null,
        actorUserId: 'u-borrado',
        fromStatus: 'DRAFT',
        reason: null,
      }),
    ).toBe('un usuario que ya no existe');
  });

  // Para las ediciones, que no tienen estado anterior: sólo cuenta si hay usuario o no.
  it('sirve para una edición, que no trae estado anterior', () => {
    expect(historyActor({ actorDisplayName: 'Tamara', actorUserId: 'u2' })).toBe('Tamara');
  });
});
