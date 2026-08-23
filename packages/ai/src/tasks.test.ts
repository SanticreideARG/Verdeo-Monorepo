import { describe, expect, it } from 'vitest';

import {
  AI_TASKS,
  EXTRACT_ORDER_TASK,
  ExtractedOrderCandidateSchema,
  findTask,
  KITCHEN_SUMMARY_TASK,
  REWRITE_MESSAGE_TASK,
  RewriteMessageInputSchema,
} from './tasks.js';

describe('findTask', () => {
  it('finds a registered task by key', () => {
    expect(findTask('rewrite_message')).toBe(REWRITE_MESSAGE_TASK);
    expect(findTask('extract_order')).toBe(EXTRACT_ORDER_TASK);
    expect(findTask('kitchen_summary')).toBe(KITCHEN_SUMMARY_TASK);
  });

  it('returns undefined for an unknown key', () => {
    expect(findTask('does_not_exist')).toBeUndefined();
  });

  it('lists exactly the three V1 tasks', () => {
    expect(AI_TASKS.map((task) => task.key)).toEqual([
      'rewrite_message',
      'extract_order',
      'kitchen_summary',
    ]);
  });
});

describe('RewriteMessageInputSchema', () => {
  it('accepts a valid style', () => {
    expect(RewriteMessageInputSchema.safeParse({ style: 'cordial', text: 'hola' }).success).toBe(
      true,
    );
  });

  it('rejects an unknown style', () => {
    expect(RewriteMessageInputSchema.safeParse({ style: 'gritar', text: 'hola' }).success).toBe(
      false,
    );
  });
});

describe('ExtractedOrderCandidateSchema', () => {
  it('accepts a fully-populated candidate', () => {
    const result = ExtractedOrderCandidateSchema.safeParse({
      confidence: 0.8,
      dishes: ['Milanesa', 'Puré'],
      familyName: 'Real',
      quantityUnits: 2,
      sizeName: '400',
      variantName: 'Pollo',
    });
    expect(result.success).toBe(true);
  });

  it('accepts nulls for fields the model could not extract', () => {
    const result = ExtractedOrderCandidateSchema.safeParse({
      confidence: 0.1,
      dishes: [],
      familyName: null,
      quantityUnits: null,
      sizeName: null,
      variantName: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a confidence outside [0, 1]', () => {
    const result = ExtractedOrderCandidateSchema.safeParse({
      confidence: 1.5,
      dishes: [],
      familyName: null,
      quantityUnits: null,
      sizeName: null,
      variantName: null,
    });
    expect(result.success).toBe(false);
  });
});
