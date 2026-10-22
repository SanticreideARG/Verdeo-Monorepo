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
