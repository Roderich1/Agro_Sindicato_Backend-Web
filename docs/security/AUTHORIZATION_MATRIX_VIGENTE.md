# Matriz de autorización vigente — actor × tenant × propietario × ruta

- **Estado al:** 2026-10-18 (UTC), sobre Backend/Web `main` **`df0df1d`**; código de `Back/src` igual a **`cab433d`** (`git diff --stat cab433d df0df1d -- Back/src Back/prisma Web/src` vacío).
- **Preparada por** la sesión B de Claude Code, por el encargo de Roderich Rendón del 2026-10-18 («contraste vigente de #44»). Es un contraste documental del código con las pruebas existentes; **no se ejecutó ninguna suite** para esta matriz y **no se concede ni se retira ningún permiso**. Sin revisión personal de Roderich ni del tutor.
- **Issue:** BE #44 (F10-SEC-01). Relacionados: #45 (F10-SEC-02), #81 (ALIGN-TECH-01), ADR-003.
- **Sustituye como estado vigente** a las filas de [`F02_AUTHORIZATION_MATRIX.md`](F02_AUTHORIZATION_MATRIX.md) (2026-09-24) que describían lecturas o escrituras temporales de DIRECTIVA y ADMINISTRADOR sobre datos privados de los agricultores. Esa matriz **se conserva** como contexto de F02: sus clases, su política de errores y su tratamiento de campos de autoridad siguen valiendo salvo lo que se indica en el §3.

## 1. Fuentes y criterio

- **[ADR-003](../adr/ADR-003-administrador-presidente-funciones-directiva.md)** (aceptada el 2026-10-15): el ADMINISTRADOR del tenant ejerce las funciones de DIRECTIVA (accesos, consultas colectivas, reconciliación, propuestas de compra conjunta), pero **ni DIRECTIVA ni ADMINISTRADOR acceden a los respaldos privados ni a las operaciones individuales de otros agricultores**, y no publican aportes en nombre de un agricultor.
- **[ADR-001](../adr/ADR-001-mobile-individual-system-of-record.md):** la operación individual del agricultor vive en Mobile; las rutas centrales privadas heredadas no son arquitectura objetivo.
- **[`F10_SEC_02_ROUTES.md`](../evidence/F10_SEC_02_ROUTES.md)** (PR #118) y **[`F10_SEC_02_PROJECTION.md`](../evidence/F10_SEC_02_PROJECTION.md)** (PR #126): cierre de las rutas que cruzaban la frontera privada/colectiva y minimización de las que se conservan.
- **Código leído** en `df0df1d`: los 23 controladores de `Back/src` (decoradores `@Roles`, `@UseGuards`, `@Public`), `RolesGuard` (`modules/iam/api/rest/guards/roles.guard.ts:13-16`: `getAllAndOverride` con el método antes que la clase, así que un `@Roles` de método sustituye al de clase), `LegacyRouteClosedGuard` (`shared/api/legacy-route-closed.guard.ts`: siempre 403 `LEGACY_ROUTE_CLOSED`), `BackupsAuthGuard`, `SyncV1AuthGuard` y los casos de uso que filtran por propietario. Guardas globales: `JwtAuthGuard` y `RolesGuard` (`iam.module.ts:69-70`) y `ThrottlerGuard` (`app.module.ts:50`, 20 por minuto; 5 por minuto en los inicios de sesión).

**Abreviaturas:** A = AGRICULTOR, D = DIRECTIVA, M = ADMINISTRADOR. «Propio» = el recurso pertenece al usuario autenticado (o, en Sync v1 y respaldos, a su Member). «Ajeno» = de otro agricultor del **mismo** tenant. «Otro tenant» = un ID que existe en otro tenant. El tenant efectivo es siempre el del principal revalidado, nunca uno enviado por el cliente.

## 2. Matriz vigente

**Respuestas:** `200/201` permitido; `403` rol no permitido; `403 LEGACY_ROUTE_CLOSED` ruta heredada cerrada, sin efectos; `404` ID ajeno, de otro tenant o inexistente, indistinguibles; `401` sin sesión o contexto inválido. Las pruebas citadas corren en CI en `.github/workflows/backend-f02.yml` (CI 39050197493, SUCCESS sobre `cab433d`); el último recuento local fechado está en `F10_SEC_02_PROJECTION.md` §6 (2026-10-17, sobre `6ba064f`).

### 2.1 Identidad y accesos

| Ruta y acción | A | D | M | Ajeno / otro tenant | Código | Pruebas existentes |
|---|---|---|---|---|---|---|
| `POST /auth/login`, `/auth/v2/login` (públicas, 5/min), `/auth/refresh`, `/auth/v2/refresh`, `logout`; `GET /auth/me`, `/auth/v2/me` | propio | propio | propio | contexto inválido o revocado → 401, sin decir qué entidad | `auth.controller.ts`, `auth-v2.controller.ts` | `auth-v2.postgres.spec.ts` (12), entre ellas «rejects expired/revoked/compromised/inactive/client-revoked contexts and V1 tokens» y «/me revalidates current role/state instead of trusting stale V2 claims»; `current-auth-context.postgres.spec.ts` «blocks stale V2 DIRECTIVA after downgrade…» |
| `/auth/clients` (registrar, listar, revocar), `POST /auth/v2/session/client` | propio | propio | propio | registro ajeno → 404 (`manage-client-registrations.use-case.ts:76-88`); enlace ajeno rechazado | `client-registrations.controller.ts` | `auth-v2.postgres.spec.ts` «binds idempotently and rejects cross-owner, revoked, or silent rebind», «ClientRegistration revoke propagates only to bound active sessions» |
| `GET /users` | 403 | 200, **vista reducida**: id, nombre, rol y estado (sin correo ni último acceso) | 200, vista completa (administración de accesos, ADR-003) | sólo usuarios del tenant | `users.controller.ts:51-64` | `f10-sec-02-legacy-boundary.postgres.spec.ts` «the user list serves each role its purpose: the Directiva gets names, not emails or last logins» y «campaigns, users and the collective F07 routes still answer DIRECTIVA and ADMINISTRADOR» |
| `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `/:id/password`, `/:id/deactivate` | 403 | **403** | 200/201 | target de otro tenant → 404 | `@Roles(ADMINISTRADOR)` de clase, `users.controller.ts:30` | `current-auth-context.postgres.spec.ts` «hides another user» (404 de otro tenant para M); casos de uso de `users/` (alcance por tenant). **Sin prueba directa del 403 a D** en estas rutas (§4, hallazgo 1) |

### 2.2 Catálogos compartidos (sin datos privados)

| Ruta y acción | A | D | M | Ajeno / otro tenant | Código | Pruebas existentes |
|---|---|---|---|---|---|---|
| `GET /campaigns`, `/campaigns/active` | 200 | 200 | 200 | ID de otro tenant → 404 | `campaigns.controller.ts`; sin conteos de registros privados (`campaign-management.use-case.ts:304`) | legacy-boundary «campaigns and the crop catalog carry no tenant-wide counts of private records», «does not show another tenant» |
| `POST /campaigns`, `PATCH /:id`, `POST /:id/open`, `/:id/close` | 403 | 200/201 | 200/201 | 404 | `@Roles(D, M)` de método | legacy-boundary «campaigns, users and the collective F07 routes still answer…» (alta por M) |
| `GET /crops` · `POST`, `PATCH /:id` | 200 · 403 | 200 · 200/201 | 200 · 200/201 | 404 | `crops.controller.ts`; sin `summary` de uso privado | legacy-boundary «keeps the shared crop catalog for institutional roles» |
| `GET /inventory/products` · `POST`, `PATCH /:id`, `/:id/deactivate`, `/:id/settings` | 200 · 403 | 200 · 200/201 | 200 · 200/201 | 404 | `inventory.controller.ts:52-91,175-186`; **sin `currentStock`** (`product-catalog.use-case.ts:181`) | legacy-boundary «GET /inventory/products serves the shared catalog without the central stock of private lots», «keeps the institutional catalog management»; current-auth-context «rejects forged authority fields and non-manager catalog mutations» |
| `GET /suppliers` · `POST`, `PATCH /:id` | 200 · 403 | 200 · 200/201 | 200 · 200/201 | 404 | `suppliers.controller.ts`; **sin compras** del tenant (`suppliers.use-case.ts:87`) | legacy-boundary «the supplier catalog carries no purchases of any farmer (catalog purpose only)» |

### 2.3 Rutas heredadas cerradas

| Ruta y acción | A | D | M | Código | Pruebas existentes |
|---|---|---|---|---|---|
| `GET /inventory/global-stock` | 403 | **403 `LEGACY_ROUTE_CLOSED`** | **403 `LEGACY_ROUTE_CLOSED`** | `inventory.controller.ts:157-166` | legacy-boundary «GET /inventory/global-stock is closed: no institutional role reads farmers» |
| `POST /purchases/joint` | 403 | **403 `LEGACY_ROUTE_CLOSED`**, sin efectos | **403 `LEGACY_ROUTE_CLOSED`**, sin efectos | `purchases.controller.ts:55-61` | legacy-boundary «POST /purchases/joint is closed and creates no purchase, lot, movement, debt, payment or event»; current-auth-context (líneas 279 y 470 del archivo) |

El camino institucional que sustituye a la compra conjunta es el **borrador** de propuesta (`/collective/…/proposals`, §2.6), que no crea compra, inventario, deuda ni pago y **no tiene ruta de ejecución**.

### 2.4 Operación privada heredada: sólo el agricultor, sobre lo propio

| Ruta y acción | A propio | A ajeno (mismo tenant) | D | M | Otro tenant | Código | Pruebas existentes |
|---|---|---|---|---|---|---|---|
| `/inventory`: `POST initial-stock`, `entries`, `exits`, `adjustments`; `GET lots`, `PATCH lots/:id`, `GET stock`, `alerts`, `movements` | 200/201 | 404; almacén o lote ajeno rechazado sin lotes ni movimientos nuevos | 403 | 403 | 404 | `@Roles(AGRICULTOR)` de método en `inventory.controller.ts:95,106,114,123,132,139,151,169,189` | legacy-boundary «institutional roles do not operate a private inventory from the Web»; current-auth-context «rejects A2 private Warehouse for A1 initial/entry stock without new lots or movements», «rejects moving A1 Lot into A2 private Warehouse without modifying the lot» |
| `GET /purchases`, `GET /purchases/:id`, `POST /purchases` | 200/201; un participante de una compra conjunta histórica ve **sólo su parte** | 404 | 403 | 403 | 404 | `purchases.controller.ts:28-53` | legacy-boundary «no institutional role lists or opens farmers», «a participant in a legacy joint purchase sees only their own part», «a participant sees only their own share of a historical joint purchase, never the group totals»; current-auth-context «enforces private application, purchase, payable, report and audit ownership», «rolls back individual purchase with A2 private Warehouse and all side effects» |
| `GET /accounts-payable`, `POST /:id/payments`, `/:id/pay-total` | 200/201 | **404**, también para otro participante de la misma compra conjunta | 403 | 403 | 404 | `@Roles(AGRICULTOR)` de clase, `accounts-payable.controller.ts:15` | legacy-boundary «no institutional role reads farmers» (deudas), «another farmer of the same joint purchase cannot pay farmer A», «the debt of a historical joint purchase shows the farmer» |
| `/applications`: `GET`, `GET /:id`, `POST`, `POST /:id/cancel` | 200/201 | 404 (parcela, lote o producto ajenos) | 403 | 403 | 404 | `@Roles(AGRICULTOR)` de clase, `applications.controller.ts:17` | legacy-boundary «no institutional role reads farmers» (aplicaciones y parcelas); current-auth-context «enforces private application…» |
| `/plots` (`GET`, `POST`, `PATCH /:id`, `POST /:id/deactivate`); `/plot-crop-assignments` (`GET`, `POST`, `PATCH /:id`) | 200/201 | 404 | 403 | 403 | 404 | `@Roles(AGRICULTOR)` de clase, `plots.controller.ts:29`, `plot-crop-assignments.controller.ts:17` | `f02-final-integration.postgres.spec.ts` «enforces cross-user, cross-tenant and authority-field isolation with a real JWT» (parcela propia frente a ajena); current-auth-context «rejects foreign related Plot, Crop, Campaign and Product IDs» |
| `/reports/*` (11 rutas `GET`) | 200; en `purchases/joint`, sólo su parte y su propia participación | sin filas ajenas | 403 | 403 | sin filas | `@Roles(AGRICULTOR)` de clase, `reports.controller.ts:14` | legacy-boundary «no institutional role reads the legacy per-farmer reports», «joint purchase reports give a participant their own share and count only their own participation» |
| `GET /sync/operations`, `POST /sync/operations` | 200/201 | sin filas ajenas | 403 | 403 | sin filas | `@Roles(AGRICULTOR)` de método, `sync.controller.ts:22-32`; sin sesión → 401 | legacy-boundary «legacy sync stays farmer-only (institutional 403, no session 401)» |

### 2.5 Rutas conservadas con vista institucional minimizada

| Ruta y acción | A | D y M | Código | Pruebas existentes |
|---|---|---|---|---|
| `GET /audit-logs` | entradas propias (propietario o actor) | **sólo entradas sin propietario** (campañas, catálogos compartidos); `ownerUserId` de la consulta se ignora; `actorUserId` sólo filtra dentro de ese conjunto | `list-audit-logs.use-case.ts:47-66` | legacy-boundary «the institutional audit view has no farmer»; `list-audit-logs.use-case.spec.ts` |
| `GET /calendar/events`; `POST /:id/complete`, `/:id/cancel` | propios; y los públicos sin dueño (`CIERRE_CAMPANA`) en lectura, sin poder completarlos ni cancelarlos | **sólo eventos sin dueño de tipo público** (`CIERRE_CAMPANA`), en lectura y cambio de estado. Los eventos derivados de lotes privados (vencimiento, stock bajo) se generan **sólo para su dueño**. Un `COMPRA_PROGRAMADA` heredado sin dueño no llega a nadie | `calendar-events.use-case.ts:13,56-63,236-262,268-283` (filtro dentro de un `AND` que ningún filtro del cliente anula) | legacy-boundary «the institutional calendar shows and changes only institutional events, and derives none from private stock», «a scheduled joint purchase event without owner reaches neither farmers nor institutional roles», «a farmer cannot complete or cancel a public event of the tenant», «the public campaign-closing calendar stays visible to farmers and institutional roles»; current-auth-context «keeps foreign users and CalendarEvent IDs invisible» |

### 2.6 Vista colectiva (objetivo F06/F07)

| Ruta y acción | A | D | M | Otro tenant | Sin sesión | Código | Pruebas existentes |
|---|---|---|---|---|---|---|---|
| `GET /collective/campaigns/:id/summary` y `summary.csv` | 403 | 200 | 200 | 404 (igual que inexistente) | 401 | `collective.controller.ts:21`; contenido según F07-POL-01 (`POLICY_PENDING` por defecto: sin cifras ni cobertura) | `f06-coll-05-collective-aggregate.postgres.spec.ts` «authorization: Directiva and ADMINISTRADOR of the tenant only» |
| `POST/GET /collective/campaigns/:id/proposals`, `GET /collective/proposals/:id`, `/:id/csv` | 403 | 200/201 | 200/201 | 404 | 401 | `joint-purchase-proposals.controller.ts:20`; **no existe ruta de ejecución** | `f07-web-proposal.postgres.spec.ts` «roles and tenant: DIRECTIVA and ADMINISTRADOR of the tenant; AGRICULTOR 403; other tenant 404; no session 401»; legacy-boundary «the joint purchase proposal has no execution route» |
| `GET /collective/product-associations`, `/catalog`; `POST`; `POST /:productId/close` | 403 | 200/201 | 200/201 | 404 | 401 | `product-associations.controller.ts:22` | `product-reconciliation.postgres.spec.ts`; legacy-boundary «campaigns, users and the collective F07 routes still answer…» |

### 2.7 Superficies privadas del agricultor desde su instalación móvil

| Ruta y acción | A propio | Ajeno / otro tenant | D | M | Contexto inválido | Código | Pruebas existentes |
|---|---|---|---|---|---|---|---|
| `GET /me/backups`, `POST /me/backups`, `GET /me/backups/:id/content`, `DELETE /me/backups/:id` | 200/201, con sesión Auth V2 de su instalación y registro de cliente activo | **404 indistinguible** (otro Member u otro tenant) | **403** | **403** | 401 (sin token, caducado); 403 (registro revocado, Member, cuenta o tenant inactivos; tenant o Member distintos de la sesión) | `BackupsAuthGuard` (`backups-auth.guard.ts`: `ver = 2`, Member `AGRICULTOR`, sesión y registro activos); consultas por `tenantId` y `memberId` de la sesión (`backups.service.ts:104,241,257`) | `backups.postgres.spec.ts` (22): «lists and serves only the owner…», «Directiva and Administrador of the same tenant have no access to private copies», «requires a live Auth V2 mobile session», «revoked client registration: 403», «inactive Member: 403», «inactive account (User): 403», «inactive tenant: 403», «expired session or expired token: 401», «token whose tenant or Member differs from the session: 403» |
| `POST /sync/v1/push`, `GET /sync/v1/operations/:operationId`, `GET /sync/v1/references` | 200, con sesión V2 enlazada a su registro | GET de una operación ajena o desconocida → **404** igual; el mismo `operationId` bajo otro Member es una clave independiente | **403** | **403** | 401 (credencial ausente o caducada); 403 (Member, cuenta o tenant inactivos, sesión o registro revocados, token V1) | `SyncV1AuthGuard` (`sync-v1-auth.guard.ts`) | `sync-v1-adversarial.postgres.spec.ts` C22/C40, C23, C24, «C31/C32 GET: owner sees ack and current state; others and unknown IDs get the same 404», «C34 the same operationId under another Member or tenant…», «C35 session without a linked ClientRegistration, V1 token, Directiva or Administrador: 403»; `sync-v1-references.postgres.spec.ts` |

`GET /health` es pública y no lee datos de negocio.

## 3. Lo que cambia respecto de `F02_AUTHORIZATION_MATRIX.md`

| Fila o párrafo de F02 (2026-09-24) | Decía | Estado vigente (2026-10-18, `df0df1d`) | Dónde se cambió |
|---|---|---|---|
| Inventory legacy | D/M «R/W temporal según ruta»; `global-stock` sólo D/M | D/M sólo gestionan el **catálogo** de productos; las operaciones de inventario son sólo de A; `global-stock` **cerrada** (403 `LEGACY_ROUTE_CLOSED`) | PR #118 (`bba1208`) |
| Plots, Assignments, Applications legacy | D/M «R temporal» cross-owner | **403** para D/M | PR #118 |
| Suppliers legacy | «R/W temporal»; A «R temporal» | catálogo compartido conservado (A lee; D/M escriben) **sin las compras** del tenant | PR #126 (`2ece555`) |
| Purchases legacy | D/M «R temporal» | **403** para D/M; un participante ve sólo su parte | PR #118 y #126 (`25d2a8f`) |
| Joint purchase legacy | D/M «W temporal» | **cerrada** (403 `LEGACY_ROUTE_CLOSED`, sin efectos); sustituida por el borrador de propuesta sin ejecución | PR #118 |
| Payables legacy | D/M «R/W temporal» | **403** para D/M; otro participante de la misma compra conjunta, 404 | PR #118 y #126 (`acb07af`, `75817f6`) |
| Calendar legacy | D/M «R/W temporal» | D/M sólo eventos sin dueño de tipo público; ningún evento derivado de datos privados ajenos | PR #118 y #126 (`9047b2a`) |
| Reports legacy y Payables report | D/M «R temporal» cross-owner | **403** para D/M | PR #118 |
| Audit | D/M «tenant-wide temporal» | D/M sólo entradas sin propietario | PR #118 |
| Users (`list` para D) | lista completa | vista reducida para D (id, nombre, rol, estado); completa para M | PR #126 (`eea07d3`) |
| Párrafo de campos: «`ownerUserId` en query es `FILTER_ONLY` para D/M sólo donde la fila permite lectura temporal» | había filas con lectura temporal | **ninguna fila permite ya lectura privada a D/M**, así que `ownerUserId` no concede nada a D/M; en `/audit-logs` se ignora. `actorUserId` sigue siendo `FILTER_ONLY` para D/M dentro de las entradas sin propietario | PR #118 |
| Aclaración: «La compra conjunta D/M conserva temporalmente su resolución legacy»; `warehouseId` de compra conjunta por asignación | ruta activa | la ruta está cerrada; el caso de uso y su validación de almacén se conservan compilados para la transición (`TRANSITION_PLAN.md`), sin alcance desde la API | PR #118 |
| Política de errores 401/403/404/400 y campos de autoridad | — | **siguen vigentes**, con un 403 adicional: `LEGACY_ROUTE_CLOSED` | — |

**No se concedió ningún permiso** para hacer coincidir el código con la matriz anterior: todas las diferencias van en el sentido de retirar acceso institucional a datos privados.

## 4. Hallazgos del contraste

1. **Sin prueba directa del 403 a DIRECTIVA en las escrituras de `/users` y en `GET /users/:id`.** El código lo impone (`@Roles(ADMINISTRADOR)` de clase en `users.controller.ts:30`; los métodos `create`, `get`, `update`, `password` y `deactivate` no lo sustituyen; `RolesGuard` usa `getAllAndOverride` con el método antes que la clase). Comprobado por lectura del código el 2026-10-18; **no** con una ejecución. Las pruebas existentes cubren el 200 de la lista para D y el 404 de otro tenant para M. Se propone una prueba negativa en una entrega aparte, si Roderich la pide; no cambia el comportamiento.
2. **Código muerto, sin efecto, en el calendario.** `syncLotExpirationEvents` y `syncLowStockEvents` conservan una cláusula `ownerUserId` para roles institucionales (`calendar-events.use-case.ts:73` y `110`; las líneas 72 y 109 son la cláusula del agricultor, que sí se aplica), pero sólo se llaman cuando el actor es AGRICULTOR (líneas 59-62), así que nunca se aplica. La lectura institucional está protegida por `buildVisibleWhere` (líneas 268-283). No es un acceso; se anota para la limpieza de la PHASE 9.
3. **Ningún hueco de autorización** encontrado en las 23 superficies leídas: cada ruta que toca datos privados es sólo de AGRICULTOR sobre lo propio, está cerrada, o sirve a D/M una vista sin propietario.

## 5. Web (sólo como referencia)

La Web dejó de ser cliente operativo del agricultor (PR #127, `9df7888`): un AGRICULTOR que entra es enviado a `/sin-acceso-web`, y DIRECTIVA y ADMINISTRADOR ven sólo el menú colectivo. **Ocultar en la Web no es el control:** la autorización la decide la API, como en esta matriz. Comprobado en navegador en la compatibilidad Web, serie 2 (`docs/evidence/F10_COMPATIBILIDAD_WEB_S2.md`, W1, procedencia HOST).

## 6. Límites

- Matriz de la **API del Backend** en `cab433d`; consumidores externos o desplegados fuera de estos repositorios siguen como `INSUFFICIENT_EVIDENCE` (`LEGACY_CONTRACT_CONSUMERS.md`).
- Las escrituras heredadas del agricultor (`POST /purchases`, inventario, parcelas, aplicaciones, pagos propios, `/sync/operations`) siguen activas sobre lo propio; su bloqueo es la PHASE 6 del plan de transición y no corresponde a #44.
- La política de divulgación del agregado (F07-POL-01, #107) decide el **contenido** de las rutas colectivas; esta matriz sólo decide **quién** llega a ellas.

## 7. Nota del 2026-10-19 sobre los respaldos (sin reescribir lo anterior)

La añadió la sesión B de Claude Code el 2026-10-19, a raíz del desfase que encontró C en la revisión de BE #153. Lo detalla `../evidence/F10_CONTRASTE_81_Y_VALIDATION.md`, fila 44-2.

- **Base:** BE #148 (retención, merge `f0b55ee`) cambió `backups.service.ts` y `backups.postgres.spec.ts` después de que se escribiera esta matriz sobre `cab433d`.
- **La autorización no cambia.** La fila de `/me/backups` (§2.7) sigue valiendo: las mismas respuestas por actor y el mismo `BackupsAuthGuard`, y todas las consultas filtran por el `tenantId` y el `memberId` de la sesión.
- **Referencias vigentes en `f0b55ee`:**
  - **Consultas:** `backups.service.ts:126, 266-267, 334, 348, 392-393, 410-411 y 428`. Sustituyen a `:104,241,257` de la fila, que ahora apuntan a otras líneas.
  - **Pruebas:** `backups.postgres.spec.ts` tiene **21** casos, no 22, porque #148 sustituyó el del 409 `BACKUP_QUOTA_EXCEEDED`. La separación por Member en la rotación la cubre además `retention.backups.postgres.spec.ts`, con el caso C4: dos Members suben a la vez y cada uno sólo rota sus propias copias.
- **El 409 cambió de significado:** ahora es `BACKUP_UPLOAD_IN_PROGRESS`, por otra subida del mismo Member en curso, y el 503 incluye las purgas pendientes por encima del cupo (`backups.controller.ts`). No son respuestas de autorización.
- No se ejecutó ninguna suite para esta nota: los recuentos salen de contar los `it(` del archivo.

## 8. Nota del 2026-10-19 sobre la fase 6 de #81 (sin reescribir lo anterior)

La añadió la sesión C de Claude Code el 2026-10-19, en la rama `feat/f81-fase6-cierre-escrituras` sobre `main` `c9d9992`. El detalle está en `../evidence/F81_FASE6_CIERRE_ESCRITURAS.md`.

- **Qué cambia en §2.4:** las 16 escrituras privadas heredadas del AGRICULTOR responden ahora **403 `LEGACY_ROUTE_CLOSED`** al AGRICULTOR, sin efectos.
  - Son: `POST /inventory/initial-stock`, `entries`, `exits` y `adjustments`; `PATCH /inventory/lots/:id`; `POST /purchases`; `POST /accounts-payable/:id/payments` y `pay-total`; `POST /applications` y `:id/cancel`; `POST /plots`, `PATCH /plots/:id` y `POST /plots/:id/deactivate`; `POST` y `PATCH /plot-crop-assignments`; y `POST /sync/operations`.
  - Las filas de §2.4 describen esas rutas en el camino de rollback del servidor (`LEGACY_PRIVATE_WRITES_ROLLBACK=enabled`). Ese camino no es la vía normal y no autoriza ningún despliegue.
- **Lo que no cambia:**
  - las lecturas (`GET`) de §2.4;
  - el 401 sin sesión;
  - el 403 de rol de la Directiva y del Administrador;
  - §2.5 (`calendar/events` incluido) y las rutas centrales.
- **Pruebas:**
  - el cierre: `f81-phase6-legacy-writes.postgres.spec.ts`;
  - las pruebas que cita §2.4 (legacy-boundary, current-auth-context y f02-final-integration) corren ahora con el rollback activo, así que prueban la propiedad de ese camino.
