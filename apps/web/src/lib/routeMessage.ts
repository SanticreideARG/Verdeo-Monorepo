import { isTransfer } from '@verdeo/orders';

import { formatDay } from './dates.js';
import { formatMoney } from './operations.js';
import { maskSurname } from './maskName.js';

export interface RouteMessageStop {
  customerDisplayName: string;
  deliveryAddress: string;
  deliveryAddressLine2?: string | null;
  deliveryWindow: string | null;
  detail: string;
  neighborhood: string | null;
  paymentExpectation: string;
  sequence: number;
  totalMinor: number;
}

/**
 * Saca la marca de "nuevo" de lo que lee quien reparte, donde no le dice nada: un "(NUEVO)" escrito
 * en el nombre, o el "Nuevo" de "Menú Nuevo Keto". Lo que se busca en la caja es "Menú Keto 400".
 */
export function withoutNewMark(text: string): string {
  return text
    .replace(/\s*[-–([]*\s*(?<![\p{L}\p{N}])nuev[oa]s?(?![\p{L}\p{N}])\s*[)\]]*/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Si quien reparte cobra en esta parada. Una transferencia no la cobra él (2026-10-25), y un pedido
 * sin pago no lo cobra nadie.
 */
export function courierCollects(paymentExpectation: string): boolean {
  return !isTransfer(paymentExpectation) && paymentExpectation.trim().toLowerCase() !== 'sin_pago';
}

/**
 * Qué hay que hacer con el pago en esta parada. Siempre dice algo: una parada sin renglón de pago se
 * lee como un dato que falta, y quien reparte no sabe si tiene que cobrar. "No cobrar" sigue sin dar
 * ni el monto ni el medio de lo que no le toca.
 */
export function courierPayment(stop: RouteMessageStop): string {
  return courierCollects(stop.paymentExpectation)
    ? `${stop.paymentExpectation} · ${formatMoney(stop.totalMinor, 'ARS')}`
    : 'No cobrar';
}

/**
 * La ruta como algo que se le puede pasar a alguien.
 *
 * Es el mensaje que se pega en el chat del repartidor: las paradas en orden, con el enlace de mapa
 * de cada una —que es lo que se abre en el teléfono, y lo que una dirección escrita no resuelve— y
 * lo que hay que cobrar ahí.
 *
 * Sin apellidos. El mensaje sale del sistema y entra a un chat de WhatsApp, que se reenvía sin
 * pensarlo; el nombre de pila alcanza de sobra para saber a quién se le entrega.
 */
export function routeMessage<Stop extends RouteMessageStop>(
  route: { deliveryDate: string; label?: string | null; stops: readonly Stop[] },
  mapLink: (stop: Stop) => string,
): string {
  const header = `Reparto ${formatDay(route.deliveryDate)}${route.label ? ` · ${route.label}` : ''} — ${String(route.stops.length)} paradas`;
  const lines = route.stops.map((stop) =>
    [
      // La ventana va pegada al nombre: es lo que decide si esta parada puede ir acá o no.
      `${String(stop.sequence)}. ${maskSurname(withoutNewMark(stop.customerDisplayName))}${
        stop.deliveryWindow ? ` · 🕒 ${stop.deliveryWindow}` : ''
      }`,
      // Qué entregar, antes que dónde: es lo que se busca en la caja al bajar del auto.
      ...(stop.detail ? [withoutNewMark(stop.detail)] : []),
      // El barrio en cada parada, al lado de la dirección: el mensaje se lee de a una.
      stop.neighborhood ? `${stop.deliveryAddress} · ${stop.neighborhood}` : stop.deliveryAddress,
      // La segunda línea de la dirección (piso, depto, timbre): sin ella no se encuentra la puerta.
      ...(stop.deliveryAddressLine2 ? [stop.deliveryAddressLine2] : []),
      mapLink(stop),
      courierPayment(stop),
    ].join('\n'),
  );
  return [header, '', ...lines].join('\n\n');
}
