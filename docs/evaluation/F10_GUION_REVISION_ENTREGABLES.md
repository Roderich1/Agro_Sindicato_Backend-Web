# Guion de revisión de entregables con el tutor — Agrocuentas (F10)

- **Fecha:** 2026-10-16. Borrador preparado por la sesión A de Claude Code.
- **Naturaleza:** una lista de comprobación para que Roderich la use al revisar con el tutor.
  - **No es un mensaje**, no se envía a nadie y no habla en nombre de Roderich ni del tutor.
  - No registra decisiones.
- **Reglas que se aplican durante la revisión:**
  - **Los gates siguen en `Pending`** hasta que Roderich decida con confirmación explícita (Passed, Failed o Waived). Ni este guion ni la reunión cambian un gate por sí solos.
  - **Una revisión técnica delegada no es una revisión del tutor** (sesiones A, B y C de Claude Code), ni una aprobación institucional. La revisión del tutor se registra por entregable o gate en GOV-01 (BE #105).
  - **Los datos reales y la producción siguen deshabilitados.** Toda la evidencia es sintética.

## 1. Bases integradas

| ☐ | Qué mirar | Pregunta a decidir | Dónde está la evidencia |
|---|---|---|---|
| ☐ | Backend `main`: `e027938` (#115, #116, #114, #117) y después los merges de F10 (#118 rutas heredadas en `f9ea66a` y los siguientes) | ¿Qué SHA se fija como base de la evaluación F10? | `_briefs/ESTADO_ACTUAL.md` y `_briefs/PARALELO_CONTROL.md` §0 (runs de CI) |
| ☐ | Mobile `main` `4f203c7` (merge de #90) y los merges de F10 (rollback WAL #91, extracción #92, refresco #93) | Lo mismo. La restauración **no** debe evaluarse sobre `4f203c7` por el riesgo WAL | `_briefs/ESTADO_ACTUAL.md`; archivo de decisiones F10, «Hallazgo prioritario» |
| ☐ | BE #117 integró el acta F08 y además cambió `.gitattributes` | ¿Conforme con su integración como documentación? | Archivo de decisiones F10 (fila «BE #117») |

## 2. Evidencias por fase

En cada archivo hay que comprobar que tiene commit SHA, comando, salida resumida, fecha real y, si aplica, el modelo del dispositivo (CLAUDE.md, regla 1). **Pregunta común:** ¿la evidencia alcanza para `Evidence = Verified`, o queda `Partial`?

| ☐ | Fase | Dónde está la evidencia |
|---|---|---|
| ☐ | F02 (gate **Passed** el 2026-09-28, sólo para el alcance académico) | BE `docs/evidence/F02_GATE_DECISION.md`, `F02_FINAL_TRACEABILITY.md`. Ese registro cita SEC-DEP-01 (#94) **abierta, P1/High**; confirmar su estado actual en GitHub |
| ☐ | F03 | MOB `docs/evidence/F03_RES_01_DEVICE.md`, `F03_BUG_01.md`, `F03_BUG_02.md` |
| ☐ | F04 | MOB `docs/evidence/F04_ACTIVACION_TITULAR_MODO.md`, `F04_BUG_01.md`, `F04_BUG_02.md`, `F04_CORRECCIONES_REVISION.md` |
| ☐ | F05 | BE `docs/evidence/F05_SYNC_04.md`…`F05_SYNC_07.md` (§4b: tanda física de F10); MOB `F05_MOBILE_SYNC.md`, `F05_MOBILE_SYNC_DEVICE.md`, `F05_SYNC_08.md`, `F05_SYNC_06_DEVICE_F10.md`; plan BE `docs/testing/F05_SYNC_06_PLAN_FISICO_F10.md` (es un plan, no un resultado) |
| ☐ | F06 | BE `F06_COLL_01.md`, `F06_COLL_05.md`, `F06_RECONCILIATION.md`; MOB `F06_D4_DEVICE.md`, `F06-COLL-0*.md` y los CSV del dataset y del oráculo |
| ☐ | F07 | BE `F07_POL_01.md`, `F07_WEB.md`, `docs/architecture/F07_AGGREGATE_DISCLOSURE_POLICY.md`, `F10_SEC_02_REVISION_POLITICA.md`. Las capturas son automatizadas (Edge sin interfaz) y **nadie las revisó en persona** |
| ☐ | F08 | BE `F08_BACKUP.md`, `F08_BACKEND_INTEGRADO_F10.md`, `docs/architecture/F08_BACKUP_THREAT_MODEL.md`; MOB `F08_MOBILE_RESTORE.md` §5 |

## 3. Actas de gate en `Pending`

Todas dicen `Status = Validation` y `Gate = Pending`. Cada acta es una propuesta técnica, no una decisión.

| ☐ | Gate | Qué falta según su acta | Pregunta a decidir | Acta |
|---|---|---|---|---|
| ☐ | GATE-F03 (MOB #23) | #71 se ejecutó en el dispositivo y está cerrado (MOB #89), pero el gate no se aprobó | ¿Passed, Failed o Waived, con qué alcance? | Issue MOB #23; `VALIDACIONES_EXTERNAS.md` |
| ☐ | GATE-F04 (MOB #28) | Integrado en `main`; el gate sigue Pending | Lo mismo; confirmar el estado de #74 | Issue MOB #28; MOB `F04_CORRECCIONES_REVISION.md` |
| ☐ | GATE-F05 (BE #19) | #18: tras F10, 17 de 40 filas Mobile PASS en dispositivo, C23 parcial y 22 NOT_MEASURED; sin prueba de carga | ¿Se miden antes del gate o se aceptan como límite (Waived parcial)? | BE `docs/evidence/F05_GATE_EVALUATION.md` («Para decidir») |
| ☐ | GATE-F06 (BE #22) | Política k = 3 no aprobada (#107); las discrepancias 3 y 6 se resolvieron por delegación técnica, no por el tutor | ¿Se acepta la lectura del criterio 3 («la cifra se retira»)? | BE `docs/evidence/GATE_F06.md` |
| ☐ | GATE-F07 (BE #29) | Criterio 9: F07-POL-01 (#107) y F07-REC-01 (#108) abiertos; rutas heredadas #45/#81 (parte corregida en #118, el resto pendiente); el estado de #116 ya figura como fusionado | ¿Qué condición de salida se fija? | BE `docs/evidence/F07_GATE.md` («Estado de integración») |
| ☐ | GATE-F08 (BE #41) | Rollback WAL (#91) y extracción acotada (#92) integrados; comprobación focalizada en el POCO PASS (el teléfono no usa WAL: el defecto se demuestra en host); negativos medidos salvo esquema más nuevo; retención y purga (#40) sin plazo | ¿Se acepta ese alcance para decidir el gate? | BE `docs/evidence/F08_GATE.md` («Sigue pendiente») |

## 4. Evidencia física y sus límites

| ☐ | Qué mirar | Pregunta a decidir |
|---|---|---|
| ☐ | **Único dispositivo:** POCO X5 Pro 5G `22101320G`, Android 12 (API 31), MIUI V14.0.7.0, siempre con paquetes aislados | ¿Se declara en la tesis como límite, o se consigue un segundo modelo para RNF-08? |
| ☐ | **Medido en el dispositivo:** F03-RES-01 y C01–C04 de F05 (2026-10-15); D4 de F06; E2E de restauración F08 y la tanda 1 de #18 (2026-10-16) | ¿Basta para los criterios de cada gate? |
| ☐ | **Versión del E2E de F08:** se ejecutó con MOB `dc1b6eb` y BE `a45ab83`; la comprobación focalizada contra el Backend final `e027938` ya está hecha (`F08_BACKEND_INTEGRADO_F10.md`) y el PASS físico sigue atribuido a las versiones ejecutadas | ¿Conforme? |
| ☐ | **No medido:** 22 filas de #18 y la reanudación de C23; una copia de esquema más nuevo en el dispositivo; rendimiento; compatibilidad en otros equipos; usabilidad con personas | ¿Qué se mide antes del cierre y qué queda como limitación declarada? |
| ☐ | **Instalación limpia de `.f08bkp`:** aceptada como «condición equivalente» para #36 por delegación técnica (2026-10-16) | ¿El tutor está de acuerdo? Esa aceptación no prueba otro modelo de teléfono |

## 5. Issues abiertos (estado del 2026-10-16 según las actas y los archivos de estado; confirmar en GitHub)

| ☐ | Issue | Pregunta a decidir |
|---|---|---|
| ☐ | BE #18 (suite adversarial, columna Mobile) | ¿Qué tanda física es obligatoria y cuál se declara límite? |
| ☐ | BE #45 / #81 (rutas heredadas, transición) | ¿Qué rutas deben quedar cerradas antes de GATE-F07? |
| ☐ | BE #107 (F07-POL-01), #108 (F07-REC-01) | ¿Quién aprueba la política de divulgación? Es una validación institucional de la Directiva |
| ☐ | BE #25 y #23 (parciales) y RF-22 (sin detalle por agricultor) | ¿Se acepta el alcance agregado como decisión de alcance? |
| ☐ | BE #40 (retención, purga y huérfanos, diferidos a F10) | ¿Entra en el cierre académico o queda como limitación? |
| ☐ | MOB #36 (restauración en un teléfono nuevo) y MOB #55 | ¿Se cierra #36 tras comprobar la corrección WAL? |
| ☐ | BE #94 (SEC-DEP-01) | ¿Cuál es su estado y cómo se presenta en la tesis? |
| ☐ | BE #105 (GOV-01) | ¿Dónde y cómo registra Roderich la revisión del tutor de cada entregable? |

## 6. Protocolos de evaluación (borrador `F10_PROTOCOLOS_EVALUACION.md`)

| ☐ | Qué mirar | Pregunta a decidir |
|---|---|---|
| ☐ | Umbrales marcados como «propuesto» (R1–R6, tareas, SUS ≥ 68) | ¿Se aprueban o se cambian **antes** de medir (SRS §9.1)? |
| ☐ | Selección del piloto: dispositivos A1–A5 y navegadores B1–B4 | ¿Qué configuraciones son «las seleccionadas para el piloto» (RNF-08)? ¿De dónde sale el equipo adicional? |
| ☐ | Participantes: 5–8 agricultores (tesis §1.8.2) y 2–3 de Directiva (propuesto); el reclutamiento no se ha hecho | ¿Cuántos, cuándo, quién observa? ¿Univalle exige un trámite ético adicional? |
| ☐ | Encuadre | Las sesiones automatizadas no son usabilidad, y el cuestionario de caracterización es diagnóstico, no evaluación del producto: ¿conforme? |

## 7. Documento de tesis

- ☐ La estructura sigue congelada durante el bloque F10. §3.12 contiene la planificación de pruebas; aún no existe una sección de resultados. **Pregunta:** ¿cuándo y dónde se redactan los resultados de F10?
- ☐ La URS y la SRS v1.0 siguen como «baseline propuesta». RU-18 y RU-19 están validados sólo por la confirmación de Roderich del 15/10/2026, no por el tutor (`VALIDACIONES_EXTERNAS.md`). **Pregunta:** ¿qué validación se busca, y de quién?

## 8. Al terminar, lo que registra Roderich (no Claude)

- Por cada decisión:
  - fecha real;
  - alcance;
  - criterios evaluados;
  - versiones (SHA);
  - riesgos aceptados.

  Va en el acta o el issue que corresponda.
- La revisión del tutor se registra en GOV-01 (BE #105), sin atribuirle lo que no revisó.
- Los gates que no se decidan en la reunión siguen en `Pending`.
