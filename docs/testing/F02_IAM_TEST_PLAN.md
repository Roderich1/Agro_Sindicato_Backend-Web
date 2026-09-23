# Plan de pruebas IAM F02

## Estado

Plan para implementación futura. No acredita ejecución ni PASS. La baseline revisada es `main@347e2e78fc520d1fdaa5fe8631d993dd35475ed3`.

## Niveles

| Nivel | Objetivo |
|---|---|
| UNIT | policies, validadores, rotación, reuse, lifecycle y mappers |
| INT | Prisma, transacciones, constraints, backfill y revocación |
| CONTRACT | OpenAPI y compatibilidad de login/refresh/logout/me/client registration |
| E2E | flujo HTTP completo con cookie/Bearer y estados reales |
| SECURITY | cross-user, cross-tenant, escalación, forgery, replay y revocación |
| DEVICE | sólo generación/persistencia/reinstalación/revocación de clientId en Mobile |

## Matriz mínima futura

| Caso | Nivel | Resultado esperado |
|---|---|---|
| login válido | UNIT/INT/E2E | contexto Account/Member/Tenant vigente y sesión creada |
| login inválido | UNIT/E2E/SECURITY | 401 uniforme sin enumeración |
| Account, Member o Tenant inactivo | UNIT/INT/E2E | login/refresh denegado; acceso sensible conforme a política |
| refresh válido | UNIT/INT/CONTRACT/E2E | token anterior consumido y un solo sucesor |
| refresh expirado | UNIT/E2E | 401 y token no reutilizable |
| refresh revocado | UNIT/E2E | 401; política de family aplicada |
| refresh reutilizado | INT/E2E/SECURITY | detección, revocación acotada y auditoría |
| refresh concurrente | INT/SECURITY | como máximo un sucesor válido |
| logout | CONTRACT/E2E | idempotente, sesión actual revocada, credencial cliente limpiada |
| múltiples sesiones | INT/E2E | revocación de una no afecta otras salvo política explícita |
| cambio de rol/membership | INT/E2E/SECURITY | permisos vigentes; no se conserva privilegio stale más allá de política |
| cross-user | INT/E2E/SECURITY | 403/404 sin fuga |
| cross-tenant | INT/E2E/SECURITY | 403/404 y cero lectura/escritura |
| role escalation | UNIT/E2E/SECURITY | rol cliente/claim manipulado no concede permiso |
| forged `tenantId` | CONTRACT/E2E/SECURITY | ignorado/rechazado; tenant proviene del contexto |
| forged `ownerUserId` | CONTRACT/E2E/SECURITY | ignorado/rechazado salvo acción delegada autorizada |
| client revocado | INT/E2E/SECURITY | refresh y operaciones vinculadas rechazados |
| device loss | INT/E2E/DEVICE | revocación remota del client y sesiones |
| reinstalación | CONTRACT/E2E/DEVICE | nuevo clientId; anterior no se reasigna/reactiva implícitamente |
| backfill User→Member | INT | cardinalidad, rol y estado reconciliados; anomalías reportadas |
| rollback de switch | INT/CONTRACT | contrato anterior vuelve sin perder cuentas/sesiones auditables |

## Fixtures y aislamiento

Usar al menos dos tenants, dos agricultores por tenant, Directiva y Admin; Account sin Person; Person sin Account si el modelo lo incorpora; Member activo/inactivo; clients activo/revocado; sesiones de familias distintas. Cada test negativo debe demostrar tanto respuesta como ausencia de mutación.

## Evidencia exigida para GATE-F02

- comandos y SHA ejecutados;
- reporte por nivel y caso;
- OpenAPI versionada y diff revisado;
- migración nueva aplicada en base efímera y rollback ensayado;
- evidencia DEVICE separada cuando se implemente clientId Mobile;
- riesgos residuales y cualquier `NOT_MEASURED` preservados.

Los tests existentes pueden registrarse como `CURRENT_BASELINE`; no sustituyen los casos target ni permiten marcar #15 Passed por anticipado.
