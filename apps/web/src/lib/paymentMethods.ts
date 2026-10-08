import { useEffect, useState } from 'react';

import { apiRequest } from './api.js';

export interface PaymentChoice {
  code: string;
  displayName: string;
}

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * El medio de pago, dicho como lo parametrizó el equipo.
 *
 * El campo del pedido es texto, y durante un tiempo cada puerta de entrada guardó una cosa
 * distinta: la web pública el nombre ("Transferencia"), el alta del equipo el código
 * ("transfer"), y la importación de emails "A confirmar", que no es un medio de pago. Al leer se
 * reconcilian los dos primeros —por código o por nombre— y lo que no calza se muestra tal cual,
 * sin inventar: es lo que alguien escribió y conviene verlo para corregirlo.
 */
export function paymentMethodLabel(value: string, methods: readonly PaymentChoice[]): string {
  if (!value.trim()) return '—';
  const key = normalize(value);
  const found = methods.find(
    (method) => normalize(method.code) === key || normalize(method.displayName) === key,
  );
  return found ? found.displayName : value;
}

/** Si el valor del pedido es uno de los parametrizados. */
export function isParametrized(value: string, methods: readonly PaymentChoice[]): boolean {
  const key = normalize(value);
  return methods.some(
    (method) => normalize(method.code) === key || normalize(method.displayName) === key,
  );
}

/**
 * Las opciones de un selector de medio de pago: los parametrizados, y —si el pedido trae otro
 * valor— ese valor al principio. Sin eso, abrir un pedido viejo y guardarlo por otro motivo le
 * cambiaría el medio de pago al primero de la lista sin que nadie lo haya tocado.
 */
export function paymentOptions(
  current: string,
  methods: readonly PaymentChoice[],
): { label: string; value: string }[] {
  const options = methods.map((method) => ({
    label: method.displayName,
    value: method.displayName,
  }));
  if (current.trim() && !isParametrized(current, methods)) {
    return [{ label: `${current} (sin parametrizar)`, value: current }, ...options];
  }
  return options;
}

/** El valor del selector para un pedido: el nombre parametrizado si el guardado es su código. */
export function paymentSelectValue(current: string, methods: readonly PaymentChoice[]): string {
  const key = normalize(current);
  const found = methods.find(
    (method) => normalize(method.code) === key || normalize(method.displayName) === key,
  );
  return found ? found.displayName : current;
}

/**
 * Los medios de pago activos. Se piden al endpoint público porque no hace falta ningún permiso
 * para verlos (no hay nada sensible) y el equipo de cocina o reparto también los necesita para
 * leer un pedido; con `payments.read` se perdía la etiqueta para quien no lo tiene.
 */
export function usePaymentMethods(): PaymentChoice[] {
  const [methods, setMethods] = useState<PaymentChoice[]>([]);
  useEffect(() => {
    let cancelled = false;
    void apiRequest('/api/v1/public/payment-methods', { notify: false })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          items: (PaymentChoice & { sortOrder: number })[];
        };
        setMethods([...body.items].sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return methods;
}
