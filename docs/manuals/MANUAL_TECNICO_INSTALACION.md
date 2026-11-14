# Manual técnico: instalación, configuración, actualización y recuperación de Agrocuentas

| Campo | Valor |
|---|---|
| Estado | **Manual técnico actual** (composición final de cierre). **No existe ningún despliegue institucional** y **ninguna APK está lista para distribuir**: la release sale sin firmar y la candidata de evaluación OE5 es una compilación de prueba firmada con la clave de depuración |
| Fecha de redacción | 2026-11-13 |
| Versión descrita | Backend/Web `main` `200fe60` (código `0946d9f`; `Back/` idéntico desde `744930d`). Mobile `main` `34e9926` (código `aeeb4f0`), esquema SQLite 20, contrato del agricultor 4 |
| Revisión | 2026-11-14: comprobado de nuevo contra Backend/Web `main` `a8b6504` (código de la Web y de la Bitácora en `af449ba`; `a8b6504` añade la corrección de `PARTICIPATION_REQUIRED`, sin migración) y Mobile `main` `65e1004` (cuyo `lib/` sólo difiere de `34e9926` en la evidencia de voz; desde `e9c3b30` sólo cambia una prueba). Sigue habiendo 24 migraciones y el esquema SQLite 20 |
| Cómo se comprobó | Nombres de variables, comandos y rutas leídos en esos commits (`Back/src/config/env.schema.ts`, `Back/.env.example`, `Back/Dockerfile`, `docker-compose.yml`, `Web/nginx.conf`, `Web/vite.config.ts`, Mobile `android/app/build.gradle.kts`, `lib/services/auth/api_endpoint_config.dart`, `tool/voice_local/`). Resultados de las pruebas: `docs/cierre/RESUMEN_CIERRE_2026-11-13.md` y `docs/evidence/CIERRE/README.md` |
| Sustituye a | [`F11_MANUAL_TECNICO.md`](F11_MANUAL_TECNICO.md), que se conserva como documento histórico y como referencia detallada de los respaldos del servidor (su apartado 5 sigue vigente: el código de `Back/src/modules/backups` no cambió desde `075a511`) |
| Manuales relacionados | [Agricultor](MANUAL_AGRICULTOR.md) · [Directiva](MANUAL_WEB_DIRECTIVA.md) · [Administración](MANUAL_WEB_ADMINISTRACION.md) · [Índice](README.md) |

**Marcas:**
- **[Probado]**: lo ejecutó una evidencia fechada, que se cita.
- **[Sin probar]**: se deduce del código o de la configuración; hay que verificarlo antes de usarlo.
- **[No existe]**: no hay procedimiento ni código para eso.

**Secretos.** Ninguna contraseña, token o clave se escribe en archivos, registros, evidencias o commits. Todos se pasan como **variables de entorno** desde un almacén cifrado del operador. Este manual no contiene ningún valor secreto, ni de ejemplo.

---

## 1. Componentes y versiones

| Pieza | Tecnología y versión | De dónde sale |
|---|---|---|
| API (Backend) | NestJS 11, Prisma 6.19.3, Node.js 22 | `Back/package.json`, `Back/Dockerfile` (`node:22-alpine`) |
| Base de datos | PostgreSQL 16 | CI y `docker-compose.yml` (`postgres:16-alpine`) |
| Web institucional | React 19 + Vite, servida por nginx | `Web/package.json`, `Web/Dockerfile`, `Web/nginx.conf` |
| App móvil | Flutter 3.47.2, JDK 17; `applicationId` `com.comunidad.agro.agroquimicos`; `pubspec` 1.0.0+1 | Mobile CI, `android/app/build.gradle.kts` |
| Voz local | Vosk + whisper.cpp (modelos base y small), fuera de Git | Mobile `tool/voice_local/` |

