# Ayuda al día y ayudas al pasar el mouse — plan

Pedido del usuario (2026-10-16): dejar pendiente (1) ampliar la información de la ayuda y
**mantenerla actualizada**, y (2) en escritorio, pequeñas ayudas que aparezcan al dejar el mouse más
de 2 segundos sobre un campo. Se planifica ahora y se hace más adelante.

## 1. La ayuda, al día y que siga al día

### Dónde está hoy

36 artículos en `packages/db/src/help-articles.ts`, que lee la lechuza del panel
(`OperatorAssistant.tsx`) y la pantalla `/app/ayuda`. Se actualizan solos con
`pnpm db:seed-help` (idempotente, no toca permisos ni configuración). Cada artículo se gatea con el
permiso de la pantalla de la que habla.

### Lo que falta (todo lo hecho desde que se escribieron)

| Tema                    | Artículos nuevos                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stock**               | Qué es el stock y en qué se diferencia de un pedido · Cargarlo en Cocina · "Sale del stock" al tomar un pedido · Qué pasa al cerrar el período con stock sin vender |
| **Tablero "Novedades"** | Publicar un aviso, un cambio o una novedad · Fijar, "Lo leí" y quién falta · Respuestas y 👍 · Consejos del día, "Hecho" y "Mañana" · Avisos del navegador          |
| **Panel de control**    | Qué hay adentro y quién lo ve (sólo superadmin) · Dónde quedó Contenidos                                                                                            |
| **Ubicaciones**         | Conciliar ubicaciones paso a paso · Pegar la ubicación de Google Maps (los formatos que sirven) · Por qué sólo se ofrecen lugares de la ciudad                      |
| **Reparto**             | Días de reparto por ciudad · Repartos y rutas por zona · Barrios                                                                                                    |
| **Importar**            | Importar clientes y pedidos con el conciliador · Pedidos repetidos y cómo corregirlos                                                                               |
| **Cliente**             | Los pedidos asociados con su composición                                                                                                                            |
| **Administración**      | Correo de producción (remitente y pedidos por mail) · Quién puede ver las estadísticas                                                                              |
| **Etiquetas**           | Cuando salga el renderizador: layouts, logo y vista previa en vivo                                                                                                  |

Y revisar los 36 que hay: los que mencionan estadísticas, Contenidos, el menú lateral o el origen
"Venta de oportunidad" quedaron desactualizados.

### Ampliar, no sólo agregar

Cada artículo con la misma forma, para que se lea igual en todos:

1. **Para qué sirve** (una frase).
2. **Cómo se hace**, paso a paso y con los nombres exactos de los botones.
3. **Qué puede salir mal** (los mensajes de error reales y qué hacer).
4. **Quién lo ve** (si no es todo el equipo).
5. Enlaces a la pantalla y a los artículos relacionados (`[[clave]]`).

### Que no se desactualice (lo más importante)

La regla del repositorio es que la documentación viaja con el código. La ayuda es documentación del
usuario, así que se suma a la regla: **un cambio que toca una pantalla toca su artículo, en el mismo
commit.** Para que no dependa de acordarse:

- **Test de cobertura** (`help-articles.test.ts`): falla si
  - una entrada del menú lateral o una ruta de `App.tsx` no tiene ningún artículo que la enlace
    (la excepción es una lista corta y explícita);
  - un `[[clave]]` apunta a un artículo que no existe;
  - un enlace `[texto](/app/…)` apunta a una ruta que no existe;
  - un artículo exige un permiso que no existe en el catálogo.
- **Fecha de revisión** (`reviewed_at` en el artículo): la lechuza no la muestra, pero un test avisa
  de los que llevan más de 90 días sin revisarse. No bloquea: da una lista.
- **Checklist en cada plan de feature**: la sección "Ayuda" (qué artículos cambian) es obligatoria,
  igual que "Documentación".
