# Back/AGENTS.md

## Alcance del backend

Backend NestJS para el MVP web de gestion de agroquimicos. La fuente canonica de datos es `Back/prisma/schema.prisma`.

Modulos activos del MVP:

- `iam`: autenticacion, refresh token, guards y roles.
- `users`: administracion de agricultores, directiva y administradores.
- `inventory`: productos, lotes, stock, movimientos, alertas y ajustes.
- `procurement`: proveedores, compras individuales y compras conjuntas.
- `accounts-payable`: cuentas por pagar y pagos.
- `sync`: recepcion y seguimiento de operaciones offline.

Flujo ampliado decidido:

- Campanas agricolas creadas por `DIRECTIVA` o `ADMINISTRADOR`.
- Parcelas creadas por agricultores y cultivos asignados por campana.
- Aplicaciones de agroquimicos a parcelas con salida automatica de inventario.
- FDS, categoria toxicologica y QR por producto/lote; no incluir SENASAG.
- Calendario operativo, reportes por campana y bitacora.

Antes de implementar este flujo, leer:

- `Back/docs/Flujo.md`
- `Back/docs/modelo-datos-flujo.md`
- `Back/docs/codex-backend-implementation.md`

Modulos fuera de alcance funcional actual:

- `voice-entry`: no implementar flujo de voz salvo pedido explicito.
- `demand-forecasting`: no implementar IA predictiva salvo pedido explicito.

## Patrones

- Mantener arquitectura modular por capas: `api/rest`, `application/dto`, `application/use-cases`, `domain/ports`, `infrastructure`.
- Los controladores deben ser delgados: validar entrada con DTOs, obtener `CurrentUser`, aplicar roles y delegar a use cases.
- Los use cases contienen reglas de negocio y transacciones.
- Prisma debe usarse desde repositorios o use cases existentes segun el patron local.
- Todas las consultas y escrituras deben filtrar por `tenantId`.
- Nunca aceptar `tenantId` desde DTOs expuestos al frontend.
- Usar `Decimal` de Prisma con cuidado. Convertir a `number` solo en bordes de presentacion o DTOs cuando ya sea seguro.
- Mantener `whitelist`, `forbidNonWhitelisted` y `transform` compatibles con los DTOs.

## Seguridad y roles

- Proteger endpoints con `@Roles(...)` y `JwtAuthGuard` segun el patron existente.
- `DIRECTIVA` y `ADMINISTRADOR` pueden consultar inventario global.
- Compras conjuntas solo para `DIRECTIVA` y `ADMINISTRADOR`.
- Administracion de usuarios solo para `ADMINISTRADOR`, excepto listados permitidos a directiva cuando ya exista regla.
- No registrar passwords, tokens, refresh tokens ni datos sensibles en logs.
- Mantener refresh tokens hasheados y revocables.

## Reglas de negocio criticas

- Una salida de stock no puede dejar cantidad negativa.
- Si una salida no especifica lote, usar primero el lote con vencimiento mas cercano.
- Los ajustes deben crear movimiento tipo `AJUSTE`.
- Las aplicaciones deben crear movimiento tipo `SALIDA` relacionado.
- Una campana cerrada no debe aceptar operaciones normales.
- Solo debe existir una campana activa por tenant, validado en use case.
- Las parcelas con historial deben inactivarse, no eliminarse.
- Compras a credito deben generar cuenta por pagar.
- Pagos parciales no pueden superar saldo.
- Pago total debe dejar cuenta en `PAGADA`.
- Compra conjunta debe distribuir cada item exactamente entre agricultores activos del mismo tenant.
- Operaciones offline deben ser idempotentes por `clientOperationId` y `clientId`.

## Comandos

```bash
npm run build
npm run test
npm run lint
npm run prisma:generate
npm run prisma:migrate
```

Ejecuta `npm run build` despues de cambios backend. Ejecuta `npm run test` cuando cambies reglas de negocio, DTOs, auth, Prisma o sincronizacion.
