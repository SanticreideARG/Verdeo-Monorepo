import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActionMenu } from './ActionMenu.js';

function armar() {
  const cancelar = vi.fn();
  const eliminar = vi.fn();
  render(
    <ActionMenu
      items={[
        { key: 'cancel', label: 'Cancelar pedido', onSelect: cancelar },
        { key: 'delete', label: 'Eliminar', onSelect: eliminar, tone: 'danger' },
      ]}
      label="Más acciones para Ana"
    />,
  );
  return {
    cancelar,
    eliminar,
    trigger: screen.getByRole('button', { name: 'Más acciones para Ana' }),
  };
}

describe('ActionMenu', () => {
  it('está cerrado hasta que se toca el botón', () => {
    const { trigger } = armar();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('abre las opciones, ejecuta la elegida y se cierra', () => {
    const { cancelar, trigger } = armar();
    fireEvent.click(trigger);

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Cancelar pedido',
      'Eliminar',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar pedido' }));

    expect(cancelar).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('se recorre con las flechas y se cierra con Escape devolviendo el foco', () => {
    const { trigger } = armar();
    fireEvent.click(trigger);
    const [primera, segunda] = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(primera);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(segunda);
    // Desde la última vuelve a la primera.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(primera);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('se cierra al tocar afuera', () => {
    const { trigger } = armar();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
