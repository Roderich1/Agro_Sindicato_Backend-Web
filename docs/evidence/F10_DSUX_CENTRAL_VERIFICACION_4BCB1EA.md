# F10 usabilidad — verificación DS-UX Central/Web sobre la base nueva del piloto (`4bcb1ea`)

- **Fecha real:** 2026-10-25 (UTC), de 01:17:19Z a 01:21:01Z. En America/La_Paz, el 2026-10-24 de 21:17 a 21:21.
- **Ejecutó:** la sesión B de Claude Code, por encargo de la sesión A.
  - **Encargo:** Roderich Rendón aprobó el 2026-10-24 cambiar la base del piloto a Mobile `1d77c14` / Backend `4bcb1ea` y pidió comprobar DS-UX, Central/Web y las exportaciones nuevas.
  - Ejecución técnica automatizada con datos sintéticos. **No es una sesión de usabilidad**: no hay participantes ni resultados de RNF-07.
  - Sin revisión personal de Roderich ni del tutor.
- **Qué no cambia:** la verificación anterior, [`F10_DSUX_CENTRAL_VERIFICACION.md`](F10_DSUX_CENTRAL_VERIFICACION.md) (2026-10-19, `df0df1d`), se conserva tal cual, con sus mediciones y sus huellas. Las huellas de este archivo **no se comparan** con aquéllas.
- **Issues:** BE #47 (UX-02), MOB #37 (UX-01). GATE-F10 (BE #49) sigue **Pending**.

## 0. Suplemento de base

| Pieza | Antes (2026-10-19) | Ahora |
|---|---|---|
| Backend/Web | `df0df1d` (código `cab433d`) | **`4bcb1ea`** |
| Mobile | `463d3ec` | **`1d77c14`**, esquema SQLite 11 |
| Migraciones de Central | 11 | **13**: añade `20261019150000_f08_bkp06_retention` y `20261023100000_f07_collective_seal` |

**Cambios de código entre las dos bases:** `git diff --stat cab433d 4bcb1ea -- Back/src Web/src Back/prisma` da «85 files changed, 10089 insertions(+), 331 deletions(-)». Para el piloto Web, lo que cambia es:
- el sellado y las tendencias de F07, con el sellado **desactivado** por defecto;
- las columnas `seal_ref`, `seal_version` y `sealed_at` en los CSV del resumen y del borrador;
- la lectura de un borrador ya no escribe (`F07_SEALED_HISTORY_CONTRACT.md` §10, observación 3);
- el respaldo F08 en el servidor.

