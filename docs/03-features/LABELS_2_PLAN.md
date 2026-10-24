# Etiquetas 2.0 — plan

**Estado:** hecho (2026-10-22). Fases 1 a 4 completas; quedan las correcciones tras el uso real.

Pedido del usuario (2026-10-22): un generador de etiquetas nuevo, que imite con la máxima fidelidad
las etiquetas que hoy se hacen a mano en Illustrator, con la mínima parametrización. El generador
actual queda **archivado** (sigue andando en `/app/etiquetas/clasico`), no se da de baja.

## El papel: Husares H34124

A4, 24 etiquetas de **64,0 × 33,9 mm** (3 columnas × 8 filas). Medido sobre el PDF de producción, que
ya está armado para este papel:

- Columnas cada 65,5 mm: margen lateral **7,5 mm** y separación **1,5 mm** (3 × 64 + 2 × 1,5 = 195).
- Filas cada 33,9 mm, sin separación: margen superior **12,9 mm** (8 × 33,9 = 271,2 en 297).

No hay opciones de hoja, márgenes ni cantidad por hoja: el sistema usa este papel y punto. La
plantilla del fabricante no está publicada en husares.com.ar; las medidas salen del PDF.

## Las dos etiquetas (de los PDF de producción)

Tipografías del original: **Source Serif** (nombre del plato y textos de la vertical), **Minion
Italic** (acompañamiento) y **Myriad Pro** (pie). Source Serif es libre; para las otras dos, las
equivalentes libres más cercanas: **Crimson Pro Italic** (Minion) y **Source Sans 3** (Myriad, de la
misma familia de Adobe). Se cargan de Google Fonts.

### Plato (horizontal)

- Ícono redondo de hojas arriba, centrado, de 10,5 mm.
- Nombre del plato en mayúsculas, Source Serif, centrado, hasta dos renglones: 11,7 pt si entra,
  9,8 pt si es largo.
- Acompañamiento (lo que va después de "|" o "/"), en cursiva, 11,7 pt.
- Pie: "VEGETARIANO ELAB # 15-10" (variedad y fecha de elaboración), Source Sans 3, 10,6 pt.

### Menú (vertical)

- El sello "VERDEO" grande (26,7 mm) a la izquierda.
- El texto girado 90° (se lee de abajo hacia arriba): el tamaño en grande ("400", 24 pt), "Kcal"
  (14 pt) corrido a la derecha en el renglón siguiente, y la variedad ("KETO", 12 pt). En un
  Intuitivo, en lugar de la variedad va el nombre del cliente, en hasta dos renglones.

Los dos logos se extrajeron del PDF de producción (con el anillo blanco que pierde el archivo).

## Cómo se arma una tanda

- **Lote**: las dos series del período (o de una zona o reparto): platos agrupados por variedad y
  menús por variedad y tamaño, más los Intuitivos uno por uno. Se tilda qué grupos entran.
- **Individuales**: agregar etiquetas sueltas con su cantidad (un plato, un menú), para reponer.
- **Mezclar**: platos y menús van en la misma tanda, una detrás de otra, y llenan las hojas.
- **Empezar en la posición**: para aprovechar una hoja que ya se usó en parte (1 a 24).
- **Vista previa** con el mismo motor que la impresión, y "Imprimir".

## Recordar lo impreso

Cada etiqueta tiene una clave estable (la de menú, por pedido y unidad; la de plato, por variedad,
plato y número). Al imprimir se guarda (`label_prints`, por período). Si la tanda tiene etiquetas ya
impresas, antes de imprimir se avisa cuántas y desde cuándo, y se elige imprimir igual o sacarlas.

## Fases

1. Motor nuevo en `@verdeo/labels` (`production.ts`): el papel, las dos etiquetas y la hoja.
2. Lo impreso: tabla, servicio y API.
3. La pantalla nueva en `/app/etiquetas`; la actual pasa a `/app/etiquetas/clasico`.
4. Ayuda y documentación.

## Cómo quedó