**Versiones compatibles:** la app de `aeeb4f0` (y la de `65e1004`) necesita la API de `0946d9f` o posterior (`af449ba`, `a8b6504`) (contrato del agricultor 4, cabecera `X-Joint-Purchase-Contract: 4`). La API acepta los contratos 1–3 para lectura y responde `APP_UPDATE_REQUIRED` / `409` a las escrituras retiradas. **Hay que desplegar la API antes que la app.**

---

## 2. Backend

### 2.1 Construir

```sh
cd Back
npm ci
npx prisma generate
rm -f tsconfig.build.tsbuildinfo     # un tsbuildinfo viejo puede dejar dist/ sin main.js
npm run build                        # nest build
npm run start:prod                   # node dist/main.js
```

[Probado] `npm run build` y la suite completa con PostgreSQL sobre `744930d`: 86 suites, 1015 pruebas pasan, 13 omitidas, 0 fallan; `npm run openapi:check` pasa en `7afd574` (en Windows hace falta la regla `eol=lf` de `.gitattributes`). Sobre `191fbe2` (fusionado como `af449ba`): 1032 pasan, 13 omitidas, 0 fallan; Web 744/744 (`docs/evidence/REVISION_OE1_OE4_CORRECCIONES_2026-11-13.md`).

### 2.2 Variables de entorno

Se validan al arrancar (`Back/src/config/env.schema.ts`); un valor inválido detiene el arranque. Plantilla sin valores: `Back/.env.example`.

