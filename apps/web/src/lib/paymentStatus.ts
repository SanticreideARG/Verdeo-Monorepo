import { isNoCharge } from '@verdeo/orders';

import type { PaymentChoice } from './paymentMethods.js';

export interface PaymentStatus {
  /** Por qué, cuando no se ve a simple vista. */
  hint: string | null;
  label: string;
  tone: 'none' | 'paid' | 'pending';
}

/**
 * Lo que un pedido tiene en efectivo: todo si su medio es efectivo, nada si no, y la parte en
 * efectivo si está dividido (2026-11-17).
 */
export function cashAmountOf(
  order: {
    paymentExpectation: string;
    paymentParts?: readonly { amountMinor: number; method: string }[] | undefined;
    totalMinor: number;
  },
  methods: readonly PaymentChoice[],
): number {
  const parts = order.paymentParts ?? [];
  if (parts.length > 0) {
    return parts
      .filter((part) => isCashMethod(part.method, methods))
      .reduce((sum, part) => sum + part.amountMinor, 0);
  }
  return isCashMethod(order.paymentExpectation, methods) ? order.totalMinor : 0;
}

export function isCashMethod(value: string, methods: readonly PaymentChoice[]): boolean {
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
    paymentParts?: readonly { method: string; paidAt: string | null }[] | undefined;
    status: string;
  },
  methods: readonly PaymentChoice[],
  today: string,
): PaymentStatus {
  if (order.status === 'CANCELLED') return { hint: null, label: 'Cancelado', tone: 'none' };
  if (isNoCharge(order.paymentExpectation)) return { hint: null, label: 'Sin cargo', tone: 'none' };
  if (order.paidAt) return { hint: null, label: 'Cobrado', tone: 'paid' };
  /*
   * Pago dividido (2026-11-17): cada parte se tilda a mano, también la de efectivo. Está cobrado
   * cuando lo están todas, y eso ya lo dice `paidAt`.
   */
  const missing = (order.paymentParts ?? []).filter((part) => !part.paidAt);
  if ((order.paymentParts ?? []).length > 0) {
    return {
      hint: `Pago dividido: falta tildar ${missing.map((part) => part.method).join(' y ')}.`,
      label: 'Pendiente',
      tone: 'pending',
    };
  }
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
