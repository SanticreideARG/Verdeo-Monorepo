import { Link } from 'react-router-dom';

import type { DataColumn } from '../components/DataTable.js';
import { formatMoney, orderStatusLabel, type OrderSummary } from './operations.js';
import { formatArgentinePhone, whatsappHref } from './phone.js';

/**
 * Las columnas de un pedido, declaradas una sola vez.
 *
 * Las usan las dos pantallas que listan pedidos —"Ver pedidos" para consultar y "Tomar y confirmar"
 * para trabajar— con distintos valores por defecto pero el mismo catálogo. Declararlas dos veces
 * sería garantizar que dentro de unos meses el teléfono se formatee distinto según desde dónde se
 * mire el mismo pedido.
 */
export interface OrderColumn extends DataColumn<OrderSummary> {
  /** No se puede apagar: sin esto la fila no se sabe de quién es, o no se puede operar. */
  locked?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  email: 'Email',
  facebook: 'Facebook',
  instagram: 'Instagram',
  // Ya no se puede elegir al cargar un pedido, pero los que se cargaron antes lo tienen y tienen
  // que seguir diciendo algo legible.
  manual: 'Manual',
  opportunity_sale: 'Venta de oportunidad',
  phone: 'Teléfono',
  referral: 'Recomendación',
  web: 'Sitio web',
  whatsapp: 'WhatsApp',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR').format(new Date(iso));
}

export const ORDER_COLUMNS: readonly OrderColumn[] = [
  {
    key: 'cliente',
    label: 'Cliente',
    locked: true,
    primary: true,
    /*
     * Enlaza el nombre y no la fila entera: con quince columnas posibles, una fila-enlace convierte
     * cualquier intento de seleccionar un texto en una navegación accidental.
     */
    render: (order) => (
      <Link className="order-name" to={`/app/pedidos/${order.id}`}>
        {order.customer.displayName}
      </Link>
    ),
  },
  {
    emphasis: true,
    key: 'whatsapp',
    label: 'WhatsApp',
    /*
     * El contacto es la segunda cosa que se mira: casi todo pedido se termina de acordar por chat.
     * Si el cliente no tiene WhatsApp propio cargado, se usa el teléfono —es el mismo número en la
     * enorme mayoría de los casos— pero no se inventa: sin ninguno de los dos, dice que no hay.
     */
    render: (order) => {
      const number = order.customer.whatsapp ?? order.customer.phone;
      if (!number) return '—';
      return (
        <a
          className="order-card-phone"
          href={whatsappHref(number)}
          rel="noreferrer"
          target="_blank"
        >
          {formatArgentinePhone(number)}
        </a>
      );
    },
  },
  {
    key: 'pedido',
    label: 'Pedido',
    render: (order) =>
      order.items
        .map((item) => `${item.productName} ${item.variantName} × ${item.quantityUnits}`)
        .join(', '),
  },
  { key: 'estado', label: 'Estado', render: (order) => orderStatusLabel(order.status) },
  {
    emphasis: true,
    key: 'total',
    label: 'Total',
    render: (order) => formatMoney(order.totalMinor, order.currency),
  },
  {
    key: 'telefono',
    label: 'Teléfono',
    // Para llamar, que no es lo mismo que escribir: acá el enlace marca en vez de abrir el chat.
    render: (order) =>
      order.customer.phone ? (
        <a className="order-card-phone" href={`tel:${order.customer.phone}`}>
          {formatArgentinePhone(order.customer.phone)}
        </a>
      ) : (
        '—'
      ),
  },
  { key: 'entrega', label: 'Entrega', render: (order) => shortDate(order.deliveryDate) },
  { key: 'domicilio', label: 'Domicilio', render: (order) => order.deliveryAddress || '—' },
  { key: 'zona', label: 'Zona', render: (order) => order.deliveryZone ?? '—' },
  { key: 'pago', label: 'Pago esperado', render: (order) => order.paymentExpectation || '—' },
  {
    key: 'cobrado',
    label: 'Cobrado',
    /*
     * Sólo el estado. El tilde que se puede tocar lo arma cada pantalla, porque necesita el
     * permiso y una función que recargue la lista; acá el catálogo no tiene ni una cosa ni la otra.
     */
    render: (order) => (order.paidAt ? `Sí · ${shortDate(order.paidAt)}` : 'No'),
    sortValue: (order) => (order.paidAt ? 1 : 0),
  },
  {
    key: 'origen',
    label: 'Origen',
    render: (order) => sourceLabel(order.source),
  },
  {
    key: 'numero',
    label: 'N° de pedido',
    // Sin jerarquía a propósito: identifica el pedido para citarlo, no para reconocerlo.
    render: (order) => <span className="order-card-meta">{order.publicNumber}</span>,
  },
  { key: 'email', label: 'Email', render: (order) => order.customer.email ?? '—' },
  {
    key: 'indicaciones',
    label: 'Indicaciones',
    render: (order) =>
      order.dietaryInstructions.length > 0 ? order.dietaryInstructions.join(' · ') : '—',
  },
  { key: 'creado', label: 'Creado', render: (order) => shortDate(order.createdAt) },
];

/**
 * La elección de columnas, guardada por persona en el navegador.
 *
 * Es una preferencia de lectura de una pantalla, no un dato del negocio: guardarla en la cuenta
 * significaría una tabla, un endpoint y una migración para algo que se resuelve con una línea. Si
 * mañana hace falta que viaje entre dispositivos, se mueve.
 */
export function readStoredColumns(
  storageKey: string,
  fallback: readonly string[],
  // Sólo se miran la clave y el candado: así lo puede llamar una pantalla cuyo catálogo se termina
  // de armar recién dentro del render, con columnas que dependen de los permisos.
  catalogue: readonly { key: string; locked?: boolean }[],
): string[] {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return [...fallback];
    const parsed = JSON.parse(saved) as unknown;
    // Una columna guardada que ya no existe se ignora en vez de romper la tabla.
    const known = Array.isArray(parsed)
      ? parsed.filter(
          (key): key is string =>
            typeof key === 'string' && catalogue.some((column) => column.key === key),
        )
      : [];
    if (known.length === 0) return [...fallback];
    // Las bloqueadas vuelven aunque no estén guardadas: una elección vieja no puede dejar una fila
    // sin nombre ni sin sus botones.
    return catalogue
      .filter((column) => column.locked || known.includes(column.key))
      .map((column) => column.key);
  } catch {
    return [...fallback];
  }
}

export function writeStoredColumns(storageKey: string, columns: readonly string[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(columns));
  } catch {
    // Sin almacenamiento (ventana privada) la elección vale para esta sesión y ya.
  }
}
