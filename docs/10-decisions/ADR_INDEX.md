# Architecture Decision Records

## ADR-001 - Serverless-first

**Status:** Accepted
Core en Vercel/Neon. Procesos persistentes sólo si una integración futura lo exige.

## ADR-002 - Hono + Node runtime

**Status:** Accepted
Hono/TypeScript sobre funciones Node.js.

## ADR-003 - PostgreSQL / Neon

**Status:** Accepted  
Fuente única de verdad, conexiones pooled.

## ADR-004 - RBAC dinámico

**Status:** Accepted  
Multi-role + permission overrides.

## ADR-005 - Customer separado de User

**Status:** Accepted  
CRM no depende de que cliente tenga login.

## ADR-006 - External identities

**Status:** Accepted  
WhatsApp/email/Instagram/etc. como identidades de Customer.

## ADR-007 - Messaging provider abstraction

**Status:** Accepted  
V1 WhatsApp; futuros Instagram/Messenger/email.

## ADR-008 - Meta Cloud API

**Status:** Accepted  
No Puppeteer/Evolution como dependencia de V1.

## ADR-009 - AI provider abstraction

**Status:** Accepted  
OpenAI/Gemini/Anthropic/DeepSeek/OpenAI-compatible.

## ADR-010 - AI non-authoritative

**Status:** Accepted  
Código/SQL decide reglas críticas.

## ADR-011 - Weekly menu history

**Status:** Accepted  
Conservar indefinidamente.

## ADR-012 - Order public number

**Status:** Superseded by ADR-028
ID interno UUID + número global `Nxxxxx`.

## ADR-013 - Production snapshots

**Status:** Accepted  
Parcial martes 20:00 + final miércoles 19:00 + delta.

## ADR-014 - Delivery PII minimization

**Status:** Accepted  
El repartidor no recibe contactos.

## ADR-015 - CMS typed sections

**Status:** Accepted  
CMS acotado, no page builder genérico.

## ADR-016 - Deterministic route optimizer

**Status:** Accepted  
LLM no optimiza rutas como motor principal.

## ADR-017 - Event-oriented core

**Status:** Accepted  
Mutaciones importantes emiten eventos de dominio.

## ADR-018 - Price snapshot on order item

**Status:** Accepted  
Histórico no cambia al actualizar precios.

## ADR-019 - Provider-neutral authentication boundary

**Status:** Accepted

El Core representa identidades de autenticación por `provider + providerSubject`. Los adaptadores OAuth
resuelven la identidad y el Core mantiene sesiones revocables, guardando sólo hashes de tokens opacos.
Supabase Auth fue seleccionado posteriormente como broker y Google como primer proveedor bajo ADR-029.

## ADR-020 - Acceso MVP mediante credenciales provisionadas

**Status:** Accepted

El sprint MVP habilita email/contraseña únicamente para cuentas creadas por un operador mediante CLI. No
existe registro público ni asignación de privilegios por email sin una transacción de provisión auditada.
Las contraseñas aleatorias se muestran una sola vez, se persisten con scrypt y se bloquean temporalmente
tras cinco intentos fallidos. OAuth se añadirá después como otra `AuthIdentity` del mismo `User`; la
confirmación por correo y Resend quedan fuera de este sprint.

## ADR-021 - Pedido MVP con snapshots y cocina determinista

**Status:** Accepted

El menú, cliente y pedido se persisten en PostgreSQL. Cada `OrderItem` conserva nombre comercial, variante,
precio y composición; el consolidado de cocina se calcula desde pedidos persistidos por código/SQL. Una
composición modificada se guarda como Intuitivo y no altera el catálogo semanal publicado.

## ADR-022 - Claves IA configurables cifradas en servidor

**Status:** Accepted

Los proveedores y modelos son datos configurables. Las API keys ingresadas por Staff se cifran mediante
AES-256-GCM con una clave maestra exclusiva del servidor; el frontend recibe únicamente estado y máscara.
La configuración no habilita ejecución hasta implementar Prompt Registry, routing, cuotas y auditoría de
ejecuciones.

## ADR-023 - Captura asistida con confirmación humana

**Status:** Accepted

La extracción desde conversaciones produce un único borrador estructurado validado, nunca un pedido real.
Un operador vincula el cliente, revisa ítems, cantidades y precios, y confirma la creación mediante el motor
determinista. Las sugerencias de respuesta también requieren revisión y envío humano en V1.

## ADR-024 - Estados operativos del pedido

**Status:** Accepted

El MVP conserva `DRAFT/CONFIRMED/READY/DELIVERED/CANCELLED` como ciclo resumido del pedido. Producción,
ruteo y entrega detallada son dominios relacionados con estados propios; no se agregan `produccion` o
`reparto` al estado comercial. Las reversiones y cancelaciones requieren motivo, las reversiones además
confirmación explícita. Al cerrar el ciclo se bloquean confirmaciones, cancelaciones y retornos a
`CONFIRMED`, salvo permiso `orders.override_cycle_lock`; el avance normal `CONFIRMED -> READY -> DELIVERED`
continúa permitido.

## ADR-025 - CRM como fuente única y snapshots en pedidos

