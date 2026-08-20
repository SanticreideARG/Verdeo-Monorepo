# Operating Sites and Geographic Zones

## Decisiones confirmadas

- Operación y zona geográfica son entidades diferentes.
- Las zonas son configurables; una operación puede contener una o varias.
- Capital Federal y Zona Norte pueden existir como registros diferentes.
- Neuquén será la operación inicial y recibirá cualquier dato histórico sin alcance.
- Los pedidos usarán prefijos regionales configurables.
- Bahía Blanca queda fuera del alta inicial.

## Entidades

### OperatingSite

Límite operativo y de autorización para pedidos, cocina, reparto, menús publicados y configuración.

- UUID interno;
- `slug` y nombre administrables;
- prefijo público de pedidos;
- zona horaria;
- imagen y datos públicos de contacto opcionales;
- estado activo/inactivo y orden de presentación.

### GeographicZone

Área de cobertura comercial o logística administrable.

- pertenece a una operación;
- nombre, slug y descripción de cobertura;
- imagen y contacto opcionales para sobrescribir la presentación de la operación;
- estado activo/inactivo y orden de presentación.

No contiene listas hardcodeadas de ciudades. Los nombres y alcances se administran como datos.

### UserOperatingSite

Membresía que determina qué operaciones puede seleccionar un usuario. Puede existir una membresía
predeterminada por usuario. Los permisos RBAC siguen definiendo qué acciones puede ejecutar dentro del
alcance permitido.

### CustomerOperatingSite

Relación operativa entre el cliente CRM global y cada operación. Permite que una misma persona compre en
regiones distintas sin duplicar su identidad, mientras conserva estado y notas locales cuando sea necesario.

## Selector de alcance

- Superadmin: `Global` y todas las operaciones activas.
- Otros usuarios: sólo operaciones con membresía activa.
- `Global` es una vista consolidada, no una operación persistida.
- Las mutaciones siempre requieren una operación concreta.
- El servidor valida membresía y permiso en cada consulta o mutación.

## Menús

El catálogo y el borrador maestro pueden ser globales. La distribución crea una revisión propia para cada
operación seleccionada. Las personalizaciones regionales no se resuelven por fallback dinámico durante un
pedido: la versión publicada es un snapshot estable y auditable.

Modos previstos de distribución:

1. crear únicamente donde no existe menú regional;
2. actualizar campos que no tengan personalización;
3. reemplazar, sólo con permiso y confirmación explícita.

## Migración incremental

1. Crear operaciones, zonas y membresías.
2. Crear Neuquén como operación inicial.
3. Asociar usuarios, clientes y datos operativos existentes a Neuquén.
4. Agregar alcance obligatorio a ciclos, menús publicados, pedidos, producción y reparto.
5. Sustituir `operational_zone` libre por referencias, conservando el texto anterior como dato de migración.
6. Implementar secuencias regionales de pedidos.
7. Incorporar el selector superior y el CRUD administrativo.

La migración debe ser transaccional y no habilitar vistas globales de escritura.
