# E4 — Acceso por rol en compras conjuntas y totales sin umbral de agricultores (contrato)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-13 (redacción) |
| Estado | **Contrato con las decisiones del §0 aplicadas. Pendiente de implementación.** No hay código, pruebas ni evidencia de este contrato todavía. Las decisiones marcadas como «criterio del orquestador» puede revisarlas el autor. |
| Encargo | Encargo del autor del 2026-11-13: simplificar los permisos de compras conjuntas y retirar el umbral K = 3 en Backend, Web y Mobile, conservando datos, trazabilidad y autorizaciones históricas. |
| Bases leídas | Backend y Web: este repositorio, rama `feat/acceso-rol-sin-k`, `07c1c02`. Mobile: repositorio `AppMovilAgroquimico`, rama `feat/acceso-rol-sin-k-mob`, `507efc8`. |
| Contratos a los que **sustituye** en lo que dice aquí | E2 (§9 E2-D6/E2-D7 y E2-P1, §10.2, §10.3, §11.1, §11.3, §11.5–§11.7, §12), `E2_PA_SUSTITUCION_RESPONSABLE_OPCIONES.md`, F07-POL-01 (umbral y regla de combinaciones), F07 sellado (§5.2), F12 (comprobación de vigencia, `:679`), E3-R15 (texto) y F06 §5 (por la enmienda del 2026-11-13). Cada uno lleva una nota de sustitución que remite a este documento; su texto anterior se conserva como historia. |
| Fuera de alcance | Compras privadas, inventarios, aplicaciones y consumo individual (el acceso de Administración no se amplía a ellos); métodos y requisitos de la estimación F12 (varias campañas comparables); la aprobación de datos reales (sigue `POLICY_PENDING`, #107). |

## 0. Decisiones y su autoría

| ID | Decisión | Autoría |
|---|---|---|
| D-00 | **Se enmienda F06 §5:** sin umbral de agricultores. Se conservan la autorización de publicación (`POLICY_PENDING` frente a `provisional-synthetic`), la retirada de datos, el aislamiento entre sindicatos y la distinción entre cero y sin datos. Enmienda en `F06_COLLECTIVE_PROJECTION_CONTRACT.md`, «Enmienda 2026-11-13 (decisión del autor)». | Decisión del autor del 2026-11-13 |
| D-01 | La responsable que es Administración **no** conserva el acceso que le daban los consentimientos anteriores: la responsabilidad ya no da acceso a datos individuales (§2, §6.1). | Criterio del orquestador derivado del encargo, revisable por el autor |
| D-02 | **Regla T** para los totales de las convocatorias (§5.2). | Decisión del autor del 2026-11-13 |
| D-03 | Lo sellado se queda con la política anterior (`F07-POL-01`). Lo no sellado pasa a `F07-POL-02` **sólo** tras una activación explícita por configuración, trazada (§5.3). | Decisión del autor del 2026-11-13 |
| D-04 | Se retira la regla de combinaciones (F07 §9), como parte de la enmienda de F06. La retirada de datos se conserva (§5.1). | Criterio del orquestador derivado del encargo, revisable por el autor |
| D-05 | Alcance `TOTALS_ONLY`: el agricultor retira la autorización nueva sin retirar su participación (§4.2). | Decisión del autor del 2026-11-13 |
| D-06 | Apps anteriores: las lecturas reciben la forma 4; las escrituras se aceptan con la forma de su contrato mientras la participación tenga un alcance anterior; `409 CONSENT_VERSION_RETIRED` y `409 APP_UPDATE_REQUIRED` en los casos de §7.2. | Criterio del orquestador derivado del encargo, revisable por el autor |
| D-07 | No se crea exportación de convocatorias (no existe ninguna, §1.4). | Criterio del orquestador derivado del encargo, revisable por el autor |
| D-08 | No se añade ningún texto en Mobile sobre totales colectivos, porque Mobile no tiene textos de K (§1.3). | Criterio del orquestador derivado del encargo, revisable por el autor |

Convenciones:
- `BE:` = la raíz de este repositorio y `MOB:` = la raíz del repositorio Mobile (`AppMovilAgroquimico`). Las citas `archivo:línea` describen el estado **anterior a este contrato**, en las bases indicadas.
- **NUEVO** marca un campo, código, valor, endpoint, columna o tabla que hoy no existe.
- «Directiva» = rol `DIRECTIVA`; «Administración» = rol `ADMINISTRADOR`. El enum sólo tiene esos dos roles institucionales (`BE:Back/prisma/schema.prisma:10-14`). Por ADR-003, `ADMINISTRADOR` ejerce además las funciones de `DIRECTIVA` en su tenant (`BE:docs/adr/ADR-003-administrador-presidente-funciones-directiva.md:17`).
- «Habilitada» = Member activo, cuenta activa y tenant activo (`BE:Back/src/modules/joint-purchase-calls/application/call-access.ts:11-19`). «Administración habilitada» = esa condición con rol `ADMINISTRADOR` (`call-access.ts:137-143`, `isEligibleAdministrator`).

---

## 1. Estado anterior a E4 (resumen con citas)

### 1.1 Acceso a participaciones identificadas

- El acceso no depende del rol, sino de filas `JointPurchaseCallAccess` (`PARTICIPANTS`, `MANAGE`) (`BE:Back/prisma/schema.prisma:1805-1826`). «Ningún rol concede permisos por sí solo, tampoco `ADMINISTRADOR`» (`BE:docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md:31`, `:329`).
- El sistema crea `PARTICIPANTS` para la responsable al abrir (`BE:Back/src/modules/joint-purchase-calls/application/institutional-calls.use-case.ts:442-450`) y al sustituirla (`BE:Back/src/modules/joint-purchase-calls/application/responsible-substitution.use-case.ts:282-289`).
- `accessOf` decide en cada petición quién es `RESPONSIBLE`, `COLLABORATOR` o `NONE` y si fue alguna vez colaboradora (`call-access.ts:83-109`). Una delegación sólo rige con la versión vigente de la responsabilidad y con la responsable habilitada (`call-access.ts:49-52`, m6 en E2 §11.5, `E2_…:429-434`).
- `GET /joint-purchase-calls/{id}/participants` responde `403 PARTICIPANTS_FORBIDDEN` sin esa fila (`institutional-calls.use-case.ts:197-200`).
- La visibilidad por participación combina el alcance del consentimiento (`RESPONSIBLE_ONLY`/`COLLABORATORS`) y la autorización de la responsable vigente (P-A C1) (`BE:Back/src/modules/joint-purchase-calls/domain/visibility.ts:111-133`).
- Colaboradores: sólo la responsable concede y revoca (`institutional-calls.use-case.ts:529`, `:592`). La sucesora revisa las delegaciones anteriores (`:642-660`; E2 §12.3, `E2_…:519-525`).
- Permiso del sindicato «Sustituir responsable»: lo conceden y revocan Administraciones habilitadas (`responsible-substitution.use-case.ts:121-189`). Para sustituir hay que tenerlo (`:228`, `holdsSubstitution` en `call-access.ts:151-157`). Endpoints en `BE:Back/src/modules/joint-purchase-calls/api/rest/substitution-permissions.controller.ts:31-69`.

### 1.2 Consentimiento

- Versiones `CONV-1`, `CONV-2` y `CONV-3` (vigente). Alcance inicial: `CONV-2` da `COLLABORATORS`; las demás, `RESPONSIBLE_ONLY` (`BE:Back/src/modules/joint-purchase-calls/domain/consent.ts:22-48`).
- El alcance vive en la participación (`schema.prisma:1863-1876`). Cada decisión queda en `JointPurchaseConsentDecision`, sólo de inserción (`schema.prisma:1897-1917`). Las cantidades nunca cambian el consentimiento (`BE:Back/src/modules/joint-purchase-calls/application/farmer-participation.use-case.ts:276-281`).
- Las decisiones tienen su propio orden (`consentScopeSequence`). Ampliar exige `CONV-3`; reducir se acepta siempre; nada se acepta en `CANCELLED` (`farmer-participation.use-case.ts:406-470`).
- La base sólo admite versiones con el patrón `^CONV-[1-9][0-9]{0,2}$` (`BE:Back/prisma/migrations/20261112120000_e2_pc_consent_decisions/migration.sql:35`, `:68`). El enum de alcance tiene dos valores (`schema.prisma:1888-1891`).

### 1.3 Umbral K = 3

- Hay una única constante: `PROVISIONAL_THRESHOLD = 3` (`BE:Back/src/modules/collective/domain/disclosure-policy.ts:11`).
- La usan:
  - la supresión primaria (`disclosure-policy.ts:132-136`);
  - la regla de diferencias y combinaciones, que es K-dependiente (`disclosure-policy.ts:96-97`, `:151-154`, `:187-206`; `BE:Back/src/modules/collective/domain/differencing.ts:157-226`).
- Consumidores:
  - Resumen y Cobertura: `collective-summary.use-case.ts:249`, `:352`, `:364-369` y `:516`.
  - Sellado: `BE:Back/src/modules/collective/domain/seal.ts:38-43` (umbral vigente sobre lo sellado) y `collective-seal.use-case.ts:134`, `:218`.
  - Tendencias: `collective-trends.use-case.ts:153-154`.
  - Borradores: `JointPurchaseProposalLine.status` con `SUPPRESSED_UNDER_THRESHOLD` (`schema.prisma:1170-1175`).
  - Estimación: `estimation-worker.ts:356` (graba `threshold`) y `estimation-reads.use-case.ts:434` (`contributorCount >= PROVISIONAL_THRESHOLD`).
  - Convocatorias: `CALL_TOTALS_THRESHOLD` (`visibility.ts:4`, `:32-51`), servido como `totals_threshold` (`institutional-calls.use-case.ts:973`, `:1135`).
- La base guarda el umbral: `CollectiveSeal.threshold` y `EstimationRun.threshold`, ambos `INTEGER NOT NULL` con `CHECK ("threshold" > 0)` (`BE:Back/prisma/migrations/20261023100000_f07_collective_seal/migration.sql:72`; `BE:Back/prisma/migrations/20261101233651_f12_est_01_estimation/migration.sql:369`).
- En la Web, el umbral aparece en textos y exportaciones: `BE:Web/src/lib/collective-text.ts:13-18`, `BE:Web/src/components/needs-bars.tsx:89-98`, `BE:Web/src/lib/collective-summary-xlsx.ts:124`, `BE:Web/src/lib/trends-xlsx.ts:78-79`, `BE:Web/src/lib/xlsx-common.ts:24`, `BE:Web/src/lib/joint-purchase-call-text.ts:227-256` y `BE:Web/src/pages/collective-summary.page.tsx:345`, `:366-368`.
- **Mobile no tiene ningún texto de K ni de umbral.** La búsqueda de «umbral», «threshold» y «anónim» en `MOB:lib` sólo encuentra usos ajenos, como `inventory_screen.dart:223` (diseño) y `lib/voice`.

### 1.4 Exportaciones

- Excel es la única exportación (`BE:docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md:1-20`). Las rutas CSV del servidor se retiraron (E2 §11.9, `E2_…:461-463`).
- **No existe exportación de convocatorias.** Sólo se exportan el resumen, las tendencias, la estimación y el borrador de propuesta (`WEB_EXCEL_UNICO…:12-17`). `BE:Web/src/lib/joint-purchase-xlsx.ts` es el Excel del **borrador**, no de la convocatoria (`:334-347`).

---

## 2. Matriz de acceso por rol y operación

Condición común: mismo tenant y cuenta habilitada, leídas en cada petición (§6.4). Otro tenant → `404`; `AGRICULTOR` en una ruta institucional → `403`, como hoy.

| Operación | DIRECTIVA habilitada | ADMINISTRACIÓN habilitada | Fuente del encargo |
|---|---|---|---|
| Crear borrador de convocatoria | Sí (como hoy) | Sí (como hoy) | «crea y gestiona según el flujo vigente» |
| Editar borrador, abrir, cancelar, cerrar a mano | Sólo si es la responsable o tiene `MANAGE` vigente (como hoy, `call-access.ts:126-134`) | Igual: **no** hay gestión universal por rol | «Se conservan quién administra cada convocatoria y las delegaciones puramente operativas» |
| Conceder o revocar `MANAGE` | Sólo la responsable (como hoy) | Sólo la responsable (como hoy) | Delegación operativa conservada |
| Ver datos de la convocatoria, productos, estado, historial y número de participantes | Sí | Sí | — |
| Total por producto (provisional en `OPEN`/`CANCELLED`, consolidado en `CLOSED`) | Sí, según la regla T (§5.2) | Sí, según la regla T (§5.2) | «ven totales»; «distinguir provisional y consolidado» |
| Nombres y cantidades por persona (`/participants` y detalle de `/closing`) | **No** (`403 PARTICIPANTS_FORBIDDEN`), aunque antes tuviera permiso | Sólo participaciones con consentimiento que cubra el alcance nuevo (`ADMINISTRATION`, §4) | «consulta nombres y cantidades… cuyo consentimiento cubra el nuevo alcance» |
| Exportar el detalle identificado | No existe exportación (§1.4) | No existe exportación; no se crea (D-07) | «si la exportación ya existe» |
| Conceder `PARTICIPANTS`, ampliar a colaboradores, retirar, revisar o confirmar delegaciones de visualización | **Retirado** (`409 GRANT_RETIRED`, NUEVO) | **Retirado** (igual) | «se retiran de los flujos activos» |
| Conceder o revocar el permiso «Sustituir responsable» | Retirado (`409 SUBSTITUTION_PERMISSION_RETIRED`, NUEVO) | Retirado (igual) | «gestión activa del permiso especial» retirada |
| Sustituir a una responsable no habilitada (P-A) | **No** (`403 SUBSTITUTION_FORBIDDEN`), aunque tenga un permiso concedido antes | **Sí**, sin permiso adicional, con todas las condiciones de P-A (§6.3) | Matriz del encargo |
| Ser nombrada responsable o sucesora | Sí (como hoy, `responsible-substitution.use-case.ts:236-245`) | Sí | Sin cambio |
| Ser la responsable | Sólo indica quién coordina: **no** da acceso a datos individuales | Igual: tampoco con consentimientos anteriores que la autorizaban a ella (D-01) | «La responsabilidad sólo indica quién coordina» |
| Compras privadas, inventarios, aplicaciones y consumo individual | Sin cambio | **Sin ampliación** | «No ampliar el acceso de Administración…» |

**La deshabilitación de la responsable** no suspende el acceso de Administración a participaciones con consentimiento `ADMINISTRATION`: ese acceso depende del rol, no de la responsable. El m6 (`E2_…:432`) sigue rigiendo sólo para `MANAGE`.

---

## 3. Cambios de API por endpoint

Las respuestas institucionales llevan hoy `contractVersion: 1` (`BE:Back/src/modules/joint-purchase-calls/application/call-views.ts:229`, `:301`, `:332`, `:382`). Pasan a `contractVersion: 2` (NUEVO) en detalle, participantes, cierre y colaboradores, para que una Web sin actualizar falle de forma visible. La Web se despliega con el Backend.

### 3.1 Institucional (`BE:Back/src/modules/joint-purchase-calls/api/rest/institutional-calls.controller.ts`)

| Endpoint | Hoy | Cambio |
|---|---|---|
| `GET /joint-purchase-calls` (`:68`) | Lista sin totales ni nombres (`institutional-calls.use-case.ts:133-171`) | Sin cambio. |
| `GET /joint-purchase-calls/eligible-responsibles` (`:79`) | Usuarios institucionales habilitados | Sin cambio. |
| `POST /joint-purchase-calls` (`:89`), `PATCH /:id` (`:121`), `POST /:id/cancel` (`:154`) | Responden con el detalle | Sólo cambia la forma del detalle (fila siguiente). |
| `GET /:id` (`:106`) | Campos de E2 §10–§12 (`call-views.ts:228-279`; `institutional-calls.use-case.ts:946-1023`) | **Retirados:** `totals_threshold`, `has_substitution_permission`, `pending_authorization_count`. **Cambian de significado:** `can_view_participants` = Administración habilitada (por rol, en cada petición); `my_grants` y `collaborator_count` sólo cuentan `MANAGE`; `pending_delegation_reviews` sólo `MANAGE`; `can_substitute_responsible` = Administración habilitada **y** responsable no habilitada **y** estado ≠ `CANCELLED`. **NUEVOS:** `pending_consent_count` (participaciones vigentes cuyo consentimiento no cubre el alcance nuevo; un conteo, para Directiva y Administración) y, en `products[].totals`, `totals_basis` (§5.2). `products[].totals.visibility` pasa a `VISIBLE` o `PENDING_CONSENT` (NUEVO); `UNDER_THRESHOLD`, `RESPONSIBLE_ONLY` y `RESTRICTED` dejan de emitirse. |
| `POST /:id/open` (`:136`) | Crea la fila `PARTICIPANTS` de la responsable (`institutional-calls.use-case.ts:442-450`); el evento dice «recibe el permiso de consultar participantes» (`:69`) | **No** crea la fila. El texto del evento `OPENED` pasa a «Convocatoria abierta.» sin conceder nada. Las filas existentes se conservan. |
| `POST /:id/close` (`:169`) | Devuelve el cierre (`:501-509`) | Forma del cierre (fila de `/closing`). |
| `GET /:id/participants` (`:186`) | Exige `PARTICIPANTS` (`:197-200`) | Exige Administración habilitada; si no, `403 PARTICIPANTS_FORBIDDEN` (código conservado). Lista sólo participaciones `ACTIVE` con alcance `ADMINISTRATION`. **Retirados:** `hidden_participant_count`, `hidden_notice`, `pending_authorization_*`. **NUEVOS:** `pending_consent_count` y `pending_consent_notice` (sin nombres). |
| `GET /:id/closing` (`:201`) | `participants` sólo con permiso; totales con k (`:1079-1155`) | `participants` sólo para Administración, con alcance `ADMINISTRATION` (los demás, como conteo). `totals_threshold` retirado. Líneas con `visibility`/`totals_basis` de la regla T. |
| `GET /:id/collaborators` (`:214`) | Permisos vigentes e historial (`:1157-1225`) | Sólo `MANAGE` entre los vigentes. Las filas y eventos `PARTICIPANTS` aparecen sólo en `history`, con la marca NUEVA `retired: true` («Permiso de visualización retirado el AAAA-MM-DD; no da acceso»). `can_review` sólo para `MANAGE`. |
| `POST /:id/collaborators` (`:228`) | Concede `PARTICIPANTS` o `MANAGE` | `grant: PARTICIPANTS` → `409 GRANT_RETIRED` (NUEVO), sin evento ni bitácora. `MANAGE` sin cambio. |
| `POST /:id/collaborators/revoke` (`:247`) | Revoca o renuncia | `PARTICIPANTS` → `409 GRANT_RETIRED` (la fila se conserva como historia). `MANAGE` sin cambio. |
| `POST /:id/collaborators/review` (`:265`) | La sucesora confirma o retira | `PARTICIPANTS` → `409 GRANT_RETIRED`. `MANAGE` sin cambio. |
| `POST /:id/responsible` (`:284`) | Exige el permiso «Sustituir responsable» (`responsible-substitution.use-case.ts:228`) | Exige Administración habilitada (`isEligibleAdministrator`, revalidada en la transacción). Si no, `403 SUBSTITUTION_FORBIDDEN`. Lo demás de §6.3. |

### 3.2 Permiso «Sustituir responsable» (`substitution-permissions.controller.ts`)

| Endpoint | Cambio |
|---|---|
| `GET /joint-purchase-substitution-permissions` (`:31`) | **Sólo lectura de historia.** Quién lo tuvo, quién lo concedió, cuándo y motivo, con la marca NUEVA `retired_at` (fecha de la migración) y el texto «Ya no se usa: sustituye la Administración habilitada». `can_grant` = `false`; `holds_permission` se retira. |
| `POST /joint-purchase-substitution-permissions` (`:41`) | `409 SUBSTITUTION_PERMISSION_RETIRED` (NUEVO). No escribe nada. |
| `POST /joint-purchase-substitution-permissions/revoke` (`:57`) | `409 SUBSTITUTION_PERMISSION_RETIRED`. Las filas no se borran (regla 6 de CLAUDE.md: no borrar). |

### 3.3 Agricultor (`BE:Back/src/modules/joint-purchase-calls/api/rest/farmer-calls.controller.ts`)

Hoy el teléfono declara su contrato con `X-Joint-Purchase-Contract` (1, 2 o 3). Un valor desconocido se lee como 1 (`farmer-calls.controller.ts:26-41`).

| Endpoint | Cambio |
|---|---|
| `GET /me/joint-purchase-calls` (`:59`) y `GET …/history` (`:73`) | **Contrato 4** (NUEVO, cabecera `4`): `contractVersion: 4`; `consent: {version: "CONV-4", text, help}` (`help` NUEVO); en la participación, `consent_scope.scope` ∈ {`RESPONSIBLE_ONLY`, `COLLABORATORS`, `ADMINISTRATION`, `TOTALS_ONLY`}; sin `responsible.version` ni `responsible_authorization` (P-A C1 deja de decidir acceso). **Contratos 1–3:** reciben la forma del contrato 4 (§7.2). |
| `PUT /me/joint-purchase-calls/{id}/participation` (`:88`) | La primera confirmación con `CONV-4` crea la participación con alcance `ADMINISTRATION`. Con `CONV-1/2/3`, la crea con el alcance de su texto, como hoy (restringida para el detalle, §4.3). Modificar cantidades nunca cambia el alcance (como hoy). Contratos 1–3 sobre una participación con alcance nuevo: `409 APP_UPDATE_REQUIRED` (NUEVO, §7.2). |
| `POST …/participation/withdraw` (`:110`) | Sin cambio de reglas. Contratos 1–3 sobre una participación con alcance nuevo: `409 APP_UPDATE_REQUIRED`. |
| `POST …/participation/consent` (`:127`) | Decisiones de §4.2. Ampliar (`COLLABORATORS`) o autorizar a una responsable (`authorize_responsible: true`) → `409 CONSENT_VERSION_RETIRED` (NUEVO), definitivo. |

Errores del agricultor añadidos: `409 CONSENT_VERSION_RETIRED` y `409 APP_UPDATE_REQUIRED`. Ninguno lleva datos de otros.

### 3.4 Colectivo y estimación

| Endpoint | Cambio |
|---|---|
| `GET /collective/campaigns/:campaignId/summary` (`collective.controller.ts:27`) | `disclosure.policy` = `"F07-POL-02"` (NUEVO valor) y `disclosure.threshold` = `null` en lo decidido con la política nueva. En una campaña sellada, `seal.policy` y `seal.threshold` (NUEVOS) dicen la política con que se selló, y `disclosure` deja de fijar `F07-POL-01`/3 a mano (hoy, `collective-summary.use-case.ts:249`). `SUPPRESSED_UNDER_THRESHOLD` ya no se produce en decisiones nuevas (§5.1). |
| `GET` y `POST /collective/campaigns/:campaignId/seal` (`collective-history.controller.ts:32`, `:46`) | El sellado graba `policy = F07-POL-02` y `threshold = NULL` (§4.4). `review_ref` pasa a `v: 2` e incluye la política (`seal.ts:82-90`). |
| `GET /collective/trends` (`collective-history.controller.ts:71`) | Cada campaña lleva su `policy`/`threshold` sellados (NUEVO). `disclosure.threshold` deja de ser la constante (`collective-trends.use-case.ts:153`). |
| `POST` y `GET /collective/campaigns/:campaignId/proposals`, `GET /collective/proposals/:proposalId` (`joint-purchase-proposals.controller.ts:25`, `:40`, `:54`) | `disclosure.policy` = la del borrador: columna NUEVA `disclosurePolicy`; NULL = `F07-POL-01`. Los borradores anteriores conservan sus líneas `SUPPRESSED_UNDER_THRESHOLD`. |
| `GET /estimation/runs/:runId`, `/results`, `/download` (`estimation.controller.ts:195`, `:209`, `:223`), `GET /collective/proposals/:id/estimation-reference` y `/estimation-link` | `stillDisclosed` deja de exigir `contributorCount >= 3` (`estimation-reads.use-case.ts:434`). Las ejecuciones nuevas graban `policy = F07-POL-02` y `threshold = NULL`; las anteriores conservan los suyos. Sin cambios de método ni de requisitos (F12). |

---

## 4. Modelo de datos

### 4.1 Consentimiento `CONV-4` (NUEVO)

- **Texto** (tratamiento de «usted», como la app; `MOB:lib/presentation/widgets/joint_purchase_texts.dart:203-207`, `:251-266`):
  > «Las personas de Administración habilitadas de su sindicato podrán ver su nombre y las cantidades que solicita para coordinar esta compra conjunta y su entrega. La Directiva podrá consultar los totales por producto, sin el detalle identificado de su participación. Los totales pueden mostrarse aunque participe una sola persona. Esta participación no genera una deuda.»
- **Ayuda** (`help`):
  > «Aunque el total no muestre nombres, con pocas participaciones podría deducirse cuánto solicitó una persona.»
- Si cambia el texto o la ayuda, cambia la versión (regla de `consent.ts:1-3`).

### 4.2 Alcance (`scope`)

| Valor | Origen | Detalle identificado | Totales sin nombres con 1–2 personas | Cómo se obtiene |
|---|---|---|---|---|
| `RESPONSIBLE_ONLY` | `CONV-1`, `CONV-3` o reducción anterior | Nadie | No cubiertos (regla T, §5.2) | Como hoy |
| `COLLABORATORS` | `CONV-2` o ampliación anterior | Nadie | No cubiertos | Como hoy; **ya no se puede obtener**: `409 CONSENT_VERSION_RETIRED` |
| `ADMINISTRATION` (NUEVO) | `CONV-4` | Administración habilitada | Cubiertos | Primera confirmación con `CONV-4`, o la decisión «Revisar quién puede ver mi participación» con `CONV-4` |
| `TOTALS_ONLY` (NUEVO, D-05) | Retiro de la autorización `CONV-4` | Nadie | Cubiertos (la cláusula de totales ya se aceptó) | Decisión del agricultor; se respeta siempre, salvo en `CANCELLED`, donde no cambia nada |

Reglas de las decisiones (`POST …/consent`, contrato 4), en el orden de comprobación actual (`farmer-participation.use-case.ts:421-436`):
1. Sin participación → `409 PARTICIPATION_REQUIRED` (como hoy).
2. `scope = ADMINISTRATION` exige `consent.version = "CONV-4"` (si no, `409 CONSENT_REQUIRED`). No se admite en `CANCELLED` (`409 WIDENING_NOT_ALLOWED`) ni lleva `authorize_responsible` (si lo lleva, `400 PAYLOAD_INVALID`). Vale en `OPEN` y `CLOSED`, sin depender del plazo, y no toca cantidades, estado ni consolidado (la visibilidad del cierre lee el alcance vigente: `institutional-calls.use-case.ts:1278-1291`).
3. `scope = COLLABORATORS` (cualquier versión) o `authorize_responsible: true` → `409 CONSENT_VERSION_RETIRED`. Se registra en el diario de operaciones como hoy (idempotencia), sin escribir decisión ni cambiar el alcance. Así ninguna ampliación antigua vuelve a habilitar a la Directiva.
4. `scope = RESPONSIBLE_ONLY` sin autorización (reducción anterior): se acepta si su `sequence` es mayor que la última decisión aceptada («reducir se respeta siempre», E2 §11.1, `E2_…:406`). Si el alcance vigente era `ADMINISTRATION`, deja de cubrir el detalle.
5. `scope = TOTALS_ONLY` (D-05): se acepta con cualquier versión conocida; no se admite en `CANCELLED`.
6. `sequence` no mayor que la última aceptada → `409 STALE_SEQUENCE` con la participación vigente (como hoy, `:434-436`). Un envío atrasado nunca restablece un acceso anterior.

### 4.3 Cómo se registra

- `JointPurchaseParticipation`: sin columnas nuevas. `consentScope`, `consentScopeVersion` y `consentScopeSequence` reciben el alcance y la versión (`schema.prisma:1866-1870`). `consentResponsibleVersion` (`:1876`) se conserva como historia y ya no decide acceso. En las participaciones nuevas con `CONV-4` queda `NULL` (no autoriza a una responsable).
- `JointPurchaseConsentDecision`: una fila por decisión aceptada, como hoy (`INITIAL`/`DECISION`). Se conserva `MIGRATED` para lo anterior; **no** se añaden filas `MIGRATED` nuevas, porque ningún alcance se reinterpreta.
- Migración aditiva (NUEVA): `ALTER TYPE "JointPurchaseConsentScope" ADD VALUE 'ADMINISTRATION'` y `ADD VALUE 'TOTALS_ONLY'` (D-05). La restricción de versión (`migration.sql:35`, `:68`) ya admite `CONV-4`.

### 4.4 Qué se migra y qué no

| Dato | Qué pasa |
|---|---|
| Consentimientos aceptados (`consentVersion` y sus fechas) | **No se reescriben.** Quedan con su alcance anterior: restringidos para el detalle hasta una autorización `CONV-4` del agricultor. |
| `JointPurchaseCallAccess` con `PARTICIPANTS` | Se conservan, sin borrar ni leer para el acceso. Disparador NUEVO: rechaza insertar `grant = 'PARTICIPANTS'` desde la migración, como defensa en profundidad. Las filas `MANAGE` siguen como hoy. |
| `JointPurchaseCallAccessEvent` | Se conserva; sigue siendo sólo de inserción. |
| `JointPurchaseSubstitutionGrant` y sus eventos | Se conservan como historia, sin borrar. No dan ningún poder. |
| `JointPurchaseResponsibleChange` | Se conserva; las sustituciones nuevas siguen escribiendo filas. |
| `CollectiveRelease` | Columna NUEVA `policy VARCHAR(16) NULL`. NULL = divulgada con `F07-POL-01` (todas las existentes, con 3 o más aportantes). Las nuevas, `F07-POL-02`. Sin relleno. |
| `CollectiveSeal.threshold`, `EstimationRun.threshold` | `DROP NOT NULL` (expansión) más un CHECK NUEVO de coherencia: `policy = 'F07-POL-01'` ⇔ `threshold IS NOT NULL`. Lo sellado y lo ejecutado antes conserva `3`. **No** se guarda `1` en lugar de NULL: guardar 1 se leería como «K = 1» y la política nueva no tiene umbral. |
| Activación de la política colectiva | Tabla NUEVA `CollectiveDisclosurePolicyActivation` (`id`, `policy`, `previousPolicy`, `activatedAt`, `source`), sólo de inserción (disparador). Vacía al migrar: la primera fila la escribe el primer arranque con `COLLECTIVE_DISCLOSURE_POLICY` explícita (§5.1). |
| `JointPurchaseProposal` | Columna NUEVA `disclosurePolicy VARCHAR(16) NULL` (NULL = `F07-POL-01`), con el mismo patrón que `coverageBasis` (`schema.prisma:1188-1191`). |
| Estados `SUPPRESSED_UNDER_THRESHOLD` guardados (líneas de borrador y entradas selladas) | Se conservan tal cual. No se recalculan ni se «recuperan» (§5.3). |

---

## 5. Política de publicación sin K

### 5.1 `F07-POL-02` (NUEVA) para el resumen colectivo, la cobertura, el sellado, las tendencias, los borradores y la estimación

Sólo con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`. En producción sigue `POLICY_PENDING`, sin cifras (`F07_AGGREGATE_DISCLOSURE_POLICY.md:4`, `:8`).

**Activación explícita y trazada (D-03).** La política la elige la variable NUEVA `COLLECTIVE_DISCLOSURE_POLICY`:
- `F07-POL-01` es el valor **por defecto**: si la variable falta, nada cambia en el colectivo.
- `F07-POL-02` activa la política nueva. Un valor desconocido impide arrancar.

Cada arranque compara la política configurada con la última activación registrada. Si son distintas, inserta una fila en la tabla NUEVA `CollectiveDisclosurePolicyActivation`, sólo de inserción, con `policy`, `previousPolicy`, `activatedAt` (hora del servidor) y `source = 'CONFIG'`. También lo escribe en el log de arranque. Así queda constancia de cuándo empezó a regir cada política en ese entorno.

Además, cada `CollectiveRelease` nueva, cada sellado, cada borrador y cada ejecución F12 llevan la política con que se decidieron (§4.4). La activación no reabre nada sellado.

La regla T de las convocatorias (§5.2) no depende de esta variable: allí decide el consentimiento de cada participación.

| Regla | `F07-POL-01` (hoy) | `F07-POL-02` |
|---|---|---|
| Supresión primaria (R1) | Menos de 3 Members → `SUPPRESSED_UNDER_THRESHOLD` (`disclosure-policy.ts:132-136`) | **Retirada.** Una celda con 1 aportante o más se publica. |
| Diferencias y combinaciones (R3/§9) | Una cifra nueva no puede hacer calculable nada sobre menos de k Members (`disclosure-policy.ts:187-206`) | **Retirada**: con k = 1 no protege a ningún grupo y sólo dejaría cifras viejas con `pending_changes` (D-04, enmienda de F06). |
| `SHOW_PRIOR` con `pending_changes` | Sí | Sólo con `pending_changes = false`, cuando el estado es exactamente el de la última cifra (sin divulgación nueva). |
| Bajas (R4): cancelación, disputa, Member o cuenta inactivos | La aportación sale y se retira la cifra anterior (`collective-summary.use-case.ts:279-293`) | **Se conserva**: la aportación sale del cálculo y la cifra anterior se marca retirada (`withdrawnAt`). Se publica la cifra nueva con las aportaciones restantes, o `SUPPRESSED_REVISION` si no queda ninguna. |
| Cero frente a ausencia (R2) | Un cero explícito cuenta; una ausencia no | Sin cambio. |
| Unidades y canónicos | Nunca suma ML y G | Sin cambio. |
| Desbordamiento (R7) | `OVERFLOW` | Sin cambio. |
| Cobertura (R9) | `members_with_contribution` sólo dentro de cifras publicadas; `suppressed_cells` sin conteo | Sin cambio de forma. `suppressed_cells` sólo será cierto por `OVERFLOW` o por retirada. |
| Aislamiento, permisos y sesiones | Tenant y roles (`F07_…:25-29`) | Sin cambio. |
| Trazabilidad | `disclosure.policy` = `F07-POL-01` | Cada `CollectiveRelease` nueva lleva `policy`; cada respuesta, `disclosure.policy`; lo sellado, el suyo. |

**Qué sustituye a `SUPPRESSED_UNDER_THRESHOLD`:** en las decisiones nuevas, **nada**: la celda es `DISCLOSED`. El valor del enum queda como **estado histórico** de lo sellado y de los borradores generados con `F07-POL-01`. Se sirve siempre acompañado de la política que lo produjo (`seal.policy`, `disclosure.policy` del borrador). La Web lo rotula «Sin cifra según la política anterior (mínimo de 3 aportantes)», sin «oculto por privacidad» ni «anónimo».

### 5.2 Convocatorias: regla T de totales (provisional y consolidado)

Se aplica a Directiva y Administración por igual (decisión única en `CallVisibility`, que sustituye a `visibility.ts:98-171`). Para cada producto, sean P las participaciones contadas: en `OPEN`/`CANCELLED`, las `ACTIVE` con línea en el producto; en `CLOSED`, las congeladas (`institutional-calls.use-case.ts:1033-1077`).

1. **Todas las de P cubren los totales** (alcance `ADMINISTRATION` o `TOTALS_ONLY`) → `VISIBLE`, con cualquier número de personas, en vivo y al cierre. `totals_basis: "ROLE_CONSENT"` (NUEVO).
2. **Alguna no los cubre**, `source = CLOSING`, el visor no ve por nombre ninguna de las de P y el total era visible con la regla anterior (3 o más personas, sin la protección de antiguas colaboradoras, `visibility.ts:165-169`) → `VISIBLE` con `totals_basis: "PREVIOUS_POLICY_K3"` (NUEVO). Es la política anterior como evidencia: no añade nada que antes no se viera (D-02).
3. **En otro caso** → `PENDING_CONSENT` (NUEVO), sin cifra. Se informa `pending_consent_count`.

Por qué el punto 2 exige que el visor no vea a nadie por nombre: una Administración que ve el detalle de las participaciones `ADMINISTRATION` restaría su suma del total consolidado. Así obtendría la cantidad de una participación anterior que nunca aceptó esa exposición. Es el mismo razonamiento de `visibility.ts:154-164` («restando las visibles se revelaría la oculta»).

Distinciones exigidas por el encargo:
- `totals_source`: `LIVE` (total provisional), `CLOSING` (consolidado al cierre) o `NONE` (borrador), como hoy (`call-views.ts:249`).
- Detalle identificado: sólo `/participants` y `/closing.participants`, y sólo para Administración con `ADMINISTRATION`.
- La lista (`GET /joint-purchase-calls`) sigue sin totales ni nombres (`E2_…:366`).

### 5.3 Datos históricos de K: no se recupera nada automáticamente

| Dato | Tratamiento (D-03) |
|---|---|
| Campañas selladas (`CollectiveSeal` v1, `threshold = 3`) | Quedan selladas con `F07-POL-01`. Las celdas `SUPPRESSED_UNDER_THRESHOLD` no tienen divulgación (`schema.prisma:1284`; `CHECK (status = 'DISCLOSED') = (releaseId IS NOT NULL)`), así que no hay cifra que recuperar. No hay reapertura: la base sólo admite la versión 1 (`20261023100000…/migration.sql:69-71`). `sealedCellStatus` deja de aplicar «el umbral vigente» (`seal.ts:41`) porque la política nueva no tiene umbral. Lo sellado como `DISCLOSED` (todo con 3 o más) sigue visible. |
| Campañas sin sellar (abiertas o cerradas) | La lectura siguiente a la activación de `F07-POL-02` decide con la política nueva y escribe la `policy` de cada divulgación. La activación es explícita (`COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02`, registrada en `CollectiveDisclosurePolicyActivation` y en el log, §5.1). Mientras no se active, siguen con `F07-POL-01`. |
| Borradores de propuesta | Inmutables. Sus líneas `SUPPRESSED_UNDER_THRESHOLD` siguen sin cifra, y un borrador nuevo sale con la política activa en ese momento, que queda registrada en `disclosurePolicy`. |
| Ejecuciones de estimación | Conservan `policy` y `threshold = 3`. Las series sólo toman cifras selladas (`schema.prisma:1403-1408`), así que no cambian hasta que haya sellados nuevos. |
| Consolidados de convocatorias cerradas | Inmutables. Su visibilidad sigue la regla T: lo visible antes por K = 3 sigue visible (punto 2); lo que estaba bajo el umbral sólo se ve si todas las participaciones aceptan `CONV-4`. |

---

## 6. Reglas transversales

### 6.1 La responsabilidad

- `responsibleUserId` y `responsibleVersion` se conservan. Decide quién coordina, quién tiene `MANAGE` y quién concede `MANAGE`.
- `accessOf` deja de producir `RESPONSIBLE`/`COLLABORATOR` para el detalle y de leer `JointPurchaseCallAccessEvent` (`call-access.ts:90-92`) para la protección de antiguas colaboradoras, que se retira con su bloqueo («bloqueos basados sólo en esas delegaciones»).

### 6.2 Delegaciones `MANAGE`

Sin cambio: sólo la responsable concede; quedan suspendidas mientras ella no esté habilitada (m6) y, tras una sustitución, `PENDING_REVIEW` hasta que la sucesora las revise (`call-access.ts:49-57`, `responsible-substitution.use-case.ts:249-259`). `suspendedDelegations` sólo cuenta `MANAGE`.

### 6.3 Sustitución (P-A)

Se conservan íntegras las condiciones de `E2_…:501-517` y del código (`responsible-substitution.use-case.ts:191-300`):
- validación de la sucesora (otra Directiva o Administración habilitada, distinta de la actual y de quien sustituye: **autosustitución prohibida**, `:238-245`);
- `RESPONSIBLE_STILL_ELIGIBLE` (`:233-235`);
- `DRAFT`, `OPEN` y `CLOSED`, no `CANCELLED` (`:229`);
- `expected_responsible_version` y `409 RESPONSIBLE_CHANGED` (concurrencia, `:230-232`);
- `request_id` y su huella (doble envío, `:225`);
- motivo, confirmación, `JointPurchaseResponsibleChange`, evento, `AuditLog` y el disparador que sólo deja cambiar la responsable (`20261112180000…/migration.sql:186-215`).

Cambios:
- quién puede sustituir: Administración habilitada, sin permiso (sustituye a `holdsSubstitution` en `:228` y `:351`);
- no se borra la fila `PARTICIPANTS` de la anterior ni se crea la de la sucesora (`:282-289`);
- sólo se suspenden las delegaciones `MANAGE`.

No reabre, no cambia plazo, cantidades ni consolidado, y no crea compras, deudas ni inventario (como hoy). **No pide una autorización nueva al agricultor**: el acceso de Administración con `ADMINISTRATION` no depende de la responsable. P-A C1 deja de tener efecto en el acceso, y su columna y su historia se conservan.

### 6.4 Revalidación en cada consulta

- El rol y la habilitación se leen de la base en cada petición: `JwtStrategy.validate` → `CurrentAuthContextResolver.resolve` (`BE:Back/src/modules/iam/infrastructure/auth/jwt.strategy.ts:19-20`). Además, `isEligibleAdministrator` dentro de la misma lectura o transacción que sirve el detalle.
- Un cambio de rol o una deshabilitación cortan el acceso desde la petición siguiente. La Web conserva la comprobación periódica y al recuperar el foco (`BE:Web/src/pages/joint-purchase-call-detail.page.tsx:268-285`) y borra de memoria lo mostrado ante `403`.

### 6.5 Sin fugas de identidad para la Directiva

- La lista, el detalle, el historial (`JointPurchaseCallEvent` no lleva datos de agricultores, `schema.prisma:1953-1967`), `AuditLog` (E2-R17, `E2_…:292`) y los avisos no llevan nombres ni cantidades por persona.
- `pending_consent_count` y `participant_count` son conteos. No se sirven `accepted_at` por persona, ni `participation_ref`, ni nada que permita unir una cantidad con una persona.
- Riesgo aceptado y declarado en el texto de ayuda: con 1–2 participantes, un total sin nombres puede revelar una cantidad a quien sepa quién participó.

---

## 7. Compatibilidad

Estrategia de D-06 (§0).

### 7.1 Versiones del contrato del agricultor

| Contrato | Apps (`MOB`) | Hoy | Con este cambio |
|---|---|---|---|
| 1 (sin cabecera) | `6bac5a3` y anteriores | Forma 1 con `CONV-1` (`call-views.ts:470-488`) | Lecturas: forma 4. La app muestra «No se pudo leer la lista del sindicato…» (comportamiento conocido, `E2_…:349`). Escrituras: §7.2. |
| 2 | `9cb6d7b`/`e1f6e25` (v18) | Forma 2 (`call-views.ts:432-454`) | Lecturas: forma 4, y la app muestra «Actualice la aplicación» (`E2_…:423`). Escrituras: §7.2. |
| 3 | `4a3f1ad` (v19) hasta `507efc8` | Forma 3 (`MOB:lib/domain/sync/joint_purchase_call_view.dart:15`) | Lecturas: forma 4, y la app muestra «Actualice la aplicación» (`joint_purchase_call_view.dart:836-854`; texto en `joint_purchase_texts.dart:174-177`). Escrituras: §7.2. |
| **4** (NUEVO) | **Versión mínima compatible**: la primera compilación de `feat/acceso-rol-sin-k-mob` que implemente este contrato (esquema SQLite v20) | — | Forma completa. |

Por qué no se sirve a las apps anteriores su forma con su texto (`CONV-1` o `CONV-3`): esos textos dicen que la responsable (y sus autorizadas) ven los datos. Con la política nueva eso es falso, y servirlo **falsearía el texto** que el agricultor acepta. Sí es honesto que la app diga «Actualice la aplicación».

### 7.2 Escrituras de apps anteriores (y operaciones antiguas pendientes)

El emisor de la app actual reintenta para siempre si una respuesta 2xx no respeta su forma: `INVALID_RESPONSE` con espera creciente (`MOB:lib/services/sync/joint_purchase_sender.dart:448-460`, `:370-382`). Un 409 con un código desconocido es, en cambio, un rechazo definitivo (`:500-504`, `:418-421`). Por eso:

| Caso | Respuesta del servidor |
|---|---|
| Contrato 1–3, participación inexistente o con alcance anterior: confirmar (con `CONV-1/2/3`), modificar, retirar o reducir | Se acepta como hoy y se responde **en la forma de su contrato**, con `contractVersion` 1–3 y un alcance del enum anterior. Así no hay reintentos infinitos. La participación queda restringida para el detalle. |
| Contrato 1–3: ampliar o autorizar a la responsable | `409 CONSENT_VERSION_RETIRED`: rechazo definitivo, la operación local queda `REJECTED` y no se borra. |
| Contrato 1–3, participación con alcance `ADMINISTRATION` o `TOTALS_ONLY` (sólo posible con dos teléfonos o tras volver a una versión anterior) | `409 APP_UPDATE_REQUIRED` antes de decidir. Esas apps no conocen esos valores, y responder sería falsear o provocar reintentos. Límite declarado: esa app no puede retirar hasta actualizar. |
| Contrato 4 enviando una operación antigua guardada (por ejemplo, `CONFIRM` con `CONV-3` o una ampliación preparada sin conexión antes de actualizar) | Primera confirmación: se acepta con el alcance de su texto (no como `CONV-4`) y la app ofrece «Revisar quién puede ver mi participación». Ampliación o autorización: `409 CONSENT_VERSION_RETIRED`. Reducción: §4.2, punto 4. |

Ninguna decisión antigua se acepta como la nueva, ninguna ampliación antigua habilita a la Directiva y nada pendiente se borra en el teléfono.

### 7.3 Contrato institucional y Web

Back y Web cambian juntos (`contractVersion: 2` institucional). No hay clientes institucionales fuera de la Web.

---

## 8. Pruebas de autorización exigidas

**Backend PostgreSQL** (sustituyen o amplían `joint-purchase-calls.postgres.spec.ts` y `visibility-matrix.spec.ts`):

1. Directiva habilitada: `GET /participants` → 403. `/closing.participants` → `null`. Ningún nombre ni cantidad por persona en detalle, lista, historial, bitácora ni errores. Lo mismo cuando antes tenía `PARTICIPANTS` concedido (fila conservada) y cuando es la responsable.
2. Administración habilitada: ve sólo las participaciones `ADMINISTRATION`. Las `RESPONSIBLE_ONLY`, `COLLABORATORS` y `TOTALS_ONLY` sólo cuentan en `pending_consent_count`. Lo mismo siendo la responsable, con o sin delegaciones, con la responsable inhabilitada y tras una sustitución.
3. Administración que deja de estar habilitada (Member, cuenta, rol o tenant) o pasa a Directiva → 403 en la petición siguiente, sin cerrar sesión.
4. Otro tenant → 404 en todas las rutas. `AGRICULTOR` → 403 en las institucionales.
5. `POST /collaborators`, `/revoke` y `/review` con `PARTICIPANTS` → `409 GRANT_RETIRED`, sin filas, eventos ni bitácora nuevos. `MANAGE` sin cambios (las pruebas actuales siguen pasando).
6. `POST/revoke /joint-purchase-substitution-permissions` → `409 SUBSTITUTION_PERMISSION_RETIRED`. El `GET` devuelve la historia sin borrar nada.
7. Sustitución:
   - la hace una Administración habilitada sin permiso;
   - una Directiva con un permiso concedido antes recibe 403;
   - se repiten todas las pruebas P-A existentes: autosustitución, `RESPONSIBLE_STILL_ELIGIBLE`, `RESPONSIBLE_CHANGED` concurrente, `REQUEST_ID_REUSED`, `DRAFT`/`OPEN`/`CLOSED`/`CANCELLED`, consolidado intacto y recuentos de `Purchase`/`PayableAccount`/`StockMovement` iguales.
8. Consentimiento:
   - `CONV-4` en la primera confirmación da `ADMINISTRATION`;
   - una decisión `ADMINISTRATION` en `CLOSED` cambia la visibilidad sin tocar `JointPurchaseCallClosing*`;
   - en `CANCELLED` → 409;
   - ampliar o autorizar con cualquier versión → `CONSENT_VERSION_RETIRED`;
   - reducción atrasada → `STALE_SEQUENCE`, y una reducción posterior se respeta;
   - mismo `operation_id` → misma respuesta, y con otro cuerpo → `OPERATION_ID_REUSED`;
   - cambiar cantidades no cambia el alcance;
   - una decisión sobre el consentimiento no cambia cantidades.
9. Contratos 1, 2 y 3: lecturas con `contractVersion: 4`; escrituras de §7.2 con la forma de su contrato o con 409 definitivo; nunca un 2xx con un alcance desconocido para ese contrato.
10. Regla T:
    - producto con 1 persona `ADMINISTRATION` → `VISIBLE` en vivo y al cierre;
    - con una `RESPONSIBLE_ONLY` → `PENDING_CONSENT` en vivo;
    - al cierre con 3 o más personas y alguna anterior → `PREVIOUS_POLICY_K3` para la Directiva y `PENDING_CONSENT` para la Administración, que ve a otras por nombre;
    - con 2 personas anteriores al cierre → `PENDING_CONSENT`.
11. Resumen colectivo:
    - celda de 1 y de 2 aportantes `DISCLOSED` con `policy = F07-POL-02`;
    - cero explícito frente a ausencia;
    - ML frente a G;
    - `CANCEL`, disputa e inactivo retiran la cifra anterior;
    - `POLICY_PENDING` sin cifras en todos los canales;
    - campaña sellada con `F07-POL-01` sin cambios (incluidas las celdas `SUPPRESSED_UNDER_THRESHOLD`);
    - un borrador antiguo sigue sin cifra en sus líneas suprimidas;
    - una ejecución F12 anterior conserva `threshold = 3`.
12. Base de datos: rechaza insertar `PARTICIPANTS` en `JointPurchaseCallAccess`; CHECK política ⇔ umbral en `CollectiveSeal` y `EstimationRun`.
13. Activación: sin `COLLECTIVE_DISCLOSURE_POLICY`, el resumen sigue con `F07-POL-01` (K = 3, regla de combinaciones). Con `F07-POL-02`, se inserta una fila en `CollectiveDisclosurePolicyActivation` sólo en el primer arranque con ese valor. Un valor desconocido no arranca. La tabla rechaza `UPDATE` y `DELETE`. Una campaña sellada no cambia al activar.

**Web:** con respuestas de Directiva no se monta ningún nombre en el DOM, en los textos auxiliares ni en las descripciones accesibles. Las acciones retiradas no aparecen. Un 403 borra lo mostrado. La sustitución sólo aparece con `can_substitute_responsible`.

**Mobile:**
- migración v19 → v20 con datos y pendientes conservados (`MOB:test/migration_test.dart`);
- emisor: `CONSENT_VERSION_RETIRED` y `APP_UPDATE_REQUIRED` son definitivos y sin reintento;
- «Revisar quién puede ver mi participación» en `OPEN` y `CLOSED`, no en `CANCELLED`;
- lo pendiente no se anuncia como aplicado;
- una respuesta atrasada no pisa una decisión ni unas cantidades más nuevas;
- lista con `contractVersion` distinto de 4 → «Actualice la aplicación».

---

## 9. Casos límite

1. **Convocatoria abierta cuya responsable es Directiva:** sigue coordinando (`MANAGE`), pero no ve nombres. Necesita a una Administración habilitada para el detalle.
2. **Única Administración del sindicato e inhabilitada la responsable:** si la única Administración habilitada es la responsable inhabilitada, nadie puede sustituir. Si es otra persona, no puede nombrarse a sí misma (autosustitución) y necesita otra persona elegible. Si no la hay, no hay salida automática (como hoy, `E2_…:496`, `:552`); la convocatoria se cierra sola al vencer el plazo.
3. **Una sola participación `ADMINISTRATION` en un producto:** la Directiva ve el total, que es la cantidad de esa persona, sin su nombre. Es lo que dice el texto y la ayuda de `CONV-4`.
4. **Mezcla de alcances en un producto abierto:** `PENDING_CONSENT` hasta que todas acepten `CONV-4` o la persona anterior se retire. El conteo no dice quién falta.
5. **Una persona `TOTALS_ONLY`** (D-05): su nombre desaparece del detalle de Administración desde la petición siguiente. El total sigue visible (aceptó la cláusula de totales). Lo ya visto o copiado no se puede retirar (como dice hoy `joint_purchase_texts.dart:203-207`).
6. **Autorización `CONV-4` preparada sin conexión y convocatoria cancelada antes de enviarla:** `409 WIDENING_NOT_ALLOWED`, definitivo, y la app lo dice.
7. **`CONV-4` en una cerrada:** cambia lo visible del consolidado sin reabrirla ni cambiar cifras (`:1278-1291` lee el alcance vigente).
8. **Dos teléfonos del mismo agricultor, uno antiguo:** el antiguo recibe `APP_UPDATE_REQUIRED` en una participación con alcance nuevo y «Actualice» en las lecturas.
9. **Operación antigua de cantidades con `CONV-3`** enviada por la app nueva tras actualizar: se acepta como `RESPONSIBLE_ONLY` (nunca como `CONV-4`) y la app pide revisar.
10. **Celda colectiva retirada por `CANCEL` y cifra nueva:** sin la regla de combinaciones, la diferencia entre la cifra retirada (si alguien la guardó) y la nueva revela lo retirado. Es un riesgo aceptado por D-04 y queda declarado en F07 y en la ayuda de la Web.
11. **Sellado preparado antes del despliegue:** `review_ref` v1 frente a v2 → `409 SEAL_REVIEW_STALE`. La Web recarga la revisión.
12. **Campaña sellada con `F07-POL-01` en tendencias junto a otra con `F07-POL-02`:** cada campaña declara su política; nunca se suman ni restan entre campañas (`F07_…:200-205`).
13. **Ejecución F12 que citaba una entrada sellada:** el cambio no la invalida; la vigencia sólo cambia si cambian las fuentes.
14. **Respaldo Mobile v19 restaurado en una app v20:** migra al abrir. Un respaldo v20 en una app v19 se rechaza con «Actualice la aplicación» (`MOB:lib/data/backup_service.dart:786-790`).

---

## 10. Trazabilidad de requisitos

Sólo los IDs del Cap. III / SRS-AGRO-001 que ya citan los contratos fuente: RF-24 y RNF-05 (F07, `F07_…:7`), RU-18/RU-19 (ADR-003). Los IDs de RF/RN propios de compras conjuntas y consentimiento debe confirmarlos Roderich antes del acta. No se inventan aquí.

---

## 11. Implementación del Backend (sesión A, 2026-11-13)

Rama `feat/acceso-rol-sin-k-a`. Hito A0 (forma de las respuestas, `CONV-4` y códigos): `01bcfe2`. Ejemplos JSON: [`E4_EJEMPLOS_RESPUESTAS.md`](E4_EJEMPLOS_RESPUESTAS.md). Evidencia: `docs/evidence/E4_ACCESO_ROL_BACKEND_2026-11-13.md`. Este apartado sólo añade texto; no cambia ninguna decisión de §0.

Precisiones de la implementación (para revisar con el orquestador; ninguna amplía un acceso):

1. **Deshabilitación → 401, no 403.** Un Member, una cuenta o un tenant inactivos los rechaza el contexto de autenticación común (`CurrentAuthContextResolver`, fuera de E4) con `401` en todas las rutas institucionales. Un cambio de rol (Administración → Directiva) sí llega a la ruta y recibe `403 PARTICIPANTS_FORBIDDEN`. En los dos casos el acceso se corta desde la petición siguiente y el token no se revoca. §6.4 y §8.3 hablan de `403`; no se tocó el módulo IAM.
2. **Borrador.** Un producto sin ninguna participación (siempre en `DRAFT`) sale `VISIBLE` con `total_quantity_base: "0"` y `ROLE_CONSENT`: ninguna participación deja de cubrir los totales y el cero es real.
3. **Permisos de visualización guardados.** Las filas `PARTICIPANTS` se sirven en un arreglo propio, `retired_grants`, y los eventos de `history` llevan `retired` y `notice`. La fecha del aviso es la de la migración de E4 en ese entorno (`_prisma_migrations.finished_at`).
4. **Permiso «Sustituir responsable».** El `GET` pasa a `contractVersion: 2` y retira `holds_permission` y `holders[].eligible`. Sólo `retired_at`, `notice` y `can_grant: false` son nuevos.
5. **Contratos 1–3.** Además de §7.2: un `CONFIRM` con `CONV-4` de un contrato 1–3 recibe `409 APP_UPDATE_REQUIRED` (esas apps no conocen ese texto), y una decisión `ADMINISTRATION` o `TOTALS_ONLY` declarada con un contrato 1–3 recibe `400 PAYLOAD_INVALID`. `APP_UPDATE_REQUIRED` no se registra en el diario: la misma operación se decide cuando la app se actualiza.
6. **`responsible_authorization`.** Sólo sale en las respuestas de escritura del contrato 3, que lo exige; se calcula como antes y no da acceso a nadie. Las lecturas (forma 4) no lo llevan.
7. **Activación sin la tabla.** Si la base no tiene la migración de E4 y la política es la de por defecto, el arranque sigue y lo advierte en el log; con `COLLECTIVE_DISCLOSURE_POLICY` explícita, el arranque falla. Volver al valor por defecto después de `F07-POL-02` también inserta una fila.
8. **Defensa en profundidad.** El disparador de `JointPurchaseCallAccess` rechaza insertar `PARTICIPANTS` y también **borrar** una fila `PARTICIPANTS` guardada (historia).
9. **Borradores.** Un borrador nuevo graba la política de la decisión del resumen (la configurada, o la sellada si la campaña está sellada) y su huella pasa a `v: 2` con la política. La huella de un borrador anterior no se recalcula.
