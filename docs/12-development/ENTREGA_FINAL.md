# Entrega final — estado y lo que falta

Fecha de este relevamiento: **30 de septiembre de 2026**. Entrega: **primera semana de octubre**.

Todo está deployado: `verdeo-monorepo-web` y `verdeo-monorepo-api` en Vercel, base en Neon. La
aplicación está en uso con datos de prueba sobre la base de producción.

## Qué hay construido

| Dimensión         | Número                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| Endpoints         | 220                                                                        |
| Pantallas         | 45                                                                         |
| Migraciones       | 48                                                                         |
| Tests             | 741, en verde (`pnpm check`)                                               |
| Paquetes internos | contracts, db, orders, rbac, routing, audit, observability, ai, auth, chat |

Fases 0 a 8 y 10 cerradas (ver `docs/08-delivery/IMPLEMENTATION_ROADMAP.md`). La 9 —QA y piloto— es
lo que queda, y es sobre todo trabajo humano: cargar la operación real, correr una semana completa y
limpiar los datos de prueba.

## Bloqueante para abrir

Ordenado por lo que frena a lo demás.

1. **Usuarios de producción.** Hoy hay tres usuarios de prueba. Cada persona necesita correo, rol y
   ciudad. Dos caminos:
   - Desde el panel: Usuarios → invitación, que ya ata rol y ciudad, y la persona elige su clave al
     redimirla. Es el camino recomendado.
   - Desde la línea de comandos, para el primer superadmin de una instalación nueva:
     `pnpm auth:provision-user -- --email … --role … --display-name … --site <slug>`.
     **`--site` es nuevo**: sin ciudad asignada, quien no sea superadmin entra al panel y no ve
     nada, porque el alcance sale de `user_operating_sites`.
2. ~~Correr `pnpm db:seed-permissions` contra producción.~~ **Hecho el 1 de octubre de 2026**: 18
   concesiones nuevas al rol `operador`, que había salido sin ningún permiso de `orders.*` ni de
   `customers.*`. El script es idempotente, así que volver a correrlo no cambia nada.
3. **Aplicar las migraciones pendientes a producción**: `pnpm db:migrate --produccion`. El deploy de
   Vercel no las corre, así que una versión que agrega columnas queda desplegada contra una base que
   no las tiene. Es lo primero a revisar cuando algo funciona en local y falla en producción.

   **Cómo se ve cuando falta una**: las pantallas que listan menús —Períodos, Pedidos, Cocina—
   dejan de cargar, y Períodos decía "Todavía no hay semanas cargadas", que parece una pérdida de
   datos y no lo es. Ahora muestra el error de carga en vez de una lista vacía, pero la causa sigue
   siendo la misma: migrar.

   `--produccion` lee `DATABASE_URL_PROD` del `.env` e imprime a qué servidor apunta antes de hacer
   nada (sólo el host, nunca la clave). Sirve para todos los scripts de `packages/db`:
   `db:seed-permissions`, `db:wipe-operations`, `db:retire-repartidor`. No es el comportamiento por
   defecto —sin la bandera ni `DATABASE_URL`, el script se niega a correr—, y si se pasan las dos
   también se niega, porque son dos bases distintas. Reemplaza a una línea larga que la terminal
   partía en dos al copiarla, y el comando corría sin la variable.

4. **Limpiar los datos de prueba**: ~335 clientes y ~305 pedidos que no son reales. Hay un comando,
   `pnpm db:wipe-operations`, que borra clientes, pedidos, cobros, paradas de reparto,
   conversaciones (incluidos los eventos crudos del webhook, que traen números y textos reales),
   avisos y respuestas de encuestas, y **deja el catálogo intacto** —ciudades,
   zonas, menús, períodos, precios, métodos de pago, usuarios, roles, plantillas, ayuda y
   contenidos del sitio—.

   No es un `delete from customers`: cuatro claves foráneas son `restrict`
   (`orders.customer_id`, `delivery_stops.order_id`, `cash_collections.order_id`,
   `cash_settlements.collection_id`) y con el orden equivocado Postgres tumba la transacción
   entera sin borrar nada. El orden está probado contra un Postgres real en
   `wipe-operations.test.ts`, con una fila en cada barrera.

   **Bajar el respaldo antes** (`/app/respaldos`): esto no se puede deshacer. `--dry-run` cuenta
   sin borrar. Las hojas de ruta no se borran, sólo sus paradas —una ruta es del período, no del
   cliente—, y el comando dice cuántas quedaron vacías.

