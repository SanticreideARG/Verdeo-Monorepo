import { editDistance } from './offering-match.js';

/**
 * Reconocer un medio de pago escrito a mano ("trasferencia", "transf.", "efvo", "mercadopago").
 *
 * Una planilla o un email traen el medio de pago como texto, con errores de tipeo, y guardarlo así
 * es peor que no guardarlo: el texto termina en el mensaje que se le manda al cliente, en las
 * hojas de ruta y en los filtros, que no lo reconocen. Lo que se guarda tiene que ser uno de los
 * medios configurados.
 */

export interface MatchablePaymentMethod {
  code: string;
  displayName: string;
}

export type PaymentKind = 'efectivo' | 'mercado_pago' | 'transferencia';

/** Las formas de pago que se reconocen en un texto libre, con su nombre canónico. */
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  efectivo: 'Efectivo',
  mercado_pago: 'Mercado Pago',
  transferencia: 'Transferencia',
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Qué forma de pago nombra una palabra, si nombra alguna.
 *
 * Con margen para el tipeo ("trasferencia", "tranferencia", "efectibo") pero sólo en palabras
 * largas: dos letras de diferencia en una palabra corta ya es otra palabra.
 */
export function paymentKindOfWord(word: string): PaymentKind | null {
  const w = normalize(word).replace(/\s+/g, '');
  if (w.length < 4) return null;
  if (
    w.startsWith('transf') ||
    // "trasf", "trasferencia"; no "trasfondo".
    (w.startsWith('trasf') && (w.length <= 6 || editDistance(w, 'trasferencia') <= 2)) ||
    editDistance(w, 'transferencia') <= 2
  ) {
    return 'transferencia';
  }
  if (w === 'efvo' || w === 'efect' || editDistance(w, 'efectivo') <= 2) return 'efectivo';
  if (w === 'mercadopago' || editDistance(w, 'mercadopago') <= 2) return 'mercado_pago';
  return null;
}

/** La forma de pago que nombra un texto corto ("Transferencia", "pago en efvo", "Mercado Pago"). */
export function paymentKindOf(text: string): PaymentKind | null {
  const words = normalize(text).split(' ').filter(Boolean);
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? '';
    if (word === 'mercado' && words[index + 1] === 'pago') return 'mercado_pago';
    if (word === 'mp' && words.length <= 2) return 'mercado_pago';
    const kind = paymentKindOfWord(word);
    if (kind) return kind;
  }
  return null;
}

/**
 * El nombre del medio configurado que corresponde a un texto, o `null`.
 *
 * Primero por nombre o código, igual o contenido; después por la forma de pago que nombra el
 * texto ("trasferencia" → el medio configurado que es una transferencia). Si dos medios
 * configurados podrían ser, no decide: una persona elige.
 */
export function matchPaymentMethod(
  text: string | null | undefined,
  methods: readonly MatchablePaymentMethod[],
): string | null {
  if (!text?.trim()) return null;
  const wanted = normalize(text);
  const keys = methods.map((method) => ({
    keys: [normalize(method.displayName), normalize(method.code.replace(/[_-]+/g, ' '))],
    method,
  }));

  const exact = keys.filter(({ keys: own }) => own.includes(wanted));
  if (exact.length === 1) return exact[0]?.method.displayName ?? null;

  const kind = paymentKindOf(text);
  if (!kind) return null;
  const sameKind = methods.filter(
    (method) =>
      paymentKindOf(method.displayName) === kind ||
      paymentKindOf(method.code.replace(/[_-]+/g, ' ')) === kind,
  );
  return sameKind.length === 1 ? (sameKind[0]?.displayName ?? null) : null;
}
