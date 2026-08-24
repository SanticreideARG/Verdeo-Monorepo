export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface KitchenSourceLine {
  // True when the family's kind is COMPOSABLE. Kitchen groups by behaviour, not by variety name.
  composable: boolean;
  customerDisplayName: string;
  dietaryInstructions: readonly string[];
  dishSelections: readonly string[];
  familyName: string;
  orderPublicNumber: string;
  quantityUnits: number;
  variantName: string;
}

export interface KitchenBaseRequirement {
  exceptions: {
    customerDisplayName: string;
    dietaryInstructions: readonly string[];
    orderPublicNumber: string;
    quantityUnits: number;
  }[];
  familyName: string;
  quantityUnits: number;
  variantName: string;
}

export interface KitchenCustomRequirement extends KitchenSourceLine {
  sequence: number;
}

export interface KitchenSummary {
  base: KitchenBaseRequirement[];
  custom: KitchenCustomRequirement[];
  totalUnits: number;
}

export interface Label {
  // Only set for a composable (Intuitivo) unit — a fixed variety's label never carries a name.
  customerDisplayName: string | null;
  familyName: string;
  orderPublicNumber: string;
  variantName: string;
}
