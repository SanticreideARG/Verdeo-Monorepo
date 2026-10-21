import { describeResponse, errorText } from './errors.js';

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
  geographicZoneId: string;
  deliveryWindow: string | null;
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
    cycleAlias: string | null;
    deliveryDate: string;
    id: string;
    /** Qué llevó: variedad, tamaño y cantidad; en un Intuitivo, los platos elegidos. */
    items: { dishes: string[]; familyName: string; quantityUnits: number; variantName: string }[];
    publicNumber: string;
    source: string;
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

/**
 * Un plato elegido en un Intuitivo, con su menú (DISH_IDENTITY_AND_DEBTORS_PLAN.md). Dos platos con
 * el mismo nombre en dos menús son dos platos: el "Lomo con cebolla" de Keto no es el de Anti-Age.
 * `familyName` vacío: un plato viejo que no sabe de qué menú vino.
 */
export interface PickedDish {
  dishName: string;
  familyName: string;
}

/** Los platos elegidos como los espera el servidor: con su menú si todos lo tienen. */
export function dishesPayload(
  dishes: readonly PickedDish[],
): { selectedDishes: PickedDish[] } | { selectedDishNames: string[] } {
  return dishes.every((dish) => dish.familyName)
    ? { selectedDishes: dishes.map(({ dishName, familyName }) => ({ dishName, familyName })) }
    : { selectedDishNames: dishes.map((dish) => dish.dishName) };
}

/** "Guiso (Keto)": el plato con su menú, sin el "Menú" del nombre de la familia. */
export function dishLabel(dish: PickedDish): string {
  const family = dish.familyName.replace(/^men[uú]\s+/i, '');
  return family ? `${dish.dishName} (${family})` : dish.dishName;
}

/** Los platos de un renglón ya guardado, con el menú que trae cada uno. */
export function pickedDishes(item: {
  dishSelections: readonly string[];
  dishSources?: readonly ({ familyName: string; slot: number } | null)[] | undefined;
}): PickedDish[] {
  return item.dishSelections.map((dishName, index) => ({
    dishName,
    familyName: item.dishSources?.[index]?.familyName ?? '',
  }));
}

export interface MenuOffering {
  composable: boolean;
  currency: string;
  description: string | null;
  dishes: string[];
  familyAbbreviation?: string | null;
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
  /** Hasta cuántos platos admite un Intuitivo en la ciudad de este menú. */
  intuitivoMaxDishes: number;
  /** Cómo se propone el precio de un Intuitivo con más platos que los del tamaño. */
  intuitivoPricing: {
    extraDishMinor: number;
    factorBasisPoints: number;
    mode: 'coeficiente' | 'monto_fijo' | 'proporcional';
    roundingMinor: number;
  };
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
  customer: {
    displayName: string;
    email: string | null;
    id: string;
    phone: string | null;
    whatsapp: string | null;
  };
  deliveryAddress: string;
  /** Piso, depto, timbre, barrio, detalles. No se geocodifica. */
  deliveryAddressLine2: string | null;
  deliveryAddressId: string | null;
  deliveryDate: string;
  // Coordenadas de la dirección de entrega, cuando está geocodificada.
  deliveryLatitude: number | null;
  deliveryLocationUrl: string | null;
  deliveryLongitude: number | null;
  deliveryZone: string | null;
  dietaryInstructions: string[];
  id: string;
  items: {
    dishSelections: string[];
    /** El menú de cada plato elegido, en el mismo orden. */
    dishSources?: ({ familyName: string; slot: number } | null)[];
    id: string;
    offeringId: string | null;
    productName: string;
    quantityUnits: number;
    totalMinor: number;
    unitPriceMinor: number;
    variantName: string;
  }[];
  menuId: string;
  notes: string | null;
  /** Texto libre que anota el operador ("martes"), aparte de la fecha de entrega. */
  deliveryDayText: string | null;
  /** Texto libre: "9 a 12 hs". */
  deliveryTimeSlot: string | null;
  /** La ciudad de la operación: la que decide numeración, menú y precios. */
  operatingSiteName: string | null;
  paidAt: string | null;
  paymentExpectation: string;
  publicNumber: string;
  source: string;
  status: 'DRAFT' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED';
  totalMinor: number;
  updatedAt: string;
}

export interface OrderStatusHistoryEntry {
  actorDisplayName: string | null;
  actorUserId: string | null;
  createdAt: string;
  fromStatus: OrderSummary['status'] | null;
  id: string;
  reason: string | null;
  toStatus: OrderSummary['status'];
}

