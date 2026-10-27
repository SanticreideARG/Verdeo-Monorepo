# Tema Halloween (plan, 2026-10-27)

Una versión especial del panel para Halloween: negro, verde y naranja, con telarañas en las
esquinas y una calabaza. Es un **tema más** de Apariencia (como Bosque o Aurora), no un cambio de
la aplicación: se elige, se saca, y no toca etiquetas, planillas ni nada que se imprima.

## Qué se ve

- **Colores** (tokens `--db-*` de `.dashboard-shell[data-theme='halloween']`):
  - fondo negro (`#0a0a0b`, superficies `#151516`), texto claro;
  - acento naranja calabaza (`#f97316`, fuerte `#ea580c`) en botones, links y lo activo;
  - verde (`#7bc043`) como segundo acento: bordes, estados "listo", el viñeteado;
  - el dorado del sistema pasa a naranja.
  - Contraste: naranja sobre negro ≈ 7:1 y el texto claro sobre las superficies, más de 12:1.
- **Esquineros** (imágenes del cliente, con transparencia):
  - arriba a la derecha, la telaraña sola (`halloween-web-corner.png`);
  - abajo a la izquierda, la telaraña con las arañitas (`halloween-spiders-corner.webp`).
  - Fijos sobre el área de trabajo, sin capturar el mouse (`pointer-events: none`), semitransparentes
    para que no tapen datos; más chicos en el teléfono.
- **Calabaza**: al lado del logo en la barra lateral y en los estados vacíos ("No hay pedidos").
  Hace falta en PNG con fondo transparente: la que llegó tiene el cuadriculado pintado en la imagen.
- **Movimiento**: la arañita que cuelga se balancea apenas; nada se mueve con "reducir movimiento"
  del sistema (`prefers-reduced-motion`).

## Cómo se implementa

1. Las imágenes van a `apps/web/public/seasonal/halloween/` (no al bundle: se cargan sólo con el
   tema puesto).
2. El tema se suma a la lista de `DashboardShell` y de Ajustes → Apariencia ("Halloween", oscuro).
   El tema se guarda como texto en la cuenta, así que no hay migración.
3. Los adornos son pseudo-elementos o un componente `SeasonalDecor` que sólo se monta con
   `data-theme='halloween'`.
4. Novedad en el feed y ayuda en Apariencia.

## Decidido e implementado (2026-10-27)

- **Sólo el panel interno**: la página pública y el formulario de pedidos quedan como están.
- **Se pone solo** del 24 de octubre al 1 de noviembre (hora de Argentina), encima del tema de cada
  uno (`activeSeason` en `apps/web/src/lib/seasonalTheme.ts`, con tests). Se saca en "Aa" →
  Temporada (o Ajustes → Apariencia); se recuerda en ese equipo y por ese año (localStorage).
- **Esquineros**: la telaraña arriba a la derecha, aclarada (`invert`) para verse sobre negro; la de
  las arañitas abajo a la izquierda del área de trabajo (al lado del menú lateral), sin invertir —los
  ojos naranjas se pondrían azules— y recortada con un brillo claro. Fijos, sin capturar el mouse.
- **Calabaza**: la que llegó tenía el cuadriculado pintado; se le sacó el fondo (relleno desde los
  bordes más las zonas encerradas con el patrón blanco y gris) y se achicó a 256 px. Va al lado del
  logo y en los estados vacíos.
- Imágenes en `apps/web/public/seasonal/halloween/`: se cargan sólo con el tema puesto.
