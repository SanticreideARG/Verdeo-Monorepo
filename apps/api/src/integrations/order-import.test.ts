import { describe, expect, it } from 'vitest';

import { OrderImportError, parseOrderImport } from './order-import.js';

function csvFile(contents: string, name = 'pedidos.csv'): File {
  return new File([contents], name, { type: 'text/csv' });
}

describe('parseOrderImport', () => {
  it('reads a row with every column the planilla can bring', async () => {
    const rows = await parseOrderImport(
      csvFile(
        [
          'cliente,telefono,variedad,tamano,cantidad,medio de pago,direccion,platos,notas',
          'María Pérez,+54 299 555 0101,Intuitivo,Grande,2,Transferencia,Av. Siempre Viva 123,"Pollo al horno; Tarta de verdura",Sin sal',
        ].join('\n'),
      ),
    );

    expect(rows).toEqual([
      {
        customerName: 'María Pérez',
        deliveryAddress: 'Av. Siempre Viva 123',
        email: null,
        items: [
          {
            dishes: ['Pollo al horno', 'Tarta de verdura'],
            quantityUnits: 2,
            size: 'Grande',
            variety: 'Intuitivo',
          },
        ],
        kind: 'spreadsheet_import',
        locality: null,
        notes: 'Sin sal',
        paymentExpectation: 'Transferencia',
        // Todos los celulares con la misma forma, la que permite reconocer a un cliente que ya está.
        phone: '+5492995550101',
        receivedOn: null,
        rowNumber: 2,
        warnings: [],
      },
    ]);
  });

  /*
   * Los encabezados los escribe una persona, no un sistema: "Teléfono" con tilde y mayúscula es lo
   * que sale de exportar desde casi cualquier planilla, y rechazar el archivo por eso sería hacerle
   * repetir el trabajo a quien ya juntó los datos.
   */
  it('accepts headers written with accents, capitals and extra spaces', async () => {
    const rows = await parseOrderImport(
      csvFile(
        ['Nombre,  Teléfono ,Menú,Tamaño,Cant', 'Ana Vega,2995550102,Clásico,Chico,1'].join('\n'),
      ),
    );

    expect(rows[0]).toMatchObject({ customerName: 'Ana Vega', phone: '+5492995550102' });
    expect(rows[0]?.items[0]).toMatchObject({
      quantityUnits: 1,
      size: 'Chico',
      variety: 'Clásico',
    });
  });

  it('defaults the quantity to one unit when the column is absent', async () => {
    const rows = await parseOrderImport(csvFile(['cliente', 'Ana Vega'].join('\n')));
    expect(rows[0]?.items[0]?.quantityUnits).toBe(1);
  });

  /*
   * Una fila mal cargada no puede voltear el archivo entero. Se saltea y las demás entran, que es
   * lo contrario de lo que hace el Excel cuando alguien lo revisa a mano.
   */
  it('skips the rows without a name or with an impossible quantity, keeping the rest', async () => {
    const rows = await parseOrderImport(
      csvFile(
        [
          'cliente,cantidad',
          ',3',
          'Ana Vega,dos',
          'María Pérez,1',
          'Juan Díaz,0',
          'Luis Sosa,4',
        ].join('\n'),
      ),
    );

    expect(rows.map((row) => [row.customerName, row.rowNumber])).toEqual([
      ['María Pérez', 4],
      ['Luis Sosa', 6],
    ]);
  });

  /*
   * El número de fila es el que se ve en Excel: la 1 son los encabezados. Si no coincidiera, el
   * mensaje "revisá la fila 4" mandaría a corregir la equivocada.
   */
  it('numbers the rows the way the spreadsheet shows them', async () => {
    const rows = await parseOrderImport(
      csvFile(['cliente', 'Primera', 'Segunda', 'Tercera'].join('\n')),
    );
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
  });

  it('separates the dishes by comma as well as by semicolon', async () => {
    const rows = await parseOrderImport(
      csvFile(['cliente,platos', 'Ana Vega,"Pollo, Tarta , Guiso"'].join('\n')),
    );
    expect(rows[0]?.items[0]?.dishes).toEqual(['Pollo', 'Tarta', 'Guiso']);
  });

  it('explains what is missing when no row has the minimum data', async () => {
    await expect(
      parseOrderImport(csvFile(['cliente,cantidad', ',2', ',3'].join('\n'))),
    ).rejects.toThrow(OrderImportError);
  });

  it('rejects an empty file', async () => {
    await expect(parseOrderImport(csvFile(''))).rejects.toThrow('El archivo está vacío.');
  });
});