- **Puesta al día en producción**: `pnpm db:seed-help --produccion`, junto con las migraciones.

### Fases

1. **Cobertura y revisión**: el test de cobertura y revisar los 36 artículos que hay.
2. **Lo nuevo**: los artículos de la tabla de arriba, uno por tema.
3. **Fecha de revisión** y el aviso de los viejos.

## 2. Ayudas al pasar el mouse (escritorio)

### Cómo se comporta

- **Sólo escritorio**: `@media (hover: hover) and (pointer: fine)`. En teléfono y tableta no existe
  (ahí no hay "pasar el mouse"; la lechuza cubre).
- **Aparece a los 2 segundos** de dejar el mouse quieto sobre el campo (o su etiqueta). Moverlo a
  otro campo reinicia la cuenta. Desaparece al salir, al hacer clic, al escribir o al hacer scroll.
- **Chica y fuera del camino**: un globo junto al campo, de hasta ~140 caracteres, que nunca tapa el
  campo ni el botón de al lado, y que cabe en la pantalla (se acomoda arriba o abajo).
- **Con teclado también**: el mismo texto sale si el campo queda enfocado 2 segundos, y va como
  `aria-describedby` para los lectores de pantalla. Nada que sea imprescindible vive sólo en un
  hover.
- **Se apaga y se desgasta**: un interruptor "Ayudas al pasar el mouse" en Apariencia (encendido por
  defecto, por usuario), y cada ayuda deja de salir sola después de verse 3 veces, para no
  molestar a quien ya la conoce.
- **"Más en la ayuda"**: si el campo tiene un artículo, el globo trae el enlace que lo abre en la
  lechuza.

### Cómo se arma (sin cablear componente por componente)

- **Un atributo en el campo**: `data-hint="pedido.medio-de-pago"`. Un único listener global (un
  `HintProvider` en el panel, con delegación de eventos) hace todo lo demás: así agregar una ayuda es
  agregar un atributo y una línea en el catálogo.
- **Un catálogo** (`lib/hints.ts`): `clave → { texto, articulo? }`. Un solo lugar para leer, corregir
  y traducir los textos; nada de frases sueltas en el JSX.
- **Test**: cada `data-hint` usado en el código existe en el catálogo, y cada entrada del catálogo se
  usa en algún lado (que no queden textos huérfanos). Un test con reloj falso fija los 2 segundos, el
  reinicio y la desaparición.

### Reglas de redacción

Una frase que contesta **qué va acá** o **qué pasa si…**, sin repetir la etiqueta. Ejemplo, en
"Medio de pago": _"Sale de la lista de Métodos de pago. Si falta uno, se agrega en el Panel de
control."_ Máximo 140 caracteres; si no entra, es un artículo y no un globo.

### Dónde primero

Los campos donde hoy se equivoca la gente o se pregunta: tomar un pedido (origen, medio de pago,
fecha de entrega, "Sale del stock"), los diálogos de importar, Stock y producción real en Cocina, el
asistente de ubicaciones (pegar la ubicación), alta de usuario (rol y ciudad) y, en el Panel de
control, el radio de la ciudad y los días de reparto.

### Fases

1. **El mecanismo**: `HintProvider`, el catálogo, el estilo, el interruptor en Apariencia y los
   tests.
2. **Las primeras 15–20 ayudas** en los campos de la lista de arriba.
3. **El resto**, a medida que se toca cada pantalla (misma regla que la ayuda: el campo nuevo trae su
   hint en el mismo commit).

## Para confirmar cuando se haga

1. **¿Quién escribe los textos?** Propuesta: los escribo yo en español rioplatense, vos los
   corregís; viven en el repo.
2. **¿Se editan sin deploy?** Propuesta: no al principio (están en el catálogo); si se quiere, se
   pasan a la tabla de ayuda más adelante.
3. **¿El umbral de 2 segundos es fijo o configurable?** Propuesta: fijo.
