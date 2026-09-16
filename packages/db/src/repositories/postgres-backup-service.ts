import { and, eq, getTableColumns, inArray, sql, type AnyColumn } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../index.js';

/** La base o una transacción sobre ella: la restauración corre igual en las dos. */
type Ejecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
import {
  cancellationReasons,
  customerAddresses,
  customerIdentities,
  customerOperatingSites,
  customerPreferences,
  customerRestrictions,
  customers,
  deliveryRoutes,
  deliveryStops,
  geographicZones,
  helpArticles,
  labelSettings,
  menuCatalogSettings,
  operatingSiteOrderCounters,
  operatingSites,
  orderDietaryInstructions,
  orderItemSelections,
  orderItems,
  orderRevisions,
  orderStatusHistory,
  orders,
  paymentMethods,
  payments,
  productFamilies,
  productSizes,
  productVariants,
  productionActuals,
  productionSnapshots,
  salesCycles,
  surveyAnswers,
  surveyQuestions,
  surveyResponses,
  surveys,
  weeklyMenuItems,
  weeklyMenuOfferings,
  weeklyMenuPrices,
  weeklyMenus,
} from '../schema/index.js';

/**
 * Los grupos que se pueden respaldar, cada uno con las tablas que hacen falta para que lo que se
 * lleva siga teniendo sentido.
 *
 * Están pensados como unidades de lectura humana ("los clientes", "los pedidos de esta semana") y
 * no como una lista de tablas: quien baja un respaldo piensa en la operación, no en el esquema.
 */
export const BACKUP_PARTS = [
  'operacion',
  'clientes',
  'catalogo',
  'semanas',
  'pedidos',
  'cobros',
  'produccion',
  'reparto',
  'encuestas',
  'configuracion',
] as const;

export type BackupPart = (typeof BACKUP_PARTS)[number];

export interface BackupOptions {
  /** Recorta pedidos y producción a un ciclo. Sin esto, van todos. */
  cycleId?: string | undefined;
  /** Recorta clientes, pedidos y rutas a una ciudad. Sin esto, van todas. */
  operatingSiteId?: string | undefined;
  parts: readonly BackupPart[];
}

export interface BackupManifest {
  appVersion: string;
  counts: Record<string, number>;
  cycleId: string | null;
  generatedAt: string;
  operatingSiteId: string | null;
  parts: readonly BackupPart[];
  /** La última migración aplicada: un archivo de otro esquema no se restaura a ciegas. */
  schemaVersion: string;
}

export type RestoreMode = 'faltantes' | 'reemplazar';

export interface RestoreOptions {
  /** Sin escribir nada: informa qué pasaría. Es obligatorio antes de restaurar de verdad. */
  dryRun: boolean;
  mode: RestoreMode;
}

export interface RestoreLine {
  actualizar: number;
  crear: number;
  tabla: string;
}

export interface RestoreReport {
  dryRun: boolean;
  lineas: RestoreLine[];
  mode: RestoreMode;
  totalActualizar: number;
  totalCrear: number;
}

export interface BackupPackage {
  data: Record<string, unknown[]>;
  manifest: BackupManifest;
}

/**
 * El respaldo de la operación, en JSON y con los identificadores intactos.
 *
 * Las exportaciones a Excel que ya existen son informes: sirven para leer, mandar y archivar, pero
 * pierden los identificadores y las relaciones, así que con una planilla se rehace una lista de
 * clientes y no se reconstruye un pedido con sus ítems, su historial y su precio congelado. Esto es
 * lo otro: el archivo del que se puede volver.
 *
 * **Lo que nunca sale**: contraseñas, sesiones, tokens, credenciales de integraciones y claves de
 * IA. Un respaldo que las lleve convierte cada descarga en una filtración. Tampoco van los usuarios
 * ni los roles —decisión explícita— ni la auditoría, que es la tabla más grande y tiene su propia
 * exportación.
 *
 * **Tampoco van las estadísticas**: se calculan de los pedidos. Un número guardado que ya no
 * coincide con los datos que lo produjeron es peor que no tenerlo.
 */
