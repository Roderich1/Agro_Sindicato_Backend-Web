# F07 — Contraste de los pendientes (BE #24–#29 y #107) con el código y la evidencia actuales

Revisión técnica de la sesión B, 2026-10-18 (UTC), por el encargo de la sesión A tras el documento `CONTINUACION_F09_ENS_01_TRIAGE_2026-10-17.md` §7.5 («lista de pendientes de F01–F08… gestiona #107/F07 sin inventar la validación de la Directiva»).

- **Base:** Backend `main` **`f77c030`** (incluye #127, #128, #131, #132, #134, #135, #136 y #137); Mobile `main` **`b1aa42d`** (incluye #116, #123 y #124).
- **Qué contrasta:** los criterios de aceptación de las issues abiertas de F07 (#24, #25, #26, #27, #28, #107 y el gate #29) con el código y las pruebas de `main` y con las decisiones versionadas (ADR-003, contrato F06 §5, `F07_GATE.md` «Decisiones del 2026-10-16», `F07_CIERRE_MATRIZ.md`). No se encontró en `_briefs/` un archivo de exportación del Project: las tarjetas se contrastan por sus issues de GitHub, que son su fuente.
- **Qué no hace:** no cambia issues, gates ni campos del Project; no construye nada; no cierra por conteo de pruebas. Los textos de cierre del §5 los aplica A tras el dry-run, cuando corresponda.
- **Procedencia:** revisión técnica de la sesión B con datos sintéticos. No es una inspección personal de Roderich, ni una revisión del tutor, ni una validación de la Directiva.

## 1. Qué cambió desde la matriz de aceptación

La matriz por criterio es `docs/evidence/F07_CIERRE_MATRIZ.md` (sesión B, 2026-10-17, sobre `e2263b0`). Desde esa base hasta `f77c030`:

| Cambio | Efecto sobre F07 |
|---|---|
| **BE #127** (`9df7888`), PHASE 5 de la Web | #23 cerrado el 2026-10-17 14:43:05Z; recorrido 25/25 en #132 (`81fae93`) |
| **BE #128** (`cab433d`) | Añade `f07-acceptance.postgres.spec.ts` (6 casos por la API real), la §9 de la política (regla de combinaciones de #126), la matriz y las propuestas de texto. Es el único cambio de `Back/src` desde `e2263b0`: **el código del módulo colectivo y la Web colectiva son los mismos que evaluó la matriz**, así que sus dictámenes siguen vigentes |
| **BE #131** (`30fbb56`) | Notas de cobertura «con cifras publicadas» en el contrato F06 §5 y en la política; acta de GATE-F06 al día; regresión D4 |
| **BE #135** (`2825de5`) | `F07_POL_01_REVISION_INSTITUCIONAL.md`: hoja única para la revisión real de #107, con el registro **en blanco** (sustituye a #133) |
| **BE #137** (`f77c030`) | D4 bajo #116 PASS; **BE #22 (GATE-F06) cerrado por Roderich como Passed académico / Evidence Partial**. F06 ya no es un límite abierto para F07 |
| **MOB #116, #123, #124** | D-F04-C2, fixture D4 y fecha efectiva/cierre; no tocan la Web ni el API colectivo |

**CI de código vigente:** `cab433d` (Backend 39050197493 y Web 39050197509, SUCCESS). Los merges posteriores a `cab433d` son documentales (`git diff --stat e2263b0..f77c030 -- Back/src Back/prisma`: sólo la suite de aceptación).

## 2. Tabla por criterio: implementado, evidencia, corrección, Directiva

Leyenda: **I** implementado y evidenciado en `main`; **D** decidido y documentado, no construido (alcance condicionado); **C** necesita una corrección concreta; **V** requiere una respuesta institucional o del autor que no consta.

### #24 F07-WEB-02 — dashboard de consumo y necesidades

| Criterio | Estado | Evidencia (código / documento) | Observación |
|---|---|---|---|
| Sólo la versión vigente de una necesidad (RF-21) | I | `f07-acceptance` «needs and consumption stay separate; current versions only…»; `f07-web-proposal` etapa RAW | — |
| Ausencia ≠ cero; cobertura visible (RF-21, RF-24) | I | `f07-acceptance`; `f06-coll-05` «threshold, explicit zero, absence and coverage»; `collective-summary.page.test.tsx` | Semántica de cobertura de #126: Members dentro de cifras publicadas + `suppressed_cells` |
| Unidades incompatibles separadas | I | `f07-acceptance` «units…»; `disclosure-policy.spec` «never adds ML and G» | — |
| **Sin permiso de detalle: sólo agregado; con permiso, detalle por agricultor (RF-22)** | **D** | Sólo existe el agregado (`f06-coll-05` «JSON and CSV carry the same decisions; no individual data») | **Discrepancia con la decisión versionada; ver §3.** No se construye el detalle ni el permiso |
| Necesidades y consumo separados | I | `f07-acceptance` (celdas distintas); Web (regiones «Necesidad declarada» y «Consumo») | — |
| Filtros y actualidad (RF-24) | I | Campaña como filtro; producto y unidad por fila; `data_as_of` (`f07-acceptance` «the date of the accepted data…») | El único filtro permitido por la política es la campaña (R5) |
| Casillas de plantilla (PR integrado, pruebas, contratos, sin ahorro) | I | #116 (`71460bf`), #126 (`e2263b0`), #128 (`cab433d`) con CI verde | — |

**Resultado:** construido y evidenciado en lo agregado. **Acción:** añadir al cuerpo la «Actualización» del criterio de RF-22 (§5) y cerrar; ninguna corrección de código.

### #25 F07-WEB-03 — agricultores vinculados y última sincronización

| Criterio (texto original) | Estado | Evidencia / decisión | Observación |
|---|---|---|---|
| Agricultor vinculado sin datos: «sin datos», no cero | I (agregado) | `linked_members` > `members_with_contribution`; `f07-acceptance` | La cobertura «N de M» lo expresa sin nombrar a nadie |
| **Fecha y hora de la última sincronización aceptada de cada agricultor** | **D** | `F07_GATE.md` «Decisiones del 2026-10-16»: alcance condicionado y **no habilitado** | **Discrepancia con ADR-003 y contrato F06 §5; ver §3** |
| Filtros, actualización y cobertura en las vistas consolidadas | I | `data_as_of`, cobertura con `basis`; `f10-sec-02-disclosure-gaps` «coverage does not reveal the exact contributor count…» | — |
| **Cobertura respecto de un subconjunto de agricultores elegido** | **D** | No existe filtro por agricultores; la política R5 lo prohíbe | **Discrepancia; ver §3** |
| **Usuario sin permiso de Directiva, o ADMINISTRADOR sin permiso independiente: rechazo** | D / I | AGRICULTOR → 403 (`f06-coll-05`, `f07-web-proposal`); el ADMINISTRADOR del tenant **sí** accede por ADR-003 | El texto antiguo presupone un permiso independiente que ADR-003 descarta |
| «Actualización 2026-10-16» del cuerpo (criterios vigentes: cobertura agregada, sin conteos de suprimidas, AGRICULTOR 403, condición «corrección de cobertura integrada») | I | Condición cumplida en `e2263b0` (#126); verificada en `f07-acceptance` (`cab433d`) | — |

**Resultado:** los criterios **vigentes** están cumplidos; los del texto original quedan sustituidos por la decisión del 2026-10-16. **Acción:** comentario de cierre (§5) que deje explícito lo no construido; ninguna corrección de código.

### #26 F07-JP-01 — consolidación determinista

| Criterio | Estado | Evidencia |
|---|---|---|
| Suma exacta de las vigentes, idéntica en repeticiones | I | `f07-acceptance` (3500); `f07-web-proposal` «regeneration… same lines, order and fingerprint» |
| SUPERSEDE o reenvío no duplican | I | `f07-acceptance` |
| CANCELLED y CONTESTED no aportan | I | `f07-acceptance`; `f06-coll-05` «cancellation, dispute and membership change withdraw the figure» |
| Ausencia desconocida; cero explícito distinto | I | `f06-coll-05`; `f07-acceptance` |
| Grupos separados por producto y unidad | I | `f07-acceptance` «units…» |
| Otro tenant excluido | I | `eligible()` por tenant; `REFERENCE_UNAVAILABLE` al recibir; director de otro tenant 404 |
| Overflow explícito | I | `f06-coll-05` «an int64 overflow is reported, never truncated» |
| Sin cantidades por agricultor ni identidad | I | `f06-coll-05`; `F10_SEC_02_PROJECTION.md` |
| Sin efectos individuales ni `declared_stock` | I | `f07-web-proposal` «generation creates no purchase…»; `declared_stock = DENY` |
| **Cuerpo: «IMPLEMENTATION = NOT_STARTED»** | **C (texto)** | Desactualizado desde #116 | Corrección: la «Actualización» del §5 |

**Resultado:** implementado y evidenciado. **Acción:** «Actualización» que corrige el estado del cuerpo y cierre. RF-32 (`net_need`) sigue declarado como no implementado (F06 deniega `declared_stock`).

### #27 F07-JP-02 — propuesta sin IA

| Criterio | Estado | Evidencia |
|---|---|---|
| Regla determinista | I | `f07-web-proposal` «regeneration…»; `proposal.spec` |
| Sólo vigentes | I | `f07-acceptance`; «an older release that the summary no longer shows is never served (R4/R8)» |
| Unidades sin equivalencia en líneas separadas | I | `f07-acceptance` |
| Ausencia ≠ cero; cobertura y actualidad en la propuesta | I | `coverage.basis`; `data_as_of` por línea; `joint-proposal.page.test.tsx` |
| Persistida sin compra, inventario, deuda, pago, lote ni movimiento; `DRAFT` | I | `f07-web-proposal`; `f07-acceptance` (conteos idénticos) |
| Sin permiso de Directiva: rechazo sin datos privados | I | `f07-web-proposal` «roles and tenant: … 403 / 404 / 401» |
| Sin ahorro no medido | I | `f07-acceptance` (sin «ahorro», «precio» ni «costo») |

**Resultado:** implementado y evidenciado. **Acción:** cierre (§5). No existe transición de borrador a compra; `POST /purchases/joint` cerrado (403, #118).

### #28 F07-REP-01 — reporte y exportación

| Criterio | Estado | Evidencia |
|---|---|---|
| Agregación determinista y reproducible | I | `summary.csv` y `proposals/:id/csv` salen de la misma decisión (R8) |
| Necesidad ≠ forecasting en el contrato | I | Contrato F06 §3; aviso fijo en el CSV |
| Sólo vigentes; unidades separadas; cobertura; sin efectos; sin ahorros | I | `f07-acceptance`; `f07-web-proposal` |
| Sin permiso de detalle: sin datos privados ni detalle por agricultor | I | `f06-coll-05`; `f07-web-proposal` «logs carry no quantities» |

**Resultado:** implementado y evidenciado (era P2 diferible; ya no hace falta diferirlo). **Acción:** cierre (§5).

### #107 F07-POL-01 — política mínima de divulgación

| Criterio | Estado | Evidencia / lo que falta |
|---|---|---|
| Umbral numérico justificado, supresión, supresión complementaria, filtros cerrados | I (documento) | `F07_AGGREGATE_DISCLOSURE_POLICY.md` §3 (k = 3), §4 (R1, R5), §9 (combinaciones, #126) |
| Tabla de casos resueltos | I (documento) | Política §5 y §9 |
| Presentación con filtros, fecha de última aceptación y cobertura | I | Política R9; `f07-acceptance` |
| Sólo salidas de la whitelist F06 | I | Política §2; `F10_SEC_02_PROJECTION.md` |
| **Decisión con fecha real y «Verificado por Roderich Rendón (autor) el <fecha real>»** | **V** | `F07_POL_01.md` §Decisión: **pendiente**. Hoja de revisión `F07_POL_01_REVISION_INSTITUCIONAL.md` con el registro de la §6 **en blanco** (no hubo revisión). Producción `POLICY_PENDING` (`collective-config.spec` «allows the provisional policy only outside production») |
| #21, #23–#25, #28 y #45 enlazan la política | I | `Refs` en sus PR; #45 la verifica |

**Resultado:** construcción lista; **la validación es institucional y no consta**. Lo que requiere respuestas efectivamente obtenidas (hoja §5): la Directiva del Sindicato (finalidad, quién ve, cómo se informa a los agricultores, k, revisión periódica, exclusión a petición), el tutor (revisión del entregable, GOV-01) y el autor (texto para datos reales, k, responsable y fecha de revisión). **No se registra ninguna respuesta que no haya ocurrido**; el paquete sigue en blanco. **Corrección técnica:** ninguna. Si la validación ocurre, hace falta un PR propio con un modo explícito para producción, con su prueba y su rollback (hoja §6); hoy ese modo **no existe**, y eso es correcto.

### #29 GATE-F07

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Sólo vigentes del mismo canónico y unidad; sin declaración ≠ cero | I | `f07-web-proposal` (oráculo D4), `f07-acceptance` |
| 2 | Necesidad ≠ forecasting | I | Contrato F06 §3; aviso en pantalla y CSV |
| 3 | Regla determinista documentada | I | `F07_GATE.md` criterio 3; `f07-web-proposal` |
| 4 | Directiva sin permiso de detalle: sólo agregado, separado, sin datos privados | I (agregado) / D (detalle) | `f07-acceptance`; Web; decisión del 2026-10-16 |
| 5 | Propuesta con campaña, líneas y versión; `DRAFT`; sin efectos | I | `f07-web-proposal`; `f07-acceptance` |
| 6 | Efecto individual posterior exige confirmación y requisito | I (por ausencia) | No hay transición; `POST /purchases/joint` 403 |
| 7 | Filtros, actualidad, cobertura; sin ahorros | I | `f07-acceptance`; Web |
| 8 | La primitiva `create-joint-purchase` no basta | I | Módulo nuevo; primitiva cerrada (#118) |
| 9 | Con F07-POL-01 o F07-REC-01 abiertos, Pending | **V** | #108 cerrado (2026-10-17); **#107 abierto** |

**Resultado:** criterios 1–8 evidenciados; el 9 no se cumple. **GATE-F07 sigue Pending**; no se propone Passed. F06 ya está decidido (BE #22), así que la única dependencia abierta es #107.

## 3. Las dos discrepancias: #24 (detalle individual) y #25 (estado y filtros por agricultor)

**Qué dicen las tarjetas antiguas.** #24: «con ese permiso, recibe además el detalle por agricultor (RF-22)». #25: «fecha y hora de la última sincronización aceptada de cada agricultor», «cobertura respecto de ese subconjunto» de agricultores y rechazo del «Administrador sin permiso funcional independiente».

**Qué dicen las fuentes vigentes.**
- **ADR-003** (aceptada el 2026-10-15): el presidente usa una sola cuenta `ADMINISTRADOR` que ejerce las funciones de `DIRECTIVA` en su tenant; no se crea un rol nuevo ni un «permiso independiente»; ese rol **no** da acceso a operaciones individuales de los agricultores (RU-18).
- **Contrato F06 §5**: Central consolida sólo por campaña, producto y unidad; «no exponer Member/Account/clientId, cantidades por agricultor, nombre/familia, finca… ni filtros por persona/dispositivo»; «el listado de agricultores vinculados de URS-WEB-01 se resuelve desde IAM con autorización propia; **no autoriza unirlo a cantidades individuales**». La frescura es la hora de aceptación central agregada, no un dato por agricultor.
- **Política F07-POL-01**: R5, el único filtro permitido es la campaña; filtros por agricultor, dispositivo, parcela o persona están prohibidos; un subconjunto elegido de agricultores es exactamente la diferencia entre consultas que la supresión complementaria evita.
- **Decisión versionada** (`F07_GATE.md`, «Decisiones del 2026-10-16», por delegación): RF-22 «construido y verificado en su parte agregada; su variante de detalle individual depende de una autorización funcional que no existe y no se implementa»; «estado por agricultor y última sincronización de cada uno: alcance condicionado y no habilitado; no se crea un permiso para cumplir la tarjeta antigua; no se traslada como un Must nuevo».

**Resolución documentada:** las tarjetas se evalúan por sus criterios **agregados**, que están cumplidos, y el detalle individual, la última sincronización por agricultor y los filtros por subconjunto de personas quedan como **alcance condicionado y no habilitado**, con su antecedente conservado. No se construye ni un detalle ni un filtro de personas ni un permiso para satisfacer el texto antiguo, porque contradiría ADR-003, el contrato F06 §5 y la política. Esta resolución ya consta en `F07_PROPUESTAS_ISSUES.md` (sección añadida a #24 y comentario de #25); aquí se confirma contra `f77c030` y se completa la cita de las fuentes. En la memoria del proyecto debe decirse así: RF-22 **parcial** (agregado) por decisión de privacidad, no «cumplido».

## 4. Qué NO se duplica

- **La Web colectiva ya existe** (`collective-summary.page.tsx`, `joint-proposal.page.tsx`, `directiva.page.tsx`) y consume sólo `/summary`, su CSV y la propuesta; #23 está cerrado. Que #24, #25 y #28 sigan en Backlog no justifica otro dashboard, otra consolidación ni otro reporte.
- **La propuesta de compra conjunta ya existe** (módulo `collective`, `DRAFT`, CSV). #27 no necesita una segunda implementación.
- **La reconciliación** (#108) está cerrada y verificada.
- **El paquete institucional de #107** es uno solo: `F07_POL_01_REVISION_INSTITUCIONAL.md` (#135). No se crea otra hoja.

## 5. Textos de cierre y de actualización

Los textos ya están redactados en `docs/evidence/F07_PROPUESTAS_ISSUES.md` (#128). Al aplicarlos sobre `f77c030`, A sustituye `<SHA>` por **`cab433d`** (merge de #128, que es donde llegó `f07-acceptance`) y, si cita la base actual, por `f77c030`. Resumen de lo que corresponde a cada issue:

| Issue | Acción | Texto en `F07_PROPUESTAS_ISSUES.md` | Ajuste al aplicarlo |
|---|---|---|---|
| #24 | Añadir «Actualización» (RF-22 agregado) y **cerrar** | «#24 — sección añadida» y «#24 — comentario de cierre» | `<SHA>` → `cab433d`; fecha del cierre, la real |
| #25 | **Cerrar** | «#25 — comentario de cierre» | `<SHA>` → `cab433d`; añadir «alcance condicionado y no habilitado» ya está en el texto |
| #26 | Añadir «Actualización» (corrige `NOT_STARTED`) y **cerrar** | «#26 — sección añadida» y «#26 — comentario de cierre» | `<SHA>` → `cab433d` |
| #27 | **Cerrar** | «#27 — comentario de cierre» | `<SHA>` → `cab433d` |
| #28 | **Cerrar** | «#28 — comentario de cierre» | Sin placeholder |
| #107 | Comentario de estado; **sigue abierto** | «#107 — comentario» | Añadir que la hoja única es `F07_POL_01_REVISION_INSTITUCIONAL.md` (#135) con el registro en blanco |
| #29 | Comentario de estado; **sigue abierto y Pending** | «#29 — comentario de estado» | Base `f77c030`; añadir que GATE-F06 (BE #22) quedó Passed académico el 2026-10-18, y que la única dependencia abierta es #107 |

Texto adicional sugerido para el comentario de #29, que sustituye al de la propuesta anterior:

```text
**Estado (2026-10-18 UTC, contraste de la sesión B sobre `main` `f77c030`):**
- Criterios 1–8 evidenciados en lo técnico (`docs/evidence/F07_CIERRE_MATRIZ.md`, `docs/evaluation/F07_PENDIENTES_CONTRASTE_2026-10-18.md`). El código del módulo colectivo y de la Web colectiva no cambió desde `e2263b0`, salvo la suite de aceptación de #128.
- Criterio 9: #108 cerrado; **#107 sigue abierto** a falta de la validación institucional, que no consta (hoja `F07_POL_01_REVISION_INSTITUCIONAL.md`, registro en blanco).
- GATE-F06 (BE #22) quedó Passed académico / Evidence Partial el 2026-10-18; F06 ya no condiciona este gate.
- El gate sigue **Pending**. La divulgación real sigue cerrada (`POLICY_PENDING` en producción).
```

**Campos del Project** (sólo propuesta; los valores actuales los consulta A antes del dry-run): #24, #25, #26, #27 y #28 → `Status = Done`, `Evidence = Verified` sólo si A confirma que cada archivo de evidencia citado tiene SHA, comando y salida (los de `F07_CIERRE_MATRIZ.md` §6 los tienen); si no, `Partial`. #107 y #29 sin cambio de `Status` ni de `Gate`.

## 6. Pendientes reales de F07, en una lista

1. **#107:** validación institucional real (Directiva, tutor, autor). Sin respuestas, sigue abierto y el paquete en blanco.
2. **#29:** Pending hasta #107.
3. **Cierres administrativos** de #24, #25, #26, #27 y #28 con los textos del §5 (A, con dry-run; sin construcción).
4. **Límites que se conservan** y deben aparecer en la memoria: RF-22 parcial (agregado) y RF-32 no implementado; presupuesto de lectura por lectura (`READ_WORK_LIMIT`); k = 3 provisional con datos sintéticos; escrituras legacy del agricultor en el API hasta #81.
5. **Nada de esto habilita cifras reales.**
