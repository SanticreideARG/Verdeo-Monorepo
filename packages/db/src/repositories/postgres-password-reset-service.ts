import { createHash, randomBytes } from 'node:crypto';

import { hashPassword, verifyPassword } from '@verdeo/auth';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import { passwordCredentials, passwordResetTokens, sessions, users } from '../schema/index.js';

/** Treinta minutos: alcanza para ir al correo, poco para que un enlace filtrado siga sirviendo. */
const TOKEN_TTL_MS = 30 * 60 * 1000;

/** Cuántos enlaces puede pedir una misma cuenta antes de tener que esperar. */
const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface PasswordResetRequestResult {
  displayName: string;
  email: string;
  expiresAt: Date;
  /** El token en crudo, para el correo. No se persiste ni se registra en logs. */
  token: string;
}

export class PasswordResetError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PasswordResetError';
  }
}

/**
 * Recuperación de contraseña del personal.
 *
 * Hasta ahora la única forma de recuperar una cuenta era que otra persona con `users.edit` la
 * reseteara. Eso deja a la primera cuenta de una instalación sin salida, y obliga a alguien a
 * conocer la contraseña de otro.
 */
export class PostgresPasswordResetService {
  public constructor(private readonly database: Database) {}

  /**
   * Emite un enlace para una dirección.
   *
   * Devuelve `null` cuando la dirección no tiene cuenta, cuando la cuenta no está activa, o cuando
   * pidió demasiadas veces. **Quien llama tiene que responder igual en los cuatro casos**: contestar
   * distinto según el caso convierte a este endpoint en una forma de averiguar quién trabaja acá.
   */
  public async request(email: string): Promise<PasswordResetRequestResult | null> {
    const emailNormalized = email.trim().toLowerCase();

    const [user] = await this.database
      .select({ displayName: users.displayName, id: users.id, status: users.status })
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);
    if (!user || user.status !== 'active') return null;

    const recent = await this.database
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          gt(passwordResetTokens.createdAt, new Date(Date.now() - RATE_WINDOW_MS)),
        ),
      )
      .limit(MAX_REQUESTS_PER_WINDOW);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) return null;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.database.insert(passwordResetTokens).values({
      expiresAt,
      tokenHash: hashToken(token),
      userId: user.id,
    });

    return { displayName: user.displayName, email: emailNormalized, expiresAt, token };
  }

  /**
   * Consume un enlace y deja la contraseña nueva.
   *
   * Todo en una transacción, y en este orden por una razón: marcar el token consumido en la misma
   * transacción que lo lee es lo que lo hace de un solo uso aunque lleguen dos pedidos a la vez —
   * el segundo encuentra `consumed_at` puesto.
   *
   * Además de escribir la contraseña:
   *
   * - **se levanta el bloqueo por intentos fallidos**, porque quedar afuera por eso es justamente
   *   una de las razones por las que alguien llega acá;
   * - **se revocan todas las sesiones abiertas de esa cuenta**. Si el motivo del cambio es que
   *   alguien más entró, dejarle la sesión viva vuelve inútil al cambio.
   */
  public async consume(token: string, newPassword: string): Promise<{ userId: string }> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(token)),
            isNull(passwordResetTokens.consumedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .for('update')
        .limit(1);
      if (!row) {
        throw new PasswordResetError(
          'Ese enlace ya se usó o venció. Pedí uno nuevo desde "Olvidé mi contraseña".',
        );
      }

      await transaction
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.id));

      // Los demás enlaces pendientes se gastan también: uno viejo en un correo no debe seguir
      // sirviendo después de que la cuenta ya se recuperó.
      await transaction
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.consumedAt)),
        );

      const passwordHash = await hashPassword(newPassword);
      await transaction
        .insert(passwordCredentials)
        .values({ passwordChangedAt: new Date(), passwordHash, userId: row.userId })
        .onConflictDoUpdate({
          set: {
            failedAttempts: 0,
            lockedUntil: null,
            passwordChangedAt: new Date(),
            passwordHash,
            updatedAt: new Date(),
          },
          target: passwordCredentials.userId,
        });

      await transaction
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));

      return { userId: row.userId };
    });
  }

  /**
   * Cambio de la propia contraseña, sabiendo la actual.
   *
   * Se pide la actual aunque la sesión ya esté abierta: es lo que separa "cambiar mi contraseña" de
   * "cualquiera que agarre esta pantalla desbloqueada se queda con la cuenta".
   *
   * Se revocan las otras sesiones pero **no la que hace el cambio**: echar a alguien de la pantalla
   * en la que acaba de elegir una contraseña nueva lo lleva a pensar que falló.
   */
  public async changeOwn(input: {
    currentPassword: string;
    exceptSessionId: string;
    newPassword: string;
    userId: string;
  }): Promise<void> {
    const [credential] = await this.database
      .select({ passwordHash: passwordCredentials.passwordHash })
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, input.userId))
      .limit(1);
    if (!credential || !(await verifyPassword(input.currentPassword, credential.passwordHash))) {
      throw new PasswordResetError('La contraseña actual no coincide.');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(passwordCredentials)
        .set({
          failedAttempts: 0,
          lockedUntil: null,
          passwordChangedAt: new Date(),
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(passwordCredentials.userId, input.userId));

      await transaction
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt),
            ne(sessions.id, input.exceptSessionId),
          ),
        );
    });
  }

  /** Borra los enlaces vencidos o gastados. Nada los necesita después. */
  public async purge(olderThan: Date): Promise<number> {
    const deleted = await this.database
      .delete(passwordResetTokens)
      .where(sql`${passwordResetTokens.createdAt} < ${olderThan}`)
      .returning({ id: passwordResetTokens.id });
    return deleted.length;
  }
}
