import { describe, expect, it } from 'vitest';

import {
  CustomerAddressCreateRequestSchema,
  PublicOrderCreateRequestSchema,
} from './operations.js';

const address = {
  label: 'Casa',
  writtenAddress: 'Av. Siempre Viva 742',
};

describe('address scope contract', () => {
  it('refuses an address without a zone of operations', () => {
    const result = CustomerAddressCreateRequestSchema.safeParse(address);

    expect(result.success).toBe(false);
  });

  it('accepts a locality that differs from the operation covering it', () => {
    const result = CustomerAddressCreateRequestSchema.parse({
      ...address,
      // Plottier is its own town but falls inside the operation's coverage area (ADR-031).
      city: 'Plottier',
      geographicZoneId: '90000000-0000-4000-8000-0000000000aa',
    });

    expect(result.city).toBe('Plottier');
    expect(result.geographicZoneId).toBe('90000000-0000-4000-8000-0000000000aa');
  });
});

describe('public order scope contract', () => {
  const base = {
    customer: { displayName: 'María Pérez' },
    deliveryAddress: 'Av. Siempre Viva 742',
    deliveryDate: '2026-08-26',
    dietaryInstructions: [],
    items: [{ offeringId: '30000000-0000-4000-8000-000000000001', quantityUnits: 1 }],
    menuId: '20000000-0000-4000-8000-000000000001',
    paymentExpectation: 'transferencia',
    source: 'web' as const,
  };

  it('requires the visitor to name the operation explicitly', () => {
    expect(PublicOrderCreateRequestSchema.safeParse(base).success).toBe(false);
  });

  it('accepts a slug the visitor chose', () => {
    const result = PublicOrderCreateRequestSchema.parse({
      ...base,
      operatingSiteSlug: 'neuquen',
    });

    expect(result.operatingSiteSlug).toBe('neuquen');
  });

  it('rejects a slug that is not an identifier', () => {
    const result = PublicOrderCreateRequestSchema.safeParse({
      ...base,
      operatingSiteSlug: 'San Carlos',
    });

    expect(result.success).toBe(false);
  });
});
