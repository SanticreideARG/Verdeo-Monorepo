/** Una fila de la conciliación, como la manda el servidor (`CustomerImportRowSchema`). */
export interface CustomerImportRow {
  address: string | null;
  displayName: string;
  match: {
    customerId: string;
    displayName: string;
    matchedBy: 'email' | 'phone' | 'whatsapp';
    status: string;
  } | null;
  neighborhood: string | null;
  notes: string | null;
  phone: string | null;
  repeatedOfRow: number | null;
  rowNumber: number;
  status: 'existing' | 'new' | 'repeated';
}

const STATUS_LABELS: Record<CustomerImportRow['status'], string> = {
  existing: 'Ya existe',
  new: 'Nuevo',
  repeated: 'Repetido',
};

const MATCH_LABELS: Record<NonNullable<CustomerImportRow['match']>['matchedBy'], string> = {
  email: 'el correo',
  phone: 'el teléfono',
  whatsapp: 'el WhatsApp',
};

function why(row: CustomerImportRow): string | null {
  if (row.match) {
    const archived = row.match.status !== 'active' ? ' (archivado)' : '';
    return `Coincide ${MATCH_LABELS[row.match.matchedBy]} con ${row.match.displayName}${archived}.`;
  }
  if (row.repeatedOfRow) return `Mismo contacto que la fila ${String(row.repeatedOfRow)}.`;
  return null;
}

/**
 * La conciliación de una planilla de clientes: qué se va a crear y qué no, fila por fila.
 *
 * Se muestra antes de importar —para revisar que la planilla se leyó bien: nombre, teléfono,
 * dirección, barrio, forma de pago— y después, con lo que efectivamente se creó y lo que se
 * salteó. Un cliente que ya existe no se crea de nuevo: se dice con quién coincide.
 */
export function ImportReconciliation({
  done = false,
  rows,
}: {
  done?: boolean;
  rows: readonly CustomerImportRow[];
}) {
  const count = (status: CustomerImportRow['status']) =>
    rows.filter((row) => row.status === status).length;
  const nuevos = count('new');
  const existentes = count('existing');
  const repetidos = count('repeated');

  return (
    <section className="crm-import-review" aria-live="polite">
      <p className="crm-import-summary">
        <strong>
          {done
            ? `Se importaron ${String(nuevos)} de ${String(rows.length)}.`
            : `${String(nuevos)} de ${String(rows.length)} se van a crear.`}
        </strong>{' '}
        {existentes > 0 ? `${String(existentes)} ya existen. ` : ''}
        {repetidos > 0 ? `${String(repetidos)} repetidos en la planilla. ` : ''}
        {existentes + repetidos > 0 ? (done ? 'Se saltearon.' : 'No se van a crear.') : ''}
      </p>
      <ol className="crm-import-rows">
        {rows.map((row) => (
          <li className={`crm-import-row is-${row.status}`} key={row.rowNumber}>
            <div className="crm-import-row-head">
              <span className="crm-import-row-number">Fila {row.rowNumber}</span>
              <strong>{row.displayName}</strong>
              <span className={`crm-import-chip is-${row.status}`}>
                {done && row.status === 'new' ? 'Creado' : STATUS_LABELS[row.status]}
              </span>
            </div>
            <p className="crm-import-row-facts">
              {[row.phone, row.address, row.neighborhood ? `Barrio: ${row.neighborhood}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {row.notes ? <p className="crm-import-row-notes">{row.notes}</p> : null}
            {why(row) ? <p className="crm-import-row-why">{why(row)}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
