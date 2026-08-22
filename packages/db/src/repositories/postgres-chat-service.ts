import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { AuditService, type JsonValue } from '@verdeo/audit';
import {
  directConversationKey,
  effectivePresence,
  normalizePair,
  resolveChatLink,
  type ChatLinkPolicy,
  type ChatParticipant,
} from '@verdeo/chat';

import type { Database } from '../index.js';
import {
  chatPresenceStatuses,
  chatRoleLinks,
  chatUserLinks,
  permissions,
  rolePermissions,
  roles,
  staffConversationParticipants,
  staffConversations,
  staffMessages,
  staffPresence,
  userPermissionOverrides,
  userRoles,
  users,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const CHAT_PERMISSION = 'chat.use';

export interface ChatContext {
  actorUserId: string;
  correlationId: string;
  requestId: string;
  source: string;
}

export class ChatNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ChatNotFoundError';
  }
}

export class ChatForbiddenError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ChatForbiddenError';
  }
}

export class ChatConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ChatConflictError';
  }
}

function linkAuditFields(row: {
  effect?: string;
  active?: boolean;
  first: string;
  second: string;
}): JsonValue {
  return {
    ...(row.active === undefined ? {} : { active: row.active }),
    ...(row.effect === undefined ? {} : { effect: row.effect }),
    first: row.first,
    second: row.second,
  };
}

export class PostgresChatService {
  public constructor(private readonly database: Database) {}

  // ---------------------------------------------------------------- link policy

