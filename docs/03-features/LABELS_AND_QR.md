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