**Status:** Accepted

`Customer` es la fuente única del cliente comercial. Sus teléfonos, WhatsApp, emails y otros canales se
guardan como `CustomerIdentity` normalizadas; los domicilios se modelan como relaciones independientes y
pueden conservar texto escrito, enlace de ubicación y coordenadas. Un pedido puede referenciar el domicilio
usado, pero siempre guarda snapshots de dirección y enlace para que su histórico no cambie al editar el CRM.
Preferencias y restricciones no modifican retrospectivamente pedidos. Las plantillas de mensajes usan claves
de acción configurables y sus variables deben coincidir exactamente con el cuerpo antes de persistirse.

## ADR-026 - Revisión inmutable antes de editar pedidos

**Status:** Accepted

Cada edición operativa persiste primero una revisión JSON completa del pedido bajo bloqueo transaccional de
fila. La composición se reemplaza como unidad, se vuelve a resolver contra las ofertas del menú original y
los totales se recalculan en código usando enteros. Sólo `DRAFT` y `CONFIRMED` admiten cambios de composición;
otros estados requieren una transición explícita previa. Los CSV se generan desde filtros validados, se
auditan, neutralizan fórmulas de planilla y rechazan exportaciones superiores a 5000 registros.

## ADR-027 - Geocodificación reemplazable con confirmación humana

**Status:** Accepted

El Core persiste cada solicitud y sus candidatos normalizados antes de que una ubicación pase a ser
operativa. Un adaptador reemplazable encapsula al proveedor; el MVP `location-link` extrae coordenadas de
enlaces que ya las contienen y devuelve `NO_MATCH` cuando no puede resolverlos, sin inventar datos ni
seguir enlaces cortos. La respuesta cruda del proveedor no es fuente de verdad y no se conserva.

Toda selección o corrección requiere confirmación humana. Ciudad, sector y zona operativa siguen siendo
datos configurables o elegidos por el operador: el proveedor no los convierte automáticamente en reglas de
negocio. Las solicitudes son idempotentes, los fallos dejan el domicilio en `NEEDS_LOCATION` y las
mutaciones generan auditoría y eventos sin incluir coordenadas ni texto del domicilio en sus payloads.

## ADR-028 - Operaciones y zonas geográficas configurables

**Status:** Accepted

`OperatingSite` representa el límite operativo y de acceso para pedidos, cocina, reparto y configuración.
`GeographicZone` representa una cobertura geográfica configurable y pertenece a un `OperatingSite`. Son
entidades diferentes: una operación puede usar una o varias zonas sin cambiar el modelo ni el código.

Los usuarios acceden a operaciones mediante membresías explícitas. Superadmin puede seleccionar una
operación o la vista global consolidada; otros usuarios sólo reciben las operaciones asignadas. El alcance
se aplica en repositorios y servicios, no únicamente en la interfaz. No se crean tablas físicas por región:
los registros operativos comparten tablas y se aíslan mediante `operatingSiteId` e índices compuestos.

Los clientes conservan una identidad CRM global, mientras sus relaciones operativas y domicilios pueden
asociarse a una operación y zona. La migración inicial asignará los registros sin alcance a Neuquén.
Bahía Blanca no forma parte del alta inicial.

Los números públicos de pedido mantienen UUID interno y secuencia legible, pero sustituyen el prefijo global
por un prefijo configurable por operación. La asignación debe ser transaccional y segura ante concurrencia;
el formato exacto es dato administrable y nunca una condición hardcodeada.

Los menús pueden originarse globalmente y distribuirse como revisiones independientes por operación. Una
distribución no sobrescribe personalizaciones regionales sin vista previa, permiso y confirmación explícita.

## ADR-029 - Supabase Auth como broker OAuth para Staff

**Status:** Accepted

Supabase Auth ejecuta OAuth/PKCE y Google es el primer proveedor habilitado. Neon continúa siendo la fuente
de verdad de `User`, `AuthIdentity`, sesiones, RBAC, zonas y auditoría. La API valida el access token contra
el proyecto Supabase configurado y guarda el UUID estable del usuario Supabase como
`AuthIdentity(provider = 'supabase', providerSubject = sub)`.

El primer vínculo exige email confirmado y coincidencia con un usuario interno activo previamente
provisionado. Una identidad externa no crea usuarios, roles, permisos ni membresías geográficas. Después de
resolver la identidad, la API emite la misma sesión opaca HttpOnly que utiliza el adaptador de contraseña;
los tokens Supabase no se persisten en Neon ni se devuelven como credencial operativa. El login provisionado
por contraseña se conserva durante el rollout y la política definitiva de MFA/recuperación permanece OPEN.

## ADR-030 - Catálogo de menús: tamaño, precio y composición

**Status:** Accepted

El precio de una unidad depende del tamaño y del alcance comercial, nunca de la variedad. Dos variedades
distintas del mismo tamaño valen igual dentro de la misma operación. Por eso el precio deja de vivir en la
oferta (menú x variante) y pasa a una lista por tamaño; la oferta conserva un override opcional para
excepciones deliberadas, no como valor por defecto.

