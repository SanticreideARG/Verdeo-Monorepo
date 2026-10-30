import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../lib/api.js';
import type { WeeklyMenu } from '../lib/operations.js';
import { StockAvailablePanel } from './StockAvailablePanel.js';

vi.mock('../lib/api.js', () => ({ apiRequest: vi.fn() }));

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

const SITE = '90000000-0000-4000-8000-000000000001';
const menu = {
  cycle: { alias: 'Octubre 5', id: 'c1' },
  id: 'm1',
  offerings: [
    { composable: false, familyName: 'Menú Keto', id: 'o-keto-400', variantName: '400' },
    { composable: false, familyName: 'Menú Real', id: 'o-real-250', variantName: '250' },
  ],
  operatingSiteId: SITE,
} as unknown as WeeklyMenu;

const lot = {
  available: 2,
  cycleAlias: 'Octubre 4',
  dishes: [],
  expired: false,
  expiresAt: '2099-11-20T00:00:00.000Z',
  familyName: 'Real',
  id: 'lot-1',
  operatingSiteId: SITE,
  operatingSiteName: 'Córdoba',
  quantityUnits: 5,
  soldUnits: 3,
  variantName: '250',
  writtenOffUnits: 0,
};

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(apiRequest).mockImplementation((path: string) =>
    path.includes('/surplus')
      ? json({
          cycle: menu.cycle,
          items: [
            { disponible: 3, familyName: 'Keto', variantName: '400' },
            { disponible: 0, familyName: 'Real', variantName: '400' },
          ],
        })
      : json({ items: [lot] }),
  );
});

describe('StockAvailablePanel', () => {
  it('resume el total cerrado y al abrir muestra el período y los lotes', async () => {
    render(<StockAvailablePanel canSell menus={[menu]} onSell={vi.fn()} version={0} />);

    const head = await screen.findByRole('button', { name: /Stock disponible/ });
    expect(head.textContent).toContain('5 viandas');
    expect(screen.queryByText('Del período')).toBeNull();

    fireEvent.click(head);
    expect(screen.getByText('Del período')).toBeTruthy();
    expect(screen.getByText('De períodos anteriores')).toBeTruthy();
    // Lo que no tiene disponible no aparece.
    expect(screen.queryByText(/Real 400/)).toBeNull();
    expect(window.localStorage.getItem('verdeo-orders-stock-open')).toBe('1');
  });

  it('"Vender" pasa la opción del menú del período, o el lote', async () => {
    window.localStorage.setItem('verdeo-orders-stock-open', '1');
    const onSell = vi.fn();
    render(<StockAvailablePanel canSell menus={[menu]} onSell={onSell} version={0} />);

    const sell = await screen.findAllByRole('button', { name: 'Vender' });
    fireEvent.click(sell[0]!);
    expect(onSell).toHaveBeenCalledWith({
      familyName: 'Keto',
      kind: 'period',
      menuId: 'm1',
      offeringId: 'o-keto-400',
      variantName: '400',
    });

    fireEvent.click(sell[1]!);
    expect(onSell).toHaveBeenLastCalledWith({ kind: 'lot', lot, menuId: 'm1' });
  });

  it('sin permiso para cargar pedidos no ofrece vender', async () => {
    window.localStorage.setItem('verdeo-orders-stock-open', '1');
    render(<StockAvailablePanel canSell={false} menus={[menu]} onSell={vi.fn()} version={0} />);
    await waitFor(() => expect(screen.getByText('Del período')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Vender' })).toBeNull();
  });
});
