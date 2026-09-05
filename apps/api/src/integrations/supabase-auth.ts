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
   * Una petición real al proyecto, para que Supabase no lo considere inactivo.
   *
   * Los proyectos gratuitos se pausan tras unos días sin actividad, y un proyecto pausado deja el
   * ingreso con Google sin funcionar y —como se vio— rompe el build del frontend, que lee sus
   * variables al compilar. Lo que Supabase cuenta es actividad de API: no hay nada que escribir,
   * porque los datos de Verdeo viven en Neon y acá no hay tabla ni clave de servicio.
   *
   * Se usa `/auth/v1/settings` porque responde con la sola clave publicable, sin sesión de nadie.
   * Devuelve el estado en vez de lanzar: quien llama necesita informarlo, no interrumpirse.
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
}
