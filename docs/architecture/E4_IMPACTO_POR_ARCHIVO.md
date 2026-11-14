# E4 — Impacto por archivo: acceso por rol y totales sin umbral

| Campo | Valor |
|---|---|
| Fecha | 2026-11-13 |
| Contrato | [`E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md`](E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md). Las referencias «§» y «D-0x» son suyas. |
| Bases | Backend y Web: este repositorio, rama `feat/acceso-rol-sin-k`, `07c1c02`. Mobile: `AppMovilAgroquimico`, rama `feat/acceso-rol-sin-k-mob`, `507efc8`. Las citas `:línea` son de esas bases. |
| Encargos | [`E4_BRIEF_SESIONES.md`](E4_BRIEF_SESIONES.md) |

**Dueño único** de cada archivo. Nadie edita un archivo de otro dueño; si lo necesita, lo pide al dueño a través del orquestador.

| Dueño | Qué le pertenece |
|---|---|
| **A** | Backend: `Back/**`, las migraciones, los contratos de API (`docs/architecture/E4_*` y las notas de sustitución) y las pruebas de autorización del servidor. Evidencia del Backend. |
| **B** | Web: `Web/**`, `docs/rediseno-web/**` y la evidencia de la Web. |
| **C** | Mobile: los archivos de compras conjuntas listados en §4, sus pruebas y la evidencia de Mobile. **No** toca los archivos de la sesión del modo individual (`proyectoagro-52`, §4.1). |

Cifras:

| Componente | Código de producción | Pruebas | Documentos | Total |
|---|---|---|---|---|
| Backend (A) | 31 (con la migración y el registro de activación nuevos, y `synthetic-sources.ts`) | 17 | 3 | **51** |
| Web (B) | 30 | 23 (más 2 nuevos) | 3 | **56 (+2)** |
| Mobile (C) | 9 | 8 | 2 | **19** |

Módulos del Backend con K: `collective` (resumen, sellado, tendencias y borradores), `estimation` (trabajador y lecturas), `joint-purchase-calls` (totales de convocatoria) y `proposal-estimation` (sólo pruebas y textos de E3).

---

## 1. Archivos compartidos y su único dueño

| Archivo o pieza | Dueño | Quién lo consume | Regla |
|---|---|---|---|
| Texto y ayuda de `CONV-4` (`Back/src/modules/joint-purchase-calls/domain/consent.ts`) | **A** | C lo copia **byte a byte** en `lib/domain/sync/joint_purchase_call_view.dart` | El teléfono rechaza cualquier diferencia (`joint_purchase_call_view.dart:846-854`). A publica la cadena final en el PR y C la copia de ahí. |
| Códigos de error nuevos (`GRANT_RETIRED`, `SUBSTITUTION_PERMISSION_RETIRED`, `CONSENT_VERSION_RETIRED`, `APP_UPDATE_REQUIRED`) en `Back/src/modules/joint-purchase-calls/domain/call-error.ts` | **A** | B (`lib/joint-purchase-call-text.ts`) y C (`joint_purchase_texts.dart`, `joint_purchase_sender.dart`) | Lista cerrada en el contrato §3. |
| Forma del contrato 4 del agricultor (`Back/src/modules/joint-purchase-calls/application/call-views.ts`) | **A** | C | Cambios sólo por el contrato. |
| Forma institucional `contractVersion: 2` (`call-views.ts`, `calls-openapi.schemas.ts`, `collective-openapi.schemas.ts`) | **A** | B (`Web/src/types/*.ts`) | B adapta los tipos después de A. Comparten repositorio, no archivo. |
| `docs/architecture/E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md`, este archivo y `E4_BRIEF_SESIONES.md` | **A** a partir de ahora (los redactó la sesión CONTRATO, `e0a41c7` y siguientes) | B y C | Un cambio de contrato que descubra B o C se pide a A a través del orquestador. Lo que decidió el autor (E4 §0) no lo cambia ninguna sesión. |
| Notas de sustitución ya añadidas (`a8ebcdf`) en E2, P-A, contraste E2/E3, F07, F07 sellado, E3, F12 y el Excel único; enmienda de F06 §5 | **A** | Todos | Sólo se añade texto; nunca se borra el anterior. La enmienda de F06 es decisión del autor y su contenido no se cambia sin él. |
| `docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md`: la redacción final de las columnas del Excel, una vez implementadas | **B** | — | Se añade una nota con la implementación real. |
| Nueva evidencia `docs/evidence/ACC_ROL_SIN_K_*.md` (BE) | **A**; B añade su sección en un archivo propio, `ACC_ROL_SIN_K_WEB_*.md` | — | Un archivo por responsable. |
| Evidencia Mobile `docs/rediseno/` o `docs/evidence/` (MOB) | **C** | — | — |

