# Back/AGENTS.md

## Alcance

Este Backend NestJS/Prisma/PostgreSQL es el servicio central de Agrocuentas. La fuente vigente es [`docs/scope/CURRENT_SCOPE.md`](../docs/scope/CURRENT_SCOPE.md). Mobile conserva la autoridad individual; el Backend recibe proyecciones mínimas autorizadas y sirve la planificación colectiva.

Los módulos y tablas actuales de inventario, parcelas, aplicaciones, compras, cuentas, calendario y sync incluyen contratos legacy. Su existencia no autoriza expansión. Consulte `LEGACY_CONTRACT_CONSUMERS.md` y `TRANSITION_PLAN.md` antes de modificarlos.

## Reglas

- Mantener IAM, tenant, sesiones, catálogos/campañas compartidos, idempotencia y auditoría minimizada.
- No aceptar `tenantId` confiando en el cliente ni registrar secretos.
- No centralizar por defecto lotes, movimientos, pagos, notas, ubicación, fotos o relaciones familiares.
- Sync es proyección versionada y autorizada, no réplica de SQLite ni backup.
- Backup privado y metadata central tienen contratos separados.
- Una propuesta colectiva requiere decisión humana y no produce efectos individuales automáticos.
- No implementar forecasting ni F08/aportes.
- No ejecutar voz ni operaciones financieras desde transcripción.
- No eliminar un contrato/schema/migración hasta migrar consumidores y completar retención, reconciliación y rollback.

## Verificación

Cuando haya cambios de código, use los comandos del proyecto (`npm run build`, tests/lint pertinentes y Prisma sólo cuando esté autorizado). Para cambios exclusivamente documentales no presente esos tests como ejecutados.
