import { formatMoney } from '../lib/operations.js';

export interface RouteMoney {
  cashMinor?: number;
  totalMinor?: number;
  transferMinor?: number;
  transferPaidMinor?: number;
  transferUnpaidMinor?: number;
}

/**
 * El total de la ruta partido en efectivo y transferencia, y las transferencias en cobradas y sin
 * cobrar (2026-10-22). Lo mismo en la hoja de quien reparte y en Rutas: la plata que vuelve en mano y
 * la que hay que ir a buscar al banco.
 */
export function RouteMoneyBreakdown({ money }: { money: RouteMoney }) {
  if (!money.totalMinor) return null;
  return (
    <dl className="route-money">
      <div>
        <dt>Total</dt>
        <dd>{formatMoney(money.totalMinor, 'ARS')}</dd>
      </div>
      <div>
        <dt>Efectivo</dt>
        <dd>{formatMoney(money.cashMinor ?? 0, 'ARS')}</dd>
      </div>
      <div>
        <dt>Transferencia</dt>
        <dd>
          {formatMoney(money.transferMinor ?? 0, 'ARS')}
          {money.transferMinor ? (
            <small>
              cobradas {formatMoney(money.transferPaidMinor ?? 0, 'ARS')} · sin cobrar{' '}
              {formatMoney(money.transferUnpaidMinor ?? 0, 'ARS')}
            </small>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}
