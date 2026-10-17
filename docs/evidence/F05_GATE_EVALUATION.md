# GATE-F05 (#19) — Acta de evaluación técnica (propuesta)

- **Estado propuesto:** `Status = Validation`, `Gate = Pending`, `Evidence = Partial`.
- **Esta acta no aprueba el gate.** La decisión (Passed, Failed o Waived) la registra sólo Roderich Rendón, con confirmación explícita, en `F05_GATE_DECISION.md`, que todavía no existe.
- **Redactada:** 2026-10-16 por Claude Code. Es una evaluación técnica automatizada con autorización delegada. No hubo inspección personal de capturas por Roderich ni revisión del tutor (GOV-01, #105).
- **Actualizada el 2026-10-16** (America/La_Paz; 2026-10-17 UTC) por la sesión A.
  - **Qué cambia:** incorpora la tanda física de F10 de #18 (§4b de [`F05_SYNC_06.md`](F05_SYNC_06.md)) y separa los criterios originales de #19 de las ampliaciones que ese gate no exige.
  - **Lo que se conserva:** el texto anterior, que lleva la marca *antecedente*.
  - **Fuente:** `_briefs/CIERRE_TECNICO_Y_EVALUACION_AGROCUENTAS_2026-10-16.md` §1, «F05, F10 y otros gates».

## Base evaluada

**Backend:**

- `main` `10b3a6cf6866fe4ed6e7b0a2ab8f0afcbf6322ee`, merge del PR #109.
- CI de `main`, run [38842771746](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/actions/runs/38842771746), `success`:
  - `npm test`: 172 pasan y 118 omitidas;
  - PostgreSQL: auth-v2 12/12, current-auth-context 25/25, f02-final 3/3;
  - **`sync-v1-journal` 30/30, `sync-v1-adversarial` 41/41, `sync-v1-references` 7/7**;
  - aserciones OpenAPI F05.
- **F10.** Las mismas suites, sobre el Backend integrado:
  - `e027938`: journal 30/30 y adversarial 41/41 (`F08_BACKEND_INTEGRADO_F10.md` §4);
  - `c8cbf67`, en la verificación local completa;
  - CI de `main` `c8cbf67` 38976819734 y `ed069a6` 38977769791, `success`.

**Mobile:**

- `main` `99adac3`, que incluye el PR #80 (outbox, planner, worker y necesidad declarada).
- CI de `main`, run 38842809727, `success`: 954 pruebas y `flutter analyze` limpio.
- Los runs de los merges intermedios `2c1a112` y `505c230` quedaron cancelados; `99adac3` los contiene.
- **F10.** `main` final `dff6802` (CI 38977755502, `success`).

**Dispositivo** (un solo modelo: POCO X5 Pro 5G `22101320G`, Android 12):

| Sesión | Fecha real | Versiones | Filas |
|---|---|---|---|
| §4 | 2026-10-15, 21:07–22:25 (La Paz) | BE `c2acbd4`, MOB `023a47b`/`5027a35` | C01–C04 |
| §4b, tanda 1 | 2026-10-16, 20:08–21:29Z | BE `e027938`, MOB `4f203c7` (copias `.f10s18a/b/c`) | C05, C06, C11, C14, C15, C22, C23 (pausa), C24, C30, C31, C38, C40 |
| §4b, restauración | 2026-10-16, 22:17–22:36Z | BE `e027938`, MOB `2f4b634` (copia `.f10bkp`) | C34, C35 |

Detalle: [`F05_SYNC_06.md`](F05_SYNC_06.md) §4 y §4b, y en Mobile `docs/evidence/F05_MOBILE_SYNC_DEVICE.md`, `F05_SYNC_06_DEVICE_F10.md` y `F10_RESTORE_DEVICE.md`.

**Cobertura porcentual:** ninguno de los dos CI la mide. La solidez de las pruebas se apoya en las mutaciones registradas:

- Backend E1–E20, todas detectadas.
- Mobile M01–M21b. M03, M03b y M21 sobreviven y están declaradas como equivalentes o enmascaradas en su evidencia.

## Criterios originales de #19

Son los cinco criterios de aceptación del issue #19. **Sólo ellos deciden este gate.**

| # | Criterio | Evidencia | Procedencia | Dictamen técnico |
|---|---|---|---|---|
| 1 | ACK perdido y reenvío con el mismo `operationId`: resultado persistido, sin segundo efecto | Contrato §5 y §10. `sync-v1-adversarial` C02 (×3), C04 (y caída de Central con reinicio), C06, C09, C10. Journal: «returns matching final receipt…» y «converges eight concurrent reserves to one row…». Mobile `sync_retry_worker_test` (resultado desconocido → reenvío idéntico; cierre forzado durante el envío) | CI + **dispositivo**: C01–C04 PASS («1 fila de journal para ese ID, secuencia sin cambio y cantidad sin sumar»); **F10:** C05 y C06 PASS (500 antes y después de reenviar), con el resultado persistido y journal 1 | **Evidenciado** |
| 2 | Mismo `operationId` con otro contenido: rechazo distinguible, original intacto | Contrato §5 y §7. C08 («IDEMPOTENCY_MISMATCH, original intact»), C07 y C25. Journal: «rejects changed fingerprint without overwriting…» y «concurrent different fingerprints have one creator and one mismatch». `fingerprint.spec.ts`. Mobile impide mutar una intención ya enviada (trigger; mutación M01) | CI y curl local (`F05_SYNC_05.md` §3) | **Evidenciado** en CI. En dispositivo, **NOT_MEASURED** (C08): la app no puede generar ese envío, porque el trigger lo impide, y la reacción del cliente a un `IDEMPOTENCY_MISMATCH` no se midió en el teléfono |
| 3 | Estados distinguibles; nunca un éxito no aceptado | Contrato §7 (5 resultados y 4 disposiciones; un ACK inválido queda como OUTCOME_UNKNOWN local). Adversarial C05, C11–C16, C22–C24, C28–C32, C36, C40. Mobile: un test por respuesta en `sync_retry_worker_test` («ACK incoherente…: resultado desconocido, nunca sincronizado»); `sync_screens_test` | CI + **dispositivo, ampliado en F10:** pendiente, sincronizada, en conflicto (CAUSAL_FORK, RECONCILIATION_STALE y disputa RESOLVED) y requiere intervención (AUTH_REQUIRED, AUTH_PAUSED y RESTORE_PAUSED). Un ACK inválido nunca llega a ACKED (C30, respuesta inyectada). *Antecedente:* en dispositivo sólo se habían visto Pendiente, OUTCOME_UNKNOWN y Sincronizado | **Evidenciado en CI.** En dispositivo falta **«rechazada»** (REJECTED: C16, C19–C21), sin medir, igual que RETRYABLE/429 (C28, C29) |
| 4 | Campos fuera de la whitelist (fotos de factura, notas, familia, deudas, liquidaciones) no se persisten | Contrato §4 y §12 (denegado por defecto; sin binarios de backup). Matriz F06: 8 ALLOW / 118 DENY. Adversarial C26 (`tenantId`, `causal.clientId`, `payload.notes`, `payload.backup`) y «privacy and individual domain…». Journal: «real columns/row omit payload…». Mobile: `outbox_repository_test` (sólo la whitelist) y `need_sync_payload_test` | CI. Dispositivo: logcat sin nombres de campos sensibles, también en las sesiones de F10 (`logcat_scan.sh`: 0 JWT, 0 UUID completos, 0 campos sensibles) | **Evidenciado** (por esquema cerrado; no hay un test por cada tipo de dato privado) |
| 5 | El gate sale de Pending sólo con resultados ejecutados y registrados | Los CI y las sesiones físicas citados; todas las evidencias dicen «No es un PASS de GATE-F05» | — | Hay resultados ejecutados; **el gate sigue Pending** |

**Respuestas inyectadas.** Miden la reacción del cliente. **No acreditan el comportamiento interno del servidor que simulan**; ese comportamiento lo acredita la columna Central. Afecta a C05, C06 y C30.

## Ampliaciones que #19 no exige

No se convierten en criterios de este gate. Tampoco dejan de registrarse.

| Ampliación | Dónde se trata | Relación con #19 |
|---|---|---|
| Columna Mobile de los 40 casos de #18 en dispositivo | #18 (`F05_SYNC_06.md`) | Es un criterio **de #18** («los 40 casos conservan su resultado, incluidos FAIL y NOT_MEASURED»), no de #19. #18 sigue abierto con 17 PASS, 1 parcial y 22 NOT_MEASURED |
| Prueba de carga concurrente | Excluida también del protocolo de evaluación F10 (v1.0 §1.3) | **No es un criterio de #19.** La concurrencia puntual de C09, C11 y C28 está cubierta en CI. Medir la latencia con un solo usuario no demuestra capacidad concurrente |
| Rendimiento y latencia de la sincronización (R4) | Protocolo de evaluación F10 (RNF-06), BE #48 | Tiene criterios propios; **no sustituye** a los ensayos adversariales ni decide este gate |
| Configuraciones adicionales (otro teléfono, emuladores, tamaño de letra) | Protocolo de compatibilidad (RNF-08) | No forman parte de #19 |

## Entregables de F05

| Issue | Estado | Nota |
|---|---|---|
| BE #16 | Cerrado (PR #99) | |
| BE #17, #106 | Cerrados (PR #109) | |
| MOB #29, #30, #31, #72 | Cerrados (PR #80) | |
| **BE #18** (suite adversarial) | **Abierto** | Backend completo en CI (40/40 con evidencia PASS; C30, C35 y C38 sólo en su parte Central). **En dispositivo: 17 de 40 PASS, C23 parcial y 22 NOT_MEASURED** (2026-10-16). *Antecedente:* «sólo C01–C04 son PASS; 36 filas siguen NOT_MEASURED» |

## Por qué `Evidence = Partial`

*Antecedente* (redacción del 2026-10-16, antes de la tanda de F10): «36 filas de la columna Mobile de #18 siguen `NOT_MEASURED`», entre ellas C05, C06, C09, el conflicto, el 401/403 y el ACK inválido.

**Estado actual de la columna Mobile en dispositivo:**

| Grupo | Filas | Resultado |
|---|---|---|
| ACK perdido, timeout y 500 | C01–C06 | PASS |
| Conflicto, resolución y GET del dueño | C11, C14, C15, C31 | PASS |
| Autorización | C22, C24, C38, C40 | PASS |
| | C23 | **Parcial:** la pausa es PASS; la reanudación con un registro nuevo del mismo titular, NOT_MEASURED |
| ACK inválido | C30 | PASS (respuesta inyectada) |
| Restauración | C34, C35 | PASS |
| Idempotencia y concurrencia | C07, C08, C09, C10 | NOT_MEASURED |
| Causalidad | C12, C13, C27, C28, C33 | NOT_MEASURED |
| Campaña y catálogo | C16, C17, C18, C19, C20, C21, C39 | NOT_MEASURED |
| Validación de forma | C25, C26, C37 | NOT_MEASURED |
| Límites y operación | C29, C32, C36 | NOT_MEASURED |

**Prioridad de las filas restantes, por riesgo y alcance:**
- **Mayor riesgo para el cliente:**
  - C23 (reanudación tras revocar el registro);
  - C29 (429/Retry-After y backoff, también NOT_MEASURED en Mobile #31);
  - un cierre de Mobile entre el ACK y la retirada.
- **La app no puede generar estas peticiones:** C07, C08, C21, C25, C26 y C37 (huella, tipos y versión). La reacción del cliente a sus respuestas sólo se mediría inyectándolas.
- **Exigen preparar Central:** C16–C20 y C39, que piden cambiar campañas y catálogo.
- **Sin conteo forzado.** No se llenan las 40 celdas a costa de la evaluación. Lo que no se mida sigue NOT_MEASURED; **no se convierte en PASS ni en N/A por falta de tiempo**.

**Límites ya declarados:**
- C27 `INVALID_PREDECESSOR` es terminal;
- `OWNERSHIP_NOT_PROVEN` y `PURPOSE_NOT_AUTHORIZED` no se emiten;
- retención `PERIOD_DELEGATED` sin purga;
- admisión de producción cerrada (F10 #45);
- límite global de 20/min;
- la rotación de la clave de huella no se probó en un despliegue;
- sin prueba de carga;
- los forks entre teléfonos sólo están simulados.

  *Actualización de F10:* C11, C14 y C15 se midieron con dos copias de la misma cuenta en **un solo** teléfono, con el head común por restauración F08. No son dos teléfonos físicos.

**Discrepancia de nombres.** #19 pide `application/sync-v1-retry-adversarial.spec.ts`; la suite real es `sync-v1-adversarial.postgres.spec.ts`, el nombre que fija #18.

## Para decidir (Roderich)

1. Si las 22 filas `NOT_MEASURED` y la reanudación de C23 se miden antes de decidir el gate, o se aceptan como límite con su alcance (Waived parcial).
   - El criterio 1 está evidenciado en CI y en dispositivo.
   - El 2, sólo en CI: C08 no tiene dispositivo.
   - El 3, en CI; en dispositivo le falta «rechazada».
   - El 4, por esquema cerrado, en CI, con logcat limpio en dispositivo.
2. Si #18 se cierra con su columna Mobile tal como está, o sigue abierta como deuda declarada. Su cierre no es un criterio de #19.
3. La decisión del gate, que se registra en `F05_GATE_DECISION.md` con su fecha real.
