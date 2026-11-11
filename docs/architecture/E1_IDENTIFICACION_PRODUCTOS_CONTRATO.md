# E1 — Identificación de productos reportados por el agricultor (contrato de la etapa 1)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-11 (redacción); estado **Propuesto**, pendiente de la aceptación de Roderich |
| Alcance | Etapa 1 de las mejoras funcionales acordadas: productos e identificación, con fotografía opcional de la etiqueta |
| Bases | Back/Web: `feat/web-rediseno-integracion` `11bffd7` → rama `feat/etapa1-identificacion-productos` (`_wt/ET1-BE`). Mobile: `feat/f09-voz-formulario-unico` `73a927b` → rama `feat/etapa1-productos-identificacion-foto` (`_wt/ET1-MOB`) |
| Contratos que **no cambian** | `F05_SYNC_V1_PUSH_ACK_CONTRACT.md`, `F06_COLLECTIVE_PROJECTION_CONTRACT.md` y su matriz de campos, `F07_AGGREGATE_DISCLOSURE_POLICY.md`, `F08_BACKUP_THREAT_MODEL.md` |
| Trazabilidad | RF-33, RF-34 (asociaciones canónicas confirmadas por la Directiva); RN-29 (ninguna cifra ni recomendación automática); CU-18 (reconciliación de denominaciones) |

## 1. Qué existe y qué falta (inspección del 2026-11-11)

**Existe y se reutiliza:**

- El catálogo del sindicato es la tabla `Product` (una por tenant, `@@unique([tenantId, name])`). No hay otro catálogo y **no se crea otro**.
- Las denominaciones se agrupan con `ProductCanonicalAssociation` (`POST /collective/product-associations`, Directiva/Administrador, confirmación y motivo obligatorios, F07-REC-01). Un producto sin asociación es su propio canónico (F07 §2).
- Mobile vincula cada producto local con una referencia central **por elección explícita** del agricultor (`product_bindings`, `GET /sync/v1/references`, pantalla `central_binding_screen.dart`). Sync v1 sólo acepta `product_ref` que ya exista como `Product` del tenant; de lo contrario `REFERENCE_UNAVAILABLE`.
- Almacenamiento privado de binarios fuera de PostgreSQL: puerto `BackupStorage` (F08) con adaptadores disco y S3, claves UUID generadas por el servidor, `stage → commit`, descarga autorizada con `no-store`.
- Bitácora: `AuditLog` (`action`, `entityName`, `summary`, `actorUserId`; `ownerUserId = null` para acciones institucionales).
- Mobile: foto de factura con `image_picker` (`imageQuality`, `maxWidth`) guardada en documentos de la app; cola `sync_outbox` con reintentos (`SyncBackoff`); cliente HTTP `AuthHttpClient` con lista cerrada de rutas (`ApiEndpointConfig`); subida binaria `application/octet-stream` + `X-Content-SHA256` (respaldo remoto).

**Falta (y es lo que esta etapa añade):**

- Un estado central «**producto reportado, pendiente de identificar**». Hoy un producto local sin equivalente central no puede publicarse de ninguna forma.
- Un canal para que el agricultor **reporte** su producto local (nombre, ingrediente activo, unidad y, con consentimiento aparte, una foto de la etiqueta) sin tocar Sync v1.
- La decisión de la persona autorizada en la Web: vincular a un producto existente, crear un producto colectivo o dejar pendiente por falta de información, con historial de quién decidió.
- Candidatos sugeridos por similitud de nombre (sólo sugerencia; nunca agrupación automática).
- Infraestructura de imágenes: validación de tipo real, tamaño y estructura; acceso autorizado; reemplazo y retiro con limpieza del binario.

## 2. Decisiones de integración

