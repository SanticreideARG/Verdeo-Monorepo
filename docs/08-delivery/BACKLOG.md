# Backlog priorizado

Marcado a partir de IMPLEMENTATION_ROADMAP.md's "Estado (as built)" — ver ese documento y la sección
"As built" de cada feature doc para el detalle de qué exactamente quedó construido en cada V1/esqueleto.

## P0 - Foundation

- [x] Scaffold monorepo.
- [x] Neon + Drizzle migrations.
- [x] Config/env.
- [x] Auth.
- [x] RBAC.
- [x] Audit Core.
- [x] Error model.
- [x] Observability.

## P0 - CRM

- [x] Customer CRUD.
- [x] CustomerIdentity.
- [x] CustomerAddress.
- [x] Preferences/restrictions.
- [x] Geocoding.
- [x] Merge (fusión con lápida, candidatos por nombre/contacto archivado, auditada — ver
      CRM_IMPLEMENTATION.md "As built (fusión, sin reversa)").
- [ ] Unmerge — bloqueado: hace falta una tabla de linaje por relación, hoy sólo se guarda a dónde
      fue la ficha, no de dónde vino cada pedido.
- [ ] Preview de conflictos antes de fusionar.

## P0 - Catalog

- [x] Product families.
- [x] 250/400 variants.
- [x] Weekly Menu.
- [x] Intuitivo (as built: familia `COMPOSABLE` de nombre fijo por el sistema, ver
      WEEKLY_MENU_AND_PRODUCTION.md — más el interruptor `menu_catalog_settings`).
- [x] Price snapshots.

## P0 - Orders

- [x] SalesCycle.
- [x] Draft.
- [x] Confirm.
- [x] Edit/audit.
- [x] Cancel/reprogram.
- [x] Public number.
- [ ] Availability windows.
- [x] Filtered order log by status, zone, customer, and date range.
- [x] Visible order status history.
- [x] Audited order editing with reason.
- [x] CSV export and Excel adapter (`GET /orders/export?format=csv|xlsx`; la planilla trae
      Pedidos, Conciliado y Por zona).
- [x] Ocultar apellidos en pantalla y en la exportación (`maskSurnames=1`).
- [x] Eliminar clientes: borra el que no tiene pedidos, archiva el que sí.
- [x] Ordenar la lista por cualquier columna.

## P0 - Operational capture

- [x] Persisted provider-neutral inbound events with idempotency (`messaging_webhook_events`).
- [x] Conversations and messages linked to customer identities.
- [x] Scoped quick-response template CRUD.
- [ ] One reviewable order draft per order intent.
- [x] Zod-validated AI extraction candidates (`extract_order`, Fase 6).
- [ ] Human review before creating an order.
- [ ] Inline customer lookup/create/edit from capture.
- [ ] Combined customer order and conversation history.

## P0 - Web

- [x] Landing.
- [x] CMS.
- [x] Menu display.
- [x] Guest order wizard.
- [x] Customer portal base (`/mi-cuenta`: acceso por enlace de correo, pedidos, domicilios).

## P0 - WhatsApp

- [ ] Meta setup (esperando credenciales reales — ver MESSAGING_WHATSAPP.md "As built").
- [x] Webhook.
- [x] Multi-account router.
- [x] Inbox.
- [x] Outbound.
- [x] Templates.
- [x] Delivery statuses.
- [x] Customer resolution.
- [ ] Human-approved AI reply suggestions.

## P0 - AI

- [x] Provider interface.
- [x] Model capabilities.
- [x] Router/fallback.
- [x] Prompt registry.
- [ ] Usage/budgets (solo habilitado/deshabilitado por ahora, sin costo/cuota real).
- [x] Rewrite.
- [ ] Customer reply.
- [x] Extract order.
- [ ] Extract customer/availability.
- [ ] Menu copy.

## P1 - Production

- [x] Partial snapshot.
- [x] Final snapshot.
- [x] Delta.
- [x] PDF/Excel/message exports.
- [x] Actual production.
- [x] Surplus.
- [x] Opportunity sale.

## P1 - Logistics

- [x] Route CRUD.
- [x] Hoja de ruta por zona (`geographicZoneId` opcional en `POST /routes`).
- [x] Descartar propuestas de ruta sin publicar.
- [x] Páginas públicas de privacidad (`/privacidad`) y condiciones (`/terminos`), aptas para la
      verificación de OAuth de Google.
- [x] El formulario ofrece sólo fechas con pedidos por rutear, con el conteo.
- [ ] Time windows.
- [x] Optimization adapter (`@verdeo/routing` — determinista, sin ventanas horarias; ver
      DELIVERY_AND_ROUTES.md "As built").
- [x] Publish.
- [x] Delivery PWA.
- [x] Message triggers.
- [x] Delivery confirmation.

## P1 - Payments

- [x] Pending/paid/to-settle.
- [x] Cash collection.
- [x] Settlement.
- [x] Dashboard.

## P1 - Labels

- [x] Label templates (`LabelSettingsPage` + `labels-export.ts`; impresión bajo demanda desde
      producción, nunca automática al confirmar un pedido).
- [ ] Multi-copy.
- [x] Order ID.
- [ ] QR token.

## P1 - Content/AI

- [ ] Story 1080x1920.
- [ ] Brand templates.
- [ ] Image generation provider.
- [x] AI Workbench.

## P2 - Customer surveys

- [x] Survey editor/engine (`SurveysPage`, preguntas configurables).
- [x] Token público por encuesta + ruta `public/survey/:token` (`PublicSurveyPage`).
- [ ] QR de distribución — el enlace directo ya se genera; falta el QR, igual que en Labels.
- [x] Pantalla de resultados/estadísticas por encuesta (`SurveyResultsPage`, gateada por permiso).
- [ ] **Sin decidir**, y bloquea cerrar la fase: si el token es 1:1 con un cliente o anónimo por
      campaña, y si vence o es de un solo uso. Ver Fase 10 en `IMPLEMENTATION_ROADMAP.md`.

## P2

- [ ] Instagram adapter.
- [ ] Messenger adapter.
- [ ] Email adapter.
- [x] Internal messaging (chat de staff con presencia y no-leídos).
- [ ] Marketing automation.
- [x] Advanced analytics (Estadísticas: por zona, semana, tamaño, variedad y día).
- [ ] Recommendation learning.

## Deuda encontrada, sin resolver

- [x] **`updateMenu` borraba y recreaba todas las ofertas de la semana**, dejando sin vínculo a los
      pedidos ya cargados (231 al encontrarlo). Ahora hace upsert contra los índices únicos
      (menú, tamaño) y (menú, variante), así que una variedad que sigue en el menú conserva su `id`;
      se borra sólo lo que el operador sacó. Cubierto en `menu-update.test.ts`.
- [x] **El ciclo de venta es uno solo para todas las localidades y `updateMenu` lo reescribía desde
      cualquier revisión regional**, así que guardar la semana de una ciudad le cambiaba el nombre y
      las fechas a las demás. Desde una revisión regional el ciclo ya no se toca y se rechaza con un
      mensaje si vienen valores distintos; el formulario los muestra de sólo lectura.
- [x] `audit` y `observability` ya tienen tests (5 y 10). Los dos que importan: que `AuditService`
      no se trague un fallo del sink —corre dentro de la transacción de quien audita, y tragarlo
      daría la operación por buena sin dejar rastro— y que el logger tape tokens, claves y headers
      de autorización. Para poder comprobar lo segundo, `createLogger` acepta un destino opcional:
      por defecto pino escribe al descriptor 1 y lo que sale no se puede leer desde un test.
