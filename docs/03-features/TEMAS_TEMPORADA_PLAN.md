# Temas: Calabaza (estándar) y Verano (plan, 2026-10-29)

Plan solamente, sin cambios en producción. Son dos trabajos:

- **A.** El tema de Halloween se termina el 31 de octubre a las 23:59. Sus colores se quedan como un
  tema más de Apariencia, sin adornos.
- **B.** Un tema de verano nuevo, para noviembre.

Base: `HALLOWEEN_THEME_PLAN.md`, `apps/web/src/lib/seasonalTheme.ts` y los tokens `--db-*` de
`.dashboard-shell[data-theme=…]` en `styles.css`.

## Cómo funciona hoy

- **Temas estándar** (`themes` en `DashboardShell.tsx`):
  - son Natural, Cielo, Arena, Papel, Bosque, Aurora, Carbón, Cacao y Marea;
  - cada uno es un bloque de tokens `--db-*` en `styles.css`;
  - el tema elegido se guarda como texto en la cuenta (`/api/v1/me/appearance`, con
    `AppearanceValueSchema`), así que **sumar un tema no lleva migración**.
- **Temas de temporada** (`activeSeason`):
  - entre dos fechas, en hora de Argentina, se ponen **encima** del tema de cada uno, con
    `data-theme = season.key`;
  - quien no los quiere los saca en "Aa" → Temporada, y eso queda guardado en `localStorage` por
    equipo y por año.
- **Los adornos de Halloween** cuelgan de dos cosas distintas:
  - la telaraña y las arañitas (`<HalloweenDecor />`) y la calabaza del logo dependen de que la
    temporada esté activa;
  - la calabaza de los estados vacíos depende del CSS
    `.dashboard-shell[data-theme='halloween'] .empty-state::before`.

## A. Halloween termina el 31 a las 23:59 y queda "Calabaza"

### Fecha

- Hoy `HALLOWEEN.end` es `'11-01'`, inclusive, así que la temporada corre hasta el 1 de noviembre a
  las 23:59.
- Pasarlo a `'10-31'` hace que termine el **31 a las 23:59**, hora de Argentina, que es lo pedido.
- El reloj del shell se actualiza cada segundo y `activeSeason(now)` se recalcula en cada render,
  así que a las 00:00 del 1 de noviembre el tema cambia solo, sin recargar.
- **Condición:** el cambio tiene que estar desplegado **antes del 31 a las 23:59**. Si se despliega
  después, Halloween dura igual hasta el 1 a las 23:59 y el resto del plan sale bien de todos modos.
  No depende de ninguna migración.

### El tema estándar

- Se suma "Calabaza" (valor `calabaza`, tono oscuro, muestra `#f97316`) a `themes`.
- Usa los mismos tokens que el bloque `halloween`. Se escribe como un selector compartido
  `[data-theme='halloween'], [data-theme='calabaza']`, para no duplicar el bloque.
- **Sin adornos:**
  - la calabaza de los estados vacíos sigue colgada **solo** de `data-theme='halloween'`;
  - la telaraña y las arañitas, solo de la temporada.
  - Con `calabaza` no aparece ningún adorno, sin tocar `HalloweenDecor`.
- Las imágenes de `public/seasonal/halloween/` se quedan, para el año que viene: la temporada sigue
  definida y vuelve sola el 24 de octubre de 2027.
- **Quién lo ve:** al terminar la temporada, cada persona vuelve a su tema. Quien quiera seguir con
  los colores elige "Calabaza" en Apariencia, y eso queda guardado en su cuenta.
  - Alternativa a decidir: pasar a "Calabaza" a todos el 1 de noviembre. No lo recomiendo, porque
    pisa la elección de cada uno.

### Archivos de A

- `seasonalTheme.ts`: `end: '10-31'`.
- `seasonalTheme.test.ts`: casos del 31 a las 23:59 (activa) y del 1 a las 00:00 (inactiva).
- `DashboardShell.tsx`: "Calabaza" en `themes`.
- `styles.css`: el selector compartido.
- Ayuda de Apariencia, novedad ("Halloween se despide; sus colores quedan como el tema Calabaza"),
  `BACKLOG.md` y `HALLOWEEN_THEME_PLAN.md`.

## B. Tema de verano

### Pedido

- Colores claros, con buena visibilidad.
- Fondo en degradado: **celeste arriba y blanco abajo**.
- **Brillos naranjas** en los hovers y el foco.
- **Íconos de verde intenso.**
- **Letras negras.**

### Paleta propuesta, a validar con capturas

