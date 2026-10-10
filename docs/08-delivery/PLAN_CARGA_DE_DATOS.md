# Plan: carga de datos

Estado: **fase 1 construida** (ver "Cómo quedó la fase 1" al final); fases 2 y 3 pendientes. Pedido: analizar el flujo de carga y _data entry_ y planificar
implementaciones u optimizaciones.

El criterio para ordenar es **cuánto se repite**: lo que se hace decenas de veces por semana (cargar
un pedido) pesa más que lo que se hace una vez (configurar una ciudad). Cada ítem dice qué cuesta hoy,
qué cambia y cómo se sabría que funcionó.

## Cómo se carga hoy

| Flujo              | Frecuencia            | Cómo es hoy                                                                                                                                                          |
| ------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pedido manual      | Decenas por semana    | Buscar o crear cliente → variedad → tamaño → unidades → dirección → origen → medio de pago → (platos si es Intuitivo) → guarda como **borrador** → confirmar aparte. |
| Pedido de la web   | Varios por semana     | El cliente lo carga solo; llega por email y se pega en "Importar pedidos".                                                                                           |
| Menú de la semana  | Una vez por semana    | Variedades precargadas; **platos y precios se escriben de cero** cada semana.                                                                                        |
| Cliente nuevo      | Varias por semana     | Nombre, email, teléfono, dirección, zona. Sin aviso de duplicado al crearlo.                                                                                         |
| Ubicar direcciones | Antes de cada reparto | Desde Rutas o el pedido (recién construido).                                                                                                                         |

Lo que ya ayuda y conviene mantener: borrador del formulario que sobrevive a un recargo, carrito de
varias variedades, autocompletar la dirección del cliente elegido, "Cargar otro pedido" al guardar,
importación con detección de duplicados, y origen y medio de pago **sin valor por defecto** (decisión
tomada: un valor preseleccionado nadie lo cambiaba y el dato dejaba de informar).

## Lo que más rinde (fase 1)

### 1. Repetir el pedido anterior del cliente

La vianda es semanal y la mayoría de los pedidos son de clientes que ya pidieron. Hoy se recarga
todo a mano cada semana: variedad, tamaño, unidades, dirección, medio de pago, origen y, en
Intuitivo, cada plato.

- Al elegir un cliente con pedidos anteriores aparece **"Repetir lo de la última vez"** con un
  resumen ("Keto 400 × 2 · Transferencia · Julián Álvarez 1010").
- Copia variedad, tamaño, unidades, dirección, medio de pago y origen. **No copia los platos de
  Intuitivo** si el menú cambió: los platos son de esa semana; se marcan para elegir.
- Si una variedad o tamaño ya no existe en el menú de esta semana, se avisa en vez de copiar algo que
  no se puede pedir.
- Respeta la decisión de "sin valor por defecto": no es un valor adivinado, es lo que **ese cliente**
  eligió, y se muestra como tal.

Medición: pedidos cargados con "repetir" sobre el total, y tiempo entre abrir el formulario y guardar.

### 2. Pegar el mensaje de WhatsApp y que se complete solo

La tarea de IA **"Extraer pedido" ya existe en el backend** (`extract_order`, con validación de la
salida) pero **ninguna pantalla la usa**. Se conecta al formulario:

- Un campo "Pegá el mensaje del cliente" arriba del formulario. La IA propone variedad, tamaño,
  unidades y platos; el formulario se completa y **se resalta lo que completó**, para revisarlo.
- Nunca guarda sola: propone, la persona confirma. Si no hay proveedor de IA configurado, el campo
  no aparece.
- Va de la mano del punto 1: si el teléfono del mensaje coincide con un cliente, lo elige.

### 3. Buscar y elegir cliente sin mouse

Hoy hay que hacer clic en el resultado. Con flechas y Enter, y al elegirlo el foco pasa a
"Variedad". Buscar también por teléfono pegado en cualquier formato (`+54 9 11 …`, `011 15 …`): ya
existe la normalización de teléfonos, falta usarla en la búsqueda.

### 4. Guardar y confirmar en un paso

Todo pedido manual nace como borrador y después se confirma aparte: dos pasos para el caso común.
Para quien tiene `orders.confirm`, el botón principal pasa a ser **"Guardar y confirmar"**, y
"Guardar como borrador" queda como secundario (para lo que todavía no está cerrado con el cliente).

## Menos errores al cargar (fase 2)

### 5. Aviso de cliente duplicado al crearlo

Hoy se crea y, si era repetido, después se usa "Fusionar duplicados". Al escribir el teléfono o el
nombre en "Nuevo cliente" se busca en el momento; si hay uno con el mismo teléfono (misma regla que la
importación: últimos 10 dígitos) se ofrece **"Usar este cliente"**. Previene en vez de limpiar.

### 6. Ubicar la dirección al guardar

El sanitizador de direcciones ya existe. Al guardar un pedido o un cliente con dirección nueva, se
ubica en el momento y se muestra el resultado junto al campo ("ubicada ✓" / "revisala"). El pedido
llega listo para la hoja de ruta sin pasar por Rutas.

### 7. Validación en el campo, no al final

