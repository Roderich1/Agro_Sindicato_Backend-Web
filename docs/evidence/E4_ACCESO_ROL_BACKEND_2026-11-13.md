# E4 — Acceso por rol y totales sin umbral: evidencia del Backend

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-13 |
| Rama | `feat/acceso-rol-sin-k-a` (desde `970034b`), sin push ni PR |
| Contrato | [`E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md`](../architecture/E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md), §11 con las precisiones de la implementación |
| Código probado | Suites completas sobre `b7132ba`. Después, `c045c8c` sólo retira dos ayudantes sin uso de una prueba; el módulo `joint-purchase-calls` se volvió a ejecutar sobre él (103/103). |
| Entorno | Windows 11, Node del repositorio, PostgreSQL 16.13 en Docker (`agro_acc_pg`, `127.0.0.1:15440`, bases desechables por suite), API en `127.0.0.1:3400` |
| Datos | Sólo sintéticos. Ningún token, contraseña ni clave aparece en este archivo ni en el JSON del recorrido. |
| Gate | Pending (lo decide Roderich) |

## 1. Commits

| SHA | Qué hace |
|---|---|
| `01bcfe2` | A0: tipos del contrato institucional 2 y del contrato 4, `CONV-4` con texto y ayuda, cuatro códigos nuevos, esquemas OpenAPI e instantáneas, `E4_EJEMPLOS_RESPUESTAS.md` |
| `9f545d8` | Migración `20261113120000_e4_acceso_rol_sin_k` y `schema.prisma` |
| `59041ad` | Convocatorias: acceso por rol, regla T, retiro de permisos, sustitución por la Administración, `CONV-4`, `TOTALS_ONLY`, compatibilidad §7 |
| `87f90d9` | `F07-POL-02`, `COLLECTIVE_DISCLOSURE_POLICY`, activación trazada, política grabada en divulgaciones, sellados, borradores y ejecuciones F12 |
| `310a1fa` | Pruebas unitarias (matriz de la regla T, consentimiento, `F07-POL-02`, sellado, huellas, configuración) |
| `31774c4` | Pruebas PostgreSQL de convocatorias (E4 §8, pruebas 1–10 y 12) y pruebas reescritas |
| `12f75dc` | Suites colectivas y F12 sobre bases anteriores a E4; activación tolerante sin tabla con la política por defecto |
| `a939dfb` | Pruebas PostgreSQL de `F07-POL-02` y su activación (pruebas 11 y 13) y la de F12 con umbral nulo |
| `b7132ba` | La migración desde cero cuenta 24 migraciones |
| `a3f8f9b` | Notas de implementación (E4 §11, E2, F07), ejemplos ajustados y `scripts/e4-acc-synthetic-walk.cjs` |
| `c045c8c` | Retira ayudantes P-C sin uso en la suite de E2 |

## 2. Migración

`Back/prisma/migrations/20261113120000_e4_acceso_rol_sin_k/migration.sql`, aplicada con `prisma migrate deploy` (cada suite crea su base y la migra desde cero). Es aditiva y no borra ni reescribe datos.

- `JointPurchaseConsentScope` + `ADMINISTRATION`, `TOTALS_ONLY`.
- `CollectiveRelease.policy` y `JointPurchaseProposal.disclosurePolicy`: `VARCHAR(16)` nulas, sin relleno (NULL = anterior, `F07-POL-01`), con CHECK de valores.
- `CollectiveSeal.threshold` y `EstimationRun.threshold`: `DROP NOT NULL`. Se recrean `*_values` sin `threshold > 0` y se añade `*_policy_threshold`: `F07-POL-01` ⇔ umbral presente y positivo.
- `joint_purchase_call_access_guard` rechaza insertar `PARTICIPANTS` (también la fila del sistema) y borrar una fila `PARTICIPANTS` guardada. `MANAGE` sigue las reglas de P-A.
- Tabla `CollectiveDisclosurePolicyActivation`, sólo de inserción y vacía al migrar.
- **No migra:** consentimientos aceptados (ninguno se reinterpreta y no hay filas `MIGRATED` nuevas), filas `PARTICIPANTS` y eventos (quedan como historia), permisos «Sustituir responsable» (historia), lo sellado y lo ejecutado antes (conserva `F07-POL-01` y 3), y estados `SUPPRESSED_UNDER_THRESHOLD` guardados.
- Comprobación: `prisma migrate diff --from-url <base migrada> --to-schema-datamodel prisma/schema.prisma` → «No difference detected.»

## 3. Suites ejecutadas

