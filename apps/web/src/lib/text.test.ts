import { describe, expect, it } from 'vitest';

import { foldText } from './text.js';

describe('foldText', () => {
  it('compara sin tildes, diéresis ni mayúsculas', () => {
    expect(foldText(' Neuquén Centro ')).toBe(foldText('neuquen centro'));
    expect(foldText('Núñez')).toBe('nunez');
    expect(foldText('PINGÜINO')).toBe('pinguino');
  });
});
