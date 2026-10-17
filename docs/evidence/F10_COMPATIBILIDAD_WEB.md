# F10 — Compatibilidad Web: B1 y B2 (RNF-08)

Evaluación técnica de la sesión B, del 2026-10-17 (UTC), según el protocolo aprobado en `7581af23b417340b7f00fc7e4822dff3ee9a9aab` (v1.1, §2: configuraciones B1 y B2, flujos W1–W5). Es procedencia **HOST** (navegadores de escritorio en el PC de desarrollo), no `DEVICE`.

## 1. Matriz

| Configuración | Navegador (versión exacta) | Resolución | W1 | W2 | W3 | W4 | W5 | Configuración |
|---|---|---|---|---|---|---|---|---|
| B1 | Chrome 155.0.8059.82 | 1366×768 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |
| B1 | Chrome 155.0.8059.82 | 1920×1080 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |
| B2 | Edge 155.0.4283.45 | 1366×768 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |
| B2 | Edge 155.0.4283.45 | 1920×1080 | CUMPLE | CUMPLE | CUMPLE | CUMPLE | CUMPLE | **compatible** |

- **Comprobaciones:** 30 por configuración, todas cumplen (W1 5, W2 10, W3 3, W4 9, W5 3); el detalle está en `compat.json`.
- **Navegadores:** sólo los instalados; no se añadieron otros (B3 y B4 quedan fuera del protocolo).
- **Equipos de la Directiva:** esta selección no afirma que sean los suyos; ese inventario sigue sin comprobarse.
- **Resultado por configuración** (§2.5: compatible sólo si pasan todos sus flujos aplicables):
  - B1 Chrome 155.0.8059.82 a 1366×768: compatible;
  - B1 Chrome 155.0.8059.82 a 1920×1080: compatible;
  - B2 Edge 155.0.4283.45 a 1366×768: compatible;
  - B2 Edge 155.0.4283.45 a 1920×1080: compatible.
- **RNF-08** se informa así, configuración por configuración, y no se declara cumplido globalmente desde este documento. La matriz Mobile (A1, A1-F, A2, A3) la ejecuta A, y una configuración no ejecutada o fallida no es compatible.

## 2. Flujos y lo que comprueba cada uno

| Flujo | CUMPLE si (protocolo §2.3) | Comprobaciones automatizadas |
|---|---|---|
| W1 Acceso por rol | Directiva y Administrador ven el menú F07; un agricultor es redirigido y la API responde 403 | <ul><li>La Directiva aterriza en `/colectivo/resumen` con el menú exacto.</li><li>El Administrador ve ese menú más «Usuarios».</li><li>El agricultor, en `/colectivo/resumen`, es redirigido fuera.</li><li>`GET …/summary` con su sesión responde 403.</li></ul> |
| W2 Resumen por campaña | Cifras iguales al oráculo; cobertura «N de M»; la ausencia no se muestra como 0; supresión con k = 3 | <ul><li>Cada fila del oráculo D4 de C1 en la etapa RAW (`F06_EXPECTED_CELLS.csv`):<ul><li>DISCLOSED, con la cifra y los aportantes exactos (`25 KG \| 3`, `8,25 L \| 3`);</li><li>suprimidas, sin cifra ni conteo («Menos de 3…»);</li><li>ABSENT, sin fila.</li></ul></li><li>Cobertura «3 de 4» y «desconocido, no cero».</li></ul> |
| W3 Propuesta y CSV | Borrador en el historial; CSV descargado con cantidades exactas | <ul><li>Borrador en el historial, con una huella de 64 hex.</li><li>El CSV se descarga con «Exportar CSV».</li><li>Línea de Urea `DISCLOSED,25000,25,3`, sin `NaN`.</li></ul> |
| W4 Reconciliación | Asociación con motivo; historial «anterior → nuevo» | <ul><li>Sin marcar la confirmación, el botón está deshabilitado.</li><li>Tras asociar Bellator → Belator con motivo, el historial muestra «Bellator → Belator» y el motivo.</li><li>El resumen posterior coincide con la etapa CANONICAL del oráculo (Belator 11 L y 8 L).</li></ul> |
| W5 Sin conexión | Mensaje claro; nada se encola | <ul><li>Sin red (`setOfflineMode`), «Generar propuesta» muestra «Sin conexión con el servidor. La Web no guarda operaciones para después…».</li><li>Al reconectar, el número de borradores por la API no cambia.</li><li>No hay ninguna cola en `localStorage`.</li></ul> |

## 3. Procedimiento y versiones

**Orquestador.** `bash tool/f10_eval_web/run-compat.sh docs/evidence/f10_compat/20261017T0102Z`, con las herramientas en `0b332da`. Por configuración:
- crea una base nueva en `agro_b_f10eval_pg` (127.0.0.1:55450) y la migra;
- arranca el Backend compilado (3122) y la Web de producción con `vite preview` (4176);
- siembra el dataset D4 por la API real (`Back/scripts/f07-synthetic-seed.cjs`, Sync v1);
- ejecuta `tool/f10_eval_web/compat.mjs` en headless (puppeteer-core 25.12.0).

