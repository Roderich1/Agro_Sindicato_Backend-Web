# E3-P1 — ¿Cuándo son comparables la necesidad declarada y el consumo estimado? Opciones para decidir

| Campo | Valor |
|---|---|
| Fecha | 2026-11-12 (UTC) |
| Estado | **Decidido por Roderich el 2026-11-12: opción 1 + 1b.** La diferencia sigue sin calcularse y la vista E3 muestra el alcance conocido de cada cifra; F12 §2 enmendado en ese sentido |
| Contexto | `E3_ESTIMACION_EN_BORRADOR_CONTRATO.md` §5 y §11; `F12_EST_01_ESTIMATION_CONTRACT.md` §2, §3.1 y §7.1; `F07_*` |

## 1. Qué se midió (datos sintéticos del entorno aislado)

Borrador `84e18f96…` de Invierno 2026 (DEMO), referencia fijada en la ejecución `d4ce8614`. Para cada producto con estimación se contaron, **en el servidor y sin identidades**, los agricultores de la cifra de necesidad y los de cada cifra de consumo usada en el tramo (`CollectiveReleaseItem` → `SyncV1Contribution.memberId`):

| Producto | Agricultores en la necesidad | Campañas en el tramo | Agricultores en el consumo por campaña | Campañas con la misma población que la necesidad |
|---|---|---|---|---|
| Abono NPK 15-15-15 DEMO | 8 | 11 | 4–6 | 0 |
| Coadyuvante DEMO | 5 | 8 | 3–4 | 0 |
| Fertilizante foliar DEMO | 6 | 8 | 3–6 | 0 |
| Fungicida DEMO | 7 | 11 | 4–6 | 0 |
| Herbicida DEMO | 11 | 11 | 4–6 | 0 |
| Mancozeb DEMO | 4 | 11 | 3–5 | 0 |
| Urea DEMO | 9 | 11 | 4–6 | 0 |

Lectura: la necesidad la declaran **más personas** que las que aparecen en cualquier cifra de consumo. «La necesidad supera en 119,3 L la estimación» (Herbicida: 189,8 L de 11 personas frente a 70,5 L estimados con cifras de 4 a 6) mezclaría un efecto de **población** con uno de **cantidad**. La regla actual evitó una comparación engañosa.

Consulta: `tool/etapa3/e3p1_poblaciones.sql` (sólo recuentos por producto y posición; el borrador está fijado en la consulta). Repetible con `docker exec -i agro_et1_pg psql -U postgres -d agro_demo < tool/etapa3/e3p1_poblaciones.sql`.

## 2. Hallazgo técnico

No hace falta guardar nada nuevo para comprobar la población: cada cifra publicada ya enlaza con sus aportes y estos con su Member (`CollectiveReleaseItem`). El servidor puede decidir «misma población: sí/no» sin entregar identidades ni recuentos. Ese sí/no es una salida nueva derivada de datos privados (dice que dos conjuntos coinciden) y conviene revisarla con F07-POL-01 antes de datos reales.

## 3. Opciones

| # | Regla | Qué cambia | Qué mostraría hoy | Riesgos |
|---|---|---|---|---|
| **1** | **Mantener «no comparable»** (actual) y explicar el motivo | Nada | Ninguna diferencia | Ninguno nuevo; la Directiva compara a ojo |
| **1b** | 1 + **mostrar el alcance conocido** de cada cifra: «Necesidad: 11 agricultores de esta campaña · Consumo estimado: cifras de 4 a 6 agricultores por campaña» | La vista E3 entrega el rango de aportantes de las cifras de consumo del tramo, **sólo al perfil institucional** | El alcance de cada cifra, sin diferencia | **Contradice F12 §2**, que hoy no entrega el número de aportantes de una cifra de consumo (la cobertura del tramo es «N de M» general, no por producto). Exige que autorices ese cambio de F12 |
| **2** | **Misma población exacta**: diferencia sólo si los agricultores de la necesidad son **exactamente** los de cada cifra de consumo del tramo | Comprobación en el servidor (§2), sin datos nuevos ni tablas nuevas | Ninguna (0 de 7) | Casi nunca se cumplirá con poblaciones que cambian entre campañas; correcta cuando se cumple |
| **3** | **Misma población que la última campaña** del tramo (la de la línea base naive) | Igual que 2, sólo para la última posición | Ninguna (0 de 7) | Más permisiva que 2 pero el SES usa todo el tramo: la estimación no es sólo de esa campaña |
| **4** | **Comparar por persona**: necesidad media por agricultor frente a un consumo **por agricultor** estimado | Una cantidad nueva a estimar en F12 (serie «consumo total ÷ aportantes»), con el mismo motor SES/naive, y la necesidad ÷ aportantes | Diferencias por persona en todos los productos con datos | Cambia el contrato F12 (otra variable estimada) y entrega promedios por persona; con pocos aportantes un promedio se acerca a una cifra individual (revisión F07-POL-01). Sigue sin ser la misma población: sólo normaliza el tamaño |
| **5** | **Comparación declarada con alcances distintos**: calcular la diferencia y rotularla siempre con ambos alcances | Quitar el bloqueo de población, mantener los demás | Diferencias en los 7 productos, rotuladas | El encargo pide no asumir comparabilidad; aunque se rotule, la cifra induce a leer «exceso de demanda». **No recomendada** |

## 4. Recomendación

**Opción 1 ahora**, con **1b** si autorizas ese cambio de F12 §2 para el perfil institucional. Es lo que pedía el encargo («mostrar la referencia con su alcance conocido… indicar que no se calcula la diferencia»). Los datos medidos muestran que hoy las poblaciones nunca coinciden, así que las opciones 2 y 3 no cambiarían lo que se ve. La opción 4 sólo tiene sentido si la Directiva quiere razonar «por agricultor» y acepta la revisión de privacidad.

Si eliges 2 o 3, la implementación es acotada: una consulta de conjuntos en el servidor dentro de la comparación (`proposal-link.ts`), con pruebas de igualdad, desigualdad, cifras sin aportes enlazados (anteriores a F10-SEC-02) y retiro de una divulgación. Para 1b: un campo nuevo en la vista E3 y la enmienda de F12 §2.
