# F08-BKP-07 (#149) y BKP-06 (#40): ensayo real contra Backblaze B2 — 2026-10-19

**Ficha del ensayo:**
- **Fecha real:** 2026-10-19, de 18:03 a 18:37Z (14:03–14:37 en America/La_Paz).
- **Quién lo hizo:** la sesión A de Claude Code, por la autorización de Roderich Rendón («Completar Backblaze B2 y aclarar los pendientes F07/F08», §6, y su instrucción del 2026-10-19 de continuar con la clave guardada). Es una verificación técnica automatizada: no hubo inspección personal de Roderich ni revisión del tutor.
- **Datos:** sólo sintéticos. Los bytes son aleatorios en el ensayo de API y en el teléfono se usan DS-UX y fotos generadas con ffmpeg.
- **Alcance en B2:** sólo objetos bajo el prefijo `ensayo-f08/`. No se cambió ninguna regla del bucket.
- **Lo que no habilita:** producción ni datos reales. Ningún gate cambia.

## 0. Base y entorno

| Elemento | Valor |
|---|---|
| Backend | `main` **`f0b55ee558b58cab1b854bf54dafb9d04143aef4`**, con el adaptador B2 (BE #147, merge `6141572`) y la retención de #40 (BE #148). CI de `main`: Backend F02 39284935149 y Web F07 39284935301, verify, web y f07 en verde. Compilado en un worktree limpio con `npm ci`, `prisma generate`, `build` y `build:seed` |
| Mobile | **`463d3ecb93f178efa3333c48c299759a9e96ac80`**, la base del piloto. **La app no cambió** |
| APK aislada | `com.comunidad.agro.agroquimicos.f08b2` («Agrocuentas F08-B2»), modo profile, compilada con `tool/f10_eval/build_profile_apk.sh` a las 18:11–18:13Z. SHA-256 **`c194d18a40b12eb3a455c8c6730f5cc6c1171293d9e6cccb198f4d59136ac1c5`**, igual en el PC y en el `base.apk` instalado |
| Dispositivo | POCO X5 Pro 5G `22101320G` (redwood), Android 12 / API 31, zona America/La_Paz, serial `cc14247a`. Sólo se instaló y desinstaló `.f08b2`; la app normal sigue con `lastUpdateTime` 2026-09-24 13:04:32 |
| Central | contenedor nuevo `agro_a_f08b2_pg` (127.0.0.1:55462), 12 migraciones (la última `20261019150000_f08_bkp06_retention`), API 3142 y observador 3143, con un túnel HTTPS temporal |
| Modo de la API | `NODE_ENV=production` con `BACKUP_PRODUCTION_ADMISSION=enabled` **sólo en este entorno sintético**. `BACKUP_STORAGE_PROVIDER=b2`, `BACKUP_S3_PREFIX=ensayo-f08/` y **sin `BACKUP_STORAGE_DIR`**, para que no haya caída a disco. En el log: 0 avisos de «b2 is not configured» |
| Proveedor | Backblaze B2, bucket privado `agro-backups-roderich`, endpoint `https://s3.us-east-005.backblazeb2.com` (us-east-005). Las credenciales viven en el almacén DPAPI de Roderich y entran sólo en el proceso de la API y en el de las herramientas, mediante `con_b2.ps1`. Nunca se imprimen ni se escriben |
| Cuentas sintéticas | Seed del Backend: D (`juan.perez@agro.local`), E2 (otro agricultor del mismo tenant) y ADMIN. Generador DS-UX, destino movil, etiqueta `B2MOV1`: `x01-b2mov1@…` (teléfono) y `p01-b2mov1@…` (otro tenant). Todas las contraseñas son de un solo uso |

**Desviación aceptada por Roderich (2026-10-19).** La clave de B2 está limitada al bucket, pero **no tiene prefijo** y conserva capacidades de bucket que el ensayo no necesita:
- `writeBuckets`, `writeBucketLifecycleRules`, `writeBucketEncryption`, `writeBucketReplications`, `writeBucketNotifications`, `writeBucketLogging` y `shareFiles`;
- además de `listFiles`, `readFiles`, `writeFiles` y `deleteFiles`.

Lo comprobó `comprobar_b2.ps1` (17:03Z). Roderich indicó «no importa que toque todo, continúa con el ensayo».

Las herramientas sólo escriben y leen bajo `ensayo-f08/`, y `s3_inspect.cjs` rechaza cualquier clave de fuera. **No se demuestra el cumplimiento del mínimo privilegio.** Para datos reales hace falta una clave con las cuatro capacidades y su prefijo. La consola web, con «Read and Write», no permite elegir esa lista; `crear_clave_restringida_b2.ps1` la crea por la API.

**Estado previo de B2** (18:03:46Z): `ensayo-f08/` con 0 versiones, 0 marcadores y 0 subidas por partes sin terminar.

## 1. Ensayo de API contra B2 real: **55/55 PASS** (18:08:58–18:10:22Z)

**Comando:** `credential.sh run D … run E2 … run ADMIN … f08b2_cred.sh run p01-b2mov1@… … powershell -File con_b2.ps1 node tool/f08_b2/b2_api_trial.cjs http://127.0.0.1:3142 <salida>`.

**Salida completa:** [`f08_b2/b2_api_trial.txt`](f08_b2/b2_api_trial.txt). **Resultados por caso:** [`f08_b2/b2_api_trial_resultados.json`](f08_b2/b2_api_trial_resultados.json).

| Caso | Comprobación | Resultado |
|---|---|---|
| A, 1 MiB (PutObject simple) | 201 con el SHA-256 confirmado; exactamente 1 objeto nuevo bajo `objects/`, con 1 versión y sin marcador; `HeadObject` con tamaño, **SSE `AES256`** y `agro-sha256`/`agro-size` iguales; `GetObject` directo de B2 y descarga por la API con los mismos bytes, tamaño y cabecera SHA-256; staging vacío y sin multipart | PASS |
| B, 20 MiB (multipart) | Lo mismo; subida en 13,1 s | PASS |
| Aislamiento | Otro agricultor del mismo tenant: 404, indistinguible de una copia inexistente; no la ve en su lista y no puede borrarla (404). Administrador del mismo tenant: 403 en la lista y en el contenido. Agricultor de **otro tenant**: 404, indistinguible. Sin sesión: 401 | PASS |
| SHA-256 incorrecto | 422; ningún objeto nuevo; staging y multipart vacíos | PASS |
| Subida cortada a mitad | Se declararon 12 MiB, se enviaron 3 MiB y se cortó el socket. Las 2 copias anteriores siguen disponibles y sus bytes se descargan íntegros; ningún objeto nuevo; staging y multipart vacíos | PASS |
| Concurrencia | Con una subida lenta en curso, la segunda subida devuelve **409 `BACKUP_UPLOAD_IN_PROGRESS`**; la primera termina con 201 | PASS |
| Rotación (5 + 1) | Con 5 copias (A, B, C, D y E) la herramienta escribió antes la retirada **prevista** (la copia más antigua, `a65b26dc`, y su objeto `objects/6afc8b82…` con todas sus versiones); de la lista previa del servidor sólo se comprobó que tuviera 5 copias. La previsión se **confirmó después**: La sexta (F) da 201 y queda verificada. Después quedan **exactamente B, C, D, E y F**; A devuelve 404 y tiene **0 versiones físicas** en B2, marcadores incluidos; B a F siguen con 1 versión cada una y sus bytes íntegros | PASS |
| Borrado del propietario | `DELETE` de B → 204; **0 versiones físicas** de su objeto en B2 | PASS |
| Conciliación final | 4 copias disponibles = 4 objetos en B2, con 1 versión cada uno; 0 marcadores; staging y multipart vacíos | PASS |

**PostgreSQL tras el ensayo de API** ([`f08_b2/db_tras_api.txt`](f08_b2/db_tras_api.txt), con la consulta y las columnas en la cabecera):
- AVAILABLE: 4;
- FAILED: 1 por `SHA256_MISMATCH` y 1 por `TRANSFER_INCOMPLETE`;
- DELETED: 1 con `OWNER` y 1 con `RETENTION`;
- **`purgePending` en falso** en todas las filas.

## 2. Teléfono: subida, restauración en instalación limpia y cola (18:13–18:36Z)

| Paso | Observado | Resultado |
|---|---|---|
| Instalación y activación | Sólo `.f08b2`. Activación con X01: login 200, `auth/clients` 201, `session/client` 201 y `/me` 200. Titular «Titular», modalidad propia | PASS |
| Datos sintéticos | Base extraída (journal inactivo) y sembrada con DS-UX (`tool/f10_ux/seed_dsux_mobile.dart`, PROPIA, 2026-10-19): «Verano Demo» y los dos productos con vínculos VALID, y 2 compras iniciales. 2 fotos sintéticas (`make_photos.sh`) asociadas a esas compras. Fotos y base devueltas con el mismo SHA-256 en el PC y en el teléfono (base `8b2d5fa0…`) | — |
| Necesidad 1 | 12 L de Glifosato Demo → «Sincronizar ahora» → un `POST /sync/v1/push 200` (18:19:04Z), **ACKED** | PASS |
| Necesidad 2 | 3 L de Bellator, declarada **en modo avión**: «Pendiente (sin confirmar)», es decir `OUTCOME_UNKNOWN`. Se detuvo la app sin red. Al reabrirla, sin acceso verificado: **0 peticiones en 45 s** | PASS |
| Subida desde la app | Liquidación › Copias de seguridad › Respaldo en la nube › Subir: `refresh` 200, `POST /me/backups` **201** y `GET /me/backups` 200 (18:24:46–52Z). Lista: «Copia del 19/10/2026 14:24 · 1.6 MB · esquema 10 · SHA-256 bd6b4953…» | PASS |
| Copia en B2 | Objeto `objects/19f83a6c…`, con **1 versión y 0 marcadores**; `HeadObject` con 1 684 165 B, **SSE `AES256`** y `agro-sha256` = metadatos de PostgreSQL = `GetObject` directo: `bd6b495321f92632fc43e829a3460597201e868c4e3d05958903a076b22a2e45` | PASS |
| Descarga por la API | Como X01: HTTP 200, 1 684 165 B, el mismo SHA-256 y la misma cabecera. El ZIP contiene `manifest.json`, `database.db` y las 2 fotos. Su cola lleva la necesidad 1 en `ACKED` y la necesidad 2 en `OUTCOME_UNKNOWN` | PASS |
| Desviación del recorrido de F08 | Tras la subida, la app envió la necesidad 2 (`POST /sync/v1/push 200`, 18:24:52Z), porque la subida verificó el acceso en línea. A diferencia del ensayo de F08 de 2026-10-16, no se armó el fallo «hold-push». El respaldo **ya se había generado** con la necesidad 2 sin enviar, como confirma la descarga. Por eso la referencia para comparar es **el contenido de la copia descargada**, no el teléfono después de la subida, y la liberación posterior prueba que el reenvío de una operación ya aplicada no duplica nada | declarada |
| Instalación limpia | `adb uninstall` **sólo** de `.f08b2` y reinstalación de la misma APK (`firstInstallTime` 14:28:07 local). Activación con X01 y un titular provisional | PASS |
| Restauración | Ver copias en el servidor › Restaurar. La app descargó la copia y la verificó antes de pedir confirmación: «verificada con SHA-256. Contiene la base de datos y 2 fotografía(s). La copia corresponde al titular de esta instalación… Los envíos al sindicato que traiga la copia quedarán pausados hasta que usted los libere». Se confirmó a las 18:32Z | PASS |
| Restaurar no publica | Peticiones desde la reinstalación: login, `auth/clients`, `session/client`, `/me`, `refresh`, `GET /me/backups` y `GET /me/backups/{id}/content`. **Ningún `POST /sync/v1/push`** | PASS |
| Reabrir no publica | La app se detuvo y se reabrió: **0 peticiones en 80 s** | PASS |
| Copia frente a restaurado | `tool/f08_bkp/snapshot.py --compare` entre el contenido de la copia y el estado restaurado: **Resultado: PASS**. De 29 tablas, 27 quedan IGUAL y las fotos coinciden por nombre y SHA-256 (2 → 2). Las otras 2 tienen la transformación esperada: `app_settings` (`activated_installation_ref`) y `sync_outbox` (`ACKED→ACKED` 1, `OUTCOME_UNKNOWN→RESTORE_PAUSED` 1, con la misma operación, cantidad y causalidad). Ver [`f08_b2/compare_copia_despues.txt`](f08_b2/compare_copia_despues.txt) | PASS |
| Liberar la cola | Sincronización mostró «Sincronizado: 1 · Pausado: restauración: 1» y «Envíos pausados por una restauración. No se publican solos». Al pulsar «Liberar»: `refresh` 200 y **un único** `POST /sync/v1/push 200` (18:35:56Z), con la **misma** operación `5acb001b` | PASS |
| Central sin duplicados | Journal de Sync v1: 2 entradas (`17548fa0` y `5acb001b`, ambas APPLIED, como antes de liberar). Contribuciones ACTIVE: 2 (consultas y salida en [`f08_b2/sync_central.txt`](f08_b2/sync_central.txt)). La app pasa a «Sincronizado: 2». **Alcance:** aquí la operación liberada ya estaba aplicada en el Central, así que se prueba la idempotencia del reenvío. El caso en que la liberación publica por **primera vez** una operación nunca aplicada lo cubrió el ensayo F08 del 2026-10-16 (`F08_MOBILE_RESTORE.md` §5), con el adaptador de disco | PASS |
| Logcat | `logcat_scan.sh`: JWT 0, contraseñas 0, campos sensibles 0, valores opacos de 43+ caracteres 0 y FATAL 0 ([`f08_b2/logcat_scan.txt`](f08_b2/logcat_scan.txt)) | PASS |
| Log de la API | 162 líneas, sin `accessKeyId`, `secretAccessKey`, cabeceras de autorización ni firmas. Las únicas cadenas de 31 o más caracteres son nombres de controladores de Nest con códigos de color | PASS |

**Peticiones que vio el observador** (método, ruta con UUID enmascarados y estado): [`f08_b2/requests_observador.txt`](f08_b2/requests_observador.txt).

## 3. Estado final (18:36:47Z)

- **B2:**
  - `ensayo-f08/objects/`: 5 versiones en 5 claves distintas y 0 marcadores;
  - `ensayo-f08/staging/`: 0;
  - multipart sin terminar: 0.
- **PostgreSQL** ([`f08_b2/db_final.txt`](f08_b2/db_final.txt), con la consulta y las columnas en la cabecera):
  - AVAILABLE: 5 (4 del ensayo de API y 1 del teléfono), una por objeto;
  - FAILED: 2;
  - DELETED: 1 con `OWNER` y 1 con `RETENTION`;
  - ninguna con `purgePending`.
- Los 5 objetos sintéticos se **conservan** bajo `ensayo-f08/` como registro del ensayo. Se pueden retirar con un `DELETE` del propietario por la API.
- **Entorno:**
  - API, observador y túnel detenidos;
  - `agro_a_f08b2_pg` detenido, con su volumen conservado;
  - el teléfono quedó con stay_on 0, sin modo avión, wifi 1 y font 1.0, y la app normal intacta;
  - `.f08b2` sigue instalada y detenida.

## 4. Cifrado y límites

- **En reposo:** los objetos comprobados con `HeadObject` devolvieron `ServerSideEncryption: AES256`: A, B, D, E y F del ensayo de API, y la copia del teléfono, también en `GetObject`. C, la subida lenta, sólo se cotejó por sus bytes. Es el **SSE-B2 gestionado por Backblaze**; el adaptador lo pide en cada escritura.
- **En tránsito:** HTTPS. El teléfono habla con la API por el túnel y la API con B2 por `https://s3.us-east-005.backblazeb2.com`.
- **El SSE-B2 no es cifrado de extremo a extremo:** cualquiera que tenga una clave de lectura del bucket, como el operador del Backend, puede descargar y leer las copias. El SHA-256 sirve para la integridad, no da confidencialidad. Se mantiene lo que dice `F08_BACKUP_THREAT_MODEL.md` §5: la admisión de datos reales sigue cerrada.
- **Versionado del bucket** (Keep all versions): los borrados por retención y por el propietario dejaron **0 versiones y 0 marcadores** en la clave. Se borró por `VersionId` y no quedó ninguna copia física oculta.

**Sigue fuera de esta evidencia:**
- la clave con mínimo privilegio (ver la desviación de §0);
- la política institucional de datos reales y el cifrado que se exija para ellos;
- la operación productiva, con costos, monitoreo y rotación de claves;
- un teléfono de otro modelo (la reinstalación limpia se hizo en el mismo POCO);
- la carga concurrente de varios usuarios;
- contra B2 real no se ejercieron las pruebas de concurrencia C2 (borrado del propietario frente a la rotación) y C5, ni la cota con un proveedor que rechaza los borrados (T-R5). Sólo las cubren las suites con PostgreSQL y el doble S3 (`F08_BKP_06_RETENCION.md`).

Siguen vigentes los límites declarados en `F08_BKP_07_B2_ADAPTER.md` y `F08_BKP_06_RETENCION.md`, incluidos la fila UPLOADING colgada tras un reinicio y el `--reconcile` después de una limpieza manual.

## 5. Herramientas

**En este repositorio:**
- `tool/f08_b2/b2_api_trial.cjs`: el ensayo de API.
- `tool/f08_b2/s3_inspect.cjs`: inspección de sólo lectura del prefijo.

Las dos resuelven `@aws-sdk/client-s3` desde `Back/node_modules`, leen las credenciales sólo del entorno y no imprimen secretos.

**Fuera de los repositorios** (con las mismas reglas):
- el arnés de entorno: contenedor, túnel y contraseñas de un solo uso;
- el almacén de claves `_wt/tools/secretos-b2/`.
