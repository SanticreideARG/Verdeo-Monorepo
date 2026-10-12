import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../lib/api.js';
import type * as PaymentMethodsModule from '../lib/paymentMethods.js';
import { InboundEmailsPanel } from './InboundEmailsPanel.js';

vi.mock('../lib/api.js', () => ({ apiRequest: vi.fn() }));
vi.mock('../lib/paymentMethods.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PaymentMethodsModule>()),
  usePaymentMethods: () => [{ code: 'transfer', displayName: 'Transferencia' }],
}));

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

const resumen = {
  customerName: 'Ana Prueba',
  fromAddress: 'info@verdeo.com.ar',
  id: '0b000000-0000-4000-8000-000000000001',
  itemsSummary: 'Menú Paleo & Keto 400 × 2',
  receivedAt: '2026-10-12T13:15:00.000Z',
  status: 'pending',
  subject: 'Pedido online Capital Federal',
};

const detalle = {
  body: 'Celular: 1155550101\nDirección de entrega: Calle Falsa 123\nMenú Paleo & Keto  400 2',
  fromAddress: 'info@verdeo.com.ar',
  id: resumen.id,
  orderIds: [],
  preview: {
    inquiries: [],
    items: [
      {
        customerMatch: { candidates: [], customerId: null, displayName: null, kind: 'nuevo' },
        customerName: 'Ana Prueba',
        deliveryAddress: 'Calle Falsa 123',
        duplicateOf: null,
        email: null,
        items: [
          {
            dishes: [],
            offeringId: 'f3000000-0000-4000-8000-000000000001',
            quantityUnits: 2,
            size: '400',
            variety: 'Menú Paleo & Keto',
          },
        ],
        kind: 'email',
        locality: null,
        notes: null,
        paymentExpectation: null,
        phone: '+5491155550101',
        receivedOn: null,
        rowNumber: 1,
        warnings: [],
      },
    ],
    offerings: [{ id: 'f3000000-0000-4000-8000-000000000001', label: 'Menú Paleo & Keto 400' }],
    unreadable: 0,
  },
  receivedAt: resumen.receivedAt,
  status: 'pending',
  subject: resumen.subject,
};

describe('InboundEmailsPanel', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it('no aparece cuando no hay nada esperando', async () => {
    vi.mocked(apiRequest).mockImplementation(() => json({ items: [] }));
    const { container } = render(<InboundEmailsPanel canConfirm onChanged={vi.fn()} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  // La revisión se hace al abrir el pedido, con el correo original al lado para comparar.
  it('abre el pedido con la revisión y el correo original', async () => {
    vi.mocked(apiRequest).mockImplementation((path: string) =>
      path === '/api/v1/inbound-emails' ? json({ items: [resumen] }) : json(detalle),
    );
    render(<InboundEmailsPanel canConfirm onChanged={vi.fn()} />);

    expect(await screen.findByText('Ana Prueba')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));

    expect(await screen.findByText('Pedido por correo')).toBeTruthy();
    expect(screen.getByText('Correo original')).toBeTruthy();
    expect(screen.getByText(/Dirección de entrega: Calle Falsa 123/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Aprobar y confirmar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descartar correo' })).toBeTruthy();
  });
});
