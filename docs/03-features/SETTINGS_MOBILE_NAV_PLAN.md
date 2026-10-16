# Panel de control en el teléfono: navegación — plan

Pedido del usuario (2026-10-16): la barra de menú del Panel de control en el teléfono es
"terriblemente poco intuitiva". Una alternativa más responsive, visible y moderna.

## Cómo está hoy (visto a 375 px)

- El submenú (`SettingsTabs`) es un `<details>` plegado que se ve como **una pastilla con dos textos**:
  "PANEL DE CONTROL" a la izquierda y el nombre de la sección a la derecha. No tiene flecha, ni
  ícono, ni nada que diga que se toca: parece un título. Quien no sabe que se abre, no encuentra las
  otras 15 secciones.
- Abierto, es una **lista plana de 16 renglones** en cinco grupos, que empuja el contenido hacia
  abajo y se pierde la sección en la que se estaba.
- La pantalla repite lo mismo tres veces: la pastilla, el kicker "PANEL DE CONTROL" y el título de la
  sección. Arriba además está el aviso "Esto se trabaja mejor en una pantalla grande", que ocupa
  casi lo mismo que la sección.
- Desde el menú del teléfono, "Panel de control" lleva directo a "Zonas geográficas": no hay un lugar
  que muestre **qué hay** en el panel.

## La idea: un "inicio" del panel y una forma clara de moverse

Tres piezas, de lo más importante a lo menos:

### 1. Inicio del Panel de control (`/app/ajustes`)

Una pantalla que es el **índice**: las secciones como tarjetas, agrupadas, cada una con su ícono,
su nombre y una línea que dice qué se hace ahí ("Días de reparto — qué días reparte cada ciudad"),
con una flecha a la derecha. Un renglón entero es el botón (≥ 56 px de alto).

- En el teléfono es **la entrada**: "Panel de control" del menú lleva acá, no a una sección al azar.
- Arriba, un **buscador** ("Buscar un ajuste"): escribir "resend" o "correo" lleva a Correo;
  "whatsapp" a las cuentas; "radio" a Zonas. Cada sección trae palabras clave, no sólo el título.
- Sólo aparece lo que la persona puede ver (la misma regla de permisos de hoy).
- En escritorio sigue el menú lateral del panel (funciona bien); el inicio también existe como
  resumen, pero no es obligatorio pasar por él.

### 2. Dentro de una sección: cómo volver y cómo cambiar

Se reemplaza la pastilla por un encabezado que se entiende de un vistazo:

- **"‹ Panel de control"** a la izquierda (vuelve al inicio) y el nombre de la sección en grande.
- Un botón **"Cambiar de sección ▾"** con ícono y flecha, visible, que abre una **hoja desde abajo**
  (bottom sheet) con las secciones agrupadas y la actual marcada. Se cierra tocando afuera, con el
  gesto de bajar o con "Cerrar".
- Debajo del título, **fichas de las hermanas del mismo grupo** (por ejemplo, dentro de
  "Integraciones": Correo · WhatsApp · Plantillas · Chat · IA) en una fila que se desliza, para el
  salto más común sin abrir nada.
- Se quita el kicker repetido y el aviso de "pantalla grande" pasa a ser una línea chica
  descartable, no un bloque.

### 3. Pulido

- Todos los objetivos táctiles ≥ 44 px; foco que vuelve al botón al cerrar la hoja; `aria-current`
  en la sección actual; respeta "reducir movimiento".
- La barra inferior sigue siendo la del turno (Pedidos, Cocina, Rutas, Clientes): el panel no la
  pisa.
- Una sola fuente de verdad: `SETTINGS_GROUPS` (hoy en `SettingsTabs.tsx`) suma `description`,
  `icon` y `keywords`, y de ahí salen el menú de escritorio, el inicio, la hoja y el buscador. Un
  test falla si una sección del catálogo no tiene descripción o no está en el inicio.

## Fases

1. **El catálogo y el inicio**: `SETTINGS_GROUPS` con descripción, ícono y palabras clave; la
   pantalla `/app/ajustes` con tarjetas y buscador; "Panel de control" del menú apunta ahí en el
   teléfono.
2. **El encabezado de sección**: "‹ Panel de control", "Cambiar de sección" con su hoja, fichas de
   las hermanas; se retira la pastilla `<details>`.
3. **Pulido y pruebas**: tamaños de toque, foco, el aviso de pantalla grande, y el barrido de
   maquetación a 320/375/414/680 px.

## Qué no cambia

Las rutas de cada sección, los permisos (`settings.access` y el de cada pantalla) y el menú lateral de
escritorio. Cada sección sigue siendo su propia ruta.

## Para confirmar cuando se haga

1. **¿El inicio también en escritorio?** Propuesta: sí, como página de resumen, pero "Panel de
   control" del menú lateral sigue yendo a la última sección vista.
2. **¿Los íconos?** Propuesta: los del menú lateral cuando existan y, si no, un ícono simple por
   grupo.

## Estado (2026-10-16): hecho

Las tres fases están hechas.

- **Catálogo único** (`lib/settingsCatalog.ts`): cada sección con su descripción y sus palabras clave;
  de ahí salen el menú de escritorio, el inicio, la hoja y el buscador. Tests: toda sección tiene
  descripción y palabras clave, no hay rutas repetidas, y el buscador entiende palabras (sin
  tildes ni mayúsculas, todas las palabras tienen que aparecer).
- **Inicio** (`/app/ajustes`, `SettingsHomePage`): en el teléfono, tarjetas agrupadas con buscador;
  en escritorio redirige a la última sección abierta (o a la primera que se ve). "Panel de control" del
  menú lateral apunta ahí y queda resaltado en el inicio y en cada sección del panel.
- **Encabezado de sección** (`SettingsTabs`, para pantallas de hasta 74.99 rem): "‹ Panel de
  control", el botón "Cambiar de sección" con su hoja (`SettingsSheet`: foco adentro, Escape y tocar
  afuera la cierran, la página de atrás no se desplaza, el foco vuelve al botón) y las fichas de las
  hermanas del grupo. Se retiró la pastilla `<details>`. El rótulo "Panel de control" repetido de
  cada pantalla se oculta en ese ancho.
- **Aviso de "pantalla grande"**: una línea que se descarta, y no vuelve en la sesión.
- **Cambió respecto del plan**: no hay un ícono por sección (se prefirió la descripción, que dice más);
  y "Panel de control" en escritorio va a la última sección abierta, como se proponía.
- **Encontrado de paso**: a 768 px la barra superior de toda la aplicación se pasaba 28 px del ancho y
  hacía arrastrar la página de costado. Se compactó entre 681 y 1100 px (menos espacio, sin el "Buen
  día,") y se sacó el reloj entre 681 y 760 px. Verificado a 320, 375, 681, 700, 761, 768, 820, 1024,
  1199 y 1200 px.
