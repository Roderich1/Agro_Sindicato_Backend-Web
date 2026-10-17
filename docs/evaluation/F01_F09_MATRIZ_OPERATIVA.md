# Matriz operativa F01–F09 antes de F10

- **Fecha:** 2026-10-17. Primera versión de la sesión A de Claude Code, por la delegación técnica de Roderich del mismo día (`_briefs/PLAN_TERMINAR_F01_F09_ANTES_F10_2026-10-17.md`).
- **Naturaleza:** registro de seguimiento. **No es un acta ni cambia ningún gate.**
  - Las decisiones de gate siguen siendo de Roderich, con su confirmación explícita.
  - La revisión del tutor se registra en GOV-01 (#105).
  - Las aprobaciones institucionales no se suponen.
- **Base integrada:**
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
| F04 | MOB #28 Pending (Validation) | CONSTRUIDO_SIN_CERRAR (decisión) | #24–#27 cerradas (#102, #107). Sesión en el POCO en los dos modos. Acta propuesta: criterio 5 **Parcial** (no hay campaña por fecha efectiva). **Las REC (#38–#57) no condicionan el gate** | Roderich |
| F05 | BE #19 Pending | CONSTRUIDO_SIN_CERRAR (decisión) | Decisión sobre #18 (columna Mobile: 18 PASS y 22 NOT_MEASURED) y #19. Nota de base en el acta (este PR) | Roderich |
| F06 | BE #22 Pending | CONSTRUIDO_SIN_CERRAR (decisión) | Acta al día (con C35), contrato y política con la cobertura nueva, y **regresión D4 en PASS** sobre `e2263b0` + `ce5678f` (BE #131 → `30fbb56`). Faltan la decisión y ratificar la reescritura delegada del criterio 3 | Roderich |
| F07 | BE #29 Pending | CONSTRUIDO_SIN_CERRAR + VALIDACION_EXTERNA | #23 cerrada (BE #127 → `9df7888`; recorrido 25/25 en #132). Matriz por criterio y paquete de #107 en BE #128, **cuyo merge rechazó el control de permisos** (queda para Roderich). **#107 requiere una decisión institucional real** | Roderich, Directiva |
| F08 | BE #41 **Passed** (alcance académico reducido) | CERRADO para ese alcance + ALCANCE_DIFERIDO (#40) | #40: retención, purga, proveedor, cifrado y producción, diferidos. El contraste está en BE #129, rechazado por el control y para Roderich. MOB #55: la restauración real de una copia v7 ya está (MOB #106); sigue Partial por la interfaz e `InvoiceStorage` | Roderich |
| F09 | MOB #17 Pending | FUNCIONALIDAD_PENDIENTE (en construcción) | Captura reconciliada (MOB #99), núcleo y compra (#100), planificación (#101). Falta la aplicación (#15), la conexión con el shell y la **prueba física con dictado real (#12)**. Siete decisiones de alcance de Roderich (D-F09-1…7) | C, A (conexión y POCO), Roderich |

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
| MOB #76 (In Review) | 5 criterios: sin activar no escribe; activada sin red sigue; v7 → histórica; restaurada en otra instalación no opera; sesión ilegible no se trata como nueva | Migración v8, estados A–F, `FarmerOperationGate`, redirect (#77, #78) | `F04_ACTIVACION_TITULAR_MODO.md` y `F04_CORRECCIONES_REVISION.md` (HOST, con mutaciones) | **DEVICE de los casos negativos sin medir** (1, 3 y 5; parcial en 2 y 4) | A | Sesión física dedicada (preparada) y acta de GATE-F03 |
| MOB #83 (cerrado, Partial) | Mensaje único tras verificar | `dashboard_screen.dart` | `F03_BUG_01.md` (HOST) | **El archivo no da el SHA medido**; la observación DEVICE posterior (`5527784`) no está enlazada | A | Addendum fechado con SHA y referencia |
| MOB #87 | Correo sin autocapitalizar | Activación y reautenticación | `F03_BUG_02.md` (`5527784`, POCO) | Ninguna | — | CERRADO |
| **MOB #23 GATE-F03** | 6 criterios (#18–#22 y la primera instalación online, la operación offline y el refresh inválido) | — | 6a/6b/6c medidos en DEVICE (#19, #21, #22, #71). El bloqueo sin activar, sólo en HOST/CI | Sin acta en `docs/evidence/` | A (acta), Roderich | Acta `GATE_F03_EVALUATION.md`, Pending hasta la decisión |

## F04 — dominio y modalidades

| Issue | Criterio vigente | Implementación | Evidencia y SHA | Brecha real | Responsable | Condición de cierre |
|---|---|---|---|---|---|---|
| MOB #24 MODE-01 | Persistir la modalidad, valor por defecto, migración, un solo dominio | `operation_mode_store.dart`, `app_settings` (#77) | `F04_ACTIVACION_TITULAR_MODO.md` (`fccd74c`), `F04_CORRECCIONES_REVISION.md` (`731750e`, `8e52fe1`, `812fe49`); `f04_operation_mode_test` | **Ninguna funcional.** Discrepancia declarada y aprobada: bloquean los **datos activos** de terceros, no los «movimientos» históricos del texto antiguo. Los nombres de prueba y evidencia de la issue difieren | A | Comentario de mapeo criterio → evidencia y cierre tras el DEVICE de F04 |
| MOB #27 MODE-04 | Transiciones seguras, atómicas, sin borrar ni reasignar | `OperationModeStore.apply` (#77), carrera corregida (`731750e`) | Ídem + `f04_mode_race_test`. **Nuevo:** las reversiones en propio ya no devuelven actividad a terceros (`db0b10a`, MOB #102) | Ninguna tras #102 | A | Ídem |
| MOB #25 MODE-02 | Elección comprensible, consulta y cambio, mensajes, sin red | Pantallas `/titular` y `/modo` (#78) + **MOB #102** | `F04_MOB_MODE_02_ONBOARDING_UX.md` (`7ac7153`, HOST; 0 peticiones HTTP) | DEVICE con modo avión pendiente | A | Integrar #102, DEVICE y cierre |
| MOB #26 MODE-03 | En propio, sin transferencias ni elección de responsables; un solo dominio | **MOB #102** | `F04-MODE-03_flujos_modo_personal.md` (`7ac7153`: 1089 pasan; 15/15 mutaciones) | DEVICE pendiente | A | Ídem |
| MOB #97 (F10-COMPAT) | Títulos legibles al 100 % y al 130 % | **MOB #103** (apilado sobre #102) | `F10_COMPAT_97_LEGIBILIDAD.md` (`3257ae3`: rojo 7/8 → 8/8) | DEVICE pendiente: en el POCO el corte al 100 % venía de la fuente de MIUI | A | DEVICE y cierre. A1-F se vuelve a medir en F10 |
| MOB #73, #74 | Defectos de reversión | #75, #79 | `F04_BUG_01.md`, `F04_BUG_02.md` | Ninguna | — | CERRADO |
| **MOB #28 GATE-F04** | Regresión en ambos modos sobre CU-04…CU-10, CU-17 y CU-19; persistencia offline | — | Suites de host verdes; las de F04 nuevas en #102 | Acta | A, Roderich | Acta `gate-f04-modo-propio-compartido.md` tras #102/#103 y el DEVICE |

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
| MOB #11, #14, #15, #16 | Backlog | #99 (captura), #100 (núcleo #16 + compra #11), #101 (planificación #14) | #15 en construcción. **«Crear nuevo» de #11 no está** (propuesta D-F09-2, pendiente) | C |
| MOB #12 | Backlog | — | **Prueba física con dictado real.** Sólo A usa el POCO. Si el segundo modelo no está disponible: NOT_MEASURED | C, A |
| MOB #10 | In Progress | — | Investigación de streaming; propuesta D-F09-1: fuera del cierre de producto | Roderich |
| MOB #58, #59 (REC) | Backlog | Banco en `benchmark/voice_benchmark` | **#59 no es verificable**: el commit `201886c` no existe y la rama híbrida no está en `main` | Roderich |
| **MOB #17 GATE-F09** | Pending | — | Depende de lo anterior y de D-F09-1…7 | Roderich |

**Decisiones de alcance de F09 que C propone y Roderich no ha tomado.** Ninguna se usa como criterio de cierre mientras no se decida:

- **D-F09-1:** #10 fuera del cierre de producto.
- **D-F09-2:** sin catálogos nuevos desde la voz; un faltante bloquea la confirmación.
- **D-F09-3:** #14 como plan de área con dosis por hectárea.
- **D-F09-4:** #15 como aplicación libre con plan opcional.
- **D-F09-5:** holdout ciego escrito por Roderich, con hash fijado antes de medir.
- **D-F09-6:** sin un segundo modelo de teléfono, NOT_MEASURED.
- **D-F09-7:** reconocedor del sistema que puede usar Internet, con consentimiento visible.

## PR antiguos MOB #69 y #70

| PR | ¿Sustituido? | Estado | Recomendación |
|---|---|---|---|
| #69, renumeración ADR-002 en Mobile | **No**: `docs/adr/` no existe en MOB `main` | Sin conflictos; CI verde (run 38743956671). El cuerpo cita el nombre de archivo anterior al renombrado `BE-ADR-002-…` | Integrar tras corregir el cuerpo y actualizar con `main`. No se fusiona por antigüedad: aporta la referencia que falta en Mobile |
| #70, línea base REC Mobile | **No**: `REC_MOBILE_BASELINE.md` y `REC_021_CI.md` no están en `main` | Sin conflictos; CI verde (run 38743977319). Registro válido del 2026-10-15 sobre `278cbd3` (690 pruebas, igual que la CI 37231657078; los 56 del banco de voz no los ejecuta la CI). Sus «pendientes» son anteriores a #75, #79 y #90, y queda un marcador `{{ORIGEN}}` | Integrar con una **nota fechada del 2026-10-17**, sin reescribir lo registrado. Al integrarse cierra 6 issues: dry-run previo |

## Avance del bloque (2026-10-17, actualizado por la sesión A)

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

Se completa al final del bloque, con el SHA candidato de cada repositorio y la lista cerrada de lo que falta. Ver §«Versión candidata» cuando exista.
