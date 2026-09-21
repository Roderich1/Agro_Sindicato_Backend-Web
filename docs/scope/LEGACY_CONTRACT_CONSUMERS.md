# Consumidores de contratos legacy

Inventario estático realizado sobre el código presente en la baseline. No valida ejecución ni autoriza cambios. Los specs indicados existen, pero no fueron ejecutados en esta revisión: `EXISTS_NOT_EXECUTED`. En Flutter no se hallaron URLs o rutas de esta API; todos sus consumos se registran como `NOT_VERIFIED`.

| Legacy endpoint/contract | Backend producer | Backend consumer | Web consumer | Flutter consumer if verifiable | Prisma models | Tests | Current payload | Private-data risk | Replacement | Responsible issue | Removal precondition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/sync/operations` GET/POST | `sync.controller.ts` + use cases | Sync module dispatches operaciones a dominios | `sync.service.ts`, `sync.page.tsx`, `offline-queue.ts` | NOT_VERIFIED | SyncOperation, SyncConflict y modelos afectados | `sync-operations.use-case.spec.ts` — EXISTS_NOT_EXECUTED | clientId, clientOperationId, type, payload, campaignId | Crítico: payload abierto puede contener dominio privado | Contrato versionado de proyección/ACK | #80, #81 | Consumidores migrados, reconciliación y escritura legacy bloqueada |
| `/inventory/*` | `inventory.controller.ts` | Inventory; compras/aplicaciones/sync | inventory service/pages, dashboard, directiva, sync | NOT_VERIFIED | Product, Warehouse, InventoryLot, StockMovement | `inventory-adjustment`, `inventory-stock`, `product-catalog` specs — EXISTS_NOT_EXECUTED | Productos, lotes, stock, movimientos, ajustes | Alto: inventario individual detallado | Agregados/declaraciones; operación en Mobile | #79, #80, #81 | Mobile migrado; Web sin CRUD; export/retención resueltos |
| `/applications/*` | `applications.controller.ts` | Applications + inventory/calendar/audit | applications service/page; reports | NOT_VERIFIED | AgrochemicalApplication, StockMovement, Plot/Crop | `applications.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Aplicación, parcela/cultivo, dosis/notas, lote | Alto: actividad agronómica privada | Registro Mobile + proyección agregada aprobada | #80, #81 | Contrato agregado y consumidores migrados |
| `/plots`, `/crops`, `/plot-crop-assignments` | controllers de plots | Plots/applications/reports | plots service/page, applications, reports, sync | NOT_VERIFIED | Plot, Crop, PlotCropAssignment | `plot-flow.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Parcela, cultivo, asignación/campaña | Alto: parcela/ubicación | Catálogo Crop central; parcela Mobile | #80, #81 | Separación de catálogo y datos privados validada |
| `/purchases`, `/suppliers` | procurement controllers | Procurement, inventory, payables, audit | procurement service/purchases page | NOT_VERIFIED | Supplier, Purchase, PurchaseItem, Allocation, Participant | `create-joint-purchase`, `create-purchase`, `list-purchases` specs — EXISTS_NOT_EXECUTED | Compra individual/conjunta, proveedor, costos, asignación | Crítico: comercial/financiero; efectos automáticos | Compra Mobile + propuesta colectiva sin efectos | #79, #80, #81 | Propuesta paralela; no creación automática; consumidores migrados |
| `/accounts-payable/*` | accounts-payable controller | Payables, procurement, sync | accounts-payable service; dashboard/directiva/purchases/sync | NOT_VERIFIED | PayableAccount, Payment | `accounts-payable.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Deuda, saldo, vencimiento y pago | Crítico: finanzas privadas | Operación Mobile; fuera de Web colectiva | #80, #81 | Export/retención y retirada de consumidores Web |
| `/reports/*` | reports controller | Consultas de múltiples módulos | reports service/page | NOT_VERIFIED | Inventory, Purchase, Application, Payable, Audit | `reports.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Reportes por agricultor/campaña/producto y deuda | Alto: agregación puede reidentificar | Reportes colectivos minimizados | #79, #80, #81 | Whitelist, autorización y pruebas de privacidad |
| `/calendar/events/*` | calendar controller | Calendar + dominios de negocio | calendar service/page | NOT_VERIFIED | CalendarEvent | `calendar-events.use-case.spec.ts` — EXISTS_NOT_EXECUTED | Eventos, estados, fechas y referencias | Medio/alto: datos operativos potencialmente privados | Sin target Live aprobado; retiro controlado | #81 | Consumidores retirados, evaluación F10 y migración nueva |

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
- **NOT_VERIFIED:** consumo Flutter de todos los endpoints anteriores; consumidores externos o desplegados fuera de estos repositorios; comportamiento en runtime.
- **EXISTS_NOT_EXECUTED:** existencia de los 15 specs anteriores; no se afirma que pasen.
