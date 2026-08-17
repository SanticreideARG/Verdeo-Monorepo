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
