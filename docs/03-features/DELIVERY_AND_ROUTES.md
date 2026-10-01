# Delivery & Route Management

## Principios

- pedido normalmente pertenece a una ruta;
- puede existir pedido sin delivery como excepción;
- operadores crean/publican rutas;
- optimización asistida, decisión humana;
- considerar ubicación + ventanas temporales;
- repartidor puede apartarse de ruta, pero se desaconseja;
- el repartidor sólo confirma entrega.

## Optimización

Problema tipo VRPTW:

- coordenadas;
- ventanas horarias;
- cantidad de repartidores;
- origen/destino;
- duración estimada por parada;
- restricciones operativas.

Usar motor determinista (Google Route Optimization, OR-Tools u otro adapter). IA puede explicar la propuesta, no calcular la ruta principal.

## Delivery App

Ruta `/delivery`.

Mostrar:

- nombre (sin apellido si no es necesario);
- ID pedido;
- dirección;
- referencias operativas;
- pedido;
- horario;
- forma/importe a cobrar cuando corresponda;
- mapa/navegación;
- triggers de mensajes;
- confirmar entrega.

No entregar:

- teléfono;
- email;
- Instagram;
- historial;
- notas comerciales;
- deuda histórica salvo alerta operacional estrictamente necesaria.

## QR

Etiqueta puede incluir QR a token público.

Público:

- menú;
- semana;
- información no sensible.

Repartidor autenticado:

- dirección;
- pago;
- acciones de mensaje;
- entrega.

Nunca codificar UUID/PII directamente en QR.

## Mensajes

- Estoy en camino.
- Estoy en el domicilio/afuera.
- Gracias por su compra / entrega confirmada.

Plantillas configurables.

## As built (Fase 8 — esqueleto)

Tablas `delivery_routes`, `delivery_stops` (migración 0020, additiva). Servicio
`PostgresDeliveryService`. Nuevo paquete `@verdeo/routing`: interfaz `RouteOptimizer` (mismo patrón
adapter que `GeocodingProvider`) + `NearestNeighborRouteOptimizer` — un vecino-más-cercano
determinista sin dependencias externas que camina desde el origen configurado del sitio
(`operating_sites.origin_latitude/longitude`, opcional). No modela ventanas horarias ni capacidad
por repartidor — es el reemplazo temporal del "motor determinista (Google Route Optimization,
OR-Tools u otro adapter)" que pide este documento; los llamadores solo conocen la interfaz.

- **`createRoute` propone, nunca publica**: toma todo pedido por repartir —`CONFIRMED` o `READY`; marcar un pedido listo es cocina avisando que ya lo produjo, no que salga del reparto— con dirección geocodificada
  para ese sitio/fecha que no esté ya en una ruta activa, lo secuencia con el optimizador y crea la
  ruta en `draft`. Un pedido sin coordenadas queda afuera — "puede existir pedido sin delivery como
  excepción" — un operador lo maneja a mano. Nada llega a la app de reparto hasta `publish`.
  Reordenar reescribe la secuencia en dos pasadas (todo a valores fuera de rango, después a los
  finales) para no chocar con el índice único `(route, sequence)` a mitad de transacción.
- **Una hoja por zona**: `createRoute` acepta un `geographicZoneId` opcional y filtra las paradas
  por la zona de la dirección de entrega —no por la del cliente: manda dónde se entrega (ADR-031),
  que es lo mismo que decide de qué ciudad es el pedido—. Sin zona toma la ciudad entera, como
  antes. El formulario ya no pregunta la ciudad: esa la fija el selector de la barra, y volver a
  preguntarla dejaba abierta la posibilidad de armar una ruta para una ciudad distinta de la que se
  está mirando. Sin etiqueta escrita, la etiqueta es el nombre de la zona, para que varias hojas del
  mismo día no queden indistinguibles en la lista.
