# F10 — Protocolos de evaluación de Agrocuentas: rendimiento, compatibilidad y usabilidad

- **Fecha:** 2026-10-16 (America/La_Paz).
- **Borrador preparado por la sesión A de Claude Code; no es un resultado; ningún protocolo se ha ejecutado.**
- **Estado:** sin aprobar. Ningún umbral de este documento está acordado.
- **Issues:** rendimiento BE #48 (F10-QA-04); usabilidad móvil MOB #37 (F10-UX-01) y Web BE #47 (F10-UX-02); E2E crítico BE #43 (F10-QA-01); gate BE #49 (GATE-F10). La compatibilidad (RNF-08) no tiene un issue propio.
  - La SRS exige fijar umbrales, dataset, repeticiones y percentiles **antes de medir** (RNF-06, RNF-07; SRS-AGRO-001 §9.1).
  - Prohíbe convertir en criterio de aprobación un valor elegido después de ver los resultados.
- **Registro de aprobación del protocolo (lo completa Roderich; vacío a propósito):**

| Versión | Fecha real | Quién aprueba (Roderich / tutor) | Umbrales modificados | Commit donde se publica |
|---|---|---|---|---|
| | | | | |

**Fuentes leídas:**
- SRS-AGRO-001 v1.0 §5, §6, §7, §9, §9.1, §11 y §12;
- URS-AGRO-001 v1.0 §9.1–9.3 y §11;
- Proyecto de Grado v1.5: §1.7.3–1.8.3, §2.9.4, §3.4.3 y §3.12;
- `_briefs/F10_AGROCUENTAS_DECISIONES_Y_PROMPTS_2026-10-16.md`;
- Backend `e027938` (`docs/scope`, `docs/evidence/*GATE*`, `docs/testing/F05_SYNC_06_PLAN_FISICO_F10.md`, `F07_WEB.md`, `F08_BACKUP.md`);
- Mobile `4f203c7` (`docs/evidence`, `tool/f03_res_01`, `tool/f08_bkp`, `android/app/build.gradle.kts`, `.github/workflows/flutter-ci.yml`).

---

## 0. Condiciones comunes a los tres protocolos

1. **Datos y aplicación.**
   - Sólo datos sintéticos.
   - Se usa una **copia aislada nueva** de la app, con un sufijo de paquete propio: `.f10eval` para medir y `.f10ux` para usabilidad (nombres propuestos).
   - Nunca se usa la app normal, la demo ni las copias de ensayos anteriores (`.f03res01`, `.f06d4`, `.f03e2b`, `.f08bkp`).
   - Antes y después de cada sesión: `adb shell pm list packages | grep agroquimicos` debe mostrar la app normal intacta.
