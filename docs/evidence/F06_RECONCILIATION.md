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

## Reconciliación bajo el control temporal de #116 (2026-10-18)

Pedida en `CONTINUACION_F09_ENS_01_TRIAGE_2026-10-17.md` §4 y §5 (sesión B). Motivo: la D4 de arriba se ejecutó **antes** de MOB #116 (D-F04-C2), que cambia la elegibilidad de publicación (el período local tiene que caber en el central) y el despacho del worker; y su prueba de integración no corre en la CI normal sin `AGRO_E2E_BASE_URL`. **Las corridas del 2026-10-16 y del 2026-10-17 se conservan tal cual.**

**Estado:** `up.sh` falló en el primer intento (conservado abajo); **reconciliación completa: PASS** (2026-10-18, 03:14:01–03:24:37Z).

**Entorno (nuevo y aislado, sin teléfono):**
- Backend `main` **`6e4a0e2ce8fb33ac3d6bf70e88cb6e60641456f0`**, worktree limpio `_wt/B-F06-D4-BE`: `npm ci`, `prisma generate`, `nest build` y `npm run build:seed` (el seed se compila aparte, ver intento 1).
- Mobile `main` **`0cc2ee3f518f715bb008fc6cf50a891068b0d649`** (merge documental de #118; `lib`, `test`, `android` y `pubspec` iguales a `65f7cfc`, que incluye #116), worktree `_wt/B-F06-D4-MOB`, con el ajuste del fixture descrito abajo (MOB #123).
- Contenedor nuevo `agro_b_f06d4b_pg` (`postgres:16-alpine`, `127.0.0.1:55436`, volumen `agro_b_f06d4b_pgdata`), bases nuevas `agro_f06d4b_e1` (host) y `agro_f06d4b_poco` (creada por `up.sh`, no usada), API `NODE_ENV=development` en 3220/3221 con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` (k = 3).
- No se tocaron `agro_a_pg`, `agro_f05_pg`, `agro_a_f09dev_pg` (detenido) ni los contenedores anteriores de la D4.
- **Seed exacto:** `dist/prisma/seed.js` del Backend (12 agricultores, 14 productos, 72 lotes) y `tool/f06_d4/seed_d4.cjs` (5 productos F06; abre «Campana Invierno 2026»). Ninguno modifica fechas de campaña.

**Comando:** `tool/f06_d4/up.sh && tool/f06_d4/reconcile.sh` del worktree Mobile, desde una copia en la que sólo cambian, en `config.sh`, el contenedor, el volumen, la base, el puerto de PostgreSQL y los puertos de las API. `reconcile.sh` rota las contraseñas de las cuentas sintéticas, ejecuta dos veces `test/f06_reconciliation_integration_test.dart`, vuelca Central en sólo lectura y lo contrasta con el oráculo (`oracle_check.py`), **sin modificar el oráculo**.

### Contraste de períodos (antes de ejecutar)

Campañas centrales reales de la base nueva, leídas con `psql` en sólo lectura tras el seed (`startDate`/`estimatedEndDate`, medianoche UTC = día civil del contrato de referencias):

| Campaña central | Estado tras el seed | Período |
|---|---|---|
| Campana Verano 2026 (C1) | ABIERTA, activa | 2026-01-01 → 2026-06-30 |
| Campana Invierno 2026 (C2) | ABIERTA, activa (la abre `seed_d4.cjs`) | 2026-07-01 → 2026-11-30 |
| Campana Invierno 2025 | CERRADA | 2025-05-01 → 2025-09-30 (no interviene) |

Fixture local `test/support/f06_dataset.dart`, **antes** del ajuste: C1 del 01/03/2026 al **31/08/2026** (termina después que la central: `PERIOD_INCOMPATIBLE`, «termina después que la del sindicato») y C2 desde el 01/09/2026 **sin fin** (fin abierto frente a una central con fin: «fije un fin previsto»). Con #116, `bindCampaign` habría rechazado los dos vínculos y la siembra no habría llegado a publicar.

**Ajuste, sólo de fechas de preparación** (MOB #123, `test/support/f06_dataset.dart`, con la justificación en el propio archivo):

| Campaña local | Antes | Ahora | Eventos que contiene (sin cambios) |
|---|---|---|---|
| C1 «Campaña verano F06» | 01/03/2026 – 31/08/2026 | 01/03/2026 – **30/06/2026** | necesidades 15/05, compras 01/04, aplicaciones 10/05 |
| C2 «Campaña invierno F06» | 01/09/2026 – sin fin | 01/09/2026 – **30/11/2026** | necesidades 05/10, compras 15/09, aplicaciones 05/10 |

No cambian eventos, cantidades, campañas semánticas, `F06_DATASET.csv`, los CSV esperados ni los artefactos anteriores. Verificación tras la corrida, en las bases SQLite de F1–F3 (sólo lectura, esquema v10): C1 `CLOSED` 2026-03-01 → 2026-06-30 con vínculo `VALID` y período central guardado 2026-01-01 → 2026-06-30; C2 `ACTIVE` 2026-09-01 → 2026-11-30 con vínculo `VALID` y período central 2026-07-01 → 2026-11-30; outbox 9/10/8 filas, todas `ACKED`. Ninguna intención quedó retenida por período: el control de #116 no bloqueó nada porque los períodos caben, que es exactamente lo que se quería comprobar.

### Intento 1 (fallido, conservado)

- **03:12:26Z:** `up.sh` creó el contenedor y la base `agro_f06d4b_e1`, aplicó las 11 migraciones y **el seed falló**: `nest build` no compila `prisma/seed.ts`, así que `dist/prisma/seed.js` no existía (en la regresión del 17 el worktree ya lo tenía compilado). No es un fallo de la prueba ni del código.
- **03:12:58Z:** se ejecutó `npm run build:seed`, se eliminó la base vacía (sin aportaciones) y se repitió `up.sh`.

### Repetición (PASS)

- **03:12:58–03:13:18Z:** `up.sh` OK. 11 migraciones y seed en las dos bases; catálogo F06 «5 productos; campañas abiertas: 2»; las API respondieron `health` 200.
- **Ejecución 1** (03:14:02–03:20:23Z, 6:13): `All tests passed!`.
  - Por agricultor (F1/F2/F3): 6/5/4 consumos encolados, 0/1/0 cancelaciones, 9/10/8 operaciones ACKED y 26/26 cabezas en Central.
  - 27 respuestas perdidas a propósito y reenviadas, en 102 peticiones HTTP.
  - Las **27 celdas** de las etapas RAW y CANONICAL tienen **diferencia 0** frente al oráculo.
  - La asociación Bellator → Belator devolvió `changed: true`.
- **Ejecución 2** (03:20:27–03:24:35Z, 4:08): `All tests passed!`. 27 reenvíos literales en 71 peticiones; la asociación devolvió `changed: false`; `identicalToExecution1: true`.
- **Oráculo:** `aportaciones: calculadas=26 a mano=26 faltan=0 sobran=0`; `celdas: calculadas=27 a mano=27`; `ORÁCULO COINCIDE`; `Central: obtenidas=26 esperadas=26 faltan=0 sobran=0`; `CENTRAL COINCIDE CON EL ORÁCULO`.
- **Journal:** 27 operaciones; 6 liberaciones del agregado; 1 asociación vigente. Igual que el 16 y el 17.
- **Cobertura:** C1 y C2 con `linked_members = 12`, `members_with_contribution = 3` y `suppressed_cells: true` (semántica de #126), igual que el 17.
- **03:25:52Z:** API y contenedor detenidos con `stop.sh`; volumen conservado.

**Frente a las corridas anteriores:** `execution1.csv`, `execution2.csv` y `central_contributions.csv` son **idénticos byte a byte** a los del 2026-10-17 y del 2026-10-16 (mismos blobs de git: `87f1463`, `0175e1e` y `1506bd3`). Los JSON sólo difieren en las horas y en los identificadores cortos de los Members (semilla nueva).

**Artefactos** ([`f06_d4_20261018/`](f06_d4_20261018/)): sin las bases SQLite de los agricultores ni el volcado canónico con UUID; no contienen correos ni UUID.

| Archivo | SHA-256 (contenido con fin de línea LF) |
|---|---|
| `execution1.csv` | `11bf1a1a924bb639597ba24567f4b745f6fe456ba3b3ec7365c24aad1415912b` (= 2026-10-16 y 17) |
| `execution1.json` | `af1c1ff406544dd5efb05a8f1d949346946ff65173eb354530631d3c8767bb9d` |
| `execution2.csv` | `5715bfbe2d68ea9db44d39303f085e61e922106b08e4400f3aab7a872ce3fa15` (= 2026-10-16 y 17) |
| `execution2.json` | `0fb5e43747540b24f4132639efa8710770f69704cba915291bafc68fdf1e8428` |
| `central_contributions.csv` | `66b41b8c224600414edf20ba62e7cb4747bd62209c9970863189db6b4646bca6` (= 2026-10-16 y 17) |

**Límites:**
- Ruta de host (`flutter test` contra la API real); la ruta física no se repitió y el teléfono no se usó. Los pasos físicos G1–G3 de D-F04-C2 (MOB #118, `F04_C2_DEVICE.md`) usan una necesidad declarada y no sustituyen esta reconciliación.
- Esta corrida demuestra que la D4 **pasa con el control temporal activo y períodos compatibles**; los caminos de retención y conciliación de #116 (período incompatible, 404, carrera) están cubiertos por sus regresiones HOST (`f04_c2_*_test.dart`), no por esta prueba, cuyo dataset es compatible por diseño tras el ajuste.
- Política provisional k = 3 con datos sintéticos; sin cifras reales.

### Precisión editorial del 2026-10-18 (revisión para integración)

- La fecha de carpeta y de las horas anteriores es UTC. 03:14–03:24Z del 18 equivale a **23:14–23:24 del 17 en America/La_Paz**. Se conservan los timestamps y los SHA originales.
- La primera ejecución produjo **27 filas (15 RAW y 12 CANONICAL)**. La segunda produjo **12 filas CANONICAL**, después del reenvío literal de **27 operaciones**. Sus 12 filas coinciden exactamente con las CANONICAL de la primera. En ambos CSV todas las diferencias son cero y coinciden estado, cantidad y conteo esperados/obtenidos. No son 27 celdas independientes medidas dos veces; las expresiones resumidas anteriores se precisan con este desglose.
- La revisión verificó las cinco huellas SHA-256 publicadas, 26 filas en `central_contributions.csv` y el desglose anterior contra los archivos versionados. No repitió el ensayo ni modificó los CSV, JSON, oráculo o resultados históricos. La decisión académica ratificada está en `F06_GATE_DECISION.md`.
