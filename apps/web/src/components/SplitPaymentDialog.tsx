import { useEffect, useRef, useState } from 'react';
import { isNoCharge } from '@verdeo/orders';

import { formatMoney } from '../lib/operations.js';
import type { PaymentChoice } from '../lib/paymentMethods.js';
import { isCashMethod } from '../lib/paymentStatus.js';

export interface PaymentPart {
  amountMinor: number;
  method: string;
  paidAt: string | null;
  position: number;
}

/** "Efectivo" y "Transferencia" del catálogo, para arrancar con lo que se pide siempre. */
export function defaultSplitMethods(methods: readonly PaymentChoice[]): [string, string] {
  const cash = methods.find((method) => isCashMethod(method.displayName, methods));
  const other = methods.find(
    (method) => method !== cash && /transfer/i.test(`${method.code} ${method.displayName}`),
  );
  return [cash?.displayName ?? 'Efectivo', other?.displayName ?? 'Transferencia'];
}

/** "$ 12.000" → 1200000. Acepta "12000", "12.000", "12000,50". */
export function parseMoneyInput(text: string): number | null {
  const clean = text.replace(/[^\d,.]/g, '');
  if (!clean) return null;
  // Con coma, la coma es el decimal y los puntos son miles; sin coma, los puntos son miles.
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean.replace(/\./g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/**
 * Dividir el pago de un pedido (2026-11-17): parte en un medio, el resto en otro. Se escribe el
 * monto de la primera parte; la segunda es lo que falta para el total, así nunca queda descuadrado.
 * Cada parte después tiene su propio tilde de cobrado.
 */
export function SplitPaymentDialog({
  currency,
  current,
  customerName,
  methods,
  onCancel,
  onSave,
  totalMinor,
}: {
  currency: string;
  /** Las partes que ya tiene, si ya estaba dividido. */
  current: readonly PaymentPart[];
  customerName: string;
  methods: readonly PaymentChoice[];
  onCancel: () => void;
  onSave: (parts: { amountMinor?: number; method: string }[]) => Promise<void> | void;
  totalMinor: number;
}) {
  const [defaultFirst, defaultSecond] = defaultSplitMethods(methods);
  const [first, setFirst] = useState(current[0]?.method ?? defaultFirst);
  const [second, setSecond] = useState(current[1]?.method ?? defaultSecond);
  const [amountText, setAmountText] = useState(
    current[0] ? String(current[0].amountMinor / 100) : '',
  );
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const amountMinor = parseMoneyInput(amountText);
  const restMinor = amountMinor === null ? null : totalMinor - amountMinor;
  const problem =
    amountMinor === null
      ? null
      : amountMinor <= 0
        ? 'El monto tiene que ser mayor a cero.'
        : restMinor !== null && restMinor <= 0
          ? `Tiene que ser menos que el total (${formatMoney(totalMinor, currency)}).`
          : first === second
            ? 'Elegí dos medios distintos.'
            : null;
  const ready = amountMinor !== null && problem === null;
  const options = methods.filter((method) => !isNoCharge(method.code));

  return (
    <div aria-label="Dividir el pago" aria-modal="true" className="modal-backdrop" role="dialog">
      <form
        className="modal-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || amountMinor === null) return;
          setWorking(true);
          void Promise.resolve(
            onSave([{ amountMinor, method: first }, { method: second }]),
          ).finally(() => setWorking(false));
        }}
      >
        <h2 className="text-xl font-semibold text-forest">Dividir el pago</h2>
        <p className="mt-1 text-sm text-ink-muted">
          El pedido de {customerName} suma {formatMoney(totalMinor, currency)}. Escribí cuánto va en
          el primer medio; el resto va en el segundo. Cada parte se tilda como cobrada por separado,
          y el pedido queda cobrado cuando están las dos.
        </p>
        <div className="split-payment-grid mt-4">
          <label className="field">
            Medio
            <select onChange={(event) => setFirst(event.target.value)} value={first}>
              {options.map((method) => (
                <option key={method.code} value={method.displayName}>
                  {method.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Monto
            <input
              inputMode="decimal"
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="Ej. 10000"
              ref={inputRef}
              required
              value={amountText}
            />
          </label>
          <label className="field">
            Resto en
            <select onChange={(event) => setSecond(event.target.value)} value={second}>
              {options.map((method) => (
                <option key={method.code} value={method.displayName}>
                  {method.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            Monto
            <output className="split-payment-rest">
              {restMinor !== null && restMinor > 0 ? formatMoney(restMinor, currency) : '—'}
            </output>
          </div>
        </div>
        {problem ? (
          <p className="screen-notice mt-3" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="form-actions mt-5">
          <button className="button button-primary" disabled={!ready || working} type="submit">
            {working ? 'Un momento…' : 'Guardar'}
          </button>
          <button
            className="button button-secondary"
            disabled={working}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
