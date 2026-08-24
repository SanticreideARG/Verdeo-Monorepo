import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PostgresSurveyService,
  SurveyConflictError,
  SurveyNotFoundError,
} from './repositories/postgres-survey-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function migratedDatabase(): Promise<{
  client: PGlite;
  close: () => Promise<void>;
  db: Database;
}> {
  const client = new PGlite();
  await client.waitReady;

  for (const file of readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
      await client.exec(statement);
    }
  }

  return {
    client,
    close: () => client.close(),
    db: drizzle(client, { schema }) as unknown as Database,
  };
}

const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<PostgresSurveyService> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(
    `insert into customers (id, display_name) values ('${CUSTOMER}', 'María Pérez');`,
  );
  return new PostgresSurveyService(db);
}

const context = { correlationId: 'corr-1', requestId: 'req-1', source: 'test' };

describe('surveys', () => {
  it('creates a survey with ordered questions of both shapes', async () => {
    const service = await seededService();
    const survey = await service.createSurvey(
      {
        questions: [
          {
            allowMultiple: false,
            options: [],
            prompt: '¿Qué te pareció el pedido?',
            required: true,
          },
          {
            allowMultiple: true,
            options: ['Sabor', 'Presentación', 'Puntualidad'],
            prompt: '¿Qué te gustó?',
            required: false,
          },
        ],
        title: 'Satisfacción semana 34',
      },
      context,
    );

    expect(survey.questions).toHaveLength(2);
    expect(survey.questions[0]?.options).toEqual([]);
    expect(survey.questions[1]?.options).toEqual(['Sabor', 'Presentación', 'Puntualidad']);
    expect(survey.active).toBe(true);
  });

  it('sends a token 1:1 to a customer and exposes it through the public read', async () => {
    const service = await seededService();
    const survey = await service.createSurvey(
      {
        questions: [{ allowMultiple: false, options: [], prompt: 'Comentario', required: true }],
        title: 'V1',
      },
      context,
    );

    const sent = await service.sendSurvey(survey.id, CUSTOMER, context);
    const publicSurvey = await service.getPublicSurvey(sent.token);
    expect(publicSurvey.title).toBe('V1');
    expect(publicSurvey.questions).toHaveLength(1);
  });

  it('is single-use: a submitted token cannot be read or submitted again', async () => {
    const service = await seededService();
    const survey = await service.createSurvey(
      {
        questions: [{ allowMultiple: false, options: [], prompt: 'Comentario', required: true }],
        title: 'V1',
      },
      context,
    );
    const sent = await service.sendSurvey(survey.id, CUSTOMER, context);
    const questionId = survey.questions[0]!.id;

    await service.submitSurveyResponse(sent.token, [{ questionId, value: 'Todo bien' }]);

    await expect(service.getPublicSurvey(sent.token)).rejects.toThrow(SurveyConflictError);
    await expect(
      service.submitSurveyResponse(sent.token, [{ questionId, value: 'Otra vez' }]),
    ).rejects.toThrow(SurveyConflictError);
  });

  it('rejects a submission missing a required answer', async () => {
    const service = await seededService();
    const survey = await service.createSurvey(
      {
        questions: [{ allowMultiple: false, options: [], prompt: 'Comentario', required: true }],
        title: 'V1',
      },
      context,
    );
    const sent = await service.sendSurvey(survey.id, CUSTOMER, context);

    await expect(service.submitSurveyResponse(sent.token, [])).rejects.toThrow(SurveyConflictError);
  });

  it('404s an unknown token', async () => {
    const service = await seededService();
    await expect(service.getPublicSurvey('does-not-exist')).rejects.toThrow(SurveyNotFoundError);
  });

  it('aggregates results per question, counting multi-select answers per option', async () => {
    const service = await seededService();
    const survey = await service.createSurvey(
      {
        questions: [
          {
            allowMultiple: true,
            options: ['Sabor', 'Precio'],
            prompt: '¿Qué te gustó?',
            required: true,
          },
        ],
        title: 'V1',
      },
      context,
    );
    const questionId = survey.questions[0]!.id;

    const first = await service.sendSurvey(survey.id, CUSTOMER, context);
    await service.submitSurveyResponse(first.token, [{ questionId, value: ['Sabor', 'Precio'] }]);

    const results = await service.getSurveyResults(survey.id);
    expect(results.sentCount).toBe(1);
    expect(results.responseCount).toBe(1);
    expect(results.questions[0]?.answerCounts).toEqual(
      expect.arrayContaining([
        { count: 1, value: 'Sabor' },
        { count: 1, value: 'Precio' },
      ]),
    );
  });

  it('replaces questions wholesale on update', async () => {
    const service = await seededService();
    const survey = await service.createSurvey(
      {
        questions: [{ allowMultiple: false, options: [], prompt: 'Original', required: true }],
        title: 'V1',
      },
      context,
    );

    const updated = await service.updateSurvey(
      survey.id,
      {
        active: false,
        questions: [{ allowMultiple: false, options: [], prompt: 'Reemplazada', required: true }],
        title: 'V1 editada',
      },
      context,
    );

    expect(updated.title).toBe('V1 editada');
    expect(updated.active).toBe(false);
    expect(updated.questions).toHaveLength(1);
    expect(updated.questions[0]?.prompt).toBe('Reemplazada');
  });
});
