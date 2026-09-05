import type { ReactNode } from 'react';

import { Sparkline } from './Sparkline.js';

export interface WidgetData {
  demand: { day: string; orderCount: number }[];
  moduleCount: number;
  permissionCount: number;
  pendingOrders: number;
  reminders: { day: string; title: string }[];
  sessionExpiry: string;
  unreadChat: number;
}

export interface WidgetDefinition {
  /** Stored in the layout. Never parsed for meaning — no branch keys off a widget's name. */
  key: string;
  /** Shown in the picker. */
  label: string;
  /** Who may see it. A widget whose permission the viewer lacks is filtered out everywhere. */
  permission?: string;
  render: (data: WidgetData) => ReactNode;
  /** Spans two columns when the content needs the width. */
  wide?: boolean;
}

function Stat({
  caption,
  label,
  value,
}: {
  caption: string;
  label: string;
  value: number | string;
}) {
  /*
   * El número va primero y grande, la etiqueta debajo. En un teléfono un widget se mira de reojo,
   * no se lee: lo que tiene que saltar es el 11, no la palabra "sin confirmar".
   *
   * `data-empty` marca el widget que no tiene nada que decir. En escritorio sobra lugar y puede
   * quedarse; en celular ocupa una tarjeta entera para no informar nada, así que se esconde.
   */
  return (
    <>
      <div data-empty={value === '—' ? 'true' : undefined}>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
      <em>{caption}</em>
    </>
  );
}

/**
 * Every widget the dashboard can show, declared as data.
 *
 * A catalogue rather than a switch: adding one means adding an entry, and the layout stores its key
 * without the engine ever asking what that key means — the same criterion the payment methods and
 * cancellation reasons follow. A layout naming a widget that no longer exists simply finds nothing
 * here and is skipped, so removing a widget needs no migration.
 */
export const WIDGET_CATALOGUE: readonly WidgetDefinition[] = [
  {
    key: 'demand',
    label: 'Pedidos por día',
    permission: 'stats.read',
    render: (data) =>
      data.demand.length > 1 ? (
        <>
          <Sparkline
            label={`Pedidos por día en los últimos ${data.demand.length} días`}
            values={data.demand.map((day) => day.orderCount)}
          />
          <Stat
            caption={`últimos ${data.demand.length} días`}
            label="Pedidos por día"
            value={data.demand.reduce((total, day) => total + day.orderCount, 0)}
          />
        </>
      ) : (
        <Stat caption="sin datos todavía" label="Pedidos por día" value="—" />
      ),
    wide: true,
  },
  {
    key: 'pending_orders',
    label: 'Pedidos sin confirmar',
    permission: 'orders.confirm',
    render: (data) => (
      <Stat
        caption={data.pendingOrders > 0 ? 'esperando revisión' : 'todo al día'}
        label="Sin confirmar"
        value={data.pendingOrders}
      />
    ),
  },
  {
    key: 'unread_chat',
    label: 'Mensajes sin leer',
    permission: 'chat.use',
    render: (data) => (
      <Stat
        caption={data.unreadChat > 0 ? 'te están esperando' : 'nada pendiente'}
        label="Sin leer"
        value={data.unreadChat}
      />
    ),
  },
  {
    key: 'reminders',
    label: 'Próximos recordatorios',
    permission: 'calendar.use',
    render: (data) =>
      data.reminders.length === 0 ? (
        <Stat caption="nada agendado" label="Recordatorios" value="—" />
      ) : (
        <div className="widget-list">
          <small>Próximo</small>
          <ul>
            {data.reminders.slice(0, 3).map((reminder) => (
              <li key={`${reminder.day}-${reminder.title}`}>
                <b>{reminder.title}</b>
                <span>{reminder.day}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    wide: true,
  },
  {
    key: 'modules',
    label: 'Módulos habilitados',
    render: (data) => <Stat caption="por permisos" label="Módulos" value={data.moduleCount} />,
  },
  {
    key: 'permissions',
    label: 'Permisos activos',
    render: (data) => <Stat caption="RBAC" label="Permisos" value={data.permissionCount} />,
  },
  {
    key: 'session',
    label: 'Sesión',
    render: (data) => (
      <Stat caption="HttpOnly" label="Sesión segura" value={`Hasta ${data.sessionExpiry}`} />
    ),
  },
];

/** What someone sees before they have arranged anything. */
export const DEFAULT_LAYOUT: readonly string[] = [
  'demand',
  'pending_orders',
  'unread_chat',
  'reminders',
];

/** The widgets a layout resolves to, minus any the viewer may not see or that no longer exist. */
export function resolveWidgets(
  layout: readonly string[],
  permissions: readonly string[],
): WidgetDefinition[] {
  return layout
    .map((key) => WIDGET_CATALOGUE.find((widget) => widget.key === key))
    .filter((widget): widget is WidgetDefinition => widget !== undefined)
    .filter((widget) => !widget.permission || permissions.includes(widget.permission));
}
