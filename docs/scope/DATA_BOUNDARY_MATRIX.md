# Matriz de frontera de datos

`PROPOSED` y `TBD` no autorizan implementación ni exposición. No se inventan campos: se registran grupos conceptuales.

| Data / field group | Current storage | Authoritative owner | Privacy classification | May be projected? | Projection purpose | May appear in backup? | Web visibility | Retention decision | Status | Related requirement/issue |
|---|---|---|---|---|---|---|---|---|---|---|
| identity | PostgreSQL | Backend | Personal | Sí, mínima | Autenticación | Metadata | Admin limitada | Según política TBD | CONFIRMED | #80 |
| membership | User/Tenant actual; modelo futuro TBD | Backend | Personal/organizacional | Sí | Vínculo con sindicato | Metadata | Directiva/Admin autorizada | TBD | PROPOSED | #80 |
| device/clientId | SyncOperation | Backend/Mobile | Técnico seudónimo | Sí | Idempotencia | Metadata | Estado, no secreto | TBD | PROPOSED | #80, #81 |
| campaign | PostgreSQL | Backend/Directiva | Compartida | Sí | Contexto colectivo | Sí | Sí | TBD | CONFIRMED | #79 |
| product catalog | PostgreSQL | Backend | Compartida | Sí | Catálogo común | Sí | Sí | TBD | CONFIRMED | #79 |
| crop catalog | PostgreSQL | Backend | Compartida | Sí | Catálogo común | Sí | Sí | TBD | CONFIRMED | #79 |
| plot | PostgreSQL legacy / SQLite target | Mobile | Privada | Sólo mínima aprobada | Agregación necesaria | Sí | No por defecto | TBD | PROPOSED | #80, #81 |
| plot location | PostgreSQL legacy / SQLite target | Mobile | Sensible | TBD | TBD | Sí, privada | No | TBD | TBD | #80 |
| inventory lot | PostgreSQL legacy / SQLite target | Mobile | Privada operativa | No por defecto | N/A | Sí | No | TBD | PROPOSED | #80, #81 |
| stock quantity | PostgreSQL legacy / SQLite target | Mobile | Privada operativa | Sí, declarada/agregada | Planificación | Sí | Agregado autorizado | TBD | PROPOSED | #79, #80 |
| stock movement | PostgreSQL legacy / SQLite target | Mobile | Privada operativa | No por defecto | N/A | Sí | No | TBD | PROPOSED | #80, #81 |
| application | PostgreSQL legacy / SQLite target | Mobile | Privada operativa | Sólo agregado aprobado | Consumo colectivo | Sí | Agregado | TBD | PROPOSED | #79, #80 |
| application notes | PostgreSQL legacy / SQLite target | Mobile | Privada sensible | No | N/A | Sí | No | TBD | PROPOSED | #80 |
| weather/target | Campos legacy/TBD | Mobile | Contextual/privada | TBD | TBD | Sí | TBD | TBD | TBD | #80 |
| purchase | PostgreSQL legacy / SQLite target | Mobile | Financiera privada | No por defecto | N/A | Sí | No individual | TBD | PROPOSED | #80, #81 |
| supplier | PostgreSQL legacy / SQLite target | Mobile o catálogo TBD | Comercial privada | TBD | TBD | Sí | TBD | TBD | TBD | #80 |
| payable | PostgreSQL legacy / SQLite target | Mobile | Financiera sensible | No | N/A | Sí | No | TBD | PROPOSED | #80, #81 |
| payment | PostgreSQL legacy / SQLite target | Mobile | Financiera sensible | No | N/A | Sí | No | TBD | PROPOSED | #80, #81 |
| invoice photo | Mobile target | Mobile | Documento sensible | No | N/A | Sí | No | TBD | PROPOSED | #80 |
| family relationship | Mobile target | Mobile | Personal sensible | No | N/A | Sí | No | TBD | PROPOSED | #80 |
| private note | Mobile target | Mobile | Privada sensible | No | N/A | Sí | No | TBD | PROPOSED | #80 |
| declared need | Mobile origen / Backend proyección futura | Mobile/agricultor (declaración); Backend sólo persiste proyección autorizada | Compartida por consentimiento | Sí | Consolidación | Sí | Consolidada/autorizada | TBD | PROPOSED | #79, #80 |
| declared stock | Contrato futuro | Mobile (declaración) | Compartida por consentimiento | Sí | Cálculo determinista compatible | Sí | Consolidada/autorizada | TBD | TBD | #79, #80 |
| consumption projection | Contrato futuro | Backend, derivada | Colectiva minimizada | Sí | Planificación | Sí | Sí | TBD | PROPOSED | #79, #80 |
| last synchronization | Backend | Backend | Técnica | Sí | Estado/frescura | Metadata | Sí | TBD | PROPOSED | #80 |
| sync payload | SyncOperation legacy / contrato futuro | Mobile emite; Backend recibe | Mixta | Sí, sólo whitelist | Proyección | No como backup | No en bruto | TBD | TBD | #80, #81 |
| sync conflict snapshot | SyncConflict | Backend | Mixta potencialmente sensible | Interna | Reconciliación | No por defecto | Resumen autorizado | TBD | TBD | #80, #81 |
| audit | AuditLog | Backend | Restringida | Interna | Trazabilidad | No por defecto | Directiva/Admin autorizada | TBD | PROPOSED | #80 |
| calendar event | CalendarEvent legacy | Ninguno Live aprobado | Mixta potencialmente privada | No como target vigente | N/A | Sólo como dato legacy hasta decisión de retiro | No como capacidad Live | Retiro TBD mediante migración nueva | PROPOSED | #81 |
| collective purchase proposal | Contrato futuro | Backend/Directiva | Colectiva | Sí | Decisión humana | Sí | Sí | TBD | PROPOSED | #79, #81 |
| backup metadata | Contrato futuro | Backend | Técnica/privada | Sí | Localizar/validar backup | N/A | Sólo owner/admin técnico TBD | TBD | PROPOSED | #80 |
| backup binary | Mobile/private storage TBD | Mobile/owner | Privada sensible | No como sync | Recuperación | Es el backup | No | TBD | TBD | #80 |
