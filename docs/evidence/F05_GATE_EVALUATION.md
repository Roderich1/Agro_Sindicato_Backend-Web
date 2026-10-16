# GATE-F05 (#19) — Acta de evaluación técnica (propuesta)

- **Estado propuesto:** `Status = Validation`, `Gate = Pending`, `Evidence = Partial`.
- **Esta acta no aprueba el gate.** La decisión (Passed, Failed o Waived) la registra sólo Roderich Rendón, con confirmación explícita, en `F05_GATE_DECISION.md`, que todavía no existe.
- **Redactada:** 2026-10-16 por Claude Code. Es una evaluación técnica automatizada con autorización delegada. No hubo inspección personal de capturas por Roderich ni revisión del tutor (GOV-01, #105).

## Base evaluada

**Backend:**

- `main` `10b3a6cf6866fe4ed6e7b0a2ab8f0afcbf6322ee`, merge del PR #109.
- CI de `main`, run [38842771746](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/actions/runs/38842771746), `success`:
  - `npm test`: 172 pasan y 118 omitidas;
  - PostgreSQL: auth-v2 12/12, current-auth-context 25/25, f02-final 3/3;
  - **`sync-v1-journal` 30/30, `sync-v1-adversarial` 41/41, `sync-v1-references` 7/7**;
  - aserciones OpenAPI F05.

**Mobile:**

- `main` `99adac3`, que incluye el PR #80 (outbox, planner, worker y necesidad declarada).
- CI de `main`, run 38842809727, `success`: 954 pruebas y `flutter analyze` limpio.
- Los runs de los merges intermedios `2c1a112` y `505c230` quedaron cancelados; `99adac3` los contiene.

**Dispositivo:**

- POCO X5 Pro 5G `22101320G`, Android 12, 2026-10-15 de 21:07 a 22:25 (La Paz).
- Backend `c2acbd4`, Mobile `023a47b`/`5027a35`.
- Registrado en [`F05_SYNC_06.md`](F05_SYNC_06.md) §4 y en Mobile `docs/evidence/F05_MOBILE_SYNC_DEVICE.md`.

**Cobertura porcentual:** ninguno de los dos CI la mide. La solidez de las pruebas se apoya en las mutaciones registradas:

- Backend E1–E20, todas detectadas.
- Mobile M01–M21b. M03, M03b y M21 sobreviven y están declaradas como equivalentes o enmascaradas en su evidencia.

## Criterios de #19

| # | Criterio | Evidencia | Procedencia | Dictamen técnico |
|---|---|---|---|---|
| 1 | ACK perdido y reenvío con el mismo `operationId`: resultado persistido, sin segundo efecto | Contrato §5 y §10. `sync-v1-adversarial` C02 (×3), C04 (y caída de Central con reinicio), C06, C09, C10. Journal: «returns matching final receipt…» y «converges eight concurrent reserves to one row…». Mobile `sync_retry_worker_test` (resultado desconocido → reenvío idéntico; cierre forzado durante el envío) | CI + **dispositivo C01–C04 PASS** («1 fila de journal para ese ID, secuencia sin cambio y cantidad sin sumar») | **Evidenciado** |
| 2 | Mismo `operationId` con otro contenido: rechazo distinguible, original intacto | Contrato §5 y §7. C08 («IDEMPOTENCY_MISMATCH, original intact»), C07 y C25. Journal: «rejects changed fingerprint without overwriting…» y «concurrent different fingerprints have one creator and one mismatch». `fingerprint.spec.ts`. Mobile impide mutar una intención ya enviada (trigger; mutación M01) | CI y curl local (`F05_SYNC_05.md` §3) | **Evidenciado** (sin columna de dispositivo) |
| 3 | Estados distinguibles; nunca un éxito no aceptado | Contrato §7 (5 resultados y 4 disposiciones; un ACK inválido queda como OUTCOME_UNKNOWN local). Adversarial C05, C11–C16, C22–C24, C28–C32, C36, C40. Mobile: un test por respuesta en `sync_retry_worker_test` («ACK incoherente…: resultado desconocido, nunca sincronizado»); `sync_screens_test` | CI. En dispositivo sólo se vieron Pendiente, OUTCOME_UNKNOWN y Sincronizado | **Evidenciado en CI**; en dispositivo, parcial |
| 4 | Campos fuera de la whitelist (fotos de factura, notas, familia, deudas, liquidaciones) no se persisten | Contrato §4 y §12 (denegado por defecto; sin binarios de backup). Matriz F06: 8 ALLOW / 118 DENY. Adversarial C26 (`tenantId`, `causal.clientId`, `payload.notes`, `payload.backup`) y «privacy and individual domain…». Journal: «real columns/row omit payload…». Mobile: `outbox_repository_test` (sólo la whitelist) y `need_sync_payload_test` | CI. Dispositivo: logcat sin nombres de campos sensibles | **Evidenciado** (por esquema cerrado; no hay un test por cada tipo de dato privado) |
| 5 | El gate sale de Pending sólo con resultados ejecutados y registrados | Los CI y la sesión física citados; todas las evidencias dicen «No es un PASS de GATE-F05» | — | Hay resultados ejecutados; **el gate sigue Pending** |

## Entregables de F05

| Issue | Estado | Nota |
|---|---|---|
| BE #16 | Cerrado (PR #99) | |
| BE #17, #106 | Cerrados (PR #109) | |
| MOB #29, #30, #31, #72 | Cerrados (PR #80) | |
| **BE #18** (suite adversarial) | **Abierto** | Backend completo en CI. En dispositivo sólo C01–C04 son PASS; **36 filas de la columna Mobile siguen NOT_MEASURED** (comentario del 2026-10-16) |

## Por qué `Evidence = Partial`

- 36 filas de la columna Mobile de #18 siguen `NOT_MEASURED`. Entre ellas:
  - C05, C06 y C09 en dispositivo;
  - conflicto (C11, C13–C15);
  - 401/403 (C22–C24);
  - ACK inválido (C30).
- Tampoco se midió en dispositivo un cierre de Mobile entre el ACK y la retirada.
- **Límites ya declarados:**
  - C27 `INVALID_PREDECESSOR` es terminal;
  - `OWNERSHIP_NOT_PROVEN` y `PURPOSE_NOT_AUTHORIZED` no se emiten;
  - retención `PERIOD_DELEGATED` sin purga;
  - admisión de producción cerrada (F10 #45);
  - límite global de 20/min;
  - la rotación de la clave de huella no se probó en un despliegue;
  - sin prueba de carga;
  - los forks entre teléfonos sólo están simulados.
- **Discrepancia de nombres.** #19 pide `application/sync-v1-retry-adversarial.spec.ts`; la suite real es `sync-v1-adversarial.postgres.spec.ts`, el nombre que fija #18.

## Para decidir (Roderich)

1. Si las filas `NOT_MEASURED` de Mobile se miden antes del gate o se aceptan como límite (Waived parcial).
2. La decisión del gate, que se registra en `F05_GATE_DECISION.md` con su fecha real.
