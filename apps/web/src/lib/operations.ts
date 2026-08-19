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
}

export interface MenuOffering {
  currency: string;
  dishes: string[];
  familyName: string;
  id: string;
  mealsPerUnit: number;
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
  publishedAt: string | null;
  revision: number;
  status: string;
}

export interface OrderSummary {
  createdAt: string;
  currency: string;
  customer: { displayName: string; id: string };
  deliveryAddress: string;
  deliveryDate: string;
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

export async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? 'No pudimos completar la operación.';
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', { currency, style: 'currency' }).format(amountMinor / 100);
}
