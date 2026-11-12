# E3 — Estimación del consumo integrada en el borrador de propuesta (contrato de la etapa 3)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-11 (redacción e implementación); estado **Propuesto**, pendiente de la aceptación de Roderich |
| Alcance | La Directiva prepara un borrador de propuesta desde necesidades declaradas y, en el mismo recorrido, obtiene y fija una **referencia de consumo estimado**, la revisa y la actualiza de forma explícita; elige productos y prepara una convocatoria sin inscribir a nadie |
| Bases | Back/Web: rama `feat/etapa3-estimacion-borrador` desde `feat/etapa2-convocatorias` `01bcdeb` (worktree `_wt/ET2-BE`) |
| Contratos que **no cambian** | F05, F06, F07 (huella del borrador, política de divulgación, sellado), F12 (motor SES/naive, parámetros, trabajos, ejecuciones, vigencia, permisos), E1, E2 (salvo §10) |
| Fuera de alcance | Otro motor de estimación; cambios en SES, naive o sus parámetros; recomendaciones de compra; semáforos o umbrales de riesgo; exportaciones nuevas; Mobile |

## 1. Qué existe y qué se reutiliza

| Pieza | Qué es | Uso en E3 |
|---|---|---|
| `JointPurchaseProposal` y líneas (F07) | Borrador generado a pedido («Generar borrador») desde las celdas `DECLARED_NEED` del resumen. Las líneas guardan producto canónico, unidad base, estado y la divulgación que respalda la cifra; nunca cantidades por agricultor. **Inmutable**: sólo existe `DRAFT` y no tenía nada editable | Sin cambios. Se le añaden, en tablas aparte, la referencia fijada (§3) y la selección de productos (§6) |
| `EstimationJobsUseCase.request` (F12-EST-05) | Encola un trabajo idempotente por `request_id`; valida campaña objetivo, clasificación, productos estimables y política | Único modo de pedir un cálculo. E3 no calcula nada |
| Trabajador F12 | Toma trabajos, construye series, calcula SES/naive, registra la ejecución inmutable | Sin cambios. **No escribe nada de E3**: el vínculo trabajo → ejecución es 1:1 y la lectura lo resuelve |
| `EstimationReadsUseCase` (§4.3, §8 de F12) | Lectura de ejecuciones y resultados con vigencia derivada, política vigente y retirada de fuentes | La referencia fijada se lee con la misma derivación; ninguna cifra que F12 retendría se entrega |
| `GET /collective/proposals/{id}/estimation-reference` y su CSV (F12-EST-08) | Referencia **vigente al consultar**, sin fijar | Sin cambios (contrato F12 §7.1). La vista del borrador pasa a usar la referencia fijada de E3 |
| `GET /estimation/runs/{runId}` | Detalle de una ejecución: parámetros, política, temporada, serie, cobertura, naive | «Ver cálculo» lo consulta para la ejecución fijada |
| Convocatorias E2 | `JointPurchaseCall` con `sourceProposalId` y referencia por línea a la necesidad divulgada | «Preparar convocatoria» abre el formulario existente con el borrador y los productos elegidos |

**Inspección (2026-11-11):** el borrador se genera con `POST /collective/campaigns/{id}/proposals` y se conserva tal cual; la referencia F12-EST-08 no se guardaba (cada lectura tomaba el último resultado) y la comparación de la vista se calculaba en el navegador sin comprobar período ni población (sesión de rediseño C). E3 sustituye esa comparación por la del servidor (§5).

## 2. Decisiones

