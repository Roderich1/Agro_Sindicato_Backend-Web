# Contraste técnico de BE #81 y de las tarjetas F10 en Validation — 2026-10-19

**Ficha:**
- **Preparado por:** la sesión B de Claude Code, el 2026-10-19 (UTC). Responde al encargo de Roderich Rendón «coordinación A, revisión B y manuales C» (§5), que transmitió la sesión A. Es una revisión técnica automatizada: no hubo revisión personal de Roderich ni del tutor.
- **Bases:**
  - Backend/Web `main` **`2a69fe6`**. El código es el de **`f0b55ee`**: `git diff --stat f0b55ee 2a69fe6 -- Back/src Back/prisma Web/src` sale vacío. CI de `f0b55ee`: Backend F02 39284935149 y Web F07 39284935301, las dos SUCCESS.
  - Mobile **`463d3ec`**, con Flutter CI 39254103212 SUCCESS.
- **Qué es:** una lectura de los issues, las decisiones vigentes, las evidencias versionadas y el código en esas bases, contra cada criterio o compromiso que sigue pendiente.
- **Qué no es:**
  - No ejecuta ninguna suite.
  - No retira modelos ni rutas, no hace DROP y no actualiza dependencias.
  - No cierra tarjetas ni cambia gates, campos del Project o issues.
  - Las propuestas de esta tabla se dejan para Roderich.
- **Lectura del Project:** 2026-10-19, ~19:00Z.
  - BE #42, #43, #44, #45, #46 y #48: **Validation · Partial · Gate N/A**.
  - BE #81: **In Progress · Pending · N/A**, P0, Critical.
  - BE #47 y MOB #37: Backlog · Pending.
  - BE #49 (GATE-F10): Gate **Pending**.
- **Relación con la matriz del 2026-10-18:** este documento actualiza, para las tarjetas en Validation, la matriz por criterio que preparó B el 2026-10-18 (`_briefs/MATRIZ_F10_CONCILIACION_2026-10-18.md`). Esa matriz no está versionada y la mantiene A. No se crea otra matriz paralela: aquí sólo constan las filas **que siguen pendientes** y lo que cambió desde entonces.
- **Cómo leer las columnas:**
  - **Estado demostrado:** implementado, probado o pendiente, siempre con su fuente y su SHA.
  - **Qué falta realmente:** `código`, `prueba`, `decisión humana` o `alcance diferido`. Un riesgo que sólo existe en producción se marca como **productivo**.
  - **Acción mínima y responsable:** una acción concreta, nunca un epic nuevo.

**Resultado del aviso del punto 4 del encargo:** no encontré ningún defecto reproducible que impida el piloto ni que afecte a T1–T6 o W1–W5.
- Los dos defectos abiertos, MOB #119 y #120, son de voz (F09, en pausa) y ninguna tarjeta T usa la voz (`docs/evaluation/usabilidad/03_tarjetas_movil_T1-T6.md`, TAR-2).
- M5, en el §2.4, sólo cambia el resumen si a un Member le cambia el rol, y el escenario DS-UX no lo hace.

---

## 1. BE #81 — ALIGN-TECH-01

**Cómo se lee #81 hoy.**
- Su cuerpo y sus comentarios son del 2026-09-21 al 2026-10-07. Usan la numeración anterior a ADR-002: «F09 backup privado» es hoy **F08**.
- Las casillas del cuerpo registran dependencias y *slices*, no lo que falta.
- Lo que falta se toma del objetivo técnico (*Target técnico futuro*), de la mitigación del propio issue y de `docs/scope/CAPABILITY_DISPOSITION_MATRIX.md`. Esa matriz fija para la mayoría de los retiros **«retiro después de F10»**: son de la PHASE 9 de `docs/scope/TRANSITION_PLAN.md` y no condicionan GATE-F10.

