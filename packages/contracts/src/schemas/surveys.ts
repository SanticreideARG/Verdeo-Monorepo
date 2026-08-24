import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

// Fully data-driven: an empty `options` array is a free-text question, a non-empty one is a choice
// question, and `allowMultiple` decides single vs multi-select. No hardcoded "kind" catalog.
export const SurveyQuestionInputSchema = z.object({
  allowMultiple: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  prompt: z.string().trim().min(1).max(500),
  required: z.boolean().default(true),
});

export const SurveyQuestionSchema = SurveyQuestionInputSchema.extend({
  id: UuidSchema,
  ordinal: z.number().int(),
});

export const SurveyCreateRequestSchema = z.object({
  description: z.string().trim().max(2_000).nullable().optional(),
  questions: z.array(SurveyQuestionInputSchema).min(1).max(20),
  title: z.string().trim().min(1).max(200),
});

export const SurveyUpdateRequestSchema = SurveyCreateRequestSchema.extend({
  active: z.boolean(),
});

export const SurveySchema = z.object({
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
  description: z.string().nullable(),
  id: UuidSchema,
  questions: z.array(SurveyQuestionSchema),
  title: z.string(),
  updatedAt: IsoDateTimeSchema,
});

export const SurveySummarySchema = z.object({
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  responseCount: z.number().int(),
  sentCount: z.number().int(),
  title: z.string(),
});

export const SurveyListResponseSchema = z.object({ items: z.array(SurveySummarySchema) });

export const SurveySendRequestSchema = z.object({ customerId: UuidSchema });

export const SurveySendResponseSchema = z.object({
  publicUrl: z.string(),
  token: z.string(),
});

// Public (unauthenticated, token-gated) shape — never includes customerId or any other identity.
export const SurveyPublicSchema = z.object({
  description: z.string().nullable(),
  questions: z.array(
    z.object({
      allowMultiple: z.boolean(),
      id: UuidSchema,
      options: z.array(z.string()),
      prompt: z.string(),
      required: z.boolean(),
    }),
  ),
  title: z.string(),
});

export const SurveyAnswerInputSchema = z.object({
  questionId: UuidSchema,
  value: z.union([
    z.string().trim().min(1).max(2_000),
    z.array(z.string().trim().min(1).max(200)).max(10),
  ]),
});

export const SurveySubmitRequestSchema = z.object({
  answers: z.array(SurveyAnswerInputSchema).min(1).max(20),
});

export const SurveyResultsSchema = z.object({
  questions: z.array(
    z.object({
      answerCounts: z.array(z.object({ count: z.number().int(), value: z.string() })),
      prompt: z.string(),
      questionId: UuidSchema,
    }),
  ),
  responseCount: z.number().int(),
  sentCount: z.number().int(),
  surveyId: UuidSchema,
  title: z.string(),
});

export type SurveyCreateRequest = z.infer<typeof SurveyCreateRequestSchema>;
export type SurveyUpdateRequest = z.infer<typeof SurveyUpdateRequestSchema>;
export type SurveySendRequest = z.infer<typeof SurveySendRequestSchema>;
export type SurveySubmitRequest = z.infer<typeof SurveySubmitRequestSchema>;
