import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type PaymentMethod } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface MethodDraft {
  active: boolean;
  code: string;
  displayName: string;
  isCash: boolean;
}

function toDraft(method: PaymentMethod): MethodDraft {
  return {
    active: method.active,
    code: method.code,
    displayName: method.displayName,
    isCash: method.isCash,
  };
}

/** Ajustes → Métodos de pago: the admin-editable catalog behind every "Método" picker — cobro
 * manual (PaymentsPage) and, eventually, order intake. `isCash` decides settlement routing
 * (efectivo queda TO_SETTLE hasta rendir, todo lo demás pasa directo a PAID), so agregar un método
 * nuevo implica decidir explícitamente de qué lado cae. */
export function PaymentMethodsSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [drafts, setDrafts] = useState<MethodDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const canRead = profile?.permissions.includes('payments.read') ?? false;
  const canWrite = profile?.permissions.includes('payments.override') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest('/api/v1/payments/methods');
    if (response.ok) {
      const body = (await response.json()) as { items: PaymentMethod[] };
      setDrafts(body.items.map(toDraft));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  function updateDraft(index: number, patch: Partial<MethodDraft>) {
    setDrafts((current) =>
      current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)),
    );
  }

  function addMethod() {
    setDrafts((current) => [
      ...current,
      { active: true, code: '', displayName: '', isCash: false },
    ]);
  }

  function removeMethod(index: number) {
    setDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
  }

  async function save() {
    setMessage('');
    const methods = drafts
      .map((draft) => ({
        ...draft,
        code: draft.code.trim(),
        displayName: draft.displayName.trim(),
      }))
      .filter((draft) => draft.code && draft.displayName);
    if (methods.length === 0) {
      setMessage('Cargá al menos un método con código y nombre.');
      return;
    }
    setSaving(true);
    try {
      const response = await apiRequest('/api/v1/payments/methods', {
        body: JSON.stringify({ methods }),
        method: 'PATCH',
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      const body = (await response.json()) as { items: PaymentMethod[] };
      setDrafts(body.items.map(toDraft));
      setMessage('Métodos de pago actualizados.');
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <DashboardFailed label="los métodos de pago" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Métodos de pago</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Ajustes</p>
          <h1 className="text-2xl font-semibold text-forest">Métodos de pago</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Los métodos disponibles al registrar un cobro. "Es efectivo" decide si el cobro queda
            pendiente de rendición o pasa directo a pagado — marcalo solo para plata en mano.
          </p>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="operation-card mt-6 grid gap-4 max-w-2xl">
            <div className="grid gap-3">
              {drafts.map((draft, index) => (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-forest/10 p-3"
                  key={index}
                >
                  <label className="field flex-1 min-w-[160px]">
                    Nombre
                    <input
                      disabled={!canWrite}
                      onChange={(event) => updateDraft(index, { displayName: event.target.value })}
                      placeholder="Efectivo"
                      value={draft.displayName}
                    />
                  </label>
                  <label className="field flex-1 min-w-[140px]">
                    Código
                    <input
                      disabled={!canWrite}
                      onChange={(event) => updateDraft(index, { code: event.target.value })}
                      placeholder="efectivo"
                      value={draft.code}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={draft.isCash}
                      disabled={!canWrite}
                      onChange={(event) => updateDraft(index, { isCash: event.target.checked })}
                      type="checkbox"
                    />
                    Es efectivo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={draft.active}
                      disabled={!canWrite}
                      onChange={(event) => updateDraft(index, { active: event.target.checked })}
                      type="checkbox"
                    />
                    Activo
                  </label>
                  {canWrite ? (
                    <button
                      className="button button-secondary"
                      onClick={() => removeMethod(index)}
                      type="button"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              ))}
              {drafts.length === 0 ? (
                <p className="empty-state">No hay métodos de pago cargados.</p>
              ) : null}
            </div>

            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <button className="button button-secondary" onClick={addMethod} type="button">
                  + Agregar método
                </button>
                <button
                  className="button button-primary"
                  disabled={saving}
                  onClick={() => void save()}
                  type="button"
                >
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
