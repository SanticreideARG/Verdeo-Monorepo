import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AddressMap } from '../components/AddressMap.js';
import { CustomerExportDialog } from '../components/CustomerExportDialog.js';
import { DraftNotice } from '../components/DraftNotice.js';
import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { BrandLoading } from '../components/BrandLoading.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { showToast } from '../lib/toast.js';
import { useFormDraft } from '../lib/useFormDraft.js';
import {
  errorMessage,
  formatMoney,
  orderStatusLabel,
  type AddressGeocodingRequest,
  type CustomerAddress,
  type CustomerDetail,
  type CustomerSummary,
} from '../lib/operations.js';

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function contactLabel(customer: CustomerSummary): string {
  return customer.whatsapp || customer.phone || customer.email || 'Sin contacto visible';
}

function addressStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CANDIDATES: 'Revisar ubicación',
    CONFIRMED: 'Ubicación confirmada',
    GEOCODING: 'Buscando ubicación',
    NEEDS_LOCATION: 'Falta ubicación',
  };
  return labels[status] ?? status;
}

function optional(value: string): string | undefined {
  return value || undefined;
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await errorMessage(response));
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('La respuesta de la API no es válida.');
  }
  return (await response.json()) as T;
}

export function CustomersPage() {
  const navigate = useNavigate();
  // Deep-links a shared customer reference from chat straight to that customer's detail.
  const [searchParams] = useSearchParams();
  const linkedCustomerId = searchParams.get('customerId') ?? '';
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [zones, setZones] = useState<
    { displayName: string; id: string; operatingSiteId: string }[]
  >([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const createFormRef = useRef<HTMLFormElement>(null);
  const createDraft = useFormDraft(createFormRef, 'customer-create', showCreate);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [geocoding, setGeocoding] = useState<Record<string, AddressGeocodingRequest>>({});

  const loadCustomer = useCallback(async (customerId: string) => {
    setDetailLoading(true);
    try {
      const response = await apiRequest(`/api/v1/customers/${customerId}`);
      const loaded = await responseJson<CustomerDetail>(response);
      setDetail(loaded);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadDirectory = useCallback(
    async (query: string, preferredId = '') => {
      const params = new URLSearchParams({ limit: '100' });
      if (query.trim()) params.set('search', query.trim());
      const response = await apiRequest(`/api/v1/customers?${params.toString()}`);
      const page = await responseJson<{ items: CustomerSummary[]; nextCursor: string | null }>(
        response,
      );
      setCustomers(page.items);
      setNextCursor(page.nextCursor);
      const nextSelected = page.items.some(({ id }) => id === preferredId)
        ? preferredId
        : (page.items[0]?.id ?? '');
      setSelectedId(nextSelected);
      if (nextSelected) await loadCustomer(nextSelected);
      else setDetail(null);
    },
    [loadCustomer],
  );

  /**
   * Appends the next page. The directory used to request 100 rows and drop `nextCursor`, which
   * silently made customer 101 unreachable by browsing — and now disagrees with the Excel export,
   * which walks every page.
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor, limit: '100' });
      if (search.trim()) params.set('search', search.trim());
      const response = await apiRequest(`/api/v1/customers?${params.toString()}`);
      const page = await responseJson<{ items: CustomerSummary[]; nextCursor: string | null }>(
        response,
      );
      setCustomers((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar más clientes.');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, search]);

  useEffect(() => {
    let active = true;
    // Always every zone, regardless of the ambient city selected up top — a domicilio can belong
    // to any operation, so the picker has to offer all of them, not just the one currently in scope.
    void apiRequest('/api/v1/zones', { headers: { 'x-verdeo-site': 'global' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('zones');
        const body = (await response.json()) as {
          items: { displayName: string; id: string; operatingSiteId: string }[];
        };
        if (active) setZones(body.items);
      })
      .catch(() => {
        if (active) setZones([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // The ciudad picker defaults to whatever the top bar has selected — asking again would be
  // redundant for the common case — but still lists every zone so a domicilio in another city
  // doesn't require switching the ambient scope first.
  const defaultZoneId =
    zones.find((zone) => zone.operatingSiteId === storedOperatingSiteId())?.id ?? '';
  // Zones load asynchronously, so an empty list only means "no zones" once something has arrived.
  const cityHasNoZones = zones.length > 0 && !defaultZoneId;

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await apiRequest('/api/v1/me');
      if (response.status === 401) {
        await navigate('/login', { replace: true });
        return;
      }
      const loadedProfile = await responseJson<DashboardProfile>(response);
      if (!loadedProfile.permissions.includes('customers.read')) {
        await navigate('/app', { replace: true });
        return;
      }
      if (!active) return;
      setProfile(loadedProfile);
      await loadDirectory('', linkedCustomerId);
      // The default page may not include the linked customer at all (it isn't a search match), so
      // its selection is forced regardless of what loadDirectory picked.
      if (linkedCustomerId && active) {
        setSelectedId(linkedCustomerId);
        await loadCustomer(linkedCustomerId).catch(() => undefined);
      }
    })()
      .catch((error: unknown) => {
        if (active)
          setMessage(error instanceof Error ? error.message : 'No pudimos cargar clientes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [linkedCustomerId, loadCustomer, loadDirectory, navigate]);

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  async function selectCustomer(customerId: string) {
    setSelectedId(customerId);
    setShowCreate(false);
    setMessage('');
    try {
      await loadCustomer(customerId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar el cliente.');
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    try {
      await loadDirectory(search, selectedId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos buscar clientes.');
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const writtenAddress = formText(form, 'writtenAddress');
    const geographicZoneId = formText(form, 'geographicZoneId');
    // An address is entirely optional at intake, but a written address needs a zone to anchor it
    // to (ADR-031) — asking for one without the other would create a half-usable row.
    if (writtenAddress && !geographicZoneId) {
      setMessage('Elegí una zona para el domicilio, o dejá la dirección en blanco.');
      return;
    }
    const restrictions = [
      form.get('noGarlic') === 'on'
        ? { reason: 'Preferencia informada al alta.', type: 'sin_ajo' }
        : null,
      form.get('noSeeds') === 'on'
        ? { reason: 'Preferencia informada al alta.', type: 'sin_semillas' }
        : null,
    ].filter((value) => value !== null);
    try {
      const created = await responseJson<CustomerSummary>(
        await apiRequest('/api/v1/customers', {
          body: JSON.stringify({
            ...(writtenAddress
              ? {
                  addresses: [
                    {
                      geographicZoneId,
                      label: 'Casa',
                      locationUrl: optional(formText(form, 'locationUrl')),
                      primary: true,
                      source: 'manual',
                      writtenAddress,
                    },
                  ],
                }
              : {}),
            displayName: formText(form, 'displayName'),
            email: optional(formText(form, 'email')),
            firstName: optional(formText(form, 'firstName')),
            internalNotes: optional(formText(form, 'internalNotes')),
            lastName: optional(formText(form, 'lastName')),
            phone: optional(formText(form, 'phone')),
            restrictions,
          }),
          method: 'POST',
        }),
      );
      target.reset();
      createDraft.discard();
      setShowCreate(false);
      setSearch('');
      await loadDirectory('', created.id);
      showToast('Cliente registrado. Ya podés completar sus contactos y domicilios.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos registrar el cliente.');
    }
  }

  async function importContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) {
      setMessage('Elegí un archivo CSV o Excel (.xlsx) para continuar.');
      return;
    }
    setImporting(true);
    try {
      const body = new FormData();
      body.set('file', importFile);
      const result = await responseJson<{ imported: number }>(
        await apiRequest('/api/v1/customers/import', { body, method: 'POST' }),
      );
      setShowImport(false);
      setImportFile(null);
      setSearch('');
      await loadDirectory('');
      showToast(
        `${result.imported} contacto${result.imported === 1 ? '' : 's'} importado${result.imported === 1 ? '' : 's'} correctamente.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos importar los contactos.');
    } finally {
      setImporting(false);
    }
  }

  async function updateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    try {
      await responseJson<CustomerDetail>(
        await apiRequest(`/api/v1/customers/${detail.id}`, {
          body: JSON.stringify({
            displayName: formText(form, 'displayName'),
            firstName: formText(form, 'firstName') || null,
            internalNotes: formText(form, 'internalNotes') || null,
            lastName: formText(form, 'lastName') || null,
            status: formText(form, 'status'),
          }),
          method: 'PATCH',
        }),
      );
      await loadDirectory(search, detail.id);
      showToast('Ficha del cliente actualizada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos actualizar el cliente.');
    }
  }

  async function addIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const target = event.currentTarget;
    const form = new FormData(target);
    try {
      await responseJson(
        await apiRequest(`/api/v1/customers/${detail.id}/identities`, {
          body: JSON.stringify({
            primary: form.get('primary') === 'on',
            source: 'manual',
            type: formText(form, 'type'),
            value: formText(form, 'value'),
            verified: false,
          }),
          method: 'POST',
        }),
      );
      target.reset();
      await loadCustomer(detail.id);
      showToast('Contacto agregado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos agregar el contacto.');
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const target = event.currentTarget;
    const form = new FormData(target);
    try {
      await responseJson<CustomerAddress>(
        await apiRequest(`/api/v1/customers/${detail.id}/addresses`, {
          body: JSON.stringify({
            accessNotes: optional(formText(form, 'accessNotes')),
            geographicZoneId: formText(form, 'geographicZoneId'),
            label: formText(form, 'label'),
            locationUrl: optional(formText(form, 'locationUrl')),
            operationalZone: optional(formText(form, 'operationalZone')),
            primary: form.get('primary') === 'on',
            propertyType: optional(formText(form, 'propertyType')),
            sector: optional(formText(form, 'sector')),
            source: 'manual',
            unit: optional(formText(form, 'unit')),
            writtenAddress: formText(form, 'writtenAddress'),
          }),
          method: 'POST',
        }),
      );
      target.reset();
      await loadCustomer(detail.id);
      showToast('Domicilio agregado. Confirmá su ubicación antes de usarlo operativamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos agregar el domicilio.');
    }
  }

  async function startGeocoding(address: CustomerAddress) {
    if (!detail) return;
    setMessage('');
    try {
      const request = await responseJson<AddressGeocodingRequest>(
        await apiRequest(`/api/v1/customers/${detail.id}/addresses/${address.id}/geocoding`, {
          body: JSON.stringify({ idempotencyKey: `web-${address.id}-${crypto.randomUUID()}` }),
          method: 'POST',
        }),
      );
      setGeocoding((current) => ({ ...current, [address.id]: request }));
      await loadCustomer(detail.id);
      setMessage(
        request.status === 'CANDIDATES'
          ? 'Revisá y confirmá la ubicación encontrada.'
          : 'No encontramos coordenadas automáticas. Podés cargarlas manualmente.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos buscar la ubicación.');
    }
  }

  async function confirmCandidate(address: CustomerAddress, candidateId: string) {
    const request = geocoding[address.id];
    if (!detail || !request) return;
    try {
      await responseJson<CustomerAddress>(
        await apiRequest(
          `/api/v1/customers/${detail.id}/addresses/${address.id}/geocoding/${request.id}/confirm`,
          { body: JSON.stringify({ candidateId }), method: 'POST' },
        ),
      );
      setGeocoding((current) => {
        const next = { ...current };
        delete next[address.id];
        return next;
      });
      await loadCustomer(detail.id);
      showToast('Ubicación confirmada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos confirmar la ubicación.');
    }
  }

  async function confirmManualLocation(
    event: FormEvent<HTMLFormElement>,
    address: CustomerAddress,
  ) {
    event.preventDefault();
    const request = geocoding[address.id];
    if (!detail || !request) return;
    const form = new FormData(event.currentTarget);
    try {
      await responseJson<CustomerAddress>(
        await apiRequest(
          `/api/v1/customers/${detail.id}/addresses/${address.id}/geocoding/${request.id}/confirm`,
          {
            body: JSON.stringify({
              city: formText(form, 'city') || null,
              latitude: Number(formText(form, 'latitude')),
              locationUrl: formText(form, 'locationUrl') || null,
              longitude: Number(formText(form, 'longitude')),
              operationalZone: formText(form, 'operationalZone') || null,
              sector: formText(form, 'sector') || null,
            }),
            method: 'POST',
          },
        ),
      );
      setGeocoding((current) => {
        const next = { ...current };
        delete next[address.id];
        return next;
      });
      await loadCustomer(detail.id);
      showToast('Coordenadas corregidas y confirmadas.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos confirmar las coordenadas.');
    }
  }

  async function rejectGeocoding(address: CustomerAddress) {
    const request = geocoding[address.id];
    if (!detail || !request) return;
    const reason = window.prompt('Indicá por qué descartás esta ubicación')?.trim();
    if (!reason) return;
    try {
      await responseJson<AddressGeocodingRequest>(
        await apiRequest(
          `/api/v1/customers/${detail.id}/addresses/${address.id}/geocoding/${request.id}/reject`,
          { body: JSON.stringify({ reason }), method: 'POST' },
        ),
      );
      setGeocoding((current) => {
        const next = { ...current };
        delete next[address.id];
        return next;
      });
      await loadCustomer(detail.id);
      showToast('Ubicación descartada; el domicilio continúa pendiente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos descartar la ubicación.');
    }
  }

  if (loading || !profile) {
    if (!loading && !profile) {
      return (
        <main className="grid min-h-screen place-items-center bg-cream px-5 text-center">
          <div>
            <p className="eyebrow">CRM Verdeo</p>
            <h1 className="mt-4 text-3xl font-semibold text-forest">No pudimos cargar clientes.</h1>
            <p className="mt-3 text-ink-muted">{message || 'Revisá la conexión con la API.'}</p>
            <button className="button button-primary mt-7" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        </main>
      );
    }
    return <BrandLoading message="Cargando tu espacio…" />;
  }

  const canCreate = profile.permissions.includes('customers.create');
  const canEdit =
    profile.permissions.includes('customers.edit') &&
    profile.permissions.includes('customers.view_sensitive');

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <div className="crm-workspace">
        <header className="crm-heading">
          <div>
            <p className="eyebrow">CRM operativo</p>
            <h1>Clientes</h1>
            <p>Contactos, domicilios y pedidos en una única ficha trazable.</p>
          </div>
          <div className="crm-heading-actions">
            <button className="button button-secondary" onClick={() => setShowExport(true)}>
              Exportar a Excel
            </button>
            {canCreate ? (
              <button className="button button-primary" onClick={() => setShowCreate(true)}>
                Nuevo cliente
              </button>
            ) : null}
          </div>
        </header>

        {message ? (
          <p className="crm-message" role="status">
            {message}
          </p>
        ) : null}

        <div className="crm-layout">
          <aside className="crm-directory">
            <form className="crm-search" onSubmit={(event) => void submitSearch(event)}>
              <input
                aria-label="Buscar clientes"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre o contacto"
                type="search"
                value={search}
              />
              <button type="submit">Buscar</button>
            </form>
            <div className="crm-directory-meta">
              <span>
                {customers.length} cliente{customers.length === 1 ? '' : 's'}
                {nextCursor ? ' (hay más)' : ''}
              </span>
              <button onClick={() => void loadDirectory(search, selectedId)} type="button">
                Actualizar
              </button>
            </div>
            <div className="crm-customer-list">
              {customers.map((customer) => (
                <button
                  className={selectedId === customer.id && !showCreate ? 'is-active' : ''}
                  key={customer.id}
                  onClick={() => void selectCustomer(customer.id)}
                  type="button"
                >
                  <span>{customer.displayName.slice(0, 1).toLocaleUpperCase('es-AR')}</span>
                  <div>
                    <strong>{customer.displayName}</strong>
                    <small>{contactLabel(customer)}</small>
                  </div>
                  <i>{customer.status}</i>
                </button>
              ))}
              {customers.length === 0 ? <p>No hay clientes para esta búsqueda.</p> : null}
              {nextCursor ? (
                <button
                  className="crm-load-more"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  type="button"
                >
                  {loadingMore ? 'Cargando…' : 'Cargar más clientes'}
                </button>
              ) : null}
            </div>
          </aside>

          <section className="crm-detail">
            {showCreate ? (
              <form
                className="crm-panel"
                onSubmit={(event) => void createCustomer(event)}
                ref={createFormRef}
              >
                <div className="crm-panel-heading">
                  <div>
                    <small>Alta de CRM</small>
                    <h2>Nuevo cliente</h2>
                  </div>
                  <button onClick={() => setShowCreate(false)} type="button">
                    Cancelar
                  </button>
                </div>
                {createDraft.restored ? (
                  <DraftNotice onDiscard={createDraft.dismissNotice} />
                ) : null}
                {!storedOperatingSiteId() ? (
                  <p className="mb-4 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest">
                    Elegí una ciudad en la barra superior antes de cargar un cliente: todo cliente
                    pertenece a una operación.
                  </p>
                ) : cityHasNoZones ? (
                  // A city with no zones silently blocks the alta: a domicilio requires a zone, so
                  // the form would fail on save with nothing explaining why. Say so up front and
                  // point at where it gets fixed.
                  <p className="mb-4 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest">
                    Esta ciudad todavía no tiene zonas geográficas cargadas, así que no se le puede
                    asignar un domicilio. Creá una en Ajustes → Zonas geográficas y volvé.
                  </p>
                ) : null}
                <div className="form-grid">
                  <label className="field field-wide">
                    Nombre visible
                    <input name="displayName" required />
                  </label>
                  <label className="field">
                    Nombre
                    <input name="firstName" />
                  </label>
                  <label className="field">
                    Apellido
                    <input name="lastName" />
                  </label>
                  <label className="field">
                    Email
                    <input name="email" type="email" />
                  </label>
                  <label className="field">
                    Teléfono
                    <input name="phone" />
                  </label>
                  <label className="field field-wide">
                    Dirección
                    <input name="writtenAddress" placeholder="Calle y número" />
                  </label>
                  <label className="field">
                    Ciudad
                    <select defaultValue={defaultZoneId} name="geographicZoneId">
                      <option value="">Sin definir</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Ubicación (link de GPS/Maps)
                    <input name="locationUrl" placeholder="https://maps.google.com/…" type="url" />
                  </label>
                  <label className="field field-wide">
                    Notas internas
                    <textarea name="internalNotes" rows={4} />
                  </label>
                </div>
                <fieldset className="mt-4 flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input name="noGarlic" type="checkbox" />
                    Sin ajo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input name="noSeeds" type="checkbox" />
                    Sin semillas
                  </label>
                </fieldset>
                <div className="form-actions mt-4">
                  <button
                    className="button button-primary"
                    disabled={!storedOperatingSiteId()}
                    type="submit"
                  >
                    Crear ficha
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={createDraft.clear}
                    type="button"
                  >
                    Limpiar
                  </button>
                </div>
              </form>
            ) : detailLoading ? (
              <div className="crm-panel crm-panel-empty">Cargando ficha…</div>
            ) : detail ? (
              <div className="crm-detail-stack">
                <section className="crm-profile-card">
                  <div className="crm-profile-avatar">
                    {detail.displayName.slice(0, 1).toLocaleUpperCase('es-AR')}
                  </div>
                  <div>
                    <span className="status-chip">{detail.status}</span>
                    <h2>{detail.displayName}</h2>
                    <p>
                      Cliente desde{' '}
                      {new Intl.DateTimeFormat('es-AR').format(new Date(detail.createdAt))}
                    </p>
                  </div>
                  <div className="crm-profile-metrics">
                    <span>
                      <strong>{detail.orders.length}</strong> pedidos
                    </span>
                    <span>
                      <strong>
                        {detail.addresses?.filter(({ active }) => active).length ?? 0}
                      </strong>{' '}
                      domicilios
                    </span>
                    <span>
                      <strong>
                        {detail.identities?.filter(({ active }) => active).length ?? 0}
                      </strong>{' '}
                      contactos
                    </span>
                  </div>
                </section>

                {canEdit ? (
                  <details className="crm-panel crm-collapsible">
                    <summary>Editar información general</summary>
                    <form onSubmit={(event) => void updateCustomer(event)}>
                      <div className="form-grid">
                        <label className="field field-wide">
                          Nombre visible
                          <input defaultValue={detail.displayName} name="displayName" required />
                        </label>
                        <label className="field">
                          Nombre
                          <input defaultValue={detail.firstName ?? ''} name="firstName" />
                        </label>
                        <label className="field">
                          Apellido
                          <input defaultValue={detail.lastName ?? ''} name="lastName" />
                        </label>
                        <label className="field">
                          Estado
                          <input defaultValue={detail.status} name="status" required />
                        </label>
                        <label className="field field-wide">
                          Notas internas
                          <textarea
                            defaultValue={detail.internalNotes ?? ''}
                            name="internalNotes"
                            rows={3}
                          />
                        </label>
                      </div>
                      <button className="button button-primary" type="submit">
                        Guardar cambios
                      </button>
                    </form>
                  </details>
                ) : null}

                <section className="crm-panel">
                  <div className="crm-panel-heading">
                    <div>
                      <small>Canales</small>
                      <h2>Contactos</h2>
                    </div>
                  </div>
                  <div className="crm-contact-grid">
                    {detail.identities?.map((identity) => (
                      <article key={identity.id}>
                        <span>{identity.type}</span>
                        <strong>{identity.value}</strong>
                        <small>
                          {identity.primary ? 'Principal' : 'Alternativo'} ·{' '}
                          {identity.verified ? 'verificado' : 'sin verificar'}
                        </small>
                      </article>
                    ))}
                  </div>
                  {canEdit ? (
                    <details className="crm-inline-form">
                      <summary>Agregar contacto</summary>
                      <form onSubmit={(event) => void addIdentity(event)}>
                        <label className="field">
                          Tipo
                          <input
                            list="identity-types"
                            name="type"
                            placeholder="whatsapp"
                            required
                          />
                          <datalist id="identity-types">
                            <option value="whatsapp" />
                            <option value="phone" />
                            <option value="email" />
                          </datalist>
                        </label>
                        <label className="field">
                          Valor
                          <input name="value" required />
                        </label>
                        <label className="crm-check">
                          <input name="primary" type="checkbox" /> Contacto principal
                        </label>
                        <button className="button button-primary" type="submit">
                          Agregar
                        </button>
                      </form>
                    </details>
                  ) : null}
                </section>

                <section className="crm-panel">
                  <div className="crm-panel-heading">
                    <div>
                      <small>Logística CRM</small>
                      <h2>Domicilios</h2>
                    </div>
                  </div>
                  <div className="crm-address-grid">
                    {detail.addresses?.map((address) => {
                      const request = geocoding[address.id];
                      return (
                        <article className="crm-address-card" key={address.id}>
                          <div className="crm-address-top">
                            <div>
                              <span>{address.label}</span>
                              {address.primary ? <small>Principal</small> : null}
                              {/* Whether the customer wrote this address themselves changes how
                                  much an operator should second-guess it before correcting. */}
                              {address.source === 'customer' ? (
                                <small>La cargó el cliente</small>
                              ) : null}
                            </div>
                            <i data-status={address.geocodingStatus}>
                              {addressStatusLabel(address.geocodingStatus)}
                            </i>
                          </div>
                          <h3>{address.writtenAddress}</h3>
                          <p>
                            {[address.unit, address.city, address.sector, address.operationalZone]
                              .filter(Boolean)
                              .join(' · ') || 'Sin datos territoriales adicionales'}
                          </p>
                          {address.accessNotes ? (
                            <p className="crm-address-note">Acceso: {address.accessNotes}</p>
                          ) : null}
                          {address.latitude !== null && address.longitude !== null ? (
                            <>
                              <code>
                                {address.latitude.toFixed(6)}, {address.longitude.toFixed(6)}
                              </code>
                              <AddressMap
                                label={address.writtenAddress}
                                latitude={address.latitude}
                                longitude={address.longitude}
                              />
                            </>
                          ) : null}
                          <div className="crm-address-actions">
                            {address.locationUrl ? (
                              <a href={address.locationUrl} rel="noreferrer" target="_blank">
                                Abrir mapa
                              </a>
                            ) : null}
                            {canEdit && address.geocodingStatus !== 'CONFIRMED' ? (
                              <button onClick={() => void startGeocoding(address)} type="button">
                                Validar ubicación
                              </button>
                            ) : null}
                          </div>
                          {request ? (
                            <div className="crm-geocoding-box">
                              <strong>
                                {request.status === 'CANDIDATES'
                                  ? 'Ubicaciones encontradas'
                                  : 'Corrección manual'}
                              </strong>
                              {request.candidates.map((candidate) => (
                                <div className="crm-candidate" key={candidate.id}>
                                  <div>
                                    <span>{candidate.formattedAddress}</span>
                                    <code>
                                      {candidate.latitude.toFixed(6)},{' '}
                                      {candidate.longitude.toFixed(6)}
                                    </code>
                                    {/* Seeing the candidate on a map is the whole point of this
                                        screen: two candidates for the same street differ by digits
                                        nobody can eyeball, but they are obvious on a map. */}
                                    <AddressMap
                                      label={candidate.formattedAddress}
                                      latitude={candidate.latitude}
                                      longitude={candidate.longitude}
                                    />
                                  </div>
                                  <button
                                    onClick={() => void confirmCandidate(address, candidate.id)}
                                    type="button"
                                  >
                                    Confirmar
                                  </button>
                                </div>
                              ))}
                              {request.status !== 'CANDIDATES' ||
                              request.candidates.length === 0 ? (
                                <form
                                  className="crm-manual-location"
                                  onSubmit={(event) => void confirmManualLocation(event, address)}
                                >
                                  <label className="field">
                                    Latitud
                                    <input
                                      name="latitude"
                                      step="any"
                                      type="number"
                                      min="-90"
                                      max="90"
                                      required
                                    />
                                  </label>
                                  <label className="field">
                                    Longitud
                                    <input
                                      name="longitude"
                                      step="any"
                                      type="number"
                                      min="-180"
                                      max="180"
                                      required
                                    />
                                  </label>
                                  <label className="field">
                                    Ciudad
                                    <input defaultValue={address.city ?? ''} name="city" />
                                  </label>
                                  <label className="field">
                                    Sector
                                    <input defaultValue={address.sector ?? ''} name="sector" />
                                  </label>
                                  <label className="field">
                                    Zona operativa
                                    <input
                                      defaultValue={address.operationalZone ?? ''}
                                      name="operationalZone"
                                    />
                                  </label>
                                  <label className="field">
                                    Enlace
                                    <input
                                      defaultValue={address.locationUrl ?? ''}
                                      name="locationUrl"
                                      type="url"
                                    />
                                  </label>
                                  <button className="button button-primary" type="submit">
                                    Confirmar corrección
                                  </button>
                                </form>
                              ) : null}
                              <button
                                className="crm-reject"
                                onClick={() => void rejectGeocoding(address)}
                                type="button"
                              >
                                Descartar solicitud
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  {canEdit ? (
                    <details className="crm-inline-form">
                      <summary>Agregar domicilio</summary>
                      <form onSubmit={(event) => void addAddress(event)}>
                        <label className="field">
                          Etiqueta
                          <input name="label" placeholder="Casa, oficina…" required />
                        </label>
                        <label className="field field-wide">
                          Dirección escrita
                          <input name="writtenAddress" minLength={4} required />
                        </label>
                        <label className="field field-wide">
                          Enlace de ubicación
                          <input
                            name="locationUrl"
                            type="url"
                            placeholder="https://maps.google.com/…"
                          />
                        </label>
                        <label className="field">
                          Sector
                          <input name="sector" />
                        </label>
                        <label className="field">
                          Ciudad
                          <select defaultValue={defaultZoneId} name="geographicZoneId" required>
                            <option value="">Elegí una ciudad</option>
                            {zones.map((zone) => (
                              <option key={zone.id} value={zone.id}>
                                {zone.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Tipo de propiedad
                          <input name="propertyType" />
                        </label>
                        <label className="field">
                          Unidad / piso
                          <input name="unit" />
                        </label>
                        <label className="field field-wide">
                          Indicaciones de acceso
                          <textarea name="accessNotes" rows={2} />
                        </label>
                        <label className="crm-check">
                          <input defaultChecked name="primary" type="checkbox" /> Domicilio
                          principal
                        </label>
                        <button className="button button-primary" type="submit">
                          Agregar domicilio
                        </button>
                      </form>
                    </details>
                  ) : null}
                </section>

                <section className="crm-panel">
                  <div className="crm-panel-heading">
                    <div>
                      <small>Historial comercial</small>
                      <h2>Pedidos asociados</h2>
                    </div>
                    <span>{detail.orders.length}</span>
                  </div>
                  <div className="crm-orders">
                    {detail.orders.map((order) => (
                      <article key={order.id}>
                        <strong>{order.publicNumber}</strong>
                        <span className="status-chip">{orderStatusLabel(order.status)}</span>
                        <span>
                          {new Intl.DateTimeFormat('es-AR').format(
                            new Date(`${order.deliveryDate}T12:00:00`),
                          )}
                        </span>
                        <b>{formatMoney(order.totalMinor, order.currency)}</b>
                      </article>
                    ))}
                    {detail.orders.length === 0 ? (
                      <p>Este cliente todavía no tiene pedidos.</p>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : (
              <div className="crm-panel crm-panel-empty">
                Seleccioná un cliente para abrir su ficha.
              </div>
            )}
          </section>
        </div>

        {canCreate ? (
          <section className="crm-import-section">
            <div>
              <p className="eyebrow">Carga masiva</p>
              <h2>Importar contactos</h2>
              <p>
                Sumá hasta 500 clientes desde una planilla. La carga se valida completa antes de
                guardar cualquier ficha.
              </p>
            </div>
            <button className="button button-secondary" onClick={() => setShowImport(true)}>
              Importar archivo
            </button>
          </section>
        ) : null}

        {showExport ? (
          <CustomerExportDialog onClose={() => setShowExport(false)} search={search} />
        ) : null}

        {showImport ? (
          <div
            aria-labelledby="contact-import-title"
            className="crm-import-backdrop"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target && !importing) setShowImport(false);
            }}
            role="presentation"
          >
            <section aria-modal="true" className="crm-import-dialog" role="dialog">
              <div className="crm-panel-heading">
                <div>
                  <small>Carga masiva de CRM</small>
                  <h2 id="contact-import-title">Importar contactos</h2>
                </div>
                <button disabled={importing} onClick={() => setShowImport(false)} type="button">
                  Cerrar
                </button>
              </div>
              <p className="crm-import-intro">
                Aceptamos CSV UTF-8 o Excel <code>.xlsx</code>. No se aceptan archivos XML. La
                primera hoja y hasta 500 filas se procesan en una única operación.
              </p>
              <div className="crm-import-columns">
                <div>
                  <strong>Columna</strong>
                  <strong>Uso</strong>
                </div>
                <div>
                  <code>nombre_completo</code>
                  <span>Obligatoria. Nombre visible del cliente.</span>
                </div>
                <div>
                  <code>whatsapp</code>
                  <span>Opcional. Se registra como contacto WhatsApp sin verificar.</span>
                </div>
                <div>
                  <code>telefono</code>
                  <span>Opcional. Teléfono alternativo.</span>
                </div>
                <div>
                  <code>email</code>
                  <span>Opcional. Correo electrónico.</span>
                </div>
                <div>
                  <code>direccion</code>
                  <span>Opcional. Crea un domicilio pendiente de validar.</span>
                </div>
                <div>
                  <code>enlace_ubicacion</code>
                  <span>Opcional. URL de mapa del domicilio.</span>
                </div>
              </div>
              <p className="crm-import-note">
                Podés usar también <code>nombre_visible</code>, <code>correo</code>,{' '}
                <code>phone</code> o <code>domicilio</code>. Un contacto repetido o una fila con
                formato inválido detiene la importación sin crear registros parciales.
              </p>
              <form className="crm-import-form" onSubmit={(event) => void importContacts(event)}>
                <label className="field field-wide">
                  Archivo de contactos
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                </label>
                {importFile ? (
                  <span className="crm-import-file">Seleccionado: {importFile.name}</span>
                ) : null}
                <button className="button button-primary" disabled={importing} type="submit">
                  {importing ? 'Importando…' : 'Validar e importar'}
                </button>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
