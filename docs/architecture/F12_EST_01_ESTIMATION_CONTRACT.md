# F12-EST-01 — Contrato INT-09: estimación del consumo (v1)

- **Fecha real:** 2026-11-01 y 2026-11-02 (UTC); 2026-11-01 en Bolivia. Conciliado el 2026-11-02 (UTC) con las decisiones del autor del §11.
- **Estado:** **especificación**. Es una propuesta del autor, no una aprobación institucional, de la Directiva ni del tutor.
  - **Ninguna ruta está implementada:** no hay controladores, casos de uso, trabajador por lotes ni motor de cálculo.
  - **Lo único construido** en este bloque es el esquema de datos (§6), con su migración aditiva.
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
- **Textos no modificados** porque esta decisión no los autorizó. ADR-004 los lista:
  - `F06_COLLECTIVE_PROJECTION_CONTRACT.md` §1 («No hay … forecasting, IA, recomendación»), sobre la proyección colectiva F06;
  - `F07_SEALED_HISTORY_CONTRACT.md` §8 («No incluye forecasting»), sobre las tendencias F07.
  La estimación no forma parte de esa proyección ni de esas tendencias: solo lee sus cifras publicadas. Aun así, el texto general de F06 puede leerse como contrario y queda pendiente (§11.3).

## 1. Conceptos que no se confunden

| Concepto | Qué es | Dónde vive |
|---|---|---|
| Consumo publicado | Cifra colectiva de `CONSUMPTION_TOTAL` por campaña, producto canónico y unidad base que superó la política de divulgación | `CollectiveRelease` y la versión sellada (F06/F07) |
| Necesidad declarada | Lo que cada agricultor declara (`DECLARED_NEED`) | Sync v1, propuestas |
| Temporada | Definición institucional de campañas comparables: clave, definición y duración, asignadas por la Directiva (EST-D-02) | `ComparabilitySeason` y `CampaignSeasonClassification` (§6) |
| Trabajo | Solicitud de cálculo por lotes y su estado operativo (EST-D-04) | `EstimationJob` (§6) |
| Estimación | Referencia calculada para la campaña siguiente comparable (h = 1) | `EstimationRun` y `EstimationResult` (§6) |
| Propuesta conjunta | Borrador que las personas revisan | `JointPurchaseProposal`; la estimación solo podrá mostrarse en una columna aparte (F12-EST-08) y nunca se suma |

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
- Es una especificación: no hay ruta implementada que lo pruebe (§12).

**Defensa en profundidad, probada contra PostgreSQL (§12).** Quien define una temporada, clasifica una campaña, pide un trabajo o figura como solicitante de una ejecución debe ser, en el momento de cada escritura:
- Member **activo**;
- con **cuenta activa** (`User.isActive`);
- del tenant;
- con el rol registrado, DIRECTIVA o ADMINISTRADOR.

**Lo que no se entrega en ningún perfil:**
- inventarios privados, compras, cuentas familiares, fotografías ni existencias privadas;
- aportes individuales: cantidad por agricultor, Member que aporta o número de aportantes de una fila.

La serie solo usa cifras ya publicadas y selladas (§3).