| ID | Decisión | Motivo |
|---|---|---|
| E1-D1 | La solicitud de identificación es una entidad nueva, `ProductIdentificationRequest`, **no** una fila de `Product`. | Un producto reportado no es un producto oficial hasta que la Directiva decide. Insertarlo en `Product` lo convertiría en su propio canónico (F07 §2), chocaría con `@@unique([tenantId, name])` y aparecería en `references` como vinculable. |
| E1-D2 | La identificación es un canal **aparte de Sync v1**: rutas nuevas bajo `/api/v1/catalog/identification-requests`, con la misma autenticación de agricultor que Sync v1 (`SyncV1AuthGuard`: Member AGRICULTOR, sesión v2 y registro de cliente vigentes). | El envelope F05/F06 es una whitelist cerrada; nombre, ingrediente y fotos son `DENY` en la matriz F06. No se modifica ningún contrato vigente. |
| E1-D3 | Idempotencia por `request_id` UUID v4 generado por el teléfono, una solicitud por producto local, única por `(tenant, member, request_id)`. Reenviar devuelve el estado vigente. | «Evitar duplicados ante reenvíos»; mismo principio que `operationId` de Sync v1. |
| E1-D4 | Al vincular, el servidor **no** escribe `product_bindings` ni nada en el teléfono: el agricultor ve «Identificado como “X”» y confirma el vínculo con el flujo existente (`bindProduct`). | Conserva la regla del store (ningún vínculo sin elección confirmada) y «no inscribe automáticamente». Las compras, aplicaciones e inventario local nunca se reescriben: el vínculo vive en `product_bindings`. |
| E1-D5 | La Directiva **no ve la identidad del agricultor** que reportó el producto (ni nombre, ni Member, ni dispositivo). Ve nombre reportado, ingrediente, unidad, fechas, foto y su propio historial de decisiones. | F06 §5 / F07 §1 prohíben unir Member con datos colectivos; identificar un producto no lo requiere. **Decisión abierta para Roderich** (E1-P1): si la coordinación exige saber quién reportó, hace falta una regla de privacidad explícita. |
| E1-D6 | Roles autorizados para decidir: `DIRECTIVA` y `ADMINISTRADOR` del mismo tenant (como `product-associations`, RU-18/RU-19, ADR-003). Sin permiso nuevo en esta etapa. | El sistema no tiene permisos más finos que los roles; crearlos corresponde a la etapa 2 (participantes de convocatoria). |
| E1-D7 | Candidatos: sólo productos **de la misma dimensión** (L↔ML, KG↔G), con similitud calculada por el servidor sobre nombre normalizado (sin acentos, minúsculas, sin puntuación): Jaccard de palabras, Dice de bigramas y contención; también coincidencia exacta de ingrediente activo. Se devuelven como `ALTA`/`MEDIA`/`BAJA` y la Web los muestra como sugerencia. El servidor **nunca** vincula por similitud. | «La similitud del nombre solo puede sugerir candidatos.» |
| E1-D8 | Foto: binario en el almacenamiento privado F08 (misma interfaz `BackupStorage`, raíz o prefijo propios), clave UUID del servidor, acceso sólo por ruta autorizada con `Cache-Control: private, no-store`; **ninguna URL pública ni permanente**. En PostgreSQL sólo metadatos (clave, SHA-256, tipo, tamaño, dimensiones). Ni logs ni eventos llevan la imagen ni base64. | Reglas B del encargo; F08 ya resolvió el mismo problema. |
| E1-D9 | Validación de la imagen en el servidor: tipo real por firma (`FFD8FF` JPEG, `89504E470D0A1A0A` PNG), tamaño ≤ 2 MiB, dimensiones leídas de la cabecera (JPEG SOFn / PNG IHDR) entre 64 y 4096 px, SHA-256 igual al declarado. **Limitación declarada:** sin biblioteca de imágenes en Back, «decodificable» se comprueba por estructura de cabecera, no por decodificación completa. | No hay `sharp` ni similar y no se añade dependencia nativa en esta etapa. |
| E1-D10 | Mobile procesa la foto con el paquete Dart `image` (decodificar, aplicar orientación, reducir el lado mayor a ≤ 1600 px, JPEG calidad 82) y guarda **sin metadatos** (el codificador no escribe EXIF; se elimina la ubicación). | `image_picker` conserva EXIF en algunos casos y no garantiza quitar GPS; es la única dependencia nueva (Dart puro). |
| E1-D11 | Consentimiento de la foto **separado** del envío de datos: casilla propia con texto versionado `FOTO-1`; se registra versión y fecha en el teléfono y en el servidor. Reemplazar la foto vuelve a preguntar antes de enviar la nueva. Quitarla retira el binario del servidor. | «No ampliar silenciosamente un consentimiento existente.» |
| E1-D12 | Transferencia en dos pasos independientes: (1) datos JSON; (2) foto binaria. La foto pendiente o fallida **no bloquea** la solicitud ni su identificación. En Mobile la solicitud tiene su propio estado de envío (tabla `product_identification_requests`) y reutiliza `SyncBackoff` y el acceso de `SyncController`; **no** se añade a `sync_outbox`, cuyos triggers y CHECK pertenecen al contrato F05. | Extender `sync_outbox` obligaría a romper su whitelist; la solicitud no es una operación del consolidado. |
| E1-D13 | Toda decisión de la Directiva deja (a) un evento en `ProductIdentificationEvent` (historial de la solicitud) y (b) una entrada en `AuditLog` (`action: OTRO`, `entityName: ProductIdentificationRequest`, `ownerUserId: null`). Reemplazo y retiro de foto quedan como eventos sin actor institucional. | «Registrar quién vincula o modifica una relación.» |
| E1-D14 | Las cifras publicadas y selladas no se tocan: identificar un producto no crea contribuciones ni cambia celdas. Si más adelante el agricultor publica con la referencia vinculada, rige F05/F06/F07 tal cual. | «Mantener las restricciones sobre cifras publicadas y selladas.» |

