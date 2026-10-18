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

### Resolución delegada de las discrepancias (2026-10-16)

La adoptó la sesión de Claude Code, bajo la delegación de Roderich Rendón (`_briefs/CONTINUACION_TRES_SESIONES_2026-10-16.md` §3). No es una firma institucional ni una revisión del tutor, y el gate sigue **Pending**. Los textos anteriores se conservan arriba como antecedente.

1. **Criterio 3: cambio explícito de redacción.**
   - **Texto original de #22, conservado:** «el agregado no cambia hasta que el propietario emite una nueva intención válida».
   - **Criterio aplicado desde el 2026-10-16:** el aporte en disputa se excluye del cálculo elegible y la cifra divulgada de su celda se **retira**. No se publica un total nuevo que permita deducir el aporte retirado. La cifra vuelve cuando el propietario emite una intención válida y la política lo permite.
   - **Prueba:** `f06-coll-05…` «cancellation, dispute and membership change withdraw the figure».
2. **Criterio 6: aceptado.**
   - `projection_type` + `total_base` representan `consumed_total_base` y `declared_need_total_base`.
   - La cobertura y los conteos se admiten como metadatos agregados sujetos a la misma política.
   - Una celda suprimida no muestra cantidad ni conteo exacto.
   - Sin identidades ni cantidades individuales.
