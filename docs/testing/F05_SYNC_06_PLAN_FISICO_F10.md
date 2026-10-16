# F05-SYNC-06 (#18) — Plan por riesgo de las filas físicas pendientes (para F10)

- **Fecha:** 2026-10-16.
- **Redactado por:** la sesión A de Claude Code, con autorización delegada.
- **Naturaleza:** es un **plan**, no un resultado.
  - Las 36 filas de la columna Mobile de [`F05_SYNC_06.md`](../evidence/F05_SYNC_06.md) (C05–C40) siguen **NOT_MEASURED**.
  - Este documento no cambia ningún resultado y **#18 sigue abierto**.
- **Prioridad** (según `_briefs/CONTINUACION_TRES_SESIONES_2026-10-16.md` §3): autorización 401/403, ACK inválido, conflicto y resolución, y restauración.
- **Ya medido en dispositivo:**
  - C01–C04 (2026-10-15);
  - el camino 401 de una sesión revocada, que no es una fila de #18: es la repetición de E-2 de #71 del 2026-10-16.
- **Código revisado:** Mobile `main` `74d5539`, que tiene en `lib/` el mismo código de Sync que `2085173`, y Backend `main` `063437d`.

## Revisión del 2026-10-16 (indicaciones de Roderich sobre la primera versión)

1. **C24.** Tras el 401 se exige una **acción explícita** de verificar el acceso; la intención y su `operationId` se conservan. No se introduce refresh automático. La versión anterior describía «401 → refresh», que no es lo que hace la app ni lo que se quiere medir.
2. **C40.** Se separan dos cosas:
   - retener la petición **antes de que llegue** a Central, que sí se puede hacer desde el teléfono;
   - comprobar la revocación **dentro de la transacción** de aceptación, que es una propiedad de Central.
3. **C28.** No se clasifica como no aplicable por ser difícil de provocar. Se evalúa aparte: la generación y la reacción del cliente.
4. **Tanda 3.** No se aprueba NOT_APPLICABLE en bloque.
   - Para C07, C08, C21, C25, C26 y C37, Roderich autorizó justificar que **la generación** de esas solicitudes no aplica a la interfaz móvil actual, con las guardas y sus pruebas. No elimina las pruebas de Backend ni la reacción del cliente ante las respuestas relevantes.
   - C27, C28, C32, C34 y C36 se evalúan una por una.
   - Lo aplicable y no ejecutado sigue NOT_MEASURED.
5. **Corrección de C07.** La primera versión decía que la app serializa un JSON canónico, y es falso. La app construye el envelope siempre con el mismo literal de mapa (`envelopeOf`, `lib/domain/sync/sync_wire.dart:6-21`) y `jsonEncode` conserva ese orden. Central no depende del orden: calcula la huella sobre el vector canónico (`Back/src/modules/sync-v1/domain/fingerprint.ts`).

## Método común

- **Copias y entorno:**
  - copia aislada nueva por tanda; nunca la app normal, la demo, `.f03res01`, `.f06d4` ni `.f03e2b`;
  - Backend desechable propio y túnel temporal.
- **Herramientas `tool/f03_res_01`:**
  - entorno configurable;
  - `fault.sh`: `drop-push-response` reenvía y descarta la respuesta; `hold-push-request` **no reenvía**, Central nunca recibe la petición y la conexión se cierra a los 30 s;
  - `check.sh` (`sync`, `timeline`);
  - `device.sh db outbox`;
  - `logcat_scan.sh` ampliado.
- **Respuesta inyectada (herramienta nueva, por construir).** Un modo del observador que, para la próxima petición de push o GET, **no la reenvía** y responde con un cuerpo cerrado preparado: un ACK incoherente (C30), un ACK RETRYABLE o REJECTED con un código concreto, o un 404.
  - Mide la **reacción del cliente**, no la decisión de Central. Así se registrará en cada fila.
- **PASS** sólo con la petición real del teléfono y la reacción observable que define cada fila. Una prueba del servidor o de host no sustituye la columna Mobile.
- Los turnos del POCO los asigna la sesión A (`_briefs/PARALELO_CONTROL.md`).