## 3. Modelo de datos (PostgreSQL, migración nueva, sólo aditiva)

```prisma
enum ProductIdentificationStatus     { PENDING LINKED }
enum ProductIdentificationResolution { LINKED_EXISTING CREATED_PRODUCT }
enum ProductIdentificationPhotoState { NONE STORED REMOVED }
enum ProductIdentificationEventKind  { RECEIVED UPDATED PHOTO_RECEIVED PHOTO_REPLACED PHOTO_REMOVED LINKED RELINKED PRODUCT_CREATED NOTE }

model ProductIdentificationRequest {
  id                 String  @id @default(uuid()) @db.Uuid   // id del servidor (rutas institucionales)
  tenantId           String
  memberId           String
  clientRequestId    String  @db.Uuid                         // UUID v4 del teléfono (rutas del agricultor)
  localName          String  @db.VarChar(120)
  activeIngredient   String? @db.VarChar(120)
  unit               String  @db.VarChar(2)                   // "L" | "KG" (CHECK en SQL)
  baseUnit           SyncV1BaseUnit                           // ML | G, derivada de unit
  status             ProductIdentificationStatus @default(PENDING)
  resolution         ProductIdentificationResolution?
  productId          String?                                  // Product vinculado (existente o creado)
  resolvedByUserId   String?
  resolvedAt         DateTime?
  resolutionReason   String? @db.VarChar(280)
  pendingNote        String? @db.VarChar(280)
  pendingNoteByUserId String?
  pendingNoteAt      DateTime?
  photoState         ProductIdentificationPhotoState @default(NONE)
  photoStorageKey    String? @unique @db.Uuid
  photoSha256        String? @db.Char(64)
  photoContentType   String? @db.VarChar(16)                  // image/jpeg | image/png
  photoSizeBytes     Int?
  photoWidth         Int?
  photoHeight        Int?
  photoConsentVersion String? @db.VarChar(16)
  photoConsentAt     DateTime?
  photoStoredAt      DateTime?
  photoRemovedAt     DateTime?
  receivedAt         DateTime @default(now())
  updatedAt          DateTime @updatedAt
  // relaciones: tenant, member (tenantId, memberId), product?, resolvedBy?, pendingNoteBy?, events[]
  @@unique([tenantId, memberId, clientRequestId])
  @@index([tenantId, status, receivedAt])
}

model ProductIdentificationEvent {
  id          String   @id @default(uuid()) @db.Uuid
  requestId   String   @db.Uuid
  at          DateTime @default(now())
  kind        ProductIdentificationEventKind
  actorUserId String?                     // null = el agricultor (nunca se nombra); usuario institucional en decisiones
  productId   String?
  detail      String?  @db.VarChar(280)   // motivo o nota; nunca nombres de personas ni rutas de archivo
  @@index([requestId, at])
}
```

