import { describe, expect, it } from 'vitest';

import { ContactImportError, parseContactImport } from './contact-import.js';

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
    );

    expect(rows).toEqual([
      expect.objectContaining({ displayName: 'María Pérez', email: 'maria@example.com' }),
    ]);
    expect(rows[0]?.identities).toEqual([
      expect.objectContaining({ type: 'whatsapp', value: '+54 299 555 0101' }),
    ]);
    expect(rows[0]?.addresses).toEqual([
      expect.objectContaining({
        locationUrl: 'https://maps.example.com/punto',
        writtenAddress: 'Av. Siempre Viva 123',
      }),
    ]);
  });

  it('rejects a sheet without the required name column', async () => {
    await expect(parseContactImport(csvFile('whatsapp\n+54 299 555 0101'))).rejects.toMatchObject({
      message: 'Falta la columna obligatoria nombre_completo.',
    } satisfies Partial<ContactImportError>);
  });
});