  /**
   * Everyone who could take part in a conversation, with the roles and the chat permission the
   * policy needs. Resolved in one pass rather than per candidate, because the contact list asks
   * about every colleague at once.
   */
  private async participants(
    database: Database | DatabaseTransaction,
  ): Promise<Map<string, ChatParticipant & { displayName: string }>> {
    const rows = await database
      .select({
        displayName: users.displayName,
        roleId: userRoles.roleId,
        userId: users.id,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(eq(users.status, 'active'));

    // A role grant or an individual allow override is enough; an individual deny removes it.
    const granted = await database
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(
        permissions,
        and(eq(permissions.id, rolePermissions.permissionId), eq(permissions.key, CHAT_PERMISSION)),
      );
    const overrides = await database
      .select({ effect: userPermissionOverrides.effect, userId: userPermissionOverrides.userId })
      .from(userPermissionOverrides)
      .innerJoin(
        permissions,
        and(
          eq(permissions.id, userPermissionOverrides.permissionId),
          eq(permissions.key, CHAT_PERMISSION),
        ),
      );

    const canUse = new Set(granted.map((row: { userId: string }) => row.userId));
    for (const override of overrides) {
      if (override.effect === 'deny') canUse.delete(override.userId);
      else canUse.add(override.userId);
    }

    const byUser = new Map<string, ChatParticipant & { displayName: string }>();
    for (const row of rows) {
      const current = byUser.get(row.userId);
      if (current) {
        if (row.roleId) current.roleIds = [...current.roleIds, row.roleId];
        continue;
      }
      byUser.set(row.userId, {
        canUseChat: canUse.has(row.userId),
        displayName: row.displayName,
        roleIds: row.roleId ? [row.roleId] : [],
        userId: row.userId,
      });
    }
    return byUser;
  }

  private async policy(database: Database | DatabaseTransaction): Promise<ChatLinkPolicy> {
    const [roleLinks, userLinks] = await Promise.all([
      database
        .select({
          active: chatRoleLinks.active,
          roleAId: chatRoleLinks.roleAId,
          roleBId: chatRoleLinks.roleBId,
        })
        .from(chatRoleLinks),
      database
        .select({
          effect: chatUserLinks.effect,
          userAId: chatUserLinks.userAId,
          userBId: chatUserLinks.userBId,
        })
        .from(chatUserLinks),
    ]);

    return {
      roleLinks,
      userLinks: userLinks.map((link: { effect: string; userAId: string; userBId: string }) => ({
        effect: link.effect === 'deny' ? ('deny' as const) : ('allow' as const),
        userAId: link.userAId,
        userBId: link.userBId,
      })),
    };
  }

  /** The role matrix and the individual exceptions, for the administration screen. */
  public async listLinks() {
    const [roleRows, userRows, roleCatalog] = await Promise.all([
      this.database
        .select({
          active: chatRoleLinks.active,
          id: chatRoleLinks.id,
          roleAId: chatRoleLinks.roleAId,
          roleBId: chatRoleLinks.roleBId,
        })
        .from(chatRoleLinks),
      this.database
        .select({
          createdAt: chatUserLinks.createdAt,
          effect: chatUserLinks.effect,
          id: chatUserLinks.id,
          reason: chatUserLinks.reason,
          userAId: chatUserLinks.userAId,
          userBId: chatUserLinks.userBId,
        })
        .from(chatUserLinks),
      this.database
        .select({ id: roles.id, key: roles.key, name: roles.name })
        .from(roles)
        .orderBy(asc(roles.name)),
    ]);

    const people = await this.participants(this.database);
    const nameOf = (userId: string) => people.get(userId)?.displayName ?? 'Usuario';

    return {
      roleLinks: roleRows,
      roles: roleCatalog,
      userLinks: userRows.map((link) => ({
        ...link,
        userADisplayName: nameOf(link.userAId),
        userBDisplayName: nameOf(link.userBId),
      })),
    };
  }

  public async setRoleLink(
    input: { active: boolean; roleAId: string; roleBId: string },
    context: ChatContext,
  ) {
    const [roleAId, roleBId] = normalizePair(input.roleAId, input.roleBId);

    return this.database.transaction(async (transaction) => {
      const found = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(inArray(roles.id, [...new Set([roleAId, roleBId])]));
      if (found.length !== new Set([roleAId, roleBId]).size)
        throw new ChatNotFoundError('El rol indicado no existe.');

      const [saved] = await transaction
        .insert(chatRoleLinks)
        .values({ active: input.active, roleAId, roleBId })
        .onConflictDoUpdate({
          set: { active: input.active, updatedAt: new Date() },
          target: [chatRoleLinks.roleAId, chatRoleLinks.roleBId],
        })
        .returning({ active: chatRoleLinks.active, id: chatRoleLinks.id });
      if (!saved) throw new Error('Chat role link upsert did not return a row');

      await new AuditService(new PostgresAuditSink(transaction)).record({
        action: 'chat.role_link.set',
        actor: { type: 'user', userId: context.actorUserId },
        after: linkAuditFields({ active: saved.active, first: roleAId, second: roleBId }),
        correlationId: context.correlationId,
        entityId: saved.id,
        entityType: 'chat_role_link',
        requestId: context.requestId,
        source: context.source,
      });

      return { active: saved.active, id: saved.id, roleAId, roleBId };
    });
  }

  public async setUserLink(
    input: {
      effect: 'allow' | 'deny';
      reason?: string | undefined;
      userAId: string;
      userBId: string;
    },
    context: ChatContext,
  ) {
    if (input.userAId === input.userBId)
      throw new ChatConflictError('Una excepción necesita dos personas distintas.');
    const [userAId, userBId] = normalizePair(input.userAId, input.userBId);

    return this.database.transaction(async (transaction) => {
      const found = await transaction
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, [userAId, userBId]));
      if (found.length !== 2) throw new ChatNotFoundError('El usuario indicado no existe.');

      const [saved] = await transaction
        .insert(chatUserLinks)
        .values({
          createdByUserId: context.actorUserId,
          effect: input.effect,
          reason: input.reason ?? null,
          userAId,
          userBId,
        })
        .onConflictDoUpdate({
          set: {
            createdByUserId: context.actorUserId,
            effect: input.effect,
            reason: input.reason ?? null,
            updatedAt: new Date(),
          },
          target: [chatUserLinks.userAId, chatUserLinks.userBId],
        })
        .returning({ effect: chatUserLinks.effect, id: chatUserLinks.id });
      if (!saved) throw new Error('Chat user link upsert did not return a row');

      await new AuditService(new PostgresAuditSink(transaction)).record({
        action: 'chat.user_link.set',
        actor: { type: 'user', userId: context.actorUserId },
        after: linkAuditFields({ effect: saved.effect, first: userAId, second: userBId }),
        correlationId: context.correlationId,
        entityId: saved.id,
        entityType: 'chat_user_link',
        requestId: context.requestId,
        source: context.source,
      });

      return { effect: saved.effect, id: saved.id, userAId, userBId };
    });
  }

