import { z } from 'zod';

import { UuidSchema } from './common.js';

// "Estadísticas": decision-making rollups over orders (never CANCELLED — a cancelled order isn't
// real demand), optionally windowed by delivery date and/or scoped to one operating site.
export const StatsQuerySchema = z.object({
  from: z.string().trim().date().optional(),
  operatingSiteId: UuidSchema.optional(),
  to: z.string().trim().date().optional(),
});

export const StatsStatusCountSchema = z.object({
  count: z.number().int(),
  status: z.string(),
});

export const StatsGlobalSchema = z.object({
  averageOrderValueMinor: z.number().int(),
  currency: z.string(),
  customerCount: z.number().int(),
  orderCount: z.number().int(),
  // Not an integer: 1.4 orders per customer is the meaningful value, 1 would hide the repeat rate.
  ordersPerCustomer: z.number(),
  revenueMinor: z.number().int(),
  statusBreakdown: z.array(StatsStatusCountSchema),
});

export const StatsByDayRowSchema = z.object({
  day: z.string(),
  orderCount: z.number().int(),
  revenueMinor: z.number().int(),
});

export const StatsByVarietyRowSchema = z.object({
  familyName: z.string(),
  revenueMinor: z.number().int(),
  units: z.number().int(),
});

export const StatsByZoneRowSchema = z.object({
  operatingSiteId: UuidSchema,
  operatingSiteName: z.string(),
  orderCount: z.number().int(),
  revenueMinor: z.number().int(),
});

export const StatsByCycleRowSchema = z.object({
  cycleAlias: z.string(),
  orderCount: z.number().int(),
  revenueMinor: z.number().int(),
  salesCycleId: UuidSchema,
});

export const StatsBySizeRowSchema = z.object({
  revenueMinor: z.number().int(),
  sizeName: z.string(),
  units: z.number().int(),
});

export const StatsOverviewSchema = z.object({
  byCycle: z.array(StatsByCycleRowSchema),
  byDay: z.array(StatsByDayRowSchema),
  bySize: z.array(StatsBySizeRowSchema),
  byVariety: z.array(StatsByVarietyRowSchema),
  byZone: z.array(StatsByZoneRowSchema),
  global: StatsGlobalSchema,
});

export type StatsOverview = z.infer<typeof StatsOverviewSchema>;
export type StatsQuery = z.infer<typeof StatsQuerySchema>;

// Análisis contable por período y ciudad (STATS_REDESIGN_PLAN.md). Mismo criterio que el informe
// del período: sin cancelados ni el cliente STOCK en lo vendido; los cancelados, aparte.
export const StatsPeriodMethodSchema = z.object({
  isCash: z.boolean(),
  method: z.string(),
  paidMinor: z.number().int(),
  totalMinor: z.number().int(),
});

export const StatsPeriodRowSchema = z.object({
  adjustmentMinor: z.number().int(),
  cancelledCount: z.number().int(),
  cancelledMinor: z.number().int(),
  cancelledToStockMinor: z.number().int(),
  closeAt: z.string(),
  customerCount: z.number().int(),
  cycleAlias: z.string(),
  discountMinor: z.number().int(),
  fromStockMinor: z.number().int(),
  grossMinor: z.number().int(),
  methods: z.array(StatsPeriodMethodSchema),
  netMinor: z.number().int(),
  newCustomerCount: z.number().int(),
  openAt: z.string(),
  operatingSiteId: UuidSchema,
  operatingSiteName: z.string(),
  orderCount: z.number().int(),
  paidMinor: z.number().int(),
  pendingMinor: z.number().int(),
  salesCycleId: UuidSchema,
  surchargeMinor: z.number().int(),
  units: z.number().int(),
});

export const StatsPeriodsResponseSchema = z.object({
  currency: z.string(),
  mix: z.array(
    z.object({ familyName: z.string(), salesCycleId: UuidSchema, units: z.number().int() }),
  ),
  rows: z.array(StatsPeriodRowSchema),
});

export const StatsPeriodsQuerySchema = StatsQuerySchema.extend({
  format: z.enum(['json', 'xlsx']).optional(),
});

// "Lo que pasó": eventos calculados al momento sobre el período en curso.
export const StatsEventSchema = z.object({
  href: z.string().nullable(),
  key: z.string(),
  kind: z.enum(['ausentes', 'cobro', 'cocina', 'hito', 'mezcla', 'record']),
  text: z.string(),
  tone: z.enum(['danger', 'info', 'success', 'warning']),
});

export const StatsEventsResponseSchema = z.object({ items: z.array(StatsEventSchema) });

export type StatsPeriodRow = z.infer<typeof StatsPeriodRowSchema>;
export type StatsPeriods = z.infer<typeof StatsPeriodsResponseSchema>;
export type StatsEvent = z.infer<typeof StatsEventSchema>;
