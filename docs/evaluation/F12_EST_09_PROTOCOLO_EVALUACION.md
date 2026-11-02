# F12-EST-09 (#182): protocolo fijado de la evaluación sintética de la estimación

> **Versión `F12-EST-09/1`, fijada antes de medir.** Este documento, el generador (`Back/src/modules/estimation/test-support/evaluation/synthetic-sets.ts`) y los conjuntos generados (`docs/evidence/f12_est_09/conjuntos.json`) se versionan en un commit **anterior** a cualquier código de evaluación y a cualquier resultado. Los resultados no pueden cambiar semillas, reglas, orígenes ni conjuntos. Si hubiera que cambiar algo, se crearía una versión `/2` y la `/1` se conservaría con sus resultados.

**Huella de `conjuntos.json`:** SHA-256 `2981122392202c65bf4cfba3700c3da9da555ea9d84b1c6e3d13cbb6d7ff9c39`. Dos procesos distintos lo generan idéntico.

## 1. Fuente

- **Documento:** `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`, sin modificarlo, en tres apartados:
  - **3.13.3:** el protocolo de evaluación de la estimación (RNF-13) y los conjuntos S1–S6;
  - **3.12.4.8:** el procedimiento de cálculo;
  - **3.15.9:** el estado esperado.
- **Lo que el protocolo exige:**
  - aplicar sin variaciones el procedimiento de 3.12.4.8 con un **origen móvil**: α se selecciona solo con las campañas hasta cada origen, y la campaña siguiente se reserva para comparar SES y naive sobre los mismos orígenes;
  - informar por origen el α, las estimaciones, el valor reservado y los errores, y por conjunto el MAE y el WAPE, este último **no definido** cuando la suma observada es cero;
  - conjuntos con reglas declaradas y semilla fija, de seis a diez campañas, en la unidad base;
  - **sin umbral de mejora:** que el SES no supere al naive es un resultado válido.
- **«Origen móvil» es estadístico:** ajustar con el pasado disponible y evaluar la observación siguiente, que queda reservada. No tiene nada que ver con teléfonos.

## 2. Motor

- **Qué se usa:** el motor integrado en `main`, sin modificarlo: `assessSpan` (`domain/series.ts`, F12-EST-03) y `estimateSesNaive` (`domain/ses-naive.ts`, F12-EST-04, método `F12-EST-04/1`, EST-D-07).
- **Qué se excluye:** la evaluación no reimplementa el cálculo ni el tramo, y no usa la base de datos, el trabajador ni la API.

## 3. Conjuntos

**Fechas:** una campaña por año desde 2010, todas de la misma temporada.

**Cobertura:** identificada en todas, 3 de 5. La evaluación mide el cálculo; la regla de cobertura tiene sus propias pruebas.

**Generación:** SplitMix64 sobre BigInt, con muestreo por rechazo para U[a, b] entero. Cada posición extrae su valor aunque después se marque como ausencia u oculta, y el orden de extracción es el de las posiciones.

| Conjunto | Regla | Semilla | Campañas | Unidad base (presentación) | Posiciones no comprobadas |
|---|---|---|---|---|---|
| S1 Nivel estable | x_t = 100000 + U[−10000, 10000] | 1001 | 10 | mL (L) | — |
| S2 Cambio de nivel | x_t = 80000 + U[−6000, 6000] para t ≤ 5; 140000 + U[−6000, 6000] para t ≥ 6 | 1002 | 10 | mL (L) | — |
| S3 Tendencia | x_t = 40000 + 6000·t + U[−4000, 4000] | 1003 | 10 | g (KG) | — |
| S4 Paseo aleatorio | x_1 = 100000; x_t = max(0, x_(t−1) + U[−20000, 20000]) | 1004 | 10 | mL (L) | — |
| S5 Hueco, dato oculto y cero | x_t = 60000 + U[−8000, 8000] | 1005 | 10 | mL (L) | 2 sin registro; 3 oculta; 8 **cero comprobado** |
| S6 Insuficiente | x_t = 30000 + U[−3000, 3000] | 1006 | 6 | g (KG) | 1 y 4 sin registro; 3 y 6 ocultas: solo 2 y 5 comprobadas |

- **Qué entra al motor:** a una posición sin registro u oculta llega **sin valor**, como lo entregaría el servicio. El cero comprobado de S5 llega como `0`, que es un valor.
- **Qué falta en S1–S6:** ningún conjunto tiene ceros en todos sus valores reservados. El caso de WAPE no definido se comprueba con un **caso de control de la regla de informe** (§5), que no es un conjunto del protocolo y no aparece en los resultados.

