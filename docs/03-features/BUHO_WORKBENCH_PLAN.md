# El búho en el Workbench de IA — plan (2026-10-30)

Estado: **fases 1 a 3 hechas (2026-10-30)**, con 22 modos. La fase 4 (herramientas e historial) queda para más adelante.

**As built:** los modos están en `packages/ai/src/assistant-modes.ts` (tareas `buho_*` del catálogo, con prompt de fábrica y versionables desde "Prompts maestros"); la identidad común del búho es `BUHO_BASE_PROMPT`, que no se edita. Los datos los arma `apps/api/src/assistant-context.ts` (`clean` saca nombres, contactos, domicilios, notas e identificadores y pasa los importes a pesos; lo que falta cobrar va sumado). Rutas: `GET /api/v1/ai/assistant/modes` y `POST /api/v1/ai/assistant/messages` (tope de 150 consultas por persona y por día, `ASSISTANT_DAILY_LIMIT`). La pantalla es `BuhoAssistant`; el editor de antes es `AIPromptsAdmin`. La Ayuda quedó con un "?" y un acceso al búho.

## 1. Qué cambia

Hoy el Workbench de IA es una herramienta de administración: elegir una tarea, editar su prompt,
correr la versión activa con variables en JSON. Sólo lo ve quien tiene `ai.prompts.manage`. El búho
vive en el menú de Ayuda, como un árbol de artículos sin IA.

Pasa a ser **la mesa de trabajo con IA del equipo**, con el búho al centro:

1. **Analizar mensajes:** se pega un mensaje (de un cliente, un reclamo, un pedido por WhatsApp) en
   un cuadro grande y claro, se elige qué análisis hacer y la respuesta se **copia con un clic**.
2. **Preguntar sobre la operación:** "¿Cómo viene Octubre 5 contra Octubre 4?", "¿Qué variedad cayó
   más?", "¿Cuántos pedidos quedan sin cobrar en Córdoba?". El búho responde con los datos
   cargados en el sistema.
3. **Análisis del período:** el informe largo, armado con un prompt maestro, para leer o compartir.

Los **prompts maestros** son los que ustedes cargan: cada uno es un "modo" del búho (qué hace, con
qué tono, con qué datos). El editor de versiones de hoy queda como una pestaña para administrarlos.

## 2. Cómo se ve

```
┌───────────────────────────────────────────────────────────────────────┐
│ Workbench IA         [ Conversación ]  [ Prompts maestros ]  (admin)  │
├───────────────┬───────────────────────────────────────────────────────┤
│               │  ¿Qué hacemos?                                        │
│   (búho       │  [Analizar mensaje] [Responder a cliente]             │
│    grande,    │  [Análisis del período] [Preguntar sobre la operación] │
│    cambia     │  ──────────────────────────────────────────────────── │
│    según el   │  🦉 ¡Hola! Pegá un mensaje o preguntame algo.         │
│    estado)    │  Vos: ¿cómo viene el período?                         │
│               │  🦉 Octubre 5 lleva 142 pedidos (+8 % …)   [Copiar]   │
│  Período:     │  ──────────────────────────────────────────────────── │
│  Octubre 5 ▾  │  [ Pegar mensaje… ]  [ Escribí tu pregunta    ][Enviar]│
│  Ciudad: arriba│                                                      │
└───────────────┴───────────────────────────────────────────────────────┘
```

- **El búho** ocupa la columna izquierda, grande (las imágenes son de 1254 px y aguantan la escala).
  En el teléfono queda arriba, más chico, y la conversación abajo. Cambia de imagen según el estado:

  | Estado                                  | Imagen          |
  | --------------------------------------- | --------------- |
  | Recién entrás, sin conversación         | `HowlHi.png`    |
  | Hay texto cargado o esperando respuesta | `HowlThink.png` |
  | Mostrando una respuesta                 | `Howl.png`      |

  El cambio es un fundido corto, y con "reducir movimiento" es instantáneo.

