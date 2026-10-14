import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { formatDayLong, todayInOperation } from '../lib/dates.js';
import { errorMessage } from '../lib/operations.js';
import { whatsappHref } from '../lib/phone.js';
import { showToast } from '../lib/toast.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { weekdayName } from './DeliveryDayPicker.js';

interface DeliveryRun {
  autoCreated: boolean;
  deliveryDate: string;
  drafts: number;
  id: string;
  isDefault: boolean;
  label: string;
  noPayment: number;
  orders: number;
  routes: number;
  status: 'cancelled' | 'closed' | 'consolidated' | 'dispatched' | 'planned';
  timeWindow: string | null;
  unlocated: number;
  varieties: { label: string; units: number }[];
}

interface Moved {
  customerName: string;
  orderId: string;
  phone: string | null;
  publicNumber: string;
}

const STATUS_LABELS: Record<DeliveryRun['status'], string> = {
  cancelled: 'Cancelado',
  closed: 'Cerrado',
  consolidated: 'Lista cerrada',
  dispatched: 'En la calle',
  planned: 'Abierto',
};

function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

/** "Domingo 18 de octubre", con el día de la semana adelante: es lo que se busca. */
function dayTitle(date: string): string {
  return `${weekdayName(weekdayOf(date))} ${formatDayLong(date).replace(/ de \d{4}$/, '')}`;
}

/** El aviso de cambio de fecha para un cliente. Se copia o se abre en WhatsApp: nunca sale solo. */
function rescheduleMessage(moved: Moved, date: string): string {
  const firstName = moved.customerName.split(' ')[0] ?? moved.customerName;
  return `Hola ${firstName}! Te escribimos de Verdeo: tu pedido ${moved.publicNumber} pasa al ${dayTitle(date).toLocaleLowerCase('es-AR')}. ¿Te viene bien? ¡Gracias!`;
}

/**
 * Los repartos: qué sale cada día y con qué pedidos (DELIVERY_RUNS_PLAN.md, fase 1).
 *
 * Los repartos se crean solos cuando llega un pedido con una fecha que no tiene ninguno, y a mano
 * para una salida extra o para separar mañana y tarde. Cambiar la fecha de un reparto mueve todos
 * sus pedidos; después se ofrece el aviso para cada cliente, que se copia o se abre en WhatsApp.
 */
