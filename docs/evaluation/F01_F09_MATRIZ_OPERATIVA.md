# Matriz operativa F01–F09 antes de F10

- **Fecha:** 2026-10-17. Primera versión de la sesión A de Claude Code, por la delegación técnica de Roderich del mismo día (`_briefs/PLAN_TERMINAR_F01_F09_ANTES_F10_2026-10-17.md`).
- **Naturaleza:** registro de seguimiento. **No es un acta ni cambia ningún gate.**
  - Las decisiones de gate siguen siendo de Roderich, con su confirmación explícita.
  - La revisión del tutor se registra en GOV-01 (#105).
  - Las aprobaciones institucionales no se suponen.
- **Base inicial del bloque (conservada):**
  - Backend/Web `e2263b04d96dd9f049a92046a45232af847ce0da`, CI 39031734166 (Backend) y 39031734178 (Web) SUCCESS;
  - Mobile `ce5678f89449453c60c3f1889cd6e973f09f6548`, CI 39031740439 SUCCESS (1072 pasan, 3 omitidas).
- **Fuentes:**
  - exportación del Project #3 del 2026-10-17 08:34 (88 tarjetas F01–F09: 44 cerradas y 44 abiertas);
  - cuerpos y comentarios vigentes de las issues;
  - `docs/evidence/` de los dos `main`.
  - **El Project es seguimiento, no prueba de que falte código.**
- **Evidencia de F10 ya obtenida:** se conserva con sus versiones (BE `ed069a6`, MOB `dff6802`). No se repite ni se reatribuye en este bloque.

## Clasificación y procedencia

| Clasificación | Significado |
|---|---|
| **CERRADO** | Criterio satisfecho e issue cerrada (puede quedar una nota) |
| **CONSTRUIDO_SIN_CERRAR** | Hay código y evidencia; falta la revisión, la decisión o el cierre |
| **FUNCIONALIDAD_PENDIENTE** | Falta construir algo que exige el criterio |
| **VALIDACION_EXTERNA** | Falta una validación fuera del código: dispositivo, institución o tutor |
| **ALCANCE_DIFERIDO** | Diferido o fuera del alcance académico por una decisión registrada |

Procedencia: CI (GitHub Actions), HOST (pruebas en el PC), DEVICE (POCO X5 Pro 5G `22101320G`, Android 12) y DOC (documento o comentario).

## Resumen por fase

| Fase | Gate | Estado real | Lo que falta, por nombre | Responsable |
|---|---|---|---|---|
| F01 | #9 **Passed** | CERRADO | Nada. `Requirement refs` de #6–#9 y #79/#80 no usa IDs del Cap. III: es cosmético y no se reabre | — |
| F02 | #15 **Passed** | CERRADO | Nada para el alcance académico. #94 (SEC-DEP-01) es de F10, previo a producción | — |
| F03 | MOB #23 Pending | CONSTRUIDO_SIN_CERRAR (decisión) | Acta propuesta `GATE_F03_EVALUATION.md` y #76 en el POCO, con los 5 criterios PASS (MOB #105, `2df6033`). Faltan la decisión del gate y el cierre de #76. Residuales NOT_MEASURED declarados | Roderich |
| F04 | MOB #28 Pending (Validation) | FUNCIONALIDAD_PENDIENTE + decisión | #24–#27 integradas y cerradas. Criterio 5 de #28 parcial: resolver campaña y fecha efectiva conforme a RF-03/RF-12 y cubrir persistencia multiproducto; no se acepta como Passed por el número de tests | A, con revisión técnica |
| F05 | BE #19 Pending | CONSTRUIDO_SIN_CERRAR (decisión) | Decisión sobre #18 (columna Mobile: 18 PASS y 22 NOT_MEASURED) y #19. Nota de base en el acta (este PR) | Roderich |
| F06 | BE #22 Pending | CONSTRUIDO_SIN_CERRAR (decisión) | Acta al día (con C35), contrato y política con la cobertura nueva, y **regresión D4 en PASS** sobre `e2263b0` + `ce5678f` (BE #131 → `30fbb56`). Faltan la decisión y ratificar la reescritura delegada del criterio 3 | Roderich |
| F07 | BE #29 Pending | CONSTRUIDO_SIN_CERRAR + VALIDACION_EXTERNA | #127/#132 integrados. #128 integrado en `cab433d` tras revisión de Codex; aceptación funcional y matriz disponibles. #107 sigue institucionalmente pendiente, con cifras reales deshabilitadas | Roderich, Directiva |
| F08 | BE #41 **Passed** (alcance académico reducido) | CERRADO para ese alcance + ALCANCE_DIFERIDO (#40) | #129 integrado en `19a167f`: retención/purga y ciclo productivo siguen diferidos. MOB #55 sigue Partial por la interfaz e InvoiceStorage. No se reabre el gate | Roderich |
| F09 | MOB #17 Pending | CONSTRUIDO_PARCIALMENTE + VALIDACION_EXTERNA | #99/#100/#101/#104 integrados; conexión #109 integrada en `8a2c558`. Falta aplicar un plan pendiente por voz (D-F09-4), dictado real y holdout nuevo. Decisiones D-F09-1…7 registradas al final; no constituyen PASS | C, A, Roderich |

## F01 y F02 (no se reabren)

| Issue | Estado | Evidencia y SHA | Brecha | Clasificación |
|---|---|---|---|---|
| BE #6, #7, #8, #79, #80 | Cerrados, Verified | PR #82 (`b696913a`) y #83 (`347e2e78`); `F01_SEMANTIC_CORRIGENDUM.md` | Ninguna. El comentario de #79 muestra `Merge SHA: $merge` sin expandir (cosmético) | CERRADO |
| BE #9 GATE-F01 | Passed | Cierre del 2026-09-22; corrigendum #90 | Ninguna | CERRADO |
| BE #10–#14 | Cerrados, Verified | `F02_IAM_01…05.md`; CI de `e2263b0`: auth-v2 12/12, current-auth-context 25/25, f02-final 3/3 | Ninguna | CERRADO |
| BE #15 GATE-F02 | Passed (académico) | `F02_GATE_DECISION.md`, `F02_GATE_EVALUATION.md` (2026-09-28) | La producción no se autorizó (#94 abierto, F10) | CERRADO |
| MOB #60 | Cerrado, Verified | `docs/evolution/features/F02_DEVICE_CLIENT_ID_EVIDENCE.md` (POCO, `32096fa`), anterior a la regla de `docs/evidence/` | Formal e histórica | CERRADO |

## F03 — activación online y sesión offline

| Issue | Criterio vigente | Implementación en main | Evidencia y SHA | Brecha real | Responsable | Condición de cierre |
|---|---|---|---|---|---|---|
| MOB #18–#22 (cerrados, Partial) | Plantilla de AUTH-01…05 | `lib/services/auth/*` | `docs/evolution/features/F03_MOB_AUTH_0*.md` (DEVICE en #19–#22). **Ninguno tiene archivo en `docs/evidence/`** | #18: sin pruebas de 403/404 ni de `ApiEndpointConfig.fromEnvironment`. #19-C, #19-F y #21-E sin medir | Roderich | Quedan Partial salvo que Roderich acepte referenciarlos. No se marcan Verified sin archivo |
| MOB #71 (cerrado, Partial) | D, E-1, E-2 y reaperturas | `tool/f03_res_01/` | `F03_RES_01_DEVICE.md`: MOB `94e7d24`/`5527784`, BE `c2acbd4`/`063437d`, 2026-10-15/16 | Ninguna frente a su condición. Residual: E-1 sin el escaneo ampliado | Roderich | **Candidato a Verified**, si Roderich acepta el residual |
| MOB #76 (In Review) | 5 criterios: sin activar no escribe; activada sin red sigue; v7 → histórica; restaurada en otra instalación no opera; sesión ilegible no se trata como nueva | Migración v8, estados A–F, `FarmerOperationGate`, redirect (#77, #78) | HOST con mutaciones (`F04_ACTIVACION_TITULAR_MODO.md`, `F04_CORRECCIONES_REVISION.md`) + **DEVICE** `F03_F04_DEVICE_2026-10-17.md` (P1, P2, P11, P12, P13 PASS; MOB #105 → `2df6033`) | Ninguna funcional. Límites: un solo modelo; F y «otro Member» sin salida automática (criterio B) | Roderich | Cierre con la decisión de GATE-F03 |
| MOB #83 (cerrado, Partial) | Mensaje único tras verificar | `dashboard_screen.dart` | `F03_BUG_01.md` (HOST) + añadido del 2026-10-17 (MOB #105): versión `1d3ef90` como inferencia y la observación en el teléfono sobre `5527784` | El criterio 3 sigue sólo en host | Roderich | Verified si lo acepta |
| MOB #87 | Correo sin autocapitalizar | Activación y reautenticación | `F03_BUG_02.md` (`5527784`, POCO) | Ninguna | — | CERRADO |
| **MOB #23 GATE-F03** | 6 criterios (#18–#22 y la primera instalación online, la operación offline y el refresh inválido) | — | Acta propuesta `GATE_F03_EVALUATION.md` (MOB #105 → `2df6033`); 6a/6b/6c en DEVICE (#19, #21, #22, #71 y la sesión del 2026-10-17) | Residuales NOT_MEASURED declarados (19-C, 19-F, 21-E, Auto Backup/D2D/energía, logcat opaco del 2026-10-15, un solo modelo) | Roderich | Decisión: Passed académico con residuales, Pending o Waived parcial |

## F04 — dominio y modalidades

| Issue | Criterio vigente | Implementación | Evidencia y SHA | Brecha real | Responsable | Condición de cierre |
|---|---|---|---|---|---|---|
| MOB #24 MODE-01 | Persistir la modalidad, valor por defecto, migración, un solo dominio | `operation_mode_store.dart`, `app_settings` (#77) | `F04_ACTIVACION_TITULAR_MODO.md` (`fccd74c`), `F04_CORRECCIONES_REVISION.md`; `f04_operation_mode_test`; DEVICE P3/P8 | Ninguna. Discrepancia «datos activos» conservada | — | **Cerrada** el 2026-10-17 con mapeo (Done/Verified) |
| MOB #27 MODE-04 | Transiciones seguras, atómicas, sin borrar ni reasignar | `OperationModeStore.apply` (#77); carrera corregida (`731750e`); reversiones en propio (`db0b10a`, #102) | Ídem + `f04_mode_race_test` y `personal_mode_flows_test`; DEVICE P8/P9 | Ninguna | — | **Cerrada** el 2026-10-17 con mapeo (Done/Verified) |
| MOB #25 MODE-02 | Elección comprensible, consulta y cambio, mensajes, sin red | `/titular` y `/modo` (#78) + **MOB #102** (`cf3d510`) | `F04_MOB_MODE_02_ONBOARDING_UX.md` (0 peticiones HTTP); DEVICE P3 (PASS parcial: mensaje no observado), P8, P9 en modo avión | La comprensión real con personas es de F10 | — | **Cerrada** el 2026-10-17 con mapeo (Done/Verified) |
| MOB #26 MODE-03 | En propio, sin transferencias ni elección de responsables; un solo dominio | **MOB #102** (`cf3d510`) y **#107** (`a104971`) | `F04-MODE-03_flujos_modo_personal.md` (14 casos, 16 mutaciones); DEVICE P4–P7 | Ninguna | — | **Cerrada** el 2026-10-17 con mapeo (Done/Verified) |
| MOB #97 (F10-COMPAT) | Títulos legibles al 100 % y al 130 % | **MOB #103** (`8103766`) | `F10_COMPAT_97_LEGIBILIDAD.md` (rojo 7/8 → 9/9 en CI, con Roboto versionada); DEVICE P10 en el POCO al 100 % y al 130 % | Ninguna | Roderich | Cerrar (dry-run B2). A1-F se vuelve a medir en F10 |
| MOB #73, #74 | Defectos de reversión | #75, #79 | `F04_BUG_01.md`, `F04_BUG_02.md` | Ninguna | — | CERRADO |
| **MOB #28 GATE-F04** | Regresión en ambos modos sobre CU-04…CU-10, CU-17 y CU-19; persistencia offline | — | Acta propuesta `gate-f04-modo-propio-compartido.md` (MOB #105); CI de main en verde; DEVICE P1–P13 | Criterio 5 **Parcial**: no hay campaña por fecha efectiva. Transferencia y multiproducto sólo en host | Roderich | Decisión del gate (Status: Validation) |

**REC de F04 (Origin Reconstructed).** Son capacidades previas al seguimiento: **no condicionan GATE-F04** y no se presentan como trabajo nuevo.

| REC | Evidencia verificable en `main` | Situación | Condición |
|---|---|---|---|
| #38, #41, #42, #52, #54, #57 | Ninguna en `docs/evidence/`; los tests existen y pasan en la CI de `ce5678f` | Su registro histórico (`REC_MOBILE_BASELINE.md` y `REC_021_CI.md`, ejecutados el 2026-10-15 sobre `278cbd3`, 690 pruebas, que coinciden con la CI 37231657078) **sólo está en MOB #70, sin integrar** | Integrar #70 con una nota fechada del 2026-10-17 sobre el estado posterior. Cierra estas seis |
| #39, #43, #46, #47, #48, #50, #51 | Parcial. #48 y #50 lo están en parte por `F04_BUG_01/02.md` | La cobertura añadida el 2026-10-15 está en ramas locales `test/rec-0NN-coverage` **nunca publicadas**, y sus archivos citan SHA reescritos | Quedan abiertas como Partial hasta publicar esas pruebas sobre `main` con SHA válidos, o hasta que Roderich acepte el límite |

## F05 — sincronización

| Issue | Estado | Evidencia y SHA | Brecha real | Responsable | Condición de cierre |
|---|---|---|---|---|---|
| BE #16, #17, #102, #106; MOB #29–#31, #72 | Cerrados, Verified | `F05_SYNC_04/05/07.md`, `F05-SYNC-01/02.md`, `F05_MOBILE_SYNC*.md`, `F05_SYNC_08.md`; CI `e2263b0`: sync-v1-journal 30/30, adversarial 41/41, references 7/7 | Ninguna. #102 no tiene archivo propio (anterior a la regla) | — | CERRADO |
| MOB #82 (cerrado, Partial) | — | `F05_BUG_01.md` (`ac52e4e`, CI con zona horaria) | Ninguna frente a sus criterios | Roderich | **Candidato a Verified** |
| **BE #18** SYNC-06 | In Progress | `F05_SYNC_06.md`: Central 40/40; **Mobile en DEVICE: 18 PASS y 22 NOT_MEASURED** (C23 completo el 2026-10-17) | Su 10.º criterio pide registrar los 40 casos con su resultado, y se cumple. Las 22 filas son límite declarado: no se convierten en PASS ni N/A | Roderich | Cerrar con el límite declarado, o medir antes alguna fila priorizada por riesgo (p. ej. C29 Retry-After) |
| **BE #19 GATE-F05** | Pending | `F05_GATE_EVALUATION.md` (con C23). Criterios de #19: 1 en DEVICE; 2 sólo en CI (la app no puede generar C08); 3 en CI, sin «rechazada» en DEVICE; 4 por esquema cerrado | El acta no cita la base nueva. Entre `ed069a6` y `e2263b0` Sync v1 no cambió en ejecución; los mensajes de MOB #96 se probaron en HOST. **La prueba de carga no es criterio de #19** | A (nota), Roderich | Nota de regresión y `F05_GATE_DECISION.md` de Roderich |

## F06 — proyección colectiva y reconciliación

| Issue | Estado | Evidencia y SHA | Brecha real | Responsable | Condición de cierre |
|---|---|---|---|---|---|
| BE #20 | Cerrado, Verified | `F06_COLL_01.md` | Ninguna: el contrato §5 ya lleva la nota de la cobertura nueva de #126 (BE #131) | — | — |
| BE #21; MOB #32–#34 (cerrados, Partial) | — | `F06_COLL_05.md` (`3c01a16`), `F06_RECONCILIATION.md` (BE `3c01a16`, MOB `5e7ed78`), `F06-COLL-0*.md`, `F06_D4_DEVICE.md` | La regresión HOST sobre `e2263b0` + `ce5678f` da PASS y los CSV son idénticos (BE #131). Quedan sin ratificar las discrepancias en que ganó el contrato (#32 c1, #33) | Roderich | Ratificación |
| **BE #22 GATE-F06** | Pending | `GATE_F06.md`, con la actualización del 2026-10-17 (BE #131 → `30fbb56`) | Acta al día: frases corregidas, DEVICE C35 citado y regresión en PASS. Falta ratificar la reescritura **delegada** del criterio 3 («la cifra se retira») | Roderich | Decisión |

## F07 — Web de la Directiva y propuesta conjunta

La revisión por criterio la hizo la sesión B (BE #128, `F07_CIERRE_MATRIZ.md`); aquí sólo el estado.

| Issue | Estado | Brecha real | Responsable | Condición de cierre |
|---|---|---|---|---|
| BE #23 WEB-01 | **Cerrada** | Ninguna. BE #127 (`9df7888`) saca de uso la cola offline del agricultor (ADR-003), con flag de rollback y sin cambios en el API. Recorrido 25/25 en #132. El Project aún dice Evidence Pending (dry-run) | — | — |
| BE #24, #26, #27, #28 | Backlog | Satisfechos según #128; el texto de #24 debe recoger la decisión de RF-22 (sólo agregado). **El merge de #128 lo rechazó el control de permisos** y queda para Roderich | Roderich | Integrar #128 y aplicar los textos tras el dry-run |
| BE #25 WEB-03 | Backlog | Ninguna funcional: la corrección de cobertura (#126) está en `e2263b0` y la regresión F06 da PASS. Falta aplicar el texto del alcance agregado (#128) | Roderich | Aplicar el texto y cerrar |
| BE #107 POL-01 | In Review | **Validación institucional pendiente.** Paquete de decisión en #128. Las cifras reales siguen cerradas | Roderich y Directiva | Decisión real; no se supone |
| BE #108 | Cerrado (ADR-003) | — | — | CERRADO |
| **BE #29 GATE-F07** | Pending | Depende de #107 | Roderich | No pasa a Passed sin #107 |

## F08 — respaldo privado (Gate Passed para el alcance académico reducido)

| Issue | Estado | Brecha real | Responsable | Condición de cierre |
|---|---|---|---|---|
| BE #37–#39, MOB #35, #36 | Cerrados; el Project dice `Evidence = Pending` (comprobado en vivo el 2026-10-17) | De trámite: hay `F08_BACKUP.md` y `F08_MOBILE_RESTORE.md` verificables | Roderich | Pasar `Evidence` a Verified (dry-run B3) |
| BE #40 BKP-06 | Abierta, diferida | Retención, purga, proveedor, cifrado en reposo y producción. Contraste en BE #129. La issue conserva la numeración antigua F09 | B → A | Abierta con su nota, o `Post-PG` por decisión de Roderich |
| BE #41 GATE-F08 | **Passed** (académico, sintético) | El comentario del 2026-10-15 puso como dependencia MOB #55, y el acta no lo menciona: sus dos defectos ya se corrigieron en MOB #90 (`6c6a1a2`) | A | Una línea en #41 que dé la dependencia por satisfecha; **no se reabre** |
| MOB #55 REC-019 | Abierta, Partial | El cierre histórico («Done», `de44d7c`) no tiene archivo. La restauración real de una copia v7 ya está cubierta (MOB #106, `rec_019_restore_legacy_schema_test`). **Siguen sin prueba** los flujos de interfaz de exportar y restaurar e `InvoiceStorage` | Roderich | Cerrar con ese límite, o exigir esas pruebas |

## F09 — voz asistida (opcional en la línea base; incorporada a este bloque)

| Issue/PR | Estado | Implementación | Brecha real | Responsable |
|---|---|---|---|---|
| MOB PR #8 (EVO-009) | Abierto, en conflicto | Rama de septiembre, 146 commits por detrás | Sustituido por MOB #99 (cherry-picks con `-x`). Se cierra como sustituido al integrar #99 | C → A |
| MOB #13 ASR | Backlog | `docs/evolution/decisions/ADR-002-voice-transcription-engine.md` (Android SpeechRecognizer; whisper.cpp de reserva) | Evidencia de la decisión; sin buscar motores nuevos | C |
| MOB #11, #14, #15, #16 | Construidas en parte, pendientes de cierre | #99 captura, #100 núcleo/compra, #101 planificación, #104 aplicación libre y #109 conexión | Sin «Crear nuevo» por decisión D-F09-2. Aplicar un plan pendiente sigue por construir (D-F09-4); ensayo físico pendiente | C, A |
| MOB #12 | Backlog | — | **Prueba física con dictado real.** Sólo A usa el POCO. Si el segundo modelo no está disponible: NOT_MEASURED | C, A |
| MOB #10 | In Progress | — | Investigación de streaming; propuesta D-F09-1: fuera del cierre de producto | Roderich |
| MOB #58, #59 (REC) | Backlog | Banco en `benchmark/voice_benchmark` | **#59 no es verificable**: el commit `201886c` no existe y la rama híbrida no está en `main` | Roderich |
| **MOB #17 GATE-F09** | Pending | — | Depende de lo anterior y de D-F09-1…7 | Roderich |

**Propuestas de alcance de C anteriores a esta revisión (antecedente).** Quedan resueltas por la actualización de decisiones al final; se conservan para distinguir propuesta, decisión e implementación:

- **D-F09-1:** #10 fuera del cierre de producto.
- **D-F09-2:** sin catálogos nuevos desde la voz; un faltante bloquea la confirmación.
- **D-F09-3:** #14 como plan de área con dosis por hectárea.
- **D-F09-4:** #15 como aplicación libre con plan opcional.
- **D-F09-5:** holdout ciego escrito por Roderich, con hash fijado antes de medir.
- **D-F09-6:** sin un segundo modelo de teléfono, NOT_MEASURED.
- **D-F09-7:** reconocedor del sistema que puede usar Internet, con consentimiento visible.

## PR antiguos MOB #69 y #70 (antecedente anterior a las integraciones)

| PR | ¿Sustituido? | Estado | Recomendación |
|---|---|---|---|
| #69, renumeración ADR-002 en Mobile | **No**: `docs/adr/` no existe en MOB `main` | Sin conflictos; CI verde (run 38743956671). El cuerpo cita el nombre de archivo anterior al renombrado `BE-ADR-002-…` | Integrar tras corregir el cuerpo y actualizar con `main`. No se fusiona por antigüedad: aporta la referencia que falta en Mobile |
| #70, línea base REC Mobile | **No**: `REC_MOBILE_BASELINE.md` y `REC_021_CI.md` no están en `main` | Sin conflictos; CI verde (run 38743977319). Registro válido del 2026-10-15 sobre `278cbd3` (690 pruebas, igual que la CI 37231657078; los 56 del banco de voz no los ejecuta la CI). Sus «pendientes» son anteriores a #75, #79 y #90, y queda un marcador `{{ORIGEN}}` | Integrar con una **nota fechada del 2026-10-17**, sin reescribir lo registrado. Al integrarse cierra 6 issues: dry-run previo |

## Avance comunicado por la sesión A antes de esta integración (2026-10-17)

| Fase | Hecho | `main` / PR | Sigue pendiente |
|---|---|---|---|
| F03 | #76 en el POCO: sus 5 criterios PASS (P1, P2, P11–P13). Primera acta versionada de GATE-F03. Añadido a `F03_BUG_01.md` (#83) | MOB **#105** → `2df6033` | Decisión de GATE-F03 y cierre de #76 (Roderich) |
| F04 | #25/#26 construidos; en propio no se revierte actividad de terceros (`db0b10a`); menores de Liquidación (#107). Sesión física en los dos modos, sin red. #24–#27 **cerradas** con su mapeo (Done/Verified). Acta de #28: criterio 5 **Parcial** (no hay campaña por fecha efectiva) | MOB **#102** `cf3d510`, **#107** `a104971`, **#105** `2df6033` | Decisión de GATE-F04 (#28), en Validation |
| F05 | Nota de base en el acta, sin repetir mediciones | BE #130 | Decisión de #18 y #19 |
| F06 | Contrato §5 y política R9 con la cobertura nueva; acta al día. **Regresión D4 sobre `e2263b0` + `ce5678f`: PASS**, con CSV idénticos byte a byte a los del 2026-10-16 | BE **#131** → `30fbb56` | Decisión de #22; ratificar el criterio 3 |
| F07 | La Web deja de ser cliente operativo del agricultor (#23 cerrada); recorrido sobre `9df7888`: 25/25 | BE **#127** `9df7888`, **#132** `81fae93` | **BE #128 y #129:** el control de permisos rechazó su merge; quedan para Roderich. #107 institucional |
| F08 | Restauración real de una copia v7 (REC-019, requisito b) | MOB **#106** → `1e90d85` | Campos `Evidence` de F08 (dry-run B3); #55 sigue Partial (interfaz e `InvoiceStorage`) |
| F09 | Captura reconciliada (#99), núcleo y compra (#100), planificación (#101) | MOB **#99** `1a1c80f`, **#100** `e017312`, **#101** `9cd9caf` | #104 (aplicación); conexión con el shell; **prueba física con dictado real (#12)**; D-F09-1…7 |
| F10-COMPAT | #97 legible al 100 % y al 130 % (widget y POCO) | MOB **#103** → `8103766` | Cierre de #97 (Roderich). A1-F se vuelve a medir en F10 |
| REC | Línea base con nota del 2026-10-17: **#38, #41, #42 y #54 cerradas** (Verified). #52 y #57 siguen Partial (#57 se cerró por un enlace antiguo y se reabrió). Renumeración ADR-002 en Mobile | MOB **#70** `0eda364`, **#69** `e92e088` | REC parciales (#39, #43, #46–#48, #50–#53, #55–#59) |

## Versión candidata y paso a F10

La actualización siguiente registra las bases integradas verificables y los pendientes. No declara terminadas F01–F09 ni autoriza comenzar F10.


## Actualización de integración y decisiones (2026-10-17, Codex)

**Procedencia:** revisión técnica de Codex en esta conversación, bajo la delegación técnica de Roderich. No atribuye inspección personal al autor, revisión al tutor ni aprobación institucional. Las secciones históricas se conservan con su procedencia.

### Integración revisada

| PR | HEAD revisado | Merge |
|---|---|---|
| MOB #109 | `6437b7eb05fe140c31ffbd84242ccc7f299ce245` | `8a2c5589b8ca4942d7c4800a8c54a669ecc0af8e` |
| BE #128 | `f318d62a86db147c29c7e1e0287b0124a5b5c3bb` | `cab433d963eabd0351fdec4530610c5afbe7ac49` |
| BE #129 | `4c4800168522a4c78dc782fdafcfae07a41312d8` | `19a167f06ce6a5c0751eb998b87facca765db756` |

Los tres HEAD tenían sus controles completos en verde. Se revisaron los cambios de rutas, guardas, descarte y confirmación de borradores, la aceptación F07 y el contraste F08. No se ejecutó aquí Flutter, PostgreSQL ni DEVICE: la evidencia de ejecución procede de los CI y los ensayos citados, con sus SHA originales. El comentario situado encima de la función equivocada en la pantalla de compra es menor y no bloquea la integración.

**Bases de código integradas para continuar, aún no candidatas finales para F10:**
- Backend/Web: `19a167f06ce6a5c0751eb998b87facca765db756`.
- Mobile: `8a2c5589b8ca4942d7c4800a8c54a669ecc0af8e`.
- El merge documental de este PR cambiará el SHA de main del Backend; se registra aparte al integrar. Antes de compilar un ensayo hay que comprobar el CI de main correspondiente y fijar el SHA de la APK. No se reatribuyen las mediciones antiguas.

El control local de Claude rechazó operaciones de A con «Merge Without Review». No se modifica una regla general de Bash ni se autoriza a B/C a actuar como relevo para eludirlo. Esta revisión y las operaciones concretas se realizaron por Codex con la autorización del propietario; cualquier nuevo rechazo de un control debe respetarse. El texto final no publicado del worktree de A no estuvo disponible aquí: esta actualización no afirma haberlo leído ni sustituido. A debe conservar su copia y conciliarla antes de actualizar su rama, sin reset ni pérdida de cambios.

### Decisiones D-F09-1 a D-F09-7

| Decisión | Tratamiento adoptado | Consecuencia verificable |
|---|---|---|
| D-F09-1 | La investigación de streaming/C3/C2 de #10 queda fuera del cierre de producto de este bloque; se conserva como diferida | No se declara implementada ni medida. No bloquea los tres borradores de producto |
| D-F09-2 | No crear productos ni proveedores desde la voz. Un faltante bloquea confirmar; se crea por Catálogos mediante la vía manual y después se vuelve a resolver | Reducción explícita de #11/EVO-017: no se entrega creación atómica de catálogo + compra por voz. No se cierra el texto antiguo como si ese criterio se hubiera implementado |
| D-F09-3 | Planificación = área y dosis por hectárea, con cantidad requerida calculada y visible, igual que addPlanMulti | Alinear #14 con el dominio vigente sin introducir otro modelo ni esquema |
| D-F09-4 | Sí incluir la aplicación de un plan pendiente por voz, mediante selección explícita y el flujo manual existente | Requiere un PR adicional. Sólo planes pendientes de la campaña y chaco elegidos; no se autoelige entre varios. Nada cambia en plan, stock o FIFO antes de confirmar. La aplicación libre ya integrada se conserva |
| D-F09-5 | Exigir un conjunto nuevo para la aceptación exploratoria: 20 dictados nuevos (7 compra, 6 planificación, 7 aplicación) y 2 entradas sin habla; escritos por una persona que no ajustó las reglas | Código/intérprete, protocolo, expectativas, criterios y SHA-256 del conjunto se fijan antes de la primera toma. No se ajusta con él. El corpus expuesto sigue expuesto; no se presenta como ciego. Es una muestra exploratoria, no una certificación general ni un resultado ya ejecutado |
| D-F09-6 | El POCO acredita sólo el modelo realmente ensayado. HONOR queda NOT_MEASURED si no está disponible | #12 mantiene ese límite; no se declara validación en dos modelos ni se sustituye por un emulador. La excepción de Pixel/API36 ya aceptada se conserva |
| D-F09-7 | Preferencia local primero; permitir el reconocedor del sistema que podría usar Internet únicamente con consentimiento visible, una vez por sesión y sin guardarlo | EXTRA_PREFER_OFFLINE es una preferencia, no prueba de operación offline. Negarse conserva el formulario manual. Sin descargas ni servicios adicionales silenciosos; sin audio/transcripciones en logs o Central |

Estas decisiones definen alcance e instrucciones de construcción. No convierten ninguna prueba sin ejecutar en PASS y no cambian el estado de GATE-F09 ni de #12.

### Lista cerrada para continuar F01–F09

1. **F04, criterio 5:** contrastar RF-03/RF-12 y las reglas de campañas con la campaña de la fecha efectiva. Resolver la brecha de comportamiento o una contradicción contractual con decisión explícita, sin debilitar el criterio para hacer pasar el gate. Añadir pruebas de límites de fecha y de compra/aplicación multiproducto, conservación tras reabrir y ambos modos. El gate permanece Pending hasta resolverlo.
2. **F09, plan pendiente:** construir el incremento D-F09-4 con pruebas sensibles a doble confirmación, plan de otro chaco/campaña, plan ya aplicado, cancelación sin efectos y callbacks tardíos. Después, congelar el SHA Mobile final del ensayo.
3. **F09, DEVICE y holdout:** actualizar el protocolo antes de medir, ejecutar dictado real junto al POCO y los escenarios de app con datos sintéticos. El fake y el texto inyectado no prueban el reconocedor. Registrar por separado el reconocimiento crudo, las correcciones manuales y el resultado de negocio. Conservar FAIL y NOT_MEASURED.
4. **F03/F05/F06:** completar las decisiones contra las actas ya versionadas, citando sus límites, sin repetir por rutina evidencias satisfechas. Las 22 filas sin medir de #18 no cambian por esta integración; una carga concurrente no se añade como criterio nuevo de #19.
5. **F07:** reflejar las tareas técnicamente satisfechas con enlaces a #128, aplicando el dry-run de cambios de Project que corresponda. #107 requiere su validación real; no se habilitan cifras de producción. GATE-F07 sigue Pending.
6. **F08/REC:** conservar F08 Passed para su alcance académico. #40 sigue diferida/abierta para el ciclo productivo; #55 mantiene su cobertura parcial. No borrar evidencia ni declarar resueltos los REC parciales por conveniencia de seguimiento.
7. **Revisión externa:** GOV-01 registra la revisión efectiva del tutor cuando ocurra. No es una aprobación automática ni una inspección personal de Roderich atribuida por esta actualización.

F10 global sigue pospuesta. Su punto de partida será una versión candidata con las brechas anteriores resueltas o con excepciones expresamente registradas, las pruebas de fase necesarias y una decisión clara de las gates. No se deduce el cumplimiento por contar PR o tests.


## Conciliación y avance (2026-10-17, tarde, sesión A)

**Procedencia.** La sesión A escribió un texto local entre las ~15:55Z y las ~16:10Z, sobre `c5aacc8` y antes de conocer `970cb17`. Se conserva íntegro en la rama `archive/a-matriz-texto-local-20261017` (`ce8ccac`) y **no se integra tal cual**. Aquí sólo entra lo que sigue siendo cierto y no estaba arriba. Las filas antiguas se conservan como antecedente y se leen como dice esta tabla. Las correcciones de las líneas 81, 91, 108 y 127 las señaló la sesión B.

| Fila de arriba | Decía | Estado verificado el 2026-10-17 |
|---|---|---|
| REC #38, #41, #42, #52, #54, #57 (l. 81) | «sólo en MOB #70, sin integrar… cierra estas seis» | #70 está integrado (`0eda364`). #38, #41, #42 y #54 están cerradas (Verified); #52 y #57 siguen Partial. #57 se cerró por un enlace antiguo del cuerpo de #70 y se reabrió |
| BE #19 (l. 91) | «El acta no cita la base nueva… A (nota)» | La nota ya está en `F05_GATE_EVALUATION.md` (§«Nota de base», integrada con #130). Sólo falta la decisión de #18/#19: ver `F03_F05_F06_PROPUESTAS_DECISION.md` |
| BE #24, #26–#28 (l. 108) | «el merge de #128 lo rechazó… Integrar #128» | #128 está integrado (`cab433d`). Faltan los textos de `F07_PROPUESTAS_ISSUES.md` con `<SHA>` = `cab433d`: ver «F07» abajo. Las cuatro issues siguen abiertas, y #25 también |
| MOB PR #8 (l. 127) | «se cierra al integrar #99» | #99 está integrado y #8 sigue abierto: falta cerrarlo como sustituido (dry-run B10) |
| PR antiguos #69 y #70 | Recomendaciones previas | Integrados: #69 → `e92e088`; #70 → `0eda364`, con una nota del 2026-10-17 |
| BE #40 y #41 (responsable «A») | — | Las dos operaciones son del Project y quedan para Roderich: B9 (#40) y B4 (#41) |

**Mobile después de la sección «Integración revisada» de Codex:**
- MOB #108 está integrado en `1ac8ea6`: una línea del acta de GATE-F04, con la revisión de C. Su CI de `main` es la 39047491613, SUCCESS.
- Después, #109 → `8a2c558`, con CI de `main` 39050183529 SUCCESS.

### Criterio 5 de GATE-F04 (MOB #110, revisado; sin integrar)

- **Regla:** MOB `docs/evidence/F04_CAMPANA_FECHA_EFECTIVA.md`. Sus fuentes son RN-15, RN-16, RF-03, RF-07, RF-12, SRS §10.4 y Cap. III §3.11.13.
  - Una compra o aplicación se registra sólo si la única campaña que contiene el día local de su fecha es la activa.
  - Ninguna, varias, cerrada o planificada se rechazan dentro de la transacción, sin escrituras parciales.
  - El calendario no se solapa: las campañas se agregan en orden; la anterior termina el día previo sin dejar fuera compras, aplicaciones ni necesidades; cerrar pide el fin, sin fechas futuras.
  - No se migra ni se reasigna el histórico.
- **Pruebas (HOST):** 15 casos de repositorio y 4 de interfaz; 18 mutaciones detectadas.
  - Ejecución local de la sesión A sobre `f37200d`: 1421 pasan y 2 omitidas.
  - **CI** 39059483185 sobre el HEAD `0bc6848`: SUCCESS, 1420 pasan y 3 omitidas, más 17 pruebas de fechas en America/La_Paz.
- **Revisión de B:** la regla, NO LISTO en un punto, que queda declarado. El código, LISTO en `6554be7`. Los deltas `6554be7..d932e61` (CI 39058618715: 1419/3) y `d932e61..0bc6848`, LISTO. **#110 queda LISTO completo.**
- **Integración:** la sesión A intentó el merge sobre `0bc6848`. El control de permisos lo rechazó («[Merge Without Review]»). No se aplicó nada ni se eludió: queda para Roderich.
- **Sigue abierto para Roderich:**
  - **D-F04-C1:** los registros tardíos de un período cerrado se rechazan, así que **RF-03 no se cumple en esa parte**;
  - **D-F04-C2:** el período local no se compara con el central, lo que también afecta al consumo ya publicado.
  - GATE-F04 sigue Pending. Sin DEVICE.

### F07: textos de cierre (dry-run preparado, no aplicado)

El dry-run (21 filas, 26 cambios) prepara:
- cerrar #24–#28;
- añadir las actualizaciones al final de los cuerpos de #24 y #26;
- comentar #23, #29 y #107 (#29 y #107 siguen abiertos; GATE-F07, Pending);
- `Status` / `Evidence` en el Project.

Está listo, con los textos de B y `<SHA>` = `cab433d`. La orden que lo aplicaba **la rechazó el control de permisos** con «[External System Writes]». No se aplicó nada: se comprobó después en #24, #26 y #28. Tampoco se eludió. Queda para Roderich.

### Propuestas de decisión F03/F05/F06

Ver `F03_F05_F06_PROPUESTAS_DECISION.md`:
- F03 y F05: Passed académico, con residuales declarados;
- F06: Passed académico (sintético, k = 3), condicionado a ratificar los criterios 3 y 6.
Ningún gate cambia sin la decisión explícita de Roderich.
