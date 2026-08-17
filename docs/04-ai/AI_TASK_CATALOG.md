# AI Task Catalog

## Comunicación

### `rewrite_message`

Input: texto.
Acciones: mejorar, acortar, cordial, corregir, tono.

### `customer_reply`

Input: conversación + contexto permitido.
Output: borrador.

### `order_confirmation`

Input: datos deterministas del pedido.
Output: texto de confirmación.

### `followup_draft_order`

Input: campos faltantes.
Output: mensaje de seguimiento.

### `payment_reminder`

Input: estado/importe.
Output: borrador.

## Extracción

### `extract_customer`

Mensaje -> datos candidatos.

### `extract_order`

Mensaje -> productos/cantidad/tamaño.

### `extract_availability`

Mensaje -> ventanas horarias.

### `classify_message`

Clasificación de intención/prioridad.

Todos requieren validación estructurada.

## Menú / contenido

### `weekly_menu_copy`

Menú -> texto semanal.

### `menu_story_copy`

Menú -> copy 1080x1920.

### `marketing_campaign`

Segmento + objetivo -> borrador.

### `generate_image_prompt`

Datos de menú/brand -> prompt visual.

### `generate_campaign_image`

Generación/edición de imagen por provider con capability IMAGE_GENERATION.

## Producción

### `kitchen_summary`

Datos estructurados -> texto legible.

### `kitchen_delta`

Snapshots -> explicación/formato.

La IA jamás calcula las cantidades fuente.

## CRM

### `summarize_conversation`

Resumen para operador.

### `customer_history_summary`

Resumen de historial.

### `opportunity_sale_copy`

Stock + cliente seleccionado -> oferta.

## Rutas

### `route_explanation`

Explica ruta producida por optimizador determinista.

## Workbench

Superadmins/usuarios autorizados pueden:

- elegir task;
- probar prompt;
- variables;
- proveedor/modelo permitido;
- inspeccionar output;
- latencia/tokens/coste;
- guardar nueva versión.
