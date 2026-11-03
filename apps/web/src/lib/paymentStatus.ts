import { isNoCharge } from '@verdeo/orders';

import type { PaymentChoice } from './paymentMethods.js';

export interface PaymentStatus {
  /** Por qué, cuando no se ve a simple vista. */
  hint: string | null;
  label: string;
  tone: 'none' | 'paid' | 'pending';
}

function isCashMethod(value: string, methods: readonly PaymentChoice[]): boolean {
  const key = value.trim().toLowerCase();
  const found = methods.find(
    (method) => method.code.toLowerCase() === key || method.displayName.toLowerCase() === key,
  );
  return found?.isCash ?? key.includes('efectivo');
}

/**
 * Si un pedido está cobrado, como lo cuenta el equipo: el efectivo, al terminar el día de su
 * entrega; lo demás (la transferencia), cuando alguien lo tilda a mano.
 *
 * Es una lectura y no un dato guardado: no marca nada como cobrado en la base, así que otras
 * pantallas que miran sólo el tilde pueden seguir viendo ese efectivo como pendiente.
 */
export function paymentStatus(
  order: {
    deliveryDate: string;
    paidAt: string | null;
    paymentExpectation: string;
    status: string;
  },
  methods: readonly PaymentChoice[],
  today: string,
): PaymentStatus {
  if (order.status === 'CANCELLED') return { hint: null, label: 'Cancelado', tone: 'none' };
  if (isNoCharge(order.paymentExpectation)) return { hint: null, label: 'Sin cargo', tone: 'none' };
  if (order.paidAt) return { hint: null, label: 'Cobrado', tone: 'paid' };
  if (!isCashMethod(order.paymentExpectation, methods)) {
    return { hint: 'Se marca a mano al recibir el pago.', label: 'Pendiente', tone: 'pending' };
  }
  return order.deliveryDate < today
    ? { hint: 'Efectivo: se cobró con la entrega.', label: 'Cobrado', tone: 'paid' }
    : {
        hint: 'Efectivo: se da por cobrado al terminar el día de entrega.',
        label: 'Pendiente',
        tone: 'pending',
      };
}
