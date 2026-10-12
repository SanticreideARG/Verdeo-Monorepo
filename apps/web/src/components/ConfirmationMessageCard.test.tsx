import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmationMessageCard } from './ConfirmationMessageCard.js';

const pedido = {
  customer: { displayName: 'Beatriz Prueba', email: null, id: 'c1', phone: null, whatsapp: null },
  deliveryAddress: 'Pasteur 974',
  deliveryDate: '2026-10-19',
  items: [
    {
      dishSelections: [],
      id: 'i1',
      offeringId: null,
      productName: 'Menú Real',
      quantityUnits: 1,
      totalMinor: 8_500_000,
      unitPriceMinor: 8_500_000,
      variantName: '400',
    },
  ],
  totalMinor: 8_500_000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConfirmationMessageCard', () => {
  it('copia el mensaje al portapapeles y lo confirma en el botón', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ConfirmationMessageCard order={pedido} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar confirmación' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '✓ Copiado' })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(
      'Hola Beatriz! Te escribimos de Verdeo Alimentación Mejorada para confirmar tu pedido. ' +
        '1 menú real 400 = $85.000 a Pasteur 974. ' +
        'Entrega: lunes 19 de 11 a 14h (horario tentativo a confirmar el sábado), te viene bien? Gracias!',
    );
  });

  it('la franja horaria se puede cambiar antes de copiar', () => {
    render(<ConfirmationMessageCard order={pedido} />);
    fireEvent.change(screen.getByLabelText('Franja horaria'), { target: { value: 'de 18 a 21h' } });
    expect(screen.getByText(/lunes 19 de 18 a 21h/)).toBeTruthy();
  });
});
