# Calendario 2 (plan, 2026-11-06)

Pedido: volver a tener un calendario de verdad, que funcione en todos los tamaños de pantalla y se pueda ver por día, por semana o por mes. Tiene que juntar los recordatorios del feed, enlazar al período de cada semana y sumar lo que el sistema ya sabe. Se puede usar una librería prearmada.

Este documento es el plan. No hay código todavía.

## 1. Lo que hay hoy

- **`/app/calendario`** (`apps/web/src/routes/CalendarPage.tsx`) es una **agenda**: una lista de días con lo que tiene cada uno, de 2 semanas a 3 meses. Se dejó así a propósito: una grilla de mes gasta la mayor parte del lugar en días vacíos.
- Muestra tres cosas:
  - **Recordatorios** (`calendar_reminders`): personales o del equipo, por día y sin hora, con Hecho/Reabrir y Borrar. Uno del equipo puede ser de una ciudad.
  - **Cierre de período** y **parcial de cocina**: salen de `sales_cycles` al leer, no se copian. No tienen acciones.
- API:
  - `GET /api/v1/calendar?from&to&operatingSiteId` arma la lista (`postgres-calendar-service.ts`), siempre filtrando los personales al autor.
  - `POST`, `PATCH done` y `DELETE` de recordatorios. Permiso `calendar.use`.
- **Feed del tablero** (`lib/feedCards.ts`): las tarjetas "agenda" muestran hoy y mañana con "Hecho" y "Mañana". Ojo: **"Hecho" sólo esconde la tarjeta** (`PUT /api/v1/feed/cards`); el recordatorio queda sin hacer en el calendario. Es una incoherencia que este plan corrige.
- **Widget "Recordatorios"** del tablero (`dashboard-widgets.tsx`): los próximos tres.

## 2. Objetivos

1. **Cuatro vistas** con un selector: **Día · Semana · Mes · Agenda**. En celular se usan las cuatro; ninguna con scroll horizontal.
2. **Una sola fuente** para el calendario, el feed y el widget: marcar "Hecho" en cualquiera lo marca en todos.
3. **Cada semana enlazada a su período**: tocar la franja de la semana abre el período (menú) y la cocina de ese período.
4. **Sumar lo que el sistema ya sabe**: repartos, pedidos a entregar por día, feriados. Todo filtrado por la ciudad elegida arriba y por permiso.
5. **Rápido**: la librería se carga sólo al entrar al calendario, sin pesar en el resto del panel.

## 3. Librería

| Opción                                     | Licencia                                                     | A favor                                                                                                                                                       | En contra                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **FullCalendar 7** (`@fullcalendar/react`) | MIT (vistas día, semana, mes, lista, multimes e interacción) | La más madura. Vistas `dayGrid`, `timeGrid`, `list` y `multiMonth` en un paquete. Idioma `es`. Arrastrar y soltar. Temas por variables CSS (v7). React 17–19. | Pesa (estimado 90–120 kB gz con las vistas; a medir). Requiere `temporal-polyfill`. La v7 es reciente (7.0.0 de junio 2026). |
| Schedule-X 4 (`@schedule-x/react`)         | MIT (algunos complementos son pagos)                         | Pensada para celular (vista "mes-agenda"), liviana, moderna.                                                                                                  | Menos usada. Vistas y complementos útiles repartidos entre gratis y pagos. Tematizar con nuestros 9 temas es más trabajo.    |
| react-big-calendar 1.20                    | MIT                                                          | Conocida.                                                                                                                                                     | Necesita un "localizer" (date-fns/moment). Estética vieja. Floja en celular.                                                 |
| Hecha a mano (como la agenda actual)       | —                                                            | Cero dependencias. Control total.                                                                                                                             | Mes y semana con arrastrar, teclado y accesibilidad son mucho trabajo y mucho para mantener.                                 |

**Recomendación: FullCalendar 7.1.3, versión fija.** La 7.1.4 salió el 2026-11-04; se espera dos semanas antes de usar una versión nueva. Razones:

- Trae las cuatro vistas que pedimos sin pagar nada.
- Se tematiza con variables CSS, que es como están hechos nuestros temas.
- Se puede cargar aparte con `React.lazy`, sólo en `/app/calendario`.