## Tanda 1 — riesgo alto (primera sesión de F10, ~2,5 h)

| Fila | Por qué es de riesgo alto | Cómo medirla en el teléfono |
|---|---|---|
| C22 Member, sesión o tenant inactivo o revocado | Un 403 mal tratado podría reenviar en bucle o dar por sincronizado | Con una intención pendiente, desactivar el Member o revocar la sesión por la API. Un push → 403 `AUTH_CONTEXT_FORBIDDEN`; outbox `AUTH_PAUSED`; sin reintentos automáticos |
| C23 ClientRegistration revocado | Igual que C22, por el lado de la instalación | Revocar el registro propio con una intención pendiente → 403; pausa; tras reactivar con un registro nuevo, se acepta una sola vez |
| **C24** access expirado | El 401 de un push no debe perder la intención ni provocar un refresh no pedido | Ver «C24 en detalle» |
| **C40, parte medible desde el teléfono** | Una revocación mientras la petición está en camino | Ver «C40: qué mide el teléfono y qué no» |
| C38 cambio de tenant o Member al reautenticar | Publicar lo de un titular con otra cuenta | Reautenticar con otra cuenta del mismo tenant → `OWNER_PAUSED` / `ownerMismatch`; 0 push |
| C30 ACK 2xx incompleto o contradictorio | Riesgo de marcar «sincronizado» sin aceptación | Respuesta inyectada con un ACK incoherente → `OUTCOME_UNKNOWN`, nunca ACKED |
| C06 500 con commit desconocido | Duplicar un efecto | Fallo que devuelve 500 tras el commit → reintento con el mismo ID → `ALREADY_APPLIED`, journal 1 |
| C05 500 antes del commit | Perder una intención | 500 antes del commit → reintento → `APPLIED` una vez |
| C11 dos sucesores del mismo head | Fork real entre dos teléfonos | Dos copias aisladas del mismo Member (requiere un segundo paquete) → un APPLIED y un CONFLICT; la UI muestra el conflicto |
| C14 resolución humana con head y referencia vigentes | Flujo de resolución en la UI | Tras C11, «Enviar mi total actual» → APPLIED; disputa RESOLVED |
| C15 referencia de reconciliación obsoleta | Resolver con datos viejos | Resolver dos veces o desde la copia desfasada → `RECONCILIATION_STALE`, estado intacto |
| C35 restore sin prueba de propietario | Publicar datos restaurados de otro titular | Restaurar un respaldo y abrir la app → intenciones `RESTORE_PAUSED`; 0 push hasta liberarlas. Coordinar con la entrega F08 (sesión C) |
| **C34** mismo `operationId` bajo otro Member o tenant | Que los `operationId` de un titular salgan con la cuenta de otro | Junto a C35 y C38: restaurar o cambiar de titular hacia otro Member. Las intenciones del titular anterior **no** se envían bajo la nueva cuenta (`RESTORE_PAUSED`, `OWNER_PAUSED` u `ownerMismatch`; 0 push). Ver «Evaluación individual» |

### C24 en detalle

**Qué hace la app** (código de `74d5539`):
- Ningún push se renueva solo:
  - `SyncAccessHolder` (`lib/services/sync/sync_access.dart:22-26`): «El worker no renueva tokens por su cuenta…».
  - Ante un 401, el worker hace `recordAuthRequired`, borra el acceso en memoria y devuelve `SyncBlocker.accessRequired` (`lib/services/sync/sync_worker.dart:211-215`).
- La fila sigue `PENDING`, con `last_code = AUTH_REQUIRED` y el **mismo `operationId`**:
  - los disparadores `trg_sync_outbox_sent_immutable` y `trg_sync_outbox_identity` impiden reescribirla;
  - una edición posterior se encadena como SUPERSEDE.
- Los ciclos siguientes se detienen antes de hacer cualquier petición.
- El aviso dice: «Verifique el acceso en línea para enviar. Sus datos siguen guardados.»
- **Acciones explícitas que reanudan:**
  - «Sincronizar ahora» (`SyncController.syncNow`): `verifyOnline()` (refresh bajo demanda), `resumeAfterVerification()` y `kick()`;
  - «Verificar acceso en línea» en el Dashboard: sólo `verifyOnline()`. El envío sale en el siguiente ciclo automático (temporizador de 1 min, reanudación de la app o una intención nueva).

