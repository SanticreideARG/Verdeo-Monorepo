import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { EmptyState } from '../components/EmptyState.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { errorMessage, menusForAmbientScope, type WeeklyMenu } from '../lib/operations.js';
import { whatsappHref } from '../lib/phone.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface NoticeRow {
  body: string;
  customerDisplayName: string;
  customerId: string;
  deliveryZone: string | null;
  note: string | null;
  orderId: string;
  orderPublicNumber: string;
  phone: string | null;
  sentAt: string | null;
  sentByDisplayName: string | null;
  status: 'pending' | 'sent' | 'skipped';
}

interface Template {
  body: string;
  channel: string;
  displayName: string;
  key: string;
}

interface NoticeQueue {
  items: NoticeRow[];
  templateDisplayName: string;
  templateKey: string;
}

/**
 * Avisar por WhatsApp a mano, sin perder la cuenta de a quién ya se le avisó.
 *
 * La API de Meta cobra por conversación iniciada por el negocio y la operación no lo paga, así que
 * el aviso se manda abriendo el chat del cliente con el texto ya escrito. Eso funciona; lo que no
 * funciona es acordarse. Con cien clientes, a la segunda vuelta hay gente avisada dos veces y gente
 * sin avisar, y nada en ninguna parte que diga cuál es cuál.
 *
 * Entonces esta pantalla no manda nada: lleva la cuenta. Muestra quién falta, con qué texto, y
 * marca lo que se hizo. El botón abre WhatsApp y marca en el mismo gesto, porque son dos mitades de
 * la misma acción y separarlas garantiza que la segunda se olvide.
 */
