import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../lib/api.js';
import { locateStatusText, UnlocatedOrdersPanel } from './LocateAddress.js';

vi.mock('../lib/api.js', () => ({ apiRequest: vi.fn() }));

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

const pedido = (n: number) => ({
  address: `Calle ${String(n)}`,
  customerName: `Cliente ${String(n)}`,
  hasAddress: false,
  id: `id-${String(n)}`,
  publicNumber: `CABA-${String(n)}`,
  status: 'CONFIRMED',
});

describe('locateStatusText', () => {
  it('dice cada resultado en palabras de quien arma la ruta', () => {
    expect(locateStatusText({ status: 'located' })).toBe('Ubicada.');
    expect(locateStatusText({ reason: 'El punto queda lejos.', status: 'review' })).toContain(
      'lejos',
    );
    expect(locateStatusText({ status: 'no_match' })).toContain('No se encontró');
  });
});

describe('UnlocatedOrdersPanel', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it('no aparece cuando no falta ubicar nada', async () => {
    vi.mocked(apiRequest).mockImplementation(() => json({ items: [] }));
    const { container } = render(
      <UnlocatedOrdersPanel deliveryDate="2026-10-10" onChanged={vi.fn()} />,
    );
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('lista los pedidos que no entrarían en la ruta', async () => {
    vi.mocked(apiRequest).mockImplementation(() => json({ items: [pedido(1), pedido(2)] }));
    render(<UnlocatedOrdersPanel deliveryDate="2026-10-10" onChanged={vi.fn()} />);

    expect(await screen.findByText('2 pedidos no tienen ubicación')).toBeTruthy();
    expect(screen.getByText('CABA-1')).toBeTruthy();
  });

  // El botón repite por tandas y pasa los ya intentados para no volver sobre los que fallaron.
  it('ubica por tandas hasta que no quedan y no repite los ya intentados', async () => {
    const onChanged = vi.fn();
    let ubicados = false;
    vi.mocked(apiRequest).mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/api/v1/delivery/unlocated')) {
        return json({ items: ubicados ? [] : [pedido(1), pedido(2)] });
      }
      const pedidoBody = JSON.parse(init?.body as string) as { skipOrderIds: string[] };
      if (pedidoBody.skipOrderIds.length === 0) {
        return json({
          remaining: 1,
          results: [{ orderId: 'id-1', publicNumber: 'CABA-1', status: 'located' }],
        });
      }
      ubicados = true;
      return json({
        remaining: 0,
        results: [
          { orderId: 'id-2', publicNumber: 'CABA-2', reason: 'Queda lejos.', status: 'review' },
        ],
      });
    });
    render(<UnlocatedOrdersPanel deliveryDate="2026-10-10" onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: /Ubicar los pedidos/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const llamadas = vi
      .mocked(apiRequest)
      .mock.calls.filter(([path]) => path === '/api/v1/delivery/locate-missing');
    expect(llamadas).toHaveLength(2);
    expect(JSON.parse(llamadas[1]?.[1]?.body as string)).toMatchObject({ skipOrderIds: ['id-1'] });
  });
});
