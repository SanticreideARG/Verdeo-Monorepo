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
  orderCount: z.number().int(),
  revenueMinor: z.number().int(),
  statusBreakdown: z.array(StatsStatusCountSchema),
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
  bySize: z.array(StatsBySizeRowSchema),
  byZone: z.array(StatsByZoneRowSchema),
  global: StatsGlobalSchema,
});

export type StatsOverview = z.infer<typeof StatsOverviewSchema>;
export type StatsQuery = z.infer<typeof StatsQuerySchema>;
