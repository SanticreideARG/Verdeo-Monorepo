# Versión 1.0: estabilización y seguridad (desde 2026-10-29)

## Dónde estamos

- Sprint 1 y MVP cerrados. La versión 1.0 corre en producción con uso real, aunque sigue en prueba.
- Desde ahora, lo más importante es **no romper el trabajo de quien está usando el sistema y no perder datos**. Las funciones nuevas pasan a segundo plano.
- Producción hoy:
  - Vercel publica `main` solo, en cada push.
  - Base principal en Neon. El acceso, el `keep_alive` y la copia del historial (`audit_mirror`) están en Supabase.
  - Las migraciones y las semillas las corre a mano el responsable (`--produccion`), **después** del deploy.
- CI: `.github/workflows/ci.yml` corre `pnpm check` en cada push y PR, pero **no frena nada**. Vercel despliega igual, aunque el CI falle.

## Qué falló y por qué

Caso del 2026-10-28: "Cierre de pedidos" respondía 500 ("Algo falló de nuestro lado").

1. El código que lee `kitchen_sheets` llegó a producción con el push.
2. La migración 0076, que crea esa tabla, se corrió después.
3. Entre esos dos momentos, la pantalla falló para todos.

Es el riesgo principal de esta forma de trabajar. Hoy **el deploy va primero y la migración después**, y tiene que ser al revés. No alcanza con tener más cuidado: tiene que asegurarlo el proceso.

## 1. Cambios a la base sin cortes

### Reglas para escribir migraciones (expandir y después contraer)

- **Una migración nunca puede romper el código que ya está desplegado.** El código viejo y la base nueva tienen que convivir durante un rato.
- **Sumar:** tablas, columnas que aceptan nulo o con valor por defecto, índices. Es seguro, siempre que la migración se aplique antes que el código que la usa.
- **Renombrar o cambiar el tipo de una columna:** nunca en un solo paso.
  1. Columna nueva.
  2. Código que escribe en las dos y lee la nueva.
  3. Copia de los datos.
  4. En otro deploy, borrar la vieja.
- **Borrar** tablas o columnas: solo cuando ningún deploy activo las usa, en un deploy aparte y con un respaldo de la base recién sacado.
- **`NOT NULL` en una columna con datos:** primero completar los datos, después la restricción.
- Una migración ya aplicada no se edita. Si algo salió mal, se corrige con otra migración.

### Orden de despliegue

Paso A, que se puede hacer ya, sin automatizar:

1. Si el commit trae migración, **primero** se crea una rama de Neon como respaldo (ver la sección 3).
2. Se corre `pnpm db:migrate --produccion`.
3. **Recién ahí** se pushea el código que usa la migración.

Para que no dependa de acordarse:

- la migración va en un commit propio, que se pushea solo;
- el código va en el commit siguiente.

Paso B, el despliegue automatizado (propuesta):

1. Apagar el deploy automático de `main` en Vercel (Ignored Build Step, o sacar la rama de producción de Git).
2. Sumar a CI un trabajo `deploy` que corre solo en `main` y solo si `quality` pasó:
   1. `pnpm db:migrate` contra producción, con `DATABASE_URL` como secreto de GitHub. Ya no se lee de un `.env` local.
   2. Si hay migración nueva, antes crea una rama de Neon como respaldo, con la API de Neon.
   3. Llama al deploy hook de Vercel.
   4. Corre las semillas de ayuda y novedades, si cambiaron.
3. Resultado: **nada llega a producción si no pasó el chequeo, y nunca antes que su migración.** Si algo falla, GitHub manda un correo.

### Alarma de migración pendiente

- Se suma una sonda en "Estado del sistema" (`/app/sistema`) que compara la última migración del repositorio (`meta/_journal.json`, incluido en la build) con la última aplicada en `drizzle.__drizzle_migrations`.
- Si no coinciden, el panel muestra la alarma en rojo, con el nombre de la que falta.
- También va en el keep-alive diario, para que llegue por correo.

## 2. Trabajo en local primero

- **Ramas:** cada cambio se trabaja en una rama y se integra a `main` por PR, con el CI en verde. Activar la protección de `main` en GitHub: PR obligatorio, CI obligatorio y sin force push.
  - Mientras haya una sola persona programando, alcanza con que el CI sea obligatorio. La revisión de PR puede quedar opcional.
- **Antes de cada push**, como ya se hace:
  1. `pnpm format`, `pnpm lint` y `pnpm typecheck`;
  2. `pnpm check` completo.
- **Probar contra datos reales sin tocarlos.** Una rama de Neon creada desde producción es una copia al instante y no cuesta casi nada.
  - Ahí se prueban las migraciones antes de aplicarlas en producción: si fallan, fallan en la copia.
  - La rama se borra al terminar. **Los datos de esa copia nunca salen de Neon:** no se bajan, no se suben al repo y no se usan en tests.
- **Entorno de previsualización:** los deploys de vista previa de Vercel tienen que apuntar a una rama de Neon con datos de prueba, nunca a producción (ya figura en `VERCEL_DEPLOYMENT.md`).
- **Ventana de despliegue:**
  - No desplegar durante el cierre de pedidos ni en días de reparto. Mejor de noche, o el día siguiente al reparto.
  - Si el cambio toca pedidos, cocina o cobros, se avisa antes.
