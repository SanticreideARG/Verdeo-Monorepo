import type { ReactNode } from 'react';

import { useNarrowViewport } from '../lib/useNarrowViewport.js';

export interface DataColumn<T> {
  /** Se destaca dentro de la tarjeta: el número que se mira primero. */
  emphasis?: boolean;
  key: string;
  label: string;
  /** Encabeza la tarjeta en celular. Exactamente una columna debería tenerlo. */
  primary?: boolean;
  render: (row: T) => ReactNode;
}

/**
 * Los mismos datos como tabla en escritorio y como tarjetas en un teléfono.
 *
 * Una tabla de ocho columnas en 375px no se arregla con scroll horizontal: obliga a arrastrar de
 * lado para leer una fila, y se pierde de vista la columna que dice de qué fila se trata. Lo que se
 * arregla es dejar de ser tabla — cada fila pasa a ser una tarjeta con su nombre arriba y los
 * valores como pares etiqueta/valor.
 *
 * Se declaran las columnas una sola vez y de ahí salen las dos formas. Escribirlas dos veces es
 * garantizar que dentro de unos meses digan cosas distintas.
 */
export function DataTable<T>({
  caption,
  columns,
  empty,
  rowKey,
  rows,
}: {
  /** Para lectores de pantalla: qué contiene la tabla. */
  caption: string;
  columns: readonly DataColumn<T>[];
  empty: string;
  rowKey: (row: T) => string;
  rows: readonly T[];
}) {
  const narrow = useNarrowViewport();

  if (rows.length === 0) {
    return <p className="data-table-empty">{empty}</p>;
  }

  if (narrow) {
    const primary = columns.find((column) => column.primary) ?? columns[0];
    const rest = columns.filter((column) => column !== primary);

    return (
      <ul aria-label={caption} className="data-cards">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <p className="data-cards-title">{primary?.render(row)}</p>
            <dl>
              {rest.map((column) => (
                <div className={column.emphasis ? 'is-emphasis' : undefined} key={column.key}>
                  <dt>{column.label}</dt>
                  <dd>{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td className={column.emphasis ? 'is-emphasis' : undefined} key={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