| Comando | Resultado |
|---|---|
| `npx jest --runInBand --coverage` con todas las variables `*_PG_TEST_URL` (las de F02 con su base migrada propia; las demás, `postgresql://postgres@127.0.0.1:15440/postgres`, que crea una base por suite) | **86 suites pasan, 2 omitidas; 1015 pruebas pasan, 13 omitidas, 0 fallan** |
| `E2_PG_TEST_URL=… npx jest src/modules/joint-purchase-calls` (sobre `c045c8c`) | 103/103 |
| `npx nest build` (tras borrar `tsconfig*.tsbuildinfo`) | sin errores |
| `npm run openapi:check` | instantáneas iguales; aserciones F02, F05, F06, F08 y F12 pasan |
| `npx eslint "src/**/*.ts"` | sin problemas nuevos en lo tocado; los que quedan son anteriores (por ejemplo `URL` en `env.schema.ts:85`, `CallForAccess` sin uso) |

Las 2 suites omitidas dependen de variables propias que no se dieron; una es la herramienta de comparación k (`F07_K_COMPARE_PG_URL`), que no cambia.

Una primera ejecución completa dio 41 fallos: las suites de F02 recibían una base sin migrar (esperan una base propia ya migrada) y la de la migración desde cero contaba 23 migraciones. Se dio a F02 su base y se corrigió la cuenta (`b7132ba`). El resultado de la tabla es el de la segunda ejecución.

### Cobertura de los módulos tocados

De la ejecución completa (`--coverage`). Columnas: sentencias / ramas / funciones / líneas.

| Ruta | % |
|---|---|
| `joint-purchase-calls/domain` (consent.ts y visibility.ts: 100 / 100 / 100 / 100) | 96.51 / 89.18 / 100 / 99.31 |
| `joint-purchase-calls/application` | 92.99 / 80.97 / 96.92 / 96.34 |
| — `institutional-calls.use-case.ts` | 92.54 / 80.24 / 98.11 / 95.21 |
| — `farmer-participation.use-case.ts` | 96.08 / 82.07 / 100 / 98.66 |
| — `responsible-substitution.use-case.ts` | 89.77 / 75 / 92.3 / 97.26 |
| — `call-access.ts` | 96.96 / 95.45 / 100 / 100 |
| `joint-purchase-calls/api/rest` | 97.22 / 78.94 / 100 / 98.11 |
| `collective/domain` (disclosure-policy.ts 98.66 / 94.62 / 100 / 100; seal.ts y proposal.ts 100) | 98.56 / 94.63 / 98.71 / 99.63 |
| `collective/application` (collective-config.ts 100; collective-policy-activation.ts 96.66 / 94.73 / 100 / 100) | 98.09 / 90.44 / 100 / 100 |
| `estimation/application` (estimation-reads 98.85 / 95.55; estimation-worker 90.17 / 80.85) | 94.91 / 89.89 / 100 / 97.11 |
| Global del Backend | 91.21 / 77.57 / 92.63 / 92.88 |

## 4. Pruebas de E4 §8 (Backend)

| # | Archivo | Prueba | Resultado |
|---|---|---|---|
| 1 | `joint-purchase-calls.postgres.spec.ts` | «test 1: the Directiva never gets names or quantities per person…» y «E4 §2: identified participants only for an eligible Administración…» | pasa |
| 2 | ídem | «test 2: the Administración sees only ADMINISTRATION participations…», «requires MANAGE … (N2 rejected, m6)» (responsable inhabilitada) y «E4 §8 test 7» (tras la sustitución) | pasa |
| 3 | ídem | «test 3: an Administración that stops being eligible…» | pasa (401 o 403, ver §6) |
| 4 | ídem | «test 4: another tenant gets 404 on every call route; a farmer gets 403…» | pasa |
| 5 | ídem | «test 5: PARTICIPANTS grant, revoke and review answer 409 GRANT_RETIRED…» y la de MANAGE reescrita | pasa |
| 6 | ídem | «E4 §8 test 6: granting and revoking «Sustituir responsable» answer 409…» | pasa |
| 7 | ídem | «E4 §8 test 7», «B1 on a DRAFT and a CLOSED call…», «two concurrent substitutions…», «author's decision… never names herself…» | pasa |
| 8 | ídem | «E4 §4.2 (test 8)…», «E4 §4.2: on a cancelled call…», «E4: earlier consents… a decision ADMINISTRATION in CLOSED…» | pasa |
| 9 | ídem | «test 9: contracts 1, 2 and 3 read the shape 4…» y «lists open calls and own participation only» | pasa |
| 10 | `visibility-matrix.spec.ts` (26 filas + 3), `call-domain.spec.ts`, y en PostgreSQL las de los puntos 1, 7 y 8 | matriz de la regla T; `PREVIOUS_POLICY_K3` para la Directiva y `PENDING_CONSENT` para la Administración que ve a otras | pasa |
| 11 | `collective/e4-pol-02-activation.postgres.spec.ts`, `disclosure-policy.spec.ts`, `seal.spec.ts`, `f12-est-05-runs.postgres.spec.ts` | 1 y 2 aportantes, cero, unidades, CANCEL, disputa e inactivo, `POLICY_PENDING`, sellado `F07-POL-01` intacto, borrador antiguo, ejecución F12 anterior con 3 y nueva con NULL | pasa |
| 12 | `joint-purchase-calls.postgres.spec.ts` «test 12…» y la de colaboradores | `PARTICIPANTS` rechazado; CHECK política ⇔ umbral en `CollectiveSeal` y `EstimationRun` | pasa |
| 13 | `collective/e4-pol-02-activation.postgres.spec.ts`, `collective-config.spec.ts` | por defecto `F07-POL-01`; una fila en el primer arranque con `F07-POL-02`; un valor desconocido no arranca; sólo inserción; lo sellado no cambia; volver al valor por defecto también se registra | pasa |

