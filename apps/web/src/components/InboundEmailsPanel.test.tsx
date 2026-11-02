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

  describe('con varias ciudades', () => {
    const CABA = '90000000-0000-4000-8000-00000000000a';
    const NQN = '90000000-0000-4000-8000-00000000000b';
    const OFERTA_NQN = 'f3000000-0000-4000-8000-00000000000b';
    const fila = detalle.preview.items[0] as (typeof detalle.preview.items)[number];
    const conCiudades = {
      ...detalle,
      preview: {
        ...detalle.preview,
        items: [
          {
            ...fila,
            bySite: {
              [CABA]: {
                duplicateOf: null,
                existingOrders: [],
                items: [{ dishes: [], offeringId: 'f3000000-0000-4000-8000-00000000000a' }],
                notices: [],
              },
              [NQN]: {
                duplicateOf: null,
                existingOrders: [],
                items: [{ dishes: [], offeringId: OFERTA_NQN }],
                notices: [],
              },
            },
            items: fila.items.map((item) => ({ ...item, offeringId: null })),
            notices: [],
            operatingSiteId: null,
          },
        ],
        sites: [
          {
            deliveryDefault: '',
            deliveryOptions: [],
            id: CABA,
            name: 'Capital Federal',
            offerings: [],
          },
          { deliveryDefault: '', deliveryOptions: [], id: NQN, name: 'Neuquén', offerings: [] },
        ],
      },
    };

    // Tocar el botón sin ciudad ni medio de pago no hacía nada: ahora dice qué falta.
    it('dice qué falta al tocar el botón, y manda la ciudad elegida', async () => {
      vi.mocked(apiRequest).mockImplementation((path: string) => {
        if (path === '/api/v1/inbound-emails') return json({ items: [resumen] });
        if (path.endsWith('/approve'))
          return json({ created: 1, failed: [], orderIds: [], results: [] });
        return json(conCiudades);
      });
      render(<InboundEmailsPanel canConfirm={false} onChanged={vi.fn()} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));

      const aprobar = await screen.findByRole('button', { name: 'Aprobar como borrador' });
      fireEvent.click(aprobar);
      expect(screen.getByRole('alert').textContent).toContain('Elegí la ciudad de un pedido');
      expect(apiRequest).not.toHaveBeenCalledWith(
        expect.stringContaining('/approve'),
        expect.anything(),
      );

      fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: NQN } });
      expect(screen.getByRole('alert').textContent).toContain('Elegí el medio de pago');

      fireEvent.change(
        screen.getAllByRole('combobox', { name: /Medio de pago/ }).at(-1) as Element,
        {
          target: { value: 'Transferencia' },
        },
      );
      fireEvent.click(aprobar);

      await waitFor(() =>
        expect(apiRequest).toHaveBeenCalledWith(
          expect.stringContaining('/approve'),
          expect.anything(),
        ),
      );
      const call = vi.mocked(apiRequest).mock.calls.find(([path]) => path.endsWith('/approve'));
      const body = JSON.parse(call?.[1]?.body as string) as {
        rows: { items: { offeringId: string }[]; operatingSiteId: string }[];
      };
      expect(body.rows[0]?.operatingSiteId).toBe(NQN);
      expect(body.rows[0]?.items[0]?.offeringId).toBe(OFERTA_NQN);
    });
  });
});
