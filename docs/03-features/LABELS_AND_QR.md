# Labels & QR

## Etiqueta

Una etiqueta por unidad de cinco comidas.

Contenido inicial:

- nombre (sin apellido);
- identificador público `#N00453`;
- producto/variante;
- unidad `1/2`, `2/2` cuando aplique;
- restricción relevante;
- QR opcional/preparado.

Ejemplo:

```text
ROSA
#N00453

KETO 250
UNIDAD 1/2

SIN CEBOLLA

[QR]
```

La etiqueta llega al cliente, por lo que no debe contener PII innecesaria.

## Módulo

- seleccionar pedidos/ciclo;
- previsualizar;
- duplicados automáticos por cantidad;
- tamaño configurable;
- exportar/imprimir;
- plantillas;
- futura compatibilidad con impresora térmica/A4;
- QR reservado.

Tamaño e impresora exactos permanecen OPEN.

## As built

Una etiqueta por unidad de cinco comidas, con **nombre del cliente, tamaño y número de pedido**, en
ese orden de jerarquía. Se generan por lote desde Cocina (`GET /api/v1/production/:cycleId/labels/export`,
todas las del ciclo) y también para un pedido suelto desde su ficha.

Tres decisiones que conviene no deshacer:

- **La variedad no va en la etiqueta.** Quien reparte busca a quién le toca cada vianda, y eso lo
  responde el nombre. El tamaño sí, porque distingue dos viandas del mismo cliente.
- **El nombre va en todas.** Antes sólo lo llevaban las del Intuitivo —donde hace falta para saber
  de quién es esa combinación de platos— y el resto salía sin nombre, que es justo lo que hay que
  leer para repartir.
- **`print-color-adjust: exact`.** Sin eso el navegador descarta los fondos al imprimir: el PNG
  cargado en Ajustes se veía en pantalla y salía en blanco.

### Qué imprime cada etiqueta

**El nombre del cliente va siempre y no es un campo elegible**: es lo único que responde de quién es
la vianda, que es la pregunta que la etiqueta existe para contestar. Lo demás se elige en Ajustes →
Etiquetas y se imprime en el orden del catálogo:

| Campo           | Qué muestra                                               |
| --------------- | --------------------------------------------------------- |
| `tamano`        | 250 / 400                                                 |
| `variedad`      | Keto, Real, Intuitivo…                                    |
| `unidad`        | "2 de 3" — sólo cuando el renglón tiene más de una unidad |
| `numero`        | N° público del pedido                                     |
| `zona`          | Zona de entrega                                           |
| `entrega`       | Fecha de entrega                                          |
| `restricciones` | Indicaciones alimentarias del pedido                      |

**Un campo sin valor no imprime nada**, ni un guion ni una etiqueta vacía: "Zona:" y nada ocupa lugar
sin informar. Por eso `Label` viaja siempre con todos los datos y es Ajustes quien decide cuáles se
ven — un dato que no llega hasta el render no se puede activar después sin volver al backend.

La elección se guarda como texto separado por comas en `label_settings.fields`, no como una columna
booleana por campo: la lista va a crecer y cada campo nuevo sería una migración. El servidor valida
contra su propio catálogo al leer, así que una elección vieja con un campo que ya no existe se ignora
en vez de romper la impresión.

Lo demás de la configuración, también global para toda la operación: etiquetas por hoja (4 a 12),
tipografía (cinco familias de sistema, para no depender de descargar una fuente al imprimir), tamaño
de letra (60% a 200%), alineación, nombre en mayúsculas, recuadro de corte y el PNG de fondo. La
pantalla trae una vista previa con la misma jerarquía que la impresa, para no gastar una hoja
probando.

El recuadro apagado tiene una trampa que ya se pisó una vez: la regla `@media print` que lo pasaba a
sólido lo hacía reaparecer justo en el papel. Ahora esa regla sólo se emite cuando el recuadro está
encendido, y hay un test que lo fija.

La exportación es HTML listo para imprimir y no un PDF generado: el diálogo de impresión del
navegador es el adaptador a PDF, así que ninguna librería de PDF entra al bundle de la Vercel
Function. Tamaño de etiqueta e impresora térmica siguen OPEN.

## Etiquetas de cocina (hoja de producción)

Formato definitivo de cocina: la hoja de stickers troquelados de **3 × 8 en A4** (24 por hoja).
Se activa en Etiquetas → "Etiquetas de cocina (una por plato, sin cliente)".

- **Una por plato**, sin el nombre del cliente. En una variedad fija se suman las unidades de
  todos los pedidos y se imprimen los platos **intercalados** (1-2-3-4-5, 1-2-3-4-5…), como se
  arman las viandas. La última hoja queda con los lugares que sobran en blanco.
- **Diseño fijo**: logo arriba; el plato en mayúsculas con letra con serif; el acompañamiento
  debajo, en cursiva; el pie "KETO ELAB # 24-09" en letra sin serif.