## 5. Pruebas reescritas (declaradas en el propio archivo)

| Archivo | Prueba anterior | Por qué |
|---|---|---|
| `call-domain.spec.ts` | «publishes CONV-3 (N5)…» | `CONV-3` deja de ser la vigente; se conserva su texto exacto como anterior y se añade la de `CONV-4` |
| ídem | «widening cites the current text…» y «only the COLLABORATORS scope reaches collaborators» | `decisionVersionAccepted` y `scopeCoversCollaborators` se sustituyen por `coversDetail` y `coversTotals` (E4 §4.2) |
| ídem | bloques «E2 visibility (E2-D7)» y «E2-P3 visibility (§10.3)» | el umbral para quien no tenía el permiso y los visores responsable/colaborador se retiran (E4 §2, §5.2) |
| `visibility-matrix.spec.ts` | matriz N3 / §10.3 | sustituida por la matriz de la regla T (brief §2.3) |
| `seal.spec.ts` | `inputs` sin `policy` | `review_ref` v2 incluye la política (E4 §3.4) |
| `joint-purchase-calls.postgres.spec.ts` | «shows identified participants only to the responsible, whatever the role» | el detalle es de la Administración por rol (E4 §2) |
| ídem | «lists open calls and own participation only» (lecturas) | las lecturas salen en forma 4 para todos los contratos (E4 §7.1) |
| ídem | «refuses operations after the deadline…» (una línea) | un CONV-1 solo da `PENDING_CONSENT` (regla T) |
| ídem | «closes idempotently…» (una aserción) | `PREVIOUS_POLICY_K3` y `PENDING_CONSENT` en lugar de `VISIBLE`/`UNDER_THRESHOLD` |
| ídem | «only the responsible grants…» | las mismas reglas con `MANAGE`; `PARTICIPANTS` retirado |
| ídem | «requires MANAGE to edit, open, cancel and close…» (líneas de participantes) | el detalle sigue al rol, también con la responsable inhabilitada; la delegación `PARTICIPANTS` se sustituye por `MANAGE` |
| ídem | «CONV-1 only for the responsible, CONV-2 also for collaborators…» | ningún alcance anterior llega al detalle; regla T; fila `PARTICIPANTS` guardada sin efecto |
| ídem | «P-C (§10.6)…» | decisiones `ADMINISTRATION`, `TOTALS_ONLY` y reducción; ampliar retirado; se conservan orden, idempotencia y separación de cantidades |
| ídem | «P-C: on a cancelled call…» | `ADMINISTRATION`/`TOTALS_ONLY` rechazados en `CANCELLED`; ampliar retirado |
| ídem | bloque «P-A substitution of the responsible (§12: A1 + B1 + C1)» (5 pruebas) | A1 y C1 retirados; B1 por la Administración, con todas sus salvaguardas repetidas |
| `sync-v1-journal.postgres.spec.ts` | cuenta de 23 migraciones | con E4 son 24 |
| `f12-est-01…`, `f07-collective-seal…` (dumps) y `synthetic-sources.ts` | lectura de todas las columnas de `CollectiveRelease` en una base anterior a E4 | se lee sólo el id o se omite `policy`; comparan las mismas columnas |

Ninguna prueba de permisos se eliminó: las que cambian lo hacen por E4 y están marcadas «Rewritten for E4 (declared)».

## 6. Recorrido de la API (3400 / 15440)

API: `node dist/main.js` con `PORT=3400`, `DATABASE_URL=…/acc_api`, `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`, `COLLECTIVE_SEALING=enabled`, `COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02` y secretos generados en el proceso. El arranque registró una activación (`F07-POL-02`, anterior nula, `CONFIG`).

