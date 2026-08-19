export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface KitchenSourceLine {
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
