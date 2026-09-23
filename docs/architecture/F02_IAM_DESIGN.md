# Diseño IAM F02

## Propósito y autoridad

Este documento prepara F02 sin implementar código. Parte de `main@347e2e78fc520d1fdaa5fe8631d993dd35475ed3`, ADR-001 `ACCEPTED`, `URS-SEC-01`, `URS-SYNC-01`, `SRS-IAM-01`, `SRS-IAM-02`, `SRS-DEVICE-01`, `SRS-SYNC-01`, `SRS-SYNC-02` y `DEC-F01-01/02/04/08/12`.

Las clasificaciones siguientes describen la revisión estática actual; `EXISTS` no equivale a PASS. No se ejecutó una implementación target ni se modificaron schema, API o migraciones.

## A. Estado actual

### Inventario IAM

| Capacidad | Estado | Evidencia actual | Brecha F02 |
|---|---|---|---|
| Tenant | `EXISTS` | Prisma `Tenant`; `User.tenantId`; relaciones multi-tenant | El tenant activo del token no se revalida en cada request |
| User | `LEGACY_TO_REFACTOR` | Cuenta, nombre, tenant, rol y estado en un solo modelo | Mezcla Account + membership + datos mínimos de persona |
| Member | `MISSING` | No existe modelo o lifecycle separado | Formalizar pertenencia, estado y rol por tenant |
| Person | `MISSING` | No existe modelo separado | Crear sólo si un caso central lo requiere; no copiar familia privada |
| Device/client registration | `MISSING` | `SyncOperation.clientId` es texto no registrado | Lifecycle, asociación y revocación faltantes |
| RefreshToken | `PARTIAL` | Hash SHA-256, expiración, revocación, IP y user-agent | Sin device/session family, tenant relation, consumo transaccional ni reemplazo explícito |
| Roles | `EXISTS` | Enum `AGRICULTOR`, `DIRECTIVA`, `ADMINISTRADOR`; `RolesGuard` global | El claim puede quedar stale hasta vencer el access token |
| JWT access | `EXISTS` | Bearer JWT firmado; `sub/email/role/tenantId`; expiración validada | Strategy confía en claims y no consulta estado vigente |
| Login | `EXISTS` | `POST /auth/login`, bcrypt, usuario activo y mensaje uniforme | No valida explícitamente `tenant.isActive` |
| Refresh rotation | `PARTIAL` | Revoca token usado y crea otro; reuse revoca tokens del usuario | No es atómico y no distingue familia/device |
| Logout | `PARTIAL` | Revoca refresh de cookie y limpia cookie | Requiere access válido; no define logout por device o global |
| `/auth/me` | `EXISTS` | Recarga User por `sub` | No rechaza explícitamente User/Tenant inactivo en el caso de uso |
| Guards/current user | `EXISTS` | `JwtAuthGuard`, `RolesGuard`, `CurrentUser` globales | Falta contexto autorizado normalizado Account/Member y revalidación |
| Rate limiting | `EXISTS` | Global 20/min y login 5/min | Refresh no tiene límite específico documentado |
| CORS/cookies | `PARTIAL` | CORS allowlist configurable; cookie HttpOnly, SameSite Strict, Secure configurable | Max-Age fijo a 7 días puede divergir de `JWT_REFRESH_EXPIRES_IN` |
| OpenAPI | `PARTIAL` | Swagger global y Bearer; operaciones documentadas | Cookie refresh, errores y contratos versionados incompletos |

Valores configurables observados: `JWT_EXPIRES_IN` usa default `15m`, `.env.example` declara `8h`, Docker declara `15m`; `JWT_REFRESH_EXPIRES_IN` usa `7d`. Son estado actual, no requisitos F01 ni valores aprobados para el target. `JWT_REFRESH_SECRET` se valida, pero el refresh actual es opaco/aleatorio y hasheado; el secreto no participa en su emisión o validación.

### Modelo Prisma vigente

- `Tenant`: organización raíz con `id`, `name`, `slug`, `isActive` y relaciones a usuarios y dominios legacy.
- `User`: cuenta autenticable y, simultáneamente, pertenencia a un solo tenant, rol organizacional, nombre, email, estado y propietario/actor de numerosas relaciones.
- `RefreshToken`: token opaco hasheado ligado a `userId`, con `tenantId` duplicado, IP, user-agent, expiración y revocación. Sólo existe relación Prisma con `User`; no hay relación `Tenant` ni `Device`.
- No existen `Member`, `Person`, `Device` o `Session` separados.

