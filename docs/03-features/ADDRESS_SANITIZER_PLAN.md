# Sanitizador de direcciones (plan)

Estado: **las cuatro fases construidas** (ver "Como quedó" y "Fases 3 y 4" al final).
usables, con la API de Gemini y otros procedimientos configurables, desde el detalle del pedido o
del cliente, **antes de armar la hoja de ruta**.

## Por qué hace falta

`createRoute` sólo arma paradas con pedidos que tienen dirección **geocodificada**
(`customer_addresses.latitude/longitude`). Un pedido sin coordenadas **queda afuera de la ruta sin
avisar**: el resultado es una ruta más corta de lo esperado que nadie nota hasta que falta una
entrega. Las direcciones que entran por email o planilla llegan como texto crudo
("Julián Álvarez 1010. 6 ° A, Villa Crespo") y quedan en `NEEDS_LOCATION`.

## Lo que ya existe (y se reutiliza)

| Pieza                                                                         | Dónde                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Interfaz `GeocodingProvider` + Google Maps + lectura de enlaces de Maps       | `packages/geocoding`                                                                                |
| Solicitudes y **candidatos** con confianza 0–1, confirmar / rechazar          | tablas `geocoding_requests` / `geocoding_candidates`, API `/customers/:id/addresses/:id/geocoding…` |
| Botón "Buscar ubicación" y confirmación en la ficha del cliente               | `CustomersPage.tsx`                                                                                 |
| Clave de mapas cifrada y activable                                            | Panel de control → IA y plantillas                                                                  |
| Proveedores de IA (Gemini por su endpoint compatible con OpenAI), tareas, log | `packages/ai`, `ai_provider_configs`, `ai_task_executions`                                          |

**No se construye un geocodificador nuevo.** Se agrega una capa de _limpieza_ antes y un orden de
_procedimientos_ después, sobre el flujo de candidatos que ya existe.

## Idea central: dos etapas

Gemini **no es un geocodificador**: no tiene una base de calles y puede inventar coordenadas con
total seguridad. Usarlo para devolver latitud y longitud sería un riesgo (una entrega en otro
barrio). Se usa para lo que sí hace bien, que es **entender texto**:

1. **Normalizar (IA)** — de `"Julián Álvarez 1010. 6 ° A, Villa Crespo"` saca
   `{ calle: "Julián Álvarez", número: "1010", piso: "6", depto: "A", barrio: "Villa Crespo", ciudad, notas }`
   y arma una consulta limpia para el geocodificador (`"Julián Álvarez 1010, Villa Crespo, CABA"`).
   Piso y depto **no** van al geocodificador (lo confunden) y se guardan aparte como datos de entrega.
2. **Ubicar (geocodificador)** — Google Maps (u otro) resuelve la consulta limpia a coordenadas
   verificables y devuelve candidatos con su confianza.

Lo que Gemini devuelve es **texto estructurado**; las coordenadas siempre salen de un geocodificador.

## Procedimientos configurables

Un orden de intentos por ciudad, que se corta en el primero que resuelve con confianza suficiente:

1. **Enlace de ubicación** si el pedido trae uno (exacto, ya soportado).
2. **Coordenadas ya conocidas** del mismo domicilio de ese cliente (no se vuelve a pagar una consulta).
3. **Gemini → Google Maps** (la limpieza de arriba, y después geocodificar).
4. **Sólo Google Maps** con el texto tal cual (para cuando no hay IA configurada o falla).
5. **A mano**: queda marcada "Necesita ubicación" con el motivo.

Configurable desde Panel de control (nueva pestaña **Direcciones**, permiso `geography.manage` o el
de ajustes de reparto): qué pasos están activos y en qué orden, el **umbral de confianza** para
aceptar sola, el **país y la ciudad por defecto** que se le dan de contexto, y el proveedor/modelo de
IA. El mecanismo es una lista ordenada de _estrategias_ con la misma forma que `GeocodingProvider`,
así que sumar un procedimiento (otro geocodificador, un servicio municipal) es una clase y una línea.

## Reglas de seguridad de la ubicación

- **Auto-aceptar sólo con confianza alta** (por defecto ≥ 0,9 y resultado tipo `ROOFTOP`/interpolado)
  **y dentro del radio de la ciudad** del pedido. Lo demás queda como _candidato para revisar_.
- **Nunca se pisa una ubicación confirmada a mano.** El sanitizador sólo actúa sobre
  `NEEDS_LOCATION` o cuando se lo pide explícitamente.
