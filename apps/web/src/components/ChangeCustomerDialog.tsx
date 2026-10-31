import { useEffect, useState, type FormEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage, type CustomerSummary } from '../lib/operations.js';

interface Address {
  active: boolean;
  id: string;
  label: string;
  primary: boolean;
  unit: string | null;
  writtenAddress: string;
}

const OTHER = 'otra';

/**
 * Cambiar el cliente de un pedido (2026-10-31).
 *
 * Para el pedido cargado a nombre de otro —un "nn", un stock—: pasa al cliente real con sus platos,
 * período, precio y cobro, sin cancelarlo ni cargarlo de nuevo. Se busca el cliente o se crea en el
 * momento, y se elige a qué domicilio suyo va; sin domicilio, se escribe la dirección.
 */
export function ChangeCustomerDialog({
  canCreateCustomer,
  currentCustomerId,
  onChanged,
  onClose,
  orderId,
}: {
  canCreateCustomer: boolean;
  currentCustomerId: string;
  onChanged: () => void;
  onClose: () => void;
  orderId: string;
}) {
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<CustomerSummary | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressChoice, setAddressChoice] = useState('');
  const [typedAddress, setTypedAddress] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (mode !== 'search' || chosen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void apiRequest(`/api/v1/customers?search=${encodeURIComponent(trimmed)}&limit=10`)
        .then(async (response) => {
          if (!active || !response.ok) return;
          const items = ((await response.json()) as { items: CustomerSummary[] }).items;
          setResults(items.filter((customer) => customer.id !== currentCustomerId));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [chosen, currentCustomerId, mode, query]);

  async function choose(customer: CustomerSummary) {
    setChosen(customer);
    setResults([]);
    setAddresses(null);
    const response = await apiRequest(`/api/v1/customers/${customer.id}`);
    const detail = response.ok ? ((await response.json()) as { addresses?: Address[] }) : {};
    const active = (detail.addresses ?? []).filter((address) => address.active);
    setAddresses(active);
    setAddressChoice((active.find((address) => address.primary) ?? active[0])?.id ?? OTHER);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setWorking(true);
    let customer = chosen;
    if (mode === 'new' && !customer) {
      const created = await apiRequest('/api/v1/customers', {
        body: JSON.stringify({
          displayName: newName.trim(),
          ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
        }),
        method: 'POST',
        notify: false,
      });
      if (!created.ok) {
        setWorking(false);
        setMessage(await errorMessage(created));
        return;
      }
      customer = (await created.json()) as CustomerSummary;
      setChosen(customer);
      setAddresses([]);
      setAddressChoice(OTHER);
    }
    if (!customer) {
      setWorking(false);
      return;
    }
    const response = await apiRequest(`/api/v1/orders/${orderId}`, {
      body: JSON.stringify({
        customerId: customer.id,
        ...(addressChoice && addressChoice !== OTHER
          ? { deliveryAddressId: addressChoice }
          : typedAddress.trim()
            ? { deliveryAddress: typedAddress.trim() }
            : {}),
        reason: 'Cambio de cliente',
      }),
      method: 'PATCH',
      notify: false,
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    onChanged();
  }

  const needsTyped = mode === 'new' || addressChoice === OTHER;
  const ready =
    (chosen !== null || (mode === 'new' && newName.trim().length > 0)) &&
    (!needsTyped || typedAddress.trim().length >= 4);

  return (
    <div aria-label="Cambiar cliente" aria-modal="true" className="modal-backdrop" role="dialog">
      <form className="modal-panel grid gap-3" onSubmit={(event) => void submit(event)}>
        <h2 className="text-lg font-semibold text-forest">Cambiar cliente</h2>
        <p className="text-sm text-ink-muted">
          El pedido pasa al otro cliente con sus platos, período, precio y cobro. Se entrega en el
          domicilio que elijas.
        </p>

        {chosen ? (
          <div className="change-customer-chosen">
            <strong>{chosen.displayName}</strong>
            {chosen.phone ? <span>{chosen.phone}</span> : null}
            {mode === 'search' ? (
              <button
                className="link-button"
                onClick={() => {
                  setChosen(null);
                  setAddresses(null);
                  setAddressChoice('');
                }}
                type="button"
              >
                Elegir otro
              </button>
            ) : null}
          </div>
        ) : mode === 'search' ? (
          <>
            <label className="field">
              Buscar cliente
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, teléfono o correo"
                value={query}
              />
            </label>
            {results.length > 0 ? (
              <ul className="change-customer-results">
                {results.map((customer) => (
                  <li key={customer.id}>
                    <button onClick={() => void choose(customer)} type="button">
                      <strong>{customer.displayName}</strong>
                      {customer.phone ? <span>{customer.phone}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim().length >= 2 && !searching ? (
              <p className="text-sm text-ink-muted">No hay clientes con eso.</p>
            ) : null}
            {canCreateCustomer ? (
              <button className="link-button" onClick={() => setMode('new')} type="button">
                No está: crear un cliente nuevo
              </button>
            ) : null}
          </>
        ) : (
          <>
            <label className="field">
              Nombre
              <input
                autoFocus
                onChange={(event) => setNewName(event.target.value)}
                required
                value={newName}
              />
            </label>
            <label className="field">
              WhatsApp
              <input
                inputMode="tel"
                onChange={(event) => setNewPhone(event.target.value)}
                value={newPhone}
              />
            </label>
            <button className="link-button" onClick={() => setMode('search')} type="button">
              Buscar uno existente
            </button>
          </>
        )}

        {chosen && addresses && addresses.length > 0 ? (
          <label className="field">
            Entregar en
            <select
              onChange={(event) => setAddressChoice(event.target.value)}
              value={addressChoice}
            >
              {addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label} — {address.writtenAddress}
                </option>
              ))}
              <option value={OTHER}>Otra dirección…</option>
            </select>
          </label>
        ) : null}
        {(chosen && addresses !== null && needsTyped) || (mode === 'new' && !chosen) ? (
          <label className="field">
            Dirección de entrega
            <input
              onChange={(event) => setTypedAddress(event.target.value)}
              placeholder="Calle, número y ciudad"
              required
              value={typedAddress}
            />
          </label>
        ) : null}

        {message ? (
          <p className="screen-notice" role="alert">
            {message}
          </p>
        ) : null}

        <div className="form-actions justify-end">
          <button className="button button-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button button-primary" disabled={working || !ready} type="submit">
            {working ? 'Cambiando…' : 'Cambiar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
