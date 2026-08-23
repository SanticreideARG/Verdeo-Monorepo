import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface Dashboard {
  cashByRepartidor: {
    amountMinor: number;
    collectedByUserId: string;
    collectorDisplayName: string;
  }[];
  paidTotalMinor: number;
  pendingTotalMinor: number;
  toSettleTotalMinor: number;
}

interface CashCollectionRow {
  amountMinor: number;
  collectedAt: string;
  collectedByUserId: string;
  id: string;
  method: string;
  orderId: string;
  publicNumber?: string;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** "Pagos" (Administración): the three-state dashboard from PAYMENTS.md (pendiente / a rendir /
 * pagado), plus the two mutations that move a payment through it — a repartidor's cash collection
 * and an operator settling it. Recording a collection needs `payments.record` (mostly the delivery
 * app's own concern, but exposed here too for a manual/office entry); settling needs
 * `payments.settle`. */
export function PaymentsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [pending, setPending] = useState<CashCollectionRow[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [collectOrderId, setCollectOrderId] = useState('');

  const canRead = profile?.permissions.includes('payments.read') ?? false;
  const canRecord = profile?.permissions.includes('payments.record') ?? false;
  const canSettle = profile?.permissions.includes('payments.settle') ?? false;

  const load = useCallback(async () => {
    const [dashboardResponse, collectionsResponse] = await Promise.all([
      apiRequest('/api/v1/payments/dashboard'),
      apiRequest('/api/v1/payments/collections'),
    ]);
    if (dashboardResponse.ok) setDashboard((await dashboardResponse.json()) as Dashboard);
    if (collectionsResponse.ok) {
      setPending(((await collectionsResponse.json()) as { items: CashCollectionRow[] }).items);
    }
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void load().finally(() => setLoading(false));
  }, [canRead, load]);

  async function recordCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const form = new FormData(event.currentTarget);
    const orderId = formText(form, 'orderId').trim();
    const response = await apiRequest(`/api/v1/payments/orders/${orderId}/collections`, {
      body: JSON.stringify({
        amountMinor: Math.round(Number(formText(form, 'amount')) * 100),
        method: formText(form, 'method').trim(),
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    event.currentTarget.reset();
    setCollectOrderId('');
    await load();
  }

  async function settle(collectionId: string) {
    if (!profile) return;
    const response = await apiRequest(`/api/v1/payments/collections/${collectionId}/settle`, {
      body: JSON.stringify({ receivedByUserId: profile.user.id }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await load();
  }

  if (failed) return <DashboardFailed label="los pagos" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Pagos</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver pagos.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Pagos y rendiciones</h1>
        </header>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <>
            {dashboard ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <article className="rounded-xl border border-forest/10 bg-[var(--db-surface)] p-4">
                  <p className="text-xs uppercase tracking-widest text-ink-muted">Pendiente</p>
                  <p className="mt-1 text-2xl font-semibold text-forest">
                    {formatMoney(dashboard.pendingTotalMinor, 'ARS')}
                  </p>
                </article>
                <article className="rounded-xl border border-forest/10 bg-[var(--db-surface)] p-4">
                  <p className="text-xs uppercase tracking-widest text-ink-muted">A rendir</p>
                  <p className="mt-1 text-2xl font-semibold text-forest">
                    {formatMoney(dashboard.toSettleTotalMinor, 'ARS')}
                  </p>
                </article>
                <article className="rounded-xl border border-forest/10 bg-[var(--db-surface)] p-4">
                  <p className="text-xs uppercase tracking-widest text-ink-muted">Pagado</p>
                  <p className="mt-1 text-2xl font-semibold text-forest">
                    {formatMoney(dashboard.paidTotalMinor, 'ARS')}
                  </p>
                </article>
              </div>
            ) : null}

            {dashboard && dashboard.cashByRepartidor.length > 0 ? (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-forest">Efectivo por repartidor</h2>
                <ul className="mt-2 grid gap-1 text-sm text-ink-muted">
                  {dashboard.cashByRepartidor.map((row) => (
                    <li key={row.collectedByUserId}>
                      {row.collectorDisplayName}: {formatMoney(row.amountMinor, 'ARS')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canRecord ? (
              <form
                className="mt-6 grid gap-3 rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6 sm:grid-cols-4"
                onSubmit={(event) => void recordCollection(event)}
              >
                <label className="field">
                  ID de pedido
                  <input
                    name="orderId"
                    onChange={(event) => setCollectOrderId(event.target.value)}
                    required
                    value={collectOrderId}
                  />
                </label>
                <label className="field">
                  Monto
                  <input min="0" name="amount" required step="0.01" type="number" />
                </label>
                <label className="field">
                  Método
                  <input name="method" placeholder="efectivo, transferencia…" required />
                </label>
                <button className="button button-primary self-end" type="submit">
                  Registrar cobro
                </button>
              </form>
            ) : null}

            <div className="mt-6">
              <h2 className="text-sm font-semibold text-forest">Efectivo sin rendir</h2>
              {pending.length === 0 ? (
                <p className="mt-2 text-ink-muted">No hay cobranzas pendientes de rendición.</p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {pending.map((row) => (
                    <li
                      className="flex items-center justify-between rounded-xl border border-forest/10 bg-[var(--db-surface)] p-3"
                      key={row.id}
                    >
                      <div>
                        <p className="font-semibold text-forest">
                          {formatMoney(row.amountMinor, 'ARS')} · {row.method}
                        </p>
                        <p className="text-xs text-ink-muted">{timeLabel(row.collectedAt)}</p>
                      </div>
                      {canSettle ? (
                        <button
                          className="button button-secondary"
                          onClick={() => void settle(row.id)}
                          type="button"
                        >
                          Marcar rendido
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </DashboardShell>
  );
}
