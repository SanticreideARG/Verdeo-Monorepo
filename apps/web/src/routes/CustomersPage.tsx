import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AddressMap } from '../components/AddressMap.js';
import { LocateOrderControl } from '../components/LocateAddress.js';
import { AfterSaveDialog } from '../components/AfterSaveDialog.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { CustomerExportDialog } from '../components/CustomerExportDialog.js';
import { CustomerTable } from '../components/CustomerTable.js';
import { MergeCustomersDialog } from '../components/MergeCustomersDialog.js';
import { DraftNotice } from '../components/DraftNotice.js';
import {
  ImportReconciliation,
  type CustomerImportRow,
} from '../components/ImportReconciliation.js';
import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { BrandLoading } from '../components/BrandLoading.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { cachedProfile, rememberProfile } from '../lib/useDashboardProfile.js';
import {
  CUSTOMER_SORTS,
  NO_FILTERS,
  activeFilterCount,
  customerListParams,
  readCustomerSort,
  readCustomerView,
  sinceLabel,
  writeCustomerSort,
  writeCustomerView,
  type CustomerFilters,
  type CustomerSort,
  type CustomerView,
} from '../lib/customerBrowse.js';
import { formatArgentinePhone, phoneKey, whatsappHref } from '../lib/phone.js';
import { showToast } from '../lib/toast.js';
import { MoveSiteDialog } from '../components/MoveSiteDialog.js';
import { useFormDraft } from '../lib/useFormDraft.js';
import {
  CUSTOMER_STATUSES,
  customerStatusLabel,
  errorMessage,
  formatMoney,
  orderStatusLabel,
  type AddressGeocodingRequest,
  type CustomerAddress,
  type CustomerDetail,
  type CustomerSummary,
} from '../lib/operations.js';

