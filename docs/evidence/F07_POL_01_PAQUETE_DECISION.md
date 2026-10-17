# F07-POL-01 (#107) — Paquete de decisión

Preparado por la sesión B el 2026-10-17 (UTC), sobre `main` `e2263b0`, para quien deba decidir. **No es una decisión.** Las decisiones de los días 15 y 16 son técnicas y delegadas por Roderich Rendón; no son una aprobación institucional de la Directiva ni una revisión del tutor, y este paquete no las presenta como tales.

## Estado

**Construcción lista / validación institucional pendiente.**

- **Construido y verificado con datos sintéticos:** la política provisional con k = 3 se aplica en el servidor, igual en todos los canales (JSON y CSV del resumen, propuesta y su CSV).
- **Producción y cifras reales: cerradas.**
  - El modo por defecto es `POLICY_PENDING`: sin celdas, cobertura ni huella.
  - Con `NODE_ENV=production`, el modo provisional se ignora (`collective-config.ts`; prueba «allows the provisional policy only outside production»).
- **GATE-F07 (#29) sigue Pending** por este issue (criterio 9).

## 1. Política vigente (lo que hace hoy el código)

Documento: [`F07_AGGREGATE_DISCLOSURE_POLICY.md`](../architecture/F07_AGGREGATE_DISCLOSURE_POLICY.md). Las reglas R1–R9 siguen vigentes, salvo R3 y R6, que sustituye la regla de combinaciones de la §9 (PR #126).

| Tema | Regla |
|---|---|
| Lectores | DIRECTIVA y ADMINISTRADOR del mismo tenant (ADR-003). AGRICULTOR 403, otro tenant 404, sin sesión 401 |
| Celda | Campaña × proyección (`DECLARED_NEED` o `CONSUMPTION_TOTAL`) × producto canónico vigente × unidad base. Total exacto, número de aportantes, `data_as_of`, `released_at` y `pending_changes` |
| Umbral (R1) | Menos de k Members distintos: suprimida, sin cantidad ni conteo, nunca cero |
| Ausencia y cero (R2) | La ausencia es desconocida (sólo pesa en la cobertura); un cero explícito cuenta |
| Combinaciones (§9, sustituye a R3 y R6) | Una cifra nueva sólo se publica si, junto con **todas** las cifras ya publicadas (de la celda, de las celdas que compartieron aportaciones y de las decididas antes en la misma lectura), no permite calcular nada nuevo sobre menos de k Members. Si no se cumple, se mantiene la cifra anterior con `pending_changes` o se retira. Falla cerrada ante cantidades heredadas desconocidas o si se agota el presupuesto de cálculo |
| Bajas (R4) | Cancelación, disputa, baja de Member o cuenta, o salida por reagrupación: la cifra se retira |
| Complementaria (R5) | Sin totales por encima de la celda; el único filtro es la campaña |
| Desbordamiento (R7) | `OVERFLOW`, nunca truncado |
| Canales (R8) | La misma decisión en todo; la propuesta no recalcula ni guarda cantidades propias |
| Presentación (R9) | Campaña, `data_as_of` y cobertura «N de M»; nunca «total del sindicato». Desde #126, la cobertura cuenta sólo los Members dentro de cifras publicadas y avisa `suppressed_cells` sin conteo |

## 2. Umbral propuesto

**k = 3**, sin cambios respecto de la propuesta.
- **Por qué:** con k = 2 cada aportante deduce al otro. Con k = 3, un aportante aislado sólo conoce la suma de los otros dos.
- **Volumen:** el piloto tiene del orden de una docena de agricultores. Un k mayor (p. ej., 5) suprimiría casi todas las celdas por producto.

| Opción | Efecto | Riesgo residual |
|---|---|---|
| k = 3 (propuesto) | Celdas con 3 o más aportantes visibles | Dos aportantes que se coludan deducen al tercero; el conocimiento externo no está cubierto |
| k = 5 | Mucha más supresión con un tenant pequeño | Menor ante la colusión; menos utilidad para planificar |

La decisión de k para datos reales debería tomarse con el número real de agricultores vinculados.

## 3. Límites que se aceptan y se declaran

- **No anonimiza.** No protege ante:
  - la colusión de k − 1 aportantes;
  - el conocimiento externo de valores individuales;
  - un tenant con muy pocos agricultores.
- **Señales visibles:**
  - `pending_changes` o una retirada indican que algo cambió, no cuánto;
  - la cobertura indica cuántos agricultores tienen cifras publicadas;
  - `data_as_of` indica la hora de la última aceptación.
- **Presupuesto de cálculo por lectura:** una celda muy pesada puede impedir que otras publiquen en esa lectura. Es disponibilidad, no fuga, y es una limitación aceptada.
- **Datos heredados sin cantidad**, sólo de bases anteriores a `20261016150500`: sus celdas no publican cifras nuevas.

## 4. Casos resueltos

Pruebas en `main`; abreviaturas como en [`F07_CIERRE_MATRIZ.md`](F07_CIERRE_MATRIZ.md):
- los 16 casos de la §5 de la política;
- los de la revisión de F10-SEC-02 (`F10_SEC_02_REVISION_POLITICA.md`, `F10_SEC_02_PROJECTION.md` H1–H2);
- la aceptación de F07 (`F07_CIERRE_MATRIZ.md` §2).

| Caso pedido por #107 | Resultado | Prueba |
|---|---|---|
| Celda bajo el umbral | Suprimida, nunca 0 | DP «a cell under the threshold…»; F06C5 «threshold, explicit zero, absence and coverage»; ACC «coverage counts only…» |
| Dos consultas cuya diferencia aislaría un aporte | No se publica la segunda: cifra anterior con `pending_changes` | F06C5 «two answers never differ…»; DP «no combination of earlier figures isolates fewer than k Members» (bypass3, base3, retirada intermedia); ACC «S1 (#126)» |
| Agricultor sin aporte | Desconocido; sólo en la cobertura | F06C5; ACC «needs and consumption…» |
| Cero explícito | Cuenta como aportante y suma 0 | DP «an explicit zero…»; ACC (3500 con 3 aportantes) |
| Cambio de membresía | Retira la cifra | F06C5 «cancellation, dispute and membership change withdraw the figure» |

## 5. Validaciones que se necesitan, en orden

| # | Validación | Quién | Qué registra | Estado |
|---|---|---|---|---|
| 1 | Aprobar el texto de la política y k **para datos reales** | Roderich Rendón, como autor | `F07_POL_01.md` §Decisión: «Verificado por Roderich Rendón (autor) el <fecha real>», k, responsable y fecha de revisión | **Pendiente** |
| 2 | Validación institucional de la finalidad y de la divulgación de cifras agregadas: qué se muestra, a quién y que los agricultores lo conocen | Directiva del Sindicato 19 de Agosto | Acta o constancia con su fecha real. Un mensaje o la decisión técnica de Roderich no la sustituye | **Pendiente**; no consta ninguna |
| 3 | Revisión del tutor del entregable | Tutor (GOV-01/#105) | Registro de la revisión efectiva; no equivale a una aprobación automática | **Pendiente** |
| 4 | Revaluar k con el volumen real del tenant | Roderich, en F10-SEC-02 (#45) | Nota en la política | Pendiente; depende de 1 |
| 5 | Habilitar cifras reales | PR propio con revisión | Un modo nuevo y explícito para producción (hoy no existe: `NODE_ENV=production` siempre equivale a `POLICY_PENDING`), con su prueba y su rollback | **No se hace** sin 1–3 |

**Mientras falten 1–3:**
- #107 sigue abierto;
- F07 se informa como **construcción lista / validación institucional pendiente**;
- GATE-F07 sigue Pending;
- producción no muestra cifras.
