import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { errorMessage, type PickedDish, type WeeklyMenu } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { IntuitivoDishPicker } from './IntuitivoDishPicker.js';

/** Hasta cuántos meses atrás se busca el período (el servidor tiene el mismo tope). */
const MONTHS_BACK = 4;

/**
 * Cargar a mano un Intuitivo de un período anterior al stock (2026-10-27).
 *
 * Para lo que se cocinó y quedó sin pasar por un pedido cancelado. Se usa poco, por eso va plegado
 * al pie del stock: se elige el período (hasta cuatro meses atrás), la ciudad, el tamaño y los
 * platos de su menú, se le pone un nombre y queda como stock de períodos anteriores.
 */
export function PastIntuitivoForm({
  onSaved,
  sites,
}: {
  onSaved: () => void;
  sites: readonly { displayName: string; id: string }[];
}) {
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [siteId, setSiteId] = useState(() => storedOperatingSiteId() ?? '');
  const [variantName, setVariantName] = useState('');
  const [dishes, setDishes] = useState<PickedDish[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void apiRequest('/api/v1/menus', { notify: false }).then(async (response) => {
      if (response.ok) setMenus(((await response.json()) as { items: WeeklyMenu[] }).items);
    });
  }, []);

  const site = siteId || sites[0]?.id || '';

  // Un período por fila: los que ya cerraron, de los últimos cuatro meses, el más nuevo primero.
  const cycles = useMemo(() => {
    const limit = new Date();
    limit.setMonth(limit.getMonth() - MONTHS_BACK);
    const now = Date.now();
    const byId = new Map<string, WeeklyMenu['cycle']>();
    for (const menu of menus) {
      const opened = new Date(menu.cycle.openAt);
      if (opened >= limit && new Date(menu.cycle.closeAt).getTime() < now)
        byId.set(menu.cycle.id, menu.cycle);
    }
    return [...byId.values()].sort((left, right) => right.openAt.localeCompare(left.openAt));
  }, [menus]);

  // El menú de ese período en la ciudad elegida; si la ciudad no tenía copia, la semana general.
  const menu = useMemo(() => {
    const rows = menus.filter((row) => row.cycle.id === cycleId);
    return (
      rows.find((row) => row.operatingSiteId === site) ??
      rows.find((row) => row.operatingSiteId === null) ??
      rows[0]
    );
  }, [cycleId, menus, site]);

  const sizes = menu?.offerings.filter((offering) => offering.composable) ?? [];
  const size = sizes.find((offering) => offering.variantName === variantName) ?? sizes[0];

  function reset() {
    setDishes([]);
    setName('');
    setQuantity(1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!menu || !size) return;
    setMessage('');
    if (dishes.length < size.mealsPerUnit) {
      setMessage(`Elegí al menos ${String(size.mealsPerUnit)} platos.`);
      return;
    }
    // De qué día es cada plato: su lugar en el menú de su variedad.
    const slotOf = (dish: PickedDish) => {
      const offering = menu.offerings.find(
        (candidate) => !candidate.composable && candidate.familyName === dish.familyName,
      );
      const index = offering?.dishes.indexOf(dish.dishName) ?? -1;
      return index >= 0 ? index + 1 : null;
    };
    setSaving(true);
    const response = await apiRequest('/api/v1/stock-lots', {
      body: JSON.stringify({
        dishes: dishes.map((dish) => ({
          dishName: dish.dishName,
          familyName: dish.familyName,
          slot: slotOf(dish),
        })),
        name: name.trim(),
        operatingSiteId: site,
        quantityUnits: quantity,
        salesCycleId: menu.cycle.id,
        variantName: size.variantName,
      }),
      method: 'POST',
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    showToast(`"${name.trim()}" quedó en el stock.`);
    reset();
    onSaved();
  }

  return (
    <details className="past-intuitivo mt-4">
      <summary>Cargar un Intuitivo de un período anterior</summary>
      <p className="mt-2 text-sm text-ink-muted">
        Para un Intuitivo ya cocinado que no llegó al stock solo. Se elige el período (hasta{' '}
        {MONTHS_BACK} meses atrás) y los platos de su menú; se vende como los demás y vence un mes
        después de cargarlo.
      </p>
      <form className="form-grid form-grid-wide mt-3" onSubmit={(event) => void submit(event)}>
        <label className="field">
          Período
          <select
            onChange={(event) => {
              setCycleId(event.target.value);
              setDishes([]);
            }}
            required
            value={cycleId}
          >
            <option value="">{cycles.length === 0 ? 'Sin períodos' : 'Elegir'}</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.alias}
              </option>
            ))}
          </select>
        </label>
        {sites.length > 1 ? (
          <label className="field">
            Ciudad
            <select
              onChange={(event) => {
                setSiteId(event.target.value);
                setDishes([]);
              }}
              value={site}
            >
              {sites.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field">
          Tamaño
          <select
            disabled={sizes.length === 0}
            onChange={(event) => setVariantName(event.target.value)}
            value={size?.variantName ?? ''}
          >
            {sizes.map((option) => (
              <option key={option.id} value={option.variantName}>
                {option.variantName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nombre
          <input
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Intuitivo sin lácteos"
            required
            value={name}
          />
        </label>
        <label className="field">
          Cantidad
          <input
            max={100}
            min={1}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            type="number"
            value={quantity}
          />
        </label>
        {menu && size ? (
          <div className="field field-wide">
            Platos
            <IntuitivoDishPicker
              maxDishes={menu.intuitivoMaxDishes}
              minDishes={size.mealsPerUnit}
              offerings={menu.offerings}
              onChange={setDishes}
              selected={dishes}
            />
          </div>
        ) : cycleId ? (
          <p className="field-wide text-sm text-ink-muted">
            Ese período no tenía Intuitivo en el menú.
          </p>
        ) : null}
        {message ? (
          <p className="field-wide intake-rule intake-rule-alert" role="alert">
            {message}
          </p>
        ) : null}
        <div className="field-wide">
          <button
            className="button button-primary"
            disabled={saving || !menu || !size || !site}
            type="submit"
          >
            {saving ? 'Cargando…' : 'Cargar al stock'}
          </button>
        </div>
      </form>
    </details>
  );
}