**`main` avanzó después a `eff4f27`** (merge de BE #161, 2026-10-25 01:20:08Z), sólo con la herramienta de la comparación de k y su evidencia. `git diff --stat 4bcb1ea eff4f27 -- Back/src Back/prisma Web/src` da:

```
 .../f07-pol-01-k-comparison.postgres.spec.ts       | 469 +++++++++++++++++++++
 .../test-support/k-comparison/scenarios.ts         | 186 ++++++++
 2 files changed, 655 insertions(+)
```

Son una spec y su módulo de escenarios en `test-support/`, que ningún código de la aplicación importa. **El runtime del piloto no cambia**, y la base aprobada sigue siendo `4bcb1ea`.

## 1. Versiones y entorno

| Elemento | Valor |
|---|---|
| Código medido | Backend/Web `4bcb1ea`, en la rama `docs/f10-dsux-4bcb1ea`. Durante la corrida, el HEAD era `76a9782` = `4bcb1ea` + el instrumento nuevo de §3, sin cambios en `Back/`, `Web/` ni en los instrumentos anteriores |
| Compilación | En el worktree, del 2026-10-25 01:15:15Z al 01:16:42Z: `npm ci`, `prisma generate`, `nest build` (sin `tsbuildinfo`), `build:seed`, `npm ci` y `npm run build` (Web), y `npm ci` en `tool/f10_eval_web` |
| Instrumentos | **Los mismos blobs que el 2026-10-19** (`git rev-parse 4d4823c:<ruta>` = `HEAD:<ruta>`):<br>• generador `Back/scripts/f10-dsux-central-seed.cjs` `bb01c6c1…`<br>• oráculo `oraculo_web.json` `bd4720a3…`<br>• `oraculo_check.py` `a9cc4c47…`<br>• `contraste.mjs` `c6a151d8…`<br>• `run-dsux.sh` `a77e0661…`<br>• `sanitize.mjs` `38ea3554…`<br>Ninguno se modificó. `env.txt`: `tool_dirty=0` |
| Instrumento nuevo | `tool/f10_eval_web/dsux/exportaciones.mjs` (`62c6fb9f…`) y `run-exportaciones.sh` (`364aa45a…`), en `76a9782`. Aparte; no sustituye a ningún instrumento (§3) |
| Base | Contenedor nuevo **`agro_b_dsux4bcb_pg`** (volumen `agro_b_dsux4bcb_pgdata`, 127.0.0.1:55476), `postgres:16-alpine@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50`, la misma imagen que el 2026-10-19 |
| | Bases nuevas `dsux_20261025_011720` (§2) y `dsuxexp_20261025_012021` (§3), con 13 migraciones. No se tocó ningún entorno anterior ni de otra sesión |
| API | `node dist/main.js`, puerto 3156, `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` (desviación declarada del protocolo §0.4, porque F07-POL-01, #107, no está aprobada), `COOKIE_SECURE=false`, limitador intacto |
| | `COLLECTIVE_SEALING` sin definir, así que el sellado queda desactivado, como en cualquier instalación por defecto. Secretos generados en memoria; ninguno se escribió |
| Web | `vite preview`, puerto 4186 |
| Navegador | Chrome 156.0.8078.47 headless, 1366×768, `puppeteer-core` 25.12.0, Node v25.9.0, Windows 11 Home |

## 2. DS-UX con los instrumentos sin cambios

Orden: `PG_CONTAINER=agro_b_dsux4bcb_pg PG_PORT=55476 API_PORT=3156 WEB_PORT=4186 tool/f10_eval_web/dsux/run-dsux.sh docs/evidence/f10_dsux/20261025T011719Z`. La corrida fue de 01:17:19Z a 01:20:00Z, con salida 0.

**Siembra por la API real:**
- VER1, VER2 (Web) y MOVVER (Móvil), con la misma composición fijada que el 2026-10-19 (`tool/f10_eval_web/dsux/README.md`).
- **Repetir una etiqueta se niega sin escribir:** «Refused: tenant f10ux-web-ver1 already exists (seed a new F10_UX_LABEL; nothing is deleted)», con 23 usuarios antes y después.
- **Huella del dataset sembrado:** `2d05e305a329bd6a3b2a2998ffd6dc99d1d91dff394081acc6a8e52a90713309`, **igual en VER1, VER2 y EXP1** (§3).
  - Es distinta de la del 2026-10-19 porque la huella incluye `session_date` (§5.1); la tabla sembrada es la misma.
  - MOVVER: `191af096…`, con `same_tenant_as_accounts: true`.

**Oráculo** (`oraculo_check.py`): «ORÁCULO COINCIDE (y el manifiesto siembra exactamente su tabla)» para VER1 y VER2.

**Contraste** (`contraste.mjs`): VER1 con el canónico Bellator y VER2 con Belator.

| Etapa | VER1 | VER2 |
|---|---|---|
| Antes de W3 (API como Directiva y como Administrador, y Web: 150 L / 4, 12 L / 3, 6 L / 3; cobertura «4 de 6») | CUMPLE (20) | CUMPLE (20) |
| W3 por la interfaz | CUMPLE (2) | CUMPLE (2) |
| Tras W3 (el canónico, 18 L con 3; cobertura «4 de 6») | CUMPLE (19) | CUMPLE (19) |
| Tras W4 por la interfaz (borrador y CSV) | CUMPLE (7) | CUMPLE (7) |
| **Total** | **48 de 48** | **48 de 48** |

**API:** 0 respuestas 429 y sólo dos 401 en `POST /api/v1/auth/refresh` (la Web intenta renovar sin cookie al cargar, como el 2026-10-19). Ningún 403 ni 5xx (`api-errors-summary.txt`, que cubre también §3).

**Lo nuevo que se ve en la Web** (captura `1-resumen-antes-W3.png`):
- el menú incluye «Tendencias»;
- debajo de las tablas del resumen aparece el bloque «Sellado de la versión colectiva», con «Todavía no se puede sellar.» y dos motivos:
  - «El sellado está desactivado en este servidor hasta que la app móvil en uso sepa tratar una campaña sellada.»
  - «Sólo se sella una campaña cerrada. Cerrar y sellar son pasos distintos.»

`contraste.mjs` no mira ese bloque, y no cambia las tareas W1–W5: el participante no tiene que usarlo. **El facilitador debe saber que aparece.**

**El CSV del borrador W4** añade `seal_ref`, `seal_version` y `sealed_at` a la cabecera, vacías porque la campaña no está sellada. Las líneas de los productos tienen el mismo formato que el 2026-10-19, así que las comprobaciones de W4 no cambian.

## 3. Exportaciones nuevas (F07)

**Por qué hay un instrumento aparte:** `run-dsux.sh` genera la contraseña de las cuentas en memoria y la descarta al terminar, así que sus tenants no se pueden volver a leer. `run-exportaciones.sh` siembra con el mismo generador un tenant Web de verificación propio, **EXP1**, en una base nueva. Después `exportaciones.mjs` lee por la API, como Directiva y sin navegador:
- el resumen (JSON y CSV);
- el estado del sellado;
- las tendencias (JSON y CSV de `DECLARED_NEED` y `CONSUMPTION_TOTAL`);
- un borrador nuevo y su CSV.

Compara las cifras con el **oráculo antes de W3**, sin W3.

Orden: `PG_CONTAINER=agro_b_dsux4bcb_pg PG_PORT=55476 API_PORT=3156 tool/f10_eval_web/dsux/run-exportaciones.sh docs/evidence/f10_dsux/20261025T011719Z`, de 01:20:21Z a 01:21:01Z, con salida 0. El oráculo de EXP1 coincide.

**Resultado: 26 de 26** (`EXP1-exportaciones/exportaciones.json`).

| Qué | Observado |
|---|---|
| Resumen JSON | `seal: null`. Belator 6000 ML con 3, Bellator 12000 ML con 3 y Glifosato Demo 150000 ML con 4, todas `DISCLOSED`; cobertura 4 de 6 |
| Resumen CSV | La cabecera trae `seal_ref`, `seal_version` y `sealed_at`, vacías. Las filas son iguales al JSON |
| Estado del sellado | `NOT_SEALED`, `can_seal: false`, `blocked_by` con `SEALING_DISABLED` y `CAMPAIGN_NOT_CLOSED` |
| Tendencias, los dos tipos | HTTP 200 en JSON y CSV. La campaña figura con `seal: null` y `coverage: null`, y no hay ninguna serie. El CSV no trae cifras: sólo la política, la campaña sin sellar y el aviso «Sólo versiones selladas…» |
| Borrador y su CSV | 201. Cabecera con `seal_*` vacías; las tres líneas `DISCLOSED` con las cifras del oráculo. Sin `NaN` ni `undefined` |

**Huellas nuevas.** Se registran sin compararlas con las del 2026-10-19. Los CSV y JSON llevan referencias y horas de esta corrida, así que **ninguna huella se reproduce entre corridas**; sirven para fijar los archivos publicados.

`exportaciones.json` guarda además el SHA-256 de cada respuesta **literal, antes de sanear**. Las de la tabla de §4 son las de los archivos publicados, ya saneados.

## 4. Archivos

**Carpeta:** `docs/evidence/f10_dsux/20261025T011719Z/`.
- Saneada con `tool/f10_eval_web/sanitize.mjs`: los UUID quedan en 8 caracteres hexadecimales y se quitan los correos en `.json`, `.csv` y nombres de archivo («saneado: 18 archivos»).
- Los CSV descargados por la Web se movieron de `downloads/` a la carpeta de su contraste, como el 2026-10-19.
- **Los logs no se publican:** `logs/` y `logs-exportaciones/` traen correos, UUID y operaciones sin sanear. Quedaron fuera del repositorio; de ellos sólo se publica `api-errors-summary.txt`.

SHA-256 del contenido LF:

| Archivo | SHA-256 |
|---|---|
| `env.txt` | `e08c074845c4209d7a5c7a302f003dad2ccad2579373f27a4338395fcb8380a4` |
| `env-exportaciones.txt` | `10f45af9d83e801a9897da65db3312aae346528e0c8c58d00b14c211976a5dec` |
| `api-errors-summary.txt` | `8850fc58d748eea9d97122c5ac9049c869b6a633498317f72f2784d117ea6165` (el mismo contenido que el 2026-10-19) |
| `oraculo-VER1.txt`, `oraculo-VER2.txt`, `oraculo-EXP1.txt` | `1557ffad26d738946555ec5ec7521b7d299c8f65cf168d8a471e433d0a24b017` (iguales) |
| `manifest-VER1.json` | `e704e5375c69ac4a2d44c9ab0d8d7670adf167b4899bbfec9b800a458b3aed46` |
| `manifest-VER2.json` | `9c88e318d43d9f6d62466d456c6f0b945b7d5ccd21a147d4ce65369999e77904` |
| `manifest-EXP1.json` | `d944972b95a183deddeb4acb6f4cd531f9e81f683434df2cfd857a1c87b36814` |
| `manifest-MOVVER.json` | `549a8f6f06953c38a63f541821d2ac08d2e6c48143bd8da7c026a22c149581bd` |
| `references-MOVVER.json` | `b6b0c7a86107720406b4e65859d7cd21b7e23a2a59789fe63a94b228031e4e94` |
| `VER1-Bellator-1366x768/contraste.json` | `7e2c66902be19273704790fc4dc6b5b436b7cd6ece0fc30a95e846989fbfe514` |
| `VER2-Belator-1366x768/contraste.json` | `3c865f389544d80147615e47aa90ccb8cdc93afaeb0252cefbc48e426d2250ed` |
| `VER1-Bellator-1366x768/propuesta-37a93f5d.csv` (W4) | `62390640a93fef6ed32164b9e16cbd222f903f4ea51c5fcfbf27a86ad1b89ac6` |
| `VER2-Belator-1366x768/propuesta-b933eff1.csv` (W4) | `ddb221a6b3f46d628c2600dcd2aab8f02a682017e50e4b153421199af999cf94` |
| `EXP1-exportaciones/exportaciones.json` | `92e1ec18888f5c83d4e6c78a956c2fbce214a1a7019b8f30e016f69b9f3e1065` |
| `EXP1-exportaciones/resumen.json` | `8b855d37b2786039707bb049462aea9e555ed0f4c0696ff9eb1b0bd4d8fb623b` |
| `EXP1-exportaciones/resumen.csv` | `8bc134f4031263896da5aea2bc217b9b988b558828eb3be4f62a7c8cf94e4b0c` |
| `EXP1-exportaciones/sellado-estado.json` | `9cbfdf66aaab931884ae89218d83925d6298fc396d85861a8903132cb0ead9d3` |
| `EXP1-exportaciones/tendencias-necesidad.json` | `c5faa568e27d864e27c30724005dc42111af3d97508dd2d9d4ff2dd8837184dd` |
| `EXP1-exportaciones/tendencias-necesidad.csv` | `2048396a0cf817151c8e4b63f393a62a8ef68a935d81e15415be06e95c3634f7` |
| `EXP1-exportaciones/tendencias-consumo.json` | `b798f000af4ddcbf283b99b36e5d7c8507c00d2e0d4e92da77ea05ab213575ca` |
| `EXP1-exportaciones/tendencias-consumo.csv` | `517ae97644520559a97476ad0b297090e3c981e36fd4f7bbb0eaf3c7a4442c84` |
| `EXP1-exportaciones/propuesta.csv` | `8273a8397b7db7fc5ff37f5ceb713248ded8d075c2c959995a670861045aabc8` |

Capturas (datos sintéticos de pantalla; SHA-256 del archivo):

| Captura | VER1 (canónico Bellator) | VER2 (canónico Belator) |
|---|---|---|
| `1-resumen-antes-W3.png` | `2f469b2af4a26017b6ae10e1585e0fbbb27efe0eb8a36d92ae869b4adb182bd8` | `288b1bd7f7ff6da436200c77918f61d2b8be3799bc2a350daf3813164a3e5d45` |
| `2-reconciliacion-W3.png` | `af5b8f2155ffe2d60263f6734681456c2e5d689f07fcb275b6fc6823ff820d8c` | `6b9149414c4c0fb441af2b65612d7d8994e7e7d95b92e5ed906305d9311e6fbc` |
| `3-resumen-tras-W3.png` | `034132c52d7424cc422dc5a8227c011b04d1bd8c2e7e0b34e7b3993805910e9b` | `a6ee48603b5f548c0ced159cd735b6f8f6ae282603a3d6d8a3d292c5d71bc6d9` |
| `4-propuesta-W4.png` | `138f8249e2f7ca1fbecdef2fd0eb310dc2a08c917b676d0b65e971ecf6cf81a6` | `060a6b728abedc96c46b46d318229c250f2f90cdaf040e1a9b87030b1913bb35` |

## 5. Observaciones y límites

### 5.1 El día de sesión salió con la fecha UTC, no con la de La Paz

`run-dsux.sh` y `run-exportaciones.sh` toman por defecto `F10_UX_SESSION_DATE=$(TZ=America/La_Paz date +%F)`.
- **El problema:** en el Git Bash de este equipo no hay base de datos de zonas horarias, y esa orden devuelve la fecha **UTC**. Se comprobó a las 01:21:47Z: `TZ=America/La_Paz date` dio «2026-10-25 01:21:47 GMT», cuando en La Paz era el 2026-10-24 a las 21:21.
- **Efecto aquí:** el día de sesión fue el **2026-10-25** y la campaña empieza el 2026-09-25 (sesión − 30), lo que también cambia la huella del dataset (§2). Ninguna comprobación depende de esa fecha.
- **La corrida del 2026-10-19** (03:22Z, el 2026-10-18 a las 23:22 en La Paz) tomó por la misma razón «2026-10-19», y su `env.txt` lo etiqueta «(America/La_Paz)». No se reescribe; se anota aquí.
- **Para las sesiones reales:** pasar `F10_UX_SESSION_DATE` de forma explícita, o corregir el valor por defecto con una zona fija `-04:00`. Esto último cambia un instrumento y **no se hizo**: lo decide Roderich.

> **Nota del 2026-10-25 (instrumento corregido después de esta corrida).**
> - **La decisión:** Roderich Rendón decidió el 2026-10-24 exigir `F10_UX_SESSION_DATE` explícita y válida, sin valor por defecto. El cambio está en `run-dsux.sh` (rama `fix/f10-dsux-fecha-explicita`) y en `run-exportaciones.sh` (esta rama), con el mismo `session-date.sh`.
> - **Qué fecha usó esta corrida:** la que se generó de verdad, **2026-10-25** (UTC). Las huellas, los manifiestos y `env.txt` de §2–§4 se conservan tal cual, sin recalcular, y esta corrida **no** se presenta como hecha con el instrumento corregido.

### 5.2 Límites

- Una sola resolución (1366×768) y un solo navegador (Chrome), como el 2026-10-19.
- **Sellado sin activar:** no se verificó una campaña sellada ni unas tendencias con cifras en este dataset. El sellado y las tendencias con cifras tienen su evidencia en `F07_SELLADO_HISTORICO.md` §7, con el dataset D4 y el sellado activado en un entorno desechable.
- **Tenants consumidos:** VER1, VER2 y EXP1 tienen ya asociación o borrador, y MOVVER tiene una cuenta lectora desactivada. Los tenants de las sesiones se siembran aparte, con la etiqueta del participante.
- **No se probó el teléfono:** el tenant Móvil (MOVVER) sólo se sembró y se comprobó por la API. Activar `.f10ux` desde Mobile `1d77c14` contra este Central queda para la sesión A, y el generador Móvil (`tool/f10_ux/` del repositorio Mobile, esquema 11) no se ejecutó aquí.
- **Datos:** la divulgación es provisional y sintética. k = 3 no da anonimato y F07-POL-01 (#107) sigue abierta. Ninguna cifra es real.
