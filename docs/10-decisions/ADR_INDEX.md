# Architecture Decision Records

## ADR-001 - Serverless-first

**Status:** Accepted
Core en Vercel/Neon. Procesos persistentes sólo si una integración futura lo exige.

## ADR-002 - Hono + Node runtime

**Status:** Accepted
Hono/TypeScript sobre funciones Node.js.

## ADR-003 - PostgreSQL / Neon

**Status:** Accepted  
Fuente única de verdad, conexiones pooled.

## ADR-004 - RBAC dinámico

**Status:** Accepted  
Multi-role + permission overrides.

## ADR-005 - Customer separado de User

**Status:** Accepted  
CRM no depende de que cliente tenga login.

## ADR-006 - External identities

**Status:** Accepted  
WhatsApp/email/Instagram/etc. como identidades de Customer.

## ADR-007 - Messaging provider abstraction

**Status:** Accepted  
V1 WhatsApp; futuros Instagram/Messenger/email.

## ADR-008 - Meta Cloud API

**Status:** Accepted  
No Puppeteer/Evolution como dependencia de V1.

## ADR-009 - AI provider abstraction

**Status:** Accepted  
OpenAI/Gemini/Anthropic/DeepSeek/OpenAI-compatible.

## ADR-010 - AI non-authoritative

**Status:** Accepted  
Código/SQL decide reglas críticas.

## ADR-011 - Weekly menu history

**Status:** Accepted  
Conservar indefinidamente.

## ADR-012 - Order public number

**Status:** Accepted  
ID interno UUID + número global `Nxxxxx`.

## ADR-013 - Production snapshots

**Status:** Accepted  
Parcial martes 20:00 + final miércoles 19:00 + delta.

## ADR-014 - Delivery PII minimization

**Status:** Accepted  
El repartidor no recibe contactos.

## ADR-015 - CMS typed sections

**Status:** Accepted  
CMS acotado, no page builder genérico.

## ADR-016 - Deterministic route optimizer

**Status:** Accepted  
LLM no optimiza rutas como motor principal.

## ADR-017 - Event-oriented core

**Status:** Accepted  
Mutaciones importantes emiten eventos de dominio.

## ADR-018 - Price snapshot on order item

**Status:** Accepted  
Histórico no cambia al actualizar precios.

## ADR-019 - Provider-neutral authentication boundary

**Status:** Accepted

El Core representa identidades de autenticación por `provider + providerSubject`. Los adaptadores OAuth
resuelven la identidad y el Core mantiene sesiones revocables, guardando sólo hashes de tokens opacos.
La selección del proveedor OAuth permanece OPEN, pero no modifica este límite.

## ADR-020 - Acceso MVP mediante credenciales provisionadas

**Status:** Accepted

El sprint MVP habilita email/contraseña únicamente para cuentas creadas por un operador mediante CLI. No
existe registro público ni asignación de privilegios por email sin una transacción de provisión auditada.
Las contraseñas aleatorias se muestran una sola vez, se persisten con scrypt y se bloquean temporalmente
tras cinco intentos fallidos. OAuth se añadirá después como otra `AuthIdentity` del mismo `User`; la
confirmación por correo y Resend quedan fuera de este sprint.

## ADR-021 - Pedido MVP con snapshots y cocina determinista

**Status:** Accepted

El menú, cliente y pedido se persisten en PostgreSQL. Cada `OrderItem` conserva nombre comercial, variante,
precio y composición; el consolidado de cocina se calcula desde pedidos persistidos por código/SQL. Una
composición modificada se guarda como Intuitivo y no altera el catálogo semanal publicado.

## ADR-022 - Claves IA configurables cifradas en servidor

**Status:** Accepted

Los proveedores y modelos son datos configurables. Las API keys ingresadas por Staff se cifran mediante
AES-256-GCM con una clave maestra exclusiva del servidor; el frontend recibe únicamente estado y máscara.
La configuración no habilita ejecución hasta implementar Prompt Registry, routing, cuotas y auditoría de
ejecuciones.

## ADR-023 - Captura asistida con confirmación humana

**Status:** Accepted

La extracción desde conversaciones produce un único borrador estructurado validado, nunca un pedido real.
Un operador vincula el cliente, revisa ítems, cantidades y precios, y confirma la creación mediante el motor
determinista. Las sugerencias de respuesta también requieren revisión y envío humano en V1.

## ADR-024 - Estados operativos del pedido

**Status:** Accepted

El MVP conserva `DRAFT/CONFIRMED/READY/DELIVERED/CANCELLED` como ciclo resumido del pedido. Producción,
ruteo y entrega detallada son dominios relacionados con estados propios; no se agregan `produccion` o
`reparto` al estado comercial. Las reversiones y cancelaciones requieren motivo, las reversiones además
confirmación explícita. Al cerrar el ciclo se bloquean confirmaciones, cancelaciones y retornos a
`CONFIRMED`, salvo permiso `orders.override_cycle_lock`; el avance normal `CONFIRMED -> READY -> DELIVERED`
continúa permitido.

## ADR-025 - CRM como fuente única y snapshots en pedidos

**Status:** Accepted

`Customer` es la fuente única del cliente comercial. Sus teléfonos, WhatsApp, emails y otros canales se
guardan como `CustomerIdentity` normalizadas; los domicilios se modelan como relaciones independientes y
pueden conservar texto escrito, enlace de ubicación y coordenadas. Un pedido puede referenciar el domicilio
usado, pero siempre guarda snapshots de dirección y enlace para que su histórico no cambie al editar el CRM.
Preferencias y restricciones no modifican retrospectivamente pedidos. Las plantillas de mensajes usan claves
de acción configurables y sus variables deben coincidir exactamente con el cuerpo antes de persistirse.
