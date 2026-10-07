import { canonicalArgentinePhone } from '@verdeo/customers';

import type { OrderImportItem, OrderImportRow } from './order-import.js';

/**
 * Los pedidos que llegan por el formulario del sitio, tal como los recibe el correo.
 *
 * El sitio actual manda un email por pedido, con este formato:
 *
 *     From: Ana Pérez ana@example.com
 *     Subject: [your-subject]
 *
 *     Celular: 1155550101
 *     Dirección de entrega: Calle 123 4B
 *     Barrio : Palermo
 *
 *     Pedido
 *     Menú Paleo & Keto  250: 0
 *     Menú Paleo & Keto  400 2
 *     ...
 *
 *     Message Body:
 *     Soy alérgica a las nueces
 *
 * Se pega tal cual llega —reenviado, con el encabezado de Gmail y todo—, de a uno o de a muchos. No
 * se interpreta con inteligencia: es un formato fijo que genera una máquina, así que se lee con
 * reglas, y lo que las reglas no entienden se dice en lugar de adivinarse.
 */

/** El mensaje de un cliente que no pidió nada: una pregunta, no un pedido. */
export interface OrderInquiry {
  customerName: string;
  email: string | null;
  message: string;
  phone: string | null;
  receivedOn: string | null;
  rowNumber: number;
}

export interface ParsedOrderEmails {
  /** Los mensajes que no traen ninguna cantidad, para responderlos y no perderlos. */
  inquiries: OrderInquiry[];
  /** Los bloques que no se pudieron reconocer como un pedido, para que no desaparezcan callados. */
  unreadable: number;
  rows: OrderImportRow[];
}

const MONTHS: Record<string, number> = {
  abr: 4,
  ago: 8,
  dic: 12,
  ene: 1,
  feb: 2,
  jul: 7,
  jun: 6,
  mar: 3,
  may: 5,
  nov: 11,
  oct: 10,
  sep: 9,
  set: 9,
};

