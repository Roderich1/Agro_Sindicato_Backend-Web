# E2 — Convocatorias de compra conjunta y participación identificada (contrato de la etapa 2)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-11 (redacción); estado **Propuesto**, pendiente de la aceptación de Roderich |
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

## 8. Decisiones abiertas para Roderich

- **E2-P1** Umbral para mostrar totales por producto a quien no es responsable (hoy 3, el provisional de F07).
- **E2-P2** Plazo de visibilidad en el teléfono de convocatorias cerradas o canceladas (hoy 180 días).
- **E2-P3** ¿Debe poder la Directiva designar más personas con permiso de ver participantes (además del responsable)? Hoy no: sólo el responsable.

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
