import { asc, desc, eq, sql } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';

import type { Database } from '../index.js';
import { assistantFlowRevisions, assistantFlows, assistantOptionHits } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export interface AssistantContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class AssistantNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AssistantNotFoundError';
  }
}

/** El único asistente que existe hoy. Ver el comentario de `assistant_flows.key`. */
export const LANDING_FLOW_KEY = 'landing';

/**
 * El árbol con el que arranca una instalación.
 *
 * No es un ejemplo de relleno: son las cinco opciones que se pidieron, escritas para poder usarse
 * tal cual el primer día. Las tres primeras necesitan la ciudad porque el menú se distribuye por
 * ciudad y el precio depende del tamaño y de la ciudad (ADR-030, ADR-031); contestarlas sin
 * preguntarla sería contestar cualquier cosa.
 *
 * Cada texto dice el sentido y el bloque dice el dato. Es a propósito: un texto que enumerara los
 * menús quedaría escrito y en seis semanas estaría mintiendo, mientras que el bloque sale de la
 * misma fuente que la web pública y no se puede desactualizar.
 */
const DEFAULT_OPTIONS = [
  {
    behaviour: 'responder',
    block: 'MENU_SEMANA',
    key: 'menus',
    label: 'Conocer los menús',
    needsCity: true,
    options: [],
    reply:
      'Cada semana preparamos varias variedades y vos elegís la que quieras. Éste es el menú de esta semana:',
  },
  {
    behaviour: 'responder',
    block: 'PRECIOS',
    key: 'precios',
    label: 'Conocer los precios',
    needsCity: true,
    options: [],
    reply:
      'El precio depende del tamaño de la vianda. Cada una trae cinco comidas listas para tu semana:',
  },
  {
    behaviour: 'responder',
    block: 'ZONAS',
    key: 'entrega',
    label: 'Cómo es la entrega',
    needsCity: true,
    options: [],
    reply:
      'Entregamos a domicilio el día de cierre de cada semana, dentro de estas zonas. Si no ves la tuya, escribinos y lo vemos:',
  },
  {
    behaviour: 'llevar',
    href: '/pedido',
    key: 'pedir',
    label: 'Quiero hacer un pedido',
    needsCity: false,
    options: [],
    reply: 'Te llevo al formulario. Son dos minutos.',
  },
  {
    behaviour: 'salir',
    key: 'hablar',
    label: 'Hablar con alguien',
    needsCity: false,
    options: [],
    reply: 'Te abro WhatsApp con un mensaje listo.',
    whatsappMessage: 'Hola, entré a la web y quería hacer una consulta.',
  },
] as const;

const DEFAULT_GREETING = '¡Hola! Soy el asistente de Verdeo. ¿Con qué te doy una mano?';

/**
 * El asistente de la landing: un árbol de opciones configurable, con revisiones.
 *
 * Mismo patrón que el CMS —un documento con revisiones y un puntero a la publicada— y por las
 * mismas razones: se edita sin publicar, y una revisión rota se revierte a la anterior. La landing
 * lee sólo lo publicado, así que un borrador a medio armar no llega nunca a un visitante.
 */
export class PostgresAssistantService {
  public constructor(private readonly database: Database) {}

  /**
   * El flujo, creándolo con las opciones por defecto la primera vez.
   *
   * Se crea al leerlo y no con una migración de datos a propósito: una migración que inserta filas
   * es una que hay que repetir a mano en cada entorno, y ésta es la clase de configuración que
   * tiene que existir siempre, no la clase que alguien decide crear.
   */
  private async ensureFlow() {
    const [existing] = await this.database
      .select()
      .from(assistantFlows)
      .where(eq(assistantFlows.key, LANDING_FLOW_KEY))
      .limit(1);
    if (existing) return existing;

    const [created] = await this.database
      .insert(assistantFlows)
      .values({ greeting: DEFAULT_GREETING, key: LANDING_FLOW_KEY })
      .onConflictDoNothing()
      .returning();
    if (created) {
      const [revision] = await this.database
        .insert(assistantFlowRevisions)
        .values({
          flowId: created.id,
          greeting: DEFAULT_GREETING,
          options: [...DEFAULT_OPTIONS],
          revision: 1,
        })
        .returning();
      if (revision) {
        const [published] = await this.database
          .update(assistantFlows)
          .set({ publishedRevisionId: revision.id, updatedAt: new Date() })
          .where(eq(assistantFlows.id, created.id))
          .returning();
        if (published) return published;
      }
      return created;
    }

    // Dos peticiones simultáneas la primera vez: la que perdió el conflicto vuelve a leer.
    const [raced] = await this.database
      .select()
      .from(assistantFlows)
      .where(eq(assistantFlows.key, LANDING_FLOW_KEY))
      .limit(1);
    if (!raced) throw new AssistantNotFoundError('Assistant flow could not be created');
    return raced;
  }

