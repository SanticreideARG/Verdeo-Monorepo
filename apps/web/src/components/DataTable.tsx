import { useState, type ReactNode } from 'react';

import { useNarrowViewport } from '../lib/useNarrowViewport.js';

export interface DataColumn<T> {
  /** Se destaca dentro de la tarjeta: el número que se mira primero. */
  emphasis?: boolean;
  key: string;
  label: string;
  /** Encabeza la tarjeta en celular. Exactamente una columna debería tenerlo. */
  primary?: boolean;
  render: (row: T) => ReactNode;
  /**
   * Por qué valor se ordena esta columna. Sin esto no se puede ordenar por ella, y es a propósito:
   * `render` devuelve nodos y ordenar por lo que se ve terminaría comparando "$ 1.000" con
   * "$ 900" como texto.
   */
  sortValue?: (row: T) => number | string;
  /**
   * Qué dice esta columna al pie, sumando las filas que están a la vista.
   *
   * Sólo unas pocas columnas tienen un total con sentido —plata, unidades—, y las que no lo tienen
   * dejan la celda vacía. Sumar todo lo sumable sería peor: una columna de números de pedido no
   * suma nada, y un total ahí es ruido que hay que aprender a ignorar.
   *
   * Recibe las filas cargadas, no el conjunto entero: es el total de lo que se está mirando, que es
   * para lo que sirve un filtro.
   */
  total?: (rows: readonly T[]) => ReactNode;
}

type SortState = { dir: 'asc' | 'desc'; key: string };

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es-AR', { numeric: true, sensitivity: 'base' });
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
  rowTone,
}: {
  /** Para lectores de pantalla: qué contiene la tabla. */
  caption: string;
  columns: readonly DataColumn<T>[];
  empty: string;
  rowKey: (row: T) => string;
  rows: readonly T[];
  /**
   * El estado de la fila, codificado en la forma y no sólo en una columna de texto.
   *
   * En una cola de sesenta filas, "cuál espera una decisión mía" se contestaba leyendo la columna
   * Estado en el medio de cada renglón. Una barra de color al inicio se ve sin leer. Es opcional:
   * una tabla donde todas las filas son iguales no la necesita.
   */
  rowTone?: (row: T) => 'pendiente' | 'en-curso' | 'listo' | 'inactivo' | undefined;
}) {
  const narrow = useNarrowViewport();
  const [sort, setSort] = useState<SortState | null>(null);

  const sortValue = sort ? columns.find((column) => column.key === sort.key)?.sortValue : undefined;
  const descending = sort?.dir === 'desc';
  const sorted = sortValue
    ? [...rows].sort((left, right) => {
        const value = compare(sortValue(left), sortValue(right));
        return descending ? -value : value;
      })
    : rows;

  /** Un clic ordena ascendente; el segundo sobre la misma columna invierte; el tercero desordena. */
  function toggleSort(key: string) {
    setSort((current) => {
      if (current?.key !== key) return { dir: 'asc', key };
      return current.dir === 'asc' ? { dir: 'desc', key } : null;
    });
  }

  if (rows.length === 0) {
    return <p className="data-table-empty">{empty}</p>;
  }

  if (narrow) {
    const primary = columns.find((column) => column.primary) ?? columns[0];
    const rest = columns.filter((column) => column !== primary);

    const sortables = columns.filter((column) => column.sortValue);

    return (
      <>
        {/* En el teléfono no hay encabezados donde hacer clic, así que ordenar es un campo más. */}
        {sortables.length > 0 ? (
          <label className="field data-cards-sort">
            Ordenar por
            <select
              onChange={(event) =>
                setSort(event.target.value ? { dir: 'asc', key: event.target.value } : null)
              }
              value={sort?.key ?? ''}
            >
              <option value="">Sin ordenar</option>
              {sortables.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <ul aria-label={caption} className="data-cards">
          {sorted.map((row) => (
            <li data-tone={rowTone?.(row)} key={rowKey(row)}>
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
      </>
    );
  }

  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) =>
              column.sortValue ? (
                <th
                  aria-sort={
                    sort?.key === column.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  key={column.key}
                  scope="col"
                >
                  <button
                    className="data-table-sort"
                    onClick={() => toggleSort(column.key)}
                    type="button"
                  >
                    {column.label}
                    {/* La flecha sólo aparece en la columna que ordena: un indicador en todas es
                        ruido, y uno en ninguna deja sin saber por qué está en ese orden. */}
                    <span aria-hidden="true">
                      {sort?.key === column.key ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                    </span>
                  </button>
                </th>
              ) : (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr data-tone={rowTone?.(row)} key={rowKey(row)}>
              {columns.map((column) => (
                <td className={column.emphasis ? 'is-emphasis' : undefined} key={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {/*
         * Los totales, al pie y sólo si alguna columna sabe calcularlos.
         *
         * "Cuántos pedidos hay" ya lo decía la pantalla; "cuánta plata suman" había que exportar
         * la planilla para saberlo. Y es el total de lo filtrado, no del histórico: es la pregunta
         * que uno se hace justo después de poner un filtro.
         */}
        {columns.some((column) => column.total) ? (
          <tfoot>
            <tr>
              {columns.map((column) => (
                <td className={column.emphasis ? 'is-emphasis' : undefined} key={column.key}>
                  {column.total?.(sorted)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
