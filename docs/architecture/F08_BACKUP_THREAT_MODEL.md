# F08 — Modelo de amenaza del respaldo privado

**Fecha real de elaboración: 2026-10-16** (America/La_Paz), revisión del PR BE #114. Gate relacionado: GATE-F08 (#41), **Pending**.

**Trazabilidad:** RF-26, RF-27, RNF-04, RNF-10, DAT-14, CU-14 y CU-15.

## 0. Omisión original

[DEC-F01-10](F01_INTEGRATION_DECISIONS.md) pedía, **antes de implementar**:
- el modelo de amenaza;
- la decisión de proveedor;
- la integridad y la restauración de extremo a extremo.

**Ese orden no se respetó.** La API `/api/v1/me/backups` y el adaptador de disco se implementaron (`a6cf658`, 2026-10-16) sin un modelo de amenaza escrito ni una decisión de proveedor registrada. La revisión de la sesión A lo detectó.

Por decisión de Roderich Rendón (opción 2), este documento **completa la documentación después de implementar** y antes de integrar #114. No sustituye la verificación previa que pedía DEC-F01-10 ni la da por cumplida en su momento. DEC-F01-10 **no se modifica**.

## 1. Datos protegidos

| Dato | Dónde vive | Sensibilidad |
|---|---|---|
| Contenedor `.agrobackup`: la base SQLite completa del agricultor y las fotografías de factura | Binario en el almacenamiento privado, `BACKUP_STORAGE_DIR/objects/<storageKey>`; en tránsito, el cuerpo HTTP | **Alta.** Contiene compras, personas y familiares, liquidaciones, proveedores, precios, fotos e identificadores locales (CURRENT_SCOPE §10). |
| Metadatos (`BackupMetadata`) | PostgreSQL | Media. Revelan quién tiene copias, cuándo y de qué tamaño; no el contenido. |
| Credenciales de sesión Auth V2 | Almacén cifrado del teléfono; access token en memoria | Alta. Dan acceso a las copias del titular. |

## 2. Límites de confianza

1. **Teléfono ↔ API.** Red no confiable. La protección es TLS en un despliegue (no hay despliegue real). En el ensayo se usa un túnel HTTPS temporal.
2. **API ↔ PostgreSQL.** Sólo metadatos.
3. **API ↔ almacenamiento privado.** Disco local del servidor. **Quien administre el sistema operativo** del servidor (o tenga acceso al volumen o a sus copias) está **dentro** de este límite y puede leer los archivos.
4. **Roles de la aplicación.** Directiva y Administrador son usuarios de la API, no operadores del servidor.

## 3. Amenazas, controles, pruebas y riesgo residual