---

## 2. Backend (A)

### 2.1 Base de datos

| Archivo | Cambio | Por qué |
|---|---|---|
| `Back/prisma/schema.prisma` | Enum `JointPurchaseConsentScope` + `ADMINISTRATION` + `TOTALS_ONLY` (D-05) (`:1888-1891`). `CollectiveRelease.policy String? @db.VarChar(16)` (`:1087-1109`). `JointPurchaseProposal.disclosurePolicy String?` (`:1180-1207`). `CollectiveSeal.threshold Int?` (`:1257`) y `EstimationRun.threshold Int?` (`:1538`). Comentarios de `JointPurchaseCallAccess` (`:1805-1809`) y `JointPurchaseSubstitutionGrant` (`:2120-2125`): «historia, no da acceso». | Contrato §4.3–§4.4 |
| `Back/prisma/migrations/2026111x_acceso_rol_sin_k/migration.sql` (NUEVO) | `ALTER TYPE … ADD VALUE`; columnas nuevas nulas sin relleno; `DROP NOT NULL` y CHECK política ⇔ umbral en `CollectiveSeal` y `EstimationRun` (sustituye a `CollectiveSeal_values`, `20261023100000…/migration.sql:68-76`, y a `EstimationRun_values`, `20261101233651…/migration.sql:360-372`, sin cambiar el resto de condiciones); disparador que rechaza `INSERT` de `grant = 'PARTICIPANTS'` (amplía `joint_purchase_call_access_guard`, `20261112180000…/migration.sql:245-277`); tabla NUEVA `CollectiveDisclosurePolicyActivation`, sólo de inserción y vacía al migrar. | Expansión aditiva. Nada se reescribe (E4 §4.4, §5.1). |

### 2.2 Colectivo (K)

| Archivo | Cambio | Por qué |
|---|---|---|
| `Back/src/modules/collective/application/collective-config.ts` | Variable NUEVA `COLLECTIVE_DISCLOSURE_POLICY`: `F07-POL-01` por defecto, `F07-POL-02`; un valor desconocido impide arrancar | Activación explícita (§5.1, D-03) |
| `Back/src/modules/collective/application/collective-policy-activation.ts` (NUEVO) | Al arrancar, inserta una fila en `CollectiveDisclosurePolicyActivation` si la política configurada difiere de la última registrada, y lo escribe en el log | Activación trazada (§5.1, D-03) |
| `Back/src/modules/collective/domain/disclosure-policy.ts` | Función NUEVA `decideCellsWithoutThreshold` (R1 y R3/§9 retiradas; R2, R4 y R7 conservadas). Las de `F07-POL-01` se conservan (`:126-282`), seleccionadas por la configuración | §5.1, D-04 |
| `Back/src/modules/collective/domain/differencing.ts` | Sin cambio (sólo lo usa `F07-POL-01`) | — |
| `Back/src/modules/collective/domain/seal.ts` | `sealedCellStatus(entry, threshold: number \| null)`: con `null` no retira por umbral (`:38-43`). `reviewFingerprint` `v: 2` con `policy` (`:71-92`) | §3.4, §5.3 |
| `Back/src/modules/collective/domain/proposal.ts` | Tipo de estado: `SUPPRESSED_UNDER_THRESHOLD` sólo histórico (`:4-8`). La huella de borradores nuevos incluye la política (`v: 2`) | §4.4 |
| `Back/src/modules/collective/application/collective-summary.use-case.ts` | `disclosure.policy`/`threshold` según la configuración (`:197`, `:249`, `:364-369`). Escribir `policy` en `CollectiveRelease` (`:317-336`). `fromSealed` sirve la política sellada (`:243-255`, `:503-544`, en particular `:516`). Tipo `CollectiveSummary.disclosure` (`:71-76`) | §3.4, §5.1 |
| `Back/src/modules/collective/application/collective-seal.use-case.ts` | Grabar `policy` y `threshold` (NULL con `F07-POL-02`) (`:121-140`); revisión `v: 2` (`:210-220`) | §4.4 |
| `Back/src/modules/collective/application/collective-trends.use-case.ts` | Política y umbral por campaña sellada (`:55`, `:153-154`) | §3.4 |
| `Back/src/modules/collective/application/joint-purchase-proposal.use-case.ts` | Grabar y servir `disclosurePolicy` (`:55`, `:190-217`, `:261`) | §4.4 |
| `Back/src/modules/collective/api/rest/collective-openapi.schemas.ts` | `policy` enum + `F07-POL-02` (`:94`, `:267`); `threshold` nulo; `seal.policy`/`seal.threshold`; descripción de `SUPPRESSED_UNDER_THRESHOLD` como histórico (`:59`, `:207`, `:378`) | — |