- **Chequeo de plausibilidad**: si las coordenadas caen fuera del área de la ciudad (con un margen),
  se descartan aunque la confianza sea alta. Es lo que atrapa una "Calle San Martín" de otra provincia.
- Toda decisión (qué se limpió, qué se aceptó, quién) va a la **auditoría**; la IA, además, a
  `ai_task_executions` con su costo.
- A Gemini viaja **sólo el texto de la dirección**: sin nombre, teléfono ni email del cliente.

## Dónde se usa

1. **Detalle del pedido** — botón "Ubicar dirección": corre el procedimiento, muestra el resultado
   (texto normalizado, candidato, confianza, mapa chico) y deja **Aceptar / Elegir otro / Ajustar a
   mano**. Es el flujo de la ficha del cliente, llevado al pedido.
2. **Ficha del cliente** — el botón de ahora gana el paso de limpieza, y suma "Normalizar" sin
   geocodificar.
3. **Antes de la hoja de ruta** _(lo más valioso)_ — en la pantalla de rutas, un **control previo**:
   "De 38 pedidos del día, 31 con ubicación, **7 sin**" con la lista y un botón **"Ubicar los 7"**
   que corre el procedimiento en lote y deja el resto para revisar. Crear la ruta con pedidos sin
   ubicación pasa a **avisar y listar** cuáles quedan afuera, en vez de omitirlos callado.
4. **Al importar pedidos** (emails/planilla) — opción "Ubicar las direcciones al importar", para que
   lleguen listas.

## Piezas a construir

**Backend**

- `packages/geocoding`: `AddressNormalizer` (interfaz) + `GeminiAddressNormalizer` (usa `AIProvider`,
  salida JSON validada con zod; si la IA falla o devuelve algo inválido, se sigue sin normalizar) +
  `GeocodingPipeline` (lista ordenada de estrategias, umbral, plausibilidad) con tests.
- Tarea de IA `NORMALIZE_ADDRESS` en el registro de tareas (prompt versionado, editable en la
  pantalla de plantillas de IA como las demás).
- Migración: `site_geocoding_settings` (pasos y orden, umbral, contexto país/ciudad, `auto_accept`),
  y columnas `normalized_query` / `geocoding_method` / `geocoded_at` en `customer_addresses` para saber
  **cómo** se ubicó cada una. `unit`/`floor` ya pueden vivir en `access_notes`.
- API: `POST /orders/:id/locate`, `POST /routes/preflight` (conteo y lista de pedidos sin ubicación),
  `POST /routes/locate-missing` (lote), `GET/PUT /geocoding/settings`.
- Lote con tope y reintento: sin cola externa; procesa en tandas dentro de la petición con límite
  (p. ej. 25 por vez) y devuelve el progreso, como la importación.

**Web**: botón y diálogo en el detalle del pedido, pestaña "Direcciones" en Panel de control, control
previo en rutas, casilla en el diálogo de importación. Documentación y artículo de ayuda en el mismo
commit que cada parte.

## Fases

| Fase | Contenido                                                                                  | Valor                                     |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 1    | Control previo en rutas (conteo + lista de pedidos sin ubicación) y aviso al crear la ruta | Corta el problema de las paradas perdidas |
| 2    | `GeocodingPipeline` + normalizador Gemini + botón "Ubicar" en el pedido y el cliente       | El sanitizador en sí                      |
| 3    | Lote "Ubicar los N" + configuración por ciudad (orden, umbral, contexto)                   | Escala y control del equipo               |
| 4    | Ubicar al importar; métricas (tasa de acierto, costo de IA, rechazados)                    | Pulido                                    |

La fase 1 no depende de la IA ni de la clave de Gemini y se puede hacer primero.

## Decisiones abiertas

1. **¿Google Maps queda como geocodificador final?** Hoy es el único implementado y la clave ya se
   configura. Alternativas (Nominatim/OSM sin costo, con peor cobertura de números en Argentina) se
   pueden sumar como estrategia, pero hay que medirlas con direcciones reales antes de confiar.
2. **Umbral de auto-aceptación**: propongo 0,9; conviene calibrarlo con las primeras 50 direcciones.
3. **Costo**: una limpieza con Gemini son pocas decenas de tokens por dirección, y la geocodificación
   de Google tiene costo por consulta; con el paso 2 (reusar coordenadas del cliente) se paga una sola
   vez por domicilio.
4. **Piso y departamento**: guardarlos como campos propios o en `access_notes` (propongo
   `access_notes` ahora, campos propios si el reparto los pide).
