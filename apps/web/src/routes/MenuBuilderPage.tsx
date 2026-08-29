import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface OfferingDraft {
  description: string;
  dishes: string;
  familyName: string;
}

interface SizePriceDraft {
  sizeName: string;
  unitPrice: string;
}

const emptyOffering = (): OfferingDraft => ({
  description: '',
  dishes: '',
  familyName: '',
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

function isoToLocalInput(iso: string): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time, not the UTC ISO string.
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Reconstructs the form's shape (one row per variety, one row per size) from a menu's flat,
// one-row-per-(variety,size) offering list — the inverse of the flatMap createMenu/updateMenu send.
function decomposeMenu(menu: WeeklyMenu): {
  includeIntuitivo: boolean;
  offerings: OfferingDraft[];
  sizePrices: SizePriceDraft[];
} {
  const fixed = menu.offerings.filter((offering) => !offering.composable);
  const includeIntuitivo = menu.offerings.some((offering) => offering.composable);

  const byFamily = new Map<string, (typeof fixed)[number][]>();
  for (const offering of fixed) {
    const rows = byFamily.get(offering.familyName) ?? [];
    rows.push(offering);
    byFamily.set(offering.familyName, rows);
  }
  const offerings = [...byFamily.entries()].map(([familyName, rows]) => ({
    description: rows[0]?.description ?? '',
    dishes: rows[0]?.dishes.join('\n') ?? '',
    familyName,
  }));

  const bySize = new Map<string, (typeof fixed)[number][]>();
  for (const offering of fixed) {
    const rows = bySize.get(offering.sizeName) ?? [];
    rows.push(offering);
    bySize.set(offering.sizeName, rows);
  }
  const sizePrices = [...bySize.entries()].map(([sizeName, rows]) => {
    // A per-variety price override shouldn't be mistaken for the size's own price — prefer a row
    // that isn't overridden; every offering of a size overriding it in different ways is the one
    // case this can't recover exactly, same limitation the create form already has.
    const reference = rows.find((row) => !row.priceOverridden) ?? rows[0];
    return { sizeName, unitPrice: reference ? String(reference.unitPriceMinor / 100) : '' };
  });

  return {
    includeIntuitivo,
    offerings: offerings.length > 0 ? offerings : [emptyOffering()],
    sizePrices: sizePrices.length > 0 ? sizePrices : defaultSizePrices(),
  };
}

/** "Configurar la semana" doubles as the editor: with no `:id` it creates a new master menu: with
 * one (reached from "Ver menús" → Editar) it loads that menu — master or regional — and PATCHes it
 * instead. Same form either way; only the submit target and the initial values differ. */
export function MenuBuilderPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const navigate = useNavigate();
  const { id: editingMenuId } = useParams<{ id?: string }>();
  const [offerings, setOfferings] = useState<OfferingDraft[]>([emptyOffering()]);
  const [sizePrices, setSizePrices] = useState<SizePriceDraft[]>(defaultSizePrices);
  const [message, setMessage] = useState('');
  const [includeIntuitivo, setIncludeIntuitivo] = useState(true);
  const [editingMenu, setEditingMenu] = useState<WeeklyMenu | null>(null);
  const [loading, setLoading] = useState(Boolean(editingMenuId));
  const [publishing, setPublishing] = useState(false);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // A validation error or a caught failure sets `message`, but on a long form the message renders
  // above the fold — easy to miss while scrolled down filling in the last variety, which reads as
  // "no pasó nada" even though it did. Force it into view every time it changes.
  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [message]);

  useEffect(() => {
    if (!editingMenuId) return;
    let active = true;
    void apiRequest('/api/v1/menus')
      .then(async (response) => {
        if (!response.ok || !active) return;
        const found = ((await response.json()) as { items: WeeklyMenu[] }).items.find(
          (menu) => menu.id === editingMenuId,
        );
        if (!active) return;
        if (!found) {
          setMessage('No encontramos ese menú.');
          setLoading(false);
          return;
        }
        setEditingMenu(found);
        const decomposed = decomposeMenu(found);
        setOfferings(decomposed.offerings);
        setSizePrices(decomposed.sizePrices);
        setIncludeIntuitivo(decomposed.includeIntuitivo);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setMessage('No pudimos cargar el menú.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [editingMenuId]);

  function toIsoOrNull(value: string): string | null {
    if (!value.trim()) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Shared by both actions ("Guardar borrador" and "Guardar y publicar") — returns null and sets
  // the validation message itself when the form isn't ready to submit, so a caller just checks for
  // null and stops.
  function buildPayload(form: FormData) {
    // Parsed and validated up front, before anything else — new Date(x).toISOString() throws on
    // an empty/invalid string, and letting that happen while building the payload (rather than
    // inside a try/catch) used to crash the handler silently: no error message, no redirect,
    // nothing visibly happened.
    const openAt = toIsoOrNull(formText(form, 'openAt'));
    const partialKitchenCutoffAt = toIsoOrNull(formText(form, 'partialKitchenCutoffAt'));
    const closeAt = toIsoOrNull(formText(form, 'closeAt'));
    if (!openAt || !partialKitchenCutoffAt || !closeAt) {
      setMessage('Completá apertura, parcial de cocina y cierre con fechas válidas.');
      return null;
    }

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
      return null;
    }

    const varieties = offerings.map((offering) => ({
      composable: false,
      description: offering.description.trim() ? offering.description.trim() : null,
      dishes: offering.dishes
        .split('\n')
        .map((dish) => dish.trim())
        .filter(Boolean),
      familyName: offering.familyName,
    }));
    if (varieties.some((offering) => offering.dishes.length !== 5)) {
      setMessage('Cada variedad necesita exactamente cinco platos.');
      return null;
    }
    if (!formText(form, 'alias').trim()) {
      setMessage('Ponele un alias a la semana.');
      return null;
    }
    // Size and variety are unrelated axes for a *fixed* offering, so one row per (variety, size)
    // pair is generated here instead of asked for per option. Intuitivo is different — it's priced
    // by whatever size the customer actually picks at order time (via weeklyMenuPrices, not its
    // own offering row), so the API allows at most one composable offering per menu, period. Push
    // it after the flatMap, as a single row, or the request 400s with "Solo puede haber un menú
    // personalizado (Intuitivo) por semana" — exactly the silent-looking failure this was.
    const parsedOfferings = varieties.flatMap((variety) =>
      parsedPrices.map((price) => ({ ...variety, sizeName: price.sizeName })),
    );
    if (includeIntuitivo) {
      parsedOfferings.push({
        composable: true,
        description: null,
        dishes: [],
        familyName: 'Intuitivo',
        sizeName: parsedPrices[0]?.sizeName ?? '',
      });
    }

    return {
      alias: formText(form, 'alias'),
      closeAt,
      offerings: parsedOfferings,
      openAt,
      partialKitchenCutoffAt,
      prices: parsedPrices,
    };
  }

  async function saveMenu(form: FormData, options: { alsoPublish: boolean }) {
    const payload = buildPayload(form);
    if (!payload) return;

    try {
      const response = editingMenu
        ? await apiRequest(`/api/v1/menus/${editingMenu.id}`, {
            body: JSON.stringify(payload),
            method: 'PATCH',
          })
        : await apiRequest('/api/v1/menus', { body: JSON.stringify(payload), method: 'POST' });
      if (!response.ok) throw new Error(await errorMessage(response));

      if (editingMenu) {
        showToast('Cambios guardados.');
        return;
      }

      const created = (await response.json()) as WeeklyMenu;
      if (options.alsoPublish) {
        const publishResponse = await apiRequest(`/api/v1/menus/${created.id}/publish`, {
          method: 'POST',
        });
        if (!publishResponse.ok) {
          // The draft did save — say so plainly instead of only reporting the publish failure,
          // so a retry doesn't look like it needs to redo the whole form.
          throw new Error(
            `El borrador se guardó, pero no pudimos publicarlo: ${await errorMessage(publishResponse)} Podés publicarlo desde "Ver menús".`,
          );
        }
      }

      // Redirect to "Ver menús" instead of just clearing the form in place — on a long form, an
      // inline message above the fold goes unseen while every field blanks out, which reads as
      // "perdí lo que cargué" even though the draft did save. Landing on the list with the new
      // menu visible there is confirmation nobody can miss; the toast survives the navigation
      // (it's a module-level store, not this page's state) so it still shows up on arrival.
      showToast(
        options.alsoPublish
          ? `Menú "${payload.alias}" guardado y publicado.`
          : `Menú "${payload.alias}" guardado como borrador.`,
      );
      await navigate('/app/menus');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar el menú.');
    }
  }

  async function submitMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveMenu(new FormData(event.currentTarget), { alsoPublish: false });
  }

  async function saveAndPublish(formElement: HTMLFormElement) {
    setPublishing(true);
    try {
      await saveMenu(new FormData(formElement), { alsoPublish: true });
    } finally {
      setPublishing(false);
    }
  }

  if (failed) return <DashboardFailed label="el menú" />;
  if (!profile) return <DashboardLoading />;
  if (loading) return <DashboardLoading />;

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
            <h1 className="text-2xl font-semibold text-forest">
              {editingMenu
                ? `Editar ${editingMenu.cycle.alias}${editingMenu.operatingSiteName ? ` · ${editingMenu.operatingSiteName}` : ''}`
                : 'Configurar la semana'}
            </h1>
          </div>
          <Link className="button button-secondary" to="/app/menus">
            Ver menús
          </Link>
        </header>

        {message ? (
          <p
            className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest"
            ref={messageRef}
            role="status"
          >
            {message}
          </p>
        ) : null}

        <form
          className="operation-card mt-6 max-w-2xl"
          ref={formRef}
          onSubmit={(event) => void submitMenu(event)}
        >
          <div className="form-grid">
            <label className="field field-wide">
              Alias de la semana
              <input
                defaultValue={editingMenu?.cycle.alias}
                name="alias"
                placeholder="Ej. Semana 34 · 24 al 28 de agosto"
                required
              />
            </label>
            <label className="field">
              Apertura
              <input
                defaultValue={editingMenu ? isoToLocalInput(editingMenu.cycle.openAt) : undefined}
                name="openAt"
                required
                type="datetime-local"
              />
            </label>
            <label className="field">
              Parcial de cocina
              <input
                defaultValue={
                  editingMenu
                    ? isoToLocalInput(editingMenu.cycle.partialKitchenCutoffAt)
                    : undefined
                }
                name="partialKitchenCutoffAt"
                required
                type="datetime-local"
              />
            </label>
            <label className="field">
              Cierre
              <input
                defaultValue={editingMenu ? isoToLocalInput(editingMenu.cycle.closeAt) : undefined}
                name="closeAt"
                required
                type="datetime-local"
              />
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
                <legend className="px-2 text-sm font-bold text-forest">Variedad {index + 1}</legend>
                <p className="mb-3 text-sm text-ink-muted">
                  Se carga una vez: sale disponible en todos los tamaños definidos arriba.
                </p>
                <div className="form-grid">
                  <label className="field field-wide">
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
                  <label className="field field-wide">
                    Descripción (opcional, se muestra al cliente)
                    <textarea
                      onChange={(event) =>
                        setOfferings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        )
                      }
                      rows={2}
                      value={offering.description}
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>

          <fieldset className="mt-5 rounded-2xl border border-forest/10 p-4">
            <legend className="px-2 text-sm font-bold text-forest">Menú personalizado</legend>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                checked={includeIntuitivo}
                onChange={(event) => setIncludeIntuitivo(event.target.checked)}
                type="checkbox"
              />
              Incluir Intuitivo esta semana (el cliente elige cinco platos del universo publicado
              para su tamaño; el nombre y la existencia de esta variedad no se editan acá). Qué
              operaciones lo ofrecen se decide por ciudad en{' '}
              <Link className="underline" to="/app/ajustes/menu">
                Ajustes → Menú personalizado
              </Link>
              .
            </label>
          </fieldset>

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
            <button className="button button-primary" disabled={publishing} type="submit">
              {editingMenu ? 'Guardar cambios' : 'Guardar borrador'}
            </button>
            {!editingMenu ? (
              <button
                className="button button-primary"
                disabled={publishing}
                onClick={() => {
                  if (formRef.current) void saveAndPublish(formRef.current);
                }}
                type="button"
              >
                {publishing ? 'Publicando…' : 'Guardar y publicar'}
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </DashboardShell>
  );
}
