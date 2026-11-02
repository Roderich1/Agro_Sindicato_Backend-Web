# F12-EST-09: resultados por origen y por conjunto

Evaluación `F12-EST-09/1`, conjuntos `F12-EST-09/1`, método `F12-EST-04/1`. Cantidades en la unidad base (mL o g); MAE con 6 decimales y también en L o KG; WAPE como proporción y porcentaje. Datos sintéticos: no acreditan precisión real.

## Por conjunto

| Conjunto | Unidad | Orígenes evaluados / no estimables / no evaluables | MAE SES | MAE naive | WAPE SES | WAPE naive | Comparación (MAE) | Campaña siguiente |
|---|---|---|---|---|---|---|---|---|
| S1 Nivel estable | mL | 7 / 0 / 0 | 6843.427737 mL (6.843427737 L) | 8398.857143 mL (8.398857143 L) | 0.068644 (6.8644 %) | 0.084245 (8.4245 %) | SES menor | SES 98196.490250, naive 93719, α 0.25 |
| S2 Cambio de nivel | mL | 7 / 0 / 0 | 16498.142857 mL (16.498142857 L) | 9521.000000 mL (9.521 L) | 0.135205 (13.5205 %) | 0.078026 (7.8026 %) | naive menor | SES 135711.000000, naive 135711, α 1.00 |
| S3 Tendencia | g | 7 / 0 / 0 | 6587.866000 g (6.587866 KG) | 6437.714286 g (6.437714286 KG) | 0.079809 (7.9809 %) | 0.077990 (7.7990 %) | naive menor | SES 99144.000000, naive 99144, α 1.00 |
| S4 Paseo aleatorio | mL | 7 / 0 / 0 | 12708.142857 mL (12.708142857 L) | 10458.857143 mL (10.458857143 L) | 0.190747 (19.0747 %) | 0.156985 (15.6985 %) | naive menor | SES 70535.000000, naive 70535, α 1.00 |
| S5 Hueco, dato oculto y cero comprobado | mL | 4 / 3 / 0 | 22354.421875 mL (22.354421875 L) | 35208.500000 mL (35.2085 L) | 0.465165 (46.5165 %) | 0.732640 (73.2640 %) | SES menor | SES 53303.000000, naive 65220, α 0.00 |
| S6 Menos de tres campañas comprobadas | g | 0 / 3 / 0 | SIN ORÍGENES EVALUABLES | SIN ORÍGENES EVALUABLES | SIN ORÍGENES EVALUABLES | SIN ORÍGENES EVALUABLES | sin orígenes evaluables | INSUFFICIENT_DATA (LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED) |

## S1 Nivel estable (mL)

| Origen t | Reservada | Estado | Lectura del motor | Ajuste: posiciones → valores | α | SES | Naive | Valor reservado | Error SES | Error naive |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | evaluado | READY | 1–3 → 92599, 92947, 107785 | 1.00 | 107785.000000 | 107785 | 103424 | 4361.000000 | 4361.000000 |
| 4 | 5 | evaluado | READY | 1–4 → 92599, 92947, 107785, 103424 | 0.75 | 103581.437500 | 103424 | 90615 | 12966.437500 | 12809.000000 |
| 5 | 6 | evaluado | READY | 1–5 → 92599, 92947, 107785, 103424, 90615 | 0.20 | 95913.643200 | 90615 | 109750 | 13836.356800 | 19135.000000 |
| 6 | 7 | evaluado | READY | 1–6 → 92599, 92947, 107785, 103424, 90615, 109750 | 0.30 | 100506.640840 | 109750 | 104472 | 3965.359160 | 5278.000000 |
| 7 | 8 | evaluado | READY | 1–7 → 92599, 92947, 107785, 103424, 90615, 109750, 104472 | 0.35 | 102366.414878 | 104472 | 96329 | 6037.414878 | 8143.000000 |
| 8 | 9 | evaluado | READY | 1–8 → 92599, 92947, 107785, 103424, 90615, 109750, 104472, 96329 | 0.30 | 100086.074012 | 96329 | 99557 | 529.074012 | 3228.000000 |
| 9 | 10 | evaluado | READY | 1–9 → 92599, 92947, 107785, 103424, 90615, 109750, 104472, 96329, 99557 | 0.30 | 99927.351808 | 99557 | 93719 | 6208.351808 | 5838.000000 |