/*
 * La planilla armada por viandas, como se carga a mano: filas vacías arriba, el tamaño en
 * "Pedido", una columna por plato con la variedad, la venta, la forma de pago pegada a la dirección
 * y un producto suelto al costado. Datos inventados con la forma de una planilla real.
 */
describe('parseOrderImport con una fila por vianda', () => {
  const planilla = [
    '\t\t\t\t\t\t\t\t\t\t\t\t',
    '\tBarrio\tDirección\tNombre\tPedido\tColumna1\t\t\t\t\tVenta\tCelular\t\t',
    '\t\t\t\t\t\t\t\t\t\t\t\t',
    '\tAlmagro\tLavalle 100\tAna Prueba\t250\tketo\tketo\tketo\tketo\tketo\t70000\t\t\t',
    '\tAlmagro\tGallo 200 piso 6 transferencia\tBeto Ensayo\t400\tketo\tketo\t\tketo\tketo\t85000\t1155550102\tANTIAGE 250\t1',
    '\tAlmagro\tGallo 200 piso 6 transferencia\tBeto Ensayo\t400\t\t\t\t\tvegerariano\t\t\t\t',
    '\tPalermo\tGorriti 300 transferencia\tCarla Muestra\t250\tketo\tketo\tketo\tketo\tketo\t140000\t1155550103\t\t',
    '\tPalermo\tGorriti 300\tCarla Muestra\t250\tketo\tketo\tketo\tketo\tketo\t\t\t\t',
    '\tRetiro\tTalcahuano 400\tDora Inventada\t250\tvegetariano\tvegetariano\tvegetariano\tvegetariano\tvegetariano\t140000\t\t\t',
    '\tRetiro\tTalcahuano 400\tDora Inventada\t250\tREAL\tREAL\tREAL\tREAL\tREAL\t\t\t\t',
  ].join('\n');
  const tsv = () => new File([planilla], 'pedidos.tsv', { type: 'text/tab-separated-values' });

  it('arma un pedido por cliente con las filas seguidas', async () => {
    const rows = await parseOrderImport(tsv());
    expect(rows.map((row) => [row.customerName, row.rowNumber])).toEqual([
      ['Ana Prueba', 4],
      ['Beto Ensayo', 5],
      ['Carla Muestra', 7],
      ['Dora Inventada', 9],
    ]);
  });

  it('una vianda de una sola variedad es ese menú, y dos iguales se suman', async () => {
    const [ana, , carla, dora] = await parseOrderImport(tsv());
    expect(ana?.items).toEqual([{ dishes: [], quantityUnits: 1, size: '250', variety: 'keto' }]);
    expect(carla?.items).toEqual([{ dishes: [], quantityUnits: 2, size: '250', variety: 'keto' }]);
    expect(dora?.items.map((item) => item.variety)).toEqual(['vegetariano', 'REAL']);
  });

  it('una vianda con variedades mezcladas es un Intuitivo, completada con la fila de abajo', async () => {
    const beto = (await parseOrderImport(tsv()))[1];
    expect(beto?.items[0]).toEqual({
      dishes: [],
      quantityUnits: 1,
      size: '400',
      slotVarieties: ['keto', 'keto', 'vegerariano', 'keto', 'keto'],
      variety: 'Intuitivo',
    });
    expect(beto?.notices).toEqual(['La fila 6 completa la vianda de la fila 5.']);
    // El producto suelto al costado.
    expect(beto?.items[1]).toEqual({
      dishes: [],
      quantityUnits: 1,
      size: '250',
      variety: 'ANTIAGE',
    });
  });

  it('toma la forma de pago de la dirección, el barrio, la venta y el celular', async () => {
    const beto = (await parseOrderImport(tsv()))[1];
    expect(beto).toMatchObject({
      deliveryAddress: 'Gallo 200 piso 6, Almagro',
      notes: 'Venta en planilla: $85.000',
      paymentExpectation: 'Transferencia',
      phone: '+5491155550102',
    });
  });
});
