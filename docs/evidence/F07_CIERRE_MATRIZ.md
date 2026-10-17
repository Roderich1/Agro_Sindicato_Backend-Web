# F07 — Matriz de criterios contra `main` (BE #23–#28, #107, #108, GATE #29)

Revisión técnica de la sesión B, del 2026-10-17 (UTC), sobre `main` `e2263b04d96dd9f049a92046a45232af847ce0da`, que incluye #116, #118, #125 y #126.
- Es automatizada y con datos sintéticos.
- No tiene revisión personal de Roderich, ni de la Directiva, ni del tutor.
- **No cambia gates ni textos de issues.** Las propuestas de texto y de cierre están en [F07_PROPUESTAS_ISSUES.md](F07_PROPUESTAS_ISSUES.md); las aplica A tras el dry-run.

**Cómo leer las filas.**
- Cada criterio de aceptación tiene una fila, y la evidencia es un archivo y una prueba de `main`, salvo que se indique otro PR.
- Los cuerpos con texto antiguo y una «Actualización» posterior (#25 y #108) se evalúan contra los **criterios vigentes**; el texto antiguo se lista como antecedente.
- Las casillas genéricas de las plantillas («integrado mediante PR», «tests verdes») se agrupan por issue.

**Abreviaturas de pruebas** (rutas relativas a `Back/src/modules/`):
- **F06C5:** `collective/f06-coll-05-collective-aggregate.postgres.spec.ts`.
- **F07P:** `collective/f07-web-proposal.postgres.spec.ts`.
- **GAPS:** `collective/f10-sec-02-disclosure-gaps.postgres.spec.ts`.
- **DP:** `collective/domain/disclosure-policy.spec.ts`.
- **ACC:** `collective/f07-acceptance.postgres.spec.ts` (nueva en este PR; §2).
- **WEB:** `Web/src/pages/*.test.tsx` y `Web/src/components/**/*.test.tsx`.
- **REC:** `inventory/infrastructure/product-reconciliation.postgres.spec.ts`.

## 1. Resumen por issue

| Issue | Estado en el Project | Resultado de la revisión | Brecha real | Propuesta |
|---|---|---|---|---|
| #23 F07-WEB-01 | Abierto | Satisfecho con el PR #127 (PHASE 5 en la Web) | Sí; código en #127 | Cerrar al integrar #127. *Nota del 2026-10-17: #127 se integró en `9df7888` y #23 se cerró a las 14:43:05Z; recorrido sobre `main` 25/25 (#132)* |
| #24 F07-WEB-02 | Abierto | Satisfecho en lo agregado; el detalle por agricultor (RF-22) no está habilitado por decisión | No | Alinear el criterio de detalle con la decisión de #25 y cerrar |
| #25 F07-WEB-03 | Abierto, con criterios vigentes del 2026-10-16 | Satisfecho: la condición «corrección de cobertura integrada» se cumple con #126 (`e2263b0`) | No | Cerrar (texto en F07_PROPUESTAS_ISSUES) |
| #26 F07-JP-01 | Abierto («IMPLEMENTATION = NOT_STARTED» en el cuerpo, desactualizado) | Satisfecho por #116/#126 | No | Cerrar con una nota que corrige el estado del cuerpo |
| #27 F07-JP-02 | Abierto | Satisfecho | No | Cerrar |
| #28 F07-REP-01 | Abierto (P2) | Satisfecho: CSV del resumen y de la propuesta | No | Cerrar |
| #107 F07-POL-01 | Abierto | **Construcción lista / validación institucional pendiente** | No técnica; sí de decisión | Paquete de decisión: [F07_POL_01_PAQUETE_DECISION.md](F07_POL_01_PAQUETE_DECISION.md) |
| #108 F07-REC-01 | **Cerrado** el 2026-10-17 (criterio alineado con ADR-003) | Coincide con `main` | No | Ninguna |
| #29 GATE-F07 | Abierto, Pending | Todos los criterios técnicos evidenciados; el criterio 9 sigue sin cumplirse por #107 | — | Sigue **Pending**; no se propone Passed |

## 2. Pruebas de aceptación añadidas (ACC)

Regresiones funcionales de F07 tras #126, por la API real (`POST /sync/v1/push` y endpoints de la Directiva) en PostgreSQL. No son una serie de rendimiento.

| Caso | Qué acredita |
|---|---|
| «needs and consumption stay separate; current versions only; a replay or a cancellation adds nothing; absence is not zero» | Necesidad 1500 + 2000 + 0 = 3500 con 3 aportantes: la versión sustituida, el reintento de la misma operación y la cancelada no cuentan. El consumo es otra celda (1300, 4). Un agricultor sin necesidad no es cero. Cobertura = Members en cifras publicadas sobre todos los vinculados |
| «the date of the accepted data is the latest acceptance…» | `data_as_of` = máximo `acceptedAt` de las aportaciones vigentes de la celda, igual en JSON y CSV |
| «units: ML and G are never added…» | ML y G en celdas separadas; asociar entre dimensiones responde 422 y no cambia nada |
| «coverage counts only the Members inside published figures (#126)…» | Una celda publicada (3) y otra suprimida (2): la cobertura dice 3 y `suppressed_cells`, sin cifra ni conteo de la suprimida. La propuesta guarda `basis = PUBLISHED_FIGURES` |
| «S1 (#126): a split decided in one read never publishes both…» | Tras 660 con P2→P1, g entra en P1 y se deshace la asociación: en esa lectura se publica a lo sumo una de las dos celdas, y el CSV coincide |
| «the proposal is a DRAFT with no individual effect…» | `DRAFT`, sin efectos en compras, ítems, asignaciones, participantes, lotes, movimientos, deudas, pagos, eventos, journal ni aportaciones. Las líneas son las celdas `DECLARED_NEED` del resumen. JSON, CSV de la propuesta y CSV del resumen coinciden. Sin ahorros, precios ni costos |

- **Rojo** (2026-10-17): con el dominio y el resumen de `9f350cf`, anteriores a la corrección final de #126, falla **S1**: se publican las dos celdas. Los otros 5 casos pasan.
- **Verde** sobre `e2263b0`: 6/6.
- Registro en §6.

## 3. Criterios por issue

### #23 F07-WEB-01 — navegación y permisos

Fila por criterio en [F07_WEB_01.md](F07_WEB_01.md) §4 (PR #127): los 6 criterios vigentes y el de contratos y documentación cumplen. Antes de #127, en `main`, los criterios 1 y 5 no se cumplían: el AGRICULTOR tenía su menú operativo legacy y `/sync` usaba la cola offline.

### #24 F07-WEB-02 — consumo y necesidades

| Criterio | Evidencia | Dictamen |
|---|---|---|
| Sólo la versión vigente de una necesidad; retiradas y anteriores excluidas (RF-21) | ACC «needs and consumption…» (SUPERSEDE 1000→1500, reintento y CANCEL). F07P, etapa RAW (oráculo D4 con una necesidad cancelada) | Cumple |
| Ausencia ≠ cero y cobertura visible (RF-21, RF-24) | ACC (un agricultor sin necesidad no cuenta). F06C5 «threshold, explicit zero, absence and coverage». WEB `collective-summary.page.test.tsx` «ausencia: sin celdas se explica que no es cero» | Cumple |
| Unidades incompatibles separadas, no sumadas | ACC «units…». DP «never adds ML and G». REC (`UNIT_DIMENSION_MISMATCH`) | Cumple |
| Sin permiso de detalle, sólo agregado; con permiso, detalle por agricultor (RF-22) | Sólo hay agregado; F06C5 «JSON and CSV carry the same decisions; no individual data». **No existe ningún permiso de detalle por agricultor**: decisión del 2026-10-16 (F07_GATE.md, «Decisiones del 2026-10-16»; #25) | Cumple en lo agregado; la variante con permiso **no está habilitada** (alcance condicionado) |
| Necesidades y consumo separados, sin mezclarse ni restarse | ACC (celdas distintas). WEB `collective-summary.page.test.tsx` («Necesidad y consumo son vistas separadas»: regiones distintas) | Cumple |
| Filtros (campaña, producto, unidad) y fecha o estado de actualización | Campaña como filtro visible; producto y unidad en cada fila; `data_as_of` («datos aceptados hasta»). ACC «the date of the accepted data…». WEB `collective-summary.page.test.tsx` | Cumple |
| *Plantilla:* integrado por PR; pruebas; contratos sin debilitar; sin ahorro no medido ni mezcla de unidades | #116 (`71460bf`) y #126 (`e2263b0`), con CI de `main` verde. ACC sin ahorros | Cumple |

### #25 F07-WEB-03 — cobertura (criterios vigentes del 2026-10-16)

| Criterio vigente | Evidencia | Dictamen |
|---|---|---|
| Agricultor vinculado sin datos: no cuenta como cero y la cobertura lo cuenta como «sin cifras» | ACC «needs and consumption…» (`linked_members` > `members_with_contribution`). WEB `coverage`/resumen «N de M» | Cumple |
| Filtros, fecha de datos aceptados y cobertura agregada, **sin revelar conteos de celdas suprimidas** | GAPS «coverage does not reveal the exact contributor count of a campaign whose only cells are suppressed». ACC «coverage counts only the Members inside published figures (#126)». Propuesta: `coverage.basis` (F07P) | Cumple. La condición de cierre del cuerpo («corrección integrada y verificada») se cumple en `e2263b0` |
| AGRICULTOR → 403 en cobertura y resumen | F06C5 «authorization: Directiva and ADMINISTRADOR of the tenant only». F07P «roles and tenant…» | Cumple |
| *Antecedente (texto anterior):* estado por agricultor, última sincronización de cada uno, rechazo del ADMINISTRADOR sin permiso independiente | Sustituidos por la decisión del 2026-10-16 (alcance condicionado y no habilitado; ADR-003) | No aplica: no se construye y no se crea permiso |

### #26 F07-JP-01 — consolidación determinista de la necesidad declarada

| Criterio | Evidencia | Dictamen |
|---|---|---|
| Suma exacta de las vigentes; idéntica en ejecuciones repetidas | ACC (3500). F07P «regeneration with the same authorized inputs gives the same lines, order and fingerprint» | Cumple |
| SUPERSEDE o reenvío: sólo la vigente, sin duplicar | ACC (SUPERSEDE y reintento de la misma operación) | Cumple |
| CANCELLED o CONTESTED no aportan | ACC (CANCEL). F06C5 «cancellation, dispute and membership change withdraw the figure» | Cumple |
| Ausencia desconocida, no cero; cero explícito distinto | F06C5 «threshold, explicit zero, absence and coverage». ACC (cero explícito de f3 con 3 aportantes) | Cumple |
| Productos o unidades sin equivalencia: grupos separados | ACC «units…». DP «never adds ML and G» | Cumple |
| Contribuciones de otro tenant excluidas | Estructural: `eligible()` filtra por tenant, y la referencia de otro tenant se rechaza al recibirla (`sync-v1-references`, `REFERENCE_UNAVAILABLE`). F06C5: un director de otro tenant recibe 404 | Cumple |
| Suma fuera de rango: falla explícita sin redondeo | F06C5 «an int64 overflow is reported, never truncated» (`OVERFLOW`). DP | Cumple |
| Sin cantidades por agricultor, identidad ni clientId en la salida | F06C5 «JSON and CSV carry the same decisions; no individual data». F10_SEC_02_PROJECTION.md (cotejo de la matriz F06) | Cumple |
| No crea compras, lotes, movimientos, deudas ni pagos; no lee `declared_stock` ni inventario privado | F07P «generation creates no purchase…». ACC (conteos idénticos). `declared_stock` DENY y `projectionType` cerrado (F10_SEC_02_PROJECTION.md fila 7). El resumen sólo lee `SyncV1Contribution` | Cumple |
| *Casillas del cuerpo* (entrada sólo `DECLARED_NEED`, por tenant/campaña/producto/unidad, no `net_need`, propuesta con revisión humana, privacidad y overflow con pruebas, enlace a GATE-F07, #21, divulgación según la política) | Las filas anteriores; aviso «no es necesidad neta» (F07_GATE.md, criterio 2); F07-POL-01 en todos los canales (R8). **El cuerpo dice «IMPLEMENTATION = NOT_STARTED»: está desactualizado** desde #116 | Cumplen; el estado del cuerpo debe corregirse |

### #27 F07-JP-02 — propuesta sin IA

| Criterio | Evidencia | Dictamen |
|---|---|---|
| Regla determinista: la misma entrada da la misma salida | F07P «regeneration…». `domain/proposal.spec.ts` («is the same for the same inputs, whatever their order») | Cumple |
| Sólo la versión vigente | ACC. F07P «an older release that the summary no longer shows is never served (R4/R8)» | Cumple |
| Unidades sin equivalencia, en líneas separadas | ACC «units…» (las líneas son las celdas por unidad) | Cumple |
| Ausencia ≠ cero; cobertura y actualidad en la propuesta | Cobertura guardada con `basis` (F07P); `data_as_of` por línea; Web «Cobertura al generar el borrador (fecha)» (`joint-proposal.page.test.tsx`) | Cumple |
| Persistida sin compra, inventario, deuda, pago, lote ni movimiento; estado de revisión humana | F07P «generation creates no…». ACC (`DRAFT`, conteos idénticos) | Cumple |
| Sin permiso de Directiva: rechazo, sin datos privados | F07P «roles and tenant: … AGRICULTOR 403; other tenant 404; no session 401» | Cumple |
| Sin ahorro económico no medido | ACC (sin «ahorro», «precio» ni «costo» en JSON y CSV). F07_GATE.md criterio 7 | Cumple |
| *Casillas:* necesidad declarada ≠ forecasting en el contrato; regla con entradas, unidades, redondeos y salida; transición posterior con confirmación humana; privacidad; enlace al gate | F06 contrato §3 (`DECLARED_NEED`, no pronóstico); regla en F07_GATE.md criterio 3; no existe ninguna acción que convierta un borrador en compra, y `POST /purchases/joint` está cerrado (403, #118) | Cumplen |

### #28 F07-REP-01 — reporte y exportación

| Criterio | Evidencia | Dictamen |
|---|---|---|
| Agregación determinista y reproducible | F07P «regeneration…»; `summary.csv` y `proposals/:id/csv` salen de la misma decisión (R8) | Cumple |
| Necesidad ≠ forecasting en el contrato y la documentación | F06 contrato §3; aviso fijo en el CSV de la propuesta | Cumple |
| Sólo la versión vigente | ACC; F07P (R4/R8) | Cumple |
| Unidades separadas | ACC | Cumple |
| Cobertura; ausencia ≠ cero | ACC (cobertura en el CSV del resumen y de la propuesta) | Cumple |
| Propuesta persistida o exportada sin efectos; revisión humana | F07P; ACC | Cumple |
| Efecto individual posterior: confirmación y requisito aprobado | No existe una transición; la compra conjunta ejecutada está cerrada (#118) | Cumple (por ausencia) |
| Sin permiso de detalle: sin datos privados ni detalle por agricultor | F06C5 «… no individual data»; F07P «logs carry no quantities» | Cumple |
| Sin ahorros no medidos | ACC | Cumple |
| *Casillas:* las mismas que #27 | Ídem | Cumplen |

### #107 F07-POL-01 — política mínima

| Criterio | Evidencia | Dictamen |
|---|---|---|
| Umbral numérico justificado, supresión, supresión complementaria y lista cerrada de filtros | `F07_AGGREGATE_DISCLOSURE_POLICY.md` §3 (k = 3), §4 R1, R5 (el único filtro es la campaña), y la regla de combinaciones vigente desde #126 (§9 de la política, en este PR) | Cumple el documento |
| Tabla de casos resueltos (bajo umbral, diferencia entre consultas, sin aporte, cero explícito, cambio de membresía) | Política §5; más los casos de #126 (§9) | Cumple el documento |
| Presentación con filtros, fecha de última aceptación y cobertura | Política R9; ACC (`data_as_of`) | Cumple |
| Sólo salidas de la whitelist F06, sin identidad ni cantidades por agricultor | Política §2; F10_SEC_02_PROJECTION.md (cotejo) | Cumple |
| Decisión de D4 con fecha real y «Verificado por Roderich Rendón (autor) el <fecha real>»; si no se decide, la Web sigue sin cifras | `F07_POL_01.md` §Decisión: **pendiente**. Producción: `POLICY_PENDING` (`collective-config.spec.ts` «allows the provisional policy only outside production») | **No cumple: falta la decisión.** La salvaguarda (sin cifras reales) sí se cumple |
| #21, #23–#25, #28 y #45 enlazan la política | Los PR de F06/F07 la citan con `Refs`; #45 la verifica (F10_SEC_02_PROJECTION.md) | Cumple |

### #108 F07-REC-01 — reconciliación (cerrado)

Cerrado el 2026-10-17 con la tabla de evidencia de su comentario de cierre (criterios alineados con ADR-003). Coincide con `main`:
- REC 5/5;
- `product-reconciliation.use-case.spec.ts`;
- F07P, etapa CANONICAL;
- ACC «units…» (422 entre dimensiones).

La brecha relacionada (reasociación sin historial) se corrigió en #126 (GAPS). Ninguna acción.

### #29 GATE-F07

| # | Criterio | Evidencia en `main` (además de F07_GATE.md) | Dictamen técnico |
|---|---|---|---|
| 1 | Sólo vigentes del mismo canónico y unidad; sin declaración ≠ cero | F07P (oráculo D4 RAW/CANONICAL); ACC | Evidenciado |
| 2 | Necesidad ≠ forecasting en contrato y documentación | F06 §3; aviso en pantalla y CSV | Evidenciado |
| 3 | Regla determinista con entradas, unidades, redondeos y salida | F07_GATE.md criterio 3; F07P «regeneration…» | Evidenciado |
| 4 | Directiva sin permiso de detalle: sólo agregado, separado de las necesidades, sin datos privados | ACC; WEB (regiones separadas); F06C5 | Evidenciado en lo agregado; detalle individual no habilitado (decisión del 2026-10-16) |
| 5 | Propuesta con campaña, líneas y versión de las necesidades; pendiente de revisión; sin efectos | F07P; ACC (`DRAFT`, huella, conteos) | Evidenciado |
| 6 | Efecto individual posterior: confirmación y requisito | No existe la transición; `POST /purchases/joint` 403 (#118) | Evidenciado (por ausencia) |
| 7 | Filtros, actualidad y cobertura; sin ahorros | ACC (`data_as_of`, cobertura publicada, sin ahorros); WEB | Evidenciado |
| 8 | La primitiva `create-joint-purchase` no basta | La propuesta es un módulo nuevo; la primitiva está cerrada (#118) | Evidenciado |
| 9 | Con F07-POL-01 o F07-REC-01 abiertos, el gate sigue Pending | #108 cerrado; **#107 abierto** (falta la decisión) | **Pending** |
| — | *Casillas:* las mismas reglas que #27; privacidad (#45: F10_SEC_02_ROUTES y F10_SEC_02_PROJECTION) | Ídem | Evidenciado |

**Estado de F07:** construcción lista y verificada en lo técnico, con la validación institucional pendiente (#107). GATE-F07 sigue **Pending**. No se propone Passed. La divulgación real sigue cerrada (`POLICY_PENDING` en producción).

## 4. Limitaciones aceptadas

- **Presupuesto de lectura compartido** (`READ_WORK_LIMIT`): una celda muy pesada puede dejar sin cifras nuevas a las posteriores de esa lectura. No filtra nada. Está declarado en F10_SEC_02_PROJECTION.md y aceptado; no se rediseña en este bloque.
- **Detalle por agricultor (RF-22, #25 antiguo):** alcance condicionado y no habilitado; no se crea permiso.
- **RF-32 (necesidad neta):** no implementado, porque F06 deniega `declared_stock`.
- **Escrituras legacy del agricultor en el API:** siguen activas hasta la PHASE 6 (#81).

## 5. Lo que no se hizo

- No se repitieron R5 ni la matriz de compatibilidad Web.
- No se construyó otro dashboard ni otro consolidado.
- No se cambiaron gates, textos de issues ni el Project.

## 6. Ejecución

PostgreSQL 16 (`agro_b_web_pg`) en el PC de desarrollo. Cada suite crea su base aislada (`createIsolatedDatabase`).

| Fecha (UTC) | Código | Suite | Resultado |
|---|---|---|---|
| 2026-10-17 ~13:08:47–13:09:00Z | `e2263b0` + la suite nueva | `f07-acceptance` | 6/6 |
| 13:09:13–13:09:24Z | `e2263b0`, con `differencing.ts`, `disclosure-policy.ts` y `collective-summary.use-case.ts` de `9f350cf` | `f07-acceptance` | **Rojo:** falla S1 (se publican 2 celdas); 5 pasan |
| 13:19:39–13:20:05Z | `e2263b0` + la suite y los documentos de este PR | `f07-acceptance` y `f07-web-proposal` | 6/6 y 12/12 |

**Comandos** (en `Back/`, con `JWT_SECRET` y `JWT_REFRESH_SECRET` generados con `openssl rand -hex` en la shell, sin imprimirlos). La URL es la base de administración: cada suite crea su base aislada.
```
# verde
F07_WEB_PG_TEST_URL="postgresql://agro@127.0.0.1:55442/agro_b?schema=public" npx jest f07-acceptance.postgres.spec.ts --runInBand
F07_WEB_PG_TEST_URL="postgresql://agro@127.0.0.1:55442/agro_b?schema=public" npx jest f07-web-proposal.postgres.spec.ts --runInBand
# rojo: se sustituyen tres archivos por su versión de 9f350cf, se ejecuta y se restauran
for f in src/modules/collective/domain/differencing.ts src/modules/collective/domain/disclosure-policy.ts src/modules/collective/application/collective-summary.use-case.ts; do
  cp "$f" "$BACKUP/$f"; git show 9f350cf:Back/$f > "$f"; done
F07_WEB_PG_TEST_URL="postgresql://agro@127.0.0.1:55442/agro_b?schema=public" npx jest f07-acceptance.postgres.spec.ts --runInBand
# (restaurar los tres archivos desde $BACKUP)
```

- **Backend:** `tsc --noEmit` y ESLint de la suite nueva, sin errores.
- **CI:** se añade el paso `f07-acceptance.postgres.spec.ts` al job `f07-proposal-postgres` de `web.yml`, que es un archivo global. El resultado del CI está en el PR.
