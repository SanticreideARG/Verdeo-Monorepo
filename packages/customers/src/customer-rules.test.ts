import { describe, expect, it } from 'vitest';

import {
  assertCoordinatePair,
  assertTemplateVariables,
  extractTemplateVariables,
  normalizeCustomerIdentity,
  normalizeCustomerText,
} from './index.js';

describe('customer rules', () => {
  it('normalizes customer text without using names as identity', () => {
    expect(normalizeCustomerText('  María   Pérez  ')).toBe('María Pérez');
  });

  it('normalizes WhatsApp and email identities deterministically', () => {
    expect(normalizeCustomerIdentity('whatsapp', '+54 9 11 5555-1212')).toBe('+5491155551212');
    expect(normalizeCustomerIdentity('email', ' Cliente@Example.COM ')).toBe('cliente@example.com');
  });

  it('requires coordinates as a valid pair', () => {
    expect(() => assertCoordinatePair(-34.6037, -58.3816)).not.toThrow();
    expect(() => assertCoordinatePair(-34.6037, undefined)).toThrow(/juntas/);
  });

  it('extracts and validates message template variables', () => {
    const body = 'Hola {{ nombre }}, tu pedido {{pedido.numero}} está listo.';
    expect(extractTemplateVariables(body)).toEqual(['nombre', 'pedido.numero']);
    expect(() => assertTemplateVariables(body, ['pedido.numero', 'nombre'])).not.toThrow();
    expect(() => assertTemplateVariables(body, ['nombre'])).toThrow(/coincidir/);
  });
});
