import type { MenuOffering } from '../lib/operations.js';

// Every fixed offering already carries its own five dishes (loaded with the menu, no extra
// endpoint needed) — dishes don't vary by size, only by variety, so a variety appearing once per
// size (e.g. "Keto 250" and "Keto 400") would otherwise list the same five dishes twice.
// Deduplicated by familyName, keeping the first size's dish list as the representative one.
function dishGroups(
  offerings: readonly MenuOffering[],
): { dishes: string[]; familyName: string }[] {
  const byFamily = new Map<string, string[]>();
  for (const offering of offerings) {
    if (offering.composable || byFamily.has(offering.familyName)) continue;
    byFamily.set(offering.familyName, offering.dishes);
  }
  return [...byFamily.entries()].map(([familyName, dishes]) => ({ dishes, familyName }));
}

/**
 * El motor del Intuitivo: todos los platos publicados esta semana, agrupados por variedad.
 *
 * Es el mismo componente en el formulario público y en "Tomar y confirmar pedidos", porque los dos
 * tienen que ofrecer exactamente lo que hay en el menú de la semana — antes se escribían los cinco
 * nombres a mano, sin ninguna relación con lo que de verdad se cocinaba.
 *
 * Cada plato lleva una cuenta y no un tilde. Un tilde sólo puede decir "sí o no", y la operación
 * pide que alguien se lleve dos porciones del mismo guiso: con un interruptor eso es imposible de
 * expresar, y con una cuenta es apretar "+" dos veces.
 *
 * La cantidad va de `minDishes` (lo que trae el tamaño) a `maxDishes` (lo que configuró la ciudad).
 * Pasarse del estándar es un pedido válido y su precio lo propone el servidor; quedarse corto no,
 * porque cambiaría lo que se vende por el mismo precio del menú.
 */
export function IntuitivoDishPicker({
  maxDishes,
  minDishes,
  offerings,
  onChange,
  selected,
}: {
  maxDishes: number;
  minDishes: number;
  offerings: readonly MenuOffering[];
  onChange: (next: string[]) => void;
  selected: readonly string[];
}) {
  const groups = dishGroups(offerings);
  const total = selected.length;

  function add(dish: string) {
    if (total >= maxDishes) return;
    onChange([...selected, dish]);
  }

  /*
   * Se quita la última aparición, no la primera.
   *
   * El orden de la lista es el orden de los slots, que es el que sale impreso en la etiqueta y el
   * que se lee contra la caja. Sacar del medio correría todo lo que viene después, y el plato que
   * alguien acaba de agregar no es el que tenía en la cabeza al apretar "−".
   */
  function remove(dish: string) {
    const last = selected.lastIndexOf(dish);
    if (last < 0) return;
    onChange(selected.filter((_, index) => index !== last));
  }

  const faltan = minDishes - total;
  const estado =
    faltan > 0
      ? `elegí ${String(faltan)} más`
      : total === minDishes
        ? 'listo'
        : `${String(total - minDishes)} de más · el precio se recalcula`;

  return (
    <div className="intuitivo-picker">
      <p className={`intuitivo-picker-count ${faltan <= 0 ? 'is-complete' : ''}`} role="status">
        <b>
          {total} de {minDishes}
        </b>
        {` · ${estado}`}
      </p>
      {groups.map((group) => (
        <div className="intuitivo-picker-group" key={group.familyName}>
          <p className="intuitivo-picker-group-label">{group.familyName}</p>
          <div className="intuitivo-picker-dishes">
            {group.dishes.map((dish) => {
              const count = selected.filter((current) => current === dish).length;
              return (
                <div
                  className={`intuitivo-picker-dish ${count > 0 ? 'is-selected' : ''}`}
                  key={dish}
                >
                  <span>{dish}</span>
                  <button
                    aria-label={`Quitar ${dish}`}
                    disabled={count === 0}
                    onClick={() => remove(dish)}
                    type="button"
                  >
                    −
                  </button>
                  {/* La cuenta sólo cuando hay: un "0" en cada plato es ruido en una lista de veinte. */}
                  <b aria-hidden={count === 0}>{count > 0 ? count : ''}</b>
                  <button
                    aria-label={`Agregar ${dish}`}
                    disabled={total >= maxDishes}
                    onClick={() => add(dish)}
                    type="button"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {total >= maxDishes ? (
        <p className="intuitivo-picker-limit">
          Llegaste al máximo de {maxDishes} platos por vianda.
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No hay platos publicados esta semana para elegir todavía.
        </p>
      ) : null}
    </div>
  );
}
