export interface AIProviderConfig {
  adapterType: string;
  apiKeyMask: string | null;
  baseUrl: string;
  defaultModel: string;
  displayName: string;
  enabled: boolean;
  id: string;
  key: string;
  keyConfigured: boolean;
  updatedAt: string;
}

export interface CustomerSummary {
  createdAt: string;
  displayName: string;
  email?: string | null;
  id: string;
  phone?: string | null;
  status: string;
  whatsapp?: string | null;
}

export interface CustomerIdentity {
  active: boolean;
  createdAt: string;
  id: string;
  primary: boolean;
  source: string;
  type: string;
  value: string;
  verified: boolean;
}

export interface CustomerAddress {
  accessNotes: string | null;
  active: boolean;
  city: string | null;
  createdAt: string;
  geocodingStatus: string;
  id: string;
  label: string;
  latitude: number | null;
  locationUrl: string | null;
  longitude: number | null;
  operationalZone: string | null;
  primary: boolean;
  propertyType: string | null;
  sector: string | null;
  source: string;
  unit: string | null;
  writtenAddress: string;
}

export interface CustomerDetail extends CustomerSummary {
  addresses?: CustomerAddress[];
  firstName: string | null;
  identities?: CustomerIdentity[];
  internalNotes?: string | null;
  lastName: string | null;
  orders: Array<{
    createdAt: string;
    currency: string;
    deliveryDate: string;
    id: string;
    publicNumber: string;
    status: OrderSummary['status'];
    totalMinor: number;
  }>;
  preferences?: Array<{
    active: boolean;
    category: string;
    createdAt: string;
    id: string;
    source: string;
    value: string;
  }>;
  restrictions?: Array<{
    active: boolean;
    createdAt: string;
    id: string;
    reason: string;
    resolvedAt: string | null;
    type: string;
  }>;
  updatedAt: string;
}

export interface AddressGeocodingRequest {
  candidates: Array<{
    city: string | null;
    confidence: number;
    formattedAddress: string;
    id: string;
    latitude: number;
    locationUrl: string | null;
    longitude: number;
    sector: string | null;
  }>;
  createdAt: string;
  errorCode: string | null;
  id: string;
  providerKey: string;
  selectedCandidateId: string | null;
  status:
    'PENDING' | 'CANDIDATES' | 'NO_MATCH' | 'FAILED' | 'CONFIRMED' | 'REJECTED' | 'SUPERSEDED';
  updatedAt: string;
}

export interface MenuOffering {
  composable: boolean;
  currency: string;
  description: string | null;
  dishes: string[];
  familyName: string;
  id: string;
  mealsPerUnit: number;
  // True when this variety carries a deliberate exception to the size price.
  priceOverridden: boolean;
  sizeName: string;
  unitPriceMinor: number;
  variantName: string;
}

export interface WeeklyMenu {
  cycle: {
    alias: string;
    closeAt: string;
    id: string;
    openAt: string;
    partialKitchenCutoffAt: string;
    status: string;
  };
  id: string;
  offerings: MenuOffering[];
  // Null means the global master revision.
  operatingSiteId: string | null;
  operatingSiteName: string | null;
  publishedAt: string | null;
  revision: number;
  sourceMenuId: string | null;
  status: string;
}

// `GET /api/v1/menus` returns every distributed row for every cycle (master + one per site) — the
// right shape for "Ver menús", which manages distribution across cities, but not for a screen that
// operates against one city at a time: unfiltered, a dropdown there shows the same cycle name once
// per city, indistinguishable from each other. This picks the one row relevant to the ambient
// scope per cycle — the site's own distributed revision if it has one, the global master otherwise
// (same fallback `currentPublishedMenu` uses server-side) — collapsing five identical-looking
// options down to the one that's actually this city's menu.
export function menusForAmbientScope(
  menus: WeeklyMenu[],
  operatingSiteId: string | null,
): WeeklyMenu[] {
  const byCycle = new Map<string, WeeklyMenu[]>();
  for (const menu of menus) {
    const rows = byCycle.get(menu.cycle.id) ?? [];
    rows.push(menu);
    byCycle.set(menu.cycle.id, rows);
  }
  const relevant: WeeklyMenu[] = [];
  for (const rows of byCycle.values()) {
    const master = rows.find((menu) => menu.operatingSiteId === null);
    const site = operatingSiteId
      ? rows.find((menu) => menu.operatingSiteId === operatingSiteId)
      : undefined;
    const chosen = site ?? master;
    if (chosen) relevant.push(chosen);
  }
  return relevant;
}

