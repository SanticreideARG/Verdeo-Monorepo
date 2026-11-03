import type { OrderSummary } from './operations.js';

/** "$85.000": como se escribe a mano en un mensaje, sin decimales ni espacio. */
export function plainMoney(minor: number): string {
  return `$${(minor / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

/** "lunes 19": el día de entrega leído como día, sin correrse por la zona horaria. */
export function deliveryDayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    timeZone: 'UTC',
    weekday: 'long',
  })
    .format(new Date(`${isoDate}T00:00:00Z`))
    .replace(',', '');
}

/** "1 menú real 400 + 2 menú keto 250". */
export function itemsLine(
  items: readonly Pick<
    OrderSummary['items'][number],
    'productName' | 'quantityUnits' | 'variantName'
  >[],
): string {
  return items
    .map((item) =>
      `${String(item.quantityUnits)} ${item.productName.toLocaleLowerCase('es-AR')} ${item.variantName}`.trim(),
    )
    .join(' + ');
}

export type ConfirmationOrder = Pick<
  OrderSummary,
  'customer' | 'deliveryAddress' | 'deliveryDate' | 'items' | 'totalMinor'
>;

/**
 * El mensaje con el que se confirma un pedido por WhatsApp.
 *
 * Es el que el equipo escribía a mano en cada pedido: nombre de pila, lo pedido con el total, la
 * dirección y el día de entrega. La franja horaria no está en el pedido —es una franja general,
 * "tentativa a confirmar el sábado"—, así que llega como parámetro; vacía, el mensaje sale sin ella.
 */
export function confirmationMessage(order: ConfirmationOrder, timeWindow: string): string {
  const firstName = order.customer.displayName.trim().split(/\s+/)[0] ?? '';
  const window = timeWindow.trim();
  return [
    `Hola ${firstName}! Te escribimos de Verdeo Alimentación Mejorada para confirmar tu pedido.`,
    `${itemsLine(order.items)} = ${plainMoney(order.totalMinor)} a ${order.deliveryAddress.trim()}.`,
    `Entrega: ${deliveryDayLabel(order.deliveryDate)}${window ? ` ${window}` : ''} (horario tentativo a confirmar el sábado), te viene bien? Gracias!`,
  ].join(' ');
}

const firstNameOf = (order: ConfirmationOrder) =>
  order.customer.displayName.trim().split(/\s+/)[0] ?? '';

/** El mensaje como le llega a Hera: sin el nombre ni la dirección del cliente. */
export function confirmationDraft(order: ConfirmationOrder): string {
  return confirmationMessage(
    {
      ...order,
      customer: { ...order.customer, displayName: '{nombre}' },
      deliveryAddress: '{direccion}',
    },
    '{franja}',
  );
}

/** Lo que Hera escribió, con los datos del cliente y la franja de ahora. */
export function fillConfirmationDraft(
  draft: string,
  order: ConfirmationOrder,
  timeWindow: string,
): string {
  return draft
    .replaceAll('{nombre}', firstNameOf(order))
    .replaceAll('{direccion}', order.deliveryAddress.trim())
    .replaceAll('{franja}', timeWindow.trim())
    .replace(/ {2,}/g, ' ');
}

/** Lo que no puede faltar en una versión de Hera: sin eso, confirmaría otro pedido. */
export function missingConfirmationFacts(draft: string, order: ConfirmationOrder): string[] {
  const text = draft.toLocaleLowerCase('es-AR');
  return [
    text.includes('{nombre}') ? null : 'el nombre',
    text.includes('{direccion}') ? null : 'la dirección',
    text.includes(plainMoney(order.totalMinor).toLocaleLowerCase('es-AR')) ? null : 'el importe',
    text.includes(deliveryDayLabel(order.deliveryDate).toLocaleLowerCase('es-AR'))
      ? null
      : 'el día',
  ].filter((fact): fact is string => fact !== null);
}
