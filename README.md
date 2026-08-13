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

El contenedor de la API intenta `prisma migrate deploy` al iniciar. Si detecta una base local ya creada sin historial de migraciones, usa `prisma db push --skip-generate` como respaldo no destructivo y luego corre el seed idempotente.

Usuario inicial del seed:

- Email: `admin@agro.local`
- Password: `Admin123!`

Para uso local por `http://localhost:8080`, Docker configura `COOKIE_SECURE=false`. En despliegue con HTTPS cambia ese valor a `true` y ajusta `CORS_ORIGIN`.

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

Contacto:
```telefono
nombre: Rodrigo Rendon Cardenas
63526749
```
