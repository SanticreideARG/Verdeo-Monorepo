import { describe, expect, it } from 'vitest';

import {
  assertCoordinatePair,
  assertTemplateVariables,
  extractTemplateVariables,
  normalizeCustomerIdentity,
  normalizeCustomerText,
  renderTemplate,
  argentinePhoneKey,
  canonicalArgentinePhone,
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

  /*
   * Un mismo celular llega escrito de cinco maneras, y comparar por igualdad crea un cliente duplicado
   * por cada una. Los números son inventados, con la forma de los que llegan en los pedidos reales.
   */
  it('reconoce un mismo celular argentino escrito de cualquier manera', () => {
    const formas = [
      '+541155550101',
      '+5491155550101',
      '1155550101',
      '01155550101',
      '91155550101',
      '+54 9 11 5555-0101',
    ];

    expect(new Set(formas.map((forma) => argentinePhoneKey(forma)))).toEqual(
      new Set(['1155550101']),
    );
  });

  it('no reconoce un número sin código de área: sus últimos dígitos unirían ciudades distintas', () => {
    expect(argentinePhoneKey('5555 0101')).toBeNull();
    expect(argentinePhoneKey('155550101')).toBeNull();
  });

  it('guarda todos los celulares con la misma forma, la que entiende wa.me', () => {
    expect(canonicalArgentinePhone('1155550101')).toBe('+5491155550101');
    expect(canonicalArgentinePhone('+541155550101')).toBe('+5491155550101');
    expect(canonicalArgentinePhone('91155550101')).toBe('+5491155550101');
  });

  // Quedarse con los últimos diez dígitos de un número de otro país lo corrompería.
  it('deja como vino un número con un código de país que no es el 54', () => {
    expect(canonicalArgentinePhone('+598 99 123 456')).toBe('+59899123456');
  });

  // Inventarle un código de área a un número incompleto es peor que guardarlo incompleto.
  it('no toca un número con menos de diez dígitos', () => {
    expect(canonicalArgentinePhone('5555 0101')).toBe('5555 0101');
  });
});
