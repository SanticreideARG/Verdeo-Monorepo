import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable, type DataColumn } from './DataTable.js';

interface Row {
  disponible: number;
  demanda: number;
  variedad: string;
}

const COLUMNS: readonly DataColumn<Row>[] = [
  { key: 'variedad', label: 'Variedad', primary: true, render: (row) => row.variedad },
  { key: 'demanda', label: 'Demanda', render: (row) => row.demanda },
  { emphasis: true, key: 'disponible', label: 'Disponible', render: (row) => row.disponible },
];

const ROWS: Row[] = [
  { demanda: 40, disponible: 6, variedad: 'Keto 250' },
  { demanda: 25, disponible: 0, variedad: 'Vegetariano 400' },
];

/**
 * `matchMedia` no existe en jsdom, así que hay que darlo. El ancho se decide acá y no con un
 * viewport real: lo que se prueba es que el componente elija la forma correcta, no cómo pinta.
 */
function setViewport(narrow: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        addEventListener: () => undefined,
        matches: narrow,
        media: query,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

function renderTable(rows: Row[] = ROWS) {
  return render(
    <DataTable
      caption="Excedente por variedad"
      columns={COLUMNS}
      empty="Sin datos todavía."
      rowKey={(row) => row.variedad}
      rows={rows}
    />,
  );
}

describe('DataTable', () => {
  it('renders a real table on a wide screen', () => {
    setViewport(false);
    renderTable();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  /**
   * La razón de existir del componente: en un teléfono las filas dejan de ser filas. Con scroll
   * horizontal hay que arrastrar de lado para leer una fila y se pierde de vista la columna que
   * dice de qué fila se trata.
   */
  it('renders one card per row on a narrow screen, and no table', () => {
    setViewport(true);
    renderTable();

    expect(screen.queryByRole('table')).toBeNull();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('Keto 250')).toBeTruthy();
    expect(within(cards[0]!).getByText('Demanda')).toBeTruthy();
  });

  // Las columnas se declaran una sola vez: escribirlas dos veces garantiza que se separen.
  it('shows every column in both shapes', () => {
    setViewport(false);
    const wide = renderTable();
    for (const column of COLUMNS)
      expect(screen.getAllByText(column.label).length).toBeGreaterThan(0);
    wide.unmount();

    setViewport(true);
    renderTable();
    // La primaria encabeza la tarjeta, así que su etiqueta no se repite como par.
    for (const column of COLUMNS.filter((item) => !item.primary)) {
      expect(screen.getAllByText(column.label).length).toBe(ROWS.length);
    }
  });

  /** Un cero es un dato: la fila tiene que estar, no desaparecer por parecerse a vacío. */
  it('keeps rows whose value is zero', () => {
    setViewport(true);
    renderTable();

    const cards = screen.getAllByRole('listitem');
    expect(within(cards[1]!).getByText('Vegetariano 400')).toBeTruthy();
    expect(within(cards[1]!).getByText('0')).toBeTruthy();
  });

  it('says so when there is nothing, in both shapes', () => {
    setViewport(false);
    const wide = renderTable([]);
    expect(screen.getByText('Sin datos todavía.')).toBeTruthy();
    wide.unmount();

    setViewport(true);
    renderTable([]);
    expect(screen.getByText('Sin datos todavía.')).toBeTruthy();
  });
});
