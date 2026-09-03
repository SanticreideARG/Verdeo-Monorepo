import { describe, expect, it } from 'vitest';

import {
  CustomerSelfAddressSchema,
  CustomerSelfAddressUpdateSchema,
  CustomerSelfAddressWriteSchema,
} from './operations.js';

const OPERATOR_VIEW = {
  accessNotes: 'El portero no atiende después de las 18, tocar timbre del 3B',
  active: true,
  city: 'Neuquén',
  createdAt: '2026-09-01T12:00:00.000Z',
  geocodingStatus: 'CONFIRMED',
  geographicZoneId: '00000000-0000-4000-8000-000000000001',
  id: '00000000-0000-4000-8000-000000000002',
  label: 'Casa',
  latitude: -38.95,
  locationUrl: 'https://maps.app.goo.gl/abc',
  longitude: -68.05,
  operationalZone: 'Ruta 3 · tramo norte',
  primary: true,
  propertyType: 'departamento',
  sector: 'B',
  source: 'customer',
  unit: '3B',
  writtenAddress: 'Av. Argentina 123',
};

describe('CustomerSelfAddressSchema', () => {
  /**
   * The privacy guarantee this schema exists for. Access notes in particular are an operator's
   * working notes about getting in — nobody wants those read back to them — and operational zone
   * and sector are routing annotations that are none of the customer's business.
   */
  it('drops every operator annotation from what the customer is shown', () => {
    const seen = CustomerSelfAddressSchema.parse(OPERATOR_VIEW);

    expect(seen).not.toHaveProperty('accessNotes');
    expect(seen).not.toHaveProperty('operationalZone');
    expect(seen).not.toHaveProperty('sector');
    expect(seen).not.toHaveProperty('propertyType');
    expect(seen).not.toHaveProperty('geocodingStatus');
    expect(seen).not.toHaveProperty('latitude');
    expect(seen).not.toHaveProperty('longitude');
    expect(seen).not.toHaveProperty('source');
  });

  it('keeps what the customer wrote, including their own shared pin', () => {
    expect(CustomerSelfAddressSchema.parse(OPERATOR_VIEW)).toEqual({
      city: 'Neuquén',
      geographicZoneId: '00000000-0000-4000-8000-000000000001',
      id: '00000000-0000-4000-8000-000000000002',
      label: 'Casa',
      locationUrl: 'https://maps.app.goo.gl/abc',
      primary: true,
      unit: '3B',
      writtenAddress: 'Av. Argentina 123',
    });
  });
});

describe('CustomerSelfAddressWriteSchema', () => {
  /**
   * The write surface is narrow for a reason: the operator's update schema accepts these fields,
   * and a customer reaching them could overwrite routing work or mark their own address as
   * confirmed-geocoded.
   */
  it('ignores operator-owned fields a client tries to send', () => {
    const written = CustomerSelfAddressWriteSchema.parse({
      accessNotes: 'lo que sea',
      geocodingStatus: 'CONFIRMED',
      geographicZoneId: '00000000-0000-4000-8000-000000000001',
      label: 'Casa',
      latitude: -38.95,
      operationalZone: 'me asigno una ruta',
      sector: 'Z',
      source: 'manual',
      writtenAddress: 'Av. Argentina 123',
    });

    expect(written).toEqual({
      geographicZoneId: '00000000-0000-4000-8000-000000000001',
      label: 'Casa',
      writtenAddress: 'Av. Argentina 123',
    });
  });

  it('accepts a shared Maps pin and rejects something that is not a link', () => {
    const base = {
      geographicZoneId: '00000000-0000-4000-8000-000000000001',
      label: 'Casa',
      writtenAddress: 'Av. Argentina 123',
    };

    expect(
      CustomerSelfAddressWriteSchema.parse({
        ...base,
        locationUrl: 'https://maps.app.goo.gl/abc',
      }).locationUrl,
    ).toBe('https://maps.app.goo.gl/abc');

    expect(
      CustomerSelfAddressWriteSchema.safeParse({ ...base, locationUrl: 'acá vivo' }).success,
    ).toBe(false);
  });

  it('lets an update touch one field without resending the address', () => {
    expect(
      CustomerSelfAddressUpdateSchema.parse({ locationUrl: 'https://maps.app.goo.gl/xyz' }),
    ).toEqual({ locationUrl: 'https://maps.app.goo.gl/xyz' });
  });
});
