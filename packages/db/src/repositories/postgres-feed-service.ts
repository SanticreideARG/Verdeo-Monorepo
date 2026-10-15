import { AuditService, type JsonValue } from '@verdeo/audit';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import {
  feedPostReads,
  feedPosts,
  operatingSites,
  permissions,
  rolePermissions,
  userRoles,
  users,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export interface FeedContext {
  actorUserId?: string | undefined;
  /** Puede fijar y editar o borrar lo de otros (`feed.moderate`). */
  canModerate: boolean;
  correlationId: string;
  requestId: string;
  source: string;
}

export type FeedTag = 'aviso' | 'cambio' | 'novedad';

export class FeedNotFoundError extends Error {
  public constructor(message = 'No se encontró la publicación.') {
    super(message);
    this.name = 'FeedNotFoundError';
  }
}

export class FeedForbiddenError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'FeedForbiddenError';
  }
}

/** Quien lee el tablero: el que publica es cualquiera del equipo (`feed.post`). */
const STAFF_PERMISSION = 'feed.post';

export interface FeedPost {
  authorDisplayName: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  id: string;
  /** Pide confirmar "lo leí": las fijadas y los cambios, que no se pueden pasar por alto. */
  needsAcknowledgement: boolean;
  operatingSiteId: string | null;
  operatingSiteName: string | null;
  pinnedUntil: Date | null;
  acknowledgedCount: number;
  myAcknowledgedAt: Date | null;
  myReadAt: Date | null;
  readCount: number;
  tag: FeedTag;
}

/**
 * Las publicaciones del tablero (DASHBOARD_FEED_PLAN.md, "Comunicaciones").
 *
 * Cualquiera del equipo publica; quien modera fija arriba y puede editar o borrar lo de otros. El
 * borrado es lógico y todo queda en la auditoría.
 */
export class PostgresFeedService {
  public constructor(private readonly database: Database) {}

  /**
   * Las publicaciones que ve una persona: las fijadas vigentes primero, después de la más nueva a
   * la más vieja. Con una ciudad en el alcance, las de esa ciudad y las de todas.
   */
  public async listPosts(input: {
    before?: Date | undefined;
    limit?: number | undefined;
    operatingSiteId?: string | null | undefined;
    viewerUserId: string;
  }): Promise<FeedPost[]> {
    const now = new Date().toISOString();
    const pinned = sql<boolean>`coalesce(${feedPosts.pinnedUntil} > ${now}::timestamptz, false)`;
    const rows = await this.database
      .select({
        acknowledgedCount: sql<number>`(select count(*)::int from ${feedPostReads} r where r.post_id = ${feedPosts.id} and r.acknowledged_at is not null)`,
        authorDisplayName: users.displayName,
        authorUserId: feedPosts.authorUserId,
        body: feedPosts.body,
        createdAt: feedPosts.createdAt,
        editedAt: feedPosts.editedAt,
        id: feedPosts.id,
        myAcknowledgedAt: feedPostReads.acknowledgedAt,
        myReadAt: feedPostReads.readAt,
        operatingSiteId: feedPosts.operatingSiteId,
        operatingSiteName: operatingSites.displayName,
        pinnedUntil: feedPosts.pinnedUntil,
        readCount: sql<number>`(select count(*)::int from ${feedPostReads} r where r.post_id = ${feedPosts.id})`,
        tag: feedPosts.tag,
      })
      .from(feedPosts)
      .leftJoin(users, eq(users.id, feedPosts.authorUserId))
      .leftJoin(operatingSites, eq(operatingSites.id, feedPosts.operatingSiteId))
      .leftJoin(
        feedPostReads,
        and(eq(feedPostReads.postId, feedPosts.id), eq(feedPostReads.userId, input.viewerUserId)),
      )
      .where(
        and(
          isNull(feedPosts.deletedAt),
          input.operatingSiteId
            ? or(
                isNull(feedPosts.operatingSiteId),
                eq(feedPosts.operatingSiteId, input.operatingSiteId),
              )
            : undefined,
          input.before
            ? sql`${feedPosts.createdAt} < ${input.before.toISOString()}::timestamptz`
            : undefined,
        ),
      )
      .orderBy(desc(pinned), desc(feedPosts.createdAt))
      .limit(Math.min(input.limit ?? 30, 100));

    return rows.map((row) => {
      const tag = row.tag as FeedTag;
      const isPinned = row.pinnedUntil !== null && row.pinnedUntil > new Date();
      return {
        ...row,
        acknowledgedCount: Number(row.acknowledgedCount),
        needsAcknowledgement: isPinned || tag === 'cambio',
        readCount: Number(row.readCount),
        tag,
      };
    });
  }

