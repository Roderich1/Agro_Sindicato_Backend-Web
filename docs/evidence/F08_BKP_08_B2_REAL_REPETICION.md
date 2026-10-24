# F08-BKP-08 (#151 §A, ítems 1–6): repetición contra Backblaze B2 real con el adaptador corregido (H1, H2)

| Campo | Valor |
|---|---|
| Fecha real | 2026-10-24, de 13:47 a 13:55 (America/La_Paz, -04:00); 17:47–17:55 UTC |
| Origen | Ejecución nueva, con fecha, código y subcarpeta propios. **No reemplaza** a la primera ejecución (`F08_BKP_08_B2_REAL_FORMATO2.md`, `de1ec93`), que se conserva tal cual, con sus FAIL, los bloqueados y el NO_CONCLUYENTE |
| Quién ejecutó | Sesión C, con el turno de A, tras el LISTO de A y de B y con la CI de #160, #163 y #164 en verde (A). La corrección del adaptador sin ampliar permisos (opción b) es decisión de Roderich, que trasladó A |
| Código | Rama local de ensayo `test/f08-b151-repeticion`, **`62f4fe7`**: #163 `353ad31` (adaptador corregido) + #160 `1c35562` (herramienta). Los informes registran `62f4fe7` sin cambios locales |
| Destino | Backblaze B2 real, bucket `agro-backups-roderich`, endpoint `s3.us-east-005`, raíz `ensayo-f08/b151-20261024/` |
| Claves | `b151-rw` (listFiles, readFiles, writeFiles, deleteFiles), `b151-ro` (listFiles, readFiles) y `b151-nodel` (listFiles, readFiles, writeFiles), con `namePrefix` `ensayo-f08/b151-20261024/`. Comprobadas antes de tocar B2 (§1). Caducan el 2026-10-27 a las 11:13 (-04:00). **La clave amplia no se usó**. Siguen sin revocar |
| Secretos | Inyectados por `con_b2.ps1` sólo en el proceso de cada paso o sonda. Nada por argv. Los informes salen saneados, y una búsqueda de nombres de campo de clave y de formatos de clave B2 no encontró nada en `f08_b151_f2/4-rep-t1350/` |
| PostgreSQL | Contenedor desechable nuevo `agro_c_rep_pg` (127.0.0.1:55474, datos en tmpfs). Cada suite creó y borró su base. El contenedor se eliminó al terminar |
| Datos | Sintéticos. Ítem 6 en **formato 2**: sobres con la cabecera exterior de F08-ADR-003 sobre bytes aleatorios, con `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true` |
| Informes | `docs/evidence/f08_b151_f2/4-rep-t1350/`: informes de B2, `ejecucion.txt`, `doble/`, `sondas/` (salidas y los dos scripts, lanzados con `con_b2.ps1 -Ruta b151-<perfil>.clixml node <script> <corte o ro>` y `BACKUP_S3_PREFIX` en la subcarpeta de cada sonda) e `inventario-final/` |

**Alcance de H1 y H2.** Son comportamientos **observados en este entorno B2, con estas claves de mínimo privilegio** (primera ejecución y esta). No se afirma que ocurran en todas las configuraciones de B2.

## 0. Resultado

**H1 queda resuelto en el adaptador, y H2 en el inventario del adaptador.** Contra B2 real:
- toda copia llega a AVAILABLE por el adaptador y por la API;
- el formato 2 queda guardado byte a byte con SSE `AES256`;
- C2, C5 y T-R5 se miden completos, con la variante de la rotación;
- T-R5a pasa **por la causa prevista**.

**Siguen dos FAIL de B2 real, tal cual:**
- **3a (MaxKeys=1)** mide el `IsLatest` crudo del proveedor: B2 sigue marcando la primera entrada de cada página (H2 persiste en el proveedor). Es lo esperado. El adaptador ya no depende de esa marca: 3a-bis y 3c pasan.
- **5b**: tras cortar el origen, queda 1 multipart sin terminar al acabar `stage` (§3).

**Hay además un NO_CONCLUYENTE: 1-ro multipart.** El error del proveedor llega enmascarado como `AbortError` (§3, H3).

**#151 §A no queda cumplido entero** por 5b y por el NO_CONCLUYENTE. Las decisiones están en §5. No se cierra #151 ni cambia ningún gate.

## 1. Antes de tocar B2