| Grupo | Variables | Notas |
|---|---|---|
| Básicas | `NODE_ENV`, `PORT` (3000), `DATABASE_URL`, `CORS_ORIGIN`, `COOKIE_SECURE` | `COOKIE_SECURE=true` detrás de HTTPS |
| Sesión (secretos) | `JWT_SECRET` (≥ 12 caracteres), `JWT_REFRESH_SECRET` (≥ 32), `JWT_EXPIRES_IN` (15m), `JWT_REFRESH_EXPIRES_IN` (7d) | Generarlos en el almacén del operador; cambiarlos invalida todas las sesiones |
| Sincronización v1 | `SYNC_V1_FINGERPRINT_KEY` (secreto, base64 ≥ 32 bytes), `SYNC_V1_FINGERPRINT_KEY_VERSION`, `SYNC_V1_FINGERPRINT_PREVIOUS_KEYS`, `SYNC_V1_PRODUCTION_ADMISSION` | Sin clave, `POST /sync/v1/push` responde 503. En producción la admisión sigue cerrada salvo `enabled` |
| Cifras colectivas | `COLLECTIVE_DISCLOSURE_MODE`, `COLLECTIVE_DISCLOSURE_POLICY`, `COLLECTIVE_SEALING` | Apartado 3. **No están en `.env.example`** |
| Respaldos privados (F08) | `BACKUP_STORAGE_PROVIDER` (`disk` o `b2`), `BACKUP_STORAGE_DIR`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID` y `BACKUP_S3_SECRET_ACCESS_KEY` (secretos), `BACKUP_S3_PREFIX`, `BACKUP_MAX_BYTES`, `BACKUP_MAX_ACTIVE_PER_MEMBER`, `BACKUP_UPLOAD_DEADLINE_MS`, `BACKUP_REQUIRE_CLIENT_ENCRYPTION`, `BACKUP_PRODUCTION_ADMISSION` | Apartado 7. Antes de datos reales: `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true` |
| Fotos de etiqueta (E1) | `PRODUCT_PHOTO_STORAGE_PROVIDER`, `PRODUCT_PHOTO_STORAGE_DIR`, `PRODUCT_PHOTO_S3_PREFIX`, `PRODUCT_PHOTO_SWEEP_INTERVAL_MS`, `PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK` (90) | Sin almacenamiento, las rutas de foto responden 503 y el resto de la identificación funciona. Barrido manual: `npm run product-photos:sweep` |
| Estimación (F12) | `ESTIMATION_WORKER`, `ESTIMATION_WORKER_INTERVAL_MS`, `ESTIMATION_LEASE_MS`, `ESTIMATION_MAX_PRODUCTS`, `ESTIMATION_MAX_ATTEMPTS` | El trabajador corre dentro del proceso de la API |
| Convocatorias | `JOINT_PURCHASE_CLOSE_INTERVAL_MS` (vacío = 60000 ms; `disabled` = sin cierre automático en este proceso) | Cierra las convocatorias vencidas con la hora límite como corte |
| Rutas heredadas | `LEGACY_PRIVATE_WRITES_ROLLBACK` | Dejar vacío o `disabled`: las escrituras privadas heredadas responden 403 |

### 2.3 Migración de la base: `prisma migrate deploy`

```sh
cd Back
DATABASE_URL=… npx prisma migrate deploy
```

- La cadena tiene **24 migraciones** (`Back/prisma/migrations/`), desde `20260618010000_init_expanded_flow` hasta **`20261113120000_e4_acceso_rol_sin_k`**.
- La de E4 es **aditiva**: tablas y columnas nuevas, sin borrar ni reescribir datos. Los permisos retirados (ver participantes, «Sustituir responsable») quedan como historial de auditoría. Crea la tabla `CollectiveDisclosurePolicyActivation`, sólo de inserción.
- **No use `prisma migrate dev` ni `prisma db push` en una base con datos.**

[Probado] en las bases desechables de la suite (`prisma migrate deploy` en las tres bases F02) y en la API del recorrido de cierre. **[Sin probar]** sobre una base con datos reales: no existe ninguna.

### 2.4 Comprobaciones tras arrancar

- `GET /api/v1/health` → `{status:'ok', …}` (no comprueba la base).
- El registro de arranque dice qué política colectiva rige y si insertó una activación (`policy=F07-POL-02 (unchanged)` o una fila nueva).
- La documentación interactiva se publica en `/docs` también en producción: hay que decidir si se protege o se desactiva [Sin probar].

---

## 3. Política de divulgación colectiva (`COLLECTIVE_DISCLOSURE_POLICY`)

| Variable | Valores | Efecto |
|---|---|---|
| `COLLECTIVE_DISCLOSURE_POLICY` | vacío (= `F07-POL-01`), `F07-POL-01`, `F07-POL-02` | `F07-POL-01`: mínimo de 3 aportantes por cifra (K = 3). `F07-POL-02`: totales sin nombres, **sin mínimo de aportantes**. Otro valor **detiene el arranque** |
| `COLLECTIVE_DISCLOSURE_MODE` | `disabled`, `provisional-synthetic` | Sólo fuera de producción, `provisional-synthetic` publica cifras con la política anterior para datos sintéticos |
| `COLLECTIVE_SEALING` | `enabled`, `disabled` (por defecto) | Habilita el sellado manual de una campaña cerrada |

**Activación trazada.** El primer arranque con `COLLECTIVE_DISCLOSURE_POLICY` explícita inserta una fila en `CollectiveDisclosurePolicyActivation`; cada cambio posterior (también la vuelta a la anterior) inserta otra. La tabla es sólo de inserción. **Lo sellado con `F07-POL-01` no se recalcula**: cada versión sellada conserva su «Política aplicada al sellar».

**Adoptada por el autor, activación institucional pendiente.** El autor del proyecto adoptó `F07-POL-02` el 2026-11-13 (contrato E4, D-00 y D-03); no es una aprobación institucional. Activarla en un entorno real lo decide el sindicato (GOV-02, BE #185), no el operador. Sin la regla de combinaciones, los totales sin nombres **no garantizan anonimato** (D-04). Mientras no exista esa decisión, la configuración del recorrido de cierre (`COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`, `COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02`) sólo vale para datos sintéticos.

**Hallazgo para el operador (lectura del código de `0946d9f`):** con `NODE_ENV=production`, la API ignora `provisional-synthetic` y queda en `POLICY_PENDING`, es decir, **no publica ninguna cifra colectiva** cualquiera que sea `COLLECTIVE_DISCLOSURE_POLICY` (`Back/src/modules/collective/application/collective-config.ts`). No hay ningún valor que represente una política aprobada. Publicar cifras en producción exige, además de la decisión institucional, un cambio de código o de configuración que hoy no existe. La Web lo muestra así: «El sindicato no aprobó aún la política de publicación.»

[Probado] con datos sintéticos: arranque con `F07-POL-02`, una sola activación, «Política aplicada» en Resumen, Cobertura y Excel (`docs/evidence/E4/README.md`, `docs/evidence/CIERRE/README.md`). **[Sin probar]:** el sellado y las tendencias con `F07-POL-02`.

---

## 4. Web institucional

```sh
cd Web
npm ci
npm run build          # tsc -b && vite build → Web/dist
```

- La Web llama a la API por la ruta **relativa** `/api/v1`. En producción, el servidor que entrega `dist/` debe reenviar `/api/` a la API en el mismo origen; `Web/nginx.conf` lo hace hacia `http://api:3000/api/` y sirve `index.html` para las rutas de la aplicación.
- `VITE_API_PROXY_TARGET` sólo sirve para el servidor de desarrollo de Vite (por defecto `http://localhost:3000`).
- `CORS_ORIGIN` de la API debe incluir el origen de la Web si no se sirven en el mismo origen.

