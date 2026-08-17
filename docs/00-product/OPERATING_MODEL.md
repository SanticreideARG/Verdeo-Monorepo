# Operating Model

## Ciclo comercial semanal

- El menú cambia semanalmente.
- Los precios intentan mantenerse estables y se actualizan periódicamente.
- Se toman pedidos de lunes a miércoles.
- Cierre comercial: **miércoles 19:00**.
- Corte parcial de cocina: **martes 20:00**.
- Cocina puede producir excedente para venta de oportunidad.
- Después del cierre pueden existir excepciones operativas, pero el sistema no debe normalizarlas ni ocultarlas.

Internamente cada ciclo usa ID propio. El alias visible puede ser `S1`, `S2`, etc., pero no es clave primaria ni identificador histórico suficiente.

## Pedido confirmado

Un pedido se considera confirmado cuando el cliente confirmó:

- pedido;
- nombre completo;
- teléfono;
- dirección.

Se admite `DRAFT` para conversaciones incompletas. Los drafts abandonados deben poder generar seguimiento.

## Flujo actual a reemplazar

Mensaje -> revisar WhatsApp/planilla -> alta/identificación -> recopilar datos -> copiar a planilla pedidos -> copiar/consolidar cocina -> armar despachos -> copiar plantillas -> seguimiento.

Flujo objetivo:

Mensaje/Web -> Customer/Identity -> Order -> SalesCycle -> Production/Route/Payment -> Messaging -> Audit.

## Dirección

Se solicita escrita. El sistema debe:

1. geocodificar;
2. mostrar coincidencia;
3. permitir corrección;
4. almacenar lat/lng;
5. clasificar ciudad y sector;
6. si falla, marcar `NEEDS_LOCATION` y solicitar ubicación.

Se pregunta si es edificio/country/barrio privado y se guardan referencias de acceso.

## Disponibilidad

Un cliente puede proporcionar una o varias ventanas horarias. Debe soportarse:

- intervalo;
- antes de X;
- después de X;
- varias ventanas;
- todo el día.

## Producción

Cocina recibe consolidado, no necesita operar pedido por pedido.
Se requiere:

- parcial martes 20:00;
- final miércoles 19:00;
- delta entre ambos;
- restricciones asociadas a nombre/ID;
- Intuitivos con composición individual;
- generación PDF/Excel/texto WhatsApp;
- producción real informada por cocina;
- excedente disponible para venta.

## Despacho

Operadores crean rutas. El optimizador debe considerar ubicación + ventanas horarias. La decisión final es humana.

## Cobro

Estados:

- pendiente;
- pagado;
- a rendir.

`A_RENDIR` = efectivo cobrado por repartidor aún no entregado a administración.
