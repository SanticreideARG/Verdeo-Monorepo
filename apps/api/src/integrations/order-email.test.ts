import { describe, expect, it } from 'vitest';

import { parseOrderEmails } from './order-email.js';

/*
 * Los emails de abajo reproducen la forma de los que manda el formulario del sitio. Los nombres,
 * teléfonos y direcciones son inventados: los pedidos reales son de clientes y no van al repositorio.
 */

const FOOTER = [
  '',
  '--',
  'This e-mail was sent from a contact form on Verdeo (https://verdeo.com.ar)',
  '',
];

function email(options: {
  address?: string;
  date?: string;
  from: string;
  items?: Record<string, string>;
  message?: string;
  neighborhood?: string;
  phone?: string;
  subject?: string;
}): string {
  const items = {
    'Menú Paleo & Keto  250:': '0',
    'Menú Paleo & Keto  400': '0',
    'Menú Vegan 250': '0',
    'Menú Vegan 400': '0',
    'Menú Vegetariano 250': '0',
    'Menú Vegetariano 400': '0',
    'Menú Antiage & Detox 250': '0',
    'Menú Antiage & Detox 400': '0',
    ...options.items,
  };
  return [
    '---------- Forwarded message ---------',
    'De: Verdeo Comida Saludable <info@verdeo.com.ar>',
    `Date: ${options.date ?? 'lun, 5 oct 2026 a las 19:12'}`,
    `Subject: ${options.subject ?? 'Pedido online Capital Federal'}`,
    'To: <pedidos@example.com>',
    '',
    '',
    `From: ${options.from}`,
    'Subject: [your-subject]',
    '',
    `Celular: ${options.phone ?? '1155550101'}`,
    `Dirección de entrega: ${options.address ?? 'Calle Falsa 123'}`,
    `Barrio : ${options.neighborhood ?? 'Palermo'}`,
    '',
    '',
    'Pedido',
    ...Object.entries(items).map(([name, quantity]) => `${name} ${quantity}`),
    '',
    '',
    'Message Body:',
    options.message ?? '',
    ...FOOTER,
  ].join('\n');
}