/** De los pedidos, las direcciones sin domicilio guardado: una por texto, la más reciente. */
function unsavedOrderAddresses(orders: CustomerDetail['orders']) {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = order.unsavedAddress?.trim().toLowerCase();
    if (!key || order.status === 'CANCELLED' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

type ContactIdentity = NonNullable<CustomerDetail['identities']>[number];

const CONTACT_TYPE_LABELS: Record<string, string> = {
  email: 'Correo',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
};
const contactTypeLabel = (type: string) => CONTACT_TYPE_LABELS[type] ?? type;

/**
 * Teléfono y WhatsApp del mismo número, en una sola tarjeta (2026-11-07): el importador guarda los
 * dos y la ficha mostraba el mismo número dos veces. Sólo se juntan en pantalla; en la base siguen
 * siendo dos contactos, así nada se pierde. La tarjeta muestra el principal si alguno lo es.
 */
function contactCards(
  identities: readonly ContactIdentity[],
): { identity: ContactIdentity; types: string[] }[] {
  const cards: { identity: ContactIdentity; key: string | null; types: string[] }[] = [];
  for (const identity of identities) {
    const key =
      identity.type === 'phone' || identity.type === 'whatsapp' ? phoneKey(identity.value) : null;
    const same = key ? cards.find((card) => card.key === key) : undefined;
    if (!same) {
      cards.push({ identity, key, types: [identity.type] });
      continue;
    }
    if (!same.types.includes(identity.type)) same.types.push(identity.type);
    if (identity.primary && !same.identity.primary) same.identity = identity;
  }
  // Teléfono antes que WhatsApp en el rótulo, siempre en el mismo orden.
  return cards.map(({ identity, types }) => ({
    identity,
    types: [...types].sort((a, b) => (a === 'phone' ? -1 : b === 'phone' ? 1 : 0)),
  }));
}

export function CustomersPage() {
  const navigate = useNavigate();
  // Deep-links a shared customer reference from chat straight to that customer's detail.
  const [searchParams] = useSearchParams();
  const linkedCustomerId = searchParams.get('customerId') ?? '';
  const [profile, setProfile] = useState<DashboardProfile | null>(cachedProfile);
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
  // Cliente recién creado: mientras haya uno, el diálogo pregunta qué sigue.
  const [savedCustomer, setSavedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  // Desde dónde sigue la lista; null si ya está toda (Clientes 2 pagina por desplazamiento).
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  // Cuántos clientes hay con la búsqueda y los filtros puestos.
  const [total, setTotal] = useState<number | null>(null);
  // Clientes 2 (2026-11-07): orden, filtros y vista. El orden y la vista se recuerdan.
  const [sort, setSort] = useState<CustomerSort>(readCustomerSort);
  const [filters, setFilters] = useState<CustomerFilters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<CustomerView>(readCustomerView);
  // En la vista Columnas la ficha se abre como panel lateral, a pedido.
  const [detailOpen, setDetailOpen] = useState(false);
  const browseRef = useRef({ filters, sort });
  browseRef.current = { filters, sort };
  const listEndRef = useRef<HTMLDivElement>(null);
  const loadedCount = customers.length;
  const [loadingMore, setLoadingMore] = useState(false);
  const createFormRef = useRef<HTMLFormElement>(null);
  const createDraft = useFormDraft(createFormRef, 'customer-create', showCreate);
  const [importFile, setImportFile] = useState<File | null>(null);
  // Si los contactos de la planilla son clientes nuevos; si no, entran como cartera (2026-10-27).
  const [importAsNew, setImportAsNew] = useState(false);
  const [importing, setImporting] = useState(false);
  // El error de la importación se muestra dentro del diálogo: el aviso general queda tapado.
  const [importError, setImportError] = useState('');
  // La conciliación de la planilla antes de importar, y lo que quedó después.
  const [importReview, setImportReview] = useState<{
    rows: CustomerImportRow[];
    zoneId: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<CustomerImportRow[] | null>(null);
  const [message, setMessage] = useState('');
  // Eliminar es a un clic de distancia y no vuelve: se pregunta antes.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // El domicilio a eliminar, mientras se confirma (2026-11-05).
  const [removingAddress, setRemovingAddress] = useState<CustomerAddress | null>(null);
  const [geocoding, setGeocoding] = useState<Record<string, AddressGeocodingRequest>>({});

  const [debt, setDebt] = useState<{ count: number; currency: string; totalMinor: number } | null>(
    null,
  );
  const [movingSite, setMovingSite] = useState(false);

  /** Marcar o desmarcar "NUEVO" a mano. */
  async function setNewOverride(isNew: boolean) {
    if (!detail) return;
    const response = await apiRequest(`/api/v1/customers/${detail.id}`, {
      body: JSON.stringify({ isNewOverride: isNew }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadCustomer(detail.id);
  }
  const loadCustomer = useCallback(async (customerId: string) => {
    setDetailLoading(true);
    try {
      const response = await apiRequest(`/api/v1/customers/${customerId}`);
      const loaded = await responseJson<CustomerDetail>(response);
      setDetail(loaded);
      // Lo que debe de períodos cerrados: una línea arriba de sus pedidos.
      setDebt(null);
      void apiRequest(`/api/v1/receivables?customerId=${customerId}`, { background: true })
        .then(async (debtResponse) => {
          if (!debtResponse.ok) return;
          const body = (await debtResponse.json()) as {
            items: { orders: { currency: string }[]; totalMinor: number }[];
          };
          const entry = body.items[0];
          setDebt(
            entry
              ? {
                  count: entry.orders.length,
                  currency: entry.orders[0]?.currency ?? 'ARS',
                  totalMinor: entry.totalMinor,
                }
              : null,
          );
        })
        .catch(() => undefined);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadDirectory = useCallback(
    async (query: string, preferredId = '') => {
      const params = customerListParams({
        ...browseRef.current,
        limit: 100,
        offset: 0,
        search: query,
      });
      const response = await apiRequest(`/api/v1/customers?${params.toString()}`);
      const page = await responseJson<{
        items: CustomerSummary[];
        nextOffset: number | null;
        total?: number | null;
      }>(response);
      setCustomers(page.items);
      setNextOffset(page.nextOffset);
      setTotal(page.total ?? (page.nextOffset === null ? page.items.length : null));
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
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = customerListParams({
        ...browseRef.current,
        limit: 100,
        offset: nextOffset,
        search,
      });
      const response = await apiRequest(`/api/v1/customers?${params.toString()}`);
      const page = await responseJson<{ items: CustomerSummary[]; nextOffset: number | null }>(
        response,
      );
      setCustomers((current) => [...current, ...page.items]);
      if (page.nextOffset === null) setTotal((known) => known ?? loadedCount + page.items.length);
      setNextOffset(page.nextOffset);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar más clientes.');
    } finally {
      setLoadingMore(false);
    }
  }, [loadedCount, loadingMore, nextOffset, search]);

  /*
   * La lista completa, cargándose sola al bajar (2026-11-07): cuando el final de la lista asoma,
   * pide la página siguiente. Escucha cualquier scroll de la página (la lista en escritorio, la
   * página en el teléfono, la tabla en Columnas) y no un IntersectionObserver, que en una pestaña
   * en segundo plano no avisa. El botón "Cargar más" queda igual.
   */
  useEffect(() => {
    if (nextOffset === null) return;
    const check = () => {
      const end = listEndRef.current;
      if (!end) return;
      const list = end.closest('.crm-customer-list');
      const scrolls = list && list.scrollHeight > list.clientHeight;
      const bottom = scrolls ? list.getBoundingClientRect().bottom : window.innerHeight;
      if (end.getBoundingClientRect().top < bottom + 400) void loadMore();
    };
    document.addEventListener('scroll', check, { capture: true, passive: true });
    check();
    return () => document.removeEventListener('scroll', check, { capture: true });
  }, [loadMore, nextOffset, view]);

  // Cambiar el orden o un filtro vuelve a pedir la lista desde el principio.
  const browseKey = `${sort}|${JSON.stringify(filters)}`;
  const firstBrowse = useRef(browseKey);
  useEffect(() => {
    if (firstBrowse.current === browseKey) return;
    firstBrowse.current = browseKey;
    void loadDirectory(search, selectedId).catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar clientes.'),
    );
    // Sólo cuando cambian el orden o los filtros; la búsqueda se manda con "Buscar".
  }, [browseKey]);

  // La ficha lateral de Columnas se cierra con Escape, como un diálogo.
  useEffect(() => {
    if (!detailOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.modal-backdrop'))
        setDetailOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailOpen]);

  function chooseSort(next: CustomerSort) {
    setSort(next);
    writeCustomerSort(next);
  }

  function chooseView(next: CustomerView) {
    setView(next);
    setDetailOpen(false);
    writeCustomerView(next);
  }

  function setFilter<K extends keyof CustomerFilters>(key: K, value: CustomerFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

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

  // Las operaciones, para importar una entera (2026-11-05). Sólo las que tienen zonas.
  const [allSites, setAllSites] = useState<{ displayName: string; id: string }[]>([]);
  useEffect(() => {
    void apiRequest('/api/v1/scope').then(async (response) => {
      if (!response.ok) return;
      setAllSites(
        ((await response.json()) as { sites: { displayName: string; id: string }[] }).sites,
      );
    });
  }, []);
  const importSites = allSites.filter((site) =>
    zones.some((zone) => zone.operatingSiteId === site.id),
  );

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
      rememberProfile(loadedProfile);
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
                      unit: optional(formText(form, 'addressLine2')),
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
      createDraft.discard();
      setSearch('');
      /*
       * Con domicilio, se busca en el mapa enseguida: al abrir la ficha ya están los lugares
       * encontrados para confirmar (pedido 2026-11-07). Si falla, queda "Actualizar ubicación".
       */
      if (writtenAddress) {
        await apiRequest(`/api/v1/customers/${created.id}`, { notify: false })
          .then((response) => responseJson<CustomerDetail>(response))
          .then((loaded) => {
            const address = (loaded.addresses ?? []).find((item) => item.active);
            return address ? requestLocation(created.id, address.id) : null;
          })
          .catch(() => null);
      }
      await loadDirectory('', created.id);
      showToast('Cliente registrado.');
      /*
       * Acá "conservar" no tendría sentido —nadie carga dos clientes con los mismos datos—, así que
       * la segunda opción es la que sigue de verdad: ir a la ficha a completar contactos y
       * domicilios. El formulario se limpia sólo si se elige cargar otro.
       */
      setSavedCustomer({ id: created.id, name: created.displayName });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos registrar el cliente.');
    }
  }

  function importBody(zoneId: string) {
    const body = new FormData();
    if (importFile) body.set('file', importFile);
    // Una planilla con direcciones necesita la operación o la zona: sin eso el servidor la rechaza.
    if (zoneId.startsWith('site:')) body.set('operatingSiteId', zoneId.slice('site:'.length));
    else if (zoneId) body.set('geographicZoneId', zoneId);
    if (importAsNew) body.set('areNew', 'true');
    return body;
  }

  // Primer paso: leer la planilla y conciliarla contra los clientes que ya están, sin crear nada.
  async function importContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) {
      setImportError('Elegí un archivo CSV o Excel (.xlsx) para continuar.');
      return;
    }
    const zoneId = formText(new FormData(event.currentTarget), 'geographicZoneId');
    setImportError('');
    setImportResult(null);
    setImporting(true);
    try {
      const preview = await responseJson<{ rows: CustomerImportRow[] }>(
        await apiRequest('/api/v1/customers/import/preview', {
          body: importBody(zoneId),
          method: 'POST',
        }),
      );
      setImportReview({ rows: preview.rows, zoneId });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'No pudimos leer la planilla.');
    } finally {
      setImporting(false);
    }
  }

  // Segundo paso: crear los nuevos. Los que ya existen o están repetidos se saltean.
  async function confirmImport() {
    if (!importReview) return;
    setImportError('');
    setImporting(true);
    try {
      const result = await responseJson<{ imported: number; rows: CustomerImportRow[] }>(
        await apiRequest('/api/v1/customers/import', {
          body: importBody(importReview.zoneId),
          method: 'POST',
        }),
      );
      setImportReview(null);
      setImportResult(result.rows);
      setSearch('');
      await loadDirectory('');
      showToast(
        `${String(result.imported)} contacto${result.imported === 1 ? '' : 's'} importado${result.imported === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'No pudimos importar los contactos.');
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

  /**
   * Eliminar el cliente que se está mirando.
   *
   * El servidor decide qué significa "eliminar" según lo que el cliente tenga colgando: sin pedidos
   * se borra, con pedidos se archiva —borrarlo se llevaría puesto el historial de venta—. Acá sólo
   * se avisa cuál de las dos cosas pasó, porque si no, archivar se ve como que el botón no anduvo.
   */
  async function deleteCustomer() {
    if (!detail) return;
    try {
      const result = await responseJson<{ orderCount: number; outcome: 'ARCHIVED' | 'DELETED' }>(
        await apiRequest(`/api/v1/customers/${detail.id}`, { method: 'DELETE' }),
      );
      setConfirmDelete(false);
      await loadDirectory(search);
      showToast(
        result.outcome === 'DELETED'
          ? `${detail.displayName} se eliminó.`
          : `${detail.displayName} tiene ${String(result.orderCount)} pedidos, así que se archivó en vez de borrarse: el historial de venta se conserva.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos eliminar el cliente.');
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
      const created = await responseJson<CustomerAddress>(
        await apiRequest(`/api/v1/customers/${detail.id}/addresses`, {
          body: JSON.stringify({
            accessNotes: optional(formText(form, 'accessNotes')),
            deliveryWindow: optional(formText(form, 'deliveryWindow')),
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
      /*
       * La búsqueda en el mapa arranca sola (pedido 2026-11-07): antes había que tocar "Actualizar
       * ubicación" después de guardar. Si falla, el domicilio queda guardado igual y el botón sigue.
       */
      const located = await requestLocation(detail.id, created.id).catch(() => null);
      await loadCustomer(detail.id);
      showToast(
        located?.status === 'CANDIDATES'
          ? 'Domicilio agregado. Abajo está en el mapa: confirmá la ubicación.'
          : 'Domicilio agregado. No lo encontramos en el mapa: podés ubicarlo a mano.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos agregar el domicilio.');
    }
  }

  /*
   * Eliminar un domicilio. Se da de baja (`active: false`) y no se borra: los pedidos que ya
   * salieron a esa dirección la siguen nombrando. Deja de aparecer en la ficha y al cargar pedidos.
   */
  async function removeAddress(address: CustomerAddress) {
    if (!detail) return;
    try {
      await responseJson<CustomerAddress>(
        await apiRequest(`/api/v1/customers/${detail.id}/addresses/${address.id}`, {
          body: JSON.stringify({ active: false }),
          method: 'PATCH',
        }),
      );
      await loadCustomer(detail.id);
      showToast('Domicilio eliminado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos eliminar el domicilio.');
    }
  }

  /** Busca la dirección en el mapa y deja los lugares encontrados a la vista, para aceptar uno. */
  async function requestLocation(customerId: string, addressId: string) {
    const request = await responseJson<AddressGeocodingRequest>(
      await apiRequest(`/api/v1/customers/${customerId}/addresses/${addressId}/geocoding`, {
        body: JSON.stringify({ idempotencyKey: `web-${addressId}-${crypto.randomUUID()}` }),
        method: 'POST',
      }),
    );
    setGeocoding((current) => ({ ...current, [addressId]: request }));
    return request;
  }

  async function startGeocoding(address: CustomerAddress) {
    if (!detail) return;
    setMessage('');
    try {
      const request = await requestLocation(detail.id, address.id);
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

  /**
   * Confirmar la ubicación encontrada.
   *
   * Además de las coordenadas, deja escrita la dirección como la devolvió el geocodificador. Lo que
   * se escribe al tomar un pedido es lo que dictó el cliente por teléfono —"san martin 1234 dpto
   * 2"— y es lo que después lee quien reparte, parado en la vereda. Si el geocodificador ya resolvió
   * que eso es "Av. San Martín 1234", conviene que quede así.
   */
  async function confirmCandidate(
    address: CustomerAddress,
    candidateId: string,
    formattedAddress: string,
  ) {
    const request = geocoding[address.id];
    if (!detail || !request) return;
    try {
      await responseJson<CustomerAddress>(
        await apiRequest(
          `/api/v1/customers/${detail.id}/addresses/${address.id}/geocoding/${request.id}/confirm`,
          {
            body: JSON.stringify({ candidateId, writtenAddress: formattedAddress }),
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

  /*
   * La pantalla completa se toma sólo mientras no se sabe quién es la persona, que es una sola vez
   * por pestaña. El padrón puede tardar —son cientos de fichas— y esperarlo en blanco hacía que
   * entrar a Clientes pareciera una recarga entera; ahora la espera vive dentro de la lista.
   */
  if (!profile) {
    if (!loading) {
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
  const canDelete = profile.permissions.includes('customers.delete');
  const canEditCustomer = profile.permissions.includes('customers.edit');
  // Cambiar de ciudad toca el cliente y sus pedidos abiertos.
  const canMoveSite =
    profile.permissions.includes('customers.edit') && profile.permissions.includes('orders.edit');
  // Same pair the API demands: choosing a survivor means reading both records' contacts.
  const canMerge =
    profile.permissions.includes('customers.merge') &&
    profile.permissions.includes('customers.view_sensitive');

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <div className="crm-workspace">
        <header className="crm-heading">
          <div>
            <p className="dashboard-kicker">CRM operativo</p>
            <h1 className="text-2xl font-semibold text-forest">Clientes</h1>
            <p>Contactos, domicilios y pedidos en una única ficha trazable.</p>
          </div>
          <div className="crm-heading-actions">
            <button className="button button-secondary" onClick={() => setShowExport(true)}>
              Exportar a Excel
            </button>
            {canMerge ? (
              <button className="button button-secondary" onClick={() => setShowMerge(true)}>
                Fusionar duplicados
              </button>
            ) : null}
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

        <div className="crm-browse-bar">
          <form className="crm-search" onSubmit={(event) => void submitSearch(event)}>
            <input
              aria-label="Buscar clientes"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nombre, teléfono o correo"
              type="search"
              value={search}
            />
            <button type="submit">Buscar</button>
          </form>
          <label className="crm-browse-sort">
            <span>Ordenar</span>
            <select
              onChange={(event) => chooseSort(event.target.value as CustomerSort)}
              value={sort}
            >
              {CUSTOMER_SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-expanded={showFilters}
            className="crm-browse-filters-toggle"
            onClick={() => setShowFilters((open) => !open)}
            type="button"
          >
            Filtros
            {activeFilterCount(filters) > 0 ? <b>{activeFilterCount(filters)}</b> : null}
          </button>
          <div aria-label="Cómo ver los clientes" className="crm-view-switch" role="group">
            <button
              aria-pressed={view === 'cards'}
              onClick={() => chooseView('cards')}
              type="button"
            >
              Tarjetas
            </button>
            <button
              aria-pressed={view === 'columns'}
              onClick={() => chooseView('columns')}
              type="button"
            >
              Columnas
            </button>
          </div>
        </div>
        {showFilters ? (
          <div className="crm-browse-filters">
            <label>
              <span>Zona</span>
              <select
                onChange={(event) => setFilter('zoneId', event.target.value)}
                value={filters.zoneId}
              >
                <option value="">Todas</option>
                {zones
                  .filter(
                    (zone) =>
                      !storedOperatingSiteId() || zone.operatingSiteId === storedOperatingSiteId(),
                  )
                  .map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Nuevos</span>
              <select
                onChange={(event) =>
                  setFilter('isNew', event.target.value as CustomerFilters['isNew'])
                }
                value={filters.isNew}
              >
                <option value="">Todos</option>
                <option value="true">Sólo nuevos</option>
                <option value="false">Sin los nuevos</option>
              </select>
            </label>
            <label>
              <span>Sin pedir hace</span>
              <select
                onChange={(event) => setFilter('inactiveWeeks', Number(event.target.value))}
                value={filters.inactiveWeeks}
              >
                <option value={0}>Cualquier momento</option>
                <option value={2}>Más de 2 semanas</option>
                <option value={4}>Más de 4 semanas</option>
                <option value={8}>Más de 8 semanas</option>
              </select>
            </label>
            <label className="crm-browse-check">
              <input
                checked={filters.withDebt}
                onChange={(event) => setFilter('withDebt', event.target.checked)}
                type="checkbox"
              />
              Con deuda
            </label>
            <label className="crm-browse-check">
              <input
                checked={filters.unlocated}
                onChange={(event) => setFilter('unlocated', event.target.checked)}
                type="checkbox"
              />
              Falta ubicar
            </label>
            {activeFilterCount(filters) > 0 ? (
              <button onClick={() => setFilters(NO_FILTERS)} type="button">
                Quitar filtros
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="crm-directory-meta crm-browse-meta">
          <span>
            {total !== null
              ? `${String(total)} cliente${total === 1 ? '' : 's'}${
                  nextOffset !== null ? ` · ${String(customers.length)} cargados` : ''
                }`
              : `${String(customers.length)} encontrados (hay más)`}
          </span>
          <button onClick={() => void loadDirectory(search, selectedId)} type="button">
            Actualizar
          </button>
        </div>

        <div
          className={`crm-layout${view === 'columns' ? ' is-columns' : ''}${
            view === 'columns' && detailOpen ? ' is-detail-open' : ''
          }`}
        >
          {view === 'columns' ? (
            <div className="crm-table-area">
              {loading && customers.length === 0 ? (
                <p className="crm-list-loading">Cargando el padrón…</p>
              ) : (
                <CustomerTable
                  customers={customers}
                  empty="No hay clientes con esta búsqueda o estos filtros."
                  onOpen={(customer) => {
                    setDetailOpen(true);
                    void selectCustomer(customer.id);
                  }}
                  selectedId={detailOpen ? selectedId : ''}
                />
              )}
              <div aria-hidden="true" ref={listEndRef} />
              {nextOffset !== null ? (
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
          ) : (
            <aside className="crm-directory">
              <div className="crm-customer-list">
                {/* La espera del padrón, acá adentro y no tapando la pantalla. */}
                {loading && customers.length === 0 ? (
                  <p className="crm-list-loading">Cargando el padrón…</p>
                ) : null}
                {customers.map((customer) => (
                  <button
                    className={selectedId === customer.id && !showCreate ? 'is-active' : ''}
                    key={customer.id}
                    onClick={() => void selectCustomer(customer.id)}
                    type="button"
                  >
                    <span>{customer.displayName.slice(0, 1).toLocaleUpperCase('es-AR')}</span>
                    <div>
                      <strong>
                        {customer.displayName}
                        {customer.isNew ? <em className="new-badge">Nuevo</em> : null}
                      </strong>
                      <small>{contactLabel(customer)}</small>
                      {/* Zona y último pedido: lo que se mira para decidir a quién escribir. */}
                      <small className="crm-customer-facts">
                        {[customer.zoneName, sinceLabel(customer.lastOrderDate)]
                          .filter(Boolean)
                          .join(' · ')}
                        {customer.debtMinor ? (
                          <b className="crm-flag is-debt" title="Tiene deuda">
                            debe {formatMoney(customer.debtMinor, customer.currency ?? 'ARS')}
                          </b>
                        ) : null}
                        {customer.located === false ? (
                          <b className="crm-flag" title="Algún domicilio no está ubicado">
                            sin ubicar
                          </b>
                        ) : null}
                      </small>
                    </div>
                    <i>{customerStatusLabel(customer.status)}</i>
                  </button>
                ))}
                {customers.length === 0 && !loading ? (
                  <p>No hay clientes con esta búsqueda o estos filtros.</p>
                ) : null}
                <div aria-hidden="true" ref={listEndRef} />
                {nextOffset !== null ? (
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
          )}

          <section className="crm-detail">
            {view === 'columns' && detailOpen ? (
              <button
                className="crm-detail-close"
                onClick={() => setDetailOpen(false)}
                type="button"
              >
                ← Volver a la tabla
              </button>
            ) : null}
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
                  <p className="screen-notice mb-4" role="alert">
                    Elegí una ciudad en la barra superior antes de cargar un cliente: todo cliente
                    pertenece a una operación.
                  </p>
                ) : cityHasNoZones ? (
                  // A city with no zones silently blocks the alta: a domicilio requires a zone, so
                  // the form would fail on save with nothing explaining why. Say so up front and
                  // point at where it gets fixed.
                  <p className="screen-notice mb-4" role="alert">
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
                    Dirección, línea 1
                    <input name="writtenAddress" placeholder="Calle, número y ciudad" />
                    <small className="field-hint">Es lo que se busca en el mapa.</small>
                  </label>
                  <label className="field field-wide">
                    Dirección, línea 2
                    <input
                      maxLength={300}
                      name="addressLine2"
                      placeholder="Piso, depto, timbre, barrio, detalles"
                    />
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
                    <span className="status-chip">{customerStatusLabel(detail.status)}</span>
                    {detail.isNew ? <span className="new-badge">NUEVO</span> : null}
                    <h2>{detail.displayName}</h2>
                    {/*
                     * "NUEVO" se calcula solo (primera compra) y se puede forzar a mano: es para
                     * saber a quién mandarle las recomendaciones para descongelar.
                     */}
                    {canEditCustomer ? (
                      <label className="label-switch crm-new-toggle">
                        <input
                          checked={detail.isNew ?? false}
                          onChange={(event) => void setNewOverride(event.target.checked)}
                          type="checkbox"
                        />
                        Cliente nuevo
                        <small>
                          {detail.isNewOverride === null || detail.isNewOverride === undefined
                            ? ' (automático)'
                            : ' (a mano)'}
                        </small>
                      </label>
                    ) : null}
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
                          {/* Desplegable y no texto libre: un tipeo creaba un estado nuevo que
                              ninguna otra pantalla sabe interpretar. */}
                          <select defaultValue={detail.status} name="status" required>
                            {CUSTOMER_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {customerStatusLabel(status)}
                              </option>
                            ))}
                            {/* Un estado cargado a mano antes de esto sigue siendo elegible, para
                                que guardar la ficha no lo cambie sin querer. */}
                            {CUSTOMER_STATUSES.includes(detail.status) ? null : (
                              <option value={detail.status}>{detail.status}</option>
                            )}
                          </select>
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
                      <div className="form-actions">
                        <button className="button button-primary" type="submit">
                          Guardar cambios
                        </button>
                        {canMoveSite ? (
                          <button
                            className="button button-secondary"
                            onClick={() => setMovingSite(true)}
                            type="button"
                          >
                            Cambiar de ciudad
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            className="button button-danger"
                            onClick={() => setConfirmDelete(true)}
                            type="button"
                          >
                            Eliminar cliente
                          </button>
                        ) : null}
                      </div>
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
                    {contactCards(detail.identities ?? []).map(({ identity, types }) => (
                      <article key={identity.id}>
                        <span>{types.map(contactTypeLabel).join(' · ')}</span>
                        {/*
                         * El mismo número que la tabla de pedidos muestra como
                         * "(011) 15 5573 4841" aparecía acá como "+54926155720045": quince
                         * dígitos corridos no se leen, se descifran, y no hay forma de comparar
                         * dos contactos ni de dictar uno.
                         */}
                        <strong>
                          {identity.type === 'phone' || identity.type === 'whatsapp'
                            ? formatArgentinePhone(identity.value)
                            : identity.value}
                        </strong>
                        <small>
                          {identity.primary ? 'Principal' : 'Alternativo'} ·{' '}
                          {identity.verified ? 'verificado' : 'sin verificar'}
                        </small>
                        {/* Abre el chat con ese número: en la computadora, WhatsApp Web. */}
                        {identity.type === 'phone' || identity.type === 'whatsapp' ? (
                          <a
                            className="crm-contact-whatsapp"
                            href={whatsappHref(identity.value)}
                            rel="noopener noreferrer"
                            target="_blank"
                            title="Abrir el chat en WhatsApp"
                          >
                            WhatsApp ↗
                          </a>
                        ) : null}
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
                    {detail.addresses
                      ?.filter((address) => address.active)
                      .map((address) => {
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
                            {/* Un renglón vacío no se anuncia: decía "Sin datos territoriales
                              adicionales", que informa la ausencia de un campo opcional. Lo que sí
                              importa —un domicilio sin geocodificar, que deja el pedido afuera del
                              reparto— ya lo dice el estado de arriba. */}
                            {[address.unit, address.city, address.sector, address.operationalZone]
                              .filter(Boolean)
                              .join(' · ') ? (
                              <p>
                                {[
                                  address.unit,
                                  address.city,
                                  address.sector,
                                  address.operationalZone,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            ) : null}
                            {address.accessNotes ? (
                              <p className="crm-address-note">Acceso: {address.accessNotes}</p>
                            ) : null}
                            {address.deliveryWindow ? (
                              <p className="crm-address-note">Recibe: {address.deliveryWindow}</p>
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
                                <button
                                  className="is-primary"
                                  onClick={() => void startGeocoding(address)}
                                  type="button"
                                >
                                  {/* "Validar" no decía qué pasaba al tocarlo. Busca la dirección,
                                    propone la ubicación y, al aceptarla, deja la dirección escrita
                                    como corresponde. */}
                                  Actualizar ubicación
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  className="is-danger"
                                  onClick={() => setRemovingAddress(address)}
                                  type="button"
                                >
                                  Eliminar
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
                                {request.status === 'CANDIDATES' ? (
                                  <p className="crm-geocoding-hint">
                                    Al elegir una queda la ubicación cargada y la dirección escrita
                                    como figura acá.
                                  </p>
                                ) : null}
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
                                      onClick={() =>
                                        void confirmCandidate(
                                          address,
                                          candidate.id,
                                          candidate.formattedAddress,
                                        )
                                      }
                                      type="button"
                                    >
                                      Usar esta
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
                  {/*
                   * El cruce con los pedidos (2026-11-09): una dirección que se usó en un pedido y
                   * nunca quedó como domicilio. Se guarda y se ubica desde acá.
                   */}
                  {canEdit && unsavedOrderAddresses(detail.orders).length > 0 ? (
                    <div className="crm-unsaved-addresses">
                      <h4>Direcciones usadas en pedidos, sin guardar</h4>
                      {unsavedOrderAddresses(detail.orders).map((order) => (
                        <div key={order.id}>
                          <strong>{order.unsavedAddress}</strong>
                          <LocateOrderControl
                            address={order.unsavedAddress ?? ''}
                            onLocated={() => void loadCustomer(detail.id)}
                            orderId={order.id}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {canEdit ? (
                    <details className="crm-inline-form">
                      <summary>Agregar domicilio</summary>
                      <form onSubmit={(event) => void addAddress(event)}>
                        <label className="field">
                          Etiqueta
                          <input name="label" placeholder="Casa, oficina…" required />
                        </label>
                        <label className="field field-wide">
                          Dirección, línea 1
                          <input
                            minLength={4}
                            name="writtenAddress"
                            placeholder="Calle, número y ciudad"
                            required
                          />
                          <small className="field-hint">Es lo que se busca en el mapa.</small>
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
                          Dirección, línea 2
                          <input
                            maxLength={300}
                            name="unit"
                            placeholder="Piso, depto, timbre, barrio, detalles"
                          />
                        </label>
                        <label className="field">
                          Horario en que recibe
                          {/* Texto libre: la realidad de cada cliente no entra en un selector de
                              horas, y quien lo lee es una persona manejando. Va en la hoja de
                              reparto, debajo de la dirección. */}
                          <input name="deliveryWindow" placeholder="Después de las 18" />
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
                  {debt ? (
                    <p className="crm-debt">
                      Debe <strong>{formatMoney(debt.totalMinor, debt.currency)}</strong> en{' '}
                      {debt.count === 1 ? '1 pedido' : `${String(debt.count)} pedidos`} de períodos
                      cerrados. <Link to="/app/por-cobrar">Ver en Por cobrar</Link>
                    </p>
                  ) : null}
                  <div className="crm-orders">
                    {detail.orders.map((order) => (
                      <article key={order.id}>
                        <strong>
                          <Link to={`/app/pedidos/${order.id}`}>Ver pedido</Link>
                        </strong>
                        <span className="status-chip">{orderStatusLabel(order.status)}</span>
                        <span>
                          {new Intl.DateTimeFormat('es-AR').format(
                            new Date(`${order.deliveryDate}T12:00:00`),
                          )}
                        </span>
                        <b>{formatMoney(order.totalMinor, order.currency)}</b>
                        {/*
                         * Qué llevó, debajo de los datos de siempre: el historial de un cliente se
                         * lee por lo que pide, no por el número de pedido.
                         */}
                        {order.items.length > 0 ? (
                          <ul className="crm-order-items">
                            {order.items.map((item, index) => (
                              <li key={`${item.familyName}-${item.variantName}-${String(index)}`}>
                                <b>{item.quantityUnits}×</b> {item.familyName} {item.variantName}
                                {item.dishes.length > 0 ? (
                                  <small> ({item.dishes.join(', ')})</small>
                                ) : null}
                              </li>
                            ))}
                            {order.cycleAlias || order.source === 'opportunity_sale' ? (
                              <li className="crm-order-meta">
                                {[
                                  order.cycleAlias,
                                  order.source === 'opportunity_sale' ? 'Del stock' : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
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
            <button
              className="button button-secondary"
              onClick={() => {
                setImportError('');
                setImportReview(null);
                setImportResult(null);
                setShowImport(true);
              }}
            >
              Importar archivo
            </button>
          </section>
        ) : null}

        {showExport ? (
          <CustomerExportDialog onClose={() => setShowExport(false)} search={search} />
        ) : null}

        {removingAddress ? (
          <ConfirmDialog
            confirmLabel="Eliminar domicilio"
            detail={`${removingAddress.writtenAddress}. Deja de aparecer en la ficha y al cargar pedidos. Los pedidos que ya tienen esta dirección no cambian.`}
            onCancel={() => setRemovingAddress(null)}
            onConfirm={async () => {
              const target = removingAddress;
              setRemovingAddress(null);
              await removeAddress(target);
            }}
            tone="destructivo"
            title={`¿Eliminar el domicilio "${removingAddress.label}"?`}
          />
        ) : null}

        {confirmDelete && detail ? (
          <ConfirmDialog
            confirmLabel={detail.orders.length > 0 ? 'Archivar' : 'Eliminar'}
            /* Se dice de antemano qué va a pasar: no es lo mismo borrar un duplicado que sacar de
               la lista a alguien que compró treinta veces. */
            detail={
              detail.orders.length > 0
                ? `Tiene ${String(detail.orders.length)} pedidos, así que se archiva en vez de borrarse: sale de las listas y el historial de venta se conserva. Se puede reactivar cambiándole el estado.`
                : 'No tiene pedidos, así que se borra de verdad, junto con sus contactos y domicilios. Esto no se puede deshacer.'
            }
            onCancel={() => setConfirmDelete(false)}
            onConfirm={deleteCustomer}
            tone="destructivo"
            title={`¿Eliminar a ${detail.displayName}?`}
          />
        ) : null}

        {showMerge ? (
          <MergeCustomersDialog
            onClose={() => setShowMerge(false)}
            onMerged={() => void loadDirectory(search)}
          />
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
              {!importReview && !importResult ? (
                <>
                  <div className="crm-import-columns">
                    <div>
                      <strong>Columna</strong>
                      <strong>Uso</strong>
                    </div>
                    <div>
                      <code>Nombre</code>
                      <span>
                        Obligatoria. También «Nombre y apellido», «Cliente» o «Nombre» + «Apellido».
                      </span>
                    </div>
                    <div>
                      <code>Celular</code>
                      <span>Se guarda como teléfono y como WhatsApp. También «Móvil».</span>
                    </div>
                    <div>
                      <code>WhatsApp</code>
                      <span>Contacto WhatsApp sin verificar, si viene aparte del celular.</span>
                    </div>
                    <div>
                      <code>Teléfono</code>
                      <span>Teléfono fijo o alternativo.</span>
                    </div>
                    <div>
                      <code>Email</code>
                      <span>También «Mail» o «Correo».</span>
                    </div>
                    <div>
                      <code>Dirección</code>
                      <span>
                        Crea un domicilio para ubicar. También «Domicilio» o «Dirección de entrega».
                      </span>
                    </div>
                    <div>
                      <code>Barrio</code>
                      <span>Se suma a la dirección para ubicarla mejor. También «Localidad».</span>
                    </div>
                    <div>
                      <code>Forma de pago</code>
                      <span>Queda como forma de pago preferida en las notas del cliente.</span>
                    </div>
                    <div>
                      <code>Enlace</code>
                      <span>Enlace de Maps del domicilio. También «Link» o «Ubicación».</span>
                    </div>
                    <div>
                      <code>Observaciones</code>
                      <span>Notas internas del cliente.</span>
                    </div>
                  </div>
                  <p className="crm-import-note">
                    Los encabezados se reconocen con o sin tildes y en cualquier orden, aunque haya
                    filas vacías arriba. Si la dirección trae la forma de pago pegada («Mitre 400
                    transferencia»), se separa sola. Un contacto repetido o una fila con formato
                    inválido detiene la importación sin crear registros parciales.
                  </p>
                </>
              ) : null}
              <form className="crm-import-form" onSubmit={(event) => void importContacts(event)}>
                <label className="field field-wide">
                  Archivo de contactos
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      setImportFile(event.target.files?.[0] ?? null);
                      setImportReview(null);
                      setImportResult(null);
                    }}
                    required
                    type="file"
                  />
                </label>
                {importFile ? (
                  <span className="crm-import-file">Seleccionado: {importFile.name}</span>
                ) : null}
                <label className="field field-wide">
                  Operación o zona de las direcciones
                  {/* Toda una operación (2026-11-05): cada domicilio va a la zona que nombra su
                      columna de localidad, o a la primera de la operación. */}
                  <select
                    defaultValue={
                      importSites.some((site) => site.id === storedOperatingSiteId())
                        ? `site:${storedOperatingSiteId() ?? ''}`
                        : defaultZoneId
                    }
                    key={importSites.length}
                    name="geographicZoneId"
                    onChange={() => setImportReview(null)}
                  >
                    <option value="">Sin direcciones</option>
                    {importSites.map((site) => (
                      <optgroup key={site.id} label={site.displayName}>
                        <option value={`site:${site.id}`}>
                          Toda la operación {site.displayName} (zona según la localidad)
                        </option>
                        {zones
                          .filter((zone) => zone.operatingSiteId === site.id)
                          .map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              Sólo {zone.displayName}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    {zones
                      .filter(
                        (zone) => !importSites.some((site) => site.id === zone.operatingSiteId),
                      )
                      .map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.displayName}
                        </option>
                      ))}
                  </select>
                </label>
                {/* La cartera de siempre no es "nueva": sin tildar, no se pintan como nuevos. */}
                <label className="label-switch field-wide">
                  <input
                    checked={importAsNew}
                    onChange={(event) => setImportAsNew(event.target.checked)}
                    type="checkbox"
                  />
                  Son clientes nuevos (sin tildar, entran como clientes de siempre)
                </label>
                {importError ? (
                  <p className="screen-notice" role="alert">
                    {importError}
                  </p>
                ) : null}
                {importReview ? (
                  <>
                    <ImportReconciliation rows={importReview.rows} />
                    <button
                      className="button button-primary"
                      disabled={importing || !importReview.rows.some((row) => row.status === 'new')}
                      onClick={() => void confirmImport()}
                      type="button"
                    >
                      {importing
                        ? 'Importando…'
                        : `Importar ${String(importReview.rows.filter((row) => row.status === 'new').length)} nuevos`}
                    </button>
                  </>
                ) : importResult ? (
                  <ImportReconciliation done rows={importResult} />
                ) : (
                  <button className="button button-primary" disabled={importing} type="submit">
                    {importing ? 'Revisando…' : 'Revisar planilla'}
                  </button>
                )}
              </form>
            </section>
          </div>
        ) : null}

        {savedCustomer ? (
          <AfterSaveDialog
            detail={`${savedCustomer.name} ya está en el padrón.`}
            keepLabel="Completar su ficha"
            newLabel="Cargar otro cliente"
            onKeep={() => {
              setShowCreate(false);
              setSavedCustomer(null);
            }}
            onNew={() => {
              createFormRef.current?.reset();
              setSavedCustomer(null);
            }}
            title="Cliente registrado"
          />
        ) : null}
      </div>
      {movingSite && detail ? (
        <MoveSiteDialog
          onClose={() => setMovingSite(false)}
          onMoved={(moved) => {
            setMovingSite(false);
            showToast(
              moved.length === 0
                ? `${detail.displayName} cambió de ciudad.`
                : `${detail.displayName} cambió de ciudad con ${String(moved.length)} ${moved.length === 1 ? 'pedido' : 'pedidos'}.`,
            );
            void loadCustomer(detail.id);
          }}
          target={{
            addresses: (detail.addresses ?? [])
              .filter((address) => address.active)
              .map((address) => ({
                geographicZoneId: address.geographicZoneId,
                id: address.id,
                label: address.label,
                writtenAddress: address.writtenAddress,
              })),
            currency: 'ARS',
            customerId: detail.id,
            kind: 'customer',
          }}
        />
      ) : null}
    </DashboardShell>
  );
}