| ID | Decisión |
|---|---|
| E3-D1 | La referencia del borrador es una **fila de vínculo** inmutable (`JointPurchaseProposalEstimationLink`) que fija una ejecución concreta o el trabajo que la producirá. La vigente es la de mayor `sequence`. Una ejecución nueva **no** sustituye la referencia: sólo habilita «Actualizar referencia». |
| E3-D2 | Leer nunca calcula ni escribe. Sólo la operación explícita `prepare` (botón «Obtener referencia» o «Actualizar referencia») puede fijar una ejecución o encolar un trabajo. Montar el componente, recargar o volver a la página sólo lee. |
| E3-D3 | `prepare` es idempotente (`request_id`) y serializada por borrador (bloqueo de transacción). Doble toque, reintentos, varias pestañas o dos personas a la vez: el primero fija o encola; los demás reciben la referencia vigente. `INITIAL` con una referencia vigente no escribe; `UPDATE` exige citar la referencia vista (`expected_link_ref`). |
| E3-D4 | Ejecución **compatible** (§4): mismo sindicato; campaña objetivo = campaña del borrador; `CALCULATED`; la última `CALCULATED` de la cadena de esa campaña; con resultado para cada línea estimable del borrador (mismo producto canónico y unidad base); ningún resultado de esas líneas con las fuentes cambiadas, la clasificación corregida o una fuente retirada; política vigente que autoriza cifras. |
| E3-D5 | Sin ejecución compatible: se reutiliza un trabajo `QUEUED`/`RUNNING` del mismo sindicato y campaña cuyos productos pedidos incluyen las líneas estimables; si no hay, se encola uno con `product_refs` = productos estimables del borrador y un `request_id` derivado de (borrador, `request_id` de `prepare`). Si F12 no admite el cálculo (campaña no admisible o sin clasificar, ningún producto estimable) no se escribe nada y la vista dice por qué. |
| E3-D6 | El borrador sigue disponible y editable (selección de productos, §6) mientras se calcula, si no hay datos suficientes o si el cálculo falla. Nada de la estimación bloquea la propuesta ni la convocatoria. |
| E3-D7 | Un resultado tardío no tiene efectos: el trabajador no toca E3; si la referencia vigente ya es otra (actualizada o quitada), la ejecución del trabajo anterior sólo aparece en el historial del vínculo. Nunca se asocia a otro borrador (el vínculo cita su borrador y la base comprueba sindicato y campaña). |
| E3-D8 | La diferencia se calcula en el servidor y sólo cuando las cifras son comparables (§5). Hoy **no hay metadatos para comprobar que necesidad y estimación cubran la misma población**: la diferencia no se calcula y se dice brevemente por qué (E3-P1). |
| E3-D9 | Tres cantidades que no se suman ni se sustituyen: **necesidad declarada** (cifra divulgada del borrador), **consumo estimado** (resultado F12 fijado) y **cantidad confirmada en convocatoria** (participaciones aceptadas, E2). La vista del borrador muestra las dos primeras; la convocatoria, la tercera y la cifra divulgada del borrador como referencia, nunca la estimación (una estimación de toda la campaña no se compara con una convocatoria parcial). |
| E3-D10 | Una referencia histórica no elude retiradas ni política: la cifra fijada se entrega sólo si F12 la entregaría hoy (§4.3 de F12). Si no, se conserva el vínculo auditable (ejecución, fecha, método) y se oculta la cifra (`RESTRICTED`). |

## 3. Modelo de datos (migración aditiva `e3_proposal_estimation_link`)

```prisma
model JointPurchaseProposalEstimationLink {
  id              String   @id @default(uuid()) @db.Uuid
  proposalId      String   @db.Uuid
  tenantId        String
  sequence        Int                     // 1, 2, … por borrador
  requestId       String   @db.Uuid       // idempotencia de prepare/clear
  requestHash     String                  // huella del cuerpo: mismo requestId con otro cuerpo → REQUEST_ID_REUSED (E3-R1)
  mode            String   @db.VarChar(8)  // INITIAL | UPDATE | CLEAR
  action          String   @db.VarChar(24) // LINK_EXISTING_RUN | REUSE_JOB | REQUEST_JOB | CLEAR
  runId           String?  @db.Uuid       // LINK_EXISTING_RUN
  jobId           String?  @db.Uuid       // REUSE_JOB | REQUEST_JOB
  createdAt       DateTime @default(now())
  createdByUserId String
  createdByRole   String   @db.VarChar(16)
  @@unique([proposalId, sequence])
  @@unique([proposalId, requestId])
}

model JointPurchaseProposalSelection {   // decisión editable de la Directiva
  proposalId      String   @id @db.Uuid
  tenantId        String
  revision        Int                     // control optimista
  productRefs     Json                    // lista ordenada de productos elegidos del borrador
  updatedAt       DateTime
  updatedByUserId String
}
```

