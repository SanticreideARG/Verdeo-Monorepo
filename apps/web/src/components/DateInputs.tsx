import { useEffect, useRef, useState } from 'react';

/*
 * Campos de fecha y hora que siempre se escriben y se leen como acá: DD/MM/AAAA HH:MM, 24 horas
 * (2026-11-17).
 *
 * Los `<input type="date">`, `datetime-local` y `time` del navegador muestran el formato del idioma
 * de Windows o del navegador, no el de la página: en una computadora en inglés salía
 * "11/22/2026 09:57 AM", y el 22 de noviembre se leía al revés. La página no puede cambiarles el
 * formato, así que se escribe en un campo de texto propio, y el calendario del navegador queda sólo
 * para elegir con el mouse (el botón de al lado).
 *
 * El valor que se guarda y se manda es el mismo que el del campo nativo ("2026-11-22",
 * "2026-11-22T09:57", "09:57"): quien usa estos campos no cambia nada más que el `onChange`, que
 * recibe el valor y no el evento.
 */

type Kind = 'date' | 'datetime' | 'time';

const DIGITS: Record<Kind, number> = { date: 8, datetime: 12, time: 4 };
const PLACEHOLDER: Record<Kind, string> = {
  date: 'DD/MM/AAAA',
  datetime: 'DD/MM/AAAA HH:MM',
  time: 'HH:MM',
};
const NATIVE_TYPE: Record<Kind, string> = {
  date: 'date',
  datetime: 'datetime-local',
  time: 'time',
};

/** "2026-11-22T09:57" → "22/11/2026 09:57". Lo que no se entiende queda vacío. */
export function isoToDisplay(kind: Kind, iso: string): string {
  if (!iso) return '';
  if (kind === 'time') {
    const match = /^(\d{2}):(\d{2})/.exec(iso);
    return match ? `${match[1] ?? ''}:${match[2] ?? ''}` : '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!match) return '';
  const date = `${match[3] ?? ''}/${match[2] ?? ''}/${match[1] ?? ''}`;
  return kind === 'datetime' ? `${date} ${match[4] ?? '00'}:${match[5] ?? '00'}` : date;
}

/** Los dígitos escritos, con las barras, el espacio y los dos puntos en su lugar. */
export function maskDigits(kind: Kind, digits: string): string {
  const d = digits.slice(0, DIGITS[kind]);
  if (kind === 'time') return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  let out = d.slice(0, 2);
  if (d.length > 2) out += `/${d.slice(2, 4)}`;
  if (d.length > 4) out += `/${d.slice(4, 8)}`;
  if (kind === 'datetime') {
    if (d.length > 8) out += ` ${d.slice(8, 10)}`;
    if (d.length > 10) out += `:${d.slice(10, 12)}`;
  }
  return out;
}

/**
 * Lo escrito como valor del campo nativo, o null si está incompleto o no es una fecha que exista
 * (31/02, 25:00).
 */
export function displayToIso(kind: Kind, text: string): string | null {
  const d = text.replace(/\D/g, '');
  if (d.length !== DIGITS[kind]) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = (hh: number, mm: number) => (hh <= 23 && mm <= 59 ? `${pad(hh)}:${pad(mm)}` : null);
  if (kind === 'time') return time(Number(d.slice(0, 2)), Number(d.slice(2, 4)));
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4, 8));
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    return null;
  const date = `${String(year)}-${pad(month)}-${pad(day)}`;
  if (kind === 'date') return date;
  const clock = time(Number(d.slice(8, 10)), Number(d.slice(10, 12)));
  return clock ? `${date}T${clock}` : null;
}

interface FieldProps {
  'aria-label'?: string;
  className?: string;
  defaultValue?: string | undefined;
  disabled?: boolean;
  id?: string;
  /** Como en el campo nativo: "2026-11-22" (o con hora, según el campo). */
  max?: string | undefined;
  min?: string | undefined;
  name?: string;
  /** Recibe el valor completo, o '' cuando se borra. Lo incompleto no se avisa. */
  onChange?: (value: string) => void;
  required?: boolean;
  value?: string;
}

