# F12-EST-01 — Contrato INT-09: estimación del consumo (v1)

- **Fecha real:** 2026-11-01 y 2026-11-02 (UTC); 2026-11-01 en Bolivia.
- **Estado:** **especificación**. Es una propuesta del autor, no una aprobación institucional, de la Directiva ni del tutor. **Ninguna ruta está implementada**: no hay controladores, casos de uso ni motor de cálculo. Lo único construido en este bloque es el esquema de datos (§6), con su migración aditiva.
- **Issue:** [#174](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/174) (F12-EST-01), entregable E7.1 de 3.13.2. Lo siguen F12-EST-02 a F12-EST-08.
- **Bases:**
  - Backend `main` `b81ff23`.
  - Mobile `main` `4ca2088`, solo como referencia de los clientes; Mobile no cambia.
  - Documento entregado `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`, sin modificar.
- **Requisitos:** CU-20, CU-21; RF-35 a RF-40; RN-25 a RN-30; INT-09; DAT-18, DAT-19, DAT-20.
- **Diseño:** 3.12.3.4 (figura 3.15 c), 3.12.4.8, 3.12.6 (tablas 3.47 a 3.49) y tabla 3.42.
- **Especificación de rutas:** [`docs/api/openapi-f12-estimation.json`](../api/openapi-f12-estimation.json). Es la fuente de las formas exactas; este documento fija la semántica.
- **No cambia:**
  - Sync v1 (F05), la proyección colectiva y su política (F06, F07-POL-01) ni el historial sellado (F07);
  - los respaldos privados (F08), el modelo de roles (`UserRole`), ADR-003 ni `DemandForecast`;
  - ninguna tabla existente.

## 0. Relación con el alcance vigente del repositorio (discrepancia abierta)

`docs/scope/CURRENT_SCOPE.md` §11 excluye «forecasting o predicción mediante IA». También lo hacen `AGENTS.md` («No reintroducir forecasting, predicción o recomendaciones automáticas»), `Back/AGENTS.md` y `Web/AGENTS.md`. Esos textos no cambian desde el 2026-10-15, antes de la conciliación del 2026-10-31 con el documento v1.22.1.

Ese documento sí incluye la estimación como **referencia exploratoria**:
- calculada en el servicio con suavizamiento exponencial simple frente a la línea base naive;
- sin IA ni variables externas;
- sin efectos sobre necesidades, propuestas, compras o inventarios (RN-29).

El propio §12 de `CURRENT_SCOPE.md` dice que, ante una contradicción, «prevalece el alcance académico vigente».

Este contrato sigue el documento v1.22.1 y el issue #174, pero **no modifica** `CURRENT_SCOPE.md` ni los `AGENTS.md`. Alinearlos, previsiblemente con un ADR, es la decisión pendiente **EST-D-01** (§11). Mientras tanto, lo que este contrato admite es exactamente:
- el método SES/naive de 3.12.4.8;
- sin recomendaciones;
- sin sumar la estimación a nada;
- sin decisiones automáticas.

## 1. Conceptos que no se confunden

| Concepto | Qué es | Dónde vive |
|---|---|---|
| Consumo publicado | Cifra colectiva de `CONSUMPTION_TOTAL` por campaña, producto canónico y unidad base que superó la política de divulgación | `CollectiveRelease` y la versión sellada (F06/F07) |
| Necesidad declarada | Lo que cada agricultor declara (`DECLARED_NEED`) | Sync v1, propuestas |
| Estimación | Referencia calculada para la campaña siguiente comparable (h = 1) | `EstimationRun` y `EstimationResult` (§6) |
| Propuesta conjunta | Borrador que las personas revisan | `JointPurchaseProposal`; la estimación solo podrá mostrarse en una columna aparte (F12-EST-08) y nunca se suma |

**Clase de cada posición de la serie (RN-26, DAT-18):**
- `VERIFIED_CONSUMPTION`: consumo comprobado, incluido el **cero**.
- `NO_RECORD`: no hay cifra publicada.
- `HIDDEN`: la política de divulgación la oculta.

Las dos últimas **nunca** son cero, no se interpolan y no entran en el cálculo.

**Resultado frente a vigencia:**
- El **resultado** de una ejecución (`CALCULATED` o `FAILED`) y de cada producto (`ESTIMATED`, `INSUFFICIENT_DATA`, `INCOMPATIBLE_DATA`, `CALCULATION_FAILED`) se escribe una vez.
- La **vigencia** (`NOT_USABLE`, `SUPERSEDED`, `OUTDATED`, `CURRENT`) se deriva al consultar y **no se almacena** (§8).

**Copia descargada:** pertenece al cliente (Mobile o Web), asociada a una identidad y un ámbito. No es una autorización vigente (§9).

## 2. Identidad, ámbito y permisos

**Mecanismo.** Se usa la autorización existente; **no se crea otra**.
- `JwtAuthGuard` y `RolesGuard` son globales (`iam.module.ts`).
- `CurrentAuthContextResolver` revalida en la base el usuario, el Member, el tenant y la sesión en cada petición (V1 Web y V2 Mobile). Una cuenta, un Member o un tenant inactivos reciben **401**.
- Las rutas usan `@Roles(...)` y `@CurrentUser()`.

**Ámbito.** El ámbito es siempre el **sindicato del Member autenticado** (`principal.tenantId`).
- El cliente nunca envía `tenantId`.
- Las referencias que envía (campaña, producto, ejecución) se buscan **dentro** de ese tenant. Una referencia de otro sindicato responde igual que una inexistente (**404**), como en F06/F07.

| Acción | AGRICULTOR | DIRECTIVA | ADMINISTRADOR (ADR-003) | Mecanismo |
|---|---|---|---|---|
| Generar (`POST /estimation/runs`, CU-20) | 403 | Sí, en su sindicato | Sí, en su sindicato, con las funciones de Directiva | `@Roles(DIRECTIVA, ADMINISTRADOR)` |
| Ejecuciones anteriores y detalle con la serie | 403 | Sí | Sí | `@Roles(DIRECTIVA, ADMINISTRADOR)` |
| Consultar resultados permitidos (CU-21) | Perfil de Agricultor (EST-D-05) | Perfil institucional | Perfil institucional | `@Roles(AGRICULTOR, DIRECTIVA, ADMINISTRADOR)`; el perfil sale del rol |
| Descargar la copia (RF-40) | Perfil de Agricultor (EST-D-05) | Perfil institucional | Perfil institucional | Ídem |
| Modificar o borrar ejecuciones, resultados o series | No existe ruta | No existe ruta | No existe ruta | Disparadores de §6.3 |
| Aprobar un resultado | No existe | No existe | No existe | §7 |

**Lo que se especifica para las identidades sin permiso.** Una identidad sin permiso de generación recibe **403** del `RolesGuard` global, con el cuerpo `{ "statusCode": 403, "message": "No tienes permisos para esta acción", "error": "Forbidden" }`.
- La petición no llega al caso de uso.
- **No se ejecuta el cálculo ni se registra ninguna ejecución.**

Es una especificación: no hay ruta implementada que lo pruebe (§12). Como defensa en profundidad, la base rechaza una ejecución con `requestedByRole` distinto de DIRECTIVA o ADMINISTRADOR, o cuyo solicitante no sea Member **activo** del tenant con ese rol. Esto sí está probado contra PostgreSQL (§12).

**«Con permiso de estimación».** La tabla 3.47 dice que la Directiva genera «con permiso de estimación». El servicio no tiene permisos más finos que el rol, y este contrato **no crea otro sistema**: el permiso equivale al rol. Si hace falta uno específico, es la decisión **EST-D-13**.

**Lo que no se entrega en ningún perfil:**
- inventarios privados, compras, cuentas familiares, fotografías ni existencias privadas;
- aportes individuales: cantidad por agricultor, Member que aporta o número de aportantes de una fila.

La serie solo usa cifras ya publicadas por la política de divulgación (§3).

**Perfiles de lectura** (`profile` en la respuesta):
- **`INSTITUTIONAL`** (DIRECTIVA y ADMINISTRADOR): por producto, la estimación, la línea base naive, la cobertura y la vigencia. El detalle de una ejecución añade los puntos de la serie, que son las cifras publicadas que ya pueden leer en el historial sellado (F07).
- **`FARMER`** (AGRICULTOR): por producto, el estado, el motivo, el método, las fechas, la longitud del tramo, la vigencia y **solo la estimación**.
  - **Sin** línea base naive: es literalmente la última cifra publicada.
  - **Sin** cobertura ni serie: en F07, la cifra colectiva solo la lee la Directiva (3.12.6.3).
  - **Riesgo declarado:** la estimación también puede igualar la última cifra publicada (α = 1, o un criterio constante). Entregarla al Agricultor amplía en ese grado lo que conoce de la información colectiva (RF-39, tabla 3.49).
  - El diseño la permite (tablas 3.47 y 3.48), pero confirmarla, o quitar también la estimación en esos casos, es la decisión **EST-D-05**.

## 3. Fuentes de la serie (para F12-EST-02 y F12-EST-03)

1. **Variable.** Es el consumo publicado `CONSUMPTION_TOTAL` por producto canónico y unidad base `ML` o `G`, la misma de Sync v1 (RN-25).
   - No se convierten litros en kilogramos ni se mezclan presentaciones.
   - Un producto cuya unidad central no es enlazable (`baseUnitForCentralUnit` = null), o que no es canónico, **no es estimable**:
     - si se pide en `product_refs`, la respuesta es **422 `PRODUCT_NOT_ESTIMABLE`**;
     - por defecto no se incluye, porque Sync v1 solo publica consumo de unidades enlazables.
2. **Cifra copiada.** Un punto `VERIFIED_CONSUMPTION` copia **exactamente** el `totalBase` de una divulgación **vigente** (`withdrawnAt` nulo) de consumo de esa celda (tenant, campaña, producto, unidad). Lo garantiza la base.
3. **Fuente propuesta: la versión sellada de cada campaña CERRADA (F07)**, cuya cifra está en la divulgación referenciada (`CollectiveSealEntry.releaseId`).
   - Cada punto puede guardar `sourceSealId`. Si lo guarda, la base exige que la divulgación sea la entrada `DISCLOSED` y visible de ese sellado.
   - Al construir:
     - `SUPPRESSED_*`, `OVERFLOW` y una visibilidad retirada → `HIDDEN`;
     - sin celda → `NO_RECORD`.
   - **Exigir el sellado** en todo consumo comprobado, o admitir divulgaciones de campañas no selladas, es la decisión **EST-D-03**. La base, hoy, no lo exige.
4. **Canónico.** El producto canónico es el vigente según `ProductCanonicalAssociation`, como en la consolidación F06; la base rechaza una denominación asociada.
   - Un cambio de asociaciones o de cifras crea una **versión nueva** de la serie (`version + 1`, `previousSeriesId`).
   - La anterior se conserva con las ejecuciones que la usaron.
5. **Comparabilidad.** Las campañas son de la misma temporada institucional, con igual definición y duración y cobertura conocida, en orden cronológico.
   - El servicio la guarda como `comparabilityKey`.
   - **`AgriculturalCampaign` no tiene hoy ningún atributo de temporada:** de dónde sale la clave es la decisión **EST-D-02**.
6. **Cobertura.** La cobertura «N de M» de cada cifra va en `coverageReported` y `coverageExpected`, completa o nula. No es el número de aportantes de una fila.
   - RN-25 exige cobertura identificada: un tramo con cobertura desconocida da `INCOMPATIBLE_DATA` con `COVERAGE_UNKNOWN`. Lo decide F12-EST-03; la base no lo exige punto a punto.
   - Su base exacta es la decisión **EST-D-09**.
7. **Política pendiente.** Si la política de divulgación está en `POLICY_PENDING`, no hay cifras publicadas:
   - **no se calcula ni se registra** ejecución: **409 `POLICY_PENDING`**, el mismo código que ya usan las propuestas;
   - **ninguna lectura entrega cifras:** también 409 (§4.2).
   - La base rechaza una ejecución con `disclosureMode = POLICY_PENDING`.

## 4. Rutas (v1) y semántica

Todas las rutas están bajo `/api/v1/estimation`, con bearer y respuestas JSON con `contract_version: 1`. Las cantidades van en la unidad base, como texto: enteros para la serie y el naive, y decimal con hasta 6 cifras para la estimación. La unidad de presentación es `L` o `KG`.

| Método y ruta | Roles | Escribe | Propósito |
|---|---|---|---|
| `POST /estimation/runs` | DIRECTIVA, ADMINISTRADOR | Una ejecución y sus resultados, una vez | CU-20 |
| `GET /estimation/runs` | DIRECTIVA, ADMINISTRADOR | No | Ejecuciones anteriores, paginadas con un cursor opaco |
| `GET /estimation/runs/{runId}` | DIRECTIVA, ADMINISTRADOR | No | Ejecución completa: parámetros, política, resultados, serie y vigencia derivada |
| `GET /estimation/results?target_campaign_ref=` | AGRICULTOR, DIRECTIVA, ADMINISTRADOR | No | CU-21: resultado por producto para la campaña objetivo, con vigencia y perfil |
| `GET /estimation/download?target_campaign_ref=` | AGRICULTOR, DIRECTIVA, ADMINISTRADOR | No | RF-40: copia para consultar sin conexión, con perfil |

No existen `PUT`, `PATCH` ni `DELETE` en INT-09, y lo comprueba `openapi:check` (§12).

### 4.1 Generación

**Petición:** `{ contract_version: 1, request_id, target_campaign_ref, product_refs? }`.
- `request_id` es un UUID de idempotencia. La base guarda la huella de la petición canónica (`requestHash`: campaña objetivo y productos pedidos):
  - el mismo identificador con la misma huella devuelve **200** con la misma ejecución, sin calcular de nuevo;
  - con otra huella devuelve **409 `REQUEST_ID_REUSED`**.
- La campaña objetivo debe ser del sindicato (si no, **404 `TARGET_CAMPAIGN_NOT_FOUND`**) y estar `PLANIFICADA` o `ABIERTA` (si no, **422 `TARGET_CAMPAIGN_NOT_ELIGIBLE`**) (EST-D-06).
- Un `product_refs` inexistente o de otro sindicato da **404 `PRODUCT_NOT_FOUND`**. Uno propio no canónico o con unidad no enlazable da **422 `PRODUCT_NOT_ESTIMABLE`**.

**Proceso:**
1. Leer las fuentes (§3).
2. Construir o reutilizar las series (F12-EST-02).
3. Clasificar las posiciones y el tramo (F12-EST-03).
4. Calcular SES y naive (F12-EST-04).
5. Registrar la ejecución con sus resultados **en una sola transacción** (§6.3).

**Respuesta: 201.**
- La ejecución lleva `outcome: CALCULATED` o, si el cálculo falla, `outcome: FAILED` con `failure_code` (`CALCULATION_FAILED` o `SOURCES_UNAVAILABLE`). En ese caso no hay ninguna cifra, pero la ejecución **sí se registra** (RN-27, RN-28).
- **Datos insuficientes:** menos de 3 campañas consecutivas comprobadas, o la última campaña pertinente sin consumo comprobado. Se informa **por producto** con `status: INSUFFICIENT_DATA` y su `reason_code`, sin cifras.
- **Datos incompatibles:** `INCOMPATIBLE_DATA`, con `MIXED_UNITS`, `NO_COMPARABLE_CAMPAIGNS` o `COVERAGE_UNKNOWN`.
- **Fallo del cálculo** en un producto: `CALCULATION_FAILED`, con `CALCULATION_ERROR`.
- Que el SES no mejore al naive **no** es un error: es un resultado `ESTIMATED` válido (RN-28).

**Sucesión: una sola cadena por campaña objetivo.**
- La primera ejecución no tiene anterior, y cada una de las siguientes referencia la anterior (`previousRunId`) sin modificarla.
- La base admite **una sola raíz y un solo sucesor por ejecución**. Dos solicitudes simultáneas no pueden crear dos raíces ni suceder a la misma ejecución: la segunda recibe **409 `RUN_SUCCESSION_CONFLICT`** y puede reintentar.

**Cálculo en la petición (EST-D-04).** 3.12.7 prevé calcular por lotes fuera de las solicitudes interactivas. La v1 propone calcular **dentro** de la petición, con límites: como mucho 200 productos, y un número de campañas acotado por la temporada. Así una ejecución se registra una sola vez y completa, sin estados intermedios que obligarían a modificar filas. Si hace falta procesar por lotes, una v2 añadiría un recurso de trabajo sin alterar las ejecuciones.

### 4.2 Consulta, ejecuciones anteriores y política vigente

**`GET /estimation/results`** devuelve, por producto:
- el resultado de la **ejecución `CALCULATED` más reciente** de la campaña objetivo que lo incluye;
- si no hay ninguna, el de la ejecución más reciente que lo incluye, una `FAILED`, para informar `NOT_USABLE`.

Así una ejecución fallida posterior **no oculta** un resultado vigente. La consulta lleva además:
- la vigencia (`validity` y `validity_reason`) derivada en `evaluated_at` (§8);
- el `profile` del rol (§2);
- el texto fijo `notice`.

Sin ejecuciones, la lista va vacía. **Nunca hay cifras fabricadas.**

**`GET /estimation/runs` y `GET /estimation/runs/{runId}`** muestran el historial completo, incluidas las ejecuciones fallidas y las sustituidas, con su vigencia derivada (RN-27).

**La política vigente se aplica al leer**, en todas las rutas (3.12.3.4: «Un resultado histórico sigue sujeto a los permisos y a la política de divulgación vigentes»):
- En `POLICY_PENDING`, las cuatro rutas de lectura responden **409 `POLICY_PENDING`**, sin cifras.
- Un punto cuya cifra ya no se divulga se entrega como `HIDDEN`, sin cantidad, aunque la fila guarde la cantidad que tenía al construirse. Por ejemplo, una visibilidad retirada después del sellado, o una cifra oculta por una política más estricta.
- Un resultado que usó una cifra que ya no se divulga se entrega **sin cifras** (`estimate_base` y `naive_base` nulos), con `validity: OUTDATED` y `validity_reason: SOURCES_WITHDRAWN`. Así **la estimación no revela lo que la consulta directa oculta** (3.12.6.3).

## 5. Procedencia, versiones y huellas

- **`ConsumptionSeries.sourceHash`:** SHA-256 en hexadecimal de la lista canónica de fuentes. Cubre las campañas en orden y, por cada una, el sellado, la divulgación, el estado de visibilidad y las asociaciones canónicas usadas con su `validFrom`. **`sources`** guarda esa lista (JSON) para poder auditarla.
- **`EstimationRun`:** guarda el método (`SES_NAIVE`), `methodVersion`, los parámetros, el horizonte (1), la política de divulgación aplicada (`disclosureMode`, `policy`, `threshold`), la campaña objetivo, la clave de comparabilidad, `requestHash` y `generatedAt`, que es la hora del servidor.
- **`EstimationRun.contentHash`:** SHA-256 de la ejecución y de todos sus resultados, serializados de forma canónica, con los campos y el orden fijados en F12-EST-05. Permite comprobar que una ejecución **no se alteró**. La conservación depende además de que no haya rutas de modificación y de los disparadores (§6.3).
- **Cada resultado** referencia la versión de la serie que usó (`seriesId`). Así quedan identificadas las fuentes y sus versiones de cada cifra (RF-37, DAT-19).

## 6. Modelo de datos (migración `20261101233651_f12_est_01_estimation`)

### 6.1 Tablas

Los nombres siguen la convención del repositorio: PascalCase, sin `@@map`, ids UUID, FK `Restrict`.

| Nombre del diseño (3.12.3.4) | Tabla | Contenido |
|---|---|---|
| `consumption_series` | `ConsumptionSeries` | Tenant, producto canónico, unidad base, `comparabilityKey`, `version`, `previousSeriesId`, `sourceHash`, `sources`, `builtAt` |
| `series_point` | `SeriesPoint` | Serie, `position`, campaña, `kind`, `quantityBase` (solo comprobado), cobertura N de M, `sourceSealId`, `sourceReleaseId` |
| `estimation_run` | `EstimationRun` | Tenant, `requestId`, `requestHash`, solicitante y rol, campaña objetivo, `comparabilityKey`, contrato, método y versión, parámetros, `horizon`, política aplicada, `outcome`, `failureCode`, `previousRunId`, `contentHash`, `generatedAt` |
| `estimation_result` | `EstimationResult` | Ejecución, producto canónico, unidad base, serie, `status`, `reasonCode`, `estimateBase`, `naiveBase`, `alpha`, `fitInformative`, `fitCriterion`, tramo (`spanFirstPosition`, `spanLastPosition`), `exclusions`, `validations`, `metrics` |

`estimation_cache` del diseño no es una tabla del servicio: es la copia del cliente, en SQLite o IndexedDB (§9).

### 6.2 Restricciones

**`SeriesPoint_values` (RN-26):**
- `VERIFIED_CONSUMPTION` ⇔ hay cantidad ⇔ hay divulgación de origen. La cantidad es ≥ 0, de modo que **el cero es válido**.
- `NO_RECORD` y `HIDDEN` no llevan cantidad ni divulgación.
- La cobertura va completa (N ≤ M) o nula.

**`EstimationResult_values` (RN-28):**
- **Solo `ESTIMATED`** lleva cifras: estimación, naive, α, `fitInformative`, `fitCriterion` y, si existen, `metrics`. Además exige una serie y un tramo de **al menos tres** posiciones.
- Los demás estados llevan un `reasonCode` de la lista cerrada y **ninguna cifra**. `CALCULATION_FAILED` solo admite `CALCULATION_ERROR`.
- La serie y el tramo de un estado sin cifras son **contexto**, no cifras: por ejemplo, un tramo de dos posiciones en `SPAN_TOO_SHORT`.
- α está entre 0 y 1; las cifras son ≥ 0.

**`EstimationRun_values`:**
- contrato 1, `horizon` = 1 y método `SES_NAIVE`;
- `requestedByRole` es DIRECTIVA o ADMINISTRADOR;
- `disclosureMode` no vacío ni `POLICY_PENDING`;
- `failureCode` de la lista cerrada, si y solo si la ejecución es `FAILED`;
- huellas en hexadecimal de 64 caracteres.

**`ConsumptionSeries_values`:** la versión 1 no tiene serie anterior y las siguientes sí; la huella es hexadecimal; `sources` es una lista.

**Unicidad:**
- una serie por (tenant, producto, unidad, clave, versión), con un solo sucesor;
- un `requestId` por tenant;
- **una sola ejecución raíz por tenant y campaña objetivo** (índice único parcial `EstimationRun_one_root_per_target`, solo en SQL, como `ProductCanonicalAssociation_one_active_per_product`) y un solo sucesor por ejecución;
- un punto por campaña en cada serie;
- un resultado por (ejecución, producto, unidad).

**Lo que la base no comprueba.** Solo comprueba la **aritmética** del tramo. Que las posiciones existan, sean comprobadas, contiguas y finales, y que el naive sea el último valor, lo garantiza el cálculo (F12-EST-03 y F12-EST-04), no la base.

### 6.3 Inmutabilidad y pertenencia (disparadores)

**Inmutabilidad.** `ConsumptionSeries`, `SeriesPoint`, `EstimationRun` y `EstimationResult` **rechazan UPDATE, DELETE y TRUNCATE**, con «… es inmutable».

**Misma transacción.** Los puntos y los resultados solo se insertan en la misma transacción que crea su serie o su ejecución, con la comparación `xmin` frente a `pg_current_xact_id()` del sellado F07. Una serie o una ejecución **no admite añadidos posteriores**.

**Pertenencia:**
- la campaña, el producto, la divulgación y el sellado de cada fila son del mismo tenant;
- el producto es **canónico**: no es hoy denominación de otro;
- la divulgación de un consumo comprobado es la **vigente** de `CONSUMPTION_TOTAL` de esa celda y **con la misma cifra**;
- si el punto cita un sellado, la divulgación es la entrada `DISCLOSED` y visible de ese sellado;
- la serie anterior es del mismo ámbito y de la versión inmediatamente anterior;
- la ejecución anterior es de la misma campaña objetivo y no posterior;
- el solicitante es Member **activo** del tenant con el rol registrado;
- una ejecución `FAILED` no admite resultados `ESTIMATED`;
- la serie de un resultado es del mismo producto, unidad y clave.

**Reparto del trabajo.** La forma de cada fila la decide el CHECK; los disparadores solo validan las referencias de filas bien formadas.

### 6.4 Lo que no hay

- **Ninguna columna de vigencia.** Se deriva al consultar (§8).
- **Ningún campo de aprobación manual** (§7).
- **Ninguna ruta de modificación o borrado.**
- **`DemandForecast`** no se toca: la migración no lo menciona, y la prueba de §12 compara las columnas, restricciones, índices y disparadores de **todas** las tablas previas antes y después. Su retiro sigue en el epic #81.

## 7. Sin aprobación por resultado; separación de conceptos

No hay estados de aprobación, revisión ni publicación de un resultado: los resultados se entregan según los permisos. La decisión humana se ejerce en la **propuesta conjunta**.

Ninguna ruta de INT-09:
- escribe en necesidades declaradas, propuestas, compras, lotes, movimientos ni inventarios;
- suma la estimación a nada.

F12-EST-08 solo podrá mostrarla en una columna separada (RN-29).

## 8. Vigencia derivada al consultar

Para un resultado de la ejecución *E* (campaña objetivo *T*, producto *P*, unidad *U*), en este orden:

1. **`NOT_USABLE`:** *E* es `FAILED` (`RUN_FAILED`) o el resultado no es `ESTIMATED` (`NO_FIGURE`).
2. **`SUPERSEDED`:** existe una ejecución posterior `CALCULATED` del mismo sindicato y campaña *T* que incluye un resultado de (*P*, *U*), de cualquier estado (`LATER_RUN`) (EST-D-08). Una ejecución posterior `FAILED` **no** sustituye.
3. **`OUTDATED`:** cambiaron de forma conocida las cifras o asociaciones que la sustentan.
   - `SOURCES_CHANGED`: por ejemplo, la serie vigente de (*P*, *U*, clave) tiene otra `sourceHash`. Cómo se detecta exactamente se fija en F12-EST-05 (EST-D-12).
   - `SOURCES_WITHDRAWN`: alguna cifra usada ya no se divulga; en ese caso, además, **no se entregan sus cifras** (§4.2).
4. **`CURRENT`:** en los demás casos.

Si la identidad no tiene permiso vigente al consultar, **no se entrega** el resultado (RF-38): la vigencia no sustituye a la autorización.

## 9. Copia descargada (RF-40, RN-30, DAT-20)

**Contenido.** `GET /estimation/download` sigue la misma selección, perfil y política que `/results` y devuelve:
- `profile`, `scope` y `subject` (el Member y el rol que descargan);
- `downloaded_at` (hora del servidor) y la campaña objetivo (período);
- por producto, el resultado permitido con `generated_at`, `validity_at_download` y su motivo;
- `may_be_outdated: true`, que es constante;
- el `notice` fijo;
- `storage`, con las reglas de la copia.

No contiene puntos de la serie, aportes ni información privada de otros agricultores; el perfil de Agricultor tampoco lleva el naive ni la cobertura.

**Obligaciones de los clientes** (F12-EST-07-MOB y F12-EST-07-WEB):
- Guardar la copia asociada a la identidad (`subject`) y al ámbito (`scope`).
- Descartarla al cambiar de identidad o al cerrar la sesión.
- Reemplazarla solo por una versión más reciente de la misma identidad y ámbito.
- Mostrar siempre la fecha de generación, la fecha de descarga, el período, la vigencia que tenía al descargarse y el aviso de posible desactualización.
- Sin copia, informar la limitación **sin fabricar cifras**.
- **Respaldo privado.** La copia queda **fuera del respaldo privado** por defecto: es una decisión del autor del 2026-10-31, registrada en la conciliación y en el comentario de BE #151. Se declara como `storage.backup: EXCLUDED_FROM_PRIVATE_BACKUP`.
- **Mobile.** La copia irá en Inventario, en SQLite (F12-EST-07-MOB; esquema 13 si integra después de F04-AV).

Desconectado, el cliente no conoce revocaciones ni cambios de fuentes: la copia **no es una autorización vigente**.

## 10. Coherencia con el diseño aprobado

| Exigencia | Dónde queda en el contrato |
|---|---|
| Campañas comparables y tramo consecutivo final | `comparabilityKey` y orden por `position` (§3, §6.1); tramo y `exclusions` en `EstimationResult`. La base solo exige el mínimo de tres posiciones; la semántica del tramo es de F12-EST-03 (§6.2) |
| SES frente a naive para la campaña siguiente | `method = SES_NAIVE`, `horizon = 1`, `estimateBase` y `naiveBase`; los parámetros de 3.12.4.8 están en el OpenAPI (`Parameters`) |
| Datos insuficientes sin cifras inventadas | `INSUFFICIENT_DATA` e `INCOMPATIBLE_DATA` con motivo cerrado y sin cifras (CHECK); `NO_RECORD` y `HIDDEN` sin cantidad (CHECK); resultados sin cifras si una fuente se retiró (§4.2) |
| Estimación separada de necesidades y propuestas | §7; ninguna ruta escribe fuera de INT-09; `notice` fijo en la consulta y en la copia |
| Consulta descargada en Mobile y PWA, vinculada a identidad y ámbito, con fechas y aviso | §9 y los esquemas `InstitutionalDownload` y `FarmerDownload` |

## 11. Decisiones concretas pendientes

Los identificadores llevan el prefijo `EST-D` para no confundirse con otras decisiones publicadas (D-03, D-04 y D-07 del bloque 2).

| Id | Decisión | Propuesta de este contrato | Quién o cuándo |
|---|---|---|---|
| EST-D-01 | Alinear `CURRENT_SCOPE.md` §11 y los `AGENTS.md`, que excluyen el «forecasting», con la estimación SES/naive del v1.22.1 | ADR que distinga la estimación exploratoria de 3.12.4.8 de la predicción por IA y de las recomendaciones automáticas, que siguen excluidas | Roderich, antes de implementar F12-EST-02 |
| EST-D-02 | Origen de `comparabilityKey`: `AgriculturalCampaign` no tiene temporada ni definición | Atributo nuevo de campaña asignado por la Directiva (migración aditiva en F12-EST-02) frente a una convención de nombres | Roderich, en F12-EST-02 |
| EST-D-03 | Fuentes: exigir el sellado en todo consumo comprobado, o admitir divulgaciones de campañas cerradas sin sellar | Solo selladas: cifras inmutables y la misma política que el historial F07. La base hoy no lo exige; se añadiría un CHECK | F12-EST-02 |
| EST-D-04 | Calcular en la petición o por lotes (3.12.7) | En la petición, con límites; por lotes en una v2 sin alterar las ejecuciones | Roderich |
| EST-D-05 | Perfil del Agricultor | Sin naive, cobertura ni serie; con la estimación y el riesgo de que iguale la última cifra declarado. Confirmar con la política institucional (GOV-02, #107) o quitar también la estimación | Roderich |
| EST-D-06 | Campaña objetivo admisible | Del sindicato y `PLANIFICADA` o `ABIERTA` | F12-EST-05 |
| EST-D-07 | Redondeo de la estimación | 6 decimales en la unidad base; el modo de redondeo se fija en F12-EST-04 | F12-EST-04 |
| EST-D-08 | Qué sustituye a un resultado | Una ejecución posterior `CALCULATED` que incluya el producto, en cualquier estado; una `FAILED`, no | F12-EST-05 |
| EST-D-09 | Base de la cobertura «N de M» de cada punto y su exigencia | La que registra el sellado de esa campaña para la celda; `COVERAGE_UNKNOWN` si falta en el tramo | F12-EST-02 y F12-EST-03 |
| EST-D-10 | Generar o leer con la política en `POLICY_PENDING` | 409 `POLICY_PENDING`, sin registrar ejecución ni entregar cifras | F12-EST-05 |
| EST-D-11 | Retención de series y ejecuciones | Sin borrado: crecen por ejecución; la política de retención queda para GOV-02 | Roderich |
| EST-D-12 | Detección de `OUTDATED` | Comparar la huella de las fuentes vigentes al consultar con `sourceHash` | F12-EST-05 |
| EST-D-13 | Un «permiso de estimación» más fino que el rol (tabla 3.47) | No crear otro sistema: equivale al rol DIRECTIVA o ADMINISTRADOR. Si se exige, va en un ADR aparte | Roderich |

## 12. Especificado frente a comprobado

| Afirmación | Estado | Cómo |
|---|---|---|
| Rutas, peticiones, respuestas, perfiles, errores, vigencia, política al leer y copia descargada | **Especificado** | `docs/api/openapi-f12-estimation.json` |
| La especificación es coherente y completa (detalle debajo) | **Comprobado por script** | `Back/scripts/openapi-f12-estimation.cjs`, dentro de `npm run openapi:check` |
| Que no hay rutas `/api/v1/estimation` implementadas | **Comprobado por script** | El mismo script, contra `openapi-f02.json`, que se genera desde el código |
| Rechazo HTTP 403 de una identidad sin permiso de generación; 409 en `POLICY_PENDING`; selección de la consulta; perfiles; retirada de cifras al leer | **Solo especificado** | No hay controlador. Se probará en F12-EST-05 y F12-EST-06 |
| Rechazos de la base (detalle debajo) | **Comprobado contra PostgreSQL** | `f12-est-01-estimation-schema.postgres.spec.ts` (9 pruebas) |
| La migración es aditiva: conserva las filas, columnas, restricciones, índices y disparadores de todas las tablas previas, y no cambia `DemandForecast` | **Comprobado contra PostgreSQL** | La misma suite, desde la base previa (13 migraciones) con datos sintéticos |
| SES, naive, series, tramo, vigencia y clientes | **No construido** | F12-EST-02 a F12-EST-07 |

**Lo que comprueba el script** sobre la especificación:
- OpenAPI 3.0.3, referencias resueltas y ningún `$ref` con hermanos;
- bearer, objetos cerrados y sin `PUT`/`PATCH`/`DELETE`;
- roles anotados por operación (`x-roles`; no hay `@Roles` con qué contrastarlos), y 401, 403 y 409 `POLICY_PENDING` en todas;
- perfiles, con el del Agricultor sin naive, cobertura ni serie;
- enums iguales a los del esquema Prisma, y códigos cerrados iguales a los de la migración;
- ningún campo de aportes ni de aprobación, en esquemas y parámetros;
- la copia descargada con sus campos obligatorios.

**Lo que rechaza la base:**
- un solicitante AGRICULTOR, inactivo o de otro sindicato;
- una política pendiente;
- mezclar cero, ausencia y dato oculto;
- una cifra distinta de la divulgada vigente;
- una entrada de sellado ajena;
- un producto no canónico;
- cifras fuera de `ESTIMATED`;
- dos raíces o dos sucesores;
- un antecesor posterior;
- UPDATE, DELETE y TRUNCATE;
- añadidos fuera de su transacción.

`npm run openapi:check` **sin** el script nuevo solo comparaba los cuatro archivos generados desde el código (`openapi-f02`, `-f05-sync-v1`, `-f06-collective` y `-f08-backups`). Un archivo nuevo en `docs/api/` habría pasado sin leerse. Por eso que pase sobre la API existente no demostraba nada del contrato nuevo.

## 13. Registro de revisiones

| Fecha | Cambio |
|---|---|
| 2026-11-01 | Versión inicial (F12-EST-01, #174) |
| 2026-11-01 | Tras una lectura de contraste de otro agente de la sesión, antes del primer commit, se corrigieron cinco bloqueantes: el perfil del Agricultor sin naive ni cobertura, la política vigente al leer, la selección de la consulta frente a la vigencia, las unidades no enlazables como 422 y los CHECK de las cifras. También se corrigieron menores: una sola cadena por campaña objetivo, la cifra igual a la divulgada, la entrada sellada, el Member activo, el producto canónico, los códigos cerrados, `TRUNCATE`, `requestHash`, `$ref` anulables y los textos de 401 y 403 |