- **Metadatos en claro de los perfiles** (`Import-Clixml`, sin tocar los `SecureString`): los tres con bucket `agro-backups-roderich`, prefijo `ensayo-f08/b151-20261024/`, las capacidades esperadas, guardados el 2026-10-24T15:13:24Z y con caducidad el 2026-10-27 a las 11:13 -04:00. Quedaban 69,4 h.
- **`comprobar_b2.ps1` por perfil** (`b2_authorize_account`, sin imprimir claves ni token): claves válidas; bucket permitido `agro-backups-roderich`; capacidades `writeFiles, readFiles, listFiles, deleteFiles` (rw), `listFiles, readFiles` (ro) y `listFiles, readFiles, writeFiles` (nodel); prefijo permitido `ensayo-f08/b151-20261024/`; endpoint `s3.us-east-005` igual al guardado.
- Además, la herramienta vuelve a comprobar capacidades, bucket y `namePrefix` antes de cada paso.

## 2. Ejecuciones (todas declaradas, en orden)

| # | Hora (UTC) | Subcarpeta | Clave | Qué |
|---|---|---|---|---|
| — | 17:48:51 | `c-rep-20261024t1350-n1/sonda-n1/` | rw | **Sonda n1** (nota de B): forma de las respuestas de los tres listados (§3.1). 0 restantes |
| — | 17:49:33–46 | ninguna (doble S3) | — | Herramienta contra el **doble** en `62f4fe7`, con el PG desechable y formato 2 (§4) |
| R | 17:50:04–17:52:40 | `c-rep-20261024t1350/` | por paso | **Repetición**: `b151_ejecutar.ps1 -Subcarpeta c-rep-20261024t1350 -Raiz ensayo-f08/b151-20261024/ -Formato 2 -ConC6 -Limpiar`, con `F08_BKP_PG_TEST_URL` apuntando al PG desechable. 9 pasos: 8 sin fallos y `casos2a5` con 2 FAIL. `limpiar`: 0 restantes |
| — | 17:54:28 | `c-rep-20261024t1350-corte/` | rw | **Sonda del corte** (diagnóstico de 5b, §3.2). 0 restantes |
| — | 17:54:42 | `c-rep-20261024t1350-ro/` | ro | **Sonda ro multipart** (diagnóstico del NO_CONCLUYENTE, §3.3). No escribió nada |
| — | 17:55:21–27 | las cuatro anteriores | rw | **Inventario final** de sólo lectura: 0 versiones, 0 marcadores y 0 multipart en cada una (`inventario-final/`) |

Antes del `limpiar` de R había 1 versión y 1 marcador en `c1-oculto/`, 3 versiones en `c1/` y 5 en `c6-nodel/`, donde la clave sin `deleteFiles` no pudo purgar. No había ninguna multipart. No se tocó nada fuera de estas subcarpetas: ni las ejecuciones anteriores, ni el ensayo de #149 en `ensayo-f08/`.

## 3. Resultados contra B2 real (ejecución R, `62f4fe7`, `c-rep-20261024t1350/`)

