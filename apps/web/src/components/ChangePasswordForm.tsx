import { useState, type FormEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

/**
 * Cambiar la propia contraseña.
 *
 * Pide la actual aunque la sesión ya esté abierta: es lo que separa "cambiar mi contraseña" de
 * "cualquiera que agarre esta pantalla desbloqueada se queda con la cuenta".
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== repeat) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest('/api/v1/me/password', {
        body: JSON.stringify({ currentPassword, newPassword }),
        method: 'POST',
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
      showToast('Contraseña cambiada. Cerramos tus otras sesiones abiertas.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-6 grid max-w-md gap-4" onSubmit={(event) => void submit(event)}>
      <label className="field">
        Contraseña actual
        <input
          autoComplete="current-password"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          type="password"
          value={currentPassword}
        />
      </label>
      <label className="field">
        Contraseña nueva (mínimo 12 caracteres)
        <input
          autoComplete="new-password"
          minLength={12}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          type="password"
          value={newPassword}
        />
      </label>
      <label className="field">
        Repetila
        <input
          autoComplete="new-password"
          minLength={12}
          onChange={(event) => setRepeat(event.target.value)}
          required
          type="password"
          value={repeat}
        />
      </label>

      {error ? (
        <p className="crm-message" role="alert">
          {error}
        </p>
      ) : null}

      <p className="text-xs text-ink-muted">
        Al guardar se cierran tus otras sesiones abiertas. Esta pantalla sigue funcionando.
      </p>
      <button className="button button-primary justify-self-start" disabled={saving} type="submit">
        {saving ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
