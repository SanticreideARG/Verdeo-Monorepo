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
