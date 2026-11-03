import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import { aiConversationMessages, aiConversations } from '../schema/index.js';

export interface AIConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

export interface AIConversationTurn {
  content: string;
  footnote: string | null;
  pasted: string | null;
  role: string;
}

export interface AIConversationDetail extends AIConversationSummary {
  turns: AIConversationTurn[];
}

export interface AIConversationExchange {
  conversationId?: string | undefined;
  footnote: string;
  message: string;
  pasted?: string | undefined;
  reply: string;
  title: string;
  userId: string;
}

/** Cuántas conversaciones muestra el historial: las más recientes. */
const HISTORY_LIMIT = 100;

/**
 * El historial con Hera de cada persona (BUHO_WORKBENCH_PLAN.md, 2026-11-02). Todo se busca por
 * conversación y usuario: la de otro se responde igual que una que no existe.
 */
export class PostgresAIConversationService {
  public constructor(private readonly database: Database) {}

  public list(userId: string): Promise<AIConversationSummary[]> {
    return this.database
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        updatedAt: aiConversations.updatedAt,
      })
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(HISTORY_LIMIT);
  }

  public async get(userId: string, id: string): Promise<AIConversationDetail | null> {
    const [conversation] = await this.database
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        updatedAt: aiConversations.updatedAt,
      })
      .from(aiConversations)
      .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
      .limit(1);
    if (!conversation) return null;
    const turns = await this.database
      .select({
        content: aiConversationMessages.content,
        footnote: aiConversationMessages.footnote,
        pasted: aiConversationMessages.pasted,
        role: aiConversationMessages.role,
      })
      .from(aiConversationMessages)
      .where(eq(aiConversationMessages.conversationId, id))
      .orderBy(asc(aiConversationMessages.ordinal));
    return { ...conversation, turns };
  }

  /** La pregunta y su respuesta, juntas. Sin `conversationId` empieza una conversación nueva. */
  public append(exchange: AIConversationExchange): Promise<string | null> {
    return this.database.transaction(async (transaction) => {
      let conversationId = exchange.conversationId;
      if (conversationId) {
        const [existing] = await transaction
          .update(aiConversations)
          .set({ updatedAt: sql`now()` })
          .where(
            and(
              eq(aiConversations.id, conversationId),
              eq(aiConversations.userId, exchange.userId),
            ),
          )
          .returning({ id: aiConversations.id });
        if (!existing) return null;
      } else {
        const [created] = await transaction
          .insert(aiConversations)
          .values({ title: exchange.title, userId: exchange.userId })
          .returning({ id: aiConversations.id });
        if (!created) return null;
        conversationId = created.id;
      }
      await transaction.insert(aiConversationMessages).values([
        {
          content: exchange.message,
          conversationId,
          pasted: exchange.pasted ?? null,
          role: 'user',
        },
        {
          content: exchange.reply,
          conversationId,
          footnote: exchange.footnote,
          role: 'assistant',
        },
      ]);
      return conversationId;
    });
  }

  public async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(aiConversations)
      .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
      .returning({ id: aiConversations.id });
    return deleted.length > 0;
  }
}
