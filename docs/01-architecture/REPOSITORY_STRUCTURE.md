# Repository Structure

```text
verdeo-sca/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ routes/
│  │  │  ├─ layouts/
│  │  │  ├─ features/
│  │  │  ├─ components/
│  │  │  ├─ stores/
│  │  │  └─ lib/
│  └─ api/
│     └─ src/
│        ├─ routes/
│        ├─ middleware/
│        ├─ webhooks/
│        └─ app.ts
├─ packages/
│  ├─ db/
│  ├─ domain/
│  ├─ contracts/
│  ├─ auth/
│  ├─ rbac/
│  ├─ audit/
│  ├─ events/
│  ├─ messaging/
│  ├─ ai/
│  ├─ cms/
│  ├─ maps/
│  ├─ storage/
│  ├─ ui/
│  ├─ config/
│  └─ observability/
├─ docs/
├─ AGENTS.md
├─ package.json
├─ tsconfig.base.json
└─ README.md
```

## Feature folders sugeridos

```text
features/orders/
  api.ts
  components/
  hooks/
  pages/
  schemas.ts
  store.ts
  types.ts
```

La lógica de negocio no debe residir en componentes React ni Zustand.

## Estado frontend

Zustand:

- estado de UI;
- filtros;
- drafts locales;
- preferencias de pantalla;
- composición temporal de formularios.

No usar Zustand como cache autoritativa de datos del servidor.
