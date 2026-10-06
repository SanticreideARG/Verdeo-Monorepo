# Backlog priorizado

Marcado a partir de IMPLEMENTATION_ROADMAP.md's "Estado (as built)" — ver ese documento y la sección
"As built" de cada feature doc para el detalle de qué exactamente quedó construido en cada V1/esqueleto.

## P0 - Foundation

- [x] Scaffold monorepo.
- [x] Neon + Drizzle migrations.
- [x] Config/env.
- [x] Auth.
- [x] RBAC.
- [x] Audit Core.
- [x] Error model.
- [x] Observability.

## P0 - CRM

- [x] Customer CRUD.
- [x] CustomerIdentity.
- [x] CustomerAddress.
- [x] Preferences/restrictions.
- [x] Geocoding.
- [x] Merge (fusión con lápida, candidatos por nombre/contacto archivado, auditada — ver
      CRM_IMPLEMENTATION.md "As built (fusión, sin reversa)").
- [ ] Unmerge — bloqueado: hace falta una tabla de linaje por relación, hoy sólo se guarda a dónde
      fue la ficha, no de dónde vino cada pedido.
- [ ] Preview de conflictos antes de fusionar.

## P0 - Catalog

- [x] Product families.
- [x] 250/400 variants.
- [x] Weekly Menu.
- [x] Intuitivo (as built: familia `COMPOSABLE` de nombre fijo por el sistema, ver
      WEEKLY_MENU_AND_PRODUCTION.md — más el interruptor `menu_catalog_settings`).
- [x] Price snapshots.

## P0 - Orders

- [x] SalesCycle.
- [x] Draft.
- [x] Confirm.
- [x] Edit/audit.
- [x] Cancel/reprogram.
- [x] Public number.
- [ ] Availability windows.
- [x] Filtered order log by status, zone, customer, and date range.
- [x] Visible order status history.
- [x] Audited order editing with reason.
- [x] CSV export and Excel adapter (`GET /orders/export?format=csv|xlsx`; la planilla trae
      Pedidos, Conciliado y Por zona).
- [x] Ocultar apellidos en pantalla y en la exportación (`maskSurnames=1`).
- [x] Eliminar clientes: borra el que no tiene pedidos, archiva el que sí.
- [x] Ordenar la lista por cualquier columna.
- [x] Un solo formato de fecha en toda la aplicación (`lib/dates.ts`), con nombre de mes.
- [x] Estados de cliente en castellano y elegidos de una lista, no escritos a mano.
- [x] La fila de la cola muestra su estado en la forma, no sólo en una columna de texto.
- [x] Importar pedidos desde una planilla, en dos pasos: vista previa que dice con qué cliente y
      con qué variedad coincide cada fila, y recién después la creación como borradores.
- [x] Eliminar un pedido definitivamente, con motivo obligatorio y foto en la auditoría. Permiso
      `orders.delete`, que no viene con ningún rol: se concede a mano y quitarlo lo apaga.
      Pedido como posiblemente temporal, para limpiar lo que quedó de las pruebas; si deja de
      hacer falta, alcanza con revocar el permiso antes de sacar el código.

## P0 - Operational capture

- [x] Persisted provider-neutral inbound events with idempotency (`messaging_webhook_events`).
- [x] Conversations and messages linked to customer identities.
- [x] Scoped quick-response template CRUD.
- [ ] One reviewable order draft per order intent.
- [x] Zod-validated AI extraction candidates (`extract_order`, Fase 6).
- [ ] Human review before creating an order.
- [ ] Inline customer lookup/create/edit from capture.
- [ ] Combined customer order and conversation history.

## P0 - Web

- [x] Landing.
- [x] CMS.
- [x] Menu display.
- [x] Guest order wizard.
- [x] Customer portal base (`/mi-cuenta`: acceso por enlace de correo, pedidos, domicilios).

## P0 - WhatsApp

- [ ] Meta setup (esperando credenciales reales — ver MESSAGING_WHATSAPP.md "As built").
- [x] Webhook.
- [x] Multi-account router.
- [x] Inbox.
- [x] Outbound.
- [x] Templates.
- [x] Delivery statuses.
- [x] Customer resolution.
- [ ] Human-approved AI reply suggestions.

La operación no va a pagar la Cloud API, que se cobra por conversación iniciada por el negocio y
es exactamente el caso de avisar a cien clientes por semana. Entonces **avisar es a mano**: lo que
construimos no es el envío sino la cuenta de a quién ya se le avisó.

