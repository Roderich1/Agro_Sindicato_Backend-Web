# F10 — Protocolos de evaluación de Agrocuentas: rendimiento, compatibilidad y usabilidad

- **Versión 1.4** (la 1.0, aprobada técnicamente antes de medir, más precisiones de la 1.1, la 1.2, la 1.3 y la 1.4 sin cambio de umbrales; ver el registro de versiones).
  - La 1.3 se publicó el 2026-10-16 (America/La_Paz; 2026-10-17 UTC) por la sesión A de Claude Code. **La 1.4 (2026-10-18, La Paz) sólo precisa el dataset de usabilidad DS-UX y su procedencia (§3.3)**, antes del piloto y de cualquier sesión de usabilidad.
  - **Las mediciones históricas siguen atribuidas a la v1.3:** series 1, 2 y 3 de rendimiento y compatibilidad (R1–R6, M1–M8, W1–W5 de compatibilidad), con sus suplementos. La v1.4 no cambia §0, §1 ni §2.
  - Incorpora las decisiones de `_briefs/CIERRE_TECNICO_Y_EVALUACION_AGROCUENTAS_2026-10-16.md` §1–§2, tomadas el 2026-10-16 bajo la **delegación técnica de Roderich**.
  - **No es una ratificación del tutor, ni una aprobación institucional, ni una inspección personal del autor.**
- **Ninguna medición de aceptación se ha hecho antes de esta versión.** Las corridas previas de herramientas se marcan como «ensayo de herramienta» y no entran en ninguna serie.
- **Issues:**
  - rendimiento: BE #48 (F10-QA-04);
  - usabilidad móvil: MOB #37 (F10-UX-01);
  - usabilidad Web: BE #47 (F10-UX-02);
  - E2E crítico: BE #43 (F10-QA-01);
  - gate: BE #49 (GATE-F10), que sigue **Pending**.

  La compatibilidad (RNF-08) no tiene un issue propio.
- **Requisito de la SRS:** fijar umbrales, dataset, repeticiones y percentiles **antes de medir** (RNF-06, RNF-07; SRS-AGRO-001 §9.1). Un valor elegido después de ver los resultados no se convierte en criterio. **Los umbrales de esta versión no se cambian después de obtener resultados.**

**Registro de versiones del protocolo:**

