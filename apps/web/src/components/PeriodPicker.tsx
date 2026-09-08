import { periodLabel, type Period } from '../lib/periods.js';

/**
 * Sobre qué semana se está trabajando.
 *
 * Las dos pantallas de pedidos abren en el período actual en vez de en todo el histórico: la cola de
 * trabajo es lo que hay que hacer esta semana, y el archivo es algo que se va a buscar. Sin esto,
 * cada semana que pasa deja atrás borradores que nadie confirmó y que se quedan en la cola para
 * siempre.
 *
 * "Todos los períodos" existe porque a veces hay que buscar de verdad —un pedido viejo, un cliente
 * que pregunta por algo de hace un mes—, pero es una opción a la que hay que ir, no el punto de
 * partida.
 */
export function PeriodPicker({
  allowAll = false,
  onChange,
  periods,
  value,
}: {
  /** Ofrecer "Todos los períodos". La cola de trabajo no lo necesita; la consulta sí. */
  allowAll?: boolean;
  onChange: (cycleId: string) => void;
  periods: readonly Period[];
  /** Vacío significa todos. */
  value: string;
}) {
  if (periods.length === 0) return null;

  return (
    <label className="field">
      Período
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {periodLabel(period)}
          </option>
        ))}
        {allowAll ? <option value="">Todos los períodos</option> : null}
      </select>
    </label>
  );
}