### 2.3 Estimación (K)

| Archivo | Cambio | Por qué |
|---|---|---|
| `Back/src/modules/estimation/application/estimation-worker.ts` | `POLICY` y `threshold` según la configuración (`:43`, `:356`, `:375`) | §4.4 |
| `Back/src/modules/estimation/application/estimation-reads.use-case.ts` | `stillDisclosed` sin `contributorCount >= PROVISIONAL_THRESHOLD` (`:413-436`); comentario (`:48`) | §3.4 |
| `Back/src/modules/estimation/domain/run-content.ts` | `threshold: number \| null` (`:32`) | Huella de la ejecución |
| `Back/src/modules/estimation/test-support/synthetic-sources.ts` | Fuentes de ambas políticas (`:73`) | Pruebas |

### 2.4 Convocatorias (permisos, consentimiento, totales)

| Archivo | Cambio | Por qué |
|---|---|---|
| `Back/src/modules/joint-purchase-calls/domain/visibility.ts` | Reescritura: retirar `CALL_TOTALS_THRESHOLD` (`:4`), `RESPONSIBLE_ONLY`/`RESTRICTED`/`UNDER_THRESHOLD` (`:11`) y el visor `RESPONSIBLE`/`COLLABORATOR`/`formerParticipantsHolder` (`:63-68`). Regla T (§5.2) con `totals_basis`; detalle sólo para Administración habilitada y alcance `ADMINISTRATION` | §2, §5.2 |
| `Back/src/modules/joint-purchase-calls/domain/consent.ts` | `CONV-4`, `help`, alcances nuevos; `decisionVersionAccepted` y `scopeCoversCollaborators` sustituidas por `coversDetail`/`coversTotals` (`:22-63`) | §4.1–§4.2 |
| `Back/src/modules/joint-purchase-calls/domain/participation-input.ts` | Admitir `ADMINISTRATION`/`TOTALS_ONLY`; `authorize_responsible` con `ADMINISTRATION` → 400; huella (`:37`, `:54-59`, `:140-183`) | §4.2 |
| `Back/src/modules/joint-purchase-calls/domain/call-error.ts` | Cuatro códigos NUEVOS (`:27-102`) | §3 |
| `Back/src/modules/joint-purchase-calls/application/call-access.ts` | `accessOf` por rol (`isEligibleAdministrator`) en vez de filas `PARTICIPANTS` (`:83-109`); `rowInForce` y `rowPendingReview` sólo para `MANAGE` (`:49-57`); `holdsSubstitution` sin uso (`:151-157`) | §2, §6 |
| `Back/src/modules/joint-purchase-calls/application/call-store.ts` | `ACCESS_PARTICIPANTS` sólo para leer la historia | — |
| `Back/src/modules/joint-purchase-calls/application/institutional-calls.use-case.ts` | Detalle (`:881-1024`, sobre todo `:973-987`), `participants` (`:197-246`), `renderClosing` (`:1079-1155`), `totalsOf` y `frozenParticipations` sin `authorizedForResponsible` (`:1033-1077`, `:1272-1295`), `open` sin fila ni texto de permiso (`:69`, `:442-450`), `grant`/`revoke`/`reviewDelegation` con `PARTICIPANTS` → `GRANT_RETIRED` (`:526-735`), `renderCollaborators` (`:1157-1225`) | §3.1 |
| `Back/src/modules/joint-purchase-calls/application/responsible-substitution.use-case.ts` | `substitute` por rol (`:228`), sin crear ni borrar filas `PARTICIPANTS` (`:280-289`), suspender sólo `MANAGE` (`:250-259`); `grantPermission`/`revokePermission` → `SUBSTITUTION_PERMISSION_RETIRED` (`:121-189`); vista de permisos de sólo lectura (`:117`, `:345-351`) | §3.2, §6.3 |
| `Back/src/modules/joint-purchase-calls/application/farmer-participation.use-case.ts` | `list`/`history` con `CONV-4` y `help` (`:85-166`); recibir el contrato del teléfono para `APP_UPDATE_REQUIRED` (§7.2); primera confirmación `CONV-4` → `ADMINISTRATION` con `consentResponsibleVersion` nulo (`:303-344`); `decideScope` con las reglas de §4.2 (`:406-470`) | §4.2, §7.2 |
| `Back/src/modules/joint-purchase-calls/application/call-views.ts` | Vistas institucionales v2 sin `totals_threshold`, `hidden_*`, `pending_authorization_*` ni `has_substitution_permission` (`:228-393`); `pendingConsentNotice` NUEVO en lugar de `hiddenNotice`/`pendingAuthorizationNotice` (`:400-413`); `GRANT_LABEL` (`:395-398`); contrato 4 y adaptadores de escritura para los contratos 1–3, que nunca emiten un alcance nuevo (`:422-488`) | §3, §7 |
| `Back/src/modules/joint-purchase-calls/api/rest/farmer-calls.controller.ts` | `contractOf` reconoce 4 (`:26-41`); las lecturas salen siempre con la forma 4; las escrituras, con la forma de su contrato (`:151-162`) | §7 |
| `Back/src/modules/joint-purchase-calls/api/rest/institutional-calls.controller.ts` | Descripciones de OpenAPI (`:45-58`, `:186-284`) | Documentación de la API |
| `Back/src/modules/joint-purchase-calls/api/rest/substitution-permissions.controller.ts` | `POST` y `revoke` → 409; `GET` de historia (`:31-69`) | §3.2 |
| `Back/src/modules/joint-purchase-calls/api/rest/calls.dto.ts` | `ConsentDecisionDto.scope` `@IsIn` amplía valores (`:236`); textos de `authorize_responsible` (`:252`) | §4.2 |
| `Back/src/modules/joint-purchase-calls/api/rest/calls-openapi.schemas.ts` | Enum de visibilidad (`:193`); sin `totals_threshold` (`:257`, `:306`, `:514`, `:534`); campos NUEVOS | §3.1 |