  private async latestRevision(flowId: string) {
    const [row] = await this.database
      .select()
      .from(assistantFlowRevisions)
      .where(eq(assistantFlowRevisions.flowId, flowId))
      .orderBy(desc(assistantFlowRevisions.revision))
      .limit(1);
    return row ?? null;
  }

  /** Lo que ve la landing: sólo lo publicado. Un borrador nunca llega a un visitante. */
  public async getPublishedFlow() {
    const flow = await this.ensureFlow();
    if (!flow.publishedRevisionId) return { greeting: flow.greeting, options: [] };

    const [revision] = await this.database
      .select()
      .from(assistantFlowRevisions)
      .where(eq(assistantFlowRevisions.id, flow.publishedRevisionId))
      .limit(1);
    if (!revision) return { greeting: flow.greeting, options: [] };
    return { greeting: revision.greeting, options: revision.options };
  }

  /** Lo que ve quien lo configura: el borrador, y si difiere de lo que está publicado. */
  public async getEditableFlow() {
    const flow = await this.ensureFlow();
    const latest = await this.latestRevision(flow.id);
    return {
      greeting: latest?.greeting ?? flow.greeting,
      id: flow.id,
      key: flow.key,
      options: latest?.options ?? [],
      publishedAt: flow.publishedRevisionId ? flow.updatedAt : null,
      revision: latest?.revision ?? 0,
      unpublishedChanges: latest !== null && latest.id !== flow.publishedRevisionId,
    };
  }

  /**
   * Guarda un borrador: una revisión nueva, sin publicar.
   *
   * Cada guardado escribe una revisión en vez de pisar la anterior. Es lo que permite volver atrás,
   * y es barato: un documento JSON por guardado, no una fila por opción.
   */
  public async saveDraft(
    input: { greeting: string; options: unknown[] },
    context: AssistantContext,
  ) {
    const flow = await this.ensureFlow();
    const latest = await this.latestRevision(flow.id);

    return this.database.transaction(async (transaction) => {
      const [revision] = await transaction
        .insert(assistantFlowRevisions)
        .values({
          createdByUserId: context.actorUserId ?? null,
          flowId: flow.id,
          greeting: input.greeting,
          options: input.options,
          revision: (latest?.revision ?? 0) + 1,
        })
        .returning();
      if (!revision) throw new Error('Assistant revision insert did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'assistant.draft_saved',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { optionCount: input.options.length, revision: revision.revision },
        correlationId: context.correlationId,
        entityId: flow.id,
        entityType: 'assistant_flow',
        requestId: context.requestId,
        source: context.source,
      });

      return revision;
    });
  }

  /** Publica la última revisión: recién ahí la landing la ve. */
  public async publish(context: AssistantContext) {
    const flow = await this.ensureFlow();
    const latest = await this.latestRevision(flow.id);
    if (!latest) throw new AssistantNotFoundError('There is no revision to publish');

    return this.database.transaction(async (transaction) => {
      await transaction
        .update(assistantFlows)
        .set({
          greeting: latest.greeting,
          publishedRevisionId: latest.id,
          updatedAt: new Date(),
        })
        .where(eq(assistantFlows.id, flow.id));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'assistant.published',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { revision: latest.revision },
        correlationId: context.correlationId,
        entityId: flow.id,
        entityType: 'assistant_flow',
        requestId: context.requestId,
        source: context.source,
      });

      return latest;
    });
  }

  /**
   * Suma un toque a una opción.
   *
   * Sin sesión, sin identificador, sin fecha por evento: un contador y su última actualización. Las
   * conversaciones no se guardan y esto no las guarda; contesta otra pregunta, que es qué le falta
   * a la landing, y esa se puede contestar con un número.
   *
   * Una clave que no existe en el árbol publicado igual se cuenta: el árbol cambia, los toques ya
   * ocurridos no, y descartarlos escondería justamente el dato de que alguien tocó algo que después
   * se sacó.
   */
  public async recordHit(optionKey: string) {
    await this.database
      .insert(assistantOptionHits)
      .values({ flowKey: LANDING_FLOW_KEY, hits: 1, optionKey })
      .onConflictDoUpdate({
        set: { hits: sql`${assistantOptionHits.hits} + 1`, updatedAt: new Date() },
        target: [assistantOptionHits.flowKey, assistantOptionHits.optionKey],
      });
  }

  public async getStats() {
    const rows = await this.database
      .select({ hits: assistantOptionHits.hits, optionKey: assistantOptionHits.optionKey })
      .from(assistantOptionHits)
      .where(eq(assistantOptionHits.flowKey, LANDING_FLOW_KEY))
      .orderBy(desc(assistantOptionHits.hits), asc(assistantOptionHits.optionKey));
    return { items: rows.map((row) => ({ hits: Number(row.hits), optionKey: row.optionKey })) };
  }
}

/** Sólo para los tests: el árbol con el que arranca una instalación. */
export const DEFAULT_ASSISTANT_OPTIONS = DEFAULT_OPTIONS;