/*
 * El orden en el que se aplican las tablas: primero las que otras referencian.
 *
 * No es un detalle de prolijidad: restaurar un pedido antes que su cliente falla por clave foránea
 * y aborta la transacción entera. Está escrito a mano y no deducido del esquema porque el orden es
 * una decisión que conviene poder leer.
 *
 * `clave` es por dónde se reconoce una fila que ya está: casi siempre `id`, salvo las que tienen
 * clave compuesta o cuya clave es otra columna.
 */
const RESTORE_ORDER: readonly { clave: readonly string[]; nombre: string; tabla: PgTable }[] = [
  { clave: ['id'], nombre: 'operating_sites', tabla: operatingSites },
  { clave: ['id'], nombre: 'geographic_zones', tabla: geographicZones },
  {
    clave: ['operatingSiteId'],
    nombre: 'operating_site_order_counters',
    tabla: operatingSiteOrderCounters,
  },
  { clave: ['id'], nombre: 'product_families', tabla: productFamilies },
  { clave: ['id'], nombre: 'product_sizes', tabla: productSizes },
  { clave: ['id'], nombre: 'product_variants', tabla: productVariants },
  { clave: ['id'], nombre: 'cancellation_reasons', tabla: cancellationReasons },
  { clave: ['id'], nombre: 'payment_methods', tabla: paymentMethods },
  { clave: ['id'], nombre: 'menu_catalog_settings', tabla: menuCatalogSettings },
  { clave: ['id'], nombre: 'customers', tabla: customers },
  {
    clave: ['customerId', 'operatingSiteId'],
    nombre: 'customer_operating_sites',
    tabla: customerOperatingSites,
  },
  { clave: ['id'], nombre: 'customer_identities', tabla: customerIdentities },
  { clave: ['id'], nombre: 'customer_addresses', tabla: customerAddresses },
  { clave: ['id'], nombre: 'customer_preferences', tabla: customerPreferences },
  { clave: ['id'], nombre: 'customer_restrictions', tabla: customerRestrictions },
  { clave: ['id'], nombre: 'sales_cycles', tabla: salesCycles },
  { clave: ['id'], nombre: 'weekly_menus', tabla: weeklyMenus },
  { clave: ['id'], nombre: 'weekly_menu_prices', tabla: weeklyMenuPrices },
  { clave: ['id'], nombre: 'weekly_menu_offerings', tabla: weeklyMenuOfferings },
  { clave: ['id'], nombre: 'weekly_menu_items', tabla: weeklyMenuItems },
  { clave: ['id'], nombre: 'orders', tabla: orders },
  { clave: ['id'], nombre: 'order_items', tabla: orderItems },
  { clave: ['id'], nombre: 'order_item_selections', tabla: orderItemSelections },
  { clave: ['id'], nombre: 'order_status_history', tabla: orderStatusHistory },
  { clave: ['id'], nombre: 'order_revisions', tabla: orderRevisions },
  { clave: ['id'], nombre: 'order_dietary_instructions', tabla: orderDietaryInstructions },
  { clave: ['id'], nombre: 'payments', tabla: payments },
  { clave: ['id'], nombre: 'production_snapshots', tabla: productionSnapshots },
  { clave: ['id'], nombre: 'production_actuals', tabla: productionActuals },
  { clave: ['id'], nombre: 'delivery_routes', tabla: deliveryRoutes },
  { clave: ['id'], nombre: 'delivery_stops', tabla: deliveryStops },
  { clave: ['id'], nombre: 'surveys', tabla: surveys },
  { clave: ['id'], nombre: 'survey_questions', tabla: surveyQuestions },
  { clave: ['id'], nombre: 'survey_responses', tabla: surveyResponses },
  { clave: ['id'], nombre: 'survey_answers', tabla: surveyAnswers },
  { clave: ['id'], nombre: 'label_settings', tabla: labelSettings },
  { clave: ['id'], nombre: 'help_articles', tabla: helpArticles },
];

