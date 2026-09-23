# Plan de implementación F02

## Principios

- Baseline: F01 Passed, ADR-001 `ACCEPTED`, requisitos `BASELINED`.
- Implementación incremental `expand → backfill → switch → contract`.
- Ninguna PR inicial elimina User, RefreshToken, endpoints o migraciones históricas.
- El gate se evalúa con evidencia; cerrar tareas no lo arrastra a Passed.
- #81 continúa bloqueado por F05 y #20 aunque F02 avance.

## Secuencia propuesta

### PR F02-A — #10 Account/User + Member

Definir schema expandible, relaciones y policies conceptuales; añadir Member sin reemplazar User; backfill reversible; adaptar contexto IAM tras tests. `Person` sólo se añade si un consumidor central aprobado demuestra necesidad. Esta PR prepara el ancla de autorización para las siguientes.

### PR F02-B — #11 ClientRegistration

Añadir registro lógico y lifecycle create/register/associate/rotate/revoke/reinstall; asociar a Account/Member. No usar hardware IDs. Mantener compatibilidad con el `clientId` legacy de Sync sin convertirlo aún en contrato F05.

### PR F02-C — #13 Access/refresh/session

Versionar login/refresh/logout/me; ligar refresh a sesión/client; hacer rotación atómica, family/reuse detection y revocación acotada; resolver TTL/cookie desde configuración y threat model. Conservar contrato anterior durante transición.

### PR F02-D — #12 Authorization hardening

Introducir contexto/policy central `tenant → member → role → ownership`; revalidar estados necesarios; auditar cada familia de endpoints; corregir IDOR/cross-tenant y permisos de catálogo sin expandir capacidades legacy.

### PR F02-E — #14 Migraciones, OpenAPI y verificación

Completar migraciones nuevas no destructivas, backfill/reconciliación, OpenAPI versionada y suites UNIT/INT/CONTRACT/E2E/SECURITY. DEVICE se enlaza sólo para lifecycle Mobile de clientId. Producir evidencia y rollback ensayado.

### GATE-F02 — #15

Evaluar criterios uno por uno después de integrar y verificar F02-A..E. Mantener `Gate = Pending` hasta entonces.

## Dependencias

| Entrega | Depende de | Desbloquea |
|---|---|---|
| F02-A | F01, ADR-001, #10 | contexto Member para B/C/D |
| F02-B | modelo A; coordinación Mobile | session/client; precondición F05 |
| F02-C | A y contrato B mínimo | revocación y contexto estable para D |
| F02-D | A y C; matriz actor/recurso/acción | aislamiento verificable |
| F02-E | A–D integradas | evaluación #15 |
| #15 | evidencia A–E | cierre F02, no cierre #81 |

No se invierte el orden entre modelo y hardening: una policy construida sobre `User.role` legacy se tendría que rehacer al introducir Member. B y C pueden coordinarse estrechamente, pero deben conservar commits/PRs revisables.

## Cambios futuros identificados

- Prisma: Member y ClientRegistration; relación de sesión/RefreshToken; constraints e índices tenant-scoped; Person sólo bajo necesidad aprobada.
- API: versión/contrato de auth y client registration; errores y revocación; contexto `/me`.
- Código: resolver de contexto vigente, policies/guards y repositorios tenant-scoped.
- Tests: matriz de [`../testing/F02_IAM_TEST_PLAN.md`](../testing/F02_IAM_TEST_PLAN.md).
- Datos: backfill User→Member con reporte de anomalías; sin DROP.

## Rollback por etapa

Antes de switch, dejar lectura legacy disponible. Si falla expand/backfill, detener dual-write, revertir feature flag/versión y conservar filas nuevas para diagnóstico. Si falla session/auth, volver emisión al contrato anterior y revocar sólo sesiones incompatibles según runbook. Nunca restaurar privilegios desde input cliente ni borrar evidencia para “volver atrás”.

## Estado de issues al abrir esta planificación

- #10 puede pasar a `Ready`: tiene diseño, dependencias y primer alcance ejecutable.
- #11, #13, #12 y #14 permanecen `Backlog` hasta satisfacer la dependencia anterior.
- #15 permanece `Backlog`, `Gate = Pending`.
- #81 permanece `OPEN / Blocked / Gate N/A`, sin Engineering Iteration.

Esta PR documental no marca implementación `In Progress` ni ejecuta los cambios descritos.