El formulario no usa la validación del navegador (a propósito: su globo aparecía fuera de pantalla)
y reporta todo al enviar. Se marca cada campo al salir de él, con el mensaje debajo, y el botón de
guardar dice qué falta ("Falta elegir el medio de pago").

## Menú de la semana (fase 2)

### 8. Precios de la semana anterior, precargados

Los precios rara vez cambian de una semana a otra y hoy se escriben de cero. Se precargan los de la
última semana, **marcados como "igual que la semana pasada"**, y lo que se cambia queda resaltado.

### 9. Platos con autocompletar del historial

Se escriben cinco platos por variedad, uno por línea, a mano. Con sugerencias de platos ya usados se
escribe menos y, sobre todo, **el mismo plato se escribe igual** (que existiera un script para
reparar nombres de menú muestra que hoy no pasa). Un plato nuevo se marca como nuevo.

### 10. Pegar el menú entero

Si el menú llega armado en un texto (WhatsApp o un documento), pegarlo y que se reparta por
variedad. Con reglas simples primero (encabezado de variedad + líneas); la IA sólo si las reglas no
alcanzan.

## Importación (fase 3)

- **Recibir los emails del sitio sin pegarlos** (ya en el backlog): una casilla que reenvía a la API.
- **Corregir en la vista previa**: hoy se elige variedad y cliente, pero dirección y teléfono no se
  pueden editar antes de importar.
- **Crear el domicilio con su zona** a partir del email (ya en el backlog), y ubicarlo de una (punto 6).

## Transversal

- **Atajos de teclado** en Pedidos: `N` nuevo pedido, `/` buscar, `Ctrl+Enter` guardar.
- **Foco donde se sigue**: al abrir el formulario, en la búsqueda de cliente; al guardar con "Cargar
  otro pedido", de vuelta ahí.
- **Medir antes de optimizar más**: registrar en la auditoría cuándo se abrió el formulario y cuándo
  se guardó, para saber cuánto tarda cargar un pedido y si estas mejoras lo bajan.

## Orden propuesto

| Fase | Ítems                                                                                | Por qué primero                                         |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1    | Repetir pedido, pegar mensaje, teclado, guardar y confirmar                          | Es la carga que más se repite; el 2 reusa algo ya hecho |
| 2    | Duplicados, ubicar al guardar, validación en el campo, menú (precios, platos, pegar) | Menos errores y la carga semanal del menú               |
| 3    | Importación sin pegar, corrección en la vista previa, domicilio con zona             | Depende de elegir proveedor de correo entrante          |

## Decisiones abiertas

1. **Repetir pedido**: ¿copia también las indicaciones para cocina y las notas, o sólo el pedido?
   Propongo copiar indicaciones (suelen ser permanentes: alergias) y no las notas (son de esa vez).
2. **Guardar y confirmar como acción principal**: cambia la costumbre de "todo nace borrador".
   ¿Lo queremos para todos los que pueden confirmar, o como preferencia de cada usuario?
3. **Pegar mensaje**: usa el proveedor de IA configurado (Gemini) y tiene costo por uso, chico por
   mensaje. ¿Lo dejamos encendido para todos o sólo para algunos usuarios?

## Decisiones tomadas

1. **No hay indicaciones por plato.** Un solo **comentario para la cocina** por pedido. Al repetir
   un pedido no se copia: es de esa vez.
2. **"Guardar y confirmar" es el botón principal** para quien tiene `orders.confirm`.
3. **Pegar el mensaje queda encendido para todos** los que cargan pedidos (`orders.create`).

## Cómo quedó la fase 1

- **Repetir lo de la última vez.** Al elegir un cliente aparece su último pedido no cancelado
  ("Última vez (CABA-00116): Menú Nuevo Keto 400 × 2 · Transferencia") con el botón para repetirlo.
  Copia lo pedido —emparejado con el menú de esta semana por variedad y tamaño, porque las ofertas
  cambian de id—, la dirección, el medio de pago y el origen. Un Intuitivo queda elegido para marcar
  sus platos de esta semana; lo que ya no está en el menú se avisa. No copia el comentario para la
  cocina.
- **Pegar el mensaje del cliente.** Un desplegable arriba del formulario; la IA (tarea
  `extract_order`, con instrucción por defecto) propone variedad, tamaño, unidades y platos, y el
  formulario se completa para revisar. El teléfono del mensaje se lee con reglas y, si coincide con
  un solo cliente, lo elige. `POST /api/v1/orders/extract`, con `orders.create`.
- **Cliente con teclado.** Flechas para recorrer los resultados, Enter para elegir (Enter en la
  búsqueda nunca envía el formulario), y el foco pasa a "Variedad".
- **Buscar por teléfono escrito como sea.** La búsqueda compara por la clave de diez dígitos. De
  paso se corrigió la clave: no entendía el 15 del formato local ("(011) 15 5555-0101" daba otra
  línea), y eso también afectaba la detección de duplicados al importar.
- **Guardar y confirmar** como botón principal (y "Guardar como borrador" al lado). Enter envía con
  el principal. La API exige `orders.confirm` para crear confirmado.
- **Comentario para la cocina**: un solo campo de hasta 200 caracteres, donde antes había
  "indicaciones, una por línea".
