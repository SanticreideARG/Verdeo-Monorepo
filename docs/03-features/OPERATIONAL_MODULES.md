# Módulos operativos: mensajería, captura, CRM y pedidos

## Estado del documento

Especificación incorporada el 18 de agosto de 2026 desde el insumo
`verdeo-sca-modulos-operativos.md`. Este documento normaliza ese material contra el dominio y las ADR ya
versionadas en el repositorio. No habilita envíos automáticos ni conecta un proveedor externo por sí solo.

## Objetivo

Reducir el trabajo manual desde la llegada de una consulta hasta que existe un pedido estructurado,
confirmado por una persona, auditable y utilizable por cocina:

```text
mensaje entrante
  -> conversación y cliente
  -> sugerencia o extracción asistida
  -> borrador revisable
  -> pedido confirmado por un operador
  -> seguimiento, cocina y exportación
```

## Límites obligatorios

- El evento entrante se persiste antes de clasificar, ejecutar IA o producir efectos secundarios.
- Los webhooks y acciones externas son idempotentes.
- La IA sólo propone texto o candidatos estructurados validados con Zod.
- El operador confirma o edita cualquier sugerencia antes de enviar o crear un pedido.
- Un LLM no calcula cantidades definitivas, precios, totales, estados ni permisos.
- Las claves de proveedores permanecen cifradas en servidor y nunca llegan al navegador.
- Toda mutación de cliente, plantilla, borrador o pedido aplica RBAC y produce auditoría.
- Los proveedores de mensajería e IA se consumen mediante adapters.

## 1. Inbox de conversaciones

La bandeja agrupa mensajes por conversación e identidad externa. Debe soportar:

- estados operativos configurables y filtrables;
- cuenta receptora separada de la zona operativa;
- vinculación posterior a un cliente cuando inicialmente sólo existe el teléfono;
- historial entrante y saliente con operador, plantilla y evento de origen;
- trabajo multioperador sin bloqueo exclusivo por defecto;
- templates internos con variables, activación y alcance global, por zona o por operador;
- sugerencias de respuesta que nunca se envían automáticamente.

Entidades conceptuales: `MessagingAccount`, `InboundEvent`, `Conversation`, `Message`,
`MessageTemplate` y `AISuggestion`. Los nombres de dominio permanecen neutrales al proveedor aunque V1
use Meta Cloud API.

## 2. Captura asistida de pedidos

La captura es el puente entre una conversación y el motor de pedidos:

1. Un mensaje persistido puede solicitar extracción.
2. El adapter de IA devuelve candidatos `{ producto, cantidad, variante, confianza }`.
3. Zod valida la salida y se crea un único borrador revisable.
4. El operador vincula o crea el cliente, corrige productos, cantidades y precios.
5. Sólo la confirmación humana crea el pedido real mediante el servicio de dominio existente.

No se fusionan borradores. Un borrador puede estar `pendiente_revision`, `confirmado` o `descartado` y
conserva mensaje de origen, proveedor, revisor y timestamps.

## 3. CRM operativo

La captura necesita una ficha de cliente utilizable sin abandonar el flujo:

- búsqueda principal por teléfono normalizado;
- alta y edición rápida inline;
- nombre y múltiples identidades externas;
- múltiples direcciones vinculables a zonas;
- preferencias alimentarias, de entrega y generales;
- alergias/restricciones visibles antes de confirmar;
- notas internas;
- historial conjunto de pedidos y conversaciones.

La implementación debe extender `Customer`, `CustomerIdentity` y las entidades CRM ya definidas en
`DOMAIN_MODEL.md`; no debe crear tablas paralelas en español que dupliquen esas fuentes de verdad.

## 4. Gestión de pedidos

Sobre el motor persistido actual se agregan:

- listado paginado con filtros por estado, zona, cliente y rango de fechas;
- edición controlada con motivo y auditoría;
- historial de transiciones visible;
- acceso desde la ficha de cliente y la conversación de origen;
- exportación CSV como base y Excel cuando exista el adapter de artefactos;
- trazabilidad opcional al borrador que originó el pedido.

El número público `Nxxxxx`, los UUID internos, snapshots de ítems y totales deterministas se mantienen.

## Modelo de datos incremental

La implementación prevista agrega, sin duplicar lo existente:

- `messaging_accounts`: cuentas configurables y routing de proveedor;
- `inbound_events`: payload crudo, ID externo único, recepción y procesamiento;
- `conversations`: identidad provisional, cliente opcional, cuenta, estado y última actividad;
- `messages`: dirección, tipo, contenido, operador, plantilla y evento de origen;
- `message_templates`: contenido, variables, scope y vigencia;
- `ai_suggestions`: propuesta, modelo/proveedor y resultado de revisión;
- `order_drafts`: candidatos validados, conversación, mensaje y revisión humana;
- `order_draft_items`: candidatos normalizados cuando la revisión requiera consultas o edición granular;
- una referencia nullable desde `orders` al borrador de origen;
- direcciones, preferencias y notas CRM sobre el `customer` existente.

Los eventos externos usan restricción única por cuenta e ID del proveedor. Teléfonos y contactos siguen
el modelo de identidades externas; no se copian como columnas alternativas en conversaciones o pedidos
salvo un snapshot explícitamente justificado.

## Reconciliación de estados pendiente

El insumo propone:

```text
pendiente -> confirmado -> produccion -> reparto -> entregado / cancelado
```

La máquina aceptada y ya implementada en Verdeo es:

```text
DRAFT -> CONFIRMED -> READY -> DELIVERED / CANCELLED
```

Además, el modelo vigente separa producción y logística del estado comercial del pedido. Antes de cambiar
schema, contratos o UI se debe decidir mediante ADR si `produccion` y `reparto` sustituyen a `READY`, son
estados derivados de otros módulos o son sólo filtros operativos. Hasta entonces, el motor vigente sigue
siendo la fuente de verdad.

## Orden de implementación MVP

1. Completar CRM inline y filtros/exportación del motor de pedidos.
2. Incorporar tablas y servicios neutrales de conversaciones, mensajes y templates.
3. Incorporar borradores de captura con revisión humana, inicialmente sin proveedor real.
4. Añadir un adapter IA con salida estructurada, ejecución auditada y aprobación.
5. Conectar Meta Cloud API sólo cuando existan credenciales, cuenta, verificación e idempotencia probada.
6. Agregar sugerencias de respuesta; conservar envío manual en V1.

## Criterios de aceptación

- Un mensaje duplicado del proveedor no produce dos eventos procesados ni dos pedidos.
- Ninguna sugerencia de IA se envía o confirma sola.
- Sólo existe un borrador activo por intención de pedido.
- Crear el pedido usa precios y cálculos del motor, no valores finales del modelo.
- Toda edición relevante deja actor, request/correlation ID, before/after y timestamp.
- Un usuario sin permisos no puede leer contactos ni mutar conversaciones, clientes o pedidos.
- Cocina sigue consolidando únicamente datos persistidos y confirmados.
