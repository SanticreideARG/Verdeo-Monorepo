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
  {
    key: '2026-10-25-informe-rutas',
    body: `Informe del período, etiquetas y rutas:
• Etiquetas: los platos se cuentan por tamaño (Keto 400 y Keto 250 por separado). En las verticales se ven el Keto 400 y los Intuitivos (con el nombre y el tamaño); el resto, con "Mostrar más". Una casilla llena la última hoja con Keto 400.
• Informe: la hoja de Pedidos sin horario, tiempo de ruta, zona ni notas; naranja = nuevo por mail, marrón = nuevo por WhatsApp. En Reparto, un renglón por bulto, la transferencia en $0, el total del día sólo en efectivo y un resumen por reparto. Sin el "$" en tamaños y cantidades.
• Rutas: las paradas se reordenan arrastrando; la card muestra la franja horaria; el mapa marca la salida y la llegada.
• Quien reparte sólo ve los montos en efectivo, y el mensaje de WhatsApp lleva la segunda línea de la dirección.`,
  },
  {
    key: '2026-10-25-cancelado-a-stock',
    body: `Pedidos cancelados ya cocinados:
• Al cancelar un pedido confirmado, listo o entregado, el diálogo ofrece "Pasar las viandas a stock".
• Lo fijo se suma al stock de su variedad; un Intuitivo queda como stock propio, con sus platos.
• Se vende desde Nuevo pedido, como el resto del stock. El Intuitivo lleva sus platos aunque no estén en el menú de la semana.
• Si se reactiva el pedido, las viandas vuelven a él (salvo que ya se hayan vendido).`,
  },
  {
    key: '2026-10-27-periodo-y-nuevos',
    body: `Pedidos y clientes:
• En Pedidos, el período está siempre arriba, al lado de "Buscar" (también en el teléfono). Al elegir uno anterior, se ven todos sus pedidos.
• "Es cliente nuevo" al crear un cliente desde Nuevo pedido y al importar pedidos: destildalo si ya compraba antes. Los contactos importados de una planilla entran como clientes de siempre, salvo que se tilde "Son clientes nuevos".`,
  },
  {
    key: '2026-10-27-halloween',
    body: `🎃 Hasta el 1 de noviembre el panel se viste de Halloween: negro, naranja y verde, con telarañas y una calabaza. Vuelve tu tema solo cuando termina. Si no lo querés, sacalo en "Aa" → Temporada.`,
  },
  {
    key: '2026-10-28-correccion-menu',
    body: `Corregir un menú ya publicado: al guardar la corrección en la semana general, llega sola a todas las ciudades (antes las ciudades seguían vendiendo la carga original). Lo que una ciudad haya personalizado a mano no se pisa.`,
  },
  {
    key: '2026-10-27-cliente-nuevo-preferencia',
    body: `Al crear un cliente desde Nuevo pedido, "Es cliente nuevo" ahora viene sin tildar. Si preferís que venga tildado, elegilo en Ajustes → Apariencia, "Al tomar pedidos": es una preferencia de cada uno.`,
  },
  {
    key: '2026-10-27-etiquetas-pdf-stock-intuitivo',
    body: `• Etiquetas: "Descargar PDF" baja la hoja en A4 exacto, lista para imprimir a tamaño real, y abajo están los pasos para que calce.
• Nuevo pedido: en pantallas anchas el formulario se abre en dos columnas, el cliente a la izquierda y el pedido a la derecha.
• Cocina: un Intuitivo de un período anterior (hasta 4 meses) se puede cargar a mano al stock, con su nombre y sus platos.`,
  },
  {
    key: '2026-10-28-planillas-y-cancelados',
    body: `• Cocina: cada planilla que sale queda anotada. Arriba se ve qué pedidos cambiaron desde la última (nuevos, cancelados, cambiados) y se puede volver a bajar cualquiera tal como salió.
• Cancelar un pedido que ya salió en la planilla avisa y deja tildado "Pasar a stock". Si se canceló sin pasarlo y estaba cocinado, en el pedido está "Pasar sus viandas a stock".
• Informe del período: los cancelados van aparte, uno por uno, diciendo si se cocinaron y si pasaron al stock.
• Pedidos: con la lista partida ("Cargar más"), el pie muestra los totales de todo el período, igual que el informe.`,
  },
  {
    key: '2026-10-28-editar-desde-lista',
    body: `Pedidos: el menú ⋯ de cada pedido tiene "Editar", que abre la ficha ya en edición.`,
  },
  {
    key: '2026-10-28-estadisticas-nuevas',
    body: `Estadísticas, renovada:
• Un carrusel de gráficos que pasa solo: ingresos por día, ventas por período, cobrado y por cobrar, clientes nuevos y recurrentes, y la mezcla de menús.
• "Lo que pasó": récords, cambios fuertes en la mezcla, lo que falta cobrar cerca del cierre, clientes de siempre que no pidieron y más.
• Análisis contable por período y ciudad, con el detalle por medio de pago y descarga en Excel. Da lo mismo que el informe del período.
• Con un rango de fechas, cada indicador se compara solo con el período anterior.`,
  },
];