5. **Ciudades y zonas.** La landing anuncia más cobertura de la que el sistema tiene cargada:
   Córdoba no tiene zonas ni menús, Río Negro no tiene menús, Buenos Aires tiene una sola zona
   genérica, y ninguna ciudad tiene WhatsApp público ni punto de partida de reparto —sin eso el
   optimizador arranca desde la primera parada en vez de desde la cocina—. Es carga de la operación;
   el detalle está en `BACKLOG.md`, sección "Ciudades y zonas".
6. **Externos, no son código**: CUIT y domicilio legal para cerrar Privacidad y Términos —que
   habilitan publicar el OAuth de Google—, verificar el dominio de correo en Resend, confirmar el
   producto de Zenvia para WhatsApp, y el número de WhatsApp de "Hablar con alguien" del asistente.

## Resuelto en esta sesión

- **Qué entregar en cada parada.** La hoja de ruta decía a quién y dónde, pero no qué. Ahora cada
  parada dice "Menú Keto 400" o "Intuitivo 250 · Ana" —un Intuitivo se identifica por el nombre
  impreso, porque dos del mismo tamaño son combinaciones distintas— con las unidades cuando son más
  de una. Lo escribe el servidor una vez por hoja, así que la vista, el mensaje de WhatsApp, el CSV
  (columna "Qué entregar") y la app del repartidor dicen exactamente lo mismo.
- **El rol operador ya puede trabajar.** Lo que le toca a cada rol es data en un solo lugar
  (`packages/db/src/role-defaults.ts`) y lo aplica `db:seed-permissions`, que sí se puede correr
  contra una base en uso.
- **La restauración de un respaldo queda en auditoría**, en la misma transacción que la escritura.
- **`--site` en la provisión por línea de comandos.**

## Lo que queda y no bloquea

Nada de esto impide abrir; está acá para que la decisión de dejarlo afuera sea explícita.

- Dos artículos de ayuda escritos sin confirmar con la operación: "Pedidos que llegan por la web" y
  "Usuarios, roles y permisos".
- El texto de descongelado de la landing espera al dueño del producto.
- QR en etiquetas (en encuestas ya está).
- Ícono _maskable_ para Android.
- Búsqueda global con `Ctrl+K`.
- `EmptyState` en Contenidos, Usuarios y Mi cuenta.
- Sub-opciones del asistente de la landing: el contrato y el widget ya las soportan, la pantalla de
  configuración todavía no las deja editar.
- Agrupar la navegación por momento del ciclo semanal y no por módulo.
- Ventanas horarias en el ruteo.
- Adaptadores de Instagram, Messenger y correo; automatización de marketing.

## Riesgos conocidos

- **Un deploy de web que falla sin causa aparente**: revisar primero si el proyecto de Supabase está
  pausado. Ya pasó una vez y el síntoma no dice nada.
- **Una PWA vieja no se entera de un deploy** hasta que se cierra la pestaña. El aviso de versión
  nueva ya está, pero recién ayuda a partir de esta versión.
- **`apps/api/api/index.test.ts` es intermitente** bajo carga ("Hook timed out"). Si el gate falla
  ahí, verificarlo aislado antes de buscar la causa en otro lado.
- **El período de venta es uno solo a la vez** para todas las ciudades. Es deliberado, pero conviene
  que la operación lo sepa antes de la primera semana real.