**Medición en el teléfono:**
1. **Preparar.** Backend desechable con el access vigente 15 min, porque `tool/f03_res_01/up.sh` fija `JWT_EXPIRES_IN=15m`. Hay que esperar ese tiempo o añadir antes al arnés una variable para un TTL corto (p. ej. `30s`, sólo en ese entorno); es un cambio pendiente. Activar, verificar el acceso y registrar una intención con la red cortada.
2. **401.** Dejar vencer el access y restablecer la red. Un push → **401 `AUTH_REQUIRED`** (observador).
3. **Sin acción del agricultor, al menos 2 min:**
   - **0** `POST /auth/v2/refresh` y **0** push nuevos (timeline);
   - la fila tiene el mismo `operationId`, está `PENDING` con `AUTH_REQUIRED` (`device.sh db outbox`);
   - la app muestra el aviso de verificar el acceso.
4. **Acción explícita.** Pulsar «Sincronizar ahora» → **un** `POST /auth/v2/refresh 200` → un push con **el mismo `operationId`** → `APPLIED`; journal 1 para ese ID (`check.sh`).
5. **Variante.** Repetir pulsando «Verificar acceso en línea»: refresh 200 y el envío en el siguiente ciclo automático, con el mismo `operationId`.

**PASS** si se cumplen los pasos 2–4, y el 5 en la variante. Cualquier refresh o push entre el 401 y la acción explícita es **FAIL**.

**Cobertura de host:**
- **Existe:** `sync_retry_worker_test.dart` «401: vuelve a la cola, se descarta el token y no hay bucle» y «una intención que salió y volvió a la cola (401) no se reescribe…».
- **Falta:** ninguna prueba de host cubre la cadena `syncNow` → `resumeAfterVerification` → reenvío. Se propone añadirla en F10.

### C40: qué mide el teléfono y qué no

| Parte | Qué es | Dónde se mide |
|---|---|---|
| **C40a**: petición retenida **antes de llegar** a Central | `hold-push-request` retiene el push en el observador y Central no lo recibe. Durante la espera se revoca la sesión o el registro por la API. La conexión se cierra a los 30 s, el teléfono queda en `OUTCOME_UNKNOWN` y su reintento, con el mismo `operationId`, llega **después** de la revocación | **Teléfono.** El reintento lo rechaza el guard de entrada con **403** `AUTH_CONTEXT_FORBIDDEN`; outbox `AUTH_PAUSED`, nada aceptado, sin bucle. Mide la reacción del cliente a una revocación ocurrida mientras su petición estaba en camino; **no** mide la revalidación dentro de la transacción |
| **C40b**: revocación **dentro de la transacción** de aceptación | `revalidateContext` se ejecuta dentro de la misma transacción que reserva el journal y antes de reservarlo, con `FOR SHARE` sobre sesión, Member, cuenta, tenant y registro (`Back/src/modules/sync-v1/application/push-operation.use-case.ts:97`, `:134-160`). Una revocación concurrente espera al commit, o se ve si se confirmó antes | **Central.** `sync-v1-adversarial.postgres.spec.ts` «C40 revocation committed after the guard and before the decision: 403, nothing accepted». El teléfono no puede apuntar a esa ventana sin un gancho en el servidor, que no se añadirá. **No se declara medida en dispositivo** |

**Huecos de Central para F10 (no se corrigen en este plan):**
- La prueba de C40b sólo revoca el **registro** después del guard. No hay prueba para sesión, Member, cuenta o tenant revocados en esa ventana.
- Tampoco la hay para una revocación concurrente con el `FOR SHARE`, en la que, por diseño, la revocación espera y ese push se acepta.

## Tanda 2 — riesgo medio (~2 h)

