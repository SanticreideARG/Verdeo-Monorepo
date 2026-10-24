import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoveSiteDialog } from './MoveSiteDialog.js';

const calls: { body: unknown; path: string }[] = [];

vi.mock('../lib/api.js', () => ({
  apiRequest: (path: string, init?: { body?: string }) => {
    const json = (value: unknown) =>
      Promise.resolve(new Response(JSON.stringify(value), { status: 200 }));
    if (path === '/api/v1/scope') {
      return json({
        sites: [
          { displayName: 'Neuquén', id: 'nqn' },
          { displayName: 'Córdoba', id: 'cba' },
        ],
      });
    }
    if (path === '/api/v1/zones') {
      return json({
        items: [
          { displayName: 'Centro NQN', id: 'z-nqn', operatingSiteId: 'nqn' },
          { displayName: 'Centro CBA', id: 'z-cba', operatingSiteId: 'cba' },
        ],
      });
    }
    calls.push({ body: init?.body ? (JSON.parse(init.body) as unknown) : null, path });
    return json({
      deliveryDate: '2026-10-24',
      id: 'o',
      previousDeliveryDate: '2026-10-21',
      previousPublicNumber: 'NQN-00012',
      previousTotalMinor: 7_000_000,
      publicNumber: 'CBA-00001',
      totalMinor: 8_000_000,
    });
  },
}));

describe('MoveSiteDialog', () => {
  it('muestra qué cambia antes de mover, y mueve recién al confirmar', async () => {
    const onMoved = vi.fn();
    render(
      <MoveSiteDialog
        onClose={() => undefined}
        onMoved={onMoved}
        target={{ currency: 'ARS', currentSiteName: 'Neuquén', kind: 'order', orderId: 'o' }}
      />,
    );

    const city = await screen.findByRole('combobox', { name: /Ciudad destino/ });
    // La ciudad actual no se ofrece.
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Neuquén' })).toBeNull());
    fireEvent.change(city, { target: { value: 'cba' } });
    fireEvent.change(screen.getByRole('combobox', { name: /Zona/ }), {
      target: { value: 'z-cba' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ver qué cambia' }));

    const status = await screen.findByRole('status');
    // El número de pedido es un control interno: no se muestra.
    expect(status.textContent).not.toContain('NQN-00012');
    expect(status.textContent).toContain('entrega');
    expect(calls[0]).toEqual({
      body: { preview: true, targetSiteId: 'cba', zoneId: 'z-cba' },
      path: '/api/v1/orders/o/site',
    });
    expect(onMoved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mover' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(calls[1]?.body).toEqual({ preview: false, targetSiteId: 'cba', zoneId: 'z-cba' });
  });
});
