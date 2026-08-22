import { asc, eq, sql } from 'drizzle-orm';

import { AuditService, type JsonValue } from '@verdeo/audit';

import type { Database } from '../index.js';
import { geographicZones, operatingSiteOrderCounters, operatingSites } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export interface GeographyContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export interface OperatingSiteInput {
  active: boolean;
  coverImageUrl?: string | undefined;
  displayName: string;
  orderPrefix: string;
  publicEmail?: string | undefined;
  publicPhone?: string | undefined;
  publicWhatsapp?: string | undefined;
  slug: string;
  sortOrder: number;
  timezone: string;
}

export interface OperatingSiteUpdateInput {
  active?: boolean | undefined;
  coverImageUrl?: string | null | undefined;
  displayName?: string | undefined;
  orderPrefix?: string | undefined;
  publicEmail?: string | null | undefined;
  publicPhone?: string | null | undefined;
  publicWhatsapp?: string | null | undefined;
  slug?: string | undefined;
  sortOrder?: number | undefined;
  timezone?: string | undefined;
}

export interface GeographicZoneInput {
  active: boolean;
  coverImageUrl?: string | undefined;
  coverageDescription?: string | undefined;
  displayName: string;
  operatingSiteId: string;
  publicPhoneOverride?: string | undefined;
  publicWhatsappOverride?: string | undefined;
  slug: string;
  sortOrder: number;
}

export interface GeographicZoneUpdateInput {
  active?: boolean | undefined;
  coverImageUrl?: string | null | undefined;
  coverageDescription?: string | null | undefined;
  displayName?: string | undefined;
  publicPhoneOverride?: string | null | undefined;
  publicWhatsappOverride?: string | null | undefined;
  slug?: string | undefined;
  sortOrder?: number | undefined;
}

export class OperatingSiteNotFoundError extends Error {
  public constructor() {
    super('La operación indicada no existe.');
    this.name = 'OperatingSiteNotFoundError';
  }
}

export class GeographicZoneNotFoundError extends Error {
  public constructor() {
    super('La zona indicada no existe.');
    this.name = 'GeographicZoneNotFoundError';
  }
}

export class GeographyConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GeographyConflictError';
  }
}

const siteColumns = {
  active: operatingSites.active,
  coverImageUrl: operatingSites.coverImageUrl,
  createdAt: operatingSites.createdAt,
  displayName: operatingSites.displayName,
  id: operatingSites.id,
  orderPrefix: operatingSites.orderPrefix,
  publicEmail: operatingSites.publicEmail,
  publicPhone: operatingSites.publicPhone,
  publicWhatsapp: operatingSites.publicWhatsapp,
  slug: operatingSites.slug,
  sortOrder: operatingSites.sortOrder,
  timezone: operatingSites.timezone,
  updatedAt: operatingSites.updatedAt,
};

const zoneColumns = {
  active: geographicZones.active,
  coverImageUrl: geographicZones.coverImageUrl,
  coverageDescription: geographicZones.coverageDescription,
  createdAt: geographicZones.createdAt,
  displayName: geographicZones.displayName,
  id: geographicZones.id,
  operatingSiteId: geographicZones.operatingSiteId,
  publicPhoneOverride: geographicZones.publicPhoneOverride,
  publicWhatsappOverride: geographicZones.publicWhatsappOverride,
  slug: geographicZones.slug,
  sortOrder: geographicZones.sortOrder,
  updatedAt: geographicZones.updatedAt,
};

// Audit payloads carry business fields only. Timestamps and surrogate keys stay out of the diff.
function siteAuditFields(row: {
  active: boolean;
  displayName: string;
  orderPrefix: string;
  slug: string;
  sortOrder: number;
  timezone: string;
}): JsonValue {
  return {
    active: row.active,
    displayName: row.displayName,
    orderPrefix: row.orderPrefix,
    slug: row.slug,
    sortOrder: row.sortOrder,
    timezone: row.timezone,
  };
}

