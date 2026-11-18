import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { formatDateNumeric, formatDateTimeNumeric } from '../lib/dates.js';
import {
  DateInput,
  DateTimeInput,
  displayToIso,
  isoToDisplay,
  maskDigits,
  TimeInput,
} from './DateInputs.js';

describe('fechas como se escriben acá: DD/MM/AAAA HH:MM (2026-11-17)', () => {
  it('muestra día, mes y año, y la hora en 24 horas', () => {
    expect(isoToDisplay('date', '2026-11-22')).toBe('22/11/2026');
    expect(isoToDisplay('datetime', '2026-11-22T21:57')).toBe('22/11/2026 21:57');
    expect(isoToDisplay('time', '09:05')).toBe('09:05');
  });

  it('pone las barras y los dos puntos mientras se escribe', () => {
    expect(maskDigits('date', '2211')).toBe('22/11');
    expect(maskDigits('datetime', '221120262157')).toBe('22/11/2026 21:57');
    expect(maskDigits('time', '0905')).toBe('09:05');
  });

  it('entiende lo escrito como día/mes, y rechaza lo que no existe', () => {
    expect(displayToIso('date', '22/11/2026')).toBe('2026-11-22');
    expect(displayToIso('datetime', '22/11/2026 21:57')).toBe('2026-11-22T21:57');
    // El 11/22 de un formato americano no es una fecha acá.
    expect(displayToIso('date', '11/22/2026')).toBeNull();
    expect(displayToIso('date', '31/02/2026')).toBeNull();
    expect(displayToIso('datetime', '22/11/2026 25:00')).toBeNull();
    expect(displayToIso('date', '22/11/20')).toBeNull();
  });

  it('el campo de fecha y hora muestra el valor y avisa lo escrito', () => {
    const onChange = vi.fn();
    render(
      <DateTimeInput aria-label="Parcial" defaultValue="2026-11-22T09:57" onChange={onChange} />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Parcial');
    expect(input.value).toBe('22/11/2026 09:57');

    fireEvent.change(input, { target: { value: '23/11/2026 18:30' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-11-23T18:30');
  });

  it('manda en el formulario el valor de siempre, con su nombre', () => {
    const { container } = render(
      <form>
        <DateInput defaultValue="2026-11-22" name="deliveryDate" />
        <TimeInput defaultValue="07:30" name="departureTime" />
      </form>,
    );
    const form = new FormData(container.querySelector('form') ?? undefined);
    expect(form.get('deliveryDate')).toBe('2026-11-22');
    expect(form.get('departureTime')).toBe('07:30');
  });

  it('los textos de fecha y hora van en números, con el año entero', () => {
    expect(formatDateNumeric('2026-11-22')).toBe('22/11/2026');
    // 12:57 UTC son las 09:57 en Argentina.
    expect(formatDateTimeNumeric('2026-11-22T12:57:00Z')).toBe('22/11/2026 09:57');
  });
});