### 2.5 Pruebas del Backend (A, incluidas todas las de autorización de E4 §8 del servidor)

| Archivo | Cambio |
|---|---|
| `joint-purchase-calls/domain/visibility-matrix.spec.ts` | Matriz nueva: regla T × rol × alcance × fuente |
| `joint-purchase-calls/domain/call-domain.spec.ts` | Sin umbral ni `RESPONSIBLE_ONLY` |
| `joint-purchase-calls/joint-purchase-calls.postgres.spec.ts` | Pruebas 1–10 de E4 §8; P-A sin permiso; contratos 1–4 |
| `collective/…activation….postgres.spec.ts` (NUEVO) | Prueba 13 de E4 §8 (por defecto `F07-POL-01`, una fila por activación, sólo inserción, lo sellado intacto) |
| `collective/domain/disclosure-policy.spec.ts` | Casos `F07-POL-02` (1 y 2 aportantes, R4); `F07-POL-01` se conserva |
| `collective/domain/seal.spec.ts`, `collective/domain/proposal.spec.ts` | Umbral nulo y huellas v2 |
| `collective/f06-coll-05-collective-aggregate.postgres.spec.ts`, `f07-acceptance.postgres.spec.ts`, `f07-collective-seal.postgres.spec.ts`, `f07-web-proposal.postgres.spec.ts`, `f10-sec-02-disclosure-gaps.postgres.spec.ts` | Fijar `F07-POL-01` donde prueban K (evidencia) y añadir casos `F07-POL-02` |
| `collective/test-support/k-comparison/f07-pol-01-k-comparison.postgres.spec.ts` | Sin cambio (sólo `F07-POL-01`) |
| `estimation/domain/validity.spec.ts`, `series.spec.ts`, `infrastructure/f12-est-01-…`, `f12-est-05-runs…`, `f12-est-08-proposal-reference…` | Umbral nulo y vigencia sin recuento |
| `proposal-estimation/infrastructure/e3-proposal-estimation-link.postgres.spec.ts` | Restricción «bajo el umbral vigente» → sólo retirada o política |

