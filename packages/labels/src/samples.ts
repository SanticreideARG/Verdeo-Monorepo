import type { LabelData } from './types.js';

/**
 * Etiquetas de ejemplo para el visor cuando la tanda todavía no tiene pedidos, con los casos que
 * ponen a prueba un formato: un nombre larguísimo, una Intuitivo con sus platos, restricciones, una
 * vianda de varias unidades. Nombres inventados; no hay datos de ningún cliente.
 */
export const SAMPLE_LABELS: readonly LabelData[] = [
  {
    composable: false,
    customerDisplayName: 'Ana Isabella Vega',
    deliveryDate: '2026-09-13',
    deliveryZone: 'Centro',
    dietaryInstructions: ['Sin cebolla'],
    dishIndex: 1,
    dishName: null,
    dishTotal: 1,
    dishes: [
      'Pollo al horno con calabaza',
      'Wraps de pechuga con crema de cúrcuma',
      'Milanesa de berenjena',
      'Tarta de zucchini',
      'Albóndigas con puré',
    ],
    familyName: 'Menú Keto',
    orderPublicNumber: 'NQN-00090',
    unitIndex: 1,
    unitTotal: 3,
    variantName: '250',
  },
  {
    composable: true,
    customerDisplayName: 'María de los Ángeles Fernández Rodríguez',
    deliveryDate: '2026-09-13',
    deliveryZone: 'Zona Oeste',
    dietaryInstructions: [],
    dishIndex: 1,
    dishName: null,
    dishTotal: 1,
    dishes: ['Salmón con vegetales', 'Ensalada tibia de quinoa', 'Lasaña de calabaza'],
    familyName: 'Intuitivo',
    orderPublicNumber: 'NQN-00091',
    unitIndex: 1,
    unitTotal: 1,
    variantName: '400',
  },
  {
    composable: false,
    customerDisplayName: 'Tomás Peralta',
    deliveryDate: '2026-09-13',
    deliveryZone: null,
    dietaryInstructions: ['Sin gluten', 'Sin lácteos'],
    dishIndex: 2,
    dishName: 'Pollo al horno con calabaza',
    dishTotal: 5,
    dishes: ['Pollo al horno con calabaza'],
    familyName: 'Menú Real',
    orderPublicNumber: 'NQN-00092',
    unitIndex: 2,
    unitTotal: 2,
    variantName: '400',
  },
];
