# F05-SYNC-06 (#18) — Plan por riesgo de las filas físicas pendientes (para F10)

- **Fecha:** 2026-10-16.
- **Redactado por:** la sesión A de Claude Code, con autorización delegada.
- **Naturaleza:** es un **plan**, no un resultado. Las 36 filas de la columna Mobile de [`F05_SYNC_06.md`](../evidence/F05_SYNC_06.md) (C05–C40) siguen **NOT_MEASURED**.
  - Este documento no cambia ningún resultado y no cierra #18.
  - Proponer que una fila sea NOT_APPLICABLE en dispositivo no la reclasifica: lo decide Roderich al revisar.
- **Prioridad** (según `_briefs/CONTINUACION_TRES_SESIONES_2026-10-16.md` §3): autorización 401/403, ACK inválido, conflicto y resolución, y restauración.
- **Ya medido en dispositivo:**
  - C01–C04 (2026-10-15);
  - el camino 401 de una sesión revocada, que no es una fila de #18: es la repetición de E-2 de #71 del 2026-10-16.

## Método común

- Copia aislada nueva por tanda; nunca la app normal, la demo, `.f03res01`, `.f06d4` ni `.f03e2b`.
- Backend desechable propio y túnel temporal.
- Herramientas `tool/f03_res_01`:
  - entorno configurable;
  - `fault.sh` (`drop-push-response`, `hold-push-request`);
  - `check.sh` (`sync`, `timeline`);
  - `device.sh db outbox`;
  - `logcat_scan.sh` ampliado.
- **PASS** sólo con la petición real del teléfono y la reacción observable que define cada fila. Una prueba del servidor o de host no sustituye la columna Mobile.
- Los turnos del POCO los asigna la sesión A (`_briefs/PARALELO_CONTROL.md`).

## Tanda 1 — riesgo alto (primera sesión de F10, ~2 h)

| Fila | Por qué es de riesgo alto | Cómo medirla en el teléfono |
|---|---|---|
| C22 Member, sesión o tenant inactivo o revocado | Un 403 mal tratado podría reenviar en bucle o dar por sincronizado | Con una intención pendiente, desactivar el Member o revocar la sesión por la API. Un push → 403 `AUTH_CONTEXT_FORBIDDEN`; outbox `AUTH_PAUSED`; sin reintentos automáticos |
| C23 ClientRegistration revocado | Igual que C22, por el lado de la instalación | Revocar el registro propio con una intención pendiente → 403; pausa; tras reactivar con un registro nuevo, se acepta una sola vez |
| C24 access expirado y refresh | El 401 de un push debe llevar a un refresh, no a perder la intención | Access vencido (TTL corto sólo en el entorno de prueba) → 401 → refresh → el mismo push se acepta una vez (journal 1) |
| C40 revocación antes de la aceptación durable | Una carrera que podría aceptar algo ya revocado | `hold-push-request` con revocación durante la espera → 403, nada aceptado |
| C38 cambio de tenant o Member al reautenticar | Publicar lo de un titular con otra cuenta | Reautenticar con otra cuenta del mismo tenant → `OWNER_PAUSED` / `ownerMismatch`; 0 push |
| C30 ACK 2xx incompleto o contradictorio | Riesgo de marcar «sincronizado» sin aceptación | El observador altera un ACK (fallo nuevo en `fault.sh`) → `OUTCOME_UNKNOWN`, nunca ACKED |
| C06 500 con commit desconocido | Duplicar un efecto | Fallo que devuelve 500 tras el commit → reintento con el mismo ID → `ALREADY_APPLIED`, journal 1 |
| C05 500 antes del commit | Perder una intención | 500 antes del commit → reintento → `APPLIED` una vez |
| C11 dos sucesores del mismo head | Fork real entre dos teléfonos | Dos copias aisladas del mismo Member (requiere un segundo paquete) → un APPLIED y un CONFLICT; la UI muestra el conflicto |
| C14 resolución humana con head y referencia vigentes | Flujo de resolución en la UI | Tras C11, «Enviar mi total actual» → APPLIED; disputa RESOLVED |
| C15 referencia de reconciliación obsoleta | Resolver con datos viejos | Resolver dos veces o desde la copia desfasada → `RECONCILIATION_STALE`, estado intacto |
| C35 restore sin prueba de propietario | Publicar datos restaurados de otro titular | Restaurar un respaldo y abrir la app → intenciones `RESTORE_PAUSED`; 0 push hasta liberarlas. Coordinar con la entrega F08 (sesión C) |

