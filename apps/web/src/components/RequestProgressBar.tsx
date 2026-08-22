import { useEffect, useState, useSyncExternalStore } from 'react';

import { requestsInFlight, subscribeToRequestActivity } from '../lib/api.js';

/**
 * A thin bar under the top bar that runs while any request is in flight. It replaces the
 * full-screen loaders: the screen keeps whatever it was showing, so navigating between screens
 * never blanks the page.
 *
 * The bar lingers briefly after the last request so a fast response still reads as "something
 * happened" rather than a flicker, and it only appears after a short delay so an instant response
 * shows nothing at all.
 */
const APPEAR_AFTER_MS = 120;
const LINGER_MS = 260;

export function RequestProgressBar() {
  const busy = useSyncExternalStore(
    subscribeToRequestActivity,
    () => requestsInFlight() > 0,
    () => false,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (busy) {
      const timer = window.setTimeout(() => setVisible(true), APPEAR_AFTER_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setVisible(false), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [busy]);

  return (
    <div
      aria-hidden={!visible}
      className={`request-progress ${visible ? 'is-active' : ''}`}
      role="presentation"
    >
      <span />
    </div>
  );
}
