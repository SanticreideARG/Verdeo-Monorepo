# Product Specification

## Visión

Verdeo SCA debe simplificar radicalmente la operación administrativa de Verdeo. Hoy la operación depende de cuatro planillas principales:

1. pedidos;
2. clientes;
3. producción/cocina;
4. despachos.

Cada semana se crea una hoja nueva y existe uso intensivo de plantillas y portapapeles. SCA debe convertir esas cuatro fuentes en **cuatro vistas de una única base de datos**.

## Organización conocida

- **Gisela**: dueña y Product Owner.
- **Isabella**: gestora operativa.
- **Tamara**: gestora operativa.
- Administradores de sistema: privilegios de superadmin.
- Cada gestora cubre ciudades/zonas asignadas. La asignación exacta debe ser configurable, no hardcodeada.

## Roles iniciales

- superadmin
- operador
- repartidor
- cocina
- cliente

`cocina` existe conceptualmente en RBAC, aunque inicialmente cocina no tendrá cuenta y recibirá documentos/mensajes generados.

Un usuario puede tener múltiples roles. Los permisos pueden modificarse individualmente. Superadmin gestiona usuarios; un operador puede recibir ese privilegio.

## Objetivos V1

- autenticación y RBAC;
- CRM de clientes;
- identidad multicanal;
- menú semanal;
- landing autogestionable;
- pedidos web;
- pedidos manuales/WhatsApp;
- WhatsApp multi-cuenta;
- inbox operativo;
- ciclos semanales;
- producción/cocina;
- etiquetas;
- pagos/rendiciones;
- rutas;
- Delivery PWA;
- auditoría;
- AI Core multiproveedor;
- analytics operativos básicos.

## Fuera de foco inicial

- Instagram/Messenger inbox: arquitectura preparada, implementación posterior.
- mensajería interna entre empleados: V2.
- automatización IA de acciones críticas: no V1.
- WhatsApp Web/Puppeteer/Evolution como dependencia central: no V1.
- app Android nativa: no necesaria.
- sistema contable/impositivo: no contemplado.
- entregas parciales: no soportadas.

## KPI inicial

- pedidos;
- ventas;
- ingresos;
- clientes nuevos;
- clientes recurrentes;
- ticket promedio;
- distribución geográfica;
- ventas por canal;
- ventas por producto/variante;
- confirmados/listos/entregados/cancelados/reprogramados;
- pagos pendientes/pagados/a rendir;
- efectivo en poder de repartidores;
- pedidos por ruta;
- entregas por repartidor;
- ventas de oportunidad;
- excedente/merma;
- opt-in marketing;
- conversión consulta -> pedido cuando pueda medirse.