2. **Producción cerrada.**
   - Las admisiones (`SYNC_V1_PRODUCTION_ADMISSION`, `BACKUP_PRODUCTION_ADMISSION`) se abren sólo en el entorno desechable y sintético, como en los arneses F03 y F08.
   - `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` es necesario para ver cifras en la Web, porque F07-POL-01 (BE #107) no está aprobada. Esto no evalúa ni aprueba esa política.
3. **Backend de evaluación.**
   - Contenedor PostgreSQL, volumen y puertos **nuevos**. Propuesta: `agro_a_f10eval_pg`, `agro_a_f10eval_pgdata`, PG 55448, API 3118 y observador 3119. Antes de usarlos, confirmar con `docker ps` y `netstat` que están libres.
   - Migraciones aplicadas en orden y Backend compilado (`node dist/main.js`, `NODE_ENV=production`), como en `tool/f03_res_01/up.sh`.
   - No se detiene, borra ni reutiliza ningún entorno conservado (`PARALELO_CONTROL.md` §0).
4. **Versiones que se registran en cada corrida:**
   - SHA de Backend, Web y Mobile;
   - SHA-256 de la APK y modo de compilación (debug, profile o release);
   - Flutter 3.47.2, la versión de CI (`flutter-ci.yml:28`);
   - imagen y digest de PostgreSQL;
   - versión de `cloudflared`;
   - versión exacta del navegador;
   - SHA del generador del dataset y su semilla;
   - versión aprobada de este protocolo.
5. **Base de evaluación (la decide Roderich).**
   - Hoy es BE `e027938` y MOB `4f203c7`.
   - **Ninguna medición de restauración se hace sobre `4f203c7`**: tiene el riesgo de la copia de rollback con SQLite en WAL (archivo de decisiones F10). Se espera la corrección de C ya integrada.
6. **Resultados.** Se usan los valores de la tesis §3.12.6:
   - **CUMPLE** (PASS);
   - **NO CUMPLE** (FAIL);
   - **BLOQUEADA**;
   - **NO EJECUTADA**.

   Cada resultado lleva su procedencia: `DEVICE`, `EMULADOR`, `HOST` o `CI`. Las procedencias no se mezclan, y una prueba de host no cuenta como `DEVICE`.
7. **Percentiles.**
   - Se calculan por rango más cercano sobre los valores crudos ordenados; con n = 10, el p90 es el 9.º valor.
   - Siempre se publican todos los valores crudos, la mediana, el p90 y el máximo.
   - Una repetición fallida (timeout, 429, 5xx o un cierre de la app) **no se descarta**: cuenta como fallo y se informa en la tasa de error.
8. **Secretos.**
   - Las credenciales salen de `tool/f03_res_01/credential.sh` y `secrets.sh`, y sólo viven en variables de la shell.
   - Ningún token, contraseña ni `DATABASE_URL` aparece en evidencias, logs, capturas ni commits.
9. **Git Bash.** Las rutas de `adb` se pasan con `MSYS_NO_PATHCONV=1`.

---

## 1. Protocolo de rendimiento (RNF-06)

### 1.1 Objetivo
Medir, con un dataset, entorno y repeticiones fijados de antemano, el tiempo de las operaciones críticas locales (Mobile) y centrales (Backend y Web). Después, compararlo con umbrales aprobados antes de medir.

### 1.2 Requisitos trazados
- **RNF-06** (Should): RU-04, RU-13 y RU-17. SRS §9: «Los umbrales numéricos, dataset, repeticiones y percentiles se fijarán antes de la ejecución del plan de pruebas y no podrán declararse cumplidos sin medición».
- **Operaciones medidas:**
  - RF-17 y RNF-02 (operación sin red);
  - RF-07 y CU-06 (compra);
  - RF-09, RF-10 y CU-07 (existencias e historial);
  - RF-18 y CU-11 (sincronización);
  - RF-22, RF-24, CU-13 y CU-12 (vista agregada);
  - RF-26, RF-27, INT-06, CU-14 y CU-15 (respaldo);
  - RNF-09 (versiones reproducibles).
- **Escenario de la tesis:** P-16 «Operaciones bajo carga» (Tabla 3.64; RNF-06/08; CU-07/11/12).

### 1.3 Alcance y exclusiones
- **Incluye** R1–R6 (§1.5).
- **Excluye:**
  - pruebas de carga concurrente del servidor; F05_GATE_EVALUATION declara «sin prueba de carga»;
  - voz (F09);
  - el rendimiento en producción, que no existe;
  - el consumo de batería y memoria, que no tiene ID en la SRS y puede añadirse si Roderich lo pide.

### 1.4 Condiciones
- **Dispositivo:** POCO X5 Pro 5G `22101320G`, Android 12 (API 31), MIUI `V14.0.7.0.SMSMIXM`, el único físico disponible. Se registra:
  - `getprop ro.product.model`, `ro.build.version.release`, `ro.build.version.sdk` y `ro.build.version.incremental`;
  - `wm size`, `wm density` y la batería (≥ 50 %, se anota si está cargando);
  - las apps en segundo plano, cerradas.
- **Compilación:**
  - APK aislada en modo **profile** o release. El modo debug de Flutter no sirve para medir tiempos.
  - `build_isolated_apk.sh` hoy sólo añade el sufijo al tipo `debug`; adaptarlo es un pendiente previo.
- **Redes:**
  - **N0** sin conexión: `tool/f03_res_01/device.sh net off`.
  - **N1** Wi-Fi local + túnel HTTPS (Cloudflare quick tunnel), como en los ensayos F03/F05/F08.
    - Línea base del túnel: 10 × `curl -s -o /dev/null -w '%{time_total}'` al endpoint de salud desde el PC, antes y después de cada bloque.
  - **N2** red degradada: sólo en emulador (`-netdelay` / `-netspeed`) o con el throttling de DevTools en la Web. En el POCO no hay forma controlada de degradar la red, y se declara como limitación.
- **Backend:** el de §0.3, en el PC de desarrollo; se registran CPU, RAM y sistema operativo. El limitador global es de **20 peticiones/min** (`ThrottlerModule`, `app.module.ts:30`): las repeticiones se espacian para no superarlo, y un 429 cuenta como fallo.
- **Web:** compilación de producción (`vite build` + `vite preview`, o la imagen nginx de `Web/Dockerfile`), no el servidor de desarrollo. La Web es una PWA con service worker, así que se mide en frío (datos del sitio borrados y service worker eliminado) y en caliente.
- **Datasets (propuestos):**
  - **DS-V Mobile:** la escala que el propio proyecto declara representativa en `test/volume_test.dart`: 100 productos, 300 compras y 1 000 aplicaciones. Se carga en la app aislada con un sembrador derivado de `tool/seed_ui_audit.dart` o `tool/f06_d4/` (por construir).
  - **DS-V Central:** 74 Members sintéticos (el tamaño de la nómina, tesis §1.8.1), 20 productos y 2 campañas, con necesidades y consumo publicados por Sync v1. Se registran el SHA y la semilla del generador.
  - **DS-B respaldos:** tres tamaños propuestos, ~1 MB (sin fotos), ~10 MB y ~50 MB (con fotos sintéticas de comprobante). Se registra el tamaño exacto en bytes que mide el servidor.

### 1.5 Mediciones

| ID | Operación (ref.) | Inicio observable | Fin observable | Instrumento | n | Umbral |
|---|---|---|---|---|---|---|
| R1 | Arranque en frío de la app activada, en N0 (RF-17) | `am start` tras `am force-stop` | Dashboard con datos visibles y operable | `adb shell am start -W -n <pkg>/com.comunidad.agro.agroquimicos.MainActivity` (TotalTime), más `flutter run --profile --trace-startup` (`timeToFirstFrameMicros`) y `screenrecord` para el primer contenido utilizable | 10 (más 1 de calentamiento descartado y anotado) | p90 ≤ 4 s — *propuesto, pendiente de decisión de Roderich/tutor* |
| R2 | Guardar una compra de 2 líneas en N0, con DS-V (CU-06, RF-07) | Toque en «Guardar» | Compra visible en `/compras` | `adb shell screenrecord` y conteo de cuadros (se anota la tasa real del vídeo); `device.sh db counts` confirma 1 compra y 2 entradas por repetición | 10 | p90 ≤ 1 s — *propuesto, pendiente de decisión de Roderich/tutor* |
| R3 | Abrir el detalle e historial del producto con más movimientos, con DS-V (CU-07, RF-10) | Toque en el producto en `/inventario` | Saldo e historial completos en `/inventario/:id` | `screenrecord` y conteo de cuadros | 10 | p90 ≤ 1,5 s — *propuesto, pendiente de decisión de Roderich/tutor* |
| R4 | Envío de una necesidad pendiente al reconectar, en N1 (CU-11, RF-18) | Toque en «Sincronizar ahora» con la red ya restablecida | Estado «Sincronizado» visible en `/sincronizacion` | `screenrecord` para la vista del usuario; `check.sh timeline` (refresh y push con hora); `device.sh db outbox` (ACKED, mismo `operationId`); `check.sh sync` (journal 1) | 10 intenciones, ≤ 1 cada 15 s | p90 ≤ 10 s, con la línea base del túnel informada aparte — *propuesto, pendiente de decisión de Roderich/tutor* |
| R5a | Vista Web `/colectivo/resumen` con DS-V Central (CU-13, RF-22, RF-24) | Navegación a la ruta con campaña seleccionada | Tablas de necesidad declarada y de consumo renderizadas | Script `puppeteer-core` fuera del repo, derivado de `docs/evidence/f07/walkthrough.mjs`: Navigation Timing y `performance.now()` al aparecer la tabla. Una corrida de control con el panel Performance de DevTools | 10 en frío + 10 en caliente | frío p90 ≤ 3 s; caliente p90 ≤ 1,5 s — *propuesto, pendiente de decisión de Roderich/tutor* |
| R5b | API `GET …/collective/campaigns/:id/summary` (RF-22) | Envío de la petición | Respuesta completa | `curl -w '%{http_code} %{time_total}'`, con la credencial en una variable de entorno | 10, espaciadas | p90 ≤ 1 s en localhost — *propuesto, pendiente de decisión de Roderich/tutor* |
| R6 | Subida del respaldo privado por tamaño (CU-14, RF-26) y descarga dentro de la restauración (CU-15, RF-27) | Toque en generar y subir en `/respaldo-remoto` / inicio de la recuperación | Confirmación del servidor con el SHA-256 verificado / copia descargada y verificada | `screenrecord` + `check.sh timeline` (`/me/backups`); bytes según el servidor; caudal = bytes ÷ tiempo | Subida: 5 por tamaño. Descarga: 3 por tamaño, **sólo después de la corrección WAL** | Todo tamaño termina sin error dentro de los límites de §1.7; 10 MB: p90 de subida ≤ 60 s en N1 — *propuesto, pendiente de decisión de Roderich/tutor* |

**Notas a las mediciones:**
- El observador actual (`observer.cjs:20`) escribe una marca ISO por respuesta, pero no la duración. Para la latencia del servidor hace falta añadirle la hora de llegada de la petición (cambio de herramienta pendiente) o usar R5b.
- Los umbrales propuestos toman como orientación los límites de 0,1, 1 y 10 s de tiempo de respuesta percibido (Nielsen, 1993). La SRS no fija ninguna cifra.

### 1.6 Procedimiento
1. Publicar el protocolo aprobado, con su fecha real, antes de la primera medición.
2. Levantar el entorno de §0.3, sembrar DS-V Central y anotar los SHA y la semilla.
3. Compilar e instalar sólo `.f10eval` (profile). Anotar el SHA-256 de la APK. Activar con una cuenta sintética y sembrar DS-V Mobile.
4. Medir la línea base del túnel (N1).
5. Ejecutar, en este orden:
   - R1, R2 y R3 en N0;
   - R4 en N1;
   - R5a y R5b;
   - las subidas de R6.

   Entre bloques se repite `device.sh db counts` para detectar efectos duplicados.
6. Ejecutar las descargas de R6 sólo con la corrección del rollback WAL integrada y comprobada. Si no lo está, quedan NO EJECUTADAS.
7. Medir la línea base del túnel al cerrar.
8. Volver `stay_on` a 0, borrar las fotos sintéticas del teléfono y detener los servicios conservando el volumen.

### 1.7 Criterio de resultado
- **Por medición:** CUMPLE si el p90 cumple el umbral **aprobado** y no hubo errores en las n repeticiones (0 errores, propuesto). NO CUMPLE si no.
- **Sin umbral aprobado:** la medición se informa como valor descriptivo, sin PASS.
- **Límites técnicos del código** (no son umbrales de la SRS):
  - el servidor corta cada petición a los 300 s (`F08_BACKUP.md`, «Limitaciones declaradas»);
  - `BACKUP_MAX_BYTES` vale 100 MiB por defecto (`backups-config.ts:4`);
  - en el cliente, la subida tiene 5 min en total; la descarga, 1 min de inactividad y un tope de 5 min más el tamaño a 16 KiB/s (Mobile `F08_MOBILE_RESTORE.md`).
- **100 MB:** no se propone como criterio. Se calcula si el caudal medido alcanza los ~2,7 Mbit/s que exige.

### 1.8 Riesgos y limitaciones
- **Un solo modelo de teléfono**, con MIUI. No se generaliza a la gama baja.
- **El túnel público** añade una latencia variable que no es de Agrocuentas. Por eso R4 y R6 se informan junto a la línea base.
- **El Backend corre en un PC de desarrollo**, no en un servidor real. El límite de 20/min condiciona el ritmo de las repeticiones.
- **La red degradada no es reproducible en el POCO.** El diagnóstico (CUE, tesis §3.4.3: 23 de 38 con Internet en el campo «rara vez o nunca») justifica priorizar N0, y es un dato del diagnóstico, no una medición del producto.
- **El dataset es sintético** y su volumen es una hipótesis.
- **Defecto conocido:** la lista de Sincronización tardaba en refrescarse tras liberar una intención (observación del E2E de F08); lo corrige MOB #93. Si se mide sin esa corrección integrada, puede inflar R4 y se anota.

### 1.9 Evidencia a producir
- **Archivos:**
  - Mobile `docs/evidence/F10_RENDIMIENTO_MOBILE.md` (R1–R4 y R6);
  - Backend `docs/evidence/F10_RENDIMIENTO_CENTRAL_WEB.md` (R5).

  Cada uno lleva sus CSV crudos sin datos personales.
- **Contenido:**
  - commit SHA de cada componente, SHA-256 de la APK y modo de compilación;
  - comandos exactos y salida resumida;
  - fecha y hora reales;
  - modelo del dispositivo y versión de Android, PC y navegador;
  - dataset y semilla, red y línea base del túnel;
  - tabla de valores crudos, mediana, p90, máximo y errores;
  - umbral aprobado y resultado;
  - desviaciones del protocolo.

---

## 2. Protocolo de compatibilidad (RNF-08)

### 2.1 Objetivo
Construir la matriz que exige RNF-08: configuraciones Android y navegadores evaluados, frente al resultado de cada flujo crítico aplicable, con las versiones probadas, las limitaciones y los fallos.

### 2.2 Requisitos trazados
- **RNF-08** (Must): RU-09 y RU-13. Criterio de la SRS: «La matriz de compatibilidad identifica dispositivos/versiones/navegadores evaluados y el resultado de cada flujo crítico aplicable».
- **Flujos:**
  - INT-01 e INT-02;
  - RF-01, RF-07, RF-12, RF-14, RF-17, RF-18, RF-22, RF-23, RF-24, RF-26, RF-27, RF-30, RF-33 y RF-34;
  - CU-01, CU-02, CU-06, CU-07, CU-09, CU-10, CU-11, CU-12, CU-13, CU-14, CU-15 y CU-18;
  - RN-03.
- **Escenario de la tesis:** «Extremo a extremo», «Dispositivo físico y navegador» (Tabla 3.63, §3.12.3).

### 2.3 Lo que declaran las fuentes
- **SRS.** No fija versiones de Android ni navegadores: habla de las «configuraciones Android y navegadores seleccionados para el piloto». **La selección del piloto no tiene ID en la SRS y está pendiente de decisión.**
- **Tesis §3.4.3.**
  - Los 38 participantes del cuestionario usan Android. Es un dato del diagnóstico que «no determina versiones mínimas de Android».
  - «No se dispone de un inventario verificado de los equipos y navegadores que utiliza la directiva».
- **App.** `minSdk`, `targetSdk` y `compileSdk` se delegan a `flutter.*` (`android/app/build.gradle.kts:41-54`). Con Flutter 3.47.2 (CI) valen:
  - **minSdk 24 (Android 7.0)**;
  - **targetSdk 36 (Android 16)**;
  - compileSdk 36.

  Fuente: `C:\flutter\packages\flutter_tools\gradle\src\main\kotlin\FlutterExtension.kt:23,26,34`, en la SDK local de la misma versión. **Debe confirmarse en la APK evaluada** con `apkanalyzer manifest min-sdk`/`target-sdk` o `aapt2 dump badging`.
- **Web.** Vite 8.0.10 sin `build.target` propio (`Web/vite.config.ts`). El objetivo por defecto es «baseline-widely-available»: Chrome 111+, Edge 111+, Firefox 114+ y Safari 16.4+ (comentario de `vite/dist/node/index.d.ts`, línea ~1993).

### 2.4 Configuraciones

| ID | Configuración | Tipo | Disponible hoy |
|---|---|---|---|
| A1 | POCO X5 Pro 5G `22101320G`, Android 12 / API 31, MIUI V14 | DEVICE | **Sí**, el único |
| A2 | AVD `Pixel_8`, Android 16 / API 36, 1080×2400, 420 dpi (usado en la auditoría UI, Mobile `docs/46_BASELINE_FINAL_FREEZE.md`) | EMULADOR | Sí |
| A3 | AVD con API 24 (el `minSdk`), pantalla pequeña de 360 dp de ancho | EMULADOR | Por crear |
| A4 | Teléfono físico de gama baja o media con Android 10 u 11 y 2–3 GB de RAM (propuesto; a confirmar con los equipos reales de los participantes) | DEVICE | **No** |
| A5 | Teléfono físico con Android 14 o posterior y una capa distinta de MIUI (p. ej., One UI o Android casi puro) | DEVICE | **No** |
| A1-F | A1 con `font_scale` 1,3 (`adb shell settings put system font_scale 1.3`, revertido al terminar y anotado) | DEVICE | Sí |
| B1 | Chrome estable, Windows 11, 1366×768 y 1920×1080 | Navegador | Sí |
| B2 | Edge estable, Windows 11, mismas resoluciones | Navegador | Sí |
| B3 | Firefox estable, Windows | Navegador | Por instalar |
| B4 | Chrome Android, 360×800 (sólo si la Directiva consultará desde el teléfono; está por decidir) | Navegador | Opcional |

**Selección mínima propuesta para el piloto** (*propuesto, pendiente de decisión de Roderich/tutor*):
- Android: A1, A2 y A3 más **un** equipo físico adicional (A4 o A5);
- Web: B1 y B2.

### 2.5 Flujos críticos
Cada flujo tiene un inicio y un fin observables. Es CUMPLE si se cumple la condición indicada.

| ID | Flujo (ref.) | Inicio → fin | CUMPLE si |
|---|---|---|---|
| M1 | Instalación y activación (CU-01, RF-01) | `adb install` del paquete aislado → Dashboard | Activada; `check.sh state` muestra la sesión y el registro ACTIVE = 1; la app normal sigue intacta |
| M2 | Reapertura sin red (CU-07, RF-17, RNF-02) | `net off` + `force-stop` → existencias visibles | `device.sh db counts` igual antes y después; sin credenciales remotas |
| M3 | Compra de 2 líneas sin red (CU-06, RF-07) | Formulario `/compras/nueva` → compra listada | 1 compra y 2 entradas; campaña según la fecha efectiva |
| M4 | Aplicación multiproducto y rechazo por saldo (CU-09, RF-12, RN-03) | `/aplicaciones/nueva` → confirmación o rechazo | Se aplica entera, o se rechaza sin efectos parciales y con un mensaje comprensible |
| M5 | Adjuntar una foto sintética de comprobante (RF-30) | Selector de imagen → foto asociada | Los permisos y el selector funcionan en esa versión de Android, que difiere desde Android 13 |
| M6 | Necesidad y sincronización al reconectar (CU-10, CU-11, RF-14, RF-18) | Declarar sin red → «Sincronizado» | Pendiente → Sincronizado; journal 1 para el ID (`check.sh sync`) |
| M7 | Respaldo: subir (CU-14, RF-26) y restaurar en el mismo paquete aislado (CU-15, RF-27) | `/respaldo-remoto` → confirmación / app restaurada | Conteos iguales y 0 push al restaurar. La restauración, sólo después de la corrección WAL |
| M8 | Presentación (INT-01) | Pantallas de M3, M4 y M6 | Sin controles tapados por las barras del sistema (con targetSdk 36, Android 15+ impone edge-to-edge) ni textos cortados con `font_scale` 1,3 |
| W1 | Acceso por rol (CU-02) | Login → menú | Directiva/Administrador ven el menú F07; un agricultor es redirigido (la API responde 403) |
| W2 | Resumen por campaña (CU-13, RF-22, RF-24) | `/colectivo/resumen` → tablas | Cifras iguales al oráculo D4 (`tool/f06_d4/oracle_check.py`); cobertura «N de M»; la ausencia no se muestra como 0 |
| W3 | Propuesta y CSV (CU-12, RF-23) | `/colectivo/propuestas` → borrador y CSV | Borrador en el historial con su huella; el CSV se descarga y abre; cantidades exactas, sin «NaN» |
| W4 | Reconciliación (CU-18, RF-33, RF-34) | `/colectivo/reconciliacion` → historial | Asociación con motivo y confirmación; historial «anterior → nuevo» |
| W5 | Sin conexión en la Web (INT-08; Web online-first, SRS §5.2) | Cortar la red → acción | Mensaje claro; nada se encola |

### 2.6 Procedimiento
1. Por configuración, registrar: modelo, versión, API o nivel, capa del fabricante, `wm size`/`density`, `font_scale`, la versión exacta del navegador y la resolución.
2. Instalar sólo el paquete aislado. Ejecutar M1–M8, o W1–W5, con el dataset D4 sintético (`tool/f06_d4/`).
3. Con cada fallo: una captura sin barra de estado (`device.sh shot`), logcat filtrado (`logcat_scan.sh`, sin secretos) y un issue con su reproducción.
4. En el emulador, la procedencia es `EMULADOR`. Nunca se presenta como `DEVICE`.

### 2.7 Criterio de resultado
- **Por celda** (configuración × flujo): CUMPLE, NO CUMPLE, BLOQUEADA o NO EJECUTADA.
- **Por configuración:** «compatible» sólo si todas sus celdas aplicables CUMPLEN.
- **Global:** RNF-08 se da por cumplido sólo para las configuraciones **seleccionadas y aprobadas** para el piloto que estén todas en CUMPLE.
- Una configuración no evaluada no se da por compatible.

### 2.8 Riesgos y limitaciones
- **Hoy sólo existe A1 como dispositivo físico.** El PASS de F08 en una reinstalación limpia del mismo POCO no prueba otro modelo (F08_GATE, «Limitaciones»).
- **MIUI tiene particularidades:** instalación por USB con diálogo y ahorro de batería. No se pueden atribuir a Android en general.
- **Para cerrar la matriz faltan al menos A4 o A5 y la confirmación de los navegadores de la Directiva.** Hay que conseguirlos: con préstamo, o con los teléfonos de los participantes, sólo con su consentimiento, en un paquete aislado y desinstalándolo al terminar.

### 2.9 Evidencia a producir
- **Archivos:**
  - Mobile `docs/evidence/F10_COMPATIBILIDAD_MOBILE.md`;
  - Backend `docs/evidence/F10_COMPATIBILIDAD_WEB.md`.
- **Contenido:**
  - la matriz completa, con su procedencia;
  - SHA, SHA-256 de la APK, `minSdk`/`targetSdk` leídos de la APK;
  - comandos y salida resumida;
  - fecha real;
  - modelo de cada dispositivo y versión de cada navegador;
  - fallos con su issue y limitaciones.

---

## 3. Protocolo de usabilidad (RNF-07)

### 3.1 Objetivo
Observar a usuarios del contexto mientras realizan tareas críticas definidas de antemano, y registrar:
- la finalización;
- los errores;
- las ayudas;
- el tiempo;
- la percepción, con el SUS.

Todo con denominadores explícitos.

### 3.2 Requisitos trazados
- **RNF-07** (Must): RU-13. Criterio de la SRS: «ejecuta tareas definidas previamente y reporta denominadores, éxito, errores/ayudas y resultados del instrumento sin convertir objetivos no medidos en PASS».
- **Interfaces:** INT-01, INT-02 e INT-08.
- **Tareas:**
  - CU-06, CU-07, CU-09 y CU-10;
  - CU-11 (RF-18; RU-16);
  - CU-12 (RF-23), CU-13 (RF-24) y CU-18 (RF-33);
  - RN-03 y RN-18.
- **Escenario de la tesis:** P-15 (Tabla 3.64) y §1.7.3 Tabla 1.5: tareas representativas, registro de la observación y SUS.

### 3.3 Lo que no es esta evaluación
- **Las sesiones automatizadas no son usabilidad:** pruebas de widget, `walkthrough.mjs` con Edge sin interfaz o recorridos de Claude Code.
- **El cuestionario de caracterización** (Anexo B, CUE; 38 registros entre el 17/09 y el 04/10/2026, tesis Tabla 3.1) pertenece al **diagnóstico** (DSR, actividad 1). No se usa como medida de usabilidad ni de satisfacción con Agrocuentas.
- **Fuera de alcance:**
  - la voz (F09), opcional y no evaluada ahora;
  - la activación, que la hace el facilitador para que el participante no teclee contraseñas;
  - la restauración de respaldos.

### 3.4 Condiciones
- **Móvil:**
  - POCO A1 con el paquete aislado `.f10ux`;
  - por cada participante: desinstalar **sólo** `.f10ux`, reinstalarlo, sembrar el dataset y activarlo con una cuenta sintética nueva (código P01, P02…).
- **Web:** B1 o B2 en un PC del investigador, con una cuenta sintética de Directiva/Administrador (ADR-003).
- **Datos:** el dataset D4 sintético, con nombres de producto ficticios. Incluye «Bellator» y «Belator» para la reconciliación.
- **Red:** el facilitador controla el modo sin red con `device.sh net off|on`.
- **Lugar:** el que acuerde el Sindicato, sin otras personas mirando la pantalla.
- **Prueba piloto:** una sesión previa con una persona ajena al desarrollo. Sus datos se excluyen.

### 3.5 Participantes (reclutamiento **no realizado**; sin fechas)
- **Móvil:** 5 a 8 agricultores socios (tesis §1.8.2 y Tabla 1.6), elegidos de forma intencional para cubrir:
  - experiencia digital diversa: al menos 2 con comodidad autodeclarada de 1–2 sobre 5 (*propuesto*);
  - al menos 1 con modalidad compartida.
- **Web:** miembros de la Directiva. Se proponen 2–3, incluido el presidente con la cuenta ADMINISTRADOR con funciones de Directiva (ADR-003; RU-18, validado por Roderich el 15/10/2026). El número queda *pendiente de decisión de Roderich/tutor*.
- **Perfil:** se pregunta al inicio de la sesión (comodidad 1–5 y modalidad). No se cruza con las respuestas del cuestionario de diagnóstico.
- **Facilitador:** Roderich.
  - **Riesgo de sesgo:** es el desarrollador. Se mitiga con un guion fijo y frases neutras.
  - **Observador y anotador:** una persona sin rol de desarrollo, por definir.
  - Claude Code no facilita ni observa sesiones con personas.

### 3.6 Ética, consentimiento y datos (tesis §1.8.3)
1. Antes de empezar, se lee una explicación de la finalidad académica y se pide el consentimiento por escrito, o verbal y anotado.
   - La participación es voluntaria y se puede abandonar en cualquier momento.
   - Se evalúa la aplicación, no a la persona.
   - Confirmar con el tutor si Univalle exige algún trámite adicional.
2. Sólo participan adultos. No se piden contraseñas ni datos personales sensibles. Los participantes se identifican por un código.
3. **Se conserva sólo:**
   - el código y la categoría de perfil;
   - los resultados por tarea (éxito, tiempo, ayudas, errores y SEQ);
   - las respuestas SUS;
   - los comentarios, sin datos identificativos.

   Los formularios de consentimiento se guardan aparte, fuera de los repositorios.
4. No se graban audio ni rostros. La grabación de la pantalla del teléfono, opcional, requiere un consentimiento separado y se borra al extraer las mediciones (*propuesto*).

### 3.7 Tareas
Se leen desde tarjetas. El **inicio** es cuando el facilitador termina de leer y dice «puede comenzar». El **fin** es el estado observable indicado, o cuando el participante declara que terminó o abandona. Tiempo máximo por tarea: 5 min en Móvil y 4 min en Web (*propuesto*).

| ID | Tarea (ref.) | Fin observable / éxito |
|---|---|---|
| T1 | «Sin Internet, registre la compra de hoy: 2 L de Glifosato Demo y 500 mL de Bellator» (CU-06) | La compra aparece con las 2 líneas, las cantidades y las unidades correctas |
| T2 | «Registre que hoy aplicó 1 L de Glifosato Demo y 200 mL de Bellator en la parcela Norte» (CU-09) | Aplicación con las 2 líneas en la parcela correcta |
| T3 | «¿Cuánto Bellator le queda y por qué movimientos?» (CU-07) | Dice el saldo correcto y señala la compra y la aplicación |
| T4 | «Declare que necesitará 20 L de Glifosato Demo para esta campaña» (CU-10) | Necesidad vigente con la cantidad y la unidad correctas |
| T5 | (El facilitador reconecta.) «¿Ya llegó su necesidad al sindicato?» (CU-11, RF-18) | Encuentra Sincronización y responde según el estado real |
| T6 | «Registre una aplicación de 5 L de Bellator» (sólo hay menos; RN-03, INT-08) | Explica que no hay saldo suficiente y cómo continuar; nada se guarda a medias |
| W1 | «Abra el resumen de la campaña Verano Demo y diga la necesidad declarada total de Glifosato Demo» (CU-13) | Valor correcto leído |
| W2 | «¿Esa cifra incluye a todos los socios?» (RF-24, RN-18) | Identifica la cobertura «N de M» y que la ausencia no es cero |
| W3 | «Indique que Belator es el mismo producto que Bellator» (CU-18, RF-33) | Asociación confirmada con motivo y visible en el historial |
| W4 | «Prepare un borrador de propuesta de compra conjunta y descárguelo» (CU-12) | Borrador en el historial y CSV descargado |
| W5 | «¿Generar ese borrador compra los productos?» (RF-23) | Responde que no, que es un borrador para decidir |

### 3.8 Mediciones
- **Éxito por tarea** (binario), con niveles de ayuda:
  - 0: sin ayuda;
  - 1: pista general («¿dónde cree que podría estar?»);
  - 2: pista específica;
  - 3: el facilitador realiza el paso.

  Se cuenta como **éxito** con nivel 0–1, como **éxito con ayuda** con nivel 2 (informado aparte) y como **fallo** con nivel 3, abandono o tiempo agotado.
- **Tiempo en la tarea:** segundos entre el inicio y el fin, tomados con un cronómetro en la hoja de registro o con la grabación de pantalla consentida. Se informan la mediana y el rango.
- **Errores:**
  - acción que se aparta del camino y requiere corregirse;
  - **error crítico:** dato guardado incorrecto sin que el participante lo note.
- **SEQ tras cada tarea:** «En general, esta tarea fue…», de 1 (muy difícil) a 7 (muy fácil) (Sauro y Dumas, 2009).
- **SUS al final,** sobre la app Móvil o sobre la Web según el participante. Sus 10 ítems, del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo), en una traducción de trabajo. Antes de aplicarla, usar o contrastar una versión en español validada y publicada, y verificar esa referencia antes de citarla.

