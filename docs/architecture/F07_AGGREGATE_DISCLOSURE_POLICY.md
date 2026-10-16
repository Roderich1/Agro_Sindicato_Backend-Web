# F07-POL-01 — Política mínima de divulgación de agregados (PROPUESTA)

- **Estado: PROPUESTA, decisión pendiente.** Ni la Directiva ni el tutor la han validado. Roderich Rendón (autor) tampoco la ha aprobado todavía. Mientras siga pendiente, **no se divulgan cifras reales**: el Backend responde `POLICY_PENDING`, sin celdas, en todos los canales.
- **Issue:** [#107](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/107). **Contrato:** [`F06_COLLECTIVE_PROJECTION_CONTRACT.md`](F06_COLLECTIVE_PROJECTION_CONTRACT.md) §5.
- **Requisitos:** RF-24, RNF-05; los roles siguen RU-18/RU-19 ([ADR-003](../adr/ADR-003-administrador-presidente-funciones-directiva.md)).
- **Implementación provisional** (F06 #21, rama `feat/f06-consolidacion`): `Back/src/modules/collective/domain/disclosure-policy.ts`, umbral `k = 3`. Sólo se activa con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` y `NODE_ENV` distinto de `production`. En producción siempre equivale a `disabled`. Sirve para probar la política con datos sintéticos. No la aprueba.
- **Redactada:** 2026-10-16 por Claude Code. Revisión técnica automatizada: pruebas unitarias y de PostgreSQL citadas abajo. Sin revisión del tutor.

## 1. Lectores

- Sólo cuentas `DIRECTIVA` y `ADMINISTRADOR` (ADR-003) del **mismo tenant** que la campaña consultada.
- Otro tenant → 404. `AGRICULTOR` → 403. Sin sesión → 401.
- Nunca se responde a otro tenant ni a un agricultor.

## 2. Qué se publica

- **Una celda por** campaña × proyección (`CONSUMPTION_TOTAL` o `DECLARED_NEED`) × producto canónico vigente × unidad base (`ML` o `G`).
- **Contenido de cada celda:**
  - el total exacto (decimal en texto, en unidad base y en L/KG sin redondeo);
  - el número de Members distintos que aportan;
  - `data_as_of` (última aceptación central de las aportaciones de esa cifra);
  - `released_at` y `pending_changes`.
- **Por campaña:** la cobertura `linked_members` (agricultores activos del tenant) y `members_with_contribution`.
- **Nunca se publica:**
  - el aporte de un agricultor ni una lista de quién aportó;
  - identidades de Member, Account o clientId;
  - sumas entre productos o entre unidades;
  - ningún dato fuera de la whitelist F06.
- **Agrupación por producto canónico.** Las cifras se agrupan por el producto canónico vigente, fijado por una asociación confirmada por la Directiva (RF-33, RF-34). Un producto sin asociación es su propio canónico.

## 3. Umbral

Propuesta: **k = 3 Members distintos** por celda.

**Justificación:**

- Con k = 2, cada uno de los dos aportantes deduce el aporte del otro restando el suyo del total.
- Con k = 3, un aportante sólo conoce la suma de los otros dos. Es el mínimo que impide a un participante aislado deducir el aporte de otro.
- Un tenant piloto tiene del orden de una docena de agricultores. Un umbral mayor suprimiría casi todas las celdas por producto.

**Riesgo residual que se acepta de forma provisional:** dos aportantes que se coludan deducen el tercero. La revisión en F10-SEC-02 (#45) debe reevaluar k con el volumen real.

## 4. Reglas

| # | Regla | Comportamiento |
|---|---|---|
| R1 | **Supresión primaria** | Menos de k Members → `SUPPRESSED_UNDER_THRESHOLD`, sin total y sin conteo. Nunca se muestra como cero. |
| R2 | **Cero explícito frente a ausencia** | Un cero declarado es una aportación: cuenta como aportante y suma 0. Un agricultor sin aporte es *desconocido*: no suma, no cuenta y sólo se ve en la cobertura. Una celda que nunca tuvo aportaciones no aparece. Si tuvo una cifra publicada y se queda sin aportaciones, aparece retirada (R4). |
| R3 | **Diferencias entre consultas** | Dos cifras sucesivas de una celda sólo pueden diferir si cambiaron al menos k Members distintos (altas, sustituciones o bajas). Si cambiaron menos, se sigue mostrando la cifra anterior con `pending_changes = true`. La diferencia entre dos respuestas nunca aísla un aporte. |
| R4 | **Bajas** | Una cancelación, una disputa (`CONTESTED`) o un Member o cuenta inactivos retiran la cifra vigente (`SUPPRESSED_REVISION`). Lo mismo ocurre cuando una aportación sale de la celda por una reagrupación. La cifra no vuelve hasta que R3 lo permite. Si la celda vuelve exactamente a las aportaciones publicadas, se publica la misma cifra. |
| R5 | **Supresión complementaria** | No hay totales por encima de la celda (ni por campaña, ni entre productos, ni entre unidades), así que ninguna cifra publicada permite despejar una celda suprimida. El único filtro es la campaña: no hay filtros por agricultor, dispositivo, parcela, persona ni fecha que permitan restar subconjuntos. |
| R6 | **Asociaciones** | Una asociación nueva o corregida cambia la composición de las celdas canónicas. Se trata con R3 y R4: entra o sale una aportación, no hay atajo. Las celdas que desaparecen al agrupar retiran su cifra. |
| R7 | **Desbordamiento** | Un total por encima de int64 nunca se trunca: la celda muestra `OVERFLOW` y retira la cifra anterior. |
| R8 | **Todos los canales** | JSON y CSV salen de la misma decisión. Toda salida futura (Web F07, reportes) debe consumir estas respuestas, no recalcular. |
| R9 | **Presentación** | Toda cifra se muestra con la campaña (filtro aplicado), `data_as_of` y la cobertura («N de M agricultores aportaron»). Nunca se presenta como el total del sindicato. |

## 5. Casos resueltos

| Caso | Resultado | Prueba |
|---|---|---|
| Celda con 2 Members | `SUPPRESSED_UNDER_THRESHOLD`, sin cifra ni conteo; nunca 0 | `disclosure-policy.spec.ts`: «a cell under the threshold…»; `f06-coll-05…`: «threshold, explicit zero, absence and coverage» |
| Un Member con dos aportaciones en la misma celda (alias) | Cuenta una vez | «counts distinct Members…»; `f06-coll-05…`: «aliases: confirmed association, distinct Members…» |
| Dos consultas cuya diferencia aislaría un aporte (1 Member nuevo) | La segunda repite la cifra anterior con `pending_changes` | «the difference of two answers never isolates one Member»; `f06-coll-05…`: «two answers never differ by a single Member's contribution» |
| Agricultor sin aporte | Desconocido: fuera del total y del conteo; visible sólo en la cobertura | «absence is not a cell…»; `f06-coll-05…` (cobertura) |
| Cero explícito | Cuenta como aportante y suma 0 | «an explicit zero counts as a contributor and as zero» |
| Cancelación, disputa o baja de membresía | La cifra se retira; vuelve igual si el estado vuelve a ser el publicado | «a removal withdraws the prior figure…»; `f06-coll-05…`: «cancellation, dispute and membership change withdraw the figure» |
| ML y G con el mismo producto canónico | Nunca se suman | «never adds ML and G…» |
| Total > int64 | `OVERFLOW` | «an int64 overflow is never truncated» |
| CSV frente a JSON | Mismas decisiones, nada más | «JSON and CSV carry the same decisions; no individual data»; `collective-config.spec.ts` |
| Política pendiente | Sin celdas en ningún canal | «without an approved policy there are no figures in any channel»; `collective-config.spec.ts` |

## 6. Señales que quedan y se aceptan

- Un `pending_changes` o una retirada revela que *algo* cambió en la celda, no cuánto.
- `members_with_contribution` revela cuántos agricultores aportaron en la campaña, no qué ni cuánto.
- `data_as_of` revela la hora de la última aceptación de las aportaciones de la cifra.

## 7. Decisiones abiertas para Roderich

1. **k = 3.** Aprobar o fijar otro valor.
2. **Conteo en celdas suprimidas.** El brief D4 proponía mostrar el conteo («menos de 3 aportes») junto a la cifra oculta. La implementación provisional oculta también el conteo, porque es más conservadora. Elegir una de las dos.
3. **Responsable y fecha de revisión.** Propuesta: Roderich Rendón en F10-SEC-02 (#45), antes de habilitar cifras reales.

Mientras estas decisiones no consten en [`docs/evidence/F07_POL_01.md`](../evidence/F07_POL_01.md) con su fecha real, #107 sigue abierto y la divulgación real sigue deshabilitada.
