# Clientes 2 (plan, 2026-11-07)

Pedido: replantear la sección Clientes de punta a punta, sin perder nada de lo que hace hoy. Tiene que tener:

- la lista completa con su total, cargándose al bajar;
- una vista de columnas;
- una ficha más clara.

Y dejar planificado el análisis de clientes frecuentes, que viene después.

## 1. Lo que hace hoy (no se pierde nada)

**Lista**

- Buscador por nombre, teléfono o correo, sin importar tildes.
- 100 por página con "Cargar más".
- "Actualizar".
- Avatar con inicial, nombre, contacto y estado.

**Acciones de arriba**

- Nuevo cliente, con alta rápida y "después de guardar".
- Exportar a Excel, con columnas elegibles.
- Fusionar duplicados.
- Importar contactos desde una planilla, con vista previa, repetidos y avisos.

**Ficha**

- Estado, "NUEVO" e interruptor "Cliente nuevo (a mano)".
- Cliente desde.
- Contadores de pedidos, domicilios y contactos.
- Editar información general: nombre visible, nombre, apellido, estado y notas internas. Desde ahí también se cambia de ciudad y se elimina el cliente.
- Contactos: tarjetas y "Agregar contacto". Teléfono y WhatsApp se unifican cuando son el mismo número, con enlace a WhatsApp.
- Domicilios:
  - estado de ubicación;
  - Actualizar ubicación, con candidatos, ubicación manual en el mapa y rechazo;
  - Eliminar;
  - Agregar domicilio.
- Pedidos asociados: ítems, platos, estado, enlace al pedido y deuda con enlace a Por cobrar.

**En otras pantallas**

- Clientes archivados, en el Panel de control.
- Contactos para mensajes masivos.

## 2. Cómo queda

### Encabezado

- El título y el total del padrón ("578 clientes").
- **"Nuevo cliente"** como única acción principal. El resto en un menú "Más":
  - Importar;
  - Exportar;
  - Fusionar duplicados;
  - Ver archivados (si tiene el permiso).

### Barra de búsqueda y filtros

Una sola línea en escritorio. En el teléfono, el buscador y un botón "Filtros".

- **Buscar:** nombre, teléfono o correo, sin tildes.
- **Filtros:**
  - Estado;
  - Zona y Barrio, de la ciudad elegida arriba;
  - Nuevos;
  - Con deuda;
  - Sin pedidos hace más de N semanas;
  - Sin ubicar (domicilio sin ubicación).
- **Orden:**
  - Nombre A–Z (por defecto);
  - Último pedido;
  - Más pedidos;
  - Más gastado;
  - Alta más reciente.
- **Vista:** **Tarjetas · Columnas**, igual que Pedidos. Se recuerda por persona.

### Vista Tarjetas: lista y ficha

- **Escritorio:** lista a la izquierda y ficha a la derecha, como hoy. La lista es más compacta y muestra:
  - nombre;
  - zona;
  - último pedido;
  - una marca si tiene deuda o falta ubicar algún domicilio.
- **Teléfono:** la lista ocupa toda la pantalla. Tocar un cliente abre la ficha a pantalla completa con "← Clientes", y "atrás" del navegador vuelve a la lista. Hoy se apilan las dos.
- **Carga:** la lista se carga sola al bajar y el total va siempre arriba.

### Vista Columnas

- Usa `DataTable` con el selector de columnas, el orden por columna y la fila de totales, como Pedidos.
- **Columnas:**
  - Cliente;
  - Teléfono / WhatsApp (con enlace);
  - Correo;
  - Ciudad;
  - Zona;
  - Barrio;
  - Estado;
  - Nuevo;
  - Pedidos;
  - Último pedido;
  - Total gastado;
  - Deuda;
  - Cliente desde;
  - Domicilio principal;
  - Ubicación (ubicado o falta).
- **Fila de totales:** clientes, pedidos, gastado y deuda de lo filtrado.
- **Doble clic en una fila** abre la ficha; en la vista Columnas, como panel lateral.
- **"Exportar lo que veo":** la exportación respeta los filtros y las columnas visibles.

### Ficha, con pestañas

**Cabecera**

- Nombre, estado, "NUEVO" y ciudad.
- **Acciones rápidas** en una fila:
  - WhatsApp;
  - Llamar;
  - Correo;
  - **Nuevo pedido para este cliente** (abre Pedidos con el cliente elegido);
  - Copiar teléfono.
- **Métricas:**
  - pedidos;
  - total gastado;
  - último pedido ("hace 2 semanas");
  - frecuencia ("cada 1,5 semanas");
  - deuda.

**Pestañas**

1. **Resumen:**
   - contacto principal;
   - domicilio principal con su mapa chico;
   - notas internas, editables ahí mismo;
   - los últimos 3 pedidos.
2. **Pedidos:** todos, con filtro por período y enlace a cada uno. Arriba, la deuda.
3. **Domicilios:** todo lo de hoy (ubicar, candidatos, mapa, eliminar, agregar), en tarjetas más claras.
4. **Contactos:** unificados, con Agregar.
5. **Datos:**
   - nombre, apellido, estado;
   - cambiar de ciudad;
   - fusionar con otro;
   - eliminar o archivar;
   - el historial de cambios del cliente, sacado de la auditoría.

### Detalles

- **Editar:** las notas se editan en el lugar; nombre y estado, en "Datos". Se acaba el plegable "Editar información general".
- **Importar:** pasa a un diálogo, con la misma vista previa de hoy. Ya no ocupa el final de la página.
- **Vacíos:** cada pestaña dice qué falta y qué hacer ("Sin domicilios: agregá uno para poder repartir").
- **Accesibilidad:** pestañas con teclado y todo lo tocable de 40 px, como en la auditoría.