  public async removeUserLink(linkId: string, context: ChatContext) {
    return this.database.transaction(async (transaction) => {
      const [removed] = await transaction
        .delete(chatUserLinks)
        .where(eq(chatUserLinks.id, linkId))
        .returning({
          effect: chatUserLinks.effect,
          userAId: chatUserLinks.userAId,
          userBId: chatUserLinks.userBId,
        });
      if (!removed) throw new ChatNotFoundError('La excepción indicada no existe.');

      await new AuditService(new PostgresAuditSink(transaction)).record({
        action: 'chat.user_link.removed',
        actor: { type: 'user', userId: context.actorUserId },
        before: linkAuditFields({
          effect: removed.effect,
          first: removed.userAId,
          second: removed.userBId,
        }),
        correlationId: context.correlationId,
        entityId: linkId,
        entityType: 'chat_user_link',
        requestId: context.requestId,
        source: context.source,
      });
    });
  }

  /** The colleagues this user may start a conversation with. */
  public async listContacts(userId: string) {
    const [people, policy] = await Promise.all([
      this.participants(this.database),
      this.policy(this.database),
    ]);
    const subject = people.get(userId);
    if (!subject) throw new ChatNotFoundError('El usuario no está activo.');

    return [...people.values()]
      .filter((candidate) => resolveChatLink(subject, candidate, policy).allowed)
      .map((candidate) => ({ displayName: candidate.displayName, id: candidate.userId }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  // ---------------------------------------------------------------- conversations

  /**
   * Opens the direct conversation between two people, or returns the existing one. The pair key
   * carries the uniqueness, so two people pressing "chat" at the same moment converge on one thread
   * instead of creating two.
   */
  public async openDirectConversation(otherUserId: string, context: ChatContext) {
    return this.database.transaction(async (transaction) => {
      const [people, policy] = await Promise.all([
        this.participants(transaction),
        this.policy(transaction),
      ]);
      const subject = people.get(context.actorUserId);
      const other = people.get(otherUserId);
      if (!subject || !other) throw new ChatNotFoundError('El usuario no está activo.');

      const decision = resolveChatLink(subject, other, policy);
      if (!decision.allowed)
        throw new ChatForbiddenError('No tenés habilitada una conversación con esa persona.');

      const directKey = directConversationKey(subject.userId, other.userId);
      const [conversation] = await transaction
        .insert(staffConversations)
        .values({ createdByUserId: subject.userId, directKey, kind: 'direct' })
        .onConflictDoUpdate({
          set: { updatedAt: new Date() },
          target: staffConversations.directKey,
          // The unique index is partial, so the predicate has to be repeated for Postgres to match it.
          targetWhere: sql`${staffConversations.directKey} is not null`,
        })
        .returning({ createdAt: staffConversations.createdAt, id: staffConversations.id });
      if (!conversation) throw new Error('Conversation upsert did not return a row');

      await transaction
        .insert(staffConversationParticipants)
        .values([
          { conversationId: conversation.id, userId: subject.userId },
          { conversationId: conversation.id, userId: other.userId },
        ])
        .onConflictDoNothing();

      return { id: conversation.id };
    });
  }

  private async assertParticipant(
    database: Database | DatabaseTransaction,
    conversationId: string,
    userId: string,
  ) {
    const [participant] = await database
      .select({ lastReadAt: staffConversationParticipants.lastReadAt })
      .from(staffConversationParticipants)
      .where(
        and(
          eq(staffConversationParticipants.conversationId, conversationId),
          eq(staffConversationParticipants.userId, userId),
          isNull(staffConversationParticipants.leftAt),
        ),
      )
      .limit(1);
    // A non-participant is told the conversation does not exist rather than that it does.
    if (!participant) throw new ChatNotFoundError('La conversación no existe.');
    return participant;
  }

  /** The user's conversations, most recently active first, with unread counts. */
  public async listConversations(userId: string) {
    const rows = await this.database
      .select({
        id: staffConversations.id,
        kind: staffConversations.kind,
        lastMessageAt: staffConversations.lastMessageAt,
        lastReadAt: staffConversationParticipants.lastReadAt,
        title: staffConversations.title,
      })
      .from(staffConversationParticipants)
      .innerJoin(
        staffConversations,
        eq(staffConversations.id, staffConversationParticipants.conversationId),
      )
      .where(
        and(
          eq(staffConversationParticipants.userId, userId),
          isNull(staffConversationParticipants.leftAt),
        ),
      )
      .orderBy(desc(staffConversations.lastMessageAt), desc(staffConversations.createdAt));
    if (rows.length === 0) return [];

    const conversationIds = rows.map(({ id }) => id);
    const others = await this.database
      .select({
        conversationId: staffConversationParticipants.conversationId,
        displayName: users.displayName,
        userId: users.id,
      })
      .from(staffConversationParticipants)
      .innerJoin(users, eq(users.id, staffConversationParticipants.userId))
      .where(inArray(staffConversationParticipants.conversationId, conversationIds));

    // One grouped count instead of a query per conversation.
    const unread = await this.database
      .select({
        conversationId: staffMessages.conversationId,
        total: sql<number>`count(*)::int`,
      })
      .from(staffMessages)
      .innerJoin(
        staffConversationParticipants,
        and(
          eq(staffConversationParticipants.conversationId, staffMessages.conversationId),
          eq(staffConversationParticipants.userId, userId),
        ),
      )
      .where(
        and(
          inArray(staffMessages.conversationId, conversationIds),
          isNull(staffMessages.deletedAt),
          sql`${staffMessages.authorUserId} is distinct from ${userId}`,
          or(
            isNull(staffConversationParticipants.lastReadAt),
            gt(staffMessages.createdAt, staffConversationParticipants.lastReadAt),
          ),
        ),
      )
      .groupBy(staffMessages.conversationId);

    const unreadByConversation = new Map(unread.map((row) => [row.conversationId, row.total]));
    const participantsByConversation = new Map<string, { displayName: string; id: string }[]>();
    for (const row of others) {
      if (row.userId === userId) continue;
      const bucket = participantsByConversation.get(row.conversationId);
      const entry = { displayName: row.displayName, id: row.userId };
      if (bucket) bucket.push(entry);
      else participantsByConversation.set(row.conversationId, [entry]);
    }

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      lastMessageAt: row.lastMessageAt,
      participants: participantsByConversation.get(row.id) ?? [],
      title: row.title,
      unreadCount: unreadByConversation.get(row.id) ?? 0,
    }));
  }

