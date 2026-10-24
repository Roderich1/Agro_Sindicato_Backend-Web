# F08-BKP-08 (#151 §A): repetición acotada contra Backblaze B2 real de 5b y H3, con su corrección

| Campo | Valor |
|---|---|
| Fecha real | 2026-10-24, de 16:26:03 a 16:26:41 (America/La_Paz, -04:00); de 20:26:03 a 20:26:41 UTC. El doble se ejecutó después, a las 20:27:08 UTC |
| Origen | Ejecución nueva, con fecha, código y subcarpeta propios. **No reemplaza** a la primera ejecución (`F08_BKP_08_B2_REAL_FORMATO2.md`) ni a la repetición (`F08_BKP_08_B2_REAL_REPETICION.md`). Las dos se conservan tal cual, con sus FAIL y su NO_CONCLUYENTE; **nada pasa a PASS de forma retroactiva** |
| Quién ejecutó | La sesión C, con el turno de A, tras el LISTO de A y de B y con la CI de #160, #163 y #164 en verde (A). Roderich autorizó la corrección de 5b y H3, y A trasladó la autorización |
| Código | Rama local de ensayo `test/f08-b151-repeticion`, **`1e5ff10`**: `62f4fe7`, más #160 `ff8bf7f` (pasos `h3` y `r5b`) y #163 `d673a56` (adaptador con `2d5085d`, `176fa60` y `d673a56`). Comprobado antes de empezar: `ff8bf7f` y `d673a56` son ancestros; el árbol del adaptador es el de `d673a56` y el de la herramienta el de `ff8bf7f`; lo demás que difiere es sólo de #160. Los informes registran `1e5ff10` sin cambios locales |
| Destino | Backblaze B2 real: bucket `agro-backups-roderich`, raíz `ensayo-f08/b151-20261024/`, subcarpeta nueva **`c-acot-20261024t2026/`** |
| Claves | `b151-rw` y `b151-ro`, las mismas temporales de mínimo privilegio (§1). **La clave amplia no se usó.** Siguen sin revocar: la revocación es lo último y la hace Roderich |
| Secretos | Inyectados por `con_b2.ps1` sólo en el proceso de cada paso, nunca por argv. Los informes salen saneados. Comprobación, con cada perfil inyectado: ninguno de los 16 archivos de `f08_b151_f2/5-acot-t2026/` contiene su keyID ni su clave secreta (0 de 16, para rw, ro y nodel). El script sólo imprime recuentos |
| Datos | Sintéticos: bytes aleatorios. Sin PostgreSQL: los casos acotados no pasan por la API |
| Informes | `docs/evidence/f08_b151_f2/5-acot-t2026/`: los informes de B2 (JSON y texto), `ejecucion.txt` y `doble/`. En `ejecucion.txt`, el «Â·» de las cabeceras es el «·» del script de lanzamiento leído como ANSI por Windows PowerShell 5.1; se deja tal cual |

## 0. Resultado

**Los 14 casos de la serie acotada pasan contra B2 real.** Ninguno es FAIL ni NO_CONCLUYENTE.

- **H3 queda resuelto contra B2:** con la clave ro, el error de `stage` en una subida multiparte es el rechazo de B2, 403 `AccessDenied` «not entitled». El origen también falló con `AbortError` al salir el adaptador, y ese error ya no sustituye la causa. En la repetición anterior este mismo caso (1-ro) fue NO_CONCLUYENTE, y sigue así en su evidencia.
- **5b queda resuelto contra B2.** B2 creó de verdad la multiparte y su respuesta no llegó al adaptador. El adaptador la encontró **listando sólo con el nombre exacto de su intento** y la abortó. Quedaron intactos otro intento de la misma clave, otra clave, una copia AVAILABLE y una subida concurrente del adaptador. Después se completaron esa subida concurrente y una subida normal.
- **3a mantiene su FAIL** de las ejecuciones anteriores como comportamiento observado del proveedor (el `IsLatest` crudo por página, H2). No se repitió, porque no depende de esta corrección, y el adaptador se registra aparte.
- **No se cierra #151 ni cambia ningún gate.**

## 1. Antes de tocar B2

- **Metadatos en claro de los perfiles** (`Import-Clixml`, sin descifrar los `SecureString`), a las 20:25:38 UTC:

  | Perfil | Bucket | Prefijo | Capacidades | Caduca |
  |---|---|---|---|---|
  | rw | `agro-backups-roderich` | `ensayo-f08/b151-20261024/` | listFiles, readFiles, writeFiles, deleteFiles | 2026-10-27 15:13:23Z |
  | ro | `agro-backups-roderich` | `ensayo-f08/b151-20261024/` | listFiles, readFiles | 2026-10-27 15:13:23Z |
  | nodel | `agro-backups-roderich` | `ensayo-f08/b151-20261024/` | listFiles, readFiles, writeFiles | 2026-10-27 15:13:24Z |

  Los tres se guardaron el 2026-10-24T15:13:24Z y les quedaban 66,8 h.
- **Antes de cada paso**, la herramienta preguntó a B2 (`b2_authorize_account`) qué podía hacer la clave. Se habría negado si no era exactamente el perfil declarado, con ese bucket y ese `namePrefix`. Lo verificado está en cada informe:
  - rw: `deleteFiles, listFiles, readFiles, writeFiles`;
  - ro: `listFiles, readFiles`;
  - las dos con `namePrefix` `ensayo-f08/b151-20261024/`.
- Antes del primer paso, `preparar` exige que la subcarpeta esté vacía, y `r5b` que lo esté `c5r/`.

## 2. Ejecución (una sola, declarada)