## S2 Cambio de nivel (mL)

| Origen t | Reservada | Estado | Lectura del motor | Ajuste: posiciones → valores | α | SES | Naive | Valor reservado | Error SES | Error naive |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | evaluado | READY | 1–3 → 85954, 85145, 82426 | 1.00 | 82426.000000 | 82426 | 81991 | 435.000000 | 435.000000 |
| 4 | 5 | evaluado | READY | 1–4 → 85954, 85145, 82426, 81991 | 1.00 | 81991.000000 | 81991 | 82512 | 521.000000 | 521.000000 |
| 5 | 6 | evaluado | READY | 1–5 → 85954, 85145, 82426, 81991, 82512 | 1.00 | 82512.000000 | 82512 | 135730 | 53218.000000 | 53218.000000 |
| 6 | 7 | evaluado | READY | 1–6 → 85954, 85145, 82426, 81991, 82512, 135730 | 0.00 | 85954.000000 | 135730 | 135262 | 49308.000000 | 468.000000 |
| 7 | 8 | evaluado | READY | 1–7 → 85954, 85145, 82426, 81991, 82512, 135730, 135262 | 1.00 | 135262.000000 | 135262 | 141470 | 6208.000000 | 6208.000000 |
| 8 | 9 | evaluado | READY | 1–8 → 85954, 85145, 82426, 81991, 82512, 135730, 135262, 141470 | 1.00 | 141470.000000 | 141470 | 141489 | 19.000000 | 19.000000 |
| 9 | 10 | evaluado | READY | 1–9 → 85954, 85145, 82426, 81991, 82512, 135730, 135262, 141470, 141489 | 1.00 | 141489.000000 | 141489 | 135711 | 5778.000000 | 5778.000000 |

## S3 Tendencia (g)

| Origen t | Reservada | Estado | Lectura del motor | Ajuste: posiciones → valores | α | SES | Naive | Valor reservado | Error SES | Error naive |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | evaluado | READY | 1–3 → 46927, 55699, 54080 | 0.80 | 54052.920000 | 54080 | 64394 | 10341.080000 | 10314.000000 |
| 4 | 5 | evaluado | READY | 1–4 → 46927, 55699, 54080, 64394 | 0.90 | 63370.018000 | 64394 | 66768 | 3397.982000 | 2374.000000 |
| 5 | 6 | evaluado | READY | 1–5 → 46927, 55699, 54080, 64394, 66768 | 1.00 | 66768.000000 | 66768 | 79504 | 12736.000000 | 12736.000000 |
| 6 | 7 | evaluado | READY | 1–6 → 46927, 55699, 54080, 64394, 66768, 79504 | 1.00 | 79504.000000 | 79504 | 85421 | 5917.000000 | 5917.000000 |
| 7 | 8 | evaluado | READY | 1–7 → 46927, 55699, 54080, 64394, 66768, 79504, 85421 | 1.00 | 85421.000000 | 85421 | 90676 | 5255.000000 | 5255.000000 |
| 8 | 9 | evaluado | READY | 1–8 → 46927, 55699, 54080, 64394, 66768, 79504, 85421, 90676 | 1.00 | 90676.000000 | 90676 | 91908 | 1232.000000 | 1232.000000 |
| 9 | 10 | evaluado | READY | 1–9 → 46927, 55699, 54080, 64394, 66768, 79504, 85421, 90676, 91908 | 1.00 | 91908.000000 | 91908 | 99144 | 7236.000000 | 7236.000000 |

