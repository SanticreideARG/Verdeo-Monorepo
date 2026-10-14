# Rutas y repartos — plan

Pedido del usuario (2026-10-14): la sección Rutas pasa a ser **Rutas y repartos**. Antes de
diagramar las rutas hay que poder gestionar los **repartos**: qué salidas hay cada día, con qué
pedidos. Un reparto se crea a mano o solo cuando hay pedidos con la misma fecha; se le puede cambiar
la fecha; y con los repartos consolidados se arman las rutas.

## Por qué hace falta

Hoy no hay nada entre el pedido y la hoja de ruta. `createRoute` toma "los pedidos de tal fecha (y
tal zona) que tengan ubicación y no estén en otra hoja" y arma la hoja en el momento. Eso deja tres
huecos:

- No hay dónde ver ni decidir **qué sale cada día** antes de armar la hoja: cuántos pedidos, cuáles
  faltan ubicar, cuáles siguen en borrador, cuántas viandas de cada variedad.
- **Mover un día de reparto** (un feriado, lluvia, el repartidor no puede) es editar pedido por
  pedido.
- La hoja se arma con lo que haya en ese momento: un pedido que entra después queda afuera sin que
  nadie lo note.

## Idea central

```
Período ──▶ Reparto (ciudad + fecha [+ franja]) ──▶ Hoja(s) de ruta ──▶ Paradas
                 ▲
           pedidos con esa fecha
```

Un **reparto** es una salida planificada: una ciudad, una fecha y, opcionalmente, una franja
("Domingo mañana"). Cada pedido pertenece a un reparto. Las hojas de ruta salen de un reparto: una
o varias (por zona, por barrio o por repartidor), y todas sus paradas son pedidos de ese reparto.

## Modelo de datos

- **`delivery_runs`** (nueva): `id`, `operating_site_id`, `delivery_date`, `label` ("Domingo 18"),
  `time_window` (texto libre, "de 11 a 14h"), `status`, `auto_created`, `notes`,
  `created_by_user_id`, `consolidated_at`, timestamps. Puede haber más de uno por ciudad y fecha
  (mañana y tarde).
- Estados: `planned` (abierto: entran pedidos) → `consolidated` (lista cerrada: ya no entra nada
  solo, se arman las hojas) → `dispatched` (hojas publicadas, en la calle) → `closed`. Además
  `cancelled`.
- **`orders.delivery_run_id`** (nueva, nula, `on delete set null`). La fecha del pedido
  (`delivery_date`) se mantiene y es siempre la del reparto: cambiar la fecha del reparto cambia la
  de sus pedidos, en la misma transacción.
- **`delivery_routes.delivery_run_id`** (nueva, nula): de qué reparto salió la hoja.
- **Migración con carga inicial**: un reparto por cada ciudad y fecha con pedidos no cancelados, con
  esos pedidos adentro; las hojas existentes se enganchan a su reparto por ciudad y fecha.

## Reglas

1. **Creación automática.** Cuando un pedido queda con una fecha (al cargarlo, importarlo, aprobar
   un correo o cambiarle la fecha) y en su ciudad no hay un reparto abierto para ese día, se crea
   uno (`auto_created`, "Domingo 18") en la misma transacción. Si hay uno solo abierto, el pedido
   entra ahí. Si hay varios (mañana y tarde), entra al marcado como "de siempre" del día, o queda
   **sin reparto** con aviso para elegir.
2. **Creación a mano.** "Nuevo reparto": fecha (con el selector por día de la semana), franja y
   nombre. Sirve para armar una salida extra o separar mañana y tarde.
3. **Cambiar la fecha de un reparto** mueve todos sus pedidos y queda auditado en cada pedido (su
   historial de revisiones). Fuera de los días de reparto de la ciudad se permite, con aviso. Si el
   reparto ya tiene hojas publicadas, no se mueve: primero se despublican.
4. **Mover pedidos entre repartos** (uno o varios a la vez): cambia su fecha a la del destino.
5. **Consolidar** cierra la lista: los pedidos que entren después con esa fecha quedan en "sin
   reparto" con alerta, en vez de colarse en una hoja ya armada. Al consolidar se avisa lo que
   falta: pedidos sin ubicación, en borrador, sin medio de pago.
6. **Armar las rutas desde un reparto**: una hoja, una por zona, o "en N hojas" (N repartidores,
   cortando por cercanía y respetando los barrios). Usa el optimizador de siempre. Sólo entran
   pedidos de ese reparto.
