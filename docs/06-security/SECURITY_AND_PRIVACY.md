# Security & Privacy

## PII minimization

Aplicar principio de mínimo privilegio tanto en UI como en DTO/API.

### Repartidor

No recibe:

- teléfono;
- email;
- Instagram;
- historial;
- notas comerciales;
- datos innecesarios.

No basta ocultar por UI: el endpoint no debe serializarlos.

## Auth

- OAuth soportado.
- Sesiones seguras.
- MFA recomendable para superadmins.
- revocación de sesiones;
- desactivar usuario conserva historial.

## RBAC

Middleware + autorización de dominio.
No confiar en rutas ocultas.

## Auditoría

Registrar:

- actor;
- acción;
- entidad;
- before/after;
- IP/request metadata razonable;
- correlation ID;
- timestamp;
- fuente.

No guardar secrets en audit.

## Webhooks

- verificar firma/token del proveedor;
- persistir ID externo;
- idempotencia;
- rate limiting;
- rechazar payload inválido;
- procesar asincrónicamente cuando corresponda.

## Secrets

- env/secret store;
- claves configurables cifradas;
- nunca frontend;
- rotación;
- mostrar sólo máscara.

## Public tokens / QR

- token aleatorio de alta entropía;
- revocable;
- no UUID directo;
- no PII embebida;
- scopes limitados.

## Merge de clientes

Operación sensible:

- permiso específico;
- preview;
- confirmación;
- audit;
- reversible.

## IA

- minimizar PII;
- herramientas internas con scopes;
- no SQL directo;
- no secretos;
- no autoacciones críticas V1;
- validar structured outputs;
- límites de coste/timeout.

## Ban / debtor

No exponer restricciones comerciales al cliente ni repartidor salvo necesidad operacional explícita.

## Backups

Configurar backups/retención DB y restauración probada antes de producción.