**Perfiles de lectura** (`profile` en la respuesta):
- **`INSTITUTIONAL`** (DIRECTIVA y ADMINISTRADOR): por producto, la estimación, la línea base naive, la cobertura y la vigencia. El detalle de una ejecución añade los puntos de la serie, que son las cifras publicadas que ya pueden leer en el historial sellado (F07).
- **`FARMER`** (AGRICULTOR, EST-D-05): por producto, el estado, el motivo, el método, las fechas, la temporada, la longitud del tramo, la vigencia y **solo la estimación**.
  - **Sin** línea base naive: es literalmente la última cifra publicada.
  - **Sin** cobertura ni serie: en F07, la cifra colectiva solo la lee la Directiva (3.12.6.3).
  - **La estimación puede coincidir con una cifra histórica publicada.** Ocurre, por ejemplo, con α = 1 o con un criterio constante, en que reproduce la última cifra, o con una serie constante. Entregarla al Agricultor proyecta información colectiva que hoy solo lee la Directiva (RF-39, tabla 3.49).
  - **Esa proyección debe estar contemplada en la política institucional** (GOV-02, #107) antes de usar datos reales. Hoy la política es `F07-POL-01` en modo `PROVISIONAL_SYNTHETIC`: solo datos sintéticos y **no aprobada**. Este contrato no habilita datos reales ni declara aprobada ninguna política.

## 3. Fuentes de la serie (para F12-EST-02 y F12-EST-03)

1. **Variable.** Es el consumo publicado `CONSUMPTION_TOTAL` por producto canónico y unidad base `ML` o `G`, la misma de Sync v1 (RN-25).
   - No se convierten litros en kilogramos ni se mezclan presentaciones.
   - Un producto cuya unidad central no es enlazable (`baseUnitForCentralUnit` = null), o que no es canónico, **no es estimable**:
     - si se pide en `product_refs`, la respuesta es **422 `PRODUCT_NOT_ESTIMABLE`**;
     - por defecto no se incluye, porque Sync v1 solo publica consumo de unidades enlazables.
2. **Comparabilidad (EST-D-02).** Son comparables las campañas **clasificadas explícitamente** en la misma temporada.
   - La Directiva define la temporada (`ComparabilitySeason`): clave de comparabilidad, definición y duración nominal en días.
   - Después clasifica cada campaña en una temporada (`CampaignSeasonClassification`), una sola vez.
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
   - Un cambio de asociaciones, de cifras o de clasificaciones crea una **versión nueva** de la serie (`version + 1`, `previousSeriesId`).
   - La anterior se conserva con las ejecuciones que la usaron.
5. **Política pendiente.** Si la política de divulgación está en `POLICY_PENDING`, no hay cifras publicadas:
   - **no se encola ni se registra** nada: **409 `POLICY_PENDING`**, el mismo código que ya usan las propuestas;
   - si pasa a pendiente con un trabajo en cola, el trabajo termina `NOT_EXECUTED` con `POLICY_PENDING`, sin ejecución;
   - **ninguna lectura entrega cifras:** también 409 (§4.3);
   - la base rechaza una ejecución con `disclosureMode = POLICY_PENDING`.
6. **Cobertura (EST-D-09).** La cobertura «N de M» exigida por RN-25 se trata en el punto 7.

### 3.1 Cobertura: lo que hay en F07 y lo que falta (EST-D-09)

**Comprobado en el código y el esquema F07** (`collective-summary.use-case.ts`, `collective-seal.use-case.ts` y la migración `20261023100000_f07_collective_seal`). `CollectiveSeal` guarda una sola cobertura **por campaña**, fijada al sellar y nunca recalculada:

| Campo | Significado comprobado |
|---|---|
| `linkedMembers` (M) | Members `AGRICULTOR` activos, con cuenta activa, del sindicato **en el momento del sellado** (`linkedMembers()`) |
| `membersWithContribution` (N) | Members distintos que forman parte de **alguna** cifra publicada de la campaña (`publishedMembers()`), de **necesidad o de consumo**. Incluye a los Members de una cifra anterior que se sigue mostrando (`SHOW_PRIOR`), que pueden no estar ya en M. Desde F10-SEC-02 (2026-10-16) no cuenta los aportantes de celdas suprimidas; el sellado existe desde el 2026-10-23, así que todos los sellados usan esta regla |

Es la «cobertura general» de 3.12.6.3. Su numerador **mezcla** necesidades y consumo: no identifica cuántos agricultores forman parte del consumo publicado. **No hay** en F07 una cobertura del consumo por campaña ni por cifra.

**Lo que no se usa como sustituto:**
- el número de aportantes de una fila (`CollectiveRelease.contributorCount`), que es otra cosa y la política no lo entrega;
- la membresía actual, que no es la de la fecha de corte.

**Consecuencia en v1.** La base **no guarda** ninguna cobertura de punto: no hay columnas para ella, porque no existe una fuente verificable que copiar. El cálculo (F12-EST-03) informa `INCOMPATIBLE_DATA` con `COVERAGE_UNKNOWN`, sin cifras, cuando RN-25 exige la cobertura. Ninguna cifra histórica se reconstruye.

**Modificación mínima para fuentes futuras (propuesta, no construida):**
1. Una tabla aditiva del sellado, por ejemplo `CollectiveSealCoverage(sealId, projectionType, membersInPublishedFigures, linkedMembers)`, escrita en la misma transacción que el sellado y con la misma inmutabilidad.
2. Para `CONSUMPTION_TOTAL`, N cuenta los Members distintos dentro de alguna cifra de consumo **publicada** de la campaña; M es el mismo `linkedMembers` del sellado.
3. Un punto la leería a través de su `sourceSealId`, sin copiarla. Los sellados anteriores quedarían con cobertura desconocida.

Esto cambia F07 (el caso de uso del sellado y una migración), así que va en un issue propio.

## 4. Rutas (v1) y semántica

Todas las rutas están bajo `/api/v1/estimation`, con bearer y respuestas JSON con `contract_version: 1`. Las cantidades van en la unidad base, como texto: enteros para la serie y el naive, y decimal con hasta 6 cifras para la estimación. La unidad de presentación es `L` o `KG`.

| Método y ruta | Roles | Escribe | Propósito |
|---|---|---|---|
| `POST /estimation/seasons` | DIRECTIVA, ADMINISTRADOR | Una temporada, una vez | EST-D-02 |
| `GET /estimation/seasons` | DIRECTIVA, ADMINISTRADOR | No | Temporadas del sindicato |
| `POST /estimation/campaign-classifications` | DIRECTIVA, ADMINISTRADOR | Una clasificación, una vez | EST-D-02 |
| `GET /estimation/campaign-classifications` | DIRECTIVA, ADMINISTRADOR | No | Clasificaciones; una campaña ausente está sin clasificar |
| `POST /estimation/jobs` | DIRECTIVA, ADMINISTRADOR | Un trabajo en cola | CU-20, por lotes (EST-D-04) |
| `GET /estimation/jobs/{jobId}` | DIRECTIVA, ADMINISTRADOR | No | Estado operativo, sin cifras |
| `GET /estimation/runs` | DIRECTIVA, ADMINISTRADOR | No | Ejecuciones anteriores, paginadas con un cursor opaco |
| `GET /estimation/runs/{runId}` | DIRECTIVA, ADMINISTRADOR | No | Ejecución completa: parámetros, política, temporada, resultados, serie y vigencia derivada |
| `GET /estimation/results?target_campaign_ref=` | AGRICULTOR, DIRECTIVA, ADMINISTRADOR | No | CU-21: resultado por producto para la campaña objetivo, con vigencia y perfil |
| `GET /estimation/download?target_campaign_ref=` | AGRICULTOR, DIRECTIVA, ADMINISTRADOR | No | RF-40: copia para consultar sin conexión, con perfil |

No existen `PUT`, `PATCH` ni `DELETE` en INT-09, y lo comprueba `openapi:check` (§12).

### 4.1 Temporadas y clasificaciones (EST-D-02)

- **`POST /estimation/seasons`:** `{ contract_version: 1, key, definition, duration_days }`.
  - La clave no lleva espacios al principio ni al final.
  - La definición no está vacía y la duración es positiva.
  - Una clave repetida en el sindicato da **409 `SEASON_KEY_TAKEN`**.
- **`POST /estimation/campaign-classifications`:** `{ contract_version: 1, campaign_ref, season_ref }`.
  - **404 `CAMPAIGN_NOT_FOUND`** o **`SEASON_NOT_FOUND`** si no son del sindicato.
  - **409 `CAMPAIGN_ALREADY_CLASSIFIED`** si la campaña ya tiene temporada: no se reemplaza.
- Ninguna de las dos se modifica ni se borra. Otra definición es otra temporada con otra clave.
- Corregir una clasificación equivocada **no tiene ruta en v1** (§11, EST-D-14).

### 4.2 Pedir una estimación: trabajo por lotes (EST-D-04)

Como prevé 3.12.7, el cálculo ocurre **fuera de la petición interactiva**. La petición solo valida y encola.

**Petición:** `{ contract_version: 1, request_id, target_campaign_ref, product_refs? }`.
- Sin `product_refs`, se estiman los productos canónicos estimables con consumo publicado en la temporada de la campaña objetivo.
- Como mucho 200 productos: es un límite técnico propuesto, no una decisión del autor.

**Validación síncrona.** Si falla, **no se escribe nada**:
- rol: 403 (§2);
- campaña objetivo:
  - del sindicato, o **404 `TARGET_CAMPAIGN_NOT_FOUND`**;
  - `PLANIFICADA` o `ABIERTA`, o **422 `TARGET_CAMPAIGN_NOT_ELIGIBLE`** (EST-D-06);
  - clasificada en una temporada, o **422 `TARGET_CAMPAIGN_NOT_CLASSIFIED`**;
- `product_refs`:
  - inexistente o de otro sindicato: **404 `PRODUCT_NOT_FOUND`**;
  - no canónico o con unidad no enlazable: **422 `PRODUCT_NOT_ESTIMABLE`**;
- política pendiente: **409 `POLICY_PENDING`**;
- idempotencia: `request_id` es un UUID, y el trabajo guarda la huella de la petición canónica (`requestHash`: campaña objetivo y productos pedidos):
  - el mismo identificador con la misma huella devuelve **200** con el mismo trabajo, sin encolar otro;
  - con otra huella devuelve **409 `REQUEST_ID_REUSED`**.

**Respuesta: 202** con el trabajo en `QUEUED`. El cliente consulta `GET /estimation/jobs/{jobId}` hasta `COMPLETED`, que lleva `run_ref`, o `NOT_EXECUTED`, que lleva `stop_code`.

**Mecanismo mínimo, sin plataforma de colas:**
- **Trabajador.** Es un proveedor del propio Backend NestJS, que arranca con la aplicación. No añade dependencias ni servicios.
- **Tomar un trabajo.** Cada cierto intervalo toma un trabajo con una sola sentencia, sobre los que están `QUEUED` o `RUNNING` con el plazo vencido, en orden de llegada:

  ```sql
  UPDATE "EstimationJob" SET status = 'RUNNING', attempts = attempts + 1, "startedAt" = now(), "leaseExpiresAt" = now() + <plazo>
  WHERE id = (SELECT id FROM "EstimationJob" WHERE … ORDER BY "enqueuedAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
  ```

  Con varias instancias, `SKIP LOCKED` y el plazo evitan que dos tomen el mismo trabajo. Si una instancia cae, el plazo vence y otra lo retoma.
- **Comprobaciones al ejecutar** (propuesta del contrato; extiende EST-D-13 y la política al momento del lote, §11.2). El trabajo termina `NOT_EXECUTED`, sin ejecución, si:
  - la política está pendiente (`POLICY_PENDING`);
  - el solicitante ya no es Member activo con cuenta activa y el mismo rol (`REQUESTER_NOT_AUTHORIZED`);
  - la campaña objetivo ya no es `PLANIFICADA` ni `ABIERTA` (`TARGET_CAMPAIGN_NOT_ELIGIBLE`).
- **Cálculo y registro:**
  1. Leer las fuentes (§3).
  2. Construir o reutilizar las series (F12-EST-02).
  3. Clasificar las posiciones y el tramo (F12-EST-03).
  4. Calcular SES y naive (F12-EST-04).
  5. Registrar **en una sola transacción** la ejecución, sus resultados, las series nuevas y el paso del trabajo a `COMPLETED`. La base exige que el trabajo esté `RUNNING` y que un `COMPLETED` tenga su ejecución.
- **Intentos agotados.** Pasado el máximo de intentos sin terminar, el trabajo queda `NOT_EXECUTED` con `ATTEMPTS_EXHAUSTED`.
- **Configuración.** El intervalo, el plazo y el máximo de intentos son parámetros de despliegue, no reglas de negocio; se fijan en F12-EST-05.
- **Límite del despliegue.** El trabajador necesita un proceso del Backend en marcha. Si el servicio se suspende, los trabajos esperan en cola.

**Resultado de la ejecución:**
- La ejecución lleva `outcome: CALCULATED` o, si el cálculo falla, `outcome: FAILED` con `failure_code` (`CALCULATION_FAILED` o `SOURCES_UNAVAILABLE`). En ese caso no hay ninguna cifra, pero la ejecución **sí se registra** (RN-27, RN-28).
- **Datos insuficientes:** menos de 3 campañas consecutivas comprobadas, o la última campaña pertinente sin consumo comprobado. Se informa **por producto** con `status: INSUFFICIENT_DATA` y su `reason_code`, sin cifras.
- **Datos incompatibles:** `INCOMPATIBLE_DATA`, con `MIXED_UNITS`, `NO_COMPARABLE_CAMPAIGNS` o `COVERAGE_UNKNOWN` (§3.1).
- **Fallo del cálculo** en un producto: `CALCULATION_FAILED`, con `CALCULATION_ERROR`.
- Que el SES no mejore al naive **no** es un error: es un resultado `ESTIMATED` válido (RN-28).

**Sucesión: una sola cadena por campaña objetivo.**
- La primera ejecución no tiene anterior, y cada una de las siguientes referencia la anterior (`previousRunId`) sin modificarla.
- La base admite **una sola raíz y un solo sucesor por ejecución**, y **una sola ejecución por trabajo**.
- Si dos trabajos de la misma campaña objetivo terminan a la vez, la transacción perdedora se deshace y el trabajador la repite sobre la nueva anterior (propuesta del contrato). Esto ya no llega al cliente como error.

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

**`GET /estimation/runs` y `GET /estimation/runs/{runId}`** muestran el historial completo, incluidas las ejecuciones fallidas y las sustituidas, con su vigencia derivada (RN-27).

**La política y la divulgación vigentes se aplican al leer**, en todas las rutas con cifras (3.12.3.4: «Un resultado histórico sigue sujeto a los permisos y a la política de divulgación vigentes»). Esto **vuelve a comprobar** la fuente sellada (EST-D-03):
- En `POLICY_PENDING`, las cuatro rutas de lectura con cifras responden **409 `POLICY_PENDING`**.
- Un punto cuya entrada sellada ya no es `DISCLOSED` y visible, o cuya cifra oculta una política más estricta, se entrega como `HIDDEN`, sin cantidad. La fila conserva la cantidad que tenía al construirse.
- Un resultado que usó una cifra que ya no se divulga se entrega **sin cifras** (`estimate_base` y `naive_base` nulos), con `validity: OUTDATED` y `validity_reason: SOURCES_WITHDRAWN`. Así **la estimación no revela lo que la consulta directa oculta** (3.12.6.3).

## 5. Procedencia, versiones y huellas

- **`ConsumptionSeries.sourceHash`:** SHA-256 en hexadecimal de la lista canónica de fuentes.
  - Cubre la temporada y, en orden, cada campaña con su clasificación, su sellado, su divulgación, el estado de visibilidad de la entrada y las asociaciones canónicas usadas con su `validFrom`.
  - **`sources`** guarda esa lista (JSON) para poder auditarla.
- **`EstimationRun`:** guarda el trabajo que la produjo (`jobId`), el solicitante y su rol, la campaña objetivo y la temporada.
  - También el método (`SES_NAIVE`), `methodVersion`, los parámetros, el horizonte (1) y la política de divulgación aplicada (`disclosureMode`, `policy`, `threshold`).
  - Y `generatedAt`, que fija el trabajador con la hora del servidor. La base no la impone: solo exige que no sea anterior a la de la ejecución precedente.
  - La huella de la petición queda en el trabajo (`requestHash`).
- **`EstimationRun.contentHash`:** SHA-256 de la ejecución y de todos sus resultados, serializados de forma canónica, con los campos y el orden fijados en F12-EST-05.
  - Permite comprobar que una ejecución **no se alteró**.
  - La conservación depende además de que no haya rutas de modificación y de los disparadores (§6.3).
- **Cada resultado** referencia la versión de la serie que usó (`seriesId`). Así quedan identificadas las fuentes y sus versiones de cada cifra (RF-37, DAT-19).

## 6. Modelo de datos (migración `20261101233651_f12_est_01_estimation`)

### 6.1 Tablas

Los nombres siguen la convención del repositorio: PascalCase, sin `@@map`, ids UUID, FK `Restrict`.

| Nombre del diseño (3.12.3.4) | Tabla | Contenido |
|---|---|---|
| (EST-D-02) | `ComparabilitySeason` | Tenant, `key`, `definition`, `durationDays`, quién la define y su rol, `createdAt` |
| (EST-D-02) | `CampaignSeasonClassification` | Campaña (clave primaria), tenant, temporada, quién clasifica y su rol, `classifiedAt` |
| `consumption_series` | `ConsumptionSeries` | Tenant, producto canónico, unidad base, temporada, `version`, `previousSeriesId`, `sourceHash`, `sources`, `builtAt` |
| `series_point` | `SeriesPoint` | Serie, `position`, campaña, `kind`, `quantityBase` (solo comprobado), `sourceSealId`, `sourceReleaseId`. **Sin cobertura** (§3.1) |
| (EST-D-04) | `EstimationJob` | Tenant, `requestId`, `requestHash`, solicitante y rol, campaña objetivo, `productRefs`, y el estado operativo: `status`, `attempts`, `enqueuedAt`, `startedAt`, `leaseExpiresAt`, `finishedAt`, `stopCode` |
| `estimation_run` | `EstimationRun` | Tenant, `jobId` (único), solicitante y rol, campaña objetivo, temporada, contrato, método y versión, parámetros, `horizon`, política aplicada, `outcome`, `failureCode`, `previousRunId`, `contentHash`, `generatedAt` |
| `estimation_result` | `EstimationResult` | Ejecución, producto canónico, unidad base, serie, `status`, `reasonCode`, `estimateBase`, `naiveBase`, `alpha`, `fitInformative`, `fitCriterion`, tramo (`spanFirstPosition`, `spanLastPosition`), `exclusions`, `validations`, `metrics` |

`estimation_cache` del diseño no es una tabla del servicio: es la copia del cliente, en SQLite o IndexedDB (§9).

### 6.2 Restricciones

**`ComparabilitySeason_values`:**
- clave no vacía y sin espacios al principio ni al final;
- definición no vacía y duración positiva;
- rol DIRECTIVA o ADMINISTRADOR.

**`CampaignSeasonClassification_values`:** rol DIRECTIVA o ADMINISTRADOR.

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
  - `NOT_EXECUTED`: con fin y `stopCode` de la lista cerrada.

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
- `failureCode` de la lista cerrada, si y solo si la ejecución es `FAILED`;
- huella hexadecimal de 64 caracteres.

**`ConsumptionSeries_values`:** la versión 1 no tiene serie anterior y las siguientes sí; la huella es hexadecimal; `sources` es una lista.

**Unicidad:**
- una clave de temporada por tenant;
- una clasificación por campaña;
- una serie por (tenant, producto, unidad, temporada, versión), con un solo sucesor;
- un `requestId` por tenant (en el trabajo);
- una ejecución por trabajo;
- **una sola ejecución raíz por tenant y campaña objetivo** (índice único parcial `EstimationRun_one_root_per_target`, solo en SQL, como `ProductCanonicalAssociation_one_active_per_product`) y un solo sucesor por ejecución;
- un punto por campaña en cada serie;
- un resultado por (ejecución, producto, unidad).

**Lo que la base no comprueba.** Solo comprueba la **aritmética** del tramo. Que las posiciones existan, sean comprobadas, contiguas y finales, y que el naive sea el último valor, lo garantiza el cálculo (F12-EST-03 y F12-EST-04), no la base.

### 6.3 Inmutabilidad, estado operativo y pertenencia (disparadores)

**Inmutabilidad.** `ComparabilitySeason`, `CampaignSeasonClassification`, `ConsumptionSeries`, `SeriesPoint`, `EstimationRun` y `EstimationResult` **rechazan UPDATE, DELETE y TRUNCATE**, con «… es inmutable».

**Estado operativo.** `EstimationJob` es la única tabla que cambia, y solo en su estado:
- la petición (`requestId`, `requestHash`, solicitante, rol, campaña objetivo, productos y `enqueuedAt`) no cambia;
- las transiciones son `QUEUED` → `RUNNING`, `RUNNING` → `RUNNING` (otro intento, con más intentos), `COMPLETED` o `NOT_EXECUTED`, y los intentos no disminuyen;
- la campaña objetivo de un trabajo nuevo está clasificada;
- un trabajo cuya ejecución ya está registrada solo puede pasar a `COMPLETED`;
- un estado final no cambia;
- `COMPLETED` exige su ejecución;
- **no se borra** ni se vacía.

**Misma transacción.** Los puntos y los resultados solo se insertan en la misma transacción que crea su serie o su ejecución, con la comparación `xmin` frente a `pg_current_xact_id()` del sellado F07. Una serie o una ejecución **no admite añadidos posteriores**.

**Pertenencia:**
- la campaña, la temporada, el producto, la divulgación y el sellado de cada fila son del mismo tenant;
- quien define, clasifica o pide es Member **activo**, con **cuenta activa**, del tenant y con el rol registrado (`estimation_is_active_member`), también al registrar la ejecución;
- la campaña de un punto está **clasificada en la temporada de la serie**;
- un consumo comprobado es de una campaña **CERRADA**, y su divulgación es la **vigente** de `CONSUMPTION_TOTAL` de esa celda, **con la misma cifra**, y la entrada `DISCLOSED` y visible del sellado citado;
- un `HIDDEN` que cita un sellado corresponde a una entrada no visible de ese sellado; un `NO_RECORD` que cita un sellado, a ninguna entrada de consumo de esa celda;
- el producto es **canónico**: no es hoy denominación de otro;
- la serie anterior es del mismo ámbito y de la versión inmediatamente anterior;
- una ejecución procede de un trabajo `RUNNING` con la misma campaña objetivo y el mismo solicitante;
- la campaña objetivo de una ejecución está clasificada en su temporada;
- la ejecución anterior es de la misma campaña objetivo y no posterior;
- una ejecución `FAILED` no admite resultados `ESTIMATED`;
- la serie de un resultado es del mismo producto, unidad y temporada.

**Reparto del trabajo.** La forma de cada fila la decide el CHECK; los disparadores solo validan las referencias de filas bien formadas.

**Exigencia redundante.** Que un consumo comprobado sea de una campaña CERRADA no puede fallar hoy: F07 solo sella campañas CERRADAS y no deja cambiar el estado de una campaña sellada. Se mantiene por si F07 cambia.

### 6.4 Lo que no hay

- **Ninguna columna de vigencia.** Se deriva al consultar (§8).
- **Ningún campo de aprobación manual** (§7).
- **Ninguna columna de cobertura**, mientras no exista la fuente de §3.1.
- **Ninguna ruta de modificación o borrado.**
- **Ninguna clasificación inicial.** La migración no clasifica campañas ni toca sellados.
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
3. **`OUTDATED`:** cambiaron de forma conocida las cifras, asociaciones o clasificaciones que la sustentan.
   - `SOURCES_CHANGED`: por ejemplo, la serie vigente de (*P*, *U*, temporada) tiene otra `sourceHash`. Cómo se detecta exactamente se fija en F12-EST-05 (EST-D-12).
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

### 11.1 Decididas por el autor (2026-11-01, Bolivia)

| Id | Decisión | Dónde queda |
|---|---|---|
| EST-D-01 | Incluir la estimación exploratoria SES/naive, reconociendo que SES es pronóstico estadístico; mantener excluidos ARIMA, Prophet, redes neuronales, variables externas y recomendaciones automáticas | ADR-004; `CURRENT_SCOPE.md` §11 y los tres `AGENTS.md` |
| EST-D-02 | Clave de comparabilidad explícita, asignada por la Directiva y asociada a una definición de temporada y una duración; nada inferido de nombres ni fechas; las campañas antiguas sin clasificación comprobada quedan sin clasificar | §3 (punto 2), §4.1, §6 |
| EST-D-03 | Campañas cerradas con fuente sellada para el consumo comprobado; procedencia exacta; divulgación comprobada de nuevo al consultar | §3 (punto 3), §4.3, §6 |
| EST-D-04 | Cálculo por lotes fuera de la petición, con el mecanismo mínimo, sin plataforma de colas; ejecuciones finales inmutables y estado operativo aparte | §4.2, §6 |
| EST-D-05 | El Agricultor consulta la estimación sin naive, cobertura ni serie; puede coincidir con una cifra histórica; la proyección debe estar en la política institucional; no se habilitan datos reales ni se declara aprobada la política | §2 |
| EST-D-09 | Comprobar la cobertura F07; sin fuente verificable del consumo, `COVERAGE_UNKNOWN` y la modificación mínima propuesta | §3.1 |
| EST-D-13 | Autorización existente por roles, con identidad, pertenencia y cuenta activa; ningún segundo sistema | §2, §6.3 |

### 11.2 Pendientes y compatibilidad con lo decidido

| Id | Decisión | Propuesta | Compatibilidad | Quién o cuándo |
|---|---|---|---|---|
| EST-D-06 | Campaña objetivo admisible | Del sindicato, `PLANIFICADA` o `ABIERTA` | Compatible. EST-D-02 añade que esté clasificada (`TARGET_CAMPAIGN_NOT_CLASSIFIED`) | F12-EST-05 |
| EST-D-07 | Redondeo de la estimación | 6 decimales en la unidad base; el modo, en F12-EST-04 | Compatible | F12-EST-04 |
| EST-D-08 | Qué sustituye a un resultado | Una ejecución posterior `CALCULATED` que incluya el producto; una `FAILED`, no | Compatible: con lotes, «posterior» es el orden de la cadena | F12-EST-05 |
| EST-D-10 | Política pendiente | 409 al pedir y al leer | Compatible. EST-D-04 añade el caso del trabajo en cola: `NOT_EXECUTED` con `POLICY_PENDING` | F12-EST-05 |
| EST-D-11 | Retención | Sin borrado; la política, en GOV-02 | **Se amplía:** ahora también crecen los trabajos (`EstimationJob`), que la base no deja borrar | Roderich |
| EST-D-12 | Detección de `OUTDATED` | Huella de las fuentes vigentes frente a `sourceHash` | Compatible. La huella incluye temporada, clasificaciones, sellados y visibilidad (§5) | F12-EST-05 |
| EST-D-14 | Corregir una clasificación o una temporada equivocadas | Ninguna en v1: son inmutables y no hay ruta | Nueva, derivada de EST-D-02: una clasificación errónea no se puede corregir. Si se quiere corregir, haría falta una sucesión de clasificaciones sin sobrescribir, como las series | Roderich |
| EST-D-15 | Paradas sin ejecución al ejecutar el lote: solicitante sin permiso, política pendiente o campaña objetivo ya no admisible | `NOT_EXECUTED` con su `stopCode`, sin ejecución (§4.2). Es una propuesta del contrato: extiende EST-D-13 y la política al momento del lote | **Regla nueva del contrato, no decidida por el autor.** Deja peticiones sin ejecución registrada, como `ATTEMPTS_EXHAUSTED` (§11.3) | Roderich, antes de F12-EST-05 |
| EST-D-16 | Límites del lote: hasta 200 productos por trabajo y repetición automática de una ejecución en conflicto | Los del §4.2 | Propuestas técnicas del contrato, no decisiones del autor | F12-EST-05 |

### 11.3 Incompatibilidades concretas detectadas

1. **RN-25 frente a EST-D-09.** RN-25 no estima una serie sin cobertura identificada, y ningún sellado tiene una cobertura del consumo (§3.1). Con las fuentes actuales, **todo resultado será `INCOMPATIBLE_DATA` con `COVERAGE_UNKNOWN`**, también con datos sintéticos que pasen por F07.
   - Para obtener un `ESTIMATED` hace falta la modificación de §3.1 y al menos tres campañas consecutivas selladas con ella.
   - La alternativa sería aceptar como «cobertura identificada» la cobertura general por campaña del sellado. Mezcla necesidades y consumo, y este contrato no la adopta.
   - **Bloquea F12-EST-03 y F12-EST-04.**
2. **EST-D-05 sin soporte en la política.** La política vigente (`F07-POL-01`, `PROVISIONAL_SYNTHETIC`, no aprobada) no contempla la proyección de la estimación al Agricultor. El contrato la conserva solo con datos sintéticos. Cuando GOV-02 la defina, F12-EST-06 debe comprobarla. Hoy no hay un indicador técnico para ello, y este bloque no lo crea.
3. **EST-D-03 frente al sellado desactivado.** Si un despliegue tiene el sellado desactivado (`SEALING_DISABLED` en F07), ninguna campaña aporta consumo comprobado.
4. **Paradas sin ejecución frente a RN-27.** Un trabajo que agota sus intentos, o que se detiene por permiso, política o campaña (EST-D-15), termina `NOT_EXECUTED` sin ejecución, porque ningún cálculo concluyó. RN-27 conserva las ejecuciones «calculadas o fallidas». Si estas paradas deben quedar también como ejecución `FAILED`, hay que decidirlo antes de F12-EST-05.
5. **Exclusión general en F06.** `F06_COLLECTIVE_PROJECTION_CONTRACT.md` §1 dice «No hay … forecasting, IA, recomendación» para lo que custodia Central en la proyección colectiva. La estimación es un módulo aparte que solo lee cifras publicadas, pero el texto no lo distingue. Según las reglas del proyecto, ante una contradicción gana el contrato. Acotar ese texto, como se hizo con `CURRENT_SCOPE`, necesita una autorización que este bloque no tiene.

## 12. Especificado, construido y comprobado

| Afirmación | Estado | Cómo |
|---|---|---|
| Rutas, peticiones, respuestas, perfiles, errores, trabajo por lotes, vigencia, política al leer y copia descargada | **Especificado** | `docs/api/openapi-f12-estimation.json` |
| La especificación es coherente y completa (detalle debajo) | **Comprobado por script** | `Back/scripts/openapi-f12-estimation.cjs`, dentro de `npm run openapi:check` |
| Que no hay rutas `/api/v1/estimation` implementadas | **Comprobación de esta etapa** | El mismo script, contra `openapi-f02.json`, que se genera desde el código, mientras la especificación diga `SPECIFIED_NOT_IMPLEMENTED`. **No prohíbe implementar INT-09:** F12-EST-05 cambia ese estado y sustituye la comprobación por la comparación con el OpenAPI generado; con otro estado, el script falla y lo pide |
| Esquema: temporadas, clasificaciones, series, puntos, trabajos, ejecuciones y resultados | **Construido** | Migración `20261101233651_f12_est_01_estimation` |
| Rechazos de la base (detalle debajo) | **Comprobado contra PostgreSQL** | `f12-est-01-estimation-schema.postgres.spec.ts` (11 pruebas) |
| La migración es aditiva: conserva las filas, sellados, columnas, restricciones, índices y disparadores de todas las tablas previas, no clasifica ninguna campaña y no cambia `DemandForecast` | **Comprobado contra PostgreSQL** | La misma suite, desde la base previa (13 migraciones) con datos sintéticos |
| Rechazo HTTP 403 de una identidad sin permiso; 409 en `POLICY_PENDING`; 202 al encolar; selección de la consulta; perfiles; retirada de cifras al leer | **Solo especificado** | No hay controlador. Se probará en F12-EST-05 y F12-EST-06 |
| Trabajador por lotes: toma con `SKIP LOCKED`, plazo, intentos y comprobaciones al ejecutar | **Solo especificado** | La base sí prueba las transiciones y que una ejecución exige un trabajo en curso |
| SES, naive, series, tramo, vigencia, cobertura futura y clientes | **No construido** | F12-EST-02 a F12-EST-07, y el issue de §3.1 |

**Lo que comprueba el script** sobre la especificación:
- OpenAPI 3.0.3, referencias resueltas y ningún `$ref` con hermanos;
- bearer, objetos cerrados y sin `PUT`/`PATCH`/`DELETE`;
- rutas, métodos y el conjunto exacto de respuestas de cada operación;
- roles anotados por operación (`x-roles`; no hay `@Roles` con qué contrastarlos), y 409 `POLICY_PENDING` en las operaciones con cifras;
- que pedir una estimación encola un trabajo (202, `Job`) y no calcula en la petición;
- la temporada explícita en peticiones y ejecuciones;
- la cobertura solo `UNKNOWN` y sin cifras;
- la exigencia de política en las rutas del Agricultor;
- perfiles, con el del Agricultor sin naive, cobertura ni serie;
- enums iguales a los del esquema Prisma, y códigos cerrados (`reasonCode`, `failureCode`, `stopCode`) iguales a los de la migración;
- ningún campo de aportes ni de aprobación en esquemas y parámetros, y ninguna columna de vigencia, aprobación ni cobertura en los modelos;
- la copia descargada con sus campos obligatorios.

**Lo que rechaza la base:**
- solicitantes, clasificadores o autores de temporadas AGRICULTOR, inactivos, con la cuenta desactivada o de otro sindicato;
- temporadas sin clave, definición o duración válidas; claves repetidas;
- clasificaciones repetidas o entre sindicatos;
- puntos de campañas sin clasificar o de otra temporada;
- consumo comprobado sin sellado, con una entrada no visible o ajena, o con una cifra distinta de la divulgada vigente;
- datos ocultos que el sellado no oculta, ausencias que el sellado sí tiene y ausencias sin sellado en una campaña sellada;
- mezclar cero, ausencia y dato oculto;
- un producto no canónico;
- trabajos que no nacen en cola o cuya campaña objetivo no está clasificada, cambios de la petición, transiciones hacia atrás o desde un estado final, intentos que disminuyen o no aumentan, `COMPLETED` sin ejecución, cualquier estado distinto de `COMPLETED` con ejecución, y borrados;
- ejecuciones sin trabajo en curso, de otra petición, de un solicitante que perdió el permiso, de una campaña objetivo sin clasificar o con la política pendiente;
- cifras fuera de `ESTIMATED` y motivos de otro estado;
- dos raíces, dos sucesores, dos ejecuciones por trabajo o un antecesor posterior;
- UPDATE, DELETE y TRUNCATE de las tablas inmutables;
- añadidos fuera de su transacción.

`npm run openapi:check` **sin** el script nuevo solo comparaba los cuatro archivos generados desde el código (`openapi-f02`, `-f05-sync-v1`, `-f06-collective` y `-f08-backups`). Un archivo nuevo en `docs/api/` habría pasado sin leerse.

## 13. Registro de revisiones

| Fecha | Cambio |
|---|---|
| 2026-11-01 | Versión inicial (F12-EST-01, #174) |
| 2026-11-01 | Tras una lectura de contraste de otro agente de la sesión, antes del primer commit, se corrigieron cinco bloqueantes: el perfil del Agricultor sin naive ni cobertura, la política vigente al leer, la selección de la consulta frente a la vigencia, las unidades no enlazables como 422 y los CHECK de las cifras. También se corrigieron menores: una sola cadena por campaña objetivo, la cifra igual a la divulgada, la entrada sellada, el Member activo, el producto canónico, los códigos cerrados, `TRUNCATE`, `requestHash`, `$ref` anulables y los textos de 401 y 403 |
| 2026-11-02 (UTC) | Conciliación con las decisiones del autor EST-D-01 a 05, 09 y 13 (§11.1). Cambios: ADR-004; temporadas y clasificaciones explícitas en lugar de `comparabilityKey`; fuente sellada obligatoria; trabajos por lotes en lugar del cálculo en la petición, de modo que `POST /runs` pasa a `POST /jobs` y desaparece `RUN_SUCCESSION_CONFLICT`; cobertura retirada del esquema y `UNKNOWN` en la API; cuenta activa en la defensa de la base; la comprobación de ausencia de rutas pasa a ser de etapa. La migración, sin publicar en `main`, se reescribió en el mismo archivo. Una lectura de contraste de otro agente de la sesión, antes del commit, encontró dos bloqueantes, corregidos: un trabajo con ejecución podía pasar a `NOT_EXECUTED`, y una campaña sellada admitía `NO_RECORD` sin sellado. También se corrigieron menores: motivo emparejado con su estado, otro intento con más intentos, trabajo solo para campañas clasificadas, reglas propias declaradas como EST-D-15 y EST-D-16, textos de F06 y F07 sin tocar declarados, redacción de `CURRENT_SCOPE` y del 409, y pruebas de cuenta desactivada y de otro sindicato |