7. Un pedido cancelado sale del reparto; uno eliminado, también. Un reparto sin pedidos creado solo
   se borra solo; uno creado a mano queda hasta que alguien lo borre.

## Pantallas

**Rutas y repartos** (la entrada actual de Rutas en la barra), con dos pestañas:

- **Repartos** (nueva, la primera): los próximos días, uno debajo del otro, con el día de la semana
  bien grande. Cada reparto muestra pedidos, viandas por variedad y tamaño, cuántos faltan ubicar,
  cuántos siguen en borrador y cuántos no tienen medio de pago; estado; y sus acciones: cambiar
  fecha, renombrar o franja, consolidar, armar rutas. Arriba: "Nuevo reparto" y, si los hay,
  "Pedidos sin reparto".
- **Detalle de un reparto**: los pedidos agrupados por barrio, con selección múltiple para moverlos
  a otro reparto; "Ubicar los pedidos" (lo de hoy, acotado al reparto); y las hojas que salieron de
  él.
- **Hojas de ruta**: lo de hoy, con el reparto de origen en cada hoja.
- La **alerta "a despachar hoy"** lleva al reparto del día en lugar de a Rutas en general.
- En el detalle del pedido, el día de reparto pasa a mostrar también a qué reparto pertenece.

## Permisos

Se reusan los de rutas: ver, `routes.read`; crear, mover, consolidar y armar, `routes.manage`.
Cambiar la fecha de pedidos ajenos al reparto sigue pidiendo `orders.edit`.

## Fases

1. **Modelo y lista de repartos.** Tabla, columnas, migración con carga inicial, creación
   automática al escribir un pedido, pestaña Repartos con la lista, "Nuevo reparto", renombrar y
   cambiar la fecha (moviendo sus pedidos). Tests de la creación automática y del cambio de fecha.
2. **Gestión del reparto.** Detalle con pedidos por barrio, mover pedidos entre repartos,
   consolidar con sus avisos, "Pedidos sin reparto", y la alerta del día apuntando al reparto.
3. **Rutas desde el reparto.** Armar una hoja, una por zona o N hojas; la hoja hereda el reparto;
   etiquetas de cocina y resumen de producción filtrables por reparto.

Cada fase se puede usar sola: después de la 1 ya se ve qué sale cada día y se mueve un reparto
entero de fecha; las rutas siguen armándose como hoy hasta la 3.

## Decisiones (resueltas por el usuario el 2026-10-14)

1. **Más de un reparto por día: sí** (mañana y tarde, o dos repartidores), con uno marcado como
   "de siempre" para la creación automática.
2. **Reparto por ciudad**, con las hojas de ruta por zona.
3. **Los pedidos en borrador entran al reparto**; consolidar avisa cuántos siguen en borrador, sin
   bloquear.
4. **Avisar al cliente cuando cambia la fecha**: al mover un reparto se ofrece copiar el mensaje de
   aviso para cada cliente, como el de confirmación; nunca se manda solo.
5. **Fecha fuera de los días de reparto**: se permite, con aviso (el caso de un feriado).

## Estado

**Fase 1 hecha (2026-10-14).** Migración 0060: `delivery_runs`, `orders.delivery_run_id` y
`delivery_routes.delivery_run_id`, con la carga inicial (un reparto por ciudad y fecha con pedidos
no cancelados; los de fechas pasadas, cerrados). La asignación vive en
`repositories/delivery-runs.ts` (`assignOrderToRun`, `leaveRun`, `dropEmptyAutoRun`) y la llaman
`createOrder` (también el importador y los correos aprobados), `updateOrder` cuando cambia la fecha,
`transitionOrder` (cancelar saca del reparto, reactivar vuelve a entrar) y `deleteOrder`. API:
`GET/POST /api/v1/delivery/runs` y `PATCH/DELETE /api/v1/delivery/runs/:id` (`routes.read` /
`routes.manage`). Pantalla: "Rutas y repartos" con las pestañas Repartos (la primera) y Hojas de
ruta. Cambiar la fecha de un reparto mueve sus pedidos (auditados como `order.rescheduled`) y sus
hojas en borrador, avisa si la fecha no es un día de reparto, y ofrece el aviso para cada cliente
(copiar o abrir en WhatsApp).

Pendiente: fases 2 (detalle del reparto, mover pedidos entre repartos, consolidar, "Pedidos sin
reparto", la alerta del día apuntando al reparto) y 3 (rutas desde el reparto).