/** "lun, 5 oct 2026 a las 19:12" → "2026-10-05". Sin hora: el día alcanza para ubicar el pedido. */
function parseSpanishDate(text: string): string | null {
  const match = /(\d{1,2})\s+([a-záéíóúñ]{3,})\.?\s+(\d{4})/i.exec(text);
  if (!match) return null;
  const month = MONTHS[(match[2] ?? '').toLocaleLowerCase('es-AR').slice(0, 3)];
  if (!month) return null;
  const day = Number(match[1]);
  return `${match[3] ?? ''}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** El encabezado que agrega Gmail al reenviar, en español o en inglés. */
const FORWARD_MARKER = /^-{3,}\s*(?:Forwarded message|Mensaje reenviado)\s*-{3,}\s*$/gim;

/**
 * Una línea de pedido: "Menú Paleo & Keto  250: 0" o "Menú Vegan 400 2".
 *
 * El tamaño es el número de tres o cuatro cifras que está antes de la cantidad. Los dos puntos son
 * opcionales porque el primer renglón del formulario los trae y los demás no, y la cantidad puede
 * venir con cero adelante ("01"): es un campo de texto, no un número.
 */
const ITEM_LINE = /^(.+?)\s+(\d{2,4})\s*:?\s*(\d+)\s*$/;

/** Líneas de pie que no son parte del mensaje del cliente. */
function isFooter(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '--' || /^This e-mail was sent from a contact form/i.test(trimmed);
}

function field(block: string, label: RegExp): string | null {
  const match = label.exec(block);
  // Los espacios de más —el formulario los deja dobles, y los emails reales traen espacios no
  // separables— no son parte del dato: "Villa  Crespo" y "Villa Crespo" son el mismo barrio.
  const value = match?.[1]?.replace(/\s+/g, ' ').trim();
  return value ? value : null;
}

interface ParsedBlock {
  customerName: string;
  deliveryAddress: string | null;
  email: string | null;
  items: OrderImportItem[];
  locality: string | null;
  message: string | null;
  phone: string | null;
  receivedOn: string | null;
  warnings: string[];
}

function parseBlock(block: string): ParsedBlock | null {
  // El "From:" del cliente es el último: un reenvío en inglés antepone el del sitio.
  const fromLines = [...block.matchAll(/^From:\s*(.*)$/gim)].map((match) => match[1]?.trim() ?? '');
  const from = fromLines.at(-1);
  if (!from) return null;

  const fromMatch = /^(.*?)\s*<?([^\s<>@]+@[^\s<>]+)>?\s*$/.exec(from);
  const email = fromMatch?.[2]?.toLocaleLowerCase('es-AR') ?? null;
  const nameFromHeader = fromMatch?.[1]?.trim().replace(/^"|"$/g, '') ?? from;
  // Sin nombre, el correo: un cliente sin ningún nombre no se puede crear ni reconocer.
  const customerName = nameFromHeader || email || from;

  const phoneRaw = field(block, /^Celular:\s*(.*)$/im);
  const address = field(block, /^Direcci[oó]n de entrega:\s*(.*)$/im);
  const neighborhood = field(block, /^Barrio\s*:\s*(.*)$/im);

  const warnings: string[] = [];
  const items: OrderImportItem[] = [];
  const orderLines = /^Pedido\s*$/im.exec(block);
  if (orderLines) {
    const afterOrder = block.slice(orderLines.index + orderLines[0].length);
    const bodyAt = afterOrder.search(/^Message Body:/im);
    const section = bodyAt >= 0 ? afterOrder.slice(0, bodyAt) : afterOrder;
    for (const rawLine of section.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || isFooter(line)) continue;
      const match = ITEM_LINE.exec(line);
      if (!match) {
        /*
         * Una línea que parece de pedido y no se entiende se dice.
         *
         * Descartarla en silencio dejaría salir el pedido sin esa vianda, y quien lo revisa cree que
         * está completo: la cantidad se perdió y nadie lo sabe.
         */
        warnings.push(`No pude leer la línea del pedido: «${line}»`);
        continue;
      }
      const quantity = Number(match[3]);
      if (quantity === 0) continue;
      if (quantity > 99) {
        warnings.push(`Cantidad llamativa en «${line.trim()}»: ${String(quantity)}. Revisala.`);
        continue;
      }
      items.push({
        dishes: [],
        quantityUnits: quantity,
        size: match[2] ?? null,
        // Los espacios dobles del formulario, y los de los costados, no son parte del nombre.
        variety: (match[1] ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
  }

  const bodyAt = block.search(/^Message Body:/im);
  let message: string | null = null;
  if (bodyAt >= 0) {
    const lines: string[] = [];
    for (const line of block.slice(bodyAt).split(/\r?\n/).slice(1)) {
      if (isFooter(line)) break;
      lines.push(line);
    }
    message = lines.join('\n').trim() || null;
  }

  return {
    customerName,
    deliveryAddress: [address, neighborhood].filter(Boolean).join(', ') || null,
    email,
    items,
    // "Pedido online Capital Federal": la ciudad que dice el sitio, para que se vea si no coincide.
    locality: field(block, /^Subject:\s*Pedido online\s+(.+)$/im),
    message,
    phone: phoneRaw,
    receivedOn: parseSpanishDate(field(block, /^(?:Date|Fecha):\s*(.+)$/im) ?? ''),
    warnings,
  };
}

/**
 * Lee uno o varios emails de pedido pegados juntos.
 *
 * Cada bloque entre encabezados de reenvío es un mensaje. Sin encabezados, todo lo pegado es uno.
 */
export function parseOrderEmails(text: string): ParsedOrderEmails {
  const blocks = text.split(FORWARD_MARKER).filter((block) => block.trim().length > 0);

  const rows: OrderImportRow[] = [];
  const inquiries: OrderInquiry[] = [];
  let unreadable = 0;

  for (const [index, block] of blocks.entries()) {
    const parsed = parseBlock(block);
    // El número es el lugar del mensaje en lo pegado: es lo que permite decir "el tercero".
    const rowNumber = index + 1;
    if (!parsed) {
      unreadable += 1;
      continue;
    }

    const phone = parsed.phone ? canonicalArgentinePhone(parsed.phone) : null;

    if (parsed.items.length === 0) {
      /*
       * Ningún renglón con cantidad: no es un pedido, es una consulta.
       *
       * El formulario se puede enviar con todo en cero, y quien lo hace casi siempre quiere
       * preguntar algo —lo dice en el mensaje—. Convertirlo en un pedido vacío lo perdería, y
       * descartarlo también: queda a un costado, con el mensaje, para contestarlo.
       */
      if (parsed.warnings.length > 0) {
        // Con líneas que no se entendieron no se puede afirmar que sea una consulta.
        unreadable += 1;
        continue;
      }
      inquiries.push({
        customerName: parsed.customerName,
        email: parsed.email,
        message: parsed.message ?? '',
        phone,
        receivedOn: parsed.receivedOn,
        rowNumber,
      });
      continue;
    }

    rows.push({
      customerName: parsed.customerName,
      deliveryAddress: parsed.deliveryAddress,
      email: parsed.email,
      items: parsed.items,
      kind: 'email',
      locality: parsed.locality,
      notes: parsed.message,
      paymentExpectation: null,
      phone,
      receivedOn: parsed.receivedOn,
      rowNumber,
      warnings: parsed.warnings,
    });
  }

  return { inquiries, rows, unreadable };
}
