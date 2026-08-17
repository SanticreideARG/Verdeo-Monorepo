import { z } from 'zod';

export const UuidSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const CorrelationIdSchema = z.string().min(8).max(128);

export const PaginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const MoneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

export type Money = z.infer<typeof MoneySchema>;