SQL a mano: CHECK de coherencia (`LINK_EXISTING_RUN` ⇔ `runId` y sin `jobId`; `REUSE_JOB`/`REQUEST_JOB` ⇔ `jobId` y sin `runId`; `CLEAR` sin ninguno; `mode` y `action` de las listas; `sequence ≥ 1`; `revision ≥ 1`), disparador de pertenencia (borrador, ejecución y trabajo del mismo tenant; campaña objetivo de la ejecución o del trabajo = campaña del borrador) y disparador que rechaza `UPDATE`/`DELETE` en los vínculos. La selección sólo cambia por la ruta de §6 y cada cambio deja una entrada de `AuditLog`.

## 4. API (`/api/v1/collective`, roles `DIRECTIVA`, `ADMINISTRADOR`, como el borrador; otro tenant → 404)

| Método y ruta | Escribe | Uso |
|---|---|---|
| `GET /proposals/{id}/estimation-link` | No | Estado de la referencia fijada, por línea, con comparación y metadatos |
| `POST /proposals/{id}/estimation-link/prepare` | Un vínculo, o nada | `{ request_id, mode: "INITIAL" \| "UPDATE", expected_link_ref? }` |
| `POST /proposals/{id}/estimation-link/clear` | Un vínculo `CLEAR` | `{ request_id, expected_link_ref }`: quitar la referencia (un trabajo en curso deja de tener efecto en el borrador) |
| `GET /proposals/{id}/selection` | No | `{ revision, product_refs }` (revisión 0 y lista vacía si nunca se eligió) |
| `PUT /proposals/{id}/selection` | La selección | `{ expected_revision, product_refs }`; productos que no son del borrador → 422 `PRODUCT_NOT_IN_PROPOSAL`; revisión distinta → 409 `SELECTION_STALE` con la vigente |

**Respuesta de `prepare`/`clear`:** `{ outcome, view }`, con `outcome`:
- `EXISTING`: `INITIAL` con una referencia vigente (no escribe);
- `LINKED_EXISTING_RUN`, `REUSED_JOB`, `REQUESTED_JOB`, `CLEARED`;
- `NOT_CALCULABLE` con `reason` (`TARGET_CAMPAIGN_NOT_ELIGIBLE`, `TARGET_CAMPAIGN_NOT_CLASSIFIED`, `NO_ESTIMABLE_PRODUCTS`): no escribe.

Errores: 409 `POLICY_PENDING` (no escribe), 409 `REFERENCE_CHANGED` (la referencia vista ya no es la vigente; con `view`), 409 `REFERENCE_UP_TO_DATE` (`UPDATE` sin nada que actualizar), 409 `REQUEST_ID_REUSED` (mismo `request_id` con otro cuerpo), 400 `PAYLOAD_INVALID`.

**Vista (`GET …/estimation-link` y `view`):**
- `state`: `NONE` (sin referencia), `CALCULATING` (trabajo `QUEUED`/`RUNNING`), `LINKED` (ejecución fijada), `UNAVAILABLE` (trabajo `NOT_EXECUTED` o ejecución `FAILED`, con su código), `RESTRICTED` (política pendiente: ninguna cifra).
- `link`: vínculo vigente (`link_ref`, `sequence`, `mode`, `action`, `created_at`, `created_by`, `run_ref`, `job_ref`, `job_status`, `stop_code`, `failure_code`) o `null`.
- `run`: resumen de la ejecución fijada (`run_ref`, `generated_at`, `method`, `method_version`, `season`, campaña objetivo con período, política aplicada) o `null`.
- `update`: `{ available, reason }` con `reason` `NEWER_RUN` (hay una `CALCULATED` posterior en la cadena), `OUTDATED` (alguna línea desactualizada), `FAILED`, `NOT_EXECUTED` o `INCOMPLETE` (la ejecución no incluye alguna línea estimable). Nunca disponible mientras calcula.
- `prepare_blocker`: por qué no se puede obtener una referencia ahora (`POLICY_PENDING`, `TARGET_CAMPAIGN_NOT_ELIGIBLE`, `TARGET_CAMPAIGN_NOT_CLASSIFIED`, `NO_ESTIMABLE_PRODUCTS`) o `null`.
- `lines[]`: `position`, producto, `base_unit`, `presentation_unit`, la **necesidad** tal como la sirve el borrador (`status`, `quantity_base`), la **estimación** (`state`, `status`, `reason_code`, `estimate_base`, `validity`, `validity_reason`) y la **comparación** (§5).
- `history[]`: todos los vínculos del borrador (vigente y anteriores), con la ejecución que resolvió cada trabajo.
- `evaluated_at` y el aviso fijo.