  /**
   * A page of the transcript. `after` returns everything newer, which is what the polling client
   * asks for; without it the newest page is returned oldest-first for rendering.
   */
  public async listMessages(
    conversationId: string,
    userId: string,
    input: { after?: string | undefined; before?: string | undefined; limit: number },
  ) {
    await this.assertParticipant(this.database, conversationId, userId);

    const anchor = input.after ?? input.before;
    const anchorRow = anchor
      ? await this.database
          .select({ createdAt: staffMessages.createdAt, id: staffMessages.id })
          .from(staffMessages)
          .where(
            and(eq(staffMessages.id, anchor), eq(staffMessages.conversationId, conversationId)),
          )
          .limit(1)
          .then(([row]) => row)
      : null;
    if (anchor && !anchorRow) throw new ChatNotFoundError('El mensaje de referencia no existe.');

    const rows = await this.database
      .select({
        authorDisplayName: users.displayName,
        authorUserId: staffMessages.authorUserId,
        body: staffMessages.body,
        createdAt: staffMessages.createdAt,
        deletedAt: staffMessages.deletedAt,
        editedAt: staffMessages.editedAt,
        id: staffMessages.id,
        kind: staffMessages.kind,
      })
      .from(staffMessages)
      .leftJoin(users, eq(users.id, staffMessages.authorUserId))
      .where(
        and(
          eq(staffMessages.conversationId, conversationId),
          ...(input.after && anchorRow ? [gt(staffMessages.createdAt, anchorRow.createdAt)] : []),
          ...(input.before && anchorRow ? [lt(staffMessages.createdAt, anchorRow.createdAt)] : []),
        ),
      )
      .orderBy(input.after ? asc(staffMessages.createdAt) : desc(staffMessages.createdAt))
      .limit(input.limit);

    const ordered = input.after ? rows : [...rows].reverse();
    return ordered.map((row) => ({
      ...row,
      // A deleted message keeps its place in the transcript without its content.
      body: row.deletedAt ? null : row.body,
    }));
  }

  public async sendMessage(conversationId: string, body: string, context: ChatContext) {
    return this.database.transaction(async (transaction) => {
      await this.assertParticipant(transaction, conversationId, context.actorUserId);

      const [message] = await transaction
        .insert(staffMessages)
        .values({ authorUserId: context.actorUserId, body, conversationId, kind: 'text' })
        .returning({
          body: staffMessages.body,
          createdAt: staffMessages.createdAt,
          id: staffMessages.id,
          kind: staffMessages.kind,
        });
      if (!message) throw new Error('Message insert did not return a row');

      await transaction
        .update(staffConversations)
        .set({ lastMessageAt: message.createdAt, updatedAt: message.createdAt })
        .where(eq(staffConversations.id, conversationId));
      // The author has read what they just wrote.
      await transaction
        .update(staffConversationParticipants)
        .set({ lastReadAt: message.createdAt })
        .where(
          and(
            eq(staffConversationParticipants.conversationId, conversationId),
            eq(staffConversationParticipants.userId, context.actorUserId),
          ),
        );

      return {
        ...message,
        authorDisplayName: null,
        authorUserId: context.actorUserId,
        deletedAt: null,
        editedAt: null,
      };
    });
  }