function zoneAuditFields(row: {
  active: boolean;
  displayName: string;
  operatingSiteId: string;
  slug: string;
  sortOrder: number;
}): JsonValue {
  return {
    active: row.active,
    displayName: row.displayName,
    operatingSiteId: row.operatingSiteId,
    slug: row.slug,
    sortOrder: row.sortOrder,
  };
}

// Postgres reports the offended constraint; the operator needs the business meaning, not the index name.
function translateConstraintViolation(error: unknown): never {
  const constraint =
    typeof error === 'object' && error !== null && 'constraint' in error
      ? String((error as { constraint?: unknown }).constraint)
      : '';

  if (constraint === 'operating_sites_slug_unique')
    throw new GeographyConflictError('Ya existe una operación con ese identificador.');
  if (constraint === 'operating_sites_order_prefix_unique')
    throw new GeographyConflictError('Ya existe una operación con ese prefijo de pedidos.');
  if (constraint === 'geographic_zones_site_slug_unique')
    throw new GeographyConflictError('Ya existe una zona con ese identificador en la operación.');

  throw error;
}

export class PostgresGeographyService {
  public constructor(private readonly database: Database) {}

  public async listSites() {
    const rows = await this.database
      .select({
        ...siteColumns,
        zoneCount: sql<number>`(
          select count(*)::int from ${geographicZones}
          where ${geographicZones.operatingSiteId} = ${operatingSites.id}
        )`,
      })
      .from(operatingSites)
      .orderBy(asc(operatingSites.sortOrder), asc(operatingSites.displayName));

    return rows;
  }

  public async listZones(operatingSiteId: string) {
    const [site] = await this.database
      .select({ id: operatingSites.id })
      .from(operatingSites)
      .where(eq(operatingSites.id, operatingSiteId))
      .limit(1);

    if (!site) throw new OperatingSiteNotFoundError();

    return this.database
      .select(zoneColumns)
      .from(geographicZones)
      .where(eq(geographicZones.operatingSiteId, operatingSiteId))
      .orderBy(asc(geographicZones.sortOrder), asc(geographicZones.displayName));
  }