`User` es referenciado directamente por warehouses, lotes, movimientos, compras, asignaciones, participantes, cuentas por pagar, pagos, sync, campañas, parcelas, aplicaciones, calendario y auditoría. Por ello la separación no admite un reemplazo destructivo ni un rename masivo en una sola entrega.

### JWT y sesión actuales

El access JWT contiene `sub`, `email`, `role` y `tenantId`. `JwtStrategy` valida firma y expiración, pero devuelve los claims sin consultar User/Tenant. Los controladores protegidos derivan generalmente actor y tenant desde `CurrentUser`; los IDs de recursos siguen viniendo legítimamente de path/query/body y deben validarse contra ese contexto.

Login verifica email, `User.isActive` y bcrypt; actualiza `lastLoginAt`, firma access y guarda el hash SHA-256 de un refresh aleatorio. Refresh busca el hash, rechaza ausencia/revocación/expiración, comprueba User activo, revoca el token usado y crea otro. El reuso de un token ya revocado revoca todos los refresh del User. Existen múltiples sesiones porque cada login crea un token, pero no hay identidad de sesión/device ni control específico por instalación.

## B. Modelo conceptual target

Se elige la alternativa **Account/User + Member**, con `Person` opcional y separado:

- `Account` (nombre físico inicial compatible: `User`): credencial e identidad de autenticación; email, password hash, estado de cuenta y datos de seguridad.
- `Member`: pertenencia de un Account a un Tenant, con estado y rol organizacional. Es la fuente de autorización tenant-scoped.
- `Person`: identidad humana de dominio sólo cuando exista una finalidad central aprobada. Puede existir sin Account y un Account no obliga a crear Person.
- `ClientRegistration`: instalación lógica seudónima asociada al contexto Account/Member y con lifecycle explícito.
- `Session` o extensión compatible de `RefreshToken`: sesión revocable ligada a Account, Member y ClientRegistration.

No se selecciona sólo “extender User” porque conservaría identidad y pertenencia acopladas. Tampoco se introduce inmediatamente un reemplazo físico `Account`: mantener `User` como tabla de compatibilidad reduce riesgo y permite expandir antes de cambiar consumidores.

## C. Account/User, Member y Person

Cardinalidad target: Account 1—N Member; Tenant 1—N Member; Person 0..1—N Member sólo si el caso de dominio lo exige; Account 0..1—1 Person opcional, nunca automático. El rol y estado organizacional pertenecen a Member, no a Person. Las relaciones familiares privadas de Mobile no se crean en Central.

Durante coexistencia, `User.tenantId`, `User.role` y `User.isActive` siguen siendo fuente legacy. El backfill crea un Member equivalente, conserva IDs y registra discrepancias. El switch cambia primero el contexto autenticado y después consumidores. `User` y relaciones legacy no se eliminan en F02.

## D. Device/clientId

Se recomienda un identificador aleatorio opaco de 128 bits representado en formato UUID v4 por interoperabilidad, no porque F01 imponga UUID. Mobile lo genera mediante CSPRNG y lo persiste en almacenamiento local apropiado para la instalación; nunca deriva de IMEI, Android ID, serial, MAC o fingerprint.

Lifecycle:

1. **create:** Mobile genera el identificador en una instalación nueva.
2. **register:** después de autenticar, Central crea/recupera un registro owner-scoped y devuelve su estado.
3. **associate:** el registro se asocia a Account/Member autenticado; el cliente no decide tenant o actor.
4. **rotate:** operación explícita y auditada; el identificador anterior queda revocado, no reasignado.
5. **revoke/device loss:** revoca sesiones del registro y bloquea nuevos refresh/sync asociados.
6. **logout:** revoca la sesión actual; no necesariamente el registro, salvo decisión explícita del usuario/política.
7. **reinstall:** crea un clientId nuevo; la recuperación requiere autenticación y no resucita automáticamente el anterior.

