# Guia Codex para implementar el flujo backend

Esta guia convierte el flujo decidido en una ruta de implementacion para Codex. Debe usarse antes de pedir cambios grandes al backend.

La idea es trabajar por fases pequenas, verificables y con contratos claros. No se debe pedir "implementa todo el backend" en una sola tarea, porque el flujo toca Prisma, DTOs, use cases, permisos, sincronizacion, reportes y pruebas.

## Principios de trabajo con Codex

Cada solicitud a Codex debe incluir:

- Objetivo: que modulo o flujo se quiere construir.
- Contexto: archivos y documentos relevantes.
- Restricciones: roles, tenant, campana activa, offline, reglas de negocio.
- Terminado cuando: build, tests y comportamiento esperado.

Para cambios grandes, primero pedir plan. Para implementacion, usar una fase por tarea.

Plantilla recomendada:

```text
Objetivo:
Implementa la fase X del backend: <nombre de fase>.

Contexto:
- Back/docs/Flujo.md
- Back/docs/modelo-datos-flujo.md
- Back/docs/codex-backend-implementation.md
- Back/prisma/schema.prisma
- Back/AGENTS.md

Restricciones:
- No aceptar tenantId desde DTOs.
- Resolver tenantId desde JWT.
- Validar roles con guards.
- Mantener controladores delgados y reglas en use cases.
- Agregar o actualizar pruebas.
- No tocar frontend salvo que se pida.

Terminado cuando:
- npm run prisma:generate si cambia Prisma.
- npm run build.
- npm run test si cambia logica de negocio.
- Swagger mentalmente consistente con los DTOs.
- Documentacion actualizada si cambia contrato o regla.
```

## Orden recomendado

### Fase 0. Preparacion de base de datos

Objetivo:

- Crear migracion Prisma para el esquema ampliado.
- Revisar que la migracion no borre datos existentes.
- Sembrar datos minimos si hace falta.

Archivos probables:

- `Back/prisma/schema.prisma`
- `Back/prisma/seed.ts`
- `Back/docs/modelo-datos-flujo.md`

Reglas:

- No cambiar `tenantId` ni aceptar `tenantId` desde cliente.
- Los campos nuevos en entidades existentes deben ser opcionales o tener default si afectan datos existentes.
- Validar que los enums nuevos no rompan use cases actuales.

Verificacion:

```bash
cd Back
npm run prisma:generate
npm run build
npm run test
```

Done:

- Prisma genera cliente.
- Backend compila.
- Tests actuales pasan.

### Fase 1. Infraestructura transversal de campana activa

Objetivo:

- Crear servicio/use case para obtener campana activa del tenant.
- Centralizar validacion de campana abierta/cerrada.
- Preparar helpers para asociar `campaignId` por defecto.

Archivos probables:

- `Back/src/modules/campaigns`
- `Back/src/modules/common` si existe o helpers compartidos locales
- Modulos que luego consumiran campana activa

Reglas:

- Solo `DIRECTIVA` y `ADMINISTRADOR` pueden abrir/cerrar campanas.
- Solo debe existir una campana activa por tenant, validado en transaccion.
- Campana cerrada bloquea operaciones normales.
- Si una operacion recibe `campaignId`, validar que pertenece al tenant.

Pruebas minimas:

- Crear campana.
- Abrir campana y cerrar campana anterior si se decide comportamiento automatico.
- Rechazar abrir dos campanas activas.
- Rechazar operaciones sobre campana cerrada.

### Fase 2. Modulo de campanas

Objetivo:

- Implementar endpoints de campanas.
- Permitir crear, listar, abrir, cerrar y consultar resumen basico.

Endpoints sugeridos:

- `GET /campaigns`
- `GET /campaigns/active`
- `POST /campaigns`
- `PATCH /campaigns/:id`
- `POST /campaigns/:id/open`
- `POST /campaigns/:id/close`

Roles:

- `AGRICULTOR`: consultar campanas y campana activa.
- `DIRECTIVA`, `ADMINISTRADOR`: crear, editar, abrir y cerrar.

Reglas:

- Abrir campana debe registrar bitacora.
- Cerrar campana debe registrar bitacora.
- Campana cerrada queda disponible para reportes.

### Fase 3. Parcelas, cultivos y asignacion por campana

Objetivo:

- Implementar parcelas del agricultor.
- Implementar catalogo simple de cultivos.
- Implementar asignacion cultivo/parcela/campana.

Endpoints sugeridos:

- `GET /plots`
- `POST /plots`
- `PATCH /plots/:id`
- `POST /plots/:id/deactivate`
- `GET /crops`
- `POST /crops`
- `PATCH /crops/:id`
- `GET /plot-crop-assignments`
- `POST /plot-crop-assignments`
- `PATCH /plot-crop-assignments/:id`

Roles:

- `AGRICULTOR`: CRUD de sus parcelas, asignar cultivos a sus parcelas en campana abierta.
- `DIRECTIVA`, `ADMINISTRADOR`: consultar por agricultor; crear cultivos si se decide catalogo administrado.

