# #81, fase 6 limitada: cierre reversible de las escrituras privadas heredadas — 2026-10-19

**Ficha:**
- **Decisión:** de Roderich Rendón, «Decisiones sobre el contraste» §4, del 2026-10-19, transmitida por la sesión A. Entra en el alcance académico el cierre reversible de las escrituras privadas heredadas, en un único *slice*. No se retiran tablas, modelos ni datos, no hay DROP y no se reescribe ninguna migración.
- **Preparado por:** la sesión C de Claude Code. Revisa la sesión B. Es una verificación técnica automatizada, sin revisión personal de Roderich ni del tutor.
- **Base:** Backend `main` `c9d9992` (código igual a `f0b55ee`). Mobile `463d3ec`, sólo leído.
- **Rama:** `feat/f81-fase6-cierre-escrituras` (Refs #81, que sigue abierta).
- **Fuentes:**
  - `docs/scope/TRANSITION_PLAN.md` (PHASE 6);
  - `docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` §2.4;
  - `docs/evidence/F10_CONTRASTE_81_Y_VALIDATION.md`, filas 81-3 y 81-M;
  - `docs/scope/LEGACY_CONTRACT_CONSUMERS.md`.

## 1. Qué se cierra y qué no

### 1.1 Las 16 escrituras cerradas

Todas tienen `@Roles(AGRICULTOR)` y actúan sólo sobre lo propio del agricultor. El inventario sale de los `@Post`, `@Patch`, `@Put` y `@Delete` de todos los controladores de `Back/src`.

| Controlador | Rutas cerradas |
|---|---|
| `inventory.controller.ts` | `POST /inventory/initial-stock`, `POST /inventory/entries`, `POST /inventory/exits`, `POST /inventory/adjustments`, `PATCH /inventory/lots/:id` |
| `purchases.controller.ts` | `POST /purchases` |
| `accounts-payable.controller.ts` | `POST /accounts-payable/:id/payments`, `POST /accounts-payable/:id/pay-total` |
| `applications.controller.ts` | `POST /applications`, `POST /applications/:id/cancel` |
| `plots.controller.ts` | `POST /plots`, `PATCH /plots/:id`, `POST /plots/:id/deactivate` |
| `plot-crop-assignments.controller.ts` | `POST /plot-crop-assignments`, `PATCH /plot-crop-assignments/:id` |
| `sync.controller.ts` | `POST /sync/operations` (la cola heredada; Sync v1 no cambia) |

### 1.2 Lo que no se cierra

**No se bloquea ningún controlador entero.** Siguen abiertas:
- **Las lecturas (`GET`) de esas mismas rutas**, para consultar el histórico. Conservan su autorización actual.
- **Las funciones centrales autorizadas:**
  - campañas;
  - catálogo de productos y su configuración (`/inventory/products…`, Directiva y Administrador);
  - cultivos y proveedores;
  - colectivo y asociaciones;
  - usuarios;
  - autenticación;
  - registros de cliente;
  - respaldos (`/me/backups`);
  - Sync v1 (`/sync/v1/*`).
- **`POST /calendar/events/:id/complete` y `:id/cancel`: no se incluyen porque la ruta es mixta.** El agricultor cambia ahí sus eventos, pero la Directiva y el Administrador cambian los eventos públicos sin dueño (`CIERRE_CAMPANA`), que es una función institucional vigente (matriz §2.5). Cerrarla exigiría distinguir por rol dentro de la ruta. Queda declarada como no incluida.
- **`GET /inventory/global-stock` y `POST /purchases/joint`:** ya estaban cerradas desde F10-SEC-02 con `LegacyRouteClosedGuard`, que no tiene rollback y no cambia.

## 2. Mecanismo

- **Guard:** `LegacyPrivateWriteGuard`, en `Back/src/shared/api/legacy-private-writes.ts`. Se aplica por método con el decorador `@LegacyPrivateWrite(…)`.
  - Responde **403 con `message` `LEGACY_ROUTE_CLOSED`**, el mismo código que las rutas cerradas en F10-SEC-02.
  - Corre después de los guards globales `JwtAuthGuard` y `RolesGuard`:
    - sin sesión, sigue el 401;
    - la Directiva y el Administrador siguen con su 403 de rol;
    - sólo el AGRICULTOR recibe `LEGACY_ROUTE_CLOSED`.
  - Corre antes de cualquier *pipe* o *handler*: no se lee ni se escribe nada.
- **Rollback operativo, sólo del servidor:**
  - La variable es `LEGACY_PRIVATE_WRITES_ROLLBACK`, validada en `env.schema.ts`. Sólo admite `enabled` o `disabled`, y vacía equivale a `disabled`.
  - Con `enabled`, todas las rutas recuperan su comportamiento anterior, incluidas sus comprobaciones de propiedad, y el arranque registra un aviso.
  - **No depende de ningún parámetro del cliente.**
  - **No es la vía normal, no autoriza ningún despliegue ni producción, y no reabre las rutas de F10-SEC-02.**
- **Qué se conserva:** rutas, casos de uso, modelos, tablas, datos y migraciones. **No hay migración nueva.** Revertir el *slice* también es posible revirtiendo su commit.

## 3. Consumidores (reauditoría estática del 2026-10-19)

- **Mobile `463d3ec`:** `git grep` en `lib/` de las rutas heredadas no devuelve ningún archivo. Las únicas rutas `api/v1/…` que nombra son:
  - `auth/clients`;
  - `auth/v2/{login,logout,me,refresh,session/client}`;
  - `me/backups`;
  - `sync/v1/{operations,push,references}`.

  El resultado es el mismo que el de `F10_CONTRASTE_81_Y_VALIDATION.md` §3.1.
- **Web del mismo `main`:** los servicios `inventory`, `procurement`, `accounts-payable`, `applications`, `plots` y `sync` llaman a las 16 rutas. Sólo los usan las pantallas heredadas del agricultor, que están tras `FarmerRoute` y únicamente se ofrecen si la Web se compila con `VITE_LEGACY_FARMER_WEB=enabled`.
- **Límite:** es una búsqueda estática. **No demuestra que no haya clientes externos o desplegados** fuera de estos repositorios (siguen como `INSUFFICIENT_EVIDENCE`). Los ensayos se hicieron sólo en entornos nuevos y desechables, sin tocar ninguna instalación ajena.

### 3.1 Compatibilidad con `VITE_LEGACY_FARMER_WEB`

Ese flag es el rollback de la PHASE 5 en la Web: vuelve a mostrar las pantallas del agricultor. **Con el Backend cerrado, esas pantallas no vuelven a funcionar para escribir.** Cada guardado recibe 403 `LEGACY_ROUTE_CLOSED`, aunque las lecturas sí responden. Para que la Web histórica escriba hacen falta **los dos** rollbacks: el flag de la Web al compilar y `LEGACY_PRIVATE_WRITES_ROLLBACK=enabled` en el servidor. Ninguno de los dos está autorizado como vía normal.

## 4. Pruebas

### 4.1 Suite nueva: `Back/src/modules/f81-phase6-legacy-writes.postgres.spec.ts`

Usa dos aplicaciones sobre la misma base PostgreSQL desechable:
- `closed`, con la configuración por defecto;
- `rollback`, con el rollback activo.

Todos los datos son sintéticos. Se añadió al workflow `backend-f02.yml`.

| Caso | Qué comprueba |
|---|---|
| Cierre por ruta | Las 16 rutas, con un cuerpo **válido**, dan al AGRICULTOR 403 `LEGACY_ROUTE_CLOSED`. **No cambia nada persistido:** ni el conteo de 15 tablas (compras, ítems, lotes, movimientos, cuentas por pagar, pagos, aplicaciones, parcelas, asignaciones, operaciones de sync heredadas, auditoría, calendario, proveedores, productos y almacenes), ni las filas completas de lotes, cuentas por pagar, aplicaciones, parcelas, asignaciones y productos |
| Orden de los guards | En las 16 rutas: sin token, 401; Directiva y Administrador, 403 de rol, **no** `LEGACY_ROUTE_CLOSED`. Sin efectos |
| Lecturas | `GET` de lotes, existencias, movimientos, compras, cuentas por pagar, aplicaciones, parcelas, asignaciones y operaciones de sync: 200 para el AGRICULTOR, con sus datos. La Directiva sigue con 403 en `GET /purchases` |
| Funciones que siguen | Auth V2 (`/auth/v2/me`); Sync v1 (`references`, y un `operations/:id` desconocido da 404); respaldos (`GET /me/backups`); catálogo (`POST` y `PATCH /inventory/products`); proveedores; cultivos; campañas; resumen colectivo |
| Rollback: propiedad | Otro agricultor recibe el **404 anterior** al pagar la deuda de A, editar su parcela o su lote, o anular su aplicación. Sin efectos |
| Rollback: roles | Sin token, 401; Directiva, 403 de rol |
| Rollback: comportamiento anterior | Las 16 rutas devuelven al dueño su código anterior (201 o 200, según la ruta) y aplican el cambio: el lote se renombra y la aplicación queda `ANULADA` |

`Back/src/shared/api/legacy-private-writes.spec.ts` (unidad) comprueba tres cosas:
- el valor por defecto es «cerrado» (vacía y `disabled`);
- `env.schema` rechaza cualquier valor distinto de `enabled` o `disabled`;
- el guard rechaza o deja pasar según la configuración.

### 4.2 Suites de propiedad que pasan al camino de rollback

**Atención:** estas tres suites escriben por las rutas cerradas, así que ahora corren con el rollback activo. Para eso se sustituye el proveedor `LegacyPrivateWritesConfig`, sin tocar el entorno. **Prueban la propiedad del camino de rollback, no la del camino por defecto.** El camino por defecto lo prueba la suite de §4.1.
- `f10-sec-02-legacy-boundary.postgres.spec.ts` (29);
- `current-auth-context.postgres.spec.ts` (25);
- `f02-final-integration.postgres.spec.ts` (3).

Sus aserciones no cambian: los 403 y 404 vigentes son los mismos. Las demás suites con PostgreSQL (Sync v1, respaldos, colectivo, Auth V2…) corren en CI con la configuración por defecto, es decir, con el cierre activo.

### 4.3 Resultados locales

Entorno: el 2026-10-19, entre las ~20:30Z y las 20:54Z (cierre registrado con `date -u`), con Node 25.9.0 y PostgreSQL 16.13 en un contenedor local desechable.

**Qué árbol se probó en cada caso:**
- **Árbol final, igual al `Back/` de `8522912`:** `tsc`, la prueba de unidad, la suite nueva y `openapi:check` (los 10 casos de las dos primeras, tras el último cambio de código).
- **Árbol intermedio:** las tres suites de propiedad. Era el árbol anterior a agrupar `@UseGuards` y `@ApiForbiddenResponse` en el decorador `@LegacyPrivateWrite`, un cambio que no altera el guard.
- **El árbol final completo** pasó en el CI del PR: run 39323519607 (`verify`, sobre `f884d84`), que incluye las tres suites de propiedad y la nueva.

```text
npx tsc --noEmit -p tsconfig.json                                          → sin errores
npx jest src/shared/api/legacy-private-writes.spec.ts                       → 3/3
F10_SEC_PG_TEST_URL=<base> npx jest f81-phase6-legacy-writes.postgres.spec.ts --runInBand → 7/7
F10_SEC_PG_TEST_URL=<base> npx jest f10-sec-02-legacy-boundary.postgres.spec.ts --runInBand → 29/29
F02_D_PG_TEST_URL=<base> npx jest current-auth-context.postgres.spec.ts --runInBand   → 25/25
F02_FINAL_PG_TEST_URL=<base> npx jest f02-final-integration.postgres.spec.ts --runInBand → 3/3
npm run openapi:check                                                       → F02, F05, F06 y F08 passed
```

**Mutación (local, revertida):** sin el guard en `POST /purchases`, falla «every legacy private write answers 403 LEGACY_ROUTE_CLOSED…» (1 de 7).

La suite completa se ejecuta en el CI del PR.

### 4.4 OpenAPI

Comando de regeneración: `npm run openapi:generate` (en `Back/`, con `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET` en el entorno).

El diff de `docs/api/openapi-f02.json` **se limita a las respuestas 403 de las 16 rutas:**
- 14 respuestas `403` nuevas;
- 2 descripciones de 403 sustituidas: `POST /purchases` y `POST /sync/operations`, que ya declaraban un 403 de rol.

Las respuestas 200 y 201 se conservan tal como estaban. Los demás snapshots no cambian.

## 5. Lo que este slice no hace

- **Es reversible:** no elimina la base central, ni tablas, ni modelos, ni datos.
- **No demuestra ni autoriza ningún paso *contract*.** Antes de uno siguen haciendo falta un ciclo probado de copia y restauración de PostgreSQL y cero consumidores en el HEAD de ese momento (manual técnico §9.3; fila 81-M).
- **Quedan diferidos:**
  - los modelos y tablas históricos;
  - el *forecasting* residual del esquema (`DemandForecast`);
  - los *payables* y pagos centrales: sus escrituras quedan cerradas, pero los modelos y las lecturas siguen;
  - la cola Web antigua (`offline-queue.ts`) y las pantallas heredadas;
  - `calendar/events` (§1.2).
- **No es parte del piloto:** la app no usa ninguna de estas rutas, y T1–T6 y W1–W5 no cambian.
- **Riesgo productivo restante:** las lecturas privadas heredadas siguen abiertas para el propio agricultor. Se pueden activar los dos rollbacks, uno en el servidor y otro en la Web, pero ninguno está autorizado como vía normal.
