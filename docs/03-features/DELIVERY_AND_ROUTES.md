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

### Ventanas horarias: hoy las decide una persona

La ventana de cada cliente (`customer_addresses.delivery_window`) se carga en su ficha y **viaja
con la parada** a los cuatro lugares: la pantalla de Rutas, el mensaje de WhatsApp, la planilla y
el minisitio del repartidor.

**El optimizador no la usa.** Ordena por distancia desde el origen y nada más. La ventana es texto
libre —"después de las 18", "de 12 a 14", "cuando salgo del trabajo"— y un parser sobre eso falla
en silencio: una forma que no reconoce manda la parada a cualquier lado sin que nada lo avise, que
es peor que no ordenar por ventana.

Entonces el reparto de trabajo es explícito: el optimizador propone por distancia, y quien arma la
hoja ve la ventana en cada parada y reacomoda las que haga falta (`reorderStops` ya existe). Es
una persona decidiendo con el dato a la vista, en lugar de un algoritmo adivinando.

Para que el motor las respete de verdad, la ventana tiene que dejar de ser texto libre y pasar a
ser dos horas (desde/hasta) cargadas en campos separados. Eso es un cambio de modelo y una
migración de lo ya cargado, y es el paso previo a cualquier VRPTW real.

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
  400"—, que es lo que dice su etiqueta; un Intuitivo sólo por su tamaño —"Intuitivo 250"—. El
  detalle de los platos no le sirve al repartidor: la vianda ya va rotulada con el cliente y la
  parada dice a quién se entrega (antes decía "Intuitivo 250 · Ana", y se sacó a pedido). Las unidades sólo cuando son más de una ("×3"), que es la
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
- **"No se pudo entregar" y los tres avisos viven en el sitio**, no en el panel. Estaban detrás de
  `delivery.execute` y `delivery.trigger_messages`, permisos que con el rol eliminado no tiene
  nadie: los endpoints quedaron inalcanzables y la operación perdió la capacidad de registrar una
  entrega fallida. Ahora son dos endpoints públicos más, con la misma regla que el resto —la parada
  tiene que ser de la ruta de ese enlace, si no 404—, y el motivo sale de la lista cerrada de
  `cancellation_reasons` que viaja con la hoja, porque después se cuenta cuántas fallaron y por qué.
- **Se eliminó el resto del modelo por usuario**: `assignStop` y su endpoint, `listStopsForUser`,
  `DeliveryMyStopSchema`, y los dos endpoints autenticados de estado y entrega fallida. El tipo de
  token `repartidor_access` ya no se emite desde ninguna pantalla (Usuarios y Ajustes → Zonas lo
  ofrecían); el servidor lo sigue aceptando para que un token ya entregado no deje de andar antes de
  vencer.
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

## Ubicar direcciones antes de la ruta

`createRoute` sólo arma paradas con pedidos cuyo domicilio tiene coordenadas. Un pedido que entró
por email o planilla trae la dirección como texto y no tiene domicilio, así que antes quedaba afuera
sin aviso. Ahora Rutas lista los pedidos del día sin ubicación y permite ubicarlos (la IA ordena el
texto, el mapa lo busca, y se acepta sola sólo con confianza alta dentro de la ciudad). Detalle y
decisiones en `ADDRESS_SANITIZER_PLAN.md`.

## Barrios en la hoja de ruta

Cada parada trae el barrio de su domicilio (`neighborhood` en `DeliveryStopSchema` y
`DeliverySheetStopSchema`). Las paradas mantienen el orden de la ruta y el barrio se anuncia cada
vez que cambia respecto de la anterior (`neighborhoodHeading`): en la vista de Rutas, en la hoja del
repartidor, en el mensaje de WhatsApp ("📍 Núñez") y como columna "Barrio" del CSV. Si ninguna
parada tiene barrio no se anuncia nada. Qué es un barrio: OPERATING_SITES_AND_ZONES.md.

## Abrir en Google Maps (2026-10-13)

`googleMapsLink` (`apps/web/src/lib/mapLinks.ts`) arma el enlace de un domicilio con este orden:
las **coordenadas** del domicilio (las que encontró el ubicador o se confirmaron a mano), después el
enlace que compartió el cliente (a veces es una búsqueda por texto, no un punto) y por último una
búsqueda por la dirección escrita. Antes el enlace compartido iba primero. Lo usan el mapa del
detalle del pedido (botón "Abrir en Google Maps", con las coordenadas del pin que se ve), la vista de
Rutas, el mensaje de WhatsApp y el CSV de la ruta, y la hoja del repartidor.

