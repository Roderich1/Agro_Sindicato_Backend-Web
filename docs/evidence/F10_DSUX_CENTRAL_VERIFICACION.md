# F10 usabilidad — verificación previa del dataset DS-UX Central/Web contra su oráculo

- **Fecha real:** 2026-10-19 (UTC), de 03:22:54Z a 03:25:35Z. En America/La_Paz, el 2026-10-18 de 23:22 a 23:25. Día de sesión parametrizado: 2026-10-19 (La Paz).
- **Ejecutó:** la sesión B de Claude Code, por el encargo de Roderich Rendón del 2026-10-18 («generador Central/Web DS-UX con oráculos, antes del piloto»). Ejecución técnica automatizada con datos sintéticos. **No es una sesión de usabilidad**: no hay participantes ni resultados de RNF-07 (protocolo §3.2). Sin revisión personal de Roderich ni del tutor.
- **Protocolo:** F10 v1.4 §3.3.1 (PR BE #144, precisión DS-UX) y `docs/evaluation/usabilidad/09_fixture_y_valores_esperados.md` §3–§4. Composición Web fijada por Roderich Rendón el 2026-10-18.
- **Issues:** BE #47 (UX-02), MOB #37 (UX-01), GATE-F10 (BE #49) **Pending**.

## 1. Versiones y entorno

| Elemento | Valor |
|---|---|
| Código medido | Backend/Web `main` `df0df1d` (código `cab433d`; diff en `Back/src`, `Back/prisma` y `Web/src` = 0 líneas), compilado en el worktree con `npm ci`, `prisma generate`, `nest build` (sin `tsbuildinfo`), `build:seed` y `vite build` |
| Herramienta | rama `feat/f10-dsux-central-seed`, commit **`4d4823c`**: generador `Back/scripts/f10-dsux-central-seed.cjs` (blob `bb01c6c1f741e0b693e59436694ce00b0c757752`), oráculo `tool/f10_eval_web/dsux/oraculo_web.json` (blob `bd4720a3d485f9172880aaa5468a9bba5f8d78d6`), `oraculo_check.py`, `contraste.mjs`, `run-dsux.sh`. `env.txt` registra «tool_dirty=1»: era `tool/f10_eval_web/dsux/__pycache__/`, creado por una comprobación de sintaxis con `py_compile` antes de la corrida; los cinco archivos de la herramienta coincidían con sus blobs del commit (comprobado con `git hash-object` sobre el contenido LF) y el directorio se borró después |
| Base | contenedor nuevo **`agro_b_f10ux_pg`** (volumen `agro_b_f10ux_pgdata`, 127.0.0.1:55459), `postgres:16-alpine@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50`, PostgreSQL 16.13; base nueva `dsux_20261019_032255`, 11 migraciones. No se tocó ningún entorno anterior |
| API | `node dist/main.js`, puerto 3138, **`NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`** (desviación declarada del protocolo §0.4, porque F07-POL-01, #107, no está aprobada), `COOKIE_SECURE=false`, limitador intacto. Secretos generados en memoria; ninguno se escribió |
| Web | `vite preview`, puerto 4179 |
| Navegador | Chrome 155.0.8059.82 headless, 1366×768, `puppeteer-core` 25.12.0, Node v25.9.0, Windows 11 Home |

## 2. Qué se sembró (por la API real)

| Tenant | Etiqueta | Contenido |
|---|---|---|
| Web de verificación | VER1, VER2 | «Verano Demo» ABIERTA; «Glifosato Demo», «Bellator», «Belator» en L; AGRICULTOR M1–M6 y ningún otro; Directiva y Administrador. 10 publicaciones `DECLARED_NEED` por `POST /api/v1/sync/v1/push` (todas `APPLIED`): Glifosato M1 20, M2 35, M3 45, M4 50 L; Bellator M1 3, M2 4, M3 5 L; Belator M1 1, M2 2, M3 3 L. Huella del dataset sembrado `1d11151ad0053610e12ecbbf39ddefa5104bbeed7ec70d9982935515479591e5`, **igual en los dos tenants** |
| Móvil de verificación | MOVVER | «Verano Demo» ABIERTA y activa desde 2026-09-19 (sesión − 30), sin fin; «Glifosato Demo» y «Bellator» en L; cuentas X01 y P01–P05. Referencias leídas con una cuenta propia del mismo tenant, después revocada y desactivada; el generador comprobó antes de escribir el JSON que la campaña cumple [sesión − 14, sesión + 30] y que la campaña y los dos productos son exactamente los de ese tenant (`same_tenant_as_accounts: true`). Huella `8a622e0bc9eb467d62fce37269184cce79f07eae4ca8b8c7c43f3840df85ee1a` |

**Repetir una etiqueta se niega sin escribir:** la segunda siembra de VER1 terminó con «Refused: tenant f10ux-web-ver1 already exists (seed a new F10_UX_LABEL; nothing is deleted)», con 23 usuarios antes y después.

## 3. Resultado

**Oráculo** (`oraculo_check.py`, biblioteca estándar): «ORÁCULO COINCIDE (y el manifiesto siembra exactamente su tabla)» para VER1 y VER2.

**Contraste** (`contraste.mjs`): VER1 ensaya W3 con el canónico **Bellator** (fila Belator → Bellator) y VER2 con el canónico **Belator** (fila Bellator → Belator). Las dos asociaciones cumplen la tarjeta W3.

| Etapa | Qué se comprueba | VER1 | VER2 |
|---|---|---|---|
| Antes de W3 | API como Directiva y como Administrador: sólo celdas `DECLARED_NEED` en ML; Glifosato Demo 150 000 ML = **150 L** con 4 aportantes; Bellator 12 L con 3; Belator 6 L con 3; cobertura **4 de 6**; política provisional k = 3 sin aprobar; sin asociación vigente ni historial; sin borradores. Web: las tres filas con «150 L / 4», «12 L / 3», «6 L / 3» y la línea «4 de 6 agricultores vinculados con cifras publicadas» | CUMPLE (20) | CUMPLE (20) |
| W3 por la interfaz | El canónico elegido figura en la lista; tras confirmar con motivo, el historial muestra «denominación → canónico» con el motivo | CUMPLE (2) | CUMPLE (2) |
| Tras W3 | API (Directiva y Administrador): una asociación vigente; el canónico **18 L con 3 aportantes**; Glifosato Demo 150 L con 4; cobertura **4 de 6**; la denominación asociada sin cifra propia. Web: las mismas cifras y la misma cobertura | CUMPLE (19) | CUMPLE (19) |
| Tras W4 por la interfaz | Un borrador en el historial; CSV descargado; Glifosato Demo 150 000 ML (150 L) con 4 y el canónico 18 000 ML (18 L) con 3; la denominación asociada sin cifra; sin `NaN` ni `undefined`; la API devuelve un borrador | CUMPLE (7) | CUMPLE (7) |
| **Total** | | **48 de 48** | **48 de 48** |

**API:** 0 respuestas 429 y sólo dos 401 en `POST /api/v1/auth/refresh` (la Web intenta renovar sin cookie al cargar, como en la serie 2 de compatibilidad); ningún 403 ni 5xx (`api-errors-summary.txt`).

## 4. Lo observado tras W3 (para la hoja de valores esperados)

Medido, no supuesto, en los dos sentidos:

- La cobertura sigue siendo **«4 de 6»**, como fija la v1.4.
- La fila de la **denominación asociada** no desaparece: queda **«Oculto (revisión)»** con el texto «La cifra anterior se retiró por una baja, una disputa o una reagrupación, y aún no hay cambios suficientes para publicar otra.», y en la API `status: SUPPRESSED_REVISION` sin total. Es la retirada por reagrupación del código (`collective-summary.use-case.ts`, «cells whose contributions all left… withdrawn»).
- Por eso `suppressed_cells` pasa de `false` a **`true`**, y la línea de cobertura de la Web añade «Hay filas sin cifra (bajo el umbral o en revisión): sus aportes no se cuentan aquí.». Antes de W3, la línea ya decía «Ausencia de aporte = desconocido, no cero.».
- El CSV del borrador conserva esa fila sin cifra (`SUPPRESSED_REVISION`, columnas de cantidad vacías).

Nada de esto cambia el valor esperado de W1, W2 ni W3; se anota para que el facilitador no lo tome por un error de la fixture.

## 5. Archivos

Carpeta `docs/evidence/f10_dsux/20261019T032254Z/`, saneada con `tool/f10_eval_web/sanitize.mjs` (UUID a 8 hex y sin correos en `.json`, `.csv` y nombres de archivo; «saneado: 8 archivos»). Las cifras no cambian con el saneado; la huella `references.sha256` del manifiesto se calculó sobre el JSON literal antes de sanear.

| Archivo | SHA-256 (contenido LF) |
|---|---|
| `env.txt` | `aeaadac9c48f541174ebe03dd3eb57742e76d410833f9c22f53100aef1512205` |
| `api-errors-summary.txt` | `8850fc58d748eea9d97122c5ac9049c869b6a633498317f72f2784d117ea6165` |
| `oraculo-VER1.txt`, `oraculo-VER2.txt` | `1557ffad26d738946555ec5ec7521b7d299c8f65cf168d8a471e433d0a24b017` (iguales) |
| `manifest-VER1.json` | `491e9c28808d795c5aeacb082d6c1d253f53de3d235727f60a5b36835e441691` |
| `manifest-VER2.json` | `27969a95a7e0a0807d901f70180c079ab1d57537a70553bb76b760fab6cc8f7c` |
| `manifest-MOVVER.json` | `86c39a6fe80ad4330dd095a64c3cfaf20b7085f27f77bafac3e58a882128c562` |
| `references-MOVVER.json` | `77b9f5baa4f8eb9f9d9857a6ab2fc34fbcfb668f1c8212d34a48b8f69e5ffc5e` |
| `VER1-Bellator-1366x768/contraste.json` | `f9079793e9d6813994e519c3e4b5cdecae10b08e999e83337c5cacdc1a5acc2a` |
| `VER2-Belator-1366x768/contraste.json` | `9d07ed43b7cda2904432fdd3fb145d29b3390d7b48c387fcf5783cee1ef1cd25` |
| `VER1-Bellator-1366x768/propuesta-1cd0ab36.csv` | `15015667803ecd22576376c1626178c5e32773a918cc9803b63a6250c13dad7a` |
| `VER2-Belator-1366x768/propuesta-b45fe308.csv` | `2bf02bea4e6f097bc17935b4b1a2d9c1e564402137629e3c78b145a2a0a8290c` |

Capturas (datos sintéticos de pantalla; SHA-256 del archivo):

| Captura | VER1 (canónico Bellator) | VER2 (canónico Belator) |
|---|---|---|
| `1-resumen-antes-W3.png` | `5af7c7c624d8e5df756305731ea0156c3d2df528fffe8c07651e17b257e6da63` | `7a8896eb4767b0cddfc65114e71662499f1c0becb5de0b89ee13738bc26e71c6` |
| `2-reconciliacion-W3.png` | `049725e1d31fd7f2eddb65b860833e09f89a62353a317b40b2dc42e3630b3fca` | `31fbac88e9ede8e9550c318f2418e74b85b4b50db3169f3fe222bf8d14e9f103` |
| `3-resumen-tras-W3.png` | `2b739638310e0ee9d9835507a9ba56bffaa57744b4a293350363f55579632a1a` | `2067e156d6595f757919cd2c036cddd6ba42dfe242d9cd1263a09ccb98a6f8d6` |
| `4-propuesta-W4.png` | `43e780d68ed868fa74344d30de51a2235a4100106f62c58b5f244639bdd8b03d` | `3cac9ab8cfc1483ea98bfc7d459a9bbecda7ca3934ba1df4d642a79d836edc79` |

**Reproducción:** `tool/f10_eval_web/dsux/run-dsux.sh <salida>` con el contenedor `agro_b_f10ux_pg` arriba y Back y Web compilados (procedimiento en `tool/f10_eval_web/dsux/README.md`).

## 6. Límites

- **Tenants de verificación consumidos:** VER1 y VER2 ya tienen asociación y borrador; MOVVER tiene una cuenta lectora desactivada. Los tenants de las sesiones se siembran aparte, el día de cada sesión y con la etiqueta del participante (D01, D02, X01; el Móvil con la suya), y sus valores esperados se anotan antes de la primera sesión en esa base (09 §4).
- **Restablecer = tenant nuevo**, no borrar: las asociaciones y las divulgaciones no admiten `DELETE` y no se desactiva ninguna protección.
- Una sola resolución (1366×768) y un navegador (Chrome); la matriz B1/B2 de compatibilidad Web es otra evidencia (`F10_COMPATIBILIDAD_WEB_S2.md`).
- **Divulgación provisional y sintética** (k = 3 no da anonimato; F07-POL-01, #107, sigue abierta). Ninguna cifra es real.
- La fecha de sesión de esta verificación (2026-10-19) es un parámetro; no fija la fecha de ninguna sesión real.
