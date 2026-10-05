import type { helpArticles } from './schema/index.js';

/**
 * Los artículos de ayuda que trae el sistema.
 *
 * Viven acá y no dentro de `seed.ts` para poder actualizarlos solos. El seed completo también
 * escribe permisos, roles y concesiones: correrlo en producción sólo para corregir un texto de
 * ayuda arriesga pisar configuración que alguien ajustó a mano.
 *
 * Cómo se escriben (los lee la lechuza del panel, `OperatorAssistant.tsx`):
 * - La categoría es una ruta: "Pedidos / Editar y cancelar" cuelga de Pedidos.
 * - `[[clave]]` enlaza otro artículo; `[texto](/app/ruta)` lleva a la pantalla.
 * - Cada artículo se gatea con el mismo permiso que la pantalla de la que habla.
 */
export const DEFAULT_HELP_ARTICLES: (typeof helpArticles.$inferInsert)[] = [
  // --- General ---------------------------------------------------------------------------------
  {
    body: 'Verdeo se organiza por secciones en el menú lateral: cada una corresponde a una parte de la operación (pedidos, cocina, clientes, reparto). Sólo ves las secciones para las que tenés permiso; si te falta acceso a algo, pedíselo a un administrador.\n\nEsta ayuda está siempre en la lechuza de abajo a la derecha. Podés navegarla por temas o buscar una palabra arriba.\n\nSi recién empezás, lo mejor es leer [[ciclo-vista-general]].',
    category: 'General',
    key: 'general-bienvenida',
    ordinal: 0,
    requiredPermission: null,
    title: 'Cómo está organizado Verdeo',
  },
  {
    body: 'El selector "Ciudad" de la barra de arriba decide qué ves en todo el panel: pedidos, clientes, cocina y rutas se filtran por esa ciudad.\n\nQuien tiene acceso a varias ciudades puede elegir "Todas las ciudades" para ver el total. Para cargar algo que pertenece a una ciudad —un pedido, una ruta— conviene tener elegida esa ciudad.\n\nSi no encontrás un pedido o un cliente que sabés que existe, lo primero es revisar la ciudad elegida.',
    category: 'General',
    key: 'general-ciudad',
    ordinal: 1,
    requiredPermission: null,
    title: 'La ciudad de arriba',
  },

  // --- Pedidos ---------------------------------------------------------------------------------
  {
    body: '"Pedidos" es la única pantalla de pedidos: se toman, se confirman, se buscan y se cobran en el mismo lugar. El botón "+ Nuevo pedido" abre el formulario, que ofrece dos formas de elegir cliente: "Buscar cliente" (por nombre o número, para clientes existentes) y "Nuevo cliente" (alta rápida con nombre y teléfono).\n\nDespués elegís la variedad y el tamaño. El precio depende del tamaño, no de la variedad. El medio de pago sale de la lista configurada en [Ajustes → Métodos de pago](/app/ajustes/pagos).\n\nAl elegir un cliente que ya existe, su domicilio se completa solo, y se puede cambiar para esa entrega. El período no se pregunta: hay uno abierto por vez.\n\nEl pedido queda como borrador hasta que lo confirmás: ver [[ciclo-2-pedidos]].\n\n[Ir a Pedidos](/app/pedidos)',
    category: 'Pedidos / Tomar pedidos',
    key: 'pedidos-tomar-pedido',
    ordinal: 0,
    requiredPermission: 'orders.read',
    title: 'Tomar un pedido nuevo',
  },
  {
    body: 'Los clientes también pueden pedir solos desde el formulario de la web (la página /pedido): eligen la variedad con su logo, el tamaño con su precio y el medio de pago.\n\nEsos pedidos entran pendientes de confirmar. El número junto a "Pedidos", en el menú lateral, dice cuántos están esperando.\n\nQué campos pide el formulario se ajusta por ciudad: ver [[ajustes-indicaciones]].',
    category: 'Pedidos / Tomar pedidos',
    key: 'pedidos-formulario-web',
    ordinal: 1,
    requiredPermission: 'orders.read',
    title: 'Pedidos que llegan por la web',
  },
  {
    body: 'En "Pedidos" podés filtrar por estado y buscar por número o cliente. Arriba de la tabla se ve cuántos pedidos coinciden, y al pie los totales.\n\nPara ordenar, tocá el encabezado de una columna: Estado agrupa por estado, Pedido por tipo de pedido, y así con cada una.\n\nEl botón "Columnas" elige qué se ve en la tabla. "Exportar a Excel" baja exactamente lo filtrado.\n\n[Ir a Pedidos](/app/pedidos)',
    category: 'Pedidos / Ver y exportar',
    key: 'pedidos-ver-pedidos',
    ordinal: 0,
    requiredPermission: 'orders.read',
    title: 'Buscar, ordenar y exportar pedidos',
  },
  {
    body: 'En "Pedidos", dentro del botón "Columnas", está "Mostrar apellidos". Si lo desactivás, los apellidos se ven tapados en la tabla y en el Excel que exportes.\n\nSirve para compartir la planilla con alguien de afuera, o proyectarla, sin exponer datos de los clientes.',
    category: 'Pedidos / Ver y exportar',
    key: 'pedidos-apellidos',
    ordinal: 1,
    requiredPermission: 'orders.read',
    title: 'Tapar los apellidos',
  },
  {
    body: 'Desde el detalle de un pedido se puede modificar todo, incluidos los ítems, tanto en borrador como confirmado. El motivo del cambio es opcional: si lo escribís, queda en el historial del pedido.\n\nA la derecha (abajo, en el teléfono) está el mapa con el domicilio de entrega, para chequear que la dirección esté bien antes de armar la ruta.\n\nEl campo de indicaciones para cocina sólo aparece si la ciudad las pide: ver [[ajustes-indicaciones]].',
    category: 'Pedidos / Editar y cancelar',
    key: 'pedidos-editar',
    ordinal: 0,
    requiredPermission: 'orders.read',
    title: 'Modificar un pedido',
  },
  {
    body: 'Cancelar un pedido pide un motivo elegido de la lista. Es lo que después permite saber cuántas entregas fallaron y por qué.\n\nUn pedido cancelado deja de contar para cocina y para la ruta, pero no se borra: sigue en el historial del cliente.',
    category: 'Pedidos / Editar y cancelar',
    key: 'pedidos-cancelar',
    ordinal: 1,
    requiredPermission: 'orders.read',
    title: 'Cancelar un pedido',
  },
  {
    body: 'Eliminar no es lo mismo que cancelar, y casi siempre lo que hace falta es cancelar.\n\nUn pedido **cancelado** queda a la vista con su motivo: dejó de contar para la producción y para los totales, pero se puede mirar y explicar. Es lo que corresponde cuando una venta existió y no se concretó.\n\nUn pedido **eliminado** desaparece: se van también sus ítems, su historial, sus pagos y su parada de reparto. No hay papelera y no se puede deshacer. Está pensado para lo que nunca fue una venta, como los pedidos de prueba de antes de abrir.\n\nEl botón pide escribir por qué, y eso no es un trámite: una vez borrado el pedido, ese motivo es lo único que queda para saber qué pasó. Queda guardado junto con el número, el cliente, el estado y el total.\n\nSi el pedido figura como cobrado, el aviso lo dice antes de confirmar: ese registro de plata también se borra.\n\nEl permiso no lo tiene nadie por defecto. Si el botón no te aparece, es eso — y se pide a quien administra.',
    category: 'Pedidos / Editar y cancelar',
    key: 'pedidos-eliminar',
    ordinal: 2,
    requiredPermission: 'orders.delete',
    title: 'Eliminar un pedido (no es cancelar)',
  },
  {
    body: 'El cobro se marca con el tilde de la columna "Cobrado", en "Pedidos". El paso a paso está en [[ciclo-6-cobrar]].',
    category: 'Pedidos / Cobros',
    key: 'pedidos-cobros',
    ordinal: 0,
    requiredPermission: 'orders.read',
    title: 'Dónde se marca lo cobrado',
  },

  // --- Cocina ----------------------------------------------------------------------------------
  {
    body: '"Cocina" consolida la demanda confirmada del ciclo por variedad y tamaño, separando las unidades base de las Intuitivo (que llevan su propia composición). Desde ahí podés informar producción real, tomar snapshots parcial y final, y generar las etiquetas.\n\nEl orden de todo esto dentro de la semana está en [[ciclo-3-cocina]].\n\n[Ir a Cocina](/app/cocina)',
    category: 'Cocina',
    key: 'cocina-cierre-pedidos',
    ordinal: 0,
    requiredPermission: 'production.read',
    title: 'Cierre de pedidos y producción',
  },
  {
    body: 'La sección "Etiquetas" arma la tanda: elegís el período y, si querés, una zona; dice cuántas etiquetas y cuántas hojas salen, y muestra a la derecha la hoja completa y una etiqueta a tamaño real antes de imprimir.\n\nEl tamaño de hoja, los márgenes, cuántas entran, qué dice cada etiqueta y el fondo se configuran en la misma pantalla: [Ir a Etiquetas](/app/etiquetas). Más detalle en [[ciclo-4-etiquetas]].',
    category: 'Cocina',
    key: 'cocina-etiquetas',
    ordinal: 1,
    requiredPermission: 'production.read',
    title: 'Generar etiquetas de cocina',
  },

  // --- Reparto ---------------------------------------------------------------------------------
  {
    body: 'En "Rutas", con la ciudad elegida arriba, elegís la zona y la fecha y tocás "+ Proponer ruta". El sistema levanta los pedidos confirmados o listos de ese día y esa zona, con dirección geocodificada, y los ordena solo.\n\nSi aparece "Ruta creada, pero sin paradas", es por una de dos: no hay pedidos por repartir ese día en esa zona, o sus direcciones no están geocodificadas (se resuelve en la ficha del cliente).\n\nPodés reordenar las paradas a mano. Nada llega a la app del repartidor hasta que tocás "Publicar la ruta".\n\n[Ir a Rutas](/app/reparto/rutas)',
    category: 'Reparto / Rutas',
    key: 'reparto-proponer',
    ordinal: 0,
    requiredPermission: 'routes.read',
    title: 'Proponer una ruta por zona',
  },
  {
    body: 'Una ruta propuesta que todavía no se publicó se puede tirar con "Descartar". Pide confirmación y no toca los pedidos: vuelven a quedar disponibles para otra ruta.\n\nEs lo que conviene hacer si la propuesta salió con la zona o la fecha equivocada: descartarla y proponer de nuevo.',
    category: 'Reparto / Rutas',
    key: 'reparto-descartar',
    ordinal: 1,
    requiredPermission: 'routes.read',
    title: 'Descartar una propuesta',
  },
  {
    body:
      'La ruta publicada tiene un botón "Enlace para el repartidor". Genera una dirección web que abre la hoja del día en cualquier teléfono, sin usuario ni contraseña: se la mandás por WhatsApp a quien reparte y listo.' +
      '\n\nNo hay cuentas de repartidor. Quien reparte hoy puede no ser quien reparte mañana, así que lo que se entrega es el acceso a una ruta, no a un usuario del sistema. El enlace vence en 24 horas, y generar uno nuevo da de baja el anterior — si se lo pasaste a la persona equivocada, generá otro y el primero deja de abrir. "Dar de baja el enlace" lo corta sin tocar la ruta.' +
      '\n\nSólo se puede generar sobre una ruta publicada: un borrador todavía se puede reordenar, y una hoja que cambia debajo de quien ya salió es peor que no tener hoja.' +
      '\n\nVer [[reparto-sitio]] para qué ve y qué puede hacer desde ahí.',
    category: 'Reparto / Rutas',
    key: 'reparto-mensaje',
    ordinal: 2,
    requiredPermission: 'routes.read',
    title: 'El enlace para el repartidor',
  },
  {
    body:
      'El enlace abre una hoja pensada para un teléfono en una mano y una caja en la otra: una parada por tarjeta, en orden.' +
      '\n\nCada parada dice qué entregar (por ejemplo "Menú Keto 400" o "Intuitivo 250 · Ana"), la dirección, cómo entrar si el domicilio tiene indicaciones, en qué horario recibe ese cliente, y cuánto cobrar o que ya está pagado. Arriba está el mapa con todas las paradas y, siempre a la vista, cuánto lleva cobrado: es lo que hay que rendir al volver.' +
      '\n\nAl confirmar una parada se elige "Entregada y cobrada" o "Entregada sin cobrar", y se puede dejar una nota ("no estaba, dejé con el vecino"). Lo cobrado queda registrado en el acto: el pedido pasa a entregado y la plata en efectivo queda para rendir.' +
      '\n\nTambién puede avisarle al cliente que va en camino o que llegó, y marcar "No se pudo entregar" eligiendo el motivo de la lista. Una parada que no se pudo entregar tiene que poder decirse ahí: si no, queda pendiente para siempre o se marca entregada, que es peor.' +
      '\n\nNo muestra apellidos, teléfonos ni el historial del cliente — el enlace viaja por WhatsApp y puede terminar en cualquier lado.' +
      '\n\nDesde el panel, mirando la ruta, ves cómo va: cuántas entregó, cuánto cobró y cuánto falta.',
    category: 'Reparto / Rutas',
    key: 'reparto-sitio',
    ordinal: 3,
    requiredPermission: 'routes.read',
    title: 'Qué ve quien reparte',
  },

  // --- Clientes --------------------------------------------------------------------------------
  {
    body: 'La ficha de cada cliente guarda direcciones, restricciones alimentarias e historial de pedidos.\n\nCada domicilio lleva una zona, y la zona es la que decide de qué ciudad es el pedido. Por eso un domicilio sin zona no se puede usar para entregar.\n\n[Ir a Clientes](/app/clientes)',
    category: 'Clientes',
    key: 'clientes-ficha',
    ordinal: 0,
    requiredPermission: 'customers.read',
    title: 'Ficha de cliente',
  },
  {
    body: 'Un cliente sin pedidos se borra del todo. Uno que ya tiene pedidos no se borra: se archiva, para que su historial y los números de la semana no cambien: sus pedidos siguen ahí.\n\nEn los dos casos queda registrado en la auditoría quién lo hizo.',
    category: 'Clientes',
    key: 'clientes-eliminar',
    ordinal: 1,
    requiredPermission: 'customers.delete',
    title: 'Eliminar un cliente',
  },
  {
    body: 'En "Encuestas" armás un cuestionario con preguntas de texto libre o de opciones. Se puede mandar de dos formas:\n\n- A un cliente puntual: un enlace y un QR de un solo uso.\n- Con un enlace abierto: cualquiera que lo tenga responde una vez, sin iniciar sesión, y termina en una página de agradecimiento.\n\nLos resultados agregados, sin identificar quién respondió qué, están en "Resultados" de cada encuesta. Una encuesta que ya no sirve se puede eliminar.\n\n[Ir a Encuestas](/app/encuestas)',
    category: 'Clientes / Encuestas',
    key: 'clientes-encuestas',
    ordinal: 0,
    requiredPermission: 'surveys.read',
    title: 'Encuestas a clientes',
  },

  // --- Ajustes ---------------------------------------------------------------------------------
  {
    body: 'En [Ajustes → Zonas geográficas](/app/ajustes/zonas) están las ciudades y sus zonas. Cada ciudad tiene su prefijo de pedido (por ejemplo MZA-00001) y su WhatsApp de contacto.\n\nUna ciudad nueva necesita al menos una zona antes de poder cargar domicilios, y el menú de la semana distribuido con sus precios antes de poder vender.',
    category: 'Ajustes',
    key: 'ajustes-ciudades-zonas',
    ordinal: 0,
    requiredPermission: 'sites.read',
    title: 'Ciudades y zonas',
  },
  {
    body: 'La lista de "Medio de pago" que se ve al tomar un pedido —y en el formulario de la web— se arma en [Ajustes → Métodos de pago](/app/ajustes/pagos).\n\nSacar un método de la lista no cambia los pedidos que ya lo tenían.',
    category: 'Ajustes',
    key: 'ajustes-medios-pago',
    ordinal: 1,
    requiredPermission: 'payments.read',
    title: 'Métodos de pago',
  },
  {
    body: 'En [Ajustes → Menú personalizado](/app/ajustes/menu) cada ciudad tiene dos interruptores:\n\n- Intuitivo: si se ofrece o no en esa ciudad.\n- Indicaciones alimentarias: "Pedir indicaciones" muestra el campo en el formulario y en el pedido; "No pedir indicaciones" lo saca de todos lados.',
    category: 'Ajustes',
    key: 'ajustes-indicaciones',
    ordinal: 2,
    requiredPermission: 'production.read',
    title: 'Intuitivo e indicaciones por ciudad',
  },
  {
    body: 'La lechuza de la web pública se configura en [Ajustes → Asistente de la web](/app/ajustes/asistente): qué opciones ofrece, qué responde cada una y a qué WhatsApp deriva.\n\nLos cambios quedan en borrador hasta que los publicás. Ahí mismo se ve cuántas veces se tocó cada opción.',
    category: 'Ajustes',
    key: 'ajustes-asistente-web',
    ordinal: 3,
    requiredPermission: 'cms.read',
    title: 'El asistente de la web',
  },

  // --- Avisos ----------------------------------------------------------------------------------
  {
    body: 'Avisar a los clientes es a mano: el aviso sale de tu WhatsApp, no del sistema. "Avisos" no manda nada — lleva la cuenta de a quién ya se le avisó, que es lo que se pierde cuando son cien.\n\nArriba elegís el período, cuál de los mensajes guardados querés mandar y, si querés, una zona. Abajo aparece una tarjeta por pedido confirmado, con el texto ya armado con los datos de ese cliente.\n\n"Abrir WhatsApp y marcar" abre el chat con el texto escrito y marca la fila como avisada en el mismo gesto: apretás enviar en WhatsApp y volvés. Si alguien no tiene WhatsApp cargado, el botón no está y queda "Copiar texto"; el número se completa en la ficha del cliente.\n\n"Saltear" sirve para los que decidís no avisar, y deja constancia de que fue una decisión y no un olvido.\n\nEl tilde "Sólo los que faltan" viene puesto. Destildalo para repasar la vuelta entera y ver que no quedó nadie.\n\nLos textos se escriben una vez: ver [[avisos-plantillas]].\n\n[Ir a Avisos](/app/avisos)',
    category: 'Avisos',
    key: 'avisos-mandar',
    ordinal: 0,
    requiredPermission: 'messages.templates.use',
    title: 'Avisar a los clientes por WhatsApp',
  },
  {
    body: 'Los avisos que se mandan todas las semanas se escriben una vez, en [Panel de control → Mensajes guardados](/app/ajustes/plantillas).\n\nDonde va un dato del pedido se pone una variable, y el sistema la reemplaza por cliente: el nombre, el número de pedido, el total, la fecha de entrega, la zona, la ventana de reparto, el medio de pago, la ciudad. No hace falta escribirlas a mano — hay un botón por cada una.\n\nAbajo del formulario se ve cómo va a quedar el mensaje con valores de ejemplo. Conviene leerlo antes de guardar: es la forma de darse cuenta de que la oración no cierra.\n\nSi un dato no está cargado para un cliente, esa parte del mensaje desaparece en lugar de quedar escrita a medias.\n\nUn mensaje que ya no se usa se destilda en "En uso": deja de aparecer en Avisos, pero los que ya mandaste siguen anotados.',
    category: 'Avisos',
    key: 'avisos-plantillas',
    ordinal: 1,
    requiredPermission: 'messages.templates.use',
    title: 'Escribir los mensajes guardados',
  },
  // --- Administración --------------------------------------------------------------------------
  {
    body: 'En "Usuarios" se da de alta al equipo, se le asigna un rol y las ciudades en las que trabaja. El rol define los permisos. Si alguien necesita algo puntual que su rol no tiene, se agrega como excepción de permisos, en la sección plegable de su ficha.\n\n[Ir a Usuarios](/app/usuarios)',
    category: 'Administración',
    key: 'admin-usuarios',
    ordinal: 0,
    requiredPermission: 'users.read',
    title: 'Usuarios, roles y permisos',
  },
  {
    body: 'Auditoría muestra cada mutación relevante del sistema (quién, qué, cuándo) con filtros por entidad, acción y fecha. Es de sólo lectura: registra lo que otros servicios ya escriben, no permite modificar nada.\n\n[Ir a Auditoría](/app/auditoria)',
    category: 'Administración',
    key: 'admin-auditoria',
    ordinal: 1,
    requiredPermission: 'audit.read',
    title: 'Auditoría del sistema',
  },
  {
    body: '"Estadísticas" resume pedidos y ventas por período, ciudad y menú. Los menús se agrupan por nombre sin importar mayúsculas: "Menú Keto" y "MENÚ KETO" cuentan como el mismo.\n\n[Ir a Estadísticas](/app/estadisticas)',
    category: 'Administración',
    key: 'admin-estadisticas',
    ordinal: 2,
    requiredPermission: 'stats.read',
    title: 'Estadísticas',
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
    body: 'Una semana de Verdeo va de armar el menú a cobrar la última vianda, y los pasos tienen un orden que conviene respetar: cada uno usa lo que dejó el anterior.\n\n1. Configurar la semana y publicarla.\n2. Tomar pedidos y confirmarlos.\n3. Cerrar y consolidar producción.\n4. Imprimir etiquetas.\n5. Armar la ruta de reparto.\n6. Marcar lo cobrado.\n\nLos artículos que siguen explican cada paso. Si algo salió mal, casi siempre es porque un paso se hizo antes que el anterior: por ejemplo, generar la ruta antes de confirmar los pedidos deja la ruta vacía.\n\nEmpezá por [[ciclo-1-configurar]].',
    category: 'Ciclo semanal',
    key: 'ciclo-vista-general',
    ordinal: 0,
    requiredPermission: null,
    title: 'Cómo es una semana, de principio a fin',
  },
  {
    body: 'El botón para armar una semana está dentro de "Periodos", arriba a la derecha. Ahí cargás el período completo: el alias con el que vas a reconocerlo, la apertura (desde cuándo se toman pedidos), el parcial de cocina y el cierre.\n\nDespués van los precios por tamaño y las variedades, con sus cinco platos cada una. El precio depende del tamaño y no de la variedad: dos variedades del mismo tamaño valen lo mismo. Si ofrecés Intuitivo, se arma solo con los platos publicados esa semana.\n\nAl publicar, la semana se lleva sola a todas las localidades activas. No hace falta repetir la carga por ciudad; lo único que se ajusta por ciudad son los precios, en [Precios por ubicación](/app/menus/precios).\n\nMientras la semana esté en borrador nadie puede pedir de ella. Publicarla es lo que la abre.\n\n[Ir a Configurar la semana](/app/menus/nuevo) · Sigue: [[ciclo-2-pedidos]]',
    category: 'Ciclo semanal',
    key: 'ciclo-1-configurar',
    ordinal: 1,
    requiredPermission: 'production.generate',
    title: 'Paso 1 — Configurar y publicar la semana',
  },
  {
    body: 'Los pedidos entran en "Pedidos", con el botón "+ Nuevo pedido". Cada uno arranca como borrador: queda guardado pero todavía no cuenta como demanda.\n\nConfirmarlo es lo que lo mete en la producción de la semana. Hasta que no lo confirmes, cocina no lo ve y la ruta no lo levanta.\n\nSe puede editar todo —incluidos los ítems— tanto en borrador como confirmado: ver [[pedidos-editar]]. Cancelar pide un motivo de la lista: ver [[pedidos-cancelar]].\n\n[Ir a Pedidos](/app/pedidos) · Sigue: [[ciclo-3-cocina]]',
    category: 'Ciclo semanal',
    key: 'ciclo-2-pedidos',
    ordinal: 2,
    requiredPermission: 'orders.read',
    title: 'Paso 2 — Tomar pedidos y confirmarlos',
  },
  {
    body: 'En "Cocina" generás el consolidado del ciclo: cuántas unidades de cada variedad y tamaño hay que producir, más las Intuitivo una por una con su composición y las restricciones alimentarias marcadas aparte.\n\nEl parcial que cargaste al configurar la semana es el corte para mirar la demanda a mitad de camino y empezar a comprar; el cierre es el número contra el que se produce. Podés tomar un snapshot en cada momento: el final muestra además el delta contra el parcial, que es cuánto se movió la demanda sobre el final.\n\nDespués de producir, informá la producción real. Eso es lo que habilita el cálculo de excedente y las ventas de oportunidad.\n\n[Ir a Cocina](/app/cocina) · Sigue: [[ciclo-4-etiquetas]]',
    category: 'Ciclo semanal',
    key: 'ciclo-3-cocina',
    ordinal: 3,
    requiredPermission: 'production.read',
    title: 'Paso 3 — Cerrar y consolidar producción',
  },
  {
    body: 'En "Etiquetas" sale una hoja imprimible con una etiqueta por unidad física. Podés imprimir el ciclo entero o sólo una zona, que es como cocina termina de producir.\n\nQué dice cada etiqueta se configura en la sección [Etiquetas](/app/etiquetas): el nombre del cliente va siempre, y elegís qué más se imprime (tamaño, variedad, unidad, número de pedido, zona, fecha, indicaciones alimentarias). También la hoja y sus márgenes, la tipografía (doce, todas del sistema), el tamaño de letra, la alineación y el fondo. Dos interruptores deciden cuánto nombre lleva: "Sin apellido" deja el nombre y las iniciales, y "Nombre sólo en las Intuitivo" lo saca del resto, porque una vianda estándar ya se identifica por variedad y tamaño. La vista previa de la derecha muestra la etiqueta a tamaño real, así que se puede comprobar sin gastar papel.\n\nSi el fondo no sale impreso, revisá que en el diálogo de impresión estén activados los gráficos de fondo.\n\nDesde la ficha de un pedido podés reimprimir sólo esas etiquetas, para una vianda suelta.\n\nNo hay un PDF generado por el sistema: se abre la hoja lista para imprimir y el navegador la manda a la impresora o la guarda como PDF desde su propio diálogo.\n\nSigue: [[ciclo-5-rutas]]',
    category: 'Ciclo semanal',
    key: 'ciclo-4-etiquetas',
    ordinal: 4,
    requiredPermission: 'production.read',
    title: 'Paso 4 — Imprimir las etiquetas',
  },
  {
    body: 'En "Rutas" proponés una ruta por zona y fecha, con la ciudad elegida arriba. El sistema levanta los pedidos confirmados o listos de ese día con dirección geocodificada y los ordena solo. Podés reordenar las paradas a mano; nada llega al repartidor hasta que publicás la ruta.\n\nEl detalle, en tres partes: [[reparto-proponer]], [[reparto-descartar]] y [[reparto-mensaje]].\n\n[Ir a Rutas](/app/reparto/rutas) · Sigue: [[ciclo-6-cobrar]]',
    category: 'Ciclo semanal',
    key: 'ciclo-5-rutas',
    ordinal: 5,
    requiredPermission: 'routes.read',
    title: 'Paso 5 — Armar y publicar la ruta',
  },
  {
    body: 'En "Pedidos" hay una columna "Cobrado" con un tilde. Es todo el circuito de cobro: se marca cuando entró la plata, y queda registrado quién lo marcó y cuándo.\n\nEl "Medio de pago" de cada pedido es otra cosa: es cómo se acordó cobrar (efectivo, transferencia), y se elige al tomar el pedido. Que esté acordado no quiere decir que esté cobrado.\n\nSi la columna no se ve, activala desde el botón "Columnas".\n\n[Ir a Pedidos](/app/pedidos)',
    category: 'Ciclo semanal',
    key: 'ciclo-6-cobrar',
    ordinal: 6,
    requiredPermission: 'orders.read',
    title: 'Paso 6 — Marcar lo cobrado',
  },
];
