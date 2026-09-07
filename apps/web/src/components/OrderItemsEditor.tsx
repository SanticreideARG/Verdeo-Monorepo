import { useState } from 'react';

import { formatMoney, type MenuOffering, type OrderSummary } from '../lib/operations.js';
import { IntuitivoDishPicker } from './IntuitivoDishPicker.js';

export interface EditableItem {
  /** Identidad local de la fila, para poder repetir la misma variedad dos veces sin que se pisen. */
  key: string;
  offeringId: string;
  quantityUnits: number;
  selectedDishNames: string[];
}

/** Lo que el PATCH espera; `selectedDishNames` sólo viaja si la variedad es componible. */
export function toItemPayload(
  items: readonly EditableItem[],
  offerings: readonly MenuOffering[],
): { offeringId: string; quantityUnits: number; selectedDishNames?: string[] }[] {
  return items.map((item) => {
    const offering = offerings.find((candidate) => candidate.id === item.offeringId);
    return {
      offeringId: item.offeringId,
      quantityUnits: item.quantityUnits,
      ...(offering?.composable ? { selectedDishNames: item.selectedDishNames } : {}),
    };
  });
}

/** Reconstruye las filas editables desde el pedido guardado. */
export function itemsFromOrder(order: OrderSummary): EditableItem[] {
  return order.items.map((item, index) => ({
    key: `${item.id}-${String(index)}`,
    // Un ítem cuya oferta se borró al reeditar la semana llega sin `offeringId`. Se muestra igual,
    // vacío, para que se vea que hay que volver a elegirlo en vez de desaparecer del pedido.
    offeringId: item.offeringId ?? '',
    quantityUnits: item.quantityUnits,
    selectedDishNames: [...item.dishSelections],
  }));
}

/**
 * Editar lo que un pedido lleva.
 *
 * Es el campo que más cambia —alguien pide dos y quiere tres, o cambia la variedad el día antes— y
 * hasta ahora la única salida era cancelar el pedido y cargarlo de nuevo, que le rompe el número y
 * el historial. El backend ya lo aceptaba en borradores y confirmados; lo que faltaba era esto.
 *
 * Las variedades disponibles salen del menú del pedido y no del menú de esta semana: un pedido de
 * una semana ya cerrada se sigue editando contra lo que esa semana ofrecía.
 */
export function OrderItemsEditor({
  items,
  offerings,
  onChange,
}: {
  items: readonly EditableItem[];
  offerings: readonly MenuOffering[];
  onChange: (next: EditableItem[]) => void;
}) {
  const [adding, setAdding] = useState('');

  function update(key: string, patch: Partial<EditableItem>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function add(offeringId: string) {
    if (!offeringId) return;
    onChange([
      ...items,
      {
        key: `nuevo-${offeringId}-${String(Date.now())}`,
        offeringId,
        quantityUnits: 1,
        selectedDishNames: [],
      },
    ]);
    setAdding('');
  }

  const total = items.reduce((sum, item) => {
    const offering = offerings.find((candidate) => candidate.id === item.offeringId);
    return sum + (offering?.unitPriceMinor ?? 0) * item.quantityUnits;
  }, 0);
  const currency = offerings[0]?.currency ?? 'ARS';

  return (
    <div className="items-editor">
      {items.map((item) => {
        const offering = offerings.find((candidate) => candidate.id === item.offeringId);
        return (
          <article className="items-editor-row" key={item.key}>
            <label className="field">
              Variedad
              <select
                onChange={(event) =>
                  // Cambiar de variedad limpia los platos: los de un Intuitivo no significan nada
                  // pegados a una variedad fija, y arrastrarlos escondería una elección vieja.
                  update(item.key, { offeringId: event.target.value, selectedDishNames: [] })
                }
                value={item.offeringId}
              >
                <option disabled value="">
                  Elegir variedad
                </option>
                {offerings.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.familyName} {candidate.sizeName} ·{' '}
                    {formatMoney(candidate.unitPriceMinor, candidate.currency)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field items-editor-quantity">
              Unidades
              <input
                min={1}
                onChange={(event) =>
                  update(item.key, { quantityUnits: Math.max(1, Number(event.target.value) || 1) })
                }
                type="number"
                value={item.quantityUnits}
              />
            </label>

            <button
              className="button button-secondary"
              onClick={() => onChange(items.filter((candidate) => candidate.key !== item.key))}
              type="button"
            >
              Quitar
            </button>

            {offering?.composable ? (
              <div className="items-editor-dishes">
                <p className="text-sm text-ink-muted">
                  Platos del Intuitivo — {item.selectedDishNames.length} de 5
                </p>
                <IntuitivoDishPicker
                  offerings={offerings}
                  onChange={(next) => update(item.key, { selectedDishNames: next })}
                  selected={item.selectedDishNames}
                />
              </div>
            ) : null}
          </article>
        );
      })}

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          El pedido quedaría sin ítems. Agregá al menos uno para poder guardar.
        </p>
      ) : null}

      <div className="items-editor-add">
        <label className="field">
          Agregar variedad
          <select onChange={(event) => add(event.target.value)} value={adding}>
            <option value="">Elegir…</option>
            {offerings.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offering.familyName} {offering.sizeName}
              </option>
            ))}
          </select>
        </label>
        {/* Estimado y no definitivo: el precio final lo calcula el servidor con el snapshot del
            pedido. Sirve para no guardar a ciegas un cambio que duplica el total. */}
        <p className="items-editor-total">Total estimado: {formatMoney(total, currency)}</p>
      </div>
    </div>
  );
}
