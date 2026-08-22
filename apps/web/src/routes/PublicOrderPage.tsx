import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import {
  errorMessage,
  formatMoney,
  type OrderSummary,
  type WeeklyMenu,
} from '../lib/operations.js';

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

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
    void apiRequest('/api/v1/public/menu/current')
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response));
        const loaded = (await response.json()) as WeeklyMenu;
        setMenu(loaded);
        setOfferingId(loaded.offerings[0]?.id ?? '');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'No pudimos cargar el menú.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const offering = useMemo(
    () => menu?.offerings.find((candidate) => candidate.id === offeringId),
    [menu, offeringId],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const form = new FormData(event.currentTarget);
    const customDishes = formText(form, 'customDishes')
      .split('\n')
      .map((dish) => dish.trim())
      .filter(Boolean);
    if (customDishes.length > 0 && customDishes.length !== 5) {
      setMessage('Para personalizar, elegí exactamente cinco platos (uno por línea).');
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
      deliveryDate: formText(form, 'deliveryDate'),
      dietaryInstructions: formText(form, 'dietaryInstructions')
        .split('\n')
        .map((instruction) => instruction.trim())
        .filter(Boolean),
      items: [
        {
          offeringId,
          quantityUnits: Number(form.get('quantityUnits')),
          ...(customDishes.length === 5 ? { selectedDishNames: customDishes } : {}),
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
    setCreatedOrder((await response.json()) as OrderSummary);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream text-forest">
        Cargando menú…
      </main>
    );
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
            El equipo de Verdeo coordinará la disponibilidad y la entrega.
          </p>
          <Link className="button button-primary mt-8" to="/">
            Volver al inicio
          </Link>
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
          >
            <div className="form-grid">
              <label className="field field-wide">
                Variedad y tamaño
                <select
                  value={offeringId}
                  onChange={(event) => setOfferingId(event.target.value)}
                  required
                >
                  {menu.offerings.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.familyName} {item.variantName} ·{' '}
                      {formatMoney(item.unitPriceMinor, item.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Cantidad de unidades
                <input name="quantityUnits" type="number" min="1" defaultValue="1" required />
              </label>
              <label className="field">
                Fecha de entrega
                <input name="deliveryDate" type="date" defaultValue={tomorrow()} required />
              </label>
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
                Pago esperado
                <input
                  name="paymentExpectation"
                  placeholder="Ej. transferencia o efectivo"
                  required
                />
              </label>
              <label className="field field-wide">
                Personalizar: cinco platos, uno por línea
                <textarea name="customDishes" rows={5} placeholder={offering?.dishes.join('\n')} />
              </label>
              <label className="field field-wide">
                Indicaciones alimentarias
                <textarea name="dietaryInstructions" rows={2} placeholder="Ej. sin cebolla" />
              </label>
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
