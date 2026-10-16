# Evidencia F05-SYNC-05 — push/ACK v1 idempotente y consulta owner-scoped

Issue [#17](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/17). Implementa el [contrato v1](../architecture/F05_SYNC_V1_PUSH_ACK_CONTRACT.md) (#16) sin modificar el contrato ni el sync legacy.

Ejecución con Claude Code el 2026-10-15 (America/La_Paz), en el entorno de desarrollo. No es un PASS de GATE-F05 (#19): el gate sigue Pending.

## 1. Identidad de la ejecución

| Elemento | Valor |
| --- | --- |
| Base | `main` `d3911cea7c5a68decbb0ea0e970129efd553c38c` |
| Rama | `feat/f05-sync-v1-push` |
| Commits | `0ed30b6318de423d6a2f63df787d2f7a7261ca57` (implementación); `6e2aff49fec105596ca943e82e65a44f37cdabf9` (revalidación al decidir, C40); `0c5167c958c7f69b321a70e77060d82341b758b9` (DEPENDENCY_PENDING, C28; C22 completo); `7ee0ec143f9e5ede4e8d1f40264a40e85cf105fd` (caída de Central antes del commit y reinicio después); `6a86c57c948e2f07422dd56abddaf2cc487cfd83` (C24 con el refresh V2 real); `74bc47378cd310787654199d432c3e2392f8ec92` (referencias sin escrituras ni logs); `a8e1cd7bb87c8a88ee55a51d5d36a0c0f7c4cb0a` (429 en las consultas); `720d1af0977ca7f74c8b9c585ff19abfb2b9bb52` (LF del snapshot); `db870043f072cb42bf3a5d7c1d83cdc196c0ae40` (forma cerrada de las referencias en el check OpenAPI); `c2acbd4cc6b51befec92dc6f5f9ad9ed059d8357` (SonarCloud S2068 y `test-support` fuera de `dist`, §3.1) |
| Código final verificado | `c2acbd4`. Antes `db87004`; entre ambos sólo hay el commit de evidencia `cbc74e3` |
| Entorno | Windows 11 Home 10.0.26200; Node 25.9.0 local (el CI usa Node 22); PostgreSQL `postgres:16-alpine` desechable en `127.0.0.1:55433`, una base nueva por suite |
| Datos | Sintéticos. Ningún token, contraseña o clave se imprimió ni se guardó |

## 2. Qué se implementó

| Pieza | Contrato | Decisión |
| --- | --- | --- |
| `POST /api/v1/sync/v1/push` | §2, §4, §10 | Una operación por request. El cuerpo se lee en bruto (`configureSyncV1BodyParser`, antes del parser JSON de Nest) y se analiza con un parser estricto: rechaza claves duplicadas en cualquier nivel y conserva los números como texto, así que `1` y `1.0` no se confunden. El envelope es cerrado: un campo desconocido da `FIELD_NOT_ALLOWED`; un tipo, forma, UUID o lote inválido da `INVALID_REQUEST`. Un `contractVersion` entero distinto de 1 da 422 **antes** de cualquier otra comprobación de forma |
| Contexto de autenticación | §3, §9 | `SyncV1AuthGuard` evita el guard JWT global (`@Public`) y revalida en cada request cuenta, Member AGRICULTOR, tenant, AuthSession y el ClientRegistration enlazado. **401 `AUTH_REQUIRED`** con `WWW-Authenticate` si la credencial falta, es inválida o expiró. **403 `AUTH_CONTEXT_FORBIDDEN`** si la sesión, el Member, la cuenta, el tenant o el registro están revocados o inactivos, si falta el registro, si el token es V1 o si el rol no es AGRICULTOR (Directiva y Administrador no publican por el agricultor). La decisión vuelve a validar el contexto dentro de su transacción con `FOR SHARE` (§10, C40) |
| Huella | §5 | HMAC-SHA-256 del vector canónico compacto, con clave `SYNC_V1_FINGERPRINT_KEY` (base64, al menos 32 bytes) y versión `SYNC_V1_FINGERPRINT_KEY_VERSION`. Las claves anteriores (`SYNC_V1_FINGERPRINT_PREVIOUS_KEYS`, `versión=base64`) verifican journals creados antes de una rotación. Una versión desconocida da 503, nunca una aceptación nueva. La huella no se devuelve ni se registra |
| Reserva y reenvío | §5, §7 | Cada push toma un advisory lock transaccional sobre `(tenant, Member, operationId)`, así que los requests con el mismo ID se turnan. Después, `reserve()` del journal existente. Mismo contenido: el resultado persistido (APPLIED se presenta como `ALREADY_APPLIED`, con la hora original). Contenido distinto: `REJECTED`/`IDEMPOTENCY_MISMATCH`, sin crear otro resultado ni tocar el original. `PROCESSING` visible: `RETRYABLE`/`OPERATION_IN_PROGRESS` |
| Antecesor en procesamiento | §6, C28 | Si el antecesor propio no es visible, un intento compartido **sin espera** sobre su lock distingue «en procesamiento» de «desconocido». En procesamiento: `RETRYABLE`/`DEPENDENCY_PENDING` con rollback; no queda journal ni resultado final. Desconocido: `INVALID_PREDECESSOR` (C27). El intento no espera, así que no se bloquea con el antecesor que espera la contribución |
| Validación de dominio | §4, §6 | Campaña y producto inexistentes, ajenos o (para valores nuevos) inactivos comparten `REFERENCE_UNAVAILABLE`. La unidad debe ser L→ML o KG→G: sólo se normaliza la caja del símbolo (`kg` del catálogo); no hay conversión ni densidad. Fuera de int64 da `QUANTITY_INVALID`. Una campaña no ABIERTA/activa da `CAMPAIGN_NOT_OPEN` para PUBLISH/SUPERSEDE; CANCEL retira también en campaña cerrada |
| Causalidad | §6 | Decisión pura (`decideCausal`) bajo el bloqueo de la fila de la contribución (`SELECT … FOR UPDATE`). Sin LWW: sólo continúa el head aceptado. Un segundo sucesor del mismo head da `CONFLICT`/`CAUSAL_FORK` y la contribución pasa a `CONTESTED`, **sin cantidad**, con una disputa mínima. Un antecesor anterior da `STALE_PREDECESSOR`; un sucesor de una retirada, `CANCELLED_PREDECESSOR` (el tombstone se mantiene). La resolución exige head y referencia vigentes y cerca las ramas anteriores (`CAUSAL_FENCED`). Una referencia obsoleta da `RECONCILIATION_STALE` |
| Atomicidad | §10 | Una transacción PostgreSQL (READ COMMITTED) reúne revalidación del contexto, reserva, bloqueo, decisión, transición y resultado final. El ACK se construye sólo con lo confirmado. Un fallo antes del commit no deja nada parcial |
| `GET /api/v1/sync/v1/operations/{operationId}` | §9 | Búsqueda por tenant, Member y operationId en el store autoritativo. Devuelve exactamente `{ack, contribution}`; `contribution` tiene exactamente `status`, `headOperationId` y `reconciliationReference`, o es null. Lo ajeno o inexistente da el mismo 404 `OPERATION_NOT_FOUND`. Sin cantidades ni payload |
| Errores | §9 | Cuerpo cerrado `{contractVersion, operationId: null, errorCode, disposition}` y `Cache-Control: no-store` en ACK, error y GET. Un 500 lleva `TEMPORARILY_UNAVAILABLE`/`KEEP_FOR_RETRY`: no prueba ni descarta un commit |
| Admisión | §12, C36 | Sin clave de huella, las escrituras dan 503. Con `NODE_ENV=production` siguen cerradas hasta `SYNC_V1_PRODUCTION_ADMISSION=enabled`, porque las políticas de retención y divulgación (`PERIOD_DELEGATED`, F10 #45) no están aprobadas |
| Auditoría | §12 | El log registra outcome, code, operationId, tipo y acción. No registra cantidades, cuerpos, nombres de campos rechazados, tokens ni el raw clientId |

### Modelo de datos (migración aditiva `20261015220130_f05_sync_v1_contribution`)

| Objeto | Contenido |
| --- | --- |
| `SyncV1Contribution` | Clave lógica `(tenant, Member, projectionType, campaign, product, baseUnit)`, única. `status` (NEVER_PUBLISHED, ACTIVE, CANCELLED, CONTESTED), `headOperationId`, `quantityBase` BigInt (sólo ACTIVE), `reconciliationReference` (disputa abierta), `lastSequence`, `fencedThroughSequence`, `acceptedAt`. FKs `Restrict` a Tenant, Member (compuesta con el tenant), campaña y producto |
| `SyncV1Dispute` | Conflicto mínimo: id (la referencia opaca), contribución, operación que la abrió, `createdAt`, `closedAt`, `closeReason` (RESOLVED o SUPERSEDED), operación que la resolvió. Sin cantidades, nombres ni snapshots |
| Journal | `contributionId` y `contributionSequence` (orden de las transiciones aceptadas), nullable |
| CHECK | Cantidad no negativa. Forma por estado: NEVER_PUBLISHED sin head ni cantidad; ACTIVE con head y cantidad, sin disputa; CANCELLED sin cantidad; CONTESTED sin cantidad y con referencia. Coherencia de secuencias |

No se modifican filas ni migraciones existentes. Las rutas y tablas legacy siguen intactas (#81).

## 3. Resultados

| Sobre | Comando | Resultado |
| --- | --- | --- |
| `0ed30b6` | `npx prisma validate`; `npm run build` | válido; build OK |
| `0ed30b6` | `npm test -- --runInBand` | 29 suites / **172** pruebas pasan (105 previas + 67 nuevas de dominio); 115 de PostgreSQL omitidas por diseño |
| `0ed30b6` | `npm run openapi:check` | snapshots sin deriva; aserciones F02 y F05 pasan |
| `0ed30b6` | `auth-v2` / `current-auth-context` / `f02-final-integration` (PostgreSQL) | 12/12, 25/25, 3/3 |
| `0ed30b6` | `sync-v1-journal.postgres.spec.ts` | 30/30 |
| `6e2aff4` | `npm test`, build, `openapi:check`, eslint de `sync-v1` | 172 pasan; build OK; sin deriva; sin problemas |
| `6e2aff4` | `sync-v1-journal` / `sync-v1-adversarial` / `sync-v1-references` (PostgreSQL) | 30/30, **39/39**, **7/7** |
| `0c5167c` | build; eslint `sync-v1`; `npm test`; las tres suites `sync-v1`; adversarial tres veces más | OK; sin problemas; 172; 30/30, **40/40**, 7/7; 40/40 en las tres repeticiones |
| `7ee0ec1` | `npx prisma validate`; `npm run build`; eslint `sync-v1` | válido; OK; sin problemas |
| `7ee0ec1` | `npm test -- --runInBand` | 29 suites / **172** pasan; 118 de PostgreSQL omitidas por diseño |
| `7ee0ec1` | `npm run openapi:check`, con `DATABASE_URL` y secretos JWT sintéticos como en CI | snapshots sin deriva; aserciones F02 y F05 pasan |
| `7ee0ec1` | `sync-v1-journal` / `sync-v1-adversarial` / `sync-v1-references` (PostgreSQL) | 30/30, **41/41**, 7/7 |
| `7ee0ec1` | `auth-v2` / `current-auth-context` / `f02-final-integration`, sobre una base nueva con `prisma migrate deploy` | 12/12, 25/25, 3/3 |
| **`db87004` (final)** | `npx prisma validate` con `DATABASE_URL` definida | válido (sin la variable: P1012 «Environment variable not found», no un error del schema) |
| **`db87004` (final)** | `npm run build`; eslint `sync-v1`; `npm test -- --runInBand` | OK; sin problemas; 29 suites / **172** pasan, 118 omitidas por diseño |
| **`db87004` (final)** | `npm run openapi:check` (con variables sintéticas como en CI) | sin deriva; aserciones F02 y F05 pasan |
| **`db87004` (final)** | `sync-v1-journal` / `sync-v1-adversarial` / `sync-v1-references` | **30/30, 41/41, 7/7** |
| `db87004` | `auth-v2` / `current-auth-context` / `f02-final-integration` (base nueva migrada, eliminada al terminar) | **12/12, 25/25, 3/3** |
| **`c2acbd4` (final)** | `npm run build` (limpio, sin `tsconfig.build.tsbuildinfo`); `find dist -path '*test-support*'`; `grep -rl nestjs/testing dist` | OK; **0** archivos de `test-support` y **0** referencias a `@nestjs/testing` en `dist` (antes, `tsc -p tsconfig.build.json --listFilesOnly` listaba `sync-v1-test-app.ts`) |
| **`c2acbd4` (final)** | eslint `sync-v1`; `tsc --noEmit -p tsconfig.json`; `npm test -- --runInBand` | sin problemas; sin errores; 29 suites / **172** pasan, 118 omitidas por diseño |
| **`c2acbd4` (final)** | `sync-v1-journal` / `sync-v1-adversarial` / `sync-v1-references` | **30/30, 41/41, 7/7** |
| **`c2acbd4` (final)** | `npm run openapi:check` y `npx prisma validate` (variables sintéticas como en CI) | sin deriva; aserciones F02 y F05 pasan; válido |
| **`c2acbd4` (final)** | CI `verify` (run 38832426237) y SonarCloud | **success**; Quality Gate **OK** (§3.1) |

**Fallos observados durante el trabajo (conservados):**
- La especificación del journal fijaba 5 migraciones y la nueva hizo 6. Ahora exige 6, con la del journal en su posición y la de contribución al final.
- En la suite adversarial, `overrideGuard(ThrottlerGuard)` no desactivaba el throttler, porque se registra como `APP_GUARD`. Desde la 21.ª petición todo daba 429. El arnés lo salta ahora mediante sus opciones (`skipIf`), y C29 lo prueba con el límite real.
- Una primera prueba `curl` falló porque `nest build` no emitió `dist` (`*.tsbuildinfo` desactualizado con `deleteOutDir`). Se borró ese artefacto ignorado y se recompiló.
- **Defecto propio encontrado al redactar la matriz (corregido en `0c5167c`).** Un sucesor que tomaba el bloqueo de la contribución mientras su antecesor seguía reservado sin confirmar no lo veía (READ COMMITTED). Recibía un `INVALID_PREDECESSOR` terminal y persistido, aunque el antecesor se aceptara justo después. Ahora da `DEPENDENCY_PENDING` sin persistir; lo prueba C28 de forma determinista.
- La prueba C22 se llamaba «Member, account or tenant inactive», pero no cubría el tenant ni la sesión revocada. Ahora cubre los dos, en POST y GET (`0c5167c`).
- La primera versión de la prueba de caída fallaba: `pg_terminate_backend(bigint)` no existe, y se corrigió con un cast a `int`. Las suites F02 ejecutadas contra la base `postgres` sin migrar fallaron 12/25/3 porque faltaban las tablas. Con una base migrada, como en CI, pasan. `openapi:check` sin `DATABASE_URL` ni secretos JWT salió con código 1 sin mensaje; con esas variables, como en CI, pasa.

### 3.1 SonarCloud en el PR #109 (2026-10-15)

Sobre `cbc74e3`, `verify` pasaba, pero SonarCloud daba **Quality Gate failed**: `new_security_rating` = 3 (C), con A exigido. Las demás condiciones estaban en A, sin duplicación y con todos los hotspots revisados.

Consulta de la API pública (`api/qualitygates/project_status`, `api/issues/search` y `api/hotspots/search` con `pullRequest=109`):
- **Único hallazgo de seguridad:** `typescript:S2068` (MAJOR, VULNERABILITY), «Review this potentially hard-coded password», en `Back/src/modules/sync-v1/test-support/sync-v1-test-app.ts:136` (`passwordHash: "synthetic-unused-hash"`).
- **Hotspots:** 0.
- **Resto:** 16 code smells, que no afectan al gate (mantenibilidad en A).

**Análisis.** El valor no era una credencial utilizable: no es un hash bcrypt, así que ninguna contraseña coincide. Pero el hallazgo apuntaba a un defecto real: `tsconfig.build.json` sólo excluía `**/*spec.ts`. Por eso `test-support/` entraba en `dist`, el artefacto que se sirve, con un `JWT_SECRET` fijo de pruebas y una importación de `@nestjs/testing`. Ninguna ruta lo usaba, pero no debía estar ahí.

**Corrección (`c2acbd4`).** No se cambiaron umbrales ni reglas, ni se suprimió nada.
- `tsconfig.build.json` excluye `src/**/test-support/**`.
- Las claves JWT de prueba y los hash de contraseña sintéticos se generan al azar por proceso (`randomBytes`); ninguno queda escrito en el código. También es aleatoria la contraseña del e2e de referencias.
- C35 firma su token V1 con la misma clave aleatoria. Así sigue probando el rechazo del token V1 y no un fallo de firma. **Comprobado:** con una clave distinta, C35 falla (recibe otro estado en lugar del 403); el archivo se restauró byte a byte.

**Resultado sobre `c2acbd4`.**
- CI `verify` success (run 38832426237).
- SonarCloud Quality Gate **OK**: seguridad, fiabilidad y mantenibilidad en A, duplicación 0,0 y hotspots revisados al 100 %.
- S2068 queda `CLOSED/FIXED` y no hay ningún hallazgo de seguridad abierto.

Este Backend (`c2acbd4`) es el que se expuso por HTTPS en la sesión física del 2026-10-15 (`docs/evidence/F05_SYNC_06.md` §4).

### Mutaciones

Cada una se aplicó con un reemplazo exacto en `src/`, se ejecutaron las suites indicadas y se restauró el archivo byte a byte, comprobando su SHA-256. El árbol quedó limpio después de cada una.

| Mutación | Suites | Resultado |
| --- | --- | --- |
| E1 la huella no cubre la cantidad | fingerprint, adversarial | detectada |
| E2 una bifurcación se acepta (LWW) | causal-decision, adversarial | detectada |
| E3 un sucesor atrasado reactiva una retirada | causal-decision, adversarial | detectada |
| E4 claves duplicadas admitidas | strict-json, adversarial | detectada |
| E5 registro de cliente revocado admitido | adversarial, referencias | detectada |
| E6 Directiva/Administrador publican | adversarial, referencias | detectada |
| E7 contenido distinto tratado como reenvío | adversarial | detectada |
| E8 GET sólo por operationId | adversarial | detectada |
| E9 referencias sin filtro de tenant | referencias | detectada |
| E10 valor nuevo en campaña cerrada | adversarial | detectada |
| E11 la resolución no cerca ramas | adversarial | detectada |
| E12 campo desconocido ignorado | envelope, adversarial | detectada |
| E13 sin revalidación al decidir (sobre `6e2aff4`) | adversarial (C40) | detectada |
| E14 el guard ignora el tenant inactivo | adversarial (C22) | detectada |
| E15 el guard ignora el estado de la sesión | adversarial (C22) | detectada |
| E16 sin detección del antecesor en procesamiento | adversarial (C28) | detectada |
| E17 sin el lock de la operación | adversarial (C28) | detectada |
| E18 reserva del journal fuera de la transacción | adversarial (caída de Central) | detectada (3 pruebas) |

E14 a E17 se aplicaron sobre el árbol de `0c5167c` y E18 sobre el de `7ee0ec1`.

### Prueba fuera del proceso con `curl`

Se ejecutó `node dist/main.js` en `127.0.0.1:3105`, con una base migrada aparte, datos sintéticos y secretos y contraseña generados en la shell (no impresos). Se usó un agricultor real con el login completo: V1 → registro de cliente → V2 BODY → vinculación de la sesión. El token viajó como configuración de `curl` por stdin (`-K -`), nunca en los argumentos.

| Paso | Resultado |
| --- | --- |
| Referencias antes de vincular la sesión al registro | HTTP 403 |
| Vincular la sesión | HTTP 201 |
| Referencias | 1 campaña, 1 producto; claves de producto `base_unit, is_active, linkable, name, product_ref, unit` |
| PUBLISH | HTTP 200 `APPLIED`/`OK` |
| Reenvío idéntico | HTTP 200 `ALREADY_APPLIED`/`OK` |
| Mismo ID, otra cantidad | HTTP 200 `REJECTED`/`IDEMPOTENCY_MISMATCH` |
| `contractVersion` 2 | HTTP 422 `CONTRACT_VERSION_MISMATCH` |
| Sin token | HTTP 401 |
| GET de la operación | `ack.outcome=ALREADY_APPLIED`, `contribution.status=ACTIVE` |

Después se detuvo la API y se eliminó la base.

## 4. Discrepancias con el brief y los issues (gana el contrato)

| Fuente | Dice | Se aplicó |
| --- | --- | --- |
| #17, criterio de concurrencia | «uno responde RETRYABLE / OPERATION_IN_PROGRESS» | La matriz (C09) admite «RETRYABLE / OPERATION_IN_PROGRESS **o** ALREADY_APPLIED». Como el journal y la proyección se confirman en una sola transacción, un PROCESSING nunca llega a ser visible: el request concurrente espera el lock de la operación y recibe `ALREADY_APPLIED`. Siempre hay un único efecto |
| #106, autenticación de referencias | 401 para cuenta o Member inactivos o registro revocado | El contrato §9 rige las rutas `sync/v1`: 401 sólo para credencial ausente, inválida o expirada; 403 `AUTH_CONTEXT_FORBIDDEN` para un contexto revocado o inactivo. Así Mobile trata igual todas las llamadas v1: con 403 se detiene y no reintenta refresh en bucle |
| Brief D2, bloque 3 | Ruta `GET /api/v1/sync/v1/refs`; sólo campañas abiertas | #106 fija la whitelist con todas las campañas y un indicador `accepts_contributions`. La ruta es `/api/v1/sync/v1/references` (#106 dejaba el nombre al PR) |
| Brief D2 | `docs/api/` sin precisar archivo | La instantánea general `openapi-f02.json` incluye las rutas nuevas, y `openapi-f05-sync-v1.json` es el subconjunto F05 (#106 proponía `openapi-f05-sync-references.json`). `openapi:check` vigila los dos |

## 5. Limitaciones

- Un sucesor cuyo antecesor todavía no llegó a Central recibe `INVALID_PREDECESSOR` (C27), y es terminal. El contrato (§6) prohíbe a Mobile enviarlo antes de tener el ACK del antecesor; si el antecesor ya está en procesamiento, la respuesta es `DEPENDENCY_PENDING` (C28).
- `OWNERSHIP_NOT_PROVEN` y `PURPOSE_NOT_AUTHORIZED` no se producen. La prueba de propiedad local es una precondición de Mobile (F06 §4, Mobile #29–#34), no un campo del envelope.
- Retención (`PERIOD_DELEGATED`): no hay purga de journal, tombstones ni disputas, y la admisión de producción sigue cerrada. La garantía de no aceptar como nuevo un ID antiguo tras una purga queda para cuando exista la política (F10 #45).
- El límite de peticiones es el global de la aplicación (20 por minuto y origen). Un worker de Mobile debe respetar `Retry-After`.
- Las filas que dependen de Mobile quedan `NOT_MEASURED` en [F05_SYNC_06](F05_SYNC_06.md).
- Sin despliegue en producción. Con `docker compose` (NODE_ENV=production) la admisión queda cerrada mientras no se configuren clave y `SYNC_V1_PRODUCTION_ADMISSION`.

## 6. Revisiones

- Pruebas automatizadas: ejecutadas con Claude Code el 2026-10-15 (arriba). El CI del PR ejecuta además las dos suites nuevas.
- Revisión de Roderich Rendón: pendiente.
- Revisión del tutor: se registra aparte, por entregable o gate, en GOV-01.