- Pantalla: `apps/web/src/routes/LabelsStudioPage.tsx`; armado de grupos y claves en
  `apps/web/src/lib/productionLabels.ts` (con tests).
- Claves: menú `menu:<pedido>:<familia>:<variante>:<unidad>`; plato
  `plato:<variedad>:<tamaño>:<plato>|<acompañamiento>:<n>` (no depende de la fecha de elaboración).
  Las sueltas (`suelta:…`) no se anotan ni disparan el aviso: son reposiciones a propósito.
- API: `GET`/`POST /api/v1/production/:cycleId/printed-labels` (`production.read`).
- La hoja de impresión se arma en el navegador con el mismo motor que la vista previa y se imprime
  desde un marco oculto de la misma página (sin ventanas emergentes), cuando cargaron las tipografías.

## Correcciones (2026-10-22, tras la primera prueba)

- Los textos van limpios: sin el "*" del principio ni el "(k)"/"(v)" del final (`cleanDishText`), y el
  acompañamiento empieza con mayúscula.
- "ANTIAGE", no "AGE": la abreviatura sugerida ya no corta en el guion.
- Plato medido de nuevo sobre los PDF de producción: letra regular (no semibold), sin el diseño
  óptico de tamaños chicos (más ancho que Source Serif Pro), hasta 56 mm de ancho; ícono fijo a 1 mm
  del borde de arriba, pie fijo (su renglón a 2,9 mm del de abajo) y el texto centrado entre los dos.
- Tamaño del plato: el más grande que entra. Sin acompañamiento, 11,7 pt en dos renglones, si no
  10,75, si no 9,8. Con acompañamiento, 11,7 en un renglón o 9,8 en dos. Se mide en la hoja ya
  cargada (un script corto); la impresión espera a que termine.
- Los grupos van en la jerarquía de productos ([PRODUCT_ORDER.md](../02-domain/PRODUCT_ORDER.md)).

## Tipografías de producción (2026-10-22, indicadas por el usuario)

- Plato: **Source Serif Variable**, entre 12 y 10 pt según la cantidad de texto (el más grande con
  el que entra en dos renglones, de a medio punto).
- Acompañamiento: **Minion Variable Concept**, siempre 12 pt y en cursiva, con la primera letra en
  mayúscula.
- Variedad y fecha (el pie): **Myriad Pro**, 11 pt.

Minion y Myriad son de Adobe y no se pueden incrustar en la aplicación: la hoja las pide por nombre
y, si están instaladas en la compu que imprime (por ejemplo, con Illustrator o Adobe Fonts), las
usa. Si no, caen en sus equivalentes libres (Crimson Pro y Source Sans 3, de Google Fonts). Source
Serif Variable igual: instalada se usa ésa; si no, Source Serif 4.

## Correcciones (2026-10-23)

- Etiqueta de menú: el texto girado se arma con `writing-mode` (vertical y dado vuelta) y no girando
  una caja acostada, que antes de girar colgaba debajo de la etiqueta: al imprimir, el navegador la
  cortaba entre páginas y la corría de lugar. Las etiquetas y las hojas ya no se parten entre páginas.
- La impresión usa un marco fuera de la vista del tamaño de la hoja (antes, 0 × 0).
- − / + en cada grupo: le saca etiquetas del final o le agrega repitiendo las del grupo. Las de más
  son sueltas (no se anotan como impresas).

## Correcciones (2026-10-24)

- **El Intuitivo no es una categoría de cocina**: no hay etiqueta vertical "Intuitivo". Cada plato de un
  Intuitivo lleva en el pie el menú del que viene ("KETO ELAB # …"), tomado del origen que guarda el
  plato elegido (o, si no lo tiene, buscando el plato entre los menús de la tanda). Los platos de
  cada Intuitivo forman un grupo por pedido, con el nombre del cliente, para agregarlos a la tanda.
- La tanda **arranca sin nada tildado**.
- **"×" en la vista previa**: aparece al pasar por encima de una etiqueta y la saca de la tanda
  ("Volver a ponerlas" la devuelve). La vista previa avisa a la página por `postMessage`.
