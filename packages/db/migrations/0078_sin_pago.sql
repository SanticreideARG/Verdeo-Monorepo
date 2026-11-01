-- Forma de pago "Sin pago" (STOCK_COMO_PEDIDO_PLAN.md, 3.0): para lo que se cocina y se entrega sin
-- ser una venta (stock sin cliente, pruebas, regalos, compensaciones). El pedido va con total 0 y
-- queda fuera de la contabilidad. El código es fijo; el nombre que se muestra se puede cambiar.
INSERT INTO "payment_methods" ("code", "display_name", "is_cash", "active", "sort_order")
VALUES ('sin_pago', 'Sin pago', false, true, 99)
ON CONFLICT ("code") DO NOTHING;
