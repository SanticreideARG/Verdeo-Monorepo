# Tablero "Hoy" — plan

Pedido del usuario (2026-10-15): un tablero con un feed —alertas, calendario, mensajes, consejos
del día— y un home nuevo para mobile.

## Idea

El panel deja de ser una lista de módulos y pasa a ser lo que hay que hacer hoy, de lo urgente a lo
informativo.

- **Arriba, fijo**: el día ("Domingo 18 · reparto de 9 pedidos"), la cuenta regresiva al cierre
  del período, accesos rápidos (Nuevo pedido, Importar, Rutas y repartos, Cocina) y cuatro números
  (pedidos del período, sin confirmar, sin cobrar, vendido).
- **El feed**: tarjetas con su acción directa.
  - **Alertas** (de lo que el sistema ya calcula): a despachar sin hoja, sin ubicación, en
    borrador, sin medio de pago, repetidos, correos por revisar, lista del reparto abierta cerca
    del cierre.
  - **Calendario**: recordatorios del día (`calendar_reminders`) y los hitos del período (cierre,
    corte de cocina, repartos).
  - **Mensajes**: lo último del chat interno y de WhatsApp sin leer.
  - **Consejo del día**: sacado de los datos ("3 clientes que pidieron las últimas 3 semanas no
    pidieron esta", "el Keto 400 se agotó dos semanas seguidas", "5 domicilios sin barrio").
  - **Actividad**: pedidos nuevos, importaciones, cambios de reparto, agrupados.
  - Cada tarjeta se marca como hecha o se pospone, por usuario.
- **Mobile**: la misma información en una columna para el pulgar: el día arriba, accesos rápidos en
  una fila que se desliza y el feed con filtros en chips (Todo · Alertas · Mensajes · Agenda).

## Fases

1. El feed con alertas y actividad, hecho primero para el teléfono (es el home mobile nuevo) y
   ancho en escritorio. Sobre datos que ya existen: `GET /api/v1/feed` arma las tarjetas.
2. Calendario y mensajes en el feed; hecho y pospuesto por usuario.
3. Consejos del día.

Decisión del usuario: el orden queda a criterio de quien lo construye; se empieza por la fase 1.
