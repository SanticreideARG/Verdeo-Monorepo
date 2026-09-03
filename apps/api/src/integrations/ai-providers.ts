import {
  AIProviderError,
  type AIProvider,
  type GenerateTextInput,
  type GenerateTextOutput,
} from '@verdeo/ai';

/**
 * Chat Completions is the one API shape OpenAI, DeepSeek, Gemini (through its OpenAI-compatible
 * endpoint), Groq and most self-hosted models all speak, so one implementation covers the `adapterType: 'openai-compatible'` row a
 * superadmin can point at any of them just by changing `baseUrl` — this is the "adaptador genérico"
 * AI_CORE.md asks for, not a name for OpenAI specifically. `apiKey`/`baseUrl` come from the
 * decrypted `ai_provider_configs` row, never from env — each configured provider is independent.
 */
export class OpenAICompatibleProvider implements AIProvider {
  public constructor(
    public readonly key: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  public async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: input.maxTokens,
        messages: [
          { content: input.systemPrompt, role: 'system' },
          { content: input.userPrompt, role: 'user' },
        ],
        model: input.model,
        // Only sent when the task actually wants JSON: a host that does not recognise the field
        // would otherwise reject every plain-text request over an option it never needed.
        ...(input.expectsJson ? { response_format: { type: 'json_object' } } : {}),
        temperature: input.temperature,
      }),
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIProviderError(`AI provider request failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { completion_tokens?: number; prompt_tokens?: number };
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AIProviderError('AI provider response had no content');
    return {
      text,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? null,
        outputTokens: payload.usage?.completion_tokens ?? null,
      },
    };
  }
}
