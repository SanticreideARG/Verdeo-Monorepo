import { describe, expect, it } from 'vitest';

import {
  assertCoordinatePair,
  assertTemplateVariables,
  extractTemplateVariables,
  normalizeCustomerIdentity,
  normalizeCustomerText,
  renderTemplate,
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

  it('rellena las variables de una plantilla con los valores del pedido', () => {
    const rendered = renderTemplate('Hola {{ nombre }}, tu pedido {{pedido.numero}} está listo.', {
      nombre: 'Ana',
      'pedido.numero': 'N00453',
    });

    expect(rendered).toBe('Hola Ana, tu pedido N00453 está listo.');
  });

  /*
   * Una variable sin valor no puede dejar rastro. El texto se manda tal como sale de acá, y un
   * renglón vacío en el medio se lee como un mensaje a medio armar.
   */
  it('no deja huecos cuando una variable viene sin valor', () => {
    const rendered = renderTemplate(
      ['Hola {{ nombre }}', '{{ reparto.ventana }}', 'Gracias.'].join('\n'),
      { nombre: 'Ana' },
    );

    expect(rendered).toBe(['Hola Ana', 'Gracias.'].join('\n'));
  });
});
