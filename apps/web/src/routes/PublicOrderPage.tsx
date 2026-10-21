import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { FacebookIcon, InstagramIcon } from '../components/CmsSections.js';
import { DraftNotice } from '../components/DraftNotice.js';
import { IntuitivoDishPicker } from '../components/IntuitivoDishPicker.js';
import { BrandLoading } from '../components/BrandLoading.js';
import { LandingAssistant } from '../components/LandingAssistant.js';
import { deliveryDateFor, deliveryDateLabel } from '../lib/dates.js';
import { apiRequest } from '../lib/api.js';
import { brandingKey, useMenuBranding } from '../lib/menuBranding.js';
import { intuitivoUnitPriceMinor } from '../lib/orderCart.js';
import { whatsappHref } from '../lib/phone.js';
import { showToast } from '../lib/toast.js';
import { useFormDraft } from '../lib/useFormDraft.js';
import { useOrderFormSettings } from '../lib/useOrderFormSettings.js';
import {
  dishesPayload,
  dishLabel,
  errorMessage,
  formatMoney,
  offeringsForPicking,
  type MenuOffering,
  type OrderSummary,
  type PickedDish,
  type WeeklyMenu,
} from '../lib/operations.js';

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

type Step = 'datos' | 'pedido';

/** Las redes y el WhatsApp de Verdeo, tal como están cargados en el pie de la portada (CMS). */
interface Socials {
  facebookUrl?: string | undefined;
  instagramUrl?: string | undefined;
  whatsapp?: string | undefined;
}

function useSocials(): Socials {
  const [socials, setSocials] = useState<Socials>({});
  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/public/pages/home', { notify: false })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { sections?: Record<string, unknown>[] }).sections
          : [],
      )
      .catch(() => [])
      .then((sections) => {
        if (!active || !Array.isArray(sections)) return;
        const contacto = sections.find((section) => section.type === 'CONTACT') ?? {};
        const texto = (key: string) =>
          typeof contacto[key] === 'string' && contacto[key].trim()
            ? contacto[key].trim()
            : undefined;
        const region = Array.isArray(contacto.regions)
          ? (contacto.regions as { whatsapp?: string }[]).find((item) => item.whatsapp)
          : undefined;
        setSocials({
          ...(texto('facebookUrl') ? { facebookUrl: texto('facebookUrl') } : {}),
          ...(texto('instagramUrl') ? { instagramUrl: texto('instagramUrl') } : {}),
          ...((texto('whatsapp') ?? region?.whatsapp)
            ? { whatsapp: texto('whatsapp') ?? region?.whatsapp }
            : {}),
        });
      });
    return () => {
      active = false;
    };
  }, []);
  return socials;
}

/** En qué paso está quien compra: elegir, completar el envío, listo. */
function Steps({ current }: { current: 'datos' | 'listo' | 'pedido' }) {
  const pasos = [
    { key: 'pedido', label: 'Tu pedido' },
    { key: 'datos', label: 'Envío y confirmación' },
    { key: 'listo', label: 'Listo' },
  ] as const;
  const indice = pasos.findIndex((paso) => paso.key === current);
  return (
    <ol aria-label="Pasos del pedido" className="order-steps">
      {pasos.map((paso, index) => (
        <li
          aria-current={index === indice ? 'step' : undefined}
          className={index === indice ? 'is-current' : index < indice ? 'is-done' : ''}
          key={paso.key}
        >
          <span>{index + 1}</span> {paso.label}
        </li>
      ))}
    </ol>
  );
}

/**
 * El pedido web, en tres pasos.
 *
 * 1. **Tu pedido**: variedad, tamaño, cantidad y, en un Intuitivo, los platos; con lo que hace
 *    falta para decidir (qué trae, cuánto sale con los platos elegidos, cuándo llega).
 * 2. **Envío y confirmación**: los datos para entregarlo y el medio de pago, con el resumen al lado.
 * 3. **Listo**: un representante se comunica para confirmar, el código de seguimiento y las redes.
 *
 * Es un solo formulario con los pasos escondidos, no tres: así el borrador guarda todo junto y volver
 * al paso anterior no borra lo que se escribió.
 */