**Estado por línea (`estimation.state`):**

| Estado | Cuándo | Cifra |
|---|---|---|
| `NONE` | Sin referencia | No |
| `CALCULATING` | Trabajo en cola o en curso | No |
| `AVAILABLE` | `ESTIMATED` y `CURRENT` | Sí |
| `OUTDATED` | `ESTIMATED` y `SUPERSEDED`, o `OUTDATED` por `CLASSIFICATION_CORRECTED`/`SOURCES_CHANGED` | Sí, rotulada «Desactualizada», sin diferencia |
| `INSUFFICIENT_DATA` | `INSUFFICIENT_DATA` o `INCOMPATIBLE_DATA`, con su motivo | No |
| `ERROR` | Resultado `CALCULATION_FAILED`, ejecución `FAILED` o trabajo `NOT_EXECUTED` | No |
| `NO_RESULT` | La ejecución fijada no incluye ese producto y unidad | No |
| `RESTRICTED` | Política pendiente o `SOURCES_WITHDRAWN` | No (el vínculo sigue visible) |

## 5. Comparabilidad y cálculos

Antes de una diferencia se comprueban, en este orden, y cada fallo es un `blocker`:

| Comprobación | Blocker | Fuente |
|---|---|---|
| Necesidad divulgada con cifra | `NEED_NOT_DISCLOSED` | Vista del borrador (F07) |
| Estimación con cifra | `ESTIMATE_NOT_AVAILABLE` | Resultado F12 |
| Vigencia `CURRENT` y política que la publica | `ESTIMATE_NOT_CURRENT` | §8 de F12 |
| Mismo producto colectivo canónico | `PRODUCT_MISMATCH` | Línea y resultado |
| Misma unidad base | `UNIT_MISMATCH` | Línea y resultado |
| Mismo período: campaña objetivo = campaña del borrador | `PERIOD_MISMATCH` | Ejecución y borrador |
| Misma población o alcance, comprobada | `POPULATION_NOT_VERIFIED` | Ver abajo |

**Población (E3-P1).** La necesidad de una línea es la suma de lo que declararon los agricultores que aportan a esa celda en la campaña del borrador (aportantes de la divulgación). La estimación proyecta el consumo publicado de campañas anteriores de la temporada, cuya cobertura F12 es «N de M agricultores vinculados en alguna cifra de consumo» por campaña, sin identidad ni producto, y que **no acredita integridad ni representatividad** (F12 §3.1). Ningún metadato permite comprobar que ambas cifras cubran a las mismas personas. Por eso, con los datos actuales, toda línea lleva `POPULATION_NOT_VERIFIED` y la vista dice, una sola vez: «No se calcula la diferencia: no se puede comprobar que la necesidad y la estimación provengan de los mismos agricultores (vea el alcance de cada cifra).» Lo que haría falta: la cobertura de consumo **por producto** y una definición acordada del alcance de la necesidad (por ejemplo, «todos los agricultores vinculados» con declaración explícita de cero). **Decisión del autor (2026-11-12, E3-P1 = opción 1 + 1b):** la diferencia sigue sin calcularse y cada línea lleva el **alcance conocido** (`scope`): aportantes de la necesidad (si está divulgada) y, si la estimación entrega cifra, campañas del tramo y mínimo y máximo de aportantes de sus cifras de consumo. Medición y opciones: `E3_P1_OPCIONES_ALCANCE_COMPARABLE.md`; enmienda de F12 §2.

