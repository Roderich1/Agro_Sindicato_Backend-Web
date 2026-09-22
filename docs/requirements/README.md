# Baseline de requisitos F01

Esta carpeta formaliza el alcance vigente de Agrocuentas en identificadores de ingeniería creados durante F01. Los IDs URS/SRS de estos documentos son nuevos: no existían previamente y no se atribuyen literalmente al DOCX histórico.

La fuente de alcance continúa siendo [`CURRENT_SCOPE.md`](../scope/CURRENT_SCOPE.md). Los requisitos lo formalizan; no lo reemplazan ni acreditan implementación.

## Documentos

- [`URS.md`](URS.md): requisitos de usuario baselined.
- [`SRS.md`](SRS.md): requisitos del sistema derivados.
- [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md): OE1–OE5 → URS → SRS → decisión → issue → verificación.
- [`F01_INTEGRATION_DECISIONS.md`](../architecture/F01_INTEGRATION_DECISIONS.md): decisiones arquitectónicas que congelan la dirección y delegan el detalle implementable.

## Convención

- Estado inicial: `BASELINED`; nunca significa implementado o probado.
- Fuentes válidas: baseline vigente, ADR-001 y decisiones/issues Live.
- Los documentos `HISTORICAL / OBSOLETE` y el DOCX histórico no generan requisitos nuevos.
- La verificación futura usa objetivos explícitos como `REVIEW`, `CONTRACT`, `UNIT`, `INT`, `E2E`, `SECURITY`, `DEVICE`, `BACKUP_RESTORE`, `USABILITY` y `RECONCILIATION`.