- **"Pegar mensaje"** abre un diálogo amplio, con fondo claro y letra grande, para pegar textos
  largos sin pelear con un campo de una línea. Al confirmar, el mensaje queda en la conversación
  como una tarjeta plegable, y el búho lo analiza con el modo elegido.
- **Cada respuesta** tiene "Copiar" (copia el texto tal cual, listo para WhatsApp o un correo) y, en
  los análisis largos, "Copiar como texto con formato".
- **Modos:** son botones arriba de la conversación, uno por prompt maestro activo. Se puede cambiar
  de modo en medio de una conversación.
- **Contexto:** el período y la ciudad elegidos (la ciudad es la de arriba, como en todo el panel)
  van a la pregunta. El búho siempre dice de qué período y ciudad está hablando.

### El menú de Ayuda

Ayuda sigue con sus artículos, pero **sin el búho**: vuelve a ser un buscador y un árbol de
artículos simple. Agrega un renglón "¿Querés preguntarle al búho?" que lleva al Workbench.

El búho del Workbench **también conoce la ayuda**: si la pregunta es de uso ("¿cómo paso un pedido
a stock?"), responde con los artículos de ayuda y el enlace a la pantalla.

## 3. Cómo funciona por dentro

### 3.1 Conversación

- Hoy el motor manda un solo mensaje y recibe uno (`generateText` con sistema + usuario). Pasa a
  aceptar **una lista de mensajes** (la conversación), con el mismo adaptador OpenAI-compatible:
  Gemini, DeepSeek y cualquier otro de esa familia siguen funcionando.
- Nuevo `POST /api/v1/ai/assistant/messages`: recibe el modo, la conversación, el período y la
  ciudad, y devuelve la respuesta. Se registra en `ai_executions`, como hoy.
- **La conversación vive en el navegador** (la pestaña), no en la base. Es lo más simple y no deja
  mensajes de clientes guardados. Si más adelante quieren historial, va en una fase aparte.
- Largo máximo: las últimas N vueltas, para no pasar del límite del modelo ni del costo.

### 3.2 Prompts maestros

- Cada modo es una tarea más del catálogo de IA (`AI_TASK_CATALOG.md`), con su prompt versionado y
  su proveedor preferido, como las de hoy. Lo nuevo es que cada uno declara:
  - **qué datos necesita:** ninguno, el resumen del período, la comparación con el anterior, el stock
    o la ayuda;
  - **si recibe un mensaje pegado;**
  - **si se muestra como botón**, con nombre e ícono.
- Se arranca con cuatro: **Analizar mensaje**, **Responder a cliente**, **Análisis del período** y
  **Preguntar sobre la operación**. Se administran desde la pestaña "Prompts maestros", que es el
  editor de versiones de hoy, con "probar" y "volver a una versión anterior".

### 3.3 Los datos: el búho no consulta la base, el sistema le arma el contexto

Para que el búho responda sobre la operación, **el servidor arma un resumen de datos** según el
modo y lo agrega a la conversación. El modelo nunca recibe acceso a la base ni arma consultas.

- **Resumen del período:** pedidos por estado, viandas por variedad y tamaño, por ciudad y por día
  de reparto, facturación, cobrado y por cobrar, cancelaciones con motivo, stock y bajas,
  y comparación con el período anterior y con el promedio de las últimas cuatro semanas.
- **Salen de las mismas consultas que ya usan Estadísticas, Cocina y el reporte del período**, así el
  búho dice los mismos números que esas pantallas.
- Viaja en un formato compacto (tablas en texto), con fecha de corte: "datos al 30/10 18:40".

**Fase siguiente (no la primera):** que el modelo pida datos por su cuenta con herramientas
("tool calling"): por ejemplo, "dame las ventas de Keto de las últimas 8 semanas". Necesita un
adaptador con herramientas y un cuidado mayor con qué puede pedir. Empezar con contexto armado es
más predecible y sirve para casi todas las preguntas del día a día.

### 3.4 Privacidad

- **Por defecto, al modelo no viajan datos personales:** el resumen es de totales, sin nombres,
  teléfonos ni domicilios.
- Un mensaje pegado sí puede tener datos de un cliente: eso lo decide quien lo pega. El diálogo lo
  avisa en una línea, y hay una opción "Ocultar nombres y teléfonos" (activada por defecto) que los
  reemplaza antes de mandarlo.
- Cada proveedor configurado es un tercero que recibe lo que se le manda. Conviene elegir para el
  búho un proveedor cuyas condiciones de uso de datos les sirvan, y fijarlo como preferido en cada
  prompt maestro.

### 3.5 Permisos

- `ai.use` (ya existe): usar el búho y sus modos.
- `ai.prompts.manage` (ya existe): la pestaña "Prompts maestros".
- Los modos con datos de dinero (facturación, por cobrar) piden además el permiso de estadísticas.
  Sin él, el resumen va sin esos números.
- Límite de uso por persona y por día, configurable, para cuidar el costo.

## 4. Las imágenes

Las tres PNG de `apps/web/public/brand/HOWL/` **no tienen transparencia**: el cuadriculado gris y
blanco que se ve detrás del búho está pintado en la imagen (son RGB, sin canal alfa). Sobre el panel
se vería el cuadriculado.

Dos caminos:

1. **Exportarlas de nuevo con fondo transparente** (PNG con alfa) desde el original. Es lo mejor.
2. **Quitar el fondo por script:** el búho tiene un contorno oscuro continuo, así que se puede
   borrar el cuadriculado desde los bordes sin tocar el blanco de la panza. Se revisa a ojo cada una.

En los dos casos se publican en WebP con alfa, en 512 y 1024 px (la de 1254 pesa de más para la
pantalla), con el PNG de respaldo.

## 5. Fases

| Fase | Qué                                                                                                                                                                                                                              | Migración                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | **Pantalla nueva:** búho grande con los tres estados, diálogo para pegar, conversación, copiar con un clic. Modos "Analizar mensaje" y "Responder a cliente" (sin datos). El editor actual pasa a la pestaña "Prompts maestros". | ninguna (las tareas nuevas van en el catálogo) |
| 2    | **Datos:** resumen del período y comparación. Modos "Análisis del período" y "Preguntar sobre la operación". Ocultar nombres y teléfonos. Límite diario.                                                                         | ninguna                                        |
| 3    | **Ayuda:** el búho sale del menú de Ayuda y responde preguntas de uso con los artículos.                                                                                                                                         | ninguna                                        |
| 4    | **Herramientas** (tool calling) para preguntas que el resumen no cubre. Historial de conversaciones, si lo quieren.                                                                                                              | tabla de conversaciones, sólo si hay historial |

## 6. Decisiones (2026-10-30)

- Imágenes: re-exportadas con fondo transparente.
- Las tres imágenes según la tabla de la sección 2.
- La conversación dura lo que la pestaña (`sessionStorage`).
- Proveedor: el predeterminado (hoy DeepSeek). Los prompts que piden JSON no aplican: los modos devuelven texto.
- Lo usan todos los que tienen `ai.use`.
- Modos: 22, diseñados a partir de las pantallas de la operación (pedidos, mensajes, cocina, cobros, reparto, stock, menú, ayuda), en cuatro grupos: Mensajes (7, con texto pegado), Período (8, un clic con datos), Comunicación (5) y Preguntas (2, libres).

## 7. Preguntas que se hicieron antes de decidir

1. **Imágenes:** ¿las exportan de nuevo con fondo transparente, o les saco el fondo por script?
2. **La tercera imagen:** ¿te sirve el reparto de la tabla de la sección 2? (Saludo al entrar,
   pensando con texto cargado o esperando, neutral con la respuesta.)
3. **Historial:** ¿alcanza con que la conversación dure lo que dura la pestaña, o quieren guardar
   conversaciones?
4. **Quién lo usa:** ¿todo el que tiene `ai.use`, o un rol en particular?
5. **Proveedor del búho:** ¿Gemini, DeepSeek, otro? Afecta qué datos conviene mandar (3.4).
6. **Los cuatro modos iniciales:** ¿falta alguno que usen todos los días? Por ejemplo, "Armar el
   mensaje de confirmación del pedido" o "Resumir los reclamos de la semana".
