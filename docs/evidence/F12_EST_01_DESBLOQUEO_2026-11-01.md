# F12-EST-01 (#174): cobertura de consumo de los sellados nuevos y desbloqueo del contrato INT-09 — evidencia

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-02, de las 01:50Z a las 03:00Z (UTC); noche del 2026-11-01 en Bolivia |
| Base | Backend `origin/main` `b81ff23` (sin cambios); rama `feat/f12-est-01-contrato-int09` sobre `b97b0ae` |
| Código verificado | `cd23ab1` |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200, Node 25.9.0, Prisma 6.19.3. PostgreSQL 16.13 **desechable** en Docker (`agro_f12_est01c_pg`, 127.0.0.1:55498, con `--rm`), solo con datos sintéticos. Secretos JWT efímeros, nunca escritos |
| Issue | Refs #174; trabajo vinculado a #175, #176 y #178 (contrato §11.4) y a GOV-02 #185. Ninguno se cierra |
| Decisiones | EST-D-09 (cobertura), 11, 14, 15, 16 y F06, del autor (contrato §11.1) |
| Documento | `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`: no se modifica |

## 1. Qué cambia y en qué estado

| Pieza | Cambio | Estado |
|---|---|---|
| F07: caso de uso del sellado, `consumption-coverage.ts` y migración `20261102020000_f07_seal_consumption_coverage` | Cobertura de participación del consumo de cada sellado **nuevo**, en su transacción e inmutable; un disparador diferido la exige | **Implementado** y probado contra PostgreSQL |
| F07 §5.3, F06 §1 y ADR-004 | Definición de la cobertura; exclusión de pronóstico de F06 acotada | Documento |
| Migración F12 `20261101233651_f12_est_01_estimation` | Versiones de clasificación con corrección motivada, citadas por puntos y ejecuciones; evidencia de parada verificable; `maxAttempts` fijo; `RETRIES_EXHAUSTED` | **Construida**. Se reescribió en el mismo archivo, que no está en `main` y solo se aplicó en bases desechables y en la CI de #187, que crea bases nuevas |
| Contrato F12 y OpenAPI (10 rutas, 41 esquemas) | Correcciones, cobertura `IDENTIFIED` o `UNKNOWN`, paradas, reintentos y retención | **Especificado, no implementado** |
| `synthetic-sources.ts` | Fuentes sintéticas selladas antes de la cobertura (desconocida) y después (conocida o `POPULATION_MISMATCH`) | Apoyo de pruebas |
| Motor SES/naive, rutas, trabajador y clientes | — | **No construidos** |

**Ningún rechazo HTTP está probado.** Las correcciones por HTTP, las paradas que decide el trabajador y los reintentos están **solo especificados**. La base prueba sus invariantes.

## 2. Definición de cobertura adoptada

**Comprobación previa de la población, en el código F07.**
- **`SHOW_PRIOR`:** en `decideCell` y `decideCellWithRelated` solo se da si **ningún** Member de la cifra anterior ha salido de la celda actual. Los Members actuales vienen de `eligible()`: `AGRICULTOR` activos, con cuenta activa, con el mismo filtro que `linkedMembers()`. Por tanto, los Members de una cifra mostrada están en M. La advertencia anterior del contrato era incorrecta y se corrigió.
- **Lecturas en `READ COMMITTED`:** el sellado lee así, de modo que una baja entre dos lecturas podría romper la inclusión. Ese caso se guarda como `POPULATION_MISMATCH`, sin fracción.

**Definición** (F07 §5.3 y contrato F12 §3.1):
- **M:** Members `AGRICULTOR` activos, con cuenta activa, del sindicato, leídos en la decisión del sellado. Es igual a `CollectiveSeal.linkedMembers`, y la base lo exige.
- **N:** Members distintos con un aporte dentro de alguna cifra de `CONSUMPTION_TOTAL` **mostrada** por esa decisión:
  - una nueva (`RELEASE`), con los Members actuales de la celda;
  - o una anterior que se sigue mostrando (`SHOW_PRIOR`), con los Members de esa divulgación.
- **No cuentan** las necesidades ni los aportantes de celdas sin cifra.
- **Estado:** `IDENTIFIED`, con 0 ≤ N ≤ M, o `POPULATION_MISMATCH`, sin fracción.

**Acredita** cuántos agricultores vinculados al sellar forman parte de alguna cifra de consumo publicada de esa campaña. Es **participación**.

