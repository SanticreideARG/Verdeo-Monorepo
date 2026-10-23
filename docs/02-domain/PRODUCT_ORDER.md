# Jerarquía de orden de los productos

Norma central (pedido del usuario, 2026-10-22): **todas las salidas de datos de la aplicación**
—planillas, etiquetas, informes, listas y formularios— muestran los productos en este orden:

1. Keto 400
2. Keto 250
3. Antiage
4. Real
5. Vegetariano
6. Intuitivos

Dentro de cada variedad, el tamaño más grande primero (400 antes que 250). Una variedad que no está
en la lista va después de Vegetariano y antes de los Intuitivos, por nombre. Los Intuitivos, entre
sí, por cliente o por número de pedido, según la salida.

## Cómo se aplica

Una sola implementación: `compareProducts`, `compareFamilies` y `compareSizes` en
`packages/orders/src/product-order.ts`. Ninguna salida ordena variedades o tamaños por su cuenta.

La variedad se reconoce por el nombre, sin acentos, sin "Menú", sin guiones ni espacios: "Menú Nuevo
Keto" y "Menú Paleo & Keto" son Keto; "Menú Anti-Age" y "ANTIAGE" son Antiage. El Intuitivo es la
variedad componible, se llame como se llame.

Dónde se usa:

- Menús de la semana (carga de pedidos, web pública, armado del menú): las ofertas y los tamaños.
- Cocina: consolidado, stock, la planilla "Pedido" y el "Conciliado".
- Excedente (sobrante) y su conciliación.
- Planilla de pedidos (Excel): el resumen por producto.
- Etiquetas de cocina y Etiquetas 2.0 (grupos de platos y de menús).

Quedan fuera los listados que ordenan por otra cosa a propósito: las estadísticas (por monto o por
cantidad), los pedidos (por número o fecha) y las etiquetas por pedido de la versión anterior.

## Para cambiarla

La lista está en `HIERARCHY` (`product-order.ts`). Agregar o mover una variedad es cambiar esa lista
y su test.