`b151_acotada.ps1`: un lanzador local de la sesión que no está en el repositorio. Ejecuta los pasos de `tool/f08_b2/b151_b2.cjs` en este orden, cada uno con `con_b2.ps1 -Ruta b151-<clave>.clixml node b151_b2.cjs b2 <clave> <paso> <salida>` y `BACKUP_S3_PREFIX=ensayo-f08/b151-20261024/c-acot-20261024t2026/`:

| # | Hora (UTC) | Clave | Paso | Resultado |
|---|---|---|---|---|
| 1 | 20:26:03–07 | rw | `preparar` | 1 PASS: copia válida de referencia en `c1/objects/` por el adaptador |
| 2 | 20:26:08–11 | ro | `h3` | 4 PASS |
| 3 | 20:26:12–33 | rw | `r5b` | 6 PASS |
| 4 | 20:26:34–36 | rw | `inventario` | `c1`: 1 versión; `c5r`: 3 versiones; 0 marcadores; 0 multipart |
| 5 | 20:26:36–39 | rw | `limpiar confirmar` | Borra por `versionId` todo lo de **esta subcarpeta** y aborta sus multipart: 0 restantes |
| 6 | 20:26:39–41 | rw | `inventario` (final) | **0 versiones, 0 marcadores, 0 multipart** en `c-acot-20261024t2026/` |

Pasos con fallos: 0 de 6. No se tocó nada fuera de esta subcarpeta: ni las ejecuciones anteriores ni el ensayo de #149.

## 3. Resultados contra B2 real

| Caso | Esperado | Observado | Veredicto |
|---|---|---|---|
| **H3** (ro): `stage` multiparte de más de 8 MiB, causa conservada | El error es el rechazo de permisos de B2, no el `AbortError` del origen; sin éxito aparente | `AccessDenied`, código `AccessDenied`, 403, «not entitled». Errores del origen: `["AbortError"]` | **PASS** |
| H3: limpieza registrada aparte | Un informe `STAGE_FAILED` con la causa del proveedor (403) y la limpieza completa | `{trigger: STAGE_FAILED, failure: {origin: provider, name: AccessDenied, status: 403}, complete: true, pending: []}` | **PASS** |
| H3: la copia válida de `c1/` sigue intacta | Misma versión, sin marcador, mismos bytes, y el adaptador la abre | Así | **PASS** |
| H3: nada cambió bajo `c1/` | Mismas versiones y marcadores | Igual | **PASS** |
| **5b-r** (rw): corte tras crear la multiparte y antes de recibir su UploadId | El error es el corte; B2 creó la subida y el adaptador la abortó, listando sólo por el nombre exacto de su intento; otro intento de la misma clave, otra clave y la subida concurrente siguen abiertos; nada del intento en staging | `causaConservada: true`, `b2CreoLaMultiparte: true`, multipart del intento restantes: 0, otro intento y otra clave intactos: 2 de 2, subida concurrente abierta: 1, staging del intento: 0, listados de multipart: los 2 con el nombre exacto del intento | **PASS** |
| 5b-r: limpieza registrada aparte | `STAGE_FAILED`, causa en el origen, limpieza completa | `{failure: {origin: source, name: Error}, complete: true, pending: []}` | **PASS** |
| 5b-r: la subida concurrente del adaptador se completa | Commit aceptado y mismos bytes | Así | **PASS** |
| 5b-r: la copia AVAILABLE previa sigue intacta | 1 versión, sin marcador, mismos bytes, y el adaptador la abre | Así | **PASS** |
| 5b-r: una subida normal completa (multiparte de 9 MiB) | Commit aceptado, mismos bytes, sin multipart ni staging de esa clave | Así | **PASS** |
| 5b-r: estado de `c5r/` antes de `limpiar` | 3 copias en `objects/`, 0 marcadores, 0 staging, 0 multipart | Así (las dos multipartes de la herramienta, abortadas por su UploadId) | **PASS** |

Con `preparar`, los dos `inventario` y `limpiar`, son 14 casos y 14 PASS.

**Cómo se provoca 5b-r.** La herramienta deja que `CreateMultipartUpload` llegue a B2 con su propio plazo, guarda el UploadId que B2 devuelve sin dárselo al adaptador y corta el origen. Después responde al adaptador como una llamada abortada. La herramienta conoce el UploadId real y lo usa para comprobar que esa subida, en concreto, ya no está. Así se reproduce con certeza lo que en la repetición anterior pasó por azar del tiempo (5b FAIL).

## 4. Doble S3 (no es B2), por separado

`node tool/f08_b2/b151_b2.cjs doble todos acotada`, en `1e5ff10` a las 20:27:08 UTC: **13/13 PASS** (`doble/`; el ciclo del doble tiene un solo `inventario`). El doble valida la herramienta, no el proveedor. No reproduce H3 por sí solo porque responde sin E/S, así que su PASS en h3 no prueba nada sobre H3. Lo prueba la ejecución contra B2 de §3.

## 5. Lo que queda

- **3a:** FAIL como comportamiento observado del proveedor (H2), sin cambios.
- **Riesgos residuales de la corrección:** en el §9 del modelo de amenazas. La pertenencia se apoya en los 64 bits aleatorios del nombre y en `$metadata.attempts`. Lo ambiguo, lo desconocido o lo que falla queda pendiente de reconciliación, nunca como limpieza completa.
- **Revocación de las tres claves temporales:** la ejecuta Roderich en su ventana, con la ruta y el comando que le pasa A. Después se verifica que ya no autorizan. **Esta sesión no revocó nada.**
- **#151 sigue abierto.** El cierre y los gates son de Roderich.