export class RestoreSchemaMismatchError extends Error {
  public constructor(esperada: string, delArchivo: string) {
    super(
      `El archivo se generó con ${delArchivo} y esta base tiene ${esperada}. Restaurarlo podría escribir columnas que ya no existen o dejar sin llenar las nuevas.`,
    );
    this.name = 'RestoreSchemaMismatchError';
  }
}

export class PostgresBackupService {
  public constructor(
    private readonly database: Database,
    private readonly appVersion: string,
  ) {}

  /**
   * Cuántas migraciones tiene aplicada esta base.
   *
   * Va en el manifiesto para que la restauración pueda negarse ante un archivo de otro esquema. Se
   * lee de la base y no del repositorio: lo que importa es qué tiene aplicado la base de la que
   * salió el archivo, no qué migraciones existían cuando se compiló la aplicación.
   */
  private async readSchemaVersion(): Promise<string> {
    try {
      const [row] = await this.database.execute<{ total: number }>(
        sql`select count(*)::int as total from drizzle.__drizzle_migrations`,
      );
      return row ? `${String(row.total)} migraciones` : 'desconocida';
    } catch {
      // Una base sin la tabla de control (un entorno de prueba recién creado) no impide respaldar.
      return 'desconocida';
    }
  }

  public async exportBackup(options: BackupOptions): Promise<BackupPackage> {
    const data: Record<string, unknown[]> = {};
    const wants = (part: BackupPart) => options.parts.includes(part);
    const site = options.operatingSiteId;
    const cycle = options.cycleId;

    /*
     * Las ciudades y las zonas viajan siempre que se lleve algo que las referencia: un cliente sin
     * su zona no se puede restaurar, y enterarse recién al restaurar es tarde.
     */
    if (wants('operacion') || wants('clientes') || wants('pedidos') || wants('reparto')) {
      data.operating_sites = await this.database.select().from(operatingSites);
      data.geographic_zones = await this.database.select().from(geographicZones);
    }
    if (wants('operacion')) {
      data.operating_site_order_counters = await this.database
        .select()
        .from(operatingSiteOrderCounters);
    }

    if (wants('clientes')) {
      const rows = site
        ? await this.database
            .select({ customer: customers })
            .from(customers)
            .innerJoin(customerOperatingSites, eq(customerOperatingSites.customerId, customers.id))
            .where(eq(customerOperatingSites.operatingSiteId, site))
            .then((joined) => joined.map(({ customer }) => customer))
        : await this.database.select().from(customers);
      const ids = rows.map((row) => row.id);
      data.customers = rows;
      data.customer_operating_sites = await this.some(ids, (list) =>
        this.database
          .select()
          .from(customerOperatingSites)
          .where(inArray(customerOperatingSites.customerId, list)),
      );
      data.customer_identities = await this.some(ids, (list) =>
        this.database
          .select()
          .from(customerIdentities)
          .where(inArray(customerIdentities.customerId, list)),
      );
      data.customer_addresses = await this.some(ids, (list) =>
        this.database
          .select()
          .from(customerAddresses)
          .where(inArray(customerAddresses.customerId, list)),
      );
      data.customer_preferences = await this.some(ids, (list) =>
        this.database
          .select()
          .from(customerPreferences)
          .where(inArray(customerPreferences.customerId, list)),
      );
      data.customer_restrictions = await this.some(ids, (list) =>
        this.database
          .select()
          .from(customerRestrictions)
          .where(inArray(customerRestrictions.customerId, list)),
      );
    }

    if (wants('catalogo')) {
      data.product_families = await this.database.select().from(productFamilies);
      data.product_sizes = await this.database.select().from(productSizes);
      data.product_variants = await this.database.select().from(productVariants);
      data.cancellation_reasons = await this.database.select().from(cancellationReasons);
      data.payment_methods = await this.database.select().from(paymentMethods);
      data.menu_catalog_settings = await this.database.select().from(menuCatalogSettings);
    }

    if (wants('semanas')) {
      data.sales_cycles = cycle
        ? await this.database.select().from(salesCycles).where(eq(salesCycles.id, cycle))
        : await this.database.select().from(salesCycles);
      const menus = cycle
        ? await this.database.select().from(weeklyMenus).where(eq(weeklyMenus.salesCycleId, cycle))
        : await this.database.select().from(weeklyMenus);
      data.weekly_menus = menus;
      const menuIds = menus.map((menu) => menu.id);
      data.weekly_menu_prices = await this.some(menuIds, (list) =>
        this.database
          .select()
          .from(weeklyMenuPrices)
          .where(inArray(weeklyMenuPrices.weeklyMenuId, list)),
      );
      const offerings = await this.some(menuIds, (list) =>
        this.database
          .select()
          .from(weeklyMenuOfferings)
          .where(inArray(weeklyMenuOfferings.weeklyMenuId, list)),
      );
      data.weekly_menu_offerings = offerings;
      // Los platos cuelgan de la oferta, no del menú: un Intuitivo y un Keto del mismo menú tienen
      // listas distintas.
      data.weekly_menu_items = await this.some(
        offerings.map((offering) => offering.id),
        (list) =>
          this.database
            .select()
            .from(weeklyMenuItems)
            .where(inArray(weeklyMenuItems.offeringId, list)),
      );
    }

    let orderIds: string[] = [];
    if (wants('pedidos') || wants('cobros')) {
      const conditions = [
        ...(cycle ? [eq(orders.salesCycleId, cycle)] : []),
        ...(site ? [eq(orders.operatingSiteId, site)] : []),
      ];
      const rows =
        conditions.length === 0
          ? await this.database.select().from(orders)
          : await this.database
              .select()
              .from(orders)
              .where(and(...conditions));
      orderIds = rows.map((row) => row.id);
      if (wants('pedidos')) {
        data.orders = rows;
        const items = await this.some(orderIds, (list) =>
          this.database.select().from(orderItems).where(inArray(orderItems.orderId, list)),
        );
        data.order_items = items;
        data.order_item_selections = await this.some(
          items.map((item) => item.id),
          (list) =>
            this.database
              .select()
              .from(orderItemSelections)
              .where(inArray(orderItemSelections.orderItemId, list)),
        );
        data.order_status_history = await this.some(orderIds, (list) =>
          this.database
            .select()
            .from(orderStatusHistory)
            .where(inArray(orderStatusHistory.orderId, list)),
        );
        data.order_revisions = await this.some(orderIds, (list) =>
          this.database.select().from(orderRevisions).where(inArray(orderRevisions.orderId, list)),
        );
        data.order_dietary_instructions = await this.some(orderIds, (list) =>
          this.database
            .select()
            .from(orderDietaryInstructions)
            .where(inArray(orderDietaryInstructions.orderId, list)),
        );
      }
    }

    if (wants('cobros')) {
      data.payments = await this.some(orderIds, (list) =>
        this.database.select().from(payments).where(inArray(payments.orderId, list)),
      );
    }

    if (wants('produccion')) {
      data.production_snapshots = cycle
        ? await this.database
            .select()
            .from(productionSnapshots)
            .where(eq(productionSnapshots.salesCycleId, cycle))
        : await this.database.select().from(productionSnapshots);
      data.production_actuals = cycle
        ? await this.database
            .select()
            .from(productionActuals)
            .where(eq(productionActuals.salesCycleId, cycle))
        : await this.database.select().from(productionActuals);
    }

    if (wants('reparto')) {
      const routes = site
        ? await this.database
            .select()
            .from(deliveryRoutes)
            .where(eq(deliveryRoutes.operatingSiteId, site))
        : await this.database.select().from(deliveryRoutes);
      data.delivery_routes = routes;
      data.delivery_stops = await this.some(
        routes.map((route) => route.id),
        (list) =>
          this.database.select().from(deliveryStops).where(inArray(deliveryStops.routeId, list)),
      );
    }

    if (wants('encuestas')) {
      const rows = await this.database.select().from(surveys);
      data.surveys = rows;
      const surveyIds = rows.map((row) => row.id);
      data.survey_questions = await this.some(surveyIds, (list) =>
        this.database.select().from(surveyQuestions).where(inArray(surveyQuestions.surveyId, list)),
      );
      const responses = await this.some(surveyIds, (list) =>
        this.database.select().from(surveyResponses).where(inArray(surveyResponses.surveyId, list)),
      );
      data.survey_responses = responses;
      data.survey_answers = await this.some(
        responses.map((response) => response.id),
        (list) =>
          this.database.select().from(surveyAnswers).where(inArray(surveyAnswers.responseId, list)),
      );
    }

    if (wants('configuracion')) {
      data.label_settings = await this.database.select().from(labelSettings);
      data.help_articles = await this.database.select().from(helpArticles);
    }

    const counts: Record<string, number> = {};
    for (const [table, rows] of Object.entries(data)) counts[table] = rows.length;

    return {
      data,
      manifest: {
        appVersion: this.appVersion,
        counts,
        cycleId: cycle ?? null,
        generatedAt: new Date().toISOString(),
        operatingSiteId: site ?? null,
        parts: options.parts,
        schemaVersion: await this.readSchemaVersion(),
      },
    };
  }

