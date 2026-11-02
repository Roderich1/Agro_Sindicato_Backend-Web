# F12-EST-09 (#182): evaluación sintética de la estimación con origen móvil — evidencia

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-02, de las 16:55Z a las 17:30Z (UTC) |
| Base | `main` `b68eca0`, tras integrar #190, #191 y #192 con la CI de `main` en verde |
| Rama | `feat/f12-est-09-evaluacion` |
| Definición fijada antes de medir | `32cef61`, publicado a las 17:00:33Z. Contiene el protocolo, el generador, `generar-conjuntos.cjs` y `conjuntos.json`, **sin** código de evaluación ni resultados |
| Evaluación | Código, prueba, guion y resultados, en los commits siguientes de la misma rama (ver el PR) |
| Motor | El integrado en `main`, **sin modificar**: `assessSpan` (`domain/series.ts`) y `estimateSesNaive` (`domain/ses-naive.ts`, `F12-EST-04/1`) |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200, Node 25.9.0. La evaluación es pura: no usa base de datos ni red. La suite PostgreSQL de F12-EST-05 corrió contra PostgreSQL 16.13 desechable (`agro_f12_est06c_pg`, `--rm`) |
| Issue | Refs #182. **No se cierra** |
| Protocolo | [`docs/evaluation/F12_EST_09_PROTOCOLO_EVALUACION.md`](../evaluation/F12_EST_09_PROTOCOLO_EVALUACION.md), según 3.13.3, 3.12.4.8 y 3.15.9 del documento v1.22.1, que no se modifica |

**«Origen móvil» se usa en sentido estadístico.** En cada origen se ajusta con las campañas disponibles hasta él y se evalúa sobre la siguiente, que queda reservada. No se ejecuta nada en un teléfono.

## 1. Cómo reproducirlo

Desde `Back/`, con `npm ci` hecho:

```text
node ../docs/evidence/f12_est_09/generar-conjuntos.cjs <conjuntos.json>
node ../docs/evidence/f12_est_09/evaluar.cjs <resultados.json> <resultados.md>
npx jest src/modules/estimation/test-support/evaluation
```

- `evaluar.cjs` regenera los conjuntos y se detiene si no coinciden con `conjuntos.json`.
- La prueba compara los conjuntos y los resultados con los archivos versionados.

**Reproducibilidad comprobada:**

| Archivo | SHA-256 (fin de línea LF, como se guarda en git) | Dos procesos |
|---|---|---|
| `conjuntos.json` | `2981122392202c65bf4cfba3700c3da9da555ea9d84b1c6e3d13cbb6d7ff9c39` | Idénticos |
| `resultados.json` | `08882637e288e5015305ae7cefcbe1f871ff8cb235ff90540a5aaa82b428e40d` | Idénticos |
| `resultados.md` | `25113e6654c2bc50a14526d4ddb894c35fe65f9d02c63928b8989d4dcb13b270` | Idénticos |

**Aritmética:** solo entera (SplitMix64 sobre BigInt, motor con racionales exactos y métricas con racionales exactos). No depende de la plataforma.

## 2. Resultados por conjunto

**Cómo leer la tabla:**
- Cantidades en la unidad base de cada conjunto, sin mezclar unidades ni conjuntos.
- MAE con 6 decimales, y entre paréntesis en L o KG. WAPE como proporción y porcentaje.
- Los dos métodos se miden **sobre los mismos orígenes**.

| Conjunto | Unidad | Orígenes evaluados / no estimables | MAE SES | MAE naive | WAPE SES | WAPE naive | Menor MAE |
|---|---|---|---|---|---|---|---|
| S1 Nivel estable | mL | 7 / 0 | 6843.427737 (6.843427737 L) | 8398.857143 (8.398857143 L) | 0.068644 (6.8644 %) | 0.084245 (8.4245 %) | **SES** |
| S2 Cambio de nivel | mL | 7 / 0 | 16498.142857 (16.498142857 L) | 9521.000000 (9.521 L) | 0.135205 (13.5205 %) | 0.078026 (7.8026 %) | **naive** |
| S3 Tendencia | g | 7 / 0 | 6587.866000 (6.587866 KG) | 6437.714286 (6.437714286 KG) | 0.079809 (7.9809 %) | 0.077990 (7.7990 %) | **naive** |
| S4 Paseo aleatorio | mL | 7 / 0 | 12708.142857 (12.708142857 L) | 10458.857143 (10.458857143 L) | 0.190747 (19.0747 %) | 0.156985 (15.6985 %) | **naive** |
| S5 Hueco, dato oculto y cero | mL | 4 / 3 | 22354.421875 (22.354421875 L) | 35208.500000 (35.2085 L) | 0.465165 (46.5165 %) | 0.732640 (73.2640 %) | **SES** |
| S6 Insuficiente | g | 0 / 3 | SIN ORÍGENES EVALUABLES | SIN ORÍGENES EVALUABLES | SIN ORÍGENES EVALUABLES | SIN ORÍGENES EVALUABLES | — |

- **Conjuntos donde el SES no supera al naive.** En S2, S3 y S4 el MAE del naive es menor. Se presentan como **resultados válidos**:
  - no se cambió ninguna semilla;
  - no se descartó ningún conjunto;
  - no hay umbral de mejora (3.13.3).
- **Empates por origen.** Cuando el motor elige α = 1, el SES reproduce el naive y el error es el mismo:
  - S2: 6 de 7 orígenes;
  - S3: 5 de 7;
  - S4: 6 de 7;
  - S1: 1 de 7.
