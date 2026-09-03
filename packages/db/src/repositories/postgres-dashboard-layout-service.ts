import { eq } from 'drizzle-orm';

import type { Database } from '../index.js';
import { dashboardLayouts } from '../schema/index.js';

/**
 * A person's dashboard layout: which widgets, in what order.
 *
 * Deliberately thin. The server stores an ordered list of keys and validates nothing about them,
 * because what a widget is — its title, its permission, what it renders — lives in the frontend
 * catalogue. Validating keys here would mean a second copy of that catalogue that has to be kept in
 * step, and the failure it would prevent (a layout naming a widget that no longer exists) is
 * already handled by filtering on render.
 *
 * Absence of a row means "the default layout", so nothing needs seeding and a new user starts with
 * whatever the catalogue considers sensible.
 */
export class PostgresDashboardLayoutService {
  public constructor(private readonly database: Database) {}

  public async get(userId: string): Promise<string[] | null> {
    const [row] = await this.database
      .select({ widgets: dashboardLayouts.widgets })
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.userId, userId))
      .limit(1);
    return row?.widgets ?? null;
  }

  public async save(userId: string, widgets: readonly string[]): Promise<string[]> {
    const stored = [...widgets];
    await this.database
      .insert(dashboardLayouts)
      .values({ updatedAt: new Date(), userId, widgets: stored })
      .onConflictDoUpdate({
        set: { updatedAt: new Date(), widgets: stored },
        target: dashboardLayouts.userId,
      });
    return stored;
  }

  /** Back to the catalogue's default, by forgetting the row rather than writing one. */
  public async reset(userId: string): Promise<void> {
    await this.database.delete(dashboardLayouts).where(eq(dashboardLayouts.userId, userId));
  }
}
