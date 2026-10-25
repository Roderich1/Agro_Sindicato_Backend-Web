# F07 — Evidencia del histórico sellado, el sellado manual y las tendencias

- **Fecha real:** del 2026-10-23 al 2026-10-24 (America/La_Paz; las horas UTC se indican en cada caso).
- **Autoría:** sesión B de Claude Code. Revisión técnica entre sesiones: A y C (§5). No es una aprobación, ni del tutor, ni de la Directiva.
- **Contrato:** [`F07_SEALED_HISTORY_CONTRACT.md`](../architecture/F07_SEALED_HISTORY_CONTRACT.md) y las enmiendas fechadas de F06 §7.2, F05 §8 y F07-POL-01 §11.
- **Datos:** sólo sintéticos, en bases PostgreSQL 16 desechables (contenedor local `agro_b_f07seal_pg`, sin credenciales). Ninguna persona real.
- **Rama:** `feat/f07-sellado-historico`, desde `main` `769d441`.

**Estados que se usan:**
- `PASS` y `FAIL`: ejecutado, con ese resultado;
- `NO_CONCLUYENTE`: corregido sin volver a ejecutar;
- `NOT_RUN`: no ejecutado.

## 0. Cierre técnico sobre el código actual (`73f4c82`, redactado el 2026-10-24 a las 20:53Z)

El código actual de #162 es `73f4c82`. Respecto de `4a060cc`, sólo cambia un archivo de prueba (`f07-collective-seal.postgres.spec.ts`). Las secciones 1 a 6 conservan el detalle y la procedencia de cada resultado. Esta sección los ordena en tres bloques: lo implementado, lo probado y lo que necesita validación institucional.

### 0.a Lo implementado

**Decisiones del autor.** Todo lo que sigue aplica tres decisiones de diseño que Roderich Rendón tomó el 2026-10-23 para el entorno sintético (contrato F07, cabecera):
- el umbral `k = 3` (`PROVISIONAL_THRESHOLD`);
- la conservación histórica: se sella y no se elimina, y se descarta la M-2 de #159;
- el sellado manual.

No son aprobaciones de la Directiva ni del tutor.

- **Persistencia y guardas en la base** (migración nueva y `schema.prisma`):
  - `CollectiveSeal` y `CollectiveSealEntry`, con `version = 1`;
  - disparadores que impiden modificar o borrar un sellado y sus entradas, añadir entradas, crear o retirar divulgaciones de una campaña sellada, reabrirla o sellar una campaña abierta;
  - la memoria de divulgación de una campaña sellada se conserva, sin purga.
- **Sellado manual** (`POST /collective/campaigns/:id/seal`, `GET …/seal`):
  - sólo DIRECTIVA y ADMINISTRADOR del tenant (RU-18/RU-19, ADR-003);
  - confirmación explícita y `review_ref` contra la revisión mostrada;
  - idempotente: una segunda petición devuelve `created: false`;
  - bloqueo consultivo exclusivo y una sola transacción, sin efecto parcial;
  - bandera `COLLECTIVE_SEALING`, apagada por defecto;
  - auditoría mínima en `AuditLog`.
- **Lectura de una campaña sellada:** el resumen, su CSV y las propuestas de compra conjunta leen la versión sellada sin escribir ni recalcular. Una propuesta sin sellar decide en modo de sólo lectura.
- **Retirada tras el sellado:** un CANCEL posterior quita la visibilidad de la cifra afectada (`WITHDRAWN_AFTER_SEAL`) sin cambiar el snapshot sellado.
- **Sync v1:** en una campaña sellada, PUBLISH y SUPERSEDE reciben `REJECTED/CAMPAIGN_SEALED/MOVE_TO_TERMINAL_FAILURE`. El replay anterior al sellado conserva su respuesta. El `push` toma el bloqueo compartido del sellado.
- **Tendencias** (`GET /collective/trends`, `trends.csv`):
  - leen sólo versiones selladas; una campaña sin sellar aparece como `NOT_SEALED`, sin cifras;
  - nunca leen `CollectiveReleaseItem`;
  - aplican la política vigente: `POLICY_PENDING` no da cifras, y una celda por debajo de `k` queda suprimida.
- **Web:**
  - `seal-panel`: revisión, confirmación y mensajes de 409;
  - página de tendencias con su CSV;
  - el resumen marca la versión sellada;
  - navegación sólo para DIRECTIVA y ADMINISTRADOR.

### 0.b Lo probado

