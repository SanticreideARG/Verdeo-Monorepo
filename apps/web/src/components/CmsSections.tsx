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
function WeeklyMenuSection({ anchorId }: { anchorId?: string | undefined }) {
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
    <section className="border-y border-forest/10 bg-white/60" id={anchorId}>
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

function DeliveryZonesSection({
  anchorId,
  heading,
  subheading,
}: {
  anchorId?: string | undefined;
  heading?: string | undefined;
  subheading?: string | undefined;
}) {
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
    <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8" id={anchorId}>
      <h2 className="text-3xl font-semibold text-forest">{heading ?? 'Dónde entregamos'}</h2>
      {subheading ? <p className="mt-2 max-w-2xl text-ink-muted">{subheading}</p> : null}
      {/* Each chip is its own link straight into checkout — the real site sends every city to a
          separate WordPress page; here the destination is always the same order form, since city
          selection lives inside it rather than needing a page per city. */}
      <div className="mt-6 flex flex-wrap gap-3">
        {sites.map((site) => (
          <Link className="status-chip" key={site.slug} to="/pedido">
            {site.displayName}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** New section type: a rotating-word hero. `words` cycles on a fade, same beat as the reference
 * site's ("cuida tu salud" / "desde la alimentación" / "comidas saludables"), just no external
 * plugin — a plain interval + CSS transition. */
function HeroRotatorSection({ section }: { section: PageSection }) {
  const words = (section.words as string[] | undefined)?.filter(Boolean) ?? [];
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (words.length <= 1) return;
    const timer = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % words.length);
        setVisible(true);
      }, 400);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [words.length]);

  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-5 py-20 text-center sm:px-8 sm:py-28"
      id={section.anchorId as string | undefined}
    >
      {section.kicker ? <p className="eyebrow">{section.kicker as string}</p> : null}
      <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-7xl">
        {words.length > 0 ? (
          <span className="hero-rotator-word" style={{ opacity: visible ? 1 : 0 }}>
            {words[index]}
          </span>
        ) : (
          ((section.fallback as string | undefined) ?? '')
        )}
      </h1>
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {section.ctaLabel && section.ctaHref ? (
          <Link className="button button-primary button-large" to={section.ctaHref}>
            {section.ctaLabel as string}
          </Link>
        ) : null}
        {section.secondaryLabel && section.secondaryHref ? (
          <a
            className="button button-secondary button-large"
            href={section.secondaryHref as string}
          >
            {section.secondaryLabel as string}
          </a>
        ) : null}
      </div>
    </section>
  );
}

/** New section type: an image+caption carousel, one slide visible at a time with prev/next —
 * the "Nosotros" slider on the reference site. No library, matching the rest of this admin panel
 * (native state + CSS), advances automatically and on manual click alike. */
function CarouselSection({ section }: { section: PageSection }) {
  const slides = (section.slides as { caption?: string; imageUrl?: string }[] | undefined) ?? [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;
  const slide = slides[index % slides.length];

  return (
    <section
      className="border-y border-forest/10 bg-white/60"
      id={section.anchorId as string | undefined}
    >
      <div className="mx-auto w-full max-w-4xl px-5 py-14 text-center sm:px-8">
        {section.heading ? (
          <h2 className="mb-8 text-3xl font-semibold text-forest">{section.heading as string}</h2>
        ) : null}
        <div className="cms-carousel">
          {slide?.imageUrl ? (
            <img alt="" className="cms-carousel-image" src={slide.imageUrl} />
          ) : null}
          {slide?.caption ? <p className="cms-carousel-caption">{slide.caption}</p> : null}
        </div>
        {slides.length > 1 ? (
          <div className="mt-5 flex items-center justify-center gap-4">
            <button
              aria-label="Anterior"
              className="button button-secondary"
              onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)}
              type="button"
            >
              ‹
            </button>
            <div className="flex gap-1.5">
              {slides.map((_, dotIndex) => (
                <span
                  className={`cms-carousel-dot ${dotIndex === index ? 'is-active' : ''}`}
                  key={dotIndex}
                />
              ))}
            </div>
            <button
              aria-label="Siguiente"
              className="button button-secondary"
              onClick={() => setIndex((current) => (current + 1) % slides.length)}
              type="button"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function CmsSection({ section }: { section: PageSection }) {
  const anchorId = section.anchorId as string | undefined;
  switch (section.type) {
    case 'HERO_ROTATOR':
      return <HeroRotatorSection section={section} />;
    case 'CAROUSEL':
      return <CarouselSection section={section} />;
    case 'HERO':
      return (
        <section
          className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24"
          id={anchorId}
        >
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
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8" id={anchorId}>
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
        <section
          className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:items-center"
          id={anchorId}
        >
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
        <section className="border-y border-forest/10 bg-white/60" id={anchorId}>
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
      return <WeeklyMenuSection anchorId={anchorId} />;
    case 'CTA':
      return (
        <section className="mx-auto w-full max-w-4xl px-5 py-14 text-center sm:px-8" id={anchorId}>
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
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8" id={anchorId}>
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
      return (
        <DeliveryZonesSection
          anchorId={anchorId}
          heading={section.heading as string | undefined}
          subheading={section.subheading as string | undefined}
        />
      );
    case 'CONTACT': {
      const regions =
        (section.regions as { label?: string; whatsapp?: string }[] | undefined)?.filter(
          (region) => region.label && region.whatsapp,
        ) ?? [];
      return (
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8" id={anchorId}>
          {section.heading ? (
            <h2 className="mb-4 text-3xl font-semibold text-forest">{section.heading as string}</h2>
          ) : null}
          <ul className="grid gap-2 text-ink-muted">
            {section.phone ? <li>Tel: {section.phone as string}</li> : null}
            {section.whatsapp ? <li>WhatsApp: {section.whatsapp as string}</li> : null}
            {section.email ? <li>Email: {section.email as string}</li> : null}
            {section.address ? <li>{section.address as string}</li> : null}
          </ul>
          {/* One WhatsApp number per zona, same as the reference site's "atención por ciudad" —
              lives alongside, not instead of, the single-contact fields above. */}
          {regions.length > 0 ? (
            <ul className="mt-6 grid gap-2 border-t border-forest/10 pt-6 text-ink-muted">
              {regions.map((region) => (
                <li key={region.label}>
                  <strong className="text-forest">{region.label}:</strong>{' '}
                  <a
                    className="underline"
                    href={`https://api.whatsapp.com/send?phone=${(region.whatsapp ?? '').replace(/\D/g, '')}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {region.whatsapp}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    }
    case 'GALLERY':
      return (
        <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8" id={anchorId}>
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
          id={anchorId}
        />
      );
    default:
      return null;
  }
}
