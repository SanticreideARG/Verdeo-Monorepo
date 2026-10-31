# Backlog priorizado

Marcado a partir de IMPLEMENTATION_ROADMAP.md's "Estado (as built)" — ver ese documento y la sección
"As built" de cada feature doc para el detalle de qué exactamente quedó construido en cada V1/esqueleto.

## Cambiar el cliente de un pedido (2026-10-31)

Pedidos cargados a nombre de "nn" (como stock) que había que pasar a los clientes reales. Antes sólo se podía cancelar y volver a cargar.

- [x] `PATCH /orders/:id` acepta `customerId`: el pedido pasa al cliente nuevo con platos, período, precio, pago y cobro; el domicilio sale del cliente nuevo (el elegido, el principal de la ciudad o uno escrito). Mismo permiso que editar (`orders.edit`). No cambia de ciudad, y un pedido cancelado no cambia de cliente. Revisión y auditoría con el cliente anterior y el nuevo. Sin migración.
- [x] "Cambiar cliente" en la ficha del pedido (`ChangeCustomerDialog`): buscar o crear el cliente, elegir domicilio u "Otra dirección…".
- [x] Ayuda (`pedidos-cambiar-cliente`) y novedad.

## Pulido de UI del panel (2026-10-31) — [auditoría](../03-features/AUDITORIA_UI_2026-10-31.md)

Auditoría de 40 pantallas en celular, tablet y escritorio. Sin scroll horizontal en ninguna; lo que falta es pulido.

- [ ] Contraste: `--db-muted` de 52–54 % a ~70 % en todos los temas (hoy 3,2:1, por debajo de AA).
- [ ] Barra superior: controles tocables de 40 px, etiquetas de 11 px o más; en tablet, sin nombre ni reloj en la barra.
- [ ] Botones que se parten en celular (Cocina, Nuevo pedido); "Cerrar período" con estilo propio.
- [ ] Botones flotantes ("?" y logo de la barra inferior) que tapan la última tarjeta y "Limpiar".
- [ ] Un solo `PageHeader` (hoy conviven `dashboard-kicker` y `eyebrow`; 11 pantallas a migrar).
- [ ] Detalle de pedido en celular: volver como flecha, una acción visible y el resto en "···".
- [ ] Detalles: "Períodos" con tilde, tabla de Pedidos en tablet, Stock disponible vacío, `h1` de `/app/ia` y del tablero de celular, gráfico con un día, textos largos de encabezado, selector del Workbench en celular, títulos de Ayuda, campos de archivo sin etiqueta.

## Movimiento: GSAP, Lenis y React Bits (2026-10-31) — [plan](../03-features/MOVIMIENTO_PLAN.md)

Animaciones en el sitio público y en el panel, empezando por el público. Siempre respetando "reducir movimiento" y con carga aparte.

- [x] Fase 1: portada pública. Scroll suave (Lenis, sólo rueda), enlaces del menú que deslizan hasta la sección, entrada del primer bloque y de cada sección al aparecer (GSAP).
- [ ] Fase 2: panel, sin Lenis. Elegir pantallas y efectos (búho, Estadísticas, tablero).

## Stock por ciudad (2026-10-29) — [plan](../03-features/STOCK_POR_CIUDAD_PLAN.md)

El stock del período y sus bajas eran sólo por período: lo cargado en una ciudad aparecía, se cocinaba y se vendía en las otras.

- [x] Migración 0077 (expandir): `operating_site_id` en `production_stock` y `surplus_writeoffs`, lo existente asignado por la regla del cierre, índice único con la ciudad. Probada en `migrations.test.ts`.
- [x] Correr 0077 en producción (antes que el código). Corrida el 2026-10-30; el código salió después.
- [x] Código: stock, bajas, disponible, venta del stock, resumen de cocina y cierre por ciudad; con "Todas las ciudades" se ve la suma y no se edita. Lo que la cocina hizo de más sin ser stock de nadie va a la ciudad que más vendió esa variedad (con una ciudad, igual que antes).
- [ ] 0078 (contraer): `NOT NULL` en las dos columnas.

## El búho en el Workbench de IA (2026-10-30) — [plan](../03-features/BUHO_WORKBENCH_PLAN.md)

El Workbench pasa de herramienta de administración a mesa de trabajo con IA, con el búho al centro: analizar mensajes pegados, copiar la respuesta con un clic, preguntar sobre la operación y armar el análisis del período con prompts maestros. Decisiones tomadas (sección 6 del plan).

- [x] Fase 1: pantalla nueva (búho en tres estados, diálogo para pegar, conversación, copiar); 22 modos en cuatro grupos; el editor actual pasa a "Prompts maestros". El Workbench se abre con `ai.use`.
- [x] Fase 2: resumen de datos del período para el búho (`assistant-context.ts`), sin datos personales y con el mismo permiso que cada pantalla; tope de 150 consultas por persona y por día.
- [x] Fase 3: el búho sale del menú de Ayuda (queda un "?") y responde preguntas de uso con los artículos.
- [ ] Fase 4: herramientas (tool calling) e historial, si se piden.

