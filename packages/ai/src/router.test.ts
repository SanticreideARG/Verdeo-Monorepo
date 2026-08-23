import { describe, expect, it } from 'vitest';

import { NoProviderAvailableError, selectProvider } from './router.js';

const OPENAI = {
  adapterType: 'openai-compatible',
  defaultModel: 'gpt-4o-mini',
  enabled: true,
  key: 'openai',
};
const DISABLED = {
  adapterType: 'openai-compatible',
  defaultModel: 'gpt-4o-mini',
  enabled: false,
  key: 'disabled',
};
const UNKNOWN_ADAPTER = {
  adapterType: 'mystery',
  defaultModel: 'x',
  enabled: true,
  key: 'mystery',
};

describe('selectProvider', () => {
  it('picks the only enabled provider that covers the required capabilities', () => {
    const provider = selectProvider([OPENAI, DISABLED], ['TEXT']);
    expect(provider.key).toBe('openai');
  });

  it('ignores a disabled provider even if it would otherwise match', () => {
    expect(() => selectProvider([DISABLED], ['TEXT'])).toThrow(NoProviderAvailableError);
  });

  it('falls back to the default capability set for an unrecognized adapterType', () => {
    const provider = selectProvider([UNKNOWN_ADAPTER], ['TEXT']);
    expect(provider.key).toBe('mystery');
    expect(() => selectProvider([UNKNOWN_ADAPTER], ['STRUCTURED_OUTPUT'])).toThrow(
      NoProviderAvailableError,
    );
  });

  it('prefers the requested provider key when it qualifies', () => {
    const second = { ...OPENAI, key: 'openai-2' };
    const provider = selectProvider([OPENAI, second], ['TEXT'], 'openai-2');
    expect(provider.key).toBe('openai-2');
  });

  it('falls back to the first capable provider when the preferred key does not qualify', () => {
    const provider = selectProvider([OPENAI, DISABLED], ['TEXT'], 'disabled');
    expect(provider.key).toBe('openai');
  });

  it('throws NoProviderAvailableError when nothing covers a required capability', () => {
    expect(() => selectProvider([OPENAI], ['VISION'])).toThrow(NoProviderAvailableError);
  });
});
