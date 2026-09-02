/**
 * Shown when a form comes back pre-filled from a saved draft.
 *
 * Without this, a form that silently fills itself in reads as a bug — the operator can't tell
 * whether they're editing an old record, a duplicate, or their own unfinished work. Naming it and
 * offering one click to drop it is what turns the behaviour from surprising into useful.
 */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <p className="draft-notice" role="status">
      <span>Recuperamos lo que habías empezado a cargar.</span>
      <button onClick={onDiscard} type="button">
        Empezar de cero
      </button>
    </p>
  );
}
