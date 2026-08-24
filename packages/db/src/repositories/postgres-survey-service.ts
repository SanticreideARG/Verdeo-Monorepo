import { randomBytes } from 'node:crypto';

import { asc, desc, eq, sql } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';

import type { Database } from '../index.js';
import {
  customers,
  surveyAnswers,
  surveyQuestions,
  surveyResponses,
  surveyTokens,
  surveys,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class SurveyNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SurveyNotFoundError';
  }
}

export class SurveyConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SurveyConflictError';
  }
}

export interface SurveyContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export interface SurveyQuestionInput {
  allowMultiple: boolean;
  options: readonly string[];
  prompt: string;
  required: boolean;
}

function auditActor(context: SurveyContext) {
  return context.actorUserId
    ? ({ type: 'user' as const, userId: context.actorUserId } as const)
    : ({ type: 'system' as const } as const);
}

export class PostgresSurveyService {
  public constructor(private readonly database: Database) {}

  private async loadQuestions(database: Database | DatabaseTransaction, surveyId: string) {
    return database
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(asc(surveyQuestions.ordinal));
  }

  private async insertQuestions(
    transaction: DatabaseTransaction,
    surveyId: string,
    questions: readonly SurveyQuestionInput[],
  ) {
    for (const [index, question] of questions.entries()) {
      await transaction.insert(surveyQuestions).values({
        allowMultiple: question.allowMultiple,
        options: [...question.options],
        ordinal: index + 1,
        prompt: question.prompt,
        required: question.required,
        surveyId,
      });
    }
  }

