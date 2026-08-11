# Modelo de datos para el nuevo flujo

Este documento conecta el flujo funcional de `Back/docs/Flujo.md` con el modelo Prisma. El objetivo es que las siguientes fases de backend y frontend usen las mismas entidades y reglas.

## Entidades nuevas

### `AgriculturalCampaign`

Representa una campana agricola definida por directiva o administrador.

Uso principal:

- Campana activa para compras, entradas, salidas, aplicaciones, pagos y reportes.
- Campanas cerradas para consulta historica.
- Control de apertura/cierre con bitacora.

Reglas:

- Solo debe existir una campana activa por tenant a nivel de regla de negocio.
- `DIRECTIVA` y `ADMINISTRADOR` crean, abren y cierran campanas.
- Una campana cerrada no acepta operaciones normales.

### `Plot`

Representa la parcela fisica del agricultor.

Uso principal:

- El agricultor crea y mantiene sus parcelas.
- Las parcelas con historial se inactivan, no se eliminan.

Reglas:

- La parcela pertenece a un agricultor (`ownerUserId`).
- El nombre de parcela no se repite para el mismo agricultor dentro del tenant.

### `Crop`

Catalogo de cultivos del tenant.

Uso principal:

- Permite registrar cultivos como soya, maiz, arroz, girasol, etc.
- Se usa en la asignacion de cultivos por campana.

### `PlotCropAssignment`

Relaciona parcela, campana y cultivo.

Uso principal:

- Define que cultivo tiene una parcela durante una campana.
- Permite historial de cultivos por parcela.

Regla clave:

```text
Parcela + Campana = Cultivo asignado
```

Para el MVP se permite un cultivo principal por parcela y campana mediante `@@unique([campaignId, plotId])`.

### `AgrochemicalApplication`

Registra la aplicacion de un agroquimico sobre una parcela.

Uso principal:

- Guarda campana, parcela, cultivo, producto, lote, cantidad usada, dosis, objetivo, clima y observaciones.
- Debe generar un movimiento de salida de inventario relacionado.

Reglas:

- La aplicacion pertenece a la campana activa.
- La cantidad aplicada descuenta stock.
- Si se anula, debe registrarse motivo y bitacora.

### `CalendarEvent`

Registra eventos para el calendario operativo.

Tipos soportados:

- `VENCIMIENTO_LOTE`
- `PAGO_PROXIMO`
- `APLICACION`
- `COMPRA_PROGRAMADA`
- `STOCK_BAJO`
- `CIERRE_CAMPANA`

Uso principal:

- Mostrar calendario del agricultor y calendario global de directiva.
- Relacionar eventos automaticos con su entidad origen mediante `sourceEntity` y `sourceEntityId`.

### `AuditLog`

Registra trazabilidad de acciones importantes.

Uso principal:

- Saber quien hizo una operacion, cuando, en que modulo y sobre que entidad.
- Guardar cambios importantes como ajustes, pagos, cierres de campana, inactivaciones y sincronizacion.

## Entidades existentes ampliadas

### `Product`

Ahora soporta datos de ficha tecnica del agroquimico:

- `toxicologicalCategory`
- `safetyDataSheetUrl`
- `safetyDataSheetName`
- `safetyInstructions`
- `qrCodeValue`
- `isActive`

No se incluye SENASAG en este flujo.

### `Supplier`

Ahora tiene `isActive` para inactivar proveedores sin borrar historial.

### `InventoryLot`

Ahora soporta:

- `campaignId`: campana donde se recibio o registro el lote.
- `status`: disponible, agotado, vencido o bloqueado.
- `qrCodeValue`: identificador para QR del lote.

Nota: cerrar una campana no elimina ni bloquea automaticamente el stock sobrante.

### `StockMovement`

Ahora soporta:

- `campaignId`
- `plotId`
- `cropId`
- `applicationId`
- `reasonType`

Esto permite diferenciar entrada simple, compra, aplicacion, perdida/derrame, vencimiento, prestamo/entrega, devolucion, ajuste u otro.

### `Purchase`

Ahora soporta:

- `campaignId`
- Estados adicionales: `PROGRAMADA`, `RECIBIDA_PARCIAL`, `CERRADA`.

Esto permite compras programadas y compras conjuntas con recepcion parcial.

### `PayableAccount` y `Payment`

Ahora soportan `campaignId` para reportes de deuda y pagos por campana.

### `SyncOperation`

Ahora soporta `campaignId` para asociar operaciones offline a la campana activa.

## Asociacion de campana

Por defecto, los nuevos registros operativos deben usar la campana activa del tenant:

- compras
- entradas
- salidas
- aplicaciones
- cuentas por pagar
- pagos
- eventos de calendario
- operaciones offline
- bitacora

El backend debe resolver y validar la campana. El frontend puede enviar `campaignId` solo cuando el usuario elige una campana permitida, pero nunca debe enviar `tenantId`.

## Calendario

El calendario puede llenarse desde eventos guardados o generarse desde las entidades:

- vencimiento de lote: `InventoryLot.expirationDate`
- pago proximo: `PayableAccount.dueDate`
- aplicacion registrada: `AgrochemicalApplication.appliedAt`
- compra programada: `Purchase.expectedAt`
- cierre de campana: `AgriculturalCampaign.estimatedEndDate`
- stock bajo: evento generado cuando el total cae bajo `Product.minimumStock`

Para una primera version, se puede crear `CalendarEvent` de forma automatica al registrar o actualizar la entidad origen.

## Bitacora minima recomendada

Registrar bitacora en:

- apertura y cierre de campana
- creacion/inactivacion de parcelas
- cambio de cultivo por campana
- compras individuales y conjuntas
- entradas, salidas y ajustes
- aplicaciones
- pagos
- anulaciones
- conflictos de sincronizacion

## Reportes que soporta el modelo

- inventario actual
- inventario por agricultor
- inventario por campana
- compras por campana
- compras conjuntas por estado
- aplicaciones por parcela/cultivo
- consumo por producto
- consumo por cultivo
- productos vencidos o por vencer
- cuentas por pagar por agricultor
- pagos por campana
- bitacora por usuario, agricultor o campana

## Seed inicial de Fase 0

El seed deja datos minimos para probar el flujo ampliado en un entorno local:

- tenant `default`
- usuario administrador `admin@agro.local`
- campana `Campana Inicial 2026` abierta y activa
- cultivos base: Soya, Maiz, Arroz y Girasol
- almacen general del sindicato

El seed usa `upsert` o busqueda previa para evitar duplicados cuando se ejecuta mas de una vez.

## Migracion inicial

La migracion `20260618010000_init_expanded_flow` crea el esquema completo actual desde una base vacia. Si ya existe una base local creada antes de usar migraciones, primero se debe decidir si se hara reset de desarrollo o baseline antes de aplicar migraciones Prisma.
