import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { DraftNotice } from '../components/DraftNotice.js';
import { IntuitivoDishPicker } from '../components/IntuitivoDishPicker.js';
import { BrandLoading } from '../components/BrandLoading.js';
import { deliveryDateFor, deliveryDateLabel } from '../lib/dates.js';
import { apiRequest } from '../lib/api.js';
import { useFormDraft } from '../lib/useFormDraft.js';
import { useOrderFormSettings } from '../lib/useOrderFormSettings.js';
import {
  errorMessage,
  formatMoney,
  offeringsForPicking,
  type MenuOffering,
  type OrderSummary,
  type WeeklyMenu,
} from '../lib/operations.js';

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function PublicOrderPage() {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [createdOrder, setCreatedOrder] = useState<OrderSummary | null>(null);
  const [offeringId, setOfferingId] = useState('');
  const [sites, setSites] = useState<{ displayName: string; slug: string }[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const [selectedDishes, setSelectedDishes] = useState<string[]>([]);
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
        setSiteSlug((current) => current || (body.items[0]?.slug ?? ''));
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
   * Variedad y tamaño, elegidos por separado.
   *
   * El menú trae una oferta por cada combinación —cinco variedades por dos tamaños— y el formulario
   * las mostraba las diez como si fueran diez cosas distintas, cuando son cinco elecciones y una
   * segunda de dos. Ahora son cinco tarjetas y un selector de tamaño; por dentro sigue habiendo una
   * sola oferta elegida, que es lo que se envía, así que la API no se entera del cambio.
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
   * de un Intuitivo no cambia qué platos se eligieron, y borrarlos obligaba a elegirlos de nuevo.
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const form = new FormData(event.currentTarget);
    if (offering?.composable && selectedDishes.length !== 5) {
      setMessage('Elegí exactamente cinco platos para tu Intuitivo.');
      return;
    }

    if (!siteSlug) {
      setMessage('Elegí la ciudad donde querés recibir el pedido.');
      return;
    }

    const payload = {
      customer: {
        displayName: formText(form, 'displayName'),
        email: formText(form, 'email') || undefined,
        phone: formText(form, 'phone') || undefined,
      },
      deliveryAddress: formText(form, 'deliveryAddress'),
      deliveryDate: menu ? deliveryDateFor(menu.cycle.closeAt) : '',
      dietaryInstructions: formText(form, 'dietaryInstructions')
        .split('\n')
        .map((instruction) => instruction.trim())
        .filter(Boolean),
      items: [
        {
          offeringId,
          quantityUnits: Number(form.get('quantityUnits')),
          ...(selectedDishes.length === 5 ? { selectedDishNames: selectedDishes } : {}),
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

  if (createdOrder) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-5 py-12">
        <section className="w-full max-w-xl rounded-[2rem] border border-forest/10 bg-white p-8 shadow-sm sm:p-12">
          <p className="eyebrow">Pedido confirmado</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-forest">
            {createdOrder.publicNumber}
          </h1>
          <p className="mt-4 leading-7 text-ink-muted">
            Recibimos tu pedido por {formatMoney(createdOrder.totalMinor, createdOrder.currency)}.
            El equipo de Verdeo coordinará la disponibilidad y la entrega. Guardá el número de
            pedido: podés consultar su estado en cualquier momento desde &quot;Seguir mi
            pedido&quot;.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button button-primary" to="/">
              Volver al inicio
            </Link>
            <Link className="button button-secondary" to="/seguimiento">
              Seguir mi pedido
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="brand" to="/">
          <img className="brand-icon" src="/brand/verdeo-icon.png" alt="" width="36" height="36" />
          verdeo<span>.</span>
        </Link>
        <Link className="button button-secondary" to="/">
          Volver
        </Link>
      </header>
      <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section>
          <p className="eyebrow">{menu?.cycle.alias ?? 'Menú semanal'}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-6xl">
            Armá tu pedido.
          </h1>
          <p className="mt-4 max-w-lg leading-7 text-ink-muted">
            Cada unidad incluye cinco comidas. Podés repetir platos al armar una opción Intuitivo.
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
                {formatMoney(offering.unitPriceMinor, offering.currency)}
              </p>
              <ol className="mt-5 grid gap-2 text-sm text-white/80">
                {offering.dishes.map((dish) => (
                  <li key={dish}>{dish}</li>
                ))}
              </ol>
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
            <div className="form-grid">
              <fieldset className="field field-wide offering-picker">
                <legend>Variedad</legend>
                <div className="offering-picker-grid">
                  {families.map((item) => {
                    const selected = item.familyName === offering?.familyName;
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
                        <span className="offering-card-name">{item.familyName}</span>
                        {item.composable ? (
                          <span className="offering-card-note">Armás tus cinco platos</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {/*
               * El precio va con el tamaño y no en cada tarjeta: depende del tamaño, no de la
               * variedad (ADR-030), y repetirlo cinco veces no dice nada que no diga una. Se toma de
               * la variedad elegida, así que un precio especial de una variedad se ve igual.
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
                <input name="quantityUnits" type="number" min="1" defaultValue="1" required />
              </label>
              <div className="field">
                Fecha de entrega
                <p className="field-static">{menu ? deliveryDateLabel(menu.cycle.closeAt) : ''}</p>
              </div>
              <label className="field field-wide">
                Nombre y apellido
                <input name="displayName" autoComplete="name" required />
              </label>
              <label className="field">
                Email
                <input name="email" type="email" autoComplete="email" />
              </label>
              <label className="field">
                Teléfono
                <input name="phone" autoComplete="tel" />
              </label>
              <label className="field">
                Ciudad
                <select
                  onChange={(event) => setSiteSlug(event.target.value)}
                  required
                  value={siteSlug}
                >
                  <option value="">Elegí tu ciudad</option>
                  {sites.map((site) => (
                    <option key={site.slug} value={site.slug}>
                      {site.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field-wide">
                Dirección de entrega
                <input
                  name="deliveryAddress"
                  autoComplete="street-address"
                  minLength={4}
                  required
                />
              </label>
              <label className="field field-wide">
                Medio de pago
                {paymentMethods.length > 0 ? (
                  <select name="paymentExpectation" required>
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
                    required
                  />
                )}
              </label>
              {offering?.composable ? (
                <div className="field field-wide">
                  Elegí tus cinco platos
                  <IntuitivoDishPicker
                    offerings={menu.offerings}
                    onChange={setSelectedDishes}
                    selected={selectedDishes}
                  />
                </div>
              ) : null}
              {dietaryInstructionsEnabled ? (
                <label className="field field-wide">
                  Indicaciones alimentarias
                  <textarea name="dietaryInstructions" rows={2} placeholder="Ej. sin cebolla" />
                </label>
              ) : null}
              <label className="field field-wide">
                Notas
                <textarea name="notes" rows={2} />
              </label>
            </div>
            {message ? (
              <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800" role="alert">
                {message}
              </p>
            ) : null}
            <button className="button button-primary button-large mt-6 w-full" type="submit">
              Confirmar pedido
            </button>
          </form>
        ) : (
          <section className="rounded-3xl bg-white p-8">
            <p>{message || 'Todavía no hay un menú publicado.'}</p>
          </section>
        )}
      </main>
    </div>
  );
}
