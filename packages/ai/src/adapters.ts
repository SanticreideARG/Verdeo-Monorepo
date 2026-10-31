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

/** Una vuelta anterior de la conversación (el búho del Workbench). */
export interface ChatTurn {
  content: string;
  role: 'assistant' | 'user';
}

export interface GenerateTextInput {
  /**
   * The task expects a JSON object back. Providers that support a JSON mode are asked for it
   * explicitly rather than being trusted to follow the prompt — prompting alone is the weakest
   * link in structured extraction, and every OpenAI-compatible host worth using accepts the hint.
   */
  expectsJson?: boolean | undefined;
  /** Lo conversado antes de `userPrompt`, en orden. Vacío o ausente en una tarea de un solo paso. */
  history?: readonly ChatTurn[] | undefined;
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
