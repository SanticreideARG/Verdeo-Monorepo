/**
 * Qué puede llevar una etiqueta además del nombre, en el orden en que se imprime.
 *
 * Es el catálogo único: la base valida contra él al leer lo guardado, el contrato de la API lo usa
 * para aceptar o rechazar, y la pantalla lo usa para ofrecer las casillas. Estaba repetido en cada
 * uno de esos lugares, y uno se había quedado sin `plato`: el campo se elegía en pantalla y se
 * descartaba en silencio al guardar, así que nunca salía en el papel.
 *
 * El nombre del cliente no está: va siempre, no se puede quitar. Es lo único que responde de quién
 * es la vianda, que es la pregunta que la etiqueta existe para contestar.
 */
export const LABEL_FIELDS = [
  /** El plato de esta etiqueta, cuando se imprime una por plato ("Pollo al horno · 2 de 5"). */
  'plato',
  'tamano',
  'variedad',
  /** Todos los platos de la vianda, uno por renglón, debajo de la variedad. */
  'platos',
  'unidad',
  'numero',
  'zona',
  'entrega',
  /** La fecha de elaboración, que se elige al ver o imprimir la tanda. */
  'produccion',
  'restricciones',
  /** Una frase propia ("Calentar 3 minutos"), la misma en todas las etiquetas. */
  'frase',
] as const;

export type LabelField = (typeof LABEL_FIELDS)[number];

/** Cómo se acomoda el contenido: el de siempre, el nombre grande para repartir, o el compacto. */
export const LABEL_LAYOUTS = ['clasica', 'protagonista', 'compacta'] as const;

export type LabelLayout = (typeof LABEL_LAYOUTS)[number];

export const LAYOUT_OPTIONS: readonly { description: string; key: LabelLayout; label: string }[] = [
  {
    description: 'El nombre y debajo los campos, uno por renglón.',
    key: 'clasica',
    label: 'Clásica',
  },
  {
    description: 'El nombre bien grande, para leerlo de lejos al repartir; los campos al pie.',
    key: 'protagonista',
    label: 'Nombre protagonista',
  },
  {
    description: 'Todo más chico, para hojas con muchas etiquetas.',
    key: 'compacta',
    label: 'Compacta',
  },
];

/** Una etiqueta tal como la arma el servidor: una por unidad física (o por plato). */
export interface LabelData {
  composable: boolean;
  customerDisplayName: string;
  deliveryDate: string;
  deliveryZone: string | null;
  dietaryInstructions: readonly string[];
  /** Cuál de los platos es éste, cuando se imprime una etiqueta por plato. */
  dishIndex: number;
  /** El plato, o null cuando la etiqueta es de la vianda entera. */
  dishName: string | null;
  dishTotal: number;
  /** Los platos de la vianda: los del menú en una variedad fija, los elegidos en una Intuitivo. */
  dishes: readonly string[];
  familyName: string;
  orderPublicNumber: string;
  unitIndex: number;
  unitTotal: number;
  variantName: string;
}

/** Lo que el dibujo necesita de la configuración guardada (y de la que se está probando). */
export interface LabelRenderSettings {
  alignment: 'center' | 'left';
  /** Una frase propia para el campo `frase`. */
  customPhrase: string | null;
  fields: readonly LabelField[];
  fontFamily: string;
  fontScale: number;
  hideSurname: boolean;
  labelGapMm: number;
  labelsPerPage: number;
  layout: LabelLayout;
  /** Cuánto mide el logo de alto, en milímetros. */
  logoHeightMm: number;
  /** El espacio entre el logo y lo que sigue, en milímetros. */
  logoPaddingBottomMm: number;
  nameOnlyForComposable: boolean;
  sheetHeightMm: number;
  sheetMarginMm: number;
  sheetWidthMm: number;
  /** El recuadro alrededor de cada etiqueta. */
  showBorders: boolean;
  /** Marcas de recorte en las esquinas, fuera de la etiqueta. */
  showCutLines: boolean;
  showLogo: boolean;
  uppercaseName: boolean;
}
