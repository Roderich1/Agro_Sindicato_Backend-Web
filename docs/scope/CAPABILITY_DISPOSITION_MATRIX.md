# Matriz de disposición de capacidades

La matriz distingue comportamiento existente de alcance objetivo. `REFACTOR_SCOPE` no autoriza cambios de código en esta PR.

| Capability | Current owner | Current behavior | Target owner | Target behavior | Disposition | Reason | Related OE | Related issue | Implementation phase |
|---|---|---|---|---|---|---|---|---|---|
| iam | Backend | JWT, refresh y roles | Backend | Identidad/sesión central | KEEP_AND_HARDEN | Responsabilidad central | OE2 | #8, #81 | F06/F09 |
| users | Backend/Web | CRUD de usuarios/roles | Backend/Web Admin | Account y membresía formalizados | REFACTOR_SCOPE | Separar Account/Member/Person | OE2/OE6 | #80, #81 | F02/F06/F07 |
| campaigns | Backend/Web | Campaña central y operativa | Backend/Web Directiva | Campaña compartida para planificación | REFACTOR_SCOPE | Evitar autoridad sobre operación privada | OE2/OE6 | #79, #81 | F02/F06/F07 |
| sync | Backend/Web | Cola PWA de operaciones privadas | Mobile/Backend | Proyección mínima idempotente | REFACTOR_SCOPE | Sync no replica dominio privado | OE2/OE3 | #80, #81 | F02/F05 |
| audit-logs | Backend/Web | Auditoría amplia | Backend/Web | Auditoría central minimizada | KEEP_AND_HARDEN | Trazabilidad con privacidad | OE2/OE6 | #80, #81 | F06/F09 |
| reports | Backend/Web | Reportes operativos individuales y globales | Backend/Web Directiva | Sólo agregados autorizados | REFACTOR_SCOPE | Limitar exposición privada | OE6 | #79, #80, #81 | F06/F07 |
| procurement | Backend/Web | Compra individual y conjunta con efectos | Mobile; propuesta central | Compra individual local; propuesta colectiva sin efectos | REFACTOR_SCOPE | Separar decisión de ejecución | OE3/OE6 | #79, #81 | F02/F06/F07 |
| inventory | Backend/Web | CRUD individual central | Mobile | Registro individual local; proyección agregada | MOVE_TO_MOBILE_RESPONSIBILITY | Mobile es autoridad | OE3 | #79, #80, #81 | F05/F06/F07 |
| applications | Backend/Web | Aplicación y salida central | Mobile | Aplicación local; proyección autorizada | MOVE_TO_MOBILE_RESPONSIBILITY | Dato operativo privado | OE3 | #79, #80, #81 | F05/F06/F07 |
| plots | Backend/Web | CRUD de parcelas/cultivos | Mobile | Parcela local; sólo proyección necesaria | MOVE_TO_MOBILE_RESPONSIBILITY | Privacidad y autoridad | OE3 | #79, #80, #81 | F05/F06/F07 |
| accounts-payable | Backend/Web | Deuda y pagos individuales centrales | Mobile | Finanzas individuales privadas | MOVE_TO_MOBILE_RESPONSIBILITY | Fuera del dataset colectivo | OE3 | #79, #80, #81 | F05/F06/F07 |
| calendar | Backend/Web | Eventos operativos individuales | Mobile | Recordatorios privados; hitos colectivos separados | REFACTOR_SCOPE | Separar calendarios | OE3/OE6 | #79, #80 | F02/F07 |
| demand-forecasting | Prisma/placeholder | Modelo legacy, sin requisito vigente | Ninguno live | No implementar forecasting | REMOVE_FROM_LIVE_SCOPE | Fuera del alcance explícito | N/A | #79, #81 | F10 |
| voice-entry | No verificado aquí | Sin módulo backend productivo observado | Mobile | Voz asistida con confirmación | MOVE_TO_MOBILE_RESPONSIBILITY | Entrada individual y segura | OE4 | #7, #8 | F04 |
| dashboard (Web) | Web | Resumen también operativo | Web Directiva | Resumen colectivo autorizado | REFACTOR_SCOPE | Web no es cliente agricultor | OE6 | #79, #81 | F07 |
| directiva (Web) | Web | Inventario global/deudas/compras | Web Directiva | Planificación y propuesta colectiva | REFACTOR_SCOPE | Minimización y no efectos automáticos | OE6 | #79, #80 | F07 |
| inventory (Web) | Web | CRUD operativo | Mobile | Retirar de alcance live Web | REMOVE_FROM_LIVE_SCOPE | Autoridad móvil | OE3 | #81 | F07/F10 |
| purchases (Web) | Web | Compra/pago individual | Mobile/Web Directiva | Retirar individual; propuesta colectiva | REFACTOR_SCOPE | Separar responsabilidades | OE3/OE6 | #81 | F07/F10 |
| applications (Web) | Web | CRUD operativo | Mobile | Retirar de alcance live Web | REMOVE_FROM_LIVE_SCOPE | Autoridad móvil | OE3 | #81 | F07/F10 |
| plots (Web) | Web | CRUD operativo | Mobile | Retirar de alcance live Web | REMOVE_FROM_LIVE_SCOPE | Autoridad móvil | OE3 | #81 | F07/F10 |
| campaigns (Web) | Web | Gestión central | Web Directiva | Gestión de campañas compartidas | KEEP_AND_HARDEN | Capacidad colectiva | OE6 | #79 | F07 |
| calendar (Web) | Web | Eventos individuales | Web Directiva | Sólo calendario colectivo aprobado | REFACTOR_SCOPE | Privacidad | OE6 | #80 | F07 |
| reports (Web) | Web | Reportes individuales/globales | Web Directiva | Agregados autorizados | REFACTOR_SCOPE | Minimización | OE6 | #80 | F07/F09 |
| sync (Web) | Web | Administra cola offline | Web Directiva | Estado de última sync, sin cola operativa | REFACTOR_SCOPE | Outbox pertenece a Mobile | OE2/OE6 | #80, #81 | F05/F07 |
| audit (Web) | Web | Consulta de bitácora | Web Directiva/Admin | Auditoría autorizada | KEEP_AND_HARDEN | Gobierno y evidencia | OE6 | #80 | F07/F09 |
| users (Web) | Web | Administración de usuarios | Web Admin | Cuentas/vínculos/membresía | REFACTOR_SCOPE | Modelo aún TBD | OE6 | #80 | F02/F07 |
| offline queue (Web) | Web | Cola IndexedDB de operaciones | Mobile | Eliminar del alcance live Web | REMOVE_FROM_LIVE_SCOPE | Web online-first | OE2/OE3 | #81 | F07/F10 |
| PWA/service worker | Web | Instalación/cache/offline | Web | Conveniencia técnica, no operación offline | REFACTOR_SCOPE | PWA no implica autoridad individual | OE6 | #81 | F07 |
| Tenant/User/RefreshToken | Prisma | Identidad central | Backend | Conservar y formalizar membresía | KEEP_AND_HARDEN | Base central necesaria | OE2 | #80 | F02/F06 |
| Product/Crop/Campaign | Prisma | Catálogos y campaña | Backend | Catálogos/campaña compartidos | KEEP_AND_HARDEN | Datos colectivos | OE2/OE6 | #80 | F02/F06 |
| Plot/Lot/Movement/Application | Prisma | Dominio privado central | Mobile | Compatibilidad temporal; migrar autoridad | MOVE_TO_MOBILE_RESPONSIBILITY | Frontera privada | OE3 | #80, #81 | F05/F10 |
| Purchase/Payable/Payment | Prisma | Finanzas individuales/conjuntas | Mobile + propuesta central | Separar privado de propuesta | REFACTOR_SCOPE | Evitar efectos colectivos automáticos | OE3/OE6 | #80, #81 | F02/F06/F10 |
| SyncOperation/SyncConflict | Prisma | Operaciones PWA amplias | Backend | Contrato de proyección mínimo | REFACTOR_SCOPE | Nuevo límite de sync | OE2 | #80, #81 | F05/F06 |
| DemandForecast | Prisma | Placeholder histórico | Ninguno live | Retener hasta plan seguro de retiro | HISTORICAL_ONLY | No requisito vigente | N/A | #81 | F10 |
