# Etiquetas: fondo blanco, logo arriba, layouts y un módulo de render — plan

Pedido del usuario (2026-10-16): el fondo de las etiquetas pasa a ser blanco (se descarta el fondo
actual) con el logo de Verdeo arriba, centrado, y el resto debajo. El logo es un interruptor. Que
haya distintos layouts. Y un módulo de render que deje ver en tiempo real lo que se arma y se va a
imprimir.

## Lo que hay hoy (y por qué no alcanza)

- **Dos dibujos de la misma etiqueta.** La vista previa de Etiquetas es un componente de React
  (`LabelFace` en `LabelsPage.tsx`) y la impresión es HTML que arma el servidor
  (`buildLabelsPrintHtml` en `apps/api/src/labels-export.ts`). Son dos implementaciones de lo
  mismo: cada ajuste nuevo hay que escribirlo dos veces, y cuando una se olvida, la vista previa
  miente (ya pasó con el recuadro de corte en `@media print`).
- **El fondo es un PNG subido** (`label_settings.background_image_url` + `label_backgrounds`), que
  tapa el contenido y obliga a forzar `print-color-adjust`.
- **El logo** es el isotipo chico (`/brand/verdeo-icon-128.webp`), opcional y apagado por defecto.
- **Las etiquetas de cocina** (3 × 8, una por plato) tienen un tercer generador propio
  (`kitchen-labels-export.ts`).

## La idea

**Un solo módulo que dibuja la etiqueta**, y todo lo demás lo usa: la vista previa, la impresión de
Cocina, la del pedido suelto y, después, las de cocina y las del stock. Si la vista previa y la
impresión salen de la misma función con los mismos datos, son iguales por construcción, no por
cuidado.

### 1. `packages/labels`: el renderizador

- Una función pura: `renderLabelSheet({ settings, labels, assets })` → el documento HTML completo
  (hojas, etiquetas, CSS de impresión). Sin React, sin base, sin red: corre igual en la Vercel
  Function y en el navegador.
- Todo en **milímetros** (hoja, márgenes, separación, tamaño de etiqueta), que es como se mide la
  hoja de stickers. La pantalla lo escala; la impresora lo respeta.
- **Fondo blanco siempre.** Sin imagen de fondo ni `print-color-adjust` forzado: lo que no es tinta
  es papel.
- **El logo arriba, centrado**, en una franja propia de alto fijo; el contenido empieza debajo. Con
  el interruptor apagado, la franja desaparece y el contenido sube.
- **Nombres largos**: el tamaño de letra del nombre baja por escalones según el largo (determinista,
  sin medir en el navegador), para que "María de los Ángeles" no se corte ni empuje el resto.
- **Layouts como datos**: cada layout es una entrada de un catálogo (qué va dónde, qué tamaños), no
  una plantilla aparte. Agregar uno es agregar una entrada.

### 2. Los layouts (propuesta inicial)

Todos con fondo blanco y el logo arriba cuando está encendido:

| Layout                  | Para qué                           | Cómo se ve                                                                                                            |
| ----------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Clásica**             | El uso de hoy                      | Logo · nombre grande · los campos elegidos debajo, uno por línea                                                      |
| **Nombre protagonista** | Repartir: se lee de lejos          | Logo · nombre muy grande · los campos en una sola línea al pie                                                        |
| **Tamaño a la vista**   | Distinguir 250 / 400 de un vistazo | Logo · nombre a la izquierda · el tamaño en un recuadro grande a la derecha · campos al pie                           |
| **Compacta**            | 10–12 por hoja                     | Logo chico · nombre y tamaño en la misma línea · campos en letra chica                                                |
| **Con banda**           | Diferenciar variedades             | Logo · nombre · una banda de color al pie con variedad y tamaño (el color sale de la variedad; el fondo sigue blanco) |

Lo que ya existe se mantiene y aplica a todos: qué campos van y en qué orden, tipografía, tamaño de
letra, alineación, nombre en mayúsculas, sin apellido, recuadro de corte, etiquetas por hoja, una por
plato.

### 3. El módulo de render en pantalla: "Diseñar etiquetas"

- **La vista previa es un `<iframe>` con el mismo HTML que se imprime** (`srcdoc`), no una
  imitación: lo que se ve es literalmente lo que va a la impresora.
- **En tiempo real**: cada cambio (layout, logo, campos, letra, hoja) se ve al instante, sin guardar.
  "Guardar" deja la configuración para todos; "Descartar" vuelve a la guardada.