### 2.6 Documentos del Backend (A)

Mantenimiento de `E4_*` si la implementación descubre algo (a través del orquestador), una nota final de implementación en E2 y F07, y la evidencia nueva `docs/evidence/E4_ACCESO_ROL_*.md`. Las notas de sustitución y la enmienda de F06 ya están (`a8ebcdf`).

---

## 3. Web (B)

### 3.1 Convocatorias y permisos

| Archivo | Cambio | Por qué |
|---|---|---|
| `Web/src/types/joint-purchase-calls.ts` | Visibilidad `VISIBLE \| PENDING_CONSENT` (`:27-37`); sin `totals_threshold` (`:169-170`, `:276`), `hidden_*`, `pending_authorization_*` (`:187`, `:240-244`, `:282-284`) ni `has_substitution_permission` (`:181`); `pending_consent_count`, `totals_basis`; `JointPurchaseCallGrant` operativo = `MANAGE` (`:44`); `SubstitutionPermissions` de historia (`:356`) | §3.1 |
| `Web/src/services/joint-purchase-calls.service.ts` | Quitar `grantSubstitution`/`revokeSubstitution` (`:97-101`); `collaborators`/`grant`/`revoke`/`review` sólo con `MANAGE` (`:63-78`) | §3.1–§3.2 |
| `Web/src/lib/joint-purchase-call-text.ts` | `GRANT_*` sólo «Administrar» (`:55-74`); textos de sustitución por rol (`:141-197`); `accessRules` sin `threshold` (`:227-242`); `UNDER_THRESHOLD_TEXT`, `RESTRICTED_TOTAL_TEXT` y `RESPONSIBLE_ONLY_*` → «Pendiente de autorización de los agricultores» (`:244-260`); `PARTICIPANTS_FORBIDDEN_TEXT` → «El detalle identificado sólo lo consulta la Administración, con autorización de cada agricultor» (`:125-133`); `pendingAuthorizationText`/`hiddenParticipantsText` → `pendingConsentText` (`:198-208`); mensajes de los códigos nuevos | §2, §5.2 |
| `Web/src/components/b/call-ui.tsx` | `CallTotal` sin `threshold` y con `totals_basis` («Consolidado al cierre · regla anterior de 3 personas») (`:75-95`); `AccessRules` reescrito (`:208-217`) | §5.2 |
| `Web/src/pages/joint-purchase-call-detail.page.tsx` | Panel de participantes sólo con `can_view_participants` (Administración), con un aviso de pendientes sin nombres (`:875-930`); `CollaboratorsSection` sólo para `MANAGE` y los `PARTICIPANTS` como historia retirada (`:487-497`, `:1070-1330`); quitar el diálogo de revisión de `PARTICIPANTS` (`:623-648`); `GrantDialog` sólo para `MANAGE` (`:1498`); sustitución por rol (`:410-420`, `:650-660`, `:1331-1497`); `myRevokedGrants` y el aviso de revocación sólo para el rol (`:333-345`, `:722-733`, `:850`); `whyVisible` (`:861`); `withoutParticipantsPermission` (`:705-716`); se conserva la comprobación periódica (`:268-285`) | §2, §6.4–§6.5 |
| `Web/src/components/b/substitution-permissions.tsx` | Sólo historia («Ya no se usa»), sin conceder ni revocar | §3.2 |
| `Web/src/components/c/substitution-slot.tsx`, `Web/src/pages/substitution-permissions-section.tsx` | Mostrar la historia de sólo lectura o retirarse | §3.2 |
| `Web/src/pages/users.page.tsx` (`:218`), `Web/src/pages/joint-purchase-calls.page.tsx` (`:253`) | Quitar el panel de gestión del permiso (o dejar la historia plegada) | §3.2 |