Reglas:

- Parcela con historial se inactiva, no se elimina.
- Una parcela tiene un cultivo principal por campana.
- El agricultor no crea campanas.
- Directiva no modifica parcelas privadas salvo flujo de asistencia administrativa explicito.

Pruebas minimas:

- Agricultor no ve parcelas de otro agricultor.
- Directiva consulta parcelas por tenant.
- No duplicar nombre de parcela para el mismo agricultor.
- No asignar cultivo en campana cerrada.

### Fase 4. Catalogo de agroquimicos, FDS, toxicologia y QR

Objetivo:

- Ampliar catalogo de productos con FDS, categoria toxicologica, instrucciones de seguridad y QR.

Archivos probables:

- `Back/src/modules/inventory/application/dto/product-catalog.dto.ts`
- `Back/src/modules/inventory/application/use-cases/product-catalog.use-case.ts`
- `Back/src/modules/inventory/api/rest/inventory.controller.ts`

Reglas:

- No incluir SENASAG.
- Inactivar productos con historial, no borrarlos.
- QR puede ser un valor generado por backend o guardado como identificador estable.
- FDS puede guardarse inicialmente como URL/nombre, no requiere carga de archivos si no esta implementado.

Pruebas minimas:

- Crear producto con FDS/toxicologia.
- Actualizar datos tecnicos.
- Rechazar QR duplicado dentro del tenant.

### Fase 5. Inventario con campana y motivos de movimiento

Objetivo:

- Asociar entradas, salidas, ajustes y lotes a campana.
- Usar `reasonType` para clasificar movimientos.
- Mantener reglas existentes de stock.

Archivos probables:

- `Back/src/modules/inventory/application/dto`
- `Back/src/modules/inventory/application/use-cases/inventory-stock.use-case.ts`
- `Back/src/modules/inventory/application/use-cases/inventory-adjustment.use-case.ts`

Reglas:

- Salida no deja stock negativo.
- Si no se especifica lote, usar lote con vencimiento mas cercano.
- Entrada simple debe pedir motivo.
- Ajuste debe pedir motivo y registrar bitacora.
- Nuevas operaciones usan campana activa por defecto.
- Stock sobrante continua aunque se cierre campana.

Pruebas minimas:

- Entrada simple con campana activa.
- Salida simple con motivo.
- Ajuste positivo/negativo con bitacora.
- Rechazar movimiento normal en campana cerrada.

### Fase 6. Aplicaciones de agroquimicos

Objetivo:

- Crear modulo de aplicaciones.
- Registrar aplicacion a parcela/cultivo/campana.
- Generar movimiento `SALIDA` relacionado.

Endpoints sugeridos:

- `GET /applications`
- `POST /applications`
- `GET /applications/:id`
- `POST /applications/:id/cancel`

Roles:

- `AGRICULTOR`: registrar y consultar sus aplicaciones.
- `DIRECTIVA`, `ADMINISTRADOR`: consultar aplicaciones globales.

Reglas:

- Validar que la parcela pertenece al agricultor.
- Validar que la parcela tiene cultivo asignado en la campana.
- Descontar stock en la misma transaccion.
- Crear evento de calendario tipo `APLICACION`.
- Registrar bitacora.
- Anulacion debe tener motivo.

Pruebas minimas:

- Aplicacion descuenta stock.
- Aplicacion genera movimiento `SALIDA`.
- No aplicar sobre parcela de otro agricultor.
- No aplicar en campana cerrada.

### Fase 7. Compras individuales y conjuntas por campana

Objetivo:

- Asociar compras a campana.
- Soportar compras programadas y recepcion parcial.
- Mantener compras a credito con cuentas por pagar.

Archivos probables:

- `Back/src/modules/procurement`
- `Back/src/modules/accounts-payable`

Reglas:

- Compra individual del agricultor usa campana activa.
- Compra conjunta solo `DIRECTIVA` y `ADMINISTRADOR`.
- Compra conjunta distribuye items exactamente entre agricultores activos del tenant.
- Compra a credito genera cuenta por pagar.
- Compra programada crea evento de calendario.
- Recepcion genera lotes y movimientos de entrada.

Pruebas minimas:

- Compra individual con campana activa.
- Compra conjunta distribuye cantidades exactas.
- Credito genera cuenta por pagar con `campaignId`.
- Compra programada aparece en calendario.

### Fase 8. Cuentas por pagar y pagos por campana

Objetivo:

- Asociar cuentas y pagos a campana.
- Generar eventos de pagos proximos.

Reglas:

- Pago parcial no supera saldo.
- Pago total deja cuenta `PAGADA`.
- Cuenta vencida queda `VENCIDA`.
- Directiva puede registrar pagos de compras conjuntas si administra cobro.

Pruebas minimas:

- Pago parcial actualiza estado.
- Pago total cierra cuenta.
- No pagar mas que saldo.
- Reportar deudas por agricultor y campana.

### Fase 9. Calendario operativo

Objetivo:

- Exponer calendario por agricultor y global para directiva.
- Crear eventos automaticos desde entidades origen.

Endpoints sugeridos:

- `GET /calendar/events`
- `POST /calendar/events/:id/complete`
- `POST /calendar/events/:id/cancel`

Eventos:

- vencimiento de lote
- pago proximo
- aplicacion
- compra programada
- stock bajo
- cierre de campana

Reglas:

- Agricultor ve eventos propios.
- Directiva ve eventos globales.
- Usar `sourceEntity` y `sourceEntityId` para no duplicar eventos automaticos.

### Fase 10. Reportes backend

Objetivo:

- Implementar consultas agregadas listas para frontend.
- No empezar por PDF/Excel si aun no hay datos confiables.

Reportes sugeridos:

- inventario actual
- inventario por campana
- inventario por agricultor
- compras por campana
- compras conjuntas
- aplicaciones por parcela/cultivo
- consumo por producto
- consumo por cultivo
- productos vencidos/proximos
- cuentas por pagar y pagos
- bitacora por campana

Reglas:

- Reportes de agricultor filtran `ownerUserId`.
- Reportes de directiva filtran tenant y pueden agrupar por agricultor.
- Evitar calculos duplicados en frontend.

### Fase 11. Bitacora

Objetivo:

- Centralizar escritura y consulta de `AuditLog`.

Endpoints sugeridos:

- `GET /audit-logs`

Reglas:

- Agricultor no necesita ver toda la bitacora.
- Directiva/administrador pueden filtrar por agricultor, campana, entidad o accion.
- Registrar cambios importantes, no cada lectura.

### Fase 12. Sincronizacion offline ampliada

Objetivo:

- Extender `sync` para recibir nuevas operaciones que la PWA guardo offline.
- Mantener claro que el backend siempre opera online; la capacidad offline pertenece a la Web/PWA.
- Al volver la conectividad, la PWA envia su cola local a `POST /sync/operations`.

Operaciones candidatas:

- `PLOT_CREATE`
- `PLOT_UPDATE`
- `PLOT_DEACTIVATE`
- `PLOT_CROP_ASSIGN`
- `STOCK_ENTRY`
- `STOCK_EXIT`
- `AGROCHEMICAL_APPLICATION`
- `PAYMENT_CREATE`

Reglas:

- El backend no debe depender de estado local del navegador ni intentar trabajar sin base de datos.
- La PWA debe generar `clientOperationId` unico por operacion y conservar un `clientId` estable por dispositivo/navegador.
- Idempotencia por `clientOperationId`/`clientId`.
- Asociar `campaignId` cuando aplique.
- Rechazar operaciones de campana cerrada con error claro.
- Guardar conflictos con snapshot suficiente.
- La PWA elimina de su cola local solo operaciones aplicadas o duplicadas ya aplicadas.
- Si el backend devuelve `CONFLICTO` o `RECHAZADA`, la PWA debe conservar o marcar la operacion para revision del usuario.

Pruebas minimas:

- Reenvio no duplica stock.
- Aplicacion offline no descuenta dos veces.
- Conflicto queda consultable.

## Secuencia de prompts recomendada

Usar estos prompts en orden, uno por hilo o por tarea claramente separada:

```text
Planifica la implementacion de la fase 1 del backend usando Back/docs/codex-backend-implementation.md. No edites codigo todavia; quiero el plan, riesgos y pruebas.
```

```text
Implementa la fase 1 del backend. Sigue Back/AGENTS.md y Back/docs/codex-backend-implementation.md. Ejecuta npm run build y npm run test.
```

```text
Revisa los cambios de la fase 1 como code review. Prioriza bugs, permisos, tenantId, campana cerrada y pruebas faltantes.
```

Luego repetir para cada fase.

## Criterios globales de terminado

El backend del flujo se considera completo cuando:

- Existen endpoints para campanas, parcelas, cultivos, aplicaciones, calendario, reportes y bitacora.
- Compras, entradas, salidas, ajustes, cuentas y pagos soportan campana.
- Aplicaciones descuentan stock y generan movimiento.
- FDS, categoria toxicologica y QR estan disponibles en producto/lote.
- Agricultor solo opera datos propios.
- Directiva consulta datos globales y opera compras conjuntas/campanas.
- No se acepta `tenantId` desde frontend.
- Campanas cerradas bloquean operaciones normales.
- Operaciones offline nuevas son idempotentes.
- Swagger refleja DTOs nuevos.
- Tests cubren reglas criticas.
- `npm run build` y `npm run test` pasan.

## Checklist antes de cerrar cada fase

- Revisar diff.
- Confirmar que no se tocaron archivos no relacionados.
- Confirmar roles y guards.
- Confirmar filtro por `tenantId`.
- Confirmar filtro por `ownerUserId` para agricultor.
- Confirmar reglas de campana abierta/cerrada.
- Confirmar transacciones en escrituras multiples.
- Confirmar mensajes de error utiles para frontend.
- Actualizar documentacion si cambio el contrato.