**Cálculo (cuando no hay blockers; probado con la función pura):**
- Diferencia absoluta = necesidad − estimación, en la unidad base, exacta (la estimación tiene 6 decimales; se calcula en millonésimas con enteros).
- Diferencia porcentual = (necesidad − estimación) / estimación × 100, con 4 decimales; **no definida** si la estimación es 0 (`percent_undefined: "ESTIMATE_ZERO"`).
- Una cifra ausente nunca se toma como cero.
- Se redondea sólo al presentar. La observación es descriptiva («La necesidad declarada supera en 139 L la estimación de consumo para el mismo período y alcance.», «… es inferior en …», «… coincide con …»), nunca «compra recomendada», «demanda excesiva», «cantidad incorrecta» ni rangos que no se calculan, y sin semáforos.

## 6. Selección de productos y convocatoria

- La única decisión editable del borrador es **qué productos llevar a una convocatoria** (`JointPurchaseProposalSelection`). Se guarda con control optimista (dos pestañas: la segunda recibe 409 `SELECTION_STALE` y la vigente). La estimación nunca la cambia.
- «Preparar convocatoria» abre el formulario de convocatorias existente (E2) con el borrador como origen y los productos elegidos. Crear la convocatoria no inscribe a nadie, no crea participaciones ni asigna cantidades: la convocatoria consolida sólo participaciones aceptadas (E2).

## 7. Sin efectos

Ninguna ruta de E3 escribe en necesidades (Sync v1), líneas o huella del borrador, convocatorias, participaciones, compras, lotes, movimientos, inventario, cuentas, pagos ni en las tablas de F12 salvo, a través de `EstimationJobsUseCase.request`, un trabajo en cola.

## 8. Interfaz Web

- En la vista existente «Necesidades y propuestas», la tabla del borrador muestra **Producto · Necesidad declarada · Consumo estimado** y, sólo si es válida, la diferencia; con el estado por línea cuando haga falta.
- Encima de la tabla, una franja con el estado de la referencia y una sola acción: «Obtener referencia», «Calculando…» (consulta el estado cada pocos segundos sin calcular nada), «Actualizar referencia» o ninguna.
- «Ver cálculo» (plegado): método y versión, parámetros, temporada y período, línea base naive, cobertura del tramo, fuentes (ejecución, serie y su huella) e historial de vínculos; enlace a «Estimación del consumo» para la vista técnica.
- Casillas «Llevar a convocatoria» y «Preparar convocatoria (N productos)».
- Sin pantalla paralela, con los componentes del rediseño (`components/ui`).

## 9. Verificación

| Prueba | Dónde |
|---|---|
| Reutilización de ejecución compatible; sin estimación; datos insuficientes; error del trabajador; política pendiente; desactualizada (ejecución posterior, fuentes cambiadas); fuente retirada | Back PostgreSQL |
| Unidad, período y población distintos; estimación cero; cifra ausente | Back unitarias (función pura) |
| Doble solicitud y concurrencia (dos `prepare` en paralelo, mismo y distinto `request_id`) | Back PostgreSQL |
| Resultado tardío tras actualizar o quitar; edición de la selección durante el cálculo; actualización explícita y `REFERENCE_CHANGED` | Back PostgreSQL |
| Permisos y separación entre sindicatos | Back PostgreSQL |
| Sin efectos en inventario, cuentas, necesidades, convocatorias y participaciones (recuentos) | Back PostgreSQL |
| Estados, acciones, «Ver cálculo», selección y preparación de convocatoria; no se pide nada al montar | Web (vitest) |
| Recorrido real: necesidades → borrador → referencia recuperada o calculada → revisar → actualizar → preparar convocatoria | API, base y Web aisladas |

## 10. Resoluciones de la implementación (2026-11-11)

