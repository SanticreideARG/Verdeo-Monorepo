import { describe, expect, it } from 'vitest';

import {
  GeographicZoneCreateRequestSchema,
  OperatingSiteCreateRequestSchema,
  OperatingSiteUpdateRequestSchema,
} from './geography.js';

describe('geography contracts', () => {
  it('normalizes a configurable regional order prefix', () => {
    const result = OperatingSiteCreateRequestSchema.parse({
      displayName: 'Neuquén',
      orderPrefix: 'nqn',
      slug: 'neuquen',
    });

    expect(result.orderPrefix).toBe('NQN');
    expect(result.timezone).toBe('America/Argentina/Buenos_Aires');
  });

  it('allows several independently named zones under one operation', () => {
    const siteId = '8f7624fa-2f87-4e09-8434-7d7031c12c66';
    const first = GeographicZoneCreateRequestSchema.parse({
      displayName: 'Neuquén Capital',
      operatingSiteId: siteId,
      slug: 'neuquen-capital',
    });
    const second = GeographicZoneCreateRequestSchema.parse({
      displayName: 'Plottier',
      operatingSiteId: siteId,
      slug: 'plottier',
    });

    expect(first.operatingSiteId).toBe(second.operatingSiteId);
    expect(first.slug).not.toBe(second.slug);
  });

  it('rejects an empty update and malformed slugs', () => {
    expect(OperatingSiteUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(
      OperatingSiteCreateRequestSchema.safeParse({
        displayName: 'Neuquén',
        orderPrefix: 'NQN',
        slug: 'Neuquén Capital',
      }).success,
    ).toBe(false);
  });
});
