# F10-SEC-02 — Rutas heredadas en la frontera privada/colectiva (#45, #81)

Revisión técnica de la sesión B (F10), del 2026-10-16. Es automatizada y no tiene revisión personal de Roderich ni del tutor, ni aprobación institucional. La política de divulgación F07-POL-01 sigue sin aprobar: producción y cifras reales siguen deshabilitadas.

**#45 no queda completa.** Esta entrega corrige el subconjunto de rutas heredadas descrito en la §3. Lo que queda pendiente está en la §8.

## 1. Identificación

| Campo | Valor |
|---|---|
| Rama | `fix/f10-sec-02-rutas-legacy` (worktree `_wt/F10-SEC-B`) |
| Base | Backend/Web `main` `e02793809502b5da0b0638802f2fbec5be8c0f86` (#115, #116, #114, #117) |
| Reproducción (sólo pruebas) | `9bd4d4d` |
| Correcciones | `bba1208` (Backend), `94d19e5` (Web) |
| Pruebas ajustadas | `eced37f` y `11a852f` (prueba de `App.tsx` en archivo propio, leída con `?raw`), `df17ab9` (pruebas F02 de compra conjunta, §4.3) |
| Revisión de la sesión A (2026-10-16) | Pruebas `37c99c8` (rojo antes del arreglo) y corrección `8b41f7f`: conteos privados en campañas y cultivos, filtros por agricultor inútiles y nits (§4.4) |
| Último commit de código | `8b41f7f`; lo que sigue son sólo documentos y evidencia |
| Mobile revisado (sólo lectura) | `4f203c7` (`main`) |
| Datos | sintéticos, en bases PostgreSQL nuevas del contenedor local `agro_b_web_pg` (127.0.0.1:55442) |

## 2. Fuentes y criterio

- **Fuentes:**
  - `CURRENT_SCOPE.md` §3–§5, §9 y §10;
  - `DATA_BOUNDARY_MATRIX.md`, `LEGACY_CONTRACT_CONSUMERS.md` y `TRANSITION_PLAN.md`;
  - ADR-001 y ADR-003;
  - los contratos F05 (Sync v1) y F06 (proyección colectiva), y la política F07;
  - los hallazgos 1–3 que la sesión B registró en #45.
- **Criterio (ADR-003, RU-18):** el ADMINISTRADOR del tenant ejerce las funciones de DIRECTIVA, pero ni DIRECTIVA ni ADMINISTRADOR obtienen acceso a las operaciones privadas de los agricultores por su rol. La vista institucional es la colectiva (`/collective/*`), sujeta a la política de divulgación.
- **Datos sintéticos frente a permiso.** Las tablas heredadas (`InventoryLot`, `StockMovement`, `Purchase`, `PayableAccount`, `Payment`, `AgrochemicalApplication`, `Plot`, `CalendarEvent` y `AuditLog`) contienen hoy datos de demostración y de prueba. Que sean sintéticos no hace legítimo el permiso: una ruta que deja a la Directiva leer o cambiar esos registros seguiría haciéndolo con datos reales el día que existan. Por eso se corrige el **permiso** y no sólo el contenido. Ningún contrato vigente autoriza centralizar esos datos para la vista institucional: el F06 sólo admite proyecciones mínimas, y Mobile es el sistema de registro individual (ADR-001).
- **Alcance.** Se revisan los controladores heredados que aparecen en la evidencia (ADR-003 y #45) y los que tienen una dependencia concreta con ellos:
  - el calendario, porque la compra conjunta heredada crea eventos;
  - las parcelas, porque las aplicaciones y los reportes las referencian.

  No se amplía a otros módulos. Respaldos (`/me/backups`, sesión C), IAM y Sync v1 quedan fuera, salvo para comprobar que las funciones institucionales siguen respondiendo.

## 3. Matriz de rutas revisadas

**Abreviaturas:** D = DIRECTIVA, A = ADMINISTRADOR, F = AGRICULTOR. «Dueño» significa que el caso de uso filtra por `ownerUserId`/`responsibleUserId` = usuario autenticado. Todas las rutas filtran por el `tenantId` del token, nunca por uno enviado por el cliente.

**Consumidores.** Mobile `4f203c7` no consume ninguna de estas rutas: en `lib/` sólo aparecen `api/v1/auth/*`, `api/v1/me/backups` y `api/v1/sync/v1/*`, y las coincidencias con «purchases» o «applications» son tablas SQLite locales. Los consumidores Web son los que figuran en cada fila.

| # | Ruta | Método | Roles antes → después | Tenant / propietario | Consumidor real | Campos o efecto | Contrato vigente | Riesgo | Disposición |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/inventory/products` | GET | F, D, A → **sin cambio** | tenant | Web inventario, `/directiva`, reconciliación heredada | Catálogo **más `currentStock`**: la suma del stock de los lotes privados de todos los agricultores (58 en la prueba) | Catálogo compartido (CURRENT_SCOPE §4); el stock es privado (§3, §10) | Alto: un agregado sin política de divulgación, visible incluso para otro agricultor | **Minimizada:** ya no se sirve `currentStock`. Ninguna página lo leía; el tipo Web se corrige |
| 2 | `/inventory/products`, `/:id`, `/:id/deactivate`, `/:id/settings` | POST, PATCH | D, A → **sin cambio** | tenant | Web inventario | Alta y edición del catálogo compartido (mínimo de stock y aviso de vencimiento por producto) | Catálogo compartido | Bajo (sin datos privados). La respuesta tampoco lleva `currentStock` | **Se conserva** (función institucional) |
| 3 | `/inventory/global-stock` | GET | D, A → **cerrada (403 `LEGACY_ROUTE_CLOSED`)** | tenant, **todos los dueños** | Web `/directiva` (`globalStock`) | Lotes de cada agricultor con nombre, correo, proveedor, número de lote, vencimiento y cantidad | Ninguno: no es un agregado autorizado (F06, F07-POL-01) | Crítico: inventario individual detallado | **Cerrada.** Sustituto: `/collective/campaigns/:id/summary` |
| 4 | `/inventory/initial-stock`, `/entries`, `/exits`, `/adjustments` | POST | F, D, A → **F** | dueño | Web inventario (agricultor) | Crea lotes, movimientos y ajustes del autenticado: D o A podían operar un inventario privado propio desde la Web | Operación individual en Mobile; la Web no es cliente operativo | Medio: la Web actúa como segundo cliente operativo; un rol institucional opera inventario | **Sólo F** (dueño, legacy) |
| 5 | `/inventory/lots`, `/lots/:id`, `/stock`, `/alerts`, `/movements` | GET, PATCH | F, D, A → **F** | dueño | Web inventario y dashboard (agricultor) | Lotes y movimientos propios | Igual que la fila 4 | Medio | **Sólo F** |
| 6 | `/purchases/joint` | POST | D, A → **cerrada (403)** | tenant; crea efectos para los agricultores participantes | Web `/directiva` (`createJoint`) | **Ejecuta** una compra conjunta: `Purchase`, `PurchaseItem`, asignaciones, `InventoryLot`, `StockMovement`, `PayableAccount` por agricultor y `CalendarEvent` | CURRENT_SCOPE §9: la propuesta no crea compra, inventario, deuda ni pago | Crítico: salta la decisión humana y crea efectos individuales automáticos | **Cerrada.** Camino válido: borrador `/collective/campaigns/:id/proposals`. Caso de uso, tablas y migraciones se conservan |
| 7 | `/purchases`, `/purchases/:id` | GET | F, D, A → **F** | D/A: **tenant completo**; F: creador o participante | Web compras (F), `/directiva` (`list CONJUNTA`) | Compras individuales con proveedor, costos, notas, participantes (nombre, correo, montos) y deudas | Compra individual = Mobile | Alto | **Sólo F.** Además, un participante de una compra conjunta heredada ve **sólo su participación y su deuda** (antes veía las del resto de participantes) |
| 8 | `/purchases` | POST | F → sin cambio | dueño | Web compras (F) | Compra individual del autenticado | Legacy, sin expansión | Medio (Web operativa del agricultor, #23/#81) | **Sin cambio** en este PR; su retirada sigue el TRANSITION_PLAN (PHASE 5–6) |
| 9 | `/accounts-payable` | GET | F, D, A → **F** | D/A: tenant completo; F: dueño | Web `/directiva`, dashboard, compras | Deudas, saldos y vencimientos de cada agricultor | Deudas y pagos sin target Live (CURRENT_SCOPE §9, §11) | Crítico | **Sólo F** (dueño, legacy) |
| 10 | `/accounts-payable/:id/payments`, `/:id/pay-total` | POST | F, D, A → **F** | D/A: **cualquier deuda de una compra conjunta**; F: dueño | Web `/directiva` (`registerPayment`, `payTotal`) | Registra pagos y cambia saldos en deudas ajenas | Ídem | Crítico: escritura financiera sobre datos privados ajenos | **Sólo F.** Otro agricultor sigue recibiendo 404 |
| 11 | `/applications`, `/applications/:id` | GET | F, D, A → **F** | D/A: tenant completo con filtro `ownerUserId`; F: dueño | Web aplicaciones (F) | Parcela (con ubicación), cultivo, dosis, plaga, clima y notas | Registro Mobile más proyección agregada aprobada | Alto | **Sólo F** (las escrituras ya lo eran) |
| 12 | `/plots`, `/plot-crop-assignments` | GET | F, D, A → **F** | D/A: tenant completo con `ownerUserId`; F: dueño | Web parcelas y aplicaciones (F) | Parcela, ubicación, área y notas | Parcela = Mobile; ubicación excluida (§10) | Alto | **Sólo F** (las escrituras ya lo eran) |
| 13 | `/crops` | GET, POST, PATCH | GET F, D, A; escritura D, A → **sin cambio de roles** | tenant | Web parcelas (pestaña de cultivos) | Catálogo de cultivos **más `summary`**: conteos de todo el tenant de asignaciones y aplicaciones privadas | «Catálogo Crop central» (LEGACY_CONTRACT_CONSUMERS) | Medio: agregado sin política; quien conoce lo propio deduce lo ajeno | **Se conserva el catálogo. Minimizado:** sin `summary` (`8b41f7f`). La columna «Uso» de la Web desaparece |
| 14 | `/reports/*` (11 rutas) | GET | F, D, A → **F** | D/A: tenant completo, con `ownerUserId` opcional (por agricultor); F: dueño | Web reportes (F) | Inventario por agricultor, compras, aplicaciones por parcela, consumo, vencidos, deudas y pagos, y bitácora | Reportes colectivos minimizados (#79/#80/#81) | Alto: por agricultor y fuera de la política de divulgación | **Sólo F.** En `/reports/purchases/joint`, un participante ve sólo su parte. La vista institucional es `/collective/*` |
| 15 | `/audit-logs` | GET | F, D, A → **sin cambio de roles** | D/A: tenant completo con `before`/`after`; F: dueño o actor | Web `/audit-logs` (D, A; fuera del menú) | Antes y después de operaciones privadas (parcelas, stock, aplicaciones) | «Auditoría autorizada» (CURRENT_SCOPE §5) y minimizada (§4) | Alto | **Minimizada:** D y A ven sólo entradas **sin propietario** (campañas, catálogo de cultivos). Se ignora `ownerUserId`; `actorUserId` sólo filtra dentro de ese conjunto |
| 16 | `/calendar/events` y `/:id/complete`, `/:id/cancel` | GET, POST | F, D, A → **sin cambio de roles** | D/A: tenant completo con `ownerUserId` (lectura y cambio de estado); F: dueño y eventos sin dueño | Web calendario | Eventos privados (aplicación, pago próximo, lote por vencer). El GET institucional **generaba** eventos a partir del stock privado de todos | Sin target Live (retiro controlado) | Medio/alto: lectura y escritura sobre eventos ajenos | **Minimizada:** D y A ven y cambian sólo eventos sin dueño (cierre de campaña) y no generan eventos derivados de lotes ajenos |
| 17 | `/sync/operations` | GET, POST | F → **sin cambio** | dueño | Web `/sync` y `offline-queue.ts` (F) | Operaciones offline heredadas | Sustituido por Sync v1 (F05) | Crítico para el agricultor (payload abierto), pero **no** institucional | **Comprobado:** D y A 403, sin sesión 401. La retirada de la cola Web sigue en #23/#81 |
| 18 | `/campaigns`, `/campaigns/active` y escrituras (crear, editar, abrir, cerrar) | GET, POST, PATCH | sin cambio de roles (GET F, D, A; escritura D, A) | tenant | Web campañas y selector de campaña | Campañas compartidas **más `summary`**: conteos de todo el tenant de compras, movimientos, aplicaciones, deudas y asignaciones privadas | Backend autoridad de campañas; los conteos son un agregado de datos privados sin política (§10) | **Medio/alto** (antes figuraba como «Bajo» por error): con dos agricultores, uno resta lo suyo y obtiene las compras y deudas del otro | **Se conserva la función institucional. Minimizado:** sin `summary` para ningún rol (`8b41f7f`). La Web deja de mostrar «N cultivos · N mov. · N compras» |
| 19 | `/users` | GET y escrituras | GET D, A; escritura A → sin cambio | tenant | Web usuarios (A) | Identidad y roles | IAM (F02) | Bajo | **Se conserva** (administración de accesos, ADR-003) |
| 20 | `/collective/*` (resumen, CSV, propuestas, reconciliación, catálogo) | GET, POST | D, A → sin cambio | tenant | Web F07 | Agregados según F07-POL-01 | F06, F07 | Controlado por la política | **Se conserva.** No existe ruta de ejecución de la propuesta (404) |

### Rutas Web

| Ruta Web | Antes | Después | Motivo |
|---|---|---|---|
| `/inventory`, `/purchases`, `/sync` | `FarmerRoute`: F y **A** (sólo excluía D) | `FarmerRoute`: **sólo F**; D y A van a su vista colectiva | Hallazgo 3 de #45 |
| `/plots`, `/applications`, `/reports`, `/dashboard` | `PrivateRoute`: cualquier rol | `FarmerRoute` | La API ya responde 403 a D y A; la pantalla ya no las muestra |
| `/directiva` | D y A: `globalStock`, `createJoint`, `registerPayment`/`payTotal` | Redirige a `/colectivo/propuestas`. `directiva.page.tsx` se conserva, pero no se renderiza | Hallazgo 2 de #45 |
| `/users` (`AdminRoute`) | D iba a `/dashboard` | D va a su vista colectiva | Coherencia de la navegación |
| `/audit-logs`, `/calendar`, `/campaigns` | sin cambio | sin cambio | El servidor minimiza (filas 15–16) |

**Ocultar no basta.** Cada fila corregida se comprueba en la API, no en el menú.

**Rollback.** Cada corrección es un `git revert` de su commit: `bba1208` en el Backend, `94d19e5` en la Web y `8b41f7f` para los conteos de campañas y cultivos y los filtros. Las pruebas de `9bd4d4d`, `eced37f`, `11a852f`, `df17ab9` y `37c99c8` se revierten con ellas. No hay migraciones, cambios de esquema ni variables de entorno nuevas. Los casos de uso cerrados (`CreateJointPurchaseUseCase`, `listGlobalStock`) siguen compilados y se reactivan quitando la guarda.

## 4. Reproducción negativa (antes) y verificación (después)

**Suite:** `Back/src/modules/f10-sec-02-legacy-boundary.postgres.spec.ts` (20 pruebas, `F10_SEC_PG_TEST_URL`).

**Escenario sintético:**
- tenant A con dos agricultores (A, A2), DIRECTIVA y ADMINISTRADOR, más una DIRECTIVA y un agricultor del tenant B;
- compra individual a crédito de A, por la API;
- compra conjunta heredada con A y A2, creada por el caso de uso y no por la ruta cerrada;
- parcela con ubicación marcada, aplicación con nota marcada, evento privado y entrada de bitácora privada, más un evento y una entrada institucionales.

**Qué comprueba cada prueba:**
- el código de estado;
- que ninguna respuesta contiene las marcas, ni el correo o el id del agricultor A;
- en las escrituras, que no cambia el número de compras, lotes, movimientos, deudas, pagos, eventos ni participantes.

```text
# Reproducción: el código de e027938 con las pruebas finales (HEAD eced37f)
git checkout e027938 -- Back/src Web/src
git checkout eced37f -- Back/src/modules/f10-sec-02-legacy-boundary.postgres.spec.ts \
  Web/src/app-routes.test.ts Web/src/pages/joint-proposal.page.test.tsx Web/src/pages/collective-summary.page.test.tsx
# (se retiran los archivos nuevos de la corrección: legacy-route-closed.guard.ts, farmer-route.tsx y su test)
cd Back && F10_SEC_PG_TEST_URL=postgresql://agro@127.0.0.1:55442/agro_b npx jest src/modules/f10-sec-02-legacy-boundary.postgres.spec.ts --runInBand
cd ../Web && npx vitest run
git checkout HEAD -- Back/src Web/src
```

### 4.1 Antes: `e027938`, 2026-10-16 20:08:25–20:08:38Z

**Backend: 12 fallan y 8 pasan.** Cada fallo es un hallazgo:

| Prueba | Resultado contra `e027938` |
|---|---|
| Catálogo sin stock central | `currentStock: "58"`, la suma de los lotes de los agricultores |
| Catálogo institucional | la respuesta del alta incluye `currentStock` |
| `global-stock` cerrada | D: **200**, con lotes de A |
| `/purchases/joint` cerrada | D: **201**; crea compra, lotes, movimientos, deudas y eventos |
| Deudas y pagos | D: GET `/accounts-payable` **200** |
| Compras para D y A | `list` **200** y `one` **200** |
| Participante ve sólo su parte | A2 recibe también el id de A en participantes y deudas |
| Inventario operativo institucional | `initial-stock` **201** para D |
| Aplicaciones y parcelas | **200** para D |
| Reportes por agricultor | **200** para D |
| Bitácora institucional | filtra `MARCA-AUDITORIA-PRIVADA-F10` |
| Calendario institucional | filtra `MARCA-EVENTO-PRIVADO-F10` |

Las 8 que pasan antes y después son controles:
- otro agricultor no paga la deuda ajena (404);
- otro tenant no la alcanza;
- otro tenant no ve el catálogo;
- el dueño conserva sus registros;
- Sync antiguo da 403 a D y A y 401 sin sesión;
- el catálogo de cultivos sigue disponible;
- las funciones institucionales siguen;
- no hay ruta de ejecución de la propuesta.

**Web: 6 fallan y 36 pasan** (2026-10-16 20:08:38Z).
- `/plots`, `/applications`, `/reports` y `/dashboard` no van envueltas en `FarmerRoute`.
- `/directiva` renderiza `DirectivaPage`.
- La cobertura del borrador no lleva fecha.

El `FarmerRoute` anterior (en `App.tsx`) sólo excluía DIRECTIVA: `if (user.role === 'DIRECTIVA')`.

La prueba de `App.tsx` se ejecutó en rojo leyendo el archivo con `node:fs`. En `11a852f` pasó a `?raw` de Vite, porque `tsc -b` de la Web no tiene tipos de Node y `npm run build` fallaba. Las aserciones no cambiaron.

### 4.2 Después

Resultados sobre `8b41f7f` en la §6.

### 4.3 Pruebas anteriores que cambian (y por qué)

No se debilita ninguna prueba: las que cambian afirmaban justamente el acceso que esta revisión retira, o pasaban por la ruta cerrada.

| Prueba | Antes | Después |
|---|---|---|
| `calendar-events.use-case.spec.ts`, «lets directiva list global events with owner filter» | La DIRECTIVA lista eventos de un agricultor con `ownerUserId` | «gives directiva only institutional events and ignores the owner filter» (`ownerUserId: null`) |
| `list-audit-logs.use-case.spec.ts`, «lets directiva filter by campaign, owner, entity and action» | La DIRECTIVA filtra la bitácora por agricultor | Filtra entradas institucionales (`ownerUserId: null`) por campaña, entidad y acción, nunca por agricultor |
| `campaign-management.use-case.spec.ts`, «lists tenant campaigns with summary» | Esperaba `summary` con conteos | «lists tenant campaigns without counts of private records» (sin `summary`). En las demás pruebas del archivo se quita `include: expect.any(Object)`, porque la consulta ya no incluye conteos |
| `current-auth-context.postgres.spec.ts` (F02): «rejects foreign-user allocations…» y «checks joint Warehouse…» | Comprobaban por `POST /purchases/joint`, como DIRECTIVA, que el caso de uso rechaza referencias de otro tenant y almacenes ajenos (400/404) y que revierte | Comprueban que la ruta responde **403 `LEGACY_ROUTE_CLOSED` sin efectos**. Las mismas comprobaciones de tenant y de almacén (400/404 y reversión sin efectos) se ejecutan sobre `CreateJointPurchaseUseCase`, que sigue en el código. Se detectó al correr la suite completa: 2 fallos contra `eced37f` |

En la primera corrida completa local, `current-auth-context` falló sus 25 pruebas por un *timeout* de 5 s en `beforeAll`, sin llegar a ejecutarlas. En la repetición quedaron sólo los 2 fallos reales de la tabla.

### 4.4 Revisión de la sesión A sobre `997dd30`

**Rojo de las pruebas de `37c99c8` sobre el código de `df17ab9`** (2026-10-16 21:07:40Z):
- **Backend: 1 de 21 falla**, la de campañas y cultivos sin conteos. Con la sesión del agricultor A, `GET /campaigns` devolvía `summary {agrochemicalApplications: 1, payableAccounts: 3, plotCropAssignments: 1, purchases: 2, stockMovements: 3}`, que son los registros de todo el tenant, incluidos los de A2.
- **Web:** falla «bitácora y calendario no ofrecen filtrar por agricultor».

**Pruebas de `app-routes.test.ts` sobre `e027938`:** 7 de 10 fallan.
- Fallan el import del `FarmerRoute` compartido, cuatro rutas, `/directiva` y los filtros.
- Pasan `/inventory`, `/purchases` y `/sync`, porque el `App.tsx` anterior ya las envolvía en un `FarmerRoute` **local**, que sólo excluía DIRECTIVA. Por eso se añadió la comprobación del import y de que no haya un `function FarmerRoute` local.

**Otros cambios de la revisión:**
- **Pago de otro tenant.** Se prueba con su AGRICULTOR, que pasa el control de rol, y recibe 404 por tenant y propietario. Su DIRECTIVA recibe 403 por rol.
- **Filtros «Agricultor».** Se retiran de la bitácora y del calendario, porque el servidor los ignora para D y A.
- **Conteos de cultivos.** `GET /crops` tenía los mismos conteos que las campañas. Lo encontró la sesión B al corregir el hallazgo de A.

## 5. Compra conjunta: el único camino es el borrador

- **API.** `POST /purchases/joint` está cerrada para todos los roles: D y A reciben 403, F recibe 403 por rol y sin sesión 401. No se crea ninguna fila. `POST /collective/proposals/:id/{execute,approve,purchase,confirm}` no existe y responde 404, sin efectos. Sync antiguo no tiene ninguna operación de compra (`PLOT_*`, `INITIAL_STOCK`, `STOCK_ENTRY`/`EXIT`, `AGROCHEMICAL_APPLICATION` y `PAYMENT_CREATE`, todas sólo para F y sobre lo propio). `POST /purchases` sólo crea la compra individual del propio agricultor.
- **Web.** `/directiva`, que tenía el botón «crear compra conjunta» y los pagos, redirige a la propuesta. La página de propuesta no tiene botón de ejecución: dice «No crea compras, lotes, movimientos, deudas ni pagos».
- **Regresión conservada.** `f07-web-proposal.postgres.spec.ts` sigue verificando:
  - los dos caminos de cifras retiradas y sustituidas (retirada de la última divulgación, y R1 → R2 → retirada);
  - el detalle, el listado y el CSV de cada borrador anterior, y el resumen JSON y CSV;
  - la ausencia de efectos en la base real.

  Resultado en la §6.

## 6. Verificación sobre el último commit de código

Ejecución en serie del 2026-10-16, de 21:15:19Z a 21:17:55Z, sobre `8b41f7fc8aa96c4b5df72daae6fe3d3a454e7df1`. Cada suite PostgreSQL se ejecutó en una base nueva de `agro_b_web_pg`. Las tres F02 usaron `prisma migrate deploy` previo, como en el CI. Hubo una ejecución anterior, igual de verde, sobre `df17ab9` (20:23–20:27Z).

| Comando | Resultado |
|---|---|
| `npm run build` (Back) | OK |
| `npm test -- --runInBand` | 218 pasan, 193 omitidas (las `*.postgres.spec.ts` sin URL) |
| `npm run openapi:check` | Los snapshots coinciden, **sin regenerar**; las aserciones de contrato F02, F05, F06 y F08 pasan |
| `auth-v2` / `current-auth-context` / `f02-final-integration` | 12/12 · 25/25 · 3/3 |
| `sync-v1-journal` / `sync-v1-adversarial` / `sync-v1-references` | 30/30 · 41/41 · 7/7 |
| `f06-coll-05-collective-aggregate` / `product-reconciliation` / `backups` | 15/15 · 5/5 · 22/22 |
| **`f07-web-proposal`** (incluye las regresiones de cifras retiradas y sustituidas, y sus CSV) | **12/12** |
| **`f10-sec-02-legacy-boundary`** | **21/21** |
| Web: `npm ci` / `lint` / `build` / `test` | OK · 0 errores (2 avisos previos en los contextos) · OK · **52/52** |

El CI del PR se registra en `ESTADO_B_WEB.md` y en el PR.

## 7. Cobertura histórica en las propuestas

**Hallazgo en pantalla.** El detalle de un borrador mostraba la cobertura guardada al generarlo con el mismo componente y el mismo texto que el resumen actual: «Cobertura · campaña — 3 de 4 agricultores vinculados aportaron datos». Nada indicaba que fuera de la fecha de generación, y la evidencia de F07 lo declaraba sólo en el documento.

**Corrección mínima.** Sólo cambia el texto del mismo componente, con el parámetro `asOf`, sin reorganizar la pantalla. En un borrador muestra:
- «Cobertura al generar el borrador (fecha) · campaña»;
- «… habían aportado datos en esa fecha»;
- «No es la cobertura actual: consulte el resumen de la campaña para la de hoy».

El resumen y la página de cobertura siguen mostrando la cobertura actual sin ese rótulo. Las pruebas cubren ambos casos.

**Recorrido visual** (2026-10-16 21:12–21:15Z, `8b41f7f`, datos sintéticos de `Back/scripts/f07-synthetic-seed.cjs`, modo `provisional-synthetic`; guion `docs/evidence/f10/walkthrough-f10.mjs`, Edge headless): **19/19** comprobaciones.
- El ADMINISTRADOR vuelve al resumen desde las siete pantallas privadas, y `/directiva` lo lleva a la propuesta sin botones de compra ni de pago.
- Con su sesión real, la API responde 403 en `global-stock`, en la compra conjunta y en las deudas, y el catálogo sale sin `currentStock`.
- El resumen muestra la cobertura sin rótulo y el borrador, con su fecha.
- El agricultor conserva `/inventory`, y `/directiva` no le muestra la página heredada.
- `GET /campaigns` no trae `summary`, y la tabla de campañas no muestra conteos.

Intentos fallidos del guion (el producto no cambió en ninguno):
- **13/14:** recargaba la página en cada ruta y superó el límite de 20 peticiones/min de `/auth/refresh` (429). Pasó a navegar en el cliente.
- **15/16:** el paso de campañas agotó el límite de `GET /campaigns` (429). Espera 61 s antes de la parte de la Directiva.

Hubo una corrida anterior de 17/17 sobre `df17ab9`; sus capturas se sustituyeron por las de esta.

| Archivo (`docs/evidence/img/f10/`) | SHA-256 |
|---|---|
| `01-presidente-directiva-redirige-a-propuesta.png` | `adba343be299d2b75f64dfc587343c81d5acfb050e9c3021d8ab23387260f8d0` |
| `02-borrador-cobertura-con-fecha.png` | `b75c18cd46661d31b595ab7852b635e660d174d544aaff323bc19d7b7af5667f` |
| `03-agricultor-inventario-legacy.png` | `9db653d752715806f8490729a7003f816d444673c1931bfec9bb34d0b01e981d` |
| `04-campanas-sin-conteos-privados.png` | `b493fe130650b0c1d67e29b7f95377a13623cf4b1d8377b0086f89247b066435` |
| `walkthrough-f10.json` | `268c25915c5d73bdd4d02c36bb80523d54a1a9d0511465e0e3edc21667a7f657` |

## 8. Alineación de #108 y #25/RF-22 (decisiones y discrepancias)

Lo que sigue son discrepancias registradas, no decisiones nuevas. La aprobación institucional de la divulgación **no** se deduce de esta revisión. Tampoco se crea ningún permiso de detalle por agricultor.

| Issue | Texto actual | Estado del código | Discrepancia | Propuesta (la decide Roderich) |
|---|---|---|---|---|
| #108 F07-REC-01 | «No incluye: acceso por el solo rol técnico de Administrador (RN-23)» y «AGRICULTOR o ADMINISTRADOR sin permiso funcional de Directiva → 403» | El ADMINISTRADOR del tenant reconcilia, igual que la DIRECTIVA (ADR-003, aceptada el 2026-10-15). El AGRICULTOR recibe 403 y otro tenant no ve nada | El issue es anterior a ADR-003 y la contradice | Actualizar el criterio de #108: «AGRICULTOR → 403 sin efecto; DIRECTIVA y ADMINISTRADOR del mismo tenant (ADR-003) pueden reconciliar; otro tenant no ve ni modifica». RN-23 se interpreta así: el rol técnico **no** da acceso a operaciones privadas (esta revisión lo hace cumplir en las filas 3–16), pero el ADMINISTRADOR del tenant sí ejerce las funciones de DIRECTIVA. No se cambia ADR-003 |
| #25 F07-WEB-03 | Estado **por agricultor** («sin datos», última sincronización aceptada de cada agricultor) y rechazo del «Administrador sin permiso funcional independiente» | Sólo cobertura agregada: `linked_members` y `members_with_contribution`. No hay `members-status` ni listado de quién aportó | El detalle por agricultor identifica quién declaró y cuándo, por debajo del umbral de la política. El rechazo del ADMINISTRADOR choca con ADR-003 | Cerrar #25 **sólo** con el alcance agregado, o dividirla: (a) cobertura agregada (hecha) y (b) estado por agricultor, bloqueado hasta que exista una finalidad y una autorización aprobadas en F06/F07-POL-01. Mientras tanto, «sin datos ≠ 0» se cumple en lo agregado |
| RF-22 (detalle por agricultor «cuando el permiso lo habilite») | — | No existe ese permiso. El detalle individual no se implementa, y esta revisión retira el que daban las rutas heredadas (filas 3, 7, 9–12, 14) | El permiso no está definido en ningún contrato | Registrar RF-22 como cumplido **sólo en lo agregado**, con el detalle individual condicionado a un permiso que hoy no existe. No se crea en este bloque |

**Para el acta de GATE-F07** (la integra A; esta entrega no toca `F07_GATE.md`): las rutas heredadas que el criterio 9 citaba como pendientes de #45/#81 quedan corregidas en las filas 1–17, con las limitaciones de la §9. F07-POL-01 (#107) sigue abierta, así que el gate sigue **Pending**.

## 9. Lo que queda pendiente en #45 y #81

- **#45, auditoría de la proyección colectiva**, que es el objeto del issue. Esta entrega cubre las rutas heredadas. No repite la auditoría campo a campo de `F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md` (campos DENY en proyección, logs y conflictos) ni la política de divulgación, que siguen en #45 y #107. **El cotejo campo a campo se hizo el 2026-10-17 en `F10_SEC_02_PROJECTION.md`**; la política sigue en #107.
- **Escrituras legacy del agricultor.** `POST /purchases`, el inventario, las parcelas, las aplicaciones, los pagos propios y `/sync/operations` siguen activos para el AGRICULTOR, sobre lo propio. Su bloqueo es la PHASE 6 del plan de transición: requiere telemetría sin consumidores y un runbook, y no se hace aquí, porque no es una retirada destructiva. La Web sigue teniendo pantallas operativas para el agricultor y la cola `offline-queue.ts` (#23/#81).
- **Totales de una compra conjunta heredada.** Un participante veía los ítems y el total del grupo. **Corregido en la rama el 2026-10-17**, pendiente de integrar (`fix/f10-sec-02-residuos`): ve su parte y su propia participación.
  - `25d2a8f`: `/purchases` y los reportes.
  - `acb07af`: `/accounts-payable`, que la revisión de A halló todavía abierta.

  Ver `F10_SEC_02_PROJECTION.md` R1.
- **Eventos `COMPRA_PROGRAMADA` heredados sin dueño.** **Corregido en la rama el 2026-10-17**, pendiente de integrar.
  - `25d2a8f`: un evento sin dueño sólo es visible si su tipo es público (cierre de campaña). No se borra ni se reasigna.
  - `9047b2a`: el AGRICULTOR no completa ni cancela el evento público.

  Ver `F10_SEC_02_PROJECTION.md` R2.
- **OpenAPI.** **Corregido en la rama el 2026-10-17**, pendiente de integrar (`25d2a8f`): las dos rutas cerradas documentan el 403 `LEGACY_ROUTE_CLOSED`, sin respuesta de éxito.
- **Proveedores (`/suppliers`).** ~~«Sin compras ni precios»~~: la revisión por finalidad del 2026-10-17 halló que **sí** servía las 3 compras más recientes del tenant con cada proveedor. **Corregido** (`2ece555`); el catálogo conserva nombre y contacto. Ver `F10_SEC_02_PROJECTION.md` H3.
- **`GET /users` para DIRECTIVA.** **Minimizado el 2026-10-17** (`eea07d3`): la DIRECTIVA recibe id, nombre, rol y estado; el ADMINISTRADOR conserva la vista completa para administrar accesos. Ver `F10_SEC_02_PROJECTION.md` H4.
- **Código heredado conservado.** `directiva.page.tsx`, `CreateJointPurchaseUseCase`, `listGlobalStock` y sus servicios Web. Su eliminación sigue la PHASE 9 (cero consumidores, respaldo y migración reversible).
- **Consumidores externos o desplegados** fuera de estos repositorios: `INSUFFICIENT_EVIDENCE`, como en `LEGACY_CONTRACT_CONSUMERS.md`.