| # | Amenaza | Controles existentes | Pruebas que los respaldan | Riesgo residual |
|---|---|---|---|---|
| T1 | **Otra cuenta o tenant** lista, descarga o borra una copia ajena, o intenta subir con un owner forjado | El propietario sale sólo de la sesión Auth V2, revalidada en cada petición: sesión, Member AGRICULTOR, cuenta, tenant y registro de cliente activos. Las consultas se filtran por tenant y Member. Una copia ajena, inexistente o con id inválido recibe un 404 idéntico. Directiva y Administrador reciben 403. Las cabeceras y la ruta del cliente nunca amplían el alcance. | `backups.postgres.spec.ts`: «lists and serves only the owner's copies; another Member or tenant gets an indistinguishable 404», «Directiva and Administrador of the same tenant have no access to private copies» y «uploads with SHA-256 verified by the server…», que comprueba las cabeceras ignoradas. Mutación sobre `15c8cf4`: quitar el filtro por Member hace fallar la prueba de aislamiento (`docs/evidence/F08_BACKUP.md`). | Bajo dentro de la API. **El 403 a Directiva y Administrador no protege frente al operador del servidor** (T3). |
| T2 | **Robo de credenciales:** token o refresh robado o dispositivo comprometido | Access token de vida corta. Se revalidan en cada petición la sesión, el registro de cliente, la cuenta, el Member y el tenant. Revocar uno corta el acceso: 401 o 403. Ante un 401 o 403 el móvil descarta el acceso en memoria. | `backups.postgres.spec.ts`: «requires a live Auth V2 mobile session» y el bloque «Auth V2 context is revalidated on every request», que cubre registro REVOKED, Member, cuenta o tenant inactivos, sesión o token vencidos y tenant o Member del token distintos. Mobile `remote_backup_client_test.dart`: «un 401 o 403 descarta el acceso en memoria; un 404 no». | **Medio.** Mientras la sesión robada siga activa, el atacante puede descargar las copias del titular. No hay segundo factor ni cifrado del lado del cliente. |
| T3 | **Exposición de archivos:** administrador del SO, volumen, copias del disco o un error de permisos | Los binarios están fuera de PostgreSQL, en una carpeta propia. Ficheros con modo 0600 y directorios 0700 (donde el SO aplica permisos POSIX). Las claves son UUID del servidor, sin nombres del cliente. No hay binarios en logs ni en la base. En producción el servicio está **cerrado** salvo `BACKUP_PRODUCTION_ADMISSION=enabled`, que no está autorizado. | `backups.postgres.spec.ts`: «uploads with SHA-256 verified by the server; the binary is on disk under a server key, never in PostgreSQL», que busca el marcador como texto y en hex en todas las tablas, y «no backup operation touched Sync v1, collective or audit tables, and nothing sensitive was logged». `backups.service.spec.ts`: «BackupsConfig production admission». Comprobación previa: «producción sin admisión: lista HTTP 503, subida HTTP 503». | **Alto si se admitieran datos reales hoy.** **No hay cifrado en reposo**: el administrador del sistema operativo, o quien acceda al volumen o a sus copias, **puede leer los respaldos**. Por eso la producción sigue cerrada. |
| T4 | **Alteración** de la copia en el servidor o en tránsito | El servidor recalcula el SHA-256 en streaming al recibir y lo coteja con el declarado (422). Antes de servir recalcula el del archivo almacenado (500 si no coincide). El cliente coteja la cabecera, el tamaño y el SHA-256 con los metadatos y, además, valida el contenedor por dentro (SHA-256 de la base y de cada foto contra el manifiesto). | `backups.postgres.spec.ts`: «rejects a SHA-256 mismatch with 422…» y «does not deliver a stored copy that no longer matches its SHA-256». Mobile: «bytes alterados con la cabecera correcta…», «contenedor alterado por dentro con hash exterior coherente…» y `backup_restore_sha256_test.dart` «una base alterada con SQL válido se rechaza al validar». | **SHA-256 verifica la integridad respecto de una referencia confiable**: el hash que registró el servidor y el manifiesto interno. **No da confidencialidad.** Frente a un **servidor comprometido**, que puede reemplazar a la vez la copia y su metadato, **no protege por sí solo**. La validación interna sólo detecta un cambio si el manifiesto no se reescribió de forma coherente. No hay firma. |
| T5 | **Descarga o subida incompleta:** corte, aborto o servidor caído | Servidor: staging, fsync del archivo y rename atómico (el fsync del directorio tras el rename está diferido a F10, `F08_BACKUP.md`); un corte deja FAILED sin bytes; un intento fallido no sustituye la copia disponible. Cliente: escribe `.part` y renombra sólo tras cotejar tamaño y hash. Plazo por inactividad y tope proporcional al tamaño; aborto real. Una restauración sólo empieza con la copia completa y validada, con exclusión de escrituras y rollback. | `backups.postgres.spec.ts`: «a transfer cut by the client is recorded as FAILED and leaves no partial bytes». `local-disk-backup-storage.spec.ts`: «a source that fails mid-transfer leaves no partial file and keeps the previous object». Mobile: «corte a mitad de la descarga: no queda parcial», «una descarga detenida se aborta por inactividad…» y las regresiones de rollback de `f04_restore_authorization_test.dart`. | Bajo. Las caídas entre el commit del objeto y su marca AVAILABLE dejan huérfanos inaccesibles (T6, BKP-06). |
| T6 | **Agotamiento del almacenamiento** | `BACKUP_MAX_BYTES` (413 por `Content-Length` o durante el flujo). Cupo de copias en uso por Member (409). Una subida abandonada se marca FAILED y se limpia su staging. Requiere un agricultor autenticado. Límite global de peticiones (throttler). | `backups.postgres.spec.ts`: «enforces the size limit with 413, whether declared or streamed, leaving nothing» y «limits the copies in use per Member (409) and frees a slot on deletion». | **Medio.** No hay cupo global por tenant ni por disco. Los objetos huérfanos y las filas FAILED no se purgan: **BKP-06, diferido a F10**. Muchos agricultores con el máximo de copias pueden llenar el disco. |
| T7 | **Fuga por logs o por eco del cuerpo** | Errores con cuerpo cerrado `{errorCode}` y sin eco. Guarda que impide que los parsers compartidos lean el cuerpo (415). Logs sin ids, claves, hashes ni contenido. | `backups.postgres.spec.ts`: «a body sent as JSON or urlencoded is never parsed, echoed or logged: closed 415» y la comprobación de logs de la última prueba. Comprobación previa contra la API compilada: «415 cerrado sin eco», con 0 apariciones del marcador en `api.log`. | Bajo. |
| T8 | **Mezcla con Sync o con la proyección colectiva** | Módulo separado, que no importa Sync v1 ni el colectivo. Restaurar pausa la outbox (RESTORE_PAUSED) y sólo el titular verificado la libera. | `backups.postgres.spec.ts`: «no backup operation touched Sync v1…» (filas completas antes y después). Mobile: «la cola restaurada queda pausada antes de que nadie vea la base, y no se envía al abrir la app». | Bajo. |