  public async createPost(
    input: {
      body: string;
      operatingSiteId?: string | null | undefined;
      pinnedUntil?: Date | null | undefined;
      tag: FeedTag;
    },
    context: FeedContext,
  ) {
    const actorUserId = requireActor(context);
    if (input.pinnedUntil && !context.canModerate) {
      throw new FeedForbiddenError('Sólo quien administra puede fijar una publicación.');
    }
    if (input.tag === 'novedad' && !context.canModerate) {
      throw new FeedForbiddenError('Las novedades del sistema las publica quien administra.');
    }
    const [created] = await this.database
      .insert(feedPosts)
      .values({
        authorUserId: actorUserId,
        body: input.body.trim(),
        operatingSiteId: input.operatingSiteId ?? null,
        pinnedUntil: input.pinnedUntil ?? null,
        tag: input.tag,
      })
      .returning({ id: feedPosts.id });
    if (!created) throw new Error('La publicación no se guardó.');
    // Quien publica ya lo leyó.
    await this.database
      .insert(feedPostReads)
      .values({ acknowledgedAt: new Date(), postId: created.id, userId: actorUserId })
      .onConflictDoNothing();
    await this.audit('feed.post_created', created.id, context, {
      after: { operatingSiteId: input.operatingSiteId ?? null, tag: input.tag },
    });
    return created;
  }

  /** Editar el texto o la etiqueta: el autor, la suya; quien modera, cualquiera. */
  public async updatePost(
    postId: string,
    input: { body?: string | undefined; tag?: FeedTag | undefined },
    context: FeedContext,
  ) {
    const post = await this.editablePost(postId, context);
    if (input.tag === 'novedad' && !context.canModerate) {
      throw new FeedForbiddenError('Las novedades del sistema las publica quien administra.');
    }
    const now = new Date();
    await this.database
      .update(feedPosts)
      .set({
        ...(input.body !== undefined ? { body: input.body.trim() } : {}),
        ...(input.tag !== undefined ? { tag: input.tag } : {}),
        editedAt: now,
        updatedAt: now,
      })
      .where(eq(feedPosts.id, postId));
    await this.audit('feed.post_updated', postId, context, {
      after: { body: input.body ?? post.body, tag: input.tag ?? post.tag },
      before: { body: post.body, tag: post.tag },
    });
  }

