# Landing, CMS & Customer Portal

## Landing

El index de Verdeo SCA es una landing mobile-first inspirada en la identidad actual de Verdeo.

Bloques:

- hero;
- menú semanal;
- cómo funciona;
- zonas de entrega;
- nosotros;
- CTA pedido;
- contacto;
- login.

## CMS

No construir un WordPress genérico. Usar secciones tipadas.

Entidades:

- Page
- PageSection
- PageRevision
- SiteSetting
- MediaAsset

Tipos iniciales:

- HERO
- TEXT
- IMAGE_TEXT
- WEEKLY_MENU
- CTA
- FAQ
- DELIVERY_ZONES
- CONTACT
- GALLERY
- CUSTOM

Funciones:

- draft;
- preview;
- publish;
- historial/revert;
- orden de secciones;
- assets;
- SEO básico;
- edición asistida por IA.

## Cliente

### Guest

Puede:

- ver menú;
- crear pedido;
- obtener seguimiento por token/enlace según diseño final — **as built**: `/seguimiento`
  (`TrackOrderPage.tsx`) pide número de pedido + el contacto usado al pedir; `publicNumber` es
  secuencial y adivinable, así que exigir también el contacto es lo que evita que sea un agujero de
  enumeración. `POST /api/v1/public/orders/track` devuelve el mismo 404 genérico tanto si el número
  no existe como si el contacto no coincide.

### Autenticado

Permanece en experiencia visual pública y obtiene:

- pedido actual;
- historial;
- seguimiento;
- nuevo pedido;
- "pedir nuevamente" cuando aplique.

No mostrar un dashboard administrativo.

## User vs Customer

`User` = identidad de autenticación.
`Customer` = entidad CRM.

Puede existir Customer sin User.

## As built (Fase 4 — CMS)

Tablas `pages`, `page_revisions`, `media_assets` (migración 0018, additiva). Servicio
`PostgresCmsService`.

- **Snapshot inmutable por revisión, no tabla normalizada por sección.** El contenido de una página
  es un array ordenado de bloques tipados guardado como JSON en `page_revisions.sections` — nunca se
  edita una revisión existente, cada guardado crea una fila nueva. Publicar/revertir es solo mover
  `pages.published_revision_id` a una revisión ya existente; revertir no necesita código separado de
  publicar. "Borrador" es siempre la última revisión de una página.
- **11 tipos de sección** (`HERO`, `TEXT`, `IMAGE_TEXT`, `STEPS`, `WEEKLY_MENU`, `CTA`, `FAQ`,
  `DELIVERY_ZONES`, `CONTACT`, `GALLERY`, `CUSTOM`) como unión discriminada de Zod. `WEEKLY_MENU` y
  `DELIVERY_ZONES` no guardan contenido propio — son marcadores que la landing resuelve en vivo
  contra `/api/v1/public/menu/current` y `/api/v1/public/operating-sites`, para no duplicar el menú
  o la geografía reales como una segunda fuente de verdad.
- **La landing nunca queda en blanco**: si nadie publicó una página `"home"`, `HomePage()` renderiza
  el contenido original hardcodeado (`DefaultHomeContent`) como fallback.
- Editor completo en `/app/contenidos` (`CmsPagesAdminPage.tsx`): lista de páginas, editor de
  secciones con reordenar/quitar, historial de revisiones con publicar en un clic, upload de
  imágenes vía Vercel Blob.
- Permisos `cms.read`/`cms.edit`/`cms.publish` (ya reservados en el catálogo antes de esta
  implementación).

**Diferido explícitamente**: SEO básico, edición asistida por IA (ver Fase 6 más abajo — la tarea
`rewrite_message` puede usarse manualmente sobre el copy, pero no hay integración directa
editor↔IA todavía).

## Pie público (as built)

La cabecera esconde "Mi cuenta" y "Seguir mi pedido" por debajo de 640px y deja sólo "Hacer un
pedido". En un teléfono eso dejaba sin acceso a **cualquier** cuenta, de cliente o de equipo. Y en
la PWA instalada no hay barra de direcciones: si un enlace no está en la página, la pantalla no
existe.