| # | Ítem SUS |
|---|---|
| 1 | Creo que me gustaría usar esta aplicación con frecuencia. |
| 2 | Encontré la aplicación innecesariamente complicada. |
| 3 | Pensé que la aplicación era fácil de usar. |
| 4 | Creo que necesitaría el apoyo de una persona con conocimientos técnicos para poder usar esta aplicación. |
| 5 | Encontré que las distintas funciones de la aplicación estaban bien integradas. |
| 6 | Pensé que había demasiada inconsistencia en la aplicación. |
| 7 | Imagino que la mayoría de las personas aprendería a usar esta aplicación muy rápidamente. |
| 8 | Encontré la aplicación muy engorrosa de usar. |
| 9 | Me sentí muy seguro/a usando la aplicación. |
| 10 | Necesité aprender muchas cosas antes de poder empezar a usar esta aplicación. |

**Puntuación** (Brooke, 1996; tesis §2.9.4):
- a cada ítem impar se le resta 1;
- cada ítem par se resta de 5;
- la suma se multiplica por 2,5, lo que da un valor de 0 a 100. No es un porcentaje.

Si el participante no sabe qué responder, se le indica que marque 3. Un cuestionario con ítems vacíos se informa como incompleto y no entra en la media, con su denominador. Los ítems pueden leerse en voz alta si el participante lo prefiere, sin explicarlos.

