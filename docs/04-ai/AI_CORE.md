# AI Core

## Principio

IA es una capa transversal, no un chatbot aislado.

```text
UI / Workflow
    -> AITask
    -> Prompt Registry
    -> Context/Tools
    -> Model Router
    -> Provider Adapter
    -> Validation
    -> Human approval
    -> Audit
```

## Proveedores

Adaptadores:

- OpenAI
- Gemini
- Anthropic
- DeepSeek
- OpenAI-compatible genérico

El adaptador genérico permite experimentar con modelos abiertos/hosteados compatibles sin acoplar el dominio.

## Capacidades

Cada modelo declara:

- TEXT
- STRUCTURED_OUTPUT
- TOOL_CALLING
- VISION
- IMAGE_GENERATION
- LONG_CONTEXT
- REASONING

Cada `AITask` declara capacidades requeridas.

## Router

Considera:

1. task;
2. capacidades;
3. modelo habilitado;
4. bloqueo de Gisela/superadmin;
5. cuota;
6. coste;
7. prioridad;
8. fallback policy;
9. timeout.

Políticas:

- `ALLOW`
- `SAME_TIER_ONLY`
- `ASK_USER`
- `DISABLE`

## Prompt Registry

No hardcodear prompts de negocio en componentes.

`AIPrompt`:

- key
- name
- description
- system prompt
- input schema
- output schema
- allowed tools
- preferred provider/model
- fallback
- temperature
- max tokens
- version
- enabled

Versionado y rollback obligatorio.

## Niveles de acción

### Level 0 - Generate

Sólo genera texto/contenido.

### Level 1 - Suggest

Propone datos estructurados.

### Level 2 - Prepare

Prepara mutación/acción y espera confirmación.

### Level 3 - Execute

Autónomo. No V1 salvo automatizaciones deterministas aprobadas.

V1: Level 0/1; Level 2 sólo donde se diseñe confirmación explícita.

## Tools internos

Ejemplos:

- `findCustomer`
- `getCustomerHistory`
- `getCurrentMenu`
- `getOrder`
- `getCurrentPrices`
- `getDeliveryDate`
- `getRouteEstimate`
- `getAvailableSurplus`

El modelo no recibe acceso SQL.

## Structured output

Extracción:

- mensaje -> candidato Customer/Order/Availability.
- validar con Zod.
- mostrar diff/propuesta.
- operador aplica.

## Auditoría

`AIExecution`:

- userId
- task
- promptVersion
- provider/model
- input hash
- context/tools
- output
- accepted/edited/rejected
- latency
- token usage
- estimated cost
- timestamp

## Presupuestos

Gisela controla:

- proveedores habilitados;
- modelos habilitados;
- cuotas;
- budgets;
- capacidad de seleccionar modelos;
- image generation.

Medir coste además de tokens.

## Seguridad

- claves fuera del frontend;
- secrets institucionales en environment/secret store;
- keys ingresadas desde UI cifradas;
- nunca mostrar secreto completo;
- minimizar PII enviada a modelos;
- logging con redacción cuando corresponda.

## As built (Fase 6 — esqueleto)

Paquete `@verdeo/ai` extendido (ya tenía el cifrado de claves de `ai_provider_configs`, sin usar
hasta ahora): `AIProvider` (adapter), `ModelCapability`, `selectProvider` (router puro
task→capacidad→proveedor habilitado→preferencia opcional). Tablas `ai_prompts`,
`ai_prompt_versions`, `ai_executions` (migración 0021, additiva). Servicios
`PostgresAIPromptService`, `PostgresAITaskService`.

- **Un solo adapter real cubre varios proveedores**: `OpenAICompatibleProvider`
  (`apps/api/src/integrations/ai-providers.ts`) habla Chat Completions, que sirve para OpenAI,
  DeepSeek y cualquier host autoalojado compatible — solo cambia `baseUrl` por fila configurada.
  Este es el "adaptador OpenAI-compatible genérico" que pide este documento.
- **Prompt Registry con versionado real**: cada guardado crea una fila nueva en
  `ai_prompt_versions`, nunca edita una existente; `ai_prompts.active_version_id` apunta a la
  versión viva. Activar una versión anterior (rollback) es solo mover ese puntero — mismo patrón
  que página/revisión en el CMS.
- **`AIExecution`** registra actor, tarea, versión de prompt, proveedor/modelo, hash del input,
  output, latencia, tokens y si terminó en `completed` o `error` — incluso un fallo de validación
  de output estructurado queda auditado antes de propagar el error.
- **Tres tareas del catálogo funcionando de punta a punta** (ver AI_TASK_CATALOG.md más abajo):
  `rewrite_message` (texto plano), `extract_order` (output estructurado validado con Zod),
  `kitchen_summary` (alimentada por el resumen de cocina ya determinista de `@verdeo/orders` — la
  IA nunca recalcula cantidades).
- Workbench en `/app/ia/workbench`: elegir tarea, guardar versión de prompt, rollback con un clic,
  ejecutar contra variables libres e inspeccionar output/proveedor/modelo/tokens.
- Permisos `ai.use`/`ai.prompts.manage` en uso (ya reservados); `ai.providers.manage`/
  `ai.budgets.manage`/`ai.models.select`/`ai.images.generate` siguen reservados sin usar.

**Diferido**: `IMAGE_GENERATION`, presupuestos/cuotas en costo real (por ahora solo
habilitado/deshabilitado), niveles de acción 2+ con confirmación explícita, tool calling ("Tools
internos"), el resto del catálogo (~15 tareas).