### 3.2 Colectivo (K)

| Archivo | Cambio | Por qué |
|---|---|---|
| `Web/src/types/collective.ts` | `policy: 'F07-POL-01' \| 'F07-POL-02'` (`:69`, `:174`); `threshold: number \| null`; `seal.policy`/`seal.threshold`; `SUPPRESSED_UNDER_THRESHOLD` como histórico (`:9`) | §3.4 |
| `Web/src/types/estimation.ts` (`:168`), `Web/src/types/estimation-link.ts` (`:75`) | `threshold: number \| null` | §4.4 |
| `Web/src/lib/collective-text.ts` | `statusReason` de `SUPPRESSED_UNDER_THRESHOLD`: «Sin cifra según la política anterior (mínimo de 3 aportantes)» y sin «para no revelar aportes individuales» (`:13-18`) | §5.1 |
| `Web/src/components/ui/status-text.ts` | Etiqueta «Oculto por privacidad» → «Sin cifra (política anterior)» (`:14`) | No decir «anónimo»; trazar la política |
| `Web/src/components/ui/status-chip.tsx` (`:21-33`), `Web/src/components/ui/data-state.tsx` (`:91-122`), `Web/src/components/collective-ui.tsx` (`:20-72`, `:97`, `:190-199`, `:329-355`) | `threshold` opcional y nulo; quitar «aún no alcanzan el umbral» (`:97`) | §5.1 (sin `pending_changes` por umbral) |
| `Web/src/components/needs-bars.tsx` | Quitar «Menos de N agricultores» y «Oculta por privacidad» para lo no sellado (`:22`, `:55`, `:89-98`, `:154`, `:173`) | §5.1 |
| `Web/src/pages/collective-summary.page.tsx` | Textos «Cada cifra necesita al menos N agricultores» y «Una cifra se oculta…» (`:238`, `:345`, `:366-368`) | §5.1 |
| `Web/src/pages/collective-trends.page.tsx` | Política por campaña; `columnsOf`/`statusReason` (`:180`, `:337`, `:360-368`) | §3.4 |
| `Web/src/pages/joint-proposal.page.tsx` | Líneas `SUPPRESSED_UNDER_THRESHOLD` rotuladas con la política del borrador (`:778`, `:797-806`); ejecución «umbral N» → política (`:1506`) | §4.4 |
| `Web/src/components/seal-panel.tsx` | «bajo el umbral» (`:116`); «no hace anónimos los datos» → «son datos agregados, sin nombres» (`:123`) | No decir «anónimo» |
| `Web/src/components/coverage-card.tsx` (`:74`), `Web/src/components/a/coverage-figure.tsx` (`:98`), `Web/src/components/c/participation-card.tsx` (`:72`) | «ocultas o en revisión» → «en revisión o retiradas» | §5.1 |
| `Web/src/lib/xlsx-common.ts` | `PENDING_CHANGES_TEXT` (`:24`); `STATUS_LABEL` (`:29`); `threshold` opcional (`:90-94`) | Exportaciones |
| `Web/src/lib/collective-summary-xlsx.ts` | Portada: «Política aplicada» en lugar de «Umbral de privacidad» (`:47`, `:52-61`, `:124`, `:141-150`) | Exportaciones |
| `Web/src/lib/trends-xlsx.ts` | Política por campaña (`:78-79`, `:108`, `:150`, `:172`) | Exportaciones |
| `Web/src/lib/joint-purchase-xlsx.ts` | Política del borrador en la portada; etiquetas desde `xlsx-common` | Exportaciones |

