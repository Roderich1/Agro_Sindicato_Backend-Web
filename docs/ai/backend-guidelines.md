# Guia backend

## Stack

- NestJS.
- TypeScript.
- Prisma.
- PostgreSQL.
- JWT + refresh tokens.
- class-validator/class-transformer.
- Swagger.

## Convenciones de implementacion

- Controladores en `api/rest`.
- DTOs en `application/dto` o `application/dtos`.
- Use cases en `application/use-cases`.
- Puertos de dominio si el modulo ya los usa.
- Prisma en infraestructura o use cases segun patron existente.

## Checklist para un nuevo endpoint

1. Definir rol permitido.
2. Crear o reutilizar DTO.
3. Validar campos con decorators.
4. No aceptar `tenantId`.
5. Usar `@CurrentUser()` para `tenantId` y `sub`.
6. Delegar a use case.
7. Aplicar reglas en transaccion si hay multiples escrituras.
8. Retornar respuesta estable para frontend.
9. Agregar `@ApiOperation` y tags si aplica.
10. Actualizar servicios y tipos en `Web`.

## Errores esperados

Usar excepciones de NestJS:

- `BadRequestException`: validacion de negocio.
- `UnauthorizedException`: sesion invalida.
- `ForbiddenException`: rol o tenant incorrecto.
- `NotFoundException`: recurso inexistente dentro del tenant.
- `ConflictException`: duplicados o conflictos de sincronizacion.

Los mensajes deben ser utiles para la UI y no revelar secretos.

## Prisma y datos

- Toda consulta debe filtrar por `tenantId` cuando el modelo lo tiene.
- Para relaciones de agricultor usar `ownerUserId`.
- Para actor de movimiento usar `userId`.
- Para operaciones por campana usar `campaignId`, resuelto o validado por backend.
- El frontend nunca envia `tenantId`; si envia `campaignId`, el backend debe validar tenant, estado y permisos.
- Para compras conjuntas distinguir creador y participantes.
- Mantener indices utiles en `schema.prisma` si agregas consultas frecuentes.
- Evitar `any` y casts innecesarios.

## Reglas de campanas y parcelas

- `DIRECTIVA` y `ADMINISTRADOR` crean, abren y cierran campanas.
- Solo debe existir una campana activa por tenant, validado en use case.
- El agricultor no crea campanas; solo asigna cultivos a sus parcelas dentro de la campana activa.
- La parcela es fisica y estable; si tiene historial se inactiva, no se elimina.
- El cultivo se modela por `PlotCropAssignment`: parcela + campana = cultivo asignado.
- Campanas cerradas no aceptan operaciones normales; correcciones requieren motivo y bitacora.

## Reglas de inventario

- `currentQuantity` no debe quedar negativa.
- Las salidas descuentan por lote especifico o por vencimiento mas cercano.
- Alertas dependen de `minimumStock` y `expirationWarningDays`.
- Ajustes deben registrar razon suficiente para trazabilidad.
- Las compras recibidas crean lotes y movimientos de entrada.
- Las aplicaciones crean un registro de aplicacion y un movimiento `SALIDA` relacionado.
- Las salidas simples deben tener `reasonType` y motivo cuando corresponda.
- El stock sobrante continua existiendo aunque la campana se cierre.
- Los productos pueden tener FDS, categoria toxicologica, instrucciones de seguridad y QR.

## Reglas financieras

- Compra a credito genera cuenta por pagar.
- Compra al contado no debe generar deuda pendiente.
- Abono parcial no puede superar saldo.
- Pago total debe usar saldo actual.
- Estados: `PENDIENTE`, `PARCIAL`, `PAGADA`, `VENCIDA`.

## Reglas de sincronizacion

- Operaciones soportadas actuales: `INITIAL_STOCK`, `STOCK_ENTRY`, `STOCK_EXIT`.
- Nuevas operaciones del flujo deben incluir campana cuando aplique: parcelas, cultivos por campana, aplicaciones, pagos, compras programadas y eventos.
- Cada operacion debe registrar estado.
- Reenvios no deben duplicar stock.
- Conflictos deben conservar snapshot suficiente para revision.

## Calendario y bitacora

- El calendario puede materializar eventos en `CalendarEvent` o derivarlos desde lotes, pagos, aplicaciones, compras y campanas.
- Si se guarda `CalendarEvent`, usar `sourceEntity` y `sourceEntityId` para evitar duplicados.
- Registrar `AuditLog` para campanas, ajustes, aplicaciones, pagos, inactivaciones, anulaciones y conflictos de sincronizacion.

## Verificacion

```bash
npm run build
npm run test
```

Ejecutar tests especialmente si se cambia:

- Use cases.
- Prisma schema.
- DTOs.
- Guards.
- Sincronizacion.
- Compras o pagos.
