# Matriz de frontera de datos

`PROPOSED` y `TBD` no autorizan implementación ni exposición. No se inventan campos: se registran grupos conceptuales.

Las filas de datos legacy o ejemplos privados describen tratamiento **si existen**; no crean requisitos de captura, persistencia o traslado a Mobile. En particular, `Purchase` individual sí pertenece al dominio Mobile; `PayableAccount` y `Payment` no tienen target Live. La forma física de backup y su metadata exacta se deciden en F09.

| Data / field group | Current storage | Authoritative owner | Privacy classification | May be projected? | Projection purpose | May appear in backup? | Web visibility | Retention decision | Status | Related requirement/issue |
|---|---|---|---|---|---|---|---|---|---|---|
| identity | PostgreSQL | Backend | Personal | Sí, mínima | Autenticación | Metadata | Admin limitada | Según política TBD | CONFIRMED | #80 |
| membership | User/Tenant actual; modelo futuro TBD | Backend | Personal/organizacional | Sí | Vínculo con sindicato | Metadata | Directiva/Admin autorizada | TBD | PROPOSED | #80 |
| device/clientId | SyncOperation | Backend/Mobile | Técnico seudónimo | Sí | Idempotencia | Metadata | Estado, no secreto | TBD | PROPOSED | #80, #81 |
| campaign | PostgreSQL | Backend/Directiva | Compartida | Sí | Contexto compartido; Mobile puede cachearlo offline | Según contrato F09 | Sí | TBD | CONFIRMED | #79, #90 |
| product catalog | PostgreSQL | Backend | Compartida | Sí | Catálogo común | Sí | Sí | TBD | CONFIRMED | #79 |
| crop catalog | PostgreSQL | Backend | Compartida | Sí | Catálogo común | Sí | Sí | TBD | CONFIRMED | #79 |
| plot | PostgreSQL legacy / SQLite target | Mobile | Privada | Sólo mínima aprobada | Agregación necesaria | Sí | No por defecto | TBD | PROPOSED | #80, #81 |
| plot location | PostgreSQL legacy / SQLite target | Mobile | Sensible | TBD | TBD | Sí, privada | No | TBD | TBD | #80 |
| inventory lot | PostgreSQL legacy; detalle Mobile sólo si se necesita | Condicional Mobile | Privada operativa si existe | No por defecto | N/A | Según contrato F09 | No | TBD | TBD | #81, #90 |
| stock quantity | PostgreSQL legacy / SQLite target | Mobile | Privada operativa | Sí, declarada/agregada | Planificación | Sí | Agregado autorizado | TBD | PROPOSED | #79, #80 |
| stock movement | PostgreSQL legacy; detalle Mobile sólo si se necesita | Condicional Mobile | Privada operativa si existe | No por defecto | N/A | Según contrato F09 | No | TBD | TBD | #81, #90 |
| application | PostgreSQL legacy / SQLite target | Mobile | Privada operativa | Sólo agregado aprobado | Consumo colectivo | Sí | Agregado | TBD | PROPOSED | #79, #80 |
| application notes | PostgreSQL legacy; sin captura Mobile obligatoria | Ninguno exigido | Privada sensible si existe | No | N/A | Según contrato F09 | No | TBD | TBD | #80, #90 |
| weather/target | Campos legacy/TBD | Mobile | Contextual/privada | TBD | TBD | Sí | TBD | TBD | TBD | #80 |
| purchase | PostgreSQL legacy / Mobile target | Mobile | Comercial/operativa privada | No por defecto | N/A | Según contrato F09 | No individual | TBD | PROPOSED | #80, #81, #90 |
| supplier | PostgreSQL legacy / SQLite target | Mobile o catálogo TBD | Comercial privada | TBD | TBD | Sí | TBD | TBD | TBD | #80 |
| PayableAccount | PostgreSQL legacy | Ninguno Live aprobado; Backend legacy hasta retiro | Sensible legacy | No | N/A | Sólo retención/restauración legacy aplicable | No | Retiro controlado TBD | NO_LIVE_TARGET | #81, #90 |
| Payment | PostgreSQL legacy | Ninguno Live aprobado; Backend legacy hasta retiro | Sensible legacy | No | N/A | Sólo retención/restauración legacy aplicable | No | Retiro controlado TBD | NO_LIVE_TARGET | #81, #90 |
| invoice photo | Legacy u opcional si existe | Ninguno exigido | Documento sensible si existe | No | N/A | Según contrato F09 | No | TBD | TBD | #80, #90 |
| family relationship | Opcional si existe en Mobile | Ninguno exigido | Personal sensible si existe | No | N/A | Según contrato F09 | No | TBD | TBD | #80, #90 |
| private note | Legacy u opcional si existe | Ninguno exigido | Privada sensible si existe | No | N/A | Según contrato F09 | No | TBD | TBD | #80, #90 |
| declared need | Mobile origen / Backend proyección futura | Mobile/agricultor (declaración); Backend sólo persiste proyección autorizada | Compartida bajo autorización aplicable | Sí | Consolidación | Según contrato F09 | Consolidada/autorizada | TBD | PROPOSED | #79, #80 |
| declared stock | Contrato F06 por decidir | Mobile si se aprueba su declaración | Compartida bajo autorización aplicable si existe | Sólo si se aprueba | Cálculo determinista condicionado a F06 | Según contrato F09 | Consolidada/autorizada si se aprueba | TBD | TBD | #79, #80, #90 |
| consumption projection | Contrato futuro | Backend, derivada | Colectiva minimizada | Sí | Planificación | Sí | Sí | TBD | PROPOSED | #79, #80 |
| last synchronization | Backend | Backend | Técnica | Sí | Estado/frescura | Metadata | Sí | TBD | PROPOSED | #80 |
| sync payload | SyncOperation legacy / contrato futuro | Mobile emite; Backend recibe | Mixta | Sí, sólo whitelist | Proyección | No como backup | No en bruto | TBD | TBD | #80, #81 |
| sync conflict snapshot | SyncConflict | Backend | Mixta potencialmente sensible | Interna | Reconciliación | No por defecto | Resumen autorizado | TBD | TBD | #80, #81 |
| audit | AuditLog | Backend | Restringida | Interna | Trazabilidad | No por defecto | Directiva/Admin autorizada | TBD | PROPOSED | #80 |
| calendar event | CalendarEvent legacy | Ninguno Live aprobado | Mixta potencialmente privada | No como target vigente | N/A | Sólo como dato legacy hasta decisión de retiro | No como capacidad Live | Retiro TBD mediante migración nueva | PROPOSED | #81 |
| collective purchase proposal | Contrato futuro | Backend/Directiva | Colectiva | Sí | Decisión humana | Sí | Sí | TBD | PROPOSED | #79, #81 |
| backup metadata | Contrato exacto F09 por decidir | Servicio de backup por definir en F09 | Técnica/privada si existe | No como proyección colectiva | Recuperación/integridad según F09 | N/A | Sólo owner/admin técnico si se aprueba | TBD | TBD | #80, #90 |
| backup binary | Almacenamiento físico F09 por decidir | Owner/servicio de backup según F09 | Privada sensible | No como sync | Recuperación | Es el backup | No | TBD | TBD | #80, #90 |
