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

## 1. Qué SHA se probó

| SHA | Qué contiene | Qué se ejecutó sobre él |
|---|---|---|
| `8ad60cb` | Código Backend del sellado completo y suite nueva | Suite `f07-collective-seal` y mutaciones (§3) |
| `77b9bc2` | Más la Web y la línea de CI | Batería Backend (§2) y Vitest de la Web |
| `2f4c24f` | Más dos pruebas existentes corregidas (sólo archivos `*.spec.ts`) | Nada (§2, FAIL corregidos) |
| `15e1b72` | Más los snapshots OpenAPI y sus aserciones | `npm run openapi:check` |

Entre `8ad60cb` y `15e1b72`, `git diff -- Back/src Back/prisma` sólo cambia las dos pruebas de `2f4c24f`. El código de la aplicación es el mismo.

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

**Pendiente:** ejecutar `sync-v1-journal`, `f06-coll-05`, `f07-collective-seal` y `product-reconciliation` sobre el HEAD. Se puede hacer en local cuando haya memoria, o con la CI del PR draft (`backend-f02.yml` ejecuta las de Sync v1 y F06; `web.yml` ejecuta las de F07, incluida la del sellado).

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
- **CI de GitHub:** **NOT_RUN** (la rama no está publicada).

## 5. Revisiones técnicas entre sesiones

- **A, sobre `de94e83`:** LISTO para `sync-v1`, con O1–O5, aplicadas en `5b1dfa0`.
- **C, sobre `de94e83`:** LISTO CON CONDICIONES, 4 importantes y 6 menores, aplicadas en `f42d994`.

No son revisiones del tutor ni aprobaciones institucionales.

## 6. Límites y condiciones que se declaran

- **Habilitación:** `COLLECTIVE_SEALING=enabled` sólo con la compilación Mobile que trate `CAMPAIGN_SEALED` como fallo terminal, comprobada en DEVICE. La hace la sesión A. Hasta entonces, la bandera está apagada.
- **Baja tras el sellado:** el aporte de un agricultor dado de baja sigue en las cifras selladas visibles, sin vía de retirada. Depende de la respuesta 2(f) de la hoja institucional.
- **Copias del Central:** no hay un procedimiento de copia y restauración del Central. Una restauración anterior a un sellado olvidaría cifras ya conocidas; su tratamiento queda pendiente.
- **Alcance:** nada de esto aprueba F07-POL-01, ni habilita datos reales, ni cambia #107 o GATE-F07. El modo por defecto sigue siendo `POLICY_PENDING`.