| # | Compromiso de #81 | Estado demostrado (fuente y SHA) | Qué falta realmente | Acción mínima y responsable |
|---|---|---|---|---|
| 81-1 | Retirar el *forecasting* residual | **Implementado en parte.** El módulo placeholder se retiró en #100 (PR #101, merge `29d553a`, Done · Verified). El modelo `DemandForecast` y su tabla siguen en `Back/prisma/schema.prisma` (`f0b55ee`); en `Back/src` y `Web/src` no lo usa nadie, salvo la lista de tablas de `sync-v1-journal.postgres.spec.ts`. | **Alcance diferido:** el DROP mediante una migración nueva está fijado «después de F10» (matriz de capacidades, filas *demand-forecasting* y *DemandForecast*). Es un riesgo productivo sólo si la tabla tuviera datos, y no hay ningún despliegue. | Ninguna en F10. Roderich decide si el retiro del modelo entra antes de la entrega o queda declarado en F11-REL-01 (#50) como límite diferido. **Recomendación:** declararlo. |
| 81-2 | Retirar el placeholder Backend de voz | **Implementado y verificado:** #100, `29d553a`. En `f0b55ee`, `grep -rl voice Back/src Web/src` no devuelve nada. | Nada. | Ninguna. A puede anotarlo como cumplido en el comentario de estado de #81 (ver 81-P). |
| 81-3 | Retirar la autoridad central sobre el dominio individual | **Implementado del lado Mobile y del acceso institucional:** <ul><li>Mobile es la autoridad (ADR-001). En `463d3ec`, `lib/` sólo llama a `auth/v2`, `auth/clients`, `me/backups` y `sync/v1` (§3.1).</li><li>DIRECTIVA y ADMINISTRADOR ya no leen ni escriben datos privados: `docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` §2.3–2.5 (`f211a08`, `cd7392b`), con `f10-sec-02-legacy-boundary.postgres.spec.ts` (29) en CI.</li></ul>**Pendiente:** las escrituras privadas heredadas del AGRICULTOR sobre lo propio siguen activas en la API: `POST /purchases`, `/inventory`, `/applications`, `/plots`, `/accounts-payable` y `/sync/operations`. Lo dice la misma matriz, §2.4 y línea 118. Es la PHASE 6, que no está iniciada. | **Decisión humana**, y después **código** si entra. Es un riesgo **productivo**: en un despliegue, otro cliente podría seguir escribiendo datos privados en el Central. Hoy no hay despliegue, Mobile no usa esas rutas y la Web sólo las usa con el flag de rollback. | Roderich decide si la PHASE 6 entra en el PG. <ul><li>**Si entra:** un único *slice* (B o C) que ponga `LegacyRouteClosedGuard` en las escrituras del §2.4, tras un flag de rollback, y amplíe `f10-sec-02-legacy-boundary` con una prueba por ruta. Sin DROP y sin tocar los modelos.</li><li>**Si no entra:** declararlo como límite productivo en #81 y en el manual técnico (BE #54), que revisa B.</li></ul> |
| 81-4 | Retirar la Web operativa del agricultor | **Implementado y probado (PHASE 5):** F07-WEB-01 (#23, `docs/evidence/F07_WEB_01.md`) y la actualización de `LEGACY_CONTRACT_CONSUMERS.md` del 2026-10-17. Al AGRICULTOR se le redirige a `/sin-acceso-web` (`farmer-route.tsx:19`, `private-route.tsx:25`; pruebas `farmer-route.test.tsx` y `routes-roles.test.tsx`; W1 de `F10_COMPATIBILIDAD_WEB_S2.md`, HOST). El código se conserva tras `VITE_LEGACY_FARMER_WEB`, que es el rollback. | **Alcance diferido:** retirar el código es la PHASE 9, «después de F10». | Ninguna en F10. |
| 81-5 | Retirar la cola offline operativa de la Web | **Implementado (no se ofrece):** `Web/src/lib/offline-queue.ts` sólo se lee con el flag de rollback (`app-shell.tsx:333-353`), y `/sync` está tras `FarmerRoute`. | **Alcance diferido:** retirar el archivo es la PHASE 9. | Ninguna en F10. |
| 81-6 | Separar la compra individual de la propuesta conjunta | **Implementado y probado:** <ul><li>la compra individual vive en Mobile;</li><li>`JointPurchaseProposal` es la propuesta, sin efectos (migración `20261016162158`);</li><li>`POST /purchases/joint` responde 403 `LEGACY_ROUTE_CLOSED` (`purchases.controller.ts:55-61`). Lo cubre «…is closed and creates no purchase, lot, movement, debt, payment or event» en CI;</li><li>el recorrido W4 por la interfaz (borrador en el historial y CSV descargado) en `F10_DSUX_CENTRAL_VERIFICACION.md`.</li></ul> | Nada técnico. GATE-F07 (#29) sigue Pending por la política (#107), que es una **decisión humana** y no código de #81. | Ninguna dentro de #81. Ver la fila 45-2. |
| 81-7 | Retirar los payables y pagos centrales «cuando exista una transición segura» | **Pendiente, por diseño:** `PayableAccount`, `Payment` y `/accounts-payable` siguen activos, pero sólo para el AGRICULTOR sobre lo propio (matriz vigente §2.4, línea 55). Las pantallas Web están tras el flag y `/directiva` redirige (`App.tsx:204`). | **Alcance diferido:** REMOVE_FROM_LIVE_SCOPE después de los consumidores, la retención y la exportación (#90, matriz de capacidades). La parte de escritura entra en la decisión de 81-3. | Ninguna en F10, aparte de la decisión de 81-3. |
| 81-8 | Introducir proyecciones colectivas mínimas | **Implementado y probado:** <ul><li>GATE-F06 (#22): Passed · Partial;</li><li>módulo `collective`, con `F06_RECONCILIATION.md`;</li><li>matriz de campos 8 ALLOW / 118 DENY, cotejada en `F10_SEC_02_PROJECTION.md`.</li></ul> | Lo que queda es de #45 (filas 45-1 a 45-3). | Ver #45. |
| 81-9 | Minimizar los *payloads* de sync, auditoría y conflictos | **Implementado en Sync v1 y en la vista institucional:** <ul><li>Sync v1: C26 `FIELD_NOT_ALLOWED`, y H1–H4 corregidos en logs, conflictos y ACK (`F10_SEC_02_PROJECTION.md` §3);</li><li>`/audit-logs` institucional sin entradas de agricultores (matriz vigente §2.5, línea 65).</li></ul>**Pendiente:** <ul><li>el `SyncOperation`/`SyncConflict` heredado sigue con *payload* abierto, aunque sólo lo usa el AGRICULTOR y Mobile no lo llama;</li><li>están declarados M3 (historial inmutable de `CollectiveReleaseItem`), M4 (IP y URL en el log de errores) y M6 (huella HMAC).</li></ul> | **Decisión humana:** M3 contradice `R_CURRENT` del contrato F06 (ver 45-3). **Alcance diferido:** M4 va a la política de logs (F11) y el *payload* heredado sigue la suerte de 81-3. | Roderich decide M3 (fila 45-3). Lo demás no se toca en F10. |
| 81-10 | Migraciones *expand/backfill/switch/contract* con rollback | **Implementado en *expand*:** las 8 migraciones desde el 2026-10-07 (`20261007202233` … `20261019150000`) son aditivas, con 0 `DROP TABLE` o `DROP COLUMN` según un `grep` sobre `migration.sql`. Cada *slice* documenta su rollback por revert. No se ejecutó ningún paso *contract*. | **Alcance diferido:** *contract* es la PHASE 9. | Ninguna en F10. |
| 81-11 | CI y pruebas: unidad, integración, contrato, E2E, seguridad, backup y restore, privacidad | **Implementado:** `backend-f02.yml` (unitarias y suites PostgreSQL), Web F07, Flutter CI y SonarCloud, todos en verde en las bases. | Falta una suite E2E única (fila 43-1). | Ver #43. |
| 81-12 | Conservar migraciones, REC, resultados negativos y evidencia histórica | **Cumplido:** las actas usan notas fechadas sin reescritura, las migraciones históricas no se tocaron y los NOT_MEASURED, BLOQUEADA y NO CUMPLE se conservan. | Nada. | Ninguna. |
| 81-M | Mitigación: antes de cada paso *contract*, `LEGACY_CONTRACT_CONSUMERS.md` con cero consumidores y el ciclo de backup y restore probado | <ul><li>**Consumidores:** el inventario auditaba Mobile en `521c6ee`. Este PR añade una reauditoría estática de `463d3ec` (§3.1 y `LEGACY_CONTRACT_CONSUMERS.md`): 0 archivos de `lib/` nombran una ruta heredada.</li><li>**Backup y restore:** lo probado es el **respaldo privado de Mobile** (GATE-F08 y `F08_BKP_07_B2_ENSAYO_REAL.md`), **no la base central** que tocaría un *contract*. No hay evidencia de un backup y restore de PostgreSQL del Central.</li></ul> | **Prueba**, sólo antes de un *contract*, que es diferido. Los consumidores externos o desplegados siguen como INSUFFICIENT_EVIDENCE. | Ninguna en F10. Que el manual técnico (BE #54, C) describa el backup y restore de la base central como precondición de cualquier *contract*; B lo comprobará al revisarlo. |
| 81-P | Estado de la tarjeta | In Progress · Pending · N/A. Se integraron dos *slices*, cada uno Verified, pero las casillas del cuerpo no describen lo que falta. | **Decisión humana** sobre su alcance: qué objetivos quedan diferidos después del PG. No se propone cerrar: los objetivos 81-3, 81-7 y 81-10 siguen abiertos de verdad. | A, con la aprobación de Roderich: un único comentario en #81 con la tabla de este §1 resumida, sin cambiar campos. Roderich decide si los objetivos diferidos se declaran en F11-REL-01 (#50). |

---

## 2. Tarjetas F10 en Validation

**Estado común:**
- **Comentarios de enlace:** los comentarios que proponía el dry-run del Project del 2026-10-18 (§2) **no se aplicaron**. Hoy #42, #43, #44 y #46 tienen 0 comentarios; #45 y #48 conservan sólo el suyo anterior.
- **Código:** desde `cab433d`, la base del 2026-10-18, el código de producción sólo cambió en:
  - `Back/src/modules/backups`;
  - `Back/src/config/env.schema.ts`;
  - la migración de retención.

  Además, en `sync-v1` cambiaron dos archivos, pero sólo de prueba (`git diff --name-only cab433d f0b55ee -- Back/src Back/prisma Web/src`).

### 2.1 BE #42 — F10-QA-02, suite adversarial de sincronización

| # | Criterio o compromiso | Estado demostrado | Qué falta realmente | Acción mínima y responsable |
|---|---|---|---|---|
| 42-1 | «Entregable integrado… y **enlazado**» | **Probado:** `sync-v1-adversarial.postgres.spec.ts` (41) y `sync-v1-references.postgres.spec.ts` (7), en CI 39284935149 sobre `f0b55ee`. El Central da 40/40 (`F05_SYNC_06.md`). | Sólo el enlace: #42 no cita ni la suite ni #18. | A publica en #42 el comentario de enlace ya redactado en el dry-run del 2026-10-18. |
| 42-2 | «Casos nominales, límites y fallos» en el teléfono | **Probado en parte:** 18 PASS y 22 NOT_MEASURED en DEVICE (`F05_SYNC_06_DEVICE_F10.md`), conservados así por la decisión de GATE-F05 (`F05_GATE_DECISION.md`). El ensayo B2 del 2026-10-19 añade, sobre `f0b55ee`/`463d3ec`, `OUTCOME_UNKNOWN → RESTORE_PAUSED` y un único reenvío idempotente (`F08_BKP_07_B2_ENSAYO_REAL.md` §2). No cambia el recuento. | **Prueba**, sólo si Roderich quiere Verified. Si no, queda como límite ya decidido. | Ninguna. **Recomendación:** mantener Partial, con las 22 filas declaradas. |

### 2.2 BE #43 — F10-QA-01, suite E2E crítica Mobile → Backend → Web

| # | Criterio o compromiso | Estado demostrado | Qué falta realmente | Acción mínima y responsable |
|---|---|---|---|---|
| 43-1 | Una «suite E2E» integrada | **No existe una suite única.** La cadena se cubre **por composición**: <ul><li>las piezas del 2026-10-18 (matriz, fila 1);</li><li>el **preflight E2E** sobre `main` integrado: MOB #134, `F10_PREFLIGHT_DSUX.md`, 2026-10-19 de 03:05Z a 03:31Z, Mobile `fd8dc7d` y Backend `df0df1d` (código `cab433d`), POCO, DEVICE + HOST. Recorre «sin red → push → journal único → 60 L en API y Web»;</li><li>el **ensayo B2**: `F08_BKP_07_B2_ENSAYO_REAL.md`, sobre `f0b55ee`/`463d3ec`, POCO, con subida desde la app, restauración en instalación limpia y liberación sin duplicados.</li></ul>Desde el preflight, el Backend no cambió fuera de los respaldos (§2), y Mobile sólo cambió 6 archivos de inventario, bitácora y CSV (`git diff --stat fd8dc7d 463d3ec -- lib`), ninguno de sync. | **Decisión humana:** si la composición y el preflight bastan para el criterio. No falta código. | Roderich decide. **Recomendación:** aceptarlo como Partial declarado («suite por composición, más un preflight sobre la base integrada»), sin una corrida nueva. A anota en #43 las tres piezas con sus SHA. |
| 43-2 | Fallos en la cadena | Los reintentos, `OUTCOME_UNKNOWN` y los conflictos están en #18/#42. La restauración seguida de una liberación idempotente está en el ensayo B2. El preflight declara que no los cubre. | Nada nuevo. | Ninguna. |

### 2.3 BE #44 — F10-SEC-01, pruebas negativas multiusuario, multitenant y de propiedad

| # | Criterio o compromiso | Estado demostrado | Qué falta realmente | Acción mínima y responsable |
|---|---|---|---|---|
| 44-1 | Mitigación: suite actor × recurso en CI antes de GATE-F10 | **Probado:** <ul><li>`current-auth-context` (25), `f02-final-integration` (3), `f10-sec-02-legacy-boundary` (29) y `backups.postgres` (21: eran 22 en `cab433d`, y #148 sustituyó la prueba del 409 `BACKUP_QUOTA_EXCEEDED`), en `backend-f02.yml`, CI 39284935149 sobre `f0b55ee`;</li><li>el ensayo B2 repite contra la API real 404, 403, 404 de otro tenant y 401 (`F08_BKP_07_B2_ENSAYO_REAL.md` §1).</li></ul>La frase «amplía `f02-final-integration`» se cumplió en las suites hermanas. | Nada técnico. | Ninguna. |
| 44-2 | Contrastar la documentación. Era la condición de Roderich para dejar #44 en Partial: «hasta el contraste documental» (dry-run del Project del 2026-10-18, decisiones) | **Hecho:** `docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` (`f211a08` y `cd7392b`, BE #143), contrastada con el código `cab433d`. Desde entonces, #148 cambió el módulo de respaldos: las descripciones 409/503 de `POST /me/backups` (`backups.controller.ts`), el servicio y la suite. **La autorización no cambió**: en `f0b55ee`, cada consulta sigue filtrando por el `tenantId` y el `memberId` de la sesión (`backups.service.ts:126, 266-267, 334, 348, 392-393, 410-411 y 428`). **Pero la fila de la línea 80 de la matriz quedó desfasada** en sus referencias: cita `backups.service.ts:104,241,257`, que hoy apuntan a otras líneas, y «(22)» pruebas, que ahora son 21. Este PR añade una nota fechada en la matriz (§7) sin reescribir la fila. (Desfase señalado por C en la revisión de `263dd67`.) | **Decisión humana:** la condición puesta para Partial ya se cumplió. | Roderich decide Evidence Verified para #44 (propuesta fundada en 44-1 y 44-2). A anota en #44 las cuatro suites, la matriz vigente y el workflow. **Límite que conviene declarar:** el cliente Web no tiene una suite negativa propia, salvo las redirecciones; la frontera es la API. |

### 2.4 BE #45 — F10-SEC-02, auditoría de privacidad de la proyección colectiva

| # | Criterio o compromiso | Estado demostrado | Qué falta realmente | Acción mínima y responsable |
|---|---|---|---|---|
| 45-1 | Cotejo campo a campo e inyección de campos excluidos | **Probado:** PR #118 y #126, H1–H4, R1 y R2 corregidos; C26 en CI. **Siguen abiertos en `f0b55ee`, comprobado hoy en el código:** <ul><li>**M5:** `eligible()` filtra el Member y la cuenta activos, pero no el rol (`collective-summary.use-case.ts:270-278`);</li><li>**M8:** `GET /collective/product-associations` no lleva `Cache-Control: no-store`; sólo `catalog` lo tiene (`inventory/api/rest/product-associations.controller.ts`).</li></ul> | **Código pequeño.** **M8** no cambia ninguna cifra. **M5** sólo cambia el resumen si a un Member le cambia el rol, algo que no ocurre en DS-UX. Ninguno de los dos bloquea el piloto. | **M8:** un PR de una línea más su aserción en una suite existente (B o C). **M5:** el filtro `role: AGRICULTOR` con su prueba, coordinado por A, o declararlo. **Recomendación:** corregir M8 y decidir M5. |
| 45-2 | «Antes del gate se fija una política de divulgación mínima» | **Pendiente.** Hay una política provisional, k = 3 con datos sintéticos. #107 está In Review · Partial y GATE-F07 Pending. | **Decisión humana:** del autor para datos reales, de la Directiva y del tutor (`F07_POL_01_REVISION_INSTITUCIONAL.md` §4–5). | Roderich, según ese §5. No hay ninguna acción técnica. |
| 45-3 | Contrato actualizado: «regla de historial entre claves» y el significado de la cobertura | **Pendiente en el documento:** `F10_SEC_02_PROJECTION.md` §5 dejó los dos puntos «pendientes de redactar» en `F06_COLLECTIVE_PROJECTION_CONTRACT.md`. En `f0b55ee`, la fila `R_CURRENT` (línea 138) sigue diciendo «no guardar historial de cantidades». Eso contradice M3, el historial inmutable que exige la regla de diferencias de F07-POL-01 §3. | **Decisión humana**, y después un cambio de documento: o se enmienda el contrato, añadiendo la excepción del historial de divulgación y su retención, o se decide una purga. Si un contrato y la implementación chocan, prevalece el contrato hasta que Roderich lo enmiende. | Roderich elige. Después, un PR sólo de documentación en el contrato, con una nota fechada sin reescribir (A, B o C). |

### 2.5 BE #46 — F10-QA-03, suite adversarial de backup y recuperación

| # | Criterio o compromiso | Estado demostrado | Qué falta realmente | Acción mínima y responsable |
|---|---|---|---|---|
| 46-1 | Límite «retención diferida» de la matriz del 2026-10-18 | **Ya no es un límite.** La retención está implementada y probada: <ul><li>#148, merge `f0b55ee`, `F08_BKP_06_RETENCION.md`;</li><li>#40 cerrado el 2026-10-19 a las 19:23Z;</li><li>contra B2 real, la rotación 5 + 1 deja 0 versiones de la copia retirada (`F08_BKP_07_B2_ENSAYO_REAL.md` §1).</li></ul>También están cerrados #149 (adaptador B2) y MOB #55 (REC-019). | Nada para el alcance académico. | A anota en #46 lo añadido: #148, #150 y #151. |
| 46-2 | Alcance reducido. Fue el motivo de Roderich para dejar #46 en Partial | Sigue igual: datos sintéticos, la precondición WAL no se cumple en el POCO (esa rama sólo está probada en host) y `PRODUCTION_ADMISSION` sigue cerrada. Lo que falta para datos reales está en **#151**. El límite «restaurar un esquema más nuevo» del 2026-10-18 **no lo reverifiqué**. | **Decisión humana**, ya tomada. Lo productivo está en #151. | Ninguna. **Recomendación:** mantener Partial, coherente con la decisión. |

### 2.6 BE #48 — F10-QA-04, rendimiento, *burn-down* de defectos y cierre de críticos

| # | Criterio o compromiso | Estado demostrado | Qué falta realmente | Acción mínima y responsable |
|---|---|---|---|---|
| 48-1 | Rendimiento (RNF-06) y compatibilidad (RNF-08) | Igual que el 2026-10-18: <ul><li>tres series, con todos los umbrales cumplidos donde se midió con el fin completo;</li><li>**R1 de la serie 2 (HONOR) BLOQUEADA**;</li><li>**A4-F NO CUMPLE**, hasta repetir M8 en el HONOR con `27c4654`;</li><li>A3 y A5 no se ejecutaron.</li></ul>No hay ninguna evidencia nueva. | **Prueba no rutinaria** (Roderich), o declararlo. | Ninguna, salvo que Roderich lo decida. |
| 48-2 | *Burn-down* | Defectos **abiertos**: sólo MOB **#119** y **#120** (F09-D1 y F09-D2, de voz y alcance opcional; F09 en pausa). Ninguno es de F10 ni afecta a T1–T6 o W1–W5. **Cerrados desde el 2026-10-18,** en la conciliación REC de Mobile: <ul><li>neutralización CSV de REC-017 (`c2b9906`);</li><li>bitácora con la aplicación revertida de REC-015 (`82d02fc`);</li><li>cifras netas de inventario (#140, `76eea02`).</li></ul>Los tres tienen evidencia en `REC_CONCILIACION_2026-10-19.md` (MOB). MOB #141 no cuenta: añade una prueba de un comportamiento que ya era correcto, no corrige un defecto. #151 no es un defecto: es lo pendiente para datos reales. | Sólo documental. | A adjunta en #48 la lista de la matriz del 2026-10-18, más esta fila. |
| 48-3 | Cierre de críticos | No hay ninguno abierto. El solape del botón «Nuevo» quedó como observación no bloqueante (`DECISION_SERIE3_Y_CIERRE_F10_2026-10-18.md`, punto 4). | Nada. | Ninguna. |

### 2.7 Fuera de Validation (sin cambio)

- **BE #47 y MOB #37:** no se ha hecho ninguna sesión con personas (`docs/evaluation/usabilidad/resultados/` sólo contiene el README). La «accesibilidad selectiva» de #47 sigue sin un criterio fijado antes de medir. Son acciones humanas.
- **BE #49 (GATE-F10):** Pending. La decisión es de Roderich.

---

## 3. Comprobaciones hechas para este contraste

Todas son de sólo lectura, el 2026-10-19 hacia las 19:00–19:35Z.

### 3.1 Consumidores de rutas heredadas en Mobile `463d3ec`

```text
git -C AppMovilAgroquimico grep -lE "/(sync/operations|inventory|applications|plots|crops|plot-crop-assignments|purchases|suppliers|accounts-payable|reports|calendar)" 463d3ec -- lib
  → ningún archivo
git -C AppMovilAgroquimico grep -hoE "api/v1/[a-z0-9/_-]+" 463d3ec -- lib | sort -u
  → api/v1/auth/clients, api/v1/auth/v2/{login,logout,me,refresh,session/client},
    api/v1/me/backups, api/v1/sync/v1/{operations,push,references}
```

Es una búsqueda estática. No prueba que no haya consumidores en otras revisiones, en despliegues ni fuera de estos repositorios. Queda registrada como `NOT_FOUND_IN_AUDITED_REVISION` en `docs/scope/LEGACY_CONTRACT_CONSUMERS.md`.

### 3.2 Otras comprobaciones

| Comprobación | Resultado |
|---|---|
| Código de `2a69fe6` igual al de `f0b55ee` | Sí: `git diff --stat` vacío en `Back/src`, `Back/prisma` y `Web/src` |
| Código cambiado desde `cab433d` | Sólo `backups`, `env.schema.ts`, la migración de retención y dos archivos de prueba de `sync-v1` |
| Migraciones desde el 2026-10-07 | 8, con 0 `DROP TABLE` o `DROP COLUMN` |
| Rutas cerradas | `GET /inventory/global-stock` y `POST /purchases/joint`, con `LegacyRouteClosedGuard` |
| M5 y M8 | Abiertos, según las líneas citadas en la fila 45-1 |
| Contrato F06, `R_CURRENT` | Sin la regla de historial, según la fila 45-3 |
| Project, issues y CI | Leídos con `gh`. No se cambió nada |

**Fuentes:**
- los issues BE #42–#49, #81, #40, #105, #107, #149 y #151, y MOB #37, #55, #57, #119 y #120;
- el Project #3;
- `docs/scope/*`, `docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` y `docs/evidence/F10_SEC_02_*`, `F08_*`, `F05_*` y `F10_*`, de los dos repositorios;
- los briefs de decisión del 2026-10-18 que se citan.
