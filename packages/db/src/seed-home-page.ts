/**
 * Seeds the public "home" CMS page with content cloned from verdeo.com.ar (the same business's
 * live WordPress site — this is not third-party content, it's the same company's own copy and
 * business data), rebuilt through this app's own typed CMS sections instead of copy-pasting HTML.
 *
 * Idempotent by design: if a page with slug "home" already exists — including one an operator has
 * since edited through Contenidos — this exits without touching it. Safe to run more than once,
 * and safe to run after someone has already customized the seeded content.
 *
 * Run with: pnpm --filter @verdeo/db exec tsx src/seed-home-page.ts
 */
import { createDatabase } from './index.js';
import { PostgresCmsService } from './repositories/postgres-cms-service.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const CONTEXT = { correlationId: 'seed-home-page', requestId: 'seed-home-page', source: 'seed' };

// Cloned from verdeo.com.ar's single-page layout: rotating-word hero, "Nosotros" slider, the live
// weekly menu, city pricing/order links, and per-city WhatsApp contact — same content, rebuilt as
// typed sections so it's editable from Contenidos instead of living in a WordPress theme.
const sections = [
  {
    anchorId: 'top',
    ctaHref: '/pedido',
    ctaLabel: 'Hacé tu pedido online',
    id: 'sec-hero-rotator',
    kicker: 'Bienvenido a nuestro mundo',
    secondaryHref: 'mailto:info@verdeo.com.ar',
    secondaryLabel: 'Consultas? info@verdeo.com.ar',
    type: 'HERO_ROTATOR',
    words: ['cuida tu salud', 'desde la alimentación', 'comidas saludables'],
  },
  {
    anchorId: 'section-nosotros',
    heading: 'Nosotros',
    id: 'sec-carousel-nosotros',
    slides: [
      {
        caption:
          'Nuestro delivery entrega un menú completo congelado para que nuestros clientes siempre tengan una opción saludable para sus elecciones de comidas.',
        imageUrl: 'https://verdeo.com.ar/wp-content/uploads/2014/10/verdeo-logo22-280x280.png',
      },
      {
        caption: 'En bandejas especiales para freezar o calentar en microondas rápidamente.',
        imageUrl: 'https://verdeo.com.ar/wp-content/uploads/2014/10/verdeo-logo22-280x280.png',
      },
      {
        caption: 'Elegí tu menú según tu estilo de vida: Paleo, Veggie o Vegetariano',
        imageUrl: 'https://verdeo.com.ar/wp-content/uploads/2014/10/verdeo-logo22-280x280.png',
      },
      {
        caption: 'Nuestro proceso comienza con materias primas frescas y elegidas',
        imageUrl: 'https://verdeo.com.ar/wp-content/uploads/2014/10/verdeo-logo22-280x280.png',
      },
      {
        caption:
          'En la cocina, optamos por recetas saludables, variadas, fusionando sabores tradicionales con algunos orientales',
        imageUrl: 'https://verdeo.com.ar/wp-content/uploads/2014/10/verdeo-logo22-280x280.png',
      },
      {
        caption:
          'Sin frituras, sin sal agregada, optamos por métodos de cocción saludables. Sin conservantes agregados.',
        imageUrl: 'https://verdeo.com.ar/wp-content/uploads/2014/10/verdeo-logo22-280x280.png',
      },
    ],
    type: 'CAROUSEL',
  },
  {
    anchorId: 'section-menu',
    id: 'sec-weekly-menu',
    type: 'WEEKLY_MENU',
  },
  {
    anchorId: 'section-precios',
    heading: 'Precios y pedido online',
    id: 'sec-delivery-zones',
    subheading:
      'Primero elegí tu ciudad para ver los precios actualizados. Vas a poder hacer tu pedido online ahí mismo.',
    type: 'DELIVERY_ZONES',
  },
  {
    address: '',
    anchorId: 'section-contact',
    email: 'info@verdeo.com.ar',
    heading: 'Contáctenos',
    id: 'sec-contact',
    regions: [
      { label: 'Capital Federal y Zona Norte, Buenos Aires', whatsapp: '5491158393179' },
      { label: 'Ciudad de Neuquén y Plottier, Neuquén', whatsapp: '5492995493102' },
      {
        label: 'Cipolletti, Fernandez Oro, General Roca, Villa Regina y alrededores, Río Negro',
        whatsapp: '5492995493102',
      },
      {
        label:
          'Ciudad de Mendoza, Godoy Cruz, Maipú, Guaymallen, Luján de Cuyo y alrededores, Gran Mendoza',
        whatsapp: '5492615117163',
      },
      { label: 'Ciudad de Córdoba Capital y alrededores', whatsapp: '5493513007925' },
    ],
    type: 'CONTACT',
    whatsapp: '',
  },
];

const { client, db } = createDatabase(databaseUrl);

try {
  const cms = new PostgresCmsService(db);
  const existing = await cms.listPages();
  if (existing.some((page) => page.slug === 'home')) {
    console.log('Page "home" already exists — leaving it untouched. Nothing to do.');
  } else {
    await cms.createPage({ slug: 'home', title: 'Inicio' }, CONTEXT);
    const revision = await cms.saveDraft('home', sections, CONTEXT);
    await cms.publish('home', revision.id, CONTEXT);
    console.log(
      `Seeded and published "home" (revision #${revision.revision}, ${sections.length} sections).`,
    );
  }
} finally {
  await client.end();
}
