import type { AssistantDataSource, AssistantMode } from '@verdeo/ai';

/**
 * Los datos que el búho recibe con cada pregunta (BUHO_WORKBENCH_PLAN.md, 2026-10-30).
 *
 * El modelo no consulta la base: el servidor llama a los mismos servicios que usan Estadísticas,
 * Cocina y el informe del período, así el búho dice los mismos números que esas pantallas, y le
 * pasa un resumen. **Sin datos personales**: `clean` saca toda clave que nombre a un cliente, un
 * contacto, un domicilio, una nota o un identificador, y lo que falta cobrar viaja sumado, nunca
 * por cliente.
 */
export interface AssistantDataPort {
  cycleReport(cycleId: string, operatingSiteId?: string | null): Promise<unknown>;
  dispatchSummary?(date: string, operatingSiteId: string | null): Promise<unknown>;
  getStatsPeriods(filters: {
    from?: string | undefined;
    operatingSiteId?: string | undefined;
  }): Promise<unknown>;
  kitchenSummary(cycleId: string, operatingSiteId: string | null): Promise<unknown>;
  listHelp(): Promise<unknown>;
  listMenus(onlyPublished?: boolean): Promise<unknown>;
  listReceivables(input: { operatingSiteId?: string | null | undefined }): Promise<unknown>;
  listStockLots(input: {
    onlyAvailable?: boolean | undefined;
    operatingSiteId?: string | null | undefined;
  }): Promise<unknown>;
}

export interface AssistantContext {
  cycleAlias: string | null;
  /** Los datos que el modo pedía y no se mandaron (sin permiso o sin período), para decirlo. */
  omitted: string[];
  siteName: string | null;
  text: string;
}

interface MenuRow {
  cycle: { alias: string; closeAt: Date | string; id: string; openAt: Date | string };
  offerings: {
    composable?: boolean;
    dishes: string[];
    familyName: string;
    unitPriceMinor: number;
    variantName: string;
  }[];
  operatingSiteId: string | null;
  operatingSiteName: string | null;
}

interface HelpArticle {
  body: string;
  category: string;
  title: string;
}

const SOURCE_LABEL: Record<AssistantDataSource, string> = {
  comparison: 'la comparación con otros períodos',
  dispatch: 'el reparto de hoy',
  help: 'la ayuda',
  kitchen: 'lo que hay que cocinar',
  menu: 'el menú',
  period: 'el informe del período',
  receivables: 'lo que falta cobrar',
  stock: 'el stock',
};

/** Qué permiso pide cada dato: el mismo que la pantalla donde se ve. */
const SOURCE_PERMISSIONS: Record<AssistantDataSource, readonly string[]> = {
  comparison: ['stats.read'],
  dispatch: ['orders.read'],
  help: [],
  kitchen: ['production.read', 'orders.read'],
  menu: [],
  period: ['stats.read', 'orders.read'],
  receivables: ['stats.read', 'orders.read'],
  stock: ['production.read', 'orders.read'],
};

const PRIVATE_KEY =
  /phone|whatsapp|email|address|customer|notes|publicNumber|url|token|actor|^id$|Id$/i;
const MAX_ITEMS = 60;
const MAX_CHARS = 40_000;

/** Saca los datos personales e identificadores, y pasa los importes de centavos a pesos. */
export function clean(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 16);
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map(clean);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      if (PRIVATE_KEY.test(key)) continue;
      if (key.endsWith('Minor') && typeof field === 'number') {
        result[key.slice(0, -'Minor'.length) || 'importe'] = field / 100;
        continue;
      }
      result[key] = clean(field);
    }
    return result;
  }
  return value;
}

/** Lo que falta cobrar, sumado: cuánto y cuántos pedidos, por período y por medio de pago. */
export function summarizeReceivables(raw: unknown) {
  const items =
    (
      raw as {
        items?: {
          orders?: { cycleAlias: string; paymentExpectation: string; totalMinor: number }[];
        }[];
      }
    ).items ?? [];
  const byCycle = new Map<string, { importe: number; pedidos: number }>();
  const byMethod = new Map<string, { importe: number; pedidos: number }>();
  let total = 0;
  let count = 0;
  for (const order of items.flatMap((item) => item.orders ?? [])) {
    const amount = order.totalMinor / 100;
    total += amount;
    count += 1;
    for (const [map, key] of [
      [byCycle, order.cycleAlias],
      [byMethod, order.paymentExpectation || 'sin medio de pago'],
    ] as const) {
      const entry = map.get(key) ?? { importe: 0, pedidos: 0 };
      entry.importe += amount;
      entry.pedidos += 1;
      map.set(key, entry);
    }
  }
  return {
    clientesQueDeben: items.length,
    pedidos: count,
    porMedioDePago: Object.fromEntries(byMethod),
    porPeriodo: Object.fromEntries(byCycle),
    total,
  };
}

const words = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-AR')
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length > 3);

/** Los artículos de ayuda que más palabras comparten con la pregunta. */
export function relevantArticles(articles: readonly HelpArticle[], question: string, limit = 5) {
  const asked = new Set(words(question));
  return articles
    .map((article) => ({
      article,
      score: words(`${article.title} ${article.category} ${article.body}`).filter((word) =>
        asked.has(word),
      ).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ article }) => ({
      categoria: article.category,
      texto: article.body,
      titulo: article.title,
    }));
}

