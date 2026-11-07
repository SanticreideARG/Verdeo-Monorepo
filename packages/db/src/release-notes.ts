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
  {
    key: '2026-10-29-nuevo-pedido-ordenado',
    body: `Nuevo pedido, ordenado:
• El formulario va en cuatro bloques: Cliente, Entrega, Pedido y Pago y origen. En pantalla ancha, quién y dónde a la izquierda; qué y cómo paga a la derecha.
• Los desplegables ya no se cortan: con dos períodos publicados se eligen con botones, y en el teléfono variedad, tamaño y unidades van uno abajo del otro.
• En la lista de Pedidos, la etiqueta NUEVO va al lado del nombre del cliente.
• Etiquetas: el PDF pide imprimirse a tamaño real.`,
  },
  {
    key: '2026-10-29-version-1',
    body: `Versión 1.0 🎉 Cerramos el primer sprint: Verdeo ya corre con el trabajo de todos los días. La etapa que sigue es de estabilización y seguridad:
• Los cambios grandes se avisan por acá antes, con día y hora, y se hacen fuera del cierre y del reparto.
• Si aparece "Algo falló de nuestro lado", mandá una captura con el número de solicitud: con eso se encuentra el error en minutos.
• Cada persona con su cuenta, sin compartir contraseñas. Y nada de datos de prueba en el sistema: para practicar, pedí un entorno de prueba.
• Antes de cancelar o borrar en lote, revisá el período y la ciudad elegidos arriba.`,
  },
  {
    key: '2026-11-07-pedidos-totales-por-dia',
    body: `Pedidos: con "Ordenar por entrega", cada fecha termina con un renglón con el total del día y el total en efectivo. Los cancelados no suman.`,
  },
  {
    key: '2026-11-07-planillas-zona',
    body: `Planillas: la columna Zona de la hoja "Reparto" (Informe del período) y de "Exportar Excel" salía vacía. Ahora muestra la "Zona" que escriben al cargar el pedido (y, si no tiene, la del domicilio), igual que la columna Zona de Pedidos.`,
  },
  {
    key: '2026-11-07-pedido-zona-recordada',
    body: `Nuevo pedido: la "Zona" que escriben a mano (Palermo, Recoleta, Centro…) ahora se completa sola al elegir un cliente que ya pidió, con la de su último pedido. Funciona en todas las ciudades y se puede cambiar. "Repetir lo de la última vez" también copia la zona y la franja horaria.`,
  },
  {
    key: '2026-11-07-clientes-orden-filtros-columnas',
    body: `Clientes: ahora se pueden ordenar por nombre, último pedido, más pedidos, más gastado o alta, y filtrar por zona, nuevos, con deuda, sin ubicar y los que no piden hace semanas. Cada cliente muestra su zona y cuánto hace de su último pedido. Y hay vista Columnas: una tabla con pedidos, gastado y deuda de cada uno, con totales al pie; doble clic abre la ficha al costado.`,
  },
  {
    key: '2026-11-07-clientes-lista-completa',
    body: `Clientes: arriba dice el total del padrón y la lista se carga sola al bajar, sin tope de 100. En la ficha, el teléfono y el WhatsApp del mismo número van en una sola tarjeta, con un enlace para abrir el chat.`,
  },
  {
    key: '2026-11-07-busqueda-sin-tildes',
    body: `Las búsquedas no dependen de las tildes: "Nunez" encuentra a "Núñez" y "Jose" a "José", en clientes, pedidos, el chat y los usuarios. El importador de clientes ya reconocía las zonas con o sin tilde ("Neuquen Centro" y "Neuquén Centro" son la misma).`,
  },
  {
    key: '2026-11-06-correos-en-el-telefono',
    body: `Pedidos por correo, más cómodo en el teléfono: Revisar, Aprobar y Borrar en una fila debajo de cada correo, y el tipo y la ciudad en un renglón. La lista se pliega tocando su título. En una consulta, Hera explica en su globo qué es, en vez del párrafo fijo, y el búho ya no tapa "Cerrar".`,
  },
  {
    key: '2026-11-06-renombrar-zonas',
    body: `Ciudades y zonas se pueden renombrar desde Panel de control → Zonas geográficas: "Renombrar" en la tarjeta de la ciudad, y "Nombre" en los datos de cada zona. Cambia sólo el nombre que se ve; los números de pedido y los enlaces quedan como estaban.`,
  },
  {
    key: '2026-11-06-pulido-de-pantallas',
    body: `Pantallas más prolijas y fáciles de tocar: los textos grises se leen mejor; en el teléfono, los selectores de Ciudad y Estado, el avatar y los botones son más grandes, y el búho ya no tapa el final de las listas. En Cocina, "Cerrar período" se distingue del resto. El detalle de un pedido ocupa menos lugar arriba, y Estadísticas con uno o dos días muestra los números en vez de un gráfico vacío. La fecha de la barra dice "6 de noviembre" y no "6 De Noviembre".`,
  },
  {
    key: '2026-11-06-pedidos-por-correo',
    body: `Pedidos por correo: cada uno muestra su ciudad y la lista respeta la ciudad elegida arriba. Los pedidos tienen "Aprobar" directo y "Borrar", y los que llegaron dos veces se marcan como repetidos. En las consultas, Hera arma la respuesta para mandarla por WhatsApp o por email.`,
  },
  {
    key: '2026-11-05-importar-por-operacion',
    body: `Importar contactos: ahora se puede elegir la operación entera, y cada domicilio va a la zona de su localidad. Los celulares con dígitos de más o de menos se cargan igual y quedan marcados para revisar. Y en Rutas, una hoja puede juntar varias zonas que salen en el mismo reparto, como Neuquén y Plottier.`,
  },
  {
    key: '2026-11-05-clientes-archivados',
    body: `Los clientes archivados ya no aparecen en la lista de Clientes ni en los buscadores. Si un teléfono "ya es de otro cliente" y no lo encontrás, puede estar archivado: pedile a quien administra que lo reactive.`,
  },
  {
    key: '2026-11-05-hojas-y-domicilios',
    body: `Las hojas de ruta se pueden editar también después de publicarlas: "Sumar pedidos" agrega los del día que no están en ninguna hoja, "Sacar" quita una parada sin tocar el pedido, y el orden manual funciona en cualquier hoja. Además, los domicilios de un cliente ahora se pueden eliminar desde su ficha.`,
  },
  {
    key: '2026-11-05-importar-repetidos',
    body: `Importar contactos: los que vienen sin teléfono ni correo ahora se reconocen por nombre y dirección. Si la misma persona está varias veces en la planilla se marca "Repetido", y si ya estaba cargada, "Ya existe": ninguno de los dos se crea de nuevo.`,
  },
  {
    key: '2026-11-03-historial-hera',
    body: `En Hera IA ahora queda tu historial: podés retomar una conversación cuando quieras o borrarla. Tu historial lo ves sólo vos.`,
  },
  {
    key: '2026-11-03-pedido-y-reparto',
    body: `Estadísticas ahora muestra el análisis contable por día de reparto: efectivo a rendir, transferencias cobradas y pendientes. En cada pedido, el medio de pago y si está cobrado quedan junto a los ítems, el historial pasa al pie, y Hera puede proponerte otras versiones del mensaje de confirmación.`,
  },
  {
    key: '2026-11-02-hera',
    body: `Nuestra asistente ahora se llama Hera, y el Workbench de IA pasa a ser Hera IA. Saluda cada tanto desde su rincón y cambia de cara mientras te ayuda. Además, la sombra de la sección activa ahora marca siempre la tarjeta completa.`,
  },
  {
    key: '2026-11-02-barra-y-secciones',
    body: `Barra más clara: logo, íconos y avatares más grandes, y un botón "Apariencia" en lugar de "Aa". La sección en la que estás trabajando ahora se resalta con una sombra suave.`,
  },
  {
    key: '2026-11-02-nuevo-por-periodo',
    body: `Cliente "NUEVO", sólo en su período: sale como nuevo en el período en que entró y en el siguiente deja de serlo. La columna "¿Es nuevo?" de Pedidos ahora es un tilde: se marca o desmarca al toque, sin confirmar.`,
  },
  {
    key: '2026-11-02-orden-manual-ruta',
    body: `Hojas de ruta: con "Establecer orden manualmente" tocás los puntos del mapa en el orden del recorrido. En la computadora, el selector de ruta pasó arriba y el mapa se ve mucho más grande.`,
  },
  {
    key: '2026-11-02-buho-consulta',
    body: `Búho: ahora le podés preguntar directo desde el cuadro de arriba, sin elegir un modo. También sabe cuánto efectivo hay que rendir del reparto de hoy, en la ciudad elegida.`,
  },
  {
    key: '2026-11-02-menus',
    body: `Lo que se cuenta ahora se llama por su nombre: stock, pedidos y planillas dicen "menús" (1 menú = 5 viandas).`,
  },
  {
    key: '2026-11-02-sin-pago',
    body: `Nuevo medio de pago "Sin pago", para pruebas, regalos o compensaciones. El pedido da $0, pide un motivo y no aparece en Por cobrar ni tiene tilde de Cobrado. Se cocina y se entrega como cualquier otro.`,
  },
  {
    key: '2026-11-02-mensaje-repartidor',
    body: `Repartos:
• "Copiar para el repartidor": cada parada dice qué hacer con el pago. Las que no se cobran dicen "No cobrar".
• El mensaje ya no dice "nuevo" y lleva el barrio al lado de la dirección.
• La hoja Reparto del informe del período tiene columna Barrio.`,
  },
  {
    key: '2026-11-02-ordenar-por-entrega',
    body: `Pedidos: nuevo tilde "Ordenar por entrega". Separa la lista con un renglón por cada fecha de entrega y sus pedidos abajo. Se puede seguir ordenando por columna, adentro de cada fecha.`,
  },
  {
    key: '2026-11-02-importador-correos',
    body: `Importar pedidos de los correos, corregido:
• Cada pedido tiene su ciudad: se sugiere la que dice el correo y se puede cambiar. Si no se sabe, se elige ahí mismo, también con "Todas las ciudades" arriba.
• Los menús del formulario se reconocen: "Vegetariano" se toma como Real, "Paleo & Keto" como Keto y "Antiage & Detox" como Anti-Age. Cada pedido avisa cómo lo tomó.
• Si falta algo para importar (ciudad, variedad, medio de pago), el botón lo dice en vez de no hacer nada.
• Varios correos pegados de corrido, sin encabezado de reenvío, ya no se juntan en un solo pedido.`,
  },
  {
    key: '2026-11-01-tema-verano',
    body: `☀️ Llegó el verano: hasta el 28 de febrero el panel se viste claro, celeste arriba y blanco abajo, con letras negras, íconos verdes y un brillo naranja al pasar el mouse. Si no lo querés, sacalo en "Aa" → Temporada.
🎃 Halloween se despide, pero sus colores se quedan: elegí el tema "Calabaza" en Apariencia (sin telarañas ni calabaza). "Verano" también queda como tema para todo el año.`,
  },
  {
    key: '2026-11-01-orden-250-400',
    body: `Nuevo orden en todas las planillas, etiquetas e informes: dentro de cada menú va primero el 250 y abajo el 400 (Keto 250, Keto 400, Anti-Age 250, Anti-Age 400…). El orden de los menús no cambia.`,
  },
  {
    key: '2026-11-01-cierre-sin-atajos',
    body: `Cocina → Cierre de pedidos queda más simple:
• Se sacaron "Imprimir", "Copiar para WhatsApp" y el atajo a Etiquetas. Las etiquetas siguen en su lugar del menú.
• Ya no se elige reparto: la planilla de producción es siempre la de todos los repartos del período.
• El período y los botones van en un solo renglón.`,
  },
  {
    key: '2026-11-01-columna-zona',
    body: `En Pedidos, la columna "Zona" ya muestra la zona que se escribe en el pedido. Antes salía un guión aunque el pedido la tuviera cargada.`,
  },
  {
    key: '2026-10-31-cocina-stock',
    body: `Cocina más tranquila:
• Los pedidos cancelados ya no aparecen en el aviso de "cambiaron N pedidos": no se cocinan y asustaban.
• La tarjeta de Stock viene plegada. Cerrada muestra cuánto hay para cocinar de más y cuántas viandas de períodos anteriores.
• Un lote que quedó en 0 por un toque de más ya no desaparece: está en "En 0 o dados de baja", con su + para devolverlo.`,
  },
  {
    key: '2026-10-31-enviar-a-stock',
    body: `En "Cambiar cliente" ahora también está "Enviar a stock": el pedido se cancela y sus viandas quedan en Stock disponible para venderlas a otro cliente.
• Pide confirmarlo. Si el pedido figura como cobrado, lo pide dos veces.
• Sólo para pedidos confirmados.`,
  },
  {
    key: '2026-10-31-cambiar-cliente',
    body: `Nuevo en la ficha del pedido: "Cambiar cliente". Un pedido cargado a nombre de otro (un "nn", el stock) pasa al cliente real sin cancelarlo ni cargarlo de nuevo.
• Buscás al cliente o lo creás ahí mismo, y elegís en cuál de sus domicilios se entrega.
• Conserva platos, período, precio, forma de pago y cobro. En el historial queda cómo estaba.`,
  },
  {
    key: '2026-10-31-movimiento-portada',
    body: `La portada pública ahora se mueve: el scroll con la rueda es más suave, los enlaces del menú deslizan hasta cada sección y las secciones aparecen a medida que se baja.
• En el teléfono el scroll sigue siendo el de siempre.
• Quien tiene activado "reducir movimiento" en su equipo ve la página quieta, como antes.`,
  },
  {
    key: '2026-10-30-buho-workbench',
    body: `El búho se mudó al Workbench de IA, ahora para todos los que tienen permiso de IA.
• Pegá el mensaje de un cliente en un cuadro grande y el búho lo analiza, arma la respuesta o la ficha del pedido. Cada respuesta se copia con un clic.
• Con un clic arma el análisis del período, los pendientes antes del cierre, las tendencias, los cobros, el stock y el texto del menú, con los datos del sistema.
• Preguntale lo que quieras sobre la operación, o cómo se hace algo.
• Al búho no le llegan nombres, teléfonos ni domicilios de clientes. El búho de la Ayuda sigue en su lugar, abajo a la derecha.`,
  },
  {
    key: '2026-10-30-stock-en-pedidos',
    body: `Stock disponible en Pedidos: arriba de la lista se ve lo que hay para vender ya cocinado en la ciudad elegida, sin ir a Cocina.
• Del período y de períodos anteriores, con su vencimiento. Lo que vence en tres días o menos aparece primero y resaltado.
• "Vender" abre Nuevo pedido con esa variedad ya elegida del stock: sólo falta el cliente y la entrega.
• Se abre y se cierra tocándolo, y recuerda cómo lo dejaste.`,
  },
  {
    key: '2026-10-30-selector-vista',
    body: `En el teléfono, el selector "Tarjetas / Columnas" de las listas ahora son dos íconos: los cuadritos muestran tarjetas y la grilla, columnas. El elegido queda resaltado.`,
  },
  {
    key: '2026-10-30-stock-por-ciudad',
    body: `Stock por ciudad: el "Stock para el cierre" de Cocina ahora es de cada ciudad. Lo que se carga en una ya no aparece, no se cocina ni se vende en las otras.
• Para cargar o dar de baja, elegí la ciudad arriba. Con "Todas las ciudades" se ve la suma.
• "Sale del stock" vende sólo del stock de la ciudad del pedido.
• Al cerrar el período, el stock de cada ciudad pasa a un lote de esa ciudad.
• Lo que ya estaba cargado se asignó a la ciudad que más vendió esa variedad: revisalo en Cocina por si hay que moverlo.`,
  },
  {
    key: '2026-10-29-ajuste-impresora',
    body: `Etiquetas:
• Nuevo "Ajuste de la impresora": imprimís una hoja de prueba con los 24 recuadros, la ponés a contraluz sobre una de etiquetas y corregís en milímetros cuánto mover o estirar la hoja. Queda guardado en esa compu.
• Los nombres de plato muy largos van en tres renglones, con letra legible, en vez de achicarse hasta no leerse.`,
  },
  {
    key: '2026-10-29-pantalla-ancha',
    body: `En monitores anchos, las tablas y los formularios del panel ahora usan todo el ancho de la pantalla, en vez de quedar en una franja al medio.`,
  },
];
