# AGENTS.md - Instrucciones maestras para agentes

## Misión

Construir Verdeo SCA siguiendo la librería documental de este repositorio. Antes de implementar una feature, leer su especificación de dominio, seguridad, UX y ADR relacionada.

## Reglas de trabajo

- No hardcodear roles, productos, ciudades, zonas, proveedores IA ni cuentas de WhatsApp.
- No introducir una segunda fuente de verdad.
- No usar enums rígidos para catálogos que el negocio puede reconfigurar.
- Usar UUID como ID interno. Los identificadores públicos legibles (ej. `N00453`) son campos separados.
- Todas las mutaciones relevantes deben producir auditoría.
- Todas las integraciones externas deben ser idempotentes.
- Todos los webhooks deben persistirse/verificarse antes de procesar efectos secundarios.
- Los eventos entrantes se guardan antes de IA/clasificación.
- Validar input en límites del sistema con Zod.
- No confiar en validación del frontend.
- No exponer PII innecesaria en endpoints.
- La Delivery App no debe recibir teléfono, email, Instagram ni historial del cliente.
- No permitir que un LLM calcule totales, cantidades de cocina, saldos, permisos o estados.
- Para extracción IA, usar salida estructurada validada por Zod.
- Ninguna API key de proveedor se entrega al frontend.
- Las claves configurables desde UI deben almacenarse cifradas.
- Los fallbacks IA deben respetar capacidades, políticas, cuotas y bloqueos.
- Las acciones sugeridas por IA deben requerir confirmación en V1.
- Mantener adaptadores de proveedor: mensajería, IA, geocoding, mapas, storage.
- Preferir funciones pequeñas, servicios de dominio explícitos y transacciones DB.
- No crear microservicios sin necesidad operativa real.

## Flujo obligatorio por feature

1. Leer documentos aplicables.
2. Identificar entidades, permisos, eventos y auditoría.
3. Definir/actualizar schema Drizzle y Zod.
4. Crear servicio de dominio.
5. Crear endpoints Hono.
6. Crear tests de dominio/API.
7. Crear UI.
8. Verificar mobile.
9. Verificar permisos con matriz RBAC.
10. Verificar logs/auditoría.
11. Verificar estados de error y reintentos.
12. Documentar cualquier decisión nueva en ADR.
13. Actualizar `docs/08-delivery/BACKLOG.md` y el estado de fase en
    `docs/08-delivery/IMPLEMENTATION_ROADMAP.md` **en el mismo commit que la feature**.

## La documentación se despacha con el código

En este repo los documentos mandan: la próxima decisión de qué construir se toma leyéndolos. Un
backlog desactualizado es entonces peor que no tener ninguno, porque se lo cree.

El backlog se desincronizó dos veces, y las dos por el mismo motivo: la feature se despachó y el
documento quedó para después. "Después" no llegó. Por eso actualizar el documento **no es una tarea
posterior sino parte del mismo commit** — si el commit no toca la documentación que su cambio
invalida, el commit está incompleto.

Aplica a: backlog, estado de fase en el roadmap, la sección "As built" del documento de feature
correspondiente, y un ADR si la decisión es nueva.

## Convenciones sugeridas

- TypeScript `strict`.
- ESLint + Prettier.
- Nombres de código en inglés.
- Copy de UI en español.
- Fechas persistidas en UTC; presentación en zona horaria configurada por operación.
- Dinero como entero en unidad mínima o decimal exacto; nunca float.
- Logs estructurados.
- Correlation/request ID.
- Soft-delete sólo donde sea necesario; preferir estados activos/inactivos.
- Índices únicos parciales o restricciones para identidades externas.
- Idempotency keys para webhooks, envíos y acciones sensibles.

## Definición de terminado

Una feature no está terminada si:

- funciona sólo como happy path;
- no audita cambios;
- no tiene permisos;
- filtra PII;
- no contempla reintentos/idempotencia en integraciones;
- rompe mobile;
- depende de un proveedor IA específico;
- duplica datos que ya existen en otra entidad;
- deja el backlog o el roadmap diciendo algo distinto de lo que hace el código.

## No inventar

Consultar/registrar OPEN si una decisión no está en documentación y afecta:

- dinero;
- consentimiento;
- producción;
- identidad/merge;
- permisos;
- estados;
- mensajes automáticos;
- datos visibles a repartidores;
- reglas de cierre semanal.