- [x] Pantalla de **Avisos**: la cola del período, derivada de los pedidos confirmados, con el
      texto ya resuelto por cliente y el enlace `wa.me` que abre el chat escrito.
- [x] `manual_notices`: registra sólo lo que se hizo (mandado o salteado). Una fila sin registro
      es un pendiente, así que no hay cola que mantener ni limpiar entre semanas.
- [x] **Mensajes guardados** en el Panel de control: escribir las plantillas con las variables
      del pedido y verlas resueltas con valores de ejemplo antes de guardar.
- [ ] Las acciones de reparto (`ON_MY_WAY`, `AT_ADDRESS`, `DELIVERED_THANKS`) por el mismo camino
      manual desde la hoja de ruta; hoy siguen apuntando a la Cloud API.
- [ ] Escribir las primeras plantillas reales con la operación.

## P0 - AI

- [x] Provider interface.
- [x] Model capabilities.
- [x] Router/fallback.
- [x] Prompt registry.
- [ ] Usage/budgets (solo habilitado/deshabilitado por ahora, sin costo/cuota real).
- [x] Rewrite.
- [ ] Customer reply.
- [x] Extract order.
- [ ] Extract customer/availability.
- [ ] Menu copy.

## P1 - Production

- [x] Partial snapshot.
- [x] Final snapshot.
- [x] Delta.
- [x] PDF/Excel/message exports.
- [x] Actual production.
- [x] Surplus.
- [x] Opportunity sale.

## P1 - Logistics

- [x] Route CRUD.
- [x] Hoja de ruta por zona (`geographicZoneId` opcional en `POST /routes`).
- [x] Descartar propuestas de ruta sin publicar.
- [x] Páginas públicas de privacidad (`/privacidad`) y condiciones (`/terminos`), aptas para la
      verificación de OAuth de Google.
- [x] El formulario ofrece sólo fechas con pedidos por rutear, con el conteo.
- [ ] Time windows.
- [x] Optimization adapter (`@verdeo/routing` — determinista, sin ventanas horarias; ver
      DELIVERY_AND_ROUTES.md "As built").
- [x] Publish.
- [x] Delivery PWA.
- [x] Message triggers.
- [x] Delivery confirmation.
- [x] **El sitio de reparto (`/reparto/:token`) reemplaza a la app y a las cuentas de repartidor.**
      Se genera un enlace por ruta publicada, vence, y generar uno nuevo da de baja el anterior.
      Lleva el mapa, el horario en que recibe cada cliente, cómo entrar, qué entregar y qué cobrar;
      confirma entrega y cobro en un solo movimiento y lleva a la vista cuánto hay para rendir.
      Desde el panel se ve cómo va la ruta con la misma cuenta. El rol `repartidor`, la app
      `/delivery` y la asignación de paradas a usuarios se eliminaron.
- [x] **La franja horaria del domicilio** (`delivery_window`) se carga desde la ficha del cliente y
      se ve en la hoja de reparto, debajo de la dirección. Texto libre: la realidad de cada cliente
      no entra en un selector de horas, y quien lo lee es una persona manejando.
- [x] **Entrega fallida y avisos al cliente, desde el enlace.** Estaban detrás de permisos que, con
      el rol eliminado, no tiene nadie: la operación había perdido la capacidad de registrar una
      entrega fallida. El motivo sale de la lista cerrada de siempre.
- [ ] El tipo de token `repartidor_access` ya no se emite, pero sigue aceptado para no cortar los
      que están en la calle. Sacarlo del contrato cuando hayan vencido todos.
- [x] **Qué entregar en cada parada** (`deliveryDetail` en `@verdeo/orders`): una vianda estándar se
      nombra por variedad y tamaño —"Menú Keto 400"—, que es lo que dice su etiqueta; un Intuitivo,
      por el nombre de quien lo pidió —"Intuitivo 250 · Ana"—, porque dos Intuitivo del mismo tamaño
      son combinaciones distintas y eso es lo único que los separa. Las unidades se escriben sólo
      cuando son más de una. Lo arma el servidor una vez por ruta, así que la vista, el mensaje de
      WhatsApp, el CSV (columna "Qué entregar") y la app del repartidor dicen exactamente lo mismo.

## P1 - Payments

- [x] Pending/paid/to-settle.
- [x] Cash collection.
- [x] Settlement.
- [x] Dashboard.

## P1 - Labels

