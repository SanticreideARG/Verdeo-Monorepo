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
