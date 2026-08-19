# Open Questions

Estas preguntas no bloquean todo el proyecto, pero no deben resolverse inventando reglas.

## Operación / geografía

- ciudades exactas y asignación Isabella/Tamara;
- límites exactos de sectores norte/sur/este/oeste;
- números WhatsApp y zonas asociadas.

## Rutas

- cantidad típica de repartidores;
- punto de salida/regreso;
- duración promedio de parada;
- restricciones por zona;
- definición operativa de "mejor ruta".

## Despacho

- columnas exactas de planilla actual;
- momento de publicación/cierre;
- cómo se notifican cambios tardíos.

## Producción

- coeficiente inicial de excedente;
- política de baja/merma;
- procedimiento ante producción menor a demanda.

## Etiquetas

- tamaño físico;
- impresora;
- formato de hoja;
- momento preferido de impresión.

## Pagos

- métodos exactos iniciales;
- reglas de verificación Mercado Pago;
- cierre/rendición operativo.

## Landing

- tipografía exacta y tokens extraídos de sitio/assets oficiales;
- assets definitivos;
- contenido que migra del sitio actual.

## WhatsApp

- Meta Business/WABA existente;
- números a migrar;
- templates oficiales;
- estrategia de coexistencia/migración con WhatsApp Business actual.

## Flujo operativo de pedidos

- reconciliar mediante ADR la máquina vigente `DRAFT -> CONFIRMED -> READY -> DELIVERED/CANCELLED` con
  la propuesta `pendiente -> confirmado -> produccion -> reparto -> entregado/cancelado`;
- decidir si producción y reparto son estados del pedido, estados de sus módulos respectivos o vistas
  operativas derivadas;
- definir el criterio técnico para garantizar un único borrador activo por intención de pedido;
- definir columnas y formato comercial de las exportaciones CSV/Excel.

## Auth cliente

- método final: email, OTP WhatsApp, magic link u otro;
- cómo vincular Customer existente con User.

## Marketing

- texto/proceso de opt-in;
- evidencia de consentimiento;
- cadencia y segmentos definitivos.