export interface OrderSummary {
  createdAt: string;
  currency: string;
  customer: { displayName: string; id: string };
  deliveryAddress: string;
  deliveryAddressId: string | null;
  deliveryDate: string;
  deliveryLocationUrl: string | null;
  deliveryZone: string | null;
  dietaryInstructions: string[];
  id: string;
  items: {
    dishSelections: string[];
    id: string;
    productName: string;
    quantityUnits: number;
    totalMinor: number;
    unitPriceMinor: number;
    variantName: string;
  }[];
  menuId: string;
  notes: string | null;
  paymentExpectation: string;
  publicNumber: string;
  source: string;
  status: 'DRAFT' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED';
  totalMinor: number;
  updatedAt: string;
}

export interface OrderStatusHistoryEntry {
  actorUserId: string | null;
  createdAt: string;
  fromStatus: OrderSummary['status'] | null;
  id: string;
  reason: string | null;
  toStatus: OrderSummary['status'];
}

export interface OrderRevision {
  actorUserId: string | null;
  createdAt: string;
  id: string;
  reason: string;
  revision: number;
  snapshot: OrderSummary;
}

export interface KitchenSummary {
  base: {
    exceptions: {
      customerDisplayName: string;
      dietaryInstructions: string[];
      orderPublicNumber: string;
      quantityUnits: number;
    }[];
    familyName: string;
    quantityUnits: number;
    variantName: string;
  }[];
  custom: {
    customerDisplayName: string;
    dietaryInstructions: string[];
    dishSelections: string[];
    familyName: string;
    orderPublicNumber: string;
    quantityUnits: number;
    sequence: number;
    variantName: string;
  }[];
  cycle: { alias: string; id: string };
  generatedAt: string;
  totalUnits: number;
}

export interface ProductionActual {
  familyName: string;
  quantityUnits: number;
  reportedAt: string;
  reportedByUserId: string | null;
  variantName: string;
}

export interface ProductionSnapshot {
  generatedAt: string;
  generatedByUserId: string | null;
  id: string;
  kind: 'partial' | 'final';
  payload: {
    actuals: ProductionActual[];
    base: KitchenSummary['base'];
    custom: KitchenSummary['custom'];
    cycle: { alias: string; id: string };
    delta:
      | { deltaUnits: number; familyName: string; quantityUnits: number; variantName: string }[]
      | null;
    totalUnits: number;
  };
  salesCycleId: string;
}

export interface SurplusItem {
  bajaMerma: number;
  demandaConfirmada: number;
  disponible: number;
  excedenteEfectivo: number;
  familyName: string;
  produccionPlanificada: number;
  produccionReal: number | null;
  variantName: string;
  vendidoOportunidad: number;
}

export interface SurplusReport {
  coefficientPercent: number;
  cycle: { alias: string; id: string };
  generatedAt: string;
  items: SurplusItem[];
}

export interface Label {
  customerDisplayName: string | null;
  familyName: string;
  orderPublicNumber: string;
  variantName: string;
}

export interface LabelSettings {
  backgroundImageUrl: string | null;
  id: string | null;
  labelsPerPage: number;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

// The admin-editable catalog behind "Método" pickers (order intake, cobro manual).
export interface PaymentMethod {
  active: boolean;
  code: string;
  displayName: string;
  id: string;
  isCash: boolean;
  sortOrder: number;
}

// "Estadísticas": decision-making rollups over orders (never CANCELLED).
export interface StatsOverview {
  byCycle: { cycleAlias: string; orderCount: number; revenueMinor: number; salesCycleId: string }[];
  /** Daily series keyed by delivery date — the same date the window filters on. */
  byDay: { day: string; orderCount: number; revenueMinor: number }[];
  bySize: { revenueMinor: number; sizeName: string; units: number }[];
  byVariety: { familyName: string; revenueMinor: number; units: number }[];
  byZone: {
    operatingSiteId: string;
    operatingSiteName: string;
    orderCount: number;
    revenueMinor: number;
  }[];
  global: {
    averageOrderValueMinor: number;
    currency: string;
    customerCount: number;
    orderCount: number;
    /** Repeat-rate proxy; fractional on purpose (1.4, not 1). */
    ordersPerCustomer: number;
    revenueMinor: number;
    statusBreakdown: { count: number; status: string }[];
  };
}

export async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? 'No pudimos completar la operación.';
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', { currency, style: 'currency' }).format(amountMinor / 100);
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  CANCELLED: 'Cancelado',
  CONFIRMED: 'Confirmado',
  DELIVERED: 'Entregado',
  DRAFT: 'Borrador',
  READY: 'Listo',
};

/** Staff-facing order status label — the only place this mapping lives, so every screen (Ver
 * pedidos, Tomar pedido, el detalle, el historial dentro de un cliente) reads the same word for
 * the same status instead of each one showing the raw enum. TrackOrderPage keeps its own
 * customer-facing wording (e.g. "Recibido" instead of "Borrador") since it's a different
 * audience, not an inconsistency to fix. */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