## Stock disponible en Pedidos (2026-10-30)

Para ver el stock había que ir a Cocina.

- [x] Panel "Stock disponible" arriba de la lista de Pedidos (`StockAvailablePanel`): lo que queda del período y los lotes de períodos anteriores de la ciudad elegida, los que vencen en tres días o menos primero y resaltados. Cerrado es un renglón con el total; se recuerda abierto o cerrado por navegador. Sólo para mirar.
- [x] "Vender" en cada renglón abre Nuevo pedido con la variedad y "Sale del stock" marcado (del período) o una vianda del lote (de un período anterior).
- [x] Permisos: el disponible del período (`GET /production/:cycleId/surplus`) y los lotes también los lee `orders.read`; "Sale del stock" se ofrece a quien carga pedidos. Las bajas siguen pidiendo `production.adjust_surplus`.

## V1.0 - Estabilización y seguridad (desde 2026-10-29) — [análisis](../07-operations/ESTABILIZACION_V1.md)

Sprint 1 y MVP cerrados: la versión 1.0 corre en producción. Esta etapa prioriza no romper el trabajo de quien usa el sistema y no perder datos.

- [ ] Orden de despliegue: la migración en producción antes que el código que la usa (commit de migración aparte, se pushea solo).
- [ ] Doble factor en GitHub, Vercel, Neon, Supabase, Resend y el correo del responsable.
- [ ] Protección de `main` en GitHub: CI obligatorio, sin force push.
- [ ] Límite de intentos en login, acceso por correo del portal, encuestas abiertas y asistente (`RATE_LIMITED` existe y no se usa).
- [ ] Alarma de migración pendiente en Estado del sistema y en el keep-alive.
- [ ] Volcado nocturno cifrado (`pg_dump` + `age`) fuera de Neon, 30 diarios y 12 mensuales.
- [ ] Anotar la ventana de restauración (PITR) del plan de Neon y acordar RPO/RTO.
- [ ] Primer simulacro de restauración en una rama de Neon, anotado.
- [ ] Despliegue desde el CI: chequeo → rama de respaldo → migración → deploy hook de Vercel → semillas.
- [ ] Usuarios de base separados (la app sin permisos de esquema; migraciones con otro usuario).
- [ ] `audit_mirror` en Supabase con clave de servicio y política cerrada.
- [ ] Rotar secretos expuestos alguna vez.
- [ ] Dependabot o Renovate y `pnpm audit` en el CI (sólo aviso).
- [ ] Revisar permisos y sacar cuentas de prueba de producción; limpiar datos de prueba antes de abrir.

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
- [x] Stock para la venta, fase 1 (STOCK_PLAN.md): tabla `production_stock`, carga en Cocina, suma
      en producción y en lo disponible, conversión del cliente STOCK
      (`packages/db/scripts/convert-stock-customer.sql`).
- [x] Stock, fase 2: "Sale del stock" en la carga de pedidos, con lo disponible a la vista; lo
      vendido del stock no suma a lo que se cocina.
- [ ] Stock, fase 3: etiquetas del stock al producirse ("Incluir el stock").

## P1 - Ubicaciones

- [x] Asistente de ubicaciones (ADDRESS_SANITIZER_PLAN.md): pasada automática y revisión uno por
      uno de los domicilios sin ubicación, con avance.
- [ ] Darle al asistente su lugar en el menú (hoy se entra desde el tablero).

## P1 - Interfaz

- [x] **Panel de control en el teléfono** (SETTINGS_MOBILE_NAV_PLAN.md): inicio con tarjetas y buscador, encabezado "‹ Panel de control" con cambio de sección en una hoja; se retiró la pastilla plegada. Además, la barra superior ya no se pasa del ancho entre 681 y 1100 px.

## P1 - Tablero

- [x] Feed, fase 1 (DASHBOARD_FEED_PLAN.md): publicaciones del equipo (aviso, cambio, novedad del
      sistema), fijadas, "lo leí" con quién falta, alertas de repetidos y correos por revisar.
- [x] Feed, fase 2: punto de nuevas, avisos del navegador, respuestas y 👍, agenda y mensajes,
      hecho y mañana por persona.
- [ ] Feed: imagen en una publicación; "sin leer" de WhatsApp de clientes.
- [x] Feed, fase 3: consejos del día (habituales que faltan, sin ubicación, sin barrio, lo más
      pedido, ritmo de ventas para el superadmin).

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
      sólo por su tamaño —"Intuitivo 250"—: el detalle de los platos no le sirve al repartidor, la
      vianda ya va rotulada con el cliente. Las unidades se escriben sólo
      cuando son más de una. Lo arma el servidor una vez por ruta, así que la vista, el mensaje de
      WhatsApp, el CSV (columna "Qué entregar") y la app del repartidor dicen exactamente lo mismo.