### 3.9 Criterio de resultado
Todos los criterios son *propuestos, pendientes de decisión de Roderich/tutor*, y deben aprobarse antes de la primera sesión.
- **Por tarea:** CUMPLE si la tasa de éxito con ayuda de nivel 0–1 es ≥ 80 % de los participantes que la intentaron (p. ej., 4 de 5) y no hubo **ningún** error crítico.
- **SUS:** CUMPLE si la media es ≥ 68. Ese valor es la referencia de promedio citada en la tesis (Lewis y Sauro, 2018), no un umbral de la SRS. Con n de 5 a 8 se informan la media, la mediana y el rango, sin inferencias.
- **Tiempo:** sólo descriptivo. Opcionalmente, ≤ 3 veces la mediana de un usuario experto (Roderich, 3 corridas por tarea).
- Una tarea no ejecutada queda NO EJECUTADA. Los hallazgos se clasifican por gravedad y alimentan las mejoras, como dice la tesis §3.12.5.

### 3.10 Riesgos y limitaciones
- Muestra pequeña e intencional: evidencia contextual del Sindicato 19 de Agosto, no generalizable (tesis §1.8.2).
- El participante usa un teléfono que no es suyo (POCO con MIUI).
- El facilitador es el desarrollador.
- Los datos sintéticos pueden resultar poco familiares.
- La política de divulgación no está aprobada: la Web muestra cifras sólo en modo sintético provisional.
- **Defectos conocidos que pueden afectar a T5:**
  - el refresco tardío de la lista de Sincronización;
  - el texto crudo `SyncQueryException(404, …)` en una resolución de conflicto (plan F05-SYNC-06, observaciones).