- **Qué entregar en cada parada**: la hoja decía a quién y dónde, pero no qué, así que el repartidor
  llegaba con la caja y adivinaba cuál de las viandas era de esa parada. `deliveryDetail`
  (`@verdeo/orders`) escribe la línea: una vianda estándar por variedad y tamaño —"Menú Keto
  400"—, que es lo que dice su etiqueta; un Intuitivo por el nombre de quien lo pidió —"Intuitivo
  250 · Ana"—, porque dos Intuitivo del mismo tamaño son combinaciones distintas y el nombre
  impreso es lo único que los separa. Las unidades sólo cuando son más de una ("×3"), que es la
  diferencia que hace que falte una al llegar. Lo arma el servidor —una consulta por hoja, no una
  por parada— y viaja en el contrato, así que la vista, el mensaje de WhatsApp, el CSV (columna "Qué
  entregar") y la app del repartidor dicen exactamente lo mismo. Se toma de los snapshots del
  pedido, no del catálogo de hoy; que sea Intuitivo o no sale del catálogo (`kind = 'COMPOSABLE'`) y
  no de comparar nombres, para que una variedad renombrada siga reconociéndose.
- **El sitio de reparto (`/reparto/:token`), sin cuentas.** El reparto dejó de gestionarse con
  usuarios: no hay cuenta de repartidor que crear, asignar ni dar de baja. Quien reparte hoy puede
  no ser quien reparte mañana, y pedirle al equipo que administre usuarios para eso era una gestión
  que nadie iba a hacer. Lo que existe de verdad es una ruta de un día, así que el acceso es a esa
  ruta: `POST /delivery/routes/:id/link` devuelve un enlace que se manda por WhatsApp y vence
  (24 h por defecto). Generar uno nuevo revoca el anterior — dos enlaces vivos de la misma ruta es
  alguien repartiendo con una hoja que ya no vale— y `DELETE` lo corta sin tocar la ruta. El token
  se guarda hasheado, como todos, y sólo se puede emitir sobre una ruta publicada.
  La hoja lleva lo mínimo para entregar y nada más: nombre de pila, dirección, cómo entrar
  (`access_notes`), en qué horario recibe (`customer_addresses.delivery_window`), qué dejar
  (`deliveryDetail`), cuánto cobrar y con qué medio. Sin apellido, sin teléfono, sin historial: la
  consulta no los selecciona y el contrato no los admite, así que no hay nada ahí que se pueda
  filtrar por error. Si el enlace se filtra, lo que expone es la hoja de un día, no una cuenta.
- **Entregar y cobrar son un solo movimiento**, en la misma transacción: una entrega marcada sin su
  cobro es plata que nadie sabe que está en la calle. Lo cobrado se registra como una cobranza de la
  ruta —`cash_collections.delivery_route_id`, con `collected_by_user_id` nulo, porque no hay
  usuario— y el pedido queda `TO_SETTLE` si el medio es efectivo. "Entregada sin cobrar" existe y
  está a la vista: esconderlo haría que se marque cobrado lo que no se cobró. Arriba de la hoja,
  siempre visible, cuánto lleva cobrado: es lo que hay que rendir al volver.
- **Desde el panel se ve cómo va la ruta** (`GET /delivery/routes/:id/progress`): cuántas paradas
  entregadas, cuánto cobrado y cuánto falta cobrar. Es la misma cuenta que ve quien reparte, no una
  segunda — que las dos pantallas discrepen sobre cuánta plata hay en la calle sería peor que no
  mostrarlo.
- **Confirmar entrega** también transiciona el pedido a `DELIVERED` directamente (no pasa por la
  política de transición pensada para ediciones administrativas) y registra
  `order_status_history`.
- **Los tres mensajes de este documento son triggers reales**: `POST
/api/v1/delivery/stops/:id/trigger` busca la plantilla activa por `actionKey` (`ON_MY_WAY`,
  `AT_ADDRESS`, `DELIVERED_THANKS`) y la manda vía `PostgresMessagingService.sendToCustomer`
  (Fase 5) — el repartidor nunca ve ni maneja el número del cliente. Sin plantilla configurada,
  responde `sent: false`, no un error.

**Diferido**: QR/etiquetas imprimibles y el flujo de token público, optimización con ventanas
horarias, integración con un optimizador real.

## Sacar la ruta de la pantalla

Proponer una ruta la guardaba y ahí terminaba: no había forma de dársela a nadie. Ahora la ficha de
una ruta con paradas ofrece dos salidas:

- **Copiar para el repartidor** — un mensaje de texto con las paradas en orden, cada una con nombre,
  dirección, **enlace de ubicación** y lo que hay que cobrar. El enlace es lo que el repartidor abre
  en el teléfono; una dirección escrita obliga a tipearla en un mapa.
- **Descargar planilla** — el mismo contenido como CSV, con BOM para que Excel no rompa los acentos.

Para eso `DeliveryStopSchema` incorpora `deliveryLocationUrl`, que ya estaba en el pedido pero no
llegaba a la parada.

**Un bug que valía la pena anotar:** el formulario de "Proponer ruta" hacía `event.currentTarget.reset()`
después de un `await`. React deja `currentTarget` en null en cuanto el handler cede el control, así
que eso tiraba un TypeError y se llevaba puesto todo lo que venía atrás —cerrar el formulario,
recargar la lista, mostrar la ruta—. La ruta se creaba y la pantalla no decía nada; había siete en la
base cuando se encontró. El formulario ahora se captura antes del `await`, y al crear una ruta se
avisa cuántas paradas quedaron (o por qué quedó vacía).