Siembra y recorrido: `scripts/e4-acc-synthetic-walk.cjs` con `E4_LABEL=ACC1` y `E4_WALK=yes`, por HTTP con `fetch`, en lugar de `curl`. Los tokens se crean y usan dentro del proceso y nunca se escriben. Salida completa sin secretos: [`E4_ACCESO_ROL_BACKEND_2026-11-13_recorrido.json`](E4_ACCESO_ROL_BACKEND_2026-11-13_recorrido.json).

| Estado | Paso | Extracto |
|---|---|---|
| 201 | D1 crea el borrador | `contractVersion: 2`; productos con `0`, `VISIBLE`, `ROLE_CONSENT` |
| 200 | D1 abre | historial «Convocatoria abierta.» |
| 200 | F1 confirma con CONV-4 (contrato 4) | alcance `ADMINISTRATION`, sin `responsible_authorization` |
| 200 | F2 confirma con CONV-3 (contrato 3) | `RESPONSIBLE_ONLY`, con `responsible_authorization` |
| 200 | F3 confirma con CONV-1 (sin cabecera) | forma 1, sin `consent_scope` |
| 200 / 403 | D1 (Directiva responsable): detalle / participantes | `can_view_participants: false`, `pending_consent_count: 2`, totales `PENDING_CONSENT` / `PARTICIPANTS_FORBIDDEN` |
| 200 / 200 | A1: detalle / participantes | `can_view_participants: true` / sólo F1, `pending_consent_count: 2` |
| 200 ×4 | F1 lee la lista con contratos 1, 2, 3 y 4 | `contractVersion: 4`, `CONV-4`, con `help` |
| 409 | F2 amplía a colaboradores (contrato 2) | `CONSENT_VERSION_RETIRED` |
| 409 | F1 modifica desde un contrato 3 sobre `ADMINISTRATION` | `APP_UPDATE_REQUIRED` |
| 409 | D1 concede `PARTICIPANTS` | `GRANT_RETIRED` |
| 409 / 200 | A1 concede / lee «Sustituir responsable» | `SUBSTITUTION_PERMISSION_RETIRED` / `contractVersion: 2`, `can_grant: false` |
| 404 / 403 | Otro sindicato / agricultor en ruta institucional | `CALL_NOT_FOUND` / `AUTH_CONTEXT_FORBIDDEN` |
| 200 → 403 → 200 → 401 | A2: participantes; pasa a Directiva; vuelve; deshabilitada | mismo token en las cuatro peticiones |
| 403 / 422 / 200 | Sustitución: D2 (Directiva) / A1 a sí misma / A1 a D2 | `SUBSTITUTION_FORBIDDEN` / `SUCCESSOR_NOT_ELIGIBLE` / versión 2 |
| 403 / 200 | Tras la sustitución: D2 / A1 participantes | `PARTICIPANTS_FORBIDDEN` / F1 |
| 200 | F2 autoriza a la Administración (contrato 4) | `ADMINISTRATION`; cantidades sin cambio |
| 200 | A1 participantes | F1 y F2; `pending_consent_count: 1` |
| 200 / 200 | D2 cierra / A1 lee el cierre | Herbicida `[2, "3000", VISIBLE, ROLE_CONSENT]`, Fertilizante `[2, null, PENDING_CONSENT]`; detalle `null` para D2, F1 y F2 para A1 |

## 7. Limitaciones y discrepancias declaradas

1. **401 en lugar de 403** cuando se desactivan el Member, la cuenta o el tenant. Lo decide el contexto de autenticación común (IAM), fuera de E4. El cambio de rol sí da 403. En ambos casos el acceso se corta desde la petición siguiente sin revocar el token (E4 §11.1).
2. **Los commits de la lógica de convocatorias no se separaron** en «autorización», «consentimiento y transición», «regla T» y «compatibilidad»: comparten `consent.ts`, `call-views.ts` y los casos de uso, y separarlos dejaba commits que no compilaban. Van juntos en `59041ad`.
3. **Recorrido con `fetch`, no con `curl`:** con `curl` habría que pasar los tokens por la línea de comandos o por archivos.
4. **La ejecución F12 «anterior»** se prueba en la misma base (ejecuciones con `F07-POL-01` y 3), con la política cambiada en la aplicación en marcha, no con una base anterior a E4.
5. **Sin pruebas de la Web ni de Mobile:** son de las sesiones B y C. No se tocó `Web/**` ni Mobile.
6. **Divulgación de datos reales:** sigue sin aprobar (#107). Todo se probó con `provisional-synthetic`.
7. **Trazabilidad:** E4 §10. No se añadieron IDs nuevos.
