import { Fragment, useState } from 'react';

import { formatMoney, type StatsPeriodRow } from '../lib/operations.js';

type Totals = Omit<
  StatsPeriodRow,
  | 'closeAt'
  | 'customerCount'
  | 'cycleAlias'
  | 'methods'
  | 'openAt'
  | 'operatingSiteId'
  | 'operatingSiteName'
  | 'salesCycleId'
>;

const SUMMED = [
  'adjustmentMinor',
  'cancelledCount',
  'cancelledMinor',
  'cancelledToStockMinor',
  'discountMinor',
  'fromStockMinor',
  'grossMinor',
  'netMinor',
  'newCustomerCount',
  'orderCount',
  'paidMinor',
  'pendingMinor',
  'surchargeMinor',
  'units',
] as const satisfies readonly (keyof Totals)[];

export function totalsOf(rows: readonly StatsPeriodRow[]): Totals {
  const totals = Object.fromEntries(SUMMED.map((key) => [key, 0])) as Totals;
  for (const row of rows) for (const key of SUMMED) totals[key] += row[key];
  return totals;
}

/**
 * El análisis contable de Estadísticas (STATS_REDESIGN_PLAN.md): una fila por período y ciudad, con
 * el total abajo. Mismo criterio que el informe del período —sin cancelados ni pedidos de stock en
 * lo vendido—; los cancelados van aparte porque no suman. Tocar una fila abre el detalle por medio
 * de pago. Recargos, ajustes y ventas desde stock sólo aparecen como columna si alguna fila los tiene.
 */
export function StatsAccountingTable({
  currency,
  onDownload,
  rows,
}: {
  currency: string;
  onDownload: () => void;
  rows: StatsPeriodRow[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const money = (minor: number) => formatMoney(minor, currency);
  const totals = totalsOf(rows);
  const show = {
    adjustments: rows.some((row) => row.adjustmentMinor !== 0),
    fromStock: rows.some((row) => row.fromStockMinor !== 0),
    surcharges: rows.some((row) => row.surchargeMinor !== 0),
  };
  const columns = 8 + Number(show.adjustments) + Number(show.fromStock) + Number(show.surcharges);

  const cells = (row: Totals) => (
    <>
      <td className="is-number">{row.orderCount}</td>
      <td className="is-number">{money(row.grossMinor)}</td>
      <td className="is-number">{row.discountMinor ? money(-row.discountMinor) : '—'}</td>
      {show.surcharges ? <td className="is-number">{money(row.surchargeMinor)}</td> : null}
      {show.adjustments ? <td className="is-number">{money(row.adjustmentMinor)}</td> : null}
      <td className="is-number is-emphasis">{money(row.netMinor)}</td>
      <td className="is-number">
        {money(row.paidMinor)}
        <small>
          {row.netMinor > 0 ? ` ${Math.round((row.paidMinor / row.netMinor) * 100)}%` : ''}
        </small>
      </td>
      <td className={`is-number ${row.pendingMinor > 0 ? 'is-pending' : ''}`}>
        {money(row.pendingMinor)}
      </td>
      {show.fromStock ? <td className="is-number">{money(row.fromStockMinor)}</td> : null}
      <td className="is-number is-quiet">
        {row.cancelledCount ? `${money(row.cancelledMinor)} (${row.cancelledCount})` : '—'}
      </td>
    </>
  );

  return (
    <article className="operation-card stats-accounting">
      <header className="stats-accounting-head">
        <div>
          <h2 className="text-lg font-semibold text-forest">Análisis contable</h2>
          <p className="text-xs text-ink-muted">
            Por período y ciudad. Neto vendido sin cancelados ni pedidos de stock, igual que el
            informe del período. Los cancelados no suman.
          </p>
        </div>
        <button
          className="button button-secondary"
          disabled={rows.length === 0}
          onClick={onDownload}
          type="button"
        >
          Descargar Excel
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="data-table-empty mt-3">Sin pedidos con estos filtros.</p>
      ) : (
        <div className="data-table-scroll mt-3">
          <table className="data-table stats-accounting-table">
            <thead>
              <tr>
                <th>Período · ciudad</th>
                <th className="is-number">Pedidos</th>
                <th className="is-number">Bruto</th>
                <th className="is-number">Descuentos</th>
                {show.surcharges ? <th className="is-number">Recargos</th> : null}
                {show.adjustments ? <th className="is-number">Ajustes</th> : null}
                <th className="is-number">Neto vendido</th>
                <th className="is-number">Cobrado</th>
                <th className="is-number">Por cobrar</th>
                {show.fromStock ? <th className="is-number">Desde stock</th> : null}
                <th className="is-number">Cancelados</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.salesCycleId}|${row.operatingSiteId}`;
                const isOpen = open === key;
                return (
                  <Fragment key={key}>
                    <tr className={`stats-accounting-row ${isOpen ? 'is-open' : ''}`}>
                      <td>
                        <button
                          aria-expanded={isOpen}
                          className="stats-accounting-toggle"
                          onClick={() => setOpen(isOpen ? null : key)}
                          type="button"
                        >
                          <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                          <strong>{row.cycleAlias}</strong>
                          <span className="text-ink-muted"> · {row.operatingSiteName}</span>
                        </button>
                      </td>
                      {cells(row)}
                    </tr>
                    {isOpen ? (
                      <tr className="stats-accounting-detail">
                        <td colSpan={columns}>
                          <div className="stats-accounting-detail-grid">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Medio de pago</th>
                                  <th className="is-number">Vendido</th>
                                  <th className="is-number">Cobrado</th>
                                  <th className="is-number">Por cobrar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.methods.map((method) => (
                                  <tr key={method.method}>
                                    <td>
                                      {method.method}
                                      {method.isCash && !/efectivo/i.test(method.method) ? (
                                        <span className="text-ink-muted"> · efectivo</span>
                                      ) : null}
                                    </td>
                                    <td className="is-number">{money(method.totalMinor)}</td>
                                    <td className="is-number">{money(method.paidMinor)}</td>
                                    <td className="is-number">
                                      {money(method.totalMinor - method.paidMinor)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <dl className="stats-accounting-facts">
                              <div>
                                <dt>Clientes</dt>
                                <dd>
                                  {row.customerCount} · {row.newCustomerCount} nuevo
                                  {row.newCustomerCount === 1 ? '' : 's'}
                                </dd>
                              </div>
                              <div>
                                <dt>Unidades</dt>
                                <dd>{row.units}</dd>
                              </div>
                              <div>
                                <dt>Ticket promedio</dt>
                                <dd>
                                  {row.orderCount
                                    ? money(Math.round(row.netMinor / row.orderCount))
                                    : '—'}
                                </dd>
                              </div>
                              <div>
                                <dt>Cancelados a stock</dt>
                                <dd>{money(row.cancelledToStockMinor)}</dd>
                              </div>
                            </dl>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            {rows.length > 1 ? (
              <tfoot>
                <tr className="stats-accounting-total">
                  <td>Total</td>
                  {cells(totals)}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </article>
  );
}
