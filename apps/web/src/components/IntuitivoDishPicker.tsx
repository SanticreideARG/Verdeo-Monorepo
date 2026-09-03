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

/** The "motor" behind Intuitivo, shared between the public order form and "Tomar y confirmar
 * pedidos" (per "debe usar el mismo motor") — every dish from every published variety this week,
 * grouped by the menu it belongs to, checkable up to five. Replaces free-typing five dish names by
 * hand, which had no relationship to what was actually on the menu that week. */
export function IntuitivoDishPicker({
  offerings,
  onChange,
  selected,
}: {
  offerings: readonly MenuOffering[];
  onChange: (next: string[]) => void;
  selected: readonly string[];
}) {
  const groups = dishGroups(offerings);

  function toggle(dish: string) {
    if (selected.includes(dish)) {
      onChange(selected.filter((current) => current !== dish));
    } else if (selected.length < 5) {
      onChange([...selected, dish]);
    }
  }

  return (
    <div className="intuitivo-picker">
      <p
        className={`intuitivo-picker-count ${selected.length === 5 ? 'is-complete' : ''}`}
        role="status"
      >
        <b>{selected.length} de 5</b>
        {selected.length === 5 ? ' · listo' : ` · elegí ${5 - selected.length} más`}
      </p>
      {groups.map((group) => (
        <div className="intuitivo-picker-group" key={group.familyName}>
          <p className="intuitivo-picker-group-label">{group.familyName}</p>
          <div className="intuitivo-picker-dishes">
            {group.dishes.map((dish) => {
              const isSelected = selected.includes(dish);
              return (
                <label
                  className={`intuitivo-picker-dish ${isSelected ? 'is-selected' : ''}`}
                  key={dish}
                >
                  <input
                    checked={isSelected}
                    disabled={!isSelected && selected.length >= 5}
                    onChange={() => toggle(dish)}
                    type="checkbox"
                  />
                  {dish}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {groups.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No hay platos publicados esta semana para elegir todavía.
        </p>
      ) : null}
    </div>
  );
}
