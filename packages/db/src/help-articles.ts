import type { helpArticles } from './schema/index.js';

/**
 * Los artículos de ayuda que trae el sistema.
 *
 * Viven acá y no dentro de `seed.ts` para poder actualizarlos solos. El seed completo también
 * escribe permisos, roles y concesiones: correrlo en producción sólo para corregir un texto de
 * ayuda arriesga pisar configuración que alguien ajustó a mano.
 */
export const DEFAULT_HELP_ARTICLES: (typeof helpArticles.$inferInsert)[] = [
  {
    body: 'Verdeo se organiza por secciones en el menú lateral: cada una corresponde a una parte de la operación (pedidos, cocina, clientes, etc.). Solo ves las secciones para las que tenés permiso — si te falta acceso a algo, pedíselo a un administrador.',
    category: 'General',
    key: 'general-bienvenida',
    ordinal: 0,
    requiredPermission: null,
    title: 'Cómo está organizado Verdeo',
  },
  {
    body: '"Tomar y confirmar pedidos" ofrece dos formas de elegir cliente: "Buscar cliente" (por nombre o número, para clientes existentes) y "Nuevo cliente" (alta rápida con nombre y teléfono). Elegí el origen del pedido con cuidado — algunos orígenes (como "Venta de oportunidad") activan validaciones extra contra el excedente disponible.',
    category: 'Pedidos',
    key: 'pedidos-tomar-pedido',
    ordinal: 0,
    requiredPermission: 'orders.read',
    title: 'Tomar un pedido nuevo',
  },
  {
    body: 'En "Ver pedidos" podés filtrar por estado, buscar por número o cliente, y exportar a CSV. Cada pedido tiene su propio historial de estados y de ediciones (con motivo), visible desde su detalle.',
    category: 'Pedidos',
    key: 'pedidos-ver-pedidos',
    ordinal: 1,
    requiredPermission: 'orders.read',
    title: 'Buscar y filtrar pedidos',
  },
  {
    body: '"Cierre de pedidos" consolida la demanda confirmada del ciclo por variedad y tamaño, separando las unidades base de las Intuitivo (que llevan su propia composición). Desde ahí podés informar producción real, tomar snapshots parcial/final, y generar las etiquetas de cocina bajo demanda.',
    category: 'Cocina',
    key: 'cocina-cierre-pedidos',
    ordinal: 0,
    requiredPermission: 'production.read',
    title: 'Cierre de pedidos y producción',
  },
  {
    body: 'El botón "Generar etiquetas" abre una página imprimible con una etiqueta por unidad física del ciclo (o de un pedido puntual, desde su detalle). El formato de hoja (etiquetas por página) y el fondo se configuran una sola vez en Ajustes → Etiquetas.',
    category: 'Cocina',
    key: 'cocina-etiquetas',
    ordinal: 1,
    requiredPermission: 'production.read',
    title: 'Generar etiquetas de cocina',
  },
  {
    body: 'La ficha de cada cliente guarda direcciones, restricciones alimentarias, e historial de pedidos. Al dar de alta un cliente nuevo elegí siempre una ciudad — es lo que determina en qué operación queda el cliente.',
    category: 'Clientes',
    key: 'clientes-ficha',
    ordinal: 0,
    requiredPermission: 'customers.read',
    title: 'Ficha de cliente',
  },
  {
    body: 'Desde "Encuestas" armás un cuestionario con preguntas de texto libre o de opciones, y lo enviás a un cliente puntual: se genera un enlace y un QR de un solo uso. Los resultados agregados (sin identificar quién respondió qué) se ven en "Resultados" de cada encuesta.',
    category: 'Clientes',
    key: 'clientes-encuestas',
    ordinal: 1,
    requiredPermission: 'surveys.read',
    title: 'Encuestas a clientes',
  },
  {
    body: 'Auditoría muestra cada mutación relevante del sistema (quién, qué, cuándo) con filtros por entidad, acción y fecha. Es de solo lectura — registra lo que otros servicios ya escriben, no permite modificar nada.',
    category: 'Administración',
    key: 'admin-auditoria',
    ordinal: 0,
    requiredPermission: 'audit.read',
    title: 'Auditoría del sistema',
  },

  /*
   * El ciclo semanal, paso a paso.
   *
   * Es la única categoría que cuenta un proceso y no una pantalla: cada paso vive en un lugar
   * distinto de la app, y lo que se pierde sin esto es el orden y por qué ese orden. Va primero
   * en la lista de categorías (ordinal 0 en cada artículo, orden entre artículos por número de
   * paso) para que sea lo primero que encuentre alguien que recién entra.
   */
  {
    body: 'Una semana de Verdeo va de armar el menú a cobrar la última vianda, y los pasos tienen un orden que conviene respetar: cada uno usa lo que dejó el anterior.\n\n1. Configurar la semana y publicarla.\n2. Tomar pedidos y confirmarlos.\n3. Cerrar y consolidar producción.\n4. Imprimir etiquetas.\n5. Armar la ruta de reparto.\n6. Marcar lo cobrado.\n\nLos artículos que siguen explican cada paso. Si algo salió mal, casi siempre es porque un paso se hizo antes que el anterior — por ejemplo, generar la ruta antes de confirmar los pedidos deja la ruta vacía.',
    category: 'Ciclo semanal',
    key: 'ciclo-vista-general',
    ordinal: 0,
    requiredPermission: null,
    title: 'Cómo es una semana, de principio a fin',
  },
  {
    body: 'En "Configurar la semana" cargás el período completo: el alias con el que vas a reconocerlo, la apertura (desde cuándo se toman pedidos), el parcial de cocina y el cierre.\n\nDespués van los precios por tamaño y las variedades, con sus cinco platos cada una. El precio depende del tamaño y no de la variedad: dos variedades del mismo tamaño valen lo mismo. Si ofrecés Intuitivo, se arma solo con los platos publicados esa semana.\n\nAl publicar, la semana se lleva sola a todas las localidades activas. No hace falta repetir la carga por ciudad; lo único que se ajusta por ciudad son los precios, en "Precios por ubicación".\n\nMientras la semana esté en borrador nadie puede pedir de ella. Publicarla es lo que la abre.',
    category: 'Ciclo semanal',
    key: 'ciclo-1-configurar',
    ordinal: 1,
    requiredPermission: 'production.generate',
    title: 'Paso 1 — Configurar y publicar la semana',
  },
  {
    body: 'Los pedidos entran en "Tomar y confirmar pedidos". Cada uno arranca como borrador: queda guardado pero todavía no cuenta como demanda.\n\nConfirmarlo es lo que lo mete en la producción de la semana. Hasta que no lo confirmes, cocina no lo ve y la ruta no lo levanta.\n\nSe puede editar todo —incluidos los ítems— tanto en borrador como confirmado; cada cambio pide un motivo y queda en el historial del pedido. Cancelar también pide un motivo, elegido de la lista: es lo que después permite saber cuántas entregas fallaron y por qué.',
    category: 'Ciclo semanal',
    key: 'ciclo-2-pedidos',
    ordinal: 2,
    requiredPermission: 'orders.read',
    title: 'Paso 2 — Tomar pedidos y confirmarlos',
  },
  {
    body: 'En "Cocina" generás el consolidado del ciclo: cuántas unidades de cada variedad y tamaño hay que producir, más las Intuitivo una por una con su composición y las restricciones alimentarias marcadas aparte.\n\nEl parcial que cargaste al configurar la semana es el corte para mirar la demanda a mitad de camino y empezar a comprar; el cierre es el número contra el que se produce. Podés tomar un snapshot en cada momento: el final muestra además el delta contra el parcial, que es cuánto se movió la demanda sobre el final.\n\nDespués de producir, informá la producción real. Eso es lo que habilita el cálculo de excedente y las ventas de oportunidad.',
    category: 'Ciclo semanal',
    key: 'ciclo-3-cocina',
    ordinal: 3,
    requiredPermission: 'production.read',
    title: 'Paso 3 — Cerrar y consolidar producción',
  },
  {
    body: 'Desde "Cocina" → "Generar etiquetas" sale una hoja imprimible con una etiqueta por unidad física de todo el ciclo. Es el camino normal: por lote, no de a un pedido.\n\nQué dice cada etiqueta se configura una sola vez en Ajustes → Etiquetas: el nombre del cliente va siempre, y elegís qué más se imprime (tamaño, variedad, unidad, número de pedido, zona, fecha, indicaciones alimentarias). También la tipografía, el tamaño de letra, la alineación y el fondo.\n\nSi el fondo no sale impreso, revisá que en el diálogo de impresión estén activados los gráficos de fondo.\n\nDesde la ficha de un pedido podés reimprimir sólo esas etiquetas, para una vianda suelta.',
    category: 'Ciclo semanal',
    key: 'ciclo-4-etiquetas',
    ordinal: 4,
    requiredPermission: 'production.read',
    title: 'Paso 4 — Imprimir las etiquetas',
  },
  {
    body: 'En "Rutas" proponés una ruta para una ciudad y una fecha. El sistema levanta todos los pedidos confirmados de ese día con dirección geocodificada y los ordena solo.\n\nSi la ruta sale vacía, es por una de dos: no hay pedidos confirmados para ese día, o las direcciones no están geocodificadas. Lo segundo se resuelve en la ficha del cliente.\n\nPodés reordenar las paradas a mano y asignar un repartidor a cada una. Nada llega a la app del repartidor hasta que publicás la ruta.\n\nPara pasarle la ruta a alguien sin que use la app: "Copiar para el repartidor" arma un mensaje con las paradas en orden y el enlace de ubicación de cada una, listo para mandar por chat. "Descargar planilla" es lo mismo en Excel.',
    category: 'Ciclo semanal',
    key: 'ciclo-5-rutas',
    ordinal: 5,
    requiredPermission: 'routes.read',
    title: 'Paso 5 — Armar y publicar la ruta',
  },
  {
    body: 'En "Ver pedidos" hay una columna "Cobrado" con un tilde. Es todo el circuito de cobro: se marca cuando entró la plata, y queda registrado quién lo marcó y cuándo.\n\nEl "Pago esperado" de cada pedido es otra cosa: es cómo se acordó cobrar (efectivo, transferencia), y se elige al tomar el pedido. Que esté acordado no quiere decir que esté cobrado.\n\nSi la columna no se ve, activala desde el botón "Columnas".',
    category: 'Ciclo semanal',
    key: 'ciclo-6-cobrar',
    ordinal: 6,
    requiredPermission: 'orders.read',
    title: 'Paso 6 — Marcar lo cobrado',
  },
];
