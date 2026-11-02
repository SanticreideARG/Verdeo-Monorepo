# Temas: Calabaza y Verano (plan 2026-10-29, implementado 2026-11-01)

Dos trabajos sobre los temas del panel interno:

- **A.** Halloween termina el 31 de octubre a las 23:59 y sus colores quedan como un tema más de
  Apariencia, **"Calabaza"**, sin adornos.
- **B.** Un tema de verano nuevo, que se pone solo desde el 1 de noviembre.

Base: [HALLOWEEN_THEME_PLAN.md](HALLOWEEN_THEME_PLAN.md), `apps/web/src/lib/seasonalTheme.ts` y los
tokens `--db-*` de `.dashboard-shell[data-theme=…]` en `apps/web/src/styles.css`.

## Cómo funcionan los temas

- **Temas estándar** (`themes` en `DashboardShell.tsx`): cada uno es un bloque de tokens `--db-*`.
  El elegido se guarda como texto en la cuenta (`/api/v1/me/appearance`), así que **sumar un tema
  no lleva migración**.
- **Temas de temporada** (`activeSeason`, en hora de Argentina): entre dos fechas se ponen
  **encima** del tema de cada uno, con `data-theme = season.key`. Quien no los quiere los saca en
  "Aa" → Temporada; queda guardado en `localStorage`, por equipo y por temporada.

## A. Halloween → "Calabaza"

- `HALLOWEEN.end` pasa a `'10-31'`.
- "Calabaza" (`calabaza`, oscuro) usa el mismo bloque que `halloween`, con un selector compartido.
- Sin adornos: la telaraña y las arañitas dependen de la temporada, y la calabaza de los estados
  vacíos sigue colgada sólo de `data-theme='halloween'`.
- Las imágenes de `public/seasonal/halloween/` se quedan: la temporada vuelve sola el 24 de octubre
  del año que viene.
- Al terminar la temporada cada uno vuelve a su tema; no se pasa a nadie a "Calabaza" de oficio.

## B. Verano

### Pedido

Colores claros con buena visibilidad; fondo en degradado, **celeste arriba y blanco abajo**;
**brillos naranjas** en hover y foco; **íconos verde intenso**; **letras negras**.

### Decidido

- **Temporada del 1 de noviembre al 28 de febrero**, y además tema estándar "Verano" (claro) para
  quien lo quiera todo el año. Las dos usan `data-theme='verano'`.
- La temporada **cruza el año**: `activeSeason` acepta `start > end`, y el "sacado" se guarda con el
  año en que arrancó la temporada (sacarlo en diciembre lo deja sacado en enero y febrero).
- **Sin adornos.**

### Paleta

| Token                | Valor                                   | Uso                                      |
| -------------------- | --------------------------------------- | ---------------------------------------- |
| fondo del shell      | `#bfe3f7` → `#e6f4fc` → `#fff`, `fixed` | Celeste arriba, blanco abajo de la vista |
| `--db-bg`            | `#ffffff`                               | Liso: también es letra sobre el acento   |
| `--db-bg-2`          | `#e9f5fc`                               | Cabeceras de tabla, fondos secundarios   |
| `--db-surface`       | `rgb(255 255 255 / 88%)`                | Tarjetas                                 |
| `--db-text`          | `#0b0b0b`                               | Letras negras                            |
| `--db-accent`        | `#15803d`                               | Íconos, links y lo activo (5.0:1)        |
| `--db-accent-strong` | `#166534`                               | Botón principal                          |
| `--db-glow`          | `#f97316`                               | Brillo de hover y foco (no para texto)   |
| `--db-gold`          | `#c2410c`                               | Avisos y destacados (5.2:1)              |

El naranja da 2.8:1 sobre blanco: se usa sólo como halo, borde o anillo de foco.

### Brillo naranja

- Como el acento de Verano ya es verde, los íconos (que usan `--db-accent`) salen verdes sin tocar
  nada más.
- El brillo son reglas propias de Verano sobre lo que se toca: botones, menú lateral, pestañas,
  tarjetas, menú de acciones, selector de vista, links-botón, filas de tabla y el anillo de foco.
- **Pendiente:** separar `--db-icon` y `--db-glow` como tokens de todos los temas (hoy `--db-accent`
  hace de todo en más de 160 reglas). No hace falta para Verano; sirve si otro tema quiere íconos y
  brillos de distinto color que su acento.

### Qué no se toca

Etiquetas, planillas, PDFs y la página pública. No va migración.
