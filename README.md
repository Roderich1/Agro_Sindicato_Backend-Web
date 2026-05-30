# Proyecto PWA Agroquimicos

Monorepo con frontend React/Vite PWA y backend NestJS/Prisma/PostgreSQL.

## Levantar con Docker

```bash
docker compose up --build
```

Servicios:

- Web PWA: `http://localhost:8080`
- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- PostgreSQL: `localhost:5432`

El contenedor de la API ejecuta `prisma db push` al iniciar para crear el esquema inicial en PostgreSQL.

## Levantar sin Docker

Backend:

```bash
cd Back
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Frontend:

```bash
cd Web
npm install
npm run dev
```
