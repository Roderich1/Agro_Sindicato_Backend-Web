# E2 — Convocatorias de compra conjunta y participación identificada (contrato de la etapa 2)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-11 (redacción). Estado: **Aceptado en las reglas acordadas** por Roderich el 2026-11-12; reglas añadidas decididas el 2026-11-12 en §11 (prevalece); **pendiente**: P-A (sustitución de responsable), ver `E2_PA_SUSTITUCION_RESPONSABLE_OPCIONES.md` |
| Alcance | Etapa 2: convocatorias (Borrador, Abierta, Cerrada, Cancelada), participación identificada del agricultor, cierre atómico con «Consolidado al cierre», avisos dentro de la aplicación |
| Bases | Back/Web: rama `feat/etapa2-convocatorias` desde `feat/etapa1-identificacion-productos` (worktree `_wt/ET2-BE`). Mobile: rama `feat/etapa2-convocatorias` desde `feat/etapa1-productos-identificacion-foto` (worktree `_wt/ET2-MOB`) |
| Contratos que **no cambian** | F05 (Sync v1), F06 (proyección colectiva), F07 (divulgación de agregados y sellado), F08 (respaldo), F12 (estimación), E1 (identificación) |
| Fuera de alcance | Asignación de cantidades compradas, entregas, cobros y pagos, proveedores, compras automáticas, cambios de inventario, estimación integrada, notificaciones push o servicios externos |

## 1. Qué existe y qué se reutiliza

- `AgriculturalCampaign` (campaña agrícola): sin cambios. Abrir, cerrar o cancelar una convocatoria **no** cambia su estado.
- `JointPurchaseProposal` y sus líneas (borradores de propuesta F07): pueden servir de **origen** para elegir productos. Sus líneas no guardan cantidades por agricultor; la cifra de referencia sale de la divulgación (`CollectiveRelease`) que citan. Una convocatoria guarda la referencia a esa línea, nunca identidades ni cantidades individuales.
- `Product` (catálogo del sindicato): los productos de una convocatoria son **productos colectivos** del tenant: activos, con unidad `L` o `KG` y **canónicos** (no denominaciones asociadas a otro producto; F07 §2).
- Autenticación del agricultor: `SyncV1AuthGuard` (Member AGRICULTOR, sesión v2, registro de cliente). Institucional: JWT + `@Roles`.
- Bitácora: `AuditLog` con `ownerUserId = null` para acciones institucionales (sin cantidades ni nombres de agricultores en `summary`).
- Mobile: patrón del emisor E1 (`IdentificationRequestSender`): tabla propia con estado de envío, `SyncBackoff`, `ensureAccess`, comprobación de titular. **No** se usa `sync_outbox`.