## 4. Orígenes y lectura

- **Orígenes:** t = 3, …, n − 1. El 3 es el primero con el que se puede seleccionar α, y el último deja la campaña n reservada.
  - S1 a S5 tienen 7 orígenes cada uno (t = 3…9), y S6 tiene 3 (t = 3…5).
- **Lo que se pide en cada origen:** `assessSpan(todas las campañas del conjunto, objetivo = campaña t + 1)`. Si el tramo está listo, se llama a `estimateSesNaive`.
  - El motor excluye la campaña reservada y las posteriores por su fecha (`NOT_BEFORE_TARGET`).
  - Lo que el motor utiliza para ajustar es el tramo que devuelve: sus posiciones y sus valores.
- **Campaña siguiente:** además se pide la estimación de la campaña n + 1, sin valor reservado. Se informa pero no entra en las métricas; con ella S6 debe terminar en «datos insuficientes».
- **Clasificación de cada origen:**
  - **evaluado:** hay tramo listo y la campaña reservada tiene consumo comprobado (un cero cuenta);
  - **no estimable:** el motor responde «datos insuficientes» o «datos incompatibles». Se conserva su motivo y **no es un error de valor cero**;
  - **no evaluable:** hay estimación, pero la campaña reservada no tiene consumo comprobado (sin registro u oculta). La estimación se informa, sin error.

## 5. Errores y métricas, fijados antes de medir

- **Errores por origen evaluado:**
  - e_SES = |SES − reservado|, con el SES tal como lo entrega el motor (seis decimales, ROUND_HALF_UP, EST-D-07);
  - e_naive = |naive − reservado|.
- **Aritmética:** las sumas y cocientes son racionales exactos. Se redondean al final con ROUND_HALF_UP: MAE en unidad base con 6 decimales, y WAPE como proporción con 6 decimales y como porcentaje con 4.
- **Métricas por conjunto (cada conjunto tiene un solo producto y una sola unidad):**
  - **MAE** = Σe / k, con k el número de orígenes evaluados. Con k = 0: «SIN ORÍGENES EVALUABLES», nunca 0.
  - **WAPE** = Σe / Σ reservado sobre esos mismos k orígenes. Con Σ reservado = 0: «NO DEFINIDO», nunca 0.
  - SES y naive se miden sobre **los mismos** orígenes.
- **Comparación:** «SES menor», «empate» o «naive menor», con el MAE exacto. No hay umbral, y ningún resultado se descarta ni se repite con otra semilla.
- **Unidades:** no hay cifras que mezclen conjuntos ni unidades. Cada MAE se da en su unidad base y en L o KG.
- **Caso de control de la regla de informe (fuera de S1–S6):** una serie de cuatro ceros comprobados con un origen, para comprobar que con Σ reservado = 0 se informa «NO DEFINIDO». Solo está en las pruebas.

## 6. Comprobaciones

1. **Reproducibilidad:**
   - los conjuntos regenerados son idénticos a `conjuntos.json`;
   - dos ejecuciones en procesos distintos dan resultados idénticos (SHA-256);
   - una prueba compara los resultados con `resultados.json`.
2. **Sin filtración del período reservado:** en cada origen, el resultado es idéntico en tres casos:
   - con todas las campañas;
   - solo con las campañas 1..t;
   - con los valores de las campañas t + 1…n alterados (el reservado incluido).
3. **S6:** todos sus orígenes y la campaña siguiente terminan en «datos insuficientes».
4. **Huecos, ocultos y ceros (S5):**
   - lo anterior al hueco queda excluido con su motivo;
   - lo oculto no se usa ni cuenta como cero;
   - el cero comprobado se usa como valor.
5. **Ejecuciones sin modificación y vigencia derivada:** no se repiten aquí. Son las garantías de F12-EST-05 (#178), y su suite PostgreSQL se ejecuta sobre la misma base para dejar constancia.

## 7. Límites de interpretación

- Son series **sintéticas** con reglas elegidas para el protocolo; **no** proceden del Sindicato.
- Los resultados **no acreditan** precisión con campañas reales, ahorro ni beneficio (3.15.9).
- Con 7 orígenes por conjunto, la comparación entre SES y naive es **descriptiva**: no hay prueba de significación ni intervalos.
- El tamaño de los errores depende de la amplitud de ruido que fija cada regla. No describe la variabilidad del consumo real.
