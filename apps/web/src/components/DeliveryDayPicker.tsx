import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';

export interface DeliveryOption {
  date: string;
  weekday: number;
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "18 oct", sin pasar por la zona horaria del navegador. */
function shortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${String(day ?? '')} ${MONTHS[(month ?? 1) - 1] ?? ''}`;
}

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? '';
}

/**
 * Las fechas de reparto de la ciudad para un menú (o el publicado, sin menú), y la de siempre.
 * Sin días configurados vuelve una sola: la del cierre del período.
 */
export function useDeliveryOptions(menuId?: string | null) {
  const [state, setState] = useState<{ defaultDate: string; options: DeliveryOption[] }>({
    defaultDate: '',
    options: [],
  });
  useEffect(() => {
    let cancelled = false;
    const query = menuId ? `?menuId=${encodeURIComponent(menuId)}` : '';
    void apiRequest(`/api/v1/delivery/options${query}`, { notify: false })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { defaultDate: string; options: DeliveryOption[] })
          : null,
      )
      .catch(() => null)
      .then((result) => {
        // Una respuesta sin la forma esperada se ignora: sin opciones no se elige nada.
        if (!cancelled && result && Array.isArray(result.options)) {
          setState({ defaultDate: result.defaultDate || '', options: result.options });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [menuId]);
  return state;
}

/**
 * El día de reparto, elegido por el día de la semana: "Sábado" grande y la fecha chica abajo.
 *
 * Es lo que se dice por teléfono ("¿te lo llevo el sábado o el domingo?"), así que es lo que se
 * lee primero. Con un solo día de reparto se muestra sin elegir.
 */
export function DeliveryDayPicker({
  label = 'Día de reparto',
  onChange,
  options,
  value,
}: {
  label?: string;
  onChange: (date: string) => void;
  options: readonly DeliveryOption[];
  value: string;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="delivery-days">
      <legend>{label}</legend>
      <div className="delivery-days-options" role="radiogroup">
        {options.map((option) => (
          <button
            aria-checked={value === option.date}
            className={value === option.date ? 'is-selected' : ''}
            disabled={options.length === 1}
            key={option.date}
            onClick={() => onChange(option.date)}
            role="radio"
            type="button"
          >
            <strong>{weekdayName(option.weekday)}</strong>
            <small>{shortDate(option.date)}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