- **WAPE con denominador cero.** En S1–S6 ningún denominador es cero, así que «NO DEFINIDO» no aparece en estos resultados. La regla se comprueba con un caso de control en la prueba, que no es un conjunto del protocolo.
- **Campaña siguiente** (sin valor reservado; no entra en las métricas):
  - S1 a S5 dan una estimación (en `resultados.md`);
  - **S6 termina en «datos insuficientes»** (`LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED`).

## 3. Resultados por origen

[`f12_est_09/resultados.md`](f12_est_09/resultados.md) tiene una tabla por conjunto. Cada origen da:
- su estado: evaluado, no estimable con su motivo, o no evaluable;
- la lectura del motor;
- **lo que el motor usó para ajustar** (posiciones y valores del tramo);
- α, SES, naive, el valor reservado y los dos errores absolutos.

[`f12_est_09/resultados.json`](f12_est_09/resultados.json) lo contiene completo, con las exclusiones de cada origen.

**Ejemplo (S1, origen 5):**
- ajuste con las posiciones 1–5 (92599, 92947, 107785, 103424 y 90615 mL);
- α 0.20, SES 95913.643200 mL y naive 90615 mL;
- reservado 109750 mL;
- errores 13836.356800 y 19135.

## 4. Huecos, datos ocultos, ceros e insuficiencia

**S5** (posición 2 sin registro, 3 oculta y 8 con cero comprobado):
- En el origen 3, el motor responde «datos insuficientes» (`LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED`), porque la última campaña pertinente es la oculta. Excluye la 1 por estar antes del hueco (`BEFORE_GAP`) y la 2 y la 3 con su motivo.
- En los orígenes 4 y 5, «datos insuficientes» (`SPAN_TOO_SHORT`).
- Estos tres orígenes **conservan su motivo y no tienen error**: no cuentan como error cero ni entran en el MAE.
- Desde el origen 6, el tramo empieza en la posición 4. Lo oculto **no se usa ni cuenta como cero**.
- El **cero comprobado** de la posición 8:
  - en el origen 7 es el valor reservado y se evalúa (error del SES 57098.6875; del naive, 63877);
  - en los orígenes 8 y 9 forma parte del ajuste como valor 0.

**S6** (solo dos campañas comprobadas):
- Los tres orígenes y la campaña siguiente terminan en «datos insuficientes».
- MAE y WAPE se informan como «SIN ORÍGENES EVALUABLES», **nunca 0**.

## 5. Sin filtración del período reservado

La prueba `rolling-origin.spec.ts` repite, en **cada origen de cada conjunto**, la lectura y el cálculo en tres casos:
1. con todas las campañas del conjunto;
2. solo con las campañas 1..t;
3. con los valores de las campañas t + 1…n alterados, la reservada incluida. Las ausencias y los ocultos de ese tramo pasan a ser cifras.

Los tres dan **resultados idénticos**: tramo, α, SES, naive y criterio. Además, toda posición desde la reservada queda excluida como `NOT_BEFORE_TARGET`.

## 6. Pruebas, alteraciones y suites relacionadas

```text
npx jest src/modules/estimation/test-support/evaluation
  → «Tests: 6 passed, 6 total»
F12_EST_PG_TEST_URL=<desechable> npx jest f12-est-05-runs.postgres.spec.ts insert-only.spec.ts validity.spec.ts --runInBand
  → «Test Suites: 3 passed», «Tests: 28 passed, 28 total»
```

- **Ejecuciones sin modificación y vigencia derivada** (3.13.3): no se repiten en esta evaluación. Son las garantías de F12-EST-05 (#178), y su suite se ejecutó sobre esta misma base, con 28/28.
- **Suite completa del backend** (`npx jest --runInBand`, sin bases de prueba): «Test Suites: 26 skipped, 48 passed», «Tests: 334 skipped, 464 passed, 798 total». Las omitidas son las suites de PostgreSQL, que necesitan su variable de entorno; la CI las ejecuta.
- **`tsc --noEmit` y ESLint** sobre `test-support/evaluation`: sin errores.

**Siete alteraciones**, una por caso y restauradas después. Cada una hace fallar alguna prueba de `rolling-origin.spec.ts`:
- el motor lee la campaña reservada (objetivo t + 2);
- WAPE 0 con denominador cero;
- el MAE dividido entre todos los orígenes, no solo los evaluados;
- lo oculto entra como consumo comprobado;
- un origen no estimable cuenta como error cero;
- otra semilla para S2;
- el error del SES calculado con el naive.

## 7. Límites de interpretación

- **Datos sintéticos.** Las reglas de S1–S6 se eligieron para el protocolo; **ningún dato procede del Sindicato**.
- **Lo que no se acredita:**
  - precisión con campañas reales;
  - ahorro o beneficio;
  - que el SES sea mejor o peor que el naive fuera de estas reglas (3.15.9).
- **Comparación descriptiva:** con 7 orígenes por conjunto (4 en S5) no hay prueba de significación ni intervalos.
- **Escala de los errores:** depende de la amplitud del ruido de cada regla, no de la variabilidad del consumo real.
- **α extremos:** el criterio de 3.12.4.8 elige α = 0 en algunos orígenes. Es el comportamiento del procedimiento fijado, **no un ajuste** de esta evaluación:
  - S4, origen 3, y S5, origen 6: tramos de tres campañas, en los que el criterio se basa en un solo error a un paso;
  - S2, origen 6: la última campaña del tramo trae el cambio de nivel;
  - S5, orígenes 8 y 9: el tramo incluye el cero comprobado.
- **No es la evaluación con usuarios** ni una validación de producción.