- **Tandas más chicas.** Un commit con cinco funciones es cinco veces más difícil de revertir. Mientras dure la estabilización: un cambio por commit, y los arreglos aparte de las funciones nuevas.

## 3. Respaldos

Son cuatro capas. Cada una cubre algo que las demás no cubren.

| Capa                                        | Qué cubre                                                     | Frecuencia                                 | Dónde queda                                                 |
| ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Restauración a un momento (PITR) de Neon    | Volver la base entera a un minuto dado                        | Continua                                   | Neon. La ventana depende del plan: revisarla y anotarla acá |
| Rama de Neon antes de cada migración        | Deshacer una migración que salió mal                          | En cada migración                          | Neon, con nombre `pre-00NN-AAAA-MM-DD`; se guardan 30 días  |
| Volcado lógico nocturno (`pg_dump`) cifrado | Que se caiga Neon, se borre el proyecto o se pierda la cuenta | Diaria, desde una Action programada        | Fuera de Neon, cifrado con `age`; 30 diarios y 12 mensuales |
| Exportación desde la app (`/app/respaldos`) | Recuperar algo puntual sin volver atrás todo                  | Semanal, a mano, la descarga el superadmin | Disco del responsable, cifrado                              |

Reglas:

- **Los volcados tienen datos de clientes:** nombres, teléfonos y direcciones.
  - Nunca como artefacto público de GitHub, nunca en el repo y nunca sin cifrar.
  - La clave para descifrar no se guarda junto al archivo.
- **Un respaldo que nunca se restauró no es un respaldo.** Una vez por mes:
  1. restaurar el último volcado en una rama de Neon nueva;
  2. correr las migraciones;
  3. abrir la app de prueba contra esa rama y contar pedidos y clientes;
  4. anotar acá cuánto tardó y quién lo hizo, y borrar la rama.
- **Objetivos a acordar:**
  - pérdida máxima aceptable de datos (RPO): propuesta, 1 hora con PITR y 24 horas sin PITR;
  - tiempo máximo para volver a funcionar (RTO): propuesta, 2 horas.
- **Quién puede restaurar:** solo el responsable técnico. Una restauración se decide escrita, con el momento elegido, antes de hacerla.

## 4. Seguridad

Prioridad alta:

- **Doble factor** en GitHub, Vercel, Neon, Supabase, Resend y el correo del responsable. Son las llaves de todo.
- **Protección de `main`**, como se describe en la sección 2.
- **Usuarios de la base separados:**
  - la app corre con un usuario que lee y escribe datos, pero no puede cambiar el esquema;
  - las migraciones corren con otro usuario, que solo usa el CI.
  - Hoy es uno solo.
- **`audit_mirror` en Supabase** tiene una política abierta para la clave pública (`for all to anon`). Cualquiera que tenga esa clave puede leer y escribir el historial copiado. Hay que pasar a una clave de servicio del lado del servidor y cerrar la política.
- **Rotar los secretos** que alguna vez se pegaron en un chat, en una terminal compartida o en una captura: `CRON_SECRET`, las claves de la API y la URL de la base.

- **Límite de intentos.** Hoy no hay ninguno: el código de error `RATE_LIMITED` existe en los contratos, pero ningún endpoint lo usa. Empezar por el login, el acceso por correo del portal de cliente, las encuestas abiertas y el asistente de la landing, que además gasta IA.

Prioridad media:

- Dependabot o Renovate, para avisos de seguridad de dependencias, junto con `pnpm audit` en el CI. Solo avisa: no corta el CI.
- Revisar los permisos: quién tiene `backups.manage`, `orders.delete` y superadmin. Sacar las cuentas de prueba de producción.
- Antes de abrir: limpiar los datos de prueba (`db:purge-test-data`), ya listado como bloqueo.

## 5. Qué transmitir al equipo

- **Si ven "Algo falló de nuestro lado"**, que manden una captura con el número de solicitud. Con ese número se encuentra el error en minutos. Sin él, no.
- **Avisos de mantenimiento:** cuando un cambio toque pedidos, cocina o cobros, se avisa por el feed del tablero con día y hora. Mientras dure, no se cargan pedidos.
- **Novedades:** cada cambio visible llega a "Novedades" del panel. Conviene leerlas antes de preguntar por qué algo se ve distinto.
- **No cargar datos de prueba en producción**, como clientes "Prueba" o pedidos de ensayo. Si hace falta practicar, se pide un entorno de prueba.
- **Cuentas personales:** cada persona usa la suya, sin compartir contraseñas. El historial dice quién hizo qué y eso solo sirve si cada cuenta es de una persona.
- **Antes de borrar o cancelar en lote**, chequear el período y la ciudad elegidos arriba. Es el error más fácil y el que más cuesta deshacer.

## Plan de la etapa

Ver `BACKLOG.md`, sección "V1.0 - Estabilización y seguridad". En orden:

1. Orden de despliegue A: la migración antes que el código. Rige desde hoy y no lleva código.
2. Doble factor en todas las cuentas, protección de `main` y límite de intentos en login y endpoints públicos.
3. Alarma de migración pendiente en Estado del sistema.
4. Volcado nocturno cifrado y primer simulacro de restauración.
5. Despliegue B: el CI migra y despliega.
6. Usuarios de base separados y cerrar `audit_mirror`.
7. Dependabot o Renovate y revisión de permisos.
