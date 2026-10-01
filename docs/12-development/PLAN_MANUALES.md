# Plan: manuales de usuario

Dos manuales, dos lectoras distintas, dos propósitos distintos. Uno explica el sistema entero y las
decisiones que son de quien manda; el otro explica el trabajo de la semana, paso a paso.

**Formato**: una página web compartible por manual (Artifact), con índice, buscable, que se ve en el
teléfono. Se pasa un enlace y se actualiza en su lugar.

**Fuente**: el manual de las operadoras se **genera** desde los 31 artículos de ayuda del panel
(`packages/db/src/help-articles.ts`), que ya cubren casi todo. Una sola fuente: cambiar un artículo
cambia el manual, y nunca se contradicen. El de Gisela se escribe aparte —gobierno, alcance y cómo
pedir arreglos no son material de ayuda contextual— pero embebe los artículos de Administración.

## Manual 1 — Gisela (dueña del producto)

Lectora: decide qué se vende, a qué precio y en qué ciudad; no toma pedidos todos los días. Necesita
entender el sistema entero, saber qué puede romper y tener un camino claro para pedir cambios.

1. **Qué es Verdeo y qué resuelve.** Una página. El ciclo semanal como columna vertebral: se publica
   el menú, se toman pedidos, se cierra, se produce, se reparte, se cobra.
2. **Tu usuario.** Superadmin: todas las ciudades y todas las secciones. Las cosas que sólo vos
   podés hacer —usuarios y roles, ciudades y zonas, respaldos, auditoría, configuración de IA— y por
   qué están separadas del trabajo diario.
3. **El mapa del sistema**, sección por sección, con la decisión que toma cada una. No "qué botón
   hace qué", sino "para qué existe esta pantalla".
4. **Las decisiones que son tuyas y cuándo se toman.** El menú de la semana y los precios, qué
   ciudad vende qué, los textos y las secciones del landing, las encuestas, el asistente de la web.
   Cada una con el momento del ciclo en que conviene tocarla.
5. **Lo que conviene no tocar, y por qué.** Restaurar un respaldo, eliminar un cliente, poner una
   excepción de permisos. Qué pasa si se hace igual.
6. **Cómo leer los números.** Estadísticas, cobros, producción: qué mide cada uno, qué no mide, y
   los dos o tres errores de lectura fáciles (un pedido cancelado no es demanda; el ticket promedio
   no es la ganancia).
7. **Los límites de hoy.** Un período abierto a la vez para todas las ciudades, WhatsApp manual,
   las ciudades que todavía no pueden vender. Saberlos evita pedir un arreglo para algo que es una
   decisión.
8. **Cómo pedir un arreglo o un cambio.** El capítulo que pediste:
   - Qué es un error y qué es un cambio (y por qué cuestan distinto).
   - Qué mandar siempre: en qué pantalla, en qué ciudad, qué número de pedido o cliente, a qué hora,
     qué esperabas que pasara y qué pasó. Una captura vale más que un párrafo.
   - Por dónde: el canal acordado, con nosotros como único camino.
   - Qué pasa después: cómo se clasifica, qué se arregla el mismo día y qué espera, y cómo te
     avisamos que salió.
   - Lo que no conviene hacer: tocar datos para "probar si se arregló" sobre pedidos reales.
   - **Falta definirlo con vos**: el canal concreto y los tiempos que queremos prometer.
9. **Checklists.** Una de apertura (antes de la primera semana real) y una semanal.
10. **Glosario.** Período, ciclo, oferta, variedad, tamaño, zona, parada, excedente.

## Manual 2 — Isabella y Tamara (operadoras)

Lectoras: usan el sistema todos los días. El manual se lee una vez entero en la capacitación y
después se consulta; para consultar está la lechuza, y el manual la señala en vez de repetirla.

Se arma por el ciclo real, no por el menú lateral:

0. **Entrar, la ciudad de arriba y la lechuza.** Lo primero que rompe todo si no se entiende: la
   ciudad elegida filtra el panel entero.
1. **La semana de principio a fin.** Los seis pasos que ya están escritos como artículos.
2. **Pedidos**: tomar, confirmar, modificar, cancelar, buscar, exportar, tapar apellidos.
3. **Clientes**: ficha, domicilios, geocodificar, eliminar.
4. **Cocina**: cierre, consolidado, etiquetas.
5. **Reparto**: proponer la ruta por zona, publicarla, pasársela al repartidor, qué entregar en cada
   parada.
6. **Cobros.**
7. **Encuestas.**
8. **Cuando algo no sale.** Los errores que se ven seguido, qué significan y qué hacer. A quién
   avisar y con qué datos (el mismo formato del capítulo 8 del manual de Gisela).
9. **Lo que no pueden hacer y a quién pedírselo.** Crear usuarios, ciudades y zonas, respaldos.
10. **Una hoja para imprimir**: la semana en una página, para pegar al lado de la pantalla.

## Cómo se construye

1. `pnpm manual:build` lee `DEFAULT_HELP_ARTICLES`, filtra por los permisos del rol destinatario
   —el manual de las operadoras no muestra lo que no van a poder abrir—, ordena por el ciclo
   semanal, resuelve los `[[enlaces]]` como anclas dentro de la página y los `[texto](/app/ruta)`
   como enlaces al panel, y escribe un HTML por manual.
2. Ese HTML se publica como Artifact y se pasa el enlace.
3. Cuando cambia un artículo de ayuda, se corre el script y se republica: el manual no puede
   desincronizarse porque no tiene texto propio.
4. El manual de Gisela se escribe a mano en el mismo generador, como capítulos propios más los
   artículos de Administración embebidos.

Capturas: van después del primer borrador, para no sacarlas dos veces si algo de la interfaz cambia
esta semana.

## Lo que falta definir

- El canal y los tiempos de respuesta del capítulo "cómo pedir un arreglo".
- Si el manual de las operadoras se tutea (se asume que sí, como la ayuda del panel).
- Si Tamara e Isabella tienen el mismo alcance o una de las dos administra algo más.
