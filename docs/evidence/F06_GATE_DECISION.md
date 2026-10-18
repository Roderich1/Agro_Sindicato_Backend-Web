# GATE-F06 (#22) — Registro de decisión propuesto para el alcance académico

## Identificación y autoridad

- **Proyecto:** Agrocuentas, Proyecto de Grado 2026.
- **Fase:** F06, proyección colectiva mínima. **Gate:** [#22](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/22). **Consolidación:** [#21](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/21).
- **Fecha de preparación:** 2026-10-18 (`America/La_Paz`, madrugada; UTC 03:14–03:26 de la reconciliación). Lo prepara la sesión B de Claude Code.
- **Procedencia.** Es un registro de decisión técnica **por delegación de Roderich1**, propietario del proyecto, autorizado en `CONTINUACION_F09_ENS_01_TRIAGE_2026-10-17.md` §4 **condicionado** a un resultado que ahora consta:

  > «Después de la nueva D4 con diferencia 0 en las 27 celdas y 26 aportaciones coincidentes, incluidos los dos recorridos de reenvío previstos, queda autorizada la preparación de la decisión **Passed académico / Evidence Partial** de F06. Se ratifican las decisiones ya delegadas de criterios 3 y 6 y la primacía del contrato en #32/#33. La decisión se versiona y revisa antes del cierre de BE #22. Si falla o queda sin ejecutar, Pending, sin maquillar el oráculo.»

  Antecedente: `CIERRE_F01_F09_Y_SIGUIENTES_SESIONES_2026-10-17.md` §2 («F06 | Ratificar criterios 3 y 6 y la primacía del contrato en #32/#33; mantener Pending hasta resolver C2 y comprobar su efecto»). C2 está resuelta e integrada (MOB #116) y su efecto sobre la D4 está comprobado (abajo).

- **Lo que este registro no es:**
  - una inspección personal del autor;
  - una revisión ni una aprobación del tutor (GOV-01, BE #105);
  - una aprobación institucional ni una autorización de cifras reales (#107/F07).

  Se registra como revisión técnica de la sesión B y decisión por delegación de Roderich, **pendiente de revisión** (sesiones A y C) y del cierre de #22 por Roderich. Hasta ese cierre, `Gate = Pending` en GitHub y en el Project.

## Decisión propuesta

- `GATE_F06 = PASSED`
- `SCOPE = ACADEMIC`
- `EVIDENCE = PARTIAL`, porque los límites de abajo se conservan
- `#22`: cerrar sólo cuando Roderich registre la decisión; `#21` según su propio estado.

**Base de referencia:**
- Backend `main` `6e4a0e2ce8fb33ac3d6bf70e88cb6e60641456f0`.
- Mobile `main` `0cc2ee3f518f715bb008fc6cf50a891068b0d649` (código igual a `65f7cfc`, que integra #116).
- **Las corridas anteriores (2026-10-16 sobre `3c01a16`/`5e7ed78`; 2026-10-17 sobre `e2263b0`/`ce5678f`) y la ruta física del agricultor 1 conservan sus SHA.** Ninguna se reatribuye a esta base.

## Fundamento: criterios de #22

| Criterio | Evidencia ([GATE_F06.md](GATE_F06.md), [F06_RECONCILIATION.md](F06_RECONCILIATION.md)) | Procedencia |
|---|---|---|
| 1. Dataset de #21 publicado desde Mobile con diferencia 0 por campaña, producto y unidad | 27/27 celdas con diferencia 0 y Central 26/26 frente al oráculo escrito a mano, en tres corridas (2026-10-16, 17 y **18 bajo #116**); CSV de resultados idénticos byte a byte. Ruta física del agricultor 1 (9/9) el 2026-10-16 | HOST (API y PostgreSQL reales) + DEVICE (2026-10-16) |
| 2. Reenvío o ACK perdido: mismo resultado, sin volver a sumar | Ejecución 1: 27 respuestas perdidas y reenviadas; ejecución 2: 27 reenvíos literales, agregado idéntico; journal en 27. Adversarial F05 C02–C10 en CI. Desde #116, un reenvío **no** se usa bajo período incompatible: lo incierto se concilia por consulta (`f04_c2_queue_reconciliation_test`) | HOST + CI |
| 3. Actualizaciones concurrentes incompatibles: conflicto registrado, sin reemplazo silencioso; el agregado no cambia hasta una intención nueva del propietario | Adversarial C11 y `CONTESTED` en `f06-coll-05…`. **Ratificado por delegación** (§2 del cierre del 17): el aporte en disputa deja el cálculo y la cifra se retira hasta una intención válida | CI |
| 4. Campos fuera de la whitelist, datos privados o backup: rechazo sin persistir; restaurar no publica | C26 (`FIELD_NOT_ALLOWED`), pruebas de privacidad, `f04_restore_authorization_test`; DEVICE C35 (`F10_RESTORE_DEVICE.md`, MOB `2f4b634`) | CI + DEVICE |
| 5. Agricultor sin publicación: desconocido, no cero; la cobertura lo refleja | Cero explícito y ausencia distinguidos; cobertura 3 de 12 con `suppressed_cells: true` (semántica de #126) en las tres corridas | CI + HOST |
| 6. La consulta de la Directiva sólo expone totales derivados con referencias y unidad | `/summary` y CSV sin identidad ni cantidades individuales; Web F07 consume sólo eso. **Ratificado por delegación**: `projection_type`, `total_base`, cobertura, conteos y `data_as_of` son metadatos sujetos a la política; una celda suprimida no expone cantidad ni conteo exacto; primacía del contrato en MOB #32/#33 | CI + HOST |
| 7. Sin evidencia ejecutada, el gate sigue Pending | Hay evidencia ejecutada y versionada en `main` y en este PR | — |

**Efecto de D-F04-C2 sobre F06, comprobado:** el control temporal de #116 no altera el resultado de la D4 cuando los períodos locales caben en los centrales (fixture ajustado sólo en fechas de preparación, MOB #123). Cuando no caben, el worker retiene y concilia en lugar de publicar, según sus regresiones HOST y los pasos físicos G1–G3 (`F04_C2_DEVICE.md`, MOB #118).

## Límites que se conservan (por eso `Evidence = Partial`)

- **Datos sintéticos y política provisional k = 3.** La divulgación real sigue cerrada (`POLICY_PENDING` en producción) hasta la validación institucional de #107/F07, que no se atribuye ni se presume.
- **Ruta física:** una sola corrida (2026-10-16, agricultor 1, POCO X5 Pro 5G) y un solo modelo de teléfono; la D4 del 2026-10-18 es sólo de host y no usó el teléfono. Los pasos G1–G3 de C2 (HONOR JDY-LX3P) usan una necesidad declarada, no la reconciliación completa.
- **Límites de #116 declarados por C:** la carrera entre selección y marcado se cierra en el marcado; un 404 de la consulta queda retenido sin plazo; un CANCEL detrás de una sustitución nunca recibida espera; si el período vuelve a caber dentro de `heldQueryInterval` el envío espera a `next_attempt_at`; sus adversariales son HOST.
- **D-F04-C1 sigue como límite de RF-03** (registros tardíos de un período cerrado se rechazan), decidido como opción B; no es parte de F06 pero condiciona F04.
- **Discrepancias ya ratificadas**, no reabiertas aquí: criterio 3 (retiro del aporte en disputa) y criterio 6 (metadatos sujetos a la política), con el texto original de `GATE_F06.md` conservado como antecedente.
- La prueba de integración de la D4 **no corre en la CI normal**; cada repetición es una corrida manual con SHA registrados.

## Revisiones

- **Preparación:** sesión B de Claude Code, el 2026-10-18, a partir de la corrida registrada en `F06_RECONCILIATION.md`.
- **Revisión técnica de A y C:** pendiente sobre este PR.
- **Revisión personal de Roderich Rendón:** no consta. El cierre de #22 y el cambio de `Gate` son suyos.
- **Revisión del tutor:** se registra aparte en GOV-01.