| Fila | Medición propuesta |
|---|---|
| C09 retries simultáneos del mismo ID | `hold-push-request` y un segundo ciclo manual → un efecto |
| C12 CANCEL aceptado y replay antiguo | Retirar una necesidad y forzar el reenvío del PUBLISH previo → `ALREADY_APPLIED`; la retirada se mantiene |
| C13 sucesor atrasado tras CANCEL | Dos copias: retirar en una y enviar un valor en la otra → `CANCELLED_PREDECESSOR` |
| C33 sucesor tardío de una rama cercada | Tras C14, la copia desfasada envía → conflicto, sin resurrección |
| C10 otra instalación del mismo Member | Segunda copia aislada con la misma cuenta reenvía un ID ya aceptado (requiere copiar la intención: valorar si es alcanzable sin manipular SQLite) |
| C31 GET del dueño tras ACK perdido | La app no consulta tras un ACK perdido: reenvía el mismo envelope. El GET sólo se usa al resolver un conflicto (`SyncController.operationView`). Medir el GET en la resolución de C11/C14 |
| C29 rate limit o mantenimiento | 429 con `Retry-After` → backoff visible; sin pérdida |
| C16 / C17 / C18 campaña cerrada | Cerrar la campaña en Central antes o después de aceptar: rechazo visible; replay aceptado; CANCEL permitido |
| C19 / C20 referencia o unidad no disponible | Desactivar el producto central o cambiar su unidad → rechazo visible y vínculo inválido |
| C39 resultado final tras un cambio de catálogo | Cambiar el catálogo tras aceptar → el replay conserva el resultado |
| **C28** antecesor propio en procesamiento | Ver «Evaluación individual». Respuesta inyectada `RETRYABLE / DEPENDENCY_PENDING` → la fila sigue `PENDING` con backoff y el mismo envelope; el siguiente envío llega a Central → `APPLIED` una vez |
| **C27** antecesor inválido | Respuesta inyectada `REJECTED / INVALID_PREDECESSOR` → fila `REJECTED` visible («Rechazado (INVALID_PREDECESSOR)»), sin reintento; la sucesora pendiente se reencadena |
| **C32** GET ajeno o inexistente | En la resolución de un conflicto, respuesta inyectada 404 `OPERATION_NOT_FOUND` → error visible; el conflicto sigue sin resolver; nada se envía |
| **C36** purga sin garantía de replay | Backend desechable con la admisión cerrada (`F03_SYNC_V1_ADMISSION` distinto de `enabled`) → 503 `TEMPORARILY_UNAVAILABLE` → `PENDING` con backoff; al reabrir, `APPLIED` una vez. Sin purga real, porque no existe |

## Evaluación individual: C27, C28, C32, C34 y C36