| Ítem #151 | Caso | Primera ejecución | Repetición | Observado en la repetición |
|---|---|---|---|---|
| 1 | `preparar` (rw): copia de referencia por el adaptador | FAIL (H1) | **PASS** | 1 entrada, SSE `AES256`, `agro-sha256` igual |
| 1 | `caso1` ro: 5 escrituras y borrados en crudo rechazados, `stage` simple rechazado, copia intacta, nada cambió | no ejecutado | **PASS (8)** | |
| 1 | `caso1` ro: `stage` multipart (> 8 MiB) | no ejecutado | **NO_CONCLUYENTE** | Falla, pero con `AbortError` «The operation was aborted» en lugar del 403 del proveedor (H3, §3.3) |
| 1 | `caso1` nodel: borrado por `versionId` en crudo, `remove` y `discardStaged`, rechazados; `stage` aceptado y commit con error cerrado al purgar el staging; copia intacta | no ejecutado | **PASS (6)** | Cada rechazo es 403 `AccessDenied` «not entitled», y el commit deja 2 restos para `limpiar`. El `DeleteObject` **sin** `versionId` sobre un objeto de prueba propio lo admite B2 con `writeFiles` como «ocultar»: 1 marcador y la versión conservada. El caso prevé las dos respuestas y registra cuál |
| 2 | 2a–2d: Content-MD5 incorrecto en crudo y por el adaptador; c2/ limpio | PASS (5) | **PASS (5)** | 400 `BadDigest`; en 2d el adaptador aborta el multipart, 0 restos, y el error que devuelve es `AbortError` (H3) |
| 3 | 3a `ListObjectVersions` crudo, `MaxKeys=1` | FAIL (H2) | **FAIL (H2 del proveedor)** | 4 páginas de 1, sin estancarse. La unión difiere de la lista completa sólo en `IsLatest`: 4 marcas frente a 2 |
| 3 | 3a-bis `MaxKeys=1`: la unión sin `IsLatest` | (no existía) | **PASS** | Las mismas 4 entradas, sin duplicados ni faltantes |
| 3 | 3a y 3a-bis con `MaxKeys=2` | PASS | **PASS (2)** | |
| 3 | 3b `ListMultipartUploads` con `MaxUploads=1` | PASS | **PASS** | |
| 3 | 3c `list()` del adaptador con páginas de 1 | FAIL (H2) | **PASS** | 4 objetos, 1 marcador, **1 sola visible y es la última versión escrita de A**, 2 multipart; 3 y 1 páginas truncadas |
| 3 | 3d purgas del adaptador con la misma paginación | PASS | **PASS** | |
| 4 | 4a y 4b `CopyObject` en crudo con y sin `versionId` | PASS (2) | **PASS (2)** | |
| 4 | 4c commit del adaptador con una versión más reciente de un tercero en el staging | FAIL (H1) | **PASS** | Copia la versión fijada (X), no la del tercero; 1 versión final; staging purgado; c4/ limpio |
| 5 | 5a multipart de 9 MiB observado con `ListParts` y completado | FAIL (H1) | **PASS** | 1 parte de 8 388 608 B y luego 2 (8 388 608 + 1 048 576); ETag = MD5 de cada parte; 0 pendientes; SHA-256 final igual |
| 5 | 5b multipart cortado tras la primera parte | FAIL (H1) | **FAIL** | `stage` falla con el error del origen, pero no hubo ninguna `UploadPart` observada y **queda 1 multipart sin terminar**; staging sin versiones. La limpieza de c5/ (5) lo deja en 0. Causa probable en §3.2 |
| 6 | C2a y C2b (rw): borrado del propietario durante el commit y durante la transacción | FAIL (H1) | **PASS (2)** | 204 y 201; 3 AVAILABLE; 0 versiones de la borrada |
| 6 | C5a, C5b y C5c (rw) | C5a PASS; C5b FAIL; C5c no ejecutado | **PASS (3)** | C5b: 201, FAILED ABANDONED, sin purga pendiente, 0 staging |
| 6 | Formato 2 (rw): B2 guarda la copia cifrada tal como llegó | FAIL (H1) | **PASS** | 201 AVAILABLE, `formatVersion` 2, cabecera `AGROENC`, 608 B enviados = 608 B en B2, mismo SHA-256, SSE `AES256`, descarga idéntica |
| 6 | Formato 2 (rw): una subida en formato 1 se rechaza | no ejecutado | **PASS** | 422 `BACKUP_ENCRYPTION_REQUIRED`, 0 filas y 0 entradas nuevas en B2 |
| 6 | rw: en B2 sólo quedan los objetos de copias AVAILABLE | PASS | **PASS** | |
| 6 | T-R5 (nodel) preparación | PASS | **PASS** | |
| 6 | **T-R5a**: subida con el proveedor que rechaza borrados | NO_CONCLUYENTE (causa H1) | **PASS por la causa prevista** | 503 `BACKUP_STORAGE_UNAVAILABLE`; FAILED `STORAGE_COMMIT_FAILED` con purga pendiente; 0 retiradas; 3 listadas e íntegras. **Causa**: la copia al nombre final se hizo y el primer fallo es `DeleteObject` sobre `staging`, 403 `AccessDenied` «not entitled» |
| 6 | T-R5b, T-R5c y T-R5d | PASS (3) | **PASS (3)** | T-R5c: 204, DELETED OWNER pendiente, descarga 404, 1 versión en B2, otras intactas. T-R5d: `pending` OWNER 1 y FAILED 1, `confirmed` 0, `failed` 2 |
| 6 | T-R5r-a: la rotación con el borrado de la retirada enviado con nodel | FAIL (H1) | **PASS** | 201; retirada DELETED RETENTION con purga pendiente; 1 borrado enviado con nodel y rechazado con 403 «not entitled», sólo de la retirada; 1 versión de la retirada; 3 listadas e intactas |
| 6 | T-R5r-b y T-R5r-c: la cota rechaza; con deleteFiles otra vez, la siguiente subida reconcilia | no ejecutado | **PASS (2)** | |
| — | Inventario y `limpiar` (rw) | PASS | **PASS** | 0 restantes; inventario final de las 4 subcarpetas en 0/0/0 |

