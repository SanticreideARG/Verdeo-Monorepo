# Implementation Roadmap

## Meta

Llegar a V1 de pruebas reales rápidamente sin construir primero integraciones secundarias.

## Estado (as built)

Fases 0-3 y 7 completas. Fases 4, 5, 6 y 8 completas como V1/esqueleto funcional — cada una con su
propia sección "As built" en el documento de feature correspondiente, con lo diferido explícito ahí.
Fase 9 (QA/Pilot) es la única que queda: es mayormente trabajo humano (piloto real, migración de
datos, backups) más que código nuevo.

| Fase                             | Estado                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------- |
| 0 - Foundation                   | ✅ completa                                                                   |
| 1 - Auth, RBAC, Audit            | ✅ completa                                                                   |
| 2 - CRM / Customer Identity      | ✅ completa                                                                   |
| 3 - Weekly Menu / Catalog        | ✅ completa                                                                   |
| 4 - Landing CMS + Web Orders     | ✅ completa — ver `CMS_AND_PUBLIC_WEB.md` "As built"                          |
| 5 - Messaging Core / WhatsApp    | ◐ esqueleto funcional — ver `MESSAGING_WHATSAPP.md` "As built"                |
| 6 - AI Core                      | ◐ esqueleto funcional — ver `AI_CORE.md` "As built"                           |
| 7 - Production                   | ✅ completa                                                                   |
| 8 - Routes / Delivery / Payments | ◐ esqueleto funcional — ver `DELIVERY_AND_ROUTES.md`/`PAYMENTS.md` "As built" |
| 9 - QA / Pilot                   | ⏳ pendiente                                                                  |

## Fase 0 - Foundation (1-2 días)

- monorepo;
- TypeScript strict;
- lint/format/test;
- env/config;
- Vercel;
- Neon;
- Drizzle;
- Zod contracts;
- observability;
- base CI;
- migrations.

## Fase 1 - Auth, RBAC, Audit (1-2 días)

- User/Role/Permission;
- multi-role;
- overrides;
- sessions/OAuth;
- admin users;
- Audit Core.

## Fase 2 - CRM / Customer Identity (1-2 días)

- Customer;
- identities;
- addresses;
- preferences;
- restrictions;
- geocoding adapter;
- merge/unmerge base.

## Fase 3 - Weekly Menu / Catalog (1-2 días)

- ProductFamily/Variant;
- WeeklyMenu;
- Intuitivo;
- prices;
- publish;
- history.

## Fase 4 - Landing CMS + Web Orders (2-3 días)

- CMS;
- landing mobile;
- menu;
- guest checkout;
- draft/confirm;
- customer matching;
- tracking base.

## Fase 5 - Messaging Core / WhatsApp (2-4 días)

- MessagingAccount;
- Meta webhook;
- router;
- inbox;
- outbound;
- templates;
- multioperator;
- message audit.

## Fase 6 - AI Core (paralela desde Foundation; 2-4 días acumulados)

- provider interface;
- router;
- prompt registry;
- quotas;
- usage;
- first tasks;
- structured output;
- workbench básico.

## Fase 7 - Production (1-2 días)

- kitchen snapshots;
- partial/final/delta;
- exports;
- production report;
- surplus;
- opportunity sales.

## Fase 8 - Routes / Delivery / Payments (3-5 días)

- route builder;
- optimizer adapter;
- delivery PWA;
- triggers;
- payment states;
- cash collection/settlement;
- QR/labels.

## Fase 9 - QA / Pilot (3-5 días)

- migration/import;
- permission tests;
- mobile QA;
- webhook resilience;
- backup/restore;
- load sanity;
- operator pilot;
- bug fixing.

## Estimación

- MVP interno: ~7-10 días con foco y agentes.
- V1 completa para pruebas reales: ~14-18 días.
- Estabilización: ~3 semanas.
- Omnicanal completo/marketing avanzado: posterior.

Las estimaciones son agresivas y dependen de acceso inmediato a Meta, datos, assets y decisiones abiertas.