### 3.11 Evidencia a producir
- **Archivos:**
  - `docs/evidence/F10_USABILIDAD.md` en Mobile (UX-01, MOB #37) y en Backend/Web (UX-02, BE #47);
  - un CSV anonimizado.
- **Contenido:**
  - la versión aprobada del protocolo y su commit;
  - los SHA, el SHA-256 de la APK, el modelo del dispositivo y el navegador;
  - las fechas reales de las sesiones;
  - n por perfil, sin nombres;
  - tabla por tarea: denominador, éxitos, éxitos con ayuda, fallos, errores, errores críticos, tiempo y SEQ;
  - SUS por código, con su media, mediana y rango;
  - hallazgos por gravedad;
  - desviaciones del protocolo.

---

## 4. Pendientes antes de ejecutar

- [ ] Roderich, con el tutor si lo considera: aprobar los umbrales, los datasets, n, la selección de configuraciones del piloto y el número de participantes Web. Registrarlo en la tabla de aprobación.
- [ ] Adaptar `build_isolated_apk.sh` al modo profile y construir el sembrador DS-V Mobile y el generador DS-V Central.
- [ ] Añadir al observador la hora de llegada de cada petición, o aceptar R5b como la única latencia de servidor.
- [ ] Corrección del rollback WAL integrada y comprobada, antes de R6 (descarga) y de M7 (restaurar).
- [ ] Conseguir al menos un dispositivo físico adicional (A4 o A5) y confirmar los navegadores de la Directiva.
- [ ] Reclutar a los participantes, preparar el consentimiento y las tarjetas de tareas y hacer la sesión piloto.
- [ ] Issues: rendimiento BE #48, usabilidad MOB #37 y BE #47 ya existen. Decidir si se crea uno para compatibilidad (RNF-08); en este bloque no se crea.
