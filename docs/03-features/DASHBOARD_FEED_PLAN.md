# Tablero "Hoy" — plan

Pedido del usuario (2026-10-15): un tablero con un feed —alertas, calendario, mensajes, consejos
del día— y un home nuevo para mobile.

Agregado del usuario (2026-10-15): el feed es también **el lugar donde nos comunicamos**. Cualquier
usuario publica; el dueño, por ejemplo, para contar cambios y actualizaciones.

## Idea

El panel deja de ser una lista de módulos y pasa a ser lo que hay que hacer hoy, de lo urgente a lo
informativo.

- **Arriba, fijo**: el día ("Domingo 18 · reparto de 9 pedidos"), la cuenta regresiva al cierre
  del período, accesos rápidos (Nuevo pedido, Importar, Rutas y repartos, Cocina) y cuatro números
  (pedidos del período, sin confirmar, sin cobrar, vendido).
- **El feed**: tarjetas con su acción directa.
  - **Comunicaciones** (lo que escribe la gente): ver la sección de abajo.
  - **Alertas** (de lo que el sistema ya calcula): a despachar sin hoja, sin ubicación, en
    borrador, sin medio de pago, repetidos, correos por revisar, lista del reparto abierta cerca
    del cierre.
  - **Calendario**: recordatorios del día (`calendar_reminders`) y los hitos del período (cierre,
    corte de cocina, repartos).
  - **Mensajes**: lo último del chat interno y de WhatsApp sin leer.
  - **Consejo del día**: sacado de los datos ("3 clientes que pidieron las últimas 3 semanas no
    pidieron esta", "el Keto 400 se agotó dos semanas seguidas", "5 domicilios sin barrio").
  - **Actividad**: pedidos nuevos, importaciones, cambios de reparto, agrupados.
  - Cada tarjeta se marca como hecha o se pospone, por usuario.
- **Mobile**: la misma información en una columna para el pulgar: el día arriba, accesos rápidos en
  una fila que se desliza y el feed con filtros en chips (Todo · Alertas · Mensajes · Agenda).

## Comunicaciones

Una publicación es un aviso que queda, no una charla: para conversar está el chat interno. La
diferencia importa porque un aviso se tiene que poder encontrar mañana y saber quién lo leyó.

- **Quién publica**: todos. Permiso nuevo `feed.post`, que traen el operador y el superadmin.
- **Qué tiene**: texto (con enlaces), una etiqueta —**Aviso**, **Cambio**, **Novedad del
  sistema**— y opcionalmente una imagen. Se puede dirigir a una ciudad o a todos.
- **Fijar arriba**: sólo el superadmin (`feed.moderate`): "desde el lunes el corte es el jueves a
  las 20" no se puede perder entre las alertas. Un fijado lleva fecha de vencimiento.
- **"Lo leí"**: cada publicación muestra quién la vio; las importantes (fijadas o **Cambio**) piden
  confirmar con un botón, y el autor ve quién falta.
- **Respuestas y reacciones**: respuestas cortas debajo de la publicación y un "👍" para no llenarla
  de "ok". Sin hilos dentro de hilos.
- **Editar y borrar**: el autor, la suya; el superadmin, cualquiera. Queda en la auditoría.
- **Avisos al publicar**: punto en el ícono del tablero y, si está activo, notificación del
  navegador. Sin correo ni WhatsApp: es comunicación interna.
- **Novedades del sistema**: cuando sale una versión con cambios visibles, el superadmin la publica
  con la etiqueta **Novedad del sistema** (sirve para contar "ahora Contenidos está en el Panel de
  control").

Modelo: `feed_posts` (autor, ciudad o todas, etiqueta, texto, imagen, fijado hasta, editado,
borrado lógico), `feed_post_reads` (quién y cuándo, y si confirmó), `feed_post_replies` y
`feed_post_reactions`.

## Permisos

Los números de ventas del encabezado ("vendido") y los consejos con datos de ventas piden
`stats.read`, que es sólo del superadmin (RBAC_MATRIX.md). El operador ve lo operativo: pedidos,
sin confirmar, sin cobrar.

## Cómo quedó la fase 1 (2026-10-16)

- **Modelo** (migración 0062): `feed_posts` (autor, ciudad o todas, etiqueta `aviso`/`cambio`/
  `novedad`, texto de hasta 4000 caracteres, `pinned_until`, `edited_at`, borrado lógico) y
  `feed_post_reads` (quién la vio y cuándo confirmó "lo leí").
- **Permisos**: `feed.post` (leer y publicar; lo traen el operador y el superadmin) y
  `feed.moderate` (fijar, publicar **Novedad del sistema**, editar o borrar lo de otros; sólo el
  superadmin). El servicio valida las reglas aunque la pantalla no ofrezca la opción.
- **API** (`/api/v1/feed/posts`, con el alcance de la ciudad): listar (fijadas vigentes primero,
  después de la más nueva a la más vieja, y cuántas no vio en las últimas dos semanas), publicar,
  editar, borrar, fijar (`PUT …/pin`), marcar vista o confirmar (`POST …/read`) y quién la vio y
  quién falta (`GET …/readers`; "el equipo" es quien tiene `feed.post` por sus roles).
- **Pantalla**: "Novedades" en el Dashboard, debajo de "Lo que sale hoy" en escritorio y debajo de
  "Esperando por vos" en el teléfono. Filtros Todo · Alertas · Comunicaciones. Las publicaciones
  que no había visto se marcan vistas al abrir pero siguen diciendo "Nueva" hasta recargar. Las
  fijadas y los **Cambio** piden "Lo leí" y muestran cuántos confirmaron; tocando el número se ve
  quién la vio y quién falta.
- **Alertas** de la fase 1, armadas en la pantalla con lo que la API ya da: pedidos repetidos en el
  período y pedidos por correo para revisar. Los borradores sin confirmar siguen en el widget y en
  "Esperando por vos"; lo que sale hoy, en su aviso de arriba.

## Cómo quedó la fase 2 (2026-10-16)

- **Modelo** (migración 0063): `feed_post_replies` (respuestas de hasta 1000 caracteres, borrado
  lógico), `feed_post_reactions` (un 👍 por persona y publicación) y `feed_card_states` (las
  tarjetas que cada uno marcó como hechas o pospuso, con `hidden_until`).
- **Respuestas y 👍**: debajo de cada publicación. Responder abre la conversación de esa
  publicación (sin hilos dentro de hilos); cada uno borra lo suyo y el superadmin, cualquiera.
- **Agenda y mensajes en el feed**: los recordatorios sin hacer, los cierres de período y los
  cortes de cocina de hoy y mañana; y cada conversación del chat interno con mensajes sin leer.
  Alertas: se suman los pedidos en borrador sin confirmar. Filtros Todo · Alertas · Comunicaciones
  · Agenda · Mensajes.
- **Hecho y Mañana**: en cada tarjeta que no es una publicación, por persona. "Mañana" la esconde
  hasta las 6 del día siguiente; "Hecho", mientras diga lo mismo: la clave incluye lo que dice
  (`duplicados:3`), así que si pasan a ser cuatro vuelve a aparecer.
- **El punto de nuevas**: en "Dashboard" del menú y en el búho de la barra del teléfono, cuando hay
  publicaciones de las últimas dos semanas sin ver. Una sola consulta liviana
  (`GET /api/v1/feed/unread`) cada minuto y medio, sólo con la pestaña a la vista.
- **Avisos del navegador**: opcionales, se prenden desde "Avisarme en el navegador" en el feed
  (piden permiso la primera vez y quedan por navegador). Avisan cuando sube la cuenta de nuevas y
  la pestaña está de fondo. Sin correo ni WhatsApp.
- Afuera, a propósito: la imagen en una publicación (se suma cuando haga falta: el texto con
  enlaces cubre lo de hoy) y los mensajes de WhatsApp de clientes, que no llevan "sin leer"
  todavía.

## Cómo quedó la fase 3 (2026-10-16)

Consejos del día como tarjetas del feed (filtro **Consejos**), armados en la API
(`GET /api/v1/feed/tips`, `packages/db/src/repositories/feed-tips.ts`) con los datos del período
en curso y la ciudad del alcance. Cada uno aparece sólo si hay algo que hacer y pide el permiso de
lo que muestra:

- **Habituales que faltan** (`customers.read`): pidieron en cada uno de los tres períodos
  anteriores y todavía no en éste, con los nombres.
- **Pedidos sin ubicación** (`orders.read`) y **domicilios sin barrio** (`customers.read`) del
  período: sin eso, la hoja de ruta no se arma bien.
- **Lo más pedido** (`production.read`): la variedad con más unidades.
- **El ritmo** (`stats.read`, sólo el superadmin): pedidos de este período contra el anterior a
  la misma altura.

La clave lleva el número (`tip:habituales:3`): "Hecho" lo esconde hasta que cambie.

También en esta entrega: la fila de filtros del feed desbordaba el ancho del teléfono y corría la
página hacia un costado. La grilla del feed ahora es de una columna que no crece más que la
pantalla, y los filtros se deslizan con el dedo.

## Fases

1. ✅ El feed con **comunicaciones** (publicar, fijar, "lo leí"), alertas y actividad, hecho primero
   para el teléfono (es el home mobile nuevo) y ancho en escritorio. `GET /api/v1/feed` arma las
   tarjetas; las publicaciones tienen su propia API.
2. ✅ Calendario y mensajes en el feed; respuestas y reacciones; hecho y pospuesto por usuario;
   punto de nuevas y avisos del navegador.
3. ✅ Consejos del día.

Decisión del usuario: el orden queda a criterio de quien lo construye; se empieza por la fase 1.

## Novedades del sistema preparadas (2026-10-23)

- Las novedades se escriben en `packages/db/src/release-notes.ts` (una por entrega, al final de la
  lista) y se publican con `pnpm db:seed-release-notes` (`--produccion` en producción), después de
  la migración que las acompaña: para todas las ciudades, etiqueta "Novedad del sistema", sin autor.
  Una novedad ya publicada (mismo texto, sin borrar) se saltea.
- El feed firma "Verdeo" una novedad sin autor (antes habría dicho "Alguien que ya no está").
