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

## Sin clave de Google: enlaces cortos, Georef y OpenStreetMap

Orden de búsqueda cuando no hay clave de Google (o Google está caído):

1. **El enlace de ubicación.** Los enlaces cortos de Maps ("maps.app.goo.gl/…", los que se
   comparten desde el teléfono) no traen coordenadas a la vista; el servidor sigue la redirección
   leyendo sólo el encabezado `location` (`LinkExpandingGeocodingProvider`), y de ahí toma el pin
   del lugar (`!3d…!4d…`), que es más preciso que el centro de la vista (`@lat,lng`). Sólo sigue
   enlaces de Google. Si el pedido trae un enlace y su domicilio no tiene ninguno, se le pasa antes
   de buscar (antes se ignoraba y se buscaba sólo el texto).
2. **Georef** (`GeorefGeocodingProvider`, apis.datos.gob.ar): la API de datos abiertos del
   gobierno nacional, gratis y sin clave, con las alturas de cada cuadra del país. Elegida por el
   usuario el 2026-10-12 después de que OpenStreetMap no encontrara casi ninguna dirección de CABA
   (tiene pocos números de puerta cargados). Le viaja sólo la calle con su número y la provincia
   (más el departamento fuera de la Ciudad), que sale del origen de la ciudad preguntándole a
   Georef en qué provincia cae. Seguridad: 0,95 si es el único resultado, el único que se llama
   exactamente como se escribió ("Rivadavia" frente a "Comodoro Martín Rivadavia"), o el único
   cercano (a menos de 10 km cuando el otro está a más de 20); si no, 0,75 y va a revisión. Lo que
   queda a más de 60 km del origen se descarta. **Hace falta que la ciudad tenga cargado su
   origen** para acotar la provincia y para aceptar sola.
3. **OpenStreetMap** si Georef no encuentra nada o no responde.

Antes de buscar, `searchableAddress` limpia el texto: saca el piso o depto pegado al número
("8520-17A", "piso 3 dto B") y el nombre de la zona de reparto ("Zona General"), que no son lugares.

## Respaldo con OpenStreetMap y limpieza de la semilla

- **Sin clave de Google, busca en OpenStreetMap** (`NominatimGeocodingProvider` en
  `@verdeo/geocoding`): gratis y sin clave, una consulta por segundo como pide su regla de uso,
  limitado a Argentina. La seguridad sale del tipo de resultado: con número de puerta 0,95, un
  edificio 0,9, una calle sin número 0,6 y un barrio o ciudad 0,4; así el umbral de 0,9 acepta solo
  lo que tiene número y manda el resto a revisar. Un enlace de ubicación pegado sigue teniendo
  prioridad. Cuando se configure la clave de Google, pasa a usarse Google sin tocar nada más.
- **Coordenadas falsas de la semilla de carga.** `seed-load-test.ts` ponía puntos al azar
  alrededor del Obelisco, marcados como confirmados (algunos caían en el río). Toda ubicación que
  pone la aplicación deja su búsqueda en `geocoding_requests`, así que un domicilio con
  coordenadas y sin búsquedas no pasó nunca por el ubicador.
  `pnpm db:reset-unverified-locations --produccion [--dry-run]` les borra las coordenadas (y el
  enlace cuando apunta al mismo punto, para que no se vuelva a tomar como elegido a mano) y los
  deja "sin ubicación"; después, "Ubicar los pedidos" en Rutas los busca de verdad.

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

## Buscar de nuevo desde el pedido (2026-10-13)

