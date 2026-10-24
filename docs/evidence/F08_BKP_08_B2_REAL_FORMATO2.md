# F08-BKP-08 (#151 §A, ítems 1–6): ensayo contra Backblaze B2 real con el formato 2 y las claves temporales `b151-*`

| Campo | Valor |
|---|---|
| Fecha real | 2026-10-24, de 11:29 a 11:37 (America/La_Paz, -04:00); 15:29–15:37 UTC |
| Origen | Ejecución nueva (no reconstruida). No reutiliza resultados del ensayo de #149 ni del doble S3 |
| Quién ejecutó | Sesión C, con turno de A. Roderich creó las claves (`crear_claves_b151.ps1`, 2026-10-24 11:13 -04:00) y A comprobó sus metadatos sin descifrarlas |
| Código | Rama local `test/f08-b151-formato2`: merge de #160 (`78840e7`) sobre `feat/f08-respaldo-cifrado-be` (`9255f2c`, F07 + F08) en `50096c0`, más `cf6b4d7` y `71ac088` (herramienta, §2) |
| Destino | Backblaze B2 real, bucket `agro-backups-roderich`, endpoint `s3.us-east-005`, raíz `ensayo-f08/b151-20261024/` |
| Claves | `b151-rw` (listFiles, readFiles, writeFiles, deleteFiles), `b151-ro` (listFiles, readFiles) y `b151-nodel` (listFiles, readFiles, writeFiles). Las tres con `namePrefix` `ensayo-f08/b151-20261024/`, comprobadas contra `b2_authorize_account` antes de cada paso. Caducan el 2026-10-27 a las 11:13 (-04:00). **La clave amplia `backblaze-b2.clixml` no se usó** |
| Secretos | Inyectados por `con_b2.ps1` sólo en el proceso de cada paso. Nada por argv. Los informes salen saneados por la herramienta, y se comprobó que no contienen campos de clave |
| PostgreSQL | Contenedor desechable propio `agro_c_cif_pg` (127.0.0.1:55473). Cada suite creó su base aislada, y todas se borraron al terminar |
| Datos | Sintéticos. Ítem 6 en **formato 2**: sobres con la cabecera exterior de F08-ADR-003 sobre bytes aleatorios, con `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true` |
| Informes | `docs/evidence/f08_b151_f2/` (JSON y texto de la herramienta, los logs de las ejecuciones y las dos sondas) |

## 0. Resultado

**#151 §A no queda cumplido.** Aparecieron dos hallazgos del proveedor que deciden el resultado:

- **H1 (bloqueante).** Con las claves de mínimo privilegio y `namePrefix`, B2 contesta **403** a `HeadObject` y a `GetObject` de un nombre que no existe: `UnknownError` en el HEAD, que no tiene cuerpo, y `AccessDenied: Cannot access bucket` en el GET. S3 devolvería 404.
  - El commit del adaptador (`S3BackupStorage.commitStaged`) empieza con un `HEAD` del nombre final y sólo continúa si recibe un 404.
  - Por eso, **con estas claves ninguna copia puede llegar a AVAILABLE**: toda subida por la API da 503 y toda confirmación del adaptador falla.
  - Lo demuestran una sonda mínima (§3.1) y los ítems 1, 4c, 5 y 6.
- **H2.** En `ListObjectVersions` con `MaxKeys=1`, B2 marca `IsLatest=true` en la primera entrada de cada página, aunque sea una versión antigua.
  - Las entradas son las mismas en las dos listas; sólo cambia la bandera (§3.2).
  - El inventario del adaptador (`list()`) clasifica entonces como visibles versiones antiguas, si sus versiones caen a los dos lados de un corte de página.
  - Las purgas, que borran por `versionId`, no se ven afectadas (3d PASS).

Lo que sí queda medido en B2 real:
- el rechazo de un Content-MD5 incorrecto (`BadDigest`, ítem 2);
- la paginación de `ListMultipartUploads` y de las purgas (ítem 3, salvo H2);
- `CopyObject` con el `versionId` fijado frente a una versión más reciente, en crudo (4a y 4b);
- con la clave sin `deleteFiles`, el borrado del propietario y la reconciliación quedan pendientes sin perder ninguna copia válida (T-R5c y T-R5d).

**El formato 2 contra B2 real no queda demostrado:** su subida por la API también da 503 por H1.

## 1. Ejecuciones (todas declaradas, en orden)

