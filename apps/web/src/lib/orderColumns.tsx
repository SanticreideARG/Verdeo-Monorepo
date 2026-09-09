import { Link } from 'react-router-dom';

import type { DataColumn } from '../components/DataTable.js';
import { formatDay } from './dates.js';
import { maskSurname } from './maskName.js';
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

/**
 * En qué orden se trabaja un pedido, para ordenar por estado.
 *
 * Alfabéticamente "Borrador" iría después de "Cancelado", que no significa nada: lo que se quiere
 * al tocar la columna es ver primero lo que falta hacer y al final lo que ya salió del circuito.
 */
const STATUS_RANK: Record<string, number> = {
  CANCELLED: 5,
  CONFIRMED: 2,
  DELIVERED: 4,
  DRAFT: 1,
  READY: 3,
};

/**
 * De qué color es la barrita al inicio de la fila.
 *
 * Un borrador espera una decisión y por eso destaca; un confirmado está en curso; uno listo o
 * entregado ya no necesita a nadie, y un cancelado se apaga del todo para que deje de competir por
 * la atención en una lista larga.
 */
export function orderRowTone(
  order: OrderSummary,
): 'pendiente' | 'en-curso' | 'listo' | 'inactivo' | undefined {
  if (order.status === 'DRAFT') return 'pendiente';
  if (order.status === 'CONFIRMED') return 'en-curso';
  if (order.status === 'CANCELLED') return 'inactivo';
  return 'listo';
}

/** El pedido como texto comparable: ordena por tipo de menú y tamaño, no por lo que se ve. */
function orderKind(order: OrderSummary): string {
  return order.items.map((item) => `${item.productName} ${item.variantName}`).join(', ');
}

/**
 * El catálogo de columnas.
 *
 * Es una función y no una constante porque tapar apellidos cambia lo que muestra la columna del
 * cliente, y eso lo decide cada pantalla —de hecho, cada momento— y no el catálogo.
 *
 * Todas ordenan. `sortValue` devuelve el dato y no lo que se ve, así que "Total" compara números y
 * no "$ 1.000" contra "$ 900" como texto, y "Entrega" compara fechas ISO y no "3/9" contra "12/9".
 */
export function buildOrderColumns(options: { maskSurnames?: boolean } = {}): OrderColumn[] {
  const displayName = (order: OrderSummary) =>
    options.maskSurnames ? maskSurname(order.customer.displayName) : order.customer.displayName;

  return [
    {
      key: 'cliente',
      label: 'Cliente',
      locked: true,
      primary: true,
      /*
       * Enlaza el nombre y no la fila entera: con quince columnas posibles, una fila-enlace
       * convierte cualquier intento de seleccionar un texto en una navegación accidental.
       */
      render: (order) => (
        <Link className="order-name" to={`/app/pedidos/${order.id}`}>
          {displayName(order)}
        </Link>
      ),
      // Se ordena por lo que se muestra: con los apellidos tapados, ordenar por el nombre completo
      // daría un orden que en pantalla no se explica.
      sortValue: (order) => displayName(order),
    },
    {
      emphasis: true,
      key: 'whatsapp',
      label: 'WhatsApp',
      /*
       * El contacto es la segunda cosa que se mira: casi todo pedido se termina de acordar por
       * chat. Si el cliente no tiene WhatsApp propio cargado, se usa el teléfono —es el mismo
       * número en la enorme mayoría de los casos— pero no se inventa: sin ninguno, dice que no hay.
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
      sortValue: (order) => order.customer.whatsapp ?? order.customer.phone ?? '',
    },
    {
      key: 'pedido',
      label: 'Pedido',
      render: (order) =>
        order.items
          .map((item) => `${item.productName} ${item.variantName} × ${String(item.quantityUnits)}`)
          .join(', '),
      sortValue: orderKind,
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (order) => orderStatusLabel(order.status),
      sortValue: (order) => STATUS_RANK[order.status] ?? 99,
    },
    {
      emphasis: true,
      key: 'total',
      label: 'Total',
      render: (order) => formatMoney(order.totalMinor, order.currency),
      sortValue: (order) => order.totalMinor,
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
      sortValue: (order) => order.customer.phone ?? '',
    },
    {
      key: 'entrega',
      label: 'Entrega',
      render: (order) => formatDay(order.deliveryDate),
      sortValue: (order) => order.deliveryDate,
    },
    {
      key: 'domicilio',
      label: 'Domicilio',
      render: (order) => order.deliveryAddress || '—',
      sortValue: (order) => order.deliveryAddress,
    },
    {
      key: 'zona',
      label: 'Zona',
      render: (order) => order.deliveryZone ?? '—',
      sortValue: (order) => order.deliveryZone ?? '',
    },
    {
      key: 'pago',
      label: 'Pago esperado',
      render: (order) => order.paymentExpectation || '—',
      sortValue: (order) => order.paymentExpectation,
    },
    {
      key: 'cobrado',
      label: 'Cobrado',
      /*
       * Sólo el estado. El tilde que se puede tocar lo arma cada pantalla, porque necesita el
       * permiso y una función que recargue la lista; acá el catálogo no tiene ni una cosa ni la
       * otra.
       */
      render: (order) => (order.paidAt ? `Sí · ${formatDay(order.paidAt)}` : 'No'),
      sortValue: (order) => (order.paidAt ? 1 : 0),
    },
    {
      key: 'origen',
      label: 'Origen',
      render: (order) => sourceLabel(order.source),
      sortValue: (order) => sourceLabel(order.source),
    },
    {
      key: 'numero',
      label: 'N° de pedido',
      // Sin jerarquía a propósito: identifica el pedido para citarlo, no para reconocerlo.
      render: (order) => <span className="order-card-meta">{order.publicNumber}</span>,
      sortValue: (order) => order.publicNumber,
    },
    {
      key: 'email',
      label: 'Email',
      render: (order) => order.customer.email ?? '—',
      sortValue: (order) => order.customer.email ?? '',
    },
    {
      key: 'indicaciones',
      label: 'Indicaciones',
      render: (order) =>
        order.dietaryInstructions.length > 0 ? order.dietaryInstructions.join(' · ') : '—',
      sortValue: (order) => order.dietaryInstructions.join(' · '),
    },
    {
      key: 'creado',
      label: 'Creado',
      render: (order) => formatDay(order.createdAt),
      sortValue: (order) => order.createdAt,
    },
  ];
}

/** El catálogo sin tapar nada: para el selector de columnas, que sólo mira claves y etiquetas. */
export const ORDER_COLUMNS: readonly OrderColumn[] = buildOrderColumns();

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
