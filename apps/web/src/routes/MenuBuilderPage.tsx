import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface OfferingDraft {
  composable: boolean;
  dishes: string;
  familyName: string;
  sizeName: string;
}

interface SizePriceDraft {
  sizeName: string;
  unitPrice: string;
}

const emptyOffering = (): OfferingDraft => ({
  composable: false,
  dishes: '',
  familyName: '',
  sizeName: '',
});

// The price belongs to the size, so the week starts from its price list and the varieties hang off it.
const defaultSizePrices = (): SizePriceDraft[] => [
  { sizeName: '250', unitPrice: '' },
  { sizeName: '400', unitPrice: '' },
];

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** "Configurar la semana": create the master menu for a sales cycle. Publishing and distributing
 * an existing menu happens in "Ver menús" instead. */
export function MenuBuilderPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [offerings, setOfferings] = useState<OfferingDraft[]>([emptyOffering()]);
  const [sizePrices, setSizePrices] = useState<SizePriceDraft[]>(defaultSizePrices);
  const [message, setMessage] = useState('');

  async function createMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsedPrices = sizePrices
      .filter((price) => price.sizeName.trim() && price.unitPrice.trim())
      .map((price) => ({
        currency: 'ARS',
        mealsPerUnit: 5,
        sizeName: price.sizeName.trim(),
        unitPriceMinor: Math.round(Number(price.unitPrice) * 100),
      }));
    if (parsedPrices.length === 0) {
      setMessage('Definí al menos un tamaño con su precio.');
      return;
    }

    const parsedOfferings = offerings.map((offering) => ({
      composable: offering.composable,
      dishes: offering.dishes
        .split('\n')
        .map((dish) => dish.trim())
        .filter(Boolean),
      familyName: offering.familyName,
      sizeName: offering.sizeName.trim(),
    }));
    if (parsedOfferings.some((offering) => offering.dishes.length !== 5)) {
      setMessage('Cada opción del menú necesita exactamente cinco platos.');
      return;
    }
    const pricedSizes = new Set(parsedPrices.map((price) => price.sizeName));
    if (parsedOfferings.some((offering) => !pricedSizes.has(offering.sizeName))) {
      setMessage('Cada variedad debe usar un tamaño que tenga precio definido.');
      return;
    }

    try {
      const response = await apiRequest('/api/v1/menus', {
        body: JSON.stringify({
          alias: formText(form, 'alias'),
          closeAt: new Date(formText(form, 'closeAt')).toISOString(),
          offerings: parsedOfferings,
          openAt: new Date(formText(form, 'openAt')).toISOString(),
          partialKitchenCutoffAt: new Date(formText(form, 'partialKitchenCutoffAt')).toISOString(),
          prices: parsedPrices,
        }),
        method: 'POST',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setOfferings([emptyOffering()]);
      setSizePrices(defaultSizePrices());
      event.currentTarget.reset();
      setMessage('Menú guardado como borrador. Publicalo desde "Ver menús".');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos crear el menú.');
    }
  }

  if (failed) return <DashboardFailed label="el menú" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('production.generate')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Configurar la semana</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para crear menús.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Menús</p>
            <h1 className="text-2xl font-semibold text-forest">Configurar la semana</h1>
          </div>
          <Link className="button button-secondary" to="/app/menus">
            Ver menús
          </Link>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        <form
          className="operation-card mt-6 max-w-2xl"
          onSubmit={(event) => void createMenu(event)}
        >
          <div className="form-grid">
            <label className="field field-wide">
              Alias de la semana
              <input name="alias" placeholder="Ej. Semana 34 · 24 al 28 de agosto" required />
            </label>
            <label className="field">
              Apertura
              <input name="openAt" required type="datetime-local" />
            </label>
            <label className="field">
              Parcial de cocina
              <input name="partialKitchenCutoffAt" required type="datetime-local" />
            </label>
            <label className="field">
              Cierre
              <input name="closeAt" required type="datetime-local" />
            </label>
          </div>

          <fieldset className="mt-5 rounded-2xl border border-forest/10 p-4">
            <legend className="px-2 text-sm font-bold text-forest">Precios por tamaño</legend>
            <p className="mb-3 text-sm text-ink-muted">
              El precio depende del tamaño, no de la variedad: todas las variedades de un mismo
              tamaño valen igual esta semana.
            </p>
            <div className="form-grid">
              {sizePrices.map((price, index) => (
                <label className="field" key={index}>
                  Precio de {price.sizeName || `tamaño ${index + 1}`} en ARS
                  <input
                    min="0"
                    onChange={(event) =>
                      setSizePrices((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, unitPrice: event.target.value } : item,
                        ),
                      )
                    }
                    step="0.01"
                    type="number"
                    value={price.unitPrice}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4">
            {offerings.map((offering, index) => (
              <fieldset className="rounded-2xl border border-forest/10 p-4" key={index}>
                <legend className="px-2 text-sm font-bold text-forest">Opción {index + 1}</legend>
                <div className="form-grid">
                  <label className="field">
                    Variedad
                    <input
                      onChange={(event) =>
                        setOfferings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, familyName: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required
                      value={offering.familyName}
                    />
                  </label>
                  <label className="field">
                    Tamaño
                    <select
                      onChange={(event) =>
                        setOfferings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, sizeName: event.target.value } : item,
                          ),
                        )
                      }
                      required
                      value={offering.sizeName}
                    >
                      <option value="">Elegí un tamaño</option>
                      {sizePrices
                        .filter((price) => price.sizeName.trim())
                        .map((price) => (
                          <option key={price.sizeName} value={price.sizeName}>
                            {price.sizeName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    Composición
                    <select
                      onChange={(event) =>
                        setOfferings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, composable: event.target.value === 'composable' }
                              : item,
                          ),
                        )
                      }
                      value={offering.composable ? 'composable' : 'fixed'}
                    >
                      <option value="fixed">Fija (cinco platos definidos)</option>
                      <option value="composable">Elegida por el cliente</option>
                    </select>
                  </label>
                  <label className="field field-wide">
                    Cinco platos, uno por línea
                    <textarea
                      onChange={(event) =>
                        setOfferings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, dishes: event.target.value } : item,
                          ),
                        )
                      }
                      required
                      rows={5}
                      value={offering.dishes}
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="button button-secondary"
              onClick={() => setOfferings((current) => [...current, emptyOffering()])}
              type="button"
            >
              Agregar opción
            </button>
            {offerings.length > 1 ? (
              <button
                className="button button-secondary"
                onClick={() => setOfferings((current) => current.slice(0, -1))}
                type="button"
              >
                Quitar última
              </button>
            ) : null}
            <button className="button button-primary" type="submit">
              Guardar borrador
            </button>
          </div>
        </form>
      </section>
    </DashboardShell>
  );
}
