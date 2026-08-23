import { z, type ZodType } from 'zod';

import type { ModelCapability } from './adapters.js';

/**
 * AI_TASK_CATALOG.md's first three tasks wired end-to-end, chosen to exercise the whole engine
 * before scaling to the rest of the catalog: one Level 0 plain-text task (`rewrite_message`), one
 * Level 1 structured-output task (`extract_order`, the delicate path — Zod-validated), and one
 * Level 0 task fed by data this codebase already computes deterministically
 * (`kitchen_summary`, from `@verdeo/orders`'s `buildKitchenSummary` — "la IA jamás calcula las
 * cantidades fuente", it only turns already-correct numbers into readable prose).
 *
 * `outputSchema` is undefined for a plain-text task; when present, the task runner parses the
 * model's response as JSON and validates it before returning — a failure there is a structured,
 * recoverable outcome (surfaced to whoever reviews the execution), never a crash.
 */
export interface AITaskDefinition<Output = unknown> {
  defaultMaxTokens: number;
  defaultTemperature: number;
  description: string;
  displayName: string;
  key: string;
  outputSchema?: ZodType<Output>;
  requiredCapabilities: readonly ModelCapability[];
}

export const RewriteMessageInputSchema = z.object({
  style: z.enum(['mejorar', 'acortar', 'cordial', 'corregir', 'tono']),
  text: z.string().trim().min(1).max(4_000),
});
export type RewriteMessageInput = z.infer<typeof RewriteMessageInputSchema>;

export const REWRITE_MESSAGE_TASK: AITaskDefinition<string> = {
  defaultMaxTokens: 500,
  defaultTemperature: 0.5,
  description:
    'Reescribe un mensaje según un estilo pedido (mejorar, acortar, cordial, corregir, tono).',
  displayName: 'Reescribir mensaje',
  key: 'rewrite_message',
  requiredCapabilities: ['TEXT'],
};

export const ExtractedOrderCandidateSchema = z.object({
  confidence: z.number().min(0).max(1),
  dishes: z.array(z.string()),
  familyName: z.string().nullable(),
  quantityUnits: z.number().int().nullable(),
  sizeName: z.string().nullable(),
  variantName: z.string().nullable(),
});
export type ExtractedOrderCandidate = z.infer<typeof ExtractedOrderCandidateSchema>;

export const EXTRACT_ORDER_TASK: AITaskDefinition<ExtractedOrderCandidate> = {
  defaultMaxTokens: 400,
  defaultTemperature: 0.1,
  description:
    'Extrae del mensaje de un cliente los datos candidatos de un pedido (variedad, tamaño, cantidad, platos). Solo propone: el operador confirma.',
  displayName: 'Extraer pedido',
  key: 'extract_order',
  outputSchema: ExtractedOrderCandidateSchema,
  requiredCapabilities: ['TEXT', 'STRUCTURED_OUTPUT'],
};

export const KITCHEN_SUMMARY_TASK: AITaskDefinition<string> = {
  defaultMaxTokens: 700,
  defaultTemperature: 0.3,
  description:
    'Convierte el resumen de cocina ya calculado (cantidades deterministas) en un texto legible para el equipo. Nunca recalcula cantidades.',
  displayName: 'Resumen de cocina',
  key: 'kitchen_summary',
  requiredCapabilities: ['TEXT'],
};

export const AI_TASKS: readonly AITaskDefinition[] = [
  REWRITE_MESSAGE_TASK,
  EXTRACT_ORDER_TASK,
  KITCHEN_SUMMARY_TASK,
];

export function findTask(key: string): AITaskDefinition | undefined {
  return AI_TASKS.find((task) => task.key === key);
}
