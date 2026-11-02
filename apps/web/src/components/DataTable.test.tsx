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

describe('DataTable con grupos', () => {
  const GROUPED: Row[] = [
    { demanda: 1, disponible: 0, variedad: 'B martes' },
    { demanda: 2, disponible: 0, variedad: 'C lunes' },
    { demanda: 3, disponible: 0, variedad: 'A martes' },
    { demanda: 4, disponible: 0, variedad: 'Sin día' },
  ];
  const dayOf = (row: Row) =>
    row.variedad.includes('lunes')
      ? '2026-11-02'
      : row.variedad.includes('martes')
        ? '2026-11-03'
        : '';
  const groupBy = {
    key: dayOf,
    label: (key: string, rows: readonly Row[]) => `${key || 'Sin fecha'} (${String(rows.length)})`,
  };
  const lines = () => screen.getAllByRole('row').map((row) => row.textContent);

  beforeEach(() => setViewport(false));

  it('encabeza cada grupo, en orden de clave y con el vacío al final', () => {
    render(
      <DataTable
        caption="Grupos"
        columns={COLUMNS.slice(0, 1)}
        empty="Nada"
        groupBy={groupBy}
        rowKey={(row) => row.variedad}
        rows={GROUPED}
      />,
    );
    expect(lines().slice(1)).toEqual([
      '2026-11-02 (1)',
      'C lunes',
      '2026-11-03 (2)',
      'B martes',
      'A martes',
      'Sin fecha (1)',
      'Sin día',
    ]);
  });

  it('ordenar por una columna ordena adentro de cada grupo', () => {
    const variedad: DataColumn<Row> = {
      key: 'variedad',
      label: 'Variedad',
      render: (row) => row.variedad,
      sortValue: (row) => row.variedad,
    };
    render(
      <DataTable
        caption="Grupos"
        columns={[variedad]}
        empty="Nada"
        groupBy={groupBy}
        rowKey={(row) => row.variedad}
        rows={GROUPED}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Variedad/ }));
    expect(lines().slice(1, 6)).toEqual([
      '2026-11-02 (1)',
      'C lunes',
      '2026-11-03 (2)',
      'A martes',
      'B martes',
    ]);
  });

  it('también encabeza las tarjetas del teléfono', () => {
    setViewport(true);
    render(
      <DataTable
        caption="Grupos"
        columns={COLUMNS.slice(0, 1)}
        empty="Nada"
        groupBy={groupBy}
        rowKey={(row) => row.variedad}
        rows={GROUPED}
      />,
    );
    expect(screen.getByText('2026-11-03 (2)').tagName).toBe('LI');
  });
});