/** El menú del período y la ciudad: el de la ciudad si tiene uno propio; si no, el general. */
function pickMenu(
  menus: readonly MenuRow[],
  cycleId: string | null,
  siteId: string | null,
  now: Date,
) {
  const ofSite = (menu: MenuRow) =>
    menu.operatingSiteId === siteId || menu.operatingSiteId === null;
  const prefer = (candidates: MenuRow[]) =>
    candidates.find((menu) => menu.operatingSiteId === siteId) ?? candidates[0] ?? null;
  if (cycleId) return prefer(menus.filter((menu) => menu.cycle.id === cycleId && ofSite(menu)));
  const time = now.getTime();
  const current = menus.filter(
    (menu) =>
      ofSite(menu) &&
      new Date(menu.cycle.openAt).getTime() <= time &&
      new Date(menu.cycle.closeAt).getTime() >= time,
  );
  if (current.length > 0) return prefer(current);
  const latest = [...menus]
    .filter(ofSite)
    .sort((left, right) => String(right.cycle.openAt).localeCompare(String(left.cycle.openAt)));
  return prefer(latest.filter((menu) => menu.cycle.id === latest[0]?.cycle.id));
}

export async function buildAssistantContext(input: {
  cycleId?: string | undefined;
  mode: AssistantMode;
  now: Date;
  permissions: readonly string[];
  port: AssistantDataPort;
  question: string;
  siteId: string | null;
  today: string;
}): Promise<AssistantContext> {
  const { mode, permissions, port, siteId } = input;
  const allowed = (source: AssistantDataSource) => {
    const needed = SOURCE_PERMISSIONS[source];
    return needed.length === 0 || needed.some((permission) => permissions.includes(permission));
  };

  const menus = (await port.listMenus(true)) as MenuRow[];
  const menu = pickMenu(menus, input.cycleId ?? null, siteId, input.now);
  const cycleId = input.cycleId ?? menu?.cycle.id ?? null;
  const cycleAlias =
    menu?.cycle.alias ??
    menus.find((candidate) => candidate.cycle.id === cycleId)?.cycle.alias ??
    null;
  const siteName = siteId
    ? (menus.find((candidate) => candidate.operatingSiteId === siteId)?.operatingSiteName ?? null)
    : null;

  const omitted: string[] = [];
  const data: Record<string, unknown> = {
    ciudad: siteId ? (siteName ?? 'la ciudad elegida') : 'Todas las ciudades',
    datosAl: input.now.toISOString().slice(0, 16),
    periodo: cycleAlias ?? 'sin período',
  };

  for (const source of mode.data) {
    if (!allowed(source)) {
      omitted.push(SOURCE_LABEL[source]);
      continue;
    }
    const needsCycle = source === 'period' || source === 'kitchen' || source === 'menu';
    if (needsCycle && !cycleId) {
      omitted.push(SOURCE_LABEL[source]);
      continue;
    }
    try {
      switch (source) {
        case 'menu':
          data.menu = menu
            ? menu.offerings.map((offering) => ({
                platos: offering.dishes,
                precio: offering.unitPriceMinor / 100,
                tamano: offering.variantName,
                variedad: offering.familyName,
                ...(offering.composable ? { paraArmar: true } : {}),
              }))
            : 'sin menú publicado';
          break;
        case 'period': {
          const report = (await port.cycleReport(cycleId!, siteId)) as {
            receivables?: unknown;
          } & Record<string, unknown>;
          // Quién debe va sumado, como en "porCobrar": el informe lo trae cliente por cliente.
          const { receivables, ...rest } = report;
          data.informeDelPeriodo = {
            ...(clean(rest) as Record<string, unknown>),
            porCobrarDelPeriodo: summarizeReceivables({ items: receivables ?? [] }),
          };
          break;
        }
        case 'kitchen':
          data.cocina = clean(await port.kitchenSummary(cycleId!, siteId));
          break;
        case 'comparison': {
          const from = new Date(input.now.getTime() - 10 * 7 * 24 * 60 * 60 * 1000);
          data.periodosAnteriores = clean(
            await port.getStatsPeriods({
              from: from.toISOString().slice(0, 10),
              ...(siteId ? { operatingSiteId: siteId } : {}),
            }),
          );
          break;
        }
        case 'receivables':
          data.porCobrar = summarizeReceivables(
            await port.listReceivables({ operatingSiteId: siteId }),
          );
          break;
        case 'stock':
          data.stockDePeriodosAnteriores = clean(
            await port.listStockLots({ onlyAvailable: true, operatingSiteId: siteId }),
          );
          break;
        case 'dispatch':
          data.repartoDeHoy = port.dispatchSummary
            ? clean(await port.dispatchSummary(input.today, siteId))
            : 'no disponible';
          break;
        case 'help': {
          const articles = (await port.listHelp()) as HelpArticle[];
          data.ayuda = relevantArticles(articles, input.question);
          break;
        }
      }
    } catch {
      // Un dato que no se pudo armar no corta la respuesta: el búho dice que no lo tiene.
      omitted.push(SOURCE_LABEL[source]);
    }
  }
  if (omitted.length > 0) data.noDisponible = omitted;

  let json = JSON.stringify(data);
  if (json.length > MAX_CHARS) json = `${json.slice(0, MAX_CHARS)}… (recortado)`;
  return {
    cycleAlias,
    omitted,
    siteName,
    text: `DATOS (del sistema Verdeo, sin datos personales):\n${json}`,
  };
}
