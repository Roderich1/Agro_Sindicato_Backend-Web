# Agrochemical Inventory API

Backend preparado para iniciar el proyecto con NestJS, Prisma, PostgreSQL y JWT, siguiendo una arquitectura modular por dominio.

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
|   |   |-- sync
|   |   |-- demand-forecasting
|   |   `-- voice-entry
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
- `sync`: operaciones offline enviadas desde Dexie y resolucion de conflictos.
- `demand-forecasting`: prediccion basica de demanda por producto y campana agricola.
- `voice-entry`: entrada por voz y normalizacion de texto para formularios.
