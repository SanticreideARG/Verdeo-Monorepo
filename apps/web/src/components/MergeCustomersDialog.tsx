import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

interface MergeCandidate {
  customerIds: string[];
  customerNames: string[];
  reason: 'duplicate-contact' | 'same-name';
  value: string;
}

interface MergeResult {
  movedAddresses: number;
  movedIdentities: number;
  movedOrders: number;
  retiredIdentities: number;
  survivorId: string;
}

const REASON_LABEL: Record<MergeCandidate['reason'], string> = {
  'duplicate-contact': 'Mismo contacto',
  'same-name': 'Mismo nombre',
};

/** A candidate is only actionable as a pair: which record survives has to be an explicit choice. */
function pairsOf(candidate: MergeCandidate): { id: string; name: string }[] {
  return candidate.customerIds.map((id, index) => ({
    id,
    name: candidate.customerNames[index] ?? 'Cliente sin nombre',
  }));
}

export function MergeCustomersDialog({
  onClose,
  onMerged,
}: {
  onClose: () => void;
  onMerged: () => void;
}) {
  const [candidates, setCandidates] = useState<MergeCandidate[] | null>(null);
  const [error, setError] = useState('');
  const [survivorId, setSurvivorId] = useState('');
  const [mergedId, setMergedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);

  const load = useCallback(async () => {
    setError('');
    const response = await apiRequest('/api/v1/customers/merge-candidates');
    if (!response.ok) {
      setError(await errorMessage(response));
      setCandidates([]);
      return;
    }
    const body = (await response.json()) as { items: MergeCandidate[] };
    setCandidates(body.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!survivorId || !mergedId) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest('/api/v1/customers/merge', {
        body: JSON.stringify({ mergedId, survivorId }),
        method: 'POST',
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      setResult((await response.json()) as MergeResult);
      setSurvivorId('');
      setMergedId('');
      await load();
      onMerged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-import-backdrop">
      <section aria-modal="true" className="crm-import-dialog" role="dialog">
        <header className="crm-dialog-heading">
          <div>
            <h2>Fusionar clientes duplicados</h2>
            <p>
              Elegí cuál ficha se conserva. Los pedidos, domicilios y contactos de la otra se mueven
              a esa, y la ficha fusionada queda archivada apuntando a la que conservás.
            </p>
          </div>
          <button className="button button-ghost" onClick={onClose} type="button">
            Cerrar
          </button>
        </header>

        {error ? (
          <p className="crm-message" role="alert">
            {error}
          </p>
        ) : null}

        {result ? (
          <p className="crm-message" role="status">
            Listo: {result.movedOrders} pedidos, {result.movedAddresses} domicilios y{' '}
            {result.movedIdentities} contactos movidos.
            {result.retiredIdentities > 0
              ? ` ${result.retiredIdentities} contacto(s) duplicado(s) quedaron archivados.`
              : ''}
          </p>
        ) : null}

        {candidates === null ? (
          <p className="text-ink-muted">Buscando fichas parecidas…</p>
        ) : candidates.length === 0 ? (
          <p className="text-ink-muted">
            No encontramos fichas que parezcan la misma persona. Podés fusionar igual pegando los
            dos identificadores abajo.
          </p>
        ) : (
          <ul className="crm-merge-candidates">
            {candidates.map((candidate) => (
              <li key={`${candidate.reason}:${candidate.value}`}>
                <p className="crm-merge-candidate-title">
                  <span className="badge">{REASON_LABEL[candidate.reason]}</span> {candidate.value}
                </p>
                <div className="crm-merge-candidate-people">
                  {pairsOf(candidate).map((person) => (
                    <div key={person.id}>
                      <span>{person.name}</span>
                      <button
                        className="button button-ghost"
                        onClick={() => setSurvivorId(person.id)}
                        type="button"
                      >
                        Conservar esta
                      </button>
                      <button
                        className="button button-ghost"
                        onClick={() => setMergedId(person.id)}
                        type="button"
                      >
                        Fusionar esta
                      </button>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="crm-merge-selection">
          <label>
            Ficha que se conserva
            <input
              onChange={(event) => setSurvivorId(event.target.value.trim())}
              placeholder="ID del cliente"
              value={survivorId}
            />
          </label>
          <label>
            Ficha que se fusiona
            <input
              onChange={(event) => setMergedId(event.target.value.trim())}
              placeholder="ID del cliente"
              value={mergedId}
            />
          </label>
        </div>

        <footer className="crm-dialog-actions">
          <button className="button button-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={busy || !survivorId || !mergedId || survivorId === mergedId}
            onClick={() => void submit()}
            type="button"
          >
            {busy ? 'Fusionando…' : 'Fusionar'}
          </button>
        </footer>
      </section>
    </div>
  );
}
