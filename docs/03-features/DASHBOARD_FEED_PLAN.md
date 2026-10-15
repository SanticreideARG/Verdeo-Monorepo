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

## Fases

1. El feed con **comunicaciones** (publicar, fijar, "lo leí"), alertas y actividad, hecho primero
   para el teléfono (es el home mobile nuevo) y ancho en escritorio. `GET /api/v1/feed` arma las
   tarjetas; las publicaciones tienen su propia API.
2. Calendario y mensajes en el feed; respuestas y reacciones; hecho y pospuesto por usuario.
3. Consejos del día.

Decisión del usuario: el orden queda a criterio de quien lo construye; se empieza por la fase 1.