function DateLikeInput({ kind, ...props }: FieldProps & { kind: Kind }) {
  const controlled = props.value !== undefined;
  const [own, setOwn] = useState(props.defaultValue ?? '');
  const iso = controlled ? (props.value ?? '') : own;
  const [text, setText] = useState(() => isoToDisplay(kind, iso));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Si el valor cambia desde afuera (otro control, "hoy"), lo escrito se pone al día.
  useEffect(() => {
    setText((current) => (displayToIso(kind, current) === iso ? current : isoToDisplay(kind, iso)));
  }, [iso, kind]);

  const outOfRange = (value: string) =>
    (props.min !== undefined && props.min !== '' && value < props.min) ||
    (props.max !== undefined && props.max !== '' && value > props.max);

  function commit(next: string) {
    if (!controlled) setOwn(next);
    props.onChange?.(next);
  }

  // El mensaje de validez del campo de texto, para el formulario que lo valide.
  useEffect(() => {
    const input = textRef.current;
    if (!input) return;
    const parsed = displayToIso(kind, text);
    input.setCustomValidity(
      text === ''
        ? ''
        : parsed === null
          ? `Escribila como ${PLACEHOLDER[kind]}.`
          : outOfRange(parsed)
            ? 'Está fuera del rango permitido.'
            : '',
    );
  });

  function onType(raw: string) {
    const masked = maskDigits(kind, raw.replace(/\D/g, ''));
    setText(masked);
    if (masked === '') {
      commit('');
      return;
    }
    const parsed = displayToIso(kind, masked);
    if (parsed !== null) commit(parsed);
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  }

  return (
    <span className={`date-input${props.className ? ` ${props.className}` : ''}`}>
      <input
        aria-label={props['aria-label']}
        autoComplete="off"
        disabled={props.disabled}
        id={props.id}
        inputMode="numeric"
        onBlur={() => {
          // Lo que quedó a medias se borra al salir: un valor a medio escribir no es un valor.
          if (text !== '' && displayToIso(kind, text) === null) setText(isoToDisplay(kind, iso));
        }}
        onChange={(event) => onType(event.target.value)}
        placeholder={PLACEHOLDER[kind]}
        ref={textRef}
        required={props.required}
        type="text"
        value={text}
      />
      {props.name ? <input name={props.name} type="hidden" value={iso} /> : null}
      {kind === 'time' ? null : (
        <>
          <button
            aria-label="Elegir en el calendario"
            className="date-input-picker"
            disabled={props.disabled}
            onClick={openPicker}
            title="Elegir en el calendario"
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <rect height="13" rx="2" width="14" x="3" y="4.5" />
              <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
            </svg>
          </button>
          <input
            aria-hidden="true"
            className="date-input-native"
            max={props.max}
            min={props.min}
            onChange={(event) => {
              const next = event.target.value;
              setText(isoToDisplay(kind, next));
              commit(next);
            }}
            ref={pickerRef}
            tabIndex={-1}
            type={NATIVE_TYPE[kind]}
            value={iso}
          />
        </>
      )}
    </span>
  );
}

/** Fecha: DD/MM/AAAA. El valor, "2026-11-22". */
export function DateInput(props: FieldProps) {
  return <DateLikeInput kind="date" {...props} />;
}

/** Fecha y hora: DD/MM/AAAA HH:MM, 24 horas. El valor, "2026-11-22T09:57". */
export function DateTimeInput(props: FieldProps) {
  return <DateLikeInput kind="datetime" {...props} />;
}

/** Hora: HH:MM, 24 horas. El valor, "09:57". */
export function TimeInput(props: FieldProps) {
  return <DateLikeInput kind="time" {...props} />;
}
