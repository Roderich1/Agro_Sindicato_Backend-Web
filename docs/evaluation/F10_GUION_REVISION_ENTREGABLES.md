# Guion de revisión de entregables con el tutor — Agrocuentas (F10)

- **Fecha:** 2026-10-16. Actualizado el 2026-10-17 (UTC) por la sesión A de Claude Code tras el bloque de cierre técnico y evaluación.
- **Naturaleza:** una lista de comprobación para que Roderich la use al revisar con el tutor.
  - **No es un mensaje**, no se envía a nadie y no habla en nombre de Roderich ni del tutor.
  - No registra decisiones.
- **Reglas que se aplican durante la revisión:**
  - **Gates:** sólo cambian con una decisión de Roderich con confirmación explícita. GATE-F08 se registró como Passed para el alcance académico reducido por delegación técnica (ver §3). Ni este guion ni la reunión cambian otro gate.
  - **Una revisión técnica delegada no es una revisión del tutor** (sesiones A, B y C de Claude Code), ni una aprobación institucional. La revisión del tutor se registra por entregable o gate en GOV-01 (BE #105).
  - **Los datos reales y la producción siguen deshabilitados.** Toda la evidencia es sintética.

## 1. Base evaluada y PR pendientes de integrar

**Base de la evaluación:**
- BE `ed069a6`, con la Web incluida (CI 38977769791; Web 38976819643 sobre `c8cbf67`);
- MOB `dff6802` (CI 38977755502).

**Los merges de este bloque quedaron bloqueados por el control de permisos** («[Merge Without Review]»): los PR siguen abiertos para que Roderich los revise y fusione.

| ☐ | PR | Contenido | Estado de la revisión técnica | Pregunta a decidir |
|---|---|---|---|---|
| ☐ | BE #122 | Protocolo de evaluación v1.0 → v1.3 (`72a03be`, `7581af2`, `9292425`, `9bfcad2`) | Sólo documentación; Sonar verde | ¿Se fusiona? Es la versión citada por todas las series |
| ☐ | BE #124 | Decisión GATE-F08 y actas F05/F07 actualizadas (C23 completado) | Sólo documentación | ¿Se fusiona? Lleva `Closes #41` |
| ☐ | BE #125 (B) | R5 y B1/B2: herramientas y evidencia | LISTO (`7d30e58`, CI verde) | ¿Se fusiona? |
| ☐ | BE #126 (B) | Residuos de #45: compras conjuntas, eventos, H1 exacto, cobertura, proveedores, usuarios; **migración aditiva** (journal 10 → 11) | **LISTO** en `d60d0f1` (código = `8069971`; CI verde). La revisión independiente encontró 0 fugas y el coste acotado. El efecto del presupuesto por lectura sobre otras celdas ya está declarado | Si se integra, cambia el resumen colectivo y añade una migración: hay que repetir R5, W2 y W4 sobre la base nueva, en una serie aparte, y cerrar #25 tras verificarlo |
| ☐ | BE #123 (C) | Paquete de usabilidad: consentimiento, guion, tarjetas, SEQ, SUS español publicado, cálculo | Corregido tras la revisión (`b7ae14e`) | ¿Se fusiona antes del piloto? |
| ☐ | MOB #96 (C) | Mensajes de autorización (C38, 403, C23) | LISTO (`b157293`, CI verde) | Cambia la app: sólo se integra fuera de las series medidas, y fija una base nueva |
| ☐ | MOB #98 (A) | Evaluación Mobile: R1–R4/R6, compatibilidad, C23 | Sólo herramientas y evidencia | ¿Se fusiona? |

## 2. Evidencias por fase

En cada archivo hay que comprobar que tiene commit SHA, comando, salida resumida, fecha real y, si aplica, el modelo del dispositivo (CLAUDE.md, regla 1).

| ☐ | Fase | Dónde está la evidencia |
|---|---|---|
| ☐ | F02 (gate **Passed** el 2026-09-28, sólo para el alcance académico) | BE `F02_GATE_DECISION.md`, `F02_FINAL_TRACEABILITY.md`. SEC-DEP-01 (#94): confirmar su estado en GitHub |
| ☐ | F03–F04 | MOB `F03_RES_01_DEVICE.md`, `F03_BUG_0*.md`, `F04_*.md` |
| ☐ | F05 | BE `F05_SYNC_04–07.md` (§4, §4b, §4c) y `F05_GATE_EVALUATION.md`; MOB `F05_MOBILE_SYNC_DEVICE.md`, `F05_SYNC_06_DEVICE_F10.md`, `F10_C23_REANUDACION_DEVICE.md` |
| ☐ | F06 | BE `F06_COLL_0*.md`, `F06_RECONCILIATION.md`, `GATE_F06.md`; MOB `F06_D4_DEVICE.md` |
| ☐ | F07 | BE `F07_POL_01.md`, `F07_WEB.md`, `F07_GATE.md` (decisiones de #108 y #25 y hallazgos de B), `F10_SEC_02_*.md` |
| ☐ | F08 | BE `F08_GATE_DECISION.md`, `F08_GATE.md`, `F08_BACKUP.md`, `F08_BACKEND_INTEGRADO_F10.md`; MOB `F08_MOBILE_RESTORE.md` §5, `F10_RESTORE_DEVICE.md` |
| ☐ | F10, evaluación | MOB `F10_RENDIMIENTO_MOBILE.md`, `F10_COMPATIBILIDAD_MOBILE.md` + `docs/evidence/f10_eval/*.csv`; BE `F10_RENDIMIENTO_CENTRAL_WEB.md`, `F10_COMPATIBILIDAD_WEB.md` (PR #125) |

## 3. Gates

| ☐ | Gate | Estado registrado | Qué falta o qué limita | Pregunta a decidir |
|---|---|---|---|---|
| ☐ | GATE-F08 (BE #41) | **Passed para el alcance académico reducido con datos sintéticos.** Lo registró la sesión A el 2026-10-17 UTC por la delegación técnica del 2026-10-16 (`F08_GATE_DECISION.md`) | #40 abierto (proveedor, cifrado, retención, producción). Un solo modelo de teléfono; esquema más nuevo y WAL sólo en host | ¿Confirma Roderich esa decisión? ¿La revisa el tutor (GOV-01)? |
| ☐ | GATE-F05 (BE #19) | Pending | Criterios de #19: 1 y 4 evidenciados; 2 sólo en CI (C08); 3 sin «rechazada» en dispositivo. #18: **18 de 40 PASS** en dispositivo y 22 NOT_MEASURED. La prueba de carga **no** es criterio de #19 | ¿Passed, Waived parcial (con los NOT_MEASURED como límite) o medir más? |
| ☐ | GATE-F07 (BE #29) | Pending | F07-POL-01 (#107) sin resolver. #108 cerrado (ADR-003). #25: agregado decidido, sin cerrar hasta integrar la corrección de cobertura (#126) | ¿Quién aprueba #107 y cuándo? |
| ☐ | GATE-F10 (BE #49) | Pending | Rendimiento y compatibilidad técnicos medidos (§4). **Usabilidad no ejecutada.** A1-F no compatible (MOB #97). A3, A4 y A5 no ejecutadas | ¿Qué se exige para F10 en el cierre académico? |
| ☐ | GATE-F03, F04 y F06 | Pending | No cambian por cerrar F08 | Revisarlos por separado |

## 4. Resultados de la evaluación (con su alcance)

| ☐ | Requisito | Resultado | Procedencia | Límite principal |
|---|---|---|---|---|
| ☐ | RNF-06, Mobile | R1 p90 1 185 ms (≤ 4 s), R2-b 518 ms (≤ 1 s), R3 475 ms (≤ 1,5 s), R4 2 016 ms (≤ 10 s), R6 S2 subida p90 12,7 s (≤ 60 s); S1 y S3 completan y verifican: **todas CUMPLE**, 0 errores, 0 429 | DEVICE (POCO) | Un solo teléfono; batería sin lectura verificable; mitigación térmica; túnel público; un solo usuario (sin carga concurrente). R2-a se conserva aparte |
| ☐ | RNF-06, Central/Web | R5b p90 40,9 ms, R5a en frío 414,8 ms y en caliente 382,9 ms: CUMPLE | HOST | Sobre `ed069a6`. Si se integra #126, se repite |
| ☐ | RNF-08 | A1 (DEVICE) y A2 (EMULADOR), compatibles; A1-F **no** (M8, #97); B1/B2 compatibles; A3, A4 y A5 **no ejecutadas** | DEVICE, EMULADOR y HOST | **No se declara cumplido globalmente** |
| ☐ | RNF-07 | **NO EJECUTADO**: no hay participantes. El paquete de C está listo (5 agricultores + 2 Directiva + piloto) | — | Lo facilita Roderich; Claude no sustituye a participantes |
| ☐ | #18 C23 | Pausa y reanudación con un registro nuevo: PASS | DEVICE | Una sola copia en la nube previa; dos copias en un teléfono |

## 5. Pasos concretos para la revisión del autor y el tutor

1. **Revisar y fusionar en serie** los PR del §1 que se acepten: #122 → #124 → #125 → #98 → #123 → #126 → MOB #96. Comprobar el CI de `main` después de cada uno.
2. Si entra #126 o MOB #96, **fijar una base nueva** y repetir sólo lo afectado (R5/W2/W4; los mensajes de C38/403), sin mezclar series.
3. **Decidir GATE-F05** con `F05_GATE_EVALUATION.md` («Para decidir») y la tabla de criterios frente a ampliaciones.
4. **Usabilidad:**
   - conseguir 5 agricultores y 2 miembros de la Directiva y una persona para el piloto;
   - confirmar si Univalle exige un trámite;
   - ejecutar el piloto con el paquete de C;
   - fijar la versión definitiva antes de la muestra.
5. **Compatibilidad:** decidir si se corrige #97 y se repite M8 de A1-F, y si se instala la imagen de API 24 para A3. A4 y A5 sólo con equipos reales disponibles.
6. **Registrar la revisión del tutor** por entregable o gate en GOV-01 (#105), sin atribuirle lo que no revisó.
7. **Tesis:** decidir dónde se redactan los resultados de F10. La estructura estuvo congelada durante este bloque.

## 6. Al terminar, lo que registra Roderich (no Claude)

- Por cada decisión: fecha real, alcance, criterios evaluados, versiones (SHA) y riesgos aceptados, en el acta o el issue que corresponda.
- La revisión del tutor se registra en GOV-01 (BE #105).
- Los gates que no se decidan siguen en `Pending`.