5. **Permisos**: reutilizar el de edición de pedidos para "Ubicar" y el de ajustes de reparto para la
   configuración (sin permiso nuevo, para no sumar otro paso de siembra en producción).

## Como quedó (fases 1 y 2)

- **Control previo en rutas.** En Rutas, bajo el formulario de la ruta, aparece un cuadro con los
  pedidos del día elegido que no tienen ubicación y por eso **no entrarían en la hoja**, con el botón
  "Ubicar los pedidos". Va por tandas de 5 por petición (cada pedido son dos llamadas externas y una
  función sin estado tiene tiempo máximo) y repite hasta que no quedan, sin volver sobre los ya
  intentados. `GET /api/v1/delivery/unlocated` y `POST /api/v1/delivery/locate-missing`.
- **Detalle del pedido.** Si el pedido no tiene coordenadas y se puede editar, aparece "Ubicar
  dirección" junto al domicilio (`POST /api/v1/orders/:id/locate`). Si el resultado no es seguro se
  muestran los candidatos y "Usar esta" (la misma confirmación de la ficha del cliente).
- **Domicilio del pedido.** Los pedidos que entraron por email o planilla no tienen domicilio
  propio, y `createRoute` los une a la ruta por ese domicilio. Al ubicar se **crea el domicilio**
  del cliente a partir del texto del pedido, en la zona del pedido o en la única zona activa de la
  ciudad, y se vincula al pedido. Con más de una zona y ninguna en el pedido responde "asigná la
  zona" en lugar de adivinar.
- **Normalizador (Gemini u otro).** Tarea de IA `normalize_address` (`packages/ai`), con
  instrucción por defecto en el código —no hace falta crear una plantilla—, reemplazable desde las
  plantillas de IA. Usa el proveedor de IA que esté configurado y queda en el registro de
  ejecuciones. Devuelve calle, número, piso, depto, barrio, ciudad y la consulta limpia; nunca
  coordenadas. `SanitizingGeocodingProvider` geocodifica la consulta limpia y, si no encuentra
  nada o la IA falla, el texto tal cual: **la ubicación no depende de que haya IA**. Un enlace de
  ubicación manda y no llama a la IA. Sólo viaja el texto de la dirección.
- **Aceptar sola** sólo con confianza ≥ 0,9 **y** dentro de 60 km del origen de la ciudad. **El
  origen es opcional**: sin él la referencia es el centro (mediana) de las direcciones ya
  confirmadas de la ciudad, y la primera dirección queda para que la confirme una persona. Fijos por ahora, en
  `LOCATE_RULES` de `app.ts`; la configuración por ciudad es la fase 3. Nunca pisa un domicilio
  que ya tiene coordenadas.
- Los botones de la ficha del cliente también se benefician: el proveedor envuelto ordena el
  texto antes de buscar, y la ciudad del domicilio orienta al normalizador.

## Fases 3 y 4

- **Ajustes por ciudad** (Panel de control → Direcciones, `site_geocoding_settings`, migración
  0054): ordenar el texto con IA sí/no, aceptar sola sí/no, seguridad mínima (50–100 %, por
  defecto 90), radio máximo desde el origen (por defecto 60 km) y una referencia de la ciudad
  ("Cipolletti, Río Negro, Argentina") que orienta la búsqueda. Ver exige `sites.read`; cambiar,
  `sites.manage`. Cada cambio queda en la auditoría con el antes y el después. Sin fila guardada
  valen los valores por defecto.
- **Sobre el "orden de procedimientos" del plan.** Se implementó como interruptores (IA sí/no,
  aceptar sola sí/no) y no como una lista que se reordena: hoy hay un solo geocodificador, y
  reordenar pasos que no existen sería configuración sin efecto. El orden fijo es enlace de
  ubicación → coordenadas ya conocidas → IA + mapa → mapa solo. Si se suma otro geocodificador,
  la lista ordenable pasa a tener sentido.
- **Ubicar al importar.** El diálogo de importar pedidos trae la casilla "Ubicar las direcciones"
  (encendida por defecto): al terminar, ubica los pedidos recién creados de a 5 y avisa cuántos
  quedaron con ubicación y cuántos para revisar. La importación devuelve los ids creados.
- **Métricas** en la misma pantalla, por período (7/30/90 días): solicitudes de ubicación de la
  ciudad (confirmadas con su porcentaje, esperando revisión, no encontradas, con error) y lo que
  usó la IA (llamadas, fallidas, tokens, demora media; esto último es de todo el sistema). Sirve
  para calibrar el umbral con datos.
