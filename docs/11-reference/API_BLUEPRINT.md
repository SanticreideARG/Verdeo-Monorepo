# API Blueprint

No es contrato final OpenAPI; es mapa inicial.

## Auth

- `POST /auth/*`
- `GET /me`

## Customers

- `GET /customers`
- `POST /customers`
- `GET /customers/:id`
- `PATCH /customers/:id`
- `POST /customers/:id/merge`
- `POST /customers/:id/unmerge`
- `POST /customers/:id/restrictions`

## Menu

- `GET /public/menu/current`
- `GET /menus`
- `POST /menus`
- `PATCH /menus/:id`
- `POST /menus/:id/publish`

## Orders

- `POST /public/orders`
- `GET /orders`
- `POST /orders`
- `GET /orders/:id`
- `PATCH /orders/:id`
- `POST /orders/:id/confirm`
- `POST /orders/:id/cancel`
- `POST /orders/:id/status`

## Production

- `GET /production/:cycleId`
- `POST /production/:cycleId/snapshots`
- `POST /production/:cycleId/report`
- `GET /production/:cycleId/export`
- `GET /surplus`
- `POST /surplus/:id/opportunity-order`

## Messaging

- `POST /webhooks/meta/whatsapp`
- `GET /conversations`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/ai-suggest`

## Routes

- `GET /routes`
- `POST /routes`
- `POST /routes/:id/optimize`
- `POST /routes/:id/publish`

## Delivery

- `GET /delivery/me/route`
- `GET /delivery/stops/:id`
- `POST /delivery/stops/:id/actions/on-my-way`
- `POST /delivery/stops/:id/actions/at-address`
- `POST /delivery/stops/:id/actions/delivered`

## Payments

- `POST /orders/:id/payments`
- `POST /payments/:id/collect`
- `POST /cash-collections/:id/settle`

## CMS

- `GET /public/pages/:slug`
- `GET /cms/pages`
- `PATCH /cms/pages/:id`
- `POST /cms/pages/:id/publish`
- `POST /cms/pages/:id/revert`

## AI

- `POST /ai/tasks/:taskKey/run`
- `GET /ai/prompts`
- `POST /ai/prompts`
- `POST /ai/prompts/:id/versions`
- `GET /ai/usage`
- `PATCH /ai/providers/:id`

## Audit

- `GET /audit`
- `GET /audit/:entityType/:entityId`
