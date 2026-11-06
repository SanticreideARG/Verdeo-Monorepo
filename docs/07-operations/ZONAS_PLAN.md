# Plan de zonas geográficas (2026-11-05)

Armado con las planillas semanales de pedidos de julio a noviembre de 2026 (Valle y Buenos Aires,
18 semanas; Mendoza, 15). Los números son **clientes distintos con pedido por semana**: el promedio y
la semana más cargada. No hay datos de clientes en este documento.

## Criterio

- **Una zona es un área geográfica**, no un recorrido. Se arma chica y estable: un sector de la
  ciudad o una localidad.
- **Una hoja de ruta junta las zonas que hagan falta ese día** ("Proponer ruta" deja tildar varias:
  Neuquén Oeste + Plottier). Cuántas paradas lleva una hoja lo decide la operación, no el sistema.
- **El barrio** sigue siendo el nivel de abajo: agrupa las paradas dentro de la hoja.
- Renombrar una zona existente conserva sus domicilios y pedidos (se renombra, no se recrea).

## Valle

| Zona           | Prom. | Máx. | Qué hacer con lo que existe    |
| -------------- | ----: | ---: | ------------------------------ |
| Neuquén Centro |  13,0 |   22 | Renombrar la zona "Neuquén"    |
| Neuquén Oeste  |   7,3 |   12 | Nueva ("Izq" en las planillas) |
| Neuquén Sur    |   6,3 |   12 | Nueva                          |
| Neuquén Norte  |   3,7 |    6 | Nueva                          |
| Plottier       |   1,6 |    4 | Ya existe                      |
| Cipolletti     |   8,6 |   15 | Corregir el nombre "Cipolleti" |
| Fernández Oro  |   1,7 |    5 | Nueva                          |
| Allen          |   0,6 |    1 | Nueva (o barrio de Cipolletti) |
| Roca           |   1,5 |    2 | Ya existe                      |

Repartos que salen juntos hoy: Neuquén con Plottier; Cipolletti con Fernández Oro y Allen.

## Mendoza

| Zona          | Prom. | Máx. | Qué hacer con lo que existe                                  |
| ------------- | ----: | ---: | ------------------------------------------------------------ |
| Capital       |   8,3 |   13 | Renombrar la zona "Mendoza"                                  |
| Guaymallén    |   3,5 |    7 | Nueva                                                        |
| Luján de Cuyo |   3,2 |    7 | Nueva                                                        |
| Godoy Cruz    |   2,7 |    6 | Nueva                                                        |
| Las Heras     |   1,1 |    4 | Nueva                                                        |
| Maipú         |   1,0 |    3 | Ya existe ("Maipu")                                          |
| San Rafael    |     — |    — | Sin clientes en las planillas: desactivar si no se vende ahí |

## Buenos Aires

| Zona       | Prom. | Máx. | Barrios                                                                   |
| ---------- | ----: | ---: | ------------------------------------------------------------------------- |
| CABA       |  16,6 |    — | Palermo, Belgrano, Recoleta, Villa Urquiza, Colegiales, Núñez, Caballito… |
| Zona Norte |   1,6 |    3 | Olivos, Villa Martelli, San Isidro, Martínez, Acassuso                    |

La planilla de la primera semana de noviembre no trae barrio: esos domicilios se asignan a mano.

## Importar las bases

Las planillas depuradas traen dos columnas: **Localidad** (la ciudad real: Neuquén, Plottier,
Mendoza…) y **Zona** (el nombre exacto de la zona). Importando con "Toda la operación", cada
domicilio va a la zona de su columna Zona; si esa zona no existe en la operación, va a la primera y
la vista previa lo avisa. Por eso las zonas se crean o renombran **antes** de importar.
