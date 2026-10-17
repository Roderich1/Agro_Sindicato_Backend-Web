# F06 — Reconciliación Mobile → Central → agregado con dataset controlado

- **Fecha real de la corrida:** 2026-10-16, de 04:36:44 a 04:47:28 UTC.
- **Commits:**
  - Backend `3c01a160713a7712e13608731df18f4ae4eb0790` (rama `feat/f06-consolidacion`, PR #110), `dist` compilado desde ese commit;
  - Mobile `5e7ed78470958df3c79ccd73fa6e25f39497b37c` (rama `feat/f06-consumption-total`, [PR AppMovilAgroquimico#86](https://github.com/Roderich1/AppMovilAgroquimico/pull/86)), worktree limpio.
- **Ejecución:** Claude Code, con autorización delegada de Roderich Rendón para este bloque. Es ejecución automatizada; no hubo revisión del autor ni del tutor.
- **Issues:** #21 (F06-COLL-05) y #22 (GATE-F06).

## Dataset y oráculo

Todo está versionado en Mobile (`docs/evidence/`):

- `F06_DATASET.csv`: 53 eventos de 3 agricultores (F1–F3) en 2 campañas centrales.
  - **Campañas:** C1 = «Campana Verano 2026», C2 = «Campana Invierno 2026».
  - **Productos:** 4 canónicos — Belator, con su alias Bellator; Glifosato F06; Urea F06 (KG); Mancozeb F06 (KG).
  - **Casos incluidos:**
    - una aplicación con 3 productos;
    - dos reversiones, una de ellas multiproducto;
    - consumo de un familiar;
    - un producto sin vincular;
    - un cero declarado explícito;
    - una necesidad retirada después de sincronizarse;
    - un agricultor con Belator y Bellator a la vez (no debe contarse dos veces).
- `F06_EXPECTED_CONTRIBUTIONS.csv`: 26 aportaciones esperadas.
- `F06_EXPECTED_CELLS.csv`: 27 celdas esperadas, en dos etapas:
  - **RAW:** antes de asociar Bellator → Belator;
  - **CANONICAL:** después de asociarlo.
- **Oráculo.** Ambos CSV de resultados se escribieron **a mano**. `tool/f06_d4/oracle_check.py` los recalcula desde los eventos con la biblioteca estándar de Python, sin el código bajo prueba, y coinciden: `aportaciones 26/26`, `celdas 27/27`, `ORÁCULO COINCIDE`.

## Entorno

- **Base de datos:** contenedor propio `agro_f06d4_pg` (`postgres:16-alpine`, `127.0.0.1:55434`, volumen `agro_f06d4_pgdata`), base nueva `agro_f06d4_e1`:
  - 7 migraciones;
  - seed del Backend: 12 agricultores activos;
  - catálogo F06 y «Campana Invierno 2026» abierta (`tool/f06_d4/seed_d4.cjs`).
- **API:** local en 3200, `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` (política provisional k = 3, no aprobada).
- **Secretos:** sólo en el proceso; las contraseñas de las cuentas sintéticas se rotan en cada corrida y no se imprimen.
- **No toca** `agro_f03res01_pg` ni sus datos.
- **Comando:** `F06_DB_HOST=agro_f06d4_e1 tool/f06_d4/up.sh && tool/f06_d4/reconcile.sh`.

## Método

`test/f06_reconciliation_integration_test.dart` usa el código real de la app: sembrador, `ConsumptionPublisher`, `DeclaredNeedStore`, `SyncWorker`, `SyncApi` y `AuthV2Api`.

**Ejecución 1 (bases nuevas):**

- Por cada agricultor: login, registro de cliente, enlace de sesión, referencias y siembra desde el CSV.
- Publicación del consumo. El transporte de prueba **pierde la primera respuesta de cada push** después de que Central la aplicó, y el worker reenvía la misma operación.
- Después, la retirada de la necesidad ya sincronizada.
- Comparación por niveles:
  - **SQLite** (vista previa y necesidades) con el oráculo;
  - **outbox** (última intención por clave, todas ACKED);
  - **Central** (estado y cabeza de cada aportación propia, vía `GET /sync/v1/operations/:id`).
- La Directiva consulta `/summary` y `/summary.csv` de C1 y C2 (etapa RAW), confirma la asociación Bellator → Belator y vuelve a consultar (etapa CANONICAL).

**Ejecución 2 (otro proceso, mismas bases):**

- Publicar de nuevo no encola nada.
- **Se reenvía tal cual cada operación aceptada:** Central devuelve el ACK con la aceptación original.
- Repetir la asociación devuelve `changed: false`.
- El agregado debe ser idéntico, campo a campo, al de la ejecución 1.

Además, el cliente HTTP de la app rechaza la ruta del consolidado (`AuthApiErrorKind.configuration`): Mobile no puede pedir el agregado. La Directiva consulta por HTTP directo, como la Web.

## Resultado por celda

Diferencia = obtenido − esperado. En las celdas suprimidas y ausentes se compara el estado: el total y el conteo no se publican.

| Etapa | Campaña | Proyección | Producto | Unidad | Esperado | Obtenido | Diferencia |
|---|---|---|---|---|---|---|---|
| RAW | C1 | CONSUMPTION_TOTAL | Belator | ML | SUPRIMIDA (2 Members) | SUPRIMIDA | 0 |
| RAW | C1 | CONSUMPTION_TOTAL | Bellator | ML | SUPRIMIDA (1) | SUPRIMIDA | 0 |
| RAW | C1 | CONSUMPTION_TOTAL | Glifosato F06 | ML | 8250 / 3 | 8250 / 3 | 0 |
| RAW | C1 | CONSUMPTION_TOTAL | Mancozeb F06 | G | SUPRIMIDA (1) | SUPRIMIDA | 0 |
| RAW | C1 | CONSUMPTION_TOTAL | Urea F06 | G | SUPRIMIDA (2) | SUPRIMIDA | 0 |
| RAW | C1 | DECLARED_NEED | Belator | ML | SUPRIMIDA (2) | SUPRIMIDA | 0 |
| RAW | C1 | DECLARED_NEED | Bellator | ML | SUPRIMIDA (1) | SUPRIMIDA | 0 |
| RAW | C1 | DECLARED_NEED | Glifosato F06 | ML | AUSENTE (cancelada) | AUSENTE | 0 |
| RAW | C1 | DECLARED_NEED | Urea F06 | G | 25000 / 3 (incluye un 0 explícito) | 25000 / 3 | 0 |
| RAW | C2 | CONSUMPTION_TOTAL | Belator | ML | SUPRIMIDA (1) | SUPRIMIDA | 0 |
| RAW | C2 | CONSUMPTION_TOTAL | Bellator | ML | SUPRIMIDA (2) | SUPRIMIDA | 0 |
| RAW | C2 | CONSUMPTION_TOTAL | Glifosato F06 | ML | AUSENTE (revertida) | AUSENTE | 0 |
| RAW | C2 | CONSUMPTION_TOTAL | Mancozeb F06 | G | 9500 / 3 | 9500 / 3 | 0 |
| RAW | C2 | DECLARED_NEED | Glifosato F06 | ML | SUPRIMIDA (1) | SUPRIMIDA | 0 |
| RAW | C2 | DECLARED_NEED | Mancozeb F06 | G | 11500 / 3 | 11500 / 3 | 0 |
| CANONICAL | C1 | CONSUMPTION_TOTAL | Belator | ML | 8000 / 3 | 8000 / 3 | 0 |
| CANONICAL | C1 | CONSUMPTION_TOTAL | Glifosato F06 | ML | 8250 / 3 | 8250 / 3 | 0 |
| CANONICAL | C1 | CONSUMPTION_TOTAL | Mancozeb F06 | G | SUPRIMIDA (1) | SUPRIMIDA | 0 |
| CANONICAL | C1 | CONSUMPTION_TOTAL | Urea F06 | G | SUPRIMIDA (2) | SUPRIMIDA | 0 |
| CANONICAL | C1 | DECLARED_NEED | Belator | ML | 11000 / 3 | 11000 / 3 | 0 |
| CANONICAL | C1 | DECLARED_NEED | Glifosato F06 | ML | AUSENTE | AUSENTE | 0 |
| CANONICAL | C1 | DECLARED_NEED | Urea F06 | G | 25000 / 3 | 25000 / 3 | 0 |
| CANONICAL | C2 | CONSUMPTION_TOTAL | Belator | ML | SUPRIMIDA (2 Members: F1 con dos alias cuenta una vez) | SUPRIMIDA | 0 |
| CANONICAL | C2 | CONSUMPTION_TOTAL | Glifosato F06 | ML | AUSENTE | AUSENTE | 0 |
| CANONICAL | C2 | CONSUMPTION_TOTAL | Mancozeb F06 | G | 9500 / 3 | 9500 / 3 | 0 |
| CANONICAL | C2 | DECLARED_NEED | Glifosato F06 | ML | SUPRIMIDA (1) | SUPRIMIDA | 0 |
| CANONICAL | C2 | DECLARED_NEED | Mancozeb F06 | G | 11500 / 3 | 11500 / 3 | 0 |

**Ejecución 2.** Las 12 celdas CANONICAL vuelven a dar diferencia 0 y son idénticas a las de la ejecución 1 (`identicalToExecution1: true`).

**Cobertura** en las dos campañas y las dos ejecuciones: `linked_members = 12`, `members_with_contribution = 3`.

## Contadores

| | Ejecución 1 | Ejecución 2 |
|---|---|---|
| Operaciones ACKED por agricultor (F1/F2/F3) | 9 / 10 / 8 | 9 / 10 / 8 |
| Push enviados | 54 (cada operación dos veces: respuesta perdida + reenvío) | 27 reenvíos literales |
| Respuestas perdidas a propósito | 27 | 0 |
| Cabezas en Central = última intención local | 26/26 | 26/26 |
| Peticiones HTTP | 102 | 71 |
| Asociación | `changed: true` | `changed: false` |

Tras las dos ejecuciones, en sólo lectura (`tool/f06_d4/central_dump.sh`):

- **Aportaciones en Central frente al oráculo:** `obtenidas=26 esperadas=26 faltan=0 sobran=0`.
- **Journal:** 27 operaciones, una por intención. Los 54 + 27 envíos no crearon filas nuevas.
- **Publicaciones del agregado:** 6, todas en la ejecución 1; la ejecución 2 no publicó cifras nuevas.
- **Asociaciones vigentes:** 1.

**Artefactos** (Mobile, `docs/evidence/F06_RUN_20261016/`, SHA-256):

| Archivo | SHA-256 |
|---|---|
| `execution1.csv` | `11bf1a1a924bb639597ba24567f4b745f6fe456ba3b3ec7365c24aad1415912b` |
| `execution1.json` | `1fce17f13f119230657bff5a1afefcf1de4ac4f6475e7e4e0431c8caec79b7d9` |
| `execution2.csv` | `5715bfbe2d68ea9db44d39303f085e61e922106b08e4400f3aab7a872ce3fa15` |
| `execution2.json` | `63fba6f8d9fe1e2f959a66ac1d1e9da5096495a22a520f266398f1717da90fe5` |
| `central_contributions.csv` | `66b41b8c224600414edf20ba62e7cb4747bd62209c9970863189db6b4646bca6` |

## Ruta física

El agricultor 1 publicó desde la copia aislada `.f06d4` del POCO X5 Pro 5G, contra otra base del mismo contenedor (`agro_f06d4_poco`). Central coincidió con su fila del CSV: 9/9. Ver `AppMovilAgroquimico/docs/evidence/F06_D4_DEVICE.md`.

## Ensayos previos y correcciones

Antes de esta corrida hubo cuatro ensayos sobre otras bases (`agro_f06d4`, `agro_f06d4_t3`) con código aún sin commitear. Fallaron por defectos del arnés, no del producto, y se corrigieron:

- faltaba registrar y enlazar el cliente de instalación (Sync v1 lo exige);
- el bloqueo `unreachable` del worker tras una respuesta perdida es esperado;
- la clave de huella empezaba por «/» y Git Bash la convertía en ruta;
- el cliente de la app no puede pedir el consolidado (es correcto), así que la Directiva consulta por HTTP directo.

Esas bases quedan en el volumen y no son evidencia.

## Límites

- **Transporte.** El origen HTTPS se reescribe al Backend local en el transporte de prueba: aquí no se ejercita TLS. La ruta física sí usó HTTPS.
- **Fork entre instalaciones.** No se reproduce en este dataset. Lo cubren la suite adversarial F05 (D2) y `f06-coll-05-collective-aggregate.postgres.spec.ts`.
- **Política.** La divulgación usa la política provisional k = 3 (F07-POL-01 pendiente). Sin `provisional-synthetic`, el Backend no devuelve cifras.

## Regresión sobre e2263b0 + ce5678f (2026-10-17)

Pedida por la sesión A para GATE-F06 (#22). No es una prueba de F10. **La corrida de 2026-10-16 de arriba se conserva tal cual**, sobre BE `3c01a16` y MOB `5e7ed78`.

**Estado:** primer intento detenido por falta de memoria; **repetición completa: PASS** (2026-10-17 14:37:59–14:50:40Z).

**Entorno:**
- Backend `e2263b04d96dd9f049a92046a45232af847ce0da`: `dist` y seed compilados en un worktree limpio.
- Mobile `ce5678f89449453c60c3f1889cd6e973f09f6548`, worktree limpio.
- Contenedor nuevo y aislado `agro_b_f06reg_pg` (`postgres:16-alpine`, `127.0.0.1:55460`, volumen `agro_b_f06reg_pgdata`), con bases nuevas `agro_f06reg_e1` (host) y `agro_f06reg_poco`, y API en 3210/3211.
- No se tocaron `agro_f06d4_pg`, `agro_a_f10eval_pg`, `agro_a_f10int_pg` ni ninguna base conservada.

**Comando:** `tool/f06_d4/up.sh && tool/f06_d4/reconcile.sh` del worktree Mobile, ejecutados desde una copia en la que sólo cambian, en `config.sh`, el contenedor, el volumen, la base y los puertos.

**Primer intento (detenido):**
- **13:47:44–13:49:29Z:** `up.sh` OK, con base `agro_f06reg_e1`. 11 migraciones por base; seed de 12 agricultores; catálogo F06; las dos API respondieron `health` 200.
- **13:49:31Z:** `reconcile.sh` rotó las contraseñas y empezó la ejecución 1 de `test/f06_reconciliation_integration_test.dart`.
- Poco después, **Claude Code detuvo el proceso porque el sistema se quedó sin memoria**. No es un fallo de la prueba ni del código.
- Se detuvieron las API y el contenedor, conservando el volumen. Esa base no se reutiliza.

**Repetición** (base nueva `agro_f06reg_e2`, tras la ventana física de A, sin otra carga pesada):
- **Comando:** `F06_DB_HOST=agro_f06reg_e2 up.sh && reconcile.sh`, con `F06_BE_DIR` y `F06_MOB_DIR` en los worktrees citados.
- **Backend:** worktree en `09eeca4` (rama de este PR, sólo documentos); `git diff e2263b0 -- Back/src Back/prisma` vacío, y `dist` compilado desde ese código.
- **Mobile:** `ce5678f`.
- **14:37:59–14:40:07Z:** `up.sh` OK. 11 migraciones y seed en `agro_f06reg_e2`; las API respondieron 200.
- **Ejecución 1** (14:40:09–14:46:27Z): `All tests passed!`.
  - Por agricultor (F1/F2/F3): 9/10/8 operaciones ACKED y 26/26 cabezas en Central.
  - 27 respuestas perdidas a propósito y reenviadas, en 102 peticiones HTTP.
  - Las **27 celdas** de las etapas RAW y CANONICAL tienen **diferencia 0** frente al oráculo.
  - La asociación devolvió `changed: true`.
- **Ejecución 2** (14:46:27–14:50:39Z): `All tests passed!`.
  - Hubo 27 reenvíos literales, en 71 peticiones.
  - La asociación devolvió `changed: false` y el resultado es `identicalToExecution1: true`.
- **Oráculo:** `aportaciones 26/26`, `celdas 27/27`, `ORÁCULO COINCIDE`; `Central: obtenidas=26 esperadas=26 faltan=0 sobran=0`, `CENTRAL COINCIDE CON EL ORÁCULO`.
- **Journal:** 27 operaciones. 6 publicaciones del agregado y 1 asociación vigente, como en la corrida del 2026-10-16.

**Diferencias frente a la corrida del 2026-10-16:**
- Los resultados por celda y las aportaciones en Central son **idénticos byte a byte**: `execution1.csv`, `execution2.csv` y `central_contributions.csv` tienen los mismos SHA-256 que los artefactos del 2026-10-16.
- **Cobertura (#126, H2):**
  - C1 y C2 siguen en `linked_members = 12` y `members_with_contribution = 3`, porque los tres aportantes de la D4 tienen al menos una cifra publicada en cada campaña. Con la regla nueva no cambia el conteo.
  - Lo que cambia es el campo nuevo `suppressed_cells: true` en las dos campañas, que avisa sin conteo de que hay celdas suprimidas.
- **Los informes JSON** sólo difieren en las fechas, en los identificadores cortos de los Members (semilla nueva) y en ese campo.

**Artefactos** ([`f06_regresion_20261017/`](f06_regresion_20261017/), SHA-256):
- Sin las bases SQLite de los agricultores ni el volcado canónico con UUID, que quedan fuera del repositorio.
- No contienen correos ni UUID completos.

| Archivo | SHA-256 |
|---|---|
| `execution1.csv` | `11bf1a1a924bb639597ba24567f4b745f6fe456ba3b3ec7365c24aad1415912b` (= 2026-10-16) |
| `execution1.json` | `ed6ae41c10c1d8dfb9d3b9ae11255b418e7f2e4c9a7f83b3977e811f756fe6e1` |
| `execution2.csv` | `5715bfbe2d68ea9db44d39303f085e61e922106b08e4400f3aab7a872ce3fa15` (= 2026-10-16) |
| `execution2.json` | `4cc8f374e22436112972d73b31c19058820e895d7e12acb99f20375252498b50` |
| `central_contributions.csv` | `66b41b8c224600414edf20ba62e7cb4747bd62209c9970863189db6b4646bca6` (= 2026-10-16) |

**Límites:**
- Es la ruta de host: el código Mobile corre en `flutter test` contra la API real.
- No se repitió la ruta física (el POCO es de A).
- La política es la provisional k = 3 con datos sintéticos.