| # | Hora (UTC) | Subcarpeta | Código | Qué pasó |
|---|---|---|---|---|
| 0 | 15:29 | `c-f2-20261024t1130/` | `cf6b4d7` | `b151_ejecutar.ps1` no arrancó: en Windows PowerShell 5.1 `$PSScriptRoot` llega vacío al valor por defecto de `-ConB2`. **No se tocó B2.** Defecto corregido en `71ac088` |
| 1 | 15:30–15:31 | `c-f2-20261024t1130/` | `cf6b4d7` | Primera ejecución real, con `-ConB2` explícito. `preparar` y `casos2a5` abortaron sin escribir su informe, por un defecto de la herramienta: sus PASS y FAIL sólo constan en `1-t1130/ejecucion.txt`. El ítem 6 no arrancó (`ZodError` de `BACKUP_S3_PREFIX`, un defecto de la herramienta). `limpiar`: 0 restantes |
| — | 15:33 | `c-f2-20261024t1130/sonda/` | sonda | Sonda del commit (§3.1). 0 restantes |
| 2 | 15:34 | `zz/` | `cf6b4d7` + 3 cambios locales | **Ejecución no prevista**: C quería comprobar sólo cómo el script resolvía la ruta y lanzó la secuencia sin `-ConC6` ni `-Limpiar`. Está dentro de la raíz autorizada y usa las claves b151. El proceso se cortó al cerrarse la tubería durante `casos2a5`, que no tiene informe. El inventario encontró 1 multipart sin terminar; `limpiar` y otro inventario lo dejaron en 0 entradas y 0 multipart |
| 3 | 15:35–15:37 | `c-f2-20261024t1140/` | `71ac088` (sin cambios locales) | **Ejecución de referencia** (§2), completa y con todos los informes. `limpiar`: 0 restantes |
| — | 15:37 | `c-f2-20261024t1140/sonda-paginas/` | sonda | Sonda de la paginación (§3.2). 0 restantes |

Cada subcarpeta quedó vacía según su último `limpiar` o la limpieza de la sonda. Antes del `limpiar` de la ejecución 3 había restos de casos abortados: 4 versiones en `c4/` y 4 en `c6-nodel/`, donde la clave sin `deleteFiles` no pudo purgar. No se tocó nada fuera de estas subcarpetas, ni el ensayo de #149 en `ensayo-f08/`.

## 2. Resultados de la ejecución de referencia (3, `71ac088`, `c-f2-20261024t1140/`)

Comando, con las claves inyectadas por paso:
`b151_ejecutar.ps1 -Subcarpeta c-f2-20261024t1140 -Raiz ensayo-f08/b151-20261024/ -Formato 2 -ConC6 -Limpiar`, con `F08_BKP_PG_TEST_URL` apuntando al PG desechable.

| Ítem #151 | Caso | Veredicto | Observado |
|---|---|---|---|
| 1 | `preparar` (rw): copia de referencia por el adaptador | **FAIL** | 403 `UnknownError` en el `HEAD` previo al commit (H1) |
| 1 | `caso1` con ro y con nodel | **FAIL (no ejecutado)** | Falta la copia de referencia (0 entradas): el rechazo de permisos de ro y nodel no se pudo medir |
| 2 | 2a–2d: Content-MD5 incorrecto en crudo y por el adaptador (simple y multipart); c2/ limpio | PASS (5) | B2 rechaza con 400 `BadDigest` (en 2d el adaptador aborta el multipart y devuelve `AbortError`); 0 restos |
| 3 | 3a `ListObjectVersions` con `MaxKeys=1` | **FAIL** | 4 páginas de 1 con `IsTruncated` y marcadores `Next*`, sin estancarse. La unión no coincide con la lista completa por `IsLatest` (H2) |
| 3 | 3a con `MaxKeys=2` | PASS | |
| 3 | 3b `ListMultipartUploads` con `MaxUploads=1` | PASS | |
| 3 | 3c `list()` del adaptador con páginas de 1 | **FAIL** | 4 objetos, 1 marcador y 2 multipart, con 3 y 1 páginas truncadas; la cuenta de visibles no es 1 (H2) |
| 3 | 3d purgas del adaptador con la misma paginación | PASS | |
| 4 | 4a `CopyObject` en crudo con el `versionId` fijado y REPLACE; 4b control sin `versionId` | PASS (2) | Fijar el `versionId` decide qué versión se copia |
| 4 | 4c commit del adaptador con una versión más reciente de un tercero | **FAIL** | `caso4` abortado: 403 `AccessDenied: Cannot access bucket` (H1) |
| 5 | `UploadPart` observado con `ListParts`, completado y abortado | **FAIL** | `caso5` abortado: 403 `UnknownError` (H1) |
| 6 | C2 (rw) | **FAIL** | La preparación da `setup upload HTTP 503` (H1) |
| 6 | C5a (rw): una fila UPLOADING reciente no se cierra | PASS | |
| 6 | C5b (rw): la fila abandonada se cierra y su staging se purga | **FAIL** | La fila FAILED ABANDONED, sin purga pendiente y con 0 staging, es correcta; pero la subida siguiente da 503 en lugar de 201 (H1). C5c no se llegó a ejecutar |
| 6 | Formato 2 (rw): B2 guarda la copia cifrada byte a byte; el formato 1 se rechaza | **FAIL** | La subida da 503 y el `GetObject` del objeto final da 403 `Cannot access bucket` (H1). El rechazo del formato 1 no se llegó a ejecutar |
| 6 | rw: en B2 sólo quedan los objetos de copias AVAILABLE | PASS | |
| 6 | T-R5 (nodel), preparación: 3 copias válidas escritas en crudo y descargables por la API | PASS | |
| 6 | T-R5a: una subida con el proveedor que rechaza borrados | **NO_CONCLUYENTE** (la herramienta lo da como PASS) | Da 503, FAILED con purga pendiente y las 3 copias intactas, como se esperaba, pero el código es `STORAGE_COMMIT_FAILED`: la subida falló en el commit por H1, no por el rechazo de un borrado |
| 6 | T-R5b: con N AVAILABLE + 1 purga pendiente, la cota rechaza la siguiente | PASS | 503, sin filas ni entradas nuevas en B2. La purga pendiente viene de T-R5a |
| 6 | T-R5c: borrado del propietario con un proveedor que rechaza borrados | PASS | 204, DELETED OWNER con purga pendiente, descarga 404; la versión sigue en B2 y las otras dos copias, intactas |
| 6 | T-R5d: la reconciliación con esta clave no confirma nada | PASS | `pending` OWNER 1 y FAILED 1, `confirmed` 0, `failed` 2 |
| 6 | T-R5, variante de la rotación (rw + nodel) | **FAIL** | La preparación da `setup upload HTTP 503` (H1); la rotación no llegó a ocurrir |
| — | Inventario y `limpiar` (rw) | PASS | 0 restantes |

