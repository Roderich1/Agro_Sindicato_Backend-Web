# F07-POL-01 — Política mínima de divulgación de agregados (PROPUESTA)

- **Estado: PROPUESTA para datos sintéticos.** El 2026-10-16 se adoptaron decisiones técnicas por delegación de Roderich Rendón (§7). No es una aprobación institucional, ni de la Directiva, ni del tutor.
- **La divulgación de datos reales NO está aprobada.** Mientras no lo esté, el Backend responde `POLICY_PENDING`, sin celdas, en todos los canales.
- **Revisada bajo F10-SEC-02 (#45) el 2026-10-16** (§8). Esa revisión no completa #45: faltan los endpoints heredados (ADR-003).
- **Issue:** [#107](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/107). **Contrato:** [`F06_COLLECTIVE_PROJECTION_CONTRACT.md`](F06_COLLECTIVE_PROJECTION_CONTRACT.md) §5.
- **Requisitos:** RF-24, RNF-05; los roles siguen RU-18/RU-19 ([ADR-003](../adr/ADR-003-administrador-presidente-funciones-directiva.md)).
- **Implementación provisional** (F06 #21, rama `feat/f06-consolidacion`): `Back/src/modules/collective/domain/disclosure-policy.ts`, umbral `k = 3`. Sólo se activa con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` y `NODE_ENV` distinto de `production`. En producción siempre equivale a `disabled`. Sirve para probar la política con datos sintéticos. No la aprueba.
- **Redactada:** 2026-10-16 por Claude Code. Revisión técnica automatizada: pruebas unitarias y de PostgreSQL citadas abajo. Sin revisión del tutor.

## 0. Modelo de amenaza

**Qué protege.** Dificulta que un **lector autorizado** (Directiva o Administrador del tenant) obtenga el aporte de un Member, o su cambio, por dos vías:
- leyendo una celda pequeña;
- comparando cifras de una celda en el tiempo, antes y después de una reagrupación, o entre canales (JSON y CSV).

**Qué no protege:**
- dos o más aportantes (k − 1) que comparten sus valores y deducen el resto;
- el conocimiento externo de valores individuales;
- las señales de actividad de §6;
- un tenant con muy pocos agricultores.

**k = 3 no hace anónimos los datos.** Sólo es el mínimo que impide a un aportante aislado deducir el de otro restando el suyo.

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
| R1 | **Supresión primaria** | Menos de k Members → `SUPPRESSED_UNDER_THRESHOLD`, **sin cantidad y sin conteo exacto**: sólo el estado, que es el motivo comprensible. Nunca se muestra como cero. |
| R2 | **Cero explícito frente a ausencia** | Un cero declarado es una aportación: cuenta como aportante y suma 0. Un agricultor sin aporte es *desconocido*: no suma, no cuenta y sólo se ve en la cobertura. Una celda que nunca tuvo aportaciones no aparece. Si tuvo una cifra publicada y se queda sin aportaciones, aparece retirada (R4). |
| R3 | **Diferencias entre consultas** | Se cuenta el **cambio neto por Member**: su suma en la celda (altas, bajas o cantidad distinta). Una sustitución con el mismo valor, o un cambio que vuelve al valor publicado, no cuenta. Una cifra nueva sólo se publica si, frente a **cada** cifra anterior de la celda (también las retiradas, porque un lector pudo guardarlas), nada cambió o cambiaron al menos k Members. Si no se cumple, se sigue mostrando la última cifra con `pending_changes = true`, o se retira según R4. Así, la diferencia entre dos cifras publicadas no aísla el cambio de **un** Member; contra una colusión de k − 1 no protege (§0). |
| R4 | **Bajas** | Una cancelación, una disputa (`CONTESTED`; decisión delegada del 2026-10-16, §7) o un Member o cuenta inactivos retiran la cifra vigente (`SUPPRESSED_REVISION`). No se publica un total nuevo que permita deducir el aporte retirado. Lo mismo ocurre cuando una aportación sale de la celda por una reagrupación. La cifra no vuelve hasta que R3 lo permite. Si la celda vuelve exactamente a las aportaciones publicadas, se publica la misma cifra. |
| R5 | **Supresión complementaria** | No hay totales por encima de la celda (ni por campaña, ni entre productos, ni entre unidades), así que ninguna cifra publicada permite despejar una celda suprimida. El único filtro es la campaña: no hay filtros por agricultor, dispositivo, parcela, persona ni fecha que permitan restar subconjuntos. |
| R6 | **Asociaciones** | Una asociación nueva o corregida cambia la composición de las celdas canónicas. Se trata con R3 y R4: entra o sale una aportación, no hay atajo. Un Member que mueve su valor entre alias de la misma celda no cambia su suma. Las celdas que desaparecen al agrupar retiran su cifra. |
| R7 | **Desbordamiento** | Un total por encima de int64 nunca se trunca: la celda muestra `OVERFLOW` y retira la cifra anterior. |
| R8 | **Todos los canales** | JSON y CSV salen de la misma decisión. Toda salida futura (Web F07, reportes, **propuesta de compra conjunta**) consume estas respuestas: no recalcula, no guarda ni sirve cifras por otro camino, y no incluye cantidades de celdas suprimidas. |
| R9 | **Presentación** | Toda cifra se muestra con la campaña (filtro aplicado), `data_as_of` y la cobertura («N de M agricultores aportaron»). Nunca se presenta como el total del sindicato. |

## 5. Casos resueltos

| Caso | Resultado | Prueba |
|---|---|---|
| Celda con 2 Members | `SUPPRESSED_UNDER_THRESHOLD`, sin cifra ni conteo; nunca 0 | `disclosure-policy.spec.ts`: «a cell under the threshold…»; `f06-coll-05…`: «threshold, explicit zero, absence and coverage» |
| Un Member con dos aportaciones en la misma celda (alias) | Cuenta una vez | «counts distinct Members…»; `f06-coll-05…`: «aliases: confirmed association, distinct Members…» |
| Dos consultas cuya diferencia aislaría un aporte (1 Member nuevo) | La segunda repite la cifra anterior con `pending_changes` | «the difference of two answers never isolates one Member»; `f06-coll-05…`: «two answers never differ by a single Member's contribution» |
| Tres secuencias nuevas, un solo cambio neto (6000 → 6100) | Se mantiene 6000 con `pending_changes` | `disclosure-policy.spec.ts` «a new sequence with the same value is not a change…»; `f06-coll-05…` «6000 → 6100 with three new sequences…» |
| Sustituciones con el mismo valor | La misma cifra, sin nueva divulgación ni pendientes | «replacements without a new value are not new information» |
| Un cambio que vuelve al valor publicado | Sin pendientes | «a change that goes back to its released value leaves nothing pending» |
| Volver a valores de una cifra anterior (R3 − R1 aislaría a un Member) | No se publica: se mantiene la última cifra con `pending_changes` | «no figure differs from any earlier figure…» (unitario y API) |
| Reagrupación que sólo añade un Member | Se mantiene la cifra con `pending_changes`; al deshacerla, la misma cifra sin pendientes | «regrouping: a Member that joins through an association alone…» |
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

## 7. Decisiones técnicas delegadas (2026-10-16)

Adoptadas por la sesión de Claude Code, bajo la delegación de Roderich Rendón (`_briefs/CONTINUACION_TRES_SESIONES_2026-10-16.md` §3). No son una firma institucional, una inspección personal ni una revisión del tutor.

| Decisión | Resolución |
|---|---|
| Umbral | k = 3 para construcción y demostración con **datos sintéticos**. No se aprueba la divulgación de datos reales |
| Celda suprimida | Sin cantidad y sin conteo exacto de aportantes; con un motivo comprensible; nunca como cero |
| Cobertura y conteos | Metadatos agregados sujetos a esta misma política. Sin listados identificables de agricultores; ninguna salida permite reconstruir una celda suprimida |
| Aporte en disputa | Se excluye del cálculo y la cifra divulgada se retira (R4), sin publicar un total que permita deducir el aporte retirado |
| Representación (#22, criterio 6) | `projection_type` + `total_base` corresponden a `consumed_total_base` / `declared_need_total_base`, con metadatos agregados autorizados; sin identidades ni cantidades individuales |

## 7b. Decisiones abiertas para Roderich (antecedente del 2026-10-15)

1. **k = 3.** Aprobar o fijar otro valor.
2. **Conteo en celdas suprimidas.** El brief D4 proponía mostrar el conteo («menos de 3 aportes») junto a la cifra oculta. La implementación provisional oculta también el conteo, porque es más conservadora. Elegir una de las dos.
3. **Responsable y fecha de revisión.** Propuesta: Roderich Rendón en F10-SEC-02 (#45), antes de habilitar cifras reales.

Las decisiones 2 y 3 quedaron resueltas por las decisiones delegadas de §7. Siguen abiertas la aprobación para datos reales y la revisión completa de F10-SEC-02 (#45), que incluye los endpoints heredados. #107 sigue abierto y la divulgación real sigue deshabilitada.

## 8. Revisión bajo F10-SEC-02 (#45), 2026-10-16

**Hallazgo.** La regla R3 anterior contaba Members con secuencia nueva, no con cambio de valor. Además sólo comparaba con la última cifra. Dos consecuencias:
- 1000/2000/3000 → 1100/2000/3000, con las tres secuencias renovadas, publicaba 6100: aislaba el +100 de un solo Member;
- tras R1 = 10000 y R2 = 10400 (cuatro cambios), tres Members volvían a su valor y se publicaba 10100. Como R3 − R1 = 100, quedaba aislado el cambio del primero.

**Reproducción por la API** con operaciones válidas (PUBLISH y SUPERSEDE reales). Sobre `063437d` fallan 4 casos: cambio neto único, sustitución sin variación, cambio que vuelve a su valor y historial. Con la corrección pasan los 5, incluida la reagrupación. Ver [`F10_SEC_02_REVISION_POLITICA.md`](../evidence/F10_SEC_02_REVISION_POLITICA.md).

**Corrección:**
- R3 con cambio neto por Member frente a todo el historial;
- cada fila de una divulgación guarda su cantidad (migración `20261016150500_f07_pol_01_release_item_quantity`, expand-only);
- las filas anteriores sin cantidad cuentan como cambio.

Esta corrección sigue sin ser una garantía de anonimato (§0).