Restricciones SQL adicionales en la migración: `CHECK (unit IN ('L','KG'))`; `CHECK ((status = 'LINKED') = (productId IS NOT NULL))`; `CHECK ((photoState = 'STORED') = (photoStorageKey IS NOT NULL))`; prohibición de `DELETE` sobre `ProductIdentificationEvent` (trigger, como en asociaciones).

## 4. API

Prefijo común: `/api/v1/catalog/identification-requests`. Todas las respuestas llevan `Cache-Control: no-store`. Códigos de error en `errorCode` (JSON), sin eco del cuerpo recibido.

### 4.1 Rutas del agricultor (Mobile) — `@Public()` + `SyncV1AuthGuard`

| Método y ruta | Uso |
|---|---|
| `PUT /{request_id}` | Crear o reenviar la solicitud (idempotente). `request_id` = UUID v4 en minúsculas generado por el teléfono. |
| `GET /` | Solicitudes propias (todas), para conocer la identificación al sincronizar. Sin parámetros de consulta. |
| `PUT /{request_id}/photo` | Subir o reemplazar la foto. Cuerpo `application/octet-stream`; cabeceras `Content-Length` (obligatoria, ≤ 2 097 152) y `X-Content-SHA256` (hex minúsculas). |
| `DELETE /{request_id}/photo` | Retirar la foto (204; idempotente). |

**Cuerpo de `PUT /{request_id}`** (JSON, claves exactas; cualquier clave extra → 400 `PAYLOAD_INVALID`):

```json
{
  "contractVersion": 1,
  "local_name": "Glifosato 480 Agroquímicos del Sur",
  "active_ingredient": "Glifosato",
  "unit": "L",
  "photo_consent": { "version": "FOTO-1", "accepted_at": "2026-11-11T18:20:00.000Z" }
}
```

- `local_name`: 1–120 caracteres tras recortar espacios. `active_ingredient`: `null` o 1–120. `unit`: `"L"` o `"KG"` (otra cosa → 422 `UNIT_UNSUPPORTED`). `photo_consent`: `null` o el objeto; una vez registrado no se borra con un `PUT` posterior.
- 201 si se creó; 200 si ya existía para ese Member. Si existe y está `PENDING` y cambian `local_name` o `active_ingredient`, se actualizan y se registra `UPDATED`; `unit` es inmutable (cambio → 409 `UNIT_IMMUTABLE`). Si está `LINKED`, los datos no cambian (200 con el estado vigente).
- `request_id` ya usado por otro Member del tenant → 409 `REQUEST_ID_CONFLICT`.

**Vista de la solicitud** (respuesta de `PUT /{id}`, elemento de `GET /`):

```json
{
  "contractVersion": 1,
  "request_id": "7f4b1c2e-9d3a-4f61-8b2c-0e5a6d7c8b9a",
  "status": "PENDING",
  "local_name": "Glifosato 480 Agroquímicos del Sur",
  "active_ingredient": "Glifosato",
  "unit": "L",
  "base_unit": "ML",
  "received_at": "2026-11-11T18:20:05.120Z",
  "updated_at": "2026-11-11T18:20:05.120Z",
  "photo": { "state": "NONE", "sha256": null, "consent_version": "FOTO-1" },
  "resolution": null,
  "pending_note": null
}
```

Cuando está identificada: `"status": "LINKED"` y

```json
"resolution": {
  "kind": "LINKED_EXISTING",
  "product_ref": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "product_name": "Glifosato 48 SL",
  "unit": "L",
  "base_unit": "ML",
  "is_active": true,
  "resolved_at": "2026-11-12T09:00:00.000Z"
}
```