C2, C5 y T-R5 de la rotación quedan **sin medir contra B2**, porque H1 lo impide. La cota con borrados rechazados sólo queda medida en parte (T-R5b–d).

## 3. Sondas de diagnóstico (rw, en una subcarpeta propia que se borró después)

### 3.1 H1: el commit del adaptador frente a la clave restringida (`sondas/sonda_commit.json`)

| Llamada | Resultado |
|---|---|
| `HeadObject` de un nombre inexistente | **403**, `UnknownError` (sin cuerpo) |
| `GetObject` de un nombre inexistente | **403** `AccessDenied`, «Cannot access bucket» |
| `PutObject` con SSE AES256 | 200 |
| `HeadObject` del objeto existente | 200 |
| `CopyObject` con `versionId`, REPLACE y SSE AES256 | 200 |
| `CopyObject` con `versionId` y REPLACE, sin SSE | 200 |

Escribir, leer lo que existe y copiar sí funciona. Lo único que falla es la respuesta para un nombre inexistente, que el adaptador necesita que sea 404.

**No se sabe todavía por qué B2 contesta así.** No se cambió nada para comprobarlo. Hay dos caminos, y los dos requieren una decisión:
- crear claves con alguna capacidad más, que sería una decisión de Roderich, y volver a medir;
- cambiar el adaptador para no depender de ese 404. Tratar el 403 como «no existe» ocultaría errores de permisos reales, así que no se hace sin revisión.

### 3.2 H2: `IsLatest` al paginar (`sondas/sonda_paginas.json`)

Se crearon A, con 2 versiones, y B, con 1 versión y un marcador encima, como en 3a.

| Lista | Entradas (nombre, final del `versionId`, marcador, `IsLatest`) |
|---|---|
| Sin límite | a …0110 v **latest**; a …9506 v; b …0993 v; b …1326 marcador **latest** |
| `MaxKeys=1`, página 1 | a …0110 v **latest** |
| página 2 | a …9506 v **latest** ← en la lista completa no es la última |
| página 3 | b …1326 marcador **latest** |
| página 4 | b …0993 v **latest** ← en la lista completa no es la última |

## 4. Cambios en la herramienta (rama local, sin push)

- **`cf6b4d7`:**
  - la raíz del ensayo se toma de `F08_B151_RAIZ` (`-Raiz`), con la forma `ensayo-f08/b151-<aaaammdd>/`. En #160 estaba fijada en `b151-20261019/`, y las claves nuevas tienen otro `namePrefix`;
  - `-Formato 2` hace que el ítem 6 suba sobres del formato 2 con `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true`;
  - prueba nueva con rw: B2 guarda la copia cifrada byte a byte y el formato 1 se rechaza sin llegar a B2.
- **`71ac088`:** tres defectos que sólo aparecen contra B2 real:
  - la ruta por defecto de `con_b2.ps1` en PowerShell 5.1;
  - el informe se escribe aunque un caso aborte, y el caso queda como FAIL;
  - el ítem 6 quita `BACKUP_S3_*` del entorno antes de crear la app, porque su esquema sólo admite un prefijo de un segmento.

**Validación de la herramienta contra el doble S3**, que no es B2 y no acredita #151:
- ítems 1–5 con la raíz nueva, sin FAIL;
- ítem 6 con formato 2: 6/6;
- con formato 1: 5 PASS y la de formato 2 omitida.

## 5. Lo que esta evidencia no acredita

- Ningún ítem de #151 §A queda cumplido entero. Los ítems 1, 5 y 6 están **bloqueados por H1**, y el 3 **falla por H2** en la lista de versiones.
- El formato 2 contra B2 real no queda demostrado. La forma exterior la sigue acreditando sólo el host (`encrypted-format.backups.postgres.spec`).
- No es una prueba con una copia cifrada por el teléfono: los sobres son sintéticos y tienen la misma forma que vería el servidor.
- Las claves no se revocaron: lo hace Roderich con `revocar_claves_b151.ps1`, y su caducidad no cuenta como revocación.
- No cierra #151 ni cambia gates.
