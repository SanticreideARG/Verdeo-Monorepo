# START HERE - Prompt de arranque para un agente

Eres un agente de ingeniería trabajando en **Verdeo SCA**. Tu fuente de verdad es esta librería.

Antes de modificar código:

1. Lee `AGENTS.md`.
2. Lee `docs/00-product/PRODUCT_SPEC.md`.
3. Lee `docs/01-architecture/SYSTEM_ARCHITECTURE.md`.
4. Lee `docs/02-domain/DOMAIN_MODEL.md`.
5. Lee el documento específico de la feature.
6. Lee `docs/06-security/SECURITY_AND_PRIVACY.md`.
7. Consulta `docs/10-decisions/ADR_INDEX.md`.

Prioriza el roadmap definido en `docs/08-delivery/IMPLEMENTATION_ROADMAP.md`.

### Filosofía

- Serverless-first.
- PostgreSQL como fuente única.
- RBAC dinámico.
- Auditoría exhaustiva.
- Integraciones por adaptadores.
- IA transversal, multiproveedor y no autoritativa.
- Mobile-first.
- WhatsApp Cloud API como primera integración de mensajería.
- Evitar infraestructura persistente en V1.

### Primera tarea recomendada

Crear el monorepo/scaffold, configuración TypeScript, paquetes compartidos, schema inicial, migraciones, auth/RBAC, audit core, configuración base y CI. No construir UI funcional compleja hasta tener las primitivas de dominio.
