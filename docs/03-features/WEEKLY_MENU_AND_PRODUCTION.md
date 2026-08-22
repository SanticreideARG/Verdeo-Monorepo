# Weekly Menu, Production & Opportunity Sales

## Catálogo actual

Variedades base:

- Real
- Keto
- Anti-Age
- Detox

Cada una:

- 5 platos semanales;
- variante 250;
- variante 400.

`250` y `400` son nombres comerciales; no mostrar unidad.

### Intuitivo

- cinco platos elegidos por cliente;
- sólo platos publicados esa semana;
- repeticiones permitidas;
- 250 usa universo 250;
- 400 usa universo 400;
- cualquier modificación de una variedad base convierte la unidad en Intuitivo.

## Precios

El precio depende del tamaño y del alcance comercial, nunca de la variedad: Keto 250 y Real 250
cuestan lo mismo dentro de la misma semana y operación. La lista `weekly_menu_prices` es la autoridad;
`weekly_menu_offerings.unit_price_minor` queda como override deliberado por variedad y es nulo en el
caso normal.

El tamaño es un catálogo administrable (`product_sizes`) con nombre comercial, comidas por unidad y
orden de presentación. `250` y `400` son nombres comerciales y no expresan unidad de medida.

La variedad declara su tipo de composición como dato (`product_families.kind`): `FIXED` define cinco
platos, `COMPOSABLE` deja que el cliente elija cinco del universo publicado para su mismo tamaño.
Ningún branch del motor identifica la variedad componible por su nombre.

El `slot` 1..5 es orden de carga y presentación; no representa un día de entrega.

Precios y composición se congelan como snapshot en el pedido: cambiar el catálogo o la lista nunca
altera pedidos ya emitidos.

La carga es global: el menú maestro no pertenece a ninguna operación. La distribución materializa
una revisión propia por operación, y a partir de ahí cada ciudad tiene sus propios precios por tamaño
y su propia composición. Un pedido referencia siempre una revisión concreta; nunca se compone menú
global más overrides regionales en el momento del pedido (ADR-028).

Modos de distribución:

1. **Sólo donde no exista** — crea la revisión regional y no toca las que ya están.
2. **Actualizar lo no personalizado** — además refresca precios y variedades que ninguna ciudad editó.
   Cada fila lleva su marca `customized`, así que la personalización se preserva a nivel de precio y
   de variedad, no de menú entero.
3. **Reemplazar** — sobrescribe también lo personalizado. Requiere el permiso `menus.distribute_replace`
   y confirmación explícita; el permiso de distribuir por sí solo no alcanza.

Una revisión regional ya publicada nunca se reescribe: es el snapshot contra el que se cotizaron los
pedidos vivos. La distribución la omite e informa `SKIPPED_PUBLISHED`.

Una operación sin revisión propia vende el menú maestro publicado. Eso es selección de revisión, no
fallback campo por campo.

## Weekly Menu Builder

Funciones V1:

- crear semana;
- cargar 5 platos por variedad;
- duplicar estructura si sirve;
- draft/publicar;
- historial indefinido;
- vista previa;
- alimentar pedido web;
- generar copy WhatsApp;
- generar Story 1080x1920;
- generar material para otros canales;
- IA para copy/CTA;
- media assets.

Los menús se conservan indefinidamente: el costo de DB es despreciable y el valor histórico es alto.

## Producción

La vista de cocina consolida:

- Real 250 cantidad
- Real 400 cantidad
- Keto 250 cantidad
- Keto 400 cantidad
- Anti-Age 250 cantidad
- Anti-Age 400 cantidad
- Detox 250 cantidad
- Detox 400 cantidad
- Intuitivo 250 #n: composición + nombre/ID
- Intuitivo 400 #n: composición + nombre/ID

Restricciones:
`Keto 250: 4 unidades; 1 (Rosa #N00453) sin cebolla`.

## Snapshots

### Martes 20:00

Snapshot parcial.

### Miércoles 19:00

Snapshot final.

Generar:

- consolidado final;
- delta vs parcial;
- PDF;
- Excel;
- texto/WhatsApp.

La IA puede formatear/redactar, pero cantidades salen de SQL/código.

## Excedente

Configuración:

- coeficiente global V1;
- futuro: por producto/tamaño.

Datos:

- demanda confirmada;
- producción planificada;
- producción real;
- excedente efectivo;
- vendido;
- baja/merma.

Cocina informa cuántos productos "salieron". Isabella/Tamara resuelven faltantes operativamente.

## Venta de oportunidad

- se registra como pedido normal;
- `source = opportunity_sale`;
- mismo precio;
- siempre con envío;
- usa stock de excedente;
- no se arrastra a la semana siguiente;
- permitir dar de baja remanente.

### Recomendador

Ranking determinista por:

- compatibilidad producto;
- recurrencia;
- recencia;
- zona;
- disponibilidad de marketing/consentimiento.

IA redacta la oferta; no selecciona arbitrariamente ni envía sin aprobación en V1.
