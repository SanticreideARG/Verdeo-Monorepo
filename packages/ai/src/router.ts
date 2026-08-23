import type { ModelCapability } from './adapters.js';

/**
 * AI_CORE.md "Router": task → capabilities → enabled model → policy → fallback. V1 implements
 * steps 1-4 as a pure function (capability match + enabled + optional preference) — quota/cost/
 * priority/timeout (steps 5-9) need real usage data this skeleton doesn't have yet, so they're not
 * modeled: every enabled, capable provider is currently `ALLOW`. Capabilities are a small static
 * table keyed by adapterType rather than admin-configurable per row, since V1 only ships one real
 * adapter shape (OpenAI-compatible chat completions) — worth revisiting once a second adapter
 * family (a native Anthropic/Gemini SDK, say) needs a different capability set for the same
 * adapterType.
 */
export const ADAPTER_CAPABILITIES: Record<string, readonly ModelCapability[]> = {
  'openai-compatible': ['TEXT', 'STRUCTURED_OUTPUT', 'TOOL_CALLING', 'LONG_CONTEXT'],
};
const DEFAULT_CAPABILITIES: readonly ModelCapability[] = ['TEXT'];

export interface RoutableProvider {
  adapterType: string;
  defaultModel: string;
  enabled: boolean;
  key: string;
}

export class NoProviderAvailableError extends Error {
  public constructor(requiredCapabilities: readonly ModelCapability[]) {
    super(`No hay un proveedor de IA habilitado que cubra: ${requiredCapabilities.join(', ')}.`);
    this.name = 'NoProviderAvailableError';
  }
}

export function capabilitiesFor(adapterType: string): readonly ModelCapability[] {
  return ADAPTER_CAPABILITIES[adapterType] ?? DEFAULT_CAPABILITIES;
}

export function selectProvider<T extends RoutableProvider>(
  providers: readonly T[],
  requiredCapabilities: readonly ModelCapability[],
  preferredProviderKey?: string | null,
): T {
  const capable = providers.filter(
    (provider) =>
      provider.enabled &&
      requiredCapabilities.every((capability) =>
        capabilitiesFor(provider.adapterType).includes(capability),
      ),
  );
  if (capable.length === 0) throw new NoProviderAvailableError(requiredCapabilities);

  const preferred = preferredProviderKey
    ? capable.find((provider) => provider.key === preferredProviderKey)
    : undefined;
  return preferred ?? capable[0]!;
}
