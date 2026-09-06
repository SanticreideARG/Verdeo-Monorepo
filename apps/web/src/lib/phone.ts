/**
 * Números argentinos, legibles.
 *
 * Se guardan como +54 9 11 5839 3179 para wa.me, que se lee como una tira de dígitos. Los códigos de
 * área acá son de dos, tres o cuatro dígitos y no se pueden deducir del número, así que están
 * listados los de las zonas donde Verdeo opera. Cualquier otro cae a un agrupado legible en vez de
 * adivinar un corte y errarle — que es lo que hace la regla de "el abonado siempre son ocho dígitos"
 * fuera de Buenos Aires.
 */
const AREA_CODES = ['11', '221', '223', '261', '264', '299', '341', '351', '381', '387', '2920'];

/**
 * El enlace para escribirle a alguien por WhatsApp.
 *
 * wa.me quiere el número internacional sin nada más que dígitos. Los que están bien cargados ya
 * vienen con 54 adelante; a los que no, se les asume Argentina móvil (549) y se les saca el 0 del
 * código de área y el 15 del abonado, que son notación local y sobran en el formato internacional.
 */
export function whatsappHref(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('54')) return `https://wa.me/${digits}`;
  const local = digits.replace(/^0/, '').replace(/^(\d{2,4})15/, '$1');
  return `https://wa.me/549${local}`;
}

export function formatArgentinePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('549')
    ? digits.slice(3)
    : digits.startsWith('54')
      ? digits.slice(2)
      : digits;
  if (local.length < 8) return raw;

  // El más largo primero, para que 2920 no se lea como 29.
  const area = [...AREA_CODES]
    .sort((a, b) => b.length - a.length)
    .find((code) => local.startsWith(code));
  if (!area) {
    // Ningún código conocido: se agrupa de a cuatro para que siga leyéndose como un número.
    return `+54 9 ${local.replace(/(\d{4})(?=\d)/g, '$1 ')}`.trim();
  }

  const rest = local.slice(area.length);
  // Piso, no techo: un abonado de siete dígitos se escribe 3-4, no 4-3. Ocho (Buenos Aires) corta
  // igual de las dos formas.
  const split = Math.floor(rest.length / 2);
  return `(0${area}) 15 ${rest.slice(0, split)} ${rest.slice(split)}`;
}