## Días de reparto y alerta de "a despachar hoy" (2026-10-14)

- **Días de reparto por ciudad** (Panel de control → Días de reparto, `/app/ajustes/reparto`;
  migración 0059, `site_delivery_settings`): los días de la semana en que reparte la ciudad
  (0 = domingo … 6 = sábado) y el de siempre. Ver pide `sites.read`; guardar, `sites.manage`, y queda
  auditado (`delivery.settings_updated`).
- **Las fechas salen del período** (`deliveryOptions` en `@verdeo/orders`): cada día marcado da su
  primera fecha desde el cierre, inclusive. Un período que cierra el domingo 18 con reparto sábado y
  domingo reparte el domingo 18 o el sábado 24. Sin días configurados, el reparto es el día del
  cierre, como antes.
- **Cada pedido elige el día** con un selector por día de la semana ("**Sábado** 24 oct"): en la
  carga, en la edición del pedido (con "Otra fecha" para un caso puntual) y en el importador (uno
  para todos y, si hace falta, uno por pedido). `createOrder` acepta la fecha pedida sólo si es uno
  de los días de reparto de la ciudad (`resolveDeliveryDate`); si no, usa la de siempre. El pedido
  web por ahora va siempre al día de siempre. `GET /api/v1/delivery/options[?menuId]` da las fechas
  (sin menú, las del publicado de la ciudad).
- **Alerta "a despachar hoy"** (`DispatchTodayBanner`, en el panel principal y en Pedidos;
  `GET /api/v1/orders/dispatch[?date]`, `dispatchSummary`): cuántos pedidos no cancelados salen hoy,
  cuántos todavía no están en una hoja de ruta, cuántos siguen en borrador y cuántos no tienen
  ubicación, con un botón a Rutas. Si hoy no hay reparto, dice cuál es el próximo día con pedidos.

## Salida, llegada y tiempos de la ruta (2026-10-24)

- **Salida y llegada por defecto** por ciudad, en Ajustes → Reparto (`site_delivery_settings`:
  `route_start_*`, `route_end_*`, migración 0072): una dirección, un link de Google Maps o
  coordenadas; el servidor la ubica (`locatePlace`, con el geocodificador de siempre). La salida es
  desde donde arma el orden el optimizador (si no hay, el origen de la ciudad).
- **Cada ruta las puede cambiar**, y tiene **hora de salida** (`delivery_routes.start_*`, `end_*`,
  `departure_time`; `PATCH /api/v1/delivery/routes/:id/endpoints`). Cambiarlas no reordena las
  paradas.
- **Tiempos estimados** (`apps/web/src/lib/routeTiming.ts`, con `estimateRouteMinutes` de
  `@verdeo/routing`): minutos por tramo, hora estimada de llegada a cada parada con la hora de salida,
  y el recorrido total con la vuelta. Por distancia y sin tránsito.
- **Google Maps**: el recorrido entero (salida, paradas en orden, llegada) en un link; el link admite
  nueve paradas intermedias, así que una ruta larga se parte en tramos que empiezan donde termina el
  anterior.
- En cada parada, la **franja horaria del pedido** (o la del domicilio).
- Paso 2, si hace falta: tiempos reales tramo por tramo con el servicio de rutas de Google (clave
  con facturación).

## Hojas de ruta (2026-10-25)

- La card de la parada muestra la **franja horaria** en lugar del monto, el medio y el estado.
- **Arrastrar y soltar** para reordenar (puntero: mouse y dedo con el mismo código; con el teclado,
  flechas sobre la manija). La lista cambia en el acto y se guarda con `PUT .../stops`.
- En el mapa, la **salida (S)** y la **llegada (L)** son el primer y el último punto de la línea; si
  son el mismo lugar, un solo pin "S/L".
- **Quien reparte sólo ve el efectivo**: la hoja del enlace no trae monto ni medio de las
  transferencias (la parada cuenta como pagada y los totales son del efectivo), y el mensaje de
  WhatsApp y la planilla CSV los dejan en blanco. El mensaje suma la segunda línea de la dirección.
