export interface SystemProbe {
  detail: string;
  key: string;
  label: string;
  latencyMs: number | null;
  ok: boolean;
}

export interface SystemStatus {
  api: {
    latency: { count: number; max: number | null; p50: number | null; p95: number | null };
    startedAt: string;
    version: string;
  };
  errors: {
    last24h: number;
    recent: {
      errorName: string;
      id: string;
      message: string;
      method: string;
      occurredAt: string;
      path: string;
      requestId: string;
      status: number;
    }[];
  };
  generatedAt: string;
  mirror: { detail: string; lastMirroredAt: string | null; ok: boolean };
  probes: SystemProbe[];
}

export interface SystemTable {
  references: string[];
  rows: number;
  sizeBytes: number;
  table: string;
}

export type HealthTone = 'bien' | 'lento' | 'mal' | 'sin-dato';

/**
 * Qué tan sana está una sonda, para pintarla.
 *
 * Una base que contesta pero tarda dos segundos no está "bien" aunque `ok` sea verdadero: es lo
 * que el usuario siente como "el sistema anda lento". Los umbrales son para una base remota
 * consultada desde una función sin estado, donde una consulta mínima ronda las decenas de
 * milisegundos; arriba de 600 ms ya se nota en cada pantalla.
 */
export function probeTone(probe: Pick<SystemProbe, 'latencyMs' | 'ok'>): HealthTone {
  if (!probe.ok) return 'mal';
  if (probe.latencyMs === null) return 'sin-dato';
  return probe.latencyMs > 600 ? 'lento' : 'bien';
}

/** El peor estado de todas las sondas, para el indicador de la barra. */
export function overallTone(probes: readonly Pick<SystemProbe, 'latencyMs' | 'ok'>[]): HealthTone {
  if (probes.length === 0) return 'sin-dato';
  const tones = probes.map(probeTone);
  if (tones.includes('mal')) return 'mal';
  if (tones.includes('lento')) return 'lento';
  return tones.every((tone) => tone === 'sin-dato') ? 'sin-dato' : 'bien';
}

export function toneLabel(tone: HealthTone): string {
  return {
    bien: 'Todo en orden',
    lento: 'Anda lento',
    mal: 'Hay un problema',
    'sin-dato': 'Sin datos',
  }[tone];
}

/** 0 a 100 para el medidor: 1,5 s o más llena la barra. */
export function latencyPercent(latencyMs: number | null): number {
  if (latencyMs === null) return 0;
  return Math.min(100, Math.round((latencyMs / 1500) * 100));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1).replace('.', ',')} ${units[index] ?? 'TB'}`;
}

/**
 * Agrupa las tablas por tema.
 *
 * El nombre de una tabla suele empezar por su dominio (`order_items`, `route_stops`), y el mapa
 * se lee mucho mejor por temas que en una lista alfabética de cien nombres. Es una heurística
 * sobre los nombres, no un catálogo: lo que no calza cae en "Otras", y agregar un tema es una
 * línea acá.
 */
const THEMES: { label: string; test: RegExp }[] = [
  { label: 'Pedidos', test: /^(orders?|order_|sales_cycles|cycle|checkout|payments?|cash_)/ },
  { label: 'Clientes', test: /^(customers?|customer_|addresses|address_)/ },
  {
    label: 'Menú y producción',
    test: /^(menu|weekly_menu|product|production|kitchen|dish|recipes?|surplus|ingredient)/,
  },
  { label: 'Reparto', test: /^(route|delivery|driver|geographic|operating_sites|zones?)/ },
  {
    label: 'Mensajes',
    test: /^(messag|manual_notices|whatsapp|staff_|chat|conversations?|notifications?)/,
  },
  {
    label: 'Usuarios y accesos',
    test: /^(users?|roles?|permissions?|sessions?|oauth|password|access_|credentials|user_)/,
  },
  {
    label: 'Sistema',
    test: /^(audit|server_errors|backups?|webhook|cms|help|ai_|survey|appearance|dashboard|integration|calendar)/,
  },
];

export function groupTables(
  tables: readonly SystemTable[],
): { label: string; tables: SystemTable[] }[] {
  const groups = new Map<string, SystemTable[]>();
  for (const table of tables) {
    const label = THEMES.find((theme) => theme.test.test(table.table))?.label ?? 'Otras';
    groups.set(label, [...(groups.get(label) ?? []), table]);
  }
  const order = [...THEMES.map((theme) => theme.label), 'Otras'];
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, tables: groups.get(label) ?? [] }));
}
