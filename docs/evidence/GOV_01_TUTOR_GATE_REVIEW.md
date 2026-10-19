# GOV-01 (#105): revisión del tutor de los gates F01–F09

- **Preparado por:** la sesión A de Claude Code, el 2026-10-19 (America/La_Paz), sobre Backend `main` `2a69fe6`, por el encargo de Roderich Rendón «coordinación A, revisión B y manuales C» (§7).
- **Qué es:** el registro y el material para que la revisión real del tutor **pueda hacerse** y quede anotada con su fecha.
- **Qué no es:** no registra ninguna revisión, verificación, firma ni fecha, porque **ninguna ha ocurrido**. Todos los campos de revisión están vacíos y todos los Resultados están en `Pendiente`. Un campo vacío significa «no ocurrió».
- **Este registro no cambia ningún gate** (#105, «No incluye»): ni su decisión, ni su estado, ni su campo Gate. La revisión del tutor no equivale a la aprobación del autor, y la verificación del autor no se le atribuye al tutor.

## 1. Cómo se completa

1. El tutor revisa el material de cada fila, en sus propios términos.
2. **Por cada gate revisado:**
   - se anota la **fecha real** de la revisión, que no puede ser anterior a la verificación del autor ni posterior al commit que la registra;
   - se escriben sus observaciones o el enlace a su fuente;
   - se elige el Resultado: `Conforme`, `Con observaciones`, `No conforme` o `Pendiente`.
   - Mientras haya observaciones abiertas, el Resultado no puede ser `Conforme`.
3. **La verificación del autor** va en su propia columna, con la fórmula «Verificado por Roderich Rendón (autor) el <fecha real>». Las decisiones técnicas delegadas que constan en las actas **no** se convierten en esa fórmula de forma automática.
4. **Después**, desde cada issue de gate se enlaza su fila, con un PR propio.
5. **No se retro-fecha** y no se completa nada por anticipado.

## 2. Registro

Estado de los gates leído del Project #3 el 2026-10-19; sólo informa, no se modifica.

| Gate | Issue | Estado actual del gate | Material para la revisión | Verificación del autor | Revisión del tutor (fecha real) | Observaciones | Resultado |
|---|---|---|---|---|---|---|---|
| GATE-F01 | BE #9 | Passed · Done · Verified | Comentarios del issue #9, incluido el corrigendum post-gate F01-CORR-01 (#90); `docs/architecture/F01_INTEGRATION_DECISIONS.md` | | | | Pendiente |
| GATE-F02 | BE #15 | Passed · Done · Verified | `docs/evidence/F02_GATE_EVALUATION.md` y `docs/evidence/F02_GATE_DECISION.md` | | | | Pendiente |
| GATE-F03 | Roderich1/AppMovilAgroquimico#23 | Passed · Done · Partial | Mobile `docs/evidence/GATE_F03_EVALUATION.md` y `docs/evidence/GATE_F03_DECISION.md` | | | | Pendiente |
| GATE-F04 | Roderich1/AppMovilAgroquimico#28 | Passed · Done · Partial | Mobile `docs/evidence/gate-f04-modo-propio-compartido.md` y `docs/evidence/F04_GATE_DECISION_PROPUESTA.md` (propuesta); la decisión que pasó el gate está en el cuerpo de Roderich1/AppMovilAgroquimico#28, cerrado el 2026-10-18 | | | | Pendiente |
| GATE-F05 | BE #19 | Passed · Done · Partial | `docs/evidence/F05_GATE_EVALUATION.md` y `docs/evidence/F05_GATE_DECISION.md` | | | | Pendiente |
| GATE-F06 | BE #22 | Passed · Done · Partial | `docs/evidence/GATE_F06.md` y `docs/evidence/F06_GATE_DECISION.md` | | | | Pendiente |
| GATE-F07 | BE #29 | **Pending** · Validation · Partial | `docs/evidence/F07_GATE.md`; además, la política de #107: `docs/architecture/F07_AGGREGATE_DISCLOSURE_POLICY.md`, `docs/evidence/F07_POL_01_PAQUETE_DECISION.md` y `docs/evidence/F07_POL_01_REVISION_INSTITUCIONAL.md` §5.3 | | | | Pendiente |
| GATE-F08 | BE #41 | Passed · Done · Verified (alcance académico reducido) | `docs/evidence/F08_GATE.md` y `docs/evidence/F08_GATE_DECISION.md`; ampliación del 2026-10-19: `docs/evidence/F08_BKP_07_B2_ENSAYO_REAL.md` y BE #151 (pendientes para datos reales) | | | | Pendiente |
| GATE-F09 | Roderich1/AppMovilAgroquimico#17 | Pending · Backlog · Pending (alcance opcional; F09 en pausa hasta el final) | Sin acta todavía | | | | Pendiente |

GATE-F10 (BE #49) y GATE-F11 están fuera de este registro, como indica #105.

## 3. Lo que el tutor puede querer saber antes de revisar

- **Varios gates pasaron por decisión técnica delegada de Roderich**, registrada en sus actas. Eso no es una revisión del tutor ni una validación institucional.
- **Evidence = Partial** en F03–F06 indica límites declarados en sus actas: dispositivo, cobertura y alcance académico. No indica un fallo oculto.
- **GATE-F07** está pendiente de las respuestas reales a #107: la decisión del autor para datos reales, la Directiva y el tutor (`F07_POL_01_REVISION_INSTITUCIONAL.md` §4). Una sesión de usabilidad Web satisfactoria no aprueba la política.
- **GATE-F08** es Passed sólo para el alcance académico con datos sintéticos. Lo que falta para datos reales está en BE #151.
