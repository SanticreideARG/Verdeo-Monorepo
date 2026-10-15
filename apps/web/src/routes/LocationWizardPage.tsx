import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AddressMap } from '../components/AddressMap.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { locateStatusText, type LocateResult } from '../components/LocateAddress.js';
import { apiRequest, subscribeToOperatingSite } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface PendingAddress {
  addressId: string;
  customerId: string;
  customerName: string;
  geocodingStatus: string;
  label: string;
  lastOrderAt: string | null;
  locationUrl: string | null;
  neighborhoodName: string | null;
  openOrders: number;
  writtenAddress: string;
  zoneName: string;
}

interface Pending {
  items: PendingAddress[];
  located: number;
  total: number;
}

type Candidate = LocateResult['candidates'][number] & { latitude?: number; longitude?: number };

/** Lo que pasó con cada domicilio en esta sesión del asistente. */
type Outcome = { kind: 'located' } | { kind: 'skipped' } | { kind: 'tried'; result: LocateResult };

const mapsSearch = (text: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;

/**
 * El asistente de ubicaciones: dejar todos los domicilios de clientes con su ubicación.
 *
 * Usa el mismo ubicador que "Ubicar dirección" del pedido, ordenado para conciliar de corrido:
 *
 * 1. **Automático**: una pasada por todos los pendientes; lo que el mapa encuentra seguro y dentro de
 *    la ciudad queda confirmado solo.
 * 2. **Uno por uno**: lo que quedó, de a uno y en foco — los candidatos con su mapa, corregir la
 *    dirección o pegar la ubicación (enlace de Maps o coordenadas), o saltarlo para después.
 *
 * Primero los domicilios de quienes tienen pedidos abiertos: son los que salen en la próxima hoja de
 * ruta.
 */
export function LocationWizardPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const canRead =
    (profile?.permissions.includes('customers.read') ?? false) &&
    (profile?.permissions.includes('customers.view_sensitive') ?? false);
  const canEdit = canRead && (profile?.permissions.includes('customers.edit') ?? false);

  const [pending, setPending] = useState<Pending | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [auto, setAuto] = useState<{ done: number; total: number } | null>(null);
  const stopAuto = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [draftLocation, setDraftLocation] = useState('');

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/address-locations/pending', { notify: false });
    if (response.ok) setPending((await response.json()) as Pending);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void load();
    return subscribeToOperatingSite(() => {
      setOutcomes({});
      setCurrentId(null);
      void load();
    });
  }, [canRead, load]);

  // Lo que queda para mirar a mano: lo que no se ubicó ni se saltó.
  const queue = (pending?.items ?? []).filter((item) => {
    const outcome = outcomes[item.addressId];
    return outcome?.kind !== 'located';
  });
  const toReview = queue.filter((item) => outcomes[item.addressId]?.kind !== 'skipped');
  const current =
    queue.find((item) => item.addressId === currentId) ?? toReview[0] ?? queue[0] ?? null;
  const currentOutcome = current ? outcomes[current.addressId] : undefined;
  const lastResult = currentOutcome?.kind === 'tried' ? currentOutcome.result : null;

  // Al cambiar de domicilio, el formulario arranca con su dirección.
  useEffect(() => {
    setDraftAddress(current?.writtenAddress ?? '');
    setDraftLocation('');
    setMessage('');
  }, [current?.addressId, current?.writtenAddress]);

  const locatedNow = Object.values(outcomes).filter((outcome) => outcome.kind === 'located').length;
  const total = pending?.total ?? 0;
  const located = (pending?.located ?? 0) + locatedNow;
  const percent = total === 0 ? 100 : Math.round((located / total) * 100);

  async function locate(
    item: PendingAddress,
    retry?: { address?: string; location?: string },
  ): Promise<LocateResult | null> {
    const response = await apiRequest(`/api/v1/address-locations/${item.addressId}/locate`, {
      body: JSON.stringify({ customerId: item.customerId, ...retry }),
      method: 'POST',
      notify: false,
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return null;
    }
    const result = (await response.json()) as LocateResult;
    setOutcomes((currentOutcomes) => ({
      ...currentOutcomes,
      [item.addressId]:
        result.status === 'located' || result.status === 'already_located'
          ? { kind: 'located' }
          : { kind: 'tried', result },
    }));
    return result;
  }

  /** La pasada automática: de a uno, para no saturar el buscador; se puede frenar. */
  async function runAuto() {
    const targets = toReview.filter((item) => !outcomes[item.addressId]);
    if (targets.length === 0) return;
    stopAuto.current = false;
    setAuto({ done: 0, total: targets.length });
    let resolved = 0;
    for (const [index, item] of targets.entries()) {
      if (stopAuto.current) break;
      const result = await locate(item);
      if (result?.status === 'located') resolved += 1;
      setAuto({ done: index + 1, total: targets.length });
    }
    setAuto(null);
    setCurrentId(null);
    showToast(
      resolved === 0
        ? 'La pasada terminó: lo que queda hay que mirarlo a mano.'
        : `Se ubicaron solos ${String(resolved)}. Lo que queda, uno por uno.`,
    );
  }

  async function retry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const changedAddress =
      draftAddress.trim() !== current.writtenAddress.trim() ? draftAddress.trim() : '';
    setBusy(true);
    setMessage('');
    const result = await locate(current, {
      ...(changedAddress ? { address: changedAddress } : {}),
      ...(draftLocation.trim() ? { location: draftLocation.trim() } : {}),
    });
    setBusy(false);
    if (changedAddress) {
      setPending((state) =>
        state
          ? {
              ...state,
              items: state.items.map((item) =>
                item.addressId === current.addressId
                  ? { ...item, writtenAddress: changedAddress }
                  : item,
              ),
            }
          : state,
      );
    }
    if (result?.status === 'located') goNext();
  }

  async function choose(candidate: Candidate) {
    if (!current || !lastResult?.requestId || !lastResult.addressId) return;
    setBusy(true);
    const response = await apiRequest(
      `/api/v1/customers/${current.customerId}/addresses/${lastResult.addressId}/geocoding/${lastResult.requestId}/confirm`,
      { body: JSON.stringify({ candidateId: candidate.id }), method: 'POST', notify: false },
    );
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setOutcomes((state) => ({ ...state, [current.addressId]: { kind: 'located' } }));
    goNext();
  }

  function skip() {
    if (!current) return;
    setOutcomes((state) => ({ ...state, [current.addressId]: { kind: 'skipped' } }));
    goNext();
  }

  function goNext() {
    if (!current) return;
    const index = queue.findIndex((item) => item.addressId === current.addressId);
    const next =
      queue.slice(index + 1).find((item) => outcomes[item.addressId]?.kind !== 'skipped') ??
      queue.find(
        (item) =>
          item.addressId !== current.addressId && outcomes[item.addressId]?.kind !== 'skipped',
      );
    setCurrentId(next?.addressId ?? null);
  }

  if (failed) return <DashboardFailed label="las ubicaciones" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Ubicaciones</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver domicilios.</p>
        </section>
      </DashboardShell>
    );
  }

  const untried = toReview.filter((item) => !outcomes[item.addressId]).length;
  const candidates = (lastResult?.candidates ?? []) as Candidate[];

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel location-wizard">
        <header>
          <p className="dashboard-kicker">Clientes</p>
          <h1 className="text-2xl font-semibold text-forest">Conciliar ubicaciones</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Que cada domicilio tenga su punto en el mapa: sin eso no entra bien en la hoja de ruta.
          </p>
        </header>

        {pending === null ? (
          <p className="mt-6 text-ink-muted">Buscando domicilios sin ubicación…</p>
        ) : (
          <>
            <div
              aria-label={`${String(located)} de ${String(total)} domicilios con ubicación`}
              className="location-progress"
              role="img"
            >
              <div style={{ width: `${String(percent)}%` }} />
            </div>
            <p className="location-progress-text">
              <strong>{located}</strong> de {total} domicilios con ubicación ({percent}%) ·{' '}
              {queue.length === 0 ? 'no queda ninguno' : `quedan ${String(queue.length)}`}
            </p>

            {queue.length === 0 ? (
              <p className="feed-empty mt-6">
                Todos los domicilios tienen ubicación. 🎉 <Link to="/app">Volver al tablero</Link>
              </p>
            ) : (
              <>
                {/* Paso 1: la pasada automática. */}
                <section className="location-step">
                  <h2>1. Ubicar automáticamente</h2>
                  <p>
                    Busca cada domicilio y deja confirmado lo que el mapa encuentra seguro y dentro
                    de la ciudad. Lo dudoso queda para el paso 2.
                  </p>
                  {auto ? (
                    <div className="location-auto">
                      <span>
                        Ubicando {auto.done} de {auto.total}…
                      </span>
                      <button
                        className="button button-secondary"
                        onClick={() => {
                          stopAuto.current = true;
                        }}
                        type="button"
                      >
                        Frenar
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled={!canEdit || untried === 0}
                      onClick={() => void runAuto()}
                      type="button"
                    >
                      {untried === 0
                        ? 'Ya se intentaron todos'
                        : `Ubicar ${String(untried)} automáticamente`}
                    </button>
                  )}
                </section>

                {/* Paso 2: uno por uno. */}
                <section className="location-step">
                  <h2>2. Revisar uno por uno</h2>
                  <div className="location-layout">
                    <ol className="location-queue" aria-label="Domicilios sin ubicación">
                      {queue.map((item) => {
                        const outcome = outcomes[item.addressId];
                        return (
                          <li key={item.addressId}>
                            <button
                              aria-current={item.addressId === current?.addressId}
                              onClick={() => setCurrentId(item.addressId)}
                              type="button"
                            >
                              <strong>{item.customerName}</strong>
                              <span>{item.writtenAddress}</span>
                              <small>
                                {outcome?.kind === 'skipped'
                                  ? 'Salteado'
                                  : outcome?.kind === 'tried'
                                    ? 'Para revisar'
                                    : item.openOrders > 0
                                      ? `${String(item.openOrders)} ${item.openOrders === 1 ? 'pedido abierto' : 'pedidos abiertos'}`
                                      : 'Sin intentar'}
                              </small>
                            </button>
                          </li>
                        );
                      })}
                    </ol>

                    {current ? (
                      <article className="location-focus" key={current.addressId}>
                        <p className="location-focus-who">
                          <strong>{current.customerName}</strong> · {current.label} ·{' '}
                          {current.zoneName}
                          {current.neighborhoodName ? ` · ${current.neighborhoodName}` : ''}
                        </p>
                        <p className="location-focus-address">{current.writtenAddress}</p>
                        <p className="location-focus-links">
                          <a
                            href={mapsSearch(current.writtenAddress)}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Buscar en Google Maps
                          </a>
                          {current.locationUrl ? (
                            <a href={current.locationUrl} rel="noopener noreferrer" target="_blank">
                              La ubicación que mandó el cliente
                            </a>
                          ) : null}
                          <Link to={`/app/clientes?customerId=${current.customerId}`}>
                            Ficha del cliente
                          </Link>
                        </p>

                        {!lastResult && canEdit ? (
                          <button
                            className="button button-primary"
                            disabled={busy || auto !== null}
                            onClick={() => {
                              setBusy(true);
                              void locate(current).then((result) => {
                                setBusy(false);
                                if (result?.status === 'located') goNext();
                              });
                            }}
                            type="button"
                          >
                            {busy ? 'Buscando…' : 'Buscar en el mapa'}
                          </button>
                        ) : null}

                        {lastResult ? (
                          <p className="location-focus-status">{locateStatusText(lastResult)}</p>
                        ) : null}

                        {candidates.length > 0 ? (
                          <ul className="location-candidates">
                            {candidates.map((candidate) => (
                              <li key={candidate.id}>
                                {candidate.latitude !== undefined &&
                                candidate.longitude !== undefined ? (
                                  <AddressMap
                                    label={candidate.formattedAddress}
                                    latitude={candidate.latitude}
                                    longitude={candidate.longitude}
                                  />
                                ) : null}
                                <p>
                                  {candidate.formattedAddress}{' '}
                                  <small>
                                    ({String(Math.round(candidate.confidence * 100))}% seguro)
                                  </small>
                                </p>
                                <button
                                  className="button button-secondary"
                                  disabled={busy || !canEdit}
                                  onClick={() => void choose(candidate)}
                                  type="button"
                                >
                                  Es ésta
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {canEdit ? (
                          <form className="locate-retry" onSubmit={(event) => void retry(event)}>
                            <label className="field">
                              Dirección (calle y altura)
                              <input
                                minLength={4}
                                onChange={(event) => setDraftAddress(event.target.value)}
                                value={draftAddress}
                              />
                            </label>
                            <label className="field">
                              O pegá la ubicación
                              <input
                                inputMode="url"
                                onChange={(event) => setDraftLocation(event.target.value)}
                                placeholder="Enlace de Google Maps o -34.58, -58.41"
                                value={draftLocation}
                              />
                            </label>
                            <div className="locate-retry-actions">
                              <button
                                className="button button-primary"
                                disabled={
                                  busy ||
                                  (draftAddress.trim() === current.writtenAddress.trim() &&
                                    !draftLocation.trim())
                                }
                                type="submit"
                              >
                                {busy ? 'Buscando…' : 'Buscar con esto'}
                              </button>
                              <button
                                className="button button-secondary"
                                onClick={skip}
                                type="button"
                              >
                                Saltar por ahora
                              </button>
                            </div>
                          </form>
                        ) : null}

                        {message ? (
                          <p className="screen-notice" role="alert">
                            {message}
                          </p>
                        ) : null}
                      </article>
                    ) : null}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
