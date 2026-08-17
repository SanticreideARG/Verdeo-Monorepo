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