Total contra B2 real: **53 casos, con 50 PASS, 2 FAIL (3a con MaxKeys=1 y 5b) y 1 NO_CONCLUYENTE (1-ro multipart)**. Las cuentas salen de los informes JSON de la ejecución R.

### 3.1 Sonda n1 (nota de B): forma de las respuestas (`sondas/sonda_n1.json`)

Con 3 versiones, 1 marcador, 2 multipart y 2 partes:
- `IsTruncated` llegó **booleano en todas las páginas** de `ListObjectVersions` (sin límite y `MaxKeys=1`: 4 páginas), `ListMultipartUploads` (`MaxUploads=1`: 2 páginas) y `ListParts` (`MaxParts=1`: 2 páginas);
- `Initiated`, `LastModified`, `Size` y `VersionId` llegaron válidos;
- en la última página de `ListParts`, B2 devuelve `NextPartNumberMarker` aunque `IsTruncated` sea `false`. El adaptador sólo lo lee si la página está truncada.

Por tanto, en este entorno las comprobaciones de `353ad31` no fallan cerrado por la forma de las respuestas.

### 3.2 5b: diagnóstico del multipart restante (`sondas/sonda_corte.json`)

La sonda repite el corte con una traza de cada llamada del adaptador. El origen falla a los 743 ms, mientras `CreateMultipartUpload` está en vuelo (741–750 ms). El adaptador aborta esa petición, como debe tras un corte del origen, y nunca recibe el `UploadId`. Por eso su limpieza inmediata no puede abortar la multipart.

En la sonda, B2 no llegó a crearla: 0 al acabar `stage`, 0 a los 10 s, `discardStaged` correcto y 0. En 5b, en cambio, se observó 1 multipart y ninguna parte, lo que es coherente con que B2 sí la creara antes de recibir el aborto. **No se ha demostrado**: es la causa probable.

El diseño ya prevé este resto: `stage` limpia «best effort», y el servicio llama después a `discardStaged`, que lista las multipart del nombre y las aborta. El inventario de F10 las informa como `incompleteUpload`. 5b exige más: 0 restos justo al terminar `stage`. Se deja como FAIL.

### 3.3 H3 (nuevo): el error del proveedor enmascarado por el del origen (`sondas/sonda_ro.json`)

Con la clave ro, `CreateMultipartUpload` responde **403 `AccessDenied` «not entitled»**. Al salir del bucle de lectura, el origen se destruye y emite `AbortError` (`ABORT_ERR`) a los 1 155 ms. `stage` lo registra como error del origen y lo devuelve con prioridad sobre el del proveedor.

Esto **falla cerrado**: no queda nada y nada parece un éxito. Pero se pierde la causa: el 403 o el `BadDigest` de 2d llegan como `AbortError`. Es código anterior a H1 y H2 (F08-BKP-07); el doble no lo reproduce. **No se ha cambiado**; se propone en §5.

## 4. Herramienta contra el doble S3 (`62f4fe7`, `doble/`)

El doble **no es B2** y no acredita #151; valida la herramienta. Resultados:
- ítems 1–5: 36 PASS, 0 FAIL;
- ítem 6 con PG y formato 2: rw 8 PASS, nodel 5 PASS y rotación 3 PASS.

## 5. Lo que esta evidencia no acredita, y decisiones pendientes

- **5b sigue en FAIL.** Si se quiere 0 multipart al terminar `stage`, una opción es que `cleanupStaging`, sin `UploadId`, liste las multipart del nombre de staging y las aborte. Es un cambio de código con revisión; no se hizo. Sin él, el resto depende de `discardStaged` y del inventario de F10.
- **H3, 1-ro multipart, queda NO_CONCLUYENTE.** La corrección sería que `stage` ignore el error que emite el origen al destruirlo él mismo tras un fallo del proveedor. También es un cambio de código con revisión; no se hizo.
- **H2 sigue en el proveedor** (3a). El adaptador ya no depende de esa marca, y lo prueban 3a-bis y 3c contra B2.
- No es una prueba con una copia cifrada por el teléfono: los sobres son sintéticos y tienen la forma que vería el servidor.
- Un solo entorno B2 y unas claves concretas: no se generaliza a otras configuraciones.
- Las claves **no se revocaron**: lo hace Roderich con `revocar_claves_b151.ps1`, y su caducidad no cuenta como revocación.
- No cierra #151 ni cambia gates.
