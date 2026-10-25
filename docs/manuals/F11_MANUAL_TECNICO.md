# Manual técnico de Agrocuentas: despliegue, respaldo y recuperación (borrador F11)

| Campo | Valor |
|---|---|
| Estado | **Borrador revisable de F11** (BE #54). No es un release ni una guía de producción aprobada. GATE-F11 no se evalúa con este documento |
| Fecha de redacción | 2026-10-19. **Actualización del 2026-10-24** (F01–F08, sesión C), marcada en cada apartado |
| Base descrita | Backend `main` `2a69fe6` (código igual a `f0b55ee`) y Mobile `463d3ec`. **Desde la actualización del 2026-10-24:** Backend `main` `4bcb1ea` y Mobile `main` `1d77c14`. Los nombres de variables, comandos y códigos se comprobaron sobre esos SHA |
| Manual de usuario | [`F11_MANUAL_USUARIO.md`](F11_MANUAL_USUARIO.md) (BE #53): recorrido del agricultor y de la Directiva. Aquí no se repite |
| Revisión | Sesión B (técnica). Las decisiones las toma Roderich Rendón |

**Cómo leer las marcas:**
- **[Probado]**: hay una evidencia fechada en `docs/evidence/` (o en Mobile) que lo ejecutó. Se cita el archivo.
- **[Sin probar]**: el procedimiento se deduce del código o de la configuración, pero nadie lo ejecutó tal como se describe. Hay que verificarlo antes de usarlo.
- **[No existe]**: no hay procedimiento ni código para eso.

**Nada de este manual habilita datos reales.** No existe ningún despliegue productivo. Todas las pruebas se hicieron con datos sintéticos, en entornos desechables (§7).

**Actualización del 2026-10-24.** Lo que cambió con F01–F08 está en su apartado, marcado con la fecha; el texto anterior se conserva cuando era el registro de una prueba. Resumen:
- respaldo cifrado en el teléfono (formato 2) y `BACKUP_REQUIRE_CLIENT_ENCRYPTION` (§4.1, §5.2 y §6);
- configuración del proveedor `b2` (§4.1);
- comportamientos de B2 que corrige el adaptador y códigos de limpieza pendiente (§5.7);
- `backups:inventory --reconcile` ante esos códigos (§5.5 y §5.6);
- `COLLECTIVE_SEALING` y la migración F07 (§3.1, §3.4 y §4.1);
- la herramienta de #160 y el modo `drop-refresh-response` del arnés Mobile (§7.4);
- la restauración en un teléfono nuevo, con la cuenta y la clave (§6.1);
- lo que sigue pendiente para producción, por separado (§7.5).

---

## 1. Arquitectura

| Componente | Tecnología | Papel | Fuente |
|---|---|---|---|
| **Mobile** | Flutter, SQLite local (`agroquimicos_v2.db`, esquema 10; **esquema 11** en `1d77c14`, 2026-10-24) | Sistema de registro de cada agricultor: compras, inventario, aplicaciones, transferencias, necesidades, fotos. Funciona sin conexión | ADR-001; Mobile `lib/data/app_database.dart` |
| **Central** | NestJS + Prisma + PostgreSQL 16 | Identidad (cuentas, miembros, tenant, registro de cliente, sesión v2), campañas y catálogos compartidos, Sync v1 idempotente, proyección colectiva autorizada, propuesta de compra conjunta, metadatos de respaldos | ADR-001; `docs/architecture/F01_INTEGRATION_DECISIONS.md` |
| **Web** | React 19 + Vite, servida por nginx | Sólo Directiva y Administrador: agregados autorizados, cobertura, reconciliación, propuesta y CSV, campañas, usuarios. Sin registro de operaciones del agricultor | ADR-001; ADR-003; `Web/src/lib/navigation.ts` |
| **Almacenamiento de respaldos** | Disco local (desarrollo) o Backblaze B2 por su API S3 | Binarios opacos, fuera de PostgreSQL, detrás del puerto `BackupStorage`. Desde el 2026-10-24, el teléfono sube sólo el formato 2, cifrado con la clave del agricultor; el formato 1 (`.agrobackup` sin cifrar) se sigue admitiendo por compatibilidad (§5.2) | DEC-F01-10 (actualización del 2026-10-19); Mobile F08-ADR-003 |

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

Orden de `Back/Dockerfile`:

```sh
cd Back
npm ci
npx prisma generate
rm -f tsconfig.build.tsbuildinfo   # un tsbuildinfo viejo puede dejar dist/ sin main.js
npm run build                      # nest build
npm run build:seed                 # compila prisma/seed.ts a dist/prisma/seed.js
npm run start:prod                 # node dist/main.js
```

**Qué se probó y dónde:**
- **El CI** (`backend-f02.yml`) ejecuta `npm ci`, `npx prisma validate`, `npx prisma generate`, `npm run build`, `npm test -- --runInBand`, `npm run openapi:check` y las suites con PostgreSQL. **[Probado]** en cada run.
- **El CI no ejecuta** el borrado de `tsbuildinfo`, `build:seed` ni `start:prod`. Esos pasos se probaron en el ensayo B2, en un worktree limpio sobre `f0b55ee` (`F08_BKP_07_B2_ENSAYO_REAL.md` §0). **[Probado]**
- **La imagen Docker** termina con `npm prune --omit=dev`. `prisma` está en `dependencies`, así que `npx prisma migrate deploy` sigue disponible dentro de la imagen.

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

### 3.1 Cadena de migraciones (12; 13 desde el 2026-10-24)

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
13. `20261023100000_f07_collective_seal` (añadida el 2026-10-24; §3.4)

F08-ADR-003 (formato 2) **no añade migración**: `formatVersion` ya era un entero.

### 3.2 Aplicarlas

```sh
cd Back
DATABASE_URL=<url de PostgreSQL> npx prisma migrate deploy
```

- **[Probado]** sobre bases nuevas: la cadena completa de 12 en el ensayo B2 (`F08_BKP_07_B2_ENSAYO_REAL.md` §0) y en cada run de CI. La prueba `sync-v1-journal.postgres.spec.ts` comprueba que hay 12 y que la última es la de retención.
  - *2026-10-24:* en `4bcb1ea` esa prueba exige **13**, con `_f08_bkp06_retention` en el puesto 12 y `_f07_collective_seal` en el 13. Pasa en la CI de `main` (`verify`, run 40139903896). El ensayo B2 del 2026-10-19 aplicó las 12 de entonces.
- **[Probado]** la actualización de una base con datos anteriores a F02 (`migrate resolve --applied` y `deploy`), el 2026-09-24 (`F02_IAM_05.md`).
- `npm run prisma:migrate` (`prisma migrate dev`) es **sólo para desarrollo**. No se usa contra una base con datos.
- **Las migraciones sólo amplían el esquema y no tienen vuelta atrás** («NOT_SUPPORTED_BY_DESIGN», `F02_IAM_05.md`). Volver a una versión anterior de la base exige restaurar una copia de la base (§9.3), que hoy **[No existe]**.

### 3.3 Semilla

- `node dist/prisma/seed.js` crea el tenant y las cuentas de demostración, con **una contraseña de demostración fija y pública en el repositorio** (`Back/prisma/seed.ts`). Si se vuelve a ejecutar, reactiva esas cuentas.
- **No debe ejecutarse en un entorno con datos reales**, o sus contraseñas deben cambiarse en el acto. El arnés de ensayos rota todas las contraseñas de la semilla después de sembrar (Mobile `tool/f03_res_01/rotate_passwords.cjs`).
- Los generadores sintéticos (`Back/scripts/f07-synthetic-seed.cjs`, `f10-dsux-central-seed.cjs`, `f10-dsv-central-seed.cjs`) se niegan a ejecutarse con `NODE_ENV=production` o contra una base que no sea local. Cada uno exige además su propia variable de confirmación, como `F10_UX_SYNTHETIC_SEED=yes` (ver la cabecera de cada script).

### 3.4 Migración F07: sellado del histórico colectivo (2026-10-24)

`20261023100000_f07_collective_seal`. Contrato: `docs/architecture/F07_SEALED_HISTORY_CONTRACT.md` §4. Evidencia: `docs/evidence/F07_SELLADO_HISTORICO.md`.

**Qué crea:**
- las tablas `CollectiveSeal` (una versión sellada por campaña y tenant, con quién selló, el modo de divulgación, la política, el umbral y la referencia de la revisión) y `CollectiveSealEntry` (una entrada por celda, con su estado);
- el enum `CollectiveSealEntryStatus`: `DISCLOSED`, `SUPPRESSED_UNDER_THRESHOLD`, `SUPPRESSED_REVISION` y `OVERFLOW`.

**Qué garantiza la base**, con `CHECK` y disparadores:
- sólo la versión 1, sellada por `DIRECTIVA` o `ADMINISTRADOR`;
- sólo se sella una campaña `CERRADA` del mismo tenant;
- `CollectiveSeal` es inmutable: no admite `UPDATE` ni `DELETE`;
- las entradas se escriben en la misma transacción que crea el sellado, y sólo con una divulgación vigente de la misma celda;
- una entrada lleva divulgación exactamente cuando su estado es `DISCLOSED`.

Sólo amplía el esquema y, como las demás, no tiene vuelta atrás (§3.2). Crear las tablas no sella nada: sellar depende de `COLLECTIVE_SEALING` (§4.1).

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
| `COLLECTIVE_SEALING` (2026-10-24) | Sellado manual de la versión colectiva de una campaña (F07) | `enabled` \| `disabled`. **Desactivada por defecto** (plantilla `disabled`): sin definir o en `disabled`, sellar responde 409 `SEALING_DISABLED`. Otro valor no pasa la validación del arranque. Leer versiones ya selladas no depende de ella | No. **Condición de habilitación:** sólo con la compilación Mobile en uso que trate `CAMPAIGN_SEALED` como fallo terminal, comprobada en DEVICE con la APK de ese SHA (`F07_SEALED_HISTORY_CONTRACT.md` §3.2). Además, sellar exige un modo distinto de `POLICY_PENDING` (409 `POLICY_PENDING`), así que en producción hoy no se puede sellar |
| `BACKUP_STORAGE_PROVIDER` | Proveedor de respaldos | `disk` (si está vacío) \| `b2` | — |
| `BACKUP_STORAGE_DIR` | Directorio del proveedor de disco | sin valor: rutas en 503 | Sólo con `disk` |
| `BACKUP_MAX_BYTES` | Tamaño máximo de una copia | `104857600` (100 MiB); máximo 1 GiB | No |
| `BACKUP_MAX_ACTIVE_PER_MEMBER` | Copias verificadas que se conservan por agricultor | `5`; máximo 100 | No |
| `BACKUP_UPLOAD_DEADLINE_MS` | Plazo de una subida, como **reserva**: el límite efectivo del cuerpo es hoy el `requestTimeout` de Node, de 300 s (ver abajo) | `1800000` (30 min); entre 60 000 y 3 599 999 | No |
| `BACKUP_PRODUCTION_ADMISSION` | Abre los respaldos con `NODE_ENV=production` | `enabled` \| `disabled` (plantilla y compose `disabled`) | Cerrado salvo decisión (§7.3) |
| `BACKUP_REQUIRE_CLIENT_ENCRYPTION` (2026-10-24) | Rechaza las subidas nuevas del formato 1, sin cifrar en el teléfono | `true` \| `false`. Sin definir equivale a `false`, que es lo que pone la plantilla; otro valor no pasa la validación del arranque. Con `true`, una subida del formato 1 recibe 422 `BACKUP_ENCRYPTION_REQUIRED` antes de leer el cuerpo | No hoy. **Condición previa a datos reales** (enmienda del §5 del modelo de amenazas, §8). No es una admisión: no abre nada (§7.5) |
| `BACKUP_S3_ENDPOINT` | Endpoint S3 de B2 | origen `https` sin ruta, p. ej. `https://s3.<región>.backblazeb2.com` | Con `b2` |
| `BACKUP_S3_REGION` | Región | `[a-z0-9-]{1,32}` | Con `b2` |
| `BACKUP_S3_BUCKET` | Bucket privado | `[A-Za-z0-9-]{6,63}` | Con `b2` |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | Credenciales | secretos; el esquema sólo comprueba su forma, para no repetir el valor en un error | Con `b2` |
| `BACKUP_S3_PREFIX` | Un segmento terminado en `/` (p. ej. `ensayo-f08/`); nunca la raíz del bucket | Expresión de `env.schema.ts`: `^[a-z0-9][a-z0-9-]{0,62}/$`. Un prefijo de varios segmentos, como `ensayo-f08/b151-20261024/x/`, **no arranca la API** | Con `b2` |
| `LEGACY_PRIVATE_WRITES_ROLLBACK` | Rollback operativo del cierre de las escrituras privadas heredadas (fase 6 de #81, §10). **No es la vía normal** y no autoriza ningún despliegue | `enabled` \| `disabled` (vacía = `disabled`: cerradas) | No; debe quedar sin definir o en `disabled` |

**Constantes que no se configuran:**
- Abandono de una subida: 60 min (`BACKUP_UPLOAD_ABANDON_MS` en `backups-config.ts`). **No es una variable de entorno.**
- Límites de peticiones (`app.module.ts` y controladores de autenticación):
  - 20 por minuto en general;
  - 5 por minuto en el login;
  - 10 por minuto en `POST /auth/v2/refresh`.

  Se cuentan por la IP que ve Node. La API no configura `trust proxy` (§10).
- Prefijo global `api/v1`, Helmet, `ValidationPipe` con lista blanca, Swagger en `/docs`.
- `requestTimeout` de Node: 300 s, sin cambiar en `main.ts`. **Es el límite real de una transferencia**, y la app también corta a los 5 min (Mobile `remote_backup_api.dart`). Con el máximo de 100 MB, una subida exige unos **2,7 Mbit/s sostenidos** (`F08_BACKUP.md`, revisión B6). Un respaldo grande en una red rural lenta puede no caber.
- Swagger se monta en `/docs` **en todos los modos, también en producción** (`main.ts`). Es un riesgo productivo (§10).

**Proveedor `b2` incompleto:** el Backend registra sólo los **nombres** de las variables que faltan y deja las rutas de respaldo en 503. **Nunca cae al disco** (`backups.module.ts`).

**Configurar el proveedor `b2`** (comprobado sobre `4bcb1ea`):
- `BACKUP_STORAGE_PROVIDER=b2` y las seis `BACKUP_S3_*`: `ENDPOINT`, `REGION`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` y `PREFIX`.
- `BACKUP_S3_PREFIX` es **un solo segmento**. Lo que se guarda va debajo, en `<prefijo>objects/` y `<prefijo>staging/`.
- La clave debe estar limitada al bucket y a ese prefijo, con sólo `listFiles`, `readFiles`, `writeFiles` y `deleteFiles` (§7.2). El adaptador necesita listar: comprueba la existencia y la vigencia de cada copia por listado (§5.7).
- El bucket se usa con «Keep all versions»: los borrados van por id de versión (§5.4).
- Las credenciales entran sólo como variables del proceso. El cliente S3 no usa la cadena de credenciales por defecto ni registra nada.
- Las herramientas de ensayo de #160 usan prefijos de varios segmentos, pero no pasan por `env.schema.ts`: construyen el adaptador con su propio prefijo, que validan ellas (§7.4).

### 4.2 Web y app

| Dónde | Variable | Uso |
|---|---|---|
| Web (compilación) | `VITE_LEGACY_FARMER_WEB=enabled` | Muestra las pantallas heredadas del agricultor. Por defecto, apagado: un agricultor ve sólo el aviso «Esta Web es para la Directiva y el Administrador». **Con el Backend por defecto, esas pantallas no pueden guardar** (403 `LEGACY_ROUTE_CLOSED`): para eso haría falta además `LEGACY_PRIVATE_WRITES_ROLLBACK=enabled` en el servidor (§10) |
| Web (desarrollo) | `VITE_API_PROXY_TARGET` | Destino del proxy de Vite (por defecto `http://localhost:3000`) |
| App (compilación) | `AGRO_API_BASE_URL` | Origen HTTPS del Central (§2.4) |

---

## 5. Respaldos privados en el servidor

Trazabilidad: RF-26, RF-27, RNF-04, RNF-10, DAT-14, CU-14 y CU-15 (`F08_BACKUP_THREAT_MODEL.md`). Lo que ve el agricultor está en el manual de usuario.

### 5.1 Proveedores

| Proveedor | Uso | Cómo guarda | Evidencia |
|---|---|---|---|
| `disk` (`LocalDiskBackupStorage`) | **Sólo desarrollo y pruebas** | `staging/` con fsync y renombrado atómico a `objects/<uuid>`; archivos 0600 y carpetas 0700 | `F08_BACKUP.md` **[Probado]** |
| `b2` (`S3BackupStorage`) | Proveedor elegido por Roderich el 2026-10-19; sin uso productivo | `<prefijo>staging/<clave>.<hex>.part`, luego `CopyObject` con la versión fijada a `<prefijo>objects/<clave>`; multipart por encima de 8 MiB. Desde el 2026-10-24, existencia y vigencia por listado (§5.7) | `F08_BKP_07_B2_ADAPTER.md` (doble S3) y `F08_BKP_07_B2_ENSAYO_REAL.md` (B2 real) **[Probado]**. Con el adaptador de 2026-10-24: `F08_BKP_08_B2_REAL_REPETICION.md` y `…_ACOTADA.md` **[Probado]**, con sobres sintéticos |

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
  - *2026-10-24:* los tres se midieron en B2 real (#151, ítems 2, 3 y 4: `F08_BKP_08_B2_REAL_REPETICION.md`). `BadDigest` y la copia de la versión fijada pasan. En la paginación, el adaptador pasa (3a-bis y 3c), pero 3a sigue en FAIL como comportamiento del proveedor (H2, §5.7).
- **SSE-B2 no es cifrado de extremo a extremo.** Quien tenga una clave de lectura del bucket puede leer las copias.
  - *2026-10-24:* sigue siendo así para el formato 1. En el formato 2 lo que se lee es ciphertext: la clave la tiene sólo el agricultor.

**Formatos y forma exterior (2026-10-24, `backup-format.ts`; Mobile F08-ADR-003 §4 y §5.1):**
- `X-Backup-Format-Version` ∈ {1, 2}. Otro valor recibe 422 `BACKUP_FORMAT_INVALID` antes de leer el cuerpo, con `Connection: close`.
- **Formato 2**, cifrado en el teléfono: cabecera de 80 bytes, el ciphertext y una etiqueta de 16 bytes. El servidor comprueba sólo la forma exterior:
  - magic `AGROENC\0`;
  - versión 2 en la cabecera;
  - algoritmo 1 (ChaCha20-Poly1305 + HKDF-SHA256);
  - flags 0;
  - longitud total exactamente igual a 80 + la longitud declarada + 16.

  Si no cumple, responde 422 `BACKUP_FORMAT_INVALID`, la fila queda `FAILED FORMAT_INVALID` y no se guardan bytes.
- **Formato 1**, el `.agrobackup` sin cifrar: sólo se comprueba que no empiece por el magic del 2. Su contenido no se inspecciona.
- **El servidor no tiene la clave y no afirma haber comprobado el contenido descifrado.** El SHA-256 de transporte es el de los bytes recibidos, cifrados en el formato 2. El teléfono valida el contenedor después de descifrar.
- `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true` rechaza el formato 1 con 422 `BACKUP_ENCRYPTION_REQUIRED` (§4.1). Por defecto está desactivada: las copias del formato 1 y la herramienta de #160 siguen funcionando.
- **[Probado]:** `backup-format.spec.ts` (unidad, también `BACKUP_ENCRYPTION_REQUIRED`) y `encrypted-format.backups.postgres.spec.ts` (PostgreSQL), en la CI. En B2 real, con sobres sintéticos (`F08_BKP_08_B2_REAL_REPETICION.md`): el formato 2 queda en B2 byte a byte con SSE `AES256`, y el formato 1 con la variable en `true` se rechaza sin llegar a B2.

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
- **En la práctica, una transferencia se corta a los 5 min**, por el `requestTimeout` de Node y por el cliente Mobile. La fila queda `FAILED`, sin bytes, y la copia anterior se conserva.
- El plazo propio de 30 min (`BACKUP_UPLOAD_DEADLINE_MS`) es una reserva por si ese límite cambiara. Al vencer, la fila queda `FAILED UPLOAD_DEADLINE`, sus bytes se purgan y la respuesta es 503 con `Connection: close`.
- Una fila `UPLOADING` con más de 60 min se cierra como `FAILED ABANDONED` en la siguiente reserva.

**Probado:** suites con PostgreSQL (16 casos de retención y 5 sobre el doble S3, con mutaciones M1–M8 detectadas) y, contra B2 real, la rotación 5 + 1, que deja 0 versiones físicas de la copia retirada, y el 409 por concurrencia (ensayo §1). **[Probado]**

**No probado contra B2 real** (sólo en las suites): el borrado del propietario durante la rotación (C2), el abandono con finalización tardía (C5) y la cota con un proveedor que rechaza los borrados (T-R5).
- *2026-10-24:* los tres se midieron en B2 real con el adaptador corregido y la herramienta de #160 (`F08_BKP_08_B2_REAL_REPETICION.md`, #151 ítem 6): C2, C5 y T-R5 pasan, también con la purga de la rotación rechazada por el proveedor (T-R5r). T-R5a pasa por la causa prevista: un `DeleteObject` rechazado tras la copia. Las 5 copias siguen siendo una decisión técnica académica, no un período institucional.

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
  - *2026-10-24:* la CLI sigue **[Sin probar]** contra B2 real. Lo que se midió en B2 es el `list()` del adaptador en el que se apoya, con páginas de 1 (3c, `F08_BKP_08_B2_REAL_REPETICION.md`). El paso «inventario» de la herramienta de #160 es un listado propio de sólo lectura, no esta CLI.

**Cuándo ejecutar `--reconcile` (2026-10-24).** Cuando el log del módulo registre una limpieza de staging que no terminó (§5.7):

```sh
npm run backups:inventory -- --reconcile           # cuenta lo pendiente por motivo; no cambia nada
npm run backups:inventory -- --reconcile --apply   # reintenta las purgas de las filas con purga pendiente
```

- `--reconcile --apply` reintenta la purga de cada fila `FAILED` o `DELETED` con `purgePending`: si es `FAILED`, primero `discardStaged`, y en los dos casos después el borrado del objeto (`backup-retention.ts`). `discardStaged` aborta las multipartes y purga las versiones de los nombres de staging **de esa clave**, y vuelve a listar. Sólo baja `purgePending` cuando las dos cosas terminan bien.
- Una multiparte sin fila que la reclame aparece en el inventario como `incompleteUpload`. Se retira con `--cleanup --older-than-minutes <N>` (N ≥ 60), primero sin `--apply` para ver el plan, y después `--reconcile --apply`.
- Si después de eso sigue habiendo restos, es un caso de revisión humana: no se borra nada a mano por prefijo.

### 5.6 Recuperación ante fallos de respaldo

| Síntoma | Causa probable | Qué hacer | Estado |
|---|---|---|---|
| Todas las rutas de respaldo responden 503 | Admisión cerrada en producción, proveedor `disk` sin `BACKUP_STORAGE_DIR` o `b2` incompleto | Revisar el log de arranque, que nombra las variables que faltan. No abrir la admisión sin la decisión de §7.3 | [Probado] (`F08_BACKUP.md`, `F08_BKP_07_B2_ADAPTER.md`) |
| Un agricultor recibe 409 `BACKUP_UPLOAD_IN_PROGRESS` sin tener ninguna subida en curso | Fila `UPLOADING` colgada tras un reinicio del servidor | Esperar al cierre por abandono (≤ 60 min desde que empezó). No borrar la fila a mano | Límite declarado (`F08_BKP_06_RETENCION.md`, evidencia) |
| Un respaldo grande, en una red lenta, falla a los 5 min | `requestTimeout` de Node (300 s) y límite del cliente | La fila queda `FAILED`, sin bytes, y la copia anterior se conserva. Hace falta una red más rápida o un respaldo más pequeño. Ampliar el límite exige cambiar el código (Node y app) | Límite declarado (`F08_BACKUP.md`, B6) |
| Un agricultor recibe 503 en cada subida y la cola de purgas crece | El proveedor rechaza los borrados | Corregir el acceso al proveedor y ejecutar `--reconcile --apply` | [Probado] en el doble S3; sin probar en B2 real |
| El inventario termina con código 3 | Copia `AVAILABLE` sin objeto o con otro tamaño | Revisión humana; no hay corrección automática | [Sin probar] en un entorno conservado |
| Restos tras una limpieza manual | `purgePending` sigue activo | `--reconcile --apply` | Límite declarado |
| *2026-10-24:* el log del módulo `Backups` muestra `Backup staging cleanup after STAGE_FAILED` o `DISCARDED` (`…): pending reconciliation: <códigos>` | Una subida falló o se descartó, y la limpieza de su staging no pudo confirmar que no queda nada (§5.7) | `--reconcile`, y después `--reconcile --apply` (§5.5). Si el código es `MULTIPART_OWNERSHIP_AMBIGUOUS`, revisar antes: nada se abortó a propósito | [Probado] en el doble S3 y, para 5b, en B2 real (`F08_BKP_08_B2_REAL_ACOTADA.md`). La secuencia del operador, [Sin probar] |
| *2026-10-24:* 422 `BACKUP_FORMAT_INVALID` | Versión de formato desconocida, o un cuerpo sin la forma de su formato: un formato 2 truncado o con otra cabecera, o un formato 1 que empieza por `AGROENC\0` | Ninguna en el servidor: la fila queda `FAILED FORMAT_INVALID`, sin bytes, y la copia anterior se conserva. Es un fallo del cliente o del transporte | [Probado] (`encrypted-format.backups.postgres.spec.ts`) |
| *2026-10-24:* 422 `BACKUP_ENCRYPTION_REQUIRED` | Subida del formato 1 con `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true` | Actualizar la app a una versión que cifre (Mobile `1d77c14` o posterior). No desactivar la variable para dejarla pasar si hay datos reales | [Probado] en unidad (`backup-format.spec.ts`) y en B2 real (`F08_BKP_08_B2_REAL_REPETICION.md`) |

### 5.7 Adaptador B2: comportamientos del proveedor y limpieza pendiente (2026-10-24)

Diseño: `F08_BACKUP_THREAT_MODEL.md` §9. Código: `Back/src/modules/backups/infrastructure/s3-backup-storage.ts`, en `4bcb1ea`. Los comportamientos se observaron **en ese entorno B2 y con las claves temporales del ensayo**; no se afirma que ocurran en todas las configuraciones de B2.

| Caso | Qué hace B2 | Qué hace el adaptador |
|---|---|---|
| **H1** | `HeadObject` y `GetObject` de un nombre inexistente responden 403, no 404 | La existencia se decide **por listado** (`ListObjectVersions` con el nombre exacto, igualdad exacta). Un listado denegado, inválido, estancado o que llega al límite de páginas **falla cerrado**: nunca se toma como «no existe». Tras un 403 de `GetObject`, lista el nombre: si no hay versión vigente, la copia se trata como ausente, igual que con un 404 |
| **H2** | Al paginar, marca `IsLatest` en la primera entrada de cada nombre en cada página | La vigente de cada nombre es la marcada en la **primera página** donde aparece. Si no hay exactamente una, falla cerrado (`S3_LISTING_INCONSISTENT`). Las purgas trabajan sobre todas las versiones, por id, y no consultan `IsLatest` |
| **H3** | En una multiparte, el error del proveedor podía llegar enmascarado como `AbortError` del origen | **Gana el primer fallo:** del proveedor, del plazo propio de la llamada (`S3_DEADLINE_EXCEEDED`) o del origen. Un 403 sigue llegando como `AccessDenied` |
| **5b** | Un corte con `CreateMultipartUpload` en vuelo podía dejar una multiparte cuyo `UploadId` el adaptador no conocía | Cada intento sube a su propio nombre de staging, `staging/<clave>.<16 hex>.part`. Si no conoce el `UploadId`, lista las multipartes con **ese nombre exacto** y aborta sólo si hay exactamente una; luego vuelve a listar. Nunca aborta por el prefijo de la clave ni toca otros intentos, otras claves ni `objects/` |

**Informe de limpieza.** Cada limpieza del staging de un intento fallido (`STAGE_FAILED`) o descartado (`DISCARDED`) deja una línea en el log del módulo `Backups`. Si quedó completa, con nivel *log*; si no, con nivel *warn*:

```text
Backup staging cleanup after <STAGE_FAILED|DISCARDED>[ (<provider|deadline|source> <nombre del error>[ <estado HTTP>])]: complete
Backup staging cleanup after <STAGE_FAILED|DISCARDED>[ (…)]: pending reconciliation: <código>, <código>…
```

La línea lleva sólo códigos, el nombre del error y el estado HTTP. Nunca lleva nombres de objetos, claves ni mensajes del proveedor. «complete» sólo se escribe cuando un listado comprobó que no queda nada del intento.

**Códigos de limpieza pendiente** (`S3StagingPending`):

| Código | Qué significa | Qué hizo el adaptador |
|---|---|---|
| `MULTIPART_OWNERSHIP_AMBIGUOUS` | Hay más de una multiparte con el nombre del intento | No aborta ninguna |
| `MULTIPART_LISTING_FAILED` | Falló el listado de las multipartes del intento: no se sabe si queda alguna | Nada |
| `MULTIPART_CREATION_UNKNOWN` | `CreateMultipartUpload` quedó sin respuesta y el listado no muestra nada: aún podría aparecer | Nada |
| `MULTIPART_REMAINS` | La multiparte del intento sigue listada después de abortarla | La abortó, pero no puede confirmarlo |
| `STAGING_PURGE_FAILED` | No se pudieron purgar y comprobar las versiones del nombre de staging del intento | Nada más |

**Qué hacer:** lo pendiente lo recogen `discardStaged` de la fila `FAILED` y el inventario (§5.5). Hay que ejecutar `--reconcile` y, después, `--reconcile --apply`. Ninguno de estos casos expone ni pierde datos, y la copia anterior del agricultor se conserva.

**Riesgos residuales:**
- la pertenencia de una multiparte descansa en que la parte aleatoria de 64 bits del nombre no se repita;
- la existencia por listado no es una reserva atómica (modelo de amenazas §9);
- se depende de que el SDK informe bien `$metadata.attempts`; si no, el resultado se toma como desconocido y se busca.

**[Probado]:**
- en el doble S3: `s3-backup-storage.spec.ts`, bloques «#151: what B2 answered…» y «#151 5b and H3»;
- contra B2 real, con sobres sintéticos: H1 y H2 en `F08_BKP_08_B2_REAL_REPETICION.md`, y 5b y H3, tras su corrección, en `F08_BKP_08_B2_REAL_ACOTADA.md` (14/14).

Los resultados anteriores se conservan: 3a sigue en FAIL como comportamiento del proveedor, y la repetición mantiene 5b en FAIL y 1-ro en NO_CONCLUYENTE. **No hay alertas configuradas** sobre estas líneas (§7.5).

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
  - la copia actual se asegura como `.previo-<fecha>.db` (checkpoint, comprobación del `-wal` y SHA-256), y sus fotos como la carpeta `invoices.previo-<fecha>`;
  - si algo falla después de sustituir, se revierte entera;
  - los envíos pendientes pasan a `RESTORE_PAUSED` y sólo salen cuando el agricultor los libera con acceso verificado.

  **[Probado]**: en host (`F10_RESTORE_WAL_ROLLBACK.md`) y en el POCO X5 Pro, con reversión forzada y copias alteradas, ajenas o «zip bomb» rechazadas (`F10_RESTORE_DEVICE.md`, 2026-10-16). El POCO usa *rollback journal*, no WAL.
- **Restauración desde el servidor:** descarga a `.part`, comprueba cabecera, tamaño y SHA-256 antes de renombrar. **[Probado]** contra disco (`F08_MOBILE_RESTORE.md` §5) y contra B2 real (ensayo §2).
- **Límites declarados:**
  - las copias `.previo`, de la base y de la carpeta de fotos, se acumulan sin retención;
  - no hay cifrado del lado del cliente;
  - no hay respaldo automático ni programado.

> **Actualización del 2026-10-24** (Mobile `main` `1d77c14`, #144; diseño en Mobile `docs/adr/F08-ADR-003-respaldo-cifrado-y-previo.md`). Los dos primeros límites anteriores quedan superados para el respaldo en el servidor; el tercero sigue igual.
> - **Cifrado en el teléfono (formato 2).** El contenedor `.agrobackup` se genera en la carpeta privada y se cifra con ChaCha20-Poly1305 en streaming (`cryptography` 2.9.0). La clave de cada archivo se deriva por HKDF-SHA256 de una **clave de recuperación** aleatoria de 256 bits. Antes de subir, el teléfono vuelve a descifrar y validar la copia. **Sólo sube el formato 2.**
> - **Clave de recuperación.** Se muestra para anotarla en papel (56 caracteres en Base32 de Crockford, con comprobación) y hay que volver a escribirla entera antes de la primera subida. Se guarda en `flutter_secure_storage` (almacén `agrocuentas_backup_keys_v1`), fuera de SQLite y del respaldo. **No hay escrow:** ni el servidor, ni la Directiva, ni el operador la tienen. Volver a verla o cambiarla exige el PIN del titular.
> - **Restauración desde el servidor:** sesión del mismo titular; tamaño y SHA-256 de transporte; descifrado con la etiqueta verificada a un `.part` privado; validación interna y comprobación del titular; confirmación de la persona; y `GuardedRestore.restore`. Una clave equivocada o un archivo alterado no tocan la base activa.
> - **Copias del formato 1** del servidor: se listan como «SIN CIFRAR (formato anterior)» y se restauran con un aviso. No se convierten ni se borran en silencio.
> - **`.previo`**: van a `<databases>/previo/` con un registro durable (`registro.json`). Se conservan como mucho 2 resueltas y ninguna con más de 7 días. Nunca se retiran una `preparing` ni una `interrupted`, y una `interrupted` bloquea otra restauración. Las `.previo-*.db` heredadas junto a la base no se borran solas.
> - **Respaldo de Android:** `backup_rules.xml` y `data_extraction_rules.xml` excluyen los cinco dominios de la app, en la nube y en la transferencia entre dispositivos. Desinstalar o cambiar de teléfono sin un respaldo propio pierde los datos.
> - **Lo que sigue sin cifrar:** la exportación manual a `Descargas` (EVO-001).
> - **[Probado]** en el host (Mobile `F08_RESPALDO_CIFRADO_HOST.md`) y en el POCO X5 Pro, en las tres rondas de A (Mobile `F01_F08_DEVICE_COMPOSICION_2026-10-24.md`). En esas rondas la copia cifrada quedó en el disco del Backend desechable, **no en B2**. Lo que sigue pendiente está en F08-ADR-003 §0.4.

### 6.1 Restauración en un teléfono nuevo: cuenta más clave (2026-10-24)

Para restaurar una copia cifrada en un teléfono nuevo, reinstalado o con el llavero ilegible hacen falta **las dos cosas**:

1. **La cuenta del titular.** Se activa la app con el titular (Auth V2 y el flujo de activación). El servidor sólo lista y sirve copias del mismo agricultor y tenant. A otro agricultor o a otro tenant le responde un 404 indistinguible; a la Directiva y al Administrador, un 403.
2. **La clave de recuperación anotada.** Si el `key_id` de la cabecera no está en el llavero, la app la pide.
   - Primero comprueba la suma de verificación. Una clave mal escrita da un error de escritura.
   - Después compara su `key_id` con el de la copia. Una clave de otra copia da «La clave de recuperación no corresponde a esta copia», y la base no cambia.
   - Sólo entonces descifra y sigue el orden de §6.
   - Si la restauración termina bien, la clave queda en el llavero como confirmada. Es la activa si no había otra; si ya había una activa, queda retirada y sirve sólo para descifrar.

**Ninguna de las dos sustituye a la otra:**
- recuperar la contraseña o el PIN no descifra nada, y cambiarlos no inutiliza las copias;
- la clave sola no permite descargar;
- **perder a la vez el teléfono y la clave anotada hace irrecuperables las copias cifradas.** El soporte no puede recuperarlas.

Después de restaurar, los envíos pendientes quedan en `RESTORE_PAUSED` hasta que el agricultor los libera.

**Estado de las pruebas:**
- **[Probado] en el host:** sin la clave, `RecoveryKeyRequired`; con la correcta, se restauran los datos, las fotos y la cola en pausa; con una equivocada, `wrongKey` (Mobile `F08_RESPALDO_CIFRADO_HOST.md` §2.3).
- **[Probado] en el POCO X5 Pro:** tras `pm clear` y reactivar, una clave señuelo bien formada se rechaza sin cambios (D7c). La pausa y la liberación sin duplicado también (D7e, tercera ronda).
- **[Sin probar] en el teléfono:**
  - el camino positivo en una instalación nueva, con la clave correcta escrita a mano;
  - un teléfono de otro modelo (#151, ítem 7);
  - una copia cifrada por el teléfono que pase por B2 real.

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
| B2, ensayos de #151 (2026-10-24) | Raíz `ensayo-f08/b151-20261024/`, con una subcarpeta nueva por ejecución. Tres claves temporales de mínimo privilegio, limitadas a esa raíz: `b151-rw`, `b151-ro` y `b151-nodel`. La clave amplia no se usó. Según la sesión A, Roderich revocó las tres ese mismo día. Cada subcarpeta terminó en 0 versiones, 0 marcadores y 0 multipart |

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
- monitorización;
- una decisión sobre el límite de 5 min por transferencia (§4.1) para respaldos grandes en redes lentas;
- si hay un proxy delante de la API, su configuración para respaldos y `trust proxy` (§10);
- Swagger desactivado o protegido (§10);
- un procedimiento probado de copia y restauración de PostgreSQL (§9.3).

Ver también el §10 del diseño de retención. Lo que añade F01–F08 está en §7.5.

### 7.3 Admisión productiva cerrada

- Con `NODE_ENV=production`:
  - las rutas de respaldo responden 503 salvo `BACKUP_PRODUCTION_ADMISSION=enabled`;
  - Sync v1 responde 503 salvo `SYNC_V1_PRODUCTION_ADMISSION=enabled`;
  - las cifras colectivas siempre están en `POLICY_PENDING`.
- **Ninguna de las ocho condiciones del §5 del modelo de amenazas se cumple por completo** (`F08_BACKUP_THREAT_MODEL.md`, con sus notas fechadas). Algunas están avanzadas:
  - condición 1: el proveedor está elegido (B2), pero faltan los costos y quién lo administra;
  - condición 4: la retención está implementada, pero sin un período aprobado;
  - condición 8: el E2E en dispositivo se hizo con datos sintéticos (MOB #36, Partial).

  Faltan del todo el cifrado en reposo que proteja del operador, TLS real, el cupo global, las copias del propio almacenamiento y la decisión explícita de Roderich.

  > **Nota del 2026-10-24.** El cifrado que protege del operador ya existe en el teléfono (formato 2, F08-ADR-003). La condición 2 está cumplida **en el diseño y en las pruebas sintéticas**, con los matices del modelo de amenazas §8 y §9. Para datos reales se añade la condición `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true`. Las demás condiciones no cambian y la admisión sigue cerrada.
- La política de divulgación colectiva tampoco está aprobada para datos reales (`F07_AGGREGATE_DISCLOSURE_POLICY.md`; #107; GATE-F07 Pending).

### 7.4 Herramientas de ensayo (2026-10-24)

**Herramienta de #160 (`tool/f08_b2/`)**, para #151 §A, ítems 1 a 6, contra Backblaze B2 real o contra el doble S3. Sólo con datos sintéticos.

| Archivo | Para qué |
|---|---|
| `b151_ejecutar.ps1` | Lanza la secuencia completa. Cada paso se ejecuta con su clave temporal, que `con_b2.ps1` (fuera del repositorio, con el almacén de secretos de Roderich) inyecta sólo en el proceso de ese paso. No lee, no imprime ni pasa por argv ninguna clave |
| `b151_b2.cjs` | Los pasos de los ítems 1 a 5, con el adaptador real y llamadas S3 en crudo. Antes de tocar nada pregunta a B2 qué puede hacer la clave, y se niega si no es exactamente el perfil declarado, en ese bucket y bajo la raíz del ensayo |
| `Back/src/modules/backups/b151-b2-real.postgres.spec.ts` y `test-support/b151-b2-real.ts` | El ítem 6 (C2, C5, T-R5 y la rotación), por la API real, con PostgreSQL desechable. `npm test` lo recoge y lo salta si falta su entorno |
| `b2_api_trial.cjs`, `b2_cut_multipart.cjs`, `s3_inspect.cjs` | Del ensayo del 2026-10-19: la API compilada contra B2, la subida multiparte cortada y una inspección de sólo lectura del prefijo |

```powershell
powershell -ExecutionPolicy Bypass -File tool\f08_b2\b151_ejecutar.ps1 -Raiz ensayo-f08/b151-<aaaammdd>/ -Subcarpeta <nombre-nuevo> -Salida <dir> [-ConC6 -Formato 1|2] [-Limpiar]
```

- **`-Raiz` es obligatoria y no tiene valor por defecto** (`F08_B151_RAIZ`). Es el `namePrefix` de las claves temporales de ese ensayo.
- **`-Formato` es obligatorio con `-ConC6`** (`F08_B151_FORMATO`, 1 o 2), también sin valor por defecto. Con 2, la API del ítem 6 se ejecuta con `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true`.
- Sin `-ConC6` no se ejecuta el ítem 6. Con `-ConC6` hace falta `F08_BKP_PG_TEST_URL`, que debe apuntar a un PostgreSQL desechable.
- La herramienta exige `BACKUP_S3_PREFIX = <raíz><subcarpeta>/`, y «preparar» exige que la subcarpeta esté vacía. Es un prefijo de varios segmentos que **no** sirve para la API (§4.1).
- `-Limpiar` borra al final, con la clave rw, todas las versiones, marcadores y multipartes **de la subcarpeta**.
- Contra el doble, sin B2: `node tool/f08_b2/b151_b2.cjs doble todos <todo|acotada|c6> <dir-salida>`. Esto **no es B2**: valida la herramienta.
- **Trazabilidad:** las tres ejecuciones del 2026-10-24 usaron commits de ensayo, no la versión integrada en `main` (`8ce0263`). Cuál se usó en cada una está en `docs/evidence/F08_BKP_08_HERRAMIENTA_B151.md`, «Nota del 2026-10-24».

**Arnés Mobile (`tool/f03_res_01/`, Mobile `main` `1d77c14`): modo `drop-refresh-response` del observador.**
- **Qué hace:** `fault.sh drop-refresh-response` deja una línea en `<registro>.fault`. El siguiente `POST /api/v1/auth/v2/refresh` se reenvía a Central y se lee su respuesta entera, pero no se entrega al teléfono. Central ya rotó la renovación y el teléfono no recibe la nueva: es una **cuarentena real** de la sesión, sin tocar el código de la app.
- **Cómo se consume:** cada modo sólo se consume en su ruta. El de refresh no toca un push, y los modos de push no tocan un refresh. Cada línea vale para una petición.
- **Qué registra:** como los demás modos, sólo hora, método, ruta con los UUID enmascarados y estado. Nunca cabeceras ni cuerpos.
- **Dónde se usó:** en la tercera ronda DEVICE de A, D1 y D2 (Mobile `F01_F08_DEVICE_COMPOSICION_2026-10-24.md`).
- **Límite conocido:** el bloque de uso de la cabecera del observador y el README del arnés todavía no describen este modo. Sí lo hacen `fault.sh` y un comentario del observador.

### 7.5 Pendiente para producción, por separado (2026-10-24)

Nada de esto existe todavía. Se suma a §7.2 y §7.3, y no se cumple con la entrega académica:
- **Cifrado exigible:** `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true` antes de admitir datos reales, con una app que cifre en todos los teléfonos en uso.
- **Claves de B2 por entorno**, de mínimo privilegio y limitadas al bucket y al prefijo productivo, con su rotación y su procedimiento de revocación (#151, ítems 8 y 9). Hay que decidir qué se hace con la clave amplia del ensayo de #149.
- **Alertas** sobre las líneas `pending reconciliation` del adaptador (§5.7), un `backups:inventory --reconcile` periódico, y control de capacidad y costos.
- **Reglas del bucket** fuera del prefijo de ensayo: versiones, lifecycle y Object Lock (#151, ítem 15).
- **Retención institucional** para datos reales (plazo, número de copias y purga) y el **ciclo de cierre de cuenta o servicio**: el plazo de 30 días no está aprobado.
- **Pruebas que faltan en el teléfono** (F08-ADR-003 §0.4): rendimiento (NOT_MEASURED), rotación completada, archivo alterado, Auto Backup y D2D reales, otro modelo de teléfono, una copia cifrada por el teléfono a través de B2, y la comprobación con personas de cómo se guarda la clave.
- **Revisión del paquete `cryptography`** antes de cualquier admisión real: tiene un solo mantenedor (F08-ADR-003 §2.3).
- **`COLLECTIVE_SEALING`:** habilitarla sólo con su condición (§4.1). Hoy, además, la impide `POLICY_PENDING`.
- **Admisión productiva** (`BACKUP_PRODUCTION_ADMISSION`): la decide Roderich. No la abre ninguna de estas variables.

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

- **Backend:** volver al `dist/` de un SHA anterior. Una versión anterior a F02 arrancó contra la base ampliada, con login, `me` y refresh correctos (`F02_IAM_05.md`, 2026-09-24). **[Probado] sólo para esa versión.** Con la cadena actual de 12 migraciones está **[Sin probar]** (13 desde el 2026-10-24, también **[Sin probar]**).
  - *2026-10-24:* un `dist/` anterior a F08-ADR-003 (por ejemplo, `2a69fe6`) acepta cualquier `X-Backup-Format-Version` entero ≥ 1. Guardaría el formato 2 sin comprobar su forma exterior, e ignoraría `BACKUP_REQUIRE_CLIENT_ENCRYPTION`, así que volvería a admitir el formato 1 aunque estuviera en `true`. Un `dist/` anterior a F07 no usa las tablas de sellado. **[Sin probar]**.
- **Web:** volver a desplegar la compilación anterior. **[Sin probar]**.
- **App:** reinstalar una APK anterior no baja el esquema SQLite. **[Sin probar]**, y no se recomienda sin una copia `.agrobackup` previa.

### 9.2 Restauración en el teléfono

Ver §6. Es el único procedimiento de recuperación de datos probado de punta a punta: en disco el 2026-10-16 y en B2 real el 2026-10-19.

*2026-10-24:* esas dos pruebas fueron con el **formato 1**, sin cifrar. Con el formato 2, la restauración en el teléfono se probó contra el disco del Backend desechable (§6), no contra B2. En un teléfono nuevo hacen falta la cuenta y la clave (§6.1).

### 9.3 Base del Central

**[No existe]:**
- no hay procedimiento de copia y restauración de PostgreSQL (`pg_dump`/`pg_restore`) en ningún repositorio;
- no hay restauración del almacenamiento de respaldos (condición 6 del §5 del modelo de amenazas);
- no hay rotación de `JWT_SECRET`, `JWT_REFRESH_SECRET` ni de las claves de B2.

La única rotación con soporte es la de la clave de huella de Sync v1, mediante `SYNC_V1_FINGERPRINT_PREVIOUS_KEYS`. Está probada en unidad («verifies with previous versions after a rotation…», `Back/src/modules/sync-v1/domain/fingerprint.spec.ts:53`) y descrita en `F05_SYNC_05.md`.

**Precondición de cualquier paso *contract*.** Antes de una migración que retire tablas, columnas o rutas (fases 6 y 9 de `docs/scope/TRANSITION_PLAN.md`, BE #81), hacen falta dos cosas:
- un ciclo **probado** de copia y restauración de la base del Central;
- `docs/scope/LEGACY_CONTRACT_CONSUMERS.md` con cero consumidores en el HEAD de ese momento.

Lo probado en los respaldos es el **respaldo privado del teléfono**, no la base central (`F10_CONTRASTE_81_Y_VALIDATION.md`, fila 81-M, en BE #153). Hoy ningún paso *contract* está autorizado ni se ha ejecutado.

> **Nota del 2026-10-19 (fase 6 limitada de #81, sin reescribir lo anterior).** La fase 6 que se aplicó es sólo el **cierre reversible** de las escrituras privadas heredadas (`docs/evidence/F81_FASE6_CIERRE_ESCRITURAS.md`).
> - **Por qué no exige esta precondición:** no retira rutas, tablas, columnas, modelos ni datos, no tiene migración y se revierte con `LEGACY_PRIVATE_WRITES_ROLLBACK=enabled`.
> - **Cuándo sí la exige:** la PHASE 9, o cualquier parte de la PHASE 6 que llegue a retirar rutas, modelos o datos.

### 9.4 Reparación de la migración inicial

Una base creada con la migración inicial anterior a la eliminación del BOM sigue siendo compatible con Prisma 6.19.3 (`INITIAL_MIGRATION_BOM_REPAIR.md`). **[Probado]**. Hay que repetir la comprobación si cambia la versión mayor de Prisma.

---

## 10. Riesgos de la configuración de ejemplo

`docker-compose.yml` es de **desarrollo y demostración**. No sirve para producción tal como está:
- **Migraciones:** el arranque hace `migrate deploy || db push`. Si la migración falla, `db push` cambia el esquema sin historial. En producción hay que quitar esa alternativa.
- **Semilla:** se ejecuta en **cada arranque**.
  - La contraseña pública de demostración sólo se pone al **crear** una cuenta: el `upsert` no cambia `passwordHash` al actualizar (`seed.ts`). Una contraseña ya rotada se conserva.
  - Pero cada arranque **reactiva** las cuentas de la semilla que se hubieran desactivado.
- **Cookies:** pone `COOKIE_SECURE: "false"` junto a `NODE_ENV=production`.
- **Secretos:** `JWT_SECRET` y `JWT_REFRESH_SECRET` son marcadores `change-me…`.
- **Sync v1:** no define las variables `SYNC_V1_*`, así que Sync v1 responde 503.
- **Respaldos:** usa el proveedor de disco en un volumen con la admisión cerrada.
- **Tamaño de las subidas tras nginx:** `Web/nginx.conf` no fija `client_max_body_size`, cuyo valor por defecto en nginx es 1 MiB. Si la app usara ese nginx como origen, las subidas de respaldo grandes se rechazarían antes de llegar a la API. Los ensayos no pasaron por ese nginx. **[Sin probar]**.

  En el mismo `location /api/` hay otros tres valores por defecto, también **[Sin probar]** y con efecto productivo:
  - **`proxy_request_buffering on`:** nginx recibe el cuerpo entero, en memoria o en disco, antes de reenviarlo. El 413 y el SHA-256 en flujo de la API llegan después, y nginx necesita disco para el cuerpo.
  - **`proxy_read_timeout` de 60 s:** después de recibir el cuerpo, el adaptador B2 puede tardar hasta unos 420 s en el peor caso (commit de 180 s y purga de 120 s, con sus llamadas). Si pasa de 60 s, nginx responde 504 mientras la API puede terminar la copia: la app vería un fallo con la copia ya creada.
  - **Sin `trust proxy`:** la API no lo configura, y el límite de peticiones usa la IP de la petición. Detrás de nginx, **todos los clientes comparten la IP del proxy**: los límites de 20 por minuto, de 5 por minuto en el login y de 10 por minuto en el refresh pasan a ser globales, y el log de errores registra la IP de nginx.

  **Mitigación, a verificar antes de usar ese esquema:**
  - un `location` propio para `/api/v1/me/backups` con `client_max_body_size` ≥ `BACKUP_MAX_BYTES`, `proxy_request_buffering off` y `proxy_read_timeout` > 420 s;
  - `trust proxy` en la API, limitado al proxy propio.

  La otra opción es que la app use directamente el origen TLS de la API.
- **Swagger en producción:** la documentación interactiva de la API se publica en `/docs` también con `NODE_ENV=production` (`main.ts`). Hay que decidir si se desactiva o se protege.
- **Rutas heredadas de escritura privada:** la API sigue aceptando del AGRICULTOR, sobre lo suyo, `POST /purchases`, `/inventory`, `/applications`, `/plots`, `/accounts-payable` y `/sync/operations` (`docs/security/AUTHORIZATION_MATRIX_VIGENTE.md` §2.4). La app (`463d3ec`) no usa ninguna, y la Web sólo con `VITE_LEGACY_FARMER_WEB=enabled` (`docs/scope/LEGACY_CONTRACT_CONSUMERS.md`). En un despliegue, otro cliente podría escribir datos privados en el Central. Cerrarlas es la PHASE 6 de BE #81, que no está iniciada y depende de una decisión de Roderich. Mientras tanto queda como **límite productivo**.

  > **Actualización del 2026-10-19 (fase 6 limitada de #81, sin reescribir lo anterior).**
  > - **Qué cambia:** por decisión de Roderich, las 16 escrituras privadas heredadas del AGRICULTOR están **cerradas por defecto**: responden 403 `LEGACY_ROUTE_CLOSED`, sin efectos (`docs/evidence/F81_FASE6_CIERRE_ESCRITURAS.md`).
  > - **Lo que no cambia:** las lecturas, `calendar/events` y las funciones centrales.
  > - **Rollback:** sólo del servidor, con `LEGACY_PRIVATE_WRITES_ROLLBACK=enabled` (§4.1). Registra un aviso en el arranque; no es la vía normal ni autoriza ningún despliegue.
  > - **Qué sigue:** no se retiró ninguna tabla, modelo ni dato, y ningún paso *contract* está autorizado (§9.3). Quedan como límite productivo las **lecturas** privadas heredadas y la posibilidad de activar el rollback.
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
- *2026-10-24:* **lo pendiente para producción después de F01–F08** está en §7.5; las pruebas que faltan en el teléfono, en Mobile F08-ADR-003 §0.4. Este manual no cierra Roderich1/Agro_Sindicato_Backend-Web#151, no cambia ningún gate y no habilita datos reales.
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
| *2026-10-24:* formato 2 y `BACKUP_REQUIRE_CLIENT_ENCRYPTION` | Mobile F08-ADR-003 §4–§6; `F08_BACKUP_THREAT_MODEL.md` §8; `backup-format.ts` | `backup-format.spec.ts`; `encrypted-format.backups.postgres.spec.ts`; `F08_BKP_08_B2_REAL_REPETICION.md` |
| *2026-10-24:* adaptador B2 (H1, H2, H3, 5b) y limpieza pendiente | `F08_BACKUP_THREAT_MODEL.md` §9; `s3-backup-storage.ts` | `s3-backup-storage.spec.ts`; `F08_BKP_08_B2_REAL_FORMATO2.md`, `…_REPETICION.md` y `…_ACOTADA.md` |
| *2026-10-24:* herramienta de #160 | `tool/f08_b2/`; `b151-b2-real.postgres.spec.ts` | `F08_BKP_08_HERRAMIENTA_B151.md` |
| *2026-10-24:* sellado F07 y su migración | `F07_SEALED_HISTORY_CONTRACT.md` §3–§4 | `F07_SELLADO_HISTORICO.md` |
| *2026-10-24:* respaldo cifrado y restauración en el teléfono | Mobile F08-ADR-003 §3, §5 y §7 | Mobile `F08_RESPALDO_CIFRADO_HOST.md`; Mobile `F01_F08_DEVICE_COMPOSICION_2026-10-24.md` |
| *2026-10-24:* arnés Mobile, `drop-refresh-response` | Mobile `tool/f03_res_01/observer.cjs` y `fault.sh` | Mobile `F01_F08_DEVICE_COMPOSICION_2026-10-24.md`, tercera ronda |