**Lo legado que NO se usa:** `Purchase`, `PurchaseParticipant`, `PayableAccount` y `POST /purchases/joint` (cerrados por F10-SEC-02 #45; crean deudas). Una participación no es una compra ni una deuda.

## 2. Decisiones

| ID | Decisión | Motivo |
|---|---|---|
| E2-D1 | Entidad nueva `JointPurchaseCall` («Convocatoria de compra conjunta»), distinta de `AgriculturalCampaign`. Una campaña puede tener varias. | Regla 1. |
| E2-D2 | Estados `DRAFT → OPEN → CLOSED`, `DRAFT → CANCELLED`, `OPEN → CANCELLED`. No hay reapertura, prórroga ni cambio de productos, nombre o fecha límite después de abrir. `CLOSED` y `CANCELLED` son finales. | Regla 2. |
| E2-D3 | Un producto colectivo no puede estar en dos convocatorias **abiertas** de la misma campaña. Garantía en la base: columna `openCampaignId` en el producto de la convocatoria (igual a `campaignId` mientras está `OPEN`, `NULL` en otro caso) con índice único parcial `(tenantId, openCampaignId, productId) WHERE openCampaignId IS NOT NULL`; además, bloqueo por tenant (`pg_advisory_xact_lock`) al abrir. Dos aperturas concurrentes: una gana, la otra recibe 409 `PRODUCT_IN_OPEN_CALL`. | Regla 2, concurrencia. |
| E2-D4 | Fechas en hora del **servidor**. `openedAt` = hora del servidor al abrir; `deadlineAt` fijada en el borrador, debe ser posterior a la apertura (si al abrir ya pasó: 422 `DEADLINE_IN_PAST`). | Regla 7. |
| E2-D5 | Responsable: un usuario institucional (`DIRECTIVA` o `ADMINISTRADOR`) activo del mismo tenant, asignado en el borrador por un usuario `DIRECTIVA`/`ADMINISTRADOR` del tenant. Puede ser quien crea el borrador (queda registrado en el historial y la bitácora). **No cambia después de abrir**: el agricultor aceptó que *ese* responsable vea su nombre. Un agricultor, un usuario de otro tenant o un usuario inactivo nunca puede ser responsable ni asignarlo. | Regla 5, «impedir autoasignaciones no autorizadas». |
| E2-D6 | Permiso específico `JointPurchaseCallAccess (callId, userId, grant = PARTICIPANTS)`: lo crea el sistema **sólo** para el responsable al abrir. Ver participantes identificados exige esa fila; **ningún rol** lo concede por sí solo (tampoco `ADMINISTRADOR`). Sin la fila: 403 `PARTICIPANTS_FORBIDDEN`. Se limita al tenant y a la convocatoria. | Regla 5. |
| E2-D7 | Lo que ve el resto de la Directiva/Administración: datos de la convocatoria, productos, estado, número de participantes. **No** ve nombres ni cantidades por persona; tampoco totales por producto mientras haya menos de 3 participantes con cantidad en ese producto (umbral provisional de F07, `PROVISIONAL_THRESHOLD = 3`), para que un total no revele la cantidad de una persona. El responsable ve todo. | Regla 5 y F07. |
| E2-D8 | Participación: una por (convocatoria, Member). Un agricultor cuenta **una vez** aunque pida varios productos. Líneas por producto de la convocatoria con `quantityBase` entero > 0 en la unidad base del producto (`ML`/`G`). Sin líneas = retiro. | Regla 4. |
| E2-D9 | Consentimiento versionado `CONV-1`, texto exacto: «El responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas para coordinar la compra y la entrega. Esta confirmación no genera una deuda.» Se guarda versión y fecha de aceptación (del teléfono) y fecha de recepción (servidor). Sin consentimiento vigente → 409 `CONSENT_REQUIRED`. | Regla 5. |
| E2-D10 | Operaciones del agricultor idempotentes y ordenadas: cada envío lleva `operation_id` (UUID v4) y `sequence` (entero creciente por convocatoria en ese teléfono). Mismo `operation_id` → la misma respuesta (sin efectos nuevos). `sequence` menor o igual a la última aceptada → 409 `STALE_SEQUENCE` con el estado vigente (una solicitud atrasada nunca restaura cantidades anteriores). | Regla 6. |
| E2-D11 | El servidor decide el plazo: una operación recibida con `now >= deadlineAt` o con la convocatoria no `OPEN` → 409 `CALL_NOT_OPEN` (con `reason`: `DEADLINE_PASSED`, `CLOSED`, `CANCELLED`, `DRAFT`). El teléfono lo muestra como «Fuera de plazo» o «Convocatoria cerrada/cancelada»; su participación local no se da por aceptada. | Regla 6/7. |
| E2-D12 | Cierre atómico e idempotente en una transacción con `SELECT … FOR UPDATE` sobre la fila de la convocatoria; toda operación de participación toma la misma fila con `FOR UPDATE` antes de escribir. Corte = `min(hora de cierre, deadlineAt)`. Cierre manual (responsable o Directiva) antes del plazo o cierre automático por una tarea (`JOINT_PURCHASE_CLOSE_INTERVAL_MS`) después: la tarea **nunca** amplía el plazo, porque las operaciones posteriores al plazo ya fueron rechazadas. Cerrar dos veces devuelve el mismo consolidado. | Regla 7. |
| E2-D13 | «Consolidado al cierre»: instantánea inmutable (`JointPurchaseCallClosing` + líneas por producto + participaciones congeladas con sus líneas). Total por producto y unidad, número de participantes por producto y total de participantes (personas). Nunca se modifica después; un envío tardío no lo toca. Se llama «cantidades solicitadas», nunca «compradas» ni «entregadas». | Regla 7. |
| E2-D14 | Necesidades colectivas y participaciones separadas: abrir una convocatoria no consulta ni revela contribuciones de Sync v1; la referencia de un borrador es la cifra **ya divulgada** de su línea (o nada si estaba suprimida). Nunca se suman necesidad y participación. Confirmar participación no toca la necesidad declarada, ni compras, pagos, deudas o inventario. | Reglas 3 y 4. |
| E2-D15 | Avisos dentro de la aplicación, sin push: el teléfono descubre convocatorias al actualizar/sincronizar (`GET`), guarda localmente «visto» al abrir la convocatoria; «Nueva convocatoria» se muestra mientras no se haya abierto. El servidor no registra lecturas ni las afirma. | Regla 8. |
| E2-D16 | Cambio de sesión o titular: las operaciones pendientes quedan atadas al `tenant` y `member` del titular que las preparó; si la sesión es de otra cuenta, no se envían (como E1). | Regla 6. |

## 3. Modelo de datos (migración aditiva)

```prisma
enum JointPurchaseCallStatus { DRAFT OPEN CLOSED CANCELLED }
enum JointPurchaseCallEventKind { CREATED UPDATED OPENED CLOSED CANCELLED RESPONSIBLE_ASSIGNED }
enum JointPurchaseParticipationStatus { ACTIVE WITHDRAWN }
enum JointPurchaseCallCloseMode { MANUAL AUTOMATIC }

model JointPurchaseCall {
  id                String  @id @default(uuid()) @db.Uuid
  tenantId          String
  campaignId        String
  name              String  @db.VarChar(120)
  status            JointPurchaseCallStatus @default(DRAFT)
  deadlineAt        DateTime
  responsibleUserId String
  sourceProposalId  String? @db.Uuid
  createdByUserId   String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  openedAt          DateTime?
  openedByUserId    String?
  closedAt          DateTime?
  cancelledAt       DateTime?
  cancelledByUserId String?
  cancelReason      String? @db.VarChar(280)
  // relaciones: tenant, campaign, responsible, createdBy, openedBy?, cancelledBy?, sourceProposal?, products[], participations[], events[], access[], closing?
  @@index([tenantId, campaignId, status])
}

model JointPurchaseCallProduct {
  callId           String  @db.Uuid
  position         Int
  tenantId         String
  productId        String
  baseUnit         SyncV1BaseUnit
  openCampaignId   String?          // = campaignId mientras la convocatoria está OPEN
  sourceProposalId String? @db.Uuid // línea de origen (proposalId, position), sólo referencia
  sourcePosition   Int?
  @@id([callId, position])
  @@unique([callId, productId])
  // + índice único parcial (tenantId, openCampaignId, productId) WHERE openCampaignId IS NOT NULL (SQL a mano)
}

model JointPurchaseCallAccess {        // permiso específico E2-D6
  callId    String @db.Uuid
  userId    String
  grant     String @db.VarChar(16)    // 'PARTICIPANTS'
  grantedAt DateTime @default(now())
  @@id([callId, userId, grant])
}

model JointPurchaseParticipation {
  id                 String  @id @default(uuid()) @db.Uuid
  callId             String  @db.Uuid
  tenantId           String
  memberId           String
  status             JointPurchaseParticipationStatus
  consentVersion     String  @db.VarChar(16)
  consentAcceptedAt  DateTime            // fecha declarada por el teléfono
  consentReceivedAt  DateTime            // hora del servidor
  lastSequence       Int
  lastOperationId    String  @db.Uuid
  acceptedAt         DateTime            // hora del servidor de la última operación aceptada
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@unique([callId, memberId])
}

model JointPurchaseParticipationLine {
  participationId String @db.Uuid
  productId       String
  baseUnit        SyncV1BaseUnit
  quantityBase    BigInt
  @@id([participationId, productId])
}

model JointPurchaseParticipationOperation {   // idempotencia y orden (E2-D10)
  callId        String  @db.Uuid
  memberId      String
  operationId   String  @db.Uuid
  sequence      Int
  kind          String  @db.VarChar(16)        // 'CONFIRM' | 'WITHDRAW'
  outcome       String  @db.VarChar(24)        // 'ACCEPTED' | 'STALE_SEQUENCE' | 'CALL_NOT_OPEN' | ...
  fingerprint   String  @db.Char(64)            // SHA-256 del cuerpo normalizado: mismo id con otro contenido → 409 OPERATION_ID_REUSED
  receivedAt    DateTime @default(now())
  @@id([callId, memberId, operationId])
}

model JointPurchaseCallEvent {          // historial; sin nombres ni cantidades de agricultores
  id          String @id @default(uuid()) @db.Uuid
  callId      String @db.Uuid
  at          DateTime @default(now())
  kind        JointPurchaseCallEventKind
  actorUserId String?
  detail      String? @db.VarChar(280)
}

model JointPurchaseCallClosing {
  callId            String  @id @db.Uuid
  mode              JointPurchaseCallCloseMode
  cutoffAt          DateTime
  closedAt          DateTime
  closedByUserId    String?
  participantCount  Int
}
model JointPurchaseCallClosingLine {
  callId           String @db.Uuid
  productId        String
  baseUnit         SyncV1BaseUnit
  totalQuantityBase BigInt
  participantCount Int
  @@id([callId, productId])
}
model JointPurchaseCallClosingParticipant {
  callId          String @db.Uuid
  participationId String @db.Uuid
  memberId        String
  acceptedAt      DateTime
  @@id([callId, participationId])
}
model JointPurchaseCallClosingParticipantLine {
  callId          String @db.Uuid
  participationId String @db.Uuid
  productId       String
  quantityBase    BigInt
  @@id([callId, participationId, productId])
}
```

SQL a mano: CHECK de estados coherentes (`OPEN` ⇒ `openedAt` no nulo; `CANCELLED` ⇔ `cancelledAt`; `quantityBase > 0`), índice único parcial de E2-D3, triggers que impiden `UPDATE`/`DELETE` en eventos y en las cuatro tablas del cierre.

## 4. API

Respuestas con `Cache-Control: no-store` y errores `{ "errorCode" }` (sin eco del cuerpo).

### 4.1 Institucional (JWT, `@Roles(DIRECTIVA, ADMINISTRADOR)`, siempre dentro del tenant; otro tenant → 404)

| Método y ruta | Uso |
|---|---|
| `GET /joint-purchase-calls?campaignId=&status=` | Lista (sin identidades). |
| `POST /joint-purchase-calls` | Crear borrador: `{ campaign_id, name, deadline_at, responsible_user_id, products: [{ product_ref } ...] , source_proposal_id? }` o con `source_proposal_id` y `products` tomados de sus líneas (el cliente elige cuáles). |
| `GET /joint-purchase-calls/{id}` | Detalle: productos (con referencia del borrador si existe: cifra divulgada y su estado, o «sin cifra»), estado, fechas, responsable (nombre), número de participantes, totales por producto según E2-D7, historial. Incluye `can_view_participants` del usuario que consulta. |
| `PATCH /joint-purchase-calls/{id}` | Sólo `DRAFT`: nombre, fecha límite, responsable, productos. |
| `POST /joint-purchase-calls/{id}/open` | `{ confirmed: true }`. Valida productos (activos, canónicos, `L`/`KG`), fecha límite futura, responsable vigente, unicidad E2-D3. Crea el permiso del responsable. |
| `POST /joint-purchase-calls/{id}/cancel` | `{ reason, confirmed: true }` desde `DRAFT` u `OPEN`. Libera los productos. Las participaciones quedan conservadas, sin consolidado. |
| `POST /joint-purchase-calls/{id}/close` | `{ confirmed: true }` desde `OPEN` (responsable o Directiva/Administración). Idempotente desde `CLOSED`. |
| `GET /joint-purchase-calls/{id}/participants` | Sólo con permiso E2-D6: participantes vigentes (nombre del usuario, estado, líneas, `accepted_at`). Provisional mientras `OPEN`. |
| `GET /joint-purchase-calls/{id}/closing` | `CLOSED`: consolidado al cierre. Totales y número de participantes para todos (con E2-D7); detalle por participante sólo con permiso. |
| `GET /joint-purchase-calls/eligible-responsibles` | Usuarios institucionales activos del tenant (id, nombre, rol). |

### 4.2 Agricultor (`@Public()` + `SyncV1AuthGuard`)

| Método y ruta | Uso |
|---|---|
| `GET /me/joint-purchase-calls` | Convocatorias `OPEN` del tenant y las `CLOSED`/`CANCELLED` en las que participó (últimos 180 días). Cada una: id, nombre, campaña (ref y nombre), estado, `opened_at`, `deadline_at`, `server_time`, responsable (nombre), productos (`product_ref`, nombre, unidad, `base_unit`), y la **participación propia** (estado, líneas, `last_sequence`, `accepted_at`) si existe; en `CLOSED`, la propia participación tal como entró al consolidado (o «no incluida»). Nunca datos de otros agricultores. |
| `PUT /me/joint-purchase-calls/{id}/participation` | `{ operation_id, sequence, consent: { version: "CONV-1", accepted_at }, lines: [{ product_ref, quantity_base }] }` (`quantity_base` string decimal entero > 0, como Sync v1). Respuesta: `{ outcome: "ACCEPTED", participation }`. |
| `POST /me/joint-purchase-calls/{id}/participation/withdraw` | `{ operation_id, sequence }`. Idempotente. |

Errores del agricultor: 404 `CALL_NOT_FOUND` (inexistente u otro tenant), 409 `CALL_NOT_OPEN` (`reason`), 409 `STALE_SEQUENCE` (con `participation` vigente), 409 `OPERATION_ID_REUSED`, 409 `CONSENT_REQUIRED`, 422 `PRODUCT_NOT_IN_CALL`, 422 `QUANTITY_INVALID`, 400 `PAYLOAD_INVALID`.

## 5. Mobile

**Esquema v16** (aditivo, helper idempotente):

```sql
CREATE TABLE joint_purchase_calls (           -- copia local de lo que el servidor sirvió
  call_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  name TEXT NOT NULL, campaign_ref TEXT, campaign_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  opened_at TEXT, deadline_at TEXT NOT NULL, responsible_name TEXT,
  products_json TEXT NOT NULL,               -- lista cerrada validada al recibir
  server_participation_json TEXT,            -- última participación aceptada por el servidor
  fetched_at TEXT NOT NULL, server_time_at_fetch TEXT NOT NULL,
  seen_at TEXT                               -- aviso «Nueva convocatoria» hasta abrirla
);
CREATE TABLE joint_purchase_participation_ops (  -- cola propia, NO sync_outbox
  operation_id TEXT PRIMARY KEY, call_id TEXT NOT NULL, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  sequence INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('CONFIRM','WITHDRAW')),
  lines_json TEXT, consent_version TEXT, consent_accepted_at TEXT,
  send_status TEXT NOT NULL CHECK (send_status IN ('PENDING_SEND','RECEIVED','REJECTED','OUT_OF_TIME','SUPERSEDED','AUTH_PAUSED')),
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (call_id, member_id, sequence)
);
```

Comportamiento:
1. «Compras conjuntas» se añade dentro de **Operaciones › Más** (sin rediseñar la navegación) y como aviso en Inicio cuando hay convocatorias abiertas no vistas. Se descubre al actualizar en esa pantalla y tras un ciclo del `SyncWorker` (sin push).
2. Detalle: nombre, campaña, fecha límite (hora del servidor, mostrada en local con «según el sindicato»), responsable, productos con unidad; como **referencia** la necesidad que el agricultor declaró para esa campaña y producto (local, sólo lectura: «Su necesidad declarada: X»), sin sumarla.
3. «Participar»: formulario de cantidades por producto (reutiliza los campos de cantidad existentes), y antes de confirmar el diálogo con el texto `CONV-1` y casilla obligatoria. Confirmar crea la operación `PENDING_SEND` (sin conexión también). Modificar o retirar crea otra operación con `sequence` mayor; la anterior pendiente queda `SUPERSEDED` (no se envía).
4. Estados visibles: «Pendiente de envío», «Participación recibida» (servidor `ACCEPTED`), «Rechazada: …», «Fuera de plazo» (`CALL_NOT_OPEN` con `DEADLINE_PASSED`), «Convocatoria cerrada»/«cancelada». Nunca «recibida» sólo por existir en el teléfono. Con un cambio local pendiente, se muestra junto a lo último aceptado: «El sindicato tiene: … · Pendiente de envío: …».
5. `STALE_SEQUENCE`: se adopta la participación que devuelve el servidor y la operación local queda `SUPERSEDED`.
6. Ningún efecto en compras, aplicaciones, inventario, cuentas, necesidad declarada ni `sync_outbox`.

## 6. Web

Sección «Compras conjuntas» en el menú colectivo (ruta `/colectivo/compras-conjuntas`), con el kit `components/ui` y presentación mínima (el diseño visual llegará desde Claude Design):
- Lista por campaña y estado.
- Crear borrador (desde productos del catálogo o desde un borrador de propuesta, eligiendo líneas; la referencia se muestra como «cifra divulgada en el borrador», nunca como cantidad comprometida).
- Detalle: abrir (confirmación), cancelar (motivo), cerrar (confirmación), historial.
- Participantes: sólo si `can_view_participants`; texto «Lista provisional: puede cambiar hasta el cierre» mientras está abierta.
- Consolidado al cierre: totales por producto (cantidades **solicitadas**), número de participantes y, con permiso, detalle por participante.

## 7. Verificación prevista

| Prueba | Dónde |
|---|---|
| Transiciones permitidas y prohibidas; campos inmutables tras abrir | Back unit + PostgreSQL |
| Unicidad de producto abierto con aperturas concurrentes | Back PostgreSQL (dos transacciones en paralelo) |
| Autorización: roles, tenant ajeno 404, agricultor 403 en rutas institucionales, Directiva sin permiso 403 en participantes, Administrador sin permiso 403 | Back PostgreSQL |
| Consentimiento obligatorio y registrado | Back PostgreSQL, Mobile |
| Doble toque y reintento (mismo `operation_id`), contenido distinto con el mismo id, `sequence` atrasada | Back PostgreSQL, Mobile |
| Plazo con hora controlada (reloj inyectable del servidor en pruebas), cierre concurrente con confirmación/retiro | Back PostgreSQL |
| Cancelación con participaciones | Back PostgreSQL |
| Ausencia de efectos en `Purchase`, `PayableAccount`, `StockMovement`, `SyncV1Contribution` | Back PostgreSQL (recuentos antes/después) |
| Persistencia local, sin conexión, cambio de titular, ausencia de efectos locales | Mobile (sqflite ffi + `MockClient`) |
| Recorrido real: borrador → abrir → agricultor confirma en el emulador → responsable ve → cierre → consolidado | API aislada ET1 + Web + emulador |

Fecha límite controlada en el recorrido: la convocatoria de prueba se crea con un plazo de pocos minutos (hora real del servidor); no se cambia el reloj del sistema ni del emulador.

## 8. Decisiones que estaban abiertas

- **E2-P1** Umbral para mostrar totales por producto a quien no es responsable (hoy 3, el provisional de F07). Aplicado con privacidad primero (final del §9); el valor 3 sigue revisable.
- **E2-P2** Plazo de visibilidad en el teléfono de convocatorias cerradas o canceladas. **Resuelta (§10.1):** 180 días es sólo un filtro de presentación; las anteriores siguen en «Historial».
- **E2-P3** Más personas con permiso de ver participantes. **Resuelta (§10.2):** colaboradores por convocatoria con dos permisos distintos y consentimiento `CONV-2`.

## 9. Resoluciones de la implementación (Back, 2026-11-11)

Ambigüedades del contrato resueltas al implementar el Backend (`Back/src/modules/joint-purchase-calls/`, migración `20261111201928_e2_joint_purchase_calls`). Pendientes de la aceptación de Roderich junto con el resto del contrato.

| ID | Tema | Resolución |
|---|---|---|
| E2-R1 | Respuesta guardada de una operación | Columna adicional `JointPurchaseParticipationOperation.response` (JSON: estado HTTP y cuerpo). Toda operación decidida con la convocatoria bloqueada se registra en el diario: `ACCEPTED` y los rechazos `CALL_NOT_OPEN`, `STALE_SEQUENCE`, `CONSENT_REQUIRED`, `PRODUCT_NOT_IN_CALL`, `QUANTITY_INVALID`. Reintento con el mismo `operation_id` y la misma huella → la misma respuesta, aunque la convocatoria ya esté cerrada; excepción: un `STALE_SEQUENCE` repetido devuelve la participación vigente en ese momento. Los errores de formato (400) y `OPERATION_ID_REUSED` no se registran. |
| E2-R2 | Huella | SHA-256 de `["E2-OP-1", kind, operation_id, sequence, [consent.version, accepted_at ISO] \| null, [[product_ref, quantity_base] …] ordenadas por producto]`. El orden de claves, de líneas o la escritura de la fecha no cambian la huella. |
| E2-R3 | Orden (`sequence`) | La última aceptada es el máximo `sequence` de las operaciones `ACCEPTED` del diario para (convocatoria, Member), no sólo de la participación: un retiro sin participación previa también ordena. `sequence` entero 1…2147483647. |
| E2-R4 | Retiro | `POST …/withdraw` y `PUT` con `lines: []` son retiro: participación `WITHDRAWN`, sin líneas, consentimiento conservado. Sin participación previa: `200 { outcome: "ACCEPTED", participation: null }` y no se crea fila. |
| E2-R5 | Consentimiento | Obligatorio en cada `PUT` con líneas (versión exacta `CONV-1`); ausente, `null` u otra versión → 409 `CONSENT_REQUIRED`. `accepted_at` con formato inválido → 400. `consentReceivedAt` = hora del servidor de cada confirmación. |
| E2-R6 | Cantidades | `quantity_base` no string → 400; string fuera de `^(0\|[1-9][0-9]*)$`, `"0"` o > int64 → 422 `QUANTITY_INVALID`. Además 422 `QUANTITY_INVALID` si el total de la convocatoria para ese producto superaría int64 (así el consolidado siempre se puede guardar). Producto repetido en `lines` → 400. Máximo 50 líneas y 50 productos. |
| E2-R7 | Orden de comprobaciones del agricultor | 404 `CALL_NOT_FOUND` → diario (`OPERATION_ID_REUSED` o respuesta guardada) → `CALL_NOT_OPEN` (`reason`) → `STALE_SEQUENCE` → `CONSENT_REQUIRED` → `PRODUCT_NOT_IN_CALL` → `QUANTITY_INVALID` (total) → aceptación. |
| E2-R8 | Códigos institucionales añadidos | 404 `CAMPAIGN_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `PROPOSAL_NOT_FOUND`; 422 `CAMPAIGN_NOT_ELIGIBLE` (campaña no `PLANIFICADA`/`ABIERTA`, regla añadida), `PRODUCT_INACTIVE`, `PRODUCT_UNIT_UNSUPPORTED`, `PRODUCT_NOT_CANONICAL`, `PRODUCT_DUPLICATED`, `PROPOSAL_CAMPAIGN_MISMATCH`, `RESPONSIBLE_NOT_ELIGIBLE` (agricultor, otro tenant, inactivo o inexistente, sin distinguir), `DEADLINE_IN_PAST` (también al crear y editar), `CONFIRMATION_REQUIRED`, `REASON_REQUIRED` (1–280); 409 `INVALID_TRANSITION` y `CALL_NOT_EDITABLE` (con `status` vigente), `CALL_NOT_CLOSED` (con `status`) en `/closing`; 403 `AUTH_CONTEXT_FORBIDDEN` por rol. |
| E2-R9 | Idempotencia institucional | `close` idempotente desde `CLOSED` (mismo consolidado, sin evento nuevo); `cancel` idempotente desde `CANCELLED`; `open` desde `OPEN` → 409 `INVALID_TRANSITION`. `close` responde con el consolidado (forma de `GET …/closing`); `open`, `cancel`, `PATCH` y `POST` con el detalle. |
| E2-R10 | Referencia del borrador de propuesta | Al crear o editar con `source_proposal_id` (mismo tenant y campaña), cada producto con línea en ese borrador guarda (propuesta, posición). En el detalle: `DISCLOSED` con `quantity_base`, `contributors`, `released_at` sólo si la línea era `DISCLOSED`, su divulgación no está retirada **y** el modo de divulgación vigente es `provisional-synthetic`; si no, `NO_FIGURE` («Sin cifra»). El teléfono nunca recibe la referencia. |
| E2-R11 | Visibilidad (E2-D7) | El permiso `JointPurchaseCallAccess` decide todo: `can_view_participants`, totales siempre visibles y detalle por persona. Sin permiso: `participant_count` total y por producto siempre; `total_quantity_base` por producto sólo con ≥ 3 personas en ese producto (`visibility: "UNDER_THRESHOLD"` y `null` debajo). En `OPEN`/`CANCELLED` los totales son en vivo (`totals_source: "LIVE"`), en `CLOSED` del consolidado (`"CLOSING"`), en `DRAFT` `"NONE"`. |
| E2-R12 | Participantes | `GET …/participants` lista sólo participaciones `ACTIVE` (minimización: quien se retiró no aparece), con nombre del usuario, `accepted_at` y líneas con nombre de producto; disponible en cualquier estado si existe el permiso (`provisional: true` sólo en `OPEN`). |
| E2-R13 | Consolidado | Una línea por producto de la convocatoria, también con total 0 y 0 personas. Participa quien está `ACTIVE` con líneas y `acceptedAt ≤ corte`. Corte = min(hora de cierre, `deadlineAt`); cierre automático con `mode: AUTOMATIC`, `closed_by: null`. |
| E2-R14 | Lista del agricultor | `OPEN` del tenant (incluidas las vencidas aún no cerradas, con `accepts_operations: false`) y `CLOSED`/`CANCELLED` donde tiene fila de participación (aunque esté retirada) cerradas o canceladas en los últimos 180 días. `closing` sólo en `CLOSED`: `{ cutoff_at, closed_at, included, lines }`. Incluye `consent: { version, text }` en la raíz. |
| E2-R15 | Reloj y tarea | Proveedor `JOINT_PURCHASE_CLOCK` (`now()`); `JOINT_PURCHASE_CLOSE_INTERVAL_MS` vacío = 60000, `0`/`disabled` = apagada, si no 100–3600000. La tarea cierra hasta 100 convocatorias vencidas por pasada, cada una en su transacción. |
| E2-R16 | Base de datos | Además de lo previsto en §3: trigger que impide transiciones no permitidas y cambios de nombre, fecha, responsable, campaña u origen después de abrir; trigger que impide insertar, borrar o cambiar productos fuera de `DRAFT` (salvo `openCampaignId`); CHECK `deadlineAt > openedAt`; FK compuesta de la referencia a `JointPurchaseProposalLine (proposalId, position)`; índice `(status, deadlineAt)` para la tarea. |
| E2-R17 | Bitácora | `AuditLog` (`action: OTRO`, `entityName: JointPurchaseCall`, `ownerUserId: null`) al crear, editar, abrir, cancelar y cerrar (cierre automático con `actorUserId: null`); sin nombres ni cantidades de agricultores. Las operaciones del agricultor no escriben eventos ni bitácora. |

**E2-P1 aplicado (2026-11-11, privacidad primero):** mientras la convocatoria está abierta, quien no tiene el permiso del responsable **no ve totales por producto** (`visibility: "RESPONSIBLE_ONLY"`, `total_quantity_base: null`), porque comparar lecturas sucesivas (3 → 4 personas) revelaría la cantidad de una persona. Ve el número de participantes. En el consolidado al cierre, inmutable, rige el umbral de 3. Pruebas: `call-domain.spec.ts` y el caso de autorización de la suite PostgreSQL. El valor del umbral sigue siendo revisable por Roderich.

## 10. Decisiones del autor aplicadas (2026-11-11, segunda sesión)

Ramas: Back/Web `feat/etapa3-estimacion-borrador` (desde `feat/etapa2-convocatorias` `01bcdeb`) y Mobile `feat/etapa2-historial-colaboradores` (desde `feat/etapa2-convocatorias` `6bac5a3`). Migración aditiva `e2_historial_colaboradores`.

### 10.1 E2-P2: historial y visibilidad

Tres cosas distintas que antes estaban mezcladas en «180 días»:

| Concepto | Regla |
|---|---|
| **a) Filtro de presentación** | La vista por defecto muestra las convocatorias abiertas y las **recientes**: cerradas o canceladas en los últimos 180 días (`RECENT_FINISHED_DAYS`) en las que el agricultor tiene participación. Las **anteriores** se muestran en «Historial», dentro de la misma pantalla de «Compras conjuntas» (sin pantalla nueva). |
| **b) Copia local del teléfono** | El teléfono conserva las convocatorias que ya tiene. Al actualizar la vista por defecto sólo descarta las que el servidor ya no sirve **y** que no tienen participación propia guardada **y** no tienen operaciones locales (por ejemplo, una abierta que se canceló sin que el agricultor participara). Nunca descarta una convocatoria terminada con participación propia por salir de la ventana de 180 días, ni una con operaciones pendientes, rechazadas o fuera de plazo (`joint_purchase_participation_ops`). Lo que llega por «Historial» se guarda igual, sin borrar nada. |
| **c) Retención en el servidor** | Ninguna regla de limpieza borra convocatorias, participaciones, operaciones, cierres ni eventos. La retención institucional definitiva sigue pendiente de GOV-02 (#185), como en F12 §6.5. |

API del agricultor (mismo `SyncV1AuthGuard` y mismas restricciones: sólo convocatorias del tenant en las que el Member tiene fila de participación, y sólo su propia participación):

- `GET /me/joint-purchase-calls` (vista por defecto, misma forma) añade `history: { older_count }`: cuántas convocatorias terminadas **anteriores** a la ventana tiene el agricultor (un recuento de datos propios).
- `GET /me/joint-purchase-calls/history?before=<cursor>&limit=<1..50, 20 por defecto>`: convocatorias `CLOSED`/`CANCELLED` con participación propia terminadas (`closedAt` o `cancelledAt`) antes de `now − 180 días`, de la más reciente a la más antigua (fecha de término, luego `id`), con la misma forma de cada convocatoria que la vista por defecto. `next_cursor` opaco; un cursor que no emitió el servidor → 400 `PAYLOAD_INVALID`. Nunca incluye convocatorias abiertas.

Teléfono:
- «Historial» lista primero las anteriores guardadas en el teléfono y ofrece «Consultar historial» con conexión. Sin conexión: «Sin conexión: las convocatorias anteriores que no están en este teléfono se pueden consultar al conectarse.» Si `older_count` de la última actualización supera las anteriores guardadas, lo dice («Hay N convocatorias anteriores que no están en este teléfono»).
- Las operaciones pendientes, los rechazos y los «Fuera de plazo» siguen visibles con su convocatoria, sea reciente o anterior.

### 10.2 E2-P3: colaboradores autorizados

**Permisos por convocatoria** (`JointPurchaseCallAccess.grant`), siempre de un usuario y una convocatoria del mismo tenant:

| Permiso | Qué permite |
|---|---|
| `PARTICIPANTS` («Consultar participantes y cantidades») | Nombres y cantidades por persona (`/participants`, detalle del consolidado) y totales según §10.3 |
| `MANAGE` («Administrar la convocatoria») | Editar el borrador, abrir, cancelar y cerrar a mano |

- **La persona responsable** tiene los dos: `MANAGE` por ser la responsable y `PARTICIPANTS` con la fila que el sistema crea al abrir (E2-D6).
- **Ningún rol concede permisos por sí solo**, tampoco `ADMINISTRADOR`: un administrador técnico no recibe ninguno de los dos automáticamente.
- **Quién asigna y revoca:** sólo la persona responsable de esa convocatoria. Quien tiene `MANAGE` no puede conceder permisos (sin cadenas). Un colaborador puede renunciar a su propio permiso.
- **Nadie se concede permisos a sí mismo:** el destinatario es otro usuario `DIRECTIVA` o `ADMINISTRADOR` activo del tenant, distinto del responsable y de quien concede; cualquier otro → 422 `COLLABORATOR_NOT_ELIGIBLE` (sin distinguir inexistente, otro tenant, inactivo o agricultor). Quien no es responsable → 403 `COLLABORATORS_FORBIDDEN`.
- **Cuándo:** conceder en `DRAFT`, `OPEN` o `CLOSED`; revocar en cualquier estado. Conceder lo ya concedido o revocar lo inexistente responde 200 sin evento nuevo.
- **Administración restringida:** editar, abrir, cancelar y cerrar a mano exigen ser responsable o tener `MANAGE` (403 `MANAGE_FORBIDDEN`). Si el responsable dejó de ser elegible (cuenta, Member o rol inactivo), cualquier `DIRECTIVA`/`ADMINISTRADOR` del tenant puede **cancelar o cerrar**, para no dejar la convocatoria sin salida, pero nunca ver participantes. Crear borradores sigue abierto a `DIRECTIVA`/`ADMINISTRADOR`. El cierre automático por plazo no cambia.
- **Registro:** cada concesión y revocación es una fila de `JointPurchaseCallAccessEvent` (sólo inserción: usuario, permiso, `GRANTED`/`REVOKED`, actor, hora del servidor), un evento del historial (`ACCESS_GRANTED`/`ACCESS_REVOKED`, con el nombre institucional del colaborador y el permiso, nunca datos de agricultores) y una entrada de `AuditLog`. `JointPurchaseCallAccess` guarda `grantedByUserId` (nulo en la fila que crea el sistema al abrir).
- **Comprobación en cada operación:** el servidor lee el permiso en cada petición; una revocación rige desde la petición siguiente.
- **Revocación en el cliente:** la Web vuelve a comprobar el permiso al recuperar el foco y cada 60 s mientras muestra participantes. Ante 403 `PARTICIPANTS_FORBIDDEN` o `can_view_participants: false` borra de la memoria de la página los nombres y cantidades y dice: «Ya no tiene permiso para ver a los participantes de esta convocatoria. Lo que se haya copiado, impreso o capturado antes no se puede retirar desde aquí.» La Web no guarda participantes en el navegador (ni `localStorage` ni IndexedDB).

Rutas institucionales nuevas:
- `GET /joint-purchase-calls/{id}/collaborators`: colaboradores vigentes (`user_ref`, nombre, rol, permisos, quién y cuándo) e historial de concesiones y revocaciones. Lo ve cualquier `DIRECTIVA`/`ADMINISTRADOR` del tenant (no contiene datos de agricultores).
- `POST /joint-purchase-calls/{id}/collaborators` `{ user_ref, grant, confirmed: true }`.
- `POST /joint-purchase-calls/{id}/collaborators/revoke` `{ user_ref, grant }`.
- `GET /joint-purchase-calls/{id}` añade `can_manage`, `my_grants` y `collaborator_count`.

**Consentimiento `CONV-2`.** `CONV-1` dice «El responsable de esta compra conjunta podrá ver…»: no cubre a colaboradores. Texto nuevo, versión `CONV-2`:

> «La persona responsable de esta compra conjunta y quienes ella autorice para coordinarla podrán ver tu nombre y las cantidades que solicitas, para coordinar la compra y la entrega. Esta confirmación no genera una deuda.»

- El servidor publica `CONV-2` como vigente y sigue aceptando `CONV-1` de teléfonos sin actualizar. `JointPurchaseParticipation.consentVersion` es la del último `CONFIRM` aceptado.
- **Compatibilidad del teléfono:** la versión E2 de la app valida de forma estricta la lista (claves conocidas y consentimiento exactamente `CONV-1`). Con `CONV-2` publicado, esa versión deja de aceptar la lista. **Corrección (comprobado en el emulador el 2026-11-12):** no pide actualizarse; muestra «No se pudo leer la lista del sindicato. Lo guardado en el teléfono se conserva; inténtelo más tarde.» y no puede participar en convocatorias nuevas hasta actualizar. Esa versión ya no se puede cambiar; sus operaciones ya preparadas con `CONV-1` se siguen enviando y aceptando, y quedan visibles sólo para la persona responsable. La versión nueva acepta `CONV-2` y `history`.
- **Verificado el 2026-11-12 (no es sólo texto):** cada `CONFIRM` aceptado guarda su versión (`consentVersion`) y su fecha; conceder un permiso no cambia lo aceptado; una participación `CONV-1` sigue oculta a los colaboradores hasta que el agricultor la modifica con `CONV-2`, y si un teléfono sin actualizar vuelve a enviar `CONV-1`, queda oculta otra vez (rige el último consentimiento aceptado); lo decide el servidor en cada consulta; revocar impide la consulta siguiente (403). Pruebas: `joint-purchase-calls.postgres.spec.ts` («CONV-1 only for the responsible…», «CONV-1 stays hidden… until the farmer accepts CONV-2», `a7e3983`).
- **El agricultor sabe quién ve sus datos, por función** (Mobile `01b2576`): antes de aceptar, el texto `CONV-2`; después, el detalle de la convocatoria lo dice según la versión aceptada: con `CONV-1`, «sólo la persona responsable (nombre)» y que al modificar se le pedirá el consentimiento vigente; con `CONV-2`, «la persona responsable (nombre) y las personas de la Directiva o la Administración que ella autorice para esta convocatoria».
- **No se extiende retroactivamente:** una participación con `CONV-1` sólo la ve la persona responsable. Un colaborador con `PARTICIPANTS` ve sólo las participaciones con `CONV-2`, más el número de las demás («N participaciones aceptadas con un consentimiento anterior: sólo las ve la persona responsable»).

### 10.3 Quién ve qué, también después del cierre

Cerrar una convocatoria **no** vuelve anónimos sus datos: el consolidado conserva las participaciones identificadas y el mismo control de acceso.

| Quién | Participantes identificados | Totales por producto con la convocatoria abierta | Consolidado al cierre |
|---|---|---|---|
| Persona responsable | Todos | Todos (en vivo) | Totales y detalle por persona |
| Colaborador con `PARTICIPANTS` | Sólo los de `CONV-2` (más el número de los demás) | En vivo sólo en productos sin participaciones ocultas para él; si hay alguna, `RESPONSIBLE_ONLY` | Detalle por persona de `CONV-2`; total de un producto sólo si no tiene participaciones ocultas para él, si no `RESPONSIBLE_ONLY` (restando las visibles se revelaría la oculta) |
| Colaborador sólo con `MANAGE`, resto de la Directiva o Administración | No | No (`RESPONSIBLE_ONLY`, E2-P1) | Totales con al menos 3 personas en el producto (`UNDER_THRESHOLD` debajo); número de personas siempre |
| Agricultor | Sólo su propia participación | No | Su propia participación tal como entró al consolidado |

- **Después de una revocación:** quien tuvo `PARTICIPANTS` en esa convocatoria (según `JointPurchaseCallAccessEvent`) sigue sin recibir el total de los productos con participaciones que no podía ver, aunque ahora le corresponda la fila del umbral: restando lo que vio antes revelaría la participación oculta. Queda un límite que el sistema no controla: lo que dos personas distintas combinen fuera de él.
- La misma función decide en el detalle, en `/participants` y en `/closing`: no hay rutas alternativas ni versiones de la respuesta que eludan la regla. La lista (`GET /joint-purchase-calls`) no lleva totales ni nombres.
- Esta etapa **no añade exportaciones**. Cualquier difusión colectiva adicional (por ejemplo, publicar el consolidado) debe pasar por la política de divulgación vigente (F07-POL-01).

### 10.5 E3-P2: origen de la convocatoria (decisión del 2026-11-12)

Cada convocatoria conserva, **inmutable**, qué productos se seleccionaron al crearla y su procedencia (`JointPurchaseCallOrigin` + `JointPurchaseCallOriginProduct`, migración `20261112000000_e3p2_call_origin`, Back `c87c352`/`fa44b5f`, Web `91e9ef2`):
- `kind` `PROPOSAL` (borrador de origen, su huella `inputsFingerprint` al crear, la revisión de la selección guardada en ese momento y si los productos coincidían con ella) o `CATALOG` (sin referencias inventadas).
- Productos con su unidad y, si venían del borrador, la posición de su línea (el borrador es inmutable: borrador + posición reconstruyen la selección sin copiarlo). Nada de cantidades, cifras, aportantes, identidades ni estimaciones.
- La base rechaza `UPDATE`/`DELETE` y productos añadidos en otra transacción; exige mismo sindicato, convocatoria en `DRAFT` al registrarlo, el borrador de la convocatoria, su huella y la línea del mismo producto y unidad.
- Editar los productos en `DRAFT` o cambiar después la selección o el borrador **no** altera el origen; el detalle dice si los productos actuales difieren (`origin_differs_from_current`). Las reglas de edición en Borrador y las restricciones tras abrir no cambian. Convocatorias anteriores: `origin: null` («Origen no registrado»), sin reconstruir nada.
- La huella se muestra sólo si la divulgación lo autoriza y no se retiró ninguna cifra del borrador (misma regla que la referencia del borrador).

### 10.4 Resoluciones de la implementación (2026-11-11)

Back `0db2d0f` (migración `20261111230000_e2_historial_colaboradores`; `application/call-access.ts`, `domain/visibility.ts` → `CallVisibility`), Web `5d760b6` y `b77965e`, Mobile `16c002c` y `fa0fdc4` (esquema SQLite v17).

| ID | Tema | Resolución |
|---|---|---|
| E2-R18 | Revocar | Revocar borra la fila de `JointPurchaseCallAccess` (la E2 no tenía disparador). Un disparador nuevo impide modificar filas, borrar la del responsable y crear filas que no conceda el responsable a otro usuario del mismo tenant. |
| E2-R19 | Permiso del responsable | Su fila `PARTICIPANTS` al abrir no se registra en `JointPurchaseCallAccessEvent` (sólo permisos de colaboradores). Revocarla → 422 `COLLABORATOR_NOT_ELIGIBLE`. |
| E2-R20 | Conceder en una cancelada | 409 `INVALID_TRANSITION` con `status`. |
| E2-R21 | Campos añadidos | Detalle: `can_cancel_or_close` y `responsible.eligible`. `/participants` y `/closing`: `hidden_participant_count` y `hidden_notice`; `participant_count` cuenta también las ocultas (para el responsable no cambia). |
| E2-R22 | Cursor del historial | Opaco (base64url) pero no firmado, como el de F12: uno mal formado da 400; uno bien formado fabricado por el cliente se acepta, sin más datos que los propios. |
| E2-R23 | Teléfono | `history` obligatoria en la lista; `consent` opcional en la página de historial y, si viene, debe ser el vigente (`fa0fdc4`, hallazgo de la revisión cruzada). La copia local sólo descarta convocatorias ausentes que siguen `OPEN`, sin participación guardada y sin operaciones. Con CONV-1 ya no se prepara nada nuevo; confirmar las mismas cantidades con CONV-2 crea otra operación y la CONV-1 pendiente queda `SUPERSEDED`. |
| E2-R24 | Web | La lista de colaboradores no se vuelve a pedir en cada comprobación de foco (límite de peticiones), salvo cuando cambian los permisos propios o el número de colaboradores, o llega 403 `PARTICIPANTS_FORBIDDEN` (`b77965e`, hallazgo del recorrido: el panel seguía mostrando el permiso retirado). |
| E2-R25 | Límite conocido del teléfono | `call_id` es clave primaria global de la copia local: dos titulares del mismo tenant en el mismo teléfono comparten la fila de una convocatoria (sus operaciones sí se separan). Cambiarlo no es aditivo; queda anotado. |


## 11. Decisiones del autor del 2026-11-12 sobre las reglas añadidas (N1–N8, m1–m11, P-B, P-C)

Fuente: encargo del autor del 2026-11-12 («Apruebo las decisiones siguientes con el alcance indicado»). Esta sección **prevalece** sobre las anteriores donde difieran. Implementado en Back `1ff5ccf`, Mobile `9cb6d7b` y Web `7acf0a1`/`bcd8b62` (rama local, sin push).

### 11.1 §10.6 — Consentimiento separado de las cantidades (P-C)

- **Alcance** del consentimiento de cada participación: `RESPONSIBLE_ONLY` (sólo la persona responsable) o `COLLABORATORS` (también las personas de la Directiva o la Administración que ella autorice para esa convocatoria). Se guarda en la participación (`consentScope`, `consentScopeVersion`, `consentScopeDecidedAt`, `consentScopeReceivedAt`, `consentScopeSequence`) y cada decisión en el registro **sólo de inserción** `JointPurchaseConsentDecision` (`INITIAL`, `DECISION`, `MIGRATED`).
- **Primera confirmación:** exige el texto vigente (`CONV-3`, o `CONV-1`/`CONV-2` de teléfonos anteriores) y fija el alcance de ese texto: `CONV-1` y `CONV-3` → `RESPONSIBLE_ONLY`; `CONV-2` (su texto ya cubría a los colaboradores, aceptado de forma explícita) → `COLLABORATORS`. Orden 0.
- **Cambiar cantidades conserva el consentimiento:** después de crearse la participación, una confirmación, antigua o nueva, nunca amplía ni reduce el alcance; el consentimiento que traiga se ignora.
- **Decisión propia:** `POST /me/joint-purchase-calls/{id}/participation/consent` `{operation_id, sequence, scope, consent: {version, decided_at}}`.
  - Orden **propio** (distinto del de las cantidades): una decisión con `sequence` no mayor que la última aceptada → `409 STALE_SEQUENCE` con la participación vigente; un reintento con el mismo `operation_id` → la respuesta guardada; el mismo id con otro cuerpo → `409 OPERATION_ID_REUSED`. Un reintento o un resultado fuera de orden nunca revierte una decisión posterior.
  - **Ampliar** exige el texto vigente (`CONV-3`; otro → `409 CONSENT_REQUIRED`) y no se admite en una convocatoria cancelada (`409 WIDENING_NOT_ALLOWED`).
  - **Reducir** se respeta siempre, en cualquier estado y con cualquier texto conocido.
  - Sin participación → `409 PARTICIPATION_REQUIRED` (el teléfono la conserva pendiente y la reintenta).
  - No depende del plazo: decidir después del cierre cambia lo que ven los colaboradores también en el «Consolidado al cierre» (la visibilidad lee siempre el alcance vigente).
- **Migración** `20261112120000_e2_pc_consent_decisions`: aditiva; cada participación existente conserva exactamente su alcance (fila `MIGRATED`); no se reescribe ningún consentimiento aceptado (`consentVersion` y sus fechas no cambian).
- **Teléfono (esquema v18):** cola propia `joint_purchase_consent_ops`. «Autorizar también a la Directiva o la Administración» muestra el texto vigente con una casilla **sin marcar**; «Reducir a sólo la persona responsable» pide confirmación. Mientras la decisión está pendiente de envío, el detalle lo dice («Pendiente de envío… Hasta que el sindicato la reciba, rige lo anterior»; en una reducción: «la reducción no está aplicada») y el texto de quién ve los datos sigue diciendo lo **aplicado** en el sindicato. Una respuesta atrasada no pisa una decisión ni unas cantidades más nuevas (cada una por su propio orden).

### 11.2 N5 — Texto `CONV-3`

> «La persona responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas. Si tú lo autorizas, también podrán verlos las personas de la Directiva o la Administración que ella autorice para esta convocatoria. Los datos se usan para coordinar la compra y la entrega. Esta confirmación no genera una deuda.»

Versión nueva porque cambia el texto publicado; `CONV-1` y `CONV-2` conservan su alcance hasta una decisión explícita del agricultor.

### 11.3 N7 — Compatibilidad con la aplicación anterior

- El teléfono declara el contrato que lee con la cabecera `X-Joint-Purchase-Contract: 2`. Con ella, la respuesta es la de §11.1 (`contractVersion: 2`, `CONV-3`, `consent_scope`, `history`).
- **Sin la cabecera** (las versiones publicadas antes, que validan la respuesta de forma estricta): los mismos datos con la forma del contrato 1: `contractVersion: 1`, el texto `CONV-1` que esas versiones muestran, sin `history` ni `consent_scope` (también en las respuestas de confirmar y retirar, y en `STALE_SEQUENCE`). Sus operaciones con `CONV-1` se siguen aceptando con alcance `RESPONSIBLE_ONLY`. Ningún consentimiento nuevo se hace pasar por el antiguo y nadie gana acceso por compatibilidad.
- Límite conocido: esas versiones no conocen el historial (§10.1); las convocatorias terminadas hace más de 180 días no aparecen en su lista, como ya ocurría con ellas.
- **Versiones nuevas:** distinguen «Actualice la aplicación» (otra versión del contrato u otro texto de consentimiento), «Sin conexión» y «El sindicato no respondió correctamente». Nada guardado ni pendiente se descarta.

### 11.4 N1 — Campañas

Crear y editar borradores: campaña `PLANIFICADA` o `ABIERTA`. **Abrir:** sólo `ABIERTA` (otra → `422 CAMPAIGN_NOT_ELIGIBLE`). Cerrar y cancelar una convocatoria existente no dependen de la campaña; un cambio de estado de la campaña no cancela ni cierra nada por sí solo.

### 11.5 N2 rechazada y m6 — Responsable que deja de estar habilitada

- Se retira la excepción de §10.2: **ningún rol** obtiene cancelar o cerrar porque la responsable deje de estar habilitada (`can_cancel_or_close` = `can_manage`).
- **m6:** mientras la responsable no esté habilitada, los permisos que concedió (`MANAGE`, `PARTICIPANTS`) quedan **suspendidos**: siguen registrados, no se ejercen y el detalle lo indica (`delegations_suspended`). Quien los tenía cuenta como «tuvo el permiso» para la protección de §10.3. Si vuelve a estar habilitada, rigen otra vez.
- Se conserva el **cierre automático** al vencer el plazo.
- La salida para una convocatoria así es la sustitución explícita (P-A), **implementada el 2026-11-12** con las opciones A1 + B1 + C1 (§12).

### 11.6 N3 — Protección tras una revocación (matriz)

Alcance **por convocatoria** (el permiso y su historial son de esa convocatoria) **y por producto** (sólo pierde el total el producto que tiene una participación oculta para esa persona). No es una prohibición global ni permanente. Matriz para el total de un producto (k = 3 personas):

| Quién mira | ¿Tuvo «Consultar participantes» en esta convocatoria? | Totales | Alcances en el producto | Resultado |
|---|---|---|---|---|
| Responsable | — | en vivo o al cierre | cualquiera | cifra visible, también con 1–2 personas |
| Colaborador vigente | sí | en vivo o al cierre | todos `COLLABORATORS` | cifra visible |
| Colaborador vigente | sí | en vivo o al cierre | al menos uno `RESPONSIBLE_ONLY` | «sólo la persona responsable» |
| Sin permiso | no | en vivo (abierta o cancelada) | cualquiera | sin cifra |
| Sin permiso | no | al cierre | cualquiera | cifra si hay ≥ 3 personas; si no, «bajo el umbral» |
| Sin permiso | sí (revocado o suspendido) | en vivo | cualquiera | sin cifra |
| Sin permiso | sí (revocado o suspendido) | al cierre | todos `COLLABORATORS` | umbral, como cualquiera |
| Sin permiso | sí (revocado o suspendido) | al cierre | al menos uno `RESPONSIBLE_ONLY` | «sólo la persona responsable», aunque haya ≥ 3 |

Probado en `domain/visibility-matrix.spec.ts` (21 casos, incluidos «por producto» y «por convocatoria») y en la suite PostgreSQL E2.

### 11.7 N4 — Umbral de agregados

Aceptado **provisionalmente** k = 3 para agregados a quien no tiene permiso de consulta individual; mientras la convocatoria está abierta, sin totales para ellos. No se presenta como garantía de anonimato. Responsable y colaboradores sólo ven lo que el consentimiento aplicable autoriza: un permiso de colaborador no permite leer participaciones autorizadas sólo para la responsable.

### 11.8 N6 / P-B — Creador

Crear una convocatoria no da administración permanente. Al nombrar a otra persona responsable, la Web avisa antes de guardar qué permisos se pierden (editar, abrir, cancelar, cerrar; ver participantes) y que sólo la responsable puede conceder «Administrar»; exige confirmar. Nadie recibe «Administrar» automáticamente.

### 11.9 N8 sustituida — Exportación del borrador

Excel es la única exportación (las rutas CSV del servidor se retiraron, Back `eeaf327`). El Excel del borrador se arma con lecturas hechas al exportar (el servidor revalida permisos y restricciones) y usa la referencia **fijada** en el borrador (`estimation-link`), nunca la más reciente; una cifra restringida no aparece; sin diferencia ni porcentaje si el servidor no dice que son comparables. Detalle en `WEB_EXCEL_UNICO_2026-11-12.md`.

### 11.10 Reglas menores aceptadas

| # | Regla aceptada | Estado |
|---|---|---|
| m1 | Un colaborador renuncia a su propio permiso; queda registrado | Como estaba |
| m2 | Retiradas fuera de la lista operativa y de los totales; la fila se conserva | Como estaba |
| m3 | 180 días = ventana de «recientes», no eliminación | Como estaba |
| m4 | Conceder en borrador, abierta o cerrada; revocar en cualquier estado; siempre limitado por el consentimiento | Como estaba |
| m5 | Sólo la responsable concede; «Administrar» no permite delegar | Como estaba |
| m6 | Sin delegaciones activas automáticamente si la responsable no está habilitada | **Cambiado** (§11.5) |
| m7 | «Quitar referencia» impide que un resultado tardío la vuelva a asociar | Como estaba (prueba E3 «a late result has no effect on a cleared reference») |
| m8 | La selección de productos es lo editable del borrador | Como estaba |
| m9 | Reutilización de cálculos según las reglas documentadas | Como estaba |
| m10 | Sondeo sólo con la vista activa y el cálculo pendiente; se detiene al salir, terminar o fallar | **Cambiado** (Web `bcd8b62`: un fallo de la consulta detiene el sondeo; pestaña oculta lo pausa) |
| m11 | El historial reconstruye la concesión inicial al abrir | **Cambiado**: el evento de apertura dice «La persona responsable recibe el permiso de consultar participantes y cantidades.» |


## 12. P-A — Sustitución de la persona responsable (decisión del autor del 2026-11-12: A1 + B1 + C1)

Fuente: encargo del autor del 2026-11-12 («Continúa con P-A. Elijo A1 + B1 + C1, con las precisiones siguientes»). Esta sección **prevalece** sobre §11.5 en lo que añade. Implementado en Back `49ed870`, Web `3fab972` (+ `d5dc9cc`) y Mobile `4a3f1ad` (+ `2cc7e39`), ramas locales sin push. Migración aditiva `20261112180000_e2_pa_responsible_substitution`; esquema SQLite v19.

### 12.1 A1 — Permiso del sindicato «Sustituir responsable»

| Regla | Cómo se cumple |
|---|---|
| Lo concede y revoca una persona **ADMINISTRADOR habilitada** del sindicato | `POST /joint-purchase-substitution-permissions` y `…/revoke`; quien no lo es → `403 SUBSTITUTION_FORBIDDEN`. Se revalida en el servidor, dentro de la transacción |
| A personas **concretas y habilitadas** de la Directiva o la Administración del mismo sindicato | El destinatario debe ser un Member activo `DIRECTIVA`/`ADMINISTRADOR` con cuenta activa; cualquier otro (agricultor, inactivo, otro sindicato, inexistente) → `422 GRANTEE_NOT_ELIGIBLE`, sin decir por qué. Nunca a un rol entero: no hay concesión por rol |
| No a sí misma | `422 GRANTEE_NOT_ELIGIBLE`; además CHECK `userId <> grantedByUserId` y disparador de mismo sindicato |
| Quién, a quién, cuándo y por qué | `JointPurchaseSubstitutionGrant` (vigente) + `JointPurchaseSubstitutionGrantEvent` (sólo inserción, `GRANTED`/`REVOKED`, motivo obligatorio al conceder, 1–280) + `AuditLog` (`entityName = JointPurchaseSubstitutionGrant`) |
| Sólo permite sustituir (B1) | No da `PARTICIPANTS`, `MANAGE` ni poder de conceder: probado (quien lo tiene recibe `403 PARTICIPANTS_FORBIDDEN` y `403 MANAGE_FORBIDDEN`) |
| Renuncia | Quien lo tiene puede renunciar al suyo (por analogía con m1); queda registrado con su actor |
| Sin excepción automática | Si no hay otra persona elegible (por ejemplo, una sola Administración que no puede concedérselo a sí misma), **no** hay salida automática: la Web lo dice («No hay una salida automática»). La convocatoria abierta se sigue cerrando sola al vencer el plazo (§11.5) |
| Si quien concedió deja de estar habilitada | El permiso concedido sigue registrado y se ejerce mientras quien lo tiene esté habilitada; una ADMINISTRADOR habilitada lo revoca si hace falta. Quien lo **tiene** debe estar habilitada para usarlo (`holdsSubstitution`) |

`GET /joint-purchase-substitution-permissions` (cualquier DIRECTIVA/ADMINISTRADOR del sindicato): quién lo tiene (con `eligible`), quién lo concedió, cuándo, motivo e historial; `can_grant` y `holds_permission`. Sin datos de agricultores. En la Web, sección plegable «Permiso «Sustituir responsable»» en Compras conjuntas.

### 12.2 B1 — Sustituir a una responsable inhabilitada

`POST /joint-purchase-calls/{id}/responsible` `{request_id, expected_responsible_version, new_responsible_ref, reason, confirmed: true}`. Todo se revalida con la convocatoria bloqueada (`FOR UPDATE`):

| Condición | Respuesta |
|---|---|
| Quien sustituye tiene el permiso y sigue habilitada | si no, `403 SUBSTITUTION_FORBIDDEN` |
| La responsable actual **no** está habilitada (cuenta, Member, rol o sindicato inactivos) | si lo está, `409 RESPONSIBLE_STILL_ELIGIBLE` (un aviso no basta; la cesión voluntaria es otra operación, fuera de este bloque) |
| Estado `DRAFT`, `OPEN` o `CLOSED` | `CANCELLED` → `409 INVALID_TRANSITION` |
| La versión vista es la vigente | si no, `409 RESPONSIBLE_CHANGED` con `responsible_version`: dos sustituciones simultáneas no se sobrescriben en silencio |
| Sucesora: otra DIRECTIVA/ADMINISTRADOR habilitada del mismo sindicato, distinta de la actual y de quien sustituye | si no, `422 SUCCESSOR_NOT_ELIGIBLE`. Quien sustituye nunca se nombra a sí misma (decisión del autor del 2026-11-12, ver §12.7); otra persona habilitada con el permiso sí puede nombrarla |
| Motivo 1–280 y confirmación | `422 REASON_REQUIRED` / `422 CONFIRMATION_REQUIRED` |
| Reintento | el mismo `request_id` con el mismo cuerpo responde el detalle sin un segundo cambio ni otro evento; con otro cuerpo, `409 REQUEST_ID_REUSED` |

Efectos, en una transacción: fila sólo de inserción `JointPurchaseResponsibleChange` (versión nueva, anterior, sucesora, actor, motivo, fecha, estado de la convocatoria, delegaciones suspendidas, `request_id` y su huella); la convocatoria pasa a la sucesora con `responsibleVersion + 1`; el permiso del sistema de la anterior se borra y, en `OPEN`/`CLOSED`, la sucesora recibe el suyo (en `DRAFT` lo recibe al abrir); un evento `SUSPENDED` por delegación; evento `RESPONSIBLE_REPLACED` en el historial y entrada en `AuditLog`. **No** reabre, no cambia el plazo, las participaciones, las cantidades ni el consolidado, y no crea compras, pagos, deudas ni inventario. La base lo garantiza: el disparador de `JointPurchaseCall` sólo admite el cambio de responsable con su fila de registro de la versión siguiente, y en una sustitución sólo pueden cambiar la responsable, su versión y `updatedAt` (también en una `CLOSED`).

La Web muestra «Sustituir responsable» sólo con `can_substitute_responsible` (tiene el permiso, la responsable no está habilitada y no está cancelada), con sucesora, motivo, confirmación y la lista de lo que implica; el identificador de la solicitud se fija al abrir el diálogo. Ante `RESPONSIBLE_CHANGED` lo explica y recarga, sin reintentar.

### 12.3 Delegaciones

- Cada permiso de colaborador guarda la versión de la responsabilidad con que se concedió (`JointPurchaseCallAccess.responsibleVersion`). Sólo rige si es la vigente **y** la responsable está habilitada (m6). Las de una versión anterior quedan `PENDING_REVIEW`: suspendidas, no borradas.
- La sucesora revisa cada una: `POST /joint-purchase-calls/{id}/collaborators/review` `{user_ref, grant, decision: CONFIRM|RETIRE}`. Confirmar la concede otra vez con la versión vigente (evento `CONFIRMED`, `ACCESS_CONFIRMED`); retirar la borra (evento `REVOKED`). Sólo la responsable actual y habilitada (`403 COLLABORATORS_FORBIDDEN`); una que no está pendiente → `409 DELEGATION_NOT_PENDING`. Conceder lo que está pendiente equivale a confirmarlo.
- Confirmar una delegación no supera el consentimiento: el colaborador ve sólo lo que cada agricultor autorizó (§12.4).
- La responsable anterior no recupera nada si vuelve a estar habilitada: su permiso del sistema se borró y deja de ser la responsable.
- El acceso se lee en cada consulta: una delegación suspendida no se ejerce desde la petición siguiente.

### 12.4 C1 — Ninguna aceptación anterior cubre a la sucesora

- Cada participación guarda la versión de la responsabilidad que su agricultor autorizó (`consentResponsibleVersion`). Las existentes quedaron en la versión 1 (la única que hubo). Una participación sólo es **visible** si esa versión es la vigente; si no, nadie la ve por nombre (ni la sucesora ni sus colaboradores), y el total de un producto que la incluye es `RESTRICTED` para ellas. El resto de la Directiva sigue con la regla de §10.3 (sin cifra en vivo; umbral al cierre).
- Recuentos permitidos: `pending_authorization_count` (participaciones sin autorizar, sólo para quien tiene `PARTICIPANTS`) y `participant_count`. Son conteos de participaciones, sin nombres ni cantidades.
- **Autorizar** es una decisión propia (`POST …/participation/consent` con `authorize_responsible: true` y `responsible_version` = la que mostró el teléfono), separada de las cantidades, con el texto vigente `CONV-3`. Se admite en `OPEN` y `CLOSED` (sin editar el pedido); no en `CANCELLED`. Fija el alcance que el agricultor eligió: autorizar sólo a la responsable deja `RESPONSIBLE_ONLY` (nunca amplía); también puede elegir, en una casilla aparte, `COLLABORATORS`.
- Una autorización para otra versión (pendiente desde antes de una sustitución, o si la responsable vuelve a cambiar antes de recibirla) → `409 RESPONSIBLE_CHANGED` con la versión vigente: nunca vale para la nueva y el teléfono pide revisar de nuevo.
- Ampliar sin haber autorizado a la responsable vigente → `409 AUTHORIZATION_REQUIRED`.
- Reducir se respeta siempre, con cualquier versión, y nunca autoriza a nadie.
- Las cantidades nunca autorizan: modificar o retirar no cambia `consentResponsibleVersion`.
- Primera confirmación: queda autorizada la responsable que mostró el teléfono si es la vigente (`responsible_version`, contrato 3). Un teléfono que no lo dice (contratos 1 y 2) sólo puede haber visto a la vigente si nunca hubo sustitución (versión 1); si la hubo, no se supone nada (`null`: restringida hasta autorizarla).
- Orden: la autorización usa el orden propio de las decisiones (§11.1): un reintento o una respuesta atrasada nunca restablecen un acceso anterior.

### 12.5 Contrato del teléfono y versiones anteriores (N7)

- **Contrato 3** (`X-Joint-Purchase-Contract: 3`, Mobile `4a3f1ad`): `responsible: {name, version}` y en la participación `responsible_authorization: {authorized, version}`.
- **Contrato 2** (la app `e1f6e25`): la misma forma de §11 sin esas claves (`toContract2FarmerBody`). Esa versión no puede autorizar a una sucesora: la participación queda restringida y su «Ampliar» recibe `AUTHORIZATION_REQUIRED`, que muestra como rechazo. Su texto «Sólo la persona responsable (nombre) puede ver…» queda **más permisivo de lo real** (en realidad nadie la ve hasta autorizarla): no expone datos, pero informa de menos. Necesita actualizar para autorizar.
- **Contrato 1** (sin cabecera, la app `6bac5a3`): sin cambios de forma; sus cantidades se aceptan y nunca autorizan; su primera confirmación después de una sustitución queda sin autorizar.
- Comprobado por la API real del entorno aislado el 2026-11-12 (contratos 1, 2 y 3). **No** comprobado con las APK anteriores en un teléfono (§12.7).

### 12.6 Teléfono (esquema v19)

Columnas aditivas sin rellenar (`responsible_version` en convocatorias, operaciones y decisiones; `authorize_responsible` en decisiones). El detalle muestra, en un widget propio (`JointPurchaseResponsibleReview`, claves `joint-responsible-review`, `-changed`, `-pending`, `-outdated`, `-authorize`, `-check`, `-collaborators`, `-confirm`), quién es la nueva responsable, que su autorización anterior no vale para ella y la acción «Revisar autorización»: diálogo con `CONV-3`, dos casillas sin marcar (la segunda sólo con la primera) y «Sus cantidades no cambian». Pendiente de envío no se anuncia como aplicada; si la responsable vuelve a cambiar, «revise de nuevo». Sin autorizarla no se ofrece ampliar. Rechazos `RESPONSIBLE_CHANGED`/`AUTHORIZATION_REQUIRED`: definitivos, sin reintento, adoptando la participación vigente.

### 12.7 Límites y decisiones abiertas

- **Autosustitución (decisión del autor del 2026-11-12):** quien ejecuta la sustitución no puede nombrarse a sí misma nueva responsable; el servidor responde `422 SUCCESSOR_NOT_ELIGIBLE` sin registrar nada. Otra persona habilitada con el permiso «Sustituir responsable» puede nombrarla, con todas las condiciones de P-A. La Web lo explica: quien sustituye no aparece en la lista y se le dice por qué (`substitute-self-note`); si la única persona elegible es ella, o no hay nadie, el diálogo informa del bloqueo (`substitute-no-candidates`) y no deja enviar. No hay excepción automática ni accesos nuevos: la convocatoria abierta se sigue cerrando sola al vencer el plazo (§11.5). Pruebas: PostgreSQL «author's decision (2026-11-12)…» y Web «P-A: si sólo es elegible quien sustituye / no hay nadie elegible…».
- **Combinación de lecturas:** si una persona vio el total de un producto al cierre por el umbral (k = 3) y después es sucesora y recibe autorizaciones individuales, puede deducir por resta la cantidad de quien no la autorizó. Es el mismo límite de §10.3 («lo que dos personas combinen fuera del sistema»): no se presenta como garantía de anonimato (N4).
- **Borradores:** cambiar la responsable con `PATCH` en un borrador (antes de abrir) sigue como estaba y no sube la versión; las delegaciones de la responsable anterior de ese borrador siguen vigentes (comportamiento anterior a P-A, anotado; no se cambió).
- **Teléfono:** recorrido en emulador el 2026-11-12 por la tarde (no en teléfono físico). La app integrada del rediseño (`91f2e73`) cubrió sustitución, autosustitución, delegaciones, restricción, autorización independiente de las cantidades y convocatoria cerrada. La app anterior (`e1f6e25`, contrato 2) es segura, pero no puede autorizar a la nueva responsable y su texto de «quién ve sus datos» queda más permisivo de lo real: hace falta actualizar. Evidencia `docs/evidence/E2_PA_SUSTITUCION_2026-11-12.md` §7.