| Versión | Fecha real | Procedencia | Cambios | Commit |
|---|---|---|---|---|
| Borrador | 2026-10-16 | Sesión A; sin aprobar | Propuesta inicial, sin umbrales acordados | BE `808acda` (merge `af0dbf1`, #120) |
| **1.0** | 2026-10-16 (La Paz) | Aprobación técnica delegada por Roderich (archivo de decisiones de cierre §2). Sin ratificación del tutor | Umbrales, datasets, configuraciones, participantes e instrumentos fijados. Se corrige M6. Se retiran los pendientes ya resueltos del WAL y del refresco | BE `72a03be` (PR #122) |
| **1.1** | 2026-10-16 (La Paz) | Sesión A, antes de cualquier medición de R5, a partir de una observación de la sesión B | **Precisión, sin cambiar umbrales ni repeticiones:** el entorno de R5 (§0.4) usa `NODE_ENV=development`, porque `CollectiveConfig` rechaza `provisional-synthetic` en producción y el resumen no tendría tablas | BE `7581af2` (rama del PR #122) |
| **1.2** | 2026-10-16 (La Paz; 2026-10-17 ~02:00 UTC) | Sesión A, antes de la primera repetición de R6 y antes de cualquier sesión de usabilidad | **Precisiones, sin cambiar umbrales ni repeticiones:** composición exacta de S1/S2/S3 (§1.4); el primer envío de cada tamaño es un calentamiento anotado aparte; criterio por tarea de usabilidad sólo con la muestra planificada completa (§3.6) | BE `9292425` (rama del PR #122) |
| **1.3** | 2026-10-16 (La Paz; 2026-10-17 ~03:10 UTC) | Sesión A, después de S1 y antes de la primera repetición de S2 | **Precisión de capacidad, sin cambiar umbrales ni repeticiones:** `BACKUP_MAX_ACTIVE_PER_MEMBER=20` en el entorno de A (§0.4), reiniciando sólo la API. El cálculo de la v1.0 (15) no contaba los 3 calentamientos de la v1.2 (5 + 1 por tamaño = 18); con 15, la 16.ª subida recibiría `409 BACKUP_QUOTA_EXCEEDED` | `9bfcad2` |
| **1.4** | 2026-10-18 (La Paz; 2026-10-19 UTC) | Sesión A, por la aprobación técnica delegada de Roderich del 2026-10-18 («Autorización del Project y preparación final de la usabilidad», §4), **antes del piloto y de cualquier sesión de usabilidad**. Sin ratificación del tutor | **Precisión del dataset de usabilidad, sin cambiar tareas (T1–T6, W1–W5), umbrales, muestra, escala de ayuda ni reglas del SUS:** §3.3 sustituye «dataset sintético D4» por **DS-UX** (composición, procedencia, generadores versionados con semilla y fecha de sesión, oráculos), porque las tarjetas de §3.4 usan nombres que D4 no tiene. Las mediciones de rendimiento y compatibilidad siguen atribuidas a la v1.3 | El commit de esta versión (PR de la rama `docs/f10-protocolo-v1.4-dsux`) |

Una versión posterior (1.1, …) sólo puede precisar algo que esta versión deja explícitamente para antes de su medición, como los bytes exactos de R6 (§1.4). **No puede tocar umbrales ni repeticiones.** Se publica antes de la primera repetición afectada y se añade a esta tabla.

**Fuentes leídas:**
- SRS-AGRO-001 v1.0: §5, §6, §7, §9, §9.1, §11 y §12.
- URS-AGRO-001 v1.0: §9.1–9.3 y §11.
- Proyecto de Grado v1.5: §1.7.3–1.8.3, §2.9.4, §3.4.3 y §3.12.
- Archivos de decisiones F10 y de cierre (`_briefs/`).
- Backend `ed069a6`.
- Mobile `dff6802`: `tool/f03_res_01`, `tool/f08_bkp`, `android/app/build.gradle.kts`, `lib/data/backup_container_reader.dart`.

---

## 0. Condiciones comunes

1. **Base evaluada** (verificada el 2026-10-17 UTC):

   | Componente | Commit | CI final |
   |---|---|---|
   | Backend + Web (BE `main`) | **`ed069a695eb9f8bdc318bfd16efc0071fcdced25`** (código = `c8cbf67`; `ed069a6` sólo añade documentación) | `ed069a6`: «Backend F02 verification» run 38977769791 SUCCESS. La Web no cambia desde `c8cbf67`: «Web F07 verification» run 38976819643 SUCCESS |
   | Mobile (MOB `main`) | **`dff6802ac68d647d40887a4ee298c5ff171d4937`** (código = `2f4b634`; `dff6802` sólo añade la herramienta de captura y evidencia) | «Flutter CI» run 38977755502 SUCCESS |

   - Las herramientas de evaluación se versionan en ramas propias y **no cambian el código medido**. Cada serie registra el SHA de la herramienta.
   - **Cambio de código.** Si se integra una corrección antes de medir, la sesión A fija y publica la base nueva. Si el código cambia durante la evaluación, no se mezclan repeticiones de versiones distintas: se conservan ambas series y se repite sólo lo afectado.
2. **Datos y aplicación.**
   - Sólo datos sintéticos.
   - Copia aislada **nueva** de la app:
     - `com.comunidad.agro.agroquimicos.f10eval` («Agrocuentas F10-EVAL») para medir y para la compatibilidad;
     - `.f10ux` para usabilidad.
   - Nunca se usan la app normal, la demo ni las copias de ensayos anteriores (`.f03res01`, `.f06d4`, `.f03e2b`, `.f08bkp`, `.f10s18a/b/c`, `.f10bkp`).
   - Antes y después de cada sesión, `pm list packages` debe mostrar la app normal intacta.
3. **Producción cerrada.**
   - Las admisiones `SYNC_V1_PRODUCTION_ADMISSION` y `BACKUP_PRODUCTION_ADMISSION` se abren **sólo** en el entorno desechable y sintético.
   - `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` es necesario para que la Web muestre cifras, porque F07-POL-01 (BE #107) no está aprobada. Esto no evalúa ni aprueba esa política, y la divulgación real sigue cerrada.
   - Se mantiene k = 3: las celdas suprimidas no muestran ni la cantidad ni el conteo exacto.
4. **Backend de evaluación.**
   - Compilado (`node dist/main.js`, `NODE_ENV=production`), con migraciones aplicadas en orden sobre un PostgreSQL propio. Contenedor, volumen y puertos **nuevos** por sesión:
     - A (Mobile): `agro_a_f10eval_pg`, volumen `agro_a_f10eval_pgdata`, PG 55448, API 3118, observador 3119;
     - B (central y Web): `agro_b_f10eval_pg`, PG 55450, API 3122, Web 4176.
     - **R5 (v1.1):** el Backend de B sigue compilado (`node dist/main.js`), pero con `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`. Es una **desviación necesaria y declarada**: `CollectiveConfig` (`collective-config.ts:18-29`) ignora ese modo con `NODE_ENV=production`, y el resumen quedaría en `POLICY_PENDING`, sin cifras.
       - Lo demás no cambia: límite de 20/min, mismas migraciones, Web de producción.
       - La evidencia registra las ramas que dependen de `NODE_ENV`: admisión de respaldos (`backups-config.ts:26`), divulgación colectiva (`collective-config.ts:20`), admisión de Sync (`sync-v1-config.ts:23`) y `Secure` de la cookie por defecto (`auth-v2.controller.ts:48`, `auth.controller.ts:41`), con `COOKIE_SECURE` fijado de forma explícita.
       - El entorno de A (Mobile) sigue con `NODE_ENV=production`: no usa el resumen colectivo.
   - Ningún entorno conservado se detiene, borra ni reutiliza.
   - **Se mantienen los límites de peticiones** (`ThrottlerModule`: 20 por minuto). Un 429 cuenta como fallo y se registra con su causa.
   - **Única configuración de capacidad distinta de la de fábrica:** `BACKUP_MAX_ACTIVE_PER_MEMBER=15` en el entorno de A (de fábrica, 5).
     - **v1.3:** 20 desde S2 de R6 (reinicio sólo de la API). Los 3 calentamientos de la v1.2 elevan a 18 las copias de R6.
     - Permite conservar como evidencia las 15 copias de R6 sin borrar ninguna.
     - Sin ese cambio, la 6.ª subida recibiría `409 BACKUP_QUOTA_EXCEEDED`.
     - No es un control de seguridad ni afecta al tiempo medido.
5. **Compilación.**
   - **Mobile en modo profile** (`flutter build apk --profile`, Flutter 3.47.2 como en CI). El tipo `profile` hereda la firma local de depuración: es una APK sólo para este ensayo, **no distribuible**.
   - **Web:** compilación de producción (`vite build` + `vite preview`).
   - **Backend:** compilado.
   - **El modo debug no sirve para medir tiempos.**
6. **Se registra en cada corrida:**
   - SHA de Backend, Web y Mobile;
   - SHA-256 de la APK y su modo;
   - `minSdk` y `targetSdk` leídos de la APK;
   - imagen y digest de PostgreSQL;
   - versión de `cloudflared`;
   - versión exacta del navegador;
   - SHA y semilla del generador;
   - versión de este protocolo;
   - CPU, RAM y sistema operativo del PC.
7. **Resultados** (tesis §3.12.6):
   - **CUMPLE**, **NO CUMPLE**, **BLOQUEADA** o **NO EJECUTADA**;
   - con procedencia `DEVICE`, `EMULADOR`, `HOST` o `CI`, que no se mezclan. Una prueba de host no cuenta como `DEVICE`.
8. **Estadísticos.**
   - Se publican todos los valores crudos, la mediana, el **p90 por rango más cercano** (el valor en la posición ⌈0,9·n⌉ de la lista ordenada: con n = 10, el 9.º; con n = 5, el 5.º, es decir, el máximo), el máximo y los errores.
   - Con muestras pequeñas, el percentil es sólo una descripción muestral.
   - **Fallos.** Una repetición fallida (timeout, 429, 5xx, cierre de la app, efecto duplicado o error de integridad) no se descarta: cuenta en la tasa de error y **no desaparece porque una repetición posterior funcione**.
   - **Siembra y calentamientos.** Se registran aparte y no entran en las repeticiones de aceptación.
9. **Secretos.**
   - Las credenciales sólo viven en variables de la shell (`tool/f03_res_01/credential.sh`, `secrets.sh`).
   - Ningún token, contraseña, cabecera `Authorization` ni `DATABASE_URL` aparece en evidencias, CSV, capturas ni commits.
   - Los CSV crudos se revisan antes de publicarse: sin correos, sin UUID completos, sin URL del túnel.
10. **Ajustes del equipo.** Se anotan sus valores previos y se restauran al terminar:
    - `show_touches`, `font_scale`, modo avión y `stay_on`.

---

## 1. Protocolo de rendimiento (RNF-06)

### 1.1 Objetivo
Medir el tiempo de las operaciones críticas locales (Mobile) y centrales (Backend y Web), con un dataset, un entorno y unas repeticiones fijados de antemano, y compararlo con los criterios de §1.5.

### 1.2 Requisitos trazados
- **RNF-06** (Should): RU-04, RU-13 y RU-17. SRS §9: los umbrales se fijan antes de la ejecución y no se declaran cumplidos sin medición.
- **Operaciones:**
  - RF-17 y RNF-02 (operación sin red);
  - RF-07 y CU-06 (compra);
  - RF-09, RF-10 y CU-07 (existencias e historial);
  - RF-18 y CU-11 (sincronización);
  - RF-22, RF-24 y CU-13 (vista agregada);
  - RF-26, RF-27, INT-06, CU-14 y CU-15 (respaldo);
  - RNF-09 (versiones reproducibles).
- **Escenario de la tesis:** P-16, Tabla 3.64.

### 1.3 Alcance y exclusiones
- **Incluye** R1–R6.
- **Excluye la prueba de carga concurrente.** Medir la latencia con un solo usuario **no demuestra capacidad concurrente**, y no se afirma.
- **Excluye también:**
  - la voz (F09);
  - la producción, que no existe;
  - la batería y la memoria.
- **No sustituye a los ensayos adversariales** de F05 (#18/#19). Sus criterios y los de este protocolo son distintos.

### 1.4 Datasets (escenarios técnicos)

**No son una muestra de usuarios ni una afirmación sobre el volumen real del sindicato.**

**DS-V Mobile.** Lo produce `tool/f10_eval/seed_dsv_mobile.dart` (Mobile, rama de evaluación de A), con la semilla **20261016**.
- **Cómo se carga:**
  - se ejecuta en el host (`flutter test`, `sqflite_common_ffi`) sobre la base extraída de la copia `.f10eval` ya activada;
  - usa `AgroRepository` (`confirmPurchase`, `confirmApplication`), con las mismas reglas de saldo, FIFO y titular que la app;
  - la base resultante se devuelve al paquete con `run-as`, con la app detenida;
  - es una fixture de base: **no cuenta como publicación por Sync**.
- **Composición exacta:**
  - **100 productos**;
  - **300 compras**: 2 líneas cada una, fechas repartidas en los 365 días anteriores al 2026-10-16;
  - **1 000 aplicaciones**: 1 línea cada una, cronológicamente posteriores a la compra que les da saldo;
  - el producto **`DSV-001`** concentra la mayor cantidad de movimientos y es el objetivo de R3.
- **Invariantes que el generador comprueba y registra:**
  - los conteos exactos;
  - que ningún saldo queda negativo;
  - `PRAGMA integrity_check = ok`;
  - que `sync_outbox` no cambia: la siembra no crea intenciones;
  - el tamaño de la base en bytes.

**DS-V Central.** Lo produce un generador versionado por la sesión B, con la semilla **20261016**.
- **Cómo se carga:** directamente como fixture en las tablas que lee el resumen colectivo, respetando sus invariantes: una contribución vigente por Member, campaña, producto y tipo. No cuenta como Sync.
- **Composición:**
  - un sindicato sintético;
  - **74 Members AGRICULTOR** sintéticos (el tamaño de la nómina, tesis §1.8.1), más cuentas sintéticas de DIRECTIVA y ADMINISTRADOR para leer;
  - **20 productos** centrales;
  - **2 campañas**.
- **Distribución por campaña:**
  - necesidad declarada por **60 de 74** Members y consumo por **45 de 74**, con 1 a 6 productos por Member;
  - al menos **3 productos con 1–2 contribuyentes**, para ejercitar la supresión con k = 3;
  - al menos **2 productos sin datos**, para comprobar que la ausencia no se muestra como 0.
- **Lo que B registra:** el SHA del generador, la semilla, los conteos reales y su correspondencia con las tablas.

**DS-B respaldos (R6).** Contenedores **válidos**, generados por la propia app desde la base DS-V más fotografías sintéticas de comprobante.
- **Fotografías:**
  - JPEG de 1600×1200, producidos de forma determinista por `tool/f10_eval/make_photos.sh` (ffmpeg, ruido con semilla fija);
  - asociados a compras de DS-V mediante `purchases.invoice_image_path`, con el archivo en `app_flutter/invoices/`;
  - esa asociación es parte de la fixture, no un flujo medido.
- **Tamaños objetivo** del contenedor que mide el servidor:
  - **S1 ≈ 1 MiB**, **S2 ≈ 10 MiB** y **S3 ≈ 50 MiB**, con una tolerancia de ±20 %;
  - todos dentro de los límites técnicos: `BACKUP_MAX_BYTES` 100 MiB, `maxTotalBytes` 256 MiB, `maxManifestBytes` 4 MiB y 5 000 fotos.
- **Lo que se fija antes de la primera repetición de R6** (versión 1.2; «versión 1.1» en el texto anterior):
  - **Fotografías:** `make_photos.sh` en la rama de evaluación Mobile, con JPEG de 1600×1200, ruido 50, calidad 4 y semilla 20261016 + i. Cada foto pesa unos 0,84 MB. Los bytes y el SHA-256 de cada una están en su `SHA256SUMS`: `dsv_photo_001.jpg` pesa 836 200 B, con SHA-256 `9108597c…47bd`.
  - **Composición:**

    | Tamaño | Fotos | Bytes de las fotos | Contenedor esperado |
    |---|---|---|---|
    | **S1** | 1 | 836 200 B | ≈ 1,0 MiB |
    | **S2** | 12 | 10 032 266 B | ≈ 9,8 MiB |
    | **S3** | 62 | 51 752 775 B | ≈ 49,6 MiB |

    Cada contenedor lleva además la base DS-V en su estado de ese momento, que comprimida ocupa unos 0,2 MB.
  - **Asociación:** las fotos se asocian a las primeras compras DS-V por id con `attach_photos.py`, como fixture y con la app detenida.
  - **Calentamiento:** el **primer envío de cada tamaño** se anota aparte y no entra en las 5 repeticiones. Da los bytes exactos que mide el servidor; los bytes de cada repetición se registran en su fila.
  - **No se usa un archivo de relleno inválido:** el contenedor lo genera la propia app.

### 1.5 Mediciones y criterios aprobados

Son criterios operativos del estudio piloto, acordados antes de medir. **No son límites universales ni cifras de la SRS.**

| ID | Operación | Inicio observable | Fin observable | Criterio | n |
|---|---|---|---|---|---|
| R1 | Arranque local sin red (N0), app activada con DS-V | Orden de arranque tras `am force-stop` (ver §1.6) | **Dashboard con datos utilizables**: tarjetas de resumen con importes y tabla de existencias con filas, sin indicador de carga | p90 ≤ 4 s | 10, más 1 calentamiento anotado aparte |
| R2 | Guardar una compra de dos líneas sin red, con DS-V | Toque en «Guardar» | Confirmación visible (la compra aparece en la lista) **y** persistencia: +1 compra y +2 entradas en la base, comprobado después | p90 ≤ 1 s | 10 |
| R3 | Abrir el saldo y el historial de `DSV-001` | Toque en el producto en Inventario | Saldo e historial visibles | p90 ≤ 1,5 s | 10 |
| R4 | Sincronización iniciada por acción explícita | Toque en «Sincronizar ahora» | ACK recibido (ACKED, mismo `operationId`, journal 1) **y** estado «Sincronizado» visible | p90 ≤ 10 s; la latencia del túnel se informa aparte | 10 intenciones, una cada ≥ 60 s |
| R5a | Resumen Web `/colectivo/resumen` con DS-V Central | Navegación a la ruta con la campaña elegida | Tablas renderizadas | frío p90 ≤ 3 s; caliente p90 ≤ 1,5 s | 10 en frío y 10 en caliente |
| R5b | API `GET /api/v1/collective/campaigns/:id/summary` en localhost | Envío de la petición | Respuesta completa | p90 ≤ 1 s | 10, espaciadas |
| R6 | Respaldos S1/S2/S3: subida (CU-14, RF-26) y descarga dentro de la restauración (CU-15, RF-27) | Toque en subir / toque en recuperar la copia | Confirmación del servidor con el SHA-256 / copia descargada y verificada («verificada con SHA-256») | **S2: p90 de subida ≤ 60 s** en N1. Los tres tamaños deben completarse y verificar su integridad dentro de sus límites técnicos | 5 subidas y 3 descargas por tamaño |

**Notas a las mediciones:**
- **R1.** La métrica principal es la disponibilidad del Dashboard con datos.
  - `TotalTime` de `am start -W` y el primer cuadro de Flutter se publican como **métricas auxiliares**. **El primer cuadro no se declara «Dashboard utilizable».**
- **R4.** No se redefine como refresco automático: se conserva el contrato de verificación explícita.
  - Cada intención se declara sin red. Después se detiene la app, de modo que el proceso no conserve acceso verificado, se restablece N1 y se abre Sincronización.
  - Si se midiera el ciclo automático del worker, sería otra serie, con otro inicio, informada aparte.
- **R6.** La descarga termina cuando la app muestra la copia verificada y pide confirmación.
  - En las 3 repeticiones de medición se cancela en ese punto.
  - La restauración completa con conteos se comprueba en M7 (§2), no en R6.

### 1.6 Instrumentos y condiciones
- **Dispositivo A1:** POCO X5 Pro 5G `22101320G`, Android 12 (API 31), MIUI `V14.0.7.0.SMSMIXM`.
  - Se registran `getprop` (modelo, versión, SDK, incremental), `wm size`, `wm density`, la batería (≥ 50 %, anotando si carga) y la temperatura.
  - Las apps en segundo plano se cierran.
- **Vídeo (R1–R4 y R6).** `adb shell screenrecord`, con `show_touches=1` durante la medición (restaurado al terminar).
  - **Inicio:** el primer cuadro con el indicador del toque. En R1, el primer cuadro en que la pantalla cambia respecto de la de inicio del sistema tras la orden `am start`.
  - **Fin:** el primer cuadro a partir del cual la región de la pantalla que contiene el estado final coincide con ese estado de forma estable.
  - **Herramienta:** `tool/f10_eval/frames.py` sobre `ffprobe`/`ffmpeg`, con los tiempos de presentación reales del vídeo. Cada cuadro de inicio y de fin se comprueba visualmente y su resultado se anota.
  - La grabación añade carga al teléfono; se declara.
  - **R1, limitación:** el inicio en el vídeo no incluye el tiempo entre la orden y el primer cuadro de la animación de apertura. `TotalTime` se publica junto a él.
- **Servidor y red.**
  - **Observador** (`tool/f03_res_01/observer.cjs`): método, ruta, estado y hora de cada respuesta, sin cuerpos ni cabeceras.
  - **Línea base del túnel:** 10 × `curl -w '%{time_total}'` desde el PC al endpoint de salud, antes y después de cada bloque N1.
  - **Separación de tiempos.** Se separan el tiempo percibido (vídeo), la latencia local de la API y el tiempo de red. **No se resta al tiempo del teléfono la latencia medida en el PC.**
- **Redes.**
  - **N0:** modo avión (`device.sh net off`).
  - **N1:** Wi-Fi local + túnel HTTPS (Cloudflare quick tunnel).
  - En el POCO no hay forma controlada de degradar la red; se declara.
- **Ritmo.** Las repeticiones que llaman al servidor se espacian para respetar el límite de 20 por minuto.
- **Web (R5).** Lo hace la sesión B.
  - Compilación de producción.
  - **En frío:** perfil limpio, sin caché y sin service worker.
  - **En caliente:** la misma sesión, tras una carga previa.
  - Se registran el navegador exacto y la resolución.
- **CSV crudos sanitizados.**
  - Uno por medición y repetición, con: versión del protocolo, SHA de la base, SHA-256 de la APK, red, inicio y fin (s), duración (ms), cuadros de inicio y fin, resultado funcional y error.

### 1.7 Procedimiento (Mobile, sesión A)
1. Levantar el entorno de §0.4 y el túnel. Compilar la APK profile con el origen HTTPS del túnel. Anotar el SHA-256 y el `minSdk`/`targetSdk` leídos con `aapt2`.
2. Instalar sólo `.f10eval`. Activarlo con una cuenta sintética de agricultor (flujo M1).
3. Detener la app y extraer la base. Ejecutar el generador DS-V y devolver la base. Comprobar los conteos en el dispositivo.
4. Hacer un ensayo de herramienta, fuera de las series. Después, en este orden:
   - R1, R2 y R3 en N0;
   - línea base del túnel;
   - R4 en N1;
   - R6, primero S1 (5 subidas y 3 descargas), después S2 y después S3;
   - línea base del túnel al cerrar.
5. Entre bloques, comprobar los conteos para detectar efectos duplicados.
6. Al terminar: restaurar los ajustes del equipo y `stay_on` a 0; borrar las fotos sintéticas fuera del paquete; detener los servicios **conservando** el volumen. Sin `down.sh`.

### 1.8 Criterio de resultado
- **CUMPLE:** el p90 cumple su criterio de §1.5 **y** hubo 0 errores funcionales o de integridad en las n repeticiones.
- **NO CUMPLE:** en cualquier otro caso. Se informa y se analiza. **No se sube el umbral para convertirlo en PASS.**
- **R6 en S1 y S3:** CUMPLE si las 5 subidas y las 3 descargas completan y verifican su integridad dentro de los límites técnicos:
  - en el servidor, 300 s por petición;
  - en el cliente, 5 min por subida; para la descarga, 1 min de inactividad y un tope de 5 min más el tamaño a 16 KiB/s.
- **100 MiB:** no es criterio. Sólo se calcula si el caudal medido lo permitiría.

### 1.9 Riesgos y limitaciones
- **Un solo modelo de teléfono, con MIUI.** No se generaliza a la gama baja.
- **El túnel público** añade una latencia variable que no es de Agrocuentas.
- **El Backend corre en un PC de desarrollo.**
- **El dataset es sintético.**
- **La APK profile** es depurable y está firmada con la clave local; el código Dart está compilado AOT, como en release.

### 1.10 Evidencia
- **Archivos:**
  - Mobile `docs/evidence/F10_RENDIMIENTO_MOBILE.md` (R1–R4 y R6), con sus CSV;
  - Backend `docs/evidence/F10_RENDIMIENTO_CENTRAL_WEB.md` (R5), de la sesión B.
- **Contenido:**
  - SHA de cada componente y SHA-256 de la APK;
  - comandos y salida resumida;
  - fecha y hora reales;
  - dispositivo, PC y navegador;
  - dataset, semilla y red, con la línea base;
  - valores crudos, mediana, p90, máximo y errores;
  - criterio y resultado;
  - desviaciones del protocolo.

---

## 2. Protocolo de compatibilidad (RNF-08)

### 2.1 Objetivo y requisitos
- **Objetivo:** la matriz de configuraciones evaluadas frente al resultado de cada flujo crítico aplicable.
- **RNF-08** (Must): RU-09 y RU-13.
- **Flujos:**
  - INT-01 e INT-02;
  - RF-01, RF-07, RF-12, RF-14, RF-17, RF-18, RF-22, RF-23, RF-24, RF-26, RF-27, RF-30, RF-33 y RF-34;
  - CU-01, CU-02, CU-06, CU-07, CU-09, CU-10, CU-11, CU-12, CU-13, CU-14, CU-15 y CU-18;
  - RN-03.

### 2.2 Configuraciones seleccionadas (matriz académica con el equipo disponible)

| ID | Configuración | Procedencia | Ejecuta |
|---|---|---|---|
| A1 | POCO X5 Pro 5G, Android 12 / API 31, MIUI V14 | DEVICE | A |
| A1-F | A1 con `font_scale` 1,3 (se anota el valor previo y se restaura) | DEVICE | A |
| A2 | AVD `Pixel_8`, Android 16 / API 36 (imagen `android-36.1;google_apis_playstore_ps16k`), ya disponible | EMULADOR | A, según la capacidad de la máquina |
| A3 | AVD con la API del **`minSdk` real de la APK**, leído con `aapt2 dump badging` sobre la APK evaluada, y pantalla pequeña (≈ 360 dp de ancho) | EMULADOR | A. **Si no se dispone de la imagen de sistema de esa API, queda NO EJECUTADA con su causa.** No se sustituye por otra API |
| B1 | Chrome instalado (versión exacta registrada), Windows 11, a 1366×768 y a 1920×1080 | Navegador | B |
| B2 | Edge instalado (versión exacta registrada), mismas resoluciones | Navegador | B |
| A4, A5 | Teléfono físico adicional | — | **NO EJECUTADAS:** no hay equipo real disponible. No se afirma compatibilidad con ellas |

- **Un segundo teléfono físico es una ampliación deseable**, no una condición para empezar ni terminar esta matriz.
- **No se instalan navegadores adicionales** para ampliar la tabla (B3 y B4 quedan fuera).
- **Esta selección no afirma que estos sean los equipos de la Directiva**: ese inventario sigue sin comprobarse.

### 2.3 Flujos críticos

| ID | Flujo (ref.) | Inicio → fin | CUMPLE si |
|---|---|---|---|
| M1 | Instalación y activación (CU-01, RF-01) | Instalar el paquete aislado → Dashboard | Activada; sesión y registro ACTIVE en el servidor; la app normal, intacta |
| M2 | Reapertura sin red (CU-07, RF-17, RNF-02) | N0 + `force-stop` → existencias visibles | Conteos iguales antes y después; ninguna petición |
| M3 | Compra de 2 líneas sin red (CU-06, RF-07) | `/compras/nueva` → compra listada | 1 compra y 2 entradas; la campaña, según la fecha efectiva |
| M4 | Aplicación y rechazo por saldo (CU-09, RF-12, RN-03) | `/aplicaciones/nueva` → confirmación o rechazo | Se aplica entera, o se rechaza sin efectos parciales y con un mensaje comprensible |
| M5 | Foto sintética de comprobante (RF-30) | Selector → foto asociada | El permiso y el selector funcionan en esa versión de Android |
| M6 | Necesidad y sincronización (CU-10, CU-11, RF-14, RF-18) | Declarar sin red → «Sincronizado» | **(Corregido en v1.0.)** Sin red, la intención puede quedar PENDING u OUTCOME_UNKNOWN según el acceso verificado. Lo válido es conservar la operación y su causalidad, terminar en **ACKED bajo autorización**, con journal 1 para su ID y **sin duplicar efectos**. No se exige un estado intermedio concreto |
| M7 | Respaldo: subir (CU-14, RF-26) y restaurar en el mismo paquete (CU-15, RF-27) | `/respaldo-remoto` → app restaurada | Conteos iguales y ningún push al restaurar |
| M8 | Presentación (INT-01) | Pantallas de M3, M4 y M6 | Sin controles tapados por las barras del sistema ni textos cortados (A1-F: `font_scale` 1,3) |
| W1 | Acceso por rol (CU-02) | Login → menú | Directiva y Administrador ven el menú F07; un agricultor es redirigido (la API responde 403) |
| W2 | Resumen por campaña (CU-13, RF-22, RF-24) | `/colectivo/resumen` → tablas | Cifras iguales al oráculo; cobertura «N de M»; la ausencia no se muestra como 0; supresión con k = 3 |
| W3 | Propuesta y CSV (CU-12, RF-23) | `/colectivo/propuestas` → borrador y CSV | Borrador en el historial; CSV descargado con cantidades exactas |
| W4 | Reconciliación (CU-18, RF-33, RF-34) | `/colectivo/reconciliacion` → historial | Asociación con motivo; historial «anterior → nuevo» |
| W5 | Sin conexión en la Web (INT-08) | Cortar la red → acción | Mensaje claro; nada se encola |

### 2.4 Procedimiento
- **Registro por configuración:** modelo, versión y API, capa, `wm size`/`density`, `font_scale`, navegador exacto y resolución.
- **Instalación:** sólo el paquete aislado.
- **Fallos:** captura sin barra de estado, logcat filtrado (`logcat_scan.sh`) y un issue con su reproducción.
- **Procedencia:** en el emulador es `EMULADOR`, nunca `DEVICE`.
- **Ejecución:** A ejecuta M1–M8 en A1 y A1-F. En A2/A3, según la capacidad de la máquina, sin ocupar el teléfono.

### 2.5 Criterio de resultado
- **Por celda:** CUMPLE, NO CUMPLE, BLOQUEADA o NO EJECUTADA.
- **Por configuración:** compatible **sólo si pasan todos sus flujos aplicables**.
- **RNF-08:** se informa con su alcance exacto, configuración por configuración. Si una configuración seleccionada queda sin ejecutar o falla, **no se declara cumplido globalmente** para toda la selección.

### 2.6 Evidencia
- **Archivos:** Mobile `docs/evidence/F10_COMPATIBILIDAD_MOBILE.md`; Backend `docs/evidence/F10_COMPATIBILIDAD_WEB.md`.
- **Contenido:**
  - la matriz y su procedencia;
  - el SHA y el SHA-256 de la APK;
  - `minSdk`/`targetSdk` leídos de la APK;
  - la fecha real;
  - los fallos con su issue;
  - las limitaciones.

---

## 3. Protocolo de usabilidad (RNF-07)

### 3.1 Objetivo y requisitos
- **Objetivo:** observar a usuarios del contexto mientras realizan tareas fijadas de antemano.
- **Qué se registra:** finalización, errores, ayudas, tiempo, SEQ y SUS, con denominadores explícitos.
- **Trazabilidad:**
  - RNF-07 (Must), RU-13;
  - INT-01, INT-02 e INT-08;
  - CU-06, CU-07, CU-09, CU-10, CU-11, CU-12, CU-13 y CU-18;
  - RF-18, RF-23, RF-24 y RF-33;
  - RN-03 y RN-18.

### 3.2 Lo que no es esta evaluación
- **Las sesiones automatizadas no son usabilidad:** pruebas de widget, `walkthrough.mjs` o recorridos de Claude Code.
- **El cuestionario de caracterización** (Anexo B; 38 registros, tesis Tabla 3.1) es del **diagnóstico**. No mide la usabilidad ni la satisfacción con Agrocuentas.
- **Claude no sustituye a los participantes ni produce observaciones humanas simuladas.** Puede preparar materiales y, después, analizar datos reales anonimizados.
- **Fuera de alcance:** la voz, la activación (la hace el facilitador) y la restauración de respaldos.

### 3.3 Diseño aceptado
- **Muestra objetivo fija:**
  - **5 agricultores** para Móvil;
  - **2 miembros de la Directiva** para Web, incluido el presidente con la cuenta ADMINISTRADOR con funciones de Directiva (ADR-003).
  - **Perfiles:**
    - experiencia digital diversa, con al menos 2 agricultores de comodidad autodeclarada 1–2 sobre 5;
    - al menos 1 con modalidad compartida.
  - **No se seleccionan participantes después** según si sus resultados favorecen la aplicación.
  - Móvil y Web se analizan por separado.
- **Piloto:** una sesión con una persona ajena al desarrollo, **fuera de la muestra final**.
  - Si obliga a cambiar tareas o instrumento, se versiona este protocolo y se fija la versión definitiva antes de la primera sesión de la muestra.
  - En el piloto se comprueba la comprensión del SUS en español.
- **Facilitación:** la hace Roderich con el guion fijo.
  - Un observador independiente es recomendable. Si no se consigue, **no se inventa**: se declaran el sesgo y que la recogida la hizo el desarrollador.
- **Consentimiento y datos:**
  - consentimiento informado (escrito, o verbal y anotado), con participación voluntaria y abandono libre;
  - sólo adultos; código de participante (P01, …); sin contraseñas ni datos sensibles;
  - los consentimientos se guardan fuera de los repositorios;
  - sin audio ni rostros;
  - confirmar con el tutor si Univalle exige algún trámite.
  - **No se envían invitaciones ni mensajes en nombre de Roderich. No se fijan fechas de personas que no confirmaron.**
- **Condiciones:**
  - Móvil: A1 con `.f10ux`, reinstalado por participante y sembrado con el dataset sintético **DS-UX** (precisión v1.4; hasta la v1.3 decía «D4»);
  - Web: B1 o B2 con una cuenta sintética de Directiva/Administrador, sobre el tenant DS-UX Web;
  - la red la controla el facilitador.

#### 3.3.1 Dataset DS-UX (precisión v1.4)

- **Motivo:** las tarjetas de §3.4 usan «Glifosato Demo», «Bellator»/«Belator», «parcela Norte» y «Verano Demo», que el dataset D4 de F06 no tiene. DS-UX los proporciona **sin cambiar ninguna tarea ni criterio**. El detalle operativo y las hojas de valores esperados están en `docs/evaluation/usabilidad/09_fixture_y_valores_esperados.md`.
- **Procedencia:** generadores **versionados antes del piloto**, con **semilla 20261018** y **fecha de sesión como parámetro** (día civil en America/La_Paz). Cada sesión registra el SHA del generador, la semilla, la fecha de sesión y la huella del estado sembrado. Los datos son sintéticos; no se usan datos reales ni se habilita la divulgación real (#107 y GATE-F07 siguen pendientes).
  - **Móvil** (sesión C): `tool/f10_ux/` del repositorio Mobile (`dsux_fixture.dart`, `seed_dsux_mobile.dart`, `oracle_dsux_mobile.dart`), que escribe por el repositorio de la aplicación y vincula con el mismo código que la pantalla «Vincular con el sindicato».
  - **Central/Web** (sesión B): generador versionado en el repositorio Backend, con su oráculo independiente.
- **Móvil, por participante** (instalación nueva de `.f10ux`):
  - campaña local «Verano Demo» **contenida en la campaña central** «Verano Demo» (regla D-F04-C2), con fechas que incluyen las operaciones iniciales y el día de la sesión;
  - chacos «Norte» y «Sur»; «Proveedor Demo»; productos «Glifosato Demo» y «Bellator»;
  - stock inicial **5 L** de Glifosato Demo y **1 L** de Bellator, obtenido con **operaciones válidas** (compras por el repositorio, no inserciones directas);
  - campaña y productos **vinculados explícitamente** a sus equivalentes centrales;
  - **dos variantes de modalidad: propia y compartida.** La del participante sigue el diseño de la muestra (al menos 1 en modalidad compartida, §3.3); no se cambia a modalidad propia por comodidad del arnés. La variante compartida añade una persona familiar sintética («Familiar Demo») para que la elección de persona y las asignaciones sean reales;
  - **Ejecución nominal:** tras T1 y T2, Glifosato Demo 6 L y Bellator 1,3 L. **T3 se juzga contra el oráculo condicionado** a lo que el participante haya guardado realmente (tabla de `09_…` §2); sus errores no se corrigen en secreto.
- **Web, tenant aislado de las sesiones Móvil, nuevo por participante Web:** «restablecido» significa **un tenant nuevo sembrado con la misma composición para cada participante Web** (D01, D02 y el piloto X01); los anteriores se conservan intactos. No se borra nada: las asociaciones de productos y las divulgaciones colectivas están protegidas contra el borrado por disparadores, y la primera lectura del resumen ya registra divulgaciones.
  - campaña «Verano Demo»; productos centrales «Glifosato Demo», «Bellator» y «Belator» (este último **sin asociar**);
  - **seis** miembros AGRICULTOR sintéticos (M1–M6) **y ningún otro AGRICULTOR activo en el tenant** (el denominador de la cobertura cuenta todos los AGRICULTOR activos con cuenta activa; la Directiva y el Administrador no cuentan);
  - necesidades declaradas: **Glifosato Demo** M1 20 L, M2 35 L, M3 45 L, M4 50 L (total **150 L**); **Bellator** M1 3 L, M2 4 L, M3 5 L (12 L); **Belator** M1 1 L, M2 2 L, M3 3 L (6 L); tras reconciliar en W3, **18 L con 3 aportantes bajo el nombre canónico que elija el participante** (la pantalla permite asociar en los dos sentidos y ambos cumplen la tarjeta); **M5 y M6 no aportan a ninguna celda**;
  - **cobertura esperada «4 de 6» antes y después de W3.** Precisión: el código calcula los miembros con aportación como la **unión** de los miembros presentes en las cifras publicadas, no sólo los de Glifosato; con esta composición la unión es M1–M4;
  - W3 parte **sin asociación** y W4 **sin borradores previos**;
  - **comprobado por la sesión B el 2026-10-19 (03:22–03:25Z, verificación del generador Central sobre `df0df1d`):** W1 = 150 L con 4 aportantes; W2 = «4 de 6 agricultores vinculados con cifras publicadas» con «Ausencia de aporte = desconocido, no cero»; tras W3, 18 L con 3 aportantes bajo el canónico elegido y Glifosato 150 L, cobertura 4 de 6; la denominación asociada **no desaparece**: queda como fila «Oculto (revisión)» sin cifra, `suppressed_cells` pasa a verdadero y la línea de cobertura añade «Hay filas sin cifra (bajo el umbral o en revisión): sus aportes no se cuentan aquí.»; W4 = un borrador con CSV de 150 L y 18 L (que conserva esa fila sin cifra). Ningún valor esperado cambia;
  - divulgación en modo `provisional-synthetic` con el entorno de §0.4 (`NODE_ENV=development`), k = 3, **sin desactivar ninguna protección de la política**.
  - **Oráculo independiente** (cantidades, unidades, cobertura) contrastado con la API y con la Web **antes de la primera sesión**. Si la Web muestra otra cosa, se corrige la siembra, no el valor esperado.

### 3.4 Tareas
**Tiempo máximo:** 5 min por tarea móvil y 4 min por tarea Web.
- **Inicio:** cuando el facilitador termina de leer la tarjeta.
- **Fin:** el estado observable, o cuando la persona declara que terminó o abandona.

| ID | Tarea (ref.) | Éxito |
|---|---|---|
| T1 | «Sin Internet, registre la compra de hoy: 2 L de Glifosato Demo y 500 mL de Bellator» (CU-06) | La compra aparece con las 2 líneas, las cantidades y las unidades correctas |
| T2 | «Registre que hoy aplicó 1 L de Glifosato Demo y 200 mL de Bellator en la parcela Norte» (CU-09) | Aplicación con las 2 líneas en la parcela correcta |
| T3 | «¿Cuánto Bellator le queda y por qué movimientos?» (CU-07) | Dice el saldo correcto y señala la compra y la aplicación |
| T4 | «Declare que necesitará 20 L de Glifosato Demo para esta campaña» (CU-10) | Necesidad vigente con la cantidad y la unidad correctas |
| T5 | (El facilitador reconecta.) «¿Ya llegó su necesidad al sindicato?» (CU-11, RF-18) | Encuentra Sincronización y responde según el estado real |
| T6 | «Registre una aplicación de 5 L de Bellator» (sólo hay menos; RN-03, INT-08) | Explica que no hay saldo suficiente y cómo continuar; nada se guarda a medias |
| W1 | «Abra el resumen de la campaña Verano Demo y diga la necesidad declarada total de Glifosato Demo» (CU-13) | Valor correcto |
| W2 | «¿Esa cifra incluye a todos los socios?» (RF-24, RN-18) | Identifica la cobertura «N de M» y que la ausencia no es cero |
| W3 | «Indique que Belator es el mismo producto que Bellator» (CU-18, RF-33) | Asociación confirmada con motivo, visible en el historial |
| W4 | «Prepare un borrador de propuesta de compra conjunta y descárguelo» (CU-12) | Borrador en el historial y CSV descargado |
| W5 | «¿Generar ese borrador compra los productos?» (RF-23) | Responde que no: es un borrador para decidir |

### 3.5 Mediciones
- **Ayuda predefinida por tarea:**
  - 0: sin ayuda;
  - 1: pista general («¿dónde cree que podría estar?»);
  - 2: ayuda específica;
  - 3: el facilitador realiza el paso.
- **Se informan por separado:**
  - el éxito **sin ayuda** (nivel 0);
  - el éxito con pista general (nivel 1);
  - la ayuda específica (nivel 2);
  - la intervención del facilitador (nivel 3);
  - los fallos (abandono o tiempo agotado).

  **El conjunto 0–1 no se llama «sin ayuda».**
- **Errores:** desvíos que requieren corregirse. Un **error crítico** es un dato guardado incorrecto sin que la persona lo note.
- **Tiempo por tarea y SEQ (1–7):** sólo descriptivos (mediana y rango). **No se añade** el criterio de tres veces el tiempo del desarrollador.
- **SUS al final**, por interfaz:
  - **Versión:** la española publicada de Sevilla-Gonzalez et al. (2020), *Spanish Version of the System Usability Scale for the Assessment of Electronic Tools: Development and Validation*, JMIR Human Factors 7(4):e21161, doi:10.2196/21161 (<https://humanfactors.jmir.org/2020/4/e21161/>).
  - **Antes de aplicarla:** verificar los ítems y las instrucciones contra la publicación, y registrar cualquier adaptación.
  - Su validación **no equivale** a una validación con agricultores bolivianos: la comprensión se comprueba en el piloto.
  - **Ya no vale la traducción de trabajo del borrador.**
- **Respuestas ausentes:**
  - **No se ordena marcar 3** si la persona no sabe o no quiere responder. Se ofrece una aclaración neutral de la escala, sin sugerir una respuesta.
  - Se conserva la ausencia. **Regla publicada:** un cuestionario con algún ítem sin respuesta es **incompleto**, se informa con su denominador y no entra en la media.
  - **No se imputan puntuaciones.**
- **Puntuación** (Brooke, 1996):
  - a los ítems impares se les resta 1;
  - los pares se restan de 5;
  - la suma se multiplica por 2,5, lo que da 0–100. **No es un porcentaje.**

### 3.6 Criterios de resultado
- **Por tarea:** CUMPLE si el éxito con ayuda de nivel 0–1 es **≥ 80 %** de quienes la intentaron (con 5 agricultores, ≥ 4 de 5; **con 2 de la Directiva, 2 de 2**) y hubo **cero errores críticos**.
  - **Precisión v1.2 (antes de cualquier sesión):** el criterio sólo se evalúa si intentaron la tarea **todos** los participantes de la muestra planificada de esa interfaz (5 en Móvil, 2 en Web). Si no, el resultado es «NO EJECUTADA (muestra incompleta: k de N)», con los conteos visibles. **Nunca da CUMPLE con menos participantes.**
- **SUS:** CUMPLE si la **media es ≥ 68**, como criterio operativo del estudio. No es un porcentaje de usabilidad ni una aceptación institucional.
  - Se publican los puntajes individuales anonimizados, el n válido, la media, la mediana y el rango, por interfaz.
- **Alcance de la muestra:** permite una evaluación **exploratoria**, no una inferencia poblacional.
- Una tarea no ejecutada queda NO EJECUTADA.

### 3.7 Evidencia
- **Archivos:** `docs/evidence/F10_USABILIDAD.md` en Mobile (MOB #37) y en Backend/Web (BE #47), más un CSV anonimizado.
- **Contenido:**
  - la versión del protocolo y su commit;
  - los SHA;
  - las fechas reales de las sesiones;
  - n por perfil;
  - la tabla por tarea con sus denominadores;
  - el SUS por código;
  - los hallazgos por gravedad;
  - las desviaciones.

---

## 4. Estado de los requisitos previos

| Requisito previo | Estado al publicar la versión 1.0 |
|---|---|
| Umbrales, datasets, n, configuraciones y participantes | **Fijados** en esta versión (aprobación técnica delegada, sin ratificación del tutor) |
| Copia de rollback con WAL | **Resuelto:** MOB #91 (`8805ae6`), con discriminación en host; la ruta modificada se comprobó en el POCO con su diario real (MOB `F10_RESTORE_DEVICE.md`). R6 y M7 (restaurar) quedan habilitados |
| Refresco tardío de la lista de Sincronización | **Resuelto:** MOB #93 (`2f4b634`), comprobado en el POCO (caso D) |
| Compilación profile aislada, generador DS-V Mobile, fotos y análisis de cuadros | En preparación por la sesión A (rama de evaluación Mobile). Se registran sus SHA antes de medir |
| Generador DS-V Central y medición Web | Sesión B, rama de evaluación propia |
| Bytes exactos de S1/S2/S3 | Versión 1.1, antes de la primera repetición de R6 |
| Dispositivo físico adicional (A4/A5) | **No es condición.** Quedan NO EJECUTADAS |
| Reclutamiento, consentimiento, tarjetas y piloto | Los prepara la sesión C. Los participantes los consigue Roderich; sin fechas fijadas |
