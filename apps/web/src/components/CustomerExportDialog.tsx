import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

interface ExportColumn {
  group: string;
  key: string;
  label: string;
}

interface CustomerExportDialogProps {
  onClose: () => void;
  /** The directory's live filters, so the export matches what the operator is looking at. */
  search: string;
  status?: string | undefined;
}

/**
 * "Exportar a Excel" with a column picker. The column catalog comes from the API rather than being
 * listed here, so the dashboard can never offer a column the export does not know how to render.
 *
 * The file is fetched as a blob instead of navigating to the URL: the export endpoint needs the
 * session cookie *and* the operator's scope header, which a plain link navigation would not carry.
 */
export function CustomerExportDialog({ onClose, search, status }: CustomerExportDialogProps) {
  const [columns, setColumns] = useState<ExportColumn[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void apiRequest('/api/v1/customers/export/columns')
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response));
        const body = (await response.json()) as { defaults: string[]; items: ExportColumn[] };
        setColumns(body.items);
        setSelected(body.defaults);
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'No pudimos cargar las columnas.'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function runExport() {
    if (selected.length === 0) {
      setMessage('Elegí al menos una columna.');
      return;
    }
    setExporting(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ columns: selected.join(',') });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const response = await apiRequest(`/api/v1/customers/export?${params.toString()}`);
      if (!response.ok) throw new Error(await errorMessage(response));

      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'verdeo-clientes.xlsx';
      link.click();
      // Revoking immediately would race the download in some browsers; a tick is enough.
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);

      showToast('Exportación lista.');
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos generar el archivo.');
    } finally {
      setExporting(false);
    }
  }

  const groups = [...new Set(columns.map((column) => column.group))];

  return (
    <div className="crm-import-backdrop" onClick={onClose} role="presentation">
      <div
        aria-labelledby="customer-export-title"
        aria-modal="true"
        className="crm-import-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 id="customer-export-title">Exportar clientes a Excel</h2>
        <p className="crm-import-intro">
          Se exportan los clientes que coinciden con el filtro actual
          {search ? ` ("${search}")` : ''}. Elegí las columnas que querés incluir.
        </p>

        {loading ? (
          <p className="mt-4 text-ink-muted">Cargando columnas…</p>
        ) : (
          <div className="export-columns">
            {groups.map((group) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                {columns
                  .filter((column) => column.group === group)
                  .map((column) => (
                    <label key={column.key}>
                      <input
                        checked={selected.includes(column.key)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, column.key]
                              : current.filter((key) => key !== column.key),
                          )
                        }
                        type="checkbox"
                      />
                      {column.label}
                    </label>
                  ))}
              </fieldset>
            ))}
          </div>
        )}

        {message ? (
          <p className="crm-message mt-4" role="alert">
            {message}
          </p>
        ) : null}

        <div className="export-actions">
          <button
            className="button button-secondary"
            onClick={() => setSelected(columns.map((column) => column.key))}
            type="button"
          >
            Todas
          </button>
          <button className="button button-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={exporting || loading}
            onClick={() => void runExport()}
            type="button"
          >
            {exporting ? 'Generando…' : 'Descargar .xlsx'}
          </button>
        </div>
      </div>
    </div>
  );
}