Implementado en `f673f95` y trasladado en `8bf84f9` a un módulo propio (Back: `src/modules/proposal-estimation/{domain/proposal-link.ts, application/proposal-estimation-link.use-case.ts, api/rest/proposal-estimation-link.*}`; migración `20261111233000_e3_proposal_estimation_link`). Vive fuera de `estimation/` porque F12 garantiza que ese módulo sólo escribe tablas de estimación y no expone PUT, PATCH ni DELETE (`insert-only.spec.ts`); E3 sólo usa `EstimationJobsUseCase` y `EstimationReadsUseCase`, que `EstimationModule` exporta y `2a25386`, `2eb3ef7`, `3b2099b` (Web: `src/pages/joint-proposal.page.tsx`, `src/lib/estimation-link-text.ts`, `src/types/estimation-link.ts`). Pendientes de la aceptación de Roderich junto con el resto.

| ID | Tema | Resolución |
|---|---|---|
| E3-R1 | Idempotencia | Columna `requestHash` en el vínculo (no estaba en §3) para responder `REQUEST_ID_REUSED`. |
| E3-R2 | Reutilización de trabajos | Sólo se reutilizan trabajos con productos **explícitos** que incluyen las líneas estimables; uno con los productos por defecto podría dejar fuera una línea sin consumo publicado. |
| E3-R3 | Política pendiente | Cualquier vínculo no quitado se muestra `RESTRICTED`, también si está calculando o no disponible. |
| E3-R4 | `UPDATE` sin referencia o `clear` repetido | 409 `REFERENCE_UP_TO_DATE`; para empezar de nuevo se usa `INITIAL`. |
| E3-R13 | Alcance (E3-P1 = 1 + 1b) | `scope: { need_contributors, estimate: { span_campaigns, contributors_min, contributors_max } \| null }` por línea (`29c559e`, `219d959`); `estimate` sólo con cifra entregada. Web: «Cifras de 4 a 6 agricultores por campaña (11 campañas)». |
| E3-R14 | Cifra retenida | Un resultado `ESTIMATED` cuya cifra F12 retiene (fuente retirada) es `RESTRICTED` aunque la ejecución esté superada (`e60df32`). |
| E3-R12 | Módulo | E3 en `src/modules/proposal-estimation/` (no en `estimation/`), por la garantía de sólo inserción de F12 (hallazgo de la suite completa con PostgreSQL). |
| E3-R5 | Lecturas de vigencia | `EstimationReadsUseCase` gana `resultFacts` (reutiliza `Reading.facts`, no entrega cifras retenidas) y `latestCalculatedRunId`; la compatibilidad considera desactualizado también un resultado sin cifra cuyas fuentes cambiaron. |
| E3-R6 | Selección | Se guarda en el orden de las líneas; guardar la misma lista no escribe ni avanza la revisión. «Preparar convocatoria» usa la selección **guardada**. |
| E3-R7 | Observación descriptiva | Coma decimal («0,5 L»); «menos de 0,001 L» cuando la diferencia redondea a cero. La Web no muestra el porcentaje aunque el servidor lo calcule. |
| E3-R8 | Presentación de la estimación | Redondeada a la décima sólo al presentar («≈ 428,9 KG»; por debajo de 1 L/KG en mL/g), con la cifra exacta en el título y en «Ver cálculo». Hallazgo del recorrido: antes se mostraban todos los decimales. |
| E3-R9 | Rótulo | La columna pasa de «Estimación del consumo (referencia)» (F12 §7.1) a «Consumo estimado» (§8); depende de la aceptación de este contrato. |
| E3-R10 | CSV | No cambia: sigue llevando la estimación **vigente al exportar** (F12-EST-08), que puede no ser la referencia fijada; la página lo dice. No se añadieron exportaciones. |
| E3-R11 | Rendimiento | Cada lectura de la vista recalcula la vigencia de F12 (huellas de fuentes por producto): unos 2,5 s con 11 líneas en el entorno aislado. Suficiente para el uso previsto; si crece, habría que reutilizar la lectura entre líneas. |

## 11. Decisiones abiertas para Roderich

- ~~**E3-P1**~~ Resuelta el 2026-11-12: opción 1 + 1b (§5).
- **E3-P2** Si la selección de productos debe quedar también como trazabilidad de la convocatoria creada (hoy la convocatoria ya guarda su borrador de origen y la línea de cada producto).
