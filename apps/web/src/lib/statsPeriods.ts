import type { StatsPeriods } from './operations.js';

/** Cuántos períodos muestran los gráficos del carrusel: más, y las barras no se leen. */
export const CHART_PERIODS = 8;
/** Cuántos menús van por nombre en la mezcla; el resto se junta en "Otros". */
export const MIX_TOP = 4;

export interface PeriodPoint {
  customerCount: number;
  label: string;
  netMinor: number;
  newCustomerCount: number;
  orderCount: number;
  paidMinor: number;
  pendingMinor: number;
  salesCycleId: string;
}

/**
 * Las filas por período y ciudad juntas por período, del más viejo al más nuevo, y sólo los
 * últimos `CHART_PERIODS`: los gráficos leen de izquierda a derecha.
 */
export function periodPoints(periods: StatsPeriods): PeriodPoint[] {
  const byCycle = new Map<string, PeriodPoint>();
  const openAt = new Map<string, string>();
  for (const row of periods.rows) {
    openAt.set(row.salesCycleId, row.openAt);
    const point = byCycle.get(row.salesCycleId) ?? {
      customerCount: 0,
      label: row.cycleAlias,
      netMinor: 0,
      newCustomerCount: 0,
      orderCount: 0,
      paidMinor: 0,
      pendingMinor: 0,
      salesCycleId: row.salesCycleId,
    };
    point.customerCount += row.customerCount;
    point.netMinor += row.netMinor;
    point.newCustomerCount += row.newCustomerCount;
    point.orderCount += row.orderCount;
    point.paidMinor += row.paidMinor;
    point.pendingMinor += row.pendingMinor;
    byCycle.set(row.salesCycleId, point);
  }
  return [...byCycle.values()]
    .sort((left, right) =>
      (openAt.get(left.salesCycleId) ?? '').localeCompare(openAt.get(right.salesCycleId) ?? ''),
    )
    .slice(-CHART_PERIODS);
}

/**
 * La mezcla de menús por período: los `MIX_TOP` menús con más unidades en los períodos que se
 * muestran, y el resto como "Otros", para que la leyenda no tenga quince colores repetidos.
 */
export function mixSegments(
  periods: StatsPeriods,
  points: readonly PeriodPoint[],
): Map<string, { label: string; value: number }[]> {
  const shown = new Set(points.map((point) => point.salesCycleId));
  const mix = periods.mix.filter((row) => shown.has(row.salesCycleId));
  const unitsByFamily = new Map<string, number>();
  for (const row of mix)
    unitsByFamily.set(row.familyName, (unitsByFamily.get(row.familyName) ?? 0) + row.units);
  const top = [...unitsByFamily.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MIX_TOP)
    .map(([family]) => family);

  const result = new Map<string, { label: string; value: number }[]>();
  for (const point of points) {
    const own = mix.filter((row) => row.salesCycleId === point.salesCycleId);
    const segments = top.map((family) => ({
      label: family,
      value: own
        .filter((row) => row.familyName === family)
        .reduce((sum, row) => sum + row.units, 0),
    }));
    const others = own
      .filter((row) => !top.includes(row.familyName))
      .reduce((sum, row) => sum + row.units, 0);
    if (unitsByFamily.size > top.length) segments.push({ label: 'Otros', value: others });
    result.set(point.salesCycleId, segments);
  }
  return result;
}
