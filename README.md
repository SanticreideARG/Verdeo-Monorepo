# Verdeo SCA - Project Library

**Verdeo SCA (Serverless CRM App)** es la reconstrucción operativa de Verdeo como una aplicación serverless-first, mobile-first y orientada a eventos. Esta librería constituye la especificación de arranque del proyecto y está pensada para que un agente de desarrollo pueda comenzar a trabajar sin requerir prompts funcionales uno por uno.

El repositorio ya incluye el primer slice ejecutable del monorepo. La especificación continúa siendo la
fuente de verdad para cada feature.

## Objetivo

Reemplazar progresivamente el uso operativo de planillas, portapapeles, formularios dispersos y mensajería manual por una única plataforma que gestione:

- clientes e identidades multicanal;
- pedidos y ciclos semanales;
- menú semanal;
- producción/cocina;
- excedentes y ventas de oportunidad;
- cobros y rendiciones;
- rutas y reparto;
- WhatsApp multi-cuenta;
- landing/CMS y pedidos web;
- IA transversal multiproveedor;
- auditoría integral;
- analytics operativos.

## Principios no negociables

1. **Serverless-first, no serverless-at-all-costs.**
2. **PostgreSQL es la fuente única de verdad.**
3. **No duplicar datos operativos entre vistas.**
4. **RBAC + permisos individuales; nunca lógica rígida por rol.**
5. **Todo cambio relevante es auditable.**
6. **La IA interpreta, propone, redacta, clasifica y transforma; el código/SQL decide cantidades, precios, estados, permisos y reglas críticas.**
7. **La IA V1 no ejecuta acciones críticas de forma autónoma.**
8. **El repartidor no recibe datos de contacto del cliente.**
9. **WhatsApp oficial (Meta Cloud API) es el canal prioritario.**
10. **Los proveedores externos deben quedar detrás de interfaces/adaptadores.**
11. **Mobile-first para cliente y reparto; desktop/mobile eficiente para operaciones.**
12. **La aplicación debe seguir funcionando aunque un proveedor de IA esté caído o bloqueado.**

## Stack objetivo

- React
- Vite
- TypeScript
- Tailwind CSS
- Zustand
- Hono
- Vercel Functions con runtime Node.js
- PostgreSQL
- Neon preferido
- Drizzle ORM
- Zod
- PWA para reparto/cliente donde aporte valor
- Meta WhatsApp Cloud API
- APIs IA configurables
- Storage compatible con objetos para assets/documentos

## Superficies

- `/` - landing pública + menú + pedido web.
- `/login` - autenticación.
- `/mi-cuenta` - experiencia cliente autenticado, manteniendo estética de landing.
- `/app` - Staff App para operadores/administradores.
- `/delivery` - Delivery App para repartidores.
- `/p/:token` - recurso público limitado asociado a pedido/etiqueta/QR.

## Lectura recomendada para un agente

1. `AGENTS.md`
2. `docs/00-product/PRODUCT_SPEC.md`
3. `docs/01-architecture/SYSTEM_ARCHITECTURE.md`
4. `docs/02-domain/DOMAIN_MODEL.md`
5. `docs/02-domain/STATE_MACHINES.md`
6. `docs/03-features/*`
7. `docs/04-ai/AI_CORE.md`
8. `docs/06-security/SECURITY_AND_PRIVACY.md`
9. `docs/08-delivery/IMPLEMENTATION_ROADMAP.md`
10. `docs/10-decisions/ADR_INDEX.md`

## Estado de la especificación

La especificación contiene decisiones cerradas y también asuntos marcados como **OPEN**. Un agente puede implementar lo cerrado. No debe inventar decisiones de negocio abiertas que alteren datos, permisos, cobros, producción o comunicación.

## Desarrollo local

Requisitos: Node.js 22+ y Corepack.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Staff dashboard: `http://localhost:5173/app`
- Operations center: `http://localhost:5173/app/operaciones`
- Guest order: `http://localhost:5173/pedido`

Para ejecutar todos los controles de calidad:

```bash
pnpm check
```

Consulta `docs/12-development/DEVELOPMENT.md` para migraciones y estado de implementación.

Las próximas tareas están especificadas en `docs/12-development/NEXT_TASKS.md`, con runbooks separados
para Neon, Auth/RBAC/Audit y CRM.

El acceso temporal al dashboard MVP y la provisión del primer superadmin están documentados en
`docs/12-development/MVP_DASHBOARD_ACCESS.md`.

El motor MVP de menús, clientes, pedidos, cocina y la base de configuración IA están documentados en
`docs/12-development/MVP_ORDER_ENGINE.md`.

El procedimiento de publicación está en `docs/12-development/VERCEL_DEPLOYMENT.md` e incluye los
entrypoints ya implementados para Hono/Vite, configuración del monorepo, entornos, migraciones, smoke tests
y rollback.

La preparación de Google OAuth mediante Supabase, sus variables Web/API, el vínculo seguro con los usuarios
y permisos internos, las invitaciones y el rollback están en
`docs/12-development/SUPABASE_OAUTH_SETUP.md`.
