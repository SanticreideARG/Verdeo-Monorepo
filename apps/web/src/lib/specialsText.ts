import { dishLabel, pickedDishes, type KitchenSummary } from './operations.js';

/**
 * Los Especiales de Cocina como texto para pegar en WhatsApp (pedido 2026-11-18).
 *
 * Copiar la lista de la pantalla traía la sangría de las viñetas: cada plato llegaba a WhatsApp con
 * espacios adelante. Esto arma el texto como lo pide cocina, sin nada adelante: de título el tamaño
 * y el cliente, un plato por renglón y un renglón en blanco antes del siguiente.
 */
export function specialsText(custom: KitchenSummary['custom']): string {
  return custom
    .map((item) =>
      [
        `${item.variantName} ${item.customerDisplayName}${
          item.quantityUnits > 1 ? ` × ${String(item.quantityUnits)}` : ''
        }`.trim(),
        ...pickedDishes(item).map(dishLabel),
        ...(item.dietaryInstructions.length ? [item.dietaryInstructions.join(' · ')] : []),
      ].join('\n'),
    )
    .join('\n\n');
}