## 3. API

**Sin migraciones en las fases 1 a 3.**

`GET /api/v1/customers` suma:

- **`sort`:** `name`, `last_order`, `orders`, `spent` o `created`.
- **Filtros:**
  - `zoneId`;
  - `neighborhoodId`;
  - `isNew`;
  - `withDebt`;
  - `inactiveWeeks`;
  - `unlocated`.
- **Por fila:**
  - `orderCount`;
  - `lastOrderAt`;
  - `spentMinor` (pedidos no cancelados);
  - `debtMinor`;
  - `zoneName`;
  - `neighborhoodName`;
  - `primaryAddress`;
  - `located`.

  Salen de subconsultas agrupadas por cliente sobre `orders` y `customer_addresses`, con los índices que ya existen (`orders.customer_id`).

- **`total`:** de lo filtrado, en la primera página.
- **Paginación:** con orden por otra cosa que el nombre, el cursor por id no sirve. Pasa a **desplazamiento** (`offset`, de a 100). Con unos miles de clientes es rápido y simple. Si el padrón crece mucho, se cambia a un cursor por (valor del orden, id).
- **Ficha:** `GET /customers/:id` suma las métricas de la cabecera (frecuencia, gastado, último pedido) y el historial de cambios (`audit_events` del cliente).

## 4. Análisis de clientes frecuentes (fase 4, planificación)

Una pestaña nueva, **Clientes → Análisis**, o dentro de Estadísticas con las pestañas de análisis que ya existen. Cada número abre la lista de clientes ya filtrada.

- **Segmentos por recencia, frecuencia y monto (RFM):**

  | Segmento    | Criterio                                     |
  | ----------- | -------------------------------------------- |
  | Frecuentes  | pidieron en 3 o más de las últimas 6 semanas |
  | Ocasionales | 1 o 2 de las últimas 6                       |
  | En riesgo   | eran frecuentes y no piden hace 2 semanas    |
  | Perdidos    | más de 8 semanas sin pedir                   |
  | Nuevos      | primera compra en las últimas 4 semanas      |

- **Retención por cohorte:** de los que empezaron en cada mes, cuántos siguen pidiendo 1, 2 y 3 meses después.
- **Mejores clientes:** por gasto y por cantidad, con su variedad preferida.
- **Valor de un cliente:** gasto promedio por cliente y cuánto dura un cliente en promedio.
- **Preferencias:** variedades y tamaños por cliente y por segmento. Sirve para planificar la cocina y para mensajes dirigidos.
- **Alertas en el feed:** "5 clientes frecuentes no pidieron esta semana", con enlace a la lista y a "Mensajes" para escribirles.
- **Tablas:**
  - Se puede calcular al vuelo sobre `orders`.
  - Si se pone lento, una tabla `customer_metrics_weekly` con una foto por semana. Sería **una migración en su propio commit**.

Las definiciones de "frecuente" y "en riesgo" se confirman antes de la fase 4.

## 5. Fases

Cada fase va en su propio commit, con pruebas, Ayuda, novedades y BACKLOG.

1. **Lista y columnas**
   - total;
   - carga al bajar;
   - orden por nombre;
   - filtros y orden;
   - columnas nuevas en la API;
   - vista Columnas;
   - contactos unificados con enlace a WhatsApp.
2. **Ficha nueva:** cabecera con acciones rápidas y métricas, pestañas, edición en el lugar, historial de cambios, y ficha a pantalla completa en el teléfono.
3. **Encabezado y diálogos:** menú "Más", Importar como diálogo, "Exportar lo que veo", vacíos con indicaciones, pulido de teléfono y tablet.
4. **Análisis de frecuentes:** sección 4.

## 6. Decisiones (2026-11-07)

1. **Orden por defecto:** Nombre A–Z. Cada persona puede elegir otro y queda recordado.
2. **Frecuente:** pidió en 3 o más de las últimas 6 semanas. "En riesgo" queda como en la tabla de la sección 4 (era frecuente y no pide hace 2 semanas) hasta verlo con datos.
3. **Etiquetas propias:** no por ahora. Sin migración en las fases 1 a 3.

## 7. Hecho

- **Fase 1** (2026-11-07): total y carga al bajar; contactos unificados con WhatsApp; orden, filtros y columnas en la API (`browseCustomers`); barra de orden y filtros; Tarjetas con zona, último pedido, deuda y "sin ubicar"; vista Columnas con ficha lateral. Falta sólo elegir barrio en la pantalla (la API ya filtra por barrio).

- **Fase 2** (2026-11-10): ficha con pestañas Resumen, Pedidos, Domicilios, Contactos y Datos; cabecera con acciones rápidas y métricas; notas editables en el Resumen; filtro por período en Pedidos; historial de cambios sacado de la auditoría (`GET /customers/:id/history`); en el teléfono, ficha a pantalla completa con "← Clientes" y "atrás" del navegador. "Nuevo pedido" abre Pedidos con `?cliente=`. Las métricas se calculan con los últimos 100 pedidos que ya trae la ficha.

Notas de lo construido:

- Los números de cada cliente cuentan los pedidos no cancelados de la ciudad elegida arriba (todas, si no hay una). La deuda se calcula como en Por cobrar.
- "Sin pedir hace más de N semanas" incluye sólo a quien pidió alguna vez. Quien nunca pidió se ve ordenando por último pedido (quedan al final) o con 0 en Pedidos.
- La búsqueda por teléfono o correo va en la misma consulta que la del nombre, así el total de lo buscado es exacto.