- [x] Label templates (`LabelSettingsPage` + `labels-export.ts`; impresión bajo demanda desde
      producción, nunca automática al confirmar un pedido).
- [ ] Multi-copy.
- [x] Order ID.
- [ ] QR token.

## P1 - Content/AI

- [ ] Story 1080x1920.
- [ ] Brand templates.
- [ ] Image generation provider.
- [x] AI Workbench.

## P2 - Customer surveys

- [x] Survey editor/engine (`SurveysPage`, preguntas configurables).
- [x] Token público por encuesta + ruta `public/survey/:token` (`PublicSurveyPage`).
- [x] QR de distribución de la encuesta (se genera en la pantalla, junto al enlace público). En
      Labels sigue faltando.
- [x] Pantalla de resultados/estadísticas por encuesta (`SurveyResultsPage`, gateada por permiso).
- [x] **Decidido: los dos modelos conviven.** El envío 1:1 sigue igual —un token por cliente, de un
      solo uso, y sabe quién respondió— y se le suma un enlace público por encuesta: uno solo,
      compartible, anónimo, que no se consume. Responden preguntas distintas: "¿cómo estuvo tu
      pedido?" se le manda a una persona, "¿qué menú querés la semana que viene?" se tira en un
      grupo. El segundo envío desde el mismo navegador se frena con `localStorage`, que evita el
      doble envío por error y no pretende ser a prueba de quien se proponga votar de más — impedir
      eso exige identificar, que es lo que un enlace anónimo viene a evitar.
- [x] Eliminar encuestas, con sus preguntas y sus respuestas.

## P2

- [ ] Instagram adapter.
- [ ] Messenger adapter.
- [ ] Email adapter.
- [x] Internal messaging (chat de staff con presencia y no-leídos).
- [ ] Marketing automation.
- [x] Advanced analytics (Estadísticas: por zona, semana, tamaño, variedad y día).
- [ ] Recommendation learning.

## Respaldos y restauración

- [x] **Descarga del respaldo en JSON** (`/app/respaldos`, permiso `backups.manage`, que no viene
      con ningún rol). Diez grupos elegibles, recorte por ciudad y por período, y un manifiesto con
      la fecha, la versión de la aplicación, cuántas migraciones tiene la base y cuántas filas trae
      cada tabla. Las ciudades y las zonas viajan siempre que se lleve algo que las referencia.
- [x] **Lo que nunca sale**: contraseñas, sesiones, tokens y credenciales. Tampoco usuarios y roles
      (decisión explícita), ni la auditoría, ni las estadísticas —se recalculan de los pedidos, y un
      número guardado que ya no coincide con sus datos es peor que no tenerlo.
- [x] **Restauración** con cuatro frenos: cargar el archivo, elegir modo, **simular** (un modo del
      servicio que lee y no escribe) y escribir la palabra. Dos modos —sólo lo que falta y
      reemplazar—, transacción única, y rechazo de un archivo de otro esquema. **Nunca borra**: una
      fila que está en la base y no en el archivo se queda. Seis tests en `backup.test.ts` fijan
      todo eso.
- [x] **La restauración queda en auditoría** (`backups.restored`), en la misma transacción que la
      escritura: si el registro falla, la restauración no queda hecha sin rastro. Guarda quién,
      en qué modo, cuántas filas por tabla y de qué archivo (fecha, versión de la aplicación y del
      esquema). Una simulación no se registra: no escribió nada.
- [x] **Auditoría de visibilidad por rol.** Tres roles reales (superadmin, operador, repartidor),
      tres usuarios y ninguna excepción en uso. Resultados: el rol `cocina` se eliminó —cocina recibe
      información, no entra al panel—, y cinco endpoints tomaban la ciudad del parámetro sin
      cruzarla con las de la sesión (estadísticas, rutas, cobros, calendario y respaldos): cerrado
      con `resolveSiteQuery`, con tests que lo fijan.
- [x] **El rol operador ya puede trabajar la semana.** No tenía ningún permiso de `orders.*` ni de
      `customers.*`: armó rutas y registró cobros desde el primer día, pero no podía tomar un pedido.
      Lo que le toca a cada rol pasó a ser data en un solo lugar (`role-defaults.ts`) —estaba
      repartido en cuatro bloques de `seed.ts`, que carga datos de demostración y por eso nunca se
      volvió a correr contra producción— y lo aplica `pnpm db:seed-permissions`, que sí se puede
      correr contra una base en uso. Concede y nunca quita: un permiso dado a mano desde la pantalla
      de roles es una decisión de la operación. Cuatro tests lo fijan.
      **Corrido contra producción el 1 de octubre de 2026**: 18 concesiones nuevas al operador.