  public async createSurvey(
    input: {
      description?: string | null | undefined;
      questions: readonly SurveyQuestionInput[];
      title: string;
    },
    context: SurveyContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [survey] = await transaction
        .insert(surveys)
        .values({
          createdByUserId: context.actorUserId ?? null,
          description: input.description ?? null,
          title: input.title,
        })
        .returning();
      if (!survey) throw new Error('Survey insert did not return a row');
      await this.insertQuestions(transaction, survey.id, input.questions);

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'survey.created',
        actor: auditActor(context),
        after: { questionCount: input.questions.length, title: input.title },
        correlationId: context.correlationId,
        entityId: survey.id,
        entityType: 'survey',
        requestId: context.requestId,
        source: context.source,
      });

      return { ...survey, questions: await this.loadQuestions(transaction, survey.id) };
    });
  }

  public async updateSurvey(
    surveyId: string,
    input: {
      active: boolean;
      description?: string | null | undefined;
      questions: readonly SurveyQuestionInput[];
      title: string;
    },
    context: SurveyContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);
      if (!existing) throw new SurveyNotFoundError('Survey not found');

      const [survey] = await transaction
        .update(surveys)
        .set({
          active: input.active,
          description: input.description ?? null,
          title: input.title,
          updatedAt: new Date(),
        })
        .where(eq(surveys.id, surveyId))
        .returning();
      if (!survey) throw new Error('Survey update did not return a row');

      // Questions are replaced wholesale on every edit rather than diffed — a survey's shape is
      // small (max 20 questions) and edited as a unit from the editor, never one field at a time.
      await transaction.delete(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId));
      await this.insertQuestions(transaction, surveyId, input.questions);

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'survey.updated',
        actor: auditActor(context),
        after: {
          active: survey.active,
          questionCount: input.questions.length,
          title: survey.title,
        },
        before: { active: existing.active, title: existing.title },
        correlationId: context.correlationId,
        entityId: survey.id,
        entityType: 'survey',
        requestId: context.requestId,
        source: context.source,
      });

      return { ...survey, questions: await this.loadQuestions(transaction, surveyId) };
    });
  }

  public async getSurvey(surveyId: string) {
    const [survey] = await this.database
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);
    if (!survey) throw new SurveyNotFoundError('Survey not found');
    return { ...survey, questions: await this.loadQuestions(this.database, surveyId) };
  }

  public async listSurveys() {
    const rows = await this.database.select().from(surveys).orderBy(desc(surveys.createdAt));
    const counts = await this.database
      .select({
        responseCount: sql<number>`count(distinct ${surveyResponses.id})`,
        sentCount: sql<number>`count(distinct ${surveyTokens.id})`,
        surveyId: surveys.id,
      })
      .from(surveys)
      .leftJoin(surveyTokens, eq(surveyTokens.surveyId, surveys.id))
      .leftJoin(surveyResponses, eq(surveyResponses.surveyId, surveys.id))
      .groupBy(surveys.id);
    const countBySurvey = new Map(counts.map((row) => [row.surveyId, row]));
    return rows.map((survey) => ({
      ...survey,
      responseCount: Number(countBySurvey.get(survey.id)?.responseCount ?? 0),
      sentCount: Number(countBySurvey.get(survey.id)?.sentCount ?? 0),
    }));
  }

  // Sent 1:1 to a customer, single-use (confirmed decisions): a fresh unguessable token every time,
  // never reused even for the same customer re-sent the same survey.
  public async sendSurvey(surveyId: string, customerId: string, context: SurveyContext) {
    const [survey] = await this.database
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);
    if (!survey) throw new SurveyNotFoundError('Survey not found');
    if (!survey.active) throw new SurveyConflictError('La encuesta está desactivada.');
    const [customer] = await this.database
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw new SurveyNotFoundError('Customer not found');

    const token = randomBytes(24).toString('base64url');
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(surveyTokens)
        .values({
          createdByUserId: context.actorUserId ?? null,
          customerId,
          surveyId,
          token,
        })
        .returning();
      if (!row) throw new Error('Survey token insert did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'survey.sent',
        actor: auditActor(context),
        after: { customerId },
        correlationId: context.correlationId,
        entityId: row.id,
        entityType: 'survey_token',
        requestId: context.requestId,
        source: context.source,
      });

      return row;
    });
  }

  public async getPublicSurvey(token: string) {
    const [row] = await this.database
      .select({
        active: surveys.active,
        description: surveys.description,
        surveyId: surveys.id,
        title: surveys.title,
        usedAt: surveyTokens.usedAt,
      })
      .from(surveyTokens)
      .innerJoin(surveys, eq(surveys.id, surveyTokens.surveyId))
      .where(eq(surveyTokens.token, token))
      .limit(1);
    if (!row) throw new SurveyNotFoundError('Survey link not found');
    if (row.usedAt) throw new SurveyConflictError('Esta encuesta ya fue respondida.');
    if (!row.active) throw new SurveyConflictError('Esta encuesta ya no está disponible.');

    const questions = await this.loadQuestions(this.database, row.surveyId);
    return {
      description: row.description,
      questions: questions.map((question) => ({
        allowMultiple: question.allowMultiple,
        id: question.id,
        options: question.options,
        prompt: question.prompt,
        required: question.required,
      })),
      title: row.title,
    };
  }

  public async submitSurveyResponse(
    token: string,
    answers: readonly { questionId: string; value: string | readonly string[] }[],
  ) {
    return this.database.transaction(async (transaction) => {
      const [tokenRow] = await transaction
        .select()
        .from(surveyTokens)
        .where(eq(surveyTokens.token, token))
        .limit(1);
      if (!tokenRow) throw new SurveyNotFoundError('Survey link not found');
      if (tokenRow.usedAt) throw new SurveyConflictError('Esta encuesta ya fue respondida.');

      const questions = await this.loadQuestions(transaction, tokenRow.surveyId);
      const questionIds = new Set(questions.map((question) => question.id));
      const requiredIds = new Set(
        questions.filter((question) => question.required).map((q) => q.id),
      );
      const answeredIds = new Set(answers.map((answer) => answer.questionId));
      for (const id of requiredIds) {
        if (!answeredIds.has(id)) throw new SurveyConflictError('Faltan respuestas obligatorias.');
      }
      for (const answer of answers) {
        if (!questionIds.has(answer.questionId))
          throw new SurveyConflictError('Una respuesta no corresponde a esta encuesta.');
      }

      const [response] = await transaction
        .insert(surveyResponses)
        .values({
          customerId: tokenRow.customerId,
          surveyId: tokenRow.surveyId,
          tokenId: tokenRow.id,
        })
        .returning();
      if (!response) throw new Error('Survey response insert did not return a row');

      for (const answer of answers) {
        // Array.isArray narrows a custom `readonly string[]` union member poorly (its signature is
        // `arg is any[]`), so the string/array split is done on typeof instead — the two possible
        // member types never overlap, so this is a complete and precise discriminator.
        const value: string | string[] =
          typeof answer.value === 'string' ? answer.value : [...answer.value];
        await transaction.insert(surveyAnswers).values({
          questionId: answer.questionId,
          responseId: response.id,
          value,
        });
      }

      await transaction
        .update(surveyTokens)
        .set({ usedAt: new Date() })
        .where(eq(surveyTokens.id, tokenRow.id));

      return response;
    });
  }

  public async getSurveyResults(surveyId: string) {
    const [survey] = await this.database
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);
    if (!survey) throw new SurveyNotFoundError('Survey not found');

    const questions = await this.loadQuestions(this.database, surveyId);
    const [sentRow] = await this.database
      .select({ sentCount: sql<number>`count(*)` })
      .from(surveyTokens)
      .where(eq(surveyTokens.surveyId, surveyId));
    const [responseRow] = await this.database
      .select({ responseCount: sql<number>`count(*)` })
      .from(surveyResponses)
      .where(eq(surveyResponses.surveyId, surveyId));
    const sentCount = sentRow?.sentCount ?? 0;
    const responseCount = responseRow?.responseCount ?? 0;

    const answers =
      questions.length === 0
        ? []
        : await this.database
            .select({ questionId: surveyAnswers.questionId, value: surveyAnswers.value })
            .from(surveyAnswers)
            .innerJoin(surveyResponses, eq(surveyResponses.id, surveyAnswers.responseId))
            .where(eq(surveyResponses.surveyId, surveyId));

    return {
      questions: questions.map((question) => {
        const counts = new Map<string, number>();
        for (const answer of answers) {
          if (answer.questionId !== question.id) continue;
          const values = Array.isArray(answer.value) ? answer.value : [answer.value];
          for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return {
          answerCounts: [...counts.entries()]
            .map(([value, count]) => ({ count, value }))
            .sort((a, b) => b.count - a.count),
          prompt: question.prompt,
          questionId: question.id,
        };
      }),
      responseCount: Number(responseCount ?? 0),
      sentCount: Number(sentCount ?? 0),
      surveyId,
      title: survey.title,
    };
  }
}
