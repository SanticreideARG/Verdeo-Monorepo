import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
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