| Token                           | Valor                                                                     | Uso                                                              |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `--db-bg`                       | `linear-gradient(180deg, #bfe3f7 0%, #ffffff 70%)`                        | Fondo fijo de la página (celeste arriba, blanco abajo)           |
| `--db-bg-2`                     | `#e9f5fc`                                                                 | Fondos secundarios, como cabeceras de tabla                      |
| `--db-surface`                  | `rgb(255 255 255 / 88%)`                                                  | Tarjetas, levemente translúcidas sobre el degradado              |
| `--db-surface-solid`            | `#ffffff`                                                                 | Desplegables y modales                                           |
| `--db-sidebar`                  | `linear-gradient(180deg, rgb(225 242 252 / 97%), rgb(255 255 255 / 97%))` | Menú lateral                                                     |
| `--db-topbar`                   | `rgb(255 255 255 / 82%)`                                                  | Barra superior                                                   |
| `--db-text`                     | `#0b0b0b`                                                                 | **Letras negras**                                                |
| `--db-text-soft` / `--db-muted` | negro al 75 % y al 55 %                                                   | Textos secundarios, sin bajar de 4.5:1                           |
| `--db-border`                   | `rgb(14 116 144 / 22%)`                                                   | Bordes celeste oscuro                                            |
| `--db-accent`                   | `#15803d`                                                                 | **Verde intenso**: íconos, links, lo activo (5.0:1 sobre blanco) |
| `--db-accent-strong`            | `#166534`                                                                 | Botón principal, con texto blanco                                |
| `--db-glow` (nuevo)             | `#f97316`                                                                 | **Brillo naranja** de hover y foco                               |
| `--db-gold`                     | `#c2410c`                                                                 | Avisos y destacados                                              |

**Contraste:**

- el naranja `#f97316` sobre blanco da 2.8:1, así que **no sirve para texto**;
- se usa solo como brillo: un halo (`box-shadow`), un borde al pasar el mouse o el anillo de foco;
- los textos naranjas, si hacen falta, van con `#c2410c` (5.2:1).

### Lo que hay que construir: separar ícono, acento y brillo

- Hoy `--db-accent` se usa en 163 lugares y hace todo a la vez: íconos, links, botones, lo activo y
  los hovers.
- El verano necesita **íconos verdes y hovers naranjas**, así que hacen falta dos tokens nuevos:
  - `--db-icon`: color de los íconos (menú lateral, barra inferior, tarjetas de módulos y acciones);
  - `--db-glow`: color del brillo en `:hover` y `:focus-visible`.
- Los dos valen `var(--db-accent)` por defecto en el shell, así que **los otros diez temas no
  cambian**. Solo Verano les pone valores propios.
- Trabajo:
  1. revisar las 66 reglas `:hover`;
  2. revisar las reglas de `svg` (menú, `.dashboard-module-card a svg`, `.dashboard-bottom-nav svg`,
     etc.) y pasarlas a los tokens nuevos.
- Es el grueso del trabajo de B. Se hace en una rama y se compara con capturas, tema por tema, antes
  de integrarlo.

### El degradado

- Va sobre el shell, con `background-attachment: fixed`: así no se repite al hacer scroll y el
  blanco queda abajo de la pantalla, no del documento.
- `--db-vignette` lleva una luz cálida muy suave arriba a la derecha (sol), sin naranja fuerte.
- En el teléfono el degradado es el mismo. En pantallas muy altas se revisa que las tarjetas
  blancas sigan recortándose contra el fondo, con borde y sombra suaves.

### Qué no se toca

- Etiquetas, planillas, PDFs y la página pública, igual que con Halloween.
- No va migración: el tema es texto en la cuenta.

## Preguntas abiertas

1. **¿Verano es una temporada o un tema estándar?**
   - **Temporada:** se pone sola a todos entre dos fechas y se puede sacar, como Halloween.
   - **Estándar:** cada uno lo elige.
   - Propuesta: temporada del **1 de noviembre al 28 de febrero**, que queda además como tema
     estándar "Verano" para quien lo quiera todo el año.
2. **¿Lleva adornos, como Halloween?** Por ejemplo un sol en una esquina o un estado vacío con
   anteojos de sol. El pedido no los menciona, así que el plan es sin adornos.
3. **Nombre del tema estándar de Halloween:** "Calabaza", o "Noche de brujas" si se quiere más
   explícito.
4. **Fecha de Verano:** si es temporada desde el 1 de noviembre, tiene que estar desplegado antes.
   Por el tamaño del trabajo (los tokens de ícono y brillo) es más realista arrancarlo **cuando
   esté listo**, en noviembre, que forzarlo para el 1.

## Orden de trabajo

1. **A**, en un commit chico. Se despliega antes del 31 a las 23:59, fuera del cierre y del
   reparto. No lleva migración.
2. **B, paso 1:** los tokens `--db-icon` y `--db-glow`, con valor por defecto igual al acento. Va en
   una rama, se verifica con capturas que ningún tema cambia y se integra solo.
3. **B, paso 2:** el bloque `summer` o `verano`, su entrada en `themes` y la temporada, si se
   decide. Se verifica el contraste, en el teléfono y en pantalla ancha.
4. Ayuda, novedades y backlog en el mismo commit de cada paso.