3. **Revisión de la política bajo F10-SEC-02 (#45).**
   - La regla de diferencias contaba secuencias y sólo miraba la última cifra.
   - Se corrige a cambio neto por Member frente a todo el historial (PR propio; ver `F10_SEC_02_REVISION_POLITICA.md`).

## Por qué `Evidence = Partial`

**Actualizado el 2026-10-16.** Backend #110 y Mobile #86 ya están fusionados (Mobile #86 en `caf158e`).

- La divulgación se probó sólo con datos sintéticos y la política provisional k = 3. La divulgación real no está aprobada (#107).
- La revisión de la política (F10-SEC-02) está en un PR aparte, sin fusionar.
- **Pendiente (ADR-003).** Los endpoints heredados con datos centrales antiguos no se revisaron: #45 no está completa.

**Antecedente del 2026-10-16, antes de los merges:**
- Las pruebas y la corrida estaban en ramas de PR sin fusionar (#110 y Mobile #86).
- La divulgación se probó con la política provisional k = 3, no aprobada (#107).
- Había dos discrepancias abiertas (criterios 3 y 6).
- **Pendiente (ADR-003):** los endpoints heredados con datos centrales antiguos no se habían revisado.

## Fuera de esta acta

- Web de F07 (#23–#25).
- Revisión de privacidad de F10-SEC-02 (#45).

## Actualización 2026-10-17 (sesión B, para la decisión de Roderich)

**Sólo actualiza el estado.** Los dictámenes de arriba se conservan como se evaluaron sobre `3c01a16` / `5e7ed78`, y el gate sigue **Pending**. Las frases afectadas de arriba se leen así:

| Texto de arriba | Estado al 2026-10-17 |
|---|---|
| «Base evaluada (aún sin fusionar)» | Backend #110 y Mobile #86 están fusionados. `main` actual: BE `e2263b0`, MOB `ce5678f` |
| «La revisión de la política (F10-SEC-02) está en un PR aparte, sin fusionar» | Fusionada: #118 (rutas heredadas), #126 (proyección, salidas y regla de combinaciones; `e2263b0`). Revisión de la sesión A: LISTO en `8069971` |
| «Pendiente (ADR-003): los endpoints heredados… no se revisaron» | Revisados y corregidos en #118 y #126 (`F10_SEC_02_ROUTES.md` y `F10_SEC_02_PROJECTION.md`). Siguen las PHASE 6–9 de #81 (bloqueo y retirada de escrituras legacy) |
| Criterio 5: «cobertura 3 de 12» | Era la semántica anterior. Desde #126, `members_with_contribution` cuenta **sólo los Members dentro de cifras publicadas**, y `suppressed_cells` avisa sin conteo (contrato F06 §5 y política R9, notas del 2026-10-17). En la D4, un agricultor que sólo aportara a celdas suprimidas ya no se contaría. **Regresión sobre `e2263b0` + `ce5678f` (2026-10-17): PASS.** 27/27 celdas con diferencia 0 en las dos ejecuciones, Central 26/26 y CSV idénticos byte a byte a los del 2026-10-16. La cobertura sigue en 3 de 12, porque los tres aportantes tienen cifras publicadas, y añade `suppressed_cells: true` (`F06_RECONCILIATION.md`, «Regresión sobre e2263b0 + ce5678f») |
| Criterio 6: «La Web de F07 no existe todavía» | Existe: F07 #116 (`71460bf`). Consume sólo `/summary` y la propuesta, sin cantidades individuales (`F07_WEB.md`). Desde #127 (pendiente de integrar), un AGRICULTOR no recibe menú ni datos en la Web |
| Criterio 4: restaurar no publica (sólo pruebas de host) | **También en dispositivo:** caso C35 de Mobile `F10_RESTORE_DEVICE.md` (2026-10-16, POCO X5 Pro 5G, APK de MOB `2f4b634`). La intención restaurada quedó `RESTORE_PAUSED`, sin ningún push al restaurar y con 0 peticiones en 80 s tras reabrir. Lo ejecutó la sesión A; un solo modelo de teléfono |

**Lo que sigue sin cambiar el gate:**
- **Política F07-POL-01 (#107):** sin decisión para datos reales; ver `F07_POL_01_PAQUETE_DECISION.md` (PR #128).
- **Divulgación real:** sigue cerrada (`POLICY_PENDING` en producción).
- **Datos:** la evidencia es sintética.
- **Revisiones:** no hay revisión personal de Roderich ni del tutor.


## Actualización 2026-10-18 (sesión B): reconciliación D4 bajo el control temporal de #116

**Sólo actualiza el estado; no aprueba el gate.** `CONTINUACION_F09_ENS_01_TRIAGE_2026-10-17.md` §4 pidió repetir la D4 **con el control temporal de MOB #116 activo** (D-F04-C2: período local contenido en el central, retención y conciliación en el worker), porque la corrida anterior era previa a ese cambio y la prueba de integración no corre en la CI normal.

- **Resultado: PASS** (2026-10-18, 03:14–03:24Z) sobre Backend `6e4a0e2` y Mobile `0cc2ee3` (código `65f7cfc`), en un entorno nuevo y aislado: 27/27 celdas con diferencia 0 en las dos ejecuciones, Central 26/26 frente al oráculo, 27 respuestas perdidas y reenviadas, segunda ejecución idéntica, journal en 27, 6 liberaciones, 1 asociación. CSV de resultados idénticos byte a byte a los del 16 y el 17. Detalle en `F06_RECONCILIATION.md`, «Reconciliación bajo el control temporal de #116».
- **Fixture:** sólo cambiaron fechas de preparación (C1 hasta el 30/06/2026 y C2 hasta el 30/11/2026, contenidas en las centrales del seed), versionadas con justificación en MOB #123; ningún evento, cantidad, CSV esperado ni artefacto anterior cambió.
- **D-F04-C2 ya no es un límite abierto de este gate:** quedó corregida e integrada en MOB #116 (`65f7cfc`), con sus límites declarados por C (la carrera se cierra en el marcado; un 404 queda retenido sin plazo; un CANCEL detrás de una sustitución nunca recibida espera; el envío espera a `next_attempt_at` si el período vuelve a caber dentro del intervalo; todo HOST, salvo G1–G3 físicos en `F04_C2_DEVICE.md`).
- **Decisión:** con este resultado, §4 autoriza preparar la decisión Passed académico / Evidence Partial de F06. El registro propuesto está en [`F06_GATE_DECISION.md`](F06_GATE_DECISION.md); **se versiona y revisa antes de cerrar BE #22**. Hasta entonces, el gate sigue **Pending** en GitHub y en el Project.
- Sin cambios en #107/F07 (k = 3 provisional, producción sin cifras) ni revisión personal de Roderich o del tutor.
