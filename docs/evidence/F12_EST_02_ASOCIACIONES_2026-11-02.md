# F12-EST-02 (#175): corrección de asociaciones canónicas en PostgreSQL — evidencia

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-02, de las 17:45Z a las 18:10Z (UTC) |
| Base | `main` `6117c77` (tras #193), con la CI de `main` en verde |
| Rama | `feat/f12-est-02-asociaciones` |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200, Node 25.9.0. PostgreSQL 16.13 **desechable** (`agro_f12_est07_pg`, `--rm`). Solo datos sintéticos; secretos JWT efímeros |
| Issue | Refs #175. **No se cierra** con este trabajo |
| Contrato | `F12_EST_01_ESTIMATION_CONTRACT.md` §3, punto 4 (canónico), y §3.2, puntos 5 y 6 (rechazos, huella y versiones). **No se modifica** |

## 1. Qué faltaba

En la conciliación anterior se acreditó la versión nueva de la serie solo para una corrección de **clasificación**. Para una corrección de **asociación** canónica solo había una prueba unitaria de la huella, y en PostgreSQL solo constaba que el resultado pasaba a `OUTDATED`.

## 2. Prueba nueva

`f12-est-05-runs.postgres.spec.ts`, caso «#175: a canonical association corrected over F06…». La asociación se crea y se cierra por la **API real de F06** (`POST /api/v1/collective/product-associations` y `…/{productId}/close`), y el trabajo se encola por la API de estimación.

**Datos sintéticos** (temporada CORRECCION):
- B1 (2001): cifra sellada de otra denominación;
- K1–K3 (2002–2004): cifras selladas del canónico, 3000, 4000 y 5000 mL;
- TK (2005): objetivo.

| Paso | Qué ocurre | Lo comprobado |
|---|---|---|
| 1 | Se asocia por error una denominación **sin cifras selladas** y se estima | Serie **versión 1**, con esa asociación en su ámbito. La ejecución R1 queda `ESTIMATED` y `CURRENT` |
| 2 | **Corrección:** la asociación se cierra por F06, con su motivo | R1 pasa a `OUTDATED/SOURCES_CHANGED` con su cifra. Una nueva ejecución R2 construye la **versión 2** con `previousSeriesId` = versión 1 y el ámbito sin la asociación |
| 2 (conservación) | — | La versión 1 y sus puntos son **idénticos** byte a byte; el resultado de R1 también, y sigue citando la versión 1. R2 cita la versión 2 y a R1 como anterior. R1 se lee `SUPERSEDED/LATER_RUN` y R2 `CURRENT` |
| 3 | Se asocia una denominación **cuya cifra ya estaba sellada aparte** (B1) | La serie se rechaza con `CANONICAL_CHANGED_AFTER_SEAL` (B1), **sin escribir ninguna versión**. R2 pasa a `OUTDATED/SOURCES_CHANGED` con su cifra. Una nueva ejecución R3 registra `INCOMPATIBLE_DATA` / `NO_COMPARABLE_CAMPAIGNS`, sin cifra, sin serie y `NOT_USABLE` |
| 3 (conservación) | — | Las versiones 1 y 2, con sus puntos, y los resultados de R1 y R2 quedan **idénticos** |

**Reglas que se mantienen:**
- **Nunca se reagrupan retrospectivamente cifras selladas** por una asociación posterior al sellado: sumarlas sería publicar una cifra nueva (contrato §3.2, punto 5).
- Ni el contrato ni el criterio se modifican.

## 3. Resultados

```text
F12_EST_PG_TEST_URL=<desechable> npx jest f12-est-05-runs.postgres.spec.ts --runInBand
  → «Tests: 17 passed, 17 total» (16 anteriores + el nuevo)
```

**Alteraciones**, restauradas después. Cada una hace fallar el caso nuevo:
- quitar el rechazo `CANONICAL_CHANGED_AFTER_SEAL`;
- sacar las asociaciones de la huella del ámbito.

**Aviso conservado:** la suite termina con «Jest did not exit one second after the test run has completed». Ya aparecía **sin** el caso nuevo (ejecución con `-t '^(?!.*#175)'`: 16 passed y el mismo aviso). No lo introduce este cambio y queda sin tratar.

## 4. Estado de los criterios de #175

| Criterio | Estado |
|---|---|
| Dos denominaciones asociadas al mismo canónico se agregan en una sola serie en la unidad base | **Parcial, por una regla del contrato.** Se cumple cuando la asociación es anterior al sellado: F07 consolida la cifra. Cuando es **posterior**, el contrato no admite agregar las cifras ya selladas por separado. La serie se rechaza (`CANONICAL_CHANGED_AFTER_SEAL`) y la ejecución informa `INCOMPATIBLE_DATA`. El criterio dice «se agregan» sin distinguir el momento de la asociación |
| Una campaña de otra temporada o definición no forma parte | **Acreditado** (conciliación anterior) |
| Una asociación canónica corregida crea una versión nueva y conserva la anterior con sus ejecuciones | **Acreditado** para la corrección que el contrato admite: cerrar una asociación errónea, sin cifras selladas que reagrupar. Crea la versión `n + 1` y conserva la anterior y sus ejecuciones. **Escenario no admitido:** una corrección que obligaría a reagrupar cifras ya selladas. No crea versión: se rechaza sin escribir nada y conserva lo anterior |

**El issue sigue abierto:** decidir si el primer criterio se da por cumplido con la regla del contrato corresponde a Roderich.