  public async markRead(conversationId: string, userId: string) {
    await this.assertParticipant(this.database, conversationId, userId);
    await this.database
      .update(staffConversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(staffConversationParticipants.conversationId, conversationId),
          eq(staffConversationParticipants.userId, userId),
        ),
      );
  }

  // ---------------------------------------------------------------- presence

  /** The declared statuses an operator may choose. Data, so adding one needs no deploy. */
  public async listPresenceStatuses() {
    return this.database
      .select({
        displayName: chatPresenceStatuses.displayName,
        key: chatPresenceStatuses.key,
        reachable: chatPresenceStatuses.reachable,
      })
      .from(chatPresenceStatuses)
      .where(eq(chatPresenceStatuses.active, true))
      .orderBy(asc(chatPresenceStatuses.sortOrder), asc(chatPresenceStatuses.displayName));
  }

  /**
   * Records that the user is here, and optionally what they are declaring. The timestamp is the
   * server's: a client cannot claim to have been present at a time of its choosing.
   */
  public async heartbeat(userId: string, status: string | undefined) {
    if (status !== undefined) {
      const [known] = await this.database
        .select({ key: chatPresenceStatuses.key })
        .from(chatPresenceStatuses)
        .where(and(eq(chatPresenceStatuses.key, status), eq(chatPresenceStatuses.active, true)))
        .limit(1);
      if (!known) throw new ChatConflictError('Ese estado no está disponible.');
    }

    const now = new Date();
    const [saved] = await this.database
      .insert(staffPresence)
      .values({ lastSeenAt: now, status: status ?? 'available', updatedAt: now, userId })
      .onConflictDoUpdate({
        set: {
          lastSeenAt: now,
          updatedAt: now,
          // A plain beat must not silently reset a declared status.
          ...(status === undefined ? {} : { status }),
        },
        target: staffPresence.userId,
      })
      .returning({
        lastSeenAt: staffPresence.lastSeenAt,
        status: staffPresence.status,
        statusMessage: staffPresence.statusMessage,
      });
    if (!saved) throw new Error('Presence upsert did not return a row');

    return { ...effectivePresence(saved, now), userId };
  }

  /**
   * Presence for the colleagues this user may already contact, and their own. Restricted to the
   * link policy on purpose: presence must not become a way to observe people you cannot reach.
   */
  public async listPresence(userId: string) {
    const contacts = await this.listContacts(userId);
    const visibleIds = [userId, ...contacts.map((contact) => contact.id)];

    const rows = await this.database
      .select({
        lastSeenAt: staffPresence.lastSeenAt,
        status: staffPresence.status,
        statusMessage: staffPresence.statusMessage,
        userId: staffPresence.userId,
      })
      .from(staffPresence)
      .where(inArray(staffPresence.userId, visibleIds));

    const now = new Date();
    const byUser = new Map(rows.map((row) => [row.userId, row]));
    return visibleIds.map((id) => ({
      ...effectivePresence(byUser.get(id) ?? null, now),
      userId: id,
    }));
  }

  // ---------------------------------------------------------------- retention

  /**
   * Messages live 30 days. Idempotent by construction: it deletes what is already past the cutoff,
   * so a retried run removes nothing extra. Conversations survive their messages, because losing
   * them would erase the fact that a conversation happened.
   */
  public async purgeExpiredMessages(retentionDays: number, context: ChatContext) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    return this.database.transaction(async (transaction) => {
      const removed = await transaction
        .delete(staffMessages)
        .where(lt(staffMessages.createdAt, cutoff))
        .returning({ id: staffMessages.id });

      if (removed.length > 0) {
        await new AuditService(new PostgresAuditSink(transaction)).record({
          action: 'chat.messages.purged',
          actor: { type: 'system' },
          after: { cutoff: cutoff.toISOString(), removed: removed.length, retentionDays },
          correlationId: context.correlationId,
          entityId: context.requestId,
          entityType: 'staff_message_collection',
          requestId: context.requestId,
          source: context.source,
        });
      }

      return { cutoff, removed: removed.length };
    });
  }
}
