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