Si en la fase 0 el peso o el tema no convencen, el plan B es Schedule-X. Las fases 1–4 no cambian, porque el armado de los eventos (sección 6) no depende de la librería.

## 4. Vistas y tamaños de pantalla

| Vista      | Escritorio (≥ 1024 px)                                          | Tablet (768–1023 px)                         | Celular (< 768 px)                                                             |
| ---------- | --------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| **Día**    | `listDay` + resumen del día arriba (pedidos, repartos, período) | igual                                        | igual, a lo ancho                                                              |
| **Semana** | `dayGridWeek`: 7 columnas, la franja del período arriba         | `dayGridWeek` con nombres cortos (lun, mar…) | `listWeek`: un día debajo del otro; los días vacíos se muestran en una línea   |
| **Mes**    | `dayGridMonth`: hasta 3 eventos por día, después "+N"           | igual, máx. 2 por día                        | mini-mes con un punto de color por tipo; tocar un día abre la vista Día debajo |
| **Agenda** | `list` de 2 semanas a 3 meses (la de hoy)                       | igual                                        | igual                                                                          |

Detalles comunes:

- **Vista por defecto:** Semana en escritorio y tablet, Agenda en celular. Se recuerda la última que eligió cada persona (`localStorage`, con `try/catch`).
- **El estado vive en la URL:** `?vista=semana&fecha=2026-11-09`. Así el feed, el widget y la ayuda pueden enlazar a un día exacto, y "atrás" del navegador funciona.
- **Barra del calendario:** ‹ Hoy › y el título ("9–15 de noviembre"). Debajo, el selector de vista y los filtros por capa. Todos los botones de 40 px de alto mínimo (como pide la auditoría).
- **Semana de lunes a domingo** (`firstDay: 1`), idioma `es`, fechas en hora de la operación (`todayInOperation()`), igual que la agenda actual.
- **Sin vista por hora** (`timeGrid`) por ahora: ningún dato tiene hora. Ver la fase 4.

**"Ordenable diaria o semanalmente"** se resuelve con el selector Día/Semana. Además, dentro de un día el orden es fijo y por importancia:

1. Feriado.
2. Cierre de período y parcial de cocina.
3. Repartos.
4. Pedidos a entregar.
5. Recordatorios del equipo.
6. Recordatorios personales.

Los hechos van al final, tachados.

## 5. Qué se muestra (capas)

Cada capa tiene un chip para prenderla o apagarla. Se aplican la ciudad elegida arriba y los permisos; el servidor no manda lo que la persona no puede ver.

| Capa                           | Fuente                                                           | Se ve como                                                     | Al tocar                                              | Permiso                                 |
| ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| **Recordatorios**              | `calendar_reminders`                                             | evento con casilla Hecho; "· sólo vos" si es personal          | panel con detalle, Hecho, mover de fecha, Borrar      | `calendar.use`                          |
| **Período de la semana**       | `sales_cycles` (`openAt` → `closeAt`) + el menú del período      | franja de fondo que cruza los días, con el alias ("Semana 45") | abre el período (`/app/menus/:id/editar`) o la cocina | `production.read`                       |
| **Parcial de cocina / cierre** | `sales_cycles` (ya existe)                                       | evento destacado                                               | abre la cocina del período                            | `calendar.use`                          |
| **Repartos**                   | `delivery_runs` (ciudad, fecha, nombre, franja horaria, estado)  | "Reparto mañana · 11 a 14 h · 3 hojas"                         | abre Rutas en esa fecha                               | `routes.read` (o el que hoy abre Rutas) |
| **Pedidos a entregar**         | `orders.delivery_date` agrupado por día y ciudad, sin cancelados | "18 pedidos · 90 viandas"                                      | abre Pedidos filtrado por esa fecha                   | `orders.read`                           |
| **Feriados**                   | lista fija de feriados nacionales en el repo, por año            | franja suave + nombre                                          | nada                                                  | todos                                   |

Ideas para más adelante, no en este plan:

- Encuestas con fecha de cierre (sólo si tienen fecha).
- Cumpleaños de clientes: no hay dato.
- Cobros por vencer: el sistema no tiene vencimientos.
- Temporadas de tema (Halloween, Verano).

**Feriados:** van como lista en el código (`packages/contracts` o `apps/api/src/integrations/holidays.ts`), no como consulta a un servicio externo en cada pedido. No depende de terceros, y el reparto rara vez cambia por un feriado puente decidido a último momento. Se carga el año en curso y el siguiente. Un aviso en Estado del sistema avisa cuando falta el año que viene.

## 6. API

**Endpoint nuevo:** `GET /api/v1/calendar/overview?from&to&operatingSiteId&layers=reminders,cycles,runs,orders,holidays`.

- Devuelve **eventos ya armados** con una forma única, igual para cualquier librería:

  ```ts
  {
    id: string;                 // "reminder:<uuid>", "cycle:<uuid>", "run:<uuid>", "orders:<site>:<day>", "holiday:<day>"
    kind: 'reminder' | 'cycle_span' | 'cycle_close' | 'kitchen_cutoff' | 'delivery_run' | 'deliveries' | 'holiday';
    start: string;              // día ISO; para la franja del período, el primer día
    end?: string;               // fin exclusivo, sólo para franjas de varios días
    title: string;
    subtitle?: string | null;   // "11 a 14 h · 3 hojas", "90 viandas"
    href?: string | null;       // a dónde lleva tocarlo
    operatingSiteName?: string | null;
    scope?: 'personal' | 'general';
    done?: boolean;
    count?: number | null;
  }
  ```

- **Capas y permisos se filtran en el servidor.** Una capa pedida sin permiso no da error: no viene.
- **Rango máximo de 100 días** (un mes con los días de los costados entra con margen). Fuera de eso, 400.
- **La ciudad** usa `resolveSiteQuery`, igual que hoy. "Todas las ciudades" suma los conteos y muestra la ciudad en cada evento.
- **`GET /api/v1/calendar` se queda** para el feed y el widget hasta que se pasen al nuevo (fase 3). Después se puede dejar como alias.

**Recordatorios:**

- **Cambiar la fecha:** `PATCH /api/v1/calendar/reminders/:id` acepta `remindOn` además de `done`. Para arrastrar y soltar.
- **Editar título y detalle:** mismo `PATCH`.
- Sólo el autor puede editar un recordatorio personal. Uno del equipo lo edita cualquiera con `calendar.use`, y queda en la auditoría como hoy.

**Sin migraciones en las fases 0–3.** Todo sale de tablas que ya existen.

**Conteo de pedidos:** una consulta `group by delivery_date, operating_site_id` sobre el índice `orders_site_delivery_date_idx`, que ya existe.

## 7. Interacción

- **Tocar un día** (Mes o Semana) abre el **panel del día**. En escritorio es lateral; en celular, una hoja desde abajo. Tiene:
  - el resumen del día;
  - la lista ordenada de eventos;
  - "Agendar recordatorio" con la fecha ya puesta.
- **Arrastrar un recordatorio** a otro día lo mueve, con aviso y "Deshacer". Los eventos del sistema no se arrastran. En celular no se arrastra: se usa "Mover a…" desde el panel.
- **Crear:** el formulario de hoy pasa a un botón "Nuevo recordatorio" que abre el panel. No ocupa la parte de arriba de la pantalla.
- **Teclado:** flechas para moverse entre días (lo trae la librería), Enter abre el panel, `T` vuelve a hoy.
- **Ciudad:** al cambiarla arriba, el calendario recarga.

## 8. Feed y tablero: una sola fuente

- En las tarjetas de agenda del feed, **"Hecho" en un recordatorio lo marca hecho** (`PATCH done`) además de esconder la tarjeta. En un cierre o un parcial sigue siendo sólo esconder.
- **El enlace de cada tarjeta lleva al día exacto:** `/app/calendario?vista=dia&fecha=…`.
- **El widget "Recordatorios"** del tablero enlaza igual, y su "ver todo" abre la vista Semana.
- El feed sigue mostrando sólo hoy y mañana. El calendario es donde se ve más lejos.

## 9. Aspecto

