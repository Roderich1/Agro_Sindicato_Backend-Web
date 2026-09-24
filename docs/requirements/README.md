# Baseline de requisitos F01

Esta carpeta formaliza el alcance vigente de Agrocuentas en identificadores de ingeniería creados durante F01. Los IDs URS/SRS de estos documentos son nuevos: no existían previamente y no se atribuyen literalmente al DOCX histórico.

La autoridad de objetivos, alcance y capacidades requeridas es el Proyecto de Grado académico vigente. [`CURRENT_SCOPE.md`](../scope/CURRENT_SCOPE.md) interpreta esa autoridad y estos requisitos la formalizan y trazan; no pueden ampliarla ni acreditar implementación. El [corrigendum semántico posterior a F01](../evidence/F01_SEMANTIC_CORRIGENDUM.md) aclara sobreextensiones previas sin cambiar OE1–OE5 ni reabrir GATE-F01.

## Documentos

- [`URS.md`](URS.md): requisitos de usuario baselined.
- [`SRS.md`](SRS.md): requisitos del sistema derivados.
- [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md): OE1–OE5 → URS → SRS → decisión → issue → verificación.
- [`F01_INTEGRATION_DECISIONS.md`](../architecture/F01_INTEGRATION_DECISIONS.md): decisiones arquitectónicas que congelan la dirección y delegan el detalle implementable.

## Convención

- Estado inicial: `BASELINED`; nunca significa implementado o probado.
- Fuentes válidas: baseline vigente, ADR-001 y decisiones/issues Live.
- Los documentos `HISTORICAL / OBSOLETE` y el DOCX histórico no generan requisitos nuevos.
- Una enumeración condicional de datos privados no exige capturarlos. `Purchase` individual es válido en Mobile; `PayableAccount`/`Payment` no tienen target Live. Los detalles físicos de backup pertenecen a F09.
- La verificación futura usa objetivos explícitos como `REVIEW`, `CONTRACT`, `UNIT`, `INT`, `E2E`, `SECURITY`, `DEVICE`, `BACKUP_RESTORE`, `USABILITY` y `RECONCILIATION`.