El tamaño deja de estar embebido en el código de la variante y pasa a ser un catálogo administrable con
nombre comercial, comidas por unidad y orden de presentación. `250` y `400` son nombres comerciales y no
expresan unidad de medida.

Una variedad declara su tipo de composición como dato. Las variedades fijas definen cinco platos; la
variedad componible permite que el cliente elija cinco platos del universo publicado esa semana para su
mismo tamaño. Ninguna rama del motor puede identificar la variedad componible por su nombre: el nombre es
dato administrable y renombrarlo no debe alterar el comportamiento.

El `slot` 1..5 de un menú es orden de carga y presentación. No representa un día de entrega y no debe
usarse para organizar cocina, etiquetas ni reparto.

Los precios y la composición se congelan como snapshot en el pedido. Cambiar el catálogo o la lista de
precios nunca altera pedidos ya emitidos.

## ADR-031 - Alcance geográfico derivado de la zona de entrega

**Status:** Accepted

Refina ADR-028. Una operación cubre un área geográfica definida que puede incluir localidades vecinas; la
localidad escrita del domicilio es dato descriptivo y no determina alcance. La zona geográfica es el ancla
operativa: todo domicilio operativo debe referenciar una zona activa.

La operación de un pedido no se elige: se deriva de la zona del domicilio de entrega. El pedido persiste
zona y operación juntas, y una clave foránea compuesta contra la unicidad `(id, operating_site_id)` de la
zona garantiza en la base que no puedan pertenecer a operaciones distintas. La consistencia es una
restricción de esquema y no una validación de aplicación.

El selector superior determina el conjunto de datos que el operador ve y el valor por defecto al crear,
pero la autoridad sobre el alcance permitido es la membresía del usuario resuelta en el servidor. Una
operación sin membresía responde `403` y nunca una lista vacía.

El pedido web público resuelve su operación mediante un selector explícito del visitante. No se infiere
por IP, dominio ni geolocalización.

## ADR-032 - Mensajería interna separada del canal con clientes

**Status:** Proposed

La mensajería entre usuarios del staff es un dominio distinto del canal con clientes. Comparten la
palabra "mensaje" y nada más: distintos participantes, distintas reglas de privacidad, distinta
retención y distinta autorización. `Conversation`, `Message`, `MessagingAccount`, las tablas
`conversations`/`messages` y el grupo de permisos `messages.*` quedan reservados para el canal con
clientes. La mensajería interna usa tablas `staff_*` y el grupo `chat.*`.

El acceso al chat se expresa como el permiso `chat.use`, otorgado por seed a operadores, superadmins
y repartidores. Ninguna rama del código consulta el nombre de un rol: renombrar o dividir un rol no
puede cambiar quién habla.

Quién puede hablar con quién lo configura un superadmin y se resuelve con el mismo idioma que ya usa
la autorización: enlaces entre pares de roles como base, y excepciones explícitas por par de
personas. El `deny` de una excepción gana siempre, y en ausencia de reglas nadie puede iniciar una
conversación. La política de enlaces es la única autoridad sobre el alcance del chat: las
conversaciones no se filtran por operación, de modo que si un operador de una ciudad puede escribirle
a otra lo decide la matriz y no el alcance regional. Cambiar la política no borra conversaciones
existentes; sólo deja de permitir nuevas.

Una referencia compartida a un pedido o un cliente se persiste como puntero, nunca como copia, y se
resuelve en el momento de mostrarla con los permisos de quien la mira. Un snapshot congelaría datos
que el destinatario podría no tener permitido ver y quedaría desactualizado. Compartir una
referencia a un cliente es un evento de divulgación de PII y se audita; el cuerpo de los mensajes no.
Los mensajes viven treinta días y una purga diaria idempotente los elimina, de modo que la
auditoría de una divulgación sobrevive al mensaje que la produjo.

La ubicación es un par de coordenadas elegido por quien envía. El domicilio de un cliente no se
comparte como ubicación sino como referencia, para que aplique el control de permisos.

La presencia separa dos hechos: la conexión, derivada de un latido cuya frescura decide el servidor,
y el estado declarado por la persona. El estado efectivo es `offline` cuando el latido venció, y en
caso contrario el declarado. El servidor nunca adivina `away`. La presencia sólo es visible entre
personas que la política de enlaces ya conecta, y expone identificador, nombre visible y estado.

El transporte es sondeo con latido, detrás de un adaptador. Las funciones serverless no pueden
sostener un WebSocket. Supabase está disponible y su base está enlazada al proyecto, pero el
almacenamiento permanece en Neon: repartir usuarios y conversaciones entre dos bases sería la segunda
fuente de verdad que las reglas del repositorio prohíben. Además, el cliente Supabase del front se
crea sin refresco automático de token y los usuarios provisionados por contraseña nunca obtienen
sesión Supabase, así que una presencia basada en Realtime funcionaría para unas personas y no para
otras. Cuando exista una razón medida y un modelo de sesión que cubra a todos, sólo aplicarán canales
de Broadcast y Presence —la base es Neon, así que "Postgres Changes" no observa estas tablas— y un
broadcast anunciará que una conversación cambió sin transportar contenido.
