# Agrocuentas — Backend central y Web Directiva

Este repositorio contiene el servicio central NestJS/Prisma/PostgreSQL y la Web online-first para Directiva/Admin. El cliente del agricultor es Flutter/Mobile, offline-first, en su repositorio propio.

La fuente vigente de alcance es [docs/scope/CURRENT_SCOPE.md](docs/scope/CURRENT_SCOPE.md). El código legacy puede seguir presente durante la transición y no constituye por sí mismo un requisito.

## Frontera

`Flutter/Mobile → proyección autorizada → Backend central → Web Directiva online-first`

- Mobile: autoridad sobre la operación individual y privada.
- Backend: identidad, datos compartidos, proyección mínima, idempotencia y auditoría minimizada.
- Web: planificación, propuestas, reportes y gobierno colectivo; no CRUD operativo del agricultor.

Consulte [docs/scope/README.md](docs/scope/README.md) antes de diseñar cambios.

## Desarrollo local legacy

La ejecución local actual se conserva mientras se realiza la transición:

```bash
docker compose up --build
```

- Web: `http://localhost:8080`
- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- PostgreSQL: `localhost:5432`

Backend sin Docker:

```bash
cd Back
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Web sin Docker:

```bash
cd Web
npm install
npm run dev
```
