/**
 * Vaciar los datos de operación para arrancar en producción con la base limpia.
 *
 * Borra clientes y todo lo que colgó de ellos mientras se probaba el sistema: pedidos, cobros,
 * paradas de reparto, conversaciones, avisos y respuestas de encuestas. **No toca el catálogo**:
 * ciudades, zonas, menús, períodos, precios, métodos de pago, usuarios, roles, plantillas,
 * artículos de ayuda y contenidos del sitio quedan como están, que es justo lo que se configuró
 * para poder abrir.
 *
 * Esto no se puede deshacer. El respaldo se baja antes desde el panel (`/app/respaldos`).
 *
 * ## Por qué hace falta un script y no un `delete from customers`
 *
 * Cuatro claves foráneas son `restrict` y cada una tumba la transacción entera si se llega a ella
 * con filas colgando: `orders.customer_id`, `delivery_stops.order_id`, `cash_collections.order_id`
 * y `cash_settlements.collection_id`. Un `delete` suelto no borra nada y deja un mensaje de
 * Postgres que no dice por dónde empezar — pasó al retirar el rol de repartidor.
 *
 * ## Lo que queda a propósito
 *
 * Las **hojas de ruta** no se borran, sólo sus paradas: una ruta es del período, no del cliente.
 * El CLI dice cuántas quedaron vacías para que se decida aparte.
 *
 * La **auditoría** tampoco. Es el registro de lo que hizo el equipo, no datos de clientes, y
 * borrarla sería borrar la única prueba de que esta limpieza ocurrió.
 *
 * El borrado vive acá, separado del CLI (`wipe-operations-cli.ts`), para poder probarlo contra un
 * Postgres de verdad. El orden depende de esas cuatro `restrict`, y eso no se verifica leyendo: se
 * verifica corriéndolo. Un script que sólo se ejecuta en producción es un script sin probar.
 */
import { desc, ne, sql } from 'drizzle-orm';

import type { Database } from './index.js';
import {
  cashCollections,
  cashSettlements,
  customers,
  deliveryStops,
  manualNotices,
  messagingConversations,
  messagingWebhookEvents,
  orders,
  salesCycles,
  surveyResponses,
  transferReconciliations,
  weeklyMenus,
} from './schema/index.js';

/** Las tablas que el vaciado toca, con el nombre que se muestra en el resumen. */
const CONTADAS = {
  avisos: manualNotices,
  clientes: customers,
  cobros: cashCollections,
  conciliaciones: transferReconciliations,
  conversaciones: messagingConversations,
  eventos: messagingWebhookEvents,
  paradas: deliveryStops,
  pedidos: orders,
  periodos: salesCycles,
  rendiciones: cashSettlements,
  respuestas: surveyResponses,
} as const;

export type OperationCounts = Record<keyof typeof CONTADAS, number>;

/** Lo que hay antes de tocar nada, para que el resumen signifique algo. */
export async function countOperations(database: Database): Promise<OperationCounts> {
  const entradas = await Promise.all(
    Object.entries(CONTADAS).map(async ([nombre, tabla]) => {
      const [fila] = await database.select({ n: sql<number>`count(*)::int` }).from(tabla);
      return [nombre, fila?.n ?? 0] as const;
    }),
  );
  return Object.fromEntries(entradas) as OperationCounts;
}

/**
 * El borrado, en una transacción y en el único orden que funciona.
 *
 * De la hoja hacia la raíz, saltando cada `restrict` antes de llegar a él: rendiciones antes que
 * cobros, cobros y paradas antes que pedidos, pedidos antes que clientes. Lo que cuelga por
 * `cascade` —ítems, platos elegidos, indicaciones, historial, revisiones, pagos, contactos,
 * domicilios, accesos, preferencias, restricciones, tokens de encuesta— se va solo y no se nombra
 * acá: repetirlo sería dos fuentes de verdad para el mismo borrado.
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda.
 */
/**
 * El período más reciente: el que se conserva cuando se pide quedarse sólo con uno.
 *
 * "El último cargado" se resuelve por fecha de cierre y no por orden de alta. Son lo mismo cuando
 * las semanas se cargan en orden, y no cuando alguien carga una vieja a posteriori: ahí el último
 * *cargado* es una semana vieja, que es justo lo que nadie quiere conservar. El CLI imprime cuál
 * eligió antes de borrar, para que no haya que confiar en esta regla a ciegas.
 */
export async function findLatestCycle(
  database: Database,
): Promise<{ alias: string; closeAt: Date; id: string } | null> {
  const [latest] = await database
    .select({ alias: salesCycles.alias, closeAt: salesCycles.closeAt, id: salesCycles.id })
    .from(salesCycles)
    .orderBy(desc(salesCycles.closeAt))
    .limit(1);
  return latest ?? null;
}

export interface WipeOptions {
  /**
   * Conservar sólo este período y borrar los demás, con sus menús, precios y platos.
   *
   * Sin esto se conservan **todos**: los períodos son parte del catálogo y rehacerlos —menús,
   * precios, platos— es trabajo que el vaciado no tiene por qué destruir.
   */
  keepOnlyCycleId?: string;
}

export async function wipeOperations(database: Database, options: WipeOptions = {}): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.delete(cashSettlements);
    await transaction.delete(cashCollections);
    await transaction.delete(transferReconciliations);
    await transaction.delete(deliveryStops);
    /*
     * Los avisos manuales se borran por nombre y no por cascada: `manual_notices.order_id` a
     * propósito no tiene clave foránea —haber avisado sigue siendo cierto aunque el pedido ya no
     * esté—, y esa misma decisión hace que acá haya que barrerlos a mano.
     */
    await transaction.delete(manualNotices);
    await transaction.delete(messagingConversations);
    /*
     * Los eventos crudos del webhook también, y no por prolijidad: son el cuerpo tal como lo mandó
     * Meta, con el número y el texto de cada mensaje de prueba. Un vaciado previo a producción que
     * borra las conversaciones y deja los payloads de las que las originaron no borró los datos de
     * nadie, sólo los escondió de las pantallas.
     *
     * Lo que se pierde es la idempotencia de lo viejo: si Meta reintentara un evento de hace
     * semanas, se procesaría de nuevo. No reintenta a esa distancia, y las conversaciones que ese
     * evento tocaría ya no existen.
     */
    await transaction.delete(messagingWebhookEvents);
    await transaction.delete(orders);
    await transaction.delete(customers);

    if (options.keepOnlyCycleId) {
      /*
       * Los menús antes que los períodos: `weekly_menus.sales_cycle_id` es `restrict`, y con el
       * orden al revés Postgres tumba la transacción entera. Después de los pedidos, que
       * referencian a las dos cosas con `restrict`. Ofertas, precios y platos cuelgan del menú
       * por `cascade`, y lo de producción —cierres, reales, excedentes— del período.
       *
       * `source_menu_id` es `set null`, así que no importa si se borra primero la revisión
       * regional o la maestra.
       */
      await transaction
        .delete(weeklyMenus)
        .where(ne(weeklyMenus.salesCycleId, options.keepOnlyCycleId));
      await transaction.delete(salesCycles).where(ne(salesCycles.id, options.keepOnlyCycleId));
    }
  });
}
