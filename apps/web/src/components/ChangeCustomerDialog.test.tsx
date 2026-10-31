import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../lib/api.js';
import { ChangeCustomerDialog } from './ChangeCustomerDialog.js';

vi.mock('../lib/api.js', () => ({ apiRequest: vi.fn() }));

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const ANA = {
  createdAt: '',
  displayName: 'Ana Prueba',
  id: 'ana',
  phone: '299 555',
  status: 'active',
};

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/customers?search='))
      return json({ items: [{ ...ANA, displayName: 'nn', id: 'nn' }, ANA] });
    if (path === '/api/v1/customers/ana')
      return json({
        addresses: [
          {
            active: true,
            id: 'casa',
            label: 'Casa',
            primary: true,
            unit: null,
            writtenAddress: 'Mitre 100',
          },
        ],
      });
    return json({ id: 'pedido' });
  });
});

describe('cambiar el cliente de un pedido', () => {
  it('busca, elige el cliente y su domicilio principal, y manda el cambio', async () => {
    const onChanged = vi.fn();
    render(
      <ChangeCustomerDialog
        canCreateCustomer
        currentCustomerId="nn"
        onChanged={onChanged}
        onClose={() => undefined}
        orderId="pedido"
      />,
    );

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'ana' } });
    // El cliente actual del pedido no se ofrece.
    fireEvent.click(await screen.findByRole('button', { name: /Ana Prueba/ }));
    expect(screen.queryByRole('button', { name: /^nn/ })).toBeNull();
    expect(await screen.findByRole('option', { name: 'Casa — Mitre 100' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cliente' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(
        ([path, init]) => path === '/api/v1/orders/pedido' && init?.method === 'PATCH',
      );
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({
      customerId: 'ana',
      deliveryAddressId: 'casa',
      reason: 'Cambio de cliente',
    });
  });
});