[Probado] sobre `0946d9f`: `tsc` 0 errores, `eslint` 0 errores (7 avisos), `npm run build` correcto (32 entradas precacheadas), `vitest` 743/743. **[Sin probar]** la imagen Docker de la Web con esta versión.

**Riesgos de `Web/nginx.conf` si la app usa ese mismo origen** [Sin probar]: no fija `client_max_body_size` (1 MiB por defecto: rechazaría respaldos grandes), usa `proxy_request_buffering on` y `proxy_read_timeout` de 60 s; y la API no configura `trust proxy`, así que detrás de nginx los límites de peticiones serían globales. Ver el manual histórico (apartado 10) para la mitigación propuesta.

---

## 5. App móvil (APK)

### 5.1 Compilar

```sh
flutter build apk --release --dart-define=AGRO_API_BASE_URL=https://<origen-de-la-API>
```

- **`AGRO_API_BASE_URL`** se fija **al compilar**. Debe ser `https`, con host, sin usuario, sin ruta (salvo `/`), sin consulta ni fragmento. Sin ella (o inválida), las funciones en línea (activación, sincronización, convocatorias, respaldos en la nube, identificación) dan un error de configuración; lo local funciona.
- **Una APK queda atada al origen con que se compiló.** Si cambia el dominio, hay que recompilar desde el mismo commit; el SHA-256 del archivo cambia aunque el código sea el mismo.

### 5.2 Firma: requisitos de la keystore

- `android/app/build.gradle.kts` lee la firma de **`android/key.properties`** (plantilla sin valores: `android/key.properties.example`, con `storeFile`, `storePassword`, `keyAlias`, `keyPassword`).
- **Sin `key.properties`, la compilación de release queda sin firmar a propósito.** No se firma con la clave de depuración: es pública, Google Play la rechaza y permitiría suplantar una actualización. Un APK sin firmar **no se puede instalar**.
- La keystore la genera y custodia **el propietario**, fuera del repositorio y con copia de seguridad (`keytool -genkey … -alias agrocuentas`, ver la plantilla). `key.properties` y los `.jks` están en `.gitignore`. **Perder la keystore impide publicar actualizaciones.**
- Las contraseñas de la keystore no se escriben en el repositorio, en registros ni en mensajes.

### 5.3 Modelos de voz

Los modelos (`android/app/voice-models`) y las bibliotecas nativas de whisper.cpp (`android/app/src/main/jniLibs/`) **no están en Git**. Sin ellos la app compila y la voz dice «La voz no está disponible en este teléfono. Complete el formulario a mano.»