**No acredita:**
- que esos N hayan registrado todo su consumo, porque no mide **integridad**;
- nada sobre el consumo de los M − N, que es desconocido, nunca cero;
- ningún umbral: no se introduce ningún porcentaje mínimo.

**Sustitutos descartados:** la cobertura general (necesidad y consumo), los aportantes de una fila y la membresía actual.

**Sellados anteriores:** sin fila, cobertura desconocida (`SEALED_BEFORE_COVERAGE`). No se reconstruyen.

**Salida nueva declarada.** La N de consumo se entregará en el perfil institucional de F12. Junto con la N general, deja saber cuántos Members están solo en cifras de necesidad. Queda declarada para revisarla con F07-POL-01 y F10-SEC-02 antes de usar datos reales.

## 3. Verificación

**Pasos de `backend-f02.yml` y `web.yml`**, contra bases recién migradas:

```text
npx prisma validate / generate / npm run build                          → exit 0
npm test -- --runInBand    → 423 passed, 311 skipped, 734 total (incluye consumption-coverage.spec.ts, 3)
npx prisma migrate deploy (bases vacías)                               → 15 migraciones, exit 0
npx prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code → «No difference detected.»
npm run openapi:check  → exit 0; «openapi-f12-estimation: 10 rutas, 41 esquemas, 41 referenciados; etapa SPECIFIED_NOT_IMPLEMENTED: especificado, no implementado»
npx eslint (archivos tocados)                                          → exit 0
auth-v2 12 · current-auth-context 25 · f02-final-integration 3
sync-v1-journal 30 (15 migraciones) · sync-v1-adversarial 41 · sync-v1-references 7
f06-coll-05 16 · product-reconciliation 5 · backups 68
f10-sec-02-legacy-boundary 29 · f81-phase6-legacy-writes 7 · f10-sec-02-disclosure-gaps 2
f07-web-proposal 12 · f07-acceptance 6 · f07-collective-seal 22 · f12-est-01-estimation-schema 13
                                                                        → todas «passed», ninguna fallida
```

**Pruebas nuevas, con datos sintéticos:**

| Suite | Qué demuestra |
|---|---|
| `f07-collective-seal`: sellado de CA | El sellado real, por la API, guarda la cobertura de consumo con el mismo M (7) y N = 4 |
| `f07-collective-seal`: escenario de cobertura | Necesidad (G4–G6) y consumo (G1–G3, y G4, G5 y G7 en Urea) de agricultores distintos:<ul><li>la cifra de Herbicida sigue en `SHOW_PRIOR` aunque G1 cambia y G8 se une;</li><li>G7 se desactiva y la cifra de Urea se retira y se rotula `SUPPRESSED_UNDER_THRESHOLD`.</li></ul>La cobertura general da 6 y la de consumo 3: G8 aportó pero no está en ninguna cifra mostrada. La base rechaza un sellado nuevo sin cobertura y cualquier cambio de ella |
| `f07-collective-seal`: migración desde la base previa | Un sellado anterior queda igual y sin cobertura, y no se le puede añadir. La base rechaza:<ul><li>M distinto del del sellado;</li><li>N > M;</li><li>una fracción en `POPULATION_MISMATCH`;</li><li>un sellado nuevo sin cobertura.</li></ul>Acepta `IDENTIFIED` y `POPULATION_MISMATCH` |
| `f12-est-01`: corrección de clasificaciones (EST-D-14) | Se rechazan:<ul><li>una corrección sin motivo, que no cambia la temporada, de otra campaña o con salto de versión;</li><li>una segunda corrección de la misma versión.</li></ul>La serie y la ejecución anteriores conservan la versión 1. Una serie o ejecución nueva debe citar la vigente y su temporada. Al dejar la campaña sin clasificar, deja de servir. El historial guarda las tres versiones con su motivo |
| `f12-est-01`: paradas y reintentos (EST-D-15 y 16) | `NOT_EXECUTED` exige evidencia, y la base rechaza un permiso o una campaña que siguen válidos. `maxAttempts` no se puede cambiar y los intentos no lo superan. `RETRIES_EXHAUSTED` solo con los intentos agotados. `ATTEMPTS_EXHAUSTED` y `SOURCES_UNAVAILABLE` ya no existen |
| `f12-est-01`: fuentes sintéticas (EST-D-09) | Los puntos de sellados anteriores leen una cobertura nula (desconocida); los de sellados nuevos, `IDENTIFIED` 3 de 5. Una fuente `POPULATION_MISMATCH` no lleva fracción |

