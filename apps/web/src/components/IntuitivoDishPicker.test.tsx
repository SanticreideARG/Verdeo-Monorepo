import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MenuOffering, PickedDish } from '../lib/operations.js';
import { IntuitivoDishPicker } from './IntuitivoDishPicker.js';

const offering = (familyName: string, dishes: string[]): MenuOffering => ({
  composable: false,
  currency: 'ARS',
  description: null,
  dishes,
  familyName,
  id: familyName,
  mealsPerUnit: 5,
  priceOverridden: false,
  sizeName: '250',
  unitPriceMinor: 0,
  variantName: '250',
});

// "Lomo" está en los dos menús: son dos platos distintos.
const OFFERINGS = [offering('Keto', ['Lomo', 'Pastel']), offering('Anti-Age', ['Lomo', 'Wok'])];

function show(selected: PickedDish[], onChange = vi.fn()) {
  render(
    <IntuitivoDishPicker
      maxDishes={10}
      minDishes={5}
      offerings={OFFERINGS}
      onChange={onChange}
      selected={selected}
    />,
  );
  return onChange;
}

describe('IntuitivoDishPicker', () => {
  it('agrega el plato con su menú, y el mismo nombre en otro menú es otro plato', () => {
    const onChange = show([{ dishName: 'Lomo', familyName: 'Keto' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Lomo (Anti-Age)' }));

    expect(onChange).toHaveBeenCalledWith([
      { dishName: 'Lomo', familyName: 'Keto' },
      { dishName: 'Lomo', familyName: 'Anti-Age' },
    ]);
    // El de Anti-Age todavía no se eligió: no se puede quitar.
    expect(screen.getByRole('button', { name: 'Quitar Lomo (Anti-Age)' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('muestra aparte los platos sin menú de origen, para quitarlos y elegirlos de nuevo', () => {
    const onChange = show([
      { dishName: 'Lomo', familyName: '' },
      { dishName: 'Pastel', familyName: 'Keto' },
    ]);

    expect(screen.getByText('Sin menú de origen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Lomo (sin menú)' }));

    expect(onChange).toHaveBeenCalledWith([{ dishName: 'Pastel', familyName: 'Keto' }]);
  });
});