## Tanda 2 — riesgo medio (~1,5 h)

| Fila | Medición propuesta |
|---|---|
| C09 retries simultáneos del mismo ID | `hold-push-request` y un segundo ciclo manual → un efecto |
| C12 CANCEL aceptado y replay antiguo | Retirar una necesidad y forzar el reenvío del PUBLISH previo → `ALREADY_APPLIED`; la retirada se mantiene |
| C13 sucesor atrasado tras CANCEL | Dos copias: retirar en una y enviar un valor en la otra → `CANCELLED_PREDECESSOR` |
| C33 sucesor tardío de una rama cercada | Tras C14, la copia desfasada envía → conflicto, sin resurrección |
| C10 otra instalación del mismo Member | Segunda copia aislada con la misma cuenta reenvía un ID ya aceptado (requiere copiar la intención: valorar si es alcanzable sin manipular SQLite) |
| C31 GET del dueño tras ACK perdido | `drop-push-response` y consulta de la operación desde la UI de conflicto |
| C29 rate limit o mantenimiento | 429 con `Retry-After` → backoff visible; sin pérdida |
| C16 / C17 / C18 campaña cerrada | Cerrar la campaña en Central antes o después de aceptar: rechazo visible; replay aceptado; CANCEL permitido |
| C19 / C20 referencia o unidad no disponible | Desactivar el producto central o cambiar su unidad → rechazo visible y vínculo inválido |
| C39 resultado final tras un cambio de catálogo | Cambiar el catálogo tras aceptar → el replay conserva el resultado |

## Tanda 3 — riesgo bajo o probablemente no aplicable en dispositivo

En estas filas la app, por construcción, no puede emitir la petición sin manipularla. **Se propone NOT_APPLICABLE en dispositivo, con su justificación; la decisión es de Roderich.** Mientras no se decida, siguen NOT_MEASURED.

| Fila | Por qué la app no la produce |
|---|---|
| C07 claves reordenadas | La app serializa un JSON canónico; no varía el orden |
| C08 mismo ID, otro contenido | Un trigger SQLite impide mutar una intención enviada (mutación M01) |
| C21 cantidad mayor que int64 | El formulario limita la cantidad (`maxBaseQuantity`) |
| C25 `contractVersion` distinto de 1 | Constante en el cliente |
| C26 campo privado extra | El envelope sólo lleva la whitelist (pruebas de payload) |
| C27 antecesor inválido | El planner sólo encadena intenciones propias aceptadas |
| C28 antecesor propio en procesamiento | Ventana de tiempo de servidor; difícil de forzar sin el observador |
| C32 GET ajeno o inexistente | La app sólo consulta sus propias operaciones |
| C34 mismo `operationId` en otro Member o tenant | Los IDs son UUID v4 propios; habría que copiarlos entre cuentas |
| C36 purga sin garantía de replay | Depende de la admisión y retención del servidor (F10 #45) |
| C37 batch, claves duplicadas o tipos inválidos | La app envía una intención por petición, con tipos fijos |

## Estimación y orden

- Tanda 1: ~2 h con dos copias aisladas (para C11, C14 y C15) y un fallo nuevo en el observador (C30).
- Tanda 2: ~1,5 h.
- Tanda 3: sólo la decisión de Roderich sobre NOT_APPLICABLE.
- **Requisito para C35:** la entrega F08 de restauración (sesión C).
