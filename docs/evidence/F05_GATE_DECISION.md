# GATE-F05 (#19) y SYNC-06 (#18) — Decisión para el alcance académico

## Identificación y autoridad

- **Proyecto:** Agrocuentas, Proyecto de Grado 2026.
- **Fase:** F05, sincronización. **Gate:** [#19](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/19). **Tarea:** [#18](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/18), suite adversarial.
- **Fecha de la decisión:** 2026-10-17 (`America/La_Paz`). La sesión A de Claude Code la registra el mismo día.
- **Procedencia.** Es una decisión técnica **por delegación de Roderich1**, propietario del proyecto. Consta en `_briefs/CIERRE_F01_F09_Y_SIGUIENTES_SESIONES_2026-10-17.md` §2, tabla «Gates y matriz de sincronización». Se toma sobre la propuesta integrada `docs/evaluation/F03_F05_F06_PROPUESTAS_DECISION.md` (BE #134):

  > «F05 | Aceptar Passed para el alcance académico: los criterios del gate cuentan con evidencia; no añadir carga como nuevo criterio | Registrar decisión y los límites C08 y estado «rechazada» sin DEVICE. D-F04-C2 queda como corrección explícita, no desaparece por pasar este gate»
  >
  > «BE #18 | Elegir la opción (a): cierre con Evidence Partial | Conservar exactamente 18 PASS y 22 NOT_MEASURED, las procedencias y límites; no convertirlos en PASS ni N/A»

- **Lo que esta decisión no es:**
  - una inspección personal del autor;
  - una revisión ni una aprobación del tutor (se registra en GOV-01, BE #105);
  - una aprobación institucional.

  Se registra como revisión técnica automatizada y decisión por delegación.

## Decisión

- `GATE_F05 = PASSED`
- `SCOPE = ACADEMIC`
- `EVIDENCE = PARTIAL`, porque los límites de abajo se conservan
- `#18 = CERRADA`, con `EVIDENCE = PARTIAL`: 18 PASS y 22 NOT_MEASURED en la columna Mobile

**Base de referencia:**
- Backend `main` `2825de50c58d7b8b2b09288fde6306c8b7d06e83`. Desde `e4b9c29` sólo cambia `docs/`; la CI de código vigente es la 39050559138 (Backend, SUCCESS).
- Mobile `main` `ec69ae81a6e1168dfb4dd8d7b8a7181f1da1fcd2`, con CI 39063721692 SUCCESS: 1446 pasan, 3 omitidas.
- Entre la base del acta y esta, Sync v1 no cambió en ejecución (nota de base de `F05_GATE_EVALUATION.md`).
- **Las ejecuciones físicas y de CI conservan sus SHA originales**, citados en el acta y en `F05_SYNC_06.md`. Ninguna se reatribuye a esta base.

## Fundamento: criterios de #19

| Criterio | Evidencia ([F05_GATE_EVALUATION.md](F05_GATE_EVALUATION.md)) | Procedencia |
|---|---|---|
| 1. ACK perdido y reenvío con el mismo `operationId`: un solo efecto | Contrato §5 y §10; adversarial C02, C04, C06, C09 y C10; journal; `sync_retry_worker_test`. En el teléfono, C01–C06 PASS | CI + DEVICE |
| 2. Mismo `operationId` con otro contenido: rechazo distinguible, original intacto | C08, C07 y C25; journal; `fingerprint.spec.ts` | CI. **Límite:** C08 sin DEVICE, porque la app no puede generar ese envío (el trigger lo impide) |
| 3. Estados distinguibles, nunca un éxito no aceptado | Contrato §7 y adversarial. En el teléfono, pendiente, sincronizada, en conflicto y requiere intervención | CI + DEVICE. **Límite:** el estado «rechazada» (REJECTED) no se observó en el teléfono |
| 4. Campos fuera de la whitelist no se persisten | Contrato §4 y §12; matriz F06 (8 ALLOW / 118 DENY); C26; logcat limpio en el teléfono | CI + DEVICE. Esquema cerrado: no hay un test por cada tipo de dato privado |
| 5. Sólo resultados ejecutados y registrados | Los CI y las sesiones físicas citadas en el acta | — |

**Una prueba de carga concurrente no es criterio de #19** y no se añade ahora.

## #18: opción (a)

- **La columna Mobile se conserva exactamente:** 18 PASS y 22 NOT_MEASURED (C23 completo el 2026-10-17; `F05_SYNC_06.md` §4c). Las procedencias y los límites también.
  - Ninguna fila NOT_MEASURED se convierte en PASS ni en N/A.
  - Las respuestas inyectadas prueban el cliente; las acciones reales prueban Central.
- **Columna Central:** 40/40 con evidencia en CI. C30, C35 y C38 sólo en su parte Central.
- **Su 10.º criterio** («registrar los 40 casos con su resultado, incluidos FAIL y NOT_MEASURED») **se cumple**. Por eso se cierra con `Evidence = Partial`, no `Verified`.

## Límites que se conservan

- **C08 y el estado «rechazada»:** sin DEVICE.
- **#18:** 22 filas NOT_MEASURED en el teléfono (idempotencia y concurrencia, causalidad, campaña y catálogo, forma, límites y operación; entre ellas, C29 429/Retry-After).
- **D-F04-C2 sigue abierta como corrección explícita.** El vínculo de campaña con Central no comprueba hoy que el período local quepa en el central, y eso afecta también al consumo ya publicado. **No desaparece por pasar este gate.** Su corrección está encargada (sesión B) y condiciona F04 y F06.
- **Un solo modelo de teléfono.** Datos sintéticos.

## Revisiones

- **Registro:** sesión A de Claude Code, el 2026-10-17, sobre las actas versionadas y sin repetir pruebas.
- **Revisión personal de Roderich Rendón:** no consta.
- **Revisión del tutor:** se registra aparte en GOV-01.
