# Baseline documental vigente

Esta carpeta es la fuente activa para interpretar el alcance técnico de Agrocuentas. Comience por [CURRENT_SCOPE.md](CURRENT_SCOPE.md). La presencia de código, tablas o documentos anteriores no convierte esas capacidades en requisitos vigentes.

## Jerarquía de autoridad

El Proyecto de Grado académico vigente gobierna los objetivos OE1–OE5, el alcance, las responsabilidades Mobile/Central/Web y las capacidades requeridas. Los documentos de ingeniería F01 formalizan, detallan y trazan ese alcance; no pueden crear capacidades sin sustento académico. Este [corrigendum posterior a F01](../evidence/F01_SEMANTIC_CORRIGENDUM.md) aclara formulaciones que excedían esa autoridad, sin reescribir la aceptación histórica de F01.

El código, schema, migraciones y documentación legacy describen compatibilidad o evidencia histórica: por sí solos no crean un requisito Live. Los detalles de implementación delegados a fases posteriores sólo se concretan mediante sus contratos y decisiones aprobados.

## Documentos

- [CURRENT_SCOPE.md](CURRENT_SCOPE.md): frontera Mobile/Central/Web vigente.
- [DOCUMENT_DISPOSITION_MATRIX.md](DOCUMENT_DISPOSITION_MATRIX.md): clasificación de la documentación existente.
- [CAPABILITY_DISPOSITION_MATRIX.md](CAPABILITY_DISPOSITION_MATRIX.md): destino de capacidades legacy.
- [DATA_BOUNDARY_MATRIX.md](DATA_BOUNDARY_MATRIX.md): autoridad, privacidad y proyección de datos.
- [LEGACY_CONTRACT_CONSUMERS.md](LEGACY_CONTRACT_CONSUMERS.md): productores y consumidores comprobados.
- [TRANSITION_PLAN.md](TRANSITION_PLAN.md): migración incremental y puntos de rollback.
- [TRACEABILITY_BASELINE.md](TRACEABILITY_BASELINE.md): trazabilidad vigente y vacíos abiertos.
- [ADR-001](../adr/ADR-001-mobile-individual-system-of-record.md): decisión aceptada de arquitectura target.
- [Requisitos F01](../requirements/README.md): URS/SRS baselined y matriz detallada; formalizan, no reemplazan, `CURRENT_SCOPE.md`.
- [Decisiones de integración F01](../architecture/F01_INTEGRATION_DECISIONS.md): decisiones congeladas de #8 y detalles delegados.

Los documentos marcados `HISTORICAL / OBSOLETE` se conservan como evidencia y no gobiernan trabajo nuevo.