Central guarda hash/identificador seudónimo, Account/Member, estado, fechas de alta/último uso/revocación y metadata mínima auditada. RefreshToken referencia la sesión/client; `SyncOperation` usará la identidad registrada en F05 junto con operación lógica, nunca un `clientId` libre como autoridad.

## E. Contexto JWT target

El contexto autorizado se resuelve así:

`access token → Account vigente → Member vigente → Tenant vigente → role vigente → client/session vigente (cuando aplique)`

Los claims mínimos recomendados son `sub` (Account/User), `memberId`, `tenantId`, `role`, `sessionId` y versión del contrato/claims. Email es informativo y puede omitirse del token. La firma y expiración siguen siendo necesarias, pero operaciones sensibles deben poder detectar cuenta, membership, tenant, sesión o client revocados.

La política exacta de TTL es `F02 DESIGN DETAIL`: debe decidirse con threat model y operación, ser configurable y coherente entre token, cookie y documentación. F01 no impone “access corto + refresh largo”.

## F. Contrato access/refresh/session

| Operación | Target |
|---|---|
| `POST /auth/login` | Autentica credencial, valida Account/Member/Tenant, registra o valida client cuando corresponda, crea sesión y devuelve access + refresh protegido según tipo de cliente |
| `POST /auth/refresh` | Consume un refresh una sola vez, rota dentro de una operación atómica, conserva family/session y detecta reuso |
| `POST /auth/logout` | Revoca la sesión actual de forma idempotente y limpia credencial cliente; se definirá comportamiento cuando access haya expirado |
| `GET /auth/me` | Devuelve contexto vigente de Account/Member/Tenant/role, no sólo claims stale |

La Web puede mantener refresh en cookie HttpOnly/Secure/SameSite; Mobile requiere contrato apropiado para almacenamiento seguro sin copiar la contraseña. La versión inicial y compatibilidad se publican en OpenAPI durante implementación. Cambio de rol/membership, inactivación, revocación de device o tenant deben impedir nuevos refresh; la política de invalidación inmediata de access se definirá explícitamente.

## G. Autorización y ownership

Regla única:

`authentication context → tenant → account/member → role → ownership → resource authorization`

El cliente puede seleccionar un ID de recurso, filtro o target Member, pero `tenantId`, `actorUserId` y el owner efectivo no se aceptan como autoridad desde body/query/path. Una acción Admin/Directiva sobre otro Member exige permiso explícito, consulta tenant-scoped y auditoría.

### Matriz de auditoría actual

| Endpoint/use-case | Usuario autenticado | Fuente tenant/owner | IDs cliente | Check actual | Riesgo | Acción F02 |
|---|---|---|---|---|---|---|
| `/auth/login`, `/refresh` | Público | User/Refresh almacenado | email/cookie | credencial, estado User, token | Tenant inactivo no verificado; rotación no atómica | Validar Account/Member/Tenant; family/session; atomicidad |
| `/auth/logout`, `/me` | JWT | `sub` | cookie | refresh hash / User por ID | logout depende de access; `/me` no comprueba estado | Contrato de revocación y contexto vigente |
| `/users/*` | JWT Admin; lista también Directiva | tenant/actor desde JWT | target user ID y DTO | repositorio filtra target por tenant | Role claim stale; update final usa ID global tras precheck | Migrar a Member y update tenant-scoped/transaccional |
| campañas y crops | JWT + roles | tenant/actor desde JWT | resource/campaign IDs | queries tenant-scoped | `role` stale; autorización dispersa | Policy central y tests cross-tenant |
| plots, assignments, applications | JWT | tenant y owner desde JWT | resource/filter IDs | casos de uso filtran owner para agricultor | Cobertura negativa incompleta | Contract tests de owner y excepción Directiva |
| inventario/lotes/movimientos | JWT | tenant/owner desde JWT | product/lot/warehouse/campaign | varias consultas tenant+owner | Mutaciones de catálogo/config accesibles a Agricultor por rol de clase amplio | Definir matriz actor/recurso/acción y restringir catálogo |
| suppliers/purchases/payables | JWT | tenant/actor desde JWT; owner según rol | supplier, purchase, payable y participant IDs | filtros por tenant/owner en casos revisados | Legacy permite operaciones centrales amplias; IDs relacionados requieren checks consistentes | Negative tests y policy; no expandir legacy |
| reports/audit/calendar | JWT | tenant + actor desde JWT | owner/campaign filtros | Agricultor fuerza su owner; roles elevados filtran tenant | Exposición agregada depende de rol stale y alcance legacy | Member vigente, minimización y matriz de autorización |
| `/sync/operations` | JWT | tenant/user desde JWT | `clientId`, operation/entity IDs y payload | unique tenant/user/client/entity | clientId no registrado; payload legacy amplio | Verificar client registration; contrato F05/F06 |

