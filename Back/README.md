# Agrocuentas Central API

Backend NestJS/Prisma/PostgreSQL para identidad, datos compartidos, proyecciones colectivas autorizadas, idempotencia y auditoría minimizada.

La fuente vigente es [`docs/scope/CURRENT_SCOPE.md`](../docs/scope/CURRENT_SCOPE.md). Los contratos centrales actuales para operaciones individuales son legacy durante una transición controlada; no constituyen el alcance objetivo.

## Desarrollo local

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`

Antes de cambiar un contrato revise la [matriz de consumidores](../docs/scope/LEGACY_CONTRACT_CONSUMERS.md), la [frontera de datos](../docs/scope/DATA_BOUNDARY_MATRIX.md) y el [plan de transición](../docs/scope/TRANSITION_PLAN.md).