## Deuda encontrada, sin resolver

- [x] **`updateMenu` borraba y recreaba todas las ofertas de la semana**, dejando sin vínculo a los
      pedidos ya cargados (231 al encontrarlo). Ahora hace upsert contra los índices únicos
      (menú, tamaño) y (menú, variante), así que una variedad que sigue en el menú conserva su `id`;
      se borra sólo lo que el operador sacó. Cubierto en `menu-update.test.ts`.
- [x] **El ciclo de venta es uno solo para todas las localidades y `updateMenu` lo reescribía desde
      cualquier revisión regional**, así que guardar la semana de una ciudad le cambiaba el nombre y
      las fechas a las demás. Desde una revisión regional el ciclo ya no se toca y se rechaza con un
      mensaje si vienen valores distintos; el formulario los muestra de sólo lectura.
- [x] `audit` y `observability` ya tienen tests (5 y 10). Los dos que importan: que `AuditService`
      no se trague un fallo del sink —corre dentro de la transacción de quien audita, y tragarlo
      daría la operación por buena sin dejar rastro— y que el logger tape tokens, claves y headers
      de autorización. Para poder comprobar lo segundo, `createLogger` acepta un destino opcional:
      por defecto pino escribe al descriptor 1 y lo que sale no se puede leer desde un test.
- [x] **La fecha de entrega salía corrida un día** en todo ciclo que cierra después de las 21:00
      (el de septiembre cierra el domingo 13 a las 23:15, que en UTC ya es lunes 14). Se tomaba la
      fecha UTC del cierre. Ahora la decide el servidor a partir del cierre del ciclo, en hora de
      la operación (`deliveryDateFor` en `@verdeo/orders`), e ignora la que manda el navegador; los
      scripts de datos de prueba usan la misma función. Las pantallas que calculaban "hoy" en UTC
      —tablero del teléfono, agenda del tablero, calendario— usan `todayInOperation()` y ya no se
      adelantan un día de noche.

- [x] **El keep-alive de Supabase no mantenía vivo nada.** Pegaba a `/auth/v1/settings`, que
      contesta la configuración de Auth sin tocar Postgres: el cron corría todos los días, el log
      decía que Supabase respondía, y el proyecto se pausó igual —dos veces—. Un proyecto pausado
      rompe el build del frontend, así que producción queda congelada en el último commit que
      llegó a construirse y lo que se ve son síntomas sueltos que parecen bugs. Ahora hace un
      `upsert` por PostgREST contra una tabla `keep_alive`, que es llegar a la base de verdad, y
      se informa aparte del ping. Requiere crear esa tabla una vez: el SQL está en
      `VERCEL_DEPLOYMENT.md`.

## Asistente de la landing

- [x] Widget abajo a la derecha, con opciones configurables desde Ajustes.
- [x] Respuestas híbridas: texto escrito más datos en vivo (menú, precios, zonas, medios de pago).
- [x] Pregunta la ciudad cuando la respuesta depende de ella, y la recuerda por la visita.
- [x] "Hablar por WhatsApp" como salida cuando ninguna opción alcanza.
- [x] Conversación en `sessionStorage`: sobrevive a un F5, no reaparece una semana después.
- [x] Contador anónimo por opción, para saber qué se pregunta sin guardar conversaciones.
- [ ] Sub-opciones (`preguntar`): el contrato y el widget ya las soportan, la pantalla de
      configuración todavía no las deja editar. Es lo primero que agregaría si hace falta un
      segundo nivel.
- [ ] El widget sólo está en la landing. En `/pedido` competiría con el formulario, que es adonde
      el asistente manda; extenderlo a otras páginas es mover una línea.

## Interfaz: lo que queda del análisis

Del relevamiento del 9 de septiembre de 2026 (19 hallazgos). Hechos: fechas unificadas, estados de
cliente traducidos, teléfonos formateados en la ficha, tono de fila por estado, hover de fila, la
semana en la ficha del pedido, y el vacío de "Ver pedidos" con botón para limpiar filtros.

- [x] **Los errores dicen qué hacer** (`lib/errors.ts`): separa sin permiso, sin conexión, sesión
      vencida, rechazo por una regla y fallo del servidor, y cada uno trae su salida. `errorMessage`
      pasa por ahí, así que las cuarenta pantallas que muestran una línea mejoraron sin tocarlas;
      "Ver pedidos" usa además `ErrorNotice`, con el botón de reintentar sólo donde sirve.