export function NoticesPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateKey, setTemplateKey] = useState('');
  const [queue, setQueue] = useState<NoticeQueue | null>(null);
  const [zone, setZone] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const permissions = profile?.permissions ?? [];
  const canSend = permissions.includes('messages.send');

  const loadCatalogue = useCallback(async () => {
    if (!profile) return;
    if (
      !profile.permissions.includes('orders.read') ||
      !profile.permissions.includes('messages.templates.use')
    ) {
      setLoading(false);
      return;
    }
    const [menusResponse, templatesResponse] = await Promise.all([
      apiRequest('/api/v1/menus'),
      apiRequest('/api/v1/message-templates'),
    ]);
    if (menusResponse.ok) {
      const loaded = menusForAmbientScope(
        ((await menusResponse.json()) as { items: WeeklyMenu[] }).items,
        storedOperatingSiteId(),
      );
      setMenus(loaded);
      setCycleId((current) => current || loaded[0]?.cycle.id || '');
    }
    if (templatesResponse.ok) {
      const loaded = ((await templatesResponse.json()) as { items: Template[] }).items.filter(
        (template) => template.channel === 'whatsapp',
      );
      setTemplates(loaded);
      setTemplateKey((current) => current || loaded[0]?.key || '');
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  const loadQueue = useCallback(async () => {
    if (!templateKey) {
      setQueue(null);
      return;
    }
    setLoading(true);
    setMessage('');
    /*
     * La zona se filtra acá y no en el servidor, aunque el servidor sepa hacerlo.
     *
     * Si la respuesta viniera ya filtrada, la lista de zonas —que sale de lo que vino— se
     * reduciría a la elegida y no habría forma de pasar a otra sin volver a "Todas". La cola de
     * un período entra holgada en una respuesta, así que no hay nada que ganar del otro lado.
     */
    const params = new URLSearchParams({ templateKey });
    if (cycleId) params.set('cycleId', cycleId);
    const response = await apiRequest(`/api/v1/notices?${params.toString()}`);
    setLoading(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setQueue((await response.json()) as NoticeQueue);
  }, [cycleId, templateKey]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function mark(row: NoticeRow, status: 'sent' | 'skipped') {
    const response = await apiRequest('/api/v1/notices/mark', {
      body: JSON.stringify({
        body: row.body,
        orderId: row.orderId,
        status,
        templateKey,
      }),
      method: 'POST',
      notify: false,
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    /*
     * Se actualiza la fila en el lugar y no se recarga la cola.
     *
     * Recargar reordena y vuelve a filtrar, así que la fila en la que se estaba trabajando salta o
     * desaparece justo cuando se la acaba de tocar — y con "sólo pendientes" puesto, eso es
     * exactamente lo que pasa con todas.
     */
    setQueue((current) =>
      current === null
        ? current
        : {
            ...current,
            items: current.items.map((item) =>
              item.orderId === row.orderId
                ? { ...item, sentAt: new Date().toISOString(), status }
                : item,
            ),
          },
    );
  }

  /** Abrir el chat y marcar en el mismo gesto: separarlos garantiza que lo segundo se olvide. */
  function openAndMark(row: NoticeRow) {
    if (!row.phone) return;
    window.open(whatsappHref(row.phone, row.body), '_blank', 'noopener,noreferrer');
    void mark(row, 'sent');
  }

  async function copyBody(row: NoticeRow) {
    await navigator.clipboard.writeText(row.body);
    showToast('Texto copiado.');
  }

  if (failed) return <DashboardFailed label="los avisos" />;
  if (!profile) return <DashboardLoading />;

  if (!permissions.includes('orders.read') || !permissions.includes('messages.templates.use')) {
    return (
      <DashboardShell onLogout={() => void logout()} profile={profile}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Avisos</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver los avisos.</p>
        </section>
      </DashboardShell>
    );
  }

  const zonas = [
    ...new Set((queue?.items ?? []).map((item) => item.deliveryZone).filter(Boolean)),
  ].sort() as string[];
  const enZona = (queue?.items ?? []).filter((item) => !zone || item.deliveryZone === zone);
  const visibles = enZona.filter((item) => (onlyPending ? item.status === 'pending' : true));
  const pendientes = enZona.filter((item) => item.status === 'pending').length;

  return (
    <DashboardShell onLogout={() => void logout()} profile={profile}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Mensajería</p>
          <h1 className="text-2xl font-semibold text-forest">Avisos por WhatsApp</h1>
          <p className="mt-2 text-ink-muted">
            El aviso se manda desde tu WhatsApp: el botón abre el chat con el texto escrito. Acá
            queda la cuenta de a quién ya se le avisó.
          </p>
        </header>

        {message ? (
          <p className="screen-notice mt-5" role="alert">
            {message}
          </p>
        ) : null}

        <div className="operation-card notices-filters mt-6">
          <label className="field">
            Período
            <select onChange={(event) => setCycleId(event.target.value)} value={cycleId}>
              {menus.map((menu) => (
                <option key={menu.cycle.id} value={menu.cycle.id}>
                  {menu.cycle.alias}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mensaje
            <select onChange={(event) => setTemplateKey(event.target.value)} value={templateKey}>
              {templates.length === 0 ? <option value="">Sin plantillas</option> : null}
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Zona
            <select onChange={(event) => setZone(event.target.value)} value={zone}>
              <option value="">Todas</option>
              {zonas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <input
              checked={onlyPending}
              onChange={(event) => setOnlyPending(event.target.checked)}
              type="checkbox"
            />
            Sólo los que faltan
          </label>
        </div>

        {templates.length === 0 ? (
          <EmptyState
            action={
              <Link className="button button-primary" to="/app/ajustes/plantillas">
                Escribir el primero
              </Link>
            }
            body="Un aviso se escribe una vez como plantilla, con {{ cliente.nombre }} y {{ pedido.numero }} donde van los datos de cada pedido."
            title="Todavía no hay ningún mensaje escrito"
          />
        ) : (
          <div className={loading ? 'is-refreshing' : undefined}>
            <p className="notices-count mt-5">
              {pendientes === 0
                ? 'No queda nadie sin avisar en este recorte.'
                : `Faltan ${String(pendientes)} de ${String(enZona.length)}.`}
            </p>

            {visibles.length === 0 ? (
              <EmptyState
                action={
                  onlyPending ? (
                    <button
                      className="button button-secondary"
                      onClick={() => setOnlyPending(false)}
                      type="button"
                    >
                      Ver también los avisados
                    </button>
                  ) : undefined
                }
                body="Puede ser el período, la zona, o que ya esté todo avisado."
                title="Nada que avisar acá"
              />
            ) : (
              <ul className="notices-rows mt-4">
                {visibles.map((row) => (
                  <li className={`is-${row.status}`} key={row.orderId}>
                    <div className="notices-row-head">
                      <div>
                        <strong>{row.customerDisplayName}</strong>
                        <span>
                          {row.orderPublicNumber}
                          {row.deliveryZone ? ` · ${row.deliveryZone}` : ''}
                        </span>
                      </div>
                      <span className="notices-row-state">
                        {row.status === 'pending'
                          ? 'Falta'
                          : row.status === 'skipped'
                            ? 'Salteado'
                            : 'Avisado'}
                        {row.sentByDisplayName ? ` · ${row.sentByDisplayName}` : ''}
                      </span>
                    </div>

                    {/* El texto completo y no un resumen: lo que se manda es esto, y leerlo antes
                        es la única forma de darse cuenta de que una variable no resolvió. */}
                    <p className="notices-row-body">{row.body}</p>

                    <div className="notices-row-actions">
                      {row.phone ? (
                        <button
                          className="button button-primary"
                          disabled={!canSend}
                          onClick={() => openAndMark(row)}
                          type="button"
                        >
                          Abrir WhatsApp y marcar
                        </button>
                      ) : (
                        <span className="notices-row-nophone">
                          Sin WhatsApp cargado: hay que completarlo en la ficha del cliente.
                        </span>
                      )}
                      <button
                        className="button button-secondary"
                        onClick={() => void copyBody(row)}
                        type="button"
                      >
                        Copiar texto
                      </button>
                      {canSend && row.status === 'pending' ? (
                        <button
                          className="button button-secondary"
                          onClick={() => void mark(row, 'skipped')}
                          type="button"
                        >
                          Saltear
                        </button>
                      ) : null}
                      {canSend && row.status !== 'pending' ? (
                        <button
                          className="button button-secondary"
                          onClick={() => void mark(row, 'sent')}
                          type="button"
                        >
                          Marcar avisado
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
