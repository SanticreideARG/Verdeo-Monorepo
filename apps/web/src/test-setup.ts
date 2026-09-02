import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library keeps mounted trees in the document between tests unless torn down, so a leaked
// component from one test would be found by the next one's queries.
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});
