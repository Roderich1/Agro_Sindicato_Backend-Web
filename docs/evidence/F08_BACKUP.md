# F08 — Respaldo privado en el Backend (#37, #38, #39)

**Origen:** Live. **Verificado:** 2026-10-16 (America/La_Paz). La implementación y las pruebas son de esta fecha; no hay trabajo retro-fechado.

**Trazabilidad:** RF-26, RF-27, RNF-04, DAT-14, CU-14 y CU-15. Gate relacionado: GATE-F08 (#41), que sigue **Pending**.

## Commits

| Commit | Contenido |
|---|---|
| `a6cf658` | Módulo `backups`, modelo y migración, adaptador de disco, API, pruebas, subconjunto OpenAPI y paso de CI. |
| `0e03037` | Snapshots OpenAPI regenerados en la rama. Al integrar, A los regenera desde `main` integrado. |
| `d631437` | Merge de `main` `3616fcf` (#112): migraciones en serie y ajuste de la prueba de migración de F07-POL-01. |
| `9b0a2ba` | Precondición de orden en esa prueba. |
| `5f8d566` | Primera versión de esta evidencia y del acta. |
| `15c8cf4` | Correcciones de la revisión de A (B1–B3 y menores), descritas abajo. |
| Commits posteriores (segunda revisión de A) | La guarda de cuerpo pasa detrás de CORS, así que el 415 lleva sus cabeceras. Si falla la marca AVAILABLE, se relee el estado antes de borrar el objeto: una copia que sí quedó AVAILABLE conserva sus bytes. Prueba nueva «an ambiguous AVAILABLE update that did commit keeps the copy and its bytes» (22/22). Se añade el [modelo de amenaza](../architecture/F08_BACKUP_THREAT_MODEL.md), decisión de Roderich sobre DEC-F01-10. |

Base de la rama: `063437d3ebe7f10110a5faaeee3f052e7d89d100`; después se integró `main` en `3616fcf`. **Todas las ejecuciones de esta evidencia son sobre `15c8cf44dfb1cc759f5ae486159e28ad9054e131`**, salvo que se indique otra cosa.

## Qué se implementó

- **Metadatos (#37).** El modelo `BackupMetadata` (migración `20261016181000_f08_backup_metadata`, creada como `20261016161400_…` y renombrada con `git mv` al integrar `main` `71460bf` para que quede detrás de la de B) guarda:
  - Propietario: `tenantId` y `memberId` de la sesión.
  - Estado: `UPLOADING`, `AVAILABLE`, `FAILED` o `DELETED`.
  - `storageKey`: UUID generado por el servidor; nunca un nombre de archivo del cliente.
  - Tamaño medido por el servidor y SHA-256.
  - Compatibilidad declarada: versión del contenedor y del esquema SQLite.
  - `failureCode` cerrado y fechas.

  Sólo las copias `AVAILABLE` se listan o se sirven. Un intento fallido no sustituye a la última copia válida.
- **Almacenamiento fuera de PostgreSQL (#38).**
  - Puerto `BackupStorage` con adaptador `LocalDiskBackupStorage` para desarrollo, en `BACKUP_STORAGE_DIR`.
  - Escritura en `staging/` con `fsync` y `rename` atómico a `objects/<clave>`. Sólo se aceptan claves UUID v4.
- **Producción cerrada salvo admisión explícita** (revisión B1). Con `NODE_ENV=production` todas las rutas responden 503 `BACKUP_STORAGE_UNAVAILABLE`, salvo que se defina `BACKUP_PRODUCTION_ADMISSION=enabled`. Es la misma pauta que Sync v1 y la divulgación colectiva.
  - Esa admisión **no está autorizada**: `docker-compose.yml` la deja en `disabled`.
  - Fuera de producción, el servicio responde sólo si `BACKUP_STORAGE_DIR` está definido.
- **API `/api/v1/me/backups` (#39).**
  - El propietario sale de la sesión Auth V2 del agricultor: sesión, Member AGRICULTOR, cuenta, tenant y registro de cliente activos, revalidados en cada petición.
  - **Directiva y Administrador: 403.**
  - Una copia ajena, inexistente, eliminada o con id inválido devuelve **404 con el mismo cuerpo**.
  - `POST` en streaming:
    - El SHA-256 y el tamaño se recalculan mientras se recibe; si no coinciden, 422.
    - El tamaño se limita con `BACKUP_MAX_BYTES`: 413 por `Content-Length` o durante el flujo.
    - Un corte del cliente queda registrado como FAILED.
    - Cupo de copias en uso por Member: 409.
  - `GET` devuelve la lista.
  - `GET /:id/content` recalcula el SHA-256 del archivo almacenado **antes de enviar un solo byte**. Si no coincide, responde 500 `BACKUP_INTEGRITY_FAILED`. Si la copia se eliminó mientras tanto, 404.
  - `DELETE` hace un borrado lógico y elimina el archivo.
- **Sin parsers compartidos** (revisión B2). Un cuerpo de otro tipo dirigido a `/api/v1/me/backups` se responde con un **415 cerrado** antes de que corran los parsers JSON y urlencoded de Nest. No se lee, no se devuelve en eco y no se registra.
  - La guarda está registrada en `main.ts`, detrás de helmet, y en el arnés de pruebas.
  - Sin ella, la prueba con bytes crudos obtenía `400` con el mensaje del parser: `Bad control character in string literal in JSON at position 54`.
- **Backup ≠ Sync** (F06 §8, CURRENT_SCOPE §7). El módulo no importa Sync v1 ni el módulo colectivo, y ninguna ruta lee ni escribe sus tablas.

## Pruebas ejecutadas sobre `15c8cf4`

Con PostgreSQL 16 propio (`agro_c_bkp_pg`, 127.0.0.1:55443) y un directorio temporal real.

| Comando | Resultado |
|---|---|
| `npx jest src/modules/backups --testPathIgnorePatterns postgres` | **19 pasan.** Adaptador de disco: staging invisible, descarte, corte a mitad sin parcial con la copia previa intacta, claves que no son UUID, borrado idempotente y `mkdir` fallido que no se cachea. Servicio: medidor SHA-256 y límite, y 503 sin almacenamiento. Admisión: matriz de entornos. |
| `F08_BKP_PG_TEST_URL=<base desechable> npx jest backups.postgres.spec.ts --runInBand` | **21/21.** Ver la tabla siguiente. |
| `npm test -- --runInBand` | **212 pasan / 159 omitidas** (las suites PostgreSQL son opt-in). La base `063437d` daba 189 / 132. |
| Suites PostgreSQL de la CI, cada una con su base propia | auth-v2 12, current-auth-context 25, f02-final 3, sync-v1-journal 30, adversarial 41, references 7, f06-coll-05 15, product-reconciliation 5 y backups 21: **todas pasan**. |
| `npm run build`; `npx tsc --noEmit`; `npx eslint "src/modules/backups/**/*.ts" src/main.ts` | Sin errores. |
| `npm run openapi:check` | Snapshots coinciden; aserciones F02/F05/F06/F08 pasan. La API no cambia de superficie desde `0e03037`. |
| `prisma migrate diff --from-migrations … --to-schema-datamodel …` con base sombra (sobre `d631437`) | Diff vacío. |

Casos de `backups.postgres.spec.ts`:

| Caso | Resultado |
|---|---|
| **Subida con SHA verificado por el servidor** | 201. El archivo queda en `objects/<storageKey>` y `staging/` vacío. Las cabeceras de tenant, Member y nombre de archivo del cliente se ignoran. **Ninguna tabla** contiene el marcador incluido en los bytes, ni como texto ni en hex (bytea). |
| Aislamiento | Otro Member del tenant y otro tenant reciben lista vacía y un 404 idéntico al de un id inexistente o inválido, también al intentar borrar. |
| Directiva y Administrador | 403 en las cuatro rutas; ninguna fila a su nombre. |
| Sesión | Sin token o con token inválido: 401. Token V1, sesión revocada o sesión sin registro de cliente: 403. |
| **Guarda revalidada** (revisión B3) | Registro de cliente REVOKED, Member inactivo, cuenta inactiva y tenant inactivo: **403**. Sesión vencida y token vencido: **401**. Token con el tenant o el Member cambiados respecto de la sesión: **403**, sin afectar al Member cuyo id se tomó prestado. |
| SHA incorrecto | 422; no queda archivo; la fila queda FAILED `SHA256_MISMATCH`; la copia previa sigue disponible. |
| Tamaño | 413 por `Content-Length`. Con *chunked* sin longitud también 413, cortado por el medidor. No queda nada en disco. |
| Corte del cliente | FAILED `TRANSFER_INCOMPLETE`; sin bytes parciales. |
| **Cuerpo JSON, urlencoded o texto** (B2) | Se envían bytes crudos por `http.request`, con sesión y sin ella. Respuesta: `415 {"errorCode":"UNSUPPORTED_MEDIA_TYPE"}`, `no-store` y sin eco. No se crean filas ni archivos y los logs no contienen el marcador. |
| Peticiones mal formadas | SHA o versiones inválidas, o cuerpo vacío: 400, sin almacenar nada. |
| Cupo | 409 al superar el máximo; otro Member no se ve afectado; al borrar una copia se libera un hueco. |
| Borrado | 204; deja de listarse y de servirse; el archivo se elimina; un segundo borrado da 404. |
| Integridad almacenada | Archivo alterado o ausente: 500 `BACKUP_INTEGRITY_FAILED`, sin bytes. |
| Descarga que compite con un borrado | 404, no un fallo de integridad. |
| Fallo al marcar AVAILABLE tras confirmar el objeto | 500; el objeto se elimina y la fila queda FAILED `METADATA_UPDATE_FAILED`. |
| **Backup no toca Sync** | Antes de las pruebas se hace una publicación Sync v1 real. Las filas completas de journal, contribuciones, disputas, publicaciones colectivas y sus ítems, asociaciones, sync legacy y auditoría son **idénticas** antes y después. Los logs no contienen ids, claves, hashes, marcadores, el token ni la ruta de almacenamiento. |

### Prueba de mutación (regla 1)

```text
HEAD 15c8cf44dfb1cc759f5ae486159e28ad9054e131
mutación: en findOwnedAvailable, where { id, tenantId, memberId, status } -> where { id, status }
comando: F08_BKP_PG_TEST_URL=<base desechable> npx jest backups.postgres.spec.ts --runInBand
Tests:       1 failed, 20 passed, 21 total
  ● F08 private backups on PostgreSQL and disk › lists and serves only the owner's copies; another Member or tenant gets an indistinguishable 404
restaurado (git checkout del archivo): 0 cambios pendientes
```

### Comprobación previa contra la API compilada (regla 1)

- **Qué se ejecutó:** API `node dist/main.js` compilada desde **BE `15c8cf44dfb1cc759f5ae486159e28ad9054e131`** (`npm ci`, borrado de `*.tsbuildinfo`, `npm run build`, `npm run build:seed`), con `NODE_ENV=production`.
- **Script:** `tool/f08_bkp/api_preflight.cjs` de **MOB `2b3a0ce177da276894d71587f22fb3bee495c448`**, SHA-256 `3670d68cc05d69afb714936d2a4b5b4d3b4f9143b0702e4c2327f15f902ef7b6`.
- **Entorno efímero:** se cargó en una shell nueva con `tool/f08_bkp/env.sh`: PostgreSQL `agro_c_f08e2e_pg` (55446), 9 migraciones, seed sintético y contraseñas rotadas. Las sesiones Auth V2 eran reales y estaban ligadas a un registro de cliente.
- Comandos: `source ../f08_bkp/env.sh && source ./config.sh && source ./secrets.sh && ./up.sh` y luego `node ../f08_bkp/api_preflight.cjs http://127.0.0.1:3113`. Después se rearrancó la API **sin** `BACKUP_PRODUCTION_ADMISSION` y se ejecutó `node ../f08_bkp/api_preflight.cjs http://127.0.0.1:3113 --expect-closed`. Por último, `./down.sh`.

Salida:

```text
PASS lista inicial del titular: HTTP 200
PASS subida: HTTP 201, SHA-256 confirmado
PASS la copia aparece en la lista del titular
PASS descarga: HTTP 200, bytes y cabecera SHA-256 iguales
PASS otro agricultor: HTTP 404, igual que una copia inexistente
PASS otro agricultor no ve la copia en su lista
PASS Administrador: HTTP 403
PASS cuerpo application/json: HTTP 415, 415 cerrado sin eco
PASS cuerpo application/x-www-form-urlencoded: HTTP 415, 415 cerrado sin eco
PASS SHA-256 incorrecto: HTTP 422
PASS eliminación: HTTP 204; después HTTP 404
PASS almacenamiento: 0 objeto(s) para 0 copia(s) disponibles; staging vacío
Comprobación previa: todo PASS
api.log: errores=0 eco del marcador=0
PASS producción sin admisión: lista HTTP 503, subida HTTP 503
Producción cerrada: PASS
restos: contenedor=0, escucha en 3113=0, escucha en 3116=0
```

La admisión `enabled` se usó **sólo** en ese entorno desechable y sintético, igual que la admisión de Sync v1 en el arnés F03.

## Estado integrado con `main` `71460bf` (#116 y #115), merge `1f6806d`

| Comprobación | Resultado |
|---|---|
| `prisma validate`; `prisma migrate diff` (migraciones → schema) con base sombra | Válido; diff vacío. |
| `npm run openapi:generate` sobre el estado integrado; `npm run openapi:check` | Snapshots regenerados, no fusionados a mano. Frente a `main` sólo se añaden `/api/v1/me/backups` en `openapi-f02.json` y el subconjunto F08; F06 queda idéntico. Aserciones F02/F05/F06 (con propuestas)/F08 pasan. |
| `npm test -- --runInBand` | 218 pasan / 172 omitidas. |
| Suites PostgreSQL | auth-v2 12, current-auth-context 25, f02-final 3, sync-v1-journal 30 (10 migraciones, F08 en [9]), adversarial 41, references 7, f06-coll-05 15, product-reconciliation 5, **f07-web-proposal 12** (B, en `web.yml`) y backups 22: todas pasan. |
| Neutralización de `summaryCsv` (#115) | Conservada; `collective-config.spec.ts` «a name that starts like a formula is neutralized…» pasa dentro de `npm test`. |

## Limitaciones declaradas

- **Sin cifrado en reposo** en el servidor.
- **Sólo adaptador de disco de desarrollo.** No hay proveedor remoto: Backblaze B2 **no se probó ni se declara**. **No hay despliegue real**, y la producción queda cerrada.
- **Tiempo máximo de subida** (revisión B6). Node corta cada petición a los 300 s (`requestTimeout` por defecto), y no se modificó. Con el máximo por defecto de 100 MB, completar la subida exige unos **2,7 Mbit/s sostenidos**; un respaldo grande en una red rural lenta puede no caber.
  - Una subida cortada queda FAILED, no sustituye la copia anterior y no deja bytes.
  - El cliente móvil usa el mismo plazo total y aborta la petición al vencer.
  - Ajustar el límite por ruta, o reducir `BACKUP_MAX_BYTES` según los tamaños reales, queda para F10.
- **BKP-06 (#40) diferido a F10:** retención, purga y reconciliación de huérfanos. Casos de orfandad conocidos, en los que el objeto no es accesible por la API:
  - fallo al borrar el archivo tras el borrado lógico;
  - caída entre `commit` y la marca AVAILABLE.
- Una subida que siga UPLOADING más de una hora se considera abandonada cuando el mismo Member inicia otra.
- La guarda Auth V2 replica las reglas de `SyncV1AuthGuard`, con pruebas propias, en lugar de compartirlas. Unificarlas queda pendiente.
- La verificación previa a la descarga lee el archivo dos veces; el cliente vuelve a verificar el SHA-256.
- Quedan para F10, según la lista de la revisión:
  - fsync del directorio tras el rename;
  - CHECK en la base para los estados y el formato del hash;
  - un código cerrado propio para el 500 genérico.

## Archivos globales (integración en serie por A)

| Archivo | Cambio |
|---|---|
| `Back/prisma/schema.prisma` | Enum `BackupStatus`, modelo `BackupMetadata` y relaciones inversas en `Tenant` y `Member`. |
| `Back/prisma/migrations/20261016181000_f08_backup_metadata` | Migración nueva, posterior a `20261016162158_f07_joint_purchase_proposal` (B). Renombrada en el merge `1f6806d`. |
| `Back/src/app.module.ts` | `BackupsModule`. |
| `Back/src/main.ts` | `configureBackupsBodyGuard`, detrás de helmet y antes de los parsers de Nest. |
| `Back/src/config/env.schema.ts`, `Back/.env.example` | `BACKUP_STORAGE_DIR`, `BACKUP_MAX_BYTES`, `BACKUP_MAX_ACTIVE_PER_MEMBER` y `BACKUP_PRODUCTION_ADMISSION`, sin valores por defecto inseguros. |
| `docker-compose.yml` | Volumen `backup_data` y admisión en `disabled`. |
| `Back/scripts/openapi*.cjs`, `docs/api/openapi-f08-backups.json` | Subconjunto F08 y aserciones. |
| `.github/workflows/backend-f02.yml` | Paso `F08_BKP_PG_TEST_URL` (sólo se añade). |
| `Back/src/modules/sync-v1/test-support/sync-v1-test-app.ts` | Registra la misma guarda que `main.ts`. |
| `sync-v1-journal.postgres.spec.ts` | Número de migraciones. |
| `f06-coll-05-collective-aggregate.postgres.spec.ts` | `databaseBefore` y precondición de orden; revisado por A. |
| Dependencias | **Ninguna nueva**; los lockfiles no cambian. |

## Actualización 2026-10-19: retención (BKP-06, #40)

Las filas «Cupo» y «Fallo al marcar AVAILABLE…» de la tabla de pruebas, y el punto «BKP-06 (#40) diferido a F10» de las limitaciones, describen el estado de `15c8cf4`. Se conservan como registro.

Desde BE #148, el contrato del cupo cambia: con N copias, una subida da 201 y retira la más antigua. El fallo al marcar `AVAILABLE` deja la fila `FAILED` y purga sus bytes, como antes, ahora con `purgePending`.

La prueba «limits the copies in use per Member (409) and frees a slot on deletion» se sustituyó porque probaba el contrato anterior. Las pruebas nuevas, y la evidencia con su SHA y su fecha, están en `retention.backups.postgres.spec.ts` y en `docs/evidence/F08_BKP_06_RETENCION.md`.
