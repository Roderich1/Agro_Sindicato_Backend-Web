# F12-EST-10 (#183): índice de evidencia del bloque de estimación del consumo (F12-EST-01 a F12-EST-09)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-03 (UTC) |
| Base | Backend `main` `075a511` (tras #198); Mobile `main` `5b5b318` (tras AppMovilAgroquimico#181) |
| Procedencia de este índice | Lectura de las evidencias, de los comentarios de cierre de los issues y de los merges en GitHub. Este índice **no ejecuta pruebas nuevas**: cada resultado es el que registró su evidencia, con su fecha |
| Issue | Refs #183. El acta propuesta está en [`F12_GATE.md`](F12_GATE.md) |
| Datos | Solo sintéticos. Ninguna cifra procede del Sindicato |

**Abreviaturas.** `ev/` = `docs/evidence/` del Backend. `M/` = `docs/evidence/` de Mobile, en `5b5b318`. **HOST** = Windows 11 Home 10.0.26200, Node 25.9.0 y PostgreSQL 16.13 desechable (Docker `--rm`), salvo que se indique otra cosa. **NAVEGADOR** = Edge sin interfaz con puppeteer-core, contra el backend real (`node dist/main.js`). **EMULADOR** y **DEVICE** se indican solo donde se ejecutaron.

## 1. Resumen por entregable

| Entregable | Issue | PR → merge | Procedencia | Estado del issue |
|---|---|---|---|---|
| F12-EST-01 Contrato INT-09, permisos y datos | #174 | #187 → `256ca53` | HOST | Cerrado; un criterio «especificado, no ejecutado» en su bloque, probado después en EST-05 |
| F12-EST-02 Series por producto canónico y temporada | #175 | #188 → `973e2f6`; #191 → `35d9a1b` (temporadas, EST-D-02); #194 → `3d2ab4b` (asociaciones); #196 → `9c45270` (EST-D-17, documentación) | HOST | Cerrado; criterio 1 con la precisión EST-D-17 |
| F12-EST-03 Cobertura, ceros, ausencias y ocultos | #176 | #188 → `973e2f6` | HOST | Cerrado |
| F12-EST-04 SES frente al naive | #177 | #189 → `f3d41d3` | HOST (con referencia en Python 3.11) | Cerrado |
| F12-EST-05 Ejecuciones inmutables y vigencia | #178 | #190 → `106045c` | HOST, con un ensayo de proceso real (`node dist/main.js`) | Cerrado |
| F12-EST-06 Generación y consulta en la Web | #179 | #192 → `b68eca0` | HOST y NAVEGADOR | Cerrado |
| F12-EST-07-WEB Copia en la PWA | #180 | #195 → `635cc8f` | HOST y NAVEGADOR (desconexión emulada con DevTools) | Cerrado |
| F12-EST-07-MOB Copia en Mobile | AppMovilAgroquimico#164 | Mobile #180 → `c2ac44a`; Mobile #181 → `5b5b318` (espera de prueba); Backend #197 → `670902d` (documentación) | HOST; DEVICE con Backend real; DEVICE con servidor simulado. **EMULADOR no ejecutado** | Cerrado |
| F12-EST-08 Referencia en la propuesta | #181 | #198 → `075a511` | HOST y NAVEGADOR | Cerrado |
| F12-EST-09 Evaluación sintética | #182 | #193 → `6117c77` | HOST (evaluación pura, sin base ni red) | Cerrado |
| F12-EST-10 Este índice, manuales y acta | #183 | PR documental en borrador | — | Abierto |

En todos los issues cerrados, el Project registra Status Done, Evidence Verified y Gate N/A.

## 2. Detalle por entregable

### F12-EST-01 (#174): contrato INT-09, permisos y esquema

- **Versión integrada:** `256ca53`, PR #187. Código verificado en tres tandas: `acc04fa`, `c957330` y `cd23ab1`, más el ajuste EST-D-06 sobre `97a95c0`.
- **Evidencia:** `ev/F12_EST_01_CONTRATO_INT09_2026-11-01.md` y `ev/F12_EST_01_CONCILIACION_2026-11-01.md` (las dos son registros históricos), y `ev/F12_EST_01_DESBLOQUEO_2026-11-01.md`. Contrato: `docs/architecture/F12_EST_01_ESTIMATION_CONTRACT.md`, con su especificación `docs/api/openapi-f12-estimation.json`.
- **Entorno:** HOST, Prisma 6.19.3.
- **Resultados:**
  - Suite de esquema: 9/9, después 11/11 y finalmente 13 pruebas.
  - `npm test`: 423 superadas y 311 omitidas en la última tanda.
  - Alteraciones: 16/16 de la migración F12, 5/5 de F07 y 30/30 de la especificación y el esquema.
- **Criterios:**
  - Contrato completo: cubierto.
  - Migración aditiva: cubierto.
  - Rechazo sin permiso, sin ejecutar el cálculo: **«especificado, no ejecutado»** en este bloque, porque no había controlador. El 403 se probó por HTTP en F12-EST-05.
- **Límites y pendientes:**
  - Los sellados anteriores a la migración no tienen cobertura de consumo. **Ninguna campaña ya sellada puede llevar a un `ESTIMATED`**: el primer resultado real exige tres campañas consecutivas selladas después de la migración (contrato §11.3).
  - `POPULATION_MISMATCH` solo se probó con inserción directa.

### F12-EST-02 (#175): series de consumo, temporadas y asociaciones

- **Versiones integradas:**
  - `973e2f6` (#188, código `92a45ba`);
  - `35d9a1b` (#191, temporadas y clasificación inicial, EST-D-02, código `2eac025`);
  - `3d2ab4b` (#194, asociaciones; la evidencia no indica el SHA probado, y el cierre cita `579aa5e` de la rama);
  - `9c45270` (#196, EST-D-17).
- **Evidencia:** `ev/F12_EST_02_03_SERIES_2026-11-01.md`, `ev/F12_EST_02_ASOCIACIONES_2026-11-02.md` y `ev/F12_EST_SEASONS_2026-11-02.md`.
- **Entorno:** HOST, con sellados reales de F07 por la API.
- **Resultados:**
  - SERIES: `npm test` 432 superadas y 315 omitidas; `f12-est-02-series` 4; 11 alteraciones.
    - **Conservado:** la primera ejecución de `current-auth-context` dio **25 fallidas** por agotar 5000 ms. Repetida dos veces, 25/25.
  - ASOCIACIONES: 17/17.
  - SEASONS: 458 superadas y 332 omitidas; suite de temporadas 3/3. Sobre `2eac025` fallan las 5 alteraciones; sobre `15b09b9` sobrevivía una.
- **Criterios** (cierre sobre `3d2ab4b`):
  - criterio 1, acreditado con la **precisión EST-D-17**: con una asociación posterior al sellado se rechaza con `CANONICAL_CHANGED_AFTER_SEAL`, y eso no es una agregación;
  - criterios 2 y 3: acreditados.
  - El mismo día, el issue figuró antes como «Parcial».
- **Límites:**
  - Un período sin campaña registrada no se detecta.
  - **Asignar las temporadas a #175** fue una propuesta para el autor. No consta una decisión explícita sobre esa asignación.

### F12-EST-03 (#176): cobertura, ceros, ausencias y datos ocultos

- **Versión integrada:** `973e2f6` (#188, código `92a45ba`).
- **Evidencia:** `ev/F12_EST_02_03_SERIES_2026-11-01.md`.
- **Entorno:** HOST, con sellados reales de F07.
- **Criterios acreditados:**
  - cero frente a ausencia;
  - dato oculto;
  - exclusión anterior al hueco (`BEFORE_GAP`);
  - menos de tres campañas.
- **Límite:** `POPULATION_MISMATCH` solo se probó con inserción directa.

### F12-EST-04 (#177): SES frente a la línea base naive

- **Versión integrada:** `f3d41d3` (#189, código `b01052c`).
- **Evidencia:** `ev/F12_EST_04_SES_NAIVE_2026-11-02.md`, con la referencia independiente `ev/f12_est_04/referencia_ses_naive.py`.
- **Entorno:** HOST; Python 3.11 para la referencia.
- **Resultados:**
  - 443 superadas y 315 omitidas; `ses-naive` 11; 15 alteraciones.
  - Ejemplo de 3.12.5 (96, 120, 104 y 116 L): α 0,50, SES 111 L y naive 116 L.
- **Criterios acreditados:**
  - ejemplo;
  - determinismo;
  - período reservado;
  - «el SES no mejora al naive» como resultado válido.
- **Límites:**
  - El cierre dice que **no acredita precisión con campañas reales**.
  - No es la evaluación de RNF-13 (eso es F12-EST-09).

### F12-EST-05 (#178): trabajos, ejecuciones inmutables y vigencia derivada

- **Versión integrada:** `106045c` (#190; código `a7bc3ec` y `dc84f0a`).
- **Evidencia:**
  - `ev/F12_EST_05_RUNS_2026-11-02.md`;
  - `ev/F12_EST_05_PROCESO_2026-11-02.md`, con `ev/f12_est_05/ensayo-proceso-trabajador.cjs`;
  - `ev/F12_EST_DECISIONES_2026-11-02.md`.
- **Entorno:**
  - HOST;
  - ensayo con el proceso real `node dist/main.js`, por HTTP: un proceso; dos procesos que toman «tres y tres»; sin trabajador, el trabajo espera.
- **Resultados:**
  - `f12-est-05-runs` 12, después 16 con las decisiones y 28/28 sobre `b68eca0`.
  - CI `verify` run 41433096139 en success.
  - 25 y 29 alteraciones.
- **Criterios acreditados:**
  - sin UPDATE ni DELETE;
  - «sustituida»;
  - «desactualizada» por cifras, asociación y clasificación;
  - 403 ante permiso perdido.
- **Decisiones:** EST-D-08, 10 y 12, decididas por el autor el 2026-11-02. PROCESO y RUNS conservan como registro histórico el texto anterior, que las daba por pendientes.
- **Límites:**
  - sin ganchos de apagado;
  - un conflicto de sucesión real no se reprodujo;
  - `SKIP LOCKED` no tiene una alteración que lo detecte;
  - la retención depende de GOV-02 (#185).

### F12-EST-06 (#179): pantalla Web «Estimación del consumo»

- **Versión integrada:** `b68eca0` (#192). Código `0094c70`; comprobación de cierre sobre `20299dd` y `e9712e4`.
- **Evidencia:** `ev/F12_EST_06_WEB_2026-11-02.md` y `ev/f12_est_06/`.
- **Entorno:**
  - HOST;
  - NAVEGADOR con puppeteer-core 24.10.0 (versión de Edge no registrada). Las órdenes de control simulan en la base la clasificación, la retirada y la pérdida del rol.
- **Resultados:**
  - recorrido de cierre: Administrador 15/15, Directiva 33/33 y política pendiente 5/5;
  - Vitest 114/114;
  - alteraciones 11/11 y 7 nuevas.
- **Criterios:** los tres acreditados, más el contraste con el prototipo W4.
- **Límites:**
  - la pantalla no detecta de inmediato un cambio de permiso;
  - en ese PR, `verify` quedó **«omitido, no aprobado»**.

### F12-EST-07-WEB (#180): copia descargada en la PWA

- **Versión integrada:** `635cc8f` (#195). Código: servicio `831f169`; Web `c49f223`, `aa53833` y `1d29eb0`.
- **Evidencia:** `ev/F12_EST_07_WEB_2026-11-02.md` y `ev/f12_est_07/`.
- **Entorno:**
  - HOST;
  - NAVEGADOR (puppeteer-core 24.10.0, perfil persistente), con la desconexión **emulada** con DevTools;
  - fallo de IndexedDB **inyectado** y escritura tardía **simulada**.
- **Resultados:**
  - servicio 22/22;
  - `openapi:check` en etapa IMPLEMENTED (12 operaciones);
  - Vitest 161;
  - recorrido final sobre `1d29eb0`: 66/66 y 6/6. Una reproducción intermedia sobre `654ed43` dio 61/66 y se conserva;
  - 22 de 24 alteraciones.
- **Criterios:** los tres y el entregable, «Cumple».
- **Límites:**
  - el contexto local identifica la **sesión, no la persona**;
  - sin conexión no se conocen revocaciones;
  - la huella FNV-1a no es cifrado;
  - manipular `localStorage` está fuera del modelo.

### F12-EST-07-MOB (AppMovilAgroquimico#164): copia descargada en la app

- **Versión integrada:** Mobile `c2ac44a` (#180). Código final de `lib/`: `5594599`.
  - La CI de `main` falló en `c2ac44a` (2231 superadas, 2 fallidas y 4 omitidas, por una espera de prueba ajena a la copia).
  - Se corrigió en Mobile #181 → `5b5b318`, cuya CI pasó: 2233 superadas, 0 fallidas y 4 omitidas.
- **Evidencia:** `M/F12_EST_07_MOB_ESTIMACION_2026-11-02.md` (§10–§13) y `M/F04_MODE_ONBOARDING_ESPERA_2026-11-03.md`. Contrato: `docs/architecture/F12_EST_07_COPIA_MOBILE.md` (Backend).
- **Entorno, separado:**
  - **HOST:** Flutter 3.47.2 y `sqflite_common_ffi`, con fallos de SQLite y del almacenamiento seguro **inyectados**. Suite completa 2237/2237 sobre `095684e`, el 2026-11-03.
  - **DEVICE con Backend real:**
    - POCO X5 Pro 5G (Xiaomi 22101320G), Android 12, app aislada `.est164`;
    - Central propio y desechable, Backend `635cc8f`, por un túnel HTTPS temporal (`cloudflared` 2026.10.0);
    - APK de `c127c45` (SHA-256 `281117cb…928cd`) y de `5594599` (`9fab4a7a…a67e5d`);
    - peticiones `/results`: 3×200, 1×404 y 1×409; `/download`: 3×200.
    - Sin fallos inyectados en el teléfono.
  - **DEVICE con servidor simulado:** `integration_test` 5/5, también para el respaldo y la restauración.
  - **EMULADOR:** no ejecutado.
- **Criterios:**
  - cuatro «Cumple»;
  - cambio de identidad o cierre de sesión: **«Cumple en HOST»**. En el teléfono no se ejercitaron el cierre de sesión ni el cambio de identidad.
- **Límites:**
  - **Sesión, no persona:** la copia la lee quien use la sesión del titular vigente. No se añadieron PIN ni contraseñas.
  - **Sin conexión no se conocen revocaciones** ni cambios de política o de fuentes.
  - **Fallo doble (excepción aceptada por el autor el 2026-11-03, alcance académico):** si SQLite y el almacenamiento seguro rechazan ambos la escritura de la retirada, la lectura queda bloqueada en esa ejecución, pero **la retirada no persiste tras reiniciar**. Sin conexión, la copia anterior puede volver a leerse para la misma identidad. No aprueba condiciones de producción.
  - **Fuera del respaldo:** las tablas de la copia quedan vacías en el `.agrobackup` (con `VACUUM`), y restaurar no trae la copia.
  - `f10_x01_pago_datos_test` falló una vez en local y sigue **sin reproducir ni clasificar**.
  - La causa del retraso de la CI de `c2ac44a` está **sin confirmar**.

### F12-EST-08 (#181): referencia separada en la propuesta conjunta

- **Versión integrada:** `075a511` (#198). El árbol es idéntico al HEAD del PR, `6a5cab4`.
  - Recorrido y suite completa sobre `1f55988`.
  - Comprobación de las filas ocultas sobre `0c33c2a`.
- **Evidencia:** `ev/F12_EST_08_REFERENCIA_PROPUESTA_2026-11-03.md` y `ev/f12_est_08/`.
- **Entorno:**
  - HOST;
  - NAVEGADOR Edge 156.0.4314.58 con puppeteer-core 25.16.0, sin el service worker de la PWA.
  - Sin DEVICE ni EMULADOR: Mobile no muestra propuestas.
- **Resultados:**
  - suite PostgreSQL 7/7;
  - Backend 794 superadas, 13 omitidas y 0 fallidas;
  - Web 170;
  - recorrido 29/29, 1/1 y 2/2;
  - CI de `main` `075a511` en success; SonarCloud de `main` **neutral** («Quality Gate not computed»), que no cuenta como aprobado.
- **Criterios:** los cuatro, «Cumple»:
  - totales y huella;
  - columna separada;
  - tablas privadas idénticas;
  - propuesta sellada sin recálculo.
- **Decisión del autor (2026-11-03):** la referencia se muestra también en las filas con la necesidad oculta. Es una diferencia deliberada respecto a W3.
- **Límites:**
  - tiempos de 5 s agotados esporádicos en las suites PostgreSQL locales, sin causa confirmada;
  - el CSV evalúa la vigencia al exportar.

### F12-EST-09 (#182): evaluación sintética reproducible

- **Versión integrada:** `6117c77` (#193). La definición se fijó antes de medir, en `32cef61`.
- **Evidencia:** `ev/F12_EST_09_EVALUACION_2026-11-02.md`, `ev/f12_est_09/` y `docs/evaluation/F12_EST_09_PROTOCOLO_EVALUACION.md`.
- **Entorno:** HOST; evaluación pura, sin base ni red. «Origen móvil» es el método estadístico: **no se ejecuta nada en un teléfono**.
- **Resultados:**
  - 6/6 y 28/28; 7 alteraciones;
  - SHA-256 de los resultados idénticos en dos procesos.

| Conjunto | MAE SES | MAE naive | WAPE SES | WAPE naive | Menor MAE |
|---|---|---|---|---|---|
| S1 Nivel estable (mL) | 6843.427737 | 8398.857143 | 6,8644 % | 8,4245 % | SES |
| S2 Cambio de nivel (mL) | 16498.142857 | 9521.000000 | 13,5205 % | 7,8026 % | **naive** |
| S3 Tendencia (g) | 6587.866000 | 6437.714286 | 7,9809 % | 7,7990 % | **naive** |
| S4 Paseo aleatorio (mL) | 12708.142857 | 10458.857143 | 19,0747 % | 15,6985 % | **naive** |
| S5 Hueco, dato oculto y cero (mL) | 22354.421875 | 35208.500000 | 46,5165 % | 73,2640 % | SES |
| S6 Insuficiente (g) | sin orígenes evaluables | — | — | — | — |

- **El naive supera al SES en S2, S3 y S4.** Son resultados válidos: no se cambió ninguna semilla, no se descartó ningún conjunto y no hay umbral de mejora.
- **No se acredita:**
  - precisión con campañas reales;
  - ahorro o beneficio;
  - superioridad general del SES;
  - significación estadística (7 orígenes por conjunto, 4 en S5).

## 3. Lo que queda fuera o pendiente

| Asunto | Estado |
|---|---|
| Datos reales | No admitidos. La política `F07-POL-01` está en modo `PROVISIONAL_SYNTHETIC`, no aprobada (#107, abierto). La proyección de la estimación al Agricultor (EST-D-05) aún no la contempla una política institucional |
| Retención de ejecuciones y copias | Pendiente en GOV-02 (#185, abierto) |
| Primer `ESTIMATED` con datos reales | Exige tres campañas consecutivas selladas con cobertura, después de la migración |
| EMULADOR para la estimación | No ejecutado en ningún entregable |
| DEVICE de la Web y de la referencia en la propuesta | No aplica: navegador de escritorio en HOST |
| Cierre de sesión y cambio de identidad en el teléfono | Solo en HOST |
| Hallazgos sin causa confirmada | Tiempos de 5 s agotados en suites PostgreSQL (EST-02, EST-08); `f10_x01_pago_datos_test` (Mobile); retraso de la CI de Mobile `c2ac44a` |

## 4. Inconsistencias encontradas al reunir la evidencia

- **«GOV-02 (#107)».** El contrato (§2 y §3), `F12_EST_DECISIONES_2026-11-02.md` y `F12_EST_05_RUNS_2026-11-02.md` lo escriben así. En GitHub, #107 es `F07-POL-01` y GOV-02 es #185. No se corrigen los registros históricos; este índice usa los números de GitHub.
- **Filas de estado del contrato.** Tres filas decían «no en `main`» para las temporadas y la referencia en la propuesta, ya integradas (#191 y #198). Se actualizan en este mismo PR (revisión decimosexta).
- **Cabecera de la evidencia de F12-EST-08.** Su «HEAD probado» es `1f55988`; la comprobación de §7 corrió sobre `0c33c2a`. Ambos constan en el texto.