```sh
bash tool/voice_local/fetch_voice_models.sh            # Vosk + Whisper base + small (~310 MB), con verificación SHA-256
bash tool/voice_local/build_whisper_libs.sh            # arm64-v8a y x86_64
bash tool/voice_local/build_voice_apk.sh arm64 <carpeta>   # APK de voz para teléfono (exporte antes AGRO_API_BASE_URL)
```

- La compra por voz necesita el modelo **small**; con sólo `base`, la compra por voz queda no disponible.
- La APK con modelos pesa unos 340 MB.
- Procedencia, licencias y hashes: Mobile `tool/voice_local/THIRD_PARTY.md`. Uso: `tool/voice_local/README.md`.
- ADR-005 está aceptado **sólo provisionalmente para la demostración**; no hay evaluación con audio real ni precisión medida.
- **Evidencia de dictado: sólo en la compilación de evaluación.** Con `--dart-define=AGRO_VOICE_EVIDENCE=true` (y `AGRO_APP_COMMIT=<sha>`) la app añade la pantalla de permiso «Evaluación de la voz» y, con permiso, guarda en el teléfono lo propuesto por la voz y lo confirmado o corregido, sin audio, fuera de Sync, de lo colectivo y del respaldo. Sin esa opción la ruta no existe y no se guarda nada (`lib/presentation/voice/voice_evidence_hook.dart`). La release y cualquier APK para usuarios se compilan **sin** ella.

### 5.4 Estado de las APK de cierre

Ninguna de estas APK es una distribución. Todas están fuera de Git, en `_artefactos/cierre/` (con `SHA256SUMS`).

**Release de `34e9926`** (la de la composición final):

| Campo | Valor |
|---|---|
| Archivo | `_artefactos/cierre/agrocuentas-release-34e9926-SIN-FIRMAR.apk` (fuera de Git), 110 989 325 B |
| SHA-256 | `c7b947a2ff4b0ae4c3d35e07217d012e676dc2b59d7e409744dc7c03cdc84798` |
| Compilación | `flutter build apk --release` (Flutter 3.47.2) en `34e9926`, worktree limpio, **sin `--dart-define`** |
| Firma | **Sin firmar** (`apksigner verify` → `DOES NOT VERIFY`) |
| API | Ninguna compilada |
| Voz | Sin modelos ni bibliotecas |