Los enlaces de cliente viven en el **menú de la barra**, que aparece por debajo de 1024px y agrupa
las secciones de la landing y lo de la cuenta. "Hacer un pedido" queda fuera del menú: es la acción
que la página existe para provocar, y esconderla detrás de un toque extra sería ahorrar en lo único
que no conviene. El panel se ancla a la cabecera y no al botón — con la barra en dos líneas el botón
no queda contra el borde y el panel se salía de la pantalla.

El **pie** tiene un solo trabajo: **"Acceso del equipo"** hacia `/login`, con `rel="nofollow"` para
que no lo indexen los buscadores. No lleva margen superior: con separación quedaba una franja blanca
entre la última sección de la landing y el pie, que se lee como un pedazo de página que falta.

**No está escondido detrás de un gesto secreto**, y es deliberado. Un triple toque en el logo sería
indescubrible justo para quien lo necesita, imposible de usar con lector de pantalla, y no agregaría
seguridad: lo que protege `/login` es la contraseña, no que cueste encontrarlo. La discreción es de
ubicación y de peso visual.

### `start_url` de la PWA

Apunta a `/app`, que redirige a `/login` cuando no hay sesión: la app instalada abre en el ingreso
del equipo, que es quien la instala. Si la abre un cliente, el logo de esa pantalla vuelve a la
landing, así que no queda encerrado.

Una PWA instalada **conserva el manifiesto con el que se instaló**. Quien la haya agregado antes de
que `start_url` cambiara sigue abriendo en `/`; hay que desinstalarla y volver a instalarla para que
tome el nuevo.

## El asistente de la landing

Abajo a la derecha, un botón abre un panel con opciones. **No es un chat y no pretende serlo**: no
hay texto libre, no hay modelo de lenguaje, y prometer lo segundo sería peor que no tenerlo. Es un
árbol de opciones que se toca.

Cada opción hace una de cuatro cosas: **responder** (un texto, y opcionalmente un bloque de datos),
**preguntar** (abrir otro juego de opciones), **llevar** (navegar a una página del sitio) o **salir**
(abrir WhatsApp con un mensaje ya escrito). La última es la salida cuando ninguna opción alcanza;
sin ella el visitante queda golpeando contra un menú que no contesta lo que necesita.

**Las respuestas son híbridas, y ahí está el valor.** El texto lo escribe quien configura y dice el
_sentido_; el bloque trae el _dato_ en vivo de la misma fuente que la web pública —menú de la
semana, precios por tamaño, zonas de entrega, medios de pago—. Un texto que enumerara los menús
quedaría escrito y en seis semanas estaría mintiendo; un bloque no se puede desactualizar.

**Pregunta la ciudad** antes de contestar lo que depende de ella, que son tres de las cuatro
respuestas iniciales: el menú se distribuye por ciudad y el precio depende del tamaño y de la ciudad
(ADR-030, ADR-031). Se pregunta una vez y se recuerda por el resto de la visita.

**No guarda conversaciones.** El hilo vive en `sessionStorage` del navegador: sobrevive a un F5
—perder el hilo por recargar es exasperante— y no reaparece una semana después con las respuestas de
otro día. Nada de eso viaja al servidor.

Sí se guarda, aparte, **cuántas veces se tocó cada opción**: un contador agregado, sin sesión, sin
identificador y sin fecha por evento. Contesta "qué le falta a la landing", no "quién la visitó", y
esa pregunta se contesta con un número.

La configuración vive en `assistant_flows` + `assistant_flow_revisions`, el mismo patrón que una
página del CMS: se guarda un borrador y se publica aparte, la landing lee sólo lo publicado, y una
revisión rota se revierte a la anterior. El árbol por defecto se crea la primera vez que se lee el
asistente, no con una migración de datos: una migración que inserta filas hay que repetirla a mano en
cada entorno, y esto es configuración que tiene que existir siempre.

El panel **no se abre solo**. Un panel que se despliega sin que nadie lo pida tapa la landing justo
cuando la persona está leyendo, y en un teléfono la tapa entera.