| Qué | SHA | Comando o run | Fecha real (UTC) | Resultado |
|---|---|---|---|---|
| Suite del sellado (PostgreSQL desechable) | `73f4c82` | CI `Web F07 verification`, run `40097400361`, job `f07-proposal-postgres`: `npx jest f07-collective-seal.postgres.spec.ts --runInBand` | 2026-10-24, 13:16:06Z–13:17:31Z | **PASS 20/20** (§2.2) |
| `f07-web-proposal` / `f07-acceptance` | `73f4c82` | el mismo run | idem | PASS 12/12, 6/6 |
| Web: `lint`, `build` (`tsc -b && vite build`), Vitest | `73f4c82` | el mismo run, job `web` | idem | PASS; Vitest 10 archivos, 88/88 |
| Backend completo | `73f4c82` | CI `Backend F02 verification`, run `40097400413` | 2026-10-24, 13:16:06Z–13:19:10Z | **PASS**: unitarias 324, `openapi:check` y las suites PostgreSQL de §2.2 |
| Análisis estático | `73f4c82` | check `SonarCloud Code Analysis` del PR #162 | 2026-10-24 | pass |
| Suite del sellado y mutaciones M1–M6 y M8 | `8ad60cb` | local, §3 | 2026-10-23 | PASS 19/19; las 7 mutaciones hacen fallar la suite |
| Unitarias del dominio | `943f578` | local, §4 | 2026-10-23 | PASS 47/47 |
| Suites corregidas (`sync-v1-journal`, `f06-coll-05`) y `product-reconciliation` | `4a060cc` | CI, runs `40060250490` y `40060250510` (§2.1) | 2026-10-24 | PASS 30/30, 16/16, 5/5 |
| Recorrido de integración Web↔Backend: 5 recorridos (§7) | código `73f4c82` (árbol `b31bd8b`) | `bash tool/f07_web_seal/run-seal-walk.sh docs/evidence/f07_sellado_web` | 2026-10-24, 22:31:28Z–22:35:53Z | **PASS 48/48** |

**Fallo intermitente corregido en D1 (`73f4c82`).**
- **Dónde se vio:** en la CI de la rama de F08 #163 (`045ae97`, run `40087793244`, 2026-10-24 10:54:59Z), con la suite del sellado en 18/19. Falló la prueba «sealed reads never write, never recompute, and the CSV carries the same decisions».
- **Clase:** era un falso positivo de la prueba, no un defecto de la aplicación. El auxiliar `expectNoNumber` construía una expresión regular con el valor sin escapar, así que el «.» de «1.2» aceptaba cualquier carácter. A veces coincidía con los milisegundos de la marca de tiempo ISO del CSV (p. ej. «.112Z»), según la hora de la ejecución.
- **Corrección:** el valor se escapa y se compara literalmente. Una prueba de control fija que «1.2» y «1200» siguen detectándose y que la marca de tiempo y «1x2» no coinciden. La suite pasa de 19 a 20 pruebas.
- **Resultado:** 20/20 en el run `40097400361`. Según la sesión A, también hay 20/20 en #163 (`9255f2c`) y #164 (`d35cd25`); esos dos runs no los ha revisado esta sesión.

**Sin ejecutar sobre `73f4c82`:**
- las mutaciones (última ejecución sobre `8ad60cb`);
- la prueba en DEVICE de `CAMPAIGN_SEALED` en Mobile, a cargo de la sesión A, que no forma parte de esta evidencia.

### 0.c Lo que necesita validación institucional