## 4. Decisión de almacenamiento

- **Adaptador de disco local (`LocalDiskBackupStorage`): sólo para desarrollo y pruebas.**
- **Proveedor productivo pendiente.** Puede ser un almacenamiento de objetos o un volumen gestionado. Están pendientes la integración externa, sus credenciales y sus costos. **No se probó ni se declara Backblaze B2 ni otro proveedor.**
- Sin despliegue real. La admisión productiva sigue cerrada: `BACKUP_PRODUCTION_ADMISSION` no está autorizado y `docker-compose.yml` lo fija en `disabled`.

> **Actualización del 2026-10-19 (F08-BKP-07, BE #147).** Esta nota no reescribe el texto anterior, que describe el estado a la fecha de elaboración.
> - **Proveedor elegido:** Roderich eligió **Backblaze B2 por su API S3**, el 2026-10-19.
> - **Adaptador:** `S3BackupStorage`, que se activa sólo con `BACKUP_STORAGE_PROVIDER=b2`. El disco sigue siendo el valor por defecto.
> - **Qué está probado:** sólo en host, contra un **doble S3 en memoria**, que **no es B2**.
> - **Pendiente:** el ensayo contra B2 real, a la espera de una clave restringida al prefijo `ensayo-f08/`.
> - **SSE-B2** (cifrado del proveedor) se solicita en cada escritura, pero **no cumple la condición 2 del §5**: B2 descifra para quien tenga la clave, y no protege de T3.
> - **La admisión productiva sigue cerrada.** Las condiciones 2 a 8 del §5 no cambian.

> **Actualización del 2026-10-19, ensayo real (18:03–18:37Z, `docs/evidence/F08_BKP_07_B2_ENSAYO_REAL.md`).** Sobre `main` `f0b55ee` y Mobile `463d3ec`, con datos sintéticos bajo `ensayo-f08/`: subida simple y multipart, descarga por la API y por S3 con el mismo SHA-256, aislamiento (404/403/404/401), 422, subida cortada sin pérdida, 409 por concurrencia, rotación 5 + 1 y borrado del propietario con 0 versiones físicas restantes, restauración en instalación limpia sin publicar y liberación sin duplicados. Los objetos comprobados devolvieron `ServerSideEncryption: AES256`. **La condición 2 del §5 sigue sin cumplirse**, y la clave usada no es de mínimo privilegio (desviación aceptada por Roderich para el ensayo). La admisión de datos reales sigue cerrada.

## 5. Condiciones antes de admitir datos reales

Ninguna se cumple hoy. Todas son necesarias:

1. Decisión de proveedor productivo registrada, con la ubicación de los datos, los costos y quién lo administra.
2. **Cifrado en reposo**: del proveedor, del volumen o del lado del cliente. Para que el operador del servidor no pueda leer los respaldos hace falta cifrado del lado del cliente con clave del agricultor, que es la única opción que protege de T3 y de parte de T4.
3. TLS de extremo a extremo en el despliegue real, sin túneles de prueba.
4. **Retención, purga y reconciliación de huérfanos (BKP-06, #40)**, con su período aprobado (R_BACKUP_F08 de F06 §7).
5. Cupo global y alertas de capacidad del almacenamiento.
6. Copias de seguridad del propio almacenamiento y procedimiento de restauración del servidor.
7. Revisión de seguridad en F10 (#45) y decisión explícita de Roderich para habilitar `BACKUP_PRODUCTION_ADMISSION`.
8. E2E en dispositivo superado (MOB #36).

## 6. Lo que no se difiere

BKP-06 se difiere a F10 **sólo** para retención, purga y reconciliación de huérfanos. **No se difieren** la integridad, el aislamiento, la exclusión de escrituras ni la recuperación segura ante fallos, que están implementados y probados (T1, T4, T5, T8).

## 7. Actualización 2026-10-19: retención (BKP-06, #40)

El texto anterior se conserva como registro de F08. Desde BE #148 (diseño: [F08_BKP_06_RETENCION.md](F08_BKP_06_RETENCION.md)):

- **T6.** El cupo ya no rechaza con 409. Se conservan las N copias verificadas más recientes de cada Member (N = `BACKUP_MAX_ACTIVE_PER_MEMBER`, 5 por defecto). La más antigua se retira en la misma transacción que deja `AVAILABLE` a la nueva, nunca antes. Cada Member tiene como mucho una subida en curso (409 `BACKUP_UPLOAD_IN_PROGRESS`), y sus objetos con bytes nunca pasan de N + 1: `AVAILABLE` + `UPLOADING` + purgas pendientes (503 si no queda hueco). Los bytes de copias retiradas, borradas o fallidas se purgan y se reconcilian (`purgePending`). Pruebas: `retention.backups.postgres.spec.ts`.
- **Sigue igual:**
  - no hay cupo global por tenant ni por disco (condición 5 del §5);
  - la política de 5 copias es una decisión técnica para la entrega académica, no el período institucional de la condición 4 del §5, que decide Roderich;
  - la producción sigue cerrada.

## 8. Actualización 2026-10-23: cifrado en el teléfono (F08-ADR-003)

El texto anterior se conserva como registro. Diseño: Mobile `docs/adr/F08-ADR-003-respaldo-cifrado-y-previo.md`, revisado por B (LISTO sobre el texto) y por A (interfaces). Decisión de Roderich del 2026-10-23.

- **Qué cambia:**
  - el teléfono cifra el contenedor antes de subirlo (formato 2: ChaCha20-Poly1305 de RFC 8439 en streaming, con una clave por archivo derivada por HKDF-SHA256 de una clave de recuperación aleatoria de 256 bits del agricultor, biblioteca `cryptography` 2.9.0);
  - la clave no sale del teléfono: ni el servidor, ni B2, ni la Directiva, ni el operador la tienen; no hay escrow ni recuperación central;
  - SSE-B2 se mantiene como protección adicional y, por sí sola, no excluye al operador.
- **Qué comprueba ahora el Backend** (`backup-format.ts`):
  - `formatVersion` ∈ {1, 2}; cualquier otro, 422 `BACKUP_FORMAT_INVALID` antes de leer el cuerpo;
  - en el formato 2, la forma exterior (magic, versión, algoritmo, flags y longitud exacta), con 422 `BACKUP_FORMAT_INVALID` y sin bytes guardados;
  - en el formato 1, sólo que no lleve el magic del 2;
  - el SHA-256 de transporte, que en el formato 2 es de los bytes cifrados.
  - **No afirma** haber comprobado el contenido descifrado: no puede. Lo valida el teléfono después de descifrar y antes de sustituir la base.
- **Efecto en las amenazas:**
  - **T3:** con el formato 2, quien administra el almacenamiento o el volumen ya no puede leer las copias. Las copias del formato 1, sin cifrar, siguen legibles hasta que se retiren.
  - **T2:** una sesión robada permite descargar ciphertext, pero no descifrarlo sin la clave.
  - **T4:** un servidor comprometido ya no puede fabricar una copia que pase la etiqueta sin la clave. Sí puede borrarlas o retenerlas: disponibilidad.
- **Condición 2 del §5:** cumplida **en el diseño y en las pruebas sintéticas del host**, con dos límites:
  - no está ensayada contra B2 real ni en el dispositivo;
  - las subidas del formato 1 siguen admitidas por defecto para el entorno sintético y la herramienta de #160.
- **Se añade como condición previa a datos reales** (enmienda del §5): `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true`, que rechaza el formato 1 con 422 `BACKUP_ENCRYPTION_REQUIRED`. No es una admisión: la admisión productiva sigue cerrada y las demás condiciones no cambian.
- **Riesgo nuevo, aceptado:** perder a la vez el teléfono y la clave anotada hace irrecuperables las copias cifradas.

## 9. Actualización 2026-10-24: existencia y visibilidad en B2 por listado (#151)

El texto anterior se conserva como registro. En el ensayo de #151 del 2026-10-24 (`docs/evidence/F08_BKP_08_B2_REAL_FORMATO2.md`), **en ese entorno B2 y con las claves temporales de mínimo privilegio**, se observaron dos comportamientos. No se afirma que ocurran en todas las configuraciones de B2:

- **H1:** `HeadObject` y `GetObject` de un nombre inexistente respondieron 403, no 404. El commit del adaptador, que decidía con ese 404 si el nombre final estaba libre, no podía completar ninguna copia.
- **H2:** al paginar `ListObjectVersions`, B2 marcó `IsLatest` en la primera entrada de cada nombre en cada página, aunque fuera una versión antigua.

Cambios en `S3BackupStorage` (Roderich eligió el 2026-10-24 corregir el adaptador sin ampliar los permisos):

- **Existencia por listado.** El commit comprueba el nombre final con `ListObjectVersions`, con ese nombre como prefijo, dentro del bucket y del prefijo autorizados. Sólo cuenta la **igualdad exacta**: otro nombre que empiece igual no prueba nada. Cualquier versión o marcador del nombre exacto cuenta como existente, y entonces no se copia nada.
- **Falla cerrado.** Un 403, una página inválida, un listado estancado o un listado que llega al límite de páginas lanzan un error. Nunca se interpretan como «no existe» ni como «no queda nada». No se amplían permisos ni hay alternativa a disco.
- **No es una reserva atómica.** Entre el listado y la copia, otro escritor del mismo nombre no se detectaría. La unicidad sigue descansando, como antes, en las claves UUID que genera el servidor para cada copia y en una sola subida en curso por Member (§7). El listado es una comprobación, igual que lo era el `HEAD`.
- **Visibilidad sin fiarse sólo de `IsLatest`.** El inventario de versiones para purgar (todas las versiones y marcadores, por id de versión) se separa de qué entrada es la vigente. La vigente de cada nombre es la marcada en la primera página donde aparece ese nombre, y las marcas de páginas posteriores se ignoran. Hay incoherencia, y el inventario falla cerrado, cuando ninguna o más de una entrada cumple esa condición, cuando una entrada se repite o cuando otra entrada es más reciente por fecha. Nunca se elige una versión comparando ids como texto, ni se resucita un objeto oculto por un marcador. Las purgas ya no consultan `IsLatest`.
- **Incompleto no es completo.** Si un listado llega al límite de trabajo (`listPages`) o al plazo, el inventario termina con error y no se presenta como completo.

**Pruebas:** `s3-backup-storage.spec.ts`, en el bloque «#151: what B2 answered…». El doble imita los dos comportamientos (`quirks.missingAs403`, `quirks.latestPerPage`) y los casos de páginas de 1, 2, 3, 4 y 1 000 entradas dan el mismo resultado lógico. Además, el contrato del almacenamiento se ejecuta con `latestPerPage` y páginas de 1. Con el adaptador anterior, 21 de los casos nuevos fallan. El doble **no es B2**. La repetición contra B2 real tiene su propia evidencia.
