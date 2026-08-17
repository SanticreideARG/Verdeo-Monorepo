# Test Strategy

## Unit

Prioridad:

- state transitions;
- price snapshots;
- Intuitivo rules;
- sales cycle cutoffs;
- payment transitions;
- RBAC resolution;
- merge/unmerge;
- route visibility DTO;
- AI router policies.

## Integration

- DB repositories;
- transactions;
- webhook idempotency;
- Meta adapter mocked;
- AI provider mocked;
- geocoding adapter;
- document generation.

## Contract

Zod schemas para:

- API requests/responses;
- webhook normalized events;
- AI structured outputs;
- provider adapters.

## E2E

Escenarios mínimos:

1. cliente web nuevo -> pedido confirmado;
2. WhatsApp nuevo -> customer incompleto -> pedido;
3. recurrente -> match identidad;
4. draft -> follow-up -> confirm;
5. martes snapshot;
6. miércoles final/delta;
7. producción -> excedente -> venta oportunidad;
8. ruta -> repartidor -> trigger -> entrega;
9. efectivo -> a rendir -> rendido;
10. RBAC deny;
11. customer merge/unmerge;
12. IA provider falla -> fallback;
13. cuota IA agotada;
14. CMS publish/revert.

## Security

- IDOR;
- privilege escalation;
- PII leakage Delivery;
- webhook forgery;
- rate limiting;
- secret exposure;
- public QR token enumeration.

## Mobile

Probar:

- teléfonos Android reales;
- ancho pequeño;
- teclado abierto;
- mala conectividad;
- PWA install;
- touch targets.