  public async createSite(input: OperatingSiteInput, context: GeographyContext) {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(operatingSites)
        .values({
          active: input.active,
          coverImageUrl: input.coverImageUrl ?? null,
          displayName: input.displayName,
          orderPrefix: input.orderPrefix,
          publicEmail: input.publicEmail ?? null,
          publicPhone: input.publicPhone ?? null,
          publicWhatsapp: input.publicWhatsapp ?? null,
          slug: input.slug,
          sortOrder: input.sortOrder,
          timezone: input.timezone,
        })
        .returning(siteColumns)
        .catch(translateConstraintViolation);

      if (!created) throw new Error('Operating site insert returned no row');

      await new AuditService(new PostgresAuditSink(transaction)).record({
        action: 'operating_site.created',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: siteAuditFields(created),
        correlationId: context.correlationId,
        entityId: created.id,
        entityType: 'operating_site',
        requestId: context.requestId,
        source: context.source,
      });

      return { ...created, zoneCount: 0 };
    });
  }

  public async updateSite(id: string, input: OperatingSiteUpdateInput, context: GeographyContext) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction
        .select(siteColumns)
        .from(operatingSites)
        .where(eq(operatingSites.id, id))
        .for('update')
        .limit(1);

      if (!before) throw new OperatingSiteNotFoundError();

      // The prefix becomes part of already communicated order numbers, so it freezes once the
      // operation has emitted any. The counter is introduced by GEO-3 and starts at zero.
      if (input.orderPrefix !== undefined && input.orderPrefix !== before.orderPrefix) {
        const emitted = await transaction
          .select({ lastOrderNumber: operatingSiteOrderCounters.lastOrderNumber })
          .from(operatingSiteOrderCounters)
          .where(eq(operatingSiteOrderCounters.operatingSiteId, id))
          .limit(1);

        if ((emitted[0]?.lastOrderNumber ?? 0) > 0)
          throw new GeographyConflictError(
            'No se puede cambiar el prefijo: la operación ya emitió pedidos con el prefijo actual.',
          );
      }

      const [updated] = await transaction
        .update(operatingSites)
        .set({
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.coverImageUrl === undefined ? {} : { coverImageUrl: input.coverImageUrl }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.orderPrefix === undefined ? {} : { orderPrefix: input.orderPrefix }),
          ...(input.publicEmail === undefined ? {} : { publicEmail: input.publicEmail }),
          ...(input.publicPhone === undefined ? {} : { publicPhone: input.publicPhone }),
          ...(input.publicWhatsapp === undefined ? {} : { publicWhatsapp: input.publicWhatsapp }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          updatedAt: new Date(),
        })
        .where(eq(operatingSites.id, id))
        .returning(siteColumns)
        .catch(translateConstraintViolation);

      if (!updated) throw new OperatingSiteNotFoundError();

      await new AuditService(new PostgresAuditSink(transaction)).record({
        action: 'operating_site.updated',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: siteAuditFields(updated),
        before: siteAuditFields(before),
        correlationId: context.correlationId,
        entityId: id,
        entityType: 'operating_site',
        requestId: context.requestId,
        source: context.source,
      });

      const counted = await transaction
        .select({ zoneCount: sql<number>`count(*)::int` })
        .from(geographicZones)
        .where(eq(geographicZones.operatingSiteId, id));

      return { ...updated, zoneCount: counted[0]?.zoneCount ?? 0 };
    });
  }

  public async createZone(input: GeographicZoneInput, context: GeographyContext) {
    return this.database.transaction(async (transaction) => {
      const [site] = await transaction
        .select({ id: operatingSites.id })
        .from(operatingSites)
        .where(eq(operatingSites.id, input.operatingSiteId))
        .limit(1);

      if (!site) throw new OperatingSiteNotFoundError();

      const [created] = await transaction
        .insert(geographicZones)
        .values({
          active: input.active,
          coverImageUrl: input.coverImageUrl ?? null,
          coverageDescription: input.coverageDescription ?? null,
          displayName: input.displayName,
          operatingSiteId: input.operatingSiteId,
          publicPhoneOverride: input.publicPhoneOverride ?? null,
          publicWhatsappOverride: input.publicWhatsappOverride ?? null,
          slug: input.slug,
          sortOrder: input.sortOrder,
        })
        .returning(zoneColumns)
        .catch(translateConstraintViolation);

      if (!created) throw new Error('Geographic zone insert returned no row');

      await new AuditService(new PostgresAuditSink(transaction)).record({
        action: 'geographic_zone.created',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: zoneAuditFields(created),
        correlationId: context.correlationId,
        entityId: created.id,
        entityType: 'geographic_zone',
        requestId: context.requestId,
        source: context.source,
      });

      return created;
    });
  }

  public async updateZone(id: string, input: GeographicZoneUpdateInput, context: GeographyContext) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction
        .select(zoneColumns)
        .from(geographicZones)
        .where(eq(geographicZones.id, id))
        .for('update')
        .limit(1);

      if (!before) throw new GeographicZoneNotFoundError();

      const [updated] = await transaction
        .update(geographicZones)
        .set({
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.coverImageUrl === undefined ? {} : { coverImageUrl: input.coverImageUrl }),
          ...(input.coverageDescription === undefined
            ? {}
            : { coverageDescription: input.coverageDescription }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.publicPhoneOverride === undefined
            ? {}
            : { publicPhoneOverride: input.publicPhoneOverride }),
          ...(input.publicWhatsappOverride === undefined
            ? {}
            : { publicWhatsappOverride: input.publicWhatsappOverride }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          updatedAt: new Date(),
        })
        .where(eq(geographicZones.id, id))
        .returning(zoneColumns)
        .catch(translateConstraintViolation);

      if (!updated) throw new GeographicZoneNotFoundError();

      await new AuditService(new PostgresAuditSink(transaction)).record({
        action: 'geographic_zone.updated',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: zoneAuditFields(updated),
        before: zoneAuditFields(before),
        correlationId: context.correlationId,
        entityId: id,
        entityType: 'geographic_zone',
        requestId: context.requestId,
        source: context.source,
      });

      return updated;
    });
  }
}
