# Consumidores de contratos legacy

Inventario estático realizado sobre el código presente en la baseline. No valida ejecución ni autoriza cambios. Los specs indicados existen, pero no fueron ejecutados en esta revisión: `EXISTS_NOT_EXECUTED`. La [auditoría read-only de Flutter](#auditoría-read-only-de-flutter) no encontró consumidores en la revisión inspeccionada; ese resultado no demuestra ausencia histórica o futura.

| Legacy endpoint/contract | Backend producer | Backend consumer | Web consumer | Flutter consumer if verifiable | Prisma models | Tests | Current payload | Private-data risk | Replacement | Responsible issue | Removal precondition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/sync/operations` GET/POST | `sync.controller.ts` + use cases | Sync module dispatches operaciones a dominios | `sync.service.ts`, `sync.page.tsx`, `offline-queue.ts` | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | SyncOperation, SyncConflict y modelos afectados | `sync-operations.use-case.spec.ts` — EXISTS_NOT_EXECUTED | clientId, clientOperationId, type, payload, campaignId | Crítico: payload abierto puede contener dominio privado | Contrato versionado de proyección/ACK | #80, #81 | Reauditar Mobile en revisión de cutover; consumidores migrados, reconciliación y escritura legacy bloqueada |
| `/inventory/*` | `inventory.controller.ts` | Inventory; compras/aplicaciones/sync | inventory service/pages, dashboard, directiva, sync | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | Product, Warehouse, InventoryLot, StockMovement | `inventory-adjustment`, `inventory-stock`, `product-catalog` specs — EXISTS_NOT_EXECUTED | Productos, lotes, stock, movimientos, ajustes | Alto: inventario individual detallado | Agregados/declaraciones; operación en Mobile | #79, #80, #81 | Reauditar Mobile; Web sin CRUD; export/retención resueltos |
| `/applications/*` | `applications.controller.ts` | Applications + inventory/calendar/audit | applications service/page; reports | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | AgrochemicalApplication, StockMovement, Plot/Crop | `applications.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Aplicación, parcela/cultivo, dosis/notas, lote | Alto: actividad agronómica privada | Registro Mobile + proyección agregada aprobada | #80, #81 | Reauditar Mobile; contrato agregado y consumidores migrados |
| `/plots`, `/crops`, `/plot-crop-assignments` | controllers de plots | Plots/applications/reports | plots service/page, applications, reports, sync | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | Plot, Crop, PlotCropAssignment | `plot-flow.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Parcela, cultivo, asignación/campaña | Alto: parcela/ubicación | Catálogo Crop central; parcela Mobile | #80, #81 | Reauditar Mobile; separación de catálogo y datos privados validada |
| `/purchases`, `/suppliers` | procurement controllers | Procurement, inventory, payables, audit | procurement service/purchases page | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | Supplier, Purchase, PurchaseItem, Allocation, Participant | `create-joint-purchase`, `create-purchase`, `list-purchases` specs — EXISTS_NOT_EXECUTED | Compra individual/conjunta, proveedor, costos, asignación | Crítico: comercial/financiero; efectos automáticos | Compra Mobile + propuesta colectiva sin efectos | #79, #80, #81 | Reauditar Mobile; propuesta paralela, sin creación automática y consumidores migrados |
| `/accounts-payable/*` | accounts-payable controller | Payables, procurement, sync | accounts-payable service; dashboard/directiva/purchases/sync | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | PayableAccount, Payment | `accounts-payable.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Deuda, saldo, vencimiento y pago | Crítico: finanzas privadas | Operación Mobile; fuera de Web colectiva | #80, #81 | Reauditar Mobile; export/retención y retirada de consumidores Web |
| `/reports/*` | reports controller | Consultas de múltiples módulos | reports service/page | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | Inventory, Purchase, Application, Payable, Audit | `reports.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Reportes por agricultor/campaña/producto y deuda | Alto: agregación puede reidentificar | Reportes colectivos minimizados | #79, #80, #81 | Reauditar Mobile; whitelist, autorización y pruebas de privacidad |
| `/calendar/events/*` | calendar controller | Calendar + dominios de negocio | calendar service/page | `NOT_FOUND_IN_AUDITED_REVISION` (`main@521c6ee`; `PR#8@534d6b0`) | CalendarEvent | `calendar-events.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Eventos, estados, fechas y referencias | Medio/alto: datos operativos potencialmente privados | Sin target Live aprobado; retiro controlado | #81 | Reauditar Mobile; consumidores retirados, evaluación F10 y migración nueva |

## Specs encontrados

Todos los siguientes archivos están versionados y se clasifican `EXISTS_NOT_EXECUTED`:

- `Back/src/modules/accounts-payable/application/use-cases/accounts-payable.use-case.spec.ts`
- `Back/src/modules/applications/application/use-cases/applications.use-case.spec.ts`
- `Back/src/modules/audit-logs/application/use-cases/list-audit-logs.use-case.spec.ts`
- `Back/src/modules/calendar/application/use-cases/calendar-events.use-case.spec.ts`
- `Back/src/modules/campaigns/application/services/campaign-context.service.spec.ts`
- `Back/src/modules/campaigns/application/use-cases/campaign-management.use-case.spec.ts`
- `Back/src/modules/inventory/application/use-cases/inventory-adjustment.use-case.spec.ts`
- `Back/src/modules/inventory/application/use-cases/inventory-stock.use-case.spec.ts`
- `Back/src/modules/inventory/application/use-cases/product-catalog.use-case.spec.ts`
- `Back/src/modules/plots/application/use-cases/plot-flow.use-case.spec.ts`
- `Back/src/modules/procurement/application/use-cases/create-joint-purchase.use-case.spec.ts`
- `Back/src/modules/procurement/application/use-cases/create-purchase.use-case.spec.ts`
- `Back/src/modules/procurement/application/use-cases/list-purchases.use-case.spec.ts`
- `Back/src/modules/reports/application/use-cases/reports.use-case.spec.ts`
- `Back/src/modules/sync/application/use-cases/sync-operations.use-case.spec.ts`

## Verificación de consumidores

- **Verificados:** controladores Backend enumerados y servicios/páginas Web con llamadas explícitas.
- **NOT_FOUND_IN_AUDITED_REVISION:** no se encontró consumo Flutter en `main@521c6eecc0c80f8de3409330efe9134cf4868fe9` ni en `PR#8@534d6b06553ca4eac8d11c07672b9c357371e66e`; debe reauditarse el HEAD usado para cutover/removal.
- **INSUFFICIENT_EVIDENCE:** consumidores externos o desplegados fuera de estos repositorios y comportamiento runtime.
- **EXISTS_NOT_EXECUTED:** existencia de los 15 specs anteriores; no se afirma que pasen.

## Auditoría read-only de Flutter

- **Repositorio:** `Roderich1/AppMovilAgroquimico`.
- **Revisión principal:** `main@521c6eecc0c80f8de3409330efe9134cf4868fe9`, HEAD remoto verificado.
- **Revisión complementaria:** PR #8 abierta, `534d6b06553ca4eac8d11c07672b9c357371e66e`, HEAD remoto verificado.
- **Ámbito en cada revisión:** `pubspec.yaml`, `pubspec.lock`, `lib/**/*.dart`, `test/**/*.dart` e `integration_test/**/*.dart` cuando existe; `integration_test/` no existe en ninguna de las dos revisiones.
- **Búsquedas:** `package:http`, `http.Client`, `Dio`, `retrofit`, `baseUrl/base_url`, URLs HTTP(S), `dart:io`, `HttpClient`, API/REST client, socket/WebSocket y rutas `/sync`, `/inventory`, `/applications`, `/plots`, `/purchases`, `/accounts-payable`, `/reports` y `/calendar`.
- **Evidencia en `main`:** `pubspec.yaml` no declara un cliente de red directo. `pubspec.lock` registra `http`, `web_socket` y `web_socket_channel` como dependencias transitivas. Los matches de `dart:io` en `lib/` corresponden a persistencia, backup, archivos y reportes; no se encontraron imports/construcciones de cliente de red, URLs backend ni rutas contractuales.
- **Evidencia en PR #8:** conserva el mismo resultado. Las cadenas `package:http`, `HttpClient`, `WebSocket` y `https://` de `test/voice/voice_architecture_guard_test.dart` son patrones negativos del guard de arquitectura, no consumidores; tampoco se encontraron clientes, URLs backend o rutas contractuales en `lib/`.
- **Resultado por revisión:** `main@521c6ee`: `NOT_FOUND_IN_AUDITED_REVISION`; `PR#8@534d6b0`: `NOT_FOUND_IN_AUDITED_REVISION`.
- **Revisión local previa:** `fd5ce96c1b4c62285b54b038e09b13df5d5e79ee` queda clasificada `LOCAL_UNPUBLISHED_REVISION`; no se usa como evidencia autoritativa o reproducible.
- **Límite:** no equivale a “Flutter no consume Backend” en toda revisión o despliegue. Antes de bloquear/eliminar contratos, #81/F05/F06 debe reauditar el HEAD Mobile objetivo y cualquier consumidor externo.