- **Tamaño real o la hoja entera**: un selector de zoom (hoja completa / 100 % / 200 %). A 100 % la
  etiqueta mide en pantalla lo mismo que en el papel (mm a 96 ppp).
- **Con datos de verdad o de muestra**: por defecto, las etiquetas del período en curso; si no hay,
  un set de muestra con casos difíciles (nombre larguísimo, Intuitivo con cinco platos,
  restricciones, número de unidad "2 de 3"). Los nombres de muestra son inventados.
- **Comparar layouts**: una tira con miniaturas de cada layout con la misma etiqueta, para elegir
  mirando.
- **Imprimir desde ahí** con exactamente lo que se ve.

### 4. Datos y migración

- `label_settings.layout` (texto, por defecto `clasica`), validado contra el catálogo al leer —como
  `fields`—, así que un layout que deja de existir cae en el de por defecto en vez de romper.
- `show_logo` pasa a estar **encendido por defecto** (es la nueva identidad de la etiqueta).
- **El fondo actual se resetea**: la migración pone `background_image_url` en null. La pantalla deja
  de ofrecer subir fondos y la impresión deja de leerlos. La tabla `label_backgrounds` (las imágenes
  ya subidas) queda hasta confirmar que no se quiere volver atrás; después se borra en otra
  migración.
- El logo viaja embebido en el HTML (como `data:`), para que la impresión no dependa de que la
  imagen termine de bajar justo antes del diálogo de imprimir.

### 5. Lo que cambia en el código

- `buildLabelsPrintHtml` y `LabelFace` se reemplazan por `renderLabelSheet`. La API exporta con él;
  la pantalla previsualiza con él.
- Tests del renderizador: una salida por layout (con y sin logo, nombre largo, campos vacíos que no
  imprimen nada), el recuadro de corte que no reaparece al imprimir, y que la hoja tenga la cantidad
  de etiquetas configurada.

## Fases

1. **Renderizador + fondo blanco + logo arriba + layouts.** `packages/labels`, migración (layout,
   logo por defecto, reset del fondo), la impresión de Cocina y del pedido suelto pasan a usarlo, y
   los cinco layouts.
2. **El módulo "Diseñar etiquetas"**: vista previa en vivo con el mismo HTML, zoom a tamaño real,
   datos reales o de muestra, comparación de layouts, imprimir desde ahí.
3. **Etiquetas de cocina y del stock en el mismo renderizador**: la hoja de cocina 3 × 8 como un
   layout fijo más, las del stock ("KETO 400 · STOCK", sin cliente, que era la fase 3 del stock), y
   la **calibración** con la matriz de Illustrator (corrimiento X/Y en mm por impresora).

## Para confirmar

1. **Qué logo**: el isotipo (el ícono redondo de la app) o el logotipo completo con "verdeo".
   Propuesta: el logotipo completo, que en una etiqueta chica se lee como marca; el isotipo para el
   layout Compacta.
2. **"Centrado verticalmente"**: lo leo como **arriba, centrado de izquierda a derecha**, en su
   propia franja. Si querías otra cosa (por ejemplo, el logo al costado, centrado en el alto),
   decime.
3. **Los fondos subidos**: ¿se borran del todo o se deja la opción de volver a usarlos más adelante?
   Propuesta: se dejan de usar ya y se borran en un mes si nadie los extraña.
4. **Los layouts**: ¿te sirven esos cinco, o hay alguno que tengas en mente (por ejemplo, el de la
   hoja de Illustrator que usan hoy)?

## Estado (2026-10-16)

- **Hecho, fases 1 y 2**: el renderizador (`packages/labels`), fondo blanco, logo arriba con alto y
  espacio ajustables, borde y marcas de recorte, los campos `platos`, `produccion` y `frase`, tres
  layouts (clásica, nombre protagonista, compacta), y el visor con etiqueta/hoja, zoom y
  anterior/siguiente. Detalle en `LABELS_AND_QR.md`.
- **Cambió respecto del plan**: el logo es uno solo (los dos archivos de marca eran el mismo emblema
  cuadrado en dos resoluciones), así que no hay variante que elegir; y quedan tres layouts de los
  cinco propuestos (faltan "tamaño a la vista" y "con banda").
- **Pendiente, fase 3**: las etiquetas de cocina y las del stock en el mismo renderizador, la
  calibración con la matriz de Illustrator (corrimiento X/Y por impresora) y los dos layouts que
  faltan. Comparar layouts en una tira de miniaturas, también.
