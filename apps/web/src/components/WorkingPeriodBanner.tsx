import { useSyncExternalStore } from 'react';

import {
  parseWorkingPeriod,
  returnToCurrentPeriod,
  subscribeToWorkingPeriod,
  workingPeriodSnapshot,
} from '../lib/workingPeriod.js';

/** El aviso de que todo lo que se ve y se carga es de un período que no es el corriente. */
export function WorkingPeriodBanner() {
  const period = parseWorkingPeriod(
    useSyncExternalStore(subscribeToWorkingPeriod, workingPeriodSnapshot),
  );
  if (!period) return null;

  return (
    <div className="working-period-banner" role="status">
      <span>
        Trabajando en un período no corriente: <strong>{period.alias}</strong>
      </span>
      <button className="button button-secondary" onClick={returnToCurrentPeriod} type="button">
        Volver al corriente
      </button>
    </div>
  );
}