- `searchableAddress` corta la calle en la altura: lo que viene después ("Edif San Marcos 29 B
  dejar al guardia") no lo entiende un buscador y hacía que no apareciera nada. La altura es el
  primer número que sigue a una palabra ("25 de Mayo 300" queda entero; "Calle 7 n° 1234" también).
- "Ubicar dirección" en el detalle del pedido, si no encuentra la dirección o no está seguro, deja
  **corregir la dirección** o **pegar la ubicación** (enlace de Google Maps o coordenadas
  "-34.58, -58.41") y buscar de nuevo (`POST /orders/:id/locate` con `{ address?, location? }`).
  Lo corregido se guarda en el pedido y en su domicilio (auditado como
  `customer.address_relocated_from_order`), y el domicilio se vuelve a buscar aunque ya tuviera
  coordenadas. Una dirección corregida sin enlace nuevo borra el enlace viejo, que apuntaba a lo de
  antes. Cuando hay candidatos dudosos se siguen mostrando para elegir.

## Asistente de ubicaciones (2026-10-16)

Pedido del usuario: un asistente para dejar con ubicación a todos los clientes que no la tienen,
con los módulos que ya existen pero ordenados para conciliar de corrido. Todavía sin lugar en el
menú: se entra desde el tablero ("Conciliar ubicaciones", en los módulos de escritorio y en
"Empezar algo" del teléfono). Ruta `/app/ubicaciones`.

- **Qué lista**: los domicilios activos de clientes activos sin coordenadas
  (`GET /api/v1/address-locations/pending`, con la ciudad del alcance). Primero los que tienen
  pedidos en un período abierto —salen en la próxima hoja de ruta—, después por el último pedido y
  por nombre. Con la cuenta total y las ubicadas, para la barra de avance.
- **Paso 1, automático**: recorre los pendientes de a uno con el mismo ubicador de "Ubicar
  dirección" (la ciudad, su origen y sus reglas de aceptación). Lo seguro y dentro de la ciudad
  queda confirmado; se puede frenar a mitad.
- **Paso 2, uno por uno**: la cola a la izquierda (abajo y deslizable en el teléfono) y el domicilio
  en foco: los candidatos que encontró el mapa, cada uno con su mapa chico para ver dónde cae y
  "Es ésta"; corregir la dirección o pegar la ubicación (enlace de Maps o coordenadas) y buscar de
  nuevo; enlaces a Google Maps, a la ubicación que mandó el cliente y a su ficha; y "Saltar por
  ahora".
- **Backend**: `locateCustomerAddress` ubica un domicilio sin pasar por un pedido
  (`POST /api/v1/address-locations/:id/locate` con `{ customerId, address?, location? }`; lo
  corregido queda auditado como `customer.address_relocated`). Comparte con `locateOrderAddress`
  la búsqueda y la decisión (`geocodeAndDecide`). Los candidatos ahora traen sus coordenadas.
- **Permisos**: los mismos que geocodificar desde la ficha del cliente —ver con
  `customers.read` + `customers.view_sensitive`, ubicar con `customers.edit` además—, porque la
  dirección es un dato sensible. Hoy eso es el superadmin; si un operador lo tiene que usar, hay que
  darle `customers.view_sensitive`.

### La ubicación pegada de Google Maps manda (2026-10-16)

Pedido del usuario: Google Maps encuentra bien direcciones que OpenStreetMap ubica mal, así que lo
que se pega de Maps tiene que poder usarse tal cual.

- **Se confirma sin reglas automáticas.** Cuando una persona pega una ubicación (en el asistente o
  en "Ubicar dirección" del pedido) y el punto sale de ahí, queda confirmado aunque esté lejos del
  origen o la ciudad no tenga origen: lo eligió alguien mirando el mapa. Si de lo pegado no sale un
  punto (un enlace sin coordenadas que no se pudo expandir), se busca el texto como siempre y el
  resultado sigue pasando por las reglas.
- **Formatos que se leen**: enlaces largos de Maps (el pin `!3d…!4d…`, `@lat,lng`, `?q=`), los
  cortos que se comparten desde el teléfono (`maps.app.goo.gl`, se siguen las redirecciones), los
  de `/maps/place/lat,lng` y `/maps/search/lat,lng`, coordenadas decimales con o sin coma
  (`-34.60361, -58.38158`) y en grados, minutos y segundos como las muestra Maps
  (`34°36'13.0"S 58°22'53.7"W`).
- **En el asistente** es lo primero del domicilio en foco: "¿Google Maps la encuentra bien? Pegá
  acá su ubicación" → **Usar esta ubicación**. Corregir la dirección quedó aparte, abajo.

### Sólo lugares de la ciudad (2026-10-16)

Pedido del usuario: la ubicación tiene que ser de la Argentina y de la zona en cuestión, no de
otras provincias; OpenStreetMap ofrecía opciones muy lejanas.

- **La búsqueda se acota a la ciudad**: OpenStreetMap busca sólo dentro del recuadro de la ciudad
  (`viewbox` + `bounded=1`, del tamaño del radio configurado, 60 km por defecto) y siempre en la
  Argentina. Google, si se configura, se limita al país (`components=country:AR`) y se orienta al
  mismo recuadro. Georef ya buscaba en la provincia del origen.
- **Sin origen cargado**, el recuadro se arma alrededor del centro de los domicilios ya
  confirmados de la ciudad.
- **Lo lejano no se ofrece**: los candidatos fuera del radio no aparecen para elegir ni cuentan
  para aceptar solo. Si todo lo que encontró queda lejos, vuelve como "no encontrada" con el
  motivo ("Sólo encontró lugares lejos de la ciudad…") y la sugerencia de pegar la ubicación de
  Google Maps, que sigue mandando aunque quede lejos (la eligió una persona).

## Domicilio en dos líneas (2026-10-19)

Los operadores cargaban la dirección completa en un solo campo (calle, número, piso, depto, barrio,
detalles), y eso iba entero al buscador. Ahora la dirección tiene dos líneas: la **línea 1** (calle,
número y ciudad) es lo único que se geocodifica; la **línea 2** (`orders.delivery_address_line2` y
`customer_addresses.unit`) es para quien reparte y no se manda al buscador. Un test
(`packages/db/src/address-line2.test.ts`) asegura que la consulta no lleva la línea 2.

## Separar el detalle de las direcciones viejas e importadas (2026-10-24)

- `splitAddressDetail` (`packages/customers/src/address-detail.ts`, con los casos reales de la
  planilla como tests): en el primer tramo, todo lo que viene después del número de la calle es
  detalle (el número no es parte del nombre: "9 de Julio", "27 de Abril"); un tramo después de una
  coma es detalle si tiene números o palabras de detalle ("casa", "recibe", "piso"…), si no es parte
  de la ciudad.
- **Importación** (mail y planilla): la vista previa ya trae la dirección separada en dos líneas y
  se puede corregir; la línea 2 llega al pedido.
- **Domicilios viejos**: en Conciliar ubicaciones, "Separar el detalle de la dirección" propone la
  separación de cada domicilio sin línea 2 y se aplica a los elegidos
  (`GET /api/v1/address-locations/detail-proposals`, `POST .../detail-split`); también a sus pedidos
  abiertos con la misma dirección. La ubicación no se toca.
