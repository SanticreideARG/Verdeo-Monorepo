/**
 * Los temas de temporada (HALLOWEEN_THEME_PLAN.md, TEMAS_TEMPORADA_PLAN.md): se ponen solos para
 * todos entre dos fechas y después vuelve el tema de cada uno. Quien no lo quiera lo saca en
 * Apariencia; eso se recuerda en este equipo y sólo por esa temporada.
 */

export interface Season {
  /** Hasta qué día (inclusive), "MM-DD". */
  end: string;
  key: string;
  label: string;
  /** Desde qué día (inclusive), "MM-DD". Si es posterior a `end`, la temporada cruza el año. */
  start: string;
}

/** Termina el 31 a las 23:59; sus colores quedan todo el año como el tema "Calabaza". */
export const HALLOWEEN: Season = {
  end: '10-31',
  key: 'halloween',
  label: 'Halloween',
  start: '10-24',
};

/** Celeste arriba, blanco abajo, íconos verdes y brillos naranjas. Cruza el año. */
export const VERANO: Season = {
  end: '02-28',
  key: 'verano',
  label: 'Verano',
  start: '11-01',
};

export const SEASONS: readonly Season[] = [HALLOWEEN, VERANO];

/** El día de hoy en Argentina, que es donde opera el sistema: "2026-10-27". */
function argentinaDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
  }).format(now);
}

/** La temporada que corre hoy, si hay una. */
export function activeSeason(now: Date, seasons: readonly Season[] = SEASONS): Season | null {
  const monthDay = argentinaDay(now).slice(5);
  return seasons.find((season) => inSeason(season, monthDay)) ?? null;
}

function inSeason(season: Season, monthDay: string): boolean {
  return season.start <= season.end
    ? monthDay >= season.start && monthDay <= season.end
    : monthDay >= season.start || monthDay <= season.end;
}

/**
 * El año en que arrancó la temporada que corre: el verano 2026-27 es "2026" también en enero, así
 * que sacarlo en diciembre no lo vuelve a poner el 1 de enero.
 */
function seasonYear(season: Season, now: Date): string {
  const day = argentinaDay(now);
  const year = Number(day.slice(0, 4));
  const wrapped = season.start > season.end && day.slice(5) <= season.end;
  return String(wrapped ? year - 1 : year);
}

function optOutKey(season: Season, now: Date): string {
  return `verdeo-season-${season.key}-off-${seasonYear(season, now)}`;
}

/** Si en este equipo se sacó el tema de esta temporada. */
export function seasonTurnedOff(season: Season, now: Date): boolean {
  try {
    return window.localStorage.getItem(optOutKey(season, now)) === '1';
  } catch {
    return false;
  }
}

export function setSeasonTurnedOff(season: Season, now: Date, off: boolean): void {
  try {
    if (off) window.localStorage.setItem(optOutKey(season, now), '1');
    else window.localStorage.removeItem(optOutKey(season, now));
  } catch {
    // Sin almacenamiento (ventana privada): el cambio dura lo que dure la pestaña.
  }
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "1 de noviembre": hasta cuándo corre la temporada. */
export function seasonUntilLabel(season: Season): string {
  const [month, day] = season.end.split('-').map(Number);
  return `${String(day)} de ${MONTHS[(month ?? 1) - 1] ?? ''}`;
}
