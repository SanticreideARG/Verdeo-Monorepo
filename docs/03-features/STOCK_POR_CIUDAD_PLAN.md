# Stock del período por ciudad (plan, 2026-10-29)

## El problema

Reporte del 29-oct: el stock que se suma en una ciudad aparece también en las otras.

**Causa:**

- El contador "Stock para el cierre" de Cocina guarda en `production_stock`, que es **por período y
  no por ciudad**.
- Los períodos son de todas las ciudades, así que el stock de una ciudad lo ven todas.
- Lo mismo pasa con:
  - las bajas del excedente (`surplus_writeoffs`);
  - el cálculo de lo disponible para vender del stock (`surplusRows`): suma los pedidos, el stock y
    las bajas de todas las ciudades.

**Consecuencias:**

1. **Cocina de una ciudad:** cocina el stock de las otras. `kitchenSummary` filtra los pedidos por
   ciudad, pero suma el stock de todas.
2. **Nuevo pedido de una ciudad:** puede vender "del stock" lo cargado en otra, y vaciárselo.
3. **Al cerrar el período:** el sobrante se asigna a una ciudad adivinando (`leftoverSite`: la que más
   vendió esa variedad).

**Lo que ya estaba bien:** los lotes de períodos anteriores (`stock_lots`) ya son por ciudad. No
cambian.

## Qué cambia

1. `production_stock` y `surplus_writeoffs` llevan `operating_site_id`.
2. Cargar stock y dar de baja exige tener una ciudad elegida arriba.
   - Con "Todas las ciudades", Cocina muestra la suma de lo cargado en cada ciudad, pero no deja
     editar: "Elegí una ciudad para cargar su stock".
3. **Lo disponible para vender** se calcula por ciudad:
   - stock de la ciudad + sobrante de la ciudad − vendido del stock en la ciudad − bajas de la ciudad;
   - y nunca más que lo disponible del total, que es el cálculo de hoy. Ese tope cubre el caso en que
     la producción real informada (que es una sola, de la cocina) dio menos de lo planeado.
   - Lo que la cocina hizo de más sin que fuera stock de ninguna ciudad (producción real por encima
     de lo pedido más el stock) es de la ciudad que más vendió esa variedad, la regla del cierre.
     Con una sola ciudad, todo queda como antes.
4. **Venta del stock en Nuevo pedido:** valida contra lo disponible de la ciudad del pedido.
   - Mensaje: "No queda stock de Keto 400 en Córdoba".
5. **Resumen de cocina:**
   - filtrado por una ciudad, suma solo el stock de esa ciudad;
   - con "Todas", suma el de todas.
6. **Al cerrar el período:**
   - lo disponible de cada ciudad pasa a un lote **en esa ciudad**;
   - si queda excedente sin ciudad (se cocinó de más sobre lo pedido, sin stock cargado), sigue la
     regla de hoy (`leftoverSite`).
7. **Excedente (tabla de Cocina):** se ve el de la ciudad elegida; con "Todas", el total.

## Migración (expandir, sin cortes)

Es la `0077`. Va **sola, en un commit aparte**: se migra producción y recién después se pushea el
código.

- Agrega `operating_site_id uuid null` a `production_stock` y a `surplus_writeoffs`, con FK a
  `operating_sites` y `on delete restrict`.
- **Completa las filas existentes** con la misma regla del cierre:
  1. la ciudad que más unidades confirmadas tiene de esa variedad en ese período;
  2. si no hay, la ciudad del menú del período;
  3. si no, la primera ciudad.
- Cambia el índice único:
  - antes: `(sales_cycle_id, origin, family_name, variant_name)`;
  - ahora: `(sales_cycle_id, operating_site_id, origin, family_name, variant_name)`.
- **Compatibilidad con el código desplegado:**
  - El `PUT` de hoy borra y reinserta todo el stock del período sin ciudad, así que si alguien carga
    stock entre la migración y el deploy, quedan filas con `null`.
  - El código nuevo trata esas filas como "sin ciudad" y las asigna con la misma regla al leerlas.
- **Contraer (0078, más adelante):** completar los `null` que queden y poner `NOT NULL`. Va un
  deploy después.

## Verificación

- Tests en `packages/db`:
  - stock en Córdoba no aparece en otra ciudad;
  - la venta del stock valida por ciudad;
  - el tope por el total;
  - el cierre crea el lote en la ciudad correcta;
  - la migración completa las filas viejas.
- Tests en la API: el `PUT` sin ciudad responde 400 con el mensaje.
- En local, con dos ciudades: cargar en una, mirar la otra, vender del stock en cada una y cerrar.

## Estado

- [x] 0077 escrita y probada en `migrations.test.ts` (asigna el stock existente por la regla del cierre).
- [ ] 0077 corrida en producción.
- [x] Código (commit B), con tests de dos ciudades en `production.test.ts` y de la API.
- [ ] 0078: `NOT NULL`.

## Orden

1. Commit A: migración 0077 → push → **el responsable corre `pnpm db:migrate --produccion`**.
2. Commit B: el código, con tests, ayuda, novedad y backlog → push, fuera del cierre y del reparto.
3. Revisar en producción el stock cargado esta semana: la migración lo asignó por regla, así que
   puede haber que corregirlo a mano en cada ciudad.
