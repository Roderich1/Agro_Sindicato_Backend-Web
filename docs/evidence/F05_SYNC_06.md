# Evidencia F05-SYNC-06 — suite adversarial C01–C40 contra Sync v1

Issue [#18](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/18). Ejecuta la [matriz de reintento e idempotencia](../architecture/F05_SYNC_V1_RETRY_IDEMPOTENCY_MATRIX.md) (40 casos / 11 columnas, sin reducción) contra el runtime Sync v1 de [F05_SYNC_05](F05_SYNC_05.md) (#17), no contra el sync legacy.

Ejecución con Claude Code el 2026-10-15 (America/La_Paz). **No es un PASS de GATE-F05 (#19)**, que sigue Pending. Las filas que dependen de Mobile quedan `NOT_MEASURED`.

## 1. Identidad de la ejecución

| Elemento | Valor |
| --- | --- |
| Rama / commits | `feat/f05-sync-v1-push`: `0ed30b6318de423d6a2f63df787d2f7a7261ca57`, `6e2aff49fec105596ca943e82e65a44f37cdabf9`, `0c5167c958c7f69b321a70e77060d82341b758b9`, `7ee0ec143f9e5ede4e8d1f40264a40e85cf105fd`, `6a86c57c948e2f07422dd56abddaf2cc487cfd83`, `74bc47378cd310787654199d432c3e2392f8ec92`, `a8e1cd7bb87c8a88ee55a51d5d36a0c0f7c4cb0a`, `720d1af0977ca7f74c8b9c585ff19abfb2b9bb52`, `db870043f072cb42bf3a5d7c1d83cdc196c0ae40` |
| Suites | `Back/src/modules/sync-v1/sync-v1-adversarial.postgres.spec.ts` (**A**, 41 pruebas); `Back/src/modules/sync-v1/sync-v1-references.postgres.spec.ts` (**R**, 7 pruebas, con el login real y el límite real) |
| Comando | `cd Back && F05_SYNC_06_PG_TEST_URL=<servidor desechable> npx jest sync-v1-adversarial.postgres.spec.ts --runInBand` (y `F05_SYNC_07_PG_TEST_URL` para R). Cada suite crea una base nueva y la migra desde cero |
| Base | PostgreSQL `postgres:16-alpine` desechable (local); en CI, el servicio `postgres:16` del workflow |
| Resultado | A **41/41** y R **7/7** sobre el código final `db87004`. Antes, A 41/41 sobre `7ee0ec1` y `6a86c57`, y R 7/7 sobre `6a86c57` y `74bc473`. A también 40/40 tres veces seguidas sobre `0c5167c`, para descartar inestabilidad en las pruebas con concurrencia |
| Datos | Sintéticos; ningún token, contraseña o clave se imprimió ni se guardó |

## 2. Cómo leer la tabla

- **Central** cubre las columnas de estado Central, HTTP, outcome/code, disposition, mismo ID, `business_effect_count` y privacidad. Cada ACK de A pasa por `expectAck`, que comprueba:
  - exactamente las 7 claves;
  - el `operationId`;
  - la disposition que corresponde al outcome;
  - `serverAcceptedAt` sólo para la aceptación y `reconciliationReference` sólo para CONFLICT;
  - `Cache-Control: no-store`;
  - que no aparezca la cantidad centinela.

  Cada error pasa por `expectError`, que comprueba el cuerpo cerrado de 4 claves.
- **Mobile** cubre las columnas «Acción Mobile» y «Retry». Dependen del outbox y del worker (Mobile [#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)–[#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31), PR MOB #80). Sólo cuenta una ejecución en dispositivo contra este Backend; las pruebas de host de Mobile no la sustituyen. El 2026-10-15 se midieron en el POCO **C01–C04** (§4). Las demás filas siguen **NOT_MEASURED**, no NOT_APPLICABLE.
- Resultado: PASS, FAIL, NOT_MEASURED o NOT_APPLICABLE, con la justificación en la última columna.

## 3. Resultados por caso

| Caso | Prueba | Central | Mobile | Justificación |
| --- | --- | --- | --- | --- |
| C01 PUBLISH nominal | A «C01 nominal PUBLISH»; dispositivo §4 | PASS | PASS (dispositivo) | APPLIED/OK. Una contribución ACTIVE con la cantidad. Journal FINAL |
| C02 ACK perdido, replay idéntico | A «C02 … ×3»; dispositivo §4 | PASS | PASS (dispositivo) | Tres reenvíos dan ALREADY_APPLIED con la hora original; un solo journal y una sola transición |
| C03 request perdido antes de Central | A «C03»; dispositivo §4 | PASS | PASS (dispositivo) | Antes del envío no hay journal; el único envío posterior es el único efecto. NO_ACK/OUTCOME_UNKNOWN es estado local de Mobile |
| C04 commit durable y conexión caída | A «C04»; A «Central crash … restart after it»; dispositivo §4 | PASS | PASS (dispositivo) | El caso de uso se ejecuta y la respuesta se descarta; el reenvío da ALREADY_APPLIED con la misma hora. Además, tras cerrar y volver a levantar la aplicación sobre la misma base, el reenvío da ALREADY_APPLIED con la hora original |
| C05 500 antes del commit | A «C05»; A «Central crash before the commit …» | PASS | PASS (dispositivo, §4b) | Fallo inyectado en `finalize`: 500 TEMPORARILY_UNAVAILABLE / KEEP_FOR_RETRY, sin journal ni transición. Caída real: se termina la sesión PostgreSQL del push en curso (`pg_terminate_backend`) y el cliente recibe 500, sin journal ni contribución. En los dos, el reintento es el único efecto |
| C06 500 con commit desconocido | A «C06» | PASS | PASS (dispositivo, §4b) | El commit ocurre y la respuesta falla con 500. El reintento con el mismo ID da ALREADY_APPLIED con la hora confirmada |
| C07 claves reordenadas | A «C07» | PASS | NOT_MEASURED | Claves reordenadas y espacios distintos dan la misma huella: ALREADY_APPLIED |
| C08 mismo ID, otro contenido | A «C08»; A «C25» | PASS | NOT_MEASURED | Otra cantidad, acción o causal: REJECTED/IDEMPOTENCY_MISMATCH y el original intacto. Otra versión del contrato: 422 sin ACK (C25) |
| C09 retries simultáneos del mismo ID | A «C09» | PASS | NOT_MEASURED | Tres requests concurrentes: exactamente un APPLIED; los demás, ALREADY_APPLIED (se admite RETRYABLE). Un journal y una transición |
| C10 otra instalación del mismo Member | A «C10» | PASS | NOT_MEASURED | Un segundo ClientRegistration ACTIVE del mismo Member da ALREADY_APPLIED: el registro no forma parte de la clave. El journal no guarda clientId. La verificación de bindings y del propietario restaurado es de Mobile |
| C11 dos sucesores del mismo head | A «C11 order a→b», «b→a», «concurrent», «CANCEL accepted before», «competitor accepted before a CANCEL» | PASS | PASS (dispositivo, §4b) | Ambos órdenes y la concurrencia: un APPLIED y un CONFLICT/CAUSAL_FORK. CONTESTED sin cantidad y con referencia. El GET separa el recibo histórico del estado actual. CANCEL antes y después del competidor |
| C12 CANCEL aceptado y replay antiguo | A «C12» | PASS | NOT_MEASURED | El replay antiguo da ALREADY_APPLIED y la retirada se mantiene: CANCELLED, sin cantidad |
| C13 sucesor atrasado tras CANCEL | A «C13» | PASS | NOT_MEASURED | CONFLICT/CANCELLED_PREDECESSOR; el tombstone se mantiene, sin resurrección |
| C14 resolución humana con head y referencia vigentes | A «C14 …» | PASS | PASS (dispositivo, §4b) | APPLIED. Disputa RESOLVED con `closedAt` y la operación que la resolvió, sin payload. Cerca hasta la secuencia anterior. Los replays conservan su resultado: el CONFLICT vuelve con la misma referencia |
| C15 referencia de reconciliación obsoleta | A «C15 …» | PASS | PASS (dispositivo, §4b) | CONFLICT/RECONCILIATION_STALE con la referencia vigente; el estado no cambia y la disputa anterior queda SUPERSEDED |
| C16 campaña cerrada para un valor nuevo | A «C16» | PASS | NOT_MEASURED | REJECTED/CAMPAIGN_NOT_OPEN, sin total |
| C17 campaña cerrada tras la aceptación | A «C17/C18/C39» | PASS | NOT_MEASURED | El replay da ALREADY_APPLIED: el resultado persistido se lee antes que las reglas de campaña |
| C18 CANCEL en campaña cerrada | A «C17/C18/C39» | PASS | NOT_MEASURED | APPLIED; CANCELLED sin cantidad |
| C19 producto inexistente, ajeno o inactivo | A «C19» | PASS | NOT_MEASURED | El mismo REFERENCE_UNAVAILABLE en los tres casos, sin revelar la existencia en otro tenant |
| C20 unidad de otra dimensión | A «C20» | PASS | NOT_MEASURED | UNIT_INCOMPATIBLE, también para una unidad central que no es L ni KG. Sin conversión |
| C21 cantidad mayor que int64 | A «C21» | PASS | NOT_MEASURED | QUANTITY_INVALID; el máximo exacto se acepta sin pérdida |
| C22 Member, sesión o tenant revocado o inactivo | A «C22/C40 …» | PASS | PASS (dispositivo, §4b: cuenta y Member) | Member inactivo, cuenta inactiva, tenant inactivo y sesión revocada: 403 AUTH_CONTEXT_FORBIDDEN en POST y GET, sin tocar el journal y sin exponer el resultado histórico |
| C23 ClientRegistration revocado | A «C23»; R «401 … 403» | PASS | PASS (dispositivo: pausa en §4b; reanudación con un registro nuevo del mismo titular en §4c, 2026-10-17). *Antecedente:* «reanudar con un registro nuevo NOT_MEASURED» | 403 sin journal. El mismo propietario reanuda con un registro nuevo: APPLIED una vez, y después ALREADY_APPLIED. El registro revocado no se reactiva |
| C24 access token expirado y refresh | A «C24»; R «end to end … push and refresh» | PASS | PASS (dispositivo, §4b) | Token expirado: 401 AUTH_REQUIRED con `WWW-Authenticate` y sin journal; con un token vigente de la misma sesión, APPLIED una vez. En R, el refresh V2 real rota el refresh token, y con el access nuevo el mismo push da ALREADY_APPLIED con la hora original (un journal). El refresh de Mobile es #31 |
| C25 contractVersion distinto de 1 | A «C25»; A «the journal only admits contractVersion 1 …» | PASS | NOT_MEASURED | Versiones 2 y 0: 422 CONTRACT_VERSION_MISMATCH, sin almacenar nada. El journal sólo admite la versión 1 |
| C26 campo privado extra | A «C26» | PASS | NOT_MEASURED | Campo extra en el envelope (`tenantId`), en causal (`clientId`) y en el payload (`notes`, `backup`): 400 FIELD_NOT_ALLOWED, sin journal. El valor no aparece en los logs |
| C27 antecesor inválido | A «C27» | PASS | NOT_MEASURED | Desconocido, ajeno, rechazado o de otra contribución: INVALID_PREDECESSOR, y el head se mantiene |
| C28 antecesor propio en procesamiento | A «C28 …» | PASS (desde `0c5167c`) | NOT_MEASURED | El antecesor se detiene dentro de su transacción y el sucesor recibe RETRYABLE/DEPENDENCY_PENDING sin journal. El antecesor queda APPLIED y el reintento del sucesor, APPLIED una vez (3 journals, secuencia 3). **Antes de `0c5167c` no había prueba**; las mutaciones E16 y E17 de [F05_SYNC_05](F05_SYNC_05.md), que reproducen esa lógica, hacen fallar el caso |
| C29 rate limit / mantenimiento | R «C29 real rate limit»; A «C36» | PASS | NOT_MEASURED | Con el límite real de la aplicación: 429 RATE_LIMITED con `Retry-After` mayor que 0. Mantenimiento: 503 TEMPORARILY_UNAVAILABLE / KEEP_FOR_RETRY. El 503 no envía `Retry-After` porque la demora no se conoce (el contrato lo pide «si conocido»). La espera `max(backoff, Retry-After)` es de Mobile |
| C30 ACK 2xx incompleto o contradictorio | todas las respuestas de A (`expectAck`) | PASS (Central no emite ACK inválidos en los casos probados) | PASS (dispositivo, §4b, respuesta inyectada) | El caso trata de cómo Mobile maneja un ACK inválido (INVALID_ACK → OUTCOME_UNKNOWN), y eso no se puede medir sin el worker. Del lado Central, cada ACK tiene exactamente 7 claves, el ID propio y una disposition coherente |
| C31 GET del dueño tras ACK perdido | A «C31/C32 GET»; A «C11 …» | PASS | PASS (dispositivo, §4b, GET en la resolución) | El GET devuelve exactamente `{ack, contribution}`: ALREADY_APPLIED y el estado actual (ACTIVE, CANCELLED o CONTESTED), sin cantidades. No crea efectos |
| C32 GET ajeno o inexistente | A «C31/C32 GET» | PASS | NOT_MEASURED | El mismo 404 OPERATION_NOT_FOUND con `operationId` null para otro Member, otro tenant o un ID desconocido |
| C33 sucesor tardío de una rama cercada | A «C14 …» | PASS | NOT_MEASURED | REJECTED/CAUSAL_FENCED; la resolución sigue vigente |
| C34 mismo operationId bajo otro Member o tenant | A «C34» | PASS | PASS (dispositivo, §4b, camino de restauración) | Claves y efectos independientes; el GET ajeno da 404 |
| C35 restore sin prueba de propietario | A «C35 …» | PASS (parte Central) | PASS (dispositivo, §4b) | Central rechaza con 403 una sesión sin ClientRegistration vinculado, un token V1, Directiva y Administrador, sin journal. `OWNERSHIP_NOT_PROVEN` no se emite: la prueba de propiedad es una precondición de Mobile (#29/#30), no un campo del envelope. Sync no acepta archivos ni backups (C26) |
| C36 purga sin garantía de replay | A «C36» | PASS | NOT_MEASURED | Admisión cerrada: 503 y ningún ID desconocido se acepta como nuevo. No hay purga implementada, y la admisión de producción queda cerrada mientras no exista la política (F10 #45) |
| C37 batch, claves duplicadas o tipos inválidos | A «C37» | PASS | NOT_MEASURED | Array, claves duplicadas, UUID en mayúsculas, cantidad numérica o fuera de formato (`01`, `-1`, `1.5`, `1e3`, ` 1`), JSON mal formado y cuerpo vacío dan 400 INVALID_REQUEST. Un Content-Type no JSON da 415 y más de 16 KiB, 413. Nada se almacena |
| C38 cambio de tenant o Member en relogin | A «C34»; A «C22/C40 …» | PASS (parte Central) | PASS (dispositivo, §4b) | Central no reatribuye: cada clave está atada a su tenant y Member, y un contexto inválido da 403. No reatribuir ni pausar el outbox anterior es de Mobile (#30/#31) |
| C39 resultado final tras un cambio de catálogo | A «C17/C18/C39» | PASS | NOT_MEASURED | Al reabrir la campaña, el replay del rechazo devuelve el mismo REJECTED/CAMPAIGN_NOT_OPEN, sin reevaluar |
| C40 revocación antes de la aceptación durable | A «C40 revocation committed after the guard …»; A «C22/C40 …» | PASS (desde `6e2aff4`) | PASS (dispositivo, §4b, ventana de decisión con revocación de sesión) | La revocación se confirma después del guard y antes de la decisión: 403, sin journal ni contribución. La decisión revalida con `FOR SHARE` dentro de su transacción |

**Resumen.** Central: 40 de 40 casos con evidencia PASS (C30, C35 y C38 sólo en su parte Central). Mobile: C01–C04 PASS en dispositivo (§4) y 36 de 40 NOT_MEASURED. Ningún FAIL abierto.

**Actualización del 2026-10-17 (§4c).** C23 completo en el dispositivo: Mobile en dispositivo **18 de 40 PASS**, ninguno parcial, **22 de 40 NOT_MEASURED**. Ningún FAIL abierto. #18 sigue abierto.

**Actualización del 2026-10-16 (F10, §4b).** Mobile en dispositivo: PASS en C01–C04 (§4) y en C05, C06, C11, C14, C15, C22, C24, C30, C31, C34, C35, C38 y C40 (§4b), 17 de 40; C23 parcial (pausa PASS, reanudación NOT_MEASURED); **22 de 40 siguen NOT_MEASURED**. Ningún FAIL abierto. #18 sigue abierto.

## 4. Sesión física del 2026-10-15 (columna Mobile)

Ejecutada con Claude Code entre las 21:07 y las 22:25 (America/La_Paz) en un POCO X5 Pro 5G (22101320G, Android 12, API 31). Se usó una app aislada `com.comunidad.agro.agroquimicos.f03res01` contra este Backend en `c2acbd4cc6b51befec92dc6f5f9ad9ed059d8357`, expuesto por un túnel HTTPS temporal ya cerrado. La base PostgreSQL era desechable, con migraciones `prisma migrate deploy` y datos sintéticos. La admisión `SYNC_V1_PRODUCTION_ADMISSION=enabled` se abrió **sólo** en ese entorno. Detalle, capturas y SHA-256: [F05_MOBILE_SYNC_DEVICE](https://github.com/Roderich1/AppMovilAgroquimico/blob/feat/f05-outbox-sync-v1/docs/evidence/F05_MOBILE_SYNC_DEVICE.md).

Fallo controlado: un proxy local entre el túnel y la API registra sólo método, ruta y estado.
- `drop-push-response`: Central confirma y la respuesta no se entrega.
- `hold-push-request`: la petición no llega a Central y se fuerza el cierre de la app mientras espera.

| Caso | Mobile | Observado (teléfono y Central) |
| --- | --- | --- |
| C01 | `023a47b`, `5027a35` | PUBLISH `4f3ad1e2` declarado sin red y enviado al volver la red: ACKED, con `serverAcceptedAt` guardado. En Central, APPLIED, secuencia 1 y contribución ACTIVE con 12500 ML. Después, PUBLISH `964419b0` tras un CANCEL: APPLIED, secuencia 6. Un journal por operación |
| C02 / C04 | `023a47b` | SUPERSEDE `75f4cb2b`: Central lo confirmó (APPLIED, secuencia 2, head 20000 ML) y la respuesta no llegó. El teléfono quedó en OUTCOME_UNKNOWN/TIMEOUT. El reenvío con el mismo ID registró en la API `outcome=ALREADY_APPLIED code=OK`, y el teléfono pasó a ACKED con la hora del commit original (02:01:14.271Z). En Central, 1 fila de journal para ese ID, secuencia sin cambio y cantidad sin sumar |
| C03 | `023a47b`, `5027a35` | Sin red, dos intentos NETWORK de `4f3ad1e2` y uno de `714ed3fa` no llegaron a Central. Con `hold-push-request` y el cierre forzado, `868593c0` quedó en SENDING en SQLite, sin journal en Central. Al reabrir pasó a OUTCOME_UNKNOWN y no salió nada hasta verificar el acceso. Cada uno, al reenviarse con el mismo ID, dio APPLIED una sola vez |

Conciliación final: 8 operaciones en la outbox del teléfono, las mismas 8 en el journal de Central y con los mismos antecesores, 8 filas para 8 IDs distintos y una contribución. No se midieron en el dispositivo: 401/403 en push (C22–C24), forks y resolución (C11, C13–C15), ACK inválido (C30), restore (C35) ni relogin (C38).

## 4b. Sesión física del 2026-10-16 (F10, tanda 1)

Ejecutada por la sesión A entre las 20:08Z y las 21:29Z en el mismo POCO X5 Pro 5G (22101320G, Android 12, API 31), con tres copias aisladas **nuevas** (`.f10s18a/b/c`) de Mobile `main` `4f203c7` sin cambios, contra este Backend en **`e027938`** (integrado final), en un entorno desechable nuevo (`agro_a_f10int_pg`, 10 migraciones en orden). Orden por riesgo del plan ([F05_SYNC_06_PLAN_FISICO_F10.md](../testing/F05_SYNC_06_PLAN_FISICO_F10.md)). Detalle, horas, IDs, capturas y SHA-256: Mobile [`docs/evidence/F05_SYNC_06_DEVICE_F10.md`](https://github.com/Roderich1/AppMovilAgroquimico/blob/main/docs/evidence/F05_SYNC_06_DEVICE_F10.md) (PR MOB #94, arnés `63fcf65`).

| Caso | Mobile | Técnica | Resumen |
| --- | --- | --- | --- |
| C24 | PASS | TTL de servidor de 2 min sólo en ese entorno (el cliente descarta su access a los 10 min, antes que los 15 del servidor) | `push 401` → `PENDING`/`AUTH_REQUIRED`, mismo ID; ningún refresh ni push hasta la acción explícita; «Sincronizar ahora» o «Verificar acceso en línea» → 1 refresh y el mismo ID APPLIED una vez. Variante natural: sin 401, porque el cliente no envía con un access vencido localmente |
| C40 | PASS | Bloqueo `FOR UPDATE` de la sesión y su registro y revocación por SQL en la misma transacción | El push pasó el guard, esperó en el `FOR SHARE` de la revalidación y recibió 403 tras la revocación confirmada en esa espera; sin journal; `AUTH_PAUSED` sin bucle |
| C23 | Pausa PASS; reanudación NOT_MEASURED | Revocación real por la API | 403 → `AUTH_PAUSED` sin bucle. La reautenticación en la misma instalación da `session/client` 404 (la revocación es irreversible para esa instalación) |
| C22 | PASS | Desactivación real por la API | 403 → `AUTH_PAUSED`, sin journal ni bucle, mensaje visible |
| C38 | PASS | Revocación de la sesión por SQL y reautenticación con otra cuenta | La app cierra la sesión de la otra cuenta sin vincular el registro; 0 push de las intenciones del titular |
| C30 | PASS | ACK inyectado tras reenviar (sin hora, disposition contradictoria, otro ID) | `OUTCOME_UNKNOWN`/`INVALID_ACK`, nunca ACKED; el reintento recibe el resultado persistido; journal 1 |
| C05 / C06 | PASS | 500 inyectado antes / después de reenviar | Reintento con el mismo ID: APPLIED una vez / resultado persistido con la hora original |
| C11 / C15 / C14 | PASS | Dos copias de la misma cuenta; head común por restauración F08 | Un APPLIED y un CAUSAL_FORK; referencia obsoleta → RECONCILIATION_STALE con el estado intacto; resolución vigente → APPLIED y disputa RESOLVED |
| C31 | PASS | — | El GET del dueño se usa al resolver (3 GET 200, sin efectos) |

Las respuestas inyectadas miden la reacción del cliente, no la decisión de Central. Tanda 2 sigue NOT_MEASURED.

**Restauración (2026-10-16, 22:17–22:36Z, MOB `2f4b634`, copia `.f10bkp`):** C35 PASS (la intención restaurada queda `RESTORE_PAUSED`, 0 push al restaurar y en 80 s tras reabrir, y al liberarla con la verificación del titular sale un único push del mismo ID); C34 PASS en el camino de restauración (una copia de otro titular se rechaza antes de sustituir y sus intenciones no se envían bajo la cuenta activa; el cambio de cuenta al reautenticar es C38). Detalle: Mobile `docs/evidence/F10_RESTORE_DEVICE.md` (MOB #95).

## 4c. C23: reanudación con un registro nuevo (2026-10-17, 04:38–04:48Z)

- **Entorno:** el de la evaluación F10 de la sesión A, con este Backend en `ed069a6` (`agro_a_f10eval_pg`, compilado, `NODE_ENV=production`), y dos copias aisladas nuevas de Mobile `dff6802` (`.f10c23x` y `.f10c23y`, profile) en el mismo POCO. Cuenta sintética E2.
- **Secuencia:**
  1. X declara una necesidad sin acceso verificado: PENDING, 0 intentos.
  2. X sube una copia en la nube (201) **antes** de la revocación. No sale ningún push (protegido con `hold-push-request`, que no se consumió).
  3. La propia cuenta revoca el registro de X por la API (`POST auth/clients/{id}/revoke` 201).
  4. X: `refresh` 401, «Se requiere volver a autenticar…», 0 push.
  5. Y se activa con la misma cuenta: `auth/clients` 201, **registro nuevo**.
  6. Y restaura la copia de X: la intención queda RESTORE_PAUSED y no sale ningún push al restaurar.
  7. «Liberar» con confirmación: un único `push` 200 del mismo `operationId` (`d05e9468`).
- **Central:** journal FINAL APPLIED, secuencia 1; contribución ACTIVE de 40 000 ML; registros ACTIVE 1 (Y) y **REVOKED 1 (X, no reactivado)**.
- **Fuera del dispositivo:** el reenvío posterior que devolvería ALREADY_APPLIED, porque la app no reenvía una intención ACKED. Lo acredita la columna Central.
- **Evidencia:** Mobile `docs/evidence/F10_C23_REANUDACION_DEVICE.md` (PR MOB #98).

## 5. Cobertura mínima de #18

| Aspecto | Evidencia |
| --- | --- |
| Replay idéntico; misma clave con otro contenido; replay concurrente | C02, C07, C08, C09 |
| Timeout antes del ACK; timeout tras el commit; 500 ambiguo; ACK perdido | C03, C04, C05, C06 |
| Refresh o rotación de token; revocación de registro o sesión | C24 (con el refresh real), C23, C22, C40 |
| Otra instalación del mismo Member; otro Member; otro tenant | C10, C34 |
| OPERATION_IN_PROGRESS; Retry-After; backoff/jitter | C09 (sin PROCESSING visible, el concurrente recibe ALREADY_APPLIED) y C28 (RETRYABLE/DEPENDENCY_PENDING); C29; backoff/jitter NOT_MEASURED (Mobile #31) |
| Replay final de APPLIED, CONFLICT y REJECTED | C02; C14 (mismo CONFLICT y referencia); C39 |
| Claves duplicadas; campos desconocidos; versión, UUID o cantidad inválidos | C37, C26, C25, C21 |
| Antecesor fallido; fork; CANCEL y cerco; reconciliación obsoleta | C27, C28, C11, C12, C13, C14, C33, C15 |
| Reinicio y recuperación del servidor | C05 y C04 con caída real: sesión PostgreSQL terminada antes del commit y aplicación reiniciada después |
| Privacidad y logs | A «privacy and individual domain»: los logs no contienen la cantidad centinela, nombres de campos del payload ni el token. C26 no registra el valor rechazado |
| Separación de sync y backup; dominio individual | Sync no crea compras, lotes, movimientos, deudas, pagos, aplicaciones, filas del sync legacy ni auditoría legacy (todas las cuentas en 0). C26 rechaza un campo `backup`. Las transiciones aceptadas coinciden con los journals APPLIED |
| Crash de Mobile entre el ACK y la retirada | NOT_MEASURED (Mobile #30/#31). En dispositivo sólo se midió el cierre forzado **antes** de llegar a Central (C03, §4) |

## 6. Lo que esta ejecución no prueba

- Acciones de Mobile fuera de C01–C04: backoff con jitter medido, manejo de un ACK inválido, pausa por auth, restore y relogin (#29–#31).
- La rotación real de la clave de huella en un despliegue. La verificación con claves anteriores está cubierta en las pruebas de dominio, no en un entorno desplegado.
- El rendimiento bajo carga, más allá de la concurrencia puntual de C09, C11 y C28.
- Producción: la admisión sigue cerrada (C36) y no hay purga. La sesión física de §4 la abrió sólo en un entorno desechable.

## 7. Revisiones

- Ejecución automatizada: Claude Code, 2026-10-15 (arriba). El CI del PR ejecuta A y R en cada push.
- Revisión de Roderich Rendón: pendiente.
- Revisión del tutor: se registra aparte, por entregable o gate, en GOV-01.
- GATE-F05 (#19): Pending. Esta evidencia no lo cierra.