| Fila | ¿La interfaz actual puede generar la solicitud? | Reacción del cliente aplicable | Estado Mobile |
|---|---|---|---|
| **C27** antecesor inválido | **En condiciones normales, no.** El planner sólo encadena filas propias de la misma contribución no rechazadas, o el head que devuelve Central en una resolución, validado como UUID v4 (`lib/domain/sync/intention_planner.dart:124-154`; `lib/data/sync/sync_outbox_store.dart:94-115`). SQLite exige antecesor en todo lo que no sea PUBLISH (`lib/data/app_database.dart:149-150`). Tras un rechazo, las sucesoras se reencadenan. **Sí es alcanzable** si Central no conoce un antecesor ya aceptado, por ejemplo un Central restaurado desde una copia anterior al ACK; se valorará en F10 sin borrar datos conservados | `REJECTED` terminal y visible. Las pruebas de host son genéricas de REJECTED (`sync_retry_worker_test.dart` «REJECTED: código visible…», «tras un rechazo, la siguiente edición no se apoya en la intención rechazada»); ninguna usa `INVALID_PREDECESSOR` | **NOT_MEASURED** (tanda 2) |
| **C28** antecesor propio en procesamiento | **No, por construcción, no por dificultad.** `readyToSend` no envía una sucesora mientras su antecesora local no está resuelta (`sync_outbox_store.dart:248-260`), y el worker envía de uno en uno (`sync_worker.dart:119`, `:135-152`). Pruebas: «orden causal: la sucesora espera el ACK de su antecesora»; «una intención en vuelo no se modifica: la nueva la continúa»; mutación M03c detectada (M03 y M03b son equivalentes). Un head remoto de una resolución viene de un GET de una operación ya confirmada | `RETRYABLE` (`DEPENDENCY_PENDING` u `OPERATION_IN_PROGRESS`) → `PENDING` con backoff y el mismo envelope («RETRYABLE: sigue pendiente con backoff y el mismo envelope»). La detección es de Central: `sync-v1-adversarial` «C28 own predecessor still in processing…» | **NOT_MEASURED**: la reacción aplica (tanda 2, respuesta inyectada) |
| **C32** GET ajeno o inexistente | **Ajeno: no.** La app sólo consulta su propia fila más reciente del vínculo activo y sólo al resolver un conflicto (`sync_providers.dart:240-252`). **Inexistente: alcanzable** si Central perdió la operación (mismo caso que C27) | El error se muestra como el texto crudo «SyncQueryException(404, OPERATION_NOT_FOUND)» y el conflicto sigue pendiente. **No hay prueba de host** para GET 404/401/403 | **NOT_MEASURED** (tanda 2). Observación de UX para F10: mensaje crudo |
| **C34** mismo `operationId` bajo otro Member o tenant | **No con la interfaz normal.** Los IDs son UUID v4 de `Random.secure()`, ligados a un vínculo de titular inmutable. Con otra cuenta el worker se detiene en `ownerMismatch`, y las filas de un vínculo cerrado quedan `OWNER_PAUSED`. **Ruta real que hay que vigilar:** restaurar un respaldo (F08) o cambiar de titular hacia otro Member | 0 push de las filas del titular anterior. Pruebas: «la cuenta en sesión de otro Member no publica lo de este titular»; «intenciones de un vínculo cerrado quedan pausadas…»; mutación M08 detectada | **NOT_MEASURED** (tanda 1, con C35/C38) |
| **C36** purga sin garantía de replay | **La purga no existe en Central hoy** (`F05_SYNC_06.md`: «No hay purga implementada»). Lo que sí existe es la admisión cerrada: 503 `TEMPORARILY_UNAVAILABLE` | 503 con cuerpo cerrado → `PENDING` con backoff (`throttled`). Si una purga futura devolviera un estado que el cliente no conoce (p. ej. 410), quedaría `OUTCOME_UNKNOWN` y se reintentaría sin límite: hay que definirlo con la retención de F10 (#45) | **NOT_MEASURED** para la admisión cerrada (tanda 2). La purga no se puede medir hasta que exista |

## Generación no aplicable a la interfaz móvil actual: C07, C08, C21, C25, C26 y C37

Justificación autorizada por Roderich el 2026-10-16. La interfaz móvil actual **no genera** estas solicitudes, por las guardas que se citan.
- Las pruebas de Backend siguen, en la columna Central.
- La **reacción del cliente** ante la respuesta de Central sigue aplicando y, mientras no se ejecute en el teléfono, queda **NOT_MEASURED**.
- La columna Mobile de `F05_SYNC_06.md` no se cambia en este plan.

| Fila | Guarda que impide generarla | Pruebas de la guarda (Mobile) | Respuesta de Central (prueba de Backend) | Reacción del cliente y su cobertura |
|---|---|---|---|---|
| C07 claves reordenadas | El envelope se construye siempre con el mismo literal (`envelopeOf`), a partir de la fila guardada; el reintento reenvía la misma fila | «seis claves; payload con exactamente la whitelist de cada acción»; «timeout / error de red / 500: … el reintento envía exactamente lo mismo». **Hueco:** comparan mapas decodificados; ninguna prueba fija el orden de bytes, y Central no depende de él | `ALREADY_APPLIED` («C07 same ID and content with reordered keys…») | `ALREADY_APPLIED` ya se midió en el teléfono en C02 y C04 (2026-10-15) |
| C08 mismo ID, otro contenido | Disparadores `trg_sync_outbox_sent_immutable` y `trg_sync_outbox_identity`; `operation_id` UNIQUE; sólo se reescribe una fila con `attempts = 0` | «una intención enviada no se modifica ni se borra (trigger)»; «tras salir del teléfono, un cambio es un SUPERSEDE encadenado…»; mutaciones M01, M02 y M18 detectadas | `REJECTED / IDEMPOTENCY_MISMATCH` («C08 same ID with another quantity…») | `REJECTED` terminal; sólo pruebas genéricas de REJECTED. NOT_MEASURED en el teléfono |
| C21 cantidad mayor que int64 | `maxBaseQuantity` y `parseBaseQuantity` («La cantidad es demasiado grande.»); `DeclaredNeedStore._checkQuantity`; el total de consumo se excluye por desborde | «el máximo int64 es exacto»; «ambiguo, mal formado, vacío y desbordado se rechazan»; «sumas grandes sin pérdida; por encima de int64 no se publica». **Hueco:** sin prueba de widget del mensaje | `REJECTED / QUANTITY_INVALID` («C21 decimal quantity above int64…») | `REJECTED` terminal; pruebas genéricas. NOT_MEASURED |
| C25 `contractVersion` distinto de 1 | Literal `'contractVersion': 1` en `envelopeOf` | «seis claves…» (versión = 1) | 422 `CONTRACT_VERSION_MISMATCH` («C25 contractVersion other than 1…») | Cualquier 422 → `VERSION_MISMATCH` y el worker se detiene por completo; nunca se reanuda sin actualizar la app («422: versión no compatible; el worker se detiene por completo»). NOT_MEASURED |
| C26 campo privado extra | `envelopeOf` cerrado; `OutboxEntry` sólo contiene la whitelist y la causalidad; `sync_outbox` no tiene columnas privadas | «nada privado ni contextual viaja en el envelope»; «la outbox sólo lleva la whitelist…»; «el envelope lleva sólo los cuatro campos de F06» | 400 `FIELD_NOT_ALLOWED` («C26 extra private field at any level…») | 400 cerrado con `MOVE_TO_TERMINAL_FAILURE` → `FAILED`. La prueba «400: / 413: / 415: fallo terminal visible…» no usa `FIELD_NOT_ALLOWED`. NOT_MEASURED |
| C37 batch, claves duplicadas o tipos inválidos | Una `OutboxEntry` por POST; un mapa de Dart no tiene claves duplicadas; tipos fijos; CHECK de SQLite sobre tipo, acción, unidad y estado | «400: / 413: / 415: fallo terminal visible, sin reintento automático» | 400 `INVALID_REQUEST`, 413, 415 («C37 batch, duplicated JSON keys…») | `FAILED` (misma prueba). NOT_MEASURED |

## Observaciones para F10 (no se corrigen en este plan)

1. **C24.** Falta una prueba de host de la cadena `syncNow` → `resumeAfterVerification` → reenvío.
2. **C24.** «Verificar acceso en línea» del Dashboard no reanuda lo pausado por un 403 ni lanza el envío: espera al siguiente ciclo automático.
3. **C32.** El error de un GET se muestra como texto crudo y no tiene prueba de host.
4. **C36.** Un estado HTTP desconocido acaba en `OUTCOME_UNKNOWN` con reintentos sin límite. Antes de introducir retención o purga (F10, #45) el cliente necesita un resultado terminal definido.
5. **C40b.** Las pruebas de Central sólo cubren la revocación del registro entre el guard y la decisión.
6. **C07.** No hay prueba del orden de bytes del envelope. Central no lo necesita.

## Estimación y orden

- **Tanda 1:** ~2,5 h. Requiere dos copias aisladas (C11, C14, C15), la respuesta inyectada (C30) y la entrega F08 para C35/C34.
- **Tanda 2:** ~2 h. Reutiliza la respuesta inyectada (C27, C28, C32) y un arranque con la admisión cerrada (C36).
- **C07, C08, C21, C25, C26 y C37:** su reacción en el teléfono puede añadirse a la tanda 2 con la respuesta inyectada. La generación queda justificada arriba.
- **Requisito para C35/C34:** la entrega F08 de restauración (sesión C).
