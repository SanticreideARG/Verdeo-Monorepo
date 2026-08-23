/**
 * AI_CORE.md: "IA es una capa transversal" behind adapters, same reasoning as every other external
 * provider in this codebase (geocoding, WhatsApp) — app/task code only knows `AIProvider`, never a
 * concrete class, so the product keeps working (a task just answers "no hay proveedor disponible")
 * when nothing is configured or reachable.
 */
export type ModelCapability =
  | 'TEXT'
  | 'STRUCTURED_OUTPUT'
  | 'TOOL_CALLING'
  | 'VISION'
  | 'IMAGE_GENERATION'
  | 'LONG_CONTEXT'
  | 'REASONING';

export interface GenerateTextInput {
  maxTokens: number;
  model: string;
  systemPrompt: string;
  temperature: number;
  userPrompt: string;
}

export interface GenerateTextOutput {
  text: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface AIProvider {
  readonly key: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}

export class AIProviderError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AIProviderError';
  }
}
