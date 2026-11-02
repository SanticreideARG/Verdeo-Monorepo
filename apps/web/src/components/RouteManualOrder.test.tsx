import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RouteManualOrderBar, RouteManualOrderList, splitManualOrder } from './RouteManualOrder.js';
import { RouteMap } from './RouteMap.js';

const parada = (id: string, deliveryLatitude: number | null = -38.95) => ({
  customerDisplayName: `Cliente ${id}`,
  deliveryAddress: `Calle ${id}`,
  deliveryLatitude,
  deliveryLongitude: deliveryLatitude === null ? null : -68.06,
  id,
  sequence: Number(id),
});

describe('establecer el orden a mano', () => {
  it('las elegidas van en el orden en que se tocaron, y una que ya no está se ignora', () => {
    const { pending, picked } = splitManualOrder(
      [parada('1'), parada('2'), parada('3')],
      ['3', 'x', '1'],
    );
    expect(picked.map((stop) => stop.id)).toEqual(['3', '1']);
    expect(pending.map((stop) => stop.id)).toEqual(['2']);
  });

  it('guardar se habilita recién con todas elegidas', () => {
    const acciones = { onCancel: vi.fn(), onReset: vi.fn(), onSave: vi.fn(), onUndo: vi.fn() };
    const { rerender } = render(
      <RouteManualOrderBar {...acciones} pickedCount={0} saving={false} total={2} />,
    );
    const guardar = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Guardar orden' });
    expect(guardar().disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Deshacer' }).disabled).toBe(true);
    expect(screen.getByText('Elegí la parada 1.')).toBeTruthy();

    rerender(<RouteManualOrderBar {...acciones} pickedCount={2} saving={false} total={2} />);
    expect(guardar().disabled).toBe(false);
    fireEvent.click(guardar());
    expect(acciones.onSave).toHaveBeenCalledOnce();
  });

  it('una parada sin ubicación se elige desde la lista', () => {
    const onPick = vi.fn();
    render(
      <RouteManualOrderList
        onPick={onPick}
        order={['1']}
        stops={[parada('1'), parada('2', null)]}
      />,
    );
    expect(screen.getByText('Faltan 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Cliente 1/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /sin ubicación en el mapa/ }));
    expect(onPick).toHaveBeenCalledWith('2');
  });

  it('en el mapa, tocar un punto lo elige; el ya elegido muestra su número nuevo', () => {
    const onPick = vi.fn();
    const stops = [parada('1'), parada('2')];
    const { container } = render(<RouteMap picking={{ onPick, order: ['2'] }} stops={stops} />);
    const pins = container.querySelectorAll<HTMLElement>('.route-pin');
    expect(pins).toHaveLength(2);
    const pendiente = container.querySelector<HTMLElement>('.route-pin-pending');
    expect(pendiente?.getAttribute('aria-label')).toContain('Cliente 1');
    expect(container.querySelector('.route-pin:not(.route-pin-pending) span')?.textContent).toBe(
      '1',
    );

    fireEvent.click(pendiente!);
    expect(onPick).toHaveBeenCalledWith('1');
  });

  it('un nombre con HTML no se interpreta en el mapa', () => {
    const { container } = render(
      <RouteMap
        picking={{ onPick: vi.fn(), order: [] }}
        stops={[{ ...parada('1'), customerDisplayName: '<img src=x>' }]}
      />,
    );
    expect(container.querySelector('.route-pin')?.getAttribute('aria-label')).toContain(
      '<img src=x>',
    );
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
