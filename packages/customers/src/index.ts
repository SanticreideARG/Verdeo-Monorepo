const PHONE_IDENTITY_TYPES = new Set(['phone', 'whatsapp']);

export class CustomerRuleError extends Error {
  public constructor(
    public readonly code: 'INVALID_COORDINATES' | 'INVALID_IDENTITY' | 'INVALID_TEMPLATE',
    message: string,
  ) {
    super(message);
    this.name = 'CustomerRuleError';
  }
}

export function normalizeCustomerText(value: string): string {
  return value.trim().normalize('NFKC').replace(/\s+/g, ' ');
}

export function normalizeCustomerIdentity(type: string, value: string): string {
  const normalizedType = type.trim().toLowerCase();
  const displayValue = normalizeCustomerText(value);

  if (PHONE_IDENTITY_TYPES.has(normalizedType)) {
    const leadingPlus = displayValue.startsWith('+');
    const digits = displayValue.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 18) {
      throw new CustomerRuleError(
        'INVALID_IDENTITY',
        'El teléfono debe contener entre seis y dieciocho dígitos.',
      );
    }
    return `${leadingPlus ? '+' : ''}${digits}`;
  }

  if (normalizedType === 'email') {
    return displayValue.toLowerCase();
  }

  if (!displayValue) {
    throw new CustomerRuleError('INVALID_IDENTITY', 'La identidad no puede estar vacía.');
  }
  return displayValue.toLowerCase();
}

export function assertCoordinatePair(
  latitude: number | undefined,
  longitude: number | undefined,
): void {
  if (latitude === undefined && longitude === undefined) return;
  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new CustomerRuleError(
      'INVALID_COORDINATES',
      'La latitud y longitud deben informarse juntas y estar dentro de sus rangos válidos.',
    );
  }
}

export function extractTemplateVariables(body: string): string[] {
  const variables = new Set<string>();
  for (const match of body.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g)) {
    const variable = match[1];
    if (variable) variables.add(variable);
  }
  return [...variables].sort();
}

export function assertTemplateVariables(body: string, declaredVariables: readonly string[]): void {
  const used = extractTemplateVariables(body);
  const declared = [...new Set(declaredVariables)].sort();
  if (used.length !== declared.length || used.some((value, index) => value !== declared[index])) {
    throw new CustomerRuleError(
      'INVALID_TEMPLATE',
      'Las variables declaradas deben coincidir exactamente con las variables usadas en el mensaje.',
    );
  }
}

/**
 * Reemplaza las `{{ variables }}` de una plantilla por los valores de un pedido concreto.
 *
 * Una variable sin valor se reemplaza por vacío y no se deja escrita. Dejar `{{ reparto.ventana }}`
 * en el texto es peor que no decir nada: lo que se ve es un mensaje a medio armar, y quien lo manda
 * tiene que acordarse de borrarlo a mano justo cuando está mandando cien.
 *
 * No hay condicionales ni bucles a propósito. Una plantilla que necesita lógica es dos plantillas.
 */
export function renderTemplate(body: string, values: Readonly<Record<string, string>>): string {
  const placeholder = /{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g;
  return (
    body
      .split('\n')
      .map((line) => ({
        rendered: line.replace(placeholder, (_match, variable: string) => values[variable] ?? ''),
        wasEmpty: line.trim().length === 0,
      }))
      /*
       * Un renglón que quedó vacío *porque* le faltó el valor se va; uno que ya venía vacío se
       * queda. Esa distinción es la que permite separar párrafos en una plantilla —el renglón en
       * blanco es intencional— sin arrastrar el hueco que deja "{{ reparto.ventana }}" cuando esa
       * ventana no está cargada.
       */
      .filter((line) => line.wasEmpty || line.rendered.trim().length > 0)
      .map((line) => line.rendered.replace(/[ \t]+$/, ''))
      .join('\n')
      .trim()
  );
}

/**
 * La clave con la que se reconoce un teléfono argentino, sea cual sea la forma en que se escribió.
 *
 * `normalizeCustomerIdentity` sólo quita los símbolos y conserva el `+`, así que un mismo celular
 * llega como `+541156380959`, `+5491156380959`, `1156380959`, `01156380959` o `91156380959` —cinco
 * cadenas distintas que son la misma línea— y comparar por igualdad crea un cliente duplicado por
 * cada forma. Un número argentino son diez dígitos significativos (área y abonado); lo que sobra
 * antes es el prefijo del país (54), el 9 de los celulares o el 0 de marcación nacional. Quedarse con
 * los últimos diez los iguala a todos.
 *
 * Es una clave para **comparar**, no un valor para guardar: `canonicalArgentinePhone` es el que da
 * la forma almacenable.
 *
 * Devuelve `null` si hay menos de diez dígitos: un número sin código de área no se puede reconocer,
 * y comparar sus últimos ocho dígitos uniría clientes de ciudades distintas.
 */
export function argentinePhoneKey(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  // Prefijo de país y el 9 de los celulares; el 0 de marcación nacional.
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  /*
   * El 15 del formato local: "(011) 15 5555-0101", "(0299) 15 549 3102".
   *
   * Es como se escribe un celular en Argentina y como lo muestra esta misma aplicación, y quedarse
   * con los últimos diez dígitos lo rompía: daba `1555550101` en lugar de `1155550101`, así que la
   * misma línea escrita así no se reconocía. Con el 15, el número tiene doce dígitos y el 15 va
   * después de un código de área de dos a cuatro. Si hay una sola posición donde puede estar, se
   * saca; si hay más de una no se adivina y queda como antes.
   */
  if (digits.length === 12) {
    const positions = [2, 3, 4].filter((position) => digits.slice(position, position + 2) === '15');
    const [position] = positions;
    if (positions.length === 1 && position !== undefined) {
      digits = digits.slice(0, position) + digits.slice(position + 2);
    }
  }
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * La forma en que se guarda un celular argentino: `+549` y los diez dígitos significativos.
 *
 * Es la que entiende `wa.me`, y la que hace que dos pedidos del mismo cliente escritos de maneras
 * distintas queden con el mismo valor en la base.
 *
 * Un número que empieza con `+` y un país que no es el 54 se deja como vino: quedarse con sus
 * últimos diez dígitos lo corrompería. Y uno con menos de diez dígitos tampoco se toca, porque
 * inventarle un código de área sería peor que guardarlo incompleto.
 */
export function canonicalArgentinePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && !digits.startsWith('54')) return `+${digits}`;
  const key = argentinePhoneKey(trimmed);
  return key ? `+549${key}` : trimmed;
}