export function DeliveryRunsPanel({ canManage }: { canManage: boolean }) {
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeliveryRun | null>(null);
  const [notices, setNotices] = useState<{
    date: string;
    moved: Moved[];
    outside: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    const response = await apiRequest(`/api/v1/delivery/runs?from=${todayInOperation()}`, {
      notify: false,
    });
    setLoaded(true);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const body = (await response.json()) as { runs: DeliveryRun[]; unassigned: number };
    setRuns(body.runs);
    setUnassigned(body.unassigned);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const response = await apiRequest('/api/v1/delivery/runs', {
      body: JSON.stringify({
        deliveryDate: text('deliveryDate'),
        ...(text('label') ? { label: text('label') } : {}),
        ...(text('timeWindow') ? { timeWindow: text('timeWindow') } : {}),
      }),
      method: 'POST',
      notify: false,
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setCreating(false);
    setMessage('');
    showToast('Reparto creado.');
    await load();
  }

  async function update(run: DeliveryRun, change: Record<string, unknown>) {
    const response = await apiRequest(`/api/v1/delivery/runs/${run.id}`, {
      body: JSON.stringify(change),
      method: 'PATCH',
      notify: false,
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return null;
    }
    setMessage('');
    return (await response.json()) as { moved: Moved[]; outsideDeliveryDays: boolean };
  }

  async function reschedule(run: DeliveryRun, date: string) {
    const result = await update(run, { deliveryDate: date });
    if (!result) return;
    setRescheduling(null);
    setNotices({ date, moved: result.moved, outside: result.outsideDeliveryDays });
    showToast(
      `Reparto movido al ${dayTitle(date).toLocaleLowerCase('es-AR')}, con ${String(result.moved.length)} pedido${result.moved.length === 1 ? '' : 's'}.`,
    );
    await load();
  }

  async function remove(run: DeliveryRun) {
    const response = await apiRequest(`/api/v1/delivery/runs/${run.id}`, {
      method: 'DELETE',
      notify: false,
    });
    setDeleting(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    showToast('Reparto borrado.');
    await load();
  }

  const dates = [...new Set(runs.map((run) => run.deliveryDate))];

  return (
    <section className="delivery-runs">
      <div className="delivery-runs-head">
        <p className="text-sm text-ink-muted">
          Lo que sale cada día. Los repartos se crean solos cuando llega un pedido con una fecha
          nueva; podés agregar uno para una salida extra o para separar mañana y tarde.
        </p>
        {canManage ? (
          <button
            className="button button-secondary"
            onClick={() => setCreating((open) => !open)}
            type="button"
          >
            {creating ? 'Cancelar' : '+ Nuevo reparto'}
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="screen-notice" role="alert">
          {message}
        </p>
      ) : null}

      {unassigned > 0 ? (
        <p className="delivery-runs-unassigned" role="status">
          {unassigned === 1 ? 'Hay 1 pedido' : `Hay ${String(unassigned)} pedidos`} sin reparto: su
          día tiene la lista cerrada o más de un reparto para elegir.
        </p>
      ) : null}

      {creating ? (
        <form className="delivery-runs-form" onSubmit={(event) => void create(event)}>
          <label className="field">
            Fecha
            <input min={todayInOperation()} name="deliveryDate" required type="date" />
          </label>
          <label className="field">
            Nombre
            <input maxLength={80} name="label" placeholder="Domingo mañana" />
          </label>
          <label className="field">
            Franja
            <input maxLength={80} name="timeWindow" placeholder="de 11 a 14h" />
          </label>
          <button className="button button-primary" type="submit">
            Crear reparto
          </button>
        </form>
      ) : null}

      {notices ? (
        <section className="delivery-runs-notices" aria-live="polite">
          <div className="delivery-runs-notices-head">
            <strong>Avisá el cambio de fecha a cada cliente</strong>
            <button className="locate-retry-open" onClick={() => setNotices(null)} type="button">
              Listo
            </button>
          </div>
          {notices.outside ? (
            <p className="text-sm">
              Ojo: el {dayTitle(notices.date).toLocaleLowerCase('es-AR')} no es uno de los días de
              reparto de la ciudad.
            </p>
          ) : null}
          <ul>
            {notices.moved.map((moved) => (
              <li key={moved.orderId}>
                <span>
                  {moved.customerName} · {moved.publicNumber}
                </span>
                <span className="delivery-runs-notice-actions">
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(rescheduleMessage(moved, notices.date))
                        .then(() => showToast('Aviso copiado.'))
                    }
                    type="button"
                  >
                    Copiar aviso
                  </button>
                  {moved.phone ? (
                    <a
                      className="button button-secondary"
                      href={whatsappHref(moved.phone, rescheduleMessage(moved, notices.date))}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loaded && runs.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No hay repartos desde hoy. Se crean solos cuando entra un pedido con fecha.
        </p>
      ) : null}

      {dates.map((date) => {
        const delDia = runs.filter((run) => run.deliveryDate === date);
        return (
          <section className="delivery-runs-day" key={date}>
            <h2>{dayTitle(date)}</h2>
            {delDia.map((run) => (
              <article className={`delivery-run is-${run.status}`} key={run.id}>
                <header>
                  <div>
                    <strong>{run.label}</strong>
                    {run.timeWindow ? <small> · {run.timeWindow}</small> : null}
                  </div>
                  <span className="delivery-run-chips">
                    {delDia.length > 1 && run.isDefault ? (
                      <span className="inbound-kind">De siempre</span>
                    ) : null}
                    <span className="status-chip">{STATUS_LABELS[run.status]}</span>
                  </span>
                </header>
                <p className="delivery-run-summary">
                  <strong>
                    {run.orders} pedido{run.orders === 1 ? '' : 's'}
                  </strong>
                  {run.varieties.length > 0
                    ? ` · ${run.varieties.map((item) => `${item.label} × ${String(item.units)}`).join(' · ')}`
                    : ''}
                </p>
                {run.unlocated + run.drafts + run.noPayment > 0 ? (
                  <p className="delivery-run-warnings">
                    {[
                      run.unlocated > 0 ? `${String(run.unlocated)} sin ubicación` : null,
                      run.drafts > 0 ? `${String(run.drafts)} en borrador` : null,
                      run.noPayment > 0 ? `${String(run.noPayment)} sin medio de pago` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                {run.routes > 0 ? (
                  <p className="text-sm text-ink-muted">
                    {run.routes} hoja{run.routes === 1 ? '' : 's'} de ruta
                  </p>
                ) : null}

                {canManage && editing === run.id ? (
                  <form
                    className="delivery-runs-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const label = form.get('label');
                      const timeWindow = form.get('timeWindow');
                      void update(run, {
                        label: typeof label === 'string' ? label : '',
                        timeWindow:
                          typeof timeWindow === 'string' && timeWindow.trim() ? timeWindow : null,
                      }).then(async (result) => {
                        if (!result) return;
                        setEditing(null);
                        await load();
                      });
                    }}
                  >
                    <label className="field">
                      Nombre
                      <input defaultValue={run.label} maxLength={80} name="label" />
                    </label>
                    <label className="field">
                      Franja
                      <input defaultValue={run.timeWindow ?? ''} maxLength={80} name="timeWindow" />
                    </label>
                    <button className="button button-primary" type="submit">
                      Guardar
                    </button>
                  </form>
                ) : null}

                {canManage && rescheduling === run.id ? (
                  <form
                    className="delivery-runs-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = new FormData(event.currentTarget).get('deliveryDate');
                      if (typeof value === 'string' && value) void reschedule(run, value);
                    }}
                  >
                    <label className="field">
                      Nueva fecha (mueve sus {run.orders} pedidos)
                      <input
                        defaultValue={run.deliveryDate}
                        min={todayInOperation()}
                        name="deliveryDate"
                        required
                        type="date"
                      />
                    </label>
                    <button className="button button-primary" type="submit">
                      Mover el reparto
                    </button>
                  </form>
                ) : null}

                {canManage && run.status === 'planned' ? (
                  <div className="delivery-run-actions">
                    <button
                      className="button button-secondary"
                      onClick={() => setRescheduling(rescheduling === run.id ? null : run.id)}
                      type="button"
                    >
                      Cambiar fecha
                    </button>
                    <button
                      className="button button-secondary"
                      onClick={() => setEditing(editing === run.id ? null : run.id)}
                      type="button"
                    >
                      Nombre y franja
                    </button>
                    {delDia.length > 1 && !run.isDefault ? (
                      <button
                        className="button button-secondary"
                        onClick={() =>
                          void update(run, { isDefault: true }).then(async (result) => {
                            if (result) await load();
                          })
                        }
                        type="button"
                      >
                        Hacerlo el de siempre
                      </button>
                    ) : null}
                    {run.orders === 0 && run.routes === 0 ? (
                      <button
                        className="button button-secondary"
                        onClick={() => setDeleting(run)}
                        type="button"
                      >
                        Borrar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        );
      })}

      {deleting ? (
        <ConfirmDialog
          confirmLabel="Borrar el reparto"
          detail={`Se borra "${deleting.label}" del ${dayTitle(deleting.deliveryDate).toLocaleLowerCase('es-AR')}. No tiene pedidos ni hojas de ruta.`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove(deleting)}
          title="Borrar el reparto"
          tone="destructivo"
        />
      ) : null}
    </section>
  );
}
