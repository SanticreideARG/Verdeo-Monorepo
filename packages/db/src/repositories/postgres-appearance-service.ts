import { eq } from 'drizzle-orm';

import type { Database } from '../index.js';
import { userAppearance } from '../schema/index.js';

export interface Appearance {
  fontKey: string | null;
  textScale: string | null;
  theme: string | null;
}

const EMPTY: Appearance = { fontKey: null, textScale: null, theme: null };

/**
 * Tema, fuente y tamaño de texto de una persona.
 *
 * Igual de fino que el servicio de layout, y por la misma razón: qué temas y qué fuentes existen es
 * del catálogo del frontend. Validar acá sería una segunda copia de ese catálogo que hay que
 * mantener en sincronía, y el fallo que evitaría — una preferencia que nombra un tema que ya no
 * existe — se resuelve solo al renderizar, cayendo al de por defecto.
 *
 * `null` en un campo significa "el de por defecto", que no es lo mismo que no tener fila: alguien
 * puede elegir fuente sin elegir tema.
 */
export class PostgresAppearanceService {
  public constructor(private readonly database: Database) {}

  public async get(userId: string): Promise<Appearance> {
    const [row] = await this.database
      .select({
        fontKey: userAppearance.fontKey,
        textScale: userAppearance.textScale,
        theme: userAppearance.theme,
      })
      .from(userAppearance)
      .where(eq(userAppearance.userId, userId))
      .limit(1);
    return row ?? EMPTY;
  }

  public async save(userId: string, input: Partial<Appearance>): Promise<Appearance> {
    const current = await this.get(userId);
    // Un PATCH parcial: mandar sólo la fuente no debe borrar el tema elegido antes.
    const next: Appearance = {
      fontKey: input.fontKey === undefined ? current.fontKey : input.fontKey,
      textScale: input.textScale === undefined ? current.textScale : input.textScale,
      theme: input.theme === undefined ? current.theme : input.theme,
    };

    await this.database
      .insert(userAppearance)
      .values({ ...next, updatedAt: new Date(), userId })
      .onConflictDoUpdate({
        set: { ...next, updatedAt: new Date() },
        target: userAppearance.userId,
      });
    return next;
  }
}