`pending_note`: `null` o `{ "text": "...", "at": "..." }` (nota de la Directiva al dejarla pendiente; sin nombre del autor hacia el agricultor).

`GET /` responde `{ "contractVersion": 1, "requests": [ ...vistas... ] }`.

**`PUT /{request_id}/photo`**: requiere solicitud propia con `photo_consent` registrado (si no → 409 `PHOTO_CONSENT_REQUIRED`). Tipo real por firma (otro → 422 `IMAGE_INVALID`); tamaño > 2 MiB o `Content-Length` ausente → 413 `IMAGE_TOO_LARGE`; dimensiones fuera de [64, 4096] o cabecera ilegible → 422 `IMAGE_INVALID`; SHA-256 distinto → 422 `CONTENT_HASH_MISMATCH`; almacenamiento no configurado → 503 `PHOTO_STORAGE_UNAVAILABLE`. Mismo SHA-256 que la foto almacenada → 200 sin reescribir. Distinto → se almacena la nueva, se confirma, se borra la anterior (`PHOTO_REPLACED`). Respuesta 200/201: la vista de la solicitud. Un guardia de cuerpo (como `configureBackupsBodyGuard`) impide que el parser JSON lea este cuerpo: sólo para rutas que terminan en `/photo`.

### 4.2 Rutas institucionales (Web) — JWT + `@Roles(DIRECTIVA, ADMINISTRADOR)`

| Método y ruta | Uso |
|---|---|
| `GET /?status=PENDING\|LINKED\|ALL` | Lista del tenant (por defecto `PENDING`), ordenada por `received_at` ascendente. |
| `GET /{id}/candidates` | Hasta 5 candidatos de la misma dimensión (E1-D7). |
| `GET /{id}/history` | Eventos de la solicitud. |
| `GET /{id}/photo` | Binario autorizado (`Content-Type` real, `Content-Length`, `X-Content-SHA256`, `Content-Disposition: inline`, `Cache-Control: private, no-store`). 404 si no hay foto, fue retirada o la solicitud es de otro tenant. |
| `POST /{id}/link` | `{ "product_ref", "reason", "confirmed": true }` → vincular (o corregir el vínculo) a un `Product` existente. |
| `POST /{id}/create-product` | `{ "name", "active_ingredient", "reason", "confirmed": true }` → crear el producto colectivo (unidad = la de la solicitud) **y** vincular. |
| `POST /{id}/defer` | `{ "note", "confirmed": true }` → sigue `PENDING`, con nota. |

`{id}` es el id del servidor. La vista institucional es la misma del §4.1 más `"id"`, `"photo.content_type"`, `"photo.width"`, `"photo.height"`, `"photo.stored_at"`, y **sin** ningún dato del agricultor. Elementos de `candidates`:

```json
{ "product_ref": "...", "product_name": "Glifosato 48 SL", "unit": "L", "base_unit": "ML", "is_active": true,
  "is_alias": false, "canonical_product_ref": null, "similarity": "ALTA", "matched_on": ["name"] }
```

Reglas de `link` / `create-product` / `defer`: `confirmed !== true` → 422 `CONFIRMATION_REQUIRED`; `reason`/`note` vacíos o > 280 → 422 `REASON_REQUIRED`; producto inexistente o de otro tenant → 404 `PRODUCT_NOT_FOUND`; producto inactivo → 422 `PRODUCT_INACTIVE`; dimensión distinta → 422 `UNIT_DIMENSION_MISMATCH`; nombre ya existente al crear → 409 `PRODUCT_NAME_TAKEN` (la Web ofrece vincular en su lugar); vínculo igual al vigente → 200 `{ "changed": false }`. Las tres operaciones se serializan por tenant con `pg_advisory_xact_lock` (como las asociaciones). Elementos de `history`: `{ "at", "kind", "actor": { "name" } | null, "product_ref", "product_name", "detail" }` (actor sólo en decisiones institucionales).

