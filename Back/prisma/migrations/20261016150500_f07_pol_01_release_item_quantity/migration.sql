-- F07-POL-01 (#107), revisión bajo F10-SEC-02 (#45): cada aporte de una
-- divulgación guarda su cantidad, para contar cambios NETOS por Member frente
-- a todo el historial de la celda (no secuencias). Expand-only.
-- Las filas anteriores quedan en NULL: desconocidas. No se reconstruyen con
-- valores actuales, y una cantidad desconocida no prueba un cambio ni su
-- ausencia (la política no publica una cifra nueva que no pueda demostrar).
-- Añadir la columna no dispara el disparador de inmutabilidad, que sigue
-- impidiendo modificar o borrar filas.
ALTER TABLE "CollectiveReleaseItem" ADD COLUMN "quantityBase" BIGINT;

ALTER TABLE "CollectiveReleaseItem"
  ADD CONSTRAINT "CollectiveReleaseItem_quantity_check"
  CHECK ("quantityBase" IS NULL OR "quantityBase" >= 0);