### 3.3 Pruebas de la Web

Se adaptan:
- `components/b/call-ui.test.tsx`, `components/collective-ui.test.tsx`, `components/needs-bars.test.tsx`;
- `components/ui/status-chip.test.tsx`, `data-state.test.tsx`, `controls.test.tsx`;
- `lib/collective-xlsx.test.ts`, `lib/joint-purchase-xlsx.test.ts`;
- `pages/collective-summary.page.test.tsx`, `collective-summary.v2.test.tsx`, `collective-trends.page.test.tsx`, `estimation.page.test.tsx`;
- `pages/joint-proposal.page.test.tsx`, `.v2.test.tsx`, `.reference.test.tsx`, `.estimation-link.test.tsx`;
- `pages/joint-purchase-call-detail.page.test.tsx`, `.rediseno.test.tsx`;
- `pages/joint-purchase-calls.page.test.tsx`, `.rediseno.test.tsx`;
- `pages/substitution-permissions-section.test.tsx`, `pages/users.page.test.tsx`;
- `test/fixtures.ts` (`:37`, `:126`).

Pruebas nuevas:
- «Directiva: ningún nombre en el DOM ni en los textos auxiliares»;
- «acciones retiradas ausentes».

Fuera de alcance salvo que B lo quiera: `Web/src/dev/**` (prototipos y fixtures) y `components/ui/README.md`.

### 3.4 Documentos de la Web (B)

`docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md` (fila de umbral), `docs/rediseno-web/CONTINUIDAD.md` y `HALLAZGOS_FUNCIONALES.md` (láminas de permisos y sustitución que se retiran).

---

## 4. Mobile (C)

### 4.1 Reparto con la sesión del modo individual (`proyectoagro-52`)

Son de `proyectoagro-52` y **C no los toca**:
- `app_shell`, `dashboard_screen`, `register_sheet`, `more_screen`, `operation_mode_screen` y `sync_status_banner.dart`;
- `purchase_form*`, `application_form*`, `plan_form*` e `inventory_*`;
- `operations`, `applications` y `planning`;
- `persons` y `person_detail`;
- los widgets `ind_*`.

Ningún archivo de §4.2 está en esa lista.

**Peticiones a `proyectoagro-52`:**
- **Opcional:** un aviso en Inicio (`dashboard_screen`) del tipo «Revise quién puede ver su participación» para las participaciones con consentimiento anterior. No hace falta para cumplir E4: la acción vive en «Compras conjuntas». Si se quiere, va como «petición a proyectoagro-52».
- **Coordinación obligatoria:** `lib/data/app_database.dart` no está en la lista, pero el número de versión del esquema (`schemaVersion`, hoy 19, `:21`) es único para la app. Antes de fijar v20, C confirma con el orquestador que `proyectoagro-52` no usa ese número.

### 4.2 Archivos de C

