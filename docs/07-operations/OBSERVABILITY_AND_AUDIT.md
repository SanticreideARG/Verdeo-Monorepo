# Observability & Audit

## Logs técnicos

Estructurados:

- timestamp
- level
- service
- requestId
- correlationId
- userId cuando aplique
- event
- duration
- error code

No loguear tokens/API keys.

## AuditEvent

Separado de logs técnicos. Debe sobrevivir a cambios de logging.

Eventos:

- usuario/rol/permisos;
- cliente/merge;
- pedido;
- precio;
- pago;
- ruta;
- mensaje;
- CMS;
- prompt/config IA;
- producción;
- excedente.

## Métricas

- error rate;
- latency API;
- webhook failures;
- message send failures;
- queue depth;
- AI latency/cost;
- DB connections;
- failed auth;
- route generation time.

## Alertas

Prioridad:

- webhook Meta fallando;
- envíos WhatsApp fallando;
- DB inaccesible;
- job queue detenida;
- cuota IA agotada;
- cierre semanal job fallido;
- producción export fallida.
