# Baseline de trazabilidad

## Cadena vigente

`Objetivo del Proyecto → CURRENT_SCOPE → URS → SRS → ADR/decisión → issue/fase → verificación futura`

Los IDs URS/SRS fueron creados en F01 como identificadores de ingeniería a partir del alcance ya aceptado. No se atribuyen al DOCX histórico y su estado `BASELINED` no implica implementación.

| Project Objective | Current scope | URS formalizados | SRS formalizados | Architecture decision | Implementation issue | Future verification |
|---|---|---|---|---|---|---|
| OE1 — analizar procesos y requisitos | Baseline, fuentes y trazabilidad | Conjunto de 12 URS F01 | Conjunto de 19 SRS F01 | ADR-001; DEC-F01-01–12 | #7, #8, #9 | REVIEW, TRACE; F11 #51 |
| OE2 — diseñar arquitectura, información, roles, interfaces, sync y recuperación | Frontera Mobile/Central/Web y decisiones delegadas | URS-SYNC-01, URS-PRIV-01, URS-BKP-01, URS-SEC-01 | SRS-IAM-01/02, SRS-DEVICE-01, SRS-SYNC-01/02, SRS-PRIV-01, SRS-BKP-01/02, SRS-TRANS-01 | ADR-001; DEC-F01-01–12 | F02/F05/F06/F09; #81 | REVIEW, CONTRACT, SECURITY, BACKUP_RESTORE |
| OE3 — implementar gestión individual Mobile | Autoridad Mobile y operación offline-first | URS-MOB-01/02/03/04, URS-VOICE-01 | SRS-MOB-01, SRS-SYNC-01/02, SRS-COLL-02, SRS-VOICE-01 | ADR-001; DEC-F01-02–07 | Mobile F03/F04/F05/F06 y PRE-VOICE; #81 | UNIT, INT, DEVICE, RECONCILIATION |
| OE4 — servicio central y Web colectiva | Proyección autorizada, Web Directiva y propuesta colectiva | URS-SYNC-01, URS-WEB-01, URS-JP-01, URS-PRIV-01, URS-SEC-01, URS-REP-01 | SRS-IAM-01/02, SRS-SYNC-01/02, SRS-COLL-01/02/03, SRS-WEB-01, SRS-JP-01/02, SRS-PRIV-01, SRS-AUDIT-01, SRS-REP-01 | ADR-001; DEC-F01-01–09/11/12 | F02/F05/F06/F07; #81 | CONTRACT, INT, E2E, SECURITY, USABILITY |
| OE5 — evaluar integración, sync, seguridad, recuperación y usabilidad | Targets de evidencia sin afirmar PASS | URS-SYNC-01, URS-PRIV-01, URS-BKP-01, URS-SEC-01, URS-REP-01 | SRS-SYNC-01/02, SRS-COLL-01/03, SRS-PRIV-01, SRS-AUDIT-01, SRS-BKP-01/02, SRS-REP-01, SRS-TRANS-01 | ADR-001; decisiones aplicables | F10/F11 | E2E, SECURITY, BACKUP_RESTORE, USABILITY, RECONCILIATION |

## Fuentes formales

- [`URS.md`](../requirements/URS.md)
- [`SRS.md`](../requirements/SRS.md)
- [`TRACEABILITY_MATRIX.md`](../requirements/TRACEABILITY_MATRIX.md)
- [`F01_INTEGRATION_DECISIONS.md`](../architecture/F01_INTEGRATION_DECISIONS.md)

La matriz detallada enlaza cada requisito con OE, decisión, fase, issue y objetivo de verificación. Esta baseline contribuye a #7/#8, pero no autoriza cerrarlos ni cambiar GATE-F01 antes del review/merge.