Nada de lo siguiente está validado por la Directiva, el tutor ni otra instancia. Esta evidencia no lo sustituye:
- **El umbral `k = 3`:** sólo rige en el modo sintético (`PROVISIONAL_SYNTHETIC`). La política F07-POL-01 (#107) no está aprobada, y el modo por defecto sigue siendo `POLICY_PENDING`, sin cifras. La comparación de `k` está en BE #161, pendiente de integrar.
- **La conservación histórica:** el historial sellado es vinculable al agricultor a través de la memoria de divulgación (contrato §2). Conservarlo sin plazo de purga con datos reales requiere una decisión institucional sobre su retención.
- **El sellado manual:** falta confirmar quién sella en la práctica y en qué momento de la campaña. Hoy lo hacen DIRECTIVA y ADMINISTRADOR, según la decisión de roles del autor (ADR-003).
- **La baja o la petición de no contar los datos tras el sellado:** depende de la respuesta 2(f) de la hoja institucional (§6).
- **El uso con datos reales y GATE-F07:** no se habilitan. GATE-F07 y #107 no cambian.

### 0.d Límites

- Es una evidencia **funcional y técnica**. No mide la experiencia de personas usuarias.
- **Sólo datos sintéticos** en bases desechables. Ningún dato real.
- `COLLECTIVE_SEALING` sigue apagada. Se enciende sólo con la compilación Mobile que trate `CAMPAIGN_SEALED` como fallo terminal, comprobada en DEVICE (§6).
- No hay copia ni restauración del Central. Una restauración anterior a un sellado olvidaría cifras ya conocidas (§6).
- El aporte de un agricultor dado de baja tras el sellado sigue en las cifras selladas visibles, sin vía de retirada (§6).
- Las mutaciones se ejecutaron sobre `8ad60cb`, no sobre `73f4c82`. El código Backend es el mismo: `git diff 8ad60cb 73f4c82 -- Back/src Back/prisma` sólo cambia tres archivos `*.spec.ts`. Lo demás que cambia entre ambos es la Web, la línea de CI, `openapi-contract.cjs` con sus snapshots y la documentación, y las mutaciones no tocaban nada de eso.

## 1. Qué SHA se probó

| SHA | Qué contiene | Qué se ejecutó sobre él |
|---|---|---|
| `8ad60cb` | Código Backend del sellado completo y suite nueva | Suite `f07-collective-seal` y mutaciones (§3) |
| `77b9bc2` | Más la Web y la línea de CI | Batería Backend (§2) y Vitest de la Web |
| `2f4c24f` | Más dos pruebas existentes corregidas (sólo archivos `*.spec.ts`) | Nada (§2, FAIL corregidos) |
| `15e1b72` | Más los snapshots OpenAPI y sus aserciones | `npm run openapi:check` |
| `4a060cc` | Más esta evidencia (sólo documentación) | CI de GitHub completa del PR #162 (§2.1) |
| `f6395cc` | Más los resultados de §2.1 (sólo documentación) | CI de GitHub, runs `40060619420` y `40060619455`, `success` (§2.1, corrección) |
| `73f4c82` | Más la corrección de la prueba `expectNoNumber` (sólo `f07-collective-seal.postgres.spec.ts`; D1) | CI de GitHub completa del PR #162 (§2.2). Es el código actual |

Entre `8ad60cb` y `15e1b72`, `git diff -- Back/src Back/prisma` sólo cambia las dos pruebas de `2f4c24f`. El código de la aplicación es el mismo. Hasta `73f4c82` sólo se añade además la prueba corregida.

## 2. Batería Backend sobre `77b9bc2` (2026-10-24, desde las 00:45:56Z)

La interrumpió Claude Code por falta de memoria del sistema (unos 3 GB libres de 23,7), antes de terminar. No se relanzó sin indicación.

| Paso | Comando | Resultado |
|---|---|---|
| Esquema | `npx prisma validate` | PASS |
| Compilación | `npm run build` (`nest build`) | PASS |
| Unitarias | `npx jest --runInBand` (las de PostgreSQL se saltan sin URL) | PASS: 40 suites, 324 pruebas; 19 suites saltadas |
| `sync-v1-adversarial` | `F05_SYNC_06_PG_TEST_URL=… npx jest …` | PASS 41/41 |
| `sync-v1-references` | idem | PASS 7/7 |
| `f10-sec-02-disclosure-gaps` | idem | PASS 2/2 |
| `f07-web-proposal` | idem | PASS 12/12 |
| `f07-acceptance` | idem | PASS 6/6 |
| `sync-v1-journal` | idem | **FAIL** 29/30: la prueba fijaba 12 migraciones y ahora hay 13. Corregida en `2f4c24f` → **NO_CONCLUYENTE** |
| `f06-coll-05` | idem | **FAIL** 15/16: el arnés «antes de la migración de cantidades» ejecutaba el código actual sobre una base sin `CollectiveSeal`. Corregido en `2f4c24f`: la base previa incluye la migración del sellado, que no depende de la de cantidades → **NO_CONCLUYENTE** |
| `f07-collective-seal` sobre el HEAD | idem | **NOT_RUN** (interrupción); PASS 19/19 sobre `8ad60cb` (§3) |
| `product-reconciliation` | idem | **NOT_RUN** (interrupción) |

**Cierre de lo pendiente:** las cuatro suites que quedaron `NO_CONCLUYENTE` o `NOT_RUN` se ejecutaron en la CI de GitHub sobre `4a060cc` (§2.1). En local siguen sin volver a ejecutarse.

### 2.1 CI de GitHub sobre `4a060cc` (PR draft #162, 2026-10-24)

PostgreSQL de servicio de GitHub Actions, con bases desechables y datos sintéticos. Los resultados se leyeron de los registros de cada ejecución con `gh run view <id> --log`.

**`Backend F02 verification`** (`backend-f02.yml`, run `40060250490`, de 03:55:05Z a 03:58:22Z, `success`):

| Paso | Resultado |
|---|---|
| `prisma validate`, `prisma generate`, `npm run build` | PASS |
| `npm test -- --runInBand` | PASS: 40 suites, 324 pruebas; 19 suites saltadas (PostgreSQL sin URL) |
| `npm run openapi:check` | PASS: aserciones F02, F05, F06 y F08 |
| `auth-v2` / `current-auth-context` / `f02-final-integration` | PASS 12/12, 25/25, 3/3 |
| `sync-v1-journal` | **PASS 30/30** (antes `NO_CONCLUYENTE`) |
| `sync-v1-adversarial` / `sync-v1-references` | PASS 41/41, 7/7 |
| `f06-coll-05` | **PASS 16/16** (antes `NO_CONCLUYENTE`) |
| `product-reconciliation` | **PASS 5/5** (antes `NOT_RUN`) |
| `backups` (5 suites) | PASS 57/57 |
| `f10-sec-02-legacy-boundary` / `f81-phase6-legacy-writes` / `f10-sec-02-disclosure-gaps` | PASS 29/29, 7/7, 2/2 |

**`Web F07 verification`** (`web.yml`, run `40060250510`, `success`):

| Job | Resultado |
|---|---|
| `web`: `lint`, `build`, `npm test` (Vitest) | PASS: 10 archivos, 88/88 |
| `f07-proposal-postgres`: `f07-web-proposal` / `f07-acceptance` | PASS 12/12, 6/6 |
| `f07-proposal-postgres`: `f07-collective-seal` | **PASS 19/19** (antes `NOT_RUN` sobre el HEAD) |

**Lo que la CI no ejecuta:**
- las mutaciones M1–M6 y M8 (§3), que sólo se ejecutaron en local sobre `8ad60cb`;
- la prueba en DEVICE de `CAMPAIGN_SEALED` en Mobile (§6, a cargo de A).

La Web sí queda cubierta: `npm run build` es `tsc -b && vite build`.

Este cambio, que sólo toca `docs/evidence/F07_*`, no dispara ninguno de los dos workflows. Los resultados de arriba corresponden a `4a060cc`.

**Corrección (2026-10-24):** la frase anterior era falsa. El commit `f6395cc`, que la añadió, sí disparó los dos workflows: `Backend F02 verification`, run `40060619420`, y `Web F07 verification`, run `40060619455`, ambos con `success` (04:00:36Z). Se conserva la frase original como registro.

**Composición `comp/f01-f08-be` `453acce` (PR #164, «NO FUSIONAR», de A):**
- `Backend F02 verification`, run `40060272620`, `success`:
  - unitarias: 41 suites, 345 pruebas;
  - las mismas suites PostgreSQL con los mismos totales, salvo `backups`: 6 suites, 68/68.
- `Web F07 verification`, run `40060272680`, `success`, con los mismos totales que #162.

Es una rama de composición, no una propuesta de fusión.

### 2.2 CI de GitHub sobre `73f4c82` (PR draft #162, código actual, 2026-10-24)

Mismo entorno que en §2.1. Los resultados se leyeron con `gh run view <id> --log` y `gh pr checks 162` el 2026-10-24.

**`Backend F02 verification`** (run `40097400413`, de 13:16:06Z a 13:19:10Z, `success`):

| Paso | Resultado |
|---|---|
| `npm run build`, `npm test -- --runInBand` | PASS: 40 suites, 324 pruebas; 19 suites saltadas |
| `npm run openapi:check` | PASS |
| `auth-v2` / `current-auth-context` / `f02-final-integration` | PASS 12/12, 25/25, 3/3 |
| `sync-v1-journal` / `sync-v1-adversarial` / `sync-v1-references` | PASS 30/30, 41/41, 7/7 |
| `f06-coll-05` / `product-reconciliation` | PASS 16/16, 5/5 |
| `backups` | PASS 57/57 |
| `f10-sec-02-legacy-boundary` / `f81-phase6-legacy-writes` / `f10-sec-02-disclosure-gaps` | PASS 29/29, 7/7, 2/2 |

**`Web F07 verification`** (run `40097400361`, de 13:16:06Z a 13:17:31Z, `success`):

| Job | Resultado |
|---|---|
| `web`: `lint`, `build`, `npm test` (Vitest) | PASS: 10 archivos, 88/88 |
| `f07-proposal-postgres`: `f07-web-proposal` / `f07-acceptance` | PASS 12/12, 6/6 |
| `f07-proposal-postgres`: `f07-collective-seal` | **PASS 20/20**, con la prueba de control nueva (§0.b) |

**`SonarCloud Code Analysis`** (check del PR #162 sobre `73f4c82`): pass.

## 3. Suite del sellado y mutaciones (sobre `8ad60cb`, 2026-10-23)

`F07_SEAL_PG_TEST_URL=postgresql://postgres@127.0.0.1:55471/postgres npx jest f07-collective-seal.postgres.spec.ts --runInBand` → **PASS 19/19**.

El oráculo está escrito en la cabecera de la suite antes de medir. Campaña CA:
- necesidad declarada de Herbicida: 1000 + 2000 + 3000 = **6000**, 3 aportantes;
- necesidad de Urea: 2 aportantes, **suprimida**;
- consumo de Herbicida: **2000**, 4 aportantes;
- consumo de Urea: 1000, 4 aportantes, y después una retirada **antes** del sellado → `SUPPRESSED_REVISION`;
- cobertura al sellar: 4 de 7.

Cubre lo que pide el encargo:
- **Roles:** sellan DIRECTIVA y ADMINISTRADOR. AGRICULTOR recibe 403, otro tenant 404 y sin sesión 401.
- **Sin efecto parcial:** la confirmación ausente o falsa (422/400), la revisión obsoleta (409 `SEAL_REVIEW_STALE`), la bandera apagada (409 `SEALING_DISABLED`), la campaña abierta (409 `CAMPAIGN_NOT_CLOSED`) y `POLICY_PENDING` (409). La instantánea de filas es idéntica antes y después.
- **Fallo inyectado:** un disparador de prueba falla en la fila de auditoría → 500, sin sellado, entradas, auditoría ni divulgaciones nuevas. Después, la misma revisión sella.
- **Concurrencia:**
  - 4 peticiones simultáneas (DIRECTIVA y ADMINISTRADOR) producen 1 sellado, 1 entrada y 1 auditoría;
  - el doble toque devuelve `created: false`;
  - un `push` espera a un sellado en curso: el bloqueo se mantiene 1,5 s y el `push` termina después de liberarse.
- **Carrera CANCEL ↔ sellado**, en tres rondas:
  - antes → `SUPPRESSED_REVISION`;
  - después → `WITHDRAWN_AFTER_SEAL`;
  - concurrente → uno de los dos, nunca un estado intermedio ni la cifra.
- **Sync v1 tras el sellado:**
  - PUBLISH y SUPERSEDE → ACK exacto `REJECTED/CAMPAIGN_SEALED/MOVE_TO_TERMINAL_FAILURE`, con `serverAcceptedAt` y `reconciliationReference` nulos; el reenvío es idéntico y deja una sola fila de journal;
  - el replay anterior al sellado → `ALREADY_APPLIED` con su hora original;
  - el replay de un `CAMPAIGN_NOT_OPEN` anterior conserva ese código;
  - el resumen sellado no cambia.
- **CANCEL tras el sellado:** 6000 deja de aparecer en el JSON y el CSV del resumen, la propuesta y su CSV, y las tendencias y su CSV. El dato sellado y las divulgaciones no cambian.
- **Elegibilidad:** dar de baja a un aportante no mueve las cifras selladas, y el dado de baja no puede enviar (403). La limitación está declarada en el contrato §5.2.
- **`POLICY_PENDING`:** sin cifras en ningún canal; la referencia del sellado se conserva.
- **Lecturas sin escrituras:** resumen, CSV, estado del sellado, propuestas, tendencias y sus CSV. Una propuesta sin sellar tampoco escribe aunque la decisión crearía o retiraría una cifra (`SUPERSEDED` o `WITHDRAWN`, sin valor).
- **Base de datos:** rechaza modificar o borrar el sellado y sus entradas, añadir entradas posteriores, crear o retirar divulgaciones de una campaña sellada, reabrirla y sellar una campaña abierta.
- **Migración desde la base previa:** se despliegan todas las migraciones menos la nueva, se siembran filas con la memoria de divulgación y se despliega la nueva. Las filas quedan idénticas y las nuevas guardas se aplican a los datos antiguos.

**Mutaciones** (script en el scratchpad de la sesión; cada una se revirtió con `git checkout`; `git status` limpio al terminar). Todas hacen fallar la suite:

| # | Mutación | Pruebas que fallan |
|---|---|---|
| M1 | `push` sin el bloqueo compartido | 2 (espera del push, carrera) |
| M2 | Leer propuestas con la decisión que escribe | 7 |
| M3 | CANCEL sin retirar la visibilidad | 4 |
| M4 | El resumen recalcula una campaña sellada | 6 |
| M5 | Sin comprobar `review_ref` | 4 |
| M6 | `CAMPAIGN_NOT_OPEN` en lugar de `CAMPAIGN_SEALED` | 1 |
| M8 | La confirmación se comprueba después de la respuesta idempotente | 4 |

M7 (umbral vigente) se descartó porque no discrimina con k = 3 en todos los escenarios. Esa regla la cubre la prueba unitaria `domain/seal.spec.ts`.

## 4. Otras pruebas

- **Unitarias del dominio** (`seal.spec.ts`, `collective-config.spec.ts` y las existentes de la política y la propuesta): 47/47 PASS sobre `943f578`.
- **Web**, sobre el árbol de `77b9bc2`:
  - `npx vitest run` → 10 archivos, 88/88 PASS;
  - `npx tsc -b` sin errores;
  - `npx eslint src` → 0 errores y 2 avisos anteriores (contextos).
  - Una prueba encontró un defecto real, corregido antes del commit: tras un 409 de revisión obsoleta, el panel borraba su propio mensaje al recargar la revisión.
- **OpenAPI, sobre `15e1b72`** (2026-10-24, con una base local desechable): `npm run openapi:check` PASS (los snapshots coinciden y las aserciones F02, F05, F06 y F08 pasan).
- **CI de GitHub:** PASS sobre `4a060cc` (§2.1) y sobre `73f4c82`, el código actual (§2.2).

## 5. Revisiones técnicas entre sesiones

- **A, sobre `de94e83`:** LISTO para `sync-v1`, con O1–O5, aplicadas en `5b1dfa0`.
- **C, sobre `de94e83`:** LISTO CON CONDICIONES, 4 importantes y 6 menores, aplicadas en `f42d994`.

No son revisiones del tutor ni aprobaciones institucionales.

## 6. Límites y condiciones que se declaran

- **Habilitación:** `COLLECTIVE_SEALING=enabled` sólo con la compilación Mobile que trate `CAMPAIGN_SEALED` como fallo terminal, comprobada en DEVICE. La hace la sesión A. Hasta entonces, la bandera está apagada.
- **Baja tras el sellado:** el aporte de un agricultor dado de baja sigue en las cifras selladas visibles, sin vía de retirada. Depende de la respuesta 2(f) de la hoja institucional.
- **Copias del Central:** no hay un procedimiento de copia y restauración del Central. Una restauración anterior a un sellado olvidaría cifras ya conocidas; su tratamiento queda pendiente.
- **Alcance:** nada de esto aprueba F07-POL-01, ni habilita datos reales, ni cambia #107 o GATE-F07. El modo por defecto sigue siendo `POLICY_PENDING`.

## 7. Recorrido de integración Web↔Backend (2026-10-24, de 22:31:28Z a 22:35:53Z)

Es una comprobación **funcional**: la Web compilada contra la API real y una base PostgreSQL. No participan personas, no mide la experiencia de uso y no es una validación institucional.

### 7.1 Qué se ejecutó y con qué

- **Código:** Backend y Web del árbol `b31bd8b` (#162). Su último cambio de código (`Back/src`, `Back/prisma`, `Web/src`) es `73f4c82`. Se compilaron desde ese árbol: `nest build` y `tsc -b && vite build`.
- **Herramienta:** `tool/f07_web_seal/run-seal-walk.sh` y `walk-seal.mjs`, añadidas en este mismo commit.
  - Se ejecutaron desde el árbol de trabajo con el contenido que se commitea (SHA-256 `5abf1293…bfd4dc` de `walk-seal.mjs` y `583aeba5…e67a58` de `run-seal-walk.sh`).
  - Parten de `tool/f07_web_01` y de la semilla `Back/scripts/f07-synthetic-seed.cjs`.
- **Entorno aislado:**
  - contenedor desechable propio `agro_b_f07seal_pg` (PostgreSQL 16.13, `127.0.0.1:55471`, sólo local), con una base nueva por ejecución;
  - API en `localhost:3124` y `vite preview` en `localhost:4177`;
  - variables `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` y `COLLECTIVE_SEALING=enabled`, sólo en ese proceso. La bandera sigue apagada por defecto (§0.d).
- **Datos:** el dataset sintético D4 se publica por la API real (`POST /sync/v1/push`). Hay dos campañas, C1 y C2; DIRECTIVA, ADMINISTRADOR y cuatro AGRICULTORES en un tenant; y una DIRECTIVA de otro tenant. Las credenciales se generan en el proceso y no se escriben en ningún archivo.
- **Versiones:**
  - node v25.9.0, npm 11.12.1;
  - Docker 29.4.0;
  - Chrome 156.0.8078.47 headless;
  - puppeteer-core 25.12.0 (en `tool/f10_eval_web`, fuera de las dependencias de la aplicación).
- **Salida:** `docs/evidence/f07_sellado_web/`, con `env.txt`, `walk.json` (48 comprobaciones), 12 capturas y el CSV descargado desde la Web. Los UUID sintéticos se enmascaran en `walk.json`; el CSV se conserva tal como lo descargó la Web. La semilla y los registros quedaron en una carpeta temporal que no se publica y que se borró al terminar.
- **Memoria:** 4,0 GB libres al recibir el turno y 11,3 GB al compilar, tras reiniciarse el servidor Dart. No hubo interrupciones.

### 7.2 Resultados (ejecución final, 48/48 PASS)

| # | Recorrido | Qué se comprobó (Web y API reales) | Resultado |
|---|---|---|---|
| R1 | Permisos por rol | DIRECTIVA y ADMINISTRADOR ven «Resumen colectivo» y «Tendencias», y entran. AGRICULTOR no tiene enlaces colectivos: `/colectivo/tendencias` y `/colectivo/resumen` lo llevan a «Esta Web es para la Directiva y el Administrador». En la API, AGRICULTOR recibe 403 en tendencias y en el estado del sellado, y también al sellar. Una DIRECTIVA de otro tenant recibe 404 | PASS 11/11 |
| R2 | Sellado manual desde la UI | Con C1 abierta no se puede sellar (`CAMPAIGN_NOT_CLOSED`) y el panel no lo ofrece. Con C1 cerrada (preparación por la API), la DIRECTIVA abre la revisión. «Sellar» sigue deshabilitado hasta marcar la confirmación. El POST de la UI devuelve `SEALED`, `created: true`. El resumen pasa a «Versión 1 · sellada el…» y «Cobertura al sellar», sin panel. En la base queda 1 sellado con umbral 3 y ninguna entrada retirada | PASS 9/9 |
| R3 | Segundo sellado | El ADMINISTRADOR repite el POST con la misma revisión y obtiene `created: false`; sin confirmación recibe 422, nunca un éxito. Sigue habiendo un solo sellado y el snapshot es idéntico. En la UI, la campaña sellada no ofrece sellar otra vez | PASS 4/4 |
| R4 | Tendencias, k = 3 y CSV | C1 aparece con su versión sellada y C2 como «Sin sellar: no aporta cifras». Glifosato F06 en C1: `DISCLOSED`, 8250 mL y 3 aportantes. Belator en C1, con 2 aportantes: `SUPPRESSED_UNDER_THRESHOLD`, sin total ni aportantes, y la fila de la UI sólo explica la regla. En C2, `NOT_SEALED` sin cifra. El CSV descargado desde la UI trae 8250 para Glifosato y la celda de Belator suprimida, sin sus cantidades | PASS 12/12 |
| R5 | Inmutabilidad del snapshot | **Recarga:** el resumen (API y texto de la página) y el snapshot en la base no cambian. **Después del sellado:** un PUBLISH nuevo de F1 en C1 recibe `REJECTED` / `CAMPAIGN_SEALED`; un CANCEL de F1 (Glifosato F06) es `APPLIED`. **Tras el CANCEL:** sellado, entradas y divulgaciones referenciadas siguen idénticos en la base. Sólo esa entrada recibe `visibilityWithdrawnAt`. La tendencia pasa a `WITHDRAWN_AFTER_SEAL` sin cifra («Retirado tras sellar» en la UI), 8250 deja de aparecer en el resumen y la referencia del sellado no cambia | PASS 12/12 |

### 7.3 Ejecuciones anteriores de la misma sesión

Antes de la final hubo seis ejecuciones con fallos. **Todos eran de la herramienta**, no de la aplicación, y se corrigieron en la herramienta. No se cambió ningún archivo de `Back/` ni de `Web/`.

| Ejecución | Fallo | Causa | Corrección |
|---|---|---|---|
| 1 | Sin resultados | `MSYS_NO_PATHCONV` dejó una ruta `/tmp` que node no encuentra | La carpeta temporal se pasa con una ruta de Windows |
| 2 | Puerto 4177 ocupado | La ejecución 1 dejó su `vite preview` | Se detuvo ese proceso propio |
| 3 | R2–R5 | El clic buscaba «Sellar» por contenido y pulsaba antes «Sellar esta versión…». Además, la sesión que quedaba abierta tras el error rompía los pasos siguientes | Coincidencia exacta del texto; `login` cierra una sesión previa |
| 4 | 3 comprobaciones | Errores del oráculo: «COBERTURA AL SELLAR» sale en mayúsculas por CSS, y la fila suprimida contiene «Menos de 3» y el año de la campaña. Además, la recarga esperaba `networkidle0` | Comprobación sin distinguir mayúsculas y comprobación por celdas: total sin otra cifra y aportantes y fecha «—» |
| 5 | R5 | 429 del login, limitado a 5 por minuto (`@Throttle`): es un control correcto | El login espera y reintenta ante un 429 |
| 6 | R5, texto tras recargar | El script elegía C1 antes de que la página fijara su campaña por defecto, así que se comparaba el resumen de C2 | Se elige la campaña hasta que el selector la mantiene, y se comprueba aparte |

La ejecución 7 dio 48/48. La final (8), que se publica, repitió 48/48 tras enmascarar los UUID de los detalles.

### 7.4 Lo que se reutiliza sin repetir, y por qué

El recorrido no repite lo que ya tiene evidencia suficiente sobre el **mismo código**:
- **Suite del sellado `f07-collective-seal`, 20/20** en la CI de `73f4c82` (run `40097400361`, §2.2), contra PostgreSQL:
  - el sellado y sus roles: confirmación, revisión obsoleta, bandera, `POLICY_PENDING`, fallo inyectado sin efecto parcial y concurrencia;
  - la carrera entre CANCEL y sellado;
  - las guardas de la base: modificar, borrar o reabrir;
  - que las lecturas no escriban;
  - la baja de un aportante;
  - y la migración.

  Son garantías del servidor que la Web no puede debilitar, y una nueva ejecución por la UI no añade cobertura.
- **Vitest 88/88** en el mismo run: los mensajes 409 del panel de sellado, las tendencias con celdas suprimidas o retiradas sin cero y la guarda de rutas por rol, con la API simulada.

El recorrido añade lo que ninguna de las dos cubre: la **integración real** entre la Web compilada y la API, con login por rol, el sellado desde la UI, la descarga del CSV y el efecto de un CANCEL real sobre lo que muestra la Web.

### 7.5 Límites y observaciones

- **Alcance:** un único escenario sintético (D4) y un solo navegador (Chrome headless, 1366×900). No se probaron móvil, accesibilidad ni otros navegadores.
- **Preparación por la API:** el cierre de C1 se hizo por la API, fuera de lo que se evalúa.
- **Datos de F1:** el token Auth V2 de F1 para el CANCEL y el PUBLISH se creó como lo hace la semilla, no desde la app Mobile.
- **Observación (sin cambio):** las etiquetas del eje del gráfico de tendencias salen recortadas con nombres de campaña largos («aña Inviern…», captura `r5-tendencias-tras-cancel.png`). Es visual: la tabla de cada serie muestra el nombre completo.
- **Observación (sin cambio):** la cabecera muestra la campaña activa global («Campaña Invierno 2026») aunque el resumen sea de C1. Viene de antes de F07 y está fuera de este alcance.
- **Sin defectos bloqueantes:** no se cambió código de la aplicación, así que no hizo falta revisión de código ni repetir checks.
- **Desmontaje:**
  - API y `vite preview` detenidos, con los puertos 3124 y 4177 libres;
  - las 8 bases `f07seal_web_*` borradas;
  - el contenedor `agro_b_f07seal_pg` detenido;
  - las carpetas temporales propias borradas.
