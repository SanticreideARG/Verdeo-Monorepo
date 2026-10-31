# Auditoría de UI del panel (2026-10-31)

Pedido: revisar todo el panel en todos los tamaños de pantalla y anotar qué retocar para que se vea más profesional y pulido. Esto es el diagnóstico; los arreglos se ordenan en el BACKLOG ("Pulido de UI del panel").

## 1. Cómo se hizo

- Panel corriendo en local (API + web) contra una base local con los datos de prueba E2E: un período publicado en Neuquén, 10 pedidos, clientes y usuarios de prueba. Usuario superadmin, para ver todas las pantallas.
- **40 pantallas** del panel (todas las rutas `/app/*`, incluido el detalle de un pedido y todas las de Ajustes) en **tres tamaños**: celular 375 px, tablet 768 px y escritorio 1440 px.
- En cada pantalla y tamaño, un chequeo automático: scroll horizontal de la página, elementos que se salen de la pantalla, botones y controles chicos para el dedo (menos de 32 px), texto menor a 11,5 px, texto recortado, botones sin nombre, títulos `h1` y campos sin etiqueta.
- Contraste de texto medido (WCAG AA: 4,5:1 para texto normal) en Tablero, Pedidos, Cocina, Clientes y Estadísticas.
- Revisión visual con capturas de las pantallas principales en los tres tamaños, con el tema de Halloween (el activo hoy) y con el tema Natural (el de siempre).

No se revisaron: la vista de repartidor (`/reparto/:token`), el sitio público, los temas además de Halloween y Natural, ni pantallas con muchos datos reales (cientos de pedidos o clientes).

## 2. Lo que está bien

- **Ninguna pantalla tiene scroll horizontal** en ningún tamaño. Las tablas anchas scrollean dentro de su caja.
- Cada pantalla tiene su título (salvo las dos excepciones de abajo), y los campos tienen etiqueta.
- En escritorio el panel se ve ordenado y consistente: barra lateral, barra superior, tarjetas y tablas con el mismo lenguaje.
- El celular tiene su propia navegación (barra inferior, Tarjetas/Columnas) y el tablero de celular es claro.

## 3. Hallazgos, por prioridad

### Alta: se nota en todas las pantallas

1. **Texto secundario con poco contraste (3,2:1).** El gris de ayudas, encabezados de tabla, contadores ("10 pedidos"), descripciones y subtítulos de tarjetas es `--db-muted` con 52–54 % de opacidad en todos los temas. Queda por debajo de 4,5:1 en todo el panel y es lo que más hace ver la interfaz "lavada". Arreglo: subir la opacidad a ~70 % en cada tema (un cambio por tema en `styles.css`) y medir de nuevo.
2. **Barra superior en celular y tablet: controles chicos y apretados.**
   - Celular: el selector de ciudad mide 130 × 18 px y el avatar 30 × 30. Los selectores de Estado, el botón "Aa" y el avatar quedan por debajo de 32 px en todas las pantallas.
   - Etiquetas "Estado" y "Ciudad" a 9,8 px, y "SCA" / "Equipo Verdeo" a 10–11 px.
   - Tablet (768 px): el nombre "Test Superadmin" se parte en dos renglones, y entran reloj, clima, Estado, Ciudad, avisos, calendario, Aa, mensajes y avatar en una sola fila.

   Arreglo: altura mínima de 40 px para todo lo tocable, etiquetas de 11 px como mínimo, y en tablet esconder el nombre y el reloj (o pasarlos al menú del avatar).

3. **Botones que se parten en dos o tres renglones en celular.** Los botones son píldoras y, cuando el texto no entra, quedan "huevos":
   - Cocina: "Copiar para WhatsApp", "Informe del período", "Cerrar período".
   - Nuevo pedido: "Buscar cliente" / "Nuevo cliente" y "Guardar y confirmar" / "Guardar como borrador".

   Arreglo: en celular, botones a lo ancho (uno por renglón) o en grilla de dos columnas con `white-space: nowrap` y texto más corto. Además, "Cerrar período" debería verse distinto (acción importante y difícil de deshacer), no igual que "Imprimir".

4. **Botones flotantes que tapan contenido en celular.** El "?" de ayuda y el logo central de la barra inferior quedan encima de la última tarjeta de cada lista y del botón "Limpiar" del Nuevo pedido. Arreglo: reservar abajo el alto de la barra más el botón (padding inferior del contenido) y subir el "?" por encima de la barra, o llevarlo al menú.

### Media: consistencia

5. **Dos estilos de encabezado de página.** 40 pantallas usan `dashboard-kicker` + título y 11 usan `eyebrow` + un título más grande y condensado (Clientes es el caso visible: se ve de otro sistema). Arreglo: un solo componente `PageHeader` (rótulo, título, descripción, acciones) y migrar las 11.
6. **Acciones del detalle de pedido en celular.** Seis botones sueltos que ocupan media pantalla antes de los datos ("Volver a Ver pedidos", "Marcar listo", "Cancelar", "Editar pedido", "Mover a otra ciudad", "Ubicar dirección"). Arreglo: "Volver" como flecha en el encabezado, una acción principal visible y el resto en el menú "···" que ya usan las tarjetas de pedidos.
7. **"Periodos" sin tilde** en el menú y en el título de esa pantalla (12 apariciones), contra "período" en las otras 184. Arreglo: unificar a "Períodos".
8. **Tabla de Pedidos en tablet (768 px).** Con 9 columnas, nombre, pedido y fecha se parten en 2–3 renglones y cada fila mide el triple. Arreglo: entre 768 y 1024 px, ocultar columnas secundarias (WhatsApp, Entrega) o usar tarjetas como en celular.
9. **"Stock disponible" vacío en celular.** El título y "no hay nada para vender" quedan en dos columnas angostas que se parten en renglones. Arreglo: vacío en una sola línea, o esconder el panel cuando no hay stock.

### Baja: detalles

10. **Dos `h1` en `/app/ia`** ("Configuración segura del motor" y "Mapas y geocodificación"): el segundo debería ser `h2`. El **tablero de celular no tiene `h1`**.
11. **Gráfico de Estadísticas con un solo día:** el área se dibuja como un triángulo. Con uno o dos puntos conviene mostrar barras o el número solo.
12. **Textos largos o técnicos en encabezados:** el de Estadísticas ("…nunca fueron demanda real. Sin filtro de fechas, es todo el historial…") y "Detalle · Ver" en las tarjetas de Períodos. Conviene un texto más corto, con el detalle en la Ayuda.
13. **Workbench en celular:** el selector de período queda angosto y corta el nombre ("Semana de prueba E2…"). Va a lo ancho debajo del búho.
14. **Ayuda en celular:** los 31 títulos de artículos plegables son controles de menos de 32 px de alto.
15. **Campos de archivo** (Perfil y Respaldos) sin etiqueta para lectores de pantalla.

## 4. Propuesta de orden

1. Contraste del texto secundario (hallazgo 1). Es un cambio chico y cambia la percepción de todo el panel.
2. Barra superior y tamaños tocables en celular y tablet (2 y 14).
3. Botones en celular y botones flotantes (3 y 4).
4. `PageHeader` único y acciones del detalle de pedido (5 y 6).
5. El resto (7–13 y 15) en una pasada de detalles.

Cada paso se mide de nuevo con el mismo chequeo y las mismas capturas antes de darlo por cerrado.
