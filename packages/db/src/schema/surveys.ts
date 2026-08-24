import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { customers } from './operations.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

// A question is fully data-driven, never a hardcoded "kind" catalog: an empty `options` array is a
// free-text question, a non-empty one is a choice question, and `allowMultiple` decides single vs
// multi-select. Adding a new question shape never requires a code change.
export const surveys = pgTable('surveys', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  active: boolean('active').default(true).notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
});

export const surveyQuestions = pgTable(
  'survey_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    prompt: text('prompt').notNull(),
    options: jsonb('options').$type<string[]>().default([]).notNull(),
    allowMultiple: boolean('allow_multiple').default(false).notNull(),
    required: boolean('required').default(true).notNull(),
    ...timestamps,
  },
  (table) => [index('survey_questions_survey_id_idx').on(table.surveyId, table.ordinal)],
);

// Sent 1:1 to a customer (confirmed decision, not anonymous-per-campaign): one row per send, whose
// `usedAt` marks it single-use — a token that already has a response can never submit a second one.
export const surveyTokens = pgTable(
  'survey_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('survey_tokens_token_unique').on(table.token),
    index('survey_tokens_survey_id_idx').on(table.surveyId),
  ],
);

export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id, { onDelete: 'cascade' }),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => surveyTokens.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('survey_responses_token_id_unique').on(table.tokenId),
    index('survey_responses_survey_id_idx').on(table.surveyId),
  ],
);

export const surveyAnswers = pgTable(
  'survey_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    responseId: uuid('response_id')
      .notNull()
      .references(() => surveyResponses.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: 'cascade' }),
    // A string for free-text/single-choice, a string[] for multi-choice — the question that owns it
    // (via allowMultiple) is what interprets the shape, not this column.
    value: jsonb('value').$type<string | string[]>().notNull(),
  },
  (table) => [index('survey_answers_response_id_idx').on(table.responseId)],
);
