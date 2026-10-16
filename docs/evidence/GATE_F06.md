# GATE-F06 (#22) — Acta de evaluación técnica (propuesta)

- **Estado propuesto:** `Status = Validation`, `Gate = Pending`, `Evidence = Partial`.
- **Esta acta no aprueba el gate.** Sólo Roderich Rendón, con confirmación explícita, puede registrar Passed, Failed o Waived.
- **Redactada:** 2026-10-16 por Claude Code. Es una evaluación técnica automatizada con autorización delegada. No hubo inspección personal de capturas por Roderich ni revisión del tutor (GOV-01, #105).
- **Base evaluada** (aún sin fusionar):
  - Backend `feat/f06-consolidacion` — código `3c01a16`, PR #110;
  - Mobile `feat/f06-consumption-total` — `5e7ed78` (código y pruebas), `1627dec` (evidencia), [PR AppMovilAgroquimico#86](https://github.com/Roderich1/AppMovilAgroquimico/pull/86).

## Criterios de #22

| # | Criterio | Evidencia | Procedencia | Dictamen técnico |
|---|---|---|---|---|
| 1 | Dataset de #21 publicado desde Mobile; diferencia 0 por campaña, producto y unidad | [F06_RECONCILIATION.md](F06_RECONCILIATION.md): 27/27 celdas con diferencia 0; Central 26/26 frente al oráculo escrito a mano; ruta física del agricultor 1, 9/9 | Corrida local 2026-10-16 + dispositivo | **Evidenciado** |
| 2 | Reenvío o ACK perdido: mismo resultado, sin volver a sumar | Ejecución 1: 27 respuestas perdidas y reenviadas por el worker. Ejecución 2: 27 reenvíos literales. Journal en 27; agregado idéntico campo a campo; ninguna publicación nueva. Adversarial F05 C02–C10 en CI | Corrida local + CI | **Evidenciado** |
| 3 | Actualizaciones concurrentes incompatibles: conflicto registrado, sin reemplazo silencioso, «el agregado no cambia» hasta una nueva intención del propietario | Conflicto y ausencia de LWW: adversarial C11 en ambos órdenes y concurrente. Aportación `CONTESTED`: `f06-coll-05…` «cancellation, dispute and membership change withdraw the figure» | CI | **Evidenciado, con discrepancia** (ver abajo) |
| 4 | Campos fuera de la whitelist, datos privados o contenido de backup: rechazo sin persistir; una restauración no publica | Adversarial C26 (400 `FIELD_NOT_ALLOWED`, sin journal) y «privacy and individual domain…»; Mobile `f04_restore_authorization_test.dart` «restaurar no publica: las intenciones por enviar de la copia quedan pausadas» | CI | **Evidenciado** |
| 5 | Agricultor sin publicación: desconocido, no cero; la cobertura lo refleja | `f06-coll-05…` «threshold, explicit zero, absence and coverage». Reconciliación: cobertura 3 de 12, y el 0 explícito cuenta | CI + corrida local | **Evidenciado** |
| 6 | La consulta de la Directiva sólo expone `consumed_total_base` o `declared_need_total_base`, con sus referencias y unidad, sin datos privados ni cantidades por agricultor | `/summary` y su CSV sólo llevan agregados derivados en Central, sin identidad ni cantidades individuales («JSON and CSV carry the same decisions; no individual data»). La Web de F07 no existe todavía | CI + corrida local | **Evidenciado en la API, con discrepancia** (ver abajo) |
| 7 | Sin evidencia ejecutada, el gate sigue Pending | Hay evidencia ejecutada y versionada (en ramas de PR) | — | Gate sigue **Pending** hasta la decisión |

## Discrepancias que decide Roderich

1. **Criterio 3, «el agregado no cambia».**
   - Lo que pidió este bloque: excluir las aportaciones `CANCELLED` y `CONTESTED`.
   - Lo que hace el código: una aportación en disputa sale del cálculo, y la cifra publicada de su celda se **retira** (`SUPPRESSED_REVISION`). No se mantiene la cifra anterior.
   - Por qué no se mantiene: mostrar una cifra que incluye un aporte disputado sería un reemplazo implícito.
   - Lo que sí se cumple: no hay reemplazo silencioso, y la cifra vuelve sólo cuando el propietario emite una intención válida (o se cumple R3 de la política).
   - Opciones: aceptar esta lectura o pedir que se mantenga la última cifra con una marca.
2. **Criterio 6, campos expuestos.**
   - La API usa `projection_type` + `total_base`, equivalente a `consumed_total_base` y `declared_need_total_base`.
   - Además expone el número de Members por celda, la cobertura y `data_as_of`, como propone F07-POL-01.
   - Esa política está **pendiente**: sin ella, el modo por defecto no devuelve celdas.
3. **Nombres de evidencia.**
   - El issue pide `collective-reconciliation.spec.ts`; la reconciliación es `test/f06_reconciliation_integration_test.dart` (Mobile) más las suites `f06-coll-05…` y `product-reconciliation…` (Backend).
   - El brief nombraba esta acta `F06_GATE.md`; se usa el nombre del issue.

## Por qué `Evidence = Partial`

- Las pruebas y la corrida están en ramas de PR sin fusionar (#110 y Mobile #86). No se ha medido el CI de `main` integrado con este código.
- La divulgación se probó con la política provisional k = 3, que no está aprobada (#107).
- Hay dos discrepancias abiertas (criterios 3 y 6).
- **Pendiente (ADR-003).** Los endpoints heredados con datos centrales antiguos no se revisaron.

## Fuera de esta acta

- Web de F07 (#23–#25).
- Revisión de privacidad de F10-SEC-02 (#45).