- **Plato y acompañamiento** se escriben en una línea del menú separados por una barra:
  "Wraps de pechuga con crema de cúrcuma / Tortilla de brócoli". Sin barra, sin acompañamiento.
- **Abreviatura** ("KETO"): se carga junto al nombre de cada variedad al armar el menú (y la del
  Intuitivo, en su recuadro). Se guarda en la variedad, así que pasa de semana en semana; vacía en
  el formulario conserva la que había. Sin ninguna cargada se usa una sugerida (la última palabra
  del nombre sin "Menú": "Menú Paleo & Keto" → "KETO").
- **Fecha de elaboración**: se elige al imprimir y arranca en hoy.
- **Mostrar el tamaño** (interruptor): sin él, el 250 y el 400 de una variedad llevan la misma
  etiqueta; con él van aparte y el pie dice "KETO 400 ELAB # …".
- **Intuitivo**: va pedido por pedido con los platos que eligió cada cliente y, por defecto, con su
  nombre (interruptor "Nombre del cliente en los Intuitivo").
- La vista previa es la misma hoja que se imprime, achicada.
- Pendiente: calibrar márgenes y separación con la matriz de Illustrator de la hoja que se usa hoy.
- API: `GET /api/v1/production/:cycleId/kitchen-labels` y `/kitchen-labels/export?elab=AAAA-MM-DD`.
  Migración 0056 (abreviatura en `product_families` y los tres ajustes en `label_settings`).

## El renderizador compartido y el visor (2026-10-16)

Pedido del usuario: fondo blanco con el logo arriba y centrado (con interruptor, alto y espacio de
abajo ajustables), fecha de producción y una frase propia como campos, borde y líneas de recorte, la
variedad y los platos bien, y un visor que dibuje en vivo lo que se va a imprimir con anterior y
siguiente. Plan y fases en `LABELS_RENDERER_PLAN.md`.

**Un solo motor.** La etiqueta se dibuja en un lugar: `packages/labels` (`renderLabelDocument`). La
impresión (la API arma el HTML y el navegador lo manda a la impresora) y la vista previa de la
pantalla (el mismo HTML dentro de un marco) llaman a esa función con los mismos datos. Antes eran dos
implementaciones —un componente de React y un generador de HTML—, y cada ajuste había que escribirlo
dos veces; la geometría de la hoja estaba además repetida en `orders`, en la API y en la web. Ahora
está en un solo lugar y la base, la API y la pantalla leen el mismo catálogo de campos.

- **Fondo blanco siempre.** Se retiró la subida de fondos y la migración 0064 reseteó el fondo que
  hubiera. Las imágenes ya subidas quedan en `label_backgrounds`, sin uso.
- **Logo arriba, centrado**, en su franja: `logo_height_mm` (alto) y `logo_padding_bottom_mm`
  (espacio de abajo). Va **embebido en la hoja** (una sola copia en el CSS) y no como una dirección a
  la aplicación: la hoja se abre en una pestaña aparte y una imagen que no terminó de bajar al abrir
  el diálogo de impresión salía en blanco. Encendido por defecto.
- **Borde y marcas de recorte**, independientes. El borde es un recuadro fino alrededor de la
  etiqueta; las marcas (`show_cut_lines`) son ocho trazos en las esquinas, fuera de la etiqueta, que
  caben en la separación entre etiquetas. Con las etiquetas pegadas (separación menor a 1 mm) las
  marcas quedan en las esquinas de adentro.
- **Campos nuevos**: `platos` (la lista de platos de la vianda, debajo de la variedad; el "plato |
  acompañamiento" del menú se muestra con un punto medio), `produccion` (la fecha de elaboración, un
  `<input type="date">` que arranca en hoy y viaja como `?produccion=AAAA-MM-DD` a la impresión; no se
  guarda) y `frase` (`custom_phrase`, hasta 120 caracteres, la misma en todas).
- **Layouts**: `clasica`, `protagonista` (nombre grande, campos en una línea) y `compacta`.
- **Un nombre largo baja de cuerpo por escalones** (más de 22, 30 y 40 caracteres) y no desborda.
- **Un bug del catálogo**: el campo `plato` se ofrecía en pantalla pero la base no lo conocía, así
  que se descartaba en silencio al guardar y nunca salía en el papel.

**El visor** (`LabelViewer`): una etiqueta a su tamaño exacto (con aire para las marcas) o la hoja
entera, con zoom (ajustar, 100 %, 200 %; a 100 % mide en pantalla lo mismo que en el papel), y
**Anterior / Siguiente** (o las flechas del teclado) para recorrer la serie: en la vista de etiqueta
va de a una; en la de hoja, de a página, con la etiqueta actual resaltada. Dibuja con los ajustes tal
como están en pantalla —guardados o no— y, sin pedidos en la tanda, con etiquetas de ejemplo.

Siguen aparte, hasta la fase 3 del plan: las etiquetas de cocina (`kitchen-labels-export.ts`) y las
del stock.
