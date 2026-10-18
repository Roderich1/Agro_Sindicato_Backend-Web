# F10 — Compatibilidad Web, serie 2: B1 y B2 (RNF-08) sobre `6c54c00`

Evaluación técnica de la sesión B de Claude Code, del 2026-10-18 (UTC), según el protocolo `docs/evaluation/F10_PROTOCOLOS_EVALUACION.md` **v1.3** (`9bfcad22731e7352f494e85e79aa56da25a28dbe`, §2: configuraciones B1 y B2, flujos W1–W5) y el suplemento de base `docs/evaluation/F10_SUPLEMENTO_BASE_2026-10-18.md` (PR BE #139; HEAD revisado por B y C: `93c90c1`). Es la **serie 2**: repite la matriz completa porque BE #126, #127 y #128 tocaron los cinco flujos. La serie 1 (`F10_COMPATIBILIDAD_WEB.md`, `ed069a6`, 2026-10-17) se conserva tal cual. Procedencia **HOST** (navegadores de escritorio en el PC de desarrollo), no `DEVICE`. Sin inspección personal de Roderich ni revisión del tutor.

## 1. Matriz

| Configuración | Navegador (versión exacta) | Resolución | W1 | W2 | W3 | W4 | W5 | Configuración |
|---|---|---|---|---|---|---|---|---|
| B1 | Chrome 155.0.8059.82 | 1366×768 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |
| B1 | Chrome 155.0.8059.82 | 1920×1080 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |
| B2 | Edge 155.0.4283.45 | 1366×768 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |
| B2 | Edge 155.0.4283.45 | 1920×1080 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |

- **Comprobaciones:** 31 por configuración, todas cumplen (W1 5, W2 11, W3 3, W4 9, W5 3); el detalle está en cada `compat.json`. La serie 1 tenía 30: W2 añade una comprobación de cobertura (§2).
- **Navegadores:** sólo los instalados; no se añadieron otros (B3 y B4 quedan fuera del protocolo).
- **Equipos de la Directiva:** esta selección no afirma que sean los suyos; ese inventario sigue sin comprobarse.
- **Resultado por configuración** (§2.5: compatible sólo si pasan todos sus flujos aplicables): las cuatro configuraciones son compatibles sobre `6c54c00`.
- **RNF-08** se informa configuración por configuración y **no se declara cumplido globalmente** desde este documento: la matriz Mobile de la serie 2 (A4/A4-F en el HONOR) la ejecuta A, y A1-F sigue NO CUMPLE en M8 sobre `dff6802` sin repetición; A3 y A5 siguen NO EJECUTADAS (suplemento §2).

## 2. Flujos y lo que comprueba cada uno

| Flujo | CUMPLE si (protocolo §2.3) | Comprobaciones automatizadas sobre `6c54c00` |
|---|---|---|
| W1 Acceso por rol | Directiva y Administrador ven el menú F07; un agricultor es redirigido y la API responde 403 | <ul><li>La Directiva aterriza en `/colectivo/resumen` con el menú exacto («Resumen colectivo · Necesidades y propuesta · Cobertura · Reconciliación · Campanas»).</li><li>El Administrador ve ese menú más «Usuarios».</li><li>El agricultor, al entrar, llega al aviso `/sin-acceso-web` («Esta Web es para la Directiva y el Administrador», BE #127) y no a `/colectivo`.</li><li>`GET …/summary` con su sesión responde **403** (registrado como `HTTP 403` en el detalle).</li></ul> |
| W2 Resumen por campaña | Cifras iguales al oráculo; cobertura «N de M»; la ausencia no se muestra como 0; supresión con k = 3 | <ul><li>Cada fila del oráculo D4 de C1 en la etapa RAW (`F06_EXPECTED_CELLS.csv`, 9 filas): DISCLOSED con la cifra y los aportantes exactos (`25 KG \| 3`, `8,25 L \| 3`); suprimidas sin cifra ni conteo («Menos de 3 agricultores aportaron…»); ABSENT sin fila.</li><li>**Cobertura con la regla de BE #126:** el texto «**3 de 4 agricultores vinculados con cifras publicadas**» coincide con `coverage.members_with_contribution` / `coverage.linked_members` de la API, y con `suppressed_cells = true` aparece «Ausencia de aporte = desconocido, no cero». (En la serie 1 la regla anterior contaba a todo aportante; en D4 los tres aportantes de las celdas publicadas son los mismos F1–F3 y F4 no aporta, por eso N y M coinciden con la serie 1.)</li></ul> |
| W3 Propuesta y CSV | Borrador en el historial; CSV descargado con cantidades exactas | <ul><li>Borrador en el historial con una huella de 64 hex.</li><li>El CSV se descarga con «Exportar CSV» (9 líneas).</li><li>Línea de Urea `…,Urea F06,G,KG,DISCLOSED,25000,25,3,…`, sin `NaN` ni `undefined` (el CSV de `6c54c00` añade columnas de cobertura y `basis`; la línea comprobada no cambia de forma).</li></ul> |
| W4 Reconciliación | Asociación con motivo; historial «anterior → nuevo» | <ul><li>Sin marcar la confirmación, el botón está deshabilitado.</li><li>Tras asociar Bellator → Belator con motivo, el historial muestra «Bellator → Belator» y el motivo.</li><li>El resumen posterior coincide con la etapa CANONICAL del oráculo (7 filas; Belator 11 L y 8 L).</li></ul> |
| W5 Sin conexión | Mensaje claro; nada se encola | <ul><li>Sin red (`setOfflineMode`), «Generar propuesta (borrador)» muestra «Sin conexión con el servidor. La Web no guarda operaciones para después: vuelva a intentarlo en línea.»</li><li>Al reconectar, el número de borradores por la API no cambia (1 → 1).</li><li>No hay ninguna cola en `localStorage`.</li></ul> |

## 3. Procedimiento y versiones

**Orquestador.** `PG_CONTAINER=agro_b_f10eval2_pg PG_PORT=55456 API_PORT=3132 WEB_PORT=4178 CODE_MEASURED=6c54c00… BASE_REF=6c54c00 PROTOCOL_LABEL="… v1.3 @ 9bfcad2…; suplemento …" bash tool/f10_eval_web/run-compat.sh docs/evidence/f10_compat/20261018T180731Z`, con las herramientas en **`c8def11`** (`compat.mjs` corregido en `f24b201`; ver §5). Por configuración:
- crea una base nueva en `agro_b_f10eval2_pg` y aplica las **11 migraciones**;
- arranca el Backend compilado (3132) y la Web de producción con `vite preview` (4178);
- siembra el dataset D4 por la API real (`Back/scripts/f07-synthetic-seed.cjs`, Sync v1; 27 intenciones);
- ejecuta `tool/f10_eval_web/compat.mjs` en headless (puppeteer-core 25.12.0);
- al terminar las cuatro, `sanitize.mjs` enmascara los UUID a 8 hex y retira los correos de `compat.json`, `logs/*/seed.json` y los CSV descargados (nombre y contenido).

**Horario (UTC):** de 18:07:32 a 18:17:45. Bases `d4_20261018_180734` (B1 1366×768, sembrada 18:11:09), `…181144` (B1 1920×1080, 18:13:19), `…181344` (B2 1366×768, 18:15:19) y `…181546` (B2 1920×1080, 18:17:20).

**Versiones:**
- **Código evaluado:** Backend y Web **`6c54c0072d2140db4be448d5f81d4e5ed498a260`** (`main`; código = `cab433d`). La rama de herramientas no cambia `Back/src`, `Web/src` ni `Back/prisma` (diff 0 líneas en `env.txt`).
- **Compilados:** los mismos `Back/dist` (501 archivos, huella `4c13d69a…`) y `Web/dist` (20 archivos, huella `cf54baa7…`) que R5 (procedencia en `F10_RENDIMIENTO_CENTRAL_WEB_S2.md` §2). No se recompiló entre V2 y V4.
- **Configuración:** igual que R5. `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` (desviación declarada de §0.4, suplemento §4), `COOKIE_SECURE=false`. El limitador sigue a 20/min (5/min en `/auth/login`).
- **PostgreSQL:** 16.13, `postgres:16-alpine` `sha256:4e6e670b…`, contenedor nuevo `agro_b_f10eval2_pg`.
- **Sistema:** Windows 11 Home 10.0.26200; Node v25.9.0; vite 8.0.10.

**Logs de la API.** `logs/<configuración>/api.log` **no se publica** (`*.log`; contiene la IP local). Su resumen sin identificadores está en `logs/<configuración>/api-errors-summary.txt`. En las cuatro configuraciones sólo hay respuestas esperadas:
- **3 × 401** de `/auth/refresh`: una por cada inicio de sesión por la interfaz (Directiva, Administrador, agricultor), al abrir `/login` sin cookie;
- **1 × 403**: el del agricultor en W1 (`GET …/summary`);
- **0 respuestas 429.**

**Coordinación (suplemento §5, ventana V4).** A cerró V3 a las 18:06:01Z y abrió V4 por mensaje; la matriz empezó a las 18:07:31Z. En paralelo, A ejecutaba la compatibilidad M4–M8 / M1–M8 en el HONOR por `adb` y compilaba la copia `.f10eval2f`: aceptable porque W1–W5 son funcionales, no de tiempos. Memoria libre: 5,3 GB al empezar y 11,1 GB al terminar; el `dart language-server` de VS Code (2,7 GB) seguía activo (condición del PC).

## 4. Evidencia

**Por configuración** (`docs/evidence/f10_compat/20261018T180731Z/<configuración>/`):
- `compat.json`, con cada comprobación y su detalle;
- 5 capturas de página completa: `W1-agricultor`, `W2-resumen`, `W3-propuesta`, `W4-reconciliacion` y `W5-sin-conexion`;
- el CSV descargado (`downloads/propuesta-<8 hex>.csv`).

**Las 20 capturas se revisaron una por una:** sólo hay datos sintéticos («Sindicato sintético», «Directiva sintética», productos F06); ningún control tapado ni texto cortado a 1366×768 ni a 1920×1080; el estado «OFFLINE» y el mensaje rojo de W5 son visibles; la página del agricultor muestra el aviso y el botón «Cerrar sesión».

| `compat.json` | SHA-256 |
|---|---|
| `B1-chrome-1366x768` | `187a56001760b7796b8bb9b8e62b64c73e849f90a9e02c19510afa854fa9328b` |
| `B1-chrome-1920x1080` | `3ba4a9bbb20d4342688424a332005abd79c4ae77f0398ccab11929e539d0a8de` |
| `B2-edge-1366x768` | `1b84ef556a3abce7768cf00f876f85b6e12d2b9287d480bc40b7b6ebaf6ff33b` |
| `B2-edge-1920x1080` | `33e2fbcfb2d98eb13bb2b46ed6a6d2a6bff39ead759cc76353d9f7258607a761` |

| CSV descargado | SHA-256 |
|---|---|
| `B1-chrome-1366x768/downloads/propuesta-5ce76340.csv` | `9c105c7bc24459e5270f3d2d9528dba039922a79af7d5b7cd9119b1cd1bde76f` |
| `B1-chrome-1920x1080/downloads/propuesta-35a24cd5.csv` | `23ba399943ba797a94a6dba2a3a826012df6e4a971714b7214b857bc4b3f4993` |
| `B2-edge-1366x768/downloads/propuesta-9301db5f.csv` | `1a1915c361d38e435f729cf86c94d722e0a5cdbd0f6709551f19d4009bed5600` |
| `B2-edge-1920x1080/downloads/propuesta-de36ae02.csv` | `d53ebe28fbd080e950e99c71bc5e4d389cdb0cabd26d2542e90810484f51d417` |

Las huellas se calculan sobre el contenido con finales de línea LF (el que guarda git). Ningún archivo publicado contiene UUID completos, correos, tokens ni `DATABASE_URL` (comprobado con una búsqueda sobre `.json`, `.csv` y `.txt`).

## 5. Corridas que no forman parte de la matriz

| Hora (UTC) | Qué | Resultado |
|---|---|---|
| 2026-10-18 15:34:08–15:36:05 | **Ensayo de herramienta**, una configuración (B1 Chrome 1366×768), dentro de la ventana V2 y con las herramientas en `80ba254`; resultados en el scratchpad, sin usar | W2–W5 CUMPLE (31 comprobaciones; la cobertura nueva ya coincidía con la API). **W1 NO CUMPLE por un fallo de la herramienta:** la comprobación de cobertura añadida iniciaba una sesión más por la API, el sexto `POST /auth/login` del mismo minuto recibió **429** (`@Throttle` 5/min en `auth.controller.ts:65`) y la comprobación «agricultor 403» se hizo sin token (la API respondió 401). No hubo fallo del producto: el 403 se comprobó después en las cuatro configuraciones de la matriz. Corrección en `f24b201`: W2 y W5 comparten el token de la Directiva (vuelven a ser cinco inicios de sesión, como en la serie 1), `apiLogin` falla si el login no es 200/201 y el detalle registra el código HTTP |

## 6. Limitaciones y observaciones

- **Headless.** El motor es el mismo que con ventana, pero no se prueba la integración con el escritorio (ventanas, ampliación del sistema, extensiones).
- **Artefacto de captura:** en las capturas de página completa a 1366×768, el fondo oscuro de la barra lateral termina a la altura de la ventana (768 px). Es un efecto de capturar más allá de la ventana; en el uso real la barra es fija. No es un fallo de ningún flujo.
- **Datos sintéticos D4, modo provisional.** Las cifras no se presentan como reales ni como divulgación aprobada; F07-POL-01 (#107) sigue Pending.
- **Cobertura:** la regla «N de M con cifras publicadas» (BE #126) se comprueba contra la API y contra el seed; una regla alternativa no se evalúa aquí.
- **Mobile:** la Web no es cliente del agricultor desde BE #127; W1 sólo comprueba que el agricultor no llega a `/colectivo` y que la API responde 403.
- GATE-F10 (BE #49) sigue **Pending**; lo decide Roderich. Este documento no cierra ningún gate.