## S4 Paseo aleatorio (mL)

| Origen t | Reservada | Estado | Lectura del motor | Ajuste: posiciones → valores | α | SES | Naive | Valor reservado | Error SES | Error naive |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | evaluado | READY | 1–3 → 100000, 102843, 84255 | 0.00 | 100000.000000 | 84255 | 76570 | 23430.000000 | 7685.000000 |
| 4 | 5 | evaluado | READY | 1–4 → 100000, 102843, 84255, 76570 | 1.00 | 76570.000000 | 76570 | 59428 | 17142.000000 | 17142.000000 |
| 5 | 6 | evaluado | READY | 1–5 → 100000, 102843, 84255, 76570, 59428 | 1.00 | 59428.000000 | 59428 | 52679 | 6749.000000 | 6749.000000 |
| 6 | 7 | evaluado | READY | 1–6 → 100000, 102843, 84255, 76570, 59428, 52679 | 1.00 | 52679.000000 | 52679 | 61646 | 8967.000000 | 8967.000000 |
| 7 | 8 | evaluado | READY | 1–7 → 100000, 102843, 84255, 76570, 59428, 52679, 61646 | 1.00 | 61646.000000 | 61646 | 63079 | 1433.000000 | 1433.000000 |
| 8 | 9 | evaluado | READY | 1–8 → 100000, 102843, 84255, 76570, 59428, 52679, 61646, 63079 | 1.00 | 63079.000000 | 63079 | 82425 | 19346.000000 | 19346.000000 |
| 9 | 10 | evaluado | READY | 1–9 → 100000, 102843, 84255, 76570, 59428, 52679, 61646, 63079, 82425 | 1.00 | 82425.000000 | 82425 | 70535 | 11890.000000 | 11890.000000 |

## S5 Hueco, dato oculto y cero comprobado (mL)

| Origen t | Reservada | Estado | Lectura del motor | Ajuste: posiciones → valores | α | SES | Naive | Valor reservado | Error SES | Error naive |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | no estimable | INSUFFICIENT_DATA (LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED) | — | — | — | — | 53303 | — | — |
| 4 | 5 | no estimable | INSUFFICIENT_DATA (SPAN_TOO_SHORT) | — | — | — | — | 63047 | — | — |
| 5 | 6 | no estimable | INSUFFICIENT_DATA (SPAN_TOO_SHORT) | — | — | — | — | 52140 | — | — |
| 6 | 7 | evaluado | READY | 4–6 → 53303, 63047, 52140 | 0.00 | 53303.000000 | 52140 | 63877 | 10574.000000 | 11737.000000 |
| 7 | 8 | evaluado | READY | 4–7 → 53303, 63047, 52140, 63877 | 0.25 | 57098.687500 | 63877 | 0 | 57098.687500 | 63877.000000 |
| 8 | 9 | evaluado | READY | 4–8 → 53303, 63047, 52140, 63877, 0 | 0.00 | 53303.000000 | 0 | 63131 | 9828.000000 | 63131.000000 |
| 9 | 10 | evaluado | READY | 4–9 → 53303, 63047, 52140, 63877, 0, 63131 | 0.00 | 53303.000000 | 63131 | 65220 | 11917.000000 | 2089.000000 |

## S6 Menos de tres campañas comprobadas (g)

| Origen t | Reservada | Estado | Lectura del motor | Ajuste: posiciones → valores | α | SES | Naive | Valor reservado | Error SES | Error naive |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | no estimable | INSUFFICIENT_DATA (LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED) | — | — | — | — | sin valor (NO_RECORD) | — | — |
| 4 | 5 | no estimable | INSUFFICIENT_DATA (LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED) | — | — | — | — | 32912 | — | — |
| 5 | 6 | no estimable | INSUFFICIENT_DATA (SPAN_TOO_SHORT) | — | — | — | — | sin valor (HIDDEN) | — | — |