- [x] **Un solo patrón de confirmación** (`ConfirmDialog`): marcar listo un lote, publicar una
      ruta, descartar una propuesta y eliminar un cliente. El texto dice qué va a pasar y a cuántas
      cosas. Queda afuera el diálogo de cancelar un pedido, que además del sí/no pide un motivo de
      una lista: no es la misma pregunta.
- [x] **`<ActionButton>`** en los botones que guardan o publican: exportar, etiquetas, guardar
      borrador y publicar en Contenidos, zonas, ayuda, formato de etiqueta, publicar menús y
      revisiones, encuestas, roles y excepciones. Deshabilitar mientras corre es además la única
      defensa contra el doble clic en rutas que no son idempotentes.
- [x] **El éxito se avisa por una sola vía**: 22 confirmaciones que usaban el renglón de los errores
      pasaron al aviso flotante, que es la regla que el código ya tenía escrita. El renglón quedó
      para lo que hay que resolver, con aspecto de aviso (`.screen-notice`) y no de confirmación:
      compartir recuadro entrenaba a ignorarlo, y ahí después aparece un error de verdad.
- [x] **`<EmptyState>`** con título, explicación y acción. La tabla acepta un vacío con contenido y
      no sólo una frase. Puesto donde el vacío suele ser un filtro de más —Pedidos, con el botón que
      lo limpia— y donde es real —Rutas y Encuestas, con la acción que lo llena. Quedan vacíos
      sueltos en Contenidos, Usuarios y Mi cuenta.
- [x] **Totales al pie** de la tabla de pedidos: cuántos, cuántas unidades, cuánta plata y cuántos
      cobrados, sobre lo filtrado y no sobre el histórico. Una columna declara su propio total, así
      que las que no suman nada dejan la celda vacía en vez de mostrar ruido.
- [x] **Nombres de menú normalizados al guardar** (`normalizeMenuName`), y los cuatro que ya
      estaban gritados corregidos en producción. La regla sólo interviene si el texto está
      enteramente en mayúsculas: "Menú KETO" escrito así a propósito se conserva. Los snapshots de
      los pedidos vendidos no se tocan — eso decía la etiqueta ese día.
- [x] **Cambiar de ciudad sin recargar la aplicación entera.** El selector guarda y avisa; la
      pantalla en curso se vuelve a montar (un `key` en el árbol de rutas) y pide sus datos con la
      ciudad nueva. Se sigue perdiendo lo que había en pantalla, que es deliberado —un formulario a
      medio llenar con un cliente de Neuquén no se guarda como pedido de Mendoza—, pero ya no se
      vuelve a bajar la aplicación ni a revalidar la sesión.
- [ ] Agrupar la navegación por momento del ciclo semanal y no por módulo.
- [x] **Barra fija con guardar y total** en los dos formularios de pedido, en pantallas angostas.
      En el panel se apoya arriba de la barra de accesos del turno para no taparla.
- [x] **Cargar atenúa lo que hay en vez de vaciarlo** (`.is-refreshing`): auditoría, cocina y
      etiquetas conservan la lista mientras llegan los datos del filtro nuevo.
- [x] **Los vacíos no se anuncian**: la ficha de un domicilio ya no escribe "Sin datos territoriales
      adicionales"; lo que sí importa —sin geocodificar— lo dice el estado de arriba.
- [ ] Búsqueda global con `Ctrl+K`. No urgente: vale cuando el equipo pase de tres personas.
- [x] **Imágenes de marca livianas** (`lib/images.ts`): logos de menú, ícono, logo del hero y
      lechuza en WebP al doble del tamaño en que se muestran. La PWA ya no precarga los originales
      (precache de más de 5 MB a 1,3 MB).
- [x] **Aviso de versión nueva** (`UpdatePrompt`, `registerType: 'prompt'`): después de un deploy
      aparece "Hay una versión nueva" con Actualizar / Después, y se busca versión cada 30 minutos.
- [ ] `EmptyState` y `ActionButton` en el resto de las pantallas (ver arriba).
- [ ] Ícono _maskable_ para Android (ver PWA en `MVP_DASHBOARD_ACCESS.md`).

## Ayuda del panel (la lechuza de los operadores)

- [x] La lechuza abajo a la derecha en todo el panel; es el único acceso a la ayuda (el menú
      lateral ya no tiene "Ayuda"). El editor de artículos sigue en `/app/ayuda`.