Hallazgo transversal: no se observó un endpoint que acepte `tenantId` del body como fuente primaria; eso es una fortaleza parcial. Persisten riesgos de claims stale, checks distribuidos, cobertura desigual y relaciones legacy directas con User. Estos hallazgos requieren pruebas antes de calificarse PASS.

## H. Estrategia de migración

1. **expand:** crear Member, ClientRegistration y metadata de sesión compatibles, sin borrar User/RefreshToken.
2. **backfill:** crear Member por cada User/tenant actual y mapear roles/estado; registrar anomalías sin inventar Person.
3. **dual-read/dual-write controlado:** emitir contexto nuevo conservando claims/API legacy durante ventana versionada.
4. **switch:** mover policies, sesiones y consumidores al contexto Account/Member/client; observar métricas y errores.
5. **contract:** fuera de la entrega inicial y sólo tras consumidores migrados, rollback probado y gate aplicable.

No se alteran migraciones históricas. Cada paso futuro usa migración nueva, reversible en la medida compatible con datos, con backup y verificación previa.

## I. Impacto OpenAPI

Documentar versión de contrato, request/response de login/refresh/logout/me, transporte de refresh por tipo de cliente, errores 401/403, identidad de client registration, revocación, claims semánticos y endpoints Admin sobre Member. Durante coexistencia se marcan campos legacy/deprecados sin retirarlos.

## J. Estrategia de pruebas

La estrategia detallada está en [`../testing/F02_IAM_TEST_PLAN.md`](../testing/F02_IAM_TEST_PLAN.md). F02 necesita UNIT, INT, CONTRACT, E2E y SECURITY. DEVICE sólo aplica al lifecycle Mobile del clientId/almacenamiento seguro. Los tests actuales, si se ejecutan, son `CURRENT_BASELINE`, no evidencia del target.

## K. Riesgos

- claims de rol/tenant válidos criptográficamente pero desactualizados;
- cross-tenant/IDOR por un filtro omitido en un caso de uso legacy;
- bloqueo o takeover por backfill incorrecto de Member;
- refresh concurrente que produzca más de un sucesor;
- revocación demasiado amplia por reuse detection global al usuario;
- divergencia entre TTL de cookie y configuración;
- clientId usado como autoridad o tracking si no se minimiza;
- endpoints de catálogo/configuración con roles demasiado amplios;
- ruptura de Web/Mobile durante cambio de contrato.

## L. Rollback

Mantener User, claims y endpoints legacy durante coexistencia; activar lectura/escritura nueva por feature flag o versión; conservar mapa User↔Member y sesión legacy↔nueva; detener emisión nueva sin borrar filas; revertir consumidores a contrato anterior; reconciliar sesiones/miembros creados; no hacer `DROP` hasta cumplir F10 y condiciones de `contract`.

## M. Trazabilidad

| Issue | Requisitos/decisiones | Entrega futura |
|---|---|---|
| #10 | `URS-SEC-01`; `SRS-IAM-01/02`; `DEC-F01-01/12` | Account/User + Member + Person opcional |
| #11 | `URS-SYNC-01`, `URS-SEC-01`; `SRS-DEVICE-01`, `SRS-SYNC-02`; `DEC-F01-02/04` | Client registration y lifecycle |
| #13 | `URS-SEC-01`; `SRS-IAM-02`; `DEC-F01-08/12` | Contrato access/refresh/session versionado |
| #12 | `URS-SEC-01`, `URS-PRIV-01`; `SRS-IAM-02`, `SRS-PRIV-01`; `DEC-F01-08` | Policy tenant/role/ownership y hardening |
| #14 | anteriores; OE2/OE5 | Migraciones nuevas, OpenAPI y verificación |
| #15 | baseline F02 anterior | Evaluación independiente de gate |

#81 permanece bloqueado hasta F05 y #20, aunque F02 comience.
