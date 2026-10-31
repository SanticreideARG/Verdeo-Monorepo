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

  const statusCalls = () =>
    vi.mocked(apiRequest).mock.calls.filter(([path]) => path === '/api/v1/orders/pedido/status');

  it('"Enviar a stock" pide una confirmación y cancela pasando las viandas a stock', async () => {
    const onSentToStock = vi.fn();
    render(
      <ChangeCustomerDialog
        canCreateCustomer
        currentCustomerId="nn"
        onChanged={() => undefined}
        onClose={() => undefined}
        onSentToStock={onSentToStock}
        orderId="pedido"
        stock={{ paid: false }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enviar a stock' }));
    expect(screen.getByRole('heading', { name: '¿Enviar el pedido a stock?' })).toBeTruthy();
    expect(statusCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a stock' }));

    await waitFor(() => expect(onSentToStock).toHaveBeenCalled());
    expect(JSON.parse(statusCalls()[0]?.[1]?.body as string)).toMatchObject({
      status: 'CANCELLED',
      toStock: true,
    });
  });

  it('si figura cobrado, pide una segunda confirmación', async () => {
    const onSentToStock = vi.fn();
    render(
      <ChangeCustomerDialog
        canCreateCustomer
        currentCustomerId="nn"
        onChanged={() => undefined}
        onClose={() => undefined}
        onSentToStock={onSentToStock}
        orderId="pedido"
        stock={{ paid: true }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enviar a stock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Este pedido figura como cobrado' })).toBeTruthy();
    expect(statusCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, enviar a stock igual' }));

    await waitFor(() => expect(onSentToStock).toHaveBeenCalled());
    expect(statusCalls()).toHaveLength(1);
  });

  it('sin permiso o con el pedido sin confirmar, no ofrece enviar a stock', () => {
    render(
      <ChangeCustomerDialog
        canCreateCustomer
        currentCustomerId="nn"
        onChanged={() => undefined}
        onClose={() => undefined}
        orderId="pedido"
        stock={null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Enviar a stock' })).toBeNull();
  });
});