- [x] Días de reparto por ciudad y alerta de "a despachar hoy" (ver DELIVERY_AND_ROUTES.md).
- [x] **Rutas y repartos** (plan en DELIVERY_RUNS_PLAN.md, las tres fases hechas el 2026-10-14): repartos por ciudad y fecha entre los
      pedidos y las hojas de ruta. Fase 1: modelo, creación automática y lista; fase 2: mover pedidos
      y consolidar; fase 3: rutas desde el reparto. Decisiones abiertas en el plan.

## P1 - Payments

- [x] Pending/paid/to-settle.
- [x] Cash collection.
- [x] Settlement.
- [x] Dashboard.

## P1 - Labels

- [x] Renderizador único de etiquetas, fondo blanco, logo arriba y layouts (LABELS_RENDERER_PLAN.md, fase 1).
- [x] Etiquetas: el nombre del cliente se configura (mostrar, tamaño, arriba/abajo; migración 0065) e imprimir abre la pestaña en el clic para esquivar el bloqueador de ventanas; `ActionButton` ya no se traba en modo estricto.
- [x] Etiquetas por hoja: se suman 15, 18 (3 × 6) y 21 (3 × 7) a las grillas de 3 columnas; faltaba 18 y caía en 5 × 4.
- [x] Visor con vista previa en vivo, zoom y anterior/siguiente (fase 2).
- [ ] Cocina, stock y calibración en el mismo renderizador (fase 3); layouts "tamaño a la vista" y "con banda".

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

- [ ] **Ayuda al día** (HELP_AND_HINTS_PLAN.md): test de cobertura, revisar los 36 artículos, escribir stock, tablero, Panel de control, ubicaciones, reparto e importar; fecha de revisión. Regla: el cambio de una pantalla toca su artículo en el mismo commit.
- [ ] **Ayudas al pasar el mouse** en escritorio (2 s): mecanismo con `data-hint` y catálogo, interruptor en Apariencia, primeras 15–20 ayudas.

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

## Auditoría: que diga qué se hizo

Pedido del product owner, anotado para después.

**Lo que ya existe.** El registro guarda quién (`actor_type`, `actor_user_id`), qué (`action`), sobre qué
(`entity_type`, `entity_id`), el antes y el después (`before`, `after`) y datos sueltos (`metadata`),
más `request_id` y `correlation_id`. Hay más de setenta acciones distintas, y ya incluyen
`order.created`, `order.updated`, `order.status_changed` y `order.deleted`. El conteo es de piso: las
que se pasan por funciones auxiliares (`auditCustomerMutation`) no aparecen en una búsqueda simple.

**Lo que probablemente falta es la lectura, no la escritura.** Hay que confirmarlo mirando la pantalla
con datos reales antes de prometer nada.

- [ ] **El hueco enorme de la pantalla.** Entre el título y los filtros queda un espacio en blanco de
      casi una pantalla, y el primer evento aparece recién abajo. Es un bug de maquetación.
- [ ] **Una frase por evento.** Hoy se ve `auth.login_succeeded`. Tendría que decir "Santiago entró al
      panel" o "Isabella confirmó el pedido NQN-00123": el código de la acción es para quien programa.
