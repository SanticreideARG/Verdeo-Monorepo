/**
 * Los temas de temporada (HALLOWEEN_THEME_PLAN.md): se ponen solos para todos entre dos fechas y
 * después vuelve el tema de cada uno. Quien no lo quiera lo saca en Apariencia; eso se recuerda en
 * este equipo y sólo por ese año.
 */

export interface Season {
  /** Hasta qué día (inclusive), "MM-DD". */
  end: string;
  key: string;
  label: string;
  /** Desde qué día (inclusive), "MM-DD". */
  start: string;
}

export const HALLOWEEN: Season = {
  end: '11-01',
  key: 'halloween',
  label: 'Halloween',
  start: '10-24',
};

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
export function activeSeason(now: Date, seasons: readonly Season[] = [HALLOWEEN]): Season | null {
  const monthDay = argentinaDay(now).slice(5);
  return seasons.find((season) => monthDay >= season.start && monthDay <= season.end) ?? null;
}

function optOutKey(season: Season, now: Date): string {
  return `verdeo-season-${season.key}-off-${argentinaDay(now).slice(0, 4)}`;
}

/** Si en este equipo se sacó el tema de la temporada este año. */
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
