import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface AccountRow {
  active: boolean;
  displayPhoneNumber: string | null;
  hasAccessToken: boolean;
  id: string;
  label: string;
  phoneNumberId: string;
  wabaId: string | null;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** "Cuentas de WhatsApp" (Ajustes): the account roster a superadmin fills in once real Meta
 * credentials exist. Each row's access token is write-only — shown as configured/not configured,
 * never echoed back, same posture as an access token in Usuarios. Until at least one active
 * account exists with a real token, the inbox stays empty and outbound sends answer "sin token
 * configurado" — the product is inert but not broken, same as every other optional provider here. */
export function MessagingAccountsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const canManage = profile?.permissions.includes('messaging.accounts.manage') ?? false;

  const loadAccounts = useCallback(async () => {
    const response = await apiRequest('/api/v1/messaging/accounts');
    if (response.ok) {
      setAccounts(((await response.json()) as { items: AccountRow[] }).items);
    }
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void loadAccounts().finally(() => setLoading(false));
  }, [canManage, loadAccounts]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const form = new FormData(event.currentTarget);
    const accessToken = formText(form, 'accessToken').trim();
    const response = await apiRequest('/api/v1/messaging/accounts', {
      body: JSON.stringify({
        displayPhoneNumber: formText(form, 'displayPhoneNumber').trim() || undefined,
        label: formText(form, 'label').trim(),
        phoneNumberId: formText(form, 'phoneNumberId').trim(),
        wabaId: formText(form, 'wabaId').trim() || undefined,
        ...(accessToken ? { accessToken } : {}),
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    event.currentTarget.reset();
    setFormOpen(false);
    await loadAccounts();
  }

  async function toggleActive(account: AccountRow) {
    const response = await apiRequest(`/api/v1/messaging/accounts/${account.id}`, {
      body: JSON.stringify({ active: !account.active }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadAccounts();
  }

  if (failed) return <DashboardFailed label="las cuentas de WhatsApp" />;
  if (!profile) return <DashboardLoading />;

  if (!canManage) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Cuentas de WhatsApp</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para administrar esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex items-center justify-between">
          <div>
            <p className="dashboard-kicker">Administración</p>
            <h1 className="text-2xl font-semibold text-forest">Cuentas de WhatsApp</h1>
          </div>
          <button
            className="button button-secondary"
            onClick={() => setFormOpen((open) => !open)}
            type="button"
          >
            {formOpen ? 'Cancelar' : '+ Nueva cuenta'}
          </button>
        </header>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {formOpen ? (
          <form
            className="mt-6 grid gap-3 rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6 sm:grid-cols-2"
            onSubmit={(event) => void createAccount(event)}
          >
            <label className="field">
              Etiqueta
              <input name="label" placeholder="Ej. Verdeo Neuquén" required />
            </label>
            <label className="field">
              Phone Number ID (Meta)
              <input name="phoneNumberId" required />
            </label>
            <label className="field">
              WABA ID
              <input name="wabaId" />
            </label>
            <label className="field">
              Número visible
              <input name="displayPhoneNumber" placeholder="+54 9 …" />
            </label>
            <label className="field field-wide">
              Access token
              <input
                name="accessToken"
                placeholder="Se guarda una sola vez, no se vuelve a mostrar"
              />
            </label>
            <button className="button button-primary sm:col-span-2" type="submit">
              Crear cuenta
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : accounts.length === 0 ? (
          <p className="mt-6 text-ink-muted">
            No hay cuentas configuradas todavía. El buzón de mensajes queda vacío hasta que agregues
            una con credenciales reales de Meta.
          </p>
        ) : (
          <ul className="mt-6 grid gap-3">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between rounded-xl border border-forest/10 bg-[var(--db-surface)] p-4"
              >
                <div>
                  <p className="font-semibold text-forest">{account.label}</p>
                  <p className="text-xs text-ink-muted">
                    {account.phoneNumberId}
                    {account.displayPhoneNumber ? ` · ${account.displayPhoneNumber}` : ''} ·{' '}
                    {account.hasAccessToken ? 'token configurado' : 'sin token'}
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => void toggleActive(account)}
                  type="button"
                >
                  {account.active ? 'Desactivar' : 'Activar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