  public async deletePost(postId: string, context: FeedContext) {
    const post = await this.editablePost(postId, context);
    const now = new Date();
    await this.database
      .update(feedPosts)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(feedPosts.id, postId));
    await this.audit('feed.post_deleted', postId, context, {
      before: { body: post.body, tag: post.tag },
    });
  }

  /** Fijar arriba hasta una fecha, o soltar con null. Sólo quien modera. */
  public async setPinned(postId: string, pinnedUntil: Date | null, context: FeedContext) {
    if (!context.canModerate) {
      throw new FeedForbiddenError('Sólo quien administra puede fijar una publicación.');
    }
    await this.livePost(postId);
    await this.database
      .update(feedPosts)
      .set({ pinnedUntil, updatedAt: new Date() })
      .where(eq(feedPosts.id, postId));
    await this.audit('feed.post_pinned', postId, context, {
      after: { pinnedUntil: pinnedUntil?.toISOString() ?? null },
    });
  }

  /** Marcar vista, y con `acknowledge` confirmar "lo leí". Repetirlo no cambia la primera vez. */
  public async markRead(postId: string, userId: string, acknowledge: boolean) {
    await this.livePost(postId);
    const now = new Date();
    await this.database
      .insert(feedPostReads)
      .values({ acknowledgedAt: acknowledge ? now : null, postId, readAt: now, userId })
      .onConflictDoUpdate({
        set: acknowledge
          ? {
              acknowledgedAt: sql`coalesce(${feedPostReads.acknowledgedAt}, ${now.toISOString()}::timestamptz)`,
            }
          : { readAt: sql`${feedPostReads.readAt}` },
        target: [feedPostReads.postId, feedPostReads.userId],
      });
  }

  /**
   * Quién la leyó y quién falta: el equipo es quien tiene `feed.post` por sus roles. Las
   * excepciones individuales no se miran: alcanza para saber a quién avisarle de nuevo.
   */
  public async readers(postId: string) {
    const post = await this.livePost(postId);
    const team = await this.database
      .selectDistinct({ displayName: users.displayName, id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(eq(permissions.key, STAFF_PERMISSION), eq(users.status, 'active')));
    const reads = await this.database
      .select({
        acknowledgedAt: feedPostReads.acknowledgedAt,
        displayName: users.displayName,
        readAt: feedPostReads.readAt,
        userId: feedPostReads.userId,
      })
      .from(feedPostReads)
      .innerJoin(users, eq(users.id, feedPostReads.userId))
      .where(eq(feedPostReads.postId, postId))
      .orderBy(feedPostReads.readAt);
    const seen = new Set(reads.map((read) => read.userId));
    return {
      pending: team
        .filter((member) => !seen.has(member.id) && member.id !== post.authorUserId)
        .map((member) => ({ displayName: member.displayName, userId: member.id }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es')),
      reads,
    };
  }

  /** Cuántas publicaciones nuevas no vio: el punto en el ícono del tablero. */
  public async unreadCount(viewerUserId: string, operatingSiteId?: string | null) {
    const [row] = await this.database
      .select({ total: sql<number>`count(*)::int` })
      .from(feedPosts)
      .leftJoin(
        feedPostReads,
        and(eq(feedPostReads.postId, feedPosts.id), eq(feedPostReads.userId, viewerUserId)),
      )
      .where(
        and(
          isNull(feedPosts.deletedAt),
          isNull(feedPostReads.postId),
          // Sólo lo de las últimas dos semanas: una publicación vieja no es una novedad.
          gt(feedPosts.createdAt, new Date(Date.now() - 14 * 86_400_000)),
          operatingSiteId
            ? or(isNull(feedPosts.operatingSiteId), eq(feedPosts.operatingSiteId, operatingSiteId))
            : undefined,
        ),
      );
    return Number(row?.total ?? 0);
  }

  private async livePost(postId: string) {
    const [post] = await this.database
      .select({ authorUserId: feedPosts.authorUserId, body: feedPosts.body, tag: feedPosts.tag })
      .from(feedPosts)
      .where(and(eq(feedPosts.id, postId), isNull(feedPosts.deletedAt)))
      .limit(1);
    if (!post) throw new FeedNotFoundError();
    return post;
  }

  private async editablePost(postId: string, context: FeedContext) {
    const post = await this.livePost(postId);
    if (!context.canModerate && post.authorUserId !== requireActor(context)) {
      throw new FeedForbiddenError('Sólo podés cambiar tus publicaciones.');
    }
    return post;
  }

  private async audit(
    action: string,
    postId: string,
    context: FeedContext,
    change: { after?: JsonValue; before?: JsonValue },
  ) {
    await new AuditService(new PostgresAuditSink(this.database)).record({
      action,
      actor: { type: 'user', userId: requireActor(context) },
      ...(change.after !== undefined ? { after: change.after } : {}),
      ...(change.before !== undefined ? { before: change.before } : {}),
      correlationId: context.correlationId,
      entityId: postId,
      entityType: 'feed_post',
      requestId: context.requestId,
      source: context.source,
    });
  }
}

function requireActor(context: FeedContext): string {
  if (!context.actorUserId) throw new FeedForbiddenError('Hace falta una sesión para publicar.');
  return context.actorUserId;
}