**Las pruebas fallan de verdad.** Cada protección se retiró por separado y se restauró después. Todas las retiradas hacen fallar al menos una prueba (`exit=1`):
- **Migración F12, 16 de 16:**
  - sellado obligatorio;
  - versión vigente en puntos y en ejecuciones;
  - vigente sin sucesora;
  - corrección que no cambia la temporada;
  - las dos paradas verificables;
  - `RETRIES_EXHAUSTED`;
  - `maxAttempts` modificable;
  - intentos por encima del máximo;
  - dato oculto;
  - ausencia sin sellado;
  - transiciones;
  - ejecución sin trabajo;
  - cuenta activa;
  - trabajo con ejecución que pasa a `NOT_EXECUTED`.
- **Migración F07, 5 de 5:**
  - sellado sin cobertura (disparador diferido);
  - escritura fuera de la transacción;
  - M distinto;
  - N > M;
  - cobertura modificable.
- **Especificación y esquema, 30 de 30.** Entre ellas:
  - cobertura con porcentaje, solo `UNKNOWN` o que dice medir integridad;
  - resultado sin desglose por campaña;
  - corrección sin motivo y sin ruta de corrección;
  - trabajo sin evidencia de parada;
  - retención perpetua declarada;
  - columna de cobertura en `SeriesPoint`.

## 4. Revisión

Otro agente de esta sesión hizo una lectura de contraste **antes del commit**. No es una revisión independiente.

**Confirmó:**
- la afirmación sobre `SHOW_PRIOR`;
- que la API y `review_ref` de F07 no cambian;
- las guardas de cobertura;
- el versionado de clasificaciones.

**Encontró un bloqueante**, corregido en `cd23ab1` con prueba y alteración propias: `maxAttempts` se podía modificar.

**Menores corregidos:**
- las claves de `stop_evidence`, iguales en la API y en la base;
- el límite de 200 fuera de `maxItems`;
- la frase sobre `contributors` en F07 §5.3;
- la N sintética coherente con su cifra;
- una fuente `POPULATION_MISMATCH` en la suite;
- el escenario con un Member que se une sin cambiar N;
- las fechas «(UTC)»;
- la salida nueva y la revisión sin la cobertura de consumo, declaradas.

**Declarados en el contrato §11.2 y §11.3:**
- EST-D-06, ya aplicada provisionalmente en la base, con la campaña que se cierra durante el cálculo;
- que la base no comprueba el vencimiento del plazo antes de otro intento;
- que `POPULATION_MISMATCH` solo se prueba con la función y con inserciones directas, no con la carrera real.

## 5. Límites

- Solo HOST, con datos sintéticos; ningún dato real.
- **Lo que no está implementado:** el motor, las rutas, el trabajador y los clientes (contrato §12).
- **Ninguna campaña ya sellada podrá estimarse:** su cobertura de consumo es desconocida y no se reconstruye. El primer resultado real exige tres campañas consecutivas selladas después de la migración.
- La base PostgreSQL es desechable y se elimina al terminar.

## 6. Ajuste EST-D-06 (decisión del autor, 2026-11-02 UTC), sobre `97a95c0`

**Qué cambia:**
- `estimation_job_insert_guard` exige una campaña objetivo `PLANIFICADA` o `ABIERTA` al crear el trabajo.
- Antes de calcular, la cubre la parada verificable `TARGET_CAMPAIGN_NOT_ELIGIBLE`, que ya existía.
- La ejecución no exige el estado: si la campaña se cierra después de empezar, se completa y se conserva.
- El contrato registra la decisión en §4.2, §6.3 y §11.1.
- La migración F12 no está integrada todavía, así que el cambio va en el mismo archivo.

**Resultados:**

```text
npx prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code → «No difference detected.»
node scripts/openapi-f12-estimation.cjs → «openapi-f12-estimation: 10 rutas, 41 esquemas, 41 referenciados; etapa SPECIFIED_NOT_IMPLEMENTED: especificado, no implementado»
F12_EST_PG_TEST_URL=<desechable> npx jest src/modules/estimation → «Tests: 13 passed, 13 total»
```

**Pruebas añadidas:**
- un trabajo para una campaña CERRADA y clasificada se rechaza («no es admisible»);
- una ejecución cuya campaña objetivo se cierra después de empezar se registra.

**Alteración:** retirar la comprobación del estado al crear el trabajo hace fallar la suite (`1 failed, 12 passed`).

**Entorno:** PostgreSQL 16.13 desechable `agro_f12_est01d_pg`, con datos sintéticos.

