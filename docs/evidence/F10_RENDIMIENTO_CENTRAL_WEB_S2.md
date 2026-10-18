# F10 — Rendimiento central y Web, serie 2: R5a y R5b (RNF-06) sobre `6c54c00`

Medición técnica de la sesión B de Claude Code, del 2026-10-18 (UTC), según el protocolo `docs/evaluation/F10_PROTOCOLOS_EVALUACION.md` **v1.3** (`9bfcad22731e7352f494e85e79aa56da25a28dbe`) y el suplemento de base `docs/evaluation/F10_SUPLEMENTO_BASE_2026-10-18.md` (PR BE #139; HEAD revisado por B y C: `93c90c1`; el SHA definitivo es el de su integración). Es la **serie 2**: repite R5a y R5b sobre la base nueva porque BE #126, #127 y #128 cambiaron el resumen colectivo y la Web. La serie 1 (`F10_RENDIMIENTO_CENTRAL_WEB.md`, `ed069a6`, 2026-10-17) **se conserva tal cual** y no se mezcla con esta.

Los umbrales son los de la v1.3 (§1.5), fijados antes de medir y sin cambios. Procedencia **HOST**: Backend, base de datos, Web y navegador en el mismo PC. No es una evaluación con usuarios ni una prueba de capacidad concurrente. Sin inspección personal de Roderich ni revisión del tutor.

## 1. Resultado

| Medición | Criterio (v1.3 §1.5) | n | Mediana | p90 | Máximo | Errores | Resultado |
|---|---|---|---|---|---|---|---|
| **R5b**: API `GET /api/v1/collective/campaigns/:id/summary` en localhost, desde el envío hasta el cuerpo completo | p90 ≤ 1 s | 10 | 28,45 ms | 37,4 ms | 39,4 ms | 0 | **CUMPLE** |
| **R5a en frío**: `/colectivo/resumen` con la campaña elegida, hasta ver las dos tablas con filas (Chrome, 1920×1080) | p90 ≤ 3 s | 10 | 388,75 ms | 402,4 ms | 404,0 ms | 0 | **CUMPLE** |
| **R5a en caliente**: ídem | p90 ≤ 1,5 s | 10 | 380,05 ms | 385,5 ms | 388,3 ms | 0 | **CUMPLE** |

- **Cálculo:** p90 por rango más cercano (§0.8): el 9.º valor de la serie ordenada con n = 10. Con muestras de este tamaño, el percentil es sólo una descripción muestral.
- **Errores:** ninguno en las 30 repeticiones de aceptación; 0 respuestas 429; todas las respuestas del resumen fueron 200 con 35 celdas en modo `PROVISIONAL_SYNTHETIC`.
- **Serie 1, a título informativo** (misma máquina, otra base `ed069a6`, 2026-10-17): R5b p90 40,9 ms; R5a frío p90 414,8 ms; caliente p90 382,9 ms. No es una comparación controlada: cambió el código medido y la carga de fondo del PC.

## 2. Qué se midió

| Componente | Versión |
|---|---|
| Código medido | Backend y Web **`6c54c0072d2140db4be448d5f81d4e5ed498a260`** (`main`; código = `cab433d`, merge de PR #128; después sólo documentos). La rama de herramientas no cambia `Back/src`, `Web/src` ni `Back/prisma` (diff 0 líneas, registrado en `env.txt`) |
| Herramientas | `80ba254` en `eval/f10-serie2-central-web`: `tool/f10_eval_web/run-r5.sh`, `r5.mjs`, `sanitize.mjs` y `Back/scripts/f10-dsv-central-seed.cjs`. Cambios frente a la serie 1: contenedor, puertos, etiqueta y código medido por variables de entorno; saneado automático de identificadores al final; `env.txt` registra contenedor, puertos y migraciones. `r5.mjs` no cambia |
| Backend | Compilado (`node Back/dist/main.js`), **11 migraciones** aplicadas en orden sobre una base nueva (`dsv_20261018_152740`; la 11.ª es `20261017020156_f10_proposal_coverage_basis`). **Procedencia de `Back/dist`:** `npm ci && npx prisma generate && rm -f tsconfig.build.tsbuildinfo && npm run build` en `_wt/B-F10-S2-BE` con el código de `6c54c00`, 2026-10-18 15:12:39–15:13:15Z; 501 archivos; huella del árbol (SHA-256 de la lista ordenada de `sha256sum`) `4c13d69a889d87de08729e42ac4170b3ca5e1c7afbb718693965c1f1398960a5`. No se recompiló antes de las series |
| PostgreSQL | 16.13 en el contenedor **nuevo** `agro_b_f10eval2_pg` (127.0.0.1:55456, volumen `agro_b_f10eval2_pgdata`), imagen `postgres:16-alpine` `sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50` (la misma de la serie 1). El contenedor de la serie 1 (`agro_b_f10eval_pg`) no se tocó |
| Web | Compilación de producción (`tsc -b && vite build`), servida con `vite preview` 8.0.10 en **4178**; el proxy `/api` apunta a la API en **3132**. **Procedencia de `Web/dist`:** `npm ci && npm run build` en `_wt/B-F10-S2-BE` (código de `6c54c00`), 15:13:22–15:13:47Z; 20 archivos; huella del árbol `cf54baa78b12b47903850e122e9584ad49ff495b6826364675e26eb644a3a26a` |
| Navegador de R5a | Chrome 155.0.8059.82, headless, a través de puppeteer-core 25.12.0 (Edge 155.0.4283.45 instalado; no se usa en R5a) |
| Node | v25.9.0 |
| PC | Intel i7-13700HX (16 núcleos, 24 hilos), 23,7 GB de RAM, Windows 11 Home 10.0.26200 |

**Configuración que depende de `NODE_ENV`** (desviación declarada de la §0.4, aprobada en el protocolo desde la v1.1 y conservada en la v1.3 y en el suplemento §4):
- `NODE_ENV=development`, porque `collective-config.ts:20` rechaza `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` en producción; allí el resumen sale `POLICY_PENDING`, sin tablas que medir.
- Cookie de sesión: `COOKIE_SECURE=false`, explícito (http en localhost). Admisión de respaldos (`backups-config.ts:26`): sin `BACKUP_STORAGE_DIR` responde 503; no se usa. Admisión de Sync v1 (`sync-v1-config.ts:23`): durante la medición no se publica nada por Sync.
- **Sin cambios:** el limitador (`ThrottlerModule`, 20 peticiones/min por ruta; 5/min en `/auth/login`) y la compilación.

**Dataset DS-V Central** (v1.3 §1.4):
- **Semilla:** `20261016`. **Generador:** `Back/scripts/f10-dsv-central-seed.cjs`, blob de git `894736e58bc20c3c7dd4dc69def27365a7c66a727d32c54b7c309d0e30e5a4c3` (el mismo de la serie 1; la copia de trabajo en Windows da `109c771d…` sólo por los finales de línea CRLF, y `dataset.json` registra ese valor como `generator_sha256`).
- **Huella del dataset:** `2a9d80316b71f8edb37cd728db03eed322c45252da2e98cc68d7a341d499a2f4`, **idéntica a la serie 1**: el generador es determinista y las 11 migraciones no cambian lo que genera.
- Carga directa como fixture (no cuenta como Sync); cada aportación `ACTIVE` lleva su intención `PUBLISH` aplicada en el journal.
- **Conteos:** 74 Members AGRICULTOR más una cuenta DIRECTIVA y una ADMINISTRADOR; 20 productos y 2 campañas; 761 aportaciones y 761 intenciones; 72 agricultores aportan. Por campaña: necesidad declarada por 60 y consumo por 45 Members; 35 celdas; productos bajo k = 3: P16, P17 y P18; sin datos: P19 y P20.
- **Campaña medida:** C1 (35 celdas; **12 795 bytes** de respuesta, frente a 12 771 en la serie 1: el resumen de `6c54c00` incluye los campos de cobertura de BE #126).
- Detalle en `f10_r5/20261018T152739Z/dataset.json` (UUID a 8 hex, sin correos).

## 3. Procedimiento

**Orquestador.** `PG_CONTAINER=agro_b_f10eval2_pg PG_PORT=55456 API_PORT=3132 WEB_PORT=4178 CODE_MEASURED=6c54c00… BASE_REF=6c54c00 PROTOCOL_LABEL="… v1.3 @ 9bfcad2…; suplemento …" bash tool/f10_eval_web/run-r5.sh docs/evidence/f10_r5/20261018T152739Z`:
- crea una base nueva, la migra (11) y siembra DS-V;
- arranca la API compilada y `vite preview`;
- mide R5b y después R5a; al terminar sanea lo publicable.
- Las credenciales sintéticas y las claves se generan en memoria y no se escriben en disco ni en los logs.

**R5b.** Inicio de sesión por la API, token sólo en memoria. **1 calentamiento** aparte: 137,6 ms (la primera lectura en modo provisional crea las divulgaciones). Después, 10 peticiones espaciadas 5 s (15:28:07–15:28:52Z). Tiempo medido con `performance.now()` desde el envío del `fetch` hasta terminar de leer el cuerpo.

**R5a.** Chrome headless con un perfil nuevo; el inicio de sesión por la interfaz no se mide. Inicio: navegación a `/colectivo/resumen?campaign=<C1>`. Fin: primer `requestAnimationFrame` en que las regiones «Necesidad declarada» y «Consumo» tienen filas.
- **Frío:** antes de cada repetición se borran la caché HTTP (`Network.clearBrowserCache`), el service worker y Cache Storage (`Storage.clearDataForOrigin`). **Desviación declarada (como en la serie 1):** un único perfil por corrida; se conservan la cookie de sesión, localStorage e IndexedDB.
- **`sw_controlled = true` en las 20 repeticiones** (frío y caliente): el service worker de `vite-plugin-pwa` (`skipWaiting`, `clients.claim`) toma el control durante la carga. **Límite:** no se registró `workerStart` ni el origen de la respuesta de navegación; no hay prueba directa de que la navegación no la sirviera el service worker. `response_end_ms` en frío (2,8–6,5 ms) no se distingue del caliente (3,1–6,7 ms) en localhost. El veredicto no cambia (umbral en frío 3 s).
- **Caliente:** sin borrar nada.
- **Calentamientos:** 1 por fase, aparte (frío 419,7 ms; caliente 376,5 ms).
- **Ritmo:** repeticiones espaciadas 5 s; 61 s entre fases para respetar el limitador.
- **Horario:** frío 15:30:00–15:30:49Z; caliente 15:32:01–15:32:50Z.

**Coordinación (suplemento §5, ventana V2).** A abrió la ventana V2 por mensaje (A la fechó «~15:30Z»; la corrida empezó a las 15:27:39Z, tras recibir el mensaje) y la cerró B a las 15:36:05Z. Durante la ventana, A declaró no compilar, no medir y no ejecutar ffmpeg ni suites (sólo `adb`/`uiautomator` sin carga en el PC); C no mide.

**Carga de fondo.** `load-before.txt` / `load-after.txt`: CPU media 22,8 % antes y 25,4 % después (5 muestras). Procesos con más CPU acumulada: Docker Desktop, un `dart language-server` de la extensión Dart de VS Code (2,7 GB de memoria residente; **condición del PC**, no pertenece a ninguna sesión), Taskmgr, VS Code. Memoria libre: 7,1 GB antes de la corrida y 6,2 GB después.

## 4. Valores crudos

| Serie | Valores (ms), en orden de ejecución | CSV crudo |
|---|---|---|
| R5b | 34,5 · 28,1 · 28,0 · 39,4 · 28,8 · 24,0 · 27,5 · 26,2 · 36,9 · 37,4 | `f10_r5/20261018T152739Z/r5b.csv` |
| R5a en frío | 396,5 · 395,0 · 384,1 · 383,5 · 402,4 · 404,0 · 384,9 · 383,7 · 385,9 · 391,6 | `r5a-chrome-cold.csv` |
| R5a en caliente | 385,5 · 374,5 · 374,2 · 376,5 · 376,9 · 383,7 · 373,1 · 384,9 · 383,2 · 388,3 | `r5a-chrome-warm.csv` |

**Desglose de R5a** (Navigation y Resource Timing; mínimo y máximo de las 10 repeticiones medidas de cada fase, sin calentamientos):
- El documento llega en 2,8–6,5 ms (frío) y 3,1–6,7 ms (caliente) (`response_end_ms`); `DOMContentLoaded` en 21,0–39,2 ms y 15,6–21,8 ms.
- La petición del resumen empieza a los 345,6–371,9 ms (frío) y 339,1–355,0 ms (caliente) (`api_start_ms`): antes la aplicación renueva la sesión (`/auth/refresh`) y carga las campañas.
- La petición dura 28,3–49,0 ms (frío) y 26,7–35,1 ms (caliente) (`api_end_ms − api_start_ms`).
- El resto hasta las tablas (`ms − api_end_ms`) son 3,8–7,9 ms de renderizado en ambas fases.
- Frío y caliente casi coinciden porque en localhost los recursos estáticos cuestan pocos milisegundos y el tiempo lo dominan las llamadas encadenadas a la API; con una red real el frío añadiría la transferencia, que no se midió.

**SHA-256 de los archivos de resultados** (`docs/evidence/f10_r5/20261018T152739Z/`):

| Archivo | SHA-256 |
|---|---|
| `r5b.csv` | `7041b950918cac4b7c1c72f0d0c014e919f76b73f43dd2477814825a251611b6` |
| `r5a-chrome-cold.csv` | `c28a7ac0566648736f7f444f5d965c4f01e8fc66d31818bf2352e05bdfe98c87` |
| `r5a-chrome-warm.csv` | `b7b4765c1b5edcebaab6df37d89de19e9c27c587bc8866e3c0ba9b773ead78a7` |
| `r5b.json` | `f11e1c548cca19bae3bcf4786ee739bae6ad66b5a6011942d01ee1da979894fa` |
| `r5a-chrome-cold.json` | `f717a9f9a83dcd72ccde94170f6d236a306ed10a11fd3c0417d23566c47ca81a` |
| `r5a-chrome-warm.json` | `2f297e9ec896078c82ee3eac4f33787eeb71200ff864d093207ca2e3e9003c84` |
| `dataset.json` (saneado) | `adb2762393430c02b6d9e9fae06aa0693fb784c08584d29d7e7879aa0bb05364` |
| `api-errors-summary.txt` | `28ae1a45276d709ef425f5dd6446a141fba23aa62722c81b7e4f8cd579acb74b` |

**Logs de la API.** `logs/api.log` **no se publica** (`*.log` está en `.gitignore`; contiene la IP local). Su resumen sin identificadores está en `api-errors-summary.txt`: 1 respuesta 401 de `/auth/refresh` al abrir el login sin cookie (esperada); 0 respuestas 429; 34 cálculos del resumen (calentamientos y repeticiones de R5b y R5a); ninguna petición con error en las series.

## 5. Corridas que no forman parte de las series

| Hora (UTC) | Qué | Motivo y resultado |
|---|---|---|
| 2026-10-18 15:19:13 | Ensayo de herramienta (`run-r5.sh … ensayo`, 2 repeticiones por serie) sobre la misma base nueva, con las herramientas aún sin commit (3 archivos modificados) | **Ensayo,** no aceptación. Migración y siembra correctas (huella del dataset `2a9d8031…`); R5b 2/2 sin error (42,9 y 37,9 ms); R5a frío 2/2 sin error (388 y 396 ms). **Incidente del arnés:** a ~15:23Z Claude Code detuvo el proceso por memoria baja del PC (en ese momento corría además un `flutter test` de la siembra de A y el `dart language-server` de 2,7 GB); el caliente no llegó a correr. Los procesos huérfanos de B (API 3132, `vite preview` 4178, Chrome headless) se terminaron a mano antes de la aceptación; puertos libres comprobados. Resultados en el scratchpad, sin usar |
| 15:34:08–15:36:05 | Ensayo de herramienta de **compatibilidad** (una configuración, B1 Chrome 1366×768), dentro de la ventana V2 y fuera de la matriz | Ver `F10_COMPATIBILIDAD_WEB_S2.md` §5 cuando exista. Resultado: W2–W5 CUMPLE; W1 **NO CUMPLE por un fallo de la herramienta** (un sexto inicio de sesión por la API en el mismo minuto recibió 429 del limitador de `/auth/login`, 5/min, y la comprobación del 403 del agricultor se hizo sin token: 401). Corregido en la herramienta reutilizando el token de la Directiva; la matriz de aceptación se ejecuta en V4 |

## 6. Limitaciones

- **Mismo PC.** Backend, base de datos, Web y navegador comparten CPU; no es un servidor real ni hay red entre ellos.
- **R5a sólo en Chrome,** a 1920×1080 y headless. Edge se evalúa funcionalmente en B2 (`F10_COMPATIBILIDAD_WEB_S2.md`), no en tiempos.
- **`vite preview`, no nginx.** Las cabeceras de caché difieren de la imagen nginx de `Web/Dockerfile`.
- **Modo provisional sintético.** F07-POL-01 (#107) sigue Pending; con datos reales y en producción, el resumen sale `POLICY_PENDING`.
- **Sin carga concurrente:** una sola persona usuaria y una petición cada 5 s.
- **Service worker:** sin prueba directa de que la navegación en frío no la sirviera el service worker (§3).
- **Carga de fondo no controlada del todo:** el `dart language-server` de VS Code (2,7 GB) estuvo activo durante la corrida; la CPU media fue 22,8–25,4 %.
- GATE-F10 (BE #49) sigue **Pending**; lo decide Roderich. Este documento no cierra ningún gate.

## 7. Saneado de lo publicado (§0.9)

`sanitize.mjs` enmascara los UUID a sus 8 primeros hex y retira los correos de `dataset.json` al final de la corrida (7 archivos tratados; los CSV y JSON de las series no contenían identificadores y sus valores no cambian). Ningún token, contraseña ni `DATABASE_URL` aparece en los archivos publicados.