| Archivo | Cambio | Por qué |
|---|---|---|
| `lib/domain/sync/joint_purchase_call_view.dart` | `jointPurchaseContractVersion = 4` (`:15`); `CONV-4`, texto y ayuda (`:23-31`); alcances + `ADMINISTRATION`, `TOTALS_ONLY` (`:37-41`); claves de `consent` + `help` (`:846-854`); `responsible.version` y `responsible_authorization` opcionales (los envía el contrato 3 guardado) (`:385-398`, `:499`, `:517-523`); `coversCollaborators` → `coversDetail`/`needsReview` (`:231-235`); `JointPurchaseErrorBody` con los códigos nuevos (`:754-818`) | Contrato §3.3, §4 |
| `lib/data/app_database.dart` | `schemaVersion = 20` (`:21`). La cola de decisiones tiene `CHECK (scope IN ('RESPONSIBLE_ONLY','COLLABORATORS'))` (`:131`): o una **tabla nueva** aditiva para las decisiones del alcance nuevo, con el orden calculado sobre las dos colas, o una reconstrucción de la tabla en una transacción. Recomendado: tabla nueva, como en todo el historial de migraciones aditivas. Las tablas v16–v19 (`:60-143`) no se tocan | §4, compatibilidad |
| `lib/data/sync/joint_purchase_store.dart` | `confirm` con `CONV-4` (`:764-775`); decisión «Revisar quién puede ver mi participación» (`ADMINISTRATION`) y «Retirar la autorización» (`TOTALS_ONLY`, D-05), en sustitución de `decideConsent` con ampliar o reducir y autorizar responsable (`:960-1100`); las operaciones antiguas pendientes se conservan y se envían tal cual | §4.2, §7.2 |
| `lib/services/sync/joint_purchase_sender.dart` | `CONSENT_VERSION_RETIRED`, `APP_UPDATE_REQUIRED` y `WIDENING_NOT_ALLOWED` definitivos y sin reintento (`:357-430`, `:433-512`) | Sin reintentos infinitos |
| `lib/services/sync/joint_purchase_api.dart` | Cabecera `X-Joint-Purchase-Contract: 4` (`:130`) | §7.1 |
| `lib/presentation/widgets/joint_purchase_texts.dart` | Reescribir «Quién ve sus datos» (`:237-267`); retirar ampliar y reducir (`:187-235`) y la autorización de la responsable (`:269-304`); textos de `CONV-4`, de pendiente frente a aplicada y de los códigos nuevos; tratamiento de «usted» | §4.1, §6.5 |
| `lib/presentation/widgets/joint_purchase_responsible_review.dart` | Sustituido por el diálogo «Revisar quién puede ver mi participación» (texto `CONV-4`, ayuda, casilla sin marcar, «Sus cantidades no cambian») | P-A C1 retirado |
| `lib/presentation/screens/joint_purchase_detail_screen.dart` | Sección «Quién ve sus datos» (`:410-440`); `_decide` (`:110-125`) | — |
| `lib/presentation/screens/joint_purchases_screen.dart` | Chip «Revisar autorización» en las participaciones con alcance anterior | Acción para las históricas |

No se añade ningún texto sobre totales colectivos en necesidades ni en consumo (D-08).

Pruebas de Mobile:
- `test/e2_joint_purchase_store_test.dart`, `e2_joint_purchase_sender_test.dart`, `e2_joint_purchase_screens_test.dart` y `e2_joint_purchase_isolation_test.dart`;
- `test/e2_pa_responsible_test.dart`, que pasa a cubrir la revisión con `CONV-4`;
- `test/migration_test.dart` (v19 → v20 con pendientes) y `test/schema_equivalence_test.dart`;
- `test/support/e2_joint_purchase_fixtures.dart`.

Documentos de Mobile (C): `docs/rediseno/REDISENO_MOVIL_CONTINUIDAD.md` y evidencia propia.

Sin cambios previstos en `lib/data/backup_service.dart`: toma `AppDatabase.schemaVersion` y rechaza respaldos más nuevos (`:786-790`).

---

## 5. Orden

1. **A publica primero la forma de las respuestas.** En un commit propio, antes de la lógica:
   - `call-views.ts`;
   - `calls-openapi.schemas.ts` y `collective-openapi.schemas.ts`;
   - `consent.ts`, con `CONV-4` y su ayuda definitivas;
   - `call-error.ts`;
   - el documento NUEVO `docs/architecture/E4_EJEMPLOS_RESPUESTAS.md`, con un ejemplo JSON por respuesta y rol.

   A comunica el SHA al orquestador.
2. **B y C trabajan sobre ese SHA** en paralelo, mientras A implementa la lógica, la migración y las pruebas.
3. **Recorrido conjunto** cuando el orquestador lo coordine: Web, emulador y una app anterior (contrato 3) para comprobar «Actualice la aplicación» sin pérdida de pendientes.
