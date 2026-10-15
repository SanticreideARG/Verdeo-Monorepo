# Stock para la venta — plan

Pedido del usuario (2026-10-15): hoy el stock se carga como un "cliente" llamado STOCK con pedidos,
y por eso suma a las ventas, aparece en pedidos, etiquetas de cliente, repartos y rutas. El stock no
es un cliente: es comida que se produce para tener disponible. Cuenta para **producción** (cocina),
pero no para **ventas** hasta que se vende; recién entonces pasa a etiquetas con cliente, repartos y
rutas.

## Lo que ya existe y se reusa

- **Excedente** (`surplusReport`, WEEKLY_MENU_AND_PRODUCTION.md): disponible = producción real −
  demanda confirmada − vendido por oportunidad − bajas, por variedad y tamaño.
- **Venta de oportunidad** (`source = 'opportunity_sale'`): un pedido que descuenta del disponible y
  se rechaza si pide más de lo que hay.
- **Baja al cerrar el período**: lo que no se vendió se da de baja.

## Modelo

- **`production_stock`** (nueva): `sales_cycle_id`, `operating_site_id`, `product_variant_id`,
  `quantity_units`, `notes`, `created_by_user_id`, timestamps. Una fila por variedad y tamaño por
  período y ciudad (se suma al cargar de nuevo). Es **sólo de su período** (decisión 3): no pasa al
  siguiente.
- No es un pedido ni tiene cliente: no entra en estadísticas de venta, ni en la lista de pedidos, ni
  en repartos ni en rutas.

## Reglas

1. **Producción**: el resumen de cocina suma el stock a lo que hay que cocinar, en su propia columna
   ("pedidos 12 + stock 3 = 15"), para que se vea de dónde sale cada número.
2. **Disponible**: el stock planificado se suma a lo que se puede vender por oportunidad, además del
   excedente de producción real.
3. **Vender del stock**: al cargar un pedido para un cliente real se elige "Del stock"; es una venta
   de oportunidad a **precio normal** (decisión 2), descuenta del disponible y, desde ahí, es un
   pedido como cualquiera: cuenta en ventas, entra a su reparto, a las etiquetas con cliente y a las
   rutas.
4. **Etiquetas** (decisión 1, se permiten las dos): el stock puede imprimirse **al producirse**, con
   etiqueta sin cliente ("KETO 400 · STOCK"), con una opción "Incluir el stock" en Etiquetas; y
   cuando se vende, el pedido tiene su etiqueta con cliente como siempre.
5. **Cierre del período**: lo que no se vendió se da de baja con el remanente, como hoy.
6. **El cliente STOCK de hoy**: un comando (y su SQL para Neon) convierte sus pedidos del período en
   curso en filas de stock, borra esos pedidos —así dejan de sumar a las ventas— y archiva el
   cliente.

## Pantallas

- **Cocina → Stock**: cargar, corregir y borrar el stock del período por variedad y tamaño, con lo
  vendido y lo disponible al lado.
- **Carga de pedidos**: "Del stock" como origen, con el disponible a la vista.
- **Etiquetas**: la opción "Incluir el stock".

## Fases

1. Modelo, carga en Cocina, suma en producción y en el disponible, y conversión del cliente STOCK.
2. Vender del stock desde la carga de pedidos.
3. Etiquetas del stock al producirse.
