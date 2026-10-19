# F08-BKP-07 — Adaptador Backblaze B2 por API S3: pruebas en host

- **Fecha real:** 2026-10-19 (UTC). Sesión B. Diseño y PR: BE #147. Refs #38, #40.
- **Base:** Backend `main` `23ffaa2`. **Código probado:** `4e17470`, en la rama `feat/f08-b2-storage`.
- **Dispositivo:** ninguno. Todo es HOST: Windows 11 y Node v25.9.0 en local; el CI usa Node 22.
- **B2 real: no se ejecutó nada.** Ni el comprobador de claves, ni ninguna petición. Todas las pruebas de almacenamiento S3 usan un **doble S3 en memoria** (`test-support/in-memory-s3.ts`). **No es Backblaze B2 y no prueba el comportamiento del proveedor**: sólo la lógica del adaptador frente a la semántica S3 que da por supuesta.

## 1. Qué se implementó

| Pieza | Archivo |
|---|---|
| Adaptador `S3BackupStorage` | `Back/src/modules/backups/infrastructure/s3-backup-storage.ts` |
| Selección `BACKUP_STORAGE_PROVIDER=disk\|b2` (con `b2` incompleto, 503 y nunca el disco) | `backups.module.ts`, `application/backups-config.ts` |
| Variables `BACKUP_S3_*` y `BACKUP_UPLOAD_DEADLINE_MS` (30 min, menor que 60 min) | `src/config/env.schema.ts`, `.env.example` |
| Campos opcionales de versión en `StoredBackupFile` (el disco no los rellena) | `domain/backup-storage.port.ts` |
| Inventario: misma selección; por ahora ignora las entradas ocultas (#148 las clasificará) | `cli/backups-inventory.ts`, `application/backup-inventory.ts` |
| Dependencia `@aws-sdk/client-s3` **3.1144.0** (exacta, del 2026-09-30) | `Back/package.json` |

El diseño, con las decisiones acordadas con C (R-a a R-d) y la decisión de A sobre el plazo, está en la descripción de BE #147.

## 2. Comandos y salida (local)

**PostgreSQL desechable** propio de la sesión: `postgres:16-alpine` en `127.0.0.1:55437`, con autenticación `trust` y sin contraseña. Cada suite crea su propia base aislada.

| Hora (UTC) | Comando (en `Back/`) | Salida resumida |
|---|---|---|
| 15:09:20–15:09:32 | `npx jest src/modules/backups src/config` | `Test Suites: 3 skipped, 6 passed` · `Tests: 37 skipped, 105 passed, 142 total` (las omitidas son las de PostgreSQL, opt-in) |
| 15:09:32–15:10:15 | `F08_BKP_PG_TEST_URL=postgresql://postgres@127.0.0.1:55437/postgres npx jest backups.postgres.spec.ts --runInBand` | `Test Suites: 3 passed` · `Tests: 37 passed, 37 total`. Incluye `backups.postgres.spec.ts` y `inventory.backups.postgres.spec.ts`, sin cambios, y `b2-storage.backups.postgres.spec.ts`, nueva, con 8 casos |
| — | `npx tsc --noEmit -p tsconfig.json` y `npm run build` | Sin errores |
| — | `node dist/modules/backups/cli/backups-inventory.js`, con `BACKUP_STORAGE_PROVIDER=b2` y sólo `BACKUP_S3_PREFIX` | `Faltan en el entorno: BACKUP_S3_ENDPOINT, BACKUP_S3_REGION, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY.` · `exit=2`. Sólo nombres, sin red |

La suite completa se ejecuta en el CI del PR (`backend-f02.yml`: `npm test` y, con PostgreSQL, `npx jest backups.postgres.spec.ts`, cuyo patrón incluye el archivo nuevo).

## 3. Qué cubre cada archivo

- **`test-support/backup-storage.contract.ts`**: el mismo contrato para el disco (`local-disk-backup-storage.spec.ts`) y para S3 sobre el doble (`s3-backup-storage.spec.ts`), con 8 casos:
  - invisible hasta el commit;
  - **copia de 1 MiB (S1)**: ida y vuelta, y borrado;
  - `discard` sin restos;
  - un corte que conserva la copia anterior;
  - sólo claves UUID, sin escribir nada;
  - `remove` y `discardStaged` idempotentes, sin tocar el staging ajeno;
  - doble commit rechazado;
  - inventario.
- **`s3-backup-storage.spec.ts`**, casos propios de S3:
  - todo bajo el prefijo, con `agro-sha256` y `agro-size` y `CopyObject` con la versión fijada;
  - bordes de tamaño: 1 MiB, 8 MiB, 8 MiB + 1 y 20 MiB;
  - `Content-MD5` en cada petición;
  - el doble rechaza una parte no final menor de 5 000 000 bytes y un multipart de una sola parte;
  - un 413 del medidor a mitad de una parte;
  - un corte con una parte en curso: `stage` sólo termina sin peticiones pendientes;
  - `BadDigest`;
  - commit ambiguo resuelto por `HeadObject`;
  - copia fallida;
  - copia reintentada, que termina en una sola versión;
  - final existente, que nunca se sobrescribe;
  - purga del staging fallida dentro de `commit` (R-c);
  - `remove` paginado, sólo del nombre exacto y siempre con `VersionId`;
  - nueva lista que todavía ve una versión;
  - `discardStaged` con un multipart abierto;
  - `list()` con versiones ocultas, marcadores y subidas incompletas;
  - `open` de una clave ausente u oculta;
  - un 403 en todas las operaciones;
  - topes con llamadas colgadas;
  - cuerpo vacío.
- **`application/backups-storage-selection.spec.ts`**:
  - selección `disk` y `b2`;
  - `b2` sin cada una de las seis variables: 503 en la ruta, nada en el directorio de disco, sólo el nombre en el log;
  - la admisión productiva cierra los dos proveedores;
  - plazo de subida: valor por defecto, valores válidos y rechazos;
  - formato de las variables S3;
  - un secreto mal formado se rechaza sin su valor en el error;
  - CLI.
- **`b2-storage.backups.postgres.spec.ts`**: servicio y API reales sobre PostgreSQL, con el adaptador S3 sobre el doble:
  - subida con SHA-256 y una sola versión;
  - 422;
  - corte del cliente;
  - 403 del proveedor, que da 503;
  - copia fallida, que da 503;
  - objeto desaparecido, que da 500 de integridad;
  - borrado que purga todas las versiones;
  - logs sin el bucket, el prefijo, la clave ni el contenido.

  El directorio de disco configurado queda vacío.

## 4. Mutaciones (2026-10-19, 15:10:28–15:12:40 UTC, sobre `4e17470`; cada una revertida con `git checkout`)

Comando de cada una: `npx jest src/modules/backups`.

| Mutación | Resultado |
|---|---|
| M1. `DeleteObject` sin `VersionId` | 24 fallan |
| M2. `commit` sin purgar el staging | 8 fallan |
| M3. Purga sin comprobar con una nueva lista | 1 falla |
| M4. Umbral `>=` (multipart con 8 MiB exactos) | 1 falla |
| M5. `discardStaged` sin abortar los multipart | 1 falla |
| M6. `commit` sin dejar una sola versión del final | 1 falla |
| M7. `stage` relanza el error de la llamada en vez del de la fuente | **0 fallan** |
| M8. `b2` incompleto cae al disco | 6 fallan |
| M9. `call()` no traduce el aborto a su causa | 1 falla |

**M7 sobrevive porque es una defensa redundante.** `call()` ya convierte el `AbortError` de una llamada abortada en la causa del aborto, que es el propio error de la fuente, y M9 muestra que esa traducción sí está cubierta. Se conserva `sourceError ?? error` como segunda barrera. Ninguna prueba la distingue por separado.

## 5. Límites que se declaran

- **Sin B2 real.** Quedan por confirmar en el ensayo, con la clave restringida a `ensayo-f08/` y sólo mediante `con_b2.ps1`:
  - `CopyObject` con `?versionId=` y `MetadataDirective=REPLACE`;
  - `Content-MD5` en `PutObject` y en `UploadPart`;
  - SSE-B2 (`ServerSideEncryption: AES256`);
  - `ListObjectVersions` y `ListMultipartUploads` con una clave limitada al prefijo;
  - `DeleteObject` con `VersionId` bajo `deleteFiles`;
  - el comportamiento de los checksums `WHEN_REQUIRED` del SDK.
- **El doble no es B2.** Es más estricto que S3 en un punto (multipart de al menos dos partes) y puede no reproducir rarezas reales del proveedor.
- **El aborto del SDK real** se modela como un `AbortError` genérico. El tope de cada llamada se aplica con señales propias, no con `AbortSignal.timeout`.
- **Inventario:** en este PR ignora las versiones ocultas, los marcadores y los multipart incompletos. Su clasificación (`hiddenVersion`, `incompleteUpload`) llega con la retención de #148.
- **SSE-B2 no es cifrado del lado del cliente.** No cumple la condición 2 del §5 de `F08_BACKUP_THREAT_MODEL.md`, y la admisión productiva sigue cerrada.
- **Sin cifrado del lado del cliente, sin despliegue y sin retención aplicada:** eso es #148 y queda fuera de este PR.

## 6. Corrección del quality gate de SonarCloud (2026-10-19)

Sobre `fa4d941`, el quality gate del PR estaba en ERROR por dos calificaciones nuevas. La de fiabilidad (`new_reliability_rating`) se debía a tres S2871. La de seguridad (`new_security_rating`) se debía a tres S4790.

**S2871 (`sort()` sin función de comparación).** Se usa `byCode`, que ordena por unidad de código: es determinista y no depende del locale, a diferencia de `localeCompare`. Se aplicó:
- en `backup-storage.contract.ts` y en `in-memory-s3.ts`, que son los dos avisos;
- también en los demás `sort` de los archivos nuevos de este PR: los dos specs del adaptador y el orden de las subidas del doble.

**S4790 (MD5).** Es el `Content-MD5` que exige el protocolo S3 como comprobación de transporte del cuerpo, más el ETag de una parte en el doble. No es un uso criptográfico: la integridad de la copia la da el SHA-256. Se marcó con `// NOSONAR` y la justificación en la misma línea. **No se cambió ni se quitó el algoritmo**, porque B2 lo usa para validar el cuerpo.

**S3776 (complejidad).** El mapeo de cada página de `ListObjectVersions` pasa a `versionsOfPage()`, sin cambiar el comportamiento.

**Ejecución local sobre el árbol corregido** (en `Back/`):

| Hora (UTC) | Comando | Salida resumida |
|---|---|---|
| 15:19:00 | `npx tsc --noEmit -p tsconfig.json` | Sin errores |
| 15:19:00–15:19:20 | `npx jest src/modules/backups src/config` | 105 pasan, 37 se omiten (las PG, opt-in), 142 en total |
| 15:19:20–15:20:06 | `F08_BKP_PG_TEST_URL=… npx jest backups.postgres.spec.ts --runInBand` | 37/37 |

El estado del gate tras el push consta en el PR.