export function PublicOrderPage() {
  /*
   * La ciudad puede venir elegida desde la portada: los chips de "Dónde entregamos" son la primera
   * decisión que toma quien llega, y volvérsela a preguntar acá la hacía dos veces. Si el enlace no
   * la trae, se elige la primera como siempre.
   */
  const [searchParams] = useSearchParams();
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [createdOrder, setCreatedOrder] = useState<OrderSummary | null>(null);
  const [step, setStep] = useState<Step>('pedido');
  const [offeringId, setOfferingId] = useState('');
  const [sites, setSites] = useState<{ displayName: string; slug: string }[]>([]);
  const [siteSlug, setSiteSlug] = useState(() => searchParams.get('ciudad') ?? '');
  const [selectedDishes, setSelectedDishes] = useState<PickedDish[]>([]);
  const [units, setUnits] = useState(1);
  /*
   * Los métodos de pago configurados en Ajustes.
   *
   * Antes esto era un campo de texto libre y cada quien escribía lo que quería —"transf",
   * "Transferencia", "efvo"—, y después había que conciliarlo a mano. Si la lista no llega, el
   * campo vuelve a ser texto: no se puede dejar a alguien sin poder terminar el pedido porque una
   * consulta falló.
   */
  const [paymentMethods, setPaymentMethods] = useState<{ code: string; displayName: string }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  // A visitor filling this in is not staff: a stray back button or a refresh on mobile costs them
  // the whole order, and there is no dashboard to fall back on.
  const draft = useFormDraft(formRef, 'public-order');
  // Si esta ciudad pide indicaciones alimentarias. Vienen apagadas: se pidió sacarlas.
  const { dietaryInstructionsEnabled } = useOrderFormSettings({ slug: siteSlug });
  const socials = useSocials();

  useEffect(() => {
    void apiRequest('/api/v1/public/payment-methods')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          items: { code: string; displayName: string; sortOrder: number }[];
        };
        setPaymentMethods([...body.items].sort((left, right) => left.sortOrder - right.sortOrder));
      })
      .catch(() => setPaymentMethods([]));
  }, []);

  // The visitor chooses the city; it is never inferred from IP or domain.
  useEffect(() => {
    void apiRequest('/api/v1/public/operating-sites')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          items: { displayName: string; slug: string }[];
        };
        setSites(body.items);
        // Una ciudad del enlace que ya no existe no deja el formulario sin ciudad: cae a la primera.
        setSiteSlug((current) =>
          body.items.some((site) => site.slug === current) ? current : (body.items[0]?.slug ?? ''),
        );
      })
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    void apiRequest(
      `/api/v1/public/menu/current${siteSlug ? `?site=${encodeURIComponent(siteSlug)}` : ''}`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response));
        const loaded = (await response.json()) as WeeklyMenu;
        setMenu(loaded);
        setOfferingId(offeringsForPicking(loaded.offerings)[0]?.id ?? '');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'No pudimos cargar el menú.'),
      )
      .finally(() => setLoading(false));
  }, [siteSlug]);

  const offering = useMemo(
    () => menu?.offerings.find((candidate) => candidate.id === offeringId),
    [menu, offeringId],
  );

  /*
   * El logo de cada menú en su tarjeta: los mismos que la portada y el asistente, leídos de la
   * misma sección. Quien llega desde la landing reconoce el menú por el dibujo antes que por el
   * nombre, y sin el logo el formulario era el único lugar donde no estaba.
   */
  const branding = useMenuBranding();

  /*
   * Variedad y tamaño, elegidos por separado.
   *
   * El menú trae una oferta por cada combinación —cinco variedades por dos tamaños— y el formulario
   * las mostraba las diez como si fueran diez cosas distintas, cuando son cinco elecciones y una
   * segunda de dos. Por dentro sigue habiendo una sola oferta elegida, que es lo que se envía.
   */
  const families = useMemo(() => {
    const firstByFamily = new Map<string, MenuOffering>();
    for (const item of offeringsForPicking(menu?.offerings ?? [])) {
      if (!firstByFamily.has(item.familyName)) firstByFamily.set(item.familyName, item);
    }
    return [...firstByFamily.values()];
  }, [menu]);

  const sizes = useMemo(
    () =>
      [...new Set((menu?.offerings ?? []).map((item) => item.variantName))].sort((left, right) =>
        left.localeCompare(right, 'es-AR', { numeric: true }),
      ),
    [menu],
  );

  function findOffering(familyName: string, variantName: string): MenuOffering | undefined {
    return menu?.offerings.find(
      (candidate) => candidate.familyName === familyName && candidate.variantName === variantName,
    );
  }

  /*
   * Al cambiar de variedad se conserva el tamaño; si esa variedad no lo tiene, se toma el primero
   * que tenga. Los platos de un Intuitivo sólo se vacían si cambia la variedad: cambiar el tamaño
   * de un Intuitivo no cambia qué platos se eligieron.
   */
  function choose(next: MenuOffering | undefined) {
    if (!next) return;
    if (next.familyName !== offering?.familyName) setSelectedDishes([]);
    setOfferingId(next.id);
  }

  function chooseFamily(familyName: string) {
    choose(
      findOffering(familyName, offering?.variantName ?? '') ??
        menu?.offerings.find((candidate) => candidate.familyName === familyName),
    );
  }

  function chooseSize(variantName: string) {
    choose(findOffering(offering?.familyName ?? '', variantName));
  }

  /** Lo que hace falta para pasar del pedido al envío. */
  function orderProblem(): string | null {
    if (!offering) return 'Elegí una variedad.';
    if (!siteSlug) return 'Elegí la ciudad donde querés recibir el pedido.';
    /*
     * Al menos los platos del tamaño, y hasta el máximo de la ciudad. Antes exigía exactamente
     * cinco, y el selector ya dejaba elegir hasta quince.
     */
    if (offering.composable && selectedDishes.length < offering.mealsPerUnit) {
      return `Elegí al menos ${String(offering.mealsPerUnit)} platos para tu Intuitivo.`;
    }
    if (offering.composable && menu && selectedDishes.length > menu.intuitivoMaxDishes) {
      return `Un Intuitivo lleva hasta ${String(menu.intuitivoMaxDishes)} platos.`;
    }
    return null;
  }

  function goTo(next: Step) {
    if (next === 'datos') {
      const problem = orderProblem();
      if (problem) {
        setMessage(problem);
        return;
      }
    }
    setMessage('');
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter en el primer paso no manda el pedido: pasa al siguiente.
    if (step === 'pedido') {
      goTo('datos');
      return;
    }
    setMessage('');
    const problem = orderProblem();
    if (problem) {
      setMessage(problem);
      setStep('pedido');
      return;
    }
    const form = new FormData(event.currentTarget);

    const payload = {
      customer: {
        displayName: formText(form, 'displayName'),
        email: formText(form, 'email') || undefined,
        phone: formText(form, 'phone') || undefined,
      },
      deliveryAddress: formText(form, 'deliveryAddress'),
      ...(formText(form, 'deliveryAddressLine2').trim()
        ? { deliveryAddressLine2: formText(form, 'deliveryAddressLine2').trim() }
        : {}),
      deliveryDate: menu ? deliveryDateFor(menu.cycle.closeAt) : '',
      dietaryInstructions: formText(form, 'dietaryInstructions')
        .split('\n')
        .map((instruction) => instruction.trim())
        .filter(Boolean),
      items: [
        {
          offeringId,
          quantityUnits: units,
          // Los platos sólo viajan con un Intuitivo: sobre una vianda estándar la convertirían en
          // una composición propia.
          ...(offering?.composable ? dishesPayload(selectedDishes) : {}),
        },
      ],
      menuId: menu?.id,
      notes: formText(form, 'notes') || undefined,
      operatingSiteSlug: siteSlug,
      paymentExpectation: formText(form, 'paymentExpectation'),
      source: 'web',
    };

    const response = await apiRequest('/api/v1/public/orders', {
      body: JSON.stringify(payload),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    // The order exists now; keeping its draft would repopulate the form if they came back to
    // place a second one.
    draft.discard();
    setCreatedOrder((await response.json()) as OrderSummary);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) {
    return <BrandLoading message="Cargando el menú…" />;
  }

  const header = (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <Link className="brand" to="/">
        <img
          className="brand-icon"
          src="/brand/verdeo-icon-128.webp"
          alt=""
          width="36"
          height="36"
        />
        verdeo<span>.</span>
      </Link>
      <Link className="button button-secondary" to="/">
        Volver
      </Link>
    </header>
  );

  if (createdOrder) {
    const hayRedes = Boolean(socials.facebookUrl ?? socials.instagramUrl ?? socials.whatsapp);
    return (
      <div className="min-h-screen bg-cream text-ink">
        {header}
        <main className="mx-auto grid w-full max-w-3xl gap-6 px-5 pb-16 pt-6 sm:px-8">
          <Steps current="listo" />
          <section className="rounded-[2rem] border border-forest/10 bg-white p-8 shadow-sm sm:p-12">
            <p className="eyebrow">Pedido recibido</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-forest">
              ¡Gracias, {createdOrder.customer.displayName.split(' ')[0]}!
            </h1>
            <p className="mt-4 leading-7 text-ink-muted">
              Recibimos tu pedido por{' '}
              <strong>{formatMoney(createdOrder.totalMinor, createdOrder.currency)}</strong>. Un
              representante de Verdeo se va a comunicar con vos para confirmarlo y coordinar la
              entrega.
            </p>

            <div className="order-tracking-code">
              <p>Tu código de seguimiento</p>
              <strong>{createdOrder.publicNumber}</strong>
              <div className="flex flex-wrap gap-2">
                <button
                  className="button button-secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(createdOrder.publicNumber)
                      .then(() => showToast('Código copiado.'))
                  }
                  type="button"
                >
                  Copiar código
                </button>
                <Link
                  className="button button-secondary"
                  to={`/seguimiento?pedido=${encodeURIComponent(createdOrder.publicNumber)}`}
                >
                  Seguir mi pedido
                </Link>
              </div>
              <small>
                Guardalo: con el código y el teléfono o el email que usaste podés ver cómo va tu
                pedido.
              </small>
            </div>

            {hayRedes ? (
              <div className="order-socials">
                <p>Seguinos</p>
                <div className="flex flex-wrap gap-2">
                  {socials.instagramUrl ? (
                    <a
                      className="button button-secondary"
                      href={socials.instagramUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <InstagramIcon /> Instagram
                    </a>
                  ) : null}
                  {socials.facebookUrl ? (
                    <a
                      className="button button-secondary"
                      href={socials.facebookUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <FacebookIcon /> Facebook
                    </a>
                  ) : null}
                  {socials.whatsapp ? (
                    <a
                      className="button button-secondary"
                      href={whatsappHref(
                        socials.whatsapp,
                        `Hola! Hice el pedido ${createdOrder.publicNumber}.`,
                      )}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-8">
              <Link className="button button-primary" to="/">
                Volver al inicio
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  /*
   * El precio de una unidad con lo que se eligió: con platos de más que los del tamaño no es el
   * del menú. Es el mismo en la tarjeta de la selección, en el contador de platos y en el total,
   * para que nadie vea un precio y le cobren otro.
   */
  const extraDishes = offering?.composable
    ? Math.max(0, selectedDishes.length - offering.mealsPerUnit)
    : 0;
  const unitPriceMinor = !offering
    ? 0
    : offering.composable && menu
      ? intuitivoUnitPriceMinor({
          baseDishes: offering.mealsPerUnit,
          basePriceMinor: offering.unitPriceMinor,
          dishes: Math.max(selectedDishes.length, offering.mealsPerUnit),
          rule: menu.intuitivoPricing,
        })
      : offering.unitPriceMinor;
  const totalMinor = unitPriceMinor * units;
  const siteName = sites.find((site) => site.slug === siteSlug)?.displayName;

  return (
    <div className="min-h-screen bg-cream text-ink">
      {header}
      <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section>
          <Steps current={step} />
          {/* El nombre del período ("OCTUBRE 3") es interno: al cliente no le dice nada. */}
          <p className="eyebrow mt-6">Menú semanal</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-6xl">
            {step === 'pedido' ? 'Armá tu pedido.' : 'A dónde te lo llevamos.'}
          </h1>
          <p className="mt-4 max-w-lg leading-7 text-ink-muted">
            {step === 'pedido'
              ? 'Cada unidad incluye cinco comidas. Elegí una variedad del menú de la semana, o armá un Intuitivo con los platos que quieras (podés repetir).'
              : 'Completá tus datos para la entrega. Un representante de Verdeo se comunica con vos para confirmar el pedido.'}
          </p>
          {offering ? (
            <article className="mt-8 rounded-3xl bg-forest p-6 text-white">
              <p className="text-sm uppercase tracking-widest text-lime">Tu selección</p>
              <h2 className="mt-3 text-3xl font-semibold">
                {offering.familyName} {offering.variantName}
              </h2>
              {offering.description ? (
                <p className="mt-2 text-white/80">{offering.description}</p>
              ) : null}
              <p className="mt-2 font-semibold text-lime">
                {formatMoney(unitPriceMinor, offering.currency)} por unidad
                {extraDishes > 0 ? (
                  <span className="block text-sm font-normal text-white/80">
                    con {selectedDishes.length} platos ({extraDishes} de más)
                  </span>
                ) : null}
              </p>
              {offering.composable ? (
                selectedDishes.length > 0 ? (
                  <ol className="mt-5 grid gap-2 text-sm text-white/80">
                    {selectedDishes.map((dish, index) => (
                      <li key={`${dishLabel(dish)}-${String(index)}`}>{dishLabel(dish)}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-5 text-sm text-white/80">
                    Elegí tus platos en el formulario: al menos {offering.mealsPerUnit}.
                  </p>
                )
              ) : (
                <ol className="mt-5 grid gap-2 text-sm text-white/80">
                  {offering.dishes.map((dish) => (
                    <li key={dish}>{dish}</li>
                  ))}
                </ol>
              )}
              <dl className="order-facts-public">
                <div>
                  <dt>Cantidad</dt>
                  <dd>
                    {units} unidad{units === 1 ? '' : 'es'}
                  </dd>
                </div>
                {menu ? (
                  <div>
                    <dt>Entrega</dt>
                    <dd>
                      {deliveryDateLabel(menu.cycle.closeAt)}
                      {siteName ? ` · ${siteName}` : ''}
                    </dd>
                  </div>
                ) : null}
                {paymentMethods.length > 0 ? (
                  <div>
                    <dt>Medios de pago</dt>
                    <dd>{paymentMethods.map((method) => method.displayName).join(', ')}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Total</dt>
                  <dd>
                    <strong>{formatMoney(totalMinor, offering.currency)}</strong>
                  </dd>
                </div>
              </dl>
              {step === 'datos' ? (
                <button
                  className="button button-secondary mt-5"
                  onClick={() => goTo('pedido')}
                  type="button"
                >
                  Cambiar el pedido
                </button>
              ) : null}
            </article>
          ) : null}
        </section>

        {menu ? (
          <form
            className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm sm:p-8"
            onSubmit={(event) => void submit(event)}
            ref={formRef}
          >
            {draft.restored ? <DraftNotice onDiscard={draft.dismissNotice} /> : null}

            {/* Paso 1: el pedido. Se esconde en el paso 2 sin desmontarse, para no perder nada. */}
            <div className="form-grid" hidden={step !== 'pedido'}>
              <label className="field field-wide">
                Ciudad
                <select onChange={(event) => setSiteSlug(event.target.value)} value={siteSlug}>
                  <option value="">Elegí tu ciudad</option>
                  {sites.map((site) => (
                    <option key={site.slug} value={site.slug}>
                      {site.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="field field-wide offering-picker">
                <legend>Variedad</legend>
                <div className="offering-picker-grid">
                  {families.map((item) => {
                    const selected = item.familyName === offering?.familyName;
                    const icon = branding.get(brandingKey(item.familyName))?.iconUrl;
                    return (
                      <label
                        className={`offering-card ${selected ? 'is-selected' : ''}`}
                        key={item.familyName}
                      >
                        <input
                          checked={selected}
                          className="sr-only"
                          name="variety"
                          onChange={() => chooseFamily(item.familyName)}
                          type="radio"
                        />
                        {icon ? (
                          <img
                            alt=""
                            className="offering-card-icon"
                            height="56"
                            loading="lazy"
                            src={icon}
                            width="56"
                          />
                        ) : null}
                        <span className="offering-card-text">
                          <span className="offering-card-name">{item.familyName}</span>
                          {item.composable ? (
                            <span className="offering-card-note">Armás tus cinco platos</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {/*
               * El precio va con el tamaño y no en cada tarjeta: depende del tamaño, no de la
               * variedad (ADR-030), y repetirlo cinco veces no dice nada que no diga una.
               */}
              <fieldset className="field field-wide size-picker">
                <legend>Tamaño</legend>
                <div className="size-picker-options">
                  {sizes.map((size) => {
                    const sized = findOffering(offering?.familyName ?? '', size);
                    const selected = offering?.variantName === size;
                    return (
                      <label
                        className={`size-option ${selected ? 'is-selected' : ''} ${sized ? '' : 'is-unavailable'}`}
                        key={size}
                      >
                        <input
                          checked={selected}
                          className="sr-only"
                          disabled={!sized}
                          name="size"
                          onChange={() => chooseSize(size)}
                          type="radio"
                        />
                        <span className="size-option-name">{size}</span>
                        <span className="size-option-price">
                          {sized
                            ? formatMoney(sized.unitPriceMinor, sized.currency)
                            : 'No disponible'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="field">
                Cantidad de unidades
                <input
                  min="1"
                  name="quantityUnits"
                  onChange={(event) => setUnits(Math.max(1, Number(event.target.value) || 1))}
                  type="number"
                  value={units}
                />
              </label>
              <div className="field">
                Fecha de entrega
                <p className="field-static">{deliveryDateLabel(menu.cycle.closeAt)}</p>
              </div>
              {offering?.composable ? (
                <div className="field field-wide">
                  Elegí tus platos
                  <IntuitivoDishPicker
                    maxDishes={menu.intuitivoMaxDishes}
                    minDishes={offering.mealsPerUnit}
                    offerings={menu.offerings}
                    onChange={setSelectedDishes}
                    priceLabel={formatMoney(unitPriceMinor, offering.currency)}
                    selected={selectedDishes}
                  />
                </div>
              ) : null}
            </div>

            {/* Paso 2: los datos de envío y el pago. */}
            <div className="form-grid" hidden={step !== 'datos'}>
              <label className="field field-wide">
                Nombre y apellido
                <input name="displayName" autoComplete="name" required={step === 'datos'} />
              </label>
              <label className="field">
                Email
                <input name="email" type="email" autoComplete="email" />
              </label>
              <label className="field">
                Teléfono (WhatsApp)
                <input name="phone" autoComplete="tel" inputMode="tel" />
              </label>
              <label className="field field-wide">
                Dirección de entrega
                <input
                  name="deliveryAddress"
                  autoComplete="address-line1"
                  minLength={4}
                  placeholder="Calle y altura"
                  required={step === 'datos'}
                />
              </label>
              <label className="field field-wide">
                Piso, depto, timbre y barrio (opcional)
                <input
                  name="deliveryAddressLine2"
                  autoComplete="address-line2"
                  maxLength={300}
                  placeholder="Ej. 3° B, timbre 2, barrio Centro"
                />
              </label>
              <label className="field field-wide">
                Medio de pago
                {paymentMethods.length > 0 ? (
                  <select name="paymentExpectation" required={step === 'datos'}>
                    {paymentMethods.map((method) => (
                      <option key={method.code} value={method.displayName}>
                        {method.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="paymentExpectation"
                    placeholder="Ej. transferencia o efectivo"
                    required={step === 'datos'}
                  />
                )}
              </label>
              {dietaryInstructionsEnabled ? (
                <label className="field field-wide">
                  Indicaciones alimentarias
                  <textarea name="dietaryInstructions" rows={2} placeholder="Ej. sin cebolla" />
                </label>
              ) : null}
              <label className="field field-wide">
                Notas para la entrega
                <textarea name="notes" placeholder="Ej. timbre roto, dejar en portería" rows={2} />
              </label>
            </div>

            {message ? (
              <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800" role="alert">
                {message}
              </p>
            ) : null}
            {/* El total y el botón, juntos y a mano: en el teléfono el precio quedaba arriba de
                todo, fuera de la pantalla, justo cuando hay que decidir. */}
            <div className="form-actions form-actions-sticky mt-6">
              {offering ? (
                <p className="form-actions-total">
                  Total <strong>{formatMoney(totalMinor, offering.currency)}</strong>
                </p>
              ) : null}
              {step === 'pedido' ? (
                <button
                  className="button button-primary button-large"
                  onClick={() => goTo('datos')}
                  type="button"
                >
                  Seguir
                </button>
              ) : (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => goTo('pedido')}
                    type="button"
                  >
                    Volver
                  </button>
                  <button className="button button-primary button-large" type="submit">
                    Confirmar pedido
                  </button>
                </>
              )}
            </div>
          </form>
        ) : (
          <section className="rounded-3xl bg-white p-8">
            <p>{message || 'Todavía no hay un menú publicado.'}</p>
          </section>
        )}
      </main>
      {/* El asistente también acá: quien duda mientras arma el pedido pregunta sin irse. */}
      <LandingAssistant />
    </div>
  );
}
