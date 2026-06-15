# Agrochemical Inventory API

Backend NestJS para el MVP web de gestion de agroquimicos, con Prisma, PostgreSQL y JWT, siguiendo una arquitectura modular por dominio.

## Comandos iniciales

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

La API queda en `http://localhost:3000/api/v1` y la documentacion Swagger en `http://localhost:3000/docs`.

## Docker

Desde la raiz `ProyectoPWA`:

```bash
docker compose up --build
```

El servicio `api` usa PostgreSQL del compose y ejecuta `prisma db push` al iniciar para crear el esquema inicial.

## Distribucion principal

```text
Back
|-- prisma
|   `-- schema.prisma
|-- src
|   |-- config
|   |-- shared
|   |   |-- domain
|   |   |-- application
|   |   `-- infrastructure
|   |       |-- persistence
|   |       |   `-- prisma
|   |       |-- cache
|   |       `-- observability
|   |-- modules
|   |   |-- iam
|   |   |-- inventory
|   |   |-- procurement
|   |   |-- accounts-payable
|   |   `-- sync
|   `-- bootstrap
`-- test
```

Cada modulo mantiene la misma separacion:

```text
module
|-- domain
|-- application
|   |-- use-cases
|   |-- dto
|   `-- ports
|-- infrastructure
|   `-- persistence/postgres
`-- api
    `-- rest
```

## Modulos

- `iam`: autenticacion JWT, usuarios y roles: agricultor, directiva, administrador.
- `inventory`: productos agroquimicos, almacenes y movimientos de stock.
- `procurement`: proveedores, compras e items de compra.
- `accounts-payable`: cuentas por pagar y pagos a proveedores.
- `sync`: operaciones offline enviadas desde la PWA y seguimiento de conflictos.

Fuera del alcance funcional actual del MVP salvo pedido explicito:

- `demand-forecasting`: prediccion de demanda.
- `voice-entry`: entrada por voz y normalizacion de texto para formularios.
