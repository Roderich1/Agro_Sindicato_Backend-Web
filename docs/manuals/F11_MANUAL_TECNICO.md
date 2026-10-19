# Manual técnico de Agrocuentas: despliegue, respaldo y recuperación (borrador F11)

| Campo | Valor |
|---|---|
| Estado | **Borrador revisable de F11** (BE #54). No es un release ni una guía de producción aprobada. GATE-F11 no se evalúa con este documento |
| Fecha de redacción | 2026-10-19 |
| Base descrita | Backend `main` `2a69fe6` (código igual a `f0b55ee`) y Mobile `463d3ec` |
| Manual de usuario | [`F11_MANUAL_USUARIO.md`](F11_MANUAL_USUARIO.md) (BE #53): recorrido del agricultor y de la Directiva. Aquí no se repite |
| Revisión | Sesión B (técnica). Las decisiones las toma Roderich Rendón |

**Cómo leer las marcas:**
- **[Probado]**: hay una evidencia fechada en `docs/evidence/` (o en Mobile) que lo ejecutó. Se cita el archivo.
- **[Sin probar]**: el procedimiento se deduce del código o de la configuración, pero nadie lo ejecutó tal como se describe. Hay que verificarlo antes de usarlo.
- **[No existe]**: no hay procedimiento ni código para eso.

**Nada de este manual habilita datos reales.** No existe ningún despliegue productivo. Todas las pruebas se hicieron con datos sintéticos, en entornos desechables (§7).

---

## 1. Arquitectura

| Componente | Tecnología | Papel | Fuente |
|---|---|---|---|
| **Mobile** | Flutter, SQLite local (`agroquimicos_v2.db`, esquema 10) | Sistema de registro de cada agricultor: compras, inventario, aplicaciones, transferencias, necesidades, fotos. Funciona sin conexión | ADR-001; Mobile `lib/data/app_database.dart` |
| **Central** | NestJS + Prisma + PostgreSQL 16 | Identidad (cuentas, miembros, tenant, registro de cliente, sesión v2), campañas y catálogos compartidos, Sync v1 idempotente, proyección colectiva autorizada, propuesta de compra conjunta, metadatos de respaldos | ADR-001; `docs/architecture/F01_INTEGRATION_DECISIONS.md` |
| **Web** | React 19 + Vite, servida por nginx | Sólo Directiva y Administrador: agregados autorizados, cobertura, reconciliación, propuesta y CSV, campañas, usuarios. Sin registro de operaciones del agricultor | ADR-001; ADR-003; `Web/src/lib/navigation.ts` |
| **Almacenamiento de respaldos** | Disco local (desarrollo) o Backblaze B2 por su API S3 | Binarios `.agrobackup` opacos, fuera de PostgreSQL, detrás del puerto `BackupStorage` | DEC-F01-10 (actualización del 2026-10-19) |

**Qué cruza cada frontera:**

| Frontera | Qué viaja | Qué **no** viaja | Contrato |
|---|---|---|---|
| Mobile → Central, Sync v1 | `POST /api/v1/sync/v1/push`, una operación por petición: `CONSUMPTION_TOTAL` o `DECLARED_NEED`, con campaña, producto, unidad base y cantidad | Réplica de SQLite, finanzas, eventos individuales, fotos, el respaldo | `F05_SYNC_V1_PUSH_ACK_CONTRACT.md` §3–§4; `F06_COLLECTIVE_PROJECTION_CONTRACT.md` |
| Mobile → Central, respaldo privado | `/api/v1/me/backups`: subida por flujo, lista, contenido, borrado. Binario opaco con su SHA-256 | El contenido nunca entra en la proyección; restaurar no publica nada | `F06_COLLECTIVE_PROJECTION_CONTRACT.md` §8; `F08_BACKUP_THREAT_MODEL.md` |
| Mobile → Central, autenticación | `/api/v1/auth/v2/*` y `/api/v1/auth/clients` | — | `F02_IAM_DESIGN.md` |
| Central → Web | Agregados autorizados y proyecciones minimizadas por `/api/v1` relativo | Detalle por agricultor, respaldos | `F07_AGGREGATE_DISCLOSURE_POLICY.md`; `docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` |

La lista cerrada de rutas que la app puede llamar está en Mobile `lib/services/auth/api_endpoint_config.dart`.

---

## 2. Requisitos de ejecución y construcción

### 2.1 Versiones

| Pieza | Versión | De dónde sale |
|---|---|---|
| Node.js | 22 | CI (`.github/workflows/backend-f02.yml`, `web.yml`) y `node:22-alpine` en los Dockerfile. **No hay `engines` ni `.nvmrc`.** Los ensayos locales de F08 usaron Node 25.9.0 |
| PostgreSQL | 16 | `postgres:16` en CI; `postgres:16-alpine` en `docker-compose.yml` y en los ensayos |
| Prisma | 6.19.3 (`prisma` y `@prisma/client` `^6.19.3`) | `Back/package.json` |
| nginx (Web) | 1.27-alpine | `Web/Dockerfile` |
| Flutter / JDK | Flutter 3.47.2 estable, JDK 17 Temurin | Mobile `.github/workflows/flutter-ci.yml` |

### 2.2 Construir el Backend

Orden de `Back/Dockerfile` y del CI:

```sh
cd Back
npm ci
npx prisma generate
rm -f tsconfig.build.tsbuildinfo   # un tsbuildinfo viejo puede dejar dist/ sin main.js
npm run build                      # nest build
npm run build:seed                 # compila prisma/seed.ts a dist/prisma/seed.js
npm run start:prod                 # node dist/main.js
```

El CI añade `npx prisma validate`, `npm test -- --runInBand`, `npm run openapi:check` y las suites con PostgreSQL. **[Probado]** en cada run de CI; para el ensayo B2, en un worktree limpio sobre `f0b55ee` (`F08_BKP_07_B2_ENSAYO_REAL.md` §0).

### 2.3 Construir la Web

```sh
cd Web
npm ci
npm run build      # tsc -b && vite build
```

En producción la Web llama a `/api/v1` relativo, y `Web/nginx.conf` reenvía `/api/` a `http://api:3000/api/`. `VITE_API_PROXY_TARGET` sólo sirve para el servidor de desarrollo de Vite.

### 2.4 Construir la app móvil

- El origen del Central se fija **al compilar**: `--dart-define=AGRO_API_BASE_URL=<origen https>`. Debe ser `https`, con host, sin usuario, sin ruta (salvo `/`), sin consulta ni fragmento. Si falta o no es válido, las funciones remotas quedan sin configurar (`api_endpoint_config.dart`).
- No hay *flavors*. El `applicationId` es `com.comunidad.agro.agroquimicos`.
- Las APK de ensayo se compilan con `tool/f10_eval/build_profile_apk.sh` (modo profile, sufijo de `applicationId` temporal que el script revierte, firma de depuración, **no distribuible**). Exige un worktree limpio.
- La firma de release lee `android/key.properties`, que no está en el repositorio. Sin ese archivo, la compilación de release queda sin firmar a propósito.
- **Una APK queda atada al origen con el que se compiló.** Si el túnel o el dominio cambian, hay que recompilar desde el mismo SHA, y el SHA-256 del archivo cambia.

---

## 3. Base de datos y migraciones

### 3.1 Cadena de migraciones (12)

En `Back/prisma/migrations/`, en este orden:

1. `20260618010000_init_expanded_flow`
2. `20260923033000_f02_add_member`
3. `20260923050000_f02_add_client_registration`
4. `20260924143000_f02_add_auth_session_v2`
5. `20261007202233_f05_sync_v1_journal_expand`
6. `20261015220130_f05_sync_v1_contribution`
7. `20261016043000_f06_collective_consolidation`
8. `20261016150500_f07_pol_01_release_item_quantity`
9. `20261016162158_f07_joint_purchase_proposal`
10. `20261016181000_f08_backup_metadata`
11. `20261017020156_f10_proposal_coverage_basis`
12. `20261019150000_f08_bkp06_retention`

### 3.2 Aplicarlas

```sh
cd Back
DATABASE_URL=<url de PostgreSQL> npx prisma migrate deploy
```

- **[Probado]** sobre bases nuevas: la cadena completa de 12 en el ensayo B2 (`F08_BKP_07_B2_ENSAYO_REAL.md` §0) y en cada run de CI. La prueba `sync-v1-journal.postgres.spec.ts` comprueba que hay 12 y que la última es la de retención.
- **[Probado]** la actualización de una base con datos anteriores a F02 (`migrate resolve --applied` y `deploy`), el 2026-09-24 (`F02_IAM_05.md`).
- `npm run prisma:migrate` (`prisma migrate dev`) es **sólo para desarrollo**. No se usa contra una base con datos.
- **Las migraciones sólo amplían el esquema y no tienen vuelta atrás** («NOT_SUPPORTED_BY_DESIGN», `F02_IAM_05.md`). Volver a una versión anterior de la base exige restaurar una copia de la base (§9.3), que hoy **[No existe]**.

### 3.3 Semilla

- `node dist/prisma/seed.js` crea el tenant y las cuentas de demostración, con **una contraseña de demostración fija y pública en el repositorio** (`Back/prisma/seed.ts`). Si se vuelve a ejecutar, reactiva esas cuentas.
- **No debe ejecutarse en un entorno con datos reales**, o sus contraseñas deben cambiarse en el acto. El arnés de ensayos rota todas las contraseñas de la semilla después de sembrar (Mobile `tool/f03_res_01/rotate_passwords.cjs`).
- Los generadores sintéticos (`Back/scripts/f07-synthetic-seed.cjs`, `f10-dsux-central-seed.cjs`, `f10-dsv-central-seed.cjs`) se niegan a ejecutarse con `NODE_ENV=production` o contra una base que no sea local (salvo `f10-dsux-central-seed.cjs`, que exige sus propias variables; ver su cabecera).

---

## 4. Configuración

El Backend valida el entorno al arrancar con un esquema zod (`Back/src/config/env.schema.ts`). Si falta una variable obligatoria o es inválida, **no arranca**. Una variable vacía cuenta como no definida. Plantilla: `Back/.env.example`.

**Los secretos nunca se escriben en archivos versionados, evidencias ni logs.** Se pasan como variables de entorno del proceso, desde un almacén cifrado. En los ensayos, las claves de B2 entraron sólo al proceso desde el almacén DPAPI de Roderich, fuera de los repositorios.

### 4.1 Backend

| Variable | Para qué | Valor por defecto o permitido | ¿Necesaria? |
|---|---|---|---|
| `NODE_ENV` | Modo | `development` \| `test` \| `production` (por defecto `development`) | Sí. `production` cierra Sync v1, respaldos y el modo colectivo sintético salvo admisión explícita |
| `PORT` | Puerto | `3000` | No |
| `DATABASE_URL` | PostgreSQL | `<postgresql://usuario:clave@host:5432/base?schema=public>` | **Sí** |
| `JWT_SECRET` | Firma del token de acceso | secreto, mínimo 12 caracteres | **Sí** |
| `JWT_EXPIRES_IN` | Vida del token de acceso | `15m` | No |
| `JWT_REFRESH_SECRET` | Firma de la renovación | secreto, mínimo 32 caracteres | **Sí** |
| `JWT_REFRESH_EXPIRES_IN` | Vida de la renovación | `7d` | No |
| `CORS_ORIGIN` | Orígenes permitidos, separados por comas | `http://localhost:5173` | En la práctica, sí |
| `COOKIE_SECURE` | Cookie de renovación sólo por HTTPS | `true` \| `false`; sin definir, sigue a `NODE_ENV=production` | `true` fuera de desarrollo |
| `SYNC_V1_FINGERPRINT_KEY` | Clave HMAC (base64, ≥ 32 bytes) para comparar reenvíos | secreto; sin ella, las escrituras de Sync v1 responden 503 | Para Sync v1 |
| `SYNC_V1_FINGERPRINT_KEY_VERSION` | Versión entera de esa clave | `1` en la plantilla | Con la clave |
| `SYNC_V1_FINGERPRINT_PREVIOUS_KEYS` | Claves anteriores, `versión=base64,…`, para reenvíos tras una rotación | vacío | No |
| `SYNC_V1_PRODUCTION_ADMISSION` | Abre Sync v1 con `NODE_ENV=production` | `enabled` \| `disabled` (plantilla `disabled`) | Cerrado salvo decisión |
| `COLLECTIVE_DISCLOSURE_MODE` | Cifras colectivas | `disabled` \| `provisional-synthetic` (k = 3). **Se ignora en producción**, que siempre responde `POLICY_PENDING` | — |
| `BACKUP_STORAGE_PROVIDER` | Proveedor de respaldos | `disk` (si está vacío) \| `b2` | — |
| `BACKUP_STORAGE_DIR` | Directorio del proveedor de disco | sin valor: rutas en 503 | Sólo con `disk` |
| `BACKUP_MAX_BYTES` | Tamaño máximo de una copia | `104857600` (100 MiB); máximo 1 GiB | No |
| `BACKUP_MAX_ACTIVE_PER_MEMBER` | Copias verificadas que se conservan por agricultor | `5`; máximo 100 | No |
| `BACKUP_UPLOAD_DEADLINE_MS` | Plazo de una subida | `1800000` (30 min); entre 60 000 y 3 599 999 | No |
| `BACKUP_PRODUCTION_ADMISSION` | Abre los respaldos con `NODE_ENV=production` | `enabled` \| `disabled` (plantilla y compose `disabled`) | Cerrado salvo decisión (§7.3) |
| `BACKUP_S3_ENDPOINT` | Endpoint S3 de B2 | origen `https` sin ruta, p. ej. `https://s3.<región>.backblazeb2.com` | Con `b2` |
| `BACKUP_S3_REGION` | Región | `[a-z0-9-]{1,32}` | Con `b2` |
| `BACKUP_S3_BUCKET` | Bucket privado | `[A-Za-z0-9-]{6,63}` | Con `b2` |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | Credenciales | secretos; el esquema sólo comprueba su forma, para no repetir el valor en un error | Con `b2` |
| `BACKUP_S3_PREFIX` | Un segmento terminado en `/` (p. ej. `ensayo-f08/`); nunca la raíz del bucket | — | Con `b2` |

**Constantes que no se configuran:**
- Abandono de una subida: 60 min (`BACKUP_UPLOAD_ABANDON_MS` en `backups-config.ts`). **No es una variable de entorno.**
- Límites de peticiones: 20 por minuto en general, 5 por minuto en el login (`app.module.ts`, controladores de autenticación).
- Prefijo global `api/v1`, Helmet, `ValidationPipe` con lista blanca, Swagger en `/docs`.
- `requestTimeout` de Node: 300 s, sin cambiar en `main.ts`.

**Proveedor `b2` incompleto:** el Backend registra sólo los **nombres** de las variables que faltan y deja las rutas de respaldo en 503. **Nunca cae al disco** (`backups.module.ts`).

### 4.2 Web y app

| Dónde | Variable | Uso |
|---|---|---|
| Web (compilación) | `VITE_LEGACY_FARMER_WEB=enabled` | Muestra las pantallas heredadas del agricultor. Por defecto, apagado: un agricultor ve sólo el aviso «Esta Web es para la Directiva y el Administrador» |
| Web (desarrollo) | `VITE_API_PROXY_TARGET` | Destino del proxy de Vite (por defecto `http://localhost:3000`) |
| App (compilación) | `AGRO_API_BASE_URL` | Origen HTTPS del Central (§2.4) |

---

## 5. Respaldos privados en el servidor

Trazabilidad: RF-26, RF-27, RNF-04, RNF-10, DAT-14, CU-14 y CU-15 (`F08_BACKUP_THREAT_MODEL.md`). Lo que ve el agricultor está en el manual de usuario.

### 5.1 Proveedores

| Proveedor | Uso | Cómo guarda | Evidencia |
|---|---|---|---|
| `disk` (`LocalDiskBackupStorage`) | **Sólo desarrollo y pruebas** | `staging/` con fsync y renombrado atómico a `objects/<uuid>`; archivos 0600 y carpetas 0700 | `F08_BACKUP.md` **[Probado]** |
| `b2` (`S3BackupStorage`) | Proveedor elegido por Roderich el 2026-10-19; sin uso productivo | `<prefijo>staging/<clave>.<hex>.part`, luego `CopyObject` con la versión fijada a `<prefijo>objects/<clave>`; multipart por encima de 8 MiB | `F08_BKP_07_B2_ADAPTER.md` (doble S3) y `F08_BKP_07_B2_ENSAYO_REAL.md` (B2 real) **[Probado]** |

### 5.2 Integridad y metadatos

- La app envía `X-Content-SHA256`, `X-Backup-Format-Version` y `X-Backup-Schema-Version` con `Content-Type: application/octet-stream`.
- El servidor recalcula el SHA-256 mientras recibe:
  - si no coincide → 422;
  - si supera `BACKUP_MAX_BYTES` → 413;
  - si el cuerpo no es `octet-stream` → 415 cerrado.
- Al descargar, el servidor vuelve a calcular el SHA-256 antes de enviar el primer byte. Si no coincide, responde 500 `BACKUP_INTEGRITY_FAILED`. La respuesta lleva `X-Content-SHA256`.
- En B2:
  - cada `PutObject` y `UploadPart` lleva `Content-MD5`;
  - el objeto final lleva los metadatos `agro-sha256` y `agro-size`, puestos con `CopyObject` y `MetadataDirective=REPLACE`;
  - se pide SSE `AES256` en cada escritura.

  **[Probado]** contra B2 real (§1 y §4 del ensayo). Siguen abiertos el rechazo `BadDigest`, la paginación y observar qué versión de staging se copió (ensayo §4).
- **SSE-B2 no es cifrado de extremo a extremo.** Quien tenga una clave de lectura del bucket puede leer las copias.

### 5.3 Retención de 5 copias

Diseño: `docs/architecture/F08_BKP_06_RETENCION.md`. Evidencia: `docs/evidence/F08_BKP_06_RETENCION.md`. Es la **decisión técnica del autor para la entrega académica**, no un período institucional.

**Reglas:**
- Se conservan las N copias verificadas más recientes de cada agricultor (N = `BACKUP_MAX_ACTIVE_PER_MEMBER`, 5).
- Nada caduca por antigüedad.
- La copia nueva queda `AVAILABLE` **antes** de que se retire la más antigua, en la misma transacción.
- La retención automática nunca retira la última copia.
- Cada agricultor tiene como mucho una subida en curso. Una segunda subida recibe 409 `BACKUP_UPLOAD_IN_PROGRESS`.
- Cota por agricultor: copias + subidas + purgas pendientes ≤ N + 1. Por encima, la subida recibe 503 `BACKUP_STORAGE_UNAVAILABLE`.
- El agricultor puede borrar cualquier copia suya, incluida la última.

**Contrato:** desde BE #148, una subida con N copias responde 201 y retira la más antigua. `BACKUP_QUOTA_EXCEEDED` sigue en el enum, pero ya no se emite.

**Plazos:**
- Una subida se corta a los 30 min: queda `FAILED UPLOAD_DEADLINE`, sus bytes se purgan y la respuesta es 503 con `Connection: close`.
- Una fila `UPLOADING` con más de 60 min se cierra como `FAILED ABANDONED` en la siguiente reserva.

**Probado:** suites con PostgreSQL (16 casos de retención y 5 sobre el doble S3, con mutaciones M1–M8 detectadas) y, contra B2 real, la rotación 5 + 1, que deja 0 versiones físicas de la copia retirada, y el 409 por concurrencia (ensayo §1). **[Probado]**

**No probado contra B2 real** (sólo en las suites): el borrado del propietario durante la rotación (C2), el abandono con finalización tardía (C5) y la cota con un proveedor que rechaza los borrados (T-R5).

### 5.4 Purgas pendientes y reconciliación

- Una copia retirada, borrada o fallida queda en PostgreSQL como `DELETED` o `FAILED` con `purgePending = true` hasta que el almacenamiento confirma que sus bytes desaparecieron.
- Para `FAILED`, se descarta el staging y después el objeto. En B2, con el bucket en «Keep all versions», se borran **todas las versiones y marcadores** por `VersionId` y se vuelve a listar para confirmarlo.
- La reconciliación se ejecuta sola antes de cada subida y después de cada borrado del propietario. El operador la puede lanzar con la herramienta de §5.5.
- Un `CHECK` de la base impide marcar una copia `AVAILABLE` con purga pendiente.

### 5.5 Herramienta de inventario del operador

Se ejecuta desde `dist/`, después de `npm run build`. Lee `DATABASE_URL` y el mismo proveedor que la API:

```sh
npm run backups:inventory                                   # inventario, no modifica nada
npm run backups:inventory -- --reconcile                    # cuenta las purgas pendientes por motivo
npm run backups:inventory -- --reconcile --apply            # reintenta esas purgas
npm run backups:inventory -- --cleanup --older-than-minutes <N>          # plan de limpieza de restos (N ≥ 60)
npm run backups:inventory -- --cleanup --older-than-minutes <N> --apply  # ejecuta ese plan
```

**Comportamiento:**
- Imprime sólo conteos y bytes por categoría: ni claves, ni identificadores, ni contenido.
- Códigos de salida:
  - 0: correcto;
  - 2: argumentos o entorno inválidos (imprime sólo nombres de variables);
  - 3: hay copias `AVAILABLE` sin objeto o con otro tamaño, que **requieren revisión humana** y nunca se corrigen solas;
  - 1: error inesperado (imprime sólo su nombre).

**Qué limpia:**
- Categorías que puede limpiar: objetos de filas borradas o fallidas, objetos sin fila, restos de staging y, en B2, multipart sin terminar (`incompleteUpload`).
- Las versiones ocultas de B2 (`hiddenVersion`) sólo se informan.
- La limpieza nunca toca una copia `AVAILABLE` ni borra filas, y vuelve a comprobar cada candidato antes de borrarlo.

**Límites declarados:**
- `--cleanup --apply` no baja `purgePending`. Después de una limpieza manual hay que ejecutar `--reconcile --apply`.
- Con B2, la comprobación de cada candidato hace un listado completo, O(n²) en una limpieza grande.
- No hay ejecución programada.

**Estado de las pruebas:**
- **[Probado]** en pruebas con PostgreSQL y con el doble S3: `--reconcile` y `--reconcile --apply` (`F08_BKP_06_RETENCION.md`), y el inventario, la limpieza y los argumentos inválidos (`F10_BKP_06_INVENTARIO.md`).
- **[Sin probar]** contra un entorno conservado o contra B2 real.

### 5.6 Recuperación ante fallos de respaldo

| Síntoma | Causa probable | Qué hacer | Estado |
|---|---|---|---|
| Todas las rutas de respaldo responden 503 | Admisión cerrada en producción, proveedor `disk` sin `BACKUP_STORAGE_DIR` o `b2` incompleto | Revisar el log de arranque, que nombra las variables que faltan. No abrir la admisión sin la decisión de §7.3 | [Probado] (`F08_BACKUP.md`, `F08_BKP_07_B2_ADAPTER.md`) |
| Un agricultor recibe 409 `BACKUP_UPLOAD_IN_PROGRESS` sin tener ninguna subida en curso | Fila `UPLOADING` colgada tras un reinicio del servidor | Esperar al cierre por abandono (≤ 60 min desde que empezó). No borrar la fila a mano | Límite declarado (`F08_BKP_06_RETENCION.md`, evidencia) |
| Un agricultor recibe 503 en cada subida y la cola de purgas crece | El proveedor rechaza los borrados | Corregir el acceso al proveedor y ejecutar `--reconcile --apply` | [Probado] en el doble S3; sin probar en B2 real |
| El inventario termina con código 3 | Copia `AVAILABLE` sin objeto o con otro tamaño | Revisión humana; no hay corrección automática | [Sin probar] en un entorno conservado |
| Restos tras una limpieza manual | `purgePending` sigue activo | `--reconcile --apply` | Límite declarado |

---

## 6. Respaldos en el teléfono (resumen técnico)

El uso desde la app está en el manual de usuario. Aquí sólo va lo que necesita quien opera o diagnostica.

- **Formato `.agrobackup`:** ZIP con `manifest.json`, `database.db` e `invoices/…`, en formato 1.
  - El manifiesto lleva la versión del esquema, la fecha, el tamaño y el SHA-256 de la base y de cada foto.
  - Se pueden restaurar copias heredadas `.db`, sin fotos.
  - Fuente: Mobile `lib/data/backup_service.dart`.
- **Límites de extracción:** 5002 entradas, manifiesto de 4 MiB, 128 MiB por entrada y 256 MiB en total. No se admiten enlaces, cifrado, ZIP64 ni multidisco. **[Probado]** en host (`F10_BACKUP_EXTRACT_LIMITS.md`, Mobile). No se comprueba el espacio libre antes de extraer.
- **Restauración guardada** (`lib/guarded_restore.dart`):
  - se comprueba el titular de la copia antes de sustituir nada;
  - la copia actual se asegura como `.previo-<fecha>.db` (checkpoint, comprobación del `-wal` y SHA-256);
  - si algo falla después de sustituir, se revierte entera;
  - los envíos pendientes pasan a `RESTORE_PAUSED` y sólo salen cuando el agricultor los libera con acceso verificado.

  **[Probado]**: en host (`F10_RESTORE_WAL_ROLLBACK.md`) y en el POCO X5 Pro, con reversión forzada y copias alteradas, ajenas o «zip bomb» rechazadas (`F10_RESTORE_DEVICE.md`, 2026-10-16). El POCO usa *rollback journal*, no WAL.
- **Restauración desde el servidor:** descarga a `.part`, comprueba cabecera, tamaño y SHA-256 antes de renombrar. **[Probado]** contra disco (`F08_MOBILE_RESTORE.md` §5) y contra B2 real (ensayo §2).
- **Límites declarados:**
  - las copias `.previo` se acumulan sin retención;
  - no hay cifrado del lado del cliente;
  - no hay respaldo automático ni programado.

---

## 7. Entorno de ensayo y despliegue productivo

### 7.1 Entorno sintético usado en los ensayos

Herramientas de Mobile `tool/f03_res_01/` y de Backend `tool/f08_b2/`:

| Pieza | Cómo es en los ensayos |
|---|---|
| Base | Contenedor `postgres:16-alpine` desechable en `127.0.0.1`, con `prisma migrate deploy` |
| API | `node dist/main.js` con `NODE_ENV=production` y las admisiones en `enabled` **sólo en ese entorno desechable** |
| Observador | Proxy local que registra sólo método, ruta con identificadores enmascarados y estado |
| HTTPS | **Túnel temporal** (Cloudflare quick tunnel) con un origen `trycloudflare.com` que cambia cada vez |
| App | APK aislada con sufijo de `applicationId` propio, compilada contra ese origen |
| Cuentas | Semilla con contraseñas rotadas de un solo uso, que viven sólo en la memoria del proceso |
| B2 | Prefijo `ensayo-f08/`, credenciales inyectadas sólo al proceso. La clave usada **no** es de mínimo privilegio (desviación aceptada por Roderich) |

### 7.2 Lo que cambia en un despliegue productivo

**Esto no existe todavía.** Haría falta, como mínimo:
- TLS real, sin túnel;
- secretos propios (no los marcadores de `docker-compose.yml`);
- `COOKIE_SECURE=true`;
- `CORS_ORIGIN` con el dominio real;
- una APK firmada y compilada contra el dominio definitivo;
- la semilla de demostración desactivada o con sus contraseñas cambiadas;
- una clave de B2 con sólo `listFiles`, `readFiles`, `writeFiles` y `deleteFiles`, limitada a su prefijo;
- `backups:inventory -- --reconcile` periódico;
- monitorización.

Ver también el §10 del diseño de retención.

### 7.3 Admisión productiva cerrada

- Con `NODE_ENV=production`:
  - las rutas de respaldo responden 503 salvo `BACKUP_PRODUCTION_ADMISSION=enabled`;
  - Sync v1 responde 503 salvo `SYNC_V1_PRODUCTION_ADMISSION=enabled`;
  - las cifras colectivas siempre están en `POLICY_PENDING`.
- **Ninguna de las ocho condiciones del §5 del modelo de amenazas se cumple hoy** (`F08_BACKUP_THREAT_MODEL.md`), entre ellas el cifrado en reposo que proteja del operador, TLS real, cupo global, copias del propio almacenamiento y la decisión explícita de Roderich.
- La política de divulgación colectiva tampoco está aprobada para datos reales (`F07_AGGREGATE_DISCLOSURE_POLICY.md`; #107; GATE-F07 Pending).

---

## 8. Diagnóstico y operación

| Procedimiento | Cómo | Estado |
|---|---|---|
| ¿Está viva la API? | `GET /api/v1/health` → `{status:'ok', …}`. **No comprueba la base**. Lo usa el healthcheck de compose | [Probado] en todos los ensayos |
| Errores HTTP | El filtro de excepciones registra estado, método, URL, IP y mensaje, sin cuerpo | En uso |
| Secretos en el log de la API | Revisar que no aparezcan `accessKeyId`, `secretAccessKey`, cabeceras de autorización ni firmas | [Probado] (ensayo B2 §2: 162 líneas limpias) |
| Secretos en el teléfono | `logcat_scan.sh` cuenta JWT, contraseñas, campos sensibles, valores opacos y FATAL sin guardar el contenido | [Probado] (0 en todos los ensayos de respaldo) |
| Estado de los respaldos | `npm run backups:inventory` (§5.5) | [Probado] en pruebas |
| Purgas pendientes | `npm run backups:inventory -- --reconcile [--apply]` | [Probado] en pruebas |
| Comparar una copia con lo restaurado | Mobile `tool/f08_bkp/snapshot.py --compare` | [Probado] (ensayo B2 §2; `F08_MOBILE_RESTORE.md` §5) |

---

## 9. Vuelta atrás y recuperación

### 9.1 Aplicación

- **Backend:** volver al `dist/` de un SHA anterior. Una versión anterior a F02 arrancó contra la base ampliada, con login, `me` y refresh correctos (`F02_IAM_05.md`, 2026-09-24). **[Probado] sólo para esa versión.** Con la cadena actual de 12 migraciones está **[Sin probar]**.
- **Web:** volver a desplegar la compilación anterior. **[Sin probar]**.
- **App:** reinstalar una APK anterior no baja el esquema SQLite. **[Sin probar]**, y no se recomienda sin una copia `.agrobackup` previa.

### 9.2 Restauración en el teléfono

Ver §6. Es el único procedimiento de recuperación de datos probado de punta a punta: en disco el 2026-10-16 y en B2 real el 2026-10-19.

### 9.3 Base del Central

**[No existe]:**
- no hay procedimiento de copia y restauración de PostgreSQL (`pg_dump`/`pg_restore`) en ningún repositorio;
- no hay restauración del almacenamiento de respaldos (condición 6 del §5 del modelo de amenazas);
- no hay rotación de `JWT_SECRET`, `JWT_REFRESH_SECRET` ni de las claves de B2.

La única rotación con soporte es la de la clave de huella de Sync v1, mediante `SYNC_V1_FINGERPRINT_PREVIOUS_KEYS`, probada en unidad (`F05_SYNC_05.md`).

**Precondición de cualquier paso *contract*.** Antes de una migración que retire tablas, columnas o rutas (fases 6 y 9 de `docs/scope/TRANSITION_PLAN.md`, BE #81), hacen falta dos cosas:
- un ciclo **probado** de copia y restauración de la base del Central;
- `docs/scope/LEGACY_CONTRACT_CONSUMERS.md` con cero consumidores en el HEAD de ese momento.

Lo probado en los respaldos es el **respaldo privado del teléfono**, no la base central (`F10_CONTRASTE_81_Y_VALIDATION.md`, fila 81-M, en BE #153). Hoy ningún paso *contract* está autorizado ni se ha ejecutado.

### 9.4 Reparación de la migración inicial

Una base creada con la migración inicial anterior a la eliminación del BOM sigue siendo compatible con Prisma 6.19.3 (`INITIAL_MIGRATION_BOM_REPAIR.md`). **[Probado]**. Hay que repetir la comprobación si cambia la versión mayor de Prisma.

---

## 10. Riesgos de la configuración de ejemplo

`docker-compose.yml` es de **desarrollo y demostración**. No sirve para producción tal como está:
- **Migraciones:** el arranque hace `migrate deploy || db push`. Si la migración falla, `db push` cambia el esquema sin historial. En producción hay que quitar esa alternativa.
- **Semilla:** se ejecuta en **cada arranque**, con la contraseña pública de demostración, y reactiva las cuentas de la semilla.
- **Cookies:** pone `COOKIE_SECURE: "false"` junto a `NODE_ENV=production`.
- **Secretos:** `JWT_SECRET` y `JWT_REFRESH_SECRET` son marcadores `change-me…`.
- **Sync v1:** no define las variables `SYNC_V1_*`, así que Sync v1 responde 503.
- **Respaldos:** usa el proveedor de disco en un volumen con la admisión cerrada.
- **Tamaño de las subidas tras nginx:** `Web/nginx.conf` no fija `client_max_body_size`, cuyo valor por defecto en nginx es 1 MiB. Si la app usara ese nginx como origen, las subidas de respaldo grandes se rechazarían antes de llegar a la API. Los ensayos no pasaron por ese nginx. **[Sin probar]**: hay que verificarlo antes de usar ese esquema.
- **Rutas heredadas de escritura privada:** la API sigue aceptando del AGRICULTOR, sobre lo suyo, `POST /purchases`, `/inventory`, `/applications`, `/plots`, `/accounts-payable` y `/sync/operations` (`docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` §2.4). La app (`463d3ec`) no usa ninguna, y la Web sólo con `VITE_LEGACY_FARMER_WEB=enabled` (`docs/scope/LEGACY_CONTRACT_CONSUMERS.md`). En un despliegue, otro cliente podría escribir datos privados en el Central. Cerrarlas es la PHASE 6 de BE #81, que no está iniciada y depende de una decisión de Roderich. Mientras tanto queda como **límite productivo**.
- **Dependencias:** el triaje de seguridad del 2026-09-28 dejó hallazgos sin resolver que exigen revisión antes de producción (`docs/security/F02_THREAT_MODEL.md`).

---

## 11. Pendiente y fuera de este manual

- **Lo que sigue externo para los respaldos:**
  - la clave de mínimo privilegio;
  - la política institucional de retención;
  - el cifrado exigible;
  - la operación productiva;
  - las reglas del bucket fuera de `ensayo-f08/`;
  - los huérfanos anteriores a la migración;
  - la copia tardía tras un `commit` agotado.

  Ver `F08_BKP_06_RETENCION.md` §10.
- **Voz (F09):** es opcional y queda pendiente. No se documenta ninguna operación técnica de reconocimiento de voz. GATE-F09 está Pending y tiene mediciones `NOT_MEASURED`.
- **Un solo modelo de teléfono:** los ensayos de restauración se hicieron en el POCO X5 Pro (Android 12).
- **Para verificar después de este borrador:**
  - los procedimientos [Sin probar] de §5.5, §5.6, §9.1 y §10;
  - una relectura completa por la sesión B.

---

## 12. Trazabilidad de procedimientos

| Procedimiento | Contrato o diseño | Evidencia |
|---|---|---|
| Construcción y migraciones | `Back/Dockerfile`; `.github/workflows/backend-f02.yml` | CI; `F08_BKP_07_B2_ENSAYO_REAL.md` §0; `F02_IAM_05.md` |
| Configuración y admisión | `Back/src/config/env.schema.ts`; `F08_BACKUP_THREAT_MODEL.md` §5 | `F08_BACKUP.md`; `F08_BKP_07_B2_ADAPTER.md` |
| Proveedor B2, integridad y SSE | DEC-F01-10 (2026-10-19); `F08_BKP_06_RETENCION.md` §7 | `F08_BKP_07_B2_ADAPTER.md`; `F08_BKP_07_B2_ENSAYO_REAL.md` §1, §1.1 y §4 |
| Retención y reconciliación | `F08_BKP_06_RETENCION.md` (diseño) | `docs/evidence/F08_BKP_06_RETENCION.md`; ensayo B2 §1 |
| Inventario y limpieza | `Back/src/modules/backups/cli/backups-inventory.ts` | `F10_BKP_06_INVENTARIO.md`; `F08_BKP_06_RETENCION.md` (evidencia) |
| Restauración en el teléfono | `F06_COLLECTIVE_PROJECTION_CONTRACT.md` §8; ADR-001 | Mobile `F08_MOBILE_RESTORE.md`, `F10_RESTORE_DEVICE.md`, `F10_RESTORE_WAL_ROLLBACK.md`, `F10_BACKUP_EXTRACT_LIMITS.md`; ensayo B2 §2 |
| Sync v1 y cola | `F05_SYNC_V1_PUSH_ACK_CONTRACT.md`; `F05_SYNC_V1_RETRY_IDEMPOTENCY_MATRIX.md` | `F05_SYNC_05.md`–`F05_SYNC_07.md` |
| Cifras colectivas | `F07_AGGREGATE_DISCLOSURE_POLICY.md` (propuesta) | `F07_GATE.md`; `F07_WEB.md` |
| Autorización | `docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` | `F10_SEC_02_ROUTES.md` |
