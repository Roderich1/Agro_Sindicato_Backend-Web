# F12-EST-01 — Contrato INT-09: estimación del consumo (v1)

- **Fecha real:** 2026-11-01 y 2026-11-02 (UTC); 2026-11-01 en Bolivia. Conciliado dos veces el 2026-11-02 (UTC) con las decisiones del autor del §11.
- **Estado:** **implementado en el servicio y en sus dos clientes de la copia** (PWA #180; Mobile #164 en AppMovilAgroquimico `main` `c2ac44a`). El contrato es una propuesta del autor, no una aprobación institucional, de la Directiva ni del tutor.
  - **Rutas implementadas desde F12-EST-05 (#178):** `POST /estimation/jobs`, `GET /estimation/jobs/{jobId}`, `GET /estimation/runs`, `GET /estimation/runs/{runId}`, `GET /estimation/results`, `POST /estimation/campaign-classifications/{campaignId}/corrections` y `GET /estimation/campaign-classifications/{campaignId}/history`.
  - **Temporadas y clasificación inicial** (`POST`/`GET /estimation/seasons`, `POST`/`GET /estimation/campaign-classifications`): implementadas en la continuación de #190, con Refs #175 (§12).
  - **Descarga** (`GET /estimation/download`): implementada en F12-EST-07-WEB, con Refs #180 (§9 y §12). Con ella existen en el código las doce operaciones especificadas.
  - **Lo construido:**
    - el esquema de datos (§6), con su migración aditiva;
    - la cobertura de consumo de los sellados F07 nuevos (§3.1), implementada en el caso de uso del sellado;
    - desde F12-EST-02 y F12-EST-03 (#175, #176), la preparación de fuentes, la construcción de series y su lectura para una campaña objetivo (§3.2), sin rutas;
    - desde F12-EST-04 (#177), el motor SES/naive como función pura sobre el tramo `READY` (§3.3);
    - desde F12-EST-05 (#178), los trabajos, el trabajador por lotes, las ejecuciones y resultados solo por inserción, la vigencia derivada al consultar y las rutas anteriores (§4.2, §4.3, §8).
- **Issue:** [#174](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/174) (F12-EST-01), entregable E7.1 de 3.13.2. Lo siguen F12-EST-02 a F12-EST-08.
- **Bases:**
  - Backend `main` `b81ff23`.
  - Mobile `main` `4ca2088`, solo como referencia de los clientes; Mobile no cambia.
  - Documento entregado `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`, sin modificar.
- **Requisitos:** CU-20, CU-21; RF-35 a RF-40; RN-25 a RN-30; INT-09; DAT-18, DAT-19, DAT-20.
- **Diseño:** 3.12.3.4 (figura 3.15 c), 3.12.4.8, 3.12.6 (tablas 3.47 a 3.49), 3.12.7 y tabla 3.42.
- **Alcance:** [ADR-004](../adr/ADR-004-estimacion-exploratoria-ses-naive.md).
- **Especificación de rutas:** [`docs/api/openapi-f12-estimation.json`](../api/openapi-f12-estimation.json). Es la fuente de las formas exactas; este documento fija la semántica.
- **No cambia:**
  - Sync v1 (F05), la proyección colectiva y su política (F06, F07-POL-01) ni el historial sellado (F07);
  - los respaldos privados (F08), el modelo de roles (`UserRole`), ADR-003 ni `DemandForecast`;
  - ninguna tabla existente.

## 0. Relación con el alcance del repositorio

La discrepancia EST-D-01 queda resuelta por [ADR-004](../adr/ADR-004-estimacion-exploratoria-ses-naive.md), del 2026-11-01:
- **Incluye** la estimación exploratoria con suavizamiento exponencial simple (SES) frente a la línea base naive, y reconoce que SES es un método de pronóstico estadístico.
- **Mantiene excluidos:**
  - ARIMA, Prophet, redes neuronales y cualquier modelo de IA;
  - variables climáticas, de precios u otras externas;
  - recomendaciones y decisiones automáticas;
  - sumar la estimación a necesidades, propuestas, compras o inventarios (RN-29).
- **Textos alineados:** `CURRENT_SCOPE.md` §11, `AGENTS.md`, `Back/AGENTS.md` y `Web/AGENTS.md`. La ADR conserva el texto anterior.
- **F06 acotado** (decisión del autor del 2026-11-02, UTC). `F06_COLLECTIVE_PROJECTION_CONTRACT.md` §1 ya no excluye el pronóstico en general:
  - F06 conserva su responsabilidad de proyección colectiva y no calcula pronósticos;
  - F12 calcula SES/naive en un módulo aparte, solo con cifras publicadas y selladas permitidas;
  - no se amplía el acceso a datos privados ni las reglas de divulgación.
- **No cambia** `F07_SEALED_HISTORY_CONTRACT.md` §8 («No incluye forecasting»): las tendencias F07 siguen sin estimación.

## 1. Conceptos que no se confunden

| Concepto | Qué es | Dónde vive |
|---|---|---|
| Consumo publicado | Cifra colectiva de `CONSUMPTION_TOTAL` por campaña, producto canónico y unidad base que superó la política de divulgación | `CollectiveRelease` y la versión sellada (F06/F07) |
| Necesidad declarada | Lo que cada agricultor declara (`DECLARED_NEED`) | Sync v1, propuestas |
| Temporada | Definición institucional de campañas comparables: clave, definición y duración, asignadas por la Directiva (EST-D-02) | `ComparabilitySeason` y `CampaignSeasonClassification` (§6) |
| Trabajo | Solicitud de cálculo por lotes y su estado operativo (EST-D-04) | `EstimationJob` (§6) |
| Estimación | Referencia calculada para la campaña siguiente comparable (h = 1) | `EstimationRun` y `EstimationResult` (§6) |
| Propuesta conjunta | Borrador que las personas revisan | `JointPurchaseProposal`; la estimación solo se muestra en una columna aparte (F12-EST-08, §7.1) y nunca se suma |

**Clase de cada posición de la serie (RN-26, DAT-18):**
- `VERIFIED_CONSUMPTION`: consumo comprobado, incluido el **cero**. Procede siempre de la versión sellada de una campaña cerrada (§3).
- `NO_RECORD`: no hay cifra publicada y sellada.
- `HIDDEN`: el sellado la oculta, o su visibilidad se retiró.

Las dos últimas **nunca** son cero, no se interpolan y no entran en el cálculo.

**Trabajo, resultado y vigencia:**
- El **estado del trabajo** (`QUEUED`, `RUNNING`, `COMPLETED`, `NOT_EXECUTED`) es operativo: solo avanza y nunca es la vigencia de un resultado.
- El **resultado** de una ejecución (`CALCULATED` o `FAILED`) y de cada producto (`ESTIMATED`, `INSUFFICIENT_DATA`, `INCOMPATIBLE_DATA`, `CALCULATION_FAILED`) se escribe una vez.
- La **vigencia** (`NOT_USABLE`, `SUPERSEDED`, `OUTDATED`, `CURRENT`) se deriva al consultar y **no se almacena** (§8).

**Copia descargada:** pertenece al cliente (Mobile o Web), asociada a una identidad y un ámbito. No es una autorización vigente (§9).

## 2. Identidad, ámbito y permisos

**Mecanismo (EST-D-13).** Se usa la autorización existente por roles; **no se crea otra**.
- `JwtAuthGuard` y `RolesGuard` son globales (`iam.module.ts`).
- `CurrentAuthContextResolver` revalida en la base, en cada petición, el usuario, el Member, el tenant y la sesión (V1 Web y V2 Mobile). Una cuenta, un Member o un tenant inactivos reciben **401**.
- Las rutas usan `@Roles(...)` y `@CurrentUser()`.
- La «Directiva con permiso de estimación» de la tabla 3.47 equivale al rol DIRECTIVA, o ADMINISTRADOR con funciones de Directiva (ADR-003). No hay un permiso más fino.

**Ámbito.** El ámbito es siempre el **sindicato del Member autenticado** (`principal.tenantId`).
- El cliente nunca envía `tenantId`.
- Las referencias que envía (campaña, temporada, producto, trabajo, ejecución) se buscan **dentro** de ese tenant. Una referencia de otro sindicato responde igual que una inexistente (**404**), como en F06/F07.

| Acción | AGRICULTOR | DIRECTIVA | ADMINISTRADOR (ADR-003) | Mecanismo |
|---|---|---|---|---|
| Definir temporadas y clasificar campañas (EST-D-02) | 403 | Sí, en su sindicato | Sí, en su sindicato | `@Roles(DIRECTIVA, ADMINISTRADOR)` |
| Pedir una estimación (`POST /estimation/jobs`, CU-20) | 403 | Sí | Sí | Ídem |
| Estado de un trabajo, ejecuciones anteriores y detalle con la serie | 403 | Sí | Sí | Ídem |
| Consultar resultados permitidos (CU-21) | Perfil de Agricultor | Perfil institucional | Perfil institucional | `@Roles(AGRICULTOR, DIRECTIVA, ADMINISTRADOR)`; el perfil sale del rol |
| Descargar la copia (RF-40) | Perfil de Agricultor | Perfil institucional | Perfil institucional | Ídem |
| Modificar o borrar temporadas, clasificaciones, series, ejecuciones o resultados | No existe ruta | No existe ruta | No existe ruta | Disparadores de §6.3 |
| Aprobar un resultado | No existe | No existe | No existe | §7 |

**Identidades sin permiso.** Reciben **403** del `RolesGuard` global, con el cuerpo `{ "statusCode": 403, "message": "No tienes permisos para esta acción", "error": "Forbidden" }`.
- La petición no llega al caso de uso.
- **No se encola, no se calcula ni se registra nada.**
- En las rutas implementadas se prueba por HTTP contra PostgreSQL (§12); en las demás sigue especificado.

**Defensa en profundidad, probada contra PostgreSQL (§12).** Quien define una temporada, clasifica una campaña, pide un trabajo o figura como solicitante de una ejecución debe ser, en el momento de cada escritura:
- Member **activo**;
- con **cuenta activa** (`User.isActive`);
- del tenant;
- con el rol registrado, DIRECTIVA o ADMINISTRADOR.

**Lo que no se entrega en ningún perfil:**
- inventarios privados, compras, cuentas familiares, fotografías ni existencias privadas;
- aportes individuales: cantidad por agricultor, Member que aporta o número de aportantes de una fila.
  - **Enmienda E3-P1 (decisión del autor, 2026-11-12):** la vista E3 de la referencia fijada en un borrador (`/collective/proposals/{id}/estimation-link`, sólo DIRECTIVA y ADMINISTRADOR) entrega, para un resultado **con cifra entregada**, el número de campañas del tramo y el **mínimo y el máximo** de aportantes de las cifras de consumo usadas, nunca por campaña ni identidades. No amplía el acceso: F07 ya entrega `contributors` de cada cifra publicada, también de `CONSUMPTION_TOTAL`, a esos roles (resumen e histórico sellado). Las rutas de INT-09 (`/estimation/…`) no cambian. Ver `E3_P1_OPCIONES_ALCANCE_COMPARABLE.md`.

La serie solo usa cifras ya publicadas y selladas (§3).

**Perfiles de lectura** (`profile` en la respuesta):
- **`INSTITUTIONAL`** (DIRECTIVA y ADMINISTRADOR): por producto, la estimación, la línea base naive, la cobertura y la vigencia. El detalle de una ejecución añade los puntos de la serie, que son las cifras publicadas que ya pueden leer en el historial sellado (F07).
- **`FARMER`** (AGRICULTOR, EST-D-05): por producto, el estado, el motivo, el método, las fechas, la temporada, la longitud del tramo, la vigencia y **solo la estimación**.
  - **Sin** línea base naive: es literalmente la última cifra publicada.
  - **Sin** cobertura ni serie: en F07, la cifra colectiva solo la lee la Directiva (3.12.6.3).
  - **La estimación puede coincidir con una cifra histórica publicada.** Ocurre, por ejemplo, con α = 1 o con un criterio constante, en que reproduce la última cifra, o con una serie constante. Entregarla al Agricultor proyecta información colectiva que hoy solo lee la Directiva (RF-39, tabla 3.49).
  - **Esa proyección debe estar contemplada en la política institucional** (F07-POL-01, #107, dentro de las decisiones institucionales de GOV-02, #185) antes de usar datos reales. Hoy la política es `F07-POL-01` en modo `PROVISIONAL_SYNTHETIC`: solo datos sintéticos y **no aprobada**. Este contrato no habilita datos reales ni declara aprobada ninguna política.

## 3. Fuentes de la serie (para F12-EST-02 y F12-EST-03)

1. **Variable.** Es el consumo publicado `CONSUMPTION_TOTAL` por producto canónico y unidad base `ML` o `G`, la misma de Sync v1 (RN-25).
   - No se convierten litros en kilogramos ni se mezclan presentaciones.
   - Un producto cuya unidad central no es enlazable (`baseUnitForCentralUnit` = null), o que no es canónico, **no es estimable**:
     - si se pide en `product_refs`, la respuesta es **422 `PRODUCT_NOT_ESTIMABLE`**;
     - por defecto no se incluye, porque Sync v1 solo publica consumo de unidades enlazables.
2. **Comparabilidad (EST-D-02, EST-D-14).** Son comparables las campañas cuya clasificación **vigente** es la misma temporada.
   - La Directiva define la temporada (`ComparabilitySeason`): clave de comparabilidad, definición y duración nominal en días.
   - Después clasifica cada campaña en una temporada (`CampaignSeasonClassification`, versión 1).
   - **Corrección:** una clasificación equivocada se corrige con una **versión nueva**, que exige un motivo y referencia a la vigente. Puede cambiar la temporada o dejar la campaña sin clasificar. Ninguna versión se reescribe (§4.1).
   - **Nada se infiere** de nombres ni de fechas.
   - Las campañas anteriores sin clasificación comprobada **quedan sin clasificar**: la migración no crea ninguna clasificación, y una campaña sin clasificar no entra en ninguna serie ni admite trabajos como campaña objetivo. La base lo garantiza; el 422 de la API está solo especificado.
   - Clasificar una campaña ya sellada **no altera** su sellado: la clasificación vive en otra tabla.
   - Las fechas de las campañas solo **ordenan** cronológicamente las campañas ya clasificadas; no deciden su temporada.
3. **Fuente sellada (EST-D-03).** Un punto `VERIFIED_CONSUMPTION` exige una **campaña CERRADA** y su **versión sellada** (F07). Lo garantiza la base.
   - Copia **exactamente** el `totalBase` de la divulgación que el sellado registra como entrada `DISCLOSED` visible de esa celda, que además es la vigente de `CONSUMPTION_TOTAL`.
   - **Procedencia exacta:** cada punto guarda `sourceSealId` y `sourceReleaseId`.
   - Al construir la serie:
     - una entrada `SUPPRESSED_*` u `OVERFLOW`, o con la visibilidad retirada, da `HIDDEN`, que cita el sellado que la oculta;
     - un sellado sin entrada de consumo de la celda da `NO_RECORD`, que cita ese sellado;
     - una campaña clasificada pero sin sellar da `NO_RECORD`, sin sellado. Nunca da consumo comprobado. La base no admite un `NO_RECORD` sin sellado en una campaña sellada.
   - **Al consultar se vuelve a comprobar la divulgación** (§4.3): una cifra que ya no se divulga se entrega oculta, y sus resultados, sin cifras.
4. **Canónico.** El producto canónico es el vigente según `ProductCanonicalAssociation`, como en la consolidación F06; la base rechaza una denominación asociada.
   - Un cambio de asociaciones, de cifras o de clasificaciones (una corrección) crea una **versión nueva** de la serie (`version + 1`, `previousSeriesId`).
   - Cada punto cita la versión de la clasificación que usó (`classificationId`), y la base solo admite la vigente al construir.
   - La anterior se conserva con las ejecuciones que la usaron.
5. **Política pendiente (EST-D-10, decidida).** Si la política de divulgación está en `POLICY_PENDING`, no hay cifras publicadas:
   - **no se encola ni se registra** nada: **409 `POLICY_PENDING`**, el mismo código que ya usan las propuestas;
   - si pasa a pendiente con un trabajo en cola, el trabajo termina `NOT_EXECUTED` con `POLICY_PENDING`, sin ejecución;
   - **ninguna lectura entrega cifras:** también 409 (§4.3);
   - la base rechaza una ejecución con `disclosureMode = POLICY_PENDING`;
   - un trabajo no se reanuda sin volver a comprobar las condiciones: cada intento, también el que retoma un trabajo tras un error transitorio o un plazo vencido, vuelve a observar el permiso, la política y la campaña antes de calcular (§4.2);
   - esta regla no es la aprobación institucional de la política (F07-POL-01, #107) ni una decisión de GOV-02 (#185).
6. **Cobertura (EST-D-09).** La cobertura «N de M» que exige RN-25 se define en el §3.1.

### 3.1 Cobertura del consumo (EST-D-09)

**Lo que había.** `CollectiveSeal` guarda una cobertura general por campaña (F07 §5.2):
- M = `linkedMembers`;
- N = `membersWithContribution`, los Members de **alguna** cifra publicada, de **necesidad o de consumo**.

Es la «cobertura general» de 3.12.6.3, y **no se acepta** para la estimación porque mezcla necesidades y consumo (decisión del autor).

**Lo que hay ahora (implementado).** Desde la migración `20261102020000_f07_seal_consumption_coverage`, cada **sellado nuevo** guarda `CollectiveSealConsumptionCoverage`, en la misma transacción e inmutable. Definición exacta (F07 §5.3):

| Elemento | Definición |
|---|---|
| **M** (`linkedMembers`) | Members `AGRICULTOR` activos, con cuenta activa, del sindicato, leídos en la misma decisión del sellado. Igual a `CollectiveSeal.linkedMembers`, y la base lo exige |
| **N** (`membersInPublishedFigures`) | Members distintos con un aporte dentro de alguna cifra de `CONSUMPTION_TOTAL` **mostrada** por esa decisión: nueva (`RELEASE`) o anterior que se sigue mostrando (`SHOW_PRIOR`). Sin necesidades ni aportantes de celdas sin cifra |
| **Estado** | `IDENTIFIED`, con N y M y 0 ≤ N ≤ M, o `POPULATION_MISMATCH`, sin fracción |

**Misma población, comprobada en el código F07.**
- La regla 3 de F07-POL-01 retira una cifra en cuanto un Member de ella sale de la celda (`decideCell` y `decideCellWithRelated`). Por eso `SHOW_PRIOR` solo se da si **ningún** Member de la cifra anterior ha salido, y sus Members están en M.
- La advertencia anterior de este contrato, según la cual `SHOW_PRIOR` podía incluir a agricultores inactivos, era **incorrecta**.
- La cifra de quien se fue no se excluye en silencio: se retira y queda rotulada `SUPPRESSED_*`.
- Como la decisión lee en `READ COMMITTED`, una baja entre dos lecturas podría dejar un Member de N fuera de M. En ese caso no se registra ninguna fracción (`POPULATION_MISMATCH`), y F12 la trata como desconocida.

**Lo que acredita:** cuántos agricultores vinculados al sellar forman parte de alguna cifra de consumo publicada de esa campaña. Es **participación**.

**Lo que no acredita:**
- **Integridad:** que esos N registraran todo su consumo.
- **Consumo de los demás:** la ausencia de publicación de los M − N es desconocida, **nunca cero**.
- **Representatividad:** no dice que la cifra represente el consumo de todo el sindicato. Solo dice quiénes forman parte de ella. Esta distinción se mantiene en el contrato, en la evidencia y en cualquier presentación futura.
- **Un mínimo:** no se introduce ningún porcentaje mínimo. RN-25 exige cobertura **identificada**, no un umbral, y fijar uno sería una regla nueva sin justificación en el documento.

**Lo que no se usa como sustituto:**
- el número de aportantes de una fila (`contributorCount`);
- la membresía actual;
- la cobertura general.

**Cómo la usa F12** (F12-EST-02 y 03, construido; la entrega por la API sigue especificada):
- **Por punto.** Cada punto lee la cobertura de su sellado por `sourceSealId`, sin copiarla. El punto no tiene columnas de cobertura.
  - Sellado con fila `IDENTIFIED`: N de M.
  - Sellado anterior a la migración: `UNKNOWN`, `SEALED_BEFORE_COVERAGE`.
  - `POPULATION_MISMATCH`: `UNKNOWN`, `POPULATION_MISMATCH`.
  - Campaña sin sellar: `UNKNOWN`, `NOT_SEALED`.
- **Por resultado.** Un resultado solo puede ser `ESTIMATED` si **todas** las campañas de su tramo tienen la cobertura identificada; si no, `INCOMPATIBLE_DATA` con `COVERAGE_UNKNOWN`, sin cifras.
- **Entrega.** La cobertura de cada campaña del tramo se entrega por separado, sin agregarla (`SpanCoverage`), solo en el perfil institucional.
  - **Es una salida nueva:** F07 no sirve la N de consumo. Junto con la N general, deja saber cuántos Members están solo en cifras de necesidad.
  - No da cantidades ni toca celdas suprimidas, pero se declara para revisarla con F07-POL-01 y F10-SEC-02 antes de usar datos reales (F07 §5.3).
  - **Mientras no haya autorización institucional**, su exposición se limita al entorno sintético. La API de F07 no se amplía para mostrarla.

**Sellados anteriores.** No reciben fila ni se recalculan. Su cobertura de consumo sigue desconocida y no se reconstruye.

**Datos sintéticos.** `Back/src/modules/estimation/test-support/synthetic-sources.ts` crea campañas cerradas y selladas:
- con la cobertura conocida, después de la migración;
- sin ella, antes de la migración.

La suite F12 las usa (§12).

### 3.2 Construcción de series y tramo (F12-EST-02 y F12-EST-03, implementado sin rutas)

`Back/src/modules/estimation/application/consumption-series.use-case.ts` y `domain/series.ts`. Ningún controlador los alcanza.

**Construir la serie** de un producto canónico, su unidad base y una temporada (`build`):
1. **Antes de leer nada.**
   - Con la política en `POLICY_PENDING` no se construye nada.
   - La temporada y el producto se buscan en el sindicato; si son de otro, no existen.
   - El producto debe ser canónico y de unidad enlazable (`PRODUCT_NOT_ESTIMABLE` si no).
2. **Posiciones.** Son las campañas cuya clasificación **vigente** es la temporada, en orden cronológico, cada una con la versión de clasificación usada.
   - Una campaña clasificada sin cifra es una posición, nunca se salta.
   - Un período sin campaña registrada no puede detectarse, porque nada se infiere de las fechas.
3. **Clase de cada posición:**
   - **Campaña no cerrada, o cerrada sin sellar:** `NO_RECORD`, sin sellado.
   - **Campaña sellada:** según la entrada de consumo del producto en la última versión sellada.
     - Una entrada `DISCLOSED` visible cuya divulgación sigue vigente da `VERIFIED_CONSUMPTION` (también el cero), con la cifra exacta, el sellado y la divulgación.
     - Una entrada suprimida, desbordada o con la visibilidad retirada da `HIDDEN`.
     - Sin entrada, `NO_RECORD` con el sellado.
4. **Cobertura.** Se lee del sellado (§3.1), sin copiarla en el punto.
5. **Rechazos sin escribir nada:**
   - Si una cifra sellada del grupo canónico está en otra unidad base: `MIXED_UNITS`.
   - Si una cifra sellada es de un producto que **después** del sellado pasó a ser denominación de este: `CANONICAL_CHANGED_AFTER_SEAL`.
     - Las cifras selladas no se suman, porque sería publicar una cifra nueva.
     - Para una ejecución se informa como `INCOMPATIBLE_DATA` con `NO_COMPARABLE_CAMPAIGNS`.
   - Dos denominaciones asociadas **antes** del sellado ya forman una sola cifra en F07 y se estiman juntas.
   - **Alcance de la agrupación (EST-D-17).** La agrupación de denominaciones solo se aplica a las asociaciones admisibles anteriores al sellado. Una asociación posterior no reagrupa cifras ya selladas: la serie se rechaza con `CANONICAL_CHANGED_AFTER_SEAL` y no es una agregación.
6. **Huella y versiones.**
   - La huella (§5) cubre el ámbito, las asociaciones y cada posición.
   - Si coincide con la última versión, se **reutiliza**; si no, se crea la versión siguiente con sus puntos en una transacción, bajo un bloqueo por ámbito.
   - Una corrección de clasificación produce así una versión nueva, y la anterior conserva sus puntos y la versión de clasificación que usó.

**Leer la serie para una campaña objetivo** (`assess`, F12-EST-03):
1. Se toma la temporada vigente del objetivo.
2. Son relevantes las posiciones que empiezan antes que él. Las demás, incluido el propio objetivo, quedan como `NOT_BEFORE_TARGET`.
3. Sin posiciones relevantes, `INCOMPATIBLE_DATA` con `NO_COMPARABLE_CAMPAIGNS`.
4. El tramo es la racha final de posiciones comprobadas que termina en la última relevante. No se rellena ni se comprime.
   - **Exclusiones:** `NO_RECORD`, `HIDDEN` y `BEFORE_GAP`.
   - **Última relevante no comprobada:** `INSUFFICIENT_DATA` con `LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED`.
   - **Menos de tres posiciones:** `SPAN_TOO_SHORT`.
   - **Alguna posición del tramo con cobertura no identificada:** `INCOMPATIBLE_DATA` con `COVERAGE_UNKNOWN`, por cualquiera de sus motivos.
   - **En otro caso, `READY`:** con los valores del tramo para el cálculo y la cobertura de cada campaña.
5. Ningún motivo lleva cifras, y no se aplica ningún mínimo de participación.

**Lo que no hace:**
- no calcula SES ni naive, que es del motor (§3.3);
- no registra ejecuciones ni resultados;
- no comprueba la admisibilidad del objetivo para un trabajo, que es de EST-D-06 y F12-EST-05;
- no expone nada por HTTP.

### 3.3 Motor SES/naive (F12-EST-04, implementado sin rutas)

`Back/src/modules/estimation/domain/ses-naive.ts` (`estimateSesNaive`). Es una función pura: sin base, sin HTTP y sin trabajador. Ningún controlador la alcanza.

**Entrada.** Solo el tramo `READY` de F12-EST-03 (§3.2): enteros no negativos de la unidad base, en al menos tres posiciones consecutivas.
- El motor no selecciona campañas, no rellena huecos y no ve nada fuera del tramo.
- Cualquier otra entrada es un contrato roto, no un resultado: `SesNaiveInputError` con `NOT_READY`, `SPAN_TOO_SHORT`, `SPAN_MISMATCH`, `NOT_AN_INTEGER` o `NEGATIVE_VALUE`.

**Reglas (3.12.4.8):**
- horizonte de una campaña;
- nivel inicial igual a la primera observación del tramo, y después *L*ₜ = α·*y*ₜ + (1 − α)·*L*ₜ₋₁; la estimación es el último nivel;
- naive: la última observación del mismo tramo;
- α en los 21 valores de 0,00 a 1,00, con paso 0,05;
- criterio: suma de errores cuadráticos a un paso desde la tercera observación, porque el error de la segunda no depende de α;
- empates: empatan los α cuyo criterio *C* cumple *C* − *C*ₘᵢₙ ≤ 10⁻⁹·*C*ₘᵢₙ, y se elige el mayor; con *C*ₘᵢₙ = 0 solo empatan los ceros exactos;
- criterio constante: si los 21 α empatan, α = 1 y `fitInformative = false`.

**SES frente a naive.** Se entregan siempre los dos, y el motor nunca cambia de método.
- Dentro del tramo, el criterio del SES nunca supera al del naive, porque α = 1 es el naive y está en la rejilla. Coinciden cuando se elige α = 1.
- Fuera del tramo el SES puede ser peor que el naive. Es un resultado válido (RN-28), y medirlo es de la evaluación de RNF-13.

**Aritmética y redondeo (EST-D-07):**
- **Sin redondeos intermedios.** Con α = *k*/20 y entradas enteras, cada nivel es un entero sobre 20ᵗ. El cálculo usa esas fracciones exactas en `bigint`: α se elige y los criterios se comparan antes de redondear.
- **Redondeo final.** Solo la estimación SES y los criterios se redondean, a 6 decimales de la unidad base con `ROUND_HALF_UP`, el modo de `Prisma.Decimal` que ya usa el backend. El naive es un entero y no cambia. La cifra redondeada no vuelve a entrar en el cálculo.
- **Alcance.** Seis decimales son una decisión de representación, no una garantía de exactitud del pronóstico.
- **Reproducibilidad.** El resultado lleva `method = SES_NAIVE`, `methodVersion = F12-EST-04/1` y los parámetros (`Parameters` del OpenAPI, con `arithmetic`, `result_scale` y `rounding`). Las mismas cifras dan el mismo resultado.

**Lo que no hace:**
- no registra ejecuciones ni resultados (F12-EST-05);
- no evalúa la precisión (RNF-13); el período reservado para esa evaluación no interviene al elegir α, porque el motor solo ve el tramo que recibe;
- no expone nada por HTTP.

## 4. Rutas (v1) y semántica

Todas las rutas están bajo `/api/v1/estimation`, con bearer y respuestas JSON con `contract_version: 1`. Las cantidades van en la unidad base, como texto: enteros para la serie y el naive, y decimal con hasta 6 cifras para la estimación. La unidad de presentación es `L` o `KG`.

| Método y ruta | Roles | Escribe | Propósito |
|---|---|---|---|
| `POST /estimation/seasons` | DIRECTIVA, ADMINISTRADOR | Una temporada, una vez | EST-D-02 |
| `GET /estimation/seasons` | DIRECTIVA, ADMINISTRADOR | No | Temporadas del sindicato |
| `POST /estimation/campaign-classifications` | DIRECTIVA, ADMINISTRADOR | La versión 1 de una clasificación | EST-D-02 |
| `GET /estimation/campaign-classifications` | DIRECTIVA, ADMINISTRADOR | No | Clasificación vigente de cada campaña; una campaña ausente está sin clasificar |
| `POST /estimation/campaign-classifications/{campaignId}/corrections` | DIRECTIVA, ADMINISTRADOR | Una versión nueva, con motivo | EST-D-14 |
| `GET /estimation/campaign-classifications/{campaignId}/history` | DIRECTIVA, ADMINISTRADOR | No | Todas las versiones de la clasificación, con sus motivos |
| `POST /estimation/jobs` | DIRECTIVA, ADMINISTRADOR | Un trabajo en cola | CU-20, por lotes (EST-D-04) |
| `GET /estimation/jobs/{jobId}` | DIRECTIVA, ADMINISTRADOR | No | Estado operativo, sin cifras |
| `GET /estimation/runs` | DIRECTIVA, ADMINISTRADOR | No | Ejecuciones anteriores, paginadas con un cursor opaco |
| `GET /estimation/runs/{runId}` | DIRECTIVA, ADMINISTRADOR | No | Ejecución completa: parámetros, política, temporada, resultados, serie y vigencia derivada |
| `GET /estimation/results?target_campaign_ref=` | AGRICULTOR, DIRECTIVA, ADMINISTRADOR | No | CU-21: resultado por producto para la campaña objetivo, con vigencia y perfil |
| `GET /estimation/download?target_campaign_ref=` | AGRICULTOR, DIRECTIVA, ADMINISTRADOR | No | RF-40: copia para consultar sin conexión, con perfil |

No existen `PUT`, `PATCH` ni `DELETE` en INT-09, y lo comprueba `openapi:check` (§12).

**Implementadas (F12-EST-05):** `POST /estimation/jobs`, `GET /estimation/jobs/{jobId}`, `GET /estimation/runs`, `GET /estimation/runs/{runId}`, `GET /estimation/results`, `POST …/corrections` y `GET …/history`. `openapi:check` compara esas siete operaciones con el OpenAPI generado desde el código (`x-implemented-operations`). La continuación de #190 (Refs #175) añade las dos de temporadas y las dos de clasificación inicial: once en total. F12-EST-07-WEB (#180) añade la descarga: doce, todas las especificadas, y `openapi:check` pasa a la etapa `IMPLEMENTED`.

### 4.1 Temporadas, clasificaciones y correcciones (EST-D-02, EST-D-14)

- **`POST /estimation/seasons`:** `{ contract_version: 1, key, definition, duration_days }`.
  - La clave no lleva espacios al principio ni al final.
  - La definición no está vacía y la duración es positiva.
  - Una clave repetida en el sindicato da **409 `SEASON_KEY_TAKEN`**.
- **`POST /estimation/campaign-classifications`:** `{ contract_version: 1, campaign_ref, season_ref }`.
  - **404 `CAMPAIGN_NOT_FOUND`** o **`SEASON_NOT_FOUND`** si no son del sindicato.
  - **409 `CAMPAIGN_ALREADY_CLASSIFIED`** si la campaña ya tiene clasificación: se corrige con la ruta siguiente.
- **`POST /estimation/campaign-classifications/{campaignId}/corrections`:** `{ contract_version: 1, previous_classification_ref, season_ref | null, reason }`.
  - Crea la **versión siguiente**, que lleva el motivo, quién corrige, su rol y la hora. `season_ref: null` deja la campaña sin clasificar.
  - **409 `CLASSIFICATION_STALE`** si la versión citada ya no es la vigente: dos correcciones simultáneas no se pisan.
  - **422 `CLASSIFICATION_UNCHANGED`** si no cambia la temporada.
  - **404 `CLASSIFICATION_NOT_FOUND`** si la versión citada no es de esa campaña.
- **Lo que conserva:**
  - Las versiones anteriores no cambian.
  - Las series y ejecuciones ya construidas siguen citando la versión que usaron (`SeriesPoint.classificationId`, `EstimationRun.targetClassificationId`).
  - Lo siguiente que se construya usa la vigente: una serie nueva crea **otra versión de la serie**, y los resultados anteriores pasan a `OUTDATED` con `CLASSIFICATION_CORRECTED` (§8).
- Las temporadas no se modifican ni se borran. Otra definición es otra temporada con otra clave.
- **Implementación** (continuación de #190, Refs #175):
  - `GET /estimation/seasons` lista las temporadas del sindicato por orden de registro;
  - `GET /estimation/campaign-classifications` lista la versión vigente de cada campaña clasificada, por fecha de inicio de la campaña, y con `season_ref` solo las de esa temporada;
  - una campaña cuya versión vigente la dejó sin temporada no aparece;
  - dos registros simultáneos de la misma clave, o dos clasificaciones simultáneas de la misma campaña, dejan uno y responden 409 al otro.

### 4.2 Pedir una estimación: trabajo por lotes (EST-D-04)

Como prevé 3.12.7, el cálculo ocurre **fuera de la petición interactiva**. La petición solo valida y encola.

**Petición:** `{ contract_version: 1, request_id, target_campaign_ref, product_refs? }`.
- Sin `product_refs`, se estiman los productos canónicos estimables con consumo publicado en la temporada de la campaña objetivo.
- Como mucho 200 productos por trabajo: es un **límite técnico inicial, configurable** (`ESTIMATION_MAX_PRODUCTS`, 200 por defecto; EST-D-16). Por encima, 400.

**Validación síncrona.** Si falla, **no se escribe nada**:
- rol: 403 (§2);
- campaña objetivo:
  - del sindicato, o **404 `TARGET_CAMPAIGN_NOT_FOUND`**;
  - `PLANIFICADA` o `ABIERTA`, o **422 `TARGET_CAMPAIGN_NOT_ELIGIBLE`** (EST-D-06; la base también lo exige al crear el trabajo);
  - con clasificación vigente en una temporada, o **422 `TARGET_CAMPAIGN_NOT_CLASSIFIED`**;
- `product_refs`:
  - inexistente o de otro sindicato: **404 `PRODUCT_NOT_FOUND`**;
  - no canónico o con unidad no enlazable: **422 `PRODUCT_NOT_ESTIMABLE`**;
- política pendiente: **409 `POLICY_PENDING`**;
- idempotencia: `request_id` es un UUID, y el trabajo guarda la huella de la petición canónica (`requestHash`: campaña objetivo y productos pedidos):
  - el mismo identificador con la misma huella devuelve **200** con el mismo trabajo, sin encolar otro;
  - con otra huella devuelve **409 `REQUEST_ID_REUSED`**.

**Respuesta: 202** con el trabajo en `QUEUED` y su `max_attempts`. El cliente consulta `GET /estimation/jobs/{jobId}` hasta:
- `COMPLETED`, que lleva `run_ref`;
- `NOT_EXECUTED`, que lleva `stop_code` y `stop_evidence`.

El trabajo y su desenlace se conservan (§6.5).

**Mecanismo mínimo, sin plataforma de colas:**
- **Trabajador.** Es un proveedor del propio Backend NestJS, que arranca con la aplicación. No añade dependencias ni servicios.
- **Tomar un trabajo.** Cada cierto intervalo toma un trabajo con una sola sentencia, sobre los que están `QUEUED` o `RUNNING` con el plazo vencido, en orden de llegada:

  ```sql
  UPDATE "EstimationJob" SET status = 'RUNNING', attempts = attempts + 1, "startedAt" = now(), "leaseExpiresAt" = now() + <plazo>
  WHERE id = (SELECT id FROM "EstimationJob" WHERE … ORDER BY "enqueuedAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
  ```

  Con varias instancias, `SKIP LOCKED` y el plazo evitan que dos tomen el mismo trabajo. Si una instancia cae, el plazo vence y otra lo retoma.
- **Paradas antes de calcular (EST-D-15, decisión del autor).** El trabajo termina `NOT_EXECUTED`, **sin ejecución**, si antes de calcular:
  - desapareció el permiso: el solicitante ya no es Member activo con cuenta activa y el mismo rol (`REQUESTER_NOT_AUTHORIZED`);
  - la política dejó de permitirlo (`POLICY_PENDING`);
  - la campaña objetivo dejó de ser admisible: ya no es `PLANIFICADA` ni `ABIERTA`, o no tiene clasificación vigente (`TARGET_CAMPAIGN_NOT_ELIGIBLE`).

  **Después de empezar (EST-D-06).** Si la campaña objetivo se cierra con el cálculo ya iniciado, la ejecución se completa y se conserva como histórica. No se reabre la campaña ni se modifica su información. La base no exige el estado al registrar la ejecución.

  **Motivo verificable.** `stop_evidence` guarda lo observado (`member_active`, `account_active`, `role`, `campaign_status`, `classified`, `disclosure_mode` y `observed_at`), con las mismas claves en la API y en la base.
  - La base comprueba al cerrar el trabajo que el permiso o la campaña **de verdad** fallan. Rechaza un `REQUESTER_NOT_AUTHORIZED` con el solicitante autorizado o un `TARGET_CAMPAIGN_NOT_ELIGIBLE` con la campaña admisible.
  - El modo de divulgación es configuración y la base no lo ve: solo exige que la evidencia registre `POLICY_PENDING`.
  - Si el permiso desaparece **durante** el cálculo, la base rechaza la ejecución y el trabajo termina igual, con `REQUESTER_NOT_AUTHORIZED`.
  - **No se reintenta** una parada.
- **Cálculo y registro:**
  1. Leer las fuentes (§3).
  2. Construir o reutilizar las series (F12-EST-02).
  3. Clasificar las posiciones y el tramo (F12-EST-03).
  4. Calcular SES y naive (F12-EST-04).
  5. Registrar **en una sola transacción** la ejecución, sus resultados, las series nuevas y el paso del trabajo a `COMPLETED`. La base exige que el trabajo esté `RUNNING` y que un `COMPLETED` tenga su ejecución.
- **Reintentos limitados, solo de errores transitorios (EST-D-16, decisión del autor):**
  - **Errores transitorios y recuperables:**
    - pérdida de conexión con la base;
    - fallo de serialización o interbloqueo;
    - conflicto de sucesión con otra ejecución de la misma campaña objetivo;
    - plazo vencido porque el proceso cayó.

    Liberan el trabajo, que se retoma con un intento más (`attempts`), hasta `max_attempts`. El máximo se fija al encolar y es configurable (`ESTIMATION_MAX_ATTEMPTS`, 3 por defecto); la base impide superarlo.
  - **No se reintentan:**
    - los rechazos de permiso o de política, que son paradas;
    - los problemas de datos, que son resultados por producto `INSUFFICIENT_DATA` o `INCOMPATIBLE_DATA`;
    - un error determinista del cálculo, que es `FAILED` con `CALCULATION_FAILED`.
  - **Al agotar los intentos** con errores transitorios, el cálculo ya se inició y falló: se registra una ejecución `FAILED` con `RETRIES_EXHAUSTED`, sin cifras. La base solo la admite con los intentos agotados.
  - **Sin duplicados:** una sola ejecución por trabajo (`jobId` único).
- **Parada frente a fallo.** `NOT_EXECUTED` significa que no se calculó nada y no hay ejecución. `FAILED` significa que una ejecución empezó y falló, y queda registrada (RN-27).
- **Configuración.** El intervalo (`ESTIMATION_WORKER_INTERVAL_MS`, 5 s) y el plazo (`ESTIMATION_LEASE_MS`, 5 min) son parámetros de despliegue; el máximo de productos y de intentos, límites técnicos configurables. Ninguno es una regla de negocio. `ESTIMATION_WORKER=disabled` impide que el trabajador arranque con la aplicación (las pruebas lo conducen explícitamente). Los cinco valores se validan al arrancar (`envSchema`): un valor inválido detiene el arranque en lugar de caer al valor por defecto.
- **Proceso.** El trabajador vive dentro del proceso del Backend (`node dist/main.js`, la entrada del Dockerfile) y empieza con él. Cada proceso con el trabajador activo toma trabajos; varios procesos sobre la misma base no duplican ejecuciones. Sin un proceso con el trabajador activo, los trabajos esperan en cola. Una parada abrupta deja el trabajo `RUNNING` hasta que vence su plazo y otro proceso lo retoma (§4.2, recuperación); el proceso no registra ganchos de apagado (`enableShutdownHooks`), así que el trabajo en curso no se libera antes del plazo.
- **Implementación (F12-EST-05):** `estimation-worker.ts`, `estimation-jobs.use-case.ts` y `estimation-reads.use-case.ts`.
  - **Idempotencia primero.** Una repetición del mismo `request_id` se responde antes de las demás comprobaciones, de modo que un reintento del cliente encuentra su trabajo aunque la campaña o la política hayan cambiado. Dos peticiones simultáneas iguales encolan un solo trabajo (la segunda encuentra el de la primera).
  - **Productos por defecto.** Sin `product_refs`, los productos canónicos estimables con consumo sellado en una campaña de la temporada, ordenados, como mucho `ESTIMATION_MAX_PRODUCTS`. Un producto que dejó de ser canónico no puede llevar resultado (la base exige canónico) y se omite.
  - **Titularidad del trabajo.** Cada intento escribe solo mientras es el titular: en su transacción bloquea la fila del trabajo y exige que siga `RUNNING`, con su número de intento y el plazo sin vencer. La base exige lo mismo al insertar la ejecución (`jobAttempt` igual a `attempts` y plazo vigente, salvo `RETRIES_EXHAUSTED`; migración `20261102100000_f12_est_05_run_ownership`). Un trabajador que perdió el trabajo no escribe nada.
  - **Recuperación.** Un trabajo `RUNNING` con el plazo vencido se retoma con un intento más. Si ya agotó los intentos, se registra su ejecución `FAILED` con `RETRIES_EXHAUSTED`.
  - **Errores transitorios:** conexión, serialización o interbloqueo (`P1001`, `P1002`, `P1008`, `P1017`, `P2024`, `P2028`, `P2034`, `40001`, `40P01`), conflicto de sucesión (`P2002` sobre `previousRunId` o la raíz) y una clasificación corregida mientras se calcula. Cualquier otro error es determinista: `FAILED` con `CALCULATION_FAILED`. Un fallo del motor en un producto es `CALCULATION_FAILED` de ese producto dentro de una ejecución `CALCULATED`.
  - **Permiso perdido durante el cálculo.** La base rechaza la ejecución y el trabajo termina `NOT_EXECUTED` con `REQUESTER_NOT_AUTHORIZED`, porque antes de registrar un fallo se vuelven a observar las paradas.
- **Límite del despliegue.** El trabajador necesita un proceso del Backend en marcha. Si el servicio se suspende, los trabajos esperan en cola.

**Resultado de la ejecución:**
- La ejecución lleva `outcome: CALCULATED` o, si el cálculo falla, `outcome: FAILED` con `failure_code` (`CALCULATION_FAILED` o `RETRIES_EXHAUSTED`). En ese caso no hay ninguna cifra, pero la ejecución **sí se registra** (RN-27, RN-28).
- **Datos insuficientes:** menos de 3 campañas consecutivas comprobadas, o la última campaña pertinente sin consumo comprobado. Se informa **por producto** con `status: INSUFFICIENT_DATA` y su `reason_code`, sin cifras.
- **Datos incompatibles:** `INCOMPATIBLE_DATA`, con `MIXED_UNITS`, `NO_COMPARABLE_CAMPAIGNS` o `COVERAGE_UNKNOWN` (§3.1).
- **Fallo del cálculo** en un producto: `CALCULATION_FAILED`, con `CALCULATION_ERROR`.
- Que el SES no mejore al naive **no** es un error: es un resultado `ESTIMATED` válido (RN-28).

**Sucesión: una sola cadena por campaña objetivo.**
- La primera ejecución no tiene anterior, y cada una de las siguientes referencia la anterior (`previousRunId`) sin modificarla.
- La base admite **una sola raíz y un solo sucesor por ejecución**, y **una sola ejecución por trabajo**.
- Si dos trabajos de la misma campaña objetivo terminan a la vez, la transacción perdedora se deshace y el trabajador la repite sobre la nueva anterior, como error transitorio que consume un intento. Esto no llega al cliente como error.

### 4.3 Consulta, ejecuciones anteriores y política vigente

**`GET /estimation/results`** devuelve, por producto:
- el resultado de la **ejecución `CALCULATED` más reciente** de la campaña objetivo que lo incluye;
- si no hay ninguna, el de la ejecución más reciente que lo incluye, una `FAILED`, para informar `NOT_USABLE`.

Así una ejecución fallida posterior **no oculta** un resultado vigente. Un trabajo en cola o en curso no cambia la consulta. La respuesta lleva además:
- la temporada;
- la vigencia (`validity` y `validity_reason`) derivada en `evaluated_at` (§8);
- el `profile` del rol (§2);
- el texto fijo `notice`.

Sin ejecuciones, la lista va vacía. **Nunca hay cifras fabricadas.**

**`GET /estimation/runs` y `GET /estimation/runs/{runId}`** muestran el historial completo, incluidas las ejecuciones fallidas y las sustituidas (RN-27).
- La lista (`RunSummary`) no lleva cifras ni vigencia. Va de la más reciente a la más antigua (`generatedAt` y, a igualdad, `id`), con `limit` de 1 a 50 (20 por defecto) y un cursor opaco que codifica la última ejecución de la página. Un cursor que no emitió la ruta es 400, nunca una primera página silenciosa. Este orden es un detalle de implementación de F12-EST-05: el contrato no lo fijaba.
- El detalle de una ejecución lleva la vigencia derivada de cada resultado (§8).

**La política y la divulgación vigentes se aplican al leer**, en todas las rutas con cifras (3.12.3.4: «Un resultado histórico sigue sujeto a los permisos y a la política de divulgación vigentes»). Esto **vuelve a comprobar** la fuente sellada (EST-D-03):
- En `POLICY_PENDING`, las cuatro rutas de lectura con cifras responden **409 `POLICY_PENDING`**.
- Un punto cuya entrada sellada ya no es `DISCLOSED` y visible, o cuya cifra oculta una política más estricta, se entrega como `HIDDEN`, sin cantidad. La fila conserva la cantidad que tenía al construirse.
- Un resultado que usó una cifra que ya no se divulga se entrega **sin cifras** (`estimate_base` y `naive_base` nulos), con `validity: OUTDATED` y `validity_reason: SOURCES_WITHDRAWN`. Así **la estimación no revela lo que la consulta directa oculta** (3.12.6.3).

## 5. Procedencia, versiones y huellas

- **`ConsumptionSeries.sourceHash`:** SHA-256 en hexadecimal de la lista canónica de fuentes.
  - Cubre la temporada y, en orden, cada campaña con la **versión** de su clasificación, su sellado, su divulgación, el estado de visibilidad de la entrada, la cobertura de consumo del sellado y las asociaciones canónicas usadas con su `validFrom`.
  - **`sources`** guarda esa lista (JSON) para poder auditarla.
- **`EstimationRun`:** guarda el trabajo que la produjo (`jobId`), el solicitante y su rol, la campaña objetivo, la versión de su clasificación (`targetClassificationId`) y la temporada.
  - También el método (`SES_NAIVE`), `methodVersion`, los parámetros, el horizonte (1) y la política de divulgación aplicada (`disclosureMode`, `policy`, `threshold`).
  - Y `generatedAt`, que fija el trabajador con la hora del servidor. La base no la impone: solo exige que no sea anterior a la de la ejecución precedente.
  - La huella de la petición queda en el trabajo (`requestHash`).
- **`EstimationRun.contentHash`:** SHA-256 de la ejecución y de todos sus resultados, serializados de forma canónica (`domain/run-content.ts`, F12-EST-05):
  - la ejecución: todas sus columnas salvo `contentHash`, incluido `jobAttempt`, con las cifras como texto y las fechas en ISO 8601;
  - sus resultados ordenados por producto y unidad: todas las columnas salvo `runId`, con la estimación y el criterio con 6 decimales, α con 2 y el naive entero;
  - todo objeto con sus claves ordenadas, de forma recursiva (el JSON leído de `jsonb` da la misma huella).
  - La suite F12-EST-05 la recalcula desde las filas guardadas y coincide.
  - Permite comprobar que una ejecución **no se alteró**.
  - La conservación depende además de que no haya rutas de modificación y de los disparadores (§6.3).
- **Cada resultado** referencia la versión de la serie que usó (`seriesId`). Así quedan identificadas las fuentes y sus versiones de cada cifra (RF-37, DAT-19).

## 6. Modelo de datos (migración `20261101233651_f12_est_01_estimation`; cobertura en `20261102020000_f07_seal_consumption_coverage`; titularidad en `20261102100000_f12_est_05_run_ownership`)

### 6.1 Tablas

Los nombres siguen la convención del repositorio: PascalCase, sin `@@map`, ids UUID, FK `Restrict`.

| Nombre del diseño (3.12.3.4) | Tabla | Contenido |
|---|---|---|
| (EST-D-02) | `ComparabilitySeason` | Tenant, `key`, `definition`, `durationDays`, quién la define y su rol, `createdAt` |
| (EST-D-02, EST-D-14) | `CampaignSeasonClassification` | Versión de la clasificación de una campaña: id, campaña, tenant, `version`, `previousClassificationId`, temporada (nula si una corrección la deja sin clasificar), `reason` (obligatorio en una corrección), quién clasifica y su rol, `classifiedAt` |
| `consumption_series` | `ConsumptionSeries` | Tenant, producto canónico, unidad base, temporada, `version`, `previousSeriesId`, `sourceHash`, `sources`, `builtAt` |
| `series_point` | `SeriesPoint` | Serie, `position`, campaña, `classificationId` (versión usada), `kind`, `quantityBase` (solo comprobado), `sourceSealId`, `sourceReleaseId`. La cobertura se lee del sellado (§3.1) |
| (EST-D-04, 15, 16) | `EstimationJob` | Tenant, `requestId`, `requestHash`, solicitante y rol, campaña objetivo, `productRefs`, `maxAttempts`, y el estado operativo: `status`, `attempts`, `enqueuedAt`, `startedAt`, `leaseExpiresAt`, `finishedAt`, `stopCode`, `stopEvidence` |
| `estimation_run` | `EstimationRun` | Tenant, `jobId` (único), `jobAttempt` (intento que la produjo, F12-EST-05), solicitante y rol, campaña objetivo, `targetClassificationId` (versión usada), temporada, contrato, método y versión, parámetros, `horizon`, política aplicada, `outcome`, `failureCode`, `previousRunId`, `contentHash`, `generatedAt` |
| `estimation_result` | `EstimationResult` | Ejecución, producto canónico, unidad base, serie, `status`, `reasonCode`, `estimateBase`, `naiveBase`, `alpha`, `fitInformative`, `fitCriterion`, tramo (`spanFirstPosition`, `spanLastPosition`), `exclusions`, `validations`, `metrics` |

`estimation_cache` del diseño no es una tabla del servicio: es la copia del cliente, en SQLite o IndexedDB (§9).

### 6.2 Restricciones

**`ComparabilitySeason_values`:**
- clave no vacía y sin espacios al principio ni al final;
- definición no vacía y duración positiva;
- rol DIRECTIVA o ADMINISTRADOR.

**`CampaignSeasonClassification_values`:**
- rol DIRECTIVA o ADMINISTRADOR;
- la versión 1 no tiene anterior, lleva temporada y no lleva motivo;
- una corrección (versión > 1) tiene anterior y un motivo no vacío.

**`SeriesPoint_values` (RN-26, EST-D-03):**
- `VERIFIED_CONSUMPTION` ⇔ hay cantidad ⇔ hay divulgación de origen. La cantidad es ≥ 0, de modo que **el cero es válido**.
- `VERIFIED_CONSUMPTION` y `HIDDEN` exigen el sellado. `NO_RECORD` lo cita si la campaña está sellada, y solo puede omitirlo si no lo está; esto último lo comprueba el disparador.
- `NO_RECORD` y `HIDDEN` no llevan cantidad ni divulgación.

**`EstimationJob_values` (EST-D-04):**
- rol DIRECTIVA o ADMINISTRADOR, huella hexadecimal y `productRefs` nulo o lista;
- cada estado lleva solo sus campos:
  - `QUEUED`: sin intentos ni fechas;
  - `RUNNING`: con intento, inicio y plazo;
  - `COMPLETED`: con fin y sin plazo;
  - `NOT_EXECUTED`: con fin, `stopCode` de la lista cerrada (`POLICY_PENDING`, `REQUESTER_NOT_AUTHORIZED`, `TARGET_CAMPAIGN_NOT_ELIGIBLE`) y `stopEvidence` (objeto);
- `1 ≤ maxAttempts` y `attempts ≤ maxAttempts`.

**`EstimationResult_values` (RN-28):**
- **Solo `ESTIMATED`** lleva cifras: estimación, naive, α, `fitInformative`, `fitCriterion` y, si existen, `metrics`. Además exige una serie y un tramo de **al menos tres** posiciones.
- Los demás estados llevan un `reasonCode` de su estado y **ninguna cifra**:
  - `INSUFFICIENT_DATA`: `LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED`, `SPAN_TOO_SHORT` o `NO_SERIES`;
  - `INCOMPATIBLE_DATA`: `MIXED_UNITS`, `NO_COMPARABLE_CAMPAIGNS` o `COVERAGE_UNKNOWN`;
  - `CALCULATION_FAILED`: `CALCULATION_ERROR`.
- La serie y el tramo de un estado sin cifras son **contexto**, no cifras: por ejemplo, un tramo de dos posiciones en `SPAN_TOO_SHORT`.
- α está entre 0 y 1; las cifras son ≥ 0.

**`EstimationRun_values`:**
- contrato 1, `horizon` = 1 y método `SES_NAIVE`;
- `requestedByRole` es DIRECTIVA o ADMINISTRADOR;
- `disclosureMode` no vacío ni `POLICY_PENDING`;
- `failureCode` de la lista cerrada (`CALCULATION_FAILED`, `RETRIES_EXHAUSTED`), si y solo si la ejecución es `FAILED`;
- huella hexadecimal de 64 caracteres.

**`ConsumptionSeries_values`:** la versión 1 no tiene serie anterior y las siguientes sí; la huella es hexadecimal; `sources` es una lista.

**Unicidad:**
- una clave de temporada por tenant;
- una versión por (campaña, número) y un solo sucesor por versión: una sola cadena de clasificación por campaña;
- una serie por (tenant, producto, unidad, temporada, versión), con un solo sucesor;
- un `requestId` por tenant (en el trabajo);
- una ejecución por trabajo;
- **una sola ejecución raíz por tenant y campaña objetivo** (índice único parcial `EstimationRun_one_root_per_target`, solo en SQL, como `ProductCanonicalAssociation_one_active_per_product`) y un solo sucesor por ejecución;
- un punto por campaña en cada serie;
- un resultado por (ejecución, producto, unidad).

**Lo que la base no comprueba.** Solo comprueba la **aritmética** del tramo. Que las posiciones existan, sean comprobadas, contiguas y finales, y que el naive sea el último valor, lo garantiza el cálculo (F12-EST-03 y F12-EST-04), no la base.

### 6.3 Inmutabilidad, estado operativo y pertenencia (disparadores)

**Inmutabilidad.** `ComparabilitySeason`, `CampaignSeasonClassification`, `ConsumptionSeries`, `SeriesPoint`, `EstimationRun` y `EstimationResult` **rechazan UPDATE, DELETE y TRUNCATE**, con «… es inmutable». Una corrección de clasificación **inserta** una versión; no modifica ninguna.

**Estado operativo.** `EstimationJob` es la única tabla que cambia, y solo en su estado:
- la petición (`requestId`, `requestHash`, solicitante, rol, campaña objetivo, productos y `enqueuedAt`) no cambia;
- `maxAttempts` tampoco cambia: se fija al encolar;
- las transiciones son `QUEUED` → `RUNNING`, `RUNNING` → `RUNNING` (otro intento, con más intentos), `COMPLETED` o `NOT_EXECUTED`, y los intentos no disminuyen;
- la base no comprueba que el plazo haya vencido para tomar otro intento: eso es del trabajador, y `jobId` único impide dos ejecuciones;
- la campaña objetivo de un trabajo nuevo está clasificada y es `PLANIFICADA` o `ABIERTA` (EST-D-06);
- un trabajo cuya ejecución ya está registrada solo puede pasar a `COMPLETED`;
- un estado final no cambia;
- `COMPLETED` exige su ejecución;
- `NOT_EXECUTED` comprueba su motivo:
  - `REQUESTER_NOT_AUTHORIZED` solo si el solicitante ya no es Member activo con cuenta activa y el rol;
  - `TARGET_CAMPAIGN_NOT_ELIGIBLE` solo si la campaña ya no es `PLANIFICADA` ni `ABIERTA` o no tiene clasificación vigente;
  - `POLICY_PENDING` solo con esa evidencia;
- **no se borra** ni se vacía.

**Misma transacción.** Los puntos y los resultados solo se insertan en la misma transacción que crea su serie o su ejecución, con la comparación `xmin` frente a `pg_current_xact_id()` del sellado F07. Una serie o una ejecución **no admite añadidos posteriores**.

**Pertenencia:**
- la campaña, la temporada, el producto, la divulgación y el sellado de cada fila son del mismo tenant;
- quien define, clasifica o pide es Member **activo**, con **cuenta activa**, del tenant y con el rol registrado (`estimation_is_active_member`), también al registrar la ejecución;
- el punto cita la **versión vigente** de la clasificación de su campaña, y esa versión es la temporada de la serie (`estimation_is_current_classification`);
- una corrección sucede a la versión anterior de la **misma** campaña (número + 1) y **cambia** la temporada;
- un consumo comprobado es de una campaña **CERRADA**, y su divulgación es la **vigente** de `CONSUMPTION_TOTAL` de esa celda, **con la misma cifra**, y la entrada `DISCLOSED` y visible del sellado citado;
- un `HIDDEN` que cita un sellado corresponde a una entrada no visible de ese sellado; un `NO_RECORD` que cita un sellado, a ninguna entrada de consumo de esa celda;
- el producto es **canónico**: no es hoy denominación de otro;
- la serie anterior es del mismo ámbito y de la versión inmediatamente anterior;
- una ejecución procede de un trabajo `RUNNING` con la misma campaña objetivo y el mismo solicitante, y de su intento vigente (`jobAttempt` = `attempts`) con el plazo sin vencer según la hora real, salvo `RETRIES_EXHAUSTED` (F12-EST-05: un trabajador que perdió el trabajo no puede registrarla);
- la ejecución cita la versión vigente de la clasificación de su campaña objetivo, que es su temporada;
- una ejecución `FAILED` con `RETRIES_EXHAUSTED` solo existe si el trabajo agotó sus intentos;
- la ejecución anterior es de la misma campaña objetivo y no posterior;
- una ejecución `FAILED` no admite resultados `ESTIMATED`;
- la serie de un resultado es del mismo producto, unidad y temporada.

**Reparto del trabajo.** La forma de cada fila la decide el CHECK; los disparadores solo validan las referencias de filas bien formadas.

**Exigencia redundante.** Que un consumo comprobado sea de una campaña CERRADA no puede fallar hoy: F07 solo sella campañas CERRADAS y no deja cambiar el estado de una campaña sellada. Se mantiene por si F07 cambia.

### 6.4 Lo que no hay

- **Ninguna columna de vigencia.** Se deriva al consultar (§8).
- **Ningún campo de aprobación manual** (§7).
- **Ninguna columna de cobertura en F12.** La cobertura vive en el sellado F07 (§3.1).
- **Ninguna ruta de modificación o borrado.**
- **Ninguna clasificación inicial.** La migración no clasifica campañas ni toca sellados.
- **`DemandForecast`** no se toca: la migración no lo menciona, y la prueba de §12 compara las columnas, restricciones, índices y disparadores de **todas** las tablas previas antes y después. Su retiro sigue en el epic #81.

### 6.5 Retención

- **Durante la construcción y la evaluación académica** se conservan temporadas, versiones de clasificación, series, trabajos con su desenlace, ejecuciones y resultados. Los disparadores impiden borrarlos y no hay ruta de borrado.
- **La retención institucional definitiva está pendiente** en GOV-02 ([#185](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/185)). Este contrato **no declara aprobada una conservación perpetua**: la imposibilidad de borrar es una garantía técnica de esta etapa, con datos sintéticos.
- Cuando GOV-02 fije plazos para datos reales, hará falta un mecanismo de depuración controlado y auditado. Será una migración y una decisión aparte, sin reescribir lo que quede.

## 7. Sin aprobación por resultado; separación de conceptos

No hay estados de aprobación, revisión ni publicación de un resultado: los resultados se entregan según los permisos. La decisión humana se ejerce en la **propuesta conjunta**.

Ninguna ruta de INT-09:
- escribe en necesidades declaradas, propuestas, compras, lotes, movimientos ni inventarios;
- suma la estimación a nada.

F12-EST-08 solo la muestra en una columna separada (RN-29), según §7.1.

### 7.1 Referencia en la propuesta conjunta (F12-EST-08, #181)

**Estado:** implementado e integrado en `main` `075a511` (PR #198, Refs #181; #181 cerrado el 2026-11-03).

**Rutas.** Las dos están bajo `/api/v1/collective`, con los roles de la propuesta (DIRECTIVA y ADMINISTRADOR). Las sirve el módulo de estimación, que ya depende del colectivo.

| Método y ruta | Escribe | Qué entrega |
|---|---|---|
| `GET /collective/proposals/{proposalId}/estimation-reference` | No | Por cada línea del borrador, la referencia o el motivo de su ausencia |
| `GET /collective/proposals/{proposalId}/csv` | No | El CSV del borrador, sin cambios, con la referencia añadida en columnas aparte |

**Origen de la cifra.**
- Es `GET /estimation/results` (§4.3) para la campaña del borrador, con la misma selección, vigencia, política y permisos.
- No hay otro cálculo ni otro almacenamiento.
- Una línea toma el resultado del **mismo producto canónico y unidad**. El sindicato es el del borrador y la campaña es la suya, que es la campaña objetivo de la estimación.
- Un borrador de otro sindicato responde 404, igual que uno inexistente.

**Identificación y separación.**
- La respuesta lleva `label: "Estimación del consumo"` y un aviso fijo: no se suma a la necesidad declarada, no es la cantidad solicitada y no cambia las líneas, los totales ni la huella del borrador.
- La referencia no repite ninguna cifra de necesidad.
- **No entrega** naive, cobertura, serie ni datos por Member.

**Ejecución y momento.**
- Cada línea con resultado lleva la ejecución (`run_ref`), su fecha de generación y `run_relation`, que indica si la ejecución es anterior o posterior al borrador (`BEFORE_PROPOSAL` o `AFTER_PROPOSAL`).
- La respuesta lleva `evaluated_at`, el momento en que se evaluó la vigencia.
- Una propuesta histórica muestra así la referencia vigente al consultar, identificada como tal. La referencia nunca forma parte del borrador.

**Ausencias, nunca un cero.**
- `absence: NO_RESULT`: ninguna ejecución incluye ese producto y unidad.
- `absence: POLICY_PENDING`: sin política en vigor no se entrega ninguna cifra, y el borrador se sigue mostrando como en F07.
- Un resultado sin cifra lleva su estado y su motivo.
- Una fuente retirada da `estimate_base` nulo con `SOURCES_WITHDRAWN` (§4.3).
- La referencia muestra la ejecución que sustituye a otra, nunca un resultado `SUPERSEDED`. El historial completo sigue en `GET /estimation/runs`.

**Filas con la necesidad oculta (decisión del autor del 2026-11-03, diferencia deliberada respecto a W3).**
- Una línea cuya necesidad no está divulgada muestra igualmente la referencia, siempre que la estimación pase sus propios controles: los permisos del §2 y la divulgación vigente del §4.3.
- La necesidad sigue oculta y no se rellena con la estimación ni con un cero.
- La Web lo dice en la propia celda: «La necesidad de esta fila no está divulgada. Lo que sigue es la estimación del consumo: no la sustituye ni se suma a la propuesta.».
- En el CSV, la necesidad queda vacía y la cifra solo aparece en las columnas `estimation_*`.
- W3 dibuja «—» en esa fila. El Word no se modifica.

**Borradores y propuestas selladas.**
- Leer la referencia no ejecuta la decisión del resumen ni escribe nada.
- El CSV usa la vista existente del borrador, que es de solo lectura y, en una campaña sellada, se sirve desde su versión sellada.
- Un borrador no se recalcula ni se modifica al consultarlo, y su `inputs_fingerprint` no cambia: la función de huella (`proposalFingerprint`) no se tocó.

**Exportación.**
- El CSV del borrador conserva sus filas, columnas y valores.
- Añade, al final de la cabecera, `estimation_reference`, `estimation_availability`, `estimation_evaluated_at`, `estimation_season` y `estimation_notice`.
- Añade, al final de cada línea, diez columnas `estimation_*`: ausencia, estado, motivo, cifra en unidad base, vigencia, su motivo, método, ejecución, fecha y relación con el borrador.
- Sin las columnas añadidas, el archivo es exactamente el CSV anterior. La huella del archivo cambia; la huella funcional de las líneas no.
- La exportación evalúa la vigencia en su propio momento (`estimation_evaluated_at`).

**Clientes.**
- La Web la muestra en «Necesidades y propuesta conjunta» como columna «Estimación del consumo (referencia)» (prototipo W3).
- Descarta una respuesta que llega después de cambiar de campaña, de identidad o de borrador.

## 8. Vigencia derivada al consultar

Para un resultado de la ejecución *E* (campaña objetivo *T*, producto *P*, unidad *U*), en este orden:

1. **`NOT_USABLE`:** *E* es `FAILED` (`RUN_FAILED`) o el resultado no es `ESTIMATED` (`NO_FIGURE`).
2. **`SUPERSEDED`:** existe una ejecución posterior `CALCULATED` del mismo sindicato y campaña *T* que incluye un resultado de (*P*, *U*), de cualquier estado (`LATER_RUN`) (EST-D-08, decidida). Una ejecución posterior `FAILED` **no** sustituye.
3. **`OUTDATED`:** cambiaron de forma conocida las cifras, asociaciones o clasificaciones que la sustentan.
   - `CLASSIFICATION_CORRECTED`: la clasificación de la campaña objetivo, o la de alguna campaña de la serie, ya no es la versión que se usó (EST-D-14).
   - `SOURCES_CHANGED`: las fuentes de la serie de (*P*, *U*, temporada), reunidas ahora sin escribir nada, tienen otra huella que la `sourceHash` de la serie que usó el resultado (EST-D-12, decidida). La huella incluye las campañas clasificadas, sus versiones, sellados, divulgaciones, visibilidad, cobertura y asociaciones (§5): por ejemplo, una campaña nueva clasificada en la temporada lo produce.
   - Si se cumplen varias, el motivo es el primero de esta lista: `SOURCES_WITHDRAWN`, `CLASSIFICATION_CORRECTED`, `SOURCES_CHANGED`.
   - **Retirada.** Un punto comprobado sigue divulgado si su entrada sellada es `DISCLOSED`, visible, con la misma divulgación sin retirar y un número de aportantes no menor que el umbral vigente. El número de aportantes solo se usa para esta comprobación y no se entrega.
   - `SOURCES_WITHDRAWN`: alguna cifra usada ya no se divulga; en ese caso, además, **no se entregan sus cifras** (§4.3).
4. **`CURRENT`:** en los demás casos.

Si la identidad no tiene permiso vigente al consultar, **no se entrega** el resultado (RF-38): la vigencia no sustituye a la autorización.

## 9. Copia descargada (RF-40, RN-30, DAT-20)

**Contenido.** `GET /estimation/download` sigue la misma selección, perfil y política que `/results` y devuelve:
- `profile`, `scope` y `subject` (el Member y el rol que descargan);
- `downloaded_at` (hora del servidor), la campaña objetivo (período) y la temporada;
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

**Implementación (F12-EST-07-WEB, #180):**
- **Servicio:** `download` es `results` en la misma petición (selección, perfil, política y autorización), con `subject`, `downloaded_at` (hora del servidor), `validity_at_download`, `may_be_outdated` y `storage`.
- **PWA:** la copia se guarda en IndexedDB (`lib/estimation-copy.ts`), por usuario, sindicato y campaña objetivo, sin credenciales.
  - **Descarga:** solo a petición y con conexión.
  - **Respuestas que no se guardan:**
    - la que llega cuando la sesión ya es otra;
    - la de un perfil que no sea el institucional;
    - la de otro sindicato.
  - **Cuándo se borra:**
    - al cerrar la sesión;
    - al entrar con otra identidad o sindicato;
    - si el servidor rechaza la sesión, el permiso o la política;
    - si la sesión se recupera sin un rol institucional.
  - **Service worker:** no pasa ni cachea respuestas del API.
- **Lectura sin conexión, también tras recargar** (`/estimacion/copia-sin-conexion`): solo dentro del **contexto local** que una sesión aceptada por el servidor con rol institucional abrió en ese navegador (en `localStorage`: `id` aleatorio, huella de usuario y sindicato, rol y fecha; ningún identificador en claro). Cada copia lleva el `id` del contexto.
  - **Sin contexto**, o con otra identidad, sindicato o rol, no se enumera ni se lee nada.
  - **El contexto se cierra de forma síncrona** al cerrar la sesión, con otra identidad o sindicato, con un 401, con un 403 o al perder el rol. Un 409 de política lo renueva. Un 404 **retira la campaña en el propio contexto** (huella de la campaña y generación, en `localStorage`), así que la retirada sobrevive a una recarga aunque el borrado falle; solo una descarga pedida después y autorizada por el servidor vuelve a habilitar una copia de esa campaña. La identidad y la campaña se comparan por su huella (FNV-1a, que no es cifrado ni anonimización).
  - **El borrado físico va después:** si falla, queda pendiente y se reintenta.
  - **El contexto identifica la sesión propietaria**, no a la persona frente al navegador.
  - Detalle y pruebas en `F12_EST_07_WEB_2026-11-02.md` §6 y §7.
- **Mobile (#164):** implementado en AppMovilAgroquimico `main` `c2ac44a`, según [`F12_EST_07_COPIA_MOBILE.md`](F12_EST_07_COPIA_MOBILE.md) §6.

## 10. Coherencia con el diseño aprobado

| Exigencia | Dónde queda en el contrato |
|---|---|
| Campañas comparables y tramo consecutivo final | Temporada explícita y clasificación por campaña (§3, punto 2; §6); orden por `position`; tramo y `exclusions` en `EstimationResult`. La base solo exige el mínimo de tres posiciones; la semántica del tramo es de F12-EST-03 (§6.2) |
| SES frente a naive para la campaña siguiente | `method = SES_NAIVE`, `horizon = 1`, `estimateBase` y `naiveBase`; los parámetros de 3.12.4.8 están en el OpenAPI (`Parameters`) |
| Cálculo por lotes fuera de las solicitudes interactivas (3.12.7) | `EstimationJob` y el trabajador del §4.2; la ejecución final sigue inmutable |
| Datos insuficientes sin cifras inventadas | `INSUFFICIENT_DATA` e `INCOMPATIBLE_DATA` con motivo cerrado y sin cifras (CHECK); `NO_RECORD` y `HIDDEN` sin cantidad (CHECK); `COVERAGE_UNKNOWN` sin cobertura inventada (§3.1); resultados sin cifras si una fuente se retiró (§4.3) |
| Estimación separada de necesidades y propuestas | §7; ninguna ruta escribe fuera de INT-09; `notice` fijo en la consulta y en la copia |
| Consulta descargada en Mobile y PWA, vinculada a identidad y ámbito, con fechas y aviso | §9 y los esquemas `InstitutionalDownload` y `FarmerDownload` |

## 11. Decisiones

Los identificadores llevan el prefijo `EST-D` para no confundirse con otras decisiones publicadas (D-03, D-04 y D-07 del bloque 2).

### 11.1 Decididas por el autor

| Id | Fecha | Decisión | Dónde queda |
|---|---|---|---|
| EST-D-01 | 2026-11-01 | Incluir la estimación exploratoria SES/naive, reconociendo que SES es pronóstico estadístico; mantener excluidos ARIMA, Prophet, redes neuronales, variables externas y recomendaciones automáticas | ADR-004; `CURRENT_SCOPE.md` §11 y los tres `AGENTS.md` |
| EST-D-02 | 2026-11-01 | Clave de comparabilidad explícita, asignada por la Directiva y asociada a una definición de temporada y una duración; nada inferido de nombres ni fechas; las campañas antiguas sin clasificación comprobada quedan sin clasificar | §3 (punto 2), §4.1, §6 |
| EST-D-03 | 2026-11-01 | Campañas cerradas con fuente sellada para el consumo comprobado; procedencia exacta; divulgación comprobada de nuevo al consultar | §3 (punto 3), §4.3, §6 |
| EST-D-04 | 2026-11-01 | Cálculo por lotes fuera de la petición, con el mecanismo mínimo, sin plataforma de colas; ejecuciones finales inmutables y estado operativo aparte | §4.2, §6 |
| EST-D-05 | 2026-11-01 | El Agricultor consulta la estimación sin naive, cobertura ni serie; puede coincidir con una cifra histórica; la proyección debe estar en la política institucional; no se habilitan datos reales ni se declara aprobada la política | §2 |
| EST-D-06 | 2026-11-02 (UTC) | Campaña objetivo admisible: del mismo sindicato, clasificada y `PLANIFICADA` o `ABIERTA`, al pedir el trabajo y antes de empezar el cálculo. Si se cierra después de empezar, la ejecución se completa y se conserva como histórica; la campaña no se reabre ni se modifica, y la consulta sigue sujeta a los permisos y a la divulgación vigentes | §4.2; base: alta del trabajo y parada `TARGET_CAMPAIGN_NOT_ELIGIBLE`; la ejecución no exige el estado |
| EST-D-07 | 2026-11-02 (UTC) | Cálculo sin redondeos intermedios; α y la comparación de errores, antes de redondear; estimación SES y naive finales con 6 decimales de la unidad base y `ROUND_HALF_UP`; se conservan los parámetros y la versión del método. Seis decimales son una decisión de representación, no una garantía de exactitud | §3.3; `Parameters` del OpenAPI |
| EST-D-08 | 2026-11-02 (UTC) | Una ejecución posterior calculada sustituye a la anterior; una fallida, no. El resultado anterior solo se entrega conforme a su vigencia, sus fuentes y los permisos actuales. No se reutilizan cifras anteriores como si pertenecieran a una ejecución nueva con datos insuficientes | §4.3, §8 |
| EST-D-10 | 2026-11-02 (UTC) | Mientras la política requerida esté pendiente se bloquean con 409 las solicitudes, las lecturas de cifras y la descarga. Los trabajos en cola detienen su procesamiento conforme al contrato, y antes de reanudarlos se vuelven a comprobar las condiciones aplicables. **No es la aprobación institucional de GOV-02** | §3 (punto 5), §4.2, §4.3, §9 |
| EST-D-12 | 2026-11-02 (UTC) | Los cambios de fuentes, de clasificación o de la composición de la temporada desactualizan los resultados, incluida una campaña clasificada después. Si una fuente pierde la autorización, además no se entregan las cifras afectadas, SES y naive incluidos | §4.3, §8 |
| EST-D-09 | 2026-11-01 y 2026-11-02 (UTC) | Ampliación mínima de F07: cobertura de participación del consumo en los sellados futuros, en la misma transacción e inmutable; no aceptar la cobertura general; no reconstruir los sellados anteriores; misma población en N y M; participación distinta de integridad; ningún mínimo nuevo | §3.1; F07 §5.3 |
| EST-D-11 | 2026-11-02 (UTC) | Conservar los registros durante la construcción y la evaluación académica; la retención institucional definitiva, pendiente en GOV-02, sin declarar aprobada una conservación perpetua | §6.5 |
| EST-D-13 | 2026-11-01 | Autorización existente por roles, con identidad, pertenencia y cuenta activa; ningún segundo sistema | §2, §6.3 |
| EST-D-14 | 2026-11-02 (UTC) | Corregir una clasificación equivocada con motivo y trazabilidad, como versión nueva; conservar las versiones que usaron series y ejecuciones anteriores | §3 (punto 2), §4.1, §6, §8 |
| EST-D-15 | 2026-11-02 (UTC) | Si antes de calcular desaparece el permiso, la política deja de permitirlo o la campaña deja de ser admisible: `NOT_EXECUTED` con motivo verificable, conservando la solicitud y su desenlace; distinto de una ejecución iniciada que falla | §4.2, §6 |
| EST-D-17 | 2026-11-02 (UTC) | La agrupación de denominaciones de un producto canónico se aplica a las asociaciones admisibles **anteriores al sellado** (F07 ya las consolida en una cifra). **No** se reagrupan retrospectivamente cifras selladas mediante asociaciones posteriores: se rechaza con `CANONICAL_CHANGED_AFTER_SEAL`, sin serie, y una ejecución informa `INCOMPATIBLE_DATA`. Precisa el primer criterio de #175; el criterio original se conserva como antecedente en el issue | §3.2 (punto 5) |
| EST-D-16 | 2026-11-02 (UTC) | 200 productos como límite técnico inicial configurable; reintentos limitados, solo de errores transitorios recuperables, sin duplicar ejecuciones ni reintentar rechazos de permiso, política o datos | §4.2, §6 |
| F06 | 2026-11-02 (UTC) | Acotar la exclusión de pronóstico de F06: F06 mantiene la proyección colectiva y F12 calcula SES/naive aparte con fuentes permitidas, sin ampliar el acceso a datos privados ni la divulgación | §0; F06 §1 |

### 11.2 Pendientes y compatibilidad con lo decidido

| Id | Decisión | Propuesta | Compatibilidad | Quién o cuándo |
|---|---|---|---|---|
| — | Ninguna | Desde el 2026-11-02 (UTC) no queda ninguna decisión del autor pendiente en INT-09: EST-D-08, EST-D-10 y EST-D-12 pasaron a §11.1. Los límites que quedan están en §11.3 | — | — |

### 11.3 Incompatibilidades y límites que quedan

1. **RN-25 con los datos anteriores.** La cobertura de consumo existe solo en los sellados posteriores a la migración. Para un `ESTIMATED` hacen falta al menos tres campañas consecutivas comprobadas, todas selladas con cobertura identificada.
   - Con las campañas ya selladas, **ningún resultado puede ser `ESTIMATED`**: serían `INCOMPATIBLE_DATA` con `COVERAGE_UNKNOWN`. Es la consecuencia de no reconstruir.
   - Con **datos sintéticos** sí se puede probar todo el recorrido (`synthetic-sources.ts`).
   - Ya no bloquea F12-EST-02 a F12-EST-04, pero el primer resultado real llegaría tras tres temporadas selladas con cobertura.
2. **EST-D-05 sin soporte en la política.** La política vigente (`F07-POL-01`, `PROVISIONAL_SYNTHETIC`, no aprobada) no contempla la proyección de la estimación al Agricultor. El contrato la conserva solo con datos sintéticos. Cuando la política institucional (F07-POL-01, #107, dentro de las decisiones de GOV-02, #185) la defina, F12-EST-06 debe comprobarla. Hoy no hay un indicador técnico para ello, y este bloque no lo crea.
3. **EST-D-03 frente al sellado desactivado.** Si un despliegue tiene el sellado desactivado (`SEALING_DISABLED` en F07), ninguna campaña aporta consumo comprobado.
4. **`POPULATION_MISMATCH`.** Con la regla F07 vigente no debería ocurrir: solo una baja confirmada entre dos lecturas del sellado, en `READ COMMITTED`, lo produce. Si ocurre, la campaña queda con cobertura desconocida para siempre, porque no se reconstruye. Evitarlo del todo exigiría que el sellado leyera en `REPEATABLE READ`, que es un cambio de F07 que este bloque no hace.
5. **La política no se puede comprobar en la base.** De las tres paradas, la base verifica el permiso y la campaña. La política es configuración del proceso y solo queda como evidencia registrada.
6. **Supuesto del catálogo de campañas completo (aceptado por el autor el 2026-11-03 para el alcance académico).** La consecutividad del tramo se determina sobre las campañas **registradas y clasificadas** en la temporada. El sistema **no detecta automáticamente** un período cuya campaña nunca se registró, porque no infiere nada de las fechas. Una estimación presupone, por tanto, que el catálogo de campañas de la temporada está completo. Es un supuesto declarado, **no una validación automática del calendario**. Los conjuntos sintéticos de F12-EST-09 tienen su calendario conocido y no cambian. Precisa la nota del §3.2, punto 3.

### 11.4 Trabajo adicional y su vínculo

- **La ampliación de F07 (cobertura de consumo de los sellados nuevos) se entrega en este mismo PR (#187)**, porque es una dependencia directa de F12-EST-02 y F12-EST-03:
  - [#175](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/175) prevé la cobertura N de M de cada posición;
  - [#176](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/176), `COVERAGE_UNKNOWN`.

  No se abre un issue nuevo para no duplicar.
- **Lo que esos issues deben añadir a su alcance, sin tarea nueva:**
  - #175 cita en cada punto la versión vigente de la clasificación y lee la cobertura del sellado;
  - #176 decide la cobertura del tramo (§3.1);
  - #178 (F12-EST-05) implementa el trabajador con paradas verificables y reintentos limitados, las rutas de corrección y `CLASSIFICATION_CORRECTED`.
- **La retención institucional** sigue en GOV-02 ([#185](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/185)).

## 12. Especificado, construido y comprobado

| Afirmación | Estado | Cómo |
|---|---|---|
| Rutas, peticiones, respuestas, perfiles, errores, correcciones, trabajo por lotes, vigencia, política al leer y copia descargada | **Especificado** | `docs/api/openapi-f12-estimation.json` |
| La especificación es coherente y completa (detalle debajo) | **Comprobado por script** | `Back/scripts/openapi-f12-estimation.cjs`, dentro de `npm run openapi:check` |
| Las operaciones implementadas son exactamente las declaradas (`x-implemented-operations`), con los mismos códigos de respuesta y ninguna de modificación | **Comprobado por script** | El mismo script, contra `openapi-f02.json`, que se genera desde el código (etapa `PARTIALLY_IMPLEMENTED`, desde F12-EST-05). Los cuerpos de las respuestas se contrastan con los esquemas en la suite F12-EST-05 |
| Esquema: temporadas, versiones de clasificación, series, puntos, trabajos, ejecuciones y resultados | **Construido** | Migración `20261101233651_f12_est_01_estimation` |
| **Cobertura de consumo de los sellados F07 nuevos** | **Implementado y comprobado contra PostgreSQL** | Caso de uso del sellado, `consumption-coverage.ts` y migración `20261102020000_f07_seal_consumption_coverage`. Pruebas en `f07-collective-seal.postgres.spec.ts` (sellado real por la API, migración desde la base previa) y `consumption-coverage.spec.ts` |
| Rechazos de la base F12 (detalle debajo) | **Comprobado contra PostgreSQL** | `f12-est-01-estimation-schema.postgres.spec.ts` (13 pruebas) |
| La migración F12 es aditiva y no cambia `DemandForecast` ni los sellados; la F07 nueva no da cobertura a los sellados anteriores | **Comprobado contra PostgreSQL** | La misma suite, desde la base previa (13 migraciones) con datos sintéticos, y la prueba de migración F07 |
| En las rutas implementadas: 401, 403 sin escribir nada, 404 de otro sindicato, 400, 422 y 409 `POLICY_PENDING`; 202 al encolar y 200 al repetir; correcciones por HTTP; selección de la consulta; perfiles; retirada de cifras al leer; permiso perdido | **Comprobado por HTTP contra PostgreSQL** | `f12-est-05-runs.postgres.spec.ts`, con cada cuerpo contrastado con su esquema de la especificación |
| Trabajador por lotes: toma con `SKIP LOCKED`, plazo, titularidad, recuperación, errores transitorios, reintentos, agotamiento, fallo determinista y paradas | **Comprobado contra PostgreSQL**, conducido explícitamente | La misma suite. La base prueba además las transiciones y la titularidad (`f12-est-01`, `f12-est-05`) |
| Ejecuciones y resultados solo por inserción, cadena por campaña objetivo, huella de contenido y vigencia derivada (los cuatro estados) | **Comprobado contra PostgreSQL** | La misma suite y `insert-only.spec.ts`, que revisa el código del módulo |
| Lista de ejecuciones (`GET /estimation/runs`) con cursor | **Implementado y comprobado por HTTP contra PostgreSQL** | `f12-est-05-runs.postgres.spec.ts` |
| El trabajador como proceso real: `node dist/main.js` recibe la petición, su trabajador toma el trabajo, registra la ejecución y la API la entrega; dos procesos sobre la misma base; sin trabajador, el trabajo espera | **Comprobado en un ensayo reproducible (HOST, PostgreSQL desechable, datos sintéticos)** | `docs/evidence/f12_est_05/ensayo-proceso-trabajador.cjs`. Acredita integración y operación, no producción ni precisión |
| Temporadas y clasificación inicial con su lista | **Implementado y comprobado por HTTP contra PostgreSQL** en el PR de continuación de #190 (#191, Refs #175), integrado en `main` `35d9a1b` | `f12-est-seasons.postgres.spec.ts`. Fuera del alcance de #178; ningún issue las incluía, y su asignación a #175 es una propuesta |
| Descarga (`GET /estimation/download`) | **Implementado y comprobado contra PostgreSQL** (F12-EST-07-WEB, Refs #180): perfiles, misma selección que `/results`, 400, 401, 404 y 409, y rol degradado | `estimation-reads.use-case.ts` (`download`); caso de `f12-est-05-runs.postgres.spec.ts`; `docs/evidence/F12_EST_07_WEB_2026-11-02.md` |
| Preparación de fuentes, construcción de series con versiones y lectura del tramo para una campaña objetivo (§3.2) | **Implementado y comprobado contra PostgreSQL**, sin rutas | `consumption-series.use-case.ts` y `domain/series.ts`; `series.spec.ts` (9) y `f12-est-02-series.postgres.spec.ts` (4, con sellados reales F07 por la API) |
| Motor SES/naive (§3.3): rejilla de α, empates, criterio constante, naive y redondeo final | **Implementado y comprobado**, sin rutas ni ejecuciones | `domain/ses-naive.ts`; `ses-naive.spec.ts` (11, con casos calculados a mano y una referencia decimal independiente) y el tramo `READY` de sellados reales en `f12-est-02-series.postgres.spec.ts` |
| Pantalla Web institucional «Estimación del consumo» (F12-EST-06): solicitud, estado del trabajo, resultados del perfil institucional con su vigencia, ejecuciones anteriores con su detalle y exportación de la consulta | **Implementado** (F12-EST-06, Refs #179); comprobado con pruebas de componentes y con un recorrido de navegador contra el backend real y PostgreSQL desechable, con la Directiva y el Administrador, y contrastado con el prototipo W4 | `Web/src/pages/estimation.page.tsx`; `docs/evidence/F12_EST_06_WEB_2026-11-02.md`. La Web no calcula: presenta lo que entrega el servicio |
| Copia descargada en la PWA (IndexedDB) | **Implementado** (F12-EST-07-WEB, Refs #180). Comprobado con pruebas de componentes y con un recorrido de navegador real contra el backend: lectura sin conexión, también tras recargar, aislamiento, borrado y rechazos | `Web/src/lib/estimation-copy.ts`; `docs/evidence/F12_EST_07_WEB_2026-11-02.md` |
| Estimación como referencia separada en la propuesta conjunta y su CSV (§7.1) | **Implementado y comprobado por HTTP contra PostgreSQL**, integrado en `main` `075a511` (#198, Refs #181); la Web, con pruebas de componentes y un recorrido de navegador contra el backend real | `proposal-reference.use-case.ts`; `f12-est-08-proposal-reference.postgres.spec.ts`; `docs/evidence/F12_EST_08_REFERENCIA_PROPUESTA_2026-11-03.md` |
| Copia descargada en Mobile (SQLite) y cliente Mobile | **Implementado** (Mobile #164, AppMovilAgroquimico `c2ac44a`). Comprobado en HOST, en el POCO X5 Pro contra un Central propio y desechable por HTTPS, y con servidor simulado en el teléfono | `F12_EST_07_COPIA_MOBILE.md` §6; evidencia Mobile `F12_EST_07_MOB_ESTIMACION_2026-11-02.md` |

**Lo que comprueba el script** sobre la especificación:
- OpenAPI 3.0.3, referencias resueltas y ningún `$ref` con hermanos;
- bearer, objetos cerrados y sin `PUT`/`PATCH`/`DELETE`;
- rutas, métodos y el conjunto exacto de respuestas de cada operación;
- roles anotados por operación (`x-roles`; no hay `@Roles` con qué contrastarlos), y 409 `POLICY_PENDING` en las operaciones con cifras;
- que pedir una estimación encola un trabajo (202, `Job`) y no calcula en la petición;
- la temporada explícita en peticiones y ejecuciones;
- las correcciones con motivo y la versión citada por puntos y ejecuciones;
- la cobertura (`IDENTIFIED` con N y M o `UNKNOWN` con su motivo), sin porcentaje ni mínimo, y su relación con el enum de Prisma;
- la cobertura por campaña del tramo en el perfil institucional;
- la evidencia de parada y el máximo de intentos;
- la retención pendiente en GOV-02;
- la exigencia de política en las rutas del Agricultor;
- perfiles, con el del Agricultor sin naive, cobertura ni serie;
- enums iguales a los del esquema Prisma, y códigos cerrados (`reasonCode`, `failureCode`, `stopCode`) iguales a los de la migración;
- ningún campo de aportes ni de aprobación en esquemas y parámetros, y ninguna columna de vigencia, aprobación ni cobertura en los modelos F12;
- la copia descargada con sus campos obligatorios.

**Lo que rechaza la base:**
- solicitantes, clasificadores o autores de temporadas AGRICULTOR, inactivos, con la cuenta desactivada o de otro sindicato;
- temporadas sin clave, definición o duración válidas; claves repetidas;
- versiones 1 repetidas o sin temporada, clasificaciones entre sindicatos;
- correcciones sin motivo, que no cambian la temporada, de otra campaña, que saltan una versión o que no corrigen la vigente;
- puntos que no citan la versión vigente de su campaña en la temporada de la serie;
- consumo comprobado sin sellado, con una entrada no visible o ajena, o con una cifra distinta de la divulgada vigente;
- datos ocultos que el sellado no oculta, ausencias que el sellado sí tiene y ausencias sin sellado en una campaña sellada;
- mezclar cero, ausencia y dato oculto;
- un producto no canónico;
- en los trabajos:
  - que no nazcan en cola o que su campaña objetivo no tenga clasificación vigente;
  - cambios de la petición;
  - transiciones hacia atrás o desde un estado final;
  - intentos que disminuyen, que no aumentan o que superan el máximo;
  - `COMPLETED` sin ejecución y cualquier estado distinto de `COMPLETED` con ejecución;
  - paradas sin evidencia, con un código ajeno o con un motivo que la base ve falso;
  - borrados;
- ejecuciones sin trabajo en curso, de otra petición, de un solicitante que perdió el permiso, que no citan la clasificación vigente de su objetivo, con la política pendiente, o `RETRIES_EXHAUSTED` sin los intentos agotados;
- cifras fuera de `ESTIMATED` y motivos de otro estado;
- dos raíces, dos sucesores, dos ejecuciones por trabajo o un antecesor posterior;
- UPDATE, DELETE y TRUNCATE de las tablas inmutables;
- añadidos fuera de su transacción;
- **en F07:**
  - un sellado nuevo sin cobertura de consumo;
  - una cobertura escrita después de su sellado, con otro M, con N > M o con una fracción en `POPULATION_MISMATCH`;
  - cualquier cambio de ella.

`npm run openapi:check` **sin** el script nuevo solo comparaba los cuatro archivos generados desde el código (`openapi-f02`, `-f05-sync-v1`, `-f06-collective` y `-f08-backups`). Un archivo nuevo en `docs/api/` habría pasado sin leerse.

## 13. Registro de revisiones

| Fecha | Cambio |
|---|---|
| 2026-11-01 | Versión inicial (F12-EST-01, #174) |
| 2026-11-01 | Tras una lectura de contraste de otro agente de la sesión, antes del primer commit, se corrigieron cinco bloqueantes: el perfil del Agricultor sin naive ni cobertura, la política vigente al leer, la selección de la consulta frente a la vigencia, las unidades no enlazables como 422 y los CHECK de las cifras. También se corrigieron menores: una sola cadena por campaña objetivo, la cifra igual a la divulgada, la entrada sellada, el Member activo, el producto canónico, los códigos cerrados, `TRUNCATE`, `requestHash`, `$ref` anulables y los textos de 401 y 403 |
| 2026-11-02 (UTC) | Conciliación con las decisiones del autor EST-D-01 a 05, 09 y 13 (§11.1). Cambios: ADR-004; temporadas y clasificaciones explícitas en lugar de `comparabilityKey`; fuente sellada obligatoria; trabajos por lotes en lugar del cálculo en la petición, de modo que `POST /runs` pasa a `POST /jobs` y desaparece `RUN_SUCCESSION_CONFLICT`; cobertura retirada del esquema y `UNKNOWN` en la API; cuenta activa en la defensa de la base; la comprobación de ausencia de rutas pasa a ser de etapa. La migración, sin publicar en `main`, se reescribió en el mismo archivo. Una lectura de contraste de otro agente de la sesión, antes del commit, encontró dos bloqueantes, corregidos: un trabajo con ejecución podía pasar a `NOT_EXECUTED`, y una campaña sellada admitía `NO_RECORD` sin sellado. También se corrigieron menores: motivo emparejado con su estado, otro intento con más intentos, trabajo solo para campañas clasificadas, reglas propias declaradas como EST-D-15 y EST-D-16, textos de F06 y F07 sin tocar declarados, redacción de `CURRENT_SCOPE` y del 409, y pruebas de cuenta desactivada y de otro sindicato |
| 2026-11-02 (UTC), segunda | Decisiones del autor EST-D-09 (cobertura), 11, 14, 15, 16 y F06 (§11.1). Cambios: cobertura de participación del consumo en los sellados F07 nuevos, implementada (F07 §5.3), con la advertencia sobre `SHOW_PRIOR` corregida tras leer `decideCell`; versiones de clasificación con corrección motivada, citadas por puntos y ejecuciones; paradas `NOT_EXECUTED` con evidencia verificable; `RETRIES_EXHAUSTED` en lugar de `ATTEMPTS_EXHAUSTED` y `SOURCES_UNAVAILABLE`; máximo de intentos y de productos configurables; retención académica con la institucional en GOV-02; F06 §1 acotado; fuentes sintéticas con cobertura conocida y desconocida |
| 2026-11-02 (UTC), tercera | EST-D-06 decidida por el autor: admisible al pedir y antes de calcular; la base lo exige al crear el trabajo, y una ejecución iniciada se completa aunque la campaña se cierre |
| 2026-11-02 (UTC), cuarta | F12-EST-02 y F12-EST-03 (#175, #176): construcción de series y lectura del tramo, implementadas sin rutas (§3.2); se añade la distinción de representatividad a la cobertura y el límite sintético de su exposición |
| 2026-11-02 (UTC), quinta | EST-D-07 decidida por el autor (§11.1). F12-EST-04 (#177): motor SES/naive implementado como función pura, sin rutas ni ejecuciones (§3.3); `Parameters` del OpenAPI añade `arithmetic`, `result_scale` y `rounding` |
| 2026-11-02 (UTC), sexta | F12-EST-05 (#178): trabajos, trabajador por lotes, ejecuciones y resultados solo por inserción y vigencia derivada, con seis rutas implementadas (§4); titularidad del trabajo en la base con una migración aditiva (`jobAttempt`); huella de contenido fijada (§5); detección de `SOURCES_CHANGED` fijada (§8); etapa `PARTIALLY_IMPLEMENTED` comparada con el código (§12). EST-D-08, 10 y 12 se implementan como estaban propuestas y siguen pendientes de decisión del autor |
| 2026-11-02 (UTC), séptima | F12-EST-05 (#178): `GET /estimation/runs` implementado (§4.3); configuración del trabajador validada al arrancar y su funcionamiento como proceso descrito (§4.2); ensayo con el proceso real (§12); temporadas, clasificación inicial y descarga asignadas a sus bloques (§12). Corrige el recuento de operaciones especificadas de la revisión anterior |
| 2026-11-02 (UTC), octava | EST-D-08, EST-D-10 y EST-D-12 decididas por el autor, con sus precisiones (§11.1); §11.2 queda sin pendientes. Contraste con el código y las pruebas: coincidían; se añaden dos pruebas que faltaban (una ejecución nueva con datos insuficientes no reutiliza la cifra anterior; un trabajo retomado tras un error transitorio vuelve a comprobar la política antes de calcular). La decisión EST-D-10 no aprueba GOV-02 |
| 2026-11-02 (UTC), novena | Continuación de #190 (Refs #175): temporadas y clasificación inicial con su lista implementadas (§4.1); `openapi:check` compara once operaciones; solo la descarga sigue especificada |
| 2026-11-02 (UTC), décima | F12-EST-06 (#179): pantalla Web institucional sobre las rutas de #190 (§12), contrastada con el prototipo W4 y recorrida con la Directiva y el Administrador; sin descarga ni copia |
| 2026-11-02 (UTC), undécima | F12-EST-07-WEB (#180): `GET /estimation/download` implementada y la copia de la PWA en IndexedDB (§9, §12); `openapi:check` en etapa `IMPLEMENTED`; contrato de la copia Mobile documentado para #164, sin implementar |
| 2026-11-02 (UTC), precisión de #175 | EST-D-17 decidida por el autor: la agrupación de denominaciones se limita a asociaciones admisibles anteriores al sellado; sin reagrupación retrospectiva (§3.2, §11.1) |
| 2026-11-02 (UTC), duodécima | F12-EST-07-WEB (#180): la retirada por un 404 se guarda en el contexto local y persiste tras recargar aunque el borrado falle; una descarga posterior autorizada habilita otra copia (§9) |
| 2026-11-03 (UTC), decimotercera | Mobile #164 integrado (AppMovilAgroquimico `c2ac44a`): estado real del cliente Mobile de la copia (§9, §12) y del contrato `F12_EST_07_COPIA_MOBILE.md` |
| 2026-11-03 (UTC), decimocuarta | F12-EST-08 (Refs #181), en rama: la estimación como referencia separada en la propuesta conjunta y en su CSV (§1, §7, §7.1, §12) |
| 2026-11-03 (UTC), decimoquinta | Decisión del autor: la referencia se muestra también en las filas con la necesidad oculta, rotulada como estimación y sin sustituir la necesidad (§7.1); diferencia deliberada respecto a W3 |
| 2026-11-03 (UTC), decimosexta | F12-EST-10 (Refs #183): las filas de estado de las temporadas (§12) y de la referencia en la propuesta (§7.1, §12) dicen que están integradas en `main` (`35d9a1b` y `075a511`). Índice de evidencia en `docs/evidence/F12_EST_10_INDICE_EVIDENCIA_2026-11-03.md` |
| 2026-11-03 (UTC), decimoséptima | Decisión del autor sobre GATE-F12: los números de la política (`F07-POL-01`, #107) y de GOV-02 (#185) corregidos en §2, §3 y §11.3; supuesto del catálogo de campañas completo (§11.3, punto 6) |

## Anexo (2026-11-12): exportación CSV retirada

Por decisión del autor del 2026-11-12, **Excel es la única exportación para el usuario**. Se retiraron las rutas `GET /api/v1/collective/campaigns/{campaignId}/summary.csv`, `GET /api/v1/collective/trends.csv` y `GET /api/v1/collective/proposals/{proposalId}/csv` (Back `eeaf327`) y los botones «Exportar CSV» de la Web (`7acf0a1`). Lo que este documento dice de esos CSV describe la versión anterior; la política de divulgación se sigue aplicando igual en el JSON y en los libros Excel, que se arman con las mismas respuestas del servidor. Equivalencias columna a columna: `docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md`. El Excel del borrador usa la referencia de estimación **fijada** (contrato E2 §11.9; sustituye a E3-R10 y a N8).
