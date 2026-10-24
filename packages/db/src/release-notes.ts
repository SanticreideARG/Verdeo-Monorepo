/**
 * Las novedades del sistema para el feed del tablero (DASHBOARD_FEED_PLAN.md, "Novedades del
 * sistema"): un resumen de lo que cambió, para que el equipo se entere sin leer el repositorio.
 *
 * Se publican con `pnpm db:seed-release-notes` (con `--produccion` en producción), después de la
 * migración que las acompaña. Cada una se publica una sola vez: el script saltea las que ya están
 * (mismo texto, sin borrar). Para una novedad nueva, se agrega al final de la lista.
 */
export interface ReleaseNote {
  body: string;
  /** Para nombrarla en la salida del script y en los tests. */
  key: string;
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    key: '2026-10-19-pedidos',
    body: `Pedidos, más cómodos:
• Dos campos nuevos en cada pedido: día de reparto y franja horaria.
• En el teléfono, la lista de pedidos se lee en tarjetas.
• El domicilio va en dos renglones: calle y número, y el detalle (piso, barrio, referencia).
• La dirección que se carga en un pedido queda guardada en la ficha del cliente.`,
  },
  {
    key: '2026-10-20-cocina-cobros',
    body: `Cocina y cobros:
• Cocina más simple: la planilla en el formato de siempre y el stock se carga con − y +.
• Los platos del Intuitivo dicen de qué menú vienen, aunque se llamen igual en dos menús.
• "Por cobrar" (en Pedidos) junta lo que quedó sin cobrar de períodos cerrados, por cliente.`,
  },
  {
    key: '2026-10-21-chat',
    body: `Chat interno: conversaciones entre el equipo, con la foto de perfil de cada uno. Se abre desde el globito de la barra de arriba.`,
  },
  {
    key: '2026-10-22-periodo',
    body: `Cierre del período y reparto:
• La hoja "Conciliado" sale en el formato de la planilla, con el stock.
• La fecha de entrega se elige libre al cargar un pedido.
• Cliente NUEVO: se marca solo (primer pedido) y se puede cambiar en la ficha. Columna "¿Es nuevo?" en Pedidos.
• El sobrante de un período pasa al siguiente y se vende primero.
• La ruta del día separa efectivo y transferencia, y las transferencias cobradas de las que faltan.
• Al cerrar el período sale un informe en Excel.
• Las zonas desactivadas se pueden borrar, pasando sus pedidos y domicilios a otra zona.`,
  },
  {
    key: '2026-10-23-etiquetas',
    body: `Etiquetas 2.0: las etiquetas de producción, iguales a las de Illustrator, sobre el papel Husares H34124 (24 por hoja), sin configurar nada.
• Platos (horizontales) y menús (verticales), en la misma tanda.
• Grupos tildables con − y + para sumar o restar, sueltas con cantidad y "Empezar en la posición" para aprovechar una hoja usada.
• Lo impreso queda anotado: si algo se va a imprimir dos veces, avisa antes.
• Imprimir al 100 % ("Tamaño real") y sin márgenes.
El generador anterior sigue en "Versión anterior".`,
  },
  {
    key: '2026-10-23-orden-informe',
    body: `Un orden para todo: Keto 400, Keto 250, Antiage, Real, Vegetariano e Intuitivos, en planillas, etiquetas, informes y formularios.

Nuevo "Informe del período" (Pedidos → Columnas): el Excel de pedidos en columnas largas, como la planilla de siempre, con la hoja de Reparto. Un renglón por vianda, por día y en el orden de la ruta, con tiempo estimado de ruta, colores (naranja = nuevo, verde/rojo = cobrado o no, amarillo = franja pedida) y totales.`,
  },
  {
    key: '2026-10-24-rutas-etiquetas',
    body: `Rutas, etiquetas y pedidos:
• Rutas: cada ruta muestra de dónde sale y adónde vuelve (se configura en Ajustes → Reparto y se puede cambiar en la ruta), la franja horaria de cada pedido y los minutos entre paradas. Con la hora de salida, dice a qué hora se llega a cada una. "Abrir el recorrido en Google Maps" abre la ruta entera para ver los tiempos reales.
• Etiquetas: el Intuitivo ya no tiene etiqueta propia; cada plato lleva el menú del que viene, y los platos de cada Intuitivo se agregan por pedido. La tanda arranca vacía y en la vista previa se puede sacar una etiqueta con la "×".
• El número de pedido ya no sale en planillas, etiquetas ni hojas de reparto.
• Marcar un pedido como cobrado (o volverlo a pendiente) pide confirmación.
• En Nuevo pedido, "Día de reparto" ahora se llama "Zona".`,
  },
  {
    key: '2026-10-24-stock-lotes',
    body: `Stock de períodos anteriores:
• Lo que sobra al cerrar un período ya no se pierde ni hay que pasarlo a mano: queda solo como stock, con el nombre de su período ("Keto 400 · Octubre 2") y su ciudad.
• En Nuevo pedido, debajo de "Sale del stock", aparece lo que queda de cada período para el menú elegido. Se elige cuántas con − y +, a precio normal; el pedido puede ser sólo de stock.
• La vianda dice de qué período es en el pedido y en la planilla, no se vuelve a cocinar ni a etiquetar.
• Se vende hasta un mes después de su período. En Cocina → Stock se corrige o se da de baja.`,
  },
];