- [x] Ramas por categoría con `/`, búsqueda sin tildes, enlaces entre artículos y a pantallas.
- [x] Colores del tema elegido en Apariencia, claro y oscuro.
- [x] 31 artículos, gateados por permiso.
- [ ] Revisar con alguien de la operación dos artículos escritos sin confirmación en el código:
      "Pedidos que llegan por la web" (que entran pendientes de confirmar) y "Usuarios, roles y
      permisos" (dónde están las excepciones).
- [ ] Respuestas con datos en vivo: "¿qué me falta para cerrar la semana?" (borradores sin
      confirmar, domicilios sin geocodificar, pedidos sin ruta), "¿qué falta cobrar?", "¿cómo va la
      semana?". Cada una respeta la ciudad elegida y los permisos.

## Ciudades y zonas

La landing anuncia más cobertura de la que el sistema tiene cargada.

- [ ] **Córdoba**: crearla (prefijo sugerido `CBA`, zona Centro, WhatsApp 351 300 7925), distribuirle
      el menú y cargar sus precios. Queda a cargo de la operación.
- [ ] **Río Negro** está activa pero sin menús: no puede vender. Además "Cipolleti" está mal
      escrito y faltan Fernández Oro y Villa Regina.
- [ ] **Buenos Aires** tiene una sola zona ("Zona General"); la landing nombra 5 barrios de CABA y 6
      localidades de Zona Norte.
- [ ] **Mendoza**: faltan Godoy Cruz, Guaymallén y Luján de Cuyo; decidir si San Rafael sigue.
- [ ] WhatsApp público de cada ciudad (hoy vacío en todas) y punto de partida del reparto (hoy
      ninguna lo tiene: el optimizador arranca desde la primera parada).
- [ ] Bahía Blanca: postergada.

## Entrega final

Ver `docs/12-development/ENTREGA_FINAL.md`: qué bloquea abrir (usuarios de producción, permisos del
operador en la base, limpieza de datos de prueba, ciudades y zonas, externos) y qué queda afuera a
propósito.

- [x] **`--site` en `auth:provision-user`**: sin ciudad asignada, quien no sea superadmin entra al
      panel y no ve nada, porque el alcance sale de `user_operating_sites` y el script no escribía
      ninguna fila ahí. El camino recomendado sigue siendo la invitación desde Usuarios, que ya ata
      rol y ciudad y deja que la persona elija su clave.

## Ventanas horarias

- [x] La ventana del cliente viaja con la parada a los cuatro lugares: pantalla de Rutas, mensaje de
      WhatsApp, planilla y minisitio del repartidor. Antes se cargaba en la ficha y se veía sólo en
      el minisitio — justo donde ya no sirve para decidir el orden.
- [ ] Que el optimizador las respete. Requiere que la ventana deje de ser texto libre y pase a dos
      horas (desde/hasta) en campos separados, más la migración de lo ya cargado. Un parser sobre el
      texto actual falla en silencio y manda la parada a cualquier lado, que es peor que no ordenar.

## Carrito

- [x] Varias variedades en un pedido desde el formulario. El backend ya las aceptaba; lo que mandaba
      una sola era la pantalla. Lo elegido y no agregado entra solo al guardar, así que el pedido de
      una variedad no paga el costo de la función.
- [x] La misma variedad repetida en dos renglones, que es un pedido válido y no un duplicado.
- [ ] El pedido web (`/pedido`) sigue siendo de una variedad: usa su propio formulario.

## Intuitivo de más platos

- [x] La cantidad del tamaño pasa de ser una igualdad a ser un piso: más platos es un pedido válido,
      menos se rechaza. El techo lo fija cada ciudad; quince por defecto.
- [x] Repetir un plato. Ya estaba en la especificación y la base siempre lo aguantó: lo impedía el
      selector, que usaba un tilde donde hacía falta una cuenta.
- [x] Precio propuesto por regla configurable por ciudad: proporcional, por coeficiente o monto fijo
      por plato extra, con redondeo al escalón elegido. El precio del tamaño nunca se toca.
- [x] La regla se configura en Panel de control → Menú personalizado, sin deploy.
- [ ] El menú sigue admitiendo hasta cinco platos base por variedad
      (`weekly_menu_items_slot_check`). Es la definición del menú y no el tope del pedido, pero si
      alguna vez se quiere un tamaño de ocho platos estándar, hay que subirlo.