export interface OrderRevision {
  actorDisplayName: string | null;
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
    /** Pedidos distintos que aportan a este renglón, que no es lo mismo que las unidades. */
    orderCount: number;
    quantityUnits: number;
    variantName: string;
  }[];
  custom: {
    customerDisplayName: string;
    dietaryInstructions: string[];
    dishSelections: string[];
    dishSources?: ({ familyName: string; slot: number } | null)[];
    familyName: string;
    orderId?: string;
    orderPublicNumber: string;
    quantityUnits: number;
    sequence: number;
    variantName: string;
  }[];
  cycle: { alias: string; id: string };
  /** Los platos de todos los Intuitivos, sumados y de mayor a menor. */
  dishTally: { dishName: string; familyName?: string | null; portions: number }[];
  generatedAt: string;
  /** El stock para la venta del período: se cocina, pero no es de ningún pedido. */
  stock: { familyName: string; quantityUnits: number; variantName: string }[];
  totalOrders: number;
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
  /** Ya sumado en `produccionPlanificada`. */
  stockPlanificado: number;
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
  intuitivoCustomerName: boolean;
  kitchenMode: boolean;
  showSize: boolean;
  alignment: 'center' | 'left';
  backgroundImageUrl: string | null;
  /** Nombre de pila e iniciales, en vez del nombre completo. */
  hideSurname: boolean;
  /** Una etiqueta por plato en vez de una por vianda. */
  onePerDish: boolean;
  /** El logo de Verdeo arriba y centrado, con su alto y el espacio de abajo (mm). */
  showLogo: boolean;
  logoHeightMm: number;
  logoPaddingBottomMm: number;
  /** Marcas de recorte en las esquinas de cada etiqueta. */
  showCutLines: boolean;
  /** Una frase propia para el campo "Frase". */
  customPhrase: string | null;
  layout: 'clasica' | 'compacta' | 'protagonista';
  /** La hoja, en milímetros: de acá sale el lienzo real de cada etiqueta. */
  labelGapMm: number;
  /** El nombre sólo en las Intuitivo, que son las que no se identifican por variedad y tamaño. */
  nameOnlyForComposable: boolean;
  sheetHeightMm: number;
  sheetMarginMm: number;
  sheetWidthMm: number;
  /** Qué campos, además del nombre, se imprimen — en el orden en que salen. */
  fields: (
    | 'entrega'
    | 'frase'
    | 'numero'
    | 'plato'
    | 'platos'
    | 'produccion'
    | 'restricciones'
    | 'tamano'
    | 'unidad'
    | 'variedad'
    | 'zona'
  )[];
  fontFamily:
    | 'clasica'
    | 'condensed'
    | 'elegante'
    | 'grotesque'
    | 'humanist'
    | 'manuscrita'
    | 'maquina'
    | 'mono'
    | 'rounded'
    | 'serif'
    | 'system'
    | 'titular';
  /** Porcentaje sobre el tamaño base de la etiqueta, entre 60 y 200. */
  fontScale: number;
  id: string | null;
  labelsPerPage: number;
  showBorders: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
  uppercaseName: boolean;
  showCustomerName: boolean;
  nameScale: number;
  namePosition: 'arriba' | 'abajo';
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

/**
 * El error de una respuesta, como una sola línea lista para mostrar.
 *
 * Devolvía el `message` de la API tal cual, que dejaba "Forbidden" y "Failed to fetch" en la
 * pantalla y hacía que tres situaciones muy distintas —sin permiso, sin conexión, rechazado por una
 * regla— se vieran iguales. Ahora pasa por `describeResponse`, así que además de qué pasó dice qué
 * hacer. Las pantallas que quieran el error separado en partes usan `describeResponse` directo.
 */
export async function errorMessage(response: Response): Promise<string> {
  return errorText(await describeResponse(response));
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

/**
 * El estado de un cliente, en castellano.
 *
 * La ficha y la lista mostraban el valor de la columna —`active`, y desde el borrado también
 * `archived`— dentro de un chip. Un chip que dice "archived" no le explica a nadie que ese cliente
 * fue dado de baja pero conserva su historial de venta, que es exactamente lo que significa.
 *
 * Un estado desconocido se muestra tal cual, como en los pedidos: es un campo configurable, y
 * esconder un valor que alguien cargó sería peor que mostrarlo sin traducir.
 */
const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  archived: 'Archivado',
  blocked: 'Bloqueado',
  inactive: 'Inactivo',
  prospect: 'Prospecto',
};

export function customerStatusLabel(status: string): string {
  return CUSTOMER_STATUS_LABELS[status] ?? status;
}

/** Los estados que ofrece el formulario. Escribir uno a mano creaba estados que nada entiende. */
export const CUSTOMER_STATUSES = Object.keys(CUSTOMER_STATUS_LABELS);

/**
 * Las variedades como se eligen: el Intuitivo último.
 *
 * El Intuitivo no es una variedad más —hay que armarlo, eligiendo cinco platos— y apareciendo
 * primero se lleva puesta la decisión: quien viene a pedir "el Keto" se encuentra arriba con una
 * tarjeta que le pide construir algo. Va al final, después de los menús que ya vienen resueltos.
 *
 * Dentro de cada grupo se mantiene el orden que trae el menú, que es el que el operador armó.
 */
export function offeringsForPicking<T extends { composable: boolean }>(
  offerings: readonly T[],
): T[] {
  return [
    ...offerings.filter((offering) => !offering.composable),
    ...offerings.filter((offering) => offering.composable),
  ];
}
