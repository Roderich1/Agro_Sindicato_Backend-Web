# F08 — Respaldo privado en el Backend (#37, #38, #39)

**Origen:** Live. **Verificado:** 2026-10-16 (America/La_Paz). La implementación y las pruebas son de esta fecha; no hay trabajo retro-fechado.

**Trazabilidad:** RF-26, RF-27, RNF-04, DAT-14, CU-14 y CU-15. Gate relacionado: GATE-F08 (#41), que sigue **Pending**.

## Commits

| Commit | Contenido |
|---|---|
| `a6cf658` | Módulo `backups`, modelo y migración, adaptador de disco, API, pruebas, subconjunto OpenAPI y paso de CI. |
| `0e03037` | Snapshots OpenAPI regenerados en la rama. Al integrar se regeneran desde `main` integrado. |
| `d631437` | Merge de `main` `3616fcf` (#112). Resuelve en serie las migraciones y ajusta la prueba de migración de F07-POL-01. |
| `9b0a2ba` | Precondición de orden en esa prueba: la migración de cantidades no estaba aplicada antes del deploy. |

Base de la rama: `063437d3ebe7f10110a5faaeee3f052e7d89d100`. Después se integró `main` en `3616fcf`.

## Qué se implementó

- **Metadatos (#37).** El modelo `BackupMetadata` (migración `20261016161400_f08_backup_metadata`) guarda:
  - Propietario: `tenantId` y `memberId` de la sesión.
  - Estado: `UPLOADING`, `AVAILABLE`, `FAILED` o `DELETED`.
  - `storageKey`: UUID generado por el servidor; nunca un nombre de archivo del cliente.
  - Tamaño medido por el servidor y SHA-256.
  - Compatibilidad declarada: versión del contenedor y del esquema SQLite.
  - `failureCode` cerrado y fechas.

  Sólo las copias `AVAILABLE` se listan o se sirven. Un intento fallido no sustituye a la última copia válida.
- **Almacenamiento fuera de PostgreSQL (#38).**
  - Puerto `BackupStorage` con adaptador `LocalDiskBackupStorage` para desarrollo, en `BACKUP_STORAGE_DIR`, sobre un volumen `backup_data` en `docker-compose.yml`.
  - Escritura en `staging/` con `fsync` y `rename` atómico a `objects/<clave>`. Las claves aceptadas son sólo UUID v4.
  - Sin `BACKUP_STORAGE_DIR`, las rutas responden 503.
- **API `/api/v1/me/backups` (#39).**
  - El propietario sale de la sesión Auth V2 del agricultor: sesión, Member AGRICULTOR, tenant y registro de cliente activos, revalidados en cada petición.
  - **Directiva y Administrador: 403.** Su rol no da acceso a copias privadas, ni propias ni ajenas.
  - Una copia ajena, inexistente, eliminada o con id inválido devuelve **404 con el mismo cuerpo**.
  - `POST` en streaming:
    - El SHA-256 y el tamaño se recalculan mientras se recibe; si no coinciden, 422.
    - El tamaño se limita con `BACKUP_MAX_BYTES`: 413 por `Content-Length` o durante el flujo.
    - Un corte del cliente queda registrado como FAILED.
    - Cupo de copias en uso por Member (`BACKUP_MAX_ACTIVE_PER_MEMBER`): 409.
  - `GET` devuelve la lista.
  - `GET /:id/content` **recalcula el SHA-256 del archivo almacenado antes de enviar un solo byte**. Si no coincide o falta, responde 500 `BACKUP_INTEGRITY_FAILED` y no lo entrega como válido.
  - `DELETE` hace un borrado lógico y elimina el archivo.
  - Los errores llevan un cuerpo cerrado `{ errorCode }` y `Cache-Control: no-store`, sin eco de la petición.
- **Separación de Sync (F06 §8, CURRENT_SCOPE §7).**
  - El módulo no importa Sync v1 ni el módulo colectivo.
  - Ninguna ruta lee ni escribe sus tablas.

## Pruebas ejecutadas

Todas sobre la rama en `9b0a2ba`, con PostgreSQL 16 propio (`agro_c_bkp_pg`, 127.0.0.1:55443) y un directorio temporal real.

| Comando | Resultado |
|---|---|
| `npx jest src/modules/backups` | 12 pasan: adaptador de disco (staging invisible, descarte, corte a mitad sin parcial con la copia previa intacta, claves que no son UUID rechazadas, borrado idempotente) y servicio (medidor SHA-256 y límite; 503 sin almacenamiento sin tocar PostgreSQL). |
| `F08_BKP_PG_TEST_URL=… npx jest backups.postgres.spec.ts --runInBand` | **12/12.** Ver la tabla siguiente. |
| `npm test -- --runInBand` | 205 pasan, 150 omitidas (las suites PostgreSQL son opt-in). La base `063437d` daba 189 / 132. |
| Suites PostgreSQL del CI con bases propias | auth-v2 12, current-auth-context 25, f02-final 3, sync-v1-journal 30, adversarial 41, references 7, f06-coll-05 15, product-reconciliation 5 y backups 12: **todas pasan**. |
| `npm run build`, `npx tsc --noEmit`, `npx eslint src/modules/backups` | Sin errores. |
| `prisma validate`; `prisma migrate diff --from-migrations … --to-schema-datamodel …` con base sombra | Válido; diff vacío tras el merge. |
| `npm run openapi:check` | Snapshots coinciden; aserciones F02/F05/F06/F08 pasan. |

Casos de `backups.postgres.spec.ts`:

| Caso | Resultado |
|---|---|
| **Subida con SHA verificado por el servidor** | 201. El archivo queda en `objects/<storageKey>` y `staging/` vacío. Las cabeceras `X-Tenant-Id`, `X-Member-Id` y `Content-Disposition` del cliente se ignoran. **Ninguna tabla de PostgreSQL** contiene el marcador incluido en los bytes: búsqueda `row_to_json` en todas las tablas. |
| Aislamiento | El titular lista y descarga su copia. Otro Member del tenant y otro tenant reciben **lista vacía y 404 idéntico** al de un id inexistente o inválido, también al intentar borrar. La copia sigue AVAILABLE. |
| Directiva y Administrador | 403 en lista, descarga, subida y borrado; ninguna fila a su nombre. |
| Sesión | Sin token o token inválido: 401. Token V1, sesión revocada o sesión sin registro de cliente: 403. |
| SHA incorrecto | 422; no queda archivo; la fila queda FAILED `SHA256_MISMATCH`; la copia previa se sigue listando y sirviendo. |
| Tamaño | 413 por `Content-Length`. Con *chunked* sin longitud también 413, cortado por el medidor. No queda nada en disco. |
| Corte del cliente a mitad | FAILED `TRANSFER_INCOMPLETE`; sin bytes parciales. |
| Peticiones mal formadas | 415 si el tipo no es binario. 400 por SHA, versiones o cuerpo vacío. No se almacena nada. |
| Cupo | 409 al superar el máximo; otro Member no se ve afectado; al borrar una copia se libera un hueco. |
| Borrado | 204: deja de listarse y servirse; el archivo se elimina; un segundo borrado da 404; la otra copia queda intacta. |
| Integridad almacenada | Archivo alterado en disco: 500 `BACKUP_INTEGRITY_FAILED`, sin cuerpo binario ni cabecera de hash. Archivo ausente: igual. |
| **Backup no toca Sync** | Antes de las pruebas se hace una publicación Sync v1 real. Las filas completas de journal, contribuciones, disputas, publicaciones colectivas y sus ítems, asociaciones, sync legacy y auditoría son **idénticas** antes y después de todas las operaciones de backup. Los logs no contienen ids, claves, hashes, marcadores, token ni ruta de almacenamiento. |

**Prueba de mutación.** Al quitar el filtro por Member en la búsqueda de una copia, la prueba de aislamiento falla. Después se restauró el código.

## Comprobación previa contra la API compilada

Se hizo el 2026-10-16, con `tool/f08_bkp/api_preflight.cjs` de la rama Mobile.

- **Entorno:** API `node dist/main.js`, `NODE_ENV=production`, compilada desde esta rama. Usa el `main.ts` real (helmet y parsers), que la suite Jest no ejerce. El entorno era efímero: `agro_c_f08e2e_pg` y la API en 3113, con sesiones Auth V2 reales ligadas a un registro de cliente.
- **Resultado:** PASS en lista, subida con SHA-256 confirmado, descarga íntegra con cabecera, 404 indistinguible para otro agricultor, 403 para el Administrador, 422 por SHA incorrecto, borrado 204 y luego 404, y almacenamiento sin objetos huérfanos ni staging.
- **Cierre:** el entorno se eliminó después (`down.sh`), sin restos en contenedores ni puertos.

## Limitaciones declaradas

- **Sin cifrado en reposo** en el servidor. El transporte va con TLS en el despliegue; en el ensayo, mediante el túnel.
- **Sólo adaptador de disco de desarrollo.** No hay proveedor remoto (Backblaze B2 u otro): **no se probó ni se declara**. **No hay despliegue real.**
- **BKP-06 (#40) diferido a F10**: retención, purga y reconciliación de huérfanos. Los casos que quedan como orfandad conocida:
  - un fallo al borrar el archivo tras el borrado lógico;
  - una caída entre `commit` y la marca AVAILABLE.

  En ambos casos el objeto no es accesible por la API.
- Una subida que siga UPLOADING más de una hora se considera abandonada cuando el mismo Member inicia otra.
- La guardia Auth V2 replica las reglas de `SyncV1AuthGuard` en lugar de compartirlas: evita tocar el módulo Sync en este bloque. Unificarlas queda pendiente.
- La comprobación de integridad previa a la descarga lee el archivo dos veces. Entre la lectura de verificación y el envío hay una ventana; el cliente vuelve a verificar el SHA-256.

## Archivos globales (integración en serie por A)

| Archivo | Cambio |
|---|---|
| `Back/prisma/schema.prisma` | Enum `BackupStatus`, modelo `BackupMetadata` y relaciones inversas en `Tenant` y `Member`. |
| `Back/prisma/migrations/20261016161400_f08_backup_metadata` | Migración nueva, posterior a `20261016150500`. |
| `Back/src/app.module.ts` | `BackupsModule`. |
| `Back/src/config/env.schema.ts`, `Back/.env.example` | `BACKUP_STORAGE_DIR`, `BACKUP_MAX_BYTES` y `BACKUP_MAX_ACTIVE_PER_MEMBER`, sin valores por defecto inseguros. |
| `docker-compose.yml` | Volumen `backup_data`. |
| `Back/scripts/openapi*.cjs`, `docs/api/openapi-f08-backups.json` | Subconjunto F08 y aserciones. |
| `.github/workflows/backend-f02.yml` | Paso `F08_BKP_PG_TEST_URL` (sólo se añade). |
| `sync-v1-journal.postgres.spec.ts` | 9 migraciones. |
| `f06-coll-05-collective-aggregate.postgres.spec.ts` | `databaseBefore` excluye la migración de cantidades y las posteriores, más una precondición de orden. Revisado por A. |
| Dependencias | **Ninguna nueva**; los lockfiles no cambian. |