### 4.3 Lista de rutas de Mobile (`ApiEndpointConfig`)

Añadir: exacta `/api/v1/catalog/identification-requests`; regex `^/api/v1/catalog/identification-requests/<uuid v4>(/photo)?$`. Nada más.

## 5. Mobile

**Esquema v15** (aditivo; `_createSchema` y `_upgradeSchema` comparten el mismo helper idempotente; actualizar `schema_equivalence_test`):

```sql
ALTER TABLE products ADD COLUMN photo_path TEXT;          -- relativo a documentos: product_photos/<archivo>.jpg
ALTER TABLE products ADD COLUMN photo_sha256 TEXT;
ALTER TABLE products ADD COLUMN photo_updated_at TEXT;
CREATE TABLE product_identification_requests (
  request_id TEXT PRIMARY KEY,                              -- UUID v4
  product_id INTEGER NOT NULL UNIQUE REFERENCES products(id),
  tenant_id TEXT NOT NULL,
  sent_name TEXT NOT NULL,
  sent_active_ingredient TEXT,
  sent_unit TEXT NOT NULL CHECK (sent_unit IN ('L','KG')),
  photo_consent_version TEXT,
  photo_consent_at TEXT,
  photo_sha256_consented TEXT,                              -- SHA-256 del archivo que se autorizó a enviar
  send_status TEXT NOT NULL CHECK (send_status IN ('PENDING_SEND','RECEIVED','REJECTED','AUTH_PAUSED')),
  send_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_code TEXT,
  photo_send_status TEXT NOT NULL CHECK (photo_send_status IN ('NONE','PENDING_SEND','SENT','FAILED','REMOVE_PENDING','REMOVED')),
  photo_attempts INTEGER NOT NULL DEFAULT 0,
  photo_next_attempt_at TEXT,
  photo_last_code TEXT,
  server_status TEXT CHECK (server_status IN ('PENDING','LINKED')),
  server_product_ref TEXT,
  server_product_name TEXT,
  server_product_unit TEXT,
  server_resolution TEXT,
  server_note TEXT,
  server_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Comportamiento:**

1. **Foto de la etiqueta** (Catálogos → producto → «Foto de la etiqueta»): tomar o elegir, ver, reemplazar, quitar. Guardado local en `<documentos>/product_photos/`, procesado según E1-D10. Sin conexión. El diálogo de alta de producto **no cambia** (lo comparten los formularios y la pasarela de voz).
2. **Pedir identificación** (pantalla de vínculos, producto sin vínculo): diálogo que muestra exactamente lo que se enviará (nombre, ingrediente, unidad) y, si hay foto, una casilla aparte «Compartir también la foto de la etiqueta» con el texto de consentimiento `FOTO-1`: *«La foto de la etiqueta de «{producto}» se enviará al sindicato para ayudar a identificar el producto. Podrá verla la directiva. Puede quitarla después desde este teléfono.»* Confirmar crea la fila con `send_status = PENDING_SEND` (y `photo_send_status = PENDING_SEND` si se marcó la casilla).
3. **Envío**: un emisor propio (`IdentificationRequestSender`) reutiliza `SyncController.ensureAccess()` y `SyncBackoff`. Se ejecuta al abrir o actualizar la pantalla de vínculos, al pulsar «Enviar ahora» y junto con el ciclo del `SyncWorker`. Paso 1: `PUT /{id}` → `RECEIVED` y se guarda `server_status`. Paso 2 (si corresponde): `PUT /{id}/photo` → `SENT`; fallo transitorio → `FAILED` con reintento; `REMOVE_PENDING` → `DELETE` → `REMOVED`. Códigos 4xx terminales (`PAYLOAD_INVALID`, `UNIT_UNSUPPORTED`, `IMAGE_INVALID`, `IMAGE_TOO_LARGE`, `REQUEST_ID_CONFLICT`) → `REJECTED`/`FAILED` sin reintento; 401/403 → `AUTH_PAUSED` como el outbox.
4. **Lectura**: `GET /` al actualizar la pantalla de vínculos; se actualizan `server_*`. Si `server_status = LINKED`, se muestra «Identificado por el sindicato como “{nombre}” ({unidad})» con el botón **Vincular**, que usa el flujo existente de confirmación y `bindProduct` (misma dimensión, referencia vigente, sin aporte vivo). Nunca se vincula automáticamente.
5. **Reemplazo y retiro**: reemplazar la foto con solicitud ya enviada pregunta de nuevo si se envía la nueva (consentimiento nuevo registrado); quitarla pasa a `REMOVE_PENDING` y borra el archivo local.
6. **Textos de estado** (chips): «Pendiente de envío», «Recibida por el sindicato», «Esperando identificación», «Identificado como “X”», «Rechazada: {motivo}», «Foto pendiente de envío», «Foto enviada», «Foto no enviada (se reintentará)», «Foto retirada». Nunca «Enviado» cuando sólo existe la fila local.
7. **Respaldo privado**: las fotos de producto se incluyen como las de factura si el cambio es acotado; si no, se declara limitación.

## 6. Web

Vista nueva en `/colectivo/catalogo?vista=identificacion` («Por identificar»), dentro de la página de catálogo existente (`SegmentedControl` con tres vistas). Para cada solicitud pendiente: nombre reportado, ingrediente, unidad, fecha de recepción, foto (botón «Ver foto» → `Modal` con la imagen obtenida por `axios` como `blob` y liberada al cerrar; nunca `<img src>` directo a la API), y las tres acciones: **Vincular** (candidatos del servidor con su chip de similitud y la aclaración «Sugerencias por parecido del nombre; la decisión es suya», más búsqueda en el catálogo de la misma dimensión), **Crear producto colectivo** (`ProductForm` con unidad bloqueada y nombre precargado) y **Dejar pendiente** (nota). Motivo y casilla de confirmación obligatorios, como en Equivalencias. Historial en `Collapsible`; resueltas en un segundo `Collapsible`. Componentes del kit `components/ui`; presentación mínima para integrar el diseño de Claude Design después.

## 7. Verificación prevista

| Prueba | Dónde |
|---|---|
| Idempotencia del `PUT` (mismo id, reenvío; id ajeno) | Back `*.postgres.spec.ts` |
| Separación de tenants y roles (AGRICULTOR no lista; otro tenant 404; Directiva sin identidad del agricultor) | Back postgres spec |
| Foto: tipo falso, tamaño, hash distinto, sin consentimiento, reemplazo borra la anterior, retiro → 404, acceso de otro tenant 404 | Back postgres spec + spec de almacenamiento |
| Datos aceptados aunque la foto falle | Back spec y Mobile test del emisor |
| Vincular / crear / dejar pendiente: eventos, AuditLog, concurrencia, nombre repetido | Back spec unitaria y postgres |
| Candidatos: misma dimensión, orden, nunca escritura | Back unit spec |
| Migración v15 y equivalencia de esquema | Mobile `migration_test`, `schema_equivalence_test` |
| Foto local: EXIF ausente, tamaño, reemplazo y retiro | Mobile tests |
| Emisor: reintentos, códigos terminales, sin duplicar | Mobile tests con `MockClient` |
| Vínculo tras identificación sin tocar compras/aplicaciones/inventario | Mobile test |
| Web: lista, foto autorizada, tres acciones, errores visibles | Vitest |
| Recorrido completo emulador → API aislada → Web | Evidencia manual (emulador, no teléfono) |

## 8. Decisiones abiertas para Roderich

- **E1-P1** Identidad del agricultor ante la Directiva (E1-D5): hoy oculta.
- **E1-P2** Límite de 2 MiB y 1600 px: valores iniciales; ajustar si la legibilidad de etiquetas lo exige.
- **E1-P3** ¿Debe la Directiva poder **deshacer** un vínculo (volver a `PENDING`)? Esta etapa permite corregirlo a otro producto, no deshacerlo.
- **E1-P4** Retención del binario tras `REMOVED` y tras el vínculo (hoy: el binario se borra al retirar; se conserva mientras la solicitud exista).

## 9. Resoluciones de la implementación (2026-11-11, tarde)

Precisiones fijadas al implementar; completan el §4 sin cambiar las reglas de los §§1–8.

| Tema | Resolución |
|---|---|
| `GET /` compartido | Un solo manejador: primero la autenticación de agricultor (`SyncV1AuthGuard`) → lista propia; si no aplica, sesión Web con rol DIRECTIVA/ADMINISTRADOR → lista del tenant con `?status=`. Un agricultor con cualquier parámetro de consulta recibe 400 `PAYLOAD_INVALID`. |
| Códigos adicionales | `REQUEST_NOT_FOUND` (404), `PHOTO_NOT_FOUND` (404; también para otro tenant), `REQUEST_ALREADY_LINKED` (409 al diferir una solicitud ya vinculada), `PHOTO_INTEGRITY_FAILED` (500), `AUTH_REQUIRED`, `AUTH_CONTEXT_FORBIDDEN`, `RATE_LIMITED`, `UNSUPPORTED_MEDIA_TYPE`. Todo error es `{ "errorCode" }` con `no-store`; la validación responde 400 `PAYLOAD_INVALID` sin eco del cuerpo. |
| `PUT /{id}/photo` | 201 cuando se almacenan bytes nuevos (primera foto o reemplazo); 200 cuando el SHA-256 coincide con la almacenada. Sin `Content-Length` (chunked) → 413. El cuerpo JSON de `PUT /{id}` se parsea con límite de 8 KiB antes del parser global. |
| Solicitud `LINKED` | `PUT` no cambia datos ni consentimiento; cambio de unidad sigue siendo 409 `UNIT_IMMUTABLE`. |
| Consentimiento | Una versión o fecha nueva sustituye a la anterior y deja evento `UPDATED`; nunca se borra con un `PUT`; se conserva tras retirar la foto. |
| Respuestas de decisión | `{ "changed", "request": <vista institucional> }`; `create-product` añade `product_ref` y responde 201. Vincular limpia `pending_note` (queda en el historial). |
| Candidatos | Sólo productos activos de la misma dimensión. Puntaje del nombre = máximo de Jaccard de palabras, Dice de bigramas y contención completa (0,85, sólo con una palabra de 3+ letras); ingrediente activo igual eleva al menos a 0,5 y suma 0,15. Umbrales 0,75 / 0,45 / 0,25; cinco como máximo. |
| `PRODUCT_NAME_TAKEN` | Comparación sin distinguir mayúsculas, bajo el bloqueo por tenant, antes de crear. |
| Retiro de foto | El binario se borra primero, dentro de la transacción bloqueada; si falla, 503 y la fila no cambia. |
| Eventos | La tabla bloquea `UPDATE` además de `DELETE`. |
| `create-product` | Reutiliza `ProductCatalogUseCase.create` con el cliente transaccional (producto y vínculo en una sola transacción); `InventoryModule` exporta el caso de uso. |
| Almacenamiento | `PRODUCT_PHOTO_STORAGE_DIR` (disco) o `PRODUCT_PHOTO_STORAGE_PROVIDER=b2` con las credenciales `BACKUP_S3_*` y `PRODUCT_PHOTO_S3_PREFIX`; se rechaza compartir carpeta o prefijo con los respaldos. |
| Web | «Crear producto colectivo» usa un formulario propio (nombre 2–160, ingrediente ≤ 120, unidad bloqueada) porque `ProductForm` escribe en `/inventory/products` sin vincular. «Corregir vínculo…» en las identificadas usa `link` (evento `RELINKED`). |
| Mobile | La pantalla de vínculos no hace peticiones al abrirse: envía en «Actualizar», «Enviar ahora» y tras un ciclo del `SyncWorker`. El respaldo privado **no** incluye todavía `product_photos/` (limitación declarada; las columnas y la tabla sí viajan; tras restaurar se muestra «La foto ya no está en este teléfono»). Chips añadidos: «Retiro de la foto pendiente de envío», «Foto no enviada: {motivo}». |
