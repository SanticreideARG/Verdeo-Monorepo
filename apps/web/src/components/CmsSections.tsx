import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { formatMoney, type WeeklyMenu } from '../lib/operations.js';

export interface PageSection {
  [key: string]: unknown;
  id: string;
  type: string;
}

/** WEEKLY_MENU and DELIVERY_ZONES sections carry no stored content — they're placement markers.
 * Rendering them from copy saved in a CMS revision would be a second source of truth for the real
 * menu/geography systems, so both resolve live against the same public endpoints the order page
 * uses, right here at render time. */
function WeeklyMenuSection() {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);

  useEffect(() => {
    void apiRequest('/api/v1/public/menu/current')
      .then(async (response) => {
        if (!response.ok) return;
        setMenu((await response.json()) as WeeklyMenu);
      })
      .catch(() => setMenu(null));
  }, []);

  if (!menu) return null;

  return (
    <section className="border-y border-forest/10 bg-white/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <p className="eyebrow">{menu.cycle.alias}</p>
        <h2 className="mt-2 text-3xl font-semibold text-forest">Menú de la semana</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menu.offerings.map((offering) => (
            <article className="step-card" key={offering.id}>
              <h3>
                {offering.familyName} {offering.variantName}
              </h3>
              {offering.description ? <p>{offering.description}</p> : null}
              <p>{formatMoney(offering.unitPriceMinor, offering.currency)}</p>
            </article>
          ))}
        </div>
        <Link className="button button-primary button-large mt-8" to="/pedido">
          Hacer un pedido
        </Link>
      </div>
    </section>
  );
}

function DeliveryZonesSection({ heading }: { heading?: string | undefined }) {
  const [sites, setSites] = useState<{ displayName: string; slug: string }[]>([]);

  useEffect(() => {
    void apiRequest('/api/v1/public/operating-sites')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { items: { displayName: string; slug: string }[] };
        setSites(body.items);
      })
      .catch(() => setSites([]));
  }, []);

  if (sites.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
      <h2 className="text-3xl font-semibold text-forest">{heading ?? 'Dónde entregamos'}</h2>
      <div className="mt-6 flex flex-wrap gap-3">
        {sites.map((site) => (
          <span className="status-chip" key={site.slug}>
            {site.displayName}
          </span>
        ))}
      </div>
    </section>
  );
}

export function CmsSection({ section }: { section: PageSection }) {
  switch (section.type) {
    case 'HERO':
      return (
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-7xl">
              {section.headline as string}
            </h1>
            {section.subheadline ? (
              <p className="mt-6 max-w-xl text-lg leading-8 text-ink-muted">
                {section.subheadline as string}
              </p>
            ) : null}
            {section.ctaLabel && section.ctaHref ? (
              <div className="mt-8">
                <Link className="button button-primary button-large" to={section.ctaHref}>
                  {section.ctaLabel as string}
                </Link>
              </div>
            ) : null}
          </div>
          {section.imageUrl ? (
            <img
              alt=""
              className="w-full rounded-3xl object-cover"
              src={section.imageUrl as string}
            />
          ) : null}
        </section>
      );
    case 'TEXT':
      return (
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
          {section.heading ? (
            <h2 className="text-3xl font-semibold text-forest">{section.heading as string}</h2>
          ) : null}
          <p className="mt-4 whitespace-pre-wrap leading-7 text-ink-muted">
            {section.body as string}
          </p>
        </section>
      );
    case 'IMAGE_TEXT': {
      const imageFirst = section.imagePosition === 'left';
      return (
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:items-center">
          <img
            alt=""
            className={`w-full rounded-3xl object-cover ${imageFirst ? 'lg:order-1' : 'lg:order-2'}`}
            src={section.imageUrl as string}
          />
          <div className={imageFirst ? 'lg:order-2' : 'lg:order-1'}>
            {section.heading ? (
              <h2 className="text-3xl font-semibold text-forest">{section.heading as string}</h2>
            ) : null}
            <p className="mt-4 leading-7 text-ink-muted">{section.body as string}</p>
          </div>
        </section>
      );
    }
    case 'STEPS':
      return (
        <section className="border-y border-forest/10 bg-white/60">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
            {section.heading ? (
              <h2 className="mb-8 text-3xl font-semibold text-forest">
                {section.heading as string}
              </h2>
            ) : null}
            <div className="grid gap-8 sm:grid-cols-3">
              {(section.steps as { body: string; number: string; title: string }[]).map((step) => (
                <article className="step-card" key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      );
    case 'WEEKLY_MENU':
      return <WeeklyMenuSection />;
    case 'CTA':
      return (
        <section className="mx-auto w-full max-w-4xl px-5 py-14 text-center sm:px-8">
          <h2 className="text-3xl font-semibold text-forest">{section.heading as string}</h2>
          {section.body ? <p className="mt-3 text-ink-muted">{section.body as string}</p> : null}
          <Link
            className="button button-primary button-large mt-6 inline-flex"
            to={section.buttonHref as string}
          >
            {section.buttonLabel as string}
          </Link>
        </section>
      );
    case 'FAQ':
      return (
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
          {section.heading ? (
            <h2 className="mb-6 text-3xl font-semibold text-forest">{section.heading as string}</h2>
          ) : null}
          <div className="grid gap-4">
            {(section.items as { answer: string; question: string }[]).map((item) => (
              <details className="rounded-2xl border border-forest/10 p-4" key={item.question}>
                <summary className="cursor-pointer font-semibold text-forest">
                  {item.question}
                </summary>
                <p className="mt-2 text-ink-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      );
    case 'DELIVERY_ZONES':
      return <DeliveryZonesSection heading={section.heading as string | undefined} />;
    case 'CONTACT':
      return (
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
          {section.heading ? (
            <h2 className="mb-4 text-3xl font-semibold text-forest">{section.heading as string}</h2>
          ) : null}
          <ul className="grid gap-2 text-ink-muted">
            {section.phone ? <li>Tel: {section.phone as string}</li> : null}
            {section.whatsapp ? <li>WhatsApp: {section.whatsapp as string}</li> : null}
            {section.email ? <li>Email: {section.email as string}</li> : null}
            {section.address ? <li>{section.address as string}</li> : null}
          </ul>
        </section>
      );
    case 'GALLERY':
      return (
        <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
          {section.heading ? (
            <h2 className="mb-6 text-3xl font-semibold text-forest">{section.heading as string}</h2>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            {(section.images as { alt?: string; url: string }[]).map((image) => (
              <img
                alt={image.alt ?? ''}
                className="aspect-square w-full rounded-2xl object-cover"
                key={image.url}
                src={image.url}
              />
            ))}
          </div>
        </section>
      );
    case 'CUSTOM':
      return (
        <section
          className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8"
          dangerouslySetInnerHTML={{ __html: section.html as string }}
        />
      );
    default:
      return null;
  }
}
