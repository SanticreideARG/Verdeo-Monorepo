import { useEffect, useMemo, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { formatDay } from '../lib/dates.js';
import { errorMessage, formatMoney } from '../lib/operations.js';

interface Site {
  displayName: string;
  id: string;
}

interface Zone {
  active?: boolean;
  displayName: string;
  id: string;
  operatingSiteId: string;
}

export interface MovedOrder {
  deliveryDate: string;
  id: string;
  previousDeliveryDate: string;
  previousPublicNumber: string;
  previousTotalMinor: number;
  publicNumber: string;
  totalMinor: number;
}

type Target =
  | { kind: 'order'; orderId: string; currentSiteName: string | null; currency: string }
  | {
      addresses: readonly {
        geographicZoneId: string;
        id: string;
        label: string;
        writtenAddress: string;
      }[];
      currency: string;
      customerId: string;
      kind: 'customer';
    };

/**
 * Mover un pedido, o un cliente con sus pedidos abiertos, a otra ciudad (cargados por error en la
 * que no era).
 *
 * Primero se ve qué cambia —el número nuevo, el precio y el día de reparto de la ciudad destino— y
 * recién después se confirma: el servidor calcula todo, lo muestra y no guarda nada hasta "Mover".
 */
export function MoveSiteDialog({
  onClose,
  onMoved,
  target,
}: {
  onClose: () => void;
  onMoved: (orders: MovedOrder[]) => void;
  target: Target;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [targetSiteId, setTargetSiteId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [addressZones, setAddressZones] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<MovedOrder[] | null>(null);
  const [addressCount, setAddressCount] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void apiRequest('/api/v1/scope').then(async (response) => {
      if (!response.ok) return;
      setSites(((await response.json()) as { sites: Site[] }).sites);
    });
    void apiRequest('/api/v1/zones', { headers: { 'x-verdeo-site': 'global' } }).then(
      async (response) => {
        if (!response.ok) return;
        setZones(
          ((await response.json()) as { items: Zone[] }).items.filter(
            (zone) => zone.active !== false,
          ),
        );
      },
    );
  }, []);

  // La ciudad de origen de un cliente sale de sus domicilios.
  const fromSiteId = useMemo(() => {
    if (target.kind !== 'customer') return null;
    const first = target.addresses[0];
    return zones.find((zone) => zone.id === first?.geographicZoneId)?.operatingSiteId ?? null;
  }, [target, zones]);
  const movingAddresses =
    target.kind === 'customer'
      ? target.addresses.filter(
          (address) =>
            zones.find((zone) => zone.id === address.geographicZoneId)?.operatingSiteId ===
            fromSiteId,
        )
      : [];
  const targetZones = zones.filter((zone) => zone.operatingSiteId === targetSiteId);
  const choices = sites.filter((site) =>
    target.kind === 'customer'
      ? site.id !== fromSiteId
      : site.displayName !== target.currentSiteName,
  );

  function body(isPreview: boolean) {
    if (target.kind === 'order') {
      return { preview: isPreview, targetSiteId, ...(zoneId ? { zoneId } : {}) };
    }
    return {
      addressZones: Object.fromEntries(
        movingAddresses.map((address) => [address.id, addressZones[address.id] ?? zoneId]),
      ),
      fromSiteId: fromSiteId ?? '',
      preferredZoneId: zoneId,
      preview: isPreview,
      targetSiteId,
    };
  }

  async function run(isPreview: boolean) {
    setMessage('');
    setWorking(true);
    const path =
      target.kind === 'order'
        ? `/api/v1/orders/${target.orderId}/site`
        : `/api/v1/customers/${target.customerId}/site`;
    const response = await apiRequest(path, {
      body: JSON.stringify(body(isPreview)),
      method: 'POST',
      notify: false,
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const result = (await response.json()) as
      MovedOrder | { addresses: number; orders: MovedOrder[] };
    const moved = 'orders' in result ? result.orders : [result];
    if ('addresses' in result) setAddressCount(result.addresses);
    if (isPreview) setPreview(moved);
    else onMoved(moved);
  }

  const ready = Boolean(targetSiteId && zoneId) && (target.kind === 'order' || fromSiteId);
  const title = target.kind === 'order' ? 'Mover el pedido a otra ciudad' : 'Cambiar de ciudad';

  return (
    <div aria-label={title} aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-panel grid gap-3">
        <h2 className="text-lg font-semibold text-forest">{title}</h2>
        <p className="text-sm text-ink-muted">
          {target.kind === 'order'
            ? 'Toma un número de la ciudad nueva, y el precio y el día de reparto de ella.'
            : 'El cliente pasa a la ciudad nueva, sus domicilios se vuelven a ubicar en el mapa y sus pedidos en borrador, confirmados y listos se mueven con él.'}
        </p>

        <label className="field">
          Ciudad destino
          <select
            onChange={(event) => {
              setTargetSiteId(event.target.value);
              setZoneId('');
              setPreview(null);
            }}
            value={targetSiteId}
          >
            <option value="">Elegir</option>
            {choices.map((site) => (
              <option key={site.id} value={site.id}>
                {site.displayName}
              </option>
            ))}
          </select>
        </label>

        {targetSiteId ? (
          targetZones.length === 0 ? (
            <p className="screen-notice">
              Esa ciudad todavía no tiene zonas. Creá una en Panel de control → Zonas.
            </p>
          ) : (
            <label className="field">
              {target.kind === 'order' ? 'Zona' : 'Zona preferida'}
              <select
                onChange={(event) => {
                  setZoneId(event.target.value);
                  setPreview(null);
                }}
                value={zoneId}
              >
                <option value="">Elegir</option>
                {targetZones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.displayName}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : null}

        {target.kind === 'customer' && zoneId && movingAddresses.length > 1
          ? movingAddresses.map((address) => (
              <label className="field" key={address.id}>
                {address.label} — {address.writtenAddress}
                <select
                  onChange={(event) => {
                    setAddressZones((current) => ({
                      ...current,
                      [address.id]: event.target.value,
                    }));
                    setPreview(null);
                  }}
                  value={addressZones[address.id] ?? zoneId}
                >
                  {targetZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ))
          : null}

        {preview ? (
          <div className="move-site-preview" role="status">
            {target.kind === 'customer' ? (
              <p>
                {addressCount === 1 ? '1 domicilio' : `${String(addressCount)} domicilios`} y{' '}
                {preview.length === 1 ? '1 pedido' : `${String(preview.length)} pedidos`} pasan a la
                ciudad nueva.
              </p>
            ) : null}
            <ul>
              {preview.map((order) => (
                <li key={order.id}>
                  {formatMoney(order.previousTotalMinor, target.currency)} →{' '}
                  {formatMoney(order.totalMinor, target.currency)} · entrega{' '}
                  {formatDay(order.previousDeliveryDate)} → {formatDay(order.deliveryDate)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {message ? (
          <p className="screen-notice" role="alert">
            {message}
          </p>
        ) : null}

        <div className="form-actions justify-end">
          <button className="button button-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          {preview ? (
            <button
              className="button button-primary"
              disabled={working}
              onClick={() => void run(false)}
              type="button"
            >
              {working ? 'Moviendo…' : 'Mover'}
            </button>
          ) : (
            <button
              className="button button-primary"
              disabled={working || !ready}
              onClick={() => void run(true)}
              type="button"
            >
              {working ? 'Calculando…' : 'Ver qué cambia'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