- Las variables CSS de FullCalendar se mapean a las nuestras (`--db-surface`, `--db-text`, `--db-muted`, `--db-accent`, `--db-border-soft`). Así los 9 temas (incluidos los oscuros y los de temporada) funcionan sin CSS por tema.
- **Un color por tipo de evento**, tomado del tema: acento para el período, aviso para cierre y parcial, neutro para recordatorios. Siempre con ícono o texto además del color: un dato nunca se lee sólo por el color.
- Contraste AA (4,5:1) medido en Natural, Halloween y un tema oscuro.
- Bordes, radios y tipografía como las tarjetas del panel. Nada de la estética por defecto de la librería.

## 10. Fases

Cada fase va en su propio commit, con pruebas, Ayuda, novedades y BACKLOG en el mismo commit.

**Fase 0: prueba de la librería (medio día)**

- Instalar `@fullcalendar/react@7.1.3` y `temporal-polyfill`, con versión fija.
- Un componente que la carga aparte (`React.lazy`), con las vistas de Mes y Lista y los datos de hoy.
- Medir:
  - el peso del chunk;
  - que el resto del panel no crezca;
  - el aspecto con 3 temas;
  - que funcione en 375, 768 y 1440 px.
- Decidir: FullCalendar o Schedule-X. No se sube a producción.

**Fase 1: las cuatro vistas con lo que ya hay**

- Endpoint `overview` con las capas de recordatorios, cierres, parciales y la franja del período con enlace.
- Vistas Día, Semana, Mes y Agenda, con el estado en la URL y la vista recordada.
- Panel del día. Crear, Hecho y Borrar como hoy.
- Pruebas:
  - del servicio (capas, permisos, ciudad, rango);
  - de la función que arma los eventos;
  - de la página, con la librería simulada.

**Fase 2: capas nuevas**

- Repartos, pedidos a entregar y feriados, con chips de filtro guardados por persona.

**Fase 3: interacción y una sola fuente**

- Mover recordatorios arrastrando o con "Mover a…", y editarlos.
- Hecho del feed = Hecho del recordatorio.
- Enlaces del feed y del widget al día exacto.
- Se retira la agenda vieja.

**Fase 4 (opcional, con migración en su propio commit antes del código)**

- Hora opcional en los recordatorios. Con eso aparece la vista por hora (`timeGridDay` y `timeGridWeek`).
- Recordatorios que se repiten cada semana ("los lunes, pedir bandejas").
- Aviso del navegador el día del recordatorio, usando los avisos que ya existen.

## 11. Pruebas y verificación

- **API (`app.test.ts` y pruebas del servicio en `packages/db`):**
  - cada capa con y sin permiso;
  - personal ajeno nunca visible;
  - ciudad sí y ciudad no;
  - rango de más de 100 días da 400;
  - un período que cruza el rango.
- **Web:** la función que arma los eventos y su orden dentro del día, y la página con la librería simulada (jsdom no dibuja la grilla).
- **En el navegador, antes de dar cada fase por cerrada:**
  - capturas en 375, 768 y 1440 px;
  - sin scroll horizontal;
  - todo lo tocable de 40 px o más;
  - contraste medido;
  - temas Natural, Halloween y uno oscuro.

## 12. Riesgos y preguntas abiertas

- **Peso de la librería:** se mide en la fase 0. Si pasa de ~150 kB gz, conviene Schedule-X o seguir a mano.
- **FullCalendar 7 es joven:** versión fija y actualizar a propósito, no por rango.
- **Los períodos son de todas las ciudades** (`sales_cycles` no tiene ciudad). La franja es la misma en todas. Si un período no se publicó en una ciudad, ¿se muestra igual? Propuesta: mostrarlo, con "no publicado en esta ciudad" en el panel.
- **Feriados:** ¿sólo nacionales, o también provinciales (Neuquén, Mendoza, Córdoba, Río Negro, CABA)? Propuesta: nacionales primero; los provinciales los agrega cada ciudad como recordatorio del equipo.
- **¿Quién ve "Pedidos a entregar"?** Propuesta: quien tiene `orders.read`. La cocina ve la franja del período y los parciales, pero no los conteos si no tiene ese permiso.