**Horario:** de 01:02:49Z a 01:10:45Z (bases `d4_20261017_010250`, `…010446`, `…010646` y `…010847`).

**Versiones:**
- **Código evaluado:** Backend y Web `ed069a695eb9f8bdc318bfd16efc0071fcdced25`. La rama de evaluación no cambia `Back/src`, `Web/src` ni `Back/prisma`.
- **Compilados:** los mismos `Back/dist` y `Web/dist` que R5 (procedencia y huellas del árbol en `F10_RENDIMIENTO_CENTRAL_WEB.md` §2).
- **Configuración:** igual que R5. `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`, porque F07-POL-01 no está aprobada; es la desviación declarada en el protocolo v1.1 §0.4. `COOKIE_SECURE=false`. El limitador sigue a 20/min.
- **Sistema:** Windows 11 Home 10.0.26200.

**Logs de la API.** `logs/<configuración>/api.log` **no se publica** (`*.log`; contiene la IP local). Su resumen sin identificadores está en `logs/<configuración>/api-errors-summary.txt`. Sólo hay respuestas esperadas:
- 401 de `/auth/refresh` al abrir el login sin cookie;
- un 403 por configuración: el del agricultor en W1;
- 0 respuestas 429.

**Coordinación:** A compilaba la APK en paralelo. Era aceptable porque B1/B2 son funcionales, no de tiempos.

**Ensayo de herramienta, fuera de la matriz:** a las 01:00:40Z, una configuración (Chrome 1366×768, base `d4_20261017_010040`), con el mismo resultado; no se cuenta.

## 4. Evidencia

**Por configuración** (`docs/evidence/f10_compat/20261017T0102Z/<configuración>/`):
- `compat.json`, con cada comprobación y su detalle;
- 5 capturas: `W1-agricultor`, `W2-resumen`, `W3-propuesta`, `W4-reconciliacion` y `W5-sin-conexion`;
- el CSV descargado (`downloads/propuesta-<8 hex>.csv`).

**Saneado (§0.9, corrección del 2026-10-17):** los UUID completos de `compat.json`, `logs/*/seed.json` y los CSV descargados (nombre y contenido) se enmascararon a sus 8 primeros hex, por eso las huellas de `compat.json` son nuevas. Los resultados no cambian.

Las capturas se revisaron: sólo hay datos sintéticos.

| `compat.json` | SHA-256 |
|---|---|
| `B1-chrome-1366x768` | `6c42c7777306f081e0dd625d213961bf665b4eb18456843ec90c84ccf2a3cfe0` |
| `B1-chrome-1920x1080` | `c2fbc65b8138a5c63f2573e5c30461ff30b7ccca9c479c788a6e5a3d27c3381f` |
| `B2-edge-1366x768` | `25d3be248d0765a2033ec88a82c70a9687d65139e8fb92a5dee4f4c55b18c95f` |
| `B2-edge-1920x1080` | `c07cf81cb2467eb2eaf3c54d391a1db395066ed1693baa6eb6820971f61966ac` |

## 5. Limitaciones y observaciones

- **Headless.** Los navegadores se ejecutaron sin interfaz. El motor es el mismo que en el modo con ventana, pero el modo headless no prueba la integración con el escritorio (ventanas, ampliación del sistema, extensiones).
- **Presentación:** la revisión de las capturas no muestra controles tapados ni textos cortados a 1366×768.
  - **Artefacto de captura:** en las capturas de página completa, el fondo oscuro de la barra lateral termina a la altura de la ventana (768 o 1080 px). Es un efecto de capturar más allá de la ventana; en el uso real, la barra lateral es fija. No es un fallo de ningún flujo.
- **Mensaje heredado del agricultor.** La captura de W1 muestra el panel heredado del agricultor («Trabaja sin conexión y sincroniza cuando vuelva la red»). Es la Web operativa heredada, cuya retirada sigue #23/#81, fuera de W1–W5. No es una función de la Directiva.
- **Datos sintéticos D4, modo provisional.** Las cifras no se presentan como reales ni como divulgación aprobada.
- **Fugas de #45 en `ed069a6`.** Las dos fugas encontradas en la revisión del resumen colectivo (reasociación sin historial y cobertura con celdas suprimidas) siguen presentes en el código evaluado. W2 y W4 comprueban la coincidencia con el oráculo, no esas fugas.
  - El arreglo cambia la cobertura y su texto, «N de M con cifras publicadas».
  - Si A fija una base nueva, W2 y W4 deben repetirse sobre ella y etiquetarse aparte.