**Release de `e9c3b30`** (Mobile `main` tras la corrección de la evidencia de voz, #193): `agrocuentas-release-e9c3b30-SIN-FIRMAR.apk`, 111 136 781 B, SHA-256 `8a55761f57f6cd26fde930e8eddb5a1aa63bc8dc127efbad3422375ce00fce13`; también **sin firmar**, sin API y sin modelos de voz. No se registró ninguna release de `65e1004` (sólo cambia una prueba respecto de `e9c3b30`).

**Candidata de evaluación OE5** (`agrocuentas-oe5-e9c3b30-arm64-profile-referencia-sin-origen.apk`, 335 568 625 B, SHA-256 `7d4612f895e36ab5145b7918824976cc393d72c44d89847f566d3ddd5ebe0358`): compilación `profile` arm64-v8a de `e9c3b30`, paquete `.oe5` («AC OE5»), **firmada con la clave de depuración**, con `AGRO_VOICE_EVIDENCE=true` y los modelos de voz. **Es una compilación de prueba, no una distribución.** No lleva origen de API, así que no puede activarse: el día de la evaluación se recompila desde el mismo SHA con el origen vigente y se registra su SHA-256 (`docs/evidence/REVISION_OE1_OE4_CORRECCIONES_2026-11-13.md`).

**Las release no están listas para distribuir ni son instalables.** Las APK del recorrido en emulador (paquetes `.cierre`, `.acc`, `.ind`, perfil x64, clave de depuración, origen de un túnel ya cerrado) son sólo de revisión.

### 5.5 Lo que falta para distribuir, por separado

| Requisito | Quién | Estado |
|---|---|---|
| Keystore de release y `android/key.properties` | Propietario (Roderich Rendón) | **Pendiente** |
| API desplegada en un origen HTTPS estable, con su base migrada y sus secretos | Sindicato y operador (desplegar no estaba autorizado) | **Pendiente** |
| `--dart-define=AGRO_API_BASE_URL=…` con ese origen | Operador, al compilar | **Pendiente** (depende de lo anterior) |
| Modelos de voz y bibliotecas nativas en la APK, si se ofrece voz | Operador | **Pendiente** (decisión: con o sin voz; tamaño) |
| Decisión institucional sobre `F07-POL-02` y sobre datos reales | Sindicato | **Pendiente** |
| Prueba en un teléfono físico de la composición final | Autor | **Pendiente** |

---

## 6. Actualización

### 6.1 Backend y Web

1. Copia de la base (ver 7.3: no hay procedimiento probado).
2. Detener la API; desplegar el `dist/` nuevo.
3. `npx prisma migrate deploy` (aplica `20261113120000_e4_acceso_rol_sin_k` si falta).
4. Arrancar con las variables del apartado 2 y, si lo decidió el sindicato, `COLLECTIVE_DISCLOSURE_POLICY`.
5. `GET /api/v1/health` y el registro de la política.
6. Publicar el `Web/dist` nuevo.

**Vuelta atrás:** un `dist/` anterior contra la base migrada con E4 está **[Sin probar]**. La migración es aditiva, pero un `dist/` anterior no conoce las reglas de E4.

### 6.2 App: de esquema 19 a 20 conservando los datos

- Instalar la APK nueva **encima** de la anterior (actualización del sistema o `adb install -r`) conserva los datos. Al abrir, la base migra **19 → 20**: añade la tabla `joint_purchase_access_ops` y su disparador `trg_joint_purchase_access_ops_sequence`; no reescribe filas.
- No hay que reactivar. Las participaciones con textos anteriores a CONV-4 no se reescriben: la app ofrece «Revisar quién puede ver mi participación».
- La app anterior (`507efc8`, esquema 19, contrato 3) sigue leyendo; en convocatorias muestra «Actualice la aplicación» y consulta la lista cada unos 60 s mientras está abierta.
- **Requisito de Android:** la actualización sólo se acepta con el **mismo `applicationId` y la misma firma** que la app instalada. Una APK de revisión firmada con la clave de depuración (o con sufijo de paquete) no se puede actualizar con una release firmada con la keystore del propietario: habría que desinstalar, y eso **borra los datos locales** salvo que antes se haga un respaldo (apartado 7) [Sin probar].
- Reinstalar una APK anterior **no** baja el esquema: no se recomienda sin un respaldo previo [Sin probar].

[Probado] en el emulador (recorrido M2 del cierre, 2026-11-13): `install -r` de `507efc8` a `aeeb4f0`, esquema 19 → 20, 44 → 45 tablas, filas anteriores intactas, cifras idénticas, sin reactivar (`docs/evidence/CIERRE/mobile/recorrido.md`; también E4 2.3). Sin teléfono físico.

---

## 7. Respaldo y recuperación (F08)

### 7.1 En el teléfono

- **Respaldo local** («Exportar respaldo»): archivo con la base y las fotos de factura, en el almacenamiento de la app. Las fotos de etiqueta no se incluyen.
- **Respaldo en la nube:** formato 2, **cifrado en el teléfono** con la clave de recuperación del agricultor (ChaCha20-Poly1305 + HKDF-SHA256). El servidor sólo guarda la copia cifrada y no tiene la clave.
- **Restauración:** en un teléfono nuevo hacen falta la cuenta y la clave de recuperación. El PIN no viaja. Los envíos al sindicato que traiga la copia quedan pausados hasta «Liberar».
- **Copias previas a restauraciones** (`copia.previo-…`): hasta dos, siete días; una restauración sin resolver deja su copia protegida y bloquea otra restauración.

El código de respaldo del teléfono no cambió desde Mobile `774ae88` (2026-10-31), salvo su lugar en la navegación. [Probado] en el POCO X5 Pro (`22101320G`) el 2026-10-19 (formato 1, Backblaze B2) y el 2026-10-24 (formato 2, restauración en instalación nueva con la copia cifrada desde B2), con versiones anteriores y datos sintéticos (Mobile `docs/evidence/F01_F08_DEVICE_*`; Backend `docs/evidence/F08_BKP_07_B2_ENSAYO_REAL.md`). **[Sin probar]** con la composición final en un teléfono.

### 7.2 En el servidor

- Proveedores: `disk` (sólo desarrollo y pruebas) o `b2` (Backblaze B2 por su API S3; elegido por el autor el 2026-10-19; **sin uso productivo**). Una configuración `b2` incompleta deja las rutas en 503.
- Integridad: SHA-256 recalculado al recibir y antes de entregar.
- Retención: las 5 copias verificadas más recientes por agricultor (`BACKUP_MAX_ACTIVE_PER_MEMBER`); decisión técnica académica, no un período institucional.
- Herramienta del operador (desde `dist/`): `npm run backups:inventory` (sólo conteos), `-- --reconcile [--apply]` (purgas pendientes), `-- --cleanup --older-than-minutes <N> [--apply]`.
- En producción, los respaldos siguen cerrados (503) salvo `BACKUP_PRODUCTION_ADMISSION=enabled`, **no autorizado**.

Detalle completo (formatos, purgas, comportamiento de B2, códigos de error): manual histórico, apartados 5 y 6, que siguen vigentes para este código.

### 7.3 Base del Central

**[No existe]:** procedimiento probado de copia y restauración de PostgreSQL (`pg_dump`/`pg_restore`), restauración del almacenamiento de respaldos y rotación de `JWT_SECRET`, `JWT_REFRESH_SECRET` o de las claves de B2. La única rotación con soporte es la de la huella de Sync v1 (`SYNC_V1_FINGERPRINT_PREVIOUS_KEYS`). Antes de admitir datos reales hay que definir y probar la copia de la base.

---

## 8. `docker-compose.yml`: sólo desarrollo y demostración

El archivo de la raíz **no sirve para producción** tal como está:
- arranca con `prisma migrate deploy || prisma db push`: si la migración falla, `db push` cambia el esquema sin historial;
- ejecuta la semilla de demostración en cada arranque (reactiva sus cuentas);
- trae marcadores en lugar de secretos y `COOKIE_SECURE: "false"` con `NODE_ENV=production`;
- no define `SYNC_V1_*` (la sincronización responde 503) ni las variables colectivas;
- usa respaldos en disco con la admisión cerrada.

---

## 9. Pendiente y límites

- Sin despliegue institucional, sin datos reales, sin keystore de release, sin API pública.
- Publicación de cifras colectivas en producción: sin mecanismo de política aprobada (apartado 3).
- Copia de la base del Central: no existe.
- Deshabilitar una cuenta da 401 (no 403).
- Bitácora: desde `af449ba` registra cuentas, roles, nombres equivalentes y catálogo; siguen sin registro generar un borrador, fijar o quitar su referencia de estimación y el módulo de acceso `iam` (H-08, reducido).
- Una prueba de Backend dio una vez un tiempo de espera de 5 s al arrancar Nest en el runner de CI; pasó al relanzar sin cambios.
- Ninguna prueba en teléfono físico de la composición final.

## 10. Trazabilidad de procedimientos

Respaldos RU-11, CU-14, CU-15, RF-26, RF-27, RNF-04, RNF-10; sincronización RU-16, CU-11, RF-18, INT-08; política y sellado RF-24, RNF-05; aislamiento RNF-04, RNF-05; voz INT-07 (según `docs/cierre/MATRIZ_DOCUMENTO_GRADO.md`).
