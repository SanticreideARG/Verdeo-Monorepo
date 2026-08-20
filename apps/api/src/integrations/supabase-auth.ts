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
}
