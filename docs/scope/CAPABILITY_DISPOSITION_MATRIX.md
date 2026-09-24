# Matriz de disposición de capacidades

La matriz distingue comportamiento existente de alcance objetivo. `REFACTOR_SCOPE`, `MOVE_TO_MOBILE_RESPONSIBILITY` y `REMOVE_FROM_LIVE_SCOPE` no autorizan cambios de código en esta PR. F10 verifica cambios; no se usa como fase genérica de implementación.

`Purchase` individual es una capacidad Mobile válida; `PayableAccount` y `Payment` son legacy sin target Live aprobado. La existencia de una compra no crea requisitos de deuda, pagos o contabilidad. Lotes y movimientos son detalles técnicos condicionales, no capacidades académicas independientes.

| Capability | Current owner | Current behavior | Target owner | Target behavior | Disposition | Reason | Related OE | Related issue | Implementation phase |
|---|---|---|---|---|---|---|---|---|---|
| iam | Backend | JWT, refresh y roles | Backend | Identidad y sesión central | KEEP_AND_HARDEN | Responsabilidad central | OE2/OE4 | #8, #81 | F02 |
| users | Backend/Web | CRUD de usuarios/roles | Backend/Web Admin | Account y membresía formalizados | REFACTOR_SCOPE | Separar Account/Member/Person | OE2/OE4 | #80, #81 | F02; exposición Web en F07 |
| campaigns | Backend/Web | Campaña central y operativa | Backend/Web Directiva; Mobile usa cache de contexto | Campaña compartida autoritativa; Mobile opera offline con ese contexto | REFACTOR_SCOPE | No crear autoridad de campaña personal/local | OE2/OE4 | #79, #81 | F06/F07 |
| sync | Backend/Web | Cola PWA de operaciones privadas | Mobile/Backend | Proyección mínima idempotente | REFACTOR_SCOPE | Sync no replica dominio privado | OE2/OE4 | #80, #81 | F05; evaluación en F10 |
| audit-logs | Backend/Web | Auditoría amplia | Backend/Web | Auditoría central minimizada | KEEP_AND_HARDEN | Trazabilidad con privacidad | OE4/OE5 | #80, #81 | F06; evaluación en F10 |
| reports | Backend/Web | Reportes operativos individuales y globales | Backend/Web Directiva | Sólo agregados autorizados | REFACTOR_SCOPE | Limitar exposición privada | OE4/OE5 | #79, #80, #81 | F06/F07; evaluación en F10 |
| procurement | Backend/Web | Compra individual y conjunta con efectos | Mobile; propuesta central | Compra individual local; propuesta colectiva sin efectos | REFACTOR_SCOPE | Separar decisión de ejecución | OE3/OE4 | #79, #81 | #81 + F06/F07; verificar en F10 |
| inventory | Backend/Web | CRUD individual central | Mobile | Registro individual local; sólo proyección aprobada | MOVE_TO_MOBILE_RESPONSIBILITY | Mobile es autoridad | OE3/OE4 | #79, #80, #81 | #81 + F06/F07; cutover después de F10 |
| applications | Backend/Web | Aplicación y salida central | Mobile | Aplicación local; sólo proyección aprobada | MOVE_TO_MOBILE_RESPONSIBILITY | Dato operativo privado | OE3/OE4 | #79, #80, #81 | #81 + F06/F07; cutover después de F10 |
| plots | Backend/Web | CRUD de parcelas/cultivos | Mobile | Parcela local; sólo proyección necesaria | MOVE_TO_MOBILE_RESPONSIBILITY | Privacidad y autoridad | OE3/OE4 | #79, #80, #81 | #81 + F06/F07; cutover después de F10 |
| accounts-payable | Backend/Web legacy | Deuda y pagos individuales centrales | Ninguno Live aprobado | Retiro controlado del alcance Live | REMOVE_FROM_LIVE_SCOPE | El PG no exige cuentas por pagar ni pagos | N/A | #81, #90 | #81; retirar después de consumidores, evidencia y retención aplicables |
| calendar | Backend/Web | Eventos operativos individuales | Ninguno Live aprobado | No existe target Live verificable | REMOVE_FROM_LIVE_SCOPE | El legacy no constituye requisito | N/A | #81 | #81 + F06/F07; retiro después de F10 |
| demand-forecasting | Prisma/placeholder | Modelo legacy, sin requisito vigente | Ninguno Live | No implementar forecasting | REMOVE_FROM_LIVE_SCOPE | Fuera del alcance explícito | N/A | #79, #81 | #81; retiro mediante migración nueva después de F10 |
| voice-entry | Mobile | Trabajo PRE-VOICE/EVO existente | Mobile | Captura opcional: draft editable y confirmación | KEEP_AND_HARDEN | Entrada individual segura | OE3 | AppMovil #10–#17; EVO-009 | PRE-VOICE/EVO; no F04 |
| dashboard (Web) | Web | Resumen también operativo | Web Directiva | Resumen colectivo autorizado | REFACTOR_SCOPE | Web no es cliente agricultor | OE4 | #79, #81 | F07 |
| directiva (Web) | Web | Inventario global/deudas/compras | Web Directiva | Planificación y propuesta colectiva | REFACTOR_SCOPE | Minimización y no efectos automáticos | OE4 | #79, #80 | F07 |
| inventory (Web) | Web | CRUD operativo | Ninguno Web; Mobile opera | Retirar del alcance Live Web | REMOVE_FROM_LIVE_SCOPE | Autoridad móvil | OE3/OE4 | #81 | #81 + F07; retiro después de F10 |
| purchases (Web) | Web | Compra y pago individual legacy | Mobile para Purchase; Web Directiva para propuesta | Retirar operación individual Web; Payment no tiene target Live | REFACTOR_SCOPE | Separar compra válida de pago legacy y propuesta | OE3/OE4 | #81, #90 | #81 + F07; verificar en F10 |
| applications (Web) | Web | CRUD operativo | Ninguno Web; Mobile opera | Retirar del alcance Live Web | REMOVE_FROM_LIVE_SCOPE | Autoridad móvil | OE3/OE4 | #81 | #81 + F07; retiro después de F10 |
| plots (Web) | Web | CRUD operativo | Ninguno Web; Mobile opera | Retirar del alcance Live Web | REMOVE_FROM_LIVE_SCOPE | Autoridad móvil | OE3/OE4 | #81 | #81 + F07; retiro después de F10 |
| campaigns (Web) | Web | Gestión central | Web Directiva | Gestión de campañas compartidas | KEEP_AND_HARDEN | Capacidad colectiva | OE4 | #79 | F07 |
| calendar (Web) | Web | Eventos individuales | Ninguno Live aprobado | Retirar módulo y navegación Live | REMOVE_FROM_LIVE_SCOPE | No existe requisito vigente verificable | N/A | #81 | #81 + F07; retiro después de F10 |
| reports (Web) | Web | Reportes individuales/globales | Web Directiva | Agregados autorizados | REFACTOR_SCOPE | Minimización | OE4/OE5 | #80 | F07; evaluación en F10 |
| sync (Web) | Web | Administra cola offline | Web Directiva | Sólo estado de última sync | REFACTOR_SCOPE | Outbox pertenece a Mobile | OE2/OE4 | #80, #81 | F05/F07; evaluación en F10 |
| audit (Web) | Web | Consulta de bitácora | Web Directiva/Admin | Auditoría autorizada | KEEP_AND_HARDEN | Gobierno y evidencia | OE4/OE5 | #80 | F07; evaluación en F10 |
| users (Web) | Web | Administración de usuarios | Web Admin | Cuentas, vínculos y membresía | REFACTOR_SCOPE | Modelo aún TBD | OE2/OE4 | #80 | F02/F07 |
| offline queue (Web) | Web | Cola `localStorage` de operaciones (`agro_offline_queue_v2/v1`) | Mobile | Eliminar del alcance Live Web | REMOVE_FROM_LIVE_SCOPE | Web online-first | OE2/OE3 | #81 | #81 + F07; retiro después de F10 |
| PWA/service worker | Web | Instalación/cache/offline | Web | Conveniencia técnica, no operación offline | REFACTOR_SCOPE | PWA no implica autoridad individual | OE4 | #81 | F07 |
| Tenant/User/RefreshToken | Prisma | Identidad central | Backend | Conservar y formalizar membresía | KEEP_AND_HARDEN | Base central necesaria | OE2/OE4 | #80 | F02 |
| Product/Crop/Campaign | Prisma | Catálogos y campaña | Backend | Catálogos/campaña compartidos | KEEP_AND_HARDEN | Datos colectivos | OE2/OE4 | #80 | F06 |
| Plot/Application | Prisma | Operación individual central legacy | Mobile cuando corresponda | Compatibilidad temporal; migrar autoridad individual | MOVE_TO_MOBILE_RESPONSIBILITY | Frontera privada | OE3/OE4 | #80, #81 | #81 + F06/F07; retiro después de F10 |
| InventoryLot/StockMovement | Prisma | Detalles operativos centrales legacy | Detalle técnico Mobile sólo si el flujo aprobado lo necesita | No son capacidades académicas independientes | REFACTOR_SCOPE | Implementación condicional de inventario/stock | OE3 | #81, #90 | #81; evaluar consumidores antes de retiro |
| Purchase | Prisma | Compra individual y efectos de compra conjunta legacy | Mobile para compra individual; Central/Web para propuesta | Separar operación individual de propuesta sin efectos automáticos | REFACTOR_SCOPE | Compra válida no implica deuda ni pago | OE3/OE4 | #80, #81, #90 | #81 + F06/F07; retiro después de F10 |
| PayableAccount/Payment | Prisma | Deuda y pagos centrales legacy | Ninguno Live aprobado | Retiro controlado del alcance Live | REMOVE_FROM_LIVE_SCOPE | Sin requisito académico de cuentas/pagos | N/A | #81, #90 | #81; consumidores, evidencia y retención antes de retiro |
| SyncOperation/SyncConflict | Prisma | Operaciones PWA amplias | Backend | Contrato de proyección mínimo | REFACTOR_SCOPE | Nuevo límite de sync | OE2/OE4 | #80, #81 | F05/F06; evaluación en F10 |
| CalendarEvent | Prisma | Eventos operativos legacy | Ninguno Live aprobado | Retirar cuando no tenga consumidores | REMOVE_FROM_LIVE_SCOPE | No existe requisito vigente verificable | N/A | #81 | #81; migración nueva después de F10 |
| DemandForecast | Prisma | Placeholder histórico | Ninguno Live | Retirar del schema Live de forma controlada | REMOVE_FROM_LIVE_SCOPE | Evidencia histórica no exige permanencia del modelo | N/A | #81 | #81; migración nueva después de F10 |

## Retiro de `DemandForecast`

Esta PR no borra el modelo ni modifica Prisma. El schema actual continúa temporalmente. Cualquier retiro posterior requiere una migración nueva; la migración histórica original no se modifica. Git, los issues REC y las migraciones preservan la evidencia histórica aunque el modelo deje de formar parte del producto Live.
