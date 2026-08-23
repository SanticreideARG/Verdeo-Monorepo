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

- **`createRoute` propone, nunca publica**: toma todo pedido `CONFIRMED` con dirección geocodificada
  para ese sitio/fecha que no esté ya en una ruta activa, lo secuencia con el optimizador y crea la
  ruta en `draft`. Un pedido sin coordenadas queda afuera — "puede existir pedido sin delivery como
  excepción" — un operador lo maneja a mano. Nada llega a la app de reparto hasta `publish`.
  Reordenar reescribe la secuencia en dos pasadas (todo a valores fuera de rango, después a los
  finales) para no chocar con el índice único `(route, sequence)` a mitad de transacción.
- **App de reparto en `/delivery`**, sin el layout del dashboard admin. `listStopsForUser` es
  PII-safe por construcción: la consulta no selecciona teléfono/email/notas/historial, solo nombre
  de pila, dirección, pago esperado y estado.
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
