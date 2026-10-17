# F10 — Rendimiento central y Web: R5a y R5b (RNF-06)

Medición técnica de la sesión B, del 2026-10-17 (UTC), según el protocolo aprobado en el commit `7581af23b417340b7f00fc7e4822dff3ee9a9aab` (`docs/evaluation/F10_PROTOCOLOS_EVALUACION.md` v1.1, PR BE #122). Los umbrales son criterios operativos del estudio piloto, acordados antes de medir. No son límites universales ni cifras de la SRS, y no se cambiaron después de ver los resultados.

## 1. Resultado

| Medición | Criterio aprobado | n | Mediana | p90 | Máximo | Errores | Resultado |
|---|---|---|---|---|---|---|---|
| **R5b**: API `GET /api/v1/collective/campaigns/:id/summary` en localhost, desde el envío hasta el cuerpo completo | p90 ≤ 1 s | 10 | 33,2 ms | 40,9 ms | 42,4 ms | 0 | **CUMPLE** |
| **R5a en frío**: `/colectivo/resumen` con la campaña elegida, hasta ver las dos tablas con filas (Chrome, 1920×1080) | p90 ≤ 3 s | 10 | 382,5 ms | 414,8 ms | 431,2 ms | 0 | **CUMPLE** |
| **R5a en caliente**: ídem | p90 ≤ 1,5 s | 10 | 379,05 ms | 382,9 ms | 391,8 ms | 0 | **CUMPLE** |

- **Cálculo:** p90 por rango más cercano, el 9.º valor de la serie ordenada con n = 10. Con muestras de este tamaño, el percentil es sólo una descripción muestral.
- **Errores:** ninguno en las 30 repeticiones de aceptación. La API registró 0 respuestas 429.
- **Alcance:** Backend y Web en el mismo PC, sin red real entre ellos. **No mide capacidad concurrente**, excluida por el protocolo, ni rendimiento en producción.

## 2. Qué se midió

**Versiones:**

| Componente | Versión |
|---|---|
| Código medido | Backend y Web **`ed069a695eb9f8bdc318bfd16efc0071fcdced25`** (base congelada por A). La rama de evaluación no cambia `Back/src`, `Web/src` ni `Back/prisma` (diff vacío, registrado en `env.txt`) |
| Herramientas | `21e41e0` en la rama `feat/f10-eval-central-web`: `tool/f10_eval_web/run-r5.sh`, `r5.mjs` y `Back/scripts/f10-dsv-central-seed.cjs` |
| Backend | Compilado (`node Back/dist/main.js`), con las 10 migraciones aplicadas sobre una base nueva. **Procedencia de `Back/dist`:** `npm ci && npx prisma generate && rm -f tsconfig.build.tsbuildinfo && npm run build` en `_wt/F10-EVAL-B`, con el código de `ed069a6`; 495 archivos escritos entre 2026-10-17 00:35:37 y 00:35:40Z; huella del árbol (SHA-256 de la lista ordenada de `sha256sum` de sus archivos) `60e52e33af77ed7c343d5ac0dfac0480994ab450b43f5bda5455f8d186536b1e`. No se recompiló antes de las series |
| PostgreSQL | 16.13 en el contenedor propio `agro_b_f10eval_pg` (127.0.0.1:55450), imagen `postgres:16-alpine` `sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50` |
| Web | Compilación de producción (`tsc -b && vite build`), servida con `vite preview` 8.0.10 en 4176; el proxy `/api` apunta a la API en 3122. **Procedencia de `Web/dist`:** `npm ci && npm run build` en `_wt/F10-EVAL-B` (código de `ed069a6`), terminado a las 00:36:01Z; 20 archivos (los de `public/` conservan la fecha de origen, 00:26:08Z); huella del árbol `8a61f5f448191207a36855102c5ac924b076d973fab809025fd84e9fc50244a0` |
| Navegador de R5a | Chrome 155.0.8059.82, headless, a través de puppeteer-core 25.12.0 |
| Node | v25.9.0 |
| PC | Intel i7-13700HX (16 núcleos, 24 hilos), 23,7 GB de RAM, Windows 11 Home 10.0.26200 |

**Configuración que depende de `NODE_ENV`.** Es una desviación declarada de la §0.4, aprobada en el protocolo v1.1.
- Se usó `NODE_ENV=development`, porque `collective-config.ts:20` rechaza `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` en producción. Allí el resumen sale `POLICY_PENDING`, sin tablas que medir.
- **Otras ramas afectadas:**
  - Cookie de sesión: `COOKIE_SECURE=false`, fijado de forma explícita (`auth-v2.controller.ts:48` y `auth.controller.ts:41`; http en localhost).
  - Admisión de respaldos (`backups-config.ts:26`): sin `BACKUP_STORAGE_DIR` responde 503; no se usa.
  - Admisión de Sync v1 (`sync-v1-config.ts:23`): durante la medición no se publica nada por Sync.
- **Sin cambios:** el limitador de 20 peticiones/min por ruta, que no se desactivó, y la compilación.

**Dataset DS-V Central** (protocolo v1.1 §1.4):
- **Semilla:** `20261016`.
- **Generador:** `Back/scripts/f10-dsv-central-seed.cjs`, SHA-256 del archivo `894736e58bc20c3c7dd4dc69def27365a7c66a727d32c54b7c309d0e30e5a4c3`.
- **Huella del dataset:** `2a9d80316b71f8edb37cd728db03eed322c45252da2e98cc68d7a341d499a2f4`. Es la misma en las dos siembras de ensayo y en la de aceptación.
- **Carga directa como fixture,** que no cuenta como Sync. Cada aportación `ACTIVE` lleva su intención `PUBLISH` aplicada en el journal, y se cumplen las restricciones CHECK de la base.
- **Conteos reales:**
  - 74 Members AGRICULTOR, más una cuenta DIRECTIVA y una ADMINISTRADOR;
  - 20 productos y 2 campañas;
  - 761 aportaciones y 761 intenciones en el journal; 72 agricultores aportan alguna vez.
- **Por campaña:**
  - necesidad declarada por 60 Members y consumo por 45, con 1 a 6 productos por Member;
  - 35 celdas;
  - **productos bajo k = 3:** P16, P17 y P18 (celdas de 1 o 2 aportantes);
  - **productos sin datos:** P19 y P20.
- **Archivo de detalle:** `f10_r5/20261017T0052Z/dataset.json`.
- **Campaña medida:** C1 (35 celdas en la respuesta, 12 771 bytes).

## 3. Procedimiento

**Orquestador.** `bash tool/f10_eval_web/run-r5.sh docs/evidence/f10_r5/20261017T0052Z`:
- crea una base nueva, la migra y siembra DS-V;
- arranca la API compilada y `vite preview`;
- mide R5b y después R5a;
- genera en memoria las credenciales sintéticas y las claves, que nunca se escriben en disco ni en los logs.

**R5b.**
- Inicio de sesión por la API, con el token sólo en memoria.
- **1 calentamiento**, aparte de la serie: 139,4 ms. Es la primera lectura en modo provisional, la que crea las divulgaciones.
- Después, 10 peticiones espaciadas 5 s (00:52:30–00:53:15Z).
- **Tiempo medido:** `performance.now()` desde el envío del `fetch` hasta terminar de leer el cuerpo.

**R5a.**
- **Navegador:** Chrome headless con un perfil nuevo. El inicio de sesión por la interfaz no se mide.
- **Inicio:** la navegación a `/colectivo/resumen?campaign=<C1>`.
- **Fin:** el primer `requestAnimationFrame` en que las regiones «Necesidad declarada» y «Consumo» tienen filas, medido con `performance.now()` relativo al inicio de la navegación.
- **Frío:** antes de cada repetición se borran la caché HTTP (`Network.clearBrowserCache`), el service worker y Cache Storage (`Storage.clearDataForOrigin`).
  - **Desviación declarada:** se usa un único perfil de navegador por corrida, no uno por repetición. Se limpian por repetición la caché HTTP, el service worker y Cache Storage; **se conservan la cookie de sesión, localStorage e IndexedDB**. El inicio de sesión no forma parte de lo medido.
  - **`sw_controlled = true` en las 10 repeticiones en frío.** La Web registra su service worker con `vite-plugin-pwa` (`registerType: 'autoUpdate'`). Workbox lo genera con `skipWaiting` y `clients.claim`, de modo que el service worker recién instalado durante la carga toma el control de la página antes del final medido (≈ 380 ms). La columna se lee al final de la repetición, no al inicio de la navegación.
  - **Límite:** no se registró `workerStart` ni el origen de la respuesta de navegación. **No hay prueba directa** de que la navegación no la sirviera un service worker. Lo respaldan el borrado previo del service worker por CDP y que `response_end_ms` en frío (3–34 ms) no difiere del caliente de forma interpretable en localhost. El veredicto no cambia, porque el umbral en frío es de 3 s.
- **Caliente:** sin borrar nada.
- **Calentamientos:** 1 por fase, aparte (frío 425,5 ms; caliente 381,1 ms).
- **Ritmo:** repeticiones espaciadas 5 s, y 61 s entre fases para respetar el limitador.
- **Horario:** frío 00:54:24–00:55:13Z; caliente 00:56:24–00:57:13Z.

**Coordinación.** A no compiló, no lanzó emuladores y no corrió suites durante la ventana (00:52–00:57Z). La sesión C no mide.

**Carga de fondo.** Registrada en `load-before.txt` y `load-after.txt`: CPU media de 16,6 % antes y 9,2 % después, en 5 muestras.
- Procesos con más CPU acumulada: Taskmgr, un proceso `dart` (1,36 GB de memoria residente), Docker Desktop y VS Code.

## 4. Valores crudos

| Serie | Valores (ms), en orden de ejecución | CSV crudo |
|---|---|---|
| R5b | 37,7 · 42,4 · 40,9 · 29,5 · 36,9 · 37,2 · 28,7 · 29,0 · 27,1 · 25,1 | `f10_r5/20261017T0052Z/r5b.csv` |
| R5a en frío | 400,0 · 379,0 · 414,8 · 431,2 · 389,0 · 383,2 · 378,4 · 374,2 · 375,1 · 381,8 | `r5a-chrome-cold.csv` |
| R5a en caliente | 378,4 · 382,4 · 374,0 · 374,0 · 382,9 · 379,7 · 381,5 · 375,7 · 376,4 · 391,8 | `r5a-chrome-warm.csv` |

**Desglose de R5a** (columnas de los CSV, Navigation y Resource Timing; mínimo y máximo de las 20 repeticiones medidas en frío y en caliente, sin warmups):
- El documento llega en 3,1–33,8 ms (`response_end_ms`) y `DOMContentLoaded` en 16,6–56,5 ms.
- La petición del resumen empieza a los 338,9–380,0 ms (`api_start_ms`), porque antes la aplicación renueva la sesión (`/auth/refresh`) y carga las campañas.
- La petición dura 27,5–56,2 ms (`api_end_ms − api_start_ms`).
- El resto hasta las tablas (`ms − api_end_ms`) son 3,8–7,7 ms de renderizado.
- *Corrección del 2026-10-17 (H-9, revisión de C):* la versión anterior decía «26–56 ms» y «4–6 ms», redondeos inexactos, y daba los otros rangos sin decimales. Los valores medidos no cambian.

**Por qué frío y caliente casi coinciden.** En localhost, descargar los recursos estáticos cuesta pocos milisegundos. El tiempo lo dominan las llamadas encadenadas a la API, que no dependen de la caché. Con una red real, el frío añadiría la transferencia de los recursos; esto no se midió.

**SHA-256 de los archivos de resultados:**

| Archivo (`docs/evidence/f10_r5/20261017T0052Z/`) | SHA-256 |
|---|---|
| `r5b.csv` | `42b95fd3651a82c422f63c17f5cb74629cf48c9ef81c8b3cb61d2e5b8bc00f0e` |
| `r5a-chrome-cold.csv` | `13b7e95be0bfd7ae99796017eb58b31ccbc15eb66c5d99e55a1cf6aa9e7d244e` |
| `r5a-chrome-warm.csv` | `a9f721c92b2e884dc0bd4e5ba0e6b940325e9dabc66376d8d1a775a5d17dae3d` |
| `r5b.json` | `a4901cc6868ac87370e857acfae96055b1cfefcd4c15398c66aa692453fa05ec` |
| `r5a-chrome-cold.json` | `d513610a647a4e0c011446a3a04924cfe6c310d0c2361ae38c613b78fc8e66c6` |
| `r5a-chrome-warm.json` | `35d3171aaf71cb4dd621a3f737f583fb83fa8217dc91646bf788ea96c1e55a75` |
| `dataset.json` (UUID enmascarados a 8 hex, sin correos; ver §7) | `f3a5d949307c1f80b6c4244c59c4fbb40d4b055764aecf1a703eb3c45e6fa50c` |
| `api-errors-summary.txt` | `1121ac00d05ff43584379522f47aae6b1b44083625e17fc32c022f644d782951` |

**Logs de la API.** `logs/api.log` **no se publica** (`*.log` está en `.gitignore`; contiene la IP local). Su resumen sin identificadores está en `f10_r5/20261017T0052Z/api-errors-summary.txt`:
- 1 respuesta 401 de `/auth/refresh`, al cargar la página de login sin cookie, como se espera;
- 0 respuestas 429;
- ninguna petición con error en las series.

## 5. Corridas que no forman parte de las series

Se conservan como antecedente y no se mezclan con la aceptación:

| Hora (UTC) | Qué | Motivo y resultado |
|---|---|---|
| 2026-10-17 00:36 y 00:45 | Ensayos del generador: dos siembras v1 (semilla de prueba, 00:36) y dos v1.1 (semilla 20261016, 00:45), en bases `dsv_ensayo_*` | **Ensayo de herramienta:** reproducibilidad de la huella, igual en las dos siembras de cada versión; sin mediciones |
| 00:38 y 00:46 | `run-r5.sh … ensayo` (2 repeticiones por serie) | **Ensayo de herramienta,** antes del commit de las herramientas (`b55d310`, 00:51:39Z). El de 00:38 fue anterior al protocolo v1.1 (00:44:18Z); el de 00:46, posterior. Resultados en el scratchpad, sin usar |
| **00:51:49** | Primer intento de aceptación | **Abortado antes de medir:** con una ruta de salida relativa, la migración falló (`No such file or directory`). No se ejecutó ninguna repetición. Se corrigió en `21e41e0` (ruta absoluta) y se relanzó a las 00:52 |

## 6. Limitaciones

- **Mismo PC.** Backend, base de datos, Web y navegador corren en el PC de desarrollo y comparten CPU. No es un servidor real ni hay red entre ellos.
- **R5a sólo en Chrome,** a 1920×1080 y headless. Edge se evalúa funcionalmente en B2 (`F10_COMPATIBILIDAD_WEB.md`), no en tiempos.
- **`vite preview`, no nginx.** Las cabeceras de caché de los recursos difieren de la imagen nginx de `Web/Dockerfile`.
- **Modo provisional sintético.** F07-POL-01 no está aprobada; con datos reales y en producción, el resumen sale `POLICY_PENDING`.
- **Sin carga concurrente:** una sola persona usuaria y una petición cada 5 s.
- **Dos fugas en el resumen colectivo (#45).** La revisión de #45 encontró dos fugas, ya reproducidas en la rama de seguridad, que no están corregidas en `ed069a6`:
  - una reasociación a un producto canónico sin historial;
  - la cobertura con celdas suprimidas.

  Su arreglo cambia el cálculo del resumen. **Esta serie se conserva tal cual, sobre `ed069a6`.** A decidirá si hay una base nueva y si se repite R5; esa serie se etiquetará aparte.

## 7. Saneado de lo publicado (§0.9)

Corrección del 2026-10-17, tras la revisión de A.
- Los UUID completos de los archivos publicados (`dataset.json` y, en la compatibilidad, `compat.json`, `seed.json` y los CSV descargados, nombre y contenido) se enmascaran a sus 8 primeros hex.
- Se retiraron los correos de las cuentas sintéticas de `dataset.json`.
- Las huellas del dataset (`dataset_sha256`) y del generador no cambian; sólo cambia la huella del archivo `dataset.json`, actualizada en la §4.
- Los valores medidos y los CSV de las series no contenían identificadores y no se tocaron.

