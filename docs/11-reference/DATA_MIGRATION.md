# Data Migration & Import

## Fuentes actuales

- planilla clientes;
- planilla pedidos semanal;
- planilla producción;
- planilla despachos;
- historial WhatsApp no necesariamente importable en totalidad.

## Estrategia

1. definir plantilla de importación;
2. limpiar teléfonos;
3. normalizar nombres;
4. normalizar ciudades;
5. geocodificar direcciones;
6. detectar duplicados;
7. crear Customer;
8. crear CustomerIdentity;
9. importar historial mínimo útil;
10. registrar `source = migration`;
11. generar reporte de conflictos.

## No hacer

- merge automático agresivo por nombre;
- sobrescribir dirección sin evidencia;
- importar teléfonos inválidos como identidad verificada.

## Deduplicación

Señales:

- teléfono exacto;
- email exacto;
- nombre + dirección como sugerencia;
- decisión humana para merges ambiguos.
