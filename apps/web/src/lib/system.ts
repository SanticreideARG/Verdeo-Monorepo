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
  inbound: InboundTracking | null;
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

export interface InboundRun {
  duplicates: number;
  durationMs: number;
  error: string | null;
  failed: number;
  found: number;
  quietRuns: number;
  ranAt: string;
  scriptVersion: string;
  sentNew: number;
}

/** El seguimiento del script de Gmail que devuelve el estado del sistema (2026-11-11). */
export interface InboundTracking {
  last24h: { duplicates: number; failed: number; found: number; reports: number; sentNew: number };
  lastReceivedAt: string | null;
  pending: number;
  rejections: { count: number; lastAt: string; reason: string }[];
  runs: InboundRun[];
  toReview: number;
}

/**
 * Cuánto puede pasar sin reporte antes de decir "sin señal". El script reporta cada 30 minutos aunque
 * no haya novedades; 70 da margen para una corrida que Google atrasó.
 */
export const INBOUND_SILENCE_MINUTES = 70;

/**
 * Cómo anda el script de Gmail, con el mismo semáforo que las sondas.
 *
 * - `sin-dato`: nunca reportó (falta pegar la versión del script que reporta).
 * - `mal`: reportó alguna vez pero hace más de 70 minutos que no: el activador no corre.
 * - `lento`: corre, pero la última corrida tuvo un error o un mail que no se pudo mandar, o hubo un
 *   rechazo de firma después de ella (el secreto no coincide).
 * - `bien`: corre y entrega.
 */
export function inboundTone(tracking: InboundTracking, now: Date = new Date()): HealthTone {
  const last = tracking.runs[0];
  if (!last) return 'sin-dato';
  const silence = now.getTime() - Date.parse(last.ranAt);
  if (silence > INBOUND_SILENCE_MINUTES * 60 * 1000) return 'mal';
  if (last.error || last.failed > 0 || signatureRejectedAfterLastRun(tracking)) return 'lento';
  return 'bien';
}

/** Si la API rechazó una firma después de la última corrida reportada: el secreto no coincide. */
function signatureRejectedAfterLastRun(tracking: InboundTracking): boolean {
  const last = tracking.runs[0];
  if (!last) return false;
  return tracking.rejections.some(
    (rejection) =>
      rejection.reason === 'firma' && Date.parse(rejection.lastAt) > Date.parse(last.ranAt),
  );
}

export function inboundToneLabel(tone: HealthTone): string {
  return {
    bien: 'Al día',
    lento: 'Con errores',
    mal: 'Sin señal',
    'sin-dato': 'Sin reportes',
  }[tone];
}

/** Qué hacer, en una frase, según el estado. Vacío si está al día. */
export function inboundAdvice(
  tone: HealthTone,
  tracking: InboundTracking,
  now: Date = new Date(),
): string {
  const last = tracking.runs[0];
  if (tone === 'bien') return '';
  /*
   * Con el secreto cambiado tampoco llega el reporte de la corrida, así que el estado cae en "sin
   * señal" o "sin reportes": un rechazo de firma reciente dice mejor qué pasa.
   */
  const recentSignature = tracking.rejections.some(
    (rejection) =>
      rejection.reason === 'firma' &&
      now.getTime() - Date.parse(rejection.lastAt) < INBOUND_SILENCE_MINUTES * 60 * 1000,
  );
  if (recentSignature || signatureRejectedAfterLastRun(tracking)) {
    return 'La API rechazó la firma: el secreto del script (VERDEO_SECRET) no coincide con INBOUND_EMAIL_SECRET de Vercel.';
  }
  if (tone === 'sin-dato') {
    return 'El script de Gmail todavía no reportó ninguna corrida. Falta pegar la versión nueva de Code.gs en Apps Script, o falta INBOUND_EMAIL_SECRET en la API de Vercel.';
  }
  if (tone === 'mal') {
    return 'El script dejó de correr. En Apps Script, revisá que en Activadores haya uno de importarPedidos cada 5 minutos, y mirá Ejecuciones.';
  }
  return `La última corrida tuvo problemas: ${last?.error ?? 'algún mail no se pudo mandar'}. Se reintenta sola en la próxima.`;
}

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