describe('parseOrderEmails', () => {
  it('lee un pedido del formulario', () => {
    const { rows } = parseOrderEmails(
      email({ from: 'Ana Pérez ana@example.com', items: { 'Menú Paleo & Keto  400': '2' } }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      customerName: 'Ana Pérez',
      deliveryAddress: 'Calle Falsa 123, Palermo',
      email: 'ana@example.com',
      kind: 'email',
      locality: 'Capital Federal',
      receivedOn: '2026-10-05',
    });
    expect(rows[0]?.items).toEqual([
      { dishes: [], quantityUnits: 2, size: '400', variety: 'Menú Paleo & Keto' },
    ]);
  });

  /*
   * El formulario lista todas las variedades y marca con cero las que no se piden. Sólo el pedido
   * real entra: arrastrar los ceros llenaría el pedido de renglones vacíos.
   */
  it('ignora las variedades con cantidad cero', () => {
    const { rows } = parseOrderEmails(
      email({ from: 'Ana ana@example.com', items: { 'Menú Vegan 250': '1' } }),
    );

    expect(rows[0]?.items).toHaveLength(1);
    expect(rows[0]?.items[0]).toMatchObject({ size: '250', variety: 'Menú Vegan' });
  });

  // El campo es de texto, no un número: "01" es una vianda.
  it('lee una cantidad con cero adelante', () => {
    const { rows } = parseOrderEmails(
      email({ from: 'Ana ana@example.com', items: { 'Menú Paleo & Keto  400': '01' } }),
    );

    expect(rows[0]?.items[0]?.quantityUnits).toBe(1);
  });

  // El primer renglón del formulario trae dos puntos y los demás no.
  it('lee el renglón con dos puntos y los que no lo tienen', () => {
    const { rows } = parseOrderEmails(
      email({
        from: 'Ana ana@example.com',
        items: { 'Menú Paleo & Keto  250:': '3', 'Menú Vegan 400': '2' },
      }),
    );

    expect(rows[0]?.items.map((item) => [item.variety, item.size, item.quantityUnits])).toEqual([
      ['Menú Paleo & Keto', '250', 3],
      ['Menú Vegan', '400', 2],
    ]);
  });

  // Dos variedades son UN pedido: con una sola por fila se habrían importado como dos.
  it('junta las variedades de un email en un solo pedido', () => {
    const { rows } = parseOrderEmails(
      email({
        from: 'Ana ana@example.com',
        items: { 'Menú Vegan 400': '1', 'Menú Vegetariano 250': '2' },
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.items).toHaveLength(2);
  });

  // El formulario deja espacios dobles, y los emails reales traen espacios no separables.
  it('normaliza los espacios de más de la dirección y el barrio', () => {
    const { rows } = parseOrderEmails(
      email({
        address: 'Julián Álvarez  1010.  6 ° A',
        from: 'Ana ana@example.com',
        items: { 'Menú Vegan 400': '1' },
        neighborhood: 'Villa  Crespo',
      }),
    );

    expect(rows[0]?.deliveryAddress).toBe('Julián Álvarez 1010. 6 ° A, Villa Crespo');
  });

  it('guarda el mensaje del cliente como nota del pedido', () => {
    const { rows } = parseOrderEmails(
      email({
        from: 'Ana ana@example.com',
        items: { 'Menú Vegan 400': '1' },
        message: 'Soy alérgica a las nueces',
      }),
    );

    expect(rows[0]?.notes).toBe('Soy alérgica a las nueces');
  });

  it('un pedido sin mensaje no tiene nota', () => {
    const { rows } = parseOrderEmails(
      email({ from: 'Ana ana@example.com', items: { 'Menú Vegan 400': '1' } }),
    );

    expect(rows[0]?.notes).toBeNull();
  });

  /*
   * El caso que justifica separar las consultas. El formulario se puede enviar con todo en cero, y
   * quien lo hace casi siempre quiere preguntar algo. Convertirlo en un pedido vacío lo perdería, y
   * descartarlo también.
   */
  it('trata un formulario todo en cero como una consulta, no como un pedido', () => {
    const { inquiries, rows } = parseOrderEmails(
      email({
        from: 'Laura laura@example.com',
        message: '¿Qué me aconsejan para empezar? ¿Tienen vianda dulce?',
      }),
    );

    expect(rows).toHaveLength(0);
    expect(inquiries).toEqual([
      expect.objectContaining({
        customerName: 'Laura',
        email: 'laura@example.com',
        message: '¿Qué me aconsejan para empezar? ¿Tienen vianda dulce?',
      }),
    ]);
  });

  /*
   * Cuatro formas de escribir el mismo celular. Si salen distintas, cada una crea un cliente nuevo.
   */
  it('deja todos los celulares con la misma forma', () => {
    const formas = ['+541155550101', '1155550101', '91155550101', '+5491155550101'];
    const { rows } = parseOrderEmails(
      formas
        .map((phone) =>
          email({ from: 'Ana ana@example.com', items: { 'Menú Vegan 400': '1' }, phone }),
        )
        .join('\n'),
    );

    expect(new Set(rows.map((row) => row.phone))).toEqual(new Set(['+5491155550101']));
  });

  it('lee varios emails pegados juntos y numera cada pedido', () => {
    const { rows } = parseOrderEmails(
      [
        email({ from: 'Ana ana@example.com', items: { 'Menú Vegan 400': '1' } }),
        email({ from: 'Beto beto@example.com', items: { 'Menú Vegan 250': '2' } }),
        email({ from: 'Carla carla@example.com', items: { 'Menú Vegan 400': '3' } }),
      ].join('\n'),
    );

    expect(rows.map((row) => [row.rowNumber, row.customerName])).toEqual([
      [1, 'Ana'],
      [2, 'Beto'],
      [3, 'Carla'],
    ]);
  });

  // Un pedido, una consulta y otro pedido: los números siguen el lugar en lo pegado.
  it('separa pedidos y consultas sin perder el orden', () => {
    const { inquiries, rows } = parseOrderEmails(
      [
        email({ from: 'Ana ana@example.com', items: { 'Menú Vegan 400': '1' } }),
        email({ from: 'Laura laura@example.com', message: 'Una pregunta' }),
        email({ from: 'Carla carla@example.com', items: { 'Menú Vegan 400': '1' } }),
      ].join('\n'),
    );

    expect(rows.map((row) => row.rowNumber)).toEqual([1, 3]);
    expect(inquiries.map((inquiry) => inquiry.rowNumber)).toEqual([2]);
  });

  // Un email suelto, sin el encabezado de reenvío, también se lee.
  it('lee un email sin encabezado de reenvío', () => {
    const suelto = [
      'From: Ana ana@example.com',
      'Subject: [your-subject]',
      '',
      'Celular: 1155550101',
      'Dirección de entrega: Calle Falsa 123',
      'Barrio : Palermo',
      '',
      'Pedido',
      'Menú Vegan 400 2',
      '',
      'Message Body:',
      '',
    ].join('\n');

    const { rows } = parseOrderEmails(suelto);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.items[0]).toMatchObject({ quantityUnits: 2, size: '400' });
  });

  /*
   * Un reenvío en inglés antepone el "From:" del sitio al del cliente. El pedido es del cliente.
   */
  it('toma como cliente el último From, no el del sitio que reenvía', () => {
    const ingles = [
      '---------- Forwarded message ---------',
      'From: Verdeo Comida Saludable <info@verdeo.com.ar>',
      'Date: Mon, 5 Oct 2026 at 19:12',
      'Subject: Pedido online Capital Federal',
      '',
      'From: Ana Pérez ana@example.com',
      'Celular: 1155550101',
      'Dirección de entrega: Calle Falsa 123',
      '',
      'Pedido',
      'Menú Vegan 400 1',
      '',
      'Message Body:',
      '',
    ].join('\n');

    const { rows } = parseOrderEmails(ingles);

    expect(rows[0]?.email).toBe('ana@example.com');
    expect(rows[0]?.customerName).toBe('Ana Pérez');
  });

  /*
   * Una línea del pedido que no se entiende se dice. Descartarla en silencio dejaría salir el
   * pedido sin esa vianda, y quien lo revisa cree que está completo.
   */
  it('avisa de una línea del pedido que no entiende en vez de descartarla', () => {
    const { rows } = parseOrderEmails(
      email({
        from: 'Ana ana@example.com',
        items: { 'Menú Vegan 400': '1', 'Quiero también un postre': 'por favor' },
      }),
    );

    expect(rows[0]?.items).toHaveLength(1);
    expect(rows[0]?.warnings).toEqual([expect.stringContaining('Quiero también un postre')]);
  });

  it('avisa de una cantidad llamativa y no la importa', () => {
    const { rows } = parseOrderEmails(
      email({
        from: 'Ana ana@example.com',
        items: { 'Menú Vegan 400': '1', 'Menú Vegan 250': '500' },
      }),
    );

    expect(rows[0]?.items).toHaveLength(1);
    expect(rows[0]?.warnings[0]).toContain('500');
  });

  it('no inventa pedidos con un texto que no es un email de pedido', () => {
    const resultado = parseOrderEmails('Hola, ¿cómo están? Esto no es un pedido.');

    expect(resultado.rows).toHaveLength(0);
    expect(resultado.inquiries).toHaveLength(0);
    expect(resultado.unreadable).toBe(1);
  });

  it('no se rompe con un texto vacío', () => {
    expect(parseOrderEmails('   ')).toEqual({ inquiries: [], rows: [], unreadable: 0 });
  });
});
