# F10-SEC-02 — Cotejo de la proyección colectiva y sus canales de salida (#45)

Revisión técnica de la sesión B, del 2026-10-17 (UTC). Es automatizada, con datos sintéticos, y no tiene revisión personal de Roderich ni del tutor. **No aprueba la política de divulgación** F07-POL-01 (#107), que sigue provisional (k = 3) y sólo para datos sintéticos. Producción y cifras reales siguen cerradas: en producción, el resumen responde `POLICY_PENDING` (`collective-config.ts:18-29`).

Complementa `F10_SEC_02_ROUTES.md`, que revisó las rutas heredadas. Esta revisión coteja:
- el contrato `F06_COLLECTIVE_PROJECTION_CONTRACT.md` y la matriz `F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md`, que niega todo por defecto;
- el código de entrada (Sync v1), el almacenamiento, los logs, los conflictos y ACK, y las salidas (resumen JSON/CSV, propuestas JSON/CSV, reconciliación y referencias);
- también los residuos de la §9 de `F10_SEC_02_ROUTES.md`.

## 1. Identificación

| Campo | Valor |
|---|---|
| Rama | `fix/f10-sec-02-residuos` (worktree `_wt/F10-SEC-B2`) |
| Base | `main` `ed069a695eb9f8bdc318bfd16efc0071fcdced25` (base congelada de la evaluación) |
| Método | Cotejo fila a fila de la matriz contra el código, con referencias `archivo:línea`. Cuando una prueba existente ya acredita la propiedad, se cita en lugar de duplicarla. Sólo se añaden pruebas nuevas para los hallazgos |
| Commits | Pruebas en rojo: `f3453c9` (R1, R2), `5c24869` (H1, H2), `1aeca66` (H3) y `69b3a65` (H4). Correcciones: `25d2a8f`, `b02f2b0`, `2ece555` y `eea07d3`. CI: `b0a3aba` |
| Commits tras la revisión de A (2026-10-17) | Pruebas en rojo: `61d989f` (combinaciones de cifras de H1, deuda de compra conjunta de R1 y evento público de R2). Correcciones: `0b29aab` (H1 exacto), `acb07af` (R1 en `/accounts-payable` y redondeo), `9047b2a` (calendario) y `0101696` (`coverageBasis`) |
| Commits tras la revisión final de A (2026-10-17, sobre `9f350cf`) | `045d41d` (H1: celdas de una misma lectura, coste acotado y fail-closed, cantidades desconocidas, dimensión de lo revelado) y `75817f6` (deuda fail-closed). Cada uno incluye sus pruebas; el rojo sobre `9f350cf` está en la §4. `6ba064f` ajusta una prueba anterior de `f06-coll-05` a la regla fail-closed de las cantidades desconocidas |

## 2. Cotejo campo a campo

Rutas relativas a `Back/src/modules/`.
- **COVERED:** una prueba existente lo acredita; se citan el archivo y la prueba.
- **SIN PRUEBA:** el código lo impone, pero ninguna prueba lo comprueba directamente.

| # | Campo o candidato (matriz) | Decisión | Dónde se impone | Prueba existente | Veredicto |
|---|---|---|---|---|---|
| 1 | `campaign_ref` | ALLOW (A-OWN) | `sync-v1/domain/envelope.ts:39-61,152` (UUID canónico); `sync-v1/application/push-operation.use-case.ts:189-198` (tenant, `REFERENCE_UNAVAILABLE`) y `:212-215` (campaña ABIERTA y activa) | `envelope.spec`; `sync-v1-adversarial` C01, C16–C19, C39 | COVERED |
| 2 | `product_ref` | ALLOW | `envelope.ts:153`; `push-operation.use-case.ts:193-198` | adversarial C19, C20 | COVERED |
| 3 | `base_unit` | ALLOW | `envelope.ts:64,154`; `domain/units.ts`; `push-operation.use-case.ts:199-200` | `envelope.spec`; C20 | COVERED |
| 4 | `quantity_base` | ALLOW | `envelope.ts:42,129-135,167-169` (string decimal, int64); sustituye y no suma (`push-operation.use-case.ts:281`); `CANCEL` no la lleva | `envelope.spec`; C11, C21, C37 | COVERED |
| 5 | Copias de catálogo (ids locales, nombre, fechas, estado, ingrediente, mínimo, stock, cultivo) | DENY | Lista blanca cerrada en todos los niveles: `envelope.ts:46-61,77-91` (`FIELD_NOT_ALLOWED`, `INVALID_REQUEST`), antes del journal (`sync-v1/api/rest/sync-v1.controller.ts:79-81`) | `envelope.spec` (claves extra); C26 | COVERED (mecanismo genérico) |
| 6 | Personas, parcelas, aplicaciones, planes, inventario, lotes, movimientos, compras, finanzas, calendario | DENY | Misma lista blanca | C26 (`notes` en el payload); `envelope.spec` | COVERED (genérico) |
| 7 | `declared_stock`, DemandForecast | DENY | `projectionType` cerrado (`envelope.ts:62,118-121`) | `envelope.spec` (proyección desconocida) | COVERED |
| 8 | Payload de sync antiguo, snapshots de conflicto, before/after de auditoría | DENY | Las tablas de Sync v1 no tienen columnas Json; la disputa sólo guarda ids y fechas | `sync-v1-journal` (columnas sin payload); adversarial «privacy and individual domain…» | COVERED |
| 9 | Contexto IAM (`tenantId`, cuenta, `memberId`, propietario, rol, correo) | DENY | Lista blanca; el contexto sale del token y de la base (`sync-v1-auth.guard.ts:56-87`; `push-operation.use-case.ts:140-160`) | C26 (`tenantId`); `sync-v1-references` (aislamiento de tenant); C22, C35, C40 | COVERED |
| 10 | `clientId`, registro del cliente | DENY | Lista blanca; registro comprobado (`sync-v1-auth.guard.ts:76-79`) | C26 (`causal.clientId`), C23 | COVERED |
| 11 | Tokens, contraseña, IMEI, Android ID, serie, MAC | DENY | Lista blanca; el token no se registra | C26; adversarial «privacy…» (el token no aparece en los logs) | COVERED |
| 12 | Archivos, fotos, PDF/CSV, audio, binario o manifiesto de respaldo | DENY | Lista blanca y 16 KiB (`sync-v1-body.ts:8,21,37-39`) | C26 (`backup` en base64), C37 (413) | COVERED |
| 13 | Claves duplicadas, anidamiento, BOM, juego de caracteres | Contrato §4 | `sync-v1/domain/strict-json.ts:109,125`; `sync-v1-body.ts:41-57` | `strict-json.spec`; C37 | COVERED |
| 14 | Payload rechazado: ¿se guarda? | R_PRIVATE_LOCAL = 0 | Un rechazo del sobre no llega al journal. Un rechazo de negocio sólo guarda metadatos y la huella HMAC (`push-operation.use-case.ts:107-119,362-381`) | C25, C26, C37 (el journal no cambia); C31, C32 | COVERED (ver M6) |
| 15 | Logs de Sync v1 | Contrato §7 | `sync-v1-exception.filter.ts:51-56` (estado y código); `push-operation.use-case.ts:80-82` (resultado, código, `operationId`, tipo y acción) | C26 «value never logged»; adversarial «privacy…»; `strict-json` (los errores no incluyen valores) | COVERED |
| 16 | Cuerpos de ACK, error, conflicto y GET de operación | Conflicto mínimo | `sync-v1/domain/ack.ts:25-102`; `get-operation.use-case.ts:10-17,55-59` | `expectAck` del adversarial (claves exactas); C11, C31, C32 | COVERED |
| 17 | Resumen JSON y CSV (`total_base` y sus metadatos) | A-AGG, F07-POL-01 | `collective/application/collective-summary.use-case.ts`; `domain/disclosure-policy.ts`; `POLICY_PENDING` por defecto | `f06-coll-05` (sin política no hay cifras; umbral; diferencias; retiradas; mismo JSON/CSV); `disclosure-policy.spec` | COVERED, **salvo H1 y H2** (corregidos en la rama; H1 rehecho en `0b29aab` y `045d41d`) |
| 18 | Sin detalle por agricultor ni `memberId` en la salida | A-AGG | Forma cerrada de la celda | `f06-coll-05` «JSON and CSV carry the same decisions; no individual data» | COVERED |
| 19 | Propuesta JSON y CSV | A-AGG, R8 | `joint-purchase-proposal.use-case.ts:195-267,301-311,321-361`; `domain/proposal.ts` | `f07-web-proposal` (oráculo, retiradas y sustituidas, `POLICY_PENDING`, logs) | COVERED (heredaba H1 y H2; la regla de cobertura de cada borrador queda rotulada en `0101696`) |
| 20 | Asociaciones y catálogo de reconciliación | Sin totales | `inventory/application/use-cases/product-reconciliation.use-case.ts` | `f07-web-proposal` (catálogo sólo con nombre y unidad); `product-reconciliation.postgres` | COVERED (era el vector de H1) |
| 21 | Referencias de Sync v1 (Central → agricultor) | CENTRAL_REFERENCE | `sync-v1/application/list-references.use-case.ts` | `sync-v1-references` (lista blanca exacta, tenants, logs sin cuerpo) | COVERED |
| 22 | Respaldos (`/me/backups`) | BACKUP_ONLY, canal aparte | `backups/backups.module.ts`; controlador propio | `backups.postgres` (no toca Sync, colectivo ni auditoría) | Canal separado (no se audita aquí) |

**Lo que sale y no está en la lista ALLOW.** La matriz rige el payload de entrada, no las salidas. Esto sale del servidor y no es un dato del agricultor:
- **Resumen:** nombre y estado de la campaña, nombre del producto, `contributors`, fechas, `pending_changes`, `disclosure.*` y cobertura. Lo autorizan F07-POL-01 §2 y el contrato §5 (actualidad).
- **Propuesta:** `generated_by` (nombre de la Directiva o el Administrador).
- **Asociaciones:** actor, quien cerró y motivo, que es texto libre de la Directiva.

Son identidades del personal institucional, no datos de agricultores.

## 3. Hallazgos y disposición

| Id | Hallazgo | Severidad | Disposición |
|---|---|---|---|
| **H1** | Reasociar un producto a un canónico sin historial evitaba la regla de historial: tras publicar 6000, la reasociación publicaba 6100 y aislaba el cambio de un agricultor. Causa: historial por clave de celda (`consolidation.ts:38-40`) | Alta | **Corregido en la rama en tres pasos; pendiente de la revisión de A y de integrar.**<br>1. `b02f2b0`: el historial sigue a las aportaciones entre claves y compara la cifra nueva con cada anterior. Rojo en `5c24869`. **Era eludible** (revisión de A): bypass3 publica N con N − R1 − P = g, y base3, con una sola clave, N − (R2 − R1) = g.<br>2. `0b29aab`: comprobación exacta por rango (`domain/differencing.ts`) contra todas las cifras anteriores de la celda y de las celdas conectadas. Rojo en `61d989f`: sobre la política de `28c451f` fallan bypass3, base3 y la variante con retirada intermedia. **Seguía incompleta** (revisión final de A sobre `9f350cf`): (a) las celdas de **una misma lectura** no se comprobaban entre sí. Tras publicar 660 = a..f con P2→P1, si g se suma a P1 y se deshace la asociación, la misma lectura publicaba P1 = 65 y P2 = 600, y 65 + 600 − 660 = g. El fuzz de A con un oráculo independiente filtró en 71 de 1000 corridas; (b) el coste no tenía cota: 40 cifras de una celda de 74 Members tardaban 31 s; (c) una cifra heredada sin cantidades se trataba como incógnita nueva; (d) se comparaban grupos y no lo revelado.<br>3. `045d41d`: (a) `decideCells` decide las celdas de la lectura en orden de clave, y cada cifra ya decidida cuenta como conocida para las siguientes; (b) la dimensión de lo revelado sobre cada grupo de menos de k Members se calcula como |S| − rango(K[S]), con K una base del núcleo (dualidad de matroides). Es un rango pequeño por grupo, y un presupuesto por lectura (`READ_WORK_LIMIT`, que cuenta las operaciones según el tamaño de los BigInt) **falla cerrado**; (c) una cifra heredada sin cantidades impide publicar cifras nuevas conectadas con ella; (d) se rechaza la cifra que **aumente** esa dimensión para algún grupo, también si el grupo ya estaba expuesto.<br>Si la cifra revela algo, se mantiene la anterior pendiente o se suprime (`REVISION`).<br>A aprobó la **regla**: ninguna combinación de cifras publicadas aísla a menos de k Members. La **implementación** la acreditan las pruebas y las emulaciones de la §4.<br>**Límites declarados:** el presupuesto se agota hacia los 0,7–0,8 s en el PC de desarrollo, con 150–400 cifras aleatorias, y entonces la celda deja de publicar cifras nuevas (disponibilidad, no fuga); las celdas con cifras heredadas sin cantidad, sólo de bases anteriores a `20261016150500`, quedan sin cifras nuevas. La prueba de la migración de `f06-coll-05` esperaba 7600 tras tres incorporaciones sobre una cifra heredada. 7600 no revelaba nada, pero no se puede comprobar exactamente, así que ahora la celda conserva 6000 pendiente (`6ba064f`). La propiedad de la migración (las cifras nuevas guardan las cantidades) se comprueba con un producto nuevo; el modelo considera sumas y restas de cifras publicadas por un lector autorizado, no el conocimiento externo ni la colusión (F07-POL-01) |
| **H2** | `coverage.members_with_contribution` contaba a los aportantes de celdas suprimidas; con una sola celda de 2, revelaba su conteo exacto. Afectaba también al CSV y a la cobertura de las propuestas | Media | **Corregido** (`b02f2b0`). Cuenta sólo a los Members dentro de cifras publicadas, y `suppressed_cells` avisa sin conteo. La Web dice «con cifras publicadas». Las propuestas ya guardadas **no se reescriben**: los borradores sintéticos anteriores conservan el conteo con la semántica antigua. **Se rotulan** (`0101696`): la migración aditiva `20261017020156_f10_proposal_coverage_basis` añade `coverageBasis` (NULL o `PUBLISHED_FIGURES`). Los borradores nuevos guardan `PUBLISHED_FIGURES`; NULL se lee como `ALL_CONTRIBUTORS`. API, CSV (`coverage_basis`) y OpenAPI lo exponen, y la Web dice «habían aportado datos en esa fecha (regla anterior a F10-SEC-02)» |
| **H3** | `GET /suppliers` devolvía con cada proveedor las 3 compras más recientes de **todo el tenant** (id, total, modo de pago y fecha) a cualquier rol, también a otro agricultor | Alta | **Corregido** (`2ece555`): el catálogo de proveedores conserva su finalidad (nombre y contacto) sin compras. Rojo en `1aeca66`. Hallado en la revisión de proveedores por finalidad |
| **H4** | `GET /users` entregaba a la DIRECTIVA el correo y el último acceso de cada cuenta | Media | **Corregido** (`eea07d3`): la DIRECTIVA recibe id, nombre, rol y estado; el ADMINISTRADOR conserva la vista completa (ADR-003). Revisión por finalidad, sin bloquear la ruta. Rojo en `69b3a65` |
| **R1** (§9) | Un participante de una compra conjunta histórica veía los ítems y totales del grupo (`/purchases`, `/reports/purchases/joint`, `/by-campaign`), y `totals.participants` contaba a todos | Media | **Corregido en la rama.** `25d2a8f`, en `/purchases` y los reportes: ve su parte, calculada con sus propias asignaciones (`share: "OWN"`), y su propia participación. Rojo en `f3453c9`. La revisión de A halló que `GET /accounts-payable` **seguía** devolviendo las líneas del grupo en la deuda de esa compra. Corregido en `acb07af` con la misma proyección; rojo en `61d989f`, donde A veía `8 / 24` en lugar de `5 / 15`. El descuento proporcional se redondea a 4 decimales (`ROUND_HALF_UP`). `75817f6` (revisión final de A): es **fail-closed**. Sólo una compra `INDIVIDUAL` muestra los ítems enteros; una conjunta, sólo la parte del responsable, y ninguna línea si no lo tiene. `purchase.type` e `items` son obligatorios en `mapPayable` |
| **R2** (§9) | Los eventos `COMPRA_PROGRAMADA` sin dueño (proveedor, notas y total de grupo) llegaban a todo agricultor del tenant y a D y A | Media | **Corregido** (`25d2a8f`): un evento sin dueño sólo es visible si su tipo es público (cierre de campaña). No se borra, no se reasigna y no se le inventa dueño. La regla va dentro de un `AND`, para que `?type=` no la anule. La revisión de A halló que un AGRICULTOR podía completar o cancelar el `CIERRE_CAMPANA` público. Corregido en `9047b2a`: sólo cambia los eventos de los que es dueño y sigue viendo el público. Rojo en `61d989f`: 200 en lugar de 404 |
| M3 | `CollectiveReleaseItem.quantityBase` conserva de forma inmutable la cantidad de cada aportación divulgada, incluidas las sustituidas o canceladas: el disparador impide UPDATE y DELETE (`prisma/migrations/20261016043000_f06_collective_consolidation/migration.sql:147-155`). Contradice R_CURRENT del contrato §7 («no guardar historial de cantidades… eliminar o anonimizar»). No sale por ningún canal, y la regla de historial lo necesita | Media (retención) | **Declarado.** Requiere una clase de retención y una purga aprobadas, o enmendar el contrato. No se toca: lo exige la regla de diferencias, y borrar datos o migraciones está fuera de este bloque |
| M4 | El filtro global `HttpExceptionLoggingFilter` registra, en cada error, el método, `originalUrl` con su query string, la IP y el mensaje (`src/bootstrap/http-exception-logging.filter.ts:22-24`) | Baja | **Declarado.** Ninguna ruta colectiva, de reconciliación ni de Sync v1 lee parámetros de query. Las heredadas reciben identificadores (`ownerUserId`, `campaignId`) y textos de búsqueda, no cantidades, notas ni ubicación. **No hay datos privados en query**, así que no sube a «corregir». La IP es un dato personal en logs: se recomienda minimizarla con la política de logs de F11 |
| M5 | Un cambio de rol no retira la aportación: `eligible()` filtra el Member y la cuenta activos, pero no el rol (`collective-summary.use-case.ts`). El contrato §5 pide reevaluar ante un cambio de pertenencia | Baja | **Declarado.** Corrección propuesta: filtrar `role: AGRICULTOR` en `eligible()`, con su prueba. Cambia el resumen medido, así que lo coordina A |
| M6 | La huella HMAC del journal se calcula sobre un vector que incluye `quantity_base`. Quien tenga la clave del servidor podría enumerar cantidades pequeñas | Baja (por diseño) | **Declarado.** La exige F05 §5 para la idempotencia; riesgo residual |
| M7 | El servidor no prueba la propiedad ni la finalidad del total: los códigos `OWNERSHIP_NOT_PROVEN` y `PURPOSE_NOT_AUTHORIZED` existen, pero no se emiten | Baja (precondición) | **Declarado.** El contrato §4 lo delega a Mobile |
| M8 | `GET /collective/product-associations` no envía `Cache-Control: no-store`; su catálogo sí | Baja | **Declarado.** Sin datos de agricultores; higiene de caché pendiente |

## 4. Reproducciones y verificación

| Hallazgo | Prueba (rojo antes y verde después) | Rojo observado |
|---|---|---|
| H1, H2 | `collective/f10-sec-02-disclosure-gaps.postgres.spec.ts` | Sobre `ed069a6`: `r DISCLOSED total_base "6100"` tras haber publicado 6000; la cobertura mostró 2 en una campaña cuya única celda tenía 2 aportantes |
| H1 (dominio) | `collective/domain/disclosure-policy.spec.ts`, «the history follows contributions across cell keys»: reasociación con y sin cambio, fusión con un cambio, y k cambios | — (prueba unitaria nueva) |
| H3, H4, R1, R2 | `f10-sec-02-legacy-boundary.postgres.spec.ts`: compras conjuntas con dos agricultores (A 5/15, A2 3/9) y un agricultor ajeno A3; D y A | A2 veía `8 / 24` en lugar de `3 / 9`; el evento programado con sus notas llegaba a A, A2 y A3; `/suppliers` traía la compra de A; `/users` traía el correo de A a la Directiva |
| H1 (combinaciones) | `domain/disclosure-policy.spec.ts`, «no combination of earlier figures isolates fewer than k Members»: bypass3, base3, retirada intermedia; y, sin supresión, una fusión sin cambios y k cambios tras cifras de dos claves | Sobre la política de `28c451f` (2026-10-17, terminado a las 04:15:31Z): 3 fallan y 20 pasan; la política de `0b29aab` pasa 23/23 |
| H1 (misma lectura, S1 y S7) | `disclosure-policy.spec.ts`, «the cells of one read are checked against each other»: S1 (65 + 600 − 660 = g), S7 (g + h) y, sin supresión, la división 60 / 600 tras 660 | Sobre `9f350cf`, cada celda sola se publica (la prueba lo comprueba con `decideCellWithRelated`). En la emulación de A, el bucle de `9f350cf` filtra en **71 de 1000** corridas de su fuzz con asociaciones |
| H1 (lo revelado; desconocidas) | «a group already exposed … does not get its new value revealed»; «a figure with amounts the server did not record …» | Sobre `differencing.ts` de `9f350cf`: g 5 → 7 tras 60 y 65 se permite (`newlyRevealing = false`); `nullqty` de A publica 605 (`RELEASE`) |
| H1 (coste) | «when the budget runs out …» (fail-closed) y «a long history (74 Members, 3 changes per read, 60 figures) stays well within the work limit» | `bench` de A sobre `9f350cf`: 21 cifras 213 ms; 26, 872 ms; 31, **2748 ms** por lectura |
| R1 (deuda fail-closed) | `accounts-payable.use-case.spec.ts`, «only an INDIVIDUAL purchase shows its items whole» | Con el caso de uso de `9f350cf`, la deuda conjunta sin responsable devuelve `8 / 24`, las líneas del grupo |
| R1 (`/accounts-payable`), calendario | `f10-sec-02-legacy-boundary.postgres.spec.ts`, «the debt of a historical joint purchase shows the farmer's own share» y «a farmer cannot complete or cancel a public event» | Sobre `61d989f` (código de `28c451f`; 04:20:07–04:20:23Z): 2 fallan y 27 pasan. A veía `8 / 24` sin `share`; `complete` respondía 200 |

**Emulación con el arnés de A** (2026-10-17, 05:13–05:18Z, PC de desarrollo, Node 25.9.0). B copió a su scratchpad (`policy3/`) los scripts de la revisión final de A (`review_b/policy2/`: `sim_seq`, `scenarios`, `fuzz_seq`, `bench`, `nullqty`) y el oráculo independiente sin cambios: eliminación racional exacta sobre todos los subconjuntos de 1 y 2 Members. Sólo se sustituyó el bucle de decisión por el `decideCells` de `045d41d`. Los scripts no se versionan; las secuencias clave están en las pruebas unitarias.
- **Escenarios S1–S7:** el oráculo no halla ninguna fuga.
- **Fuzz:** 3000 corridas por modalidad, una celda sola y tres productos con asociaciones al azar. 0 corridas con fuga, con 16 724 y 16 780 cifras publicadas.
- **Control del oráculo:** el bucle de `9f350cf` con la misma política filtra en **71 de 1000** corridas con asociaciones, como informó A. Con 1000 corridas, el arreglo publica las mismas 5648 cifras que la emulación de A (`SEQUENTIAL=1`), así que no suprime de más en ese fuzz.
- **Coste** (74 Members, 3 cambios por lectura): 41 cifras, 12 ms por lectura; 61, 19 ms; 195, 145 ms. Antes, 31 cifras costaban 2748 ms.
- **Tope:** con 150–400 cifras aleatorias, densas y sin estructura, el presupuesto se agota en 0,70–0,78 s, y la respuesta es «revela» (fail-closed).

Resultados de la verificación completa en la §6.

## 5. Contrato y documentación

- **OpenAPI:**
  - el 403 `LEGACY_ROUTE_CLOSED` de las dos rutas cerradas queda documentado, sin respuesta de éxito, con su aserción en `openapi-contract.cjs`;
  - la cobertura del resumen describe la semántica nueva y `suppressed_cells`;
  - la descripción de `GET /users` distingue las dos vistas;
  - la cobertura de la propuesta lleva `basis` (`PUBLISHED_FIGURES` o `ALL_CONTRIBUTORS`).

  Los snapshots se regeneran desde la rama, como en entregas anteriores; A los regenera de nuevo sobre `main` integrado.
- **Pendiente de redactar en `F06_COLLECTIVE_PROJECTION_CONTRACT.md`** (propuesta para A, sin editar aquí):
  - el significado nuevo de la cobertura (§5);
  - la regla de historial entre claves (F07-POL-01 §3).

## 6. Verificación

Dos ejecuciones en serie en el PC de desarrollo, con PostgreSQL 16 en bases nuevas de `agro_b_web_pg` y las suites F02 migradas como en el CI.

**1. Sobre `eea07d3`** (2026-10-17 01:27:46–01:31:51Z).
- **Backend:** build OK; OpenAPI OK.
- **Unitarias:** 227 pasan, pero la suite `collective-config.spec.ts` **no compilaba** por la forma nueva de la cobertura. Se corrigió en `a0acd2d`.
- **PostgreSQL:** 12 / 25 / 3 / 30 / 41 / 7 / 15 / 5 / 29 / f07-web-proposal 12 / f10-sec-02-legacy-boundary 27 / f10-sec-02-disclosure-gaps 2.
- **Web:** ci, lint (0 errores), build y test 52/52.

**2. Sobre el HEAD `a0acd2d`** (01:32:39–01:35:34Z).
- **Backend:** build OK; unitarias **36 suites, 232 pruebas**; OpenAPI OK.
- **PostgreSQL:** 12 / 25 / 3 / 30 / 41 / 7 / 15 / 5 / 29 / 12 / **27**.
- **`f10-sec-02-disclosure-gaps`:** falló al **preparar** su base aislada (`prisma migrate deploy` terminó con estado distinto de 0 y sin mensaje). En ese momento el sistema se quedó sin memoria y Claude Code detuvo el resto de la ejecución, incluidos los pasos Web. No es un resultado de las pruebas, pero se conserva tal cual.
- **Equivalencia:** entre `eea07d3` y `a0acd2d` sólo cambian `collective-config.spec.ts` y documentos; `Web/src` y el código de `Back/src` son idénticos. Por eso los resultados de esa suite y de la Web de la ejecución 1 valen para el mismo código.

**3. Tras la revisión de A, sobre `01016966eb1b115d61d6e0326e0bda0efc7607ff`** (2026-10-17 04:21:16–04:23:49Z; script `f10_verify_sec3.sh`, en serie y con bases nuevas `f10w_*_042138`).
- **Backend:** build OK; unitarias **36 suites, 238 pruebas** (13 suites PostgreSQL se omiten sin su URL); OpenAPI: snapshots iguales y aserciones de contrato F02, F05, F06 y F08 OK.
- **PostgreSQL:** auth-v2 12, current-auth-context 25, f02-final-integration 3, sync-v1-journal 30 (con 11 migraciones), sync-v1-adversarial 41, sync-v1-references 7, f06-coll-05 15, product-reconciliation 5, backups 29, f07-web-proposal 12, **f10-sec-02-legacy-boundary 29** y **f10-sec-02-disclosure-gaps 2**. Todas pasan.
- **Web:** ci, lint (0 errores, 2 avisos previos), build y test **53/53**.
- **Esta ejecución sustituye a la 2 en lo incompleto:** `f10-sec-02-disclosure-gaps` y los pasos Web sí terminaron.
- **Antes, a mano:** `tsc --noEmit` y ESLint de los archivos cambiados del Backend sin errores. El ESLint de todo `Back/src` informa 1 error y 3 avisos que ya están en `ed069a6`: `structuredClone` en `inventory-adjustment.use-case.ts`, que esta rama no toca, y tres imports sin uso. Dos de esos imports están en `reports.use-case.ts`, que esta rama modifica en otras líneas, y el tercero en `plot-flow.use-case.spec.ts`. El CI no ejecuta ese ESLint completo.

**4. Tras la revisión final de A, sobre `75817f6`** (2026-10-17 05:19:04–05:22:14Z, bases nuevas `f10x_*_051925`).
- Pasan build, unitarias 246, OpenAPI y la Web 53/53.
- PostgreSQL: pasan todas las suites salvo **`f06-coll-05`**, con 1 de 15 fallida: la prueba de la migración de cantidades esperaba 7600 sobre una cifra heredada sin cantidades, y la regla fail-closed conserva 6000 pendiente. Es un cambio de comportamiento buscado, así que se ajustó la prueba (`6ba064f`, ver H1). Una nueva ejecución de esa suite pasó 15/15.

**5. Sobre el HEAD `6ba064ffd7135ea96523ee01bffda31087f9c433`** (05:23:56–05:26:44Z, bases nuevas `f10y_*_052418`). **Completa y en verde:**
- Backend: build y unitarias **246**; OpenAPI: snapshots y aserciones de contrato.
- PostgreSQL: auth-v2 12, current-auth-context 25, f02-final-integration 3, sync-v1-journal 30, sync-v1-adversarial 41, sync-v1-references 7, **f06-coll-05 15**, product-reconciliation 5, backups 29, f07-web-proposal 12, **f10-sec-02-legacy-boundary 29** y **f10-sec-02-disclosure-gaps 2**.
- Web: ci, lint (0 errores), build y test 53/53.

**El CI del PR** ejecuta todas las suites sobre el HEAD exacto. Su resultado queda en `ESTADO_B_WEB.md` y en el PR.

**Rojo** (01:32:03–01:32:23Z): con las pruebas finales sobre el código de `ed069a6`, `f10-sec-02-*` falla **7 de 29** (R1 ×2, R2, H3, H4, H1 y H2) y pasan los 22 controles.
