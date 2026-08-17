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
