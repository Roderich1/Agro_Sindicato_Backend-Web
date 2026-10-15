# ADR-002: Renumeración de fases F08/F09 y retiro de aportes

- **Estado:** Aceptada
- **Fecha:** 2026-10-15
- **Autor:** Roderich Rendón
- **Relacionado:** [ADR-001](ADR-001-mobile-individual-system-of-record.md); [#37 F08-BKP-01](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/37)

## Contexto

El plan de fases del repositorio reservaba F08 para aportes/cuotas del sindicato, F09 para el respaldo privado y una fase sin número (PRE) para la voz Mobile. El alcance de la tesis de Proyecto de Grado no incluye aportes ni cuotas: [`CURRENT_SCOPE.md`](../scope/CURRENT_SCOPE.md) ya declaraba F08 fuera de alcance y los issues de aportes (BE #30–#36) están cerrados como `not planned`. Mantener un hueco en F08 y una fase PRE fuera de la secuencia dificultaba leer el plan y la trazabilidad con el Capítulo III.

## Decisión

Se retira aportes del alcance de tesis sin asignarle código de fase y se renumeran las fases vigentes para que la secuencia F01–F11 quede continua:

| Antes | Después | Contenido | Estado |
|---|---|---|---|
| F08 Aportes | (sin código F) | Aportes/cuotas del sindicato | Retirado del alcance de tesis (BE #30–#36 cerrados como not planned) |
| F09 Respaldo | F08 Respaldo privado | Backup remoto owner-scoped y restauración | En alcance PG 2026 |
| PRE Voz | F09 Voz (opcional) | Captura de voz → borrador sin efectos | En alcance PG 2026, prioridad reducida |
| F10, F11 | sin cambio | QA/evaluación; release y documentación | sin cambio |

Trazabilidad con el Capítulo III v1.5: F08 Respaldo privado cubre RF-26, RF-27 y RNF-10 (CU-14, CU-15); F09 Voz cubre RF-28 y RF-29 (CU-16). El Capítulo III v1.5 no contiene requisitos de aportes.

La renumeración no cambia el contenido, las fronteras ni las decisiones de backup y voz fijadas en ADR-001 y en F01; sólo cambia el código de fase.

## Consecuencias

Los commits, PR, issues cerrados y registros de evidencia anteriores a esta fecha conservan los nombres viejos y no se reescriben. Esta ADR es la tabla de equivalencias para leerlos:

| Nombre anterior | Nombre vigente |
|---|---|
| `F09-BKP-xx` | `F08-BKP-xx` |
| `GATE-F09` (backup) | `GATE-F08` |
| `PRE-VOICE-xx` | `F09-VOZ-xx` |
| `GATE-PRE` | `GATE-F09` |
| `F08-APO-xx` | `[RETIRADO][APO-xx]` |
| `GATE-F08` (aportes) | `[RETIRADO][GATE-APO]` |
| `PRE-VOICE/EVO` | `F09-VOZ/EVO` |
| Clase de retención `R_BACKUP_F09` | `R_BACKUP_F08` |

No existe `F09-VOZ-04`.

Un mismo código cambia de significado según la fecha: antes de 2026-10-15, `F08` y `GATE-F08` se refieren a aportes y `F09`/`GATE-F09` a backup; desde esta fecha, `F08` es backup y `F09` es voz. Ante una referencia ambigua en un documento anterior, prevalece su fecha.

La documentación vigente (`docs/scope`, `docs/requirements`, `docs/architecture` y los `AGENTS.md`) se actualiza a la nueva numeración. Los registros históricos fechados de `docs/evidence` se conservan como evidencia sin cambios. ADR-001 y [`F01_INTEGRATION_DECISIONS.md`](../architecture/F01_INTEGRATION_DECISIONS.md), que conservan sus formulaciones originales como evidencia de la decisión aceptada, sólo reciben una nota que remite a esta ADR.
