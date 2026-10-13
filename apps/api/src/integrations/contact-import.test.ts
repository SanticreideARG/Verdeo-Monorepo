import { describe, expect, it } from 'vitest';

import { extractPayment, parseContactImport, type ContactImportError } from './contact-import.js';

function csvFile(contents: string, name = 'contactos.csv'): File {
  return new File([contents], name, { type: 'text/csv' });
}

describe('parseContactImport', () => {
  it('creates customer inputs with identities and an address from canonical columns', async () => {
    const rows = await parseContactImport(
      csvFile(
        [
          'nombre_completo,whatsapp,email,direccion,enlace_ubicacion',
          'María Pérez,+54 299 555 0101,maria@example.com,Av. Siempre Viva 123,https://maps.example.com/punto',
        ].join('\n'),
      ),
      '90000000-0000-4000-8000-0000000000aa',
    );

    expect(rows).toEqual([
      expect.objectContaining({ displayName: 'María Pérez', email: 'maria@example.com' }),
    ]);
    expect(rows[0]?.identities).toEqual([
      expect.objectContaining({ type: 'whatsapp', value: '+5492995550101' }),
    ]);
    expect(rows[0]?.addresses).toEqual([
      expect.objectContaining({
        geographicZoneId: '90000000-0000-4000-8000-0000000000aa',
        locationUrl: 'https://maps.example.com/punto',
        writtenAddress: 'Av. Siempre Viva 123',
      }),
    ]);
  });

  it('refuses to drop addresses when the operator picked no zone', async () => {
    await expect(
      parseContactImport(
        csvFile(['nombre_completo,direccion', 'María Pérez,Av. Siempre Viva 123'].join('\n')),
      ),
    ).rejects.toThrowError(/zona de operaciones/);
  });

  it('rejects a sheet without the required name column', async () => {
    await expect(parseContactImport(csvFile('whatsapp\n+54 299 555 0101'))).rejects.toMatchObject({
      message: expect.stringMatching(/^Falta una columna con el nombre del cliente/) as string,
    } satisfies Partial<ContactImportError>);
  });
});

// Una planilla como las reales: filas vacías arriba, encabezados libres, la forma de pago pegada a
// la dirección y direcciones con comas entre comillas. Datos inventados.
describe('parseContactImport con encabezados libres', () => {
  const ZONA = '90000000-0000-4000-8000-0000000000aa';
  const planilla = [
    ',,,',
    'Barrio,Dirección,Nombre,Celular',
    ',,,',
    'Villa Crespo,Julián Álvarez 1010 - 6A transferencia,Ana Prueba,1155550101',
    'Palermo,"Gorriti 4000, piso 2, depto B",Beto Ensayo,1155550102',
    'Núñez,Libertador 8600 POR TRANSFERENCIA,Carla Muestra,1155550103',
  ].join('\r\n');

  it('encuentra los encabezados aunque haya filas vacías arriba y saltea las vacías', async () => {
    const rows = await parseContactImport(csvFile(planilla), ZONA);
    expect(rows.map((row) => row.displayName)).toEqual([
      'Ana Prueba',
      'Beto Ensayo',
      'Carla Muestra',
    ]);
  });

  it('toma el celular como teléfono y como WhatsApp', async () => {
    const [ana] = await parseContactImport(csvFile(planilla), ZONA);
    expect(ana?.phone).toBe('+5491155550101');
    expect(ana?.identities).toEqual([
      expect.objectContaining({ type: 'whatsapp', value: '+5491155550101' }),
    ]);
  });

  it('separa la forma de pago de la dirección y la guarda como preferida', async () => {
    const [ana, beto, carla] = await parseContactImport(csvFile(planilla), ZONA);
    expect(ana?.addresses[0]).toMatchObject({
      sector: 'Villa Crespo',
      writtenAddress: 'Julián Álvarez 1010 - 6A, Villa Crespo',
    });
    expect(ana?.internalNotes).toBe('Forma de pago preferida: Transferencia.');
    expect(carla?.addresses[0]?.writtenAddress).toBe('Libertador 8600, Núñez');
    expect(beto?.addresses[0]?.writtenAddress).toBe('Gorriti 4000, piso 2, depto B, Palermo');
    expect(beto?.internalNotes).toBeUndefined();
  });

  it('reconoce otros nombres de columna y junta nombre y apellido', async () => {
    const [row] = await parseContactImport(
      csvFile(
        [
          'Nombres,Apellido,Teléfono fijo,WhatsApp,E-mail,Domicilio de entrega,Forma de pago,Observaciones',
          'Dora,Inventada,4555-0000,+54 9 11 5555 0104,dora@example.com,Corrientes 1607,efectivo,Timbre roto',
        ].join('\n'),
      ),
      ZONA,
    );
    expect(row).toMatchObject({
      displayName: 'Dora Inventada',
      email: 'dora@example.com',
      firstName: 'Dora',
      internalNotes: 'Timbre roto\nForma de pago preferida: Efectivo.',
      lastName: 'Inventada',
      phone: '4555-0000',
    });
    expect(row?.identities[0]?.value).toBe('+5491155550104');
    expect(row?.addresses[0]?.writtenAddress).toBe('Corrientes 1607');
  });
});

describe('extractPayment', () => {
  it('reconoce las formas de escribirla', () => {
    expect(extractPayment('Mitre 400 (pago en efectivo)')).toEqual({
      payment: 'Efectivo',
      text: 'Mitre 400',
    });
    expect(extractPayment('Mitre 400 - transf.')).toEqual({
      payment: 'Transferencia',
      text: 'Mitre 400',
    });
    expect(extractPayment('Mitre 400, Mercado Pago')).toEqual({
      payment: 'Mercado Pago',
      text: 'Mitre 400',
    });
    expect(extractPayment('Mitre 400')).toEqual({ text: 'Mitre 400' });
  });
});
