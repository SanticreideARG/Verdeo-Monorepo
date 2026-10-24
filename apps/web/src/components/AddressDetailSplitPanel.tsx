import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

interface Proposal {
  addressId: string;
  customerName: string;
  line1: string;
  line2: string;
  writtenAddress: string;
}

/**
 * "Separar el detalle" en Conciliar ubicaciones (2026-10-24).
 *
 * Los domicilios cargados antes de que hubiera dos líneas tienen todo junto: "Santa Rosa 31 Piso
 * 12 Dpto C". El sistema propone qué es calle y número y qué es detalle; se tildan los que están
 * bien y se aplican. La línea 1 es lo que se busca en el mapa, la línea 2 es para quien reparte.
 * También corrige los pedidos abiertos con esa dirección.
 */
export function AddressDetailSplitPanel({ canEdit }: { canEdit: boolean }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/address-locations/detail-proposals', {
      notify: false,
    });
    if (response.ok) setProposals(((await response.json()) as { items: Proposal[] }).items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (proposals.length === 0) return null;

  const chosen = proposals.filter((proposal) => !skipped.has(proposal.addressId));

  function toggle(addressId: string) {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(addressId)) next.delete(addressId);
      else next.add(addressId);
      return next;
    });
  }

  async function apply() {
    setWorking(true);
    setMessage('');
    const response = await apiRequest('/api/v1/address-locations/detail-split', {
      body: JSON.stringify({ addressIds: chosen.map((proposal) => proposal.addressId) }),
      method: 'POST',
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const result = (await response.json()) as { addresses: number; orders: number };
    showToast(
      `${String(result.addresses)} ${result.addresses === 1 ? 'domicilio separado' : 'domicilios separados'}${
        result.orders > 0
          ? ` y ${String(result.orders)} ${result.orders === 1 ? 'pedido corregido' : 'pedidos corregidos'}`
          : ''
      }.`,
    );
    setSkipped(new Set());
    await load();
  }

  return (
    <section className="address-split">
      <h2>3. Separar el detalle de la dirección</h2>
      <p className="text-sm text-ink-muted">
        Estos domicilios tienen el piso, el depto o el barrio mezclados con la calle. La propuesta
        deja en la primera línea la calle y el número (lo que se busca en el mapa) y pasa el resto a
        la segunda (para quien reparte). Destildá los que no estén bien.
      </p>
      {message ? (
        <p className="screen-notice" role="alert">
          {message}
        </p>
      ) : null}
      <ul>
        {proposals.map((proposal) => (
          <li key={proposal.addressId}>
            <label>
              <input
                checked={!skipped.has(proposal.addressId)}
                disabled={!canEdit}
                onChange={() => toggle(proposal.addressId)}
                type="checkbox"
              />
              <span>
                <strong>{proposal.customerName}</strong>
                <small>{proposal.writtenAddress}</small>
                <span className="address-split-result">
                  {proposal.line1} <em>· {proposal.line2}</em>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit ? (
        <button
          className="button button-primary"
          disabled={working || chosen.length === 0}
          onClick={() => void apply()}
          type="button"
        >
          {working ? 'Separando…' : `Separar ${String(chosen.length)}`}
        </button>
      ) : null}
    </section>
  );
}
