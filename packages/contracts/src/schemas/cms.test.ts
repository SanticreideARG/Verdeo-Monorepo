import { describe, expect, it } from 'vitest';

import { PageSectionSchema, PageSectionsSchema } from './cms.js';

describe('CMS section contract', () => {
  it('accepts a HERO_ROTATOR section with an anchorId', () => {
    const result = PageSectionSchema.parse({
      anchorId: 'top',
      ctaHref: '/pedido',
      ctaLabel: 'Hacé tu pedido online',
      id: 'sec-hero',
      kicker: 'Bienvenido a nuestro mundo',
      type: 'HERO_ROTATOR',
      words: ['cuida tu salud', 'desde la alimentación'],
    });
    expect(result.type).toBe('HERO_ROTATOR');
  });

  it('rejects a HERO_ROTATOR section with no words', () => {
    expect(() =>
      PageSectionSchema.parse({ id: 'sec-hero', type: 'HERO_ROTATOR', words: [] }),
    ).toThrow();
  });

  it('accepts a CAROUSEL section with slides', () => {
    const result = PageSectionSchema.parse({
      anchorId: 'section-nosotros',
      heading: 'Nosotros',
      id: 'sec-carousel',
      slides: [{ caption: 'Frescura ante todo', imageUrl: 'https://example.com/a.jpg' }],
      type: 'CAROUSEL',
    });
    expect(result.type).toBe('CAROUSEL');
  });

  it('accepts DELIVERY_ZONES with a subheading and CONTACT with per-city regions', () => {
    const zones = PageSectionSchema.parse({
      anchorId: 'section-precios',
      heading: 'Precios y pedido online',
      id: 'sec-zones',
      subheading: 'Elegí tu ciudad para ver los precios.',
      type: 'DELIVERY_ZONES',
    });
    expect(zones.type).toBe('DELIVERY_ZONES');

    const contact = PageSectionSchema.parse({
      email: 'info@verdeo.com.ar',
      id: 'sec-contact',
      regions: [{ label: 'Ciudad de Neuquén', whatsapp: '5492995493102' }],
      type: 'CONTACT',
    });
    expect(contact.type).toBe('CONTACT');
  });

  it('parses a full page as an array of mixed section types', () => {
    const sections = PageSectionsSchema.parse([
      { id: 'a', kicker: '', type: 'HERO_ROTATOR', words: ['cuida tu salud'] },
      { id: 'b', slides: [{ caption: 'x' }], type: 'CAROUSEL' },
      { id: 'c', type: 'WEEKLY_MENU' },
      { id: 'd', type: 'DELIVERY_ZONES' },
      { id: 'e', type: 'CONTACT' },
    ]);
    expect(sections).toHaveLength(5);
  });
});
