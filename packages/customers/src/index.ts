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
