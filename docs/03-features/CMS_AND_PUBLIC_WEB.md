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
- obtener seguimiento por token/enlace según diseño final.

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