  /**
   * Restaura un paquete, o dice qué haría.
   *
   * Tres frenos, en este orden:
   *
   * 1. **El esquema tiene que coincidir.** Un archivo de otra versión puede traer columnas que ya no
   *    existen o no traer las nuevas, y eso no se arregla a mitad de camino.
   * 2. **La simulación no escribe nada.** Es obligatoria del lado de la pantalla y acá es un modo
   *    real: cuenta contra la base, sin tocarla.
   * 3. **Todo o nada.** Una transacción única: si una fila falla —una clave foránea que no está,
   *    por ejemplo—, no queda media restauración a medio aplicar.
   *
   * Dos modos. `faltantes` sólo inserta lo que no está: sirve para recuperar algo borrado sin pisar
   * lo que se hizo después. `reemplazar` además actualiza lo que ya existe, que es lo que se quiere
   * al clonar una base en otra.
   *
   * **Nunca borra.** Una fila que está en la base y no en el archivo se queda: un respaldo es lo que
   * había, no una foto de lo que debe haber, y borrar por omisión convierte un archivo viejo en una
   * bomba.
   *
   * **Los usuarios no viajan en el paquete**, así que las columnas que apuntan a una persona (quién
   * confirmó, quién cobró, quién repartió) necesitan que esos usuarios existan en la base destino.
   * Contra la base de la que salió el archivo eso se cumple solo; contra una base nueva, no.
   */
  public async restoreBackup(
    paquete: BackupPackage,
    options: RestoreOptions,
  ): Promise<RestoreReport> {
    const actual = await this.readSchemaVersion();
    if (paquete.manifest.schemaVersion !== actual) {
      throw new RestoreSchemaMismatchError(actual, paquete.manifest.schemaVersion);
    }

    const lineas: RestoreLine[] = [];

    const aplicar = async (transaction: Ejecutor) => {
      for (const { clave, nombre, tabla } of RESTORE_ORDER) {
        const filas = (paquete.data[nombre] ?? []) as Record<string, unknown>[];
        if (filas.length === 0) continue;

        const columnas = getTableColumns(tabla) as Record<string, { dataType: string }>;
        const valores = filas.map((fila) => this.coerce(fila, columnas));
        const existentes = await this.existing(transaction, tabla, clave, valores);
        const enBase = (fila: Record<string, unknown>) =>
          existentes.has(clave.map((columna) => String(fila[columna])).join('|'));

        const crear = valores.filter((fila) => !enBase(fila)).length;
        const actualizar = options.mode === 'reemplazar' ? valores.length - crear : 0;
        lineas.push({ actualizar, crear, tabla: nombre });

        if (options.dryRun) continue;

        const objetivo = clave.map((columna) => columnas[columna] as never);
        const insert = transaction.insert(tabla).values(valores);
        if (options.mode === 'reemplazar') {
          const set: Record<string, unknown> = {};
          for (const columna of Object.keys(columnas)) {
            if (clave.includes(columna)) continue;
            set[columna] = sql.raw(
              `excluded."${(columnas[columna] as unknown as { name: string }).name}"`,
            );
          }
          await insert.onConflictDoUpdate({ set, target: objetivo });
        } else {
          await insert.onConflictDoNothing({ target: objetivo });
        }
      }
    };

    if (options.dryRun) await aplicar(this.database);
    else await this.database.transaction(async (transaction) => aplicar(transaction));

    return {
      dryRun: options.dryRun,
      lineas,
      mode: options.mode,
      totalActualizar: lineas.reduce((total, linea) => total + linea.actualizar, 0),
      totalCrear: lineas.reduce((total, linea) => total + linea.crear, 0),
    };
  }

