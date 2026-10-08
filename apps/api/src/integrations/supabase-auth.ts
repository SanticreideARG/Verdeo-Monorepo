import { z } from 'zod';

const SupabaseUserSchema = z.object({
  email: z.email(),
  email_confirmed_at: z.string().min(1).nullable().optional(),
  id: z.uuid(),
});

export interface VerifiedSupabaseIdentity {
  email: string;
  providerSubject: string;
}

type Fetcher = typeof fetch;

export class SupabaseAuthClient {
  private readonly baseUrl: string;

  public constructor(
    baseUrl: string,
    private readonly publishableKey: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async verifyAccessToken(accessToken: string): Promise<VerifiedSupabaseIdentity | null> {
    const response = await this.fetcher(`${this.baseUrl}/auth/v1/user`, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        apikey: this.publishableKey,
        authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok)
      throw new Error(`Supabase Auth validation failed with status ${response.status}`);

    const parsed = SupabaseUserSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.email_confirmed_at) return null;

    return {
      email: parsed.data.email,
      providerSubject: parsed.data.id,
    };
  }

  /**
   * ¿El proyecto responde? Un canario, no un keep-alive.
   *
   * Se usa `/auth/v1/settings` porque contesta con la sola clave publicable, sin sesión de nadie.
   * Devuelve el estado en vez de lanzar: quien llama necesita informarlo, no interrumpirse.
   *
   * **Esto no evita que el proyecto se pause**, y durante un tiempo creímos que sí. Ver `touch()`.
   */
  public async ping(): Promise<{ ok: boolean; detail: string }> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/auth/v1/settings`, {
        cache: 'no-store',
        headers: { accept: 'application/json', apikey: this.publishableKey },
        signal: AbortSignal.timeout(8_000),
      });
      return response.ok
        ? { detail: `HTTP ${response.status}`, ok: true }
        : { detail: `HTTP ${response.status}`, ok: false };
    } catch (error) {
      return { detail: error instanceof Error ? error.message : 'fallo desconocido', ok: false };
    }
  }

  /**
   * Una escritura real contra la base del proyecto, que es lo único que cuenta como actividad.
   *
   * Un proyecto gratuito se pausa tras unos días sin actividad, y pausado no sólo deja sin ingreso
   * por Google: rompe el build del frontend, que lee sus variables al compilar, y deja producción
   * congelada en el último commit que llegó a construirse.
   *
   * Durante un tiempo esto fue `ping()`, contra `/auth/v1/settings`. **No alcanzó**: el proyecto se
   * pausó igual, con el cron corriendo todos los días. Esa ruta la contesta la configuración de
   * Auth sin tocar Postgres, así que para Supabase el proyecto seguía sin actividad. Lo que cuenta
   * es llegar a la base, y la forma de llegar con la sola clave publicable es PostgREST.
   *
   * Es un `upsert` de una fila con id fijo y no un insert: mantener vivo el proyecto no puede
   * costar una tabla que crece para siempre. La fila queda con la fecha de la última corrida, que
   * de paso responde "¿esto está funcionando?" sin tener que buscar en los logs.
   *
   * Requiere la tabla `keep_alive` en el proyecto, con su política para `anon`. El SQL está en
   * `docs/12-development/VERCEL_DEPLOYMENT.md`.
   */
  public async touch(): Promise<{ ok: boolean; detail: string }> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/rest/v1/keep_alive`, {
        body: JSON.stringify({ id: 1, touched_at: new Date().toISOString() }),
        cache: 'no-store',
        headers: {
          apikey: this.publishableKey,
          /*
           * `Authorization` sólo con una clave que sea un JWT.
           *
           * Las claves nuevas de Supabase (`sb_publishable_…`) no son JWT, y mandarlas como
           * `Bearer` es lo que el gateway no espera de ellas: con `apikey` alcanza para actuar como
           * `anon`. Las claves anteriores sí son JWT y se mandan en las dos cabeceras, como siempre.
           * Sin saber cuál tiene el proyecto, esto funciona con las dos.
           */
          ...(this.publishableKey.startsWith('eyJ')
            ? { authorization: `Bearer ${this.publishableKey}` }
            : {}),
          'content-type': 'application/json',
          // Un upsert: sin esto, la segunda corrida choca con la clave primaria y devuelve 409.
          prefer: 'resolution=merge-duplicates,return=minimal',
        },
        method: 'POST',
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) return { detail: `HTTP ${response.status}`, ok: true };
      /*
       * El cuerpo del error va en el detalle. Los dos fallos probables acá —la tabla no existe, o
       * existe pero `anon` no la puede escribir— devuelven los dos un 4xx, y sin el mensaje de
       * PostgREST no hay forma de saber cuál de los dos es desde un log.
       */
      const detail = await response.text().catch(() => '');
      return { detail: `HTTP ${response.status} ${detail.slice(0, 200)}`.trim(), ok: false };
    } catch (error) {
      return { detail: error instanceof Error ? error.message : 'fallo desconocido', ok: false };
    }
  }
}
