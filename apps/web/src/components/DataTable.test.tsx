import { fireEvent, render, screen, within } from '@testing-library/react';
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

  describe('doble clic en escritorio', () => {
    const tabla = (onRowSelect: (row: Row) => void) =>
      render(
        <DataTable
          caption="Pedidos"
          columns={[
            ...COLUMNS,
            {
              key: 'control',
              label: 'Control',
              render: () => (
                <select aria-label="medio">
                  <option>a</option>
                </select>
              ),
            },
          ]}
          empty="nada"
          onRowSelect={onRowSelect}
          rowKey={(row) => row.variedad}
          rows={ROWS}
        />,
      );

    it('abre la fila con doble clic', () => {
      setViewport(false);
      const abrir = vi.fn();
      tabla(abrir);
      fireEvent.doubleClick(screen.getByText('Keto 250'));
      expect(abrir).toHaveBeenCalledWith(ROWS[0]);
    });

    // Doble clic sobre un selector es del selector, no una orden de abrir el pedido.
    it('no abre la fila cuando el doble clic cae sobre un control', () => {
      setViewport(false);
      const abrir = vi.fn();
      tabla(abrir);
      fireEvent.doubleClick(screen.getAllByLabelText('medio')[0] as HTMLElement);
      expect(abrir).not.toHaveBeenCalled();
    });
  });
});

describe('DataTable en el teléfono: tarjetas o columnas', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewport(true);
  });

  function renderSwitchable() {
    return render(
      <DataTable
        caption="Pedidos"
        columns={[
          ...COLUMNS,
          {
            actions: true,
            cardRender: () => <button type="button">⋯</button>,
            key: 'acciones',
            label: 'Acciones',
            render: () => <button type="button">Confirmar</button>,
          },
        ]}
        empty="Sin datos."
        narrowViewKey="prueba-vista"
        rowKey={(row) => row.variedad}
        rows={ROWS}
      />,
    );
  }

  it('en tarjetas, el menú va arriba al lado del nombre y no hay fila de botones al pie', () => {
    const { container } = renderSwitchable();

    expect(container.querySelector('.data-cards-head .data-cards-head-actions')).not.toBeNull();
    expect(container.querySelector('.data-cards-actions')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  it('pasa a columnas, la misma tabla de escritorio, y lo recuerda', () => {
    renderSwitchable();

    fireEvent.click(screen.getByRole('button', { name: 'Columnas' }));

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Demanda' })).toBeTruthy();
    expect(window.localStorage.getItem('prueba-vista')).toBe('table');
  });

  it('sin clave de vista no ofrece elegir: siempre tarjetas', () => {
    renderTable();

    expect(screen.queryByRole('button', { name: 'Columnas' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