  /**
   * Qué filas del archivo ya están en la base.
   *
   * Con clave simple alcanza un `in`; con clave compuesta se pregunta por cada par. Son pocas filas
   * —las membresías de los clientes— y la alternativa, armar una condición compuesta enorme, se lee
   * mucho peor de lo que ahorra.
   */
  private async existing(
    database: Ejecutor,
    tabla: PgTable,
    clave: readonly string[],
    filas: readonly Record<string, unknown>[],
  ): Promise<Set<string>> {
    const columnas = getTableColumns(tabla) as Record<string, AnyColumn>;
    const encontradas = new Set<string>();
    if (clave.length === 1) {
      const columna = clave[0] as string;
      const ids = filas.map((fila) => fila[columna]).filter(Boolean);
      if (ids.length === 0) return encontradas;
      const rows = (await database
        .select()
        .from(tabla)
        .where(inArray(columnas[columna] as AnyColumn, ids))) as Record<string, unknown>[];
      for (const row of rows) encontradas.add(String(row[columna]));
      return encontradas;
    }
    for (const fila of filas) {
      const condiciones = clave.map((columna) => eq(columnas[columna] as AnyColumn, fila[columna]));
      const rows = (await database
        .select()
        .from(tabla)
        .where(and(...condiciones))
        .limit(1)) as unknown[];
      if (rows.length > 0) encontradas.add(clave.map((columna) => String(fila[columna])).join('|'));
    }
    return encontradas;
  }

  /**
   * Los valores del archivo, en el tipo que espera la base.
   *
   * JSON no tiene fechas: lo que salió como `Date` vuelve como texto, y escribirlo así en una
   * columna de fecha falla. Se convierte por tipo de columna y no por nombre, que es lo que
   * sobrevive a que alguien agregue una columna nueva.
   */
  private coerce(
    fila: Record<string, unknown>,
    columnas: Record<string, { dataType: string }>,
  ): Record<string, unknown> {
    const salida: Record<string, unknown> = {};
    for (const [nombre, columna] of Object.entries(columnas)) {
      const valor = fila[nombre];
      if (valor === undefined) continue;
      salida[nombre] =
        columna.dataType === 'date' && typeof valor === 'string' ? new Date(valor) : valor;
    }
    return salida;
  }

  /**
   * Las filas hijas de un conjunto de padres, sin consultar cuando no hay padres.
   *
   * `in ()` no es SQL válido, y además no hay nada que traer: es el caso normal al respaldar una
   * ciudad que todavía no vendió.
   */
  private async some<T>(
    ids: readonly string[],
    query: (ids: string[]) => Promise<T[]>,
  ): Promise<T[]> {
    return ids.length === 0 ? [] : query([...ids]);
  }
}