- [ ] **El antes y el después, legibles.** Mostrar qué cambió campo por campo ("total: $25.000 →
      $30.000") en lugar del JSON crudo.
- [ ] **Seguimiento de un pedido.** Desde un pedido, ver todo lo que le pasó —creado, editado,
      confirmado, cobrado, avisado, eliminado— en una línea de tiempo. El filtro por ID de entidad ya
      lo permite; falta llegar a él desde la ficha.
- [ ] **Una pasada de huecos.** Recorrer cada mutación del sistema contra las acciones auditadas.
      Candidatas conocidas: alta y baja de fondos de etiqueta, el vaciado de datos de prueba (un
      resumen de lo borrado) y la importación de pedidos (un evento por importación con cuántos
      entraron y cuántos fallaron, además de los de cada pedido).
- [ ] Decidir si el registro tiene retención o crece para siempre.

## Pedidos que llegan por email

- [x] Pegar los emails del formulario del sitio en el diálogo de importación: se lee celular,
      dirección, barrio, cantidades y mensaje; se reconoce al cliente por celular argentino o email;
      se empareja cada variedad con el menú; y se avisa si el cliente ya tiene un pedido igual.
- [x] Los formularios todo en cero se separan como consultas, con enlace a WhatsApp, y no se importan.
- [x] Corregido: los pedidos importados de una planilla tenían un origen que la API no sabía leer, y
      hacían fallar con un 500 la pantalla de Pedidos entera.
- [x] Corregido: los nombres parecidos no encontraban a la misma persona con y sin segundo nombre.
- [x] **Recibir los emails sin pegarlos.** Análisis en `docs/12-development/INBOUND_LISTENERS_PLAN.md`:
      sin servidor, con un Google Apps Script en la cuenta que manda los mails a un endpoint firmado,
      y una bandeja de "Pedidos entrantes" para revisarlos.
- [ ] Crear el domicilio del cliente a partir de la dirección y el barrio del email, con su zona.
      Hoy el pedido lleva la dirección como texto y la zona se asigna desde el CRM.
- [ ] Mapear la ciudad del asunto ("Capital Federal") a una ciudad del sistema, para avisar cuando
      un pedido llega con una ciudad distinta de la que está elegida arriba. Hoy sólo se muestra.

## Sanitizador de direcciones

Plan completo en `docs/03-features/ADDRESS_SANITIZER_PLAN.md`.

- [x] Fase 1: control previo en rutas con la lista de pedidos del día sin ubicación y botón para
      ubicarlos. Antes quedaban afuera de la ruta sin avisar.
- [x] Fase 2: normalizador con IA (texto estructurado, nunca coordenadas) + geocodificador, con
      botón "Ubicar" en el detalle del pedido y creación del domicilio a partir del pedido.
- [x] Fase 3: ubicar en lote (ya desde la fase 1) y ajustes por ciudad: IA sí/no, aceptar sola,
      umbral, radio y referencia de la ciudad. El orden de procedimientos no es reordenable (hay un
      solo geocodificador).
- [x] Fase 4: ubicar al importar pedidos; métricas de acierto y de uso de la IA.
- [ ] Un segundo geocodificador (OpenStreetMap u otro) para que el orden de procedimientos sea
      configurable de verdad; medirlo antes con direcciones reales.

## Carga de datos

Plan completo en `docs/08-delivery/PLAN_CARGA_DE_DATOS.md`.

- [x] Fase 1: repetir el pedido anterior del cliente, pegar el mensaje de WhatsApp, elegir cliente
      con teclado y buscarlo por teléfono escrito como sea, guardar y confirmar en un paso.
- [ ] Revisar teléfonos ya guardados con la clave vieja: los que se cargaron en formato local con
      el 15 pueden haber quedado con un número equivocado.
- [ ] Fase 2: aviso de cliente duplicado al crearlo, ubicar la dirección al guardar, validación en
      el campo, precios precargados y autocompletar platos en el menú semanal.
- [ ] Fase 3: importación sin pegar, corrección en la vista previa, domicilio con zona desde el email.

## Etiquetas de cocina

Detalle en `docs/03-features/LABELS_AND_QR.md`.

- [x] Una por plato sin cliente, platos intercalados, 24 por hoja (3 × 8), diseño de la hoja de
      producción, abreviatura por variedad, fecha de elaboración, tamaño opcional, Intuitivo con
      nombre opcional.
- [ ] Calibrar márgenes y separación con la matriz de Illustrator de la hoja actual.
- [ ] Cargar las abreviaturas del período actual (editar el menú publicado).

## Pedidos: día de reparto y franja horaria (2026-10-19)

- [x] Dos campos de texto libre en el pedido, pedidos por los operadores: "Día de reparto" y "Franja horaria". Se cargan en la toma de pedidos, se editan en la ficha (también con el pedido listo) y se ven en la ficha y en la vista rápida. No reemplazan la fecha de entrega ni la ventana del domicilio. Migración 0066.

## Pedidos en el teléfono (2026-10-19)

- [x] Tarjeta compacta: el menú "⋯" va arriba, al lado del estado, con el paso que sigue primero; se sacó la fila de botones del pie.
- [x] "Marcar listo" deja de ser botón (en teléfono y escritorio): va al "⋯". Para todos juntos sigue "Marcar listos por zona".
- [x] Vista "Tarjetas / Columnas" en el teléfono (`DataTable` con `narrowViewKey`): la tabla de escritorio compacta, con scroll de costado, cliente fijo, orden por encabezado y el mismo selector de columnas. Se recuerda por navegador. Desde 2026-10-30 el selector son dos íconos (cuadritos / grilla) en una cápsula, con el elegido resaltado.

## Domicilio en dos líneas (2026-10-19)

- [x] Línea 1 (calle, número, ciudad: lo único que se geocodifica) y línea 2 (piso, depto, timbre, barrio, detalles). En el pedido: `orders.delivery_address_line2` (migración 0067). En el domicilio del cliente se reusa `customer_addresses.unit`, que pasa de "Unidad / piso" (80) a la línea 2 entera (300).
- [x] Toma de pedidos, ficha, vista rápida, columna Domicilio, alta de cliente y de domicilio, formulario del sitio, Mi cuenta, hoja de reparto y Rutas muestran o piden la línea 2. Al elegir un domicilio, la línea 2 viene de él salvo que se escriba otra.
- [x] Probado: el buscador recibe sólo la línea 1.
- [ ] Separar las direcciones viejas que tienen todo mezclado en la línea 1 (con el normalizador de IA, que ya distingue la unidad, como sugerencia que confirma una persona).
- [ ] Importación de pedidos por email: mandar el barrio y el piso del formulario a la línea 2.

## Cocina más simple (2026-10-19)

- [x] Planilla de cocina con el formato del cliente: hoja "Pedido", primera al descargar. Un renglón por menú y tamaño en mayúsculas (sin "Menú"), un renglón en blanco entre menús, los Intuitivos como un menú más, cinco columnas (plato 1 = lunes … plato 5 = viernes) con las porciones, y el total de porciones (fórmula) abajo a la derecha. Suma pedidos y stock.
- [x] Snapshots: se guarda el consolidado cada vez que se exporta (planilla, imprimir, WhatsApp), si la persona tiene `production.generate`. Se fue la sección "Snapshots" y los botones de parcial y final.
- [x] El consolidado se calcula solo al elegir período o reparto (se fue "Generar salida").
- [x] Cabecera en dos renglones: período y reparto; después Descargar planilla (principal), Imprimir, Copiar para WhatsApp, Etiquetas y, separado, Cerrar período. En el teléfono, de a dos.
- [x] "Stock para el cierre" con − y + por menú (sin Intuitivos), guardado en cada toque. Se fueron "Informar producción real" y la tabla de excedente de la pantalla (el backend sigue).
- [x] Estilos de la hoja "Pedido" (encabezado gris con letra blanca, última columna del encabezado en negro, menús sobre gris claro, bordes finos): la planilla de producción se escribe con `xlsx-js-style` 1.2.0 (el mismo SheetJS con estilos), importado por defecto porque es CommonJS.
- [ ] Porciones distintas por plato (cuando alguien pide sin un plato): hoy las cinco columnas salen iguales.

## Platos con menú de origen y "Por cobrar" (DISH_IDENTITY_AND_DEBTORS_PLAN.md, 2026-10-20)

- [x] Fase 1: origen del plato en el Intuitivo (`source_menu_item_id`, `source_family_snapshot`), pedidos viejos completados sólo si no hay ambigüedad, servidor que acepta ids, selector agrupado por menú, origen visible en la ficha y en cocina.
- [x] Fase 2: hoja "Pedido" con el Intuitivo desarmado en los renglones de sus menús, y "Platos a preparar" por plato y menú.
- [ ] Fase 3: etiquetas con el origen (el formulario del sitio ya elige con menú; el importador y la IA mandan nombres y se ubican si no hay ambigüedad).
- [x] Fase 4: sección "Por cobrar" (vista sobre pedidos de períodos cerrados sin cobrar), detalle por cliente, cobrar desde ahí, aviso por WhatsApp, línea en la ficha del cliente y alerta del tablero.

## La dirección del pedido queda en la ficha del cliente (2026-10-20)

- [x] Corregido: la dirección escrita al cargar un pedido quedaba sólo en el pedido, y el cliente sin domicilio en su ficha (visto en Córdoba, que no tenía zonas). Ahora, al guardar el pedido, si el cliente ya tiene esa dirección se usa y, si no, se crea su domicilio con la zona elegida en el formulario (selector "Zona del domicilio", sólo si la ciudad tiene más de una) o con la única de la ciudad. El primero del cliente es su principal. El pedido va a la dirección escrita y no a la principal. Sin zona posible, se guarda como antes. La zona tiene que ser de la ciudad del pedido.
- [x] Para los pedidos viejos: `packages/db/scripts/addresses-from-orders.sql` (editor de Neon, vista previa y bloque BEGIN … COMMIT). Toma las ciudades con exactamente una zona activa.
- [x] Mover clientes y pedidos entre ciudades (hecho el 2026-10-21: `POST /api/v1/orders/:id/site` y `POST /api/v1/customers/:id/site`, con `preview` para ver qué cambia sin guardar; botones "Mover a otra ciudad" en la ficha del pedido y "Cambiar de ciudad" en la del cliente; si la ciudad destino no ofrece una variedad del pedido, no lo mueve y dice cuál. Decisiones del 2026-10-20: lo pueden hacer los operadores; mover un cliente mueve al instante sus pedidos en borrador, confirmados y listos; número de pedido nuevo con el prefijo de la ciudad; precio y día de reparto se concilian solos; variedades sólo si hace falta; los datos no se corrigen solos; el cliente reemplaza su ciudad).
- [ ] "Por cobrar": alerta en el tablero ("12 clientes con pagos pendientes, $ 480.000").
- [x] Atajo `pnpm db:seed-help` en la raíz (existía sólo dentro de `packages/db`).

## Chat interno (2026-10-21)

- [x] Corregido: tocar una conversación en el panel de Mensajes no hacía nada. El fondo invisible que cerraba el panel al tocar afuera se montaba por encima del panel y se quedaba con el clic. Ahora el panel se cierra escuchando el toque fuera de él (y con Escape), sin una capa encima.
- [x] Quien ya tiene conversación directa no se repite en Contactos (panel y pantalla completa).
- [x] Cada conversación muestra la foto de perfil en círculo, con su estado.
- [x] El cliente STOCK no genera deuda ("Por cobrar" ni la ficha) ni cuenta en Estadísticas (2026-10-21). Mismo criterio que el script de conversión: un cliente llamado "STOCK".

## Arreglos del 2026-10-22 (FIXES_2026_10_22_PLAN.md)

- [x] D: hoja "Conciliado" con el formato del cliente (menús en el orden del menú, 400 antes que 250, stock sumado, Intuitivos por nombre y tamaño, TOTAL).
- [x] B: elegir la fecha de entrega al crear un pedido en la computadora ("Otra fecha" o calendario).
- [x] C: "NUEVO" en el cliente (calculado: a lo sumo un pedido no cancelado; `customers.is_new_override` para forzarlo a mano, migración 0069), interruptor "Cliente nuevo" en la ficha y columna "¿Es nuevo?" en Pedidos.
- [x] A: sobrante del período anterior a la venta en el período nuevo (`production_stock.origin` = `carry_over`, migración 0070). Se pasa al cerrar o se carga a mano en Cocina; se vende y no se cocina.
- [x] Ruta diaria: total en efectivo y transferencia, y transferencias cobradas y no cobradas (en Rutas y en la hoja de quien reparte). El efectivo sale del catálogo de medios de pago (`is_cash`); cobrada = tilde de Cobrado o pago registrado.
- [x] Informe del período (Cocina → "Informe del período", Excel): Resumen (pedidos, total vendido, cobrado, pendiente, efectivo y transferencia, cancelados, clientes que deben), Por medio de pago (con cobrado y pendiente), Por cobrar (cada pedido impago con cliente y contacto) y Stock (de la semana, sobrante recibido, vendido, pasó al siguiente, baja). Sin el cliente STOCK. `GET /api/v1/production/:cycleId/report` (`production.read` + `payments.read`).

## Zonas (2026-10-22)

- [x] Eliminar una zona desactivada: sus domicilios, pedidos, zona preferida de clientes y barrios pasan a una zona activa de la misma operación (`DELETE /api/v1/zones/:id` con `moveToZoneId`, `zones.manage`). Para unificar zonas.
- [x] Corregido: la lista de operaciones decía "0 zonas" en todas (la subconsulta comparaba contra la columna de la zona y no de la operación).

## Etiquetas 2.0 (LABELS_2_PLAN.md, 2026-10-22)

- [x] Motor nuevo en `@verdeo/labels` (`production.ts`): papel Husares H34124 fijo, etiqueta de plato (horizontal) y de menú (vertical) copiadas del PDF de producción, con sus logos.
- [x] La tanda: grupos de platos (por variedad) y de menús (por variedad y tamaño; Intuitivos por cliente), sueltas con cantidad, mezcla de las dos series y "Empezar en la posición".
- [x] Lo impreso queda anotado (`label_prints`, migración 0071); si la tanda repite etiquetas, se avisa y se elige imprimir sólo las nuevas o todas.
- [x] El generador anterior queda archivado en `/app/etiquetas/clasico`.
- [x] Correcciones tras la primera prueba: sin el "*" del principio ni el "(k)"/"(v)" del final, acompañamiento con mayúscula, "ANTIAGE" (no "AGE"), letra regular, ícono y pie fijos y texto centrado como en producción, y el plato a 11,7 / 10,75 / 9,8 pt según entre.

## Jerarquía de orden de los productos (PRODUCT_ORDER.md, 2026-10-22)

- [x] Norma central: Keto 400, Keto 250, Antiage, Real, Vegetariano, Intuitivos (tamaño mayor primero). Una sola implementación en `@verdeo/orders` (`product-order.ts`), aplicada a menús, cocina, stock, sobrante, planillas, Excel de pedidos y etiquetas.

## Etiquetas 2.0 — 2026-10-23

- [x] Las verticales se corrían al imprimir (texto girado fuera de su etiqueta): rehechas con `writing-mode`.
- [x] − / + en cada grupo de la tanda.

## Informe de pedidos del período (ORDERS_PERIOD_REPORT_PLAN.md)

- [x] Informe "Pedidos" + "Reparto" en Excel: un renglón por vianda, por día y en el orden de la ruta, con tiempo estimado de ruta, colores por norma (nuevo, cobrado, franja), totales por día y resumen en la jerarquía de productos. Botón "Informe del período" en Pedidos.

## Novedades en el feed y revisión de UI (2026-10-23)

- [x] Novedades del sistema preparadas para el feed (`packages/db/src/release-notes.ts`) y `pnpm db:seed-release-notes` para publicarlas (no repite las ya publicadas). El feed firma "Verdeo" las novedades sin autor.
- [x] Revisión de UI en local (40 pantallas, escritorio y teléfono): sin errores de consola ni desbordes de página. Corregido: la barra de filtros de Pedidos encimaba botones en escritorio (la grilla aplastaba la columna izquierda; ahora es una fila que se parte). Corregido: el resumen de variedades de cada reparto (Rutas) iba por cantidad; ahora en la jerarquía de productos.

## Planilla de pedidos y stock por lotes (2026-10-23)

- [x] Informe del período, con la planilla real: Intuitivo en negrita cursiva con el menú de cada plato en su día, nuevos rosado (mail) / oscuro (WhatsApp), venta coloreada sólo en transferencias, columna "Pago".
- [x] Stock por lotes (STOCK_LOTS_PLAN.md): lo que sobra al cerrar pasa solo a lotes por período y ciudad (vencen al mes), se vende desde Nuevo pedido con el nombre del período, no se cocina ni se etiqueta, y se corrige en Cocina. Migración 0073.

## El número de pedido es un control interno (2026-10-23)

- [x] El identificador público ("CBA-00004") deja de salir en las salidas: planillas de cocina (pantalla, Excel, WhatsApp, impresión), etiquetas (también la versión anterior), hoja del repartidor, rutas (pantalla y CSV), Excel y CSV de pedidos, informe del período, informe de cierre, avisos y mensajes que se copian a clientes. En las pantallas internas se reemplaza por el nombre del cliente o la fecha. Sigue en la base, en la búsqueda y en la auditoría (el log).
- [ ] A confirmar: lo que ve el cliente (la confirmación de la web, el seguimiento, que funciona con el número, y la variable {{ pedido.numero }} de los mensajes).
- [x] Confirmación al cambiar el cobro (pendiente → cobrado y al revés), en Pedidos y en Por cobrar, con el cliente y el monto.

## Etiquetas 2.0 — 2026-10-24

- [x] Sin etiqueta vertical "Intuitivo"; cada plato de un Intuitivo con el menú del que viene en el pie, y un grupo por pedido.
- [x] La tanda arranca sin nada tildado.
- [x] "×" en la vista previa para sacar una etiqueta de la tanda.

## Repartos y chat (2026-10-24)

- [x] En Nuevo pedido, "Día de reparto" pasa a llamarse "Zona" (se usa para anotar la zona que guía el armado; el dato es el mismo).
- [x] La franja horaria del pedido aparece en cada parada de la ruta y en la hoja del repartidor (si el pedido no tiene, la del domicilio).
- [x] Chat: sin conversaciones con uno mismo; las que se quedan sin otros participantes se pueden archivar.
- [x] Salida y llegada de las rutas: por defecto por ciudad (Ajustes → Reparto) y cambiables en cada ruta, con hora de salida; tiempos estimados por parada y total; el recorrido en Google Maps (en tramos de nueve paradas). Migración 0072.
- [ ] Paso 2 (si hace falta): tiempos reales con el servicio de rutas de Google.

## Direcciones y stock (2026-10-24)

- [x] Separar el detalle de las direcciones: los pedidos importados (mail y planilla) traen la línea 2; los domicilios viejos se separan con revisión en Conciliar ubicaciones.
- [x] La ciudad de un lote de stock se cambia desde Cocina.
- [x] Etiquetas en el teléfono: el texto no se agranda solo (lo partía letra por letra, en vertical).
- [x] Etiquetas en la app de Android: nombres partidos entre palabras y ajuste que achica hasta que entren, aunque el sistema agrande la letra.

## Informe y hojas de ruta (2026-10-25)

- [x] Etiquetas: platos contados por tamaño (no el doble); verticales sólo Keto 400 e Intuitivos (resto en "Mostrar más"); casilla para llenar la última hoja con Keto 400.
- [x] Informe del período: hoja Pedidos sin horario/ruta/zona/notas y colores de nuevos por canal; hoja Reparto con un renglón por bulto, transferencias en $0, total en efectivo y resumen por reparto; sin "$" en tamaños.
- [x] Hojas de ruta: franja horaria en la card, reordenar arrastrando, salida y llegada en el mapa.
- [x] Quien reparte sólo ve los montos en efectivo (hoja, WhatsApp, CSV); el mensaje de WhatsApp lleva la línea 2 de la dirección.
- [x] Cancelado después de cocinarse como stock vendible: el diálogo pregunta; lo fijo se suma al lote de su variedad, el Intuitivo abre un lote con sus platos; reactivar lo devuelve. Migración 0074.

## Pedidos, clientes y temporada (2026-10-27)

- [x] Pedidos: el selector de período siempre a la vista (computadora y teléfono); al elegir uno anterior el estado pasa a "Todos", porque "Pendientes de acción" lo dejaba vacío.
- [x] "Es cliente nuevo" al crear un cliente en Nuevo pedido y al importar pedidos (mail y planilla); los contactos de planilla entran como no nuevos salvo "Son clientes nuevos".
- [x] "Es cliente nuevo" en Nuevo pedido arranca sin tildar; cada persona elige en Ajustes → Apariencia ("Al tomar pedidos") si viene tildado (`user_appearance.new_customer_is_new`, migración 0075).
- [x] Tema Halloween ([HALLOWEEN_THEME_PLAN.md](../03-features/HALLOWEEN_THEME_PLAN.md)): sólo el panel, solo del 24-oct al 1-nov, se saca en Apariencia; telarañas en las esquinas y calabaza.

## Menús (2026-10-28)

- [x] Corregir una semana publicada llega a las ciudades: guardar la general refresca sus copias (también las publicadas) sin pisar lo personalizado; con dos semanas publicadas que se pisan, gana la más reciente.

## Etiquetas, pedidos y stock (2026-10-27)

- [x] Etiquetas: "Descargar PDF" arma el PDF en el navegador (html-to-image + jsPDF, 300 ppp, A4 exacto, tipografías incrustadas) y anota la tanda como impresa; instrucciones de impresión debajo.
- [x] Nuevo pedido en pantalla ancha (≥1360px): dos columnas, cliente a la izquierda y pedido a la derecha, cuatro campos por fila.
- [x] Stock: cargar a mano un Intuitivo de un período anterior (hasta 4 meses; platos validados contra el menú de ese período; nombre en `stock_lots.notes`; vence un mes después de cargarlo). `POST /api/v1/stock-lots`.

## Pedido cancelado ya cocinado (2026-10-28) — [caso](../07-operations/CASO_2026-10-28_CANCELADO_YA_COCINADO.md)

- [x] Planillas de cocina anotadas con sus pedidos (`kitchen_sheets`, migración 0076): cambios desde la última en Cocina y volver a bajar cada una tal como salió.
- [x] Cancelar un pedido que ya salió en la planilla: aviso y "Pasar a stock" tildado de entrada.
- [x] Pasar a stock un pedido ya cancelado (`POST /api/v1/orders/:id/to-stock`).
- [x] Informe del período: hoja "Cancelados" (salió en la planilla / pasó a stock) y cancelados ya cocinados en el resumen.
- [x] Pie de la lista de Pedidos con los totales de todo lo filtrado (`summary` en `GET /api/v1/orders`).
- [x] "Editar" en el menú ⋯ de la lista de Pedidos: abre la ficha en edición (`?editar=1`).

## Estadísticas renovadas (2026-10-28) — [plan](../03-features/STATS_REDESIGN_PLAN.md)

- [x] Análisis contable por período y ciudad (`GET /api/v1/stats/periods`, `?format=xlsx`), mismo criterio que el informe del período.
- [x] Carrusel de gráficos: ingresos por día, ventas por período, cobrado/por cobrar, clientes nuevos/recurrentes, mezcla de menús.
- [x] Feed "Lo que pasó" (`GET /api/v1/stats/events`), calculado al momento.
- [x] Comparación automática con el período anterior cuando hay rango de fechas.
- [ ] Feed, etapa 2: guardar los eventos (historial), marcarlos como vistos y avisar los importantes.
- [ ] Margen: cargar costos por vianda o gastos por período.

## Nuevo pedido ordenado (2026-10-29)

- [x] Formulario en cuatro bloques (Cliente, Entrega, Pedido, Pago y origen); dos columnas desde 1200px (quién y dónde | qué y cómo), cada bloque acomoda sus campos según su ancho.
- [x] Período con botones (radio) cuando hay dos publicados: el desplegable cortaba el nombre.
- [x] Etiqueta NUEVO al lado del nombre del cliente en la lista de Pedidos.
- [x] Pantalla ancha: desde 1700px el contenido del panel se abre hasta 2400px (antes, tope de 1400px); el inicio mantiene el tope. El formulario de Nuevo pedido ya no tiene ancho máximo propio.
- [x] Etiquetas: el PDF lleva `PrintScaling=None` (una impresión salió al ~95 %).
- [x] Etiquetas: "Ajuste de la impresora" por equipo (mover X/Y en mm, estirar X/Y en %) con hoja de prueba de 24 recuadros; aun a tamaño real, una impresión salió corrida en las filas de arriba. El archivo de Illustrator de producción (210 × 294 mm, filas cada 33,75 mm, íconos corridos a mano en filas con mucho texto) confirma que se corregía a mano por impresora.
- [x] Etiquetas: nombres de plato muy largos en tres renglones a 10–9,5 pt (antes, dos renglones hasta 6 pt).
- [x] Columnas elegidas y vista tarjetas/tabla: ya se guardaban por dispositivo (`localStorage`), verificado.
