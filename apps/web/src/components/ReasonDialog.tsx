import { useState } from 'react';

/**
 * Confirmar algo que además pide explicar por qué.
 *
 * `ConfirmDialog` alcanza cuando la única pregunta es sí o no. Acá el motivo no es cortesía: una
 * vuelta atrás de estado lo exige del lado del servidor, y es lo que después permite leer el
 * historial de un pedido y entender qué pasó. Por eso el botón no se habilita sin él.
 *
 * No es el diálogo de cancelar un pedido, que elige de una lista cerrada para poder contar las
 * entregas fallidas por causa. Acá el motivo es texto: son casos sueltos ("se marcó listo por
 * error") que no valen una taxonomía.
 */
export function ReasonDialog({
  confirmLabel,
  detail,
  label = 'Motivo',
  onCancel,
  onConfirm,
  placeholder,
  title,
}: {
  confirmLabel: string;
  detail?: string;
  label?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  placeholder?: string;
  title: string;
}) {
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-panel grid gap-3">
        <h2 className="text-lg font-semibold text-forest">{title}</h2>
        {detail ? <p className="text-sm text-ink-muted">{detail}</p> : null}
        <label className="field">
          {label}
          <textarea
            autoFocus
            onChange={(event) => setReason(event.target.value)}
            placeholder={placeholder}
            rows={3}
            value={reason}
          />
        </label>
        <div className="form-actions justify-end">
          <button className="button button-secondary" onClick={onCancel} type="button">
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={working || reason.trim().length === 0}
            onClick={() => {
              setWorking(true);
              void Promise.resolve(onConfirm(reason.trim())).finally(() => setWorking(false));
            }}
            type="button"
          >
            {working ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
