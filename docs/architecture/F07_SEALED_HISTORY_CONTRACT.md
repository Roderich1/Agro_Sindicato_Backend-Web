# F07 — Histórico colectivo conservado, sellado manual y consultas de tendencias

- **Fecha real:** 2026-10-23 (America/La_Paz). Lo redacta la sesión B de Claude Code sobre Backend `main` `769d441`.
- **Base de las decisiones:** `_briefs/INICIO_F01_F08_2026-10-23/01_DECISIONES_APROBADAS.md` §5, §6 y §9. Son acuerdos de diseño del autor (Roderich Rendón) para el **entorno sintético**. No son una aprobación institucional, de la Directiva ni del tutor.
- **Revisión técnica:** la sesión A revisa las invariantes compartidas (autorización, idempotencia, `sync-v1`) y la sesión C revisa la implementación. Esa revisión no se llama aprobación.
- **Requisitos:** RF-24, RNF-05 (política de divulgación, F07-POL-01 #107), los roles RU-18/RU-19 ([ADR-003](../adr/ADR-003-administrador-presidente-funciones-directiva.md)) y la clase de retención del contrato F06 §7.
- **Antecedente:** BE #159 (`b5b2804`, draft) proponía «M-2: sellar y después eliminar de forma conjunta por campaña». **Esa eliminación se descarta** (decisión del 2026-10-23, §6) y este contrato la sustituye. #159 queda como antecedente: no se cierra ni se reescribe. §10 resuelve las observaciones de su revisión.
- **Enmiendas que acompañan a este contrato**, todas fechadas y sin reescribir el texto anterior:
  - F06 §6 (nota) y §7.2;
  - F05 §8 (código `CAMPAIGN_SEALED`) y la matriz de reintentos (C16b, C16c);
  - F07-POL-01 §11.

**No cambia:**
- el payload Mobile (la whitelist de ocho filas ALLOW);
- el modo por defecto `POLICY_PENDING`;
- la negativa del modo sintético en producción.

Datos reales: siguen sin admitirse.

## 1. Conceptos que no se confunden

| Concepto | Qué es | Dónde vive | Quién lo cambia |
|---|---|---|---|
| **Cierre de campaña** (`CampaignStatus.CERRADA`) | Termina la operación ordinaria: no se admiten publicaciones ni sustituciones nuevas (F06 §6) | `AgriculturalCampaign.status` | DIRECTIVA/ADMINISTRADOR con `POST /campaigns/:id/close` |
| **Sellado colectivo** | Fija una **versión identificable** del consolidado de divulgación de una campaña cerrada | `CollectiveSeal` + `CollectiveSealEntry` (§4) | DIRECTIVA o ADMINISTRADOR del mismo tenant, uno solo, con confirmación (§3) |
| **Visibilidad** de una cifra sellada | Si la cifra se sirve **hoy**. La política vigente puede retirarla sin editar el dato | Calculada al leer (§5), más `CollectiveSealEntry.visibilityWithdrawnAt` | La política y la retirada del propio aportante (§5.2) |

**Reglas de separación:**
- El sellado **no se deduce de una fecha**, ni del cierre, ni de un número de días. Es un estado explícito (`CollectiveSeal` existe o no).
- Una campaña cerrada puede seguir sin sellar indefinidamente.
- **No hay reapertura ni corrección central posterior** en este bloque.
- **Regla para una ampliación futura** (no se construye): si se autoriza actualizar un colectivo sellado, se creará una versión posterior identificada y vinculada a la anterior, sin sobrescribirla. Por eso el esquema lleva `version`, pero este bloque sólo admite `version = 1` (restricción en la base).
- **Corrección privada (RF-03)** después del sellado: pertenece al agricultor y no cambia la versión sellada (§6).

## 2. Tres conjuntos de datos y sus clases de retención

| Conjunto | Contenido | Clase | Finalidad | Lectores |
|---|---|---|---|---|
| **Datos privados completos** | SQLite del agricultor, respaldos | `R_PRIVATE_LOCAL`, `R_BACKUP_F08` | Operación privada y recuperación | Sólo el titular. No se replican para analítica colectiva |
| **Aporte vigente** | `SyncV1Contribution`: un valor por agricultor, tipo, campaña, producto y unidad | `R_CURRENT` (F06 §7, nota de §7.2) | Cálculo del consolidado mientras la campaña no está sellada; soporte del vínculo de la memoria | Sólo el servicio central |
| **Memoria técnica de divulgación** | `CollectiveRelease` + `CollectiveReleaseItem` (cantidad por aportación en cada divulgación) | `R_DISCLOSURE_MEMORY` (F06 §7.1, ampliada en §7.2) | (a) impedir inferencias por diferencias; (b) **nuevo, §7.2:** saber a qué aportaciones afecta la retirada de un aportante tras el sellado | Sólo el servicio. Ninguna API la devuelve |
| **Historial colectivo autorizado** | `CollectiveSeal` + `CollectiveSealEntry`: estado por celda, referencia a la divulgación mostrada, cobertura agregada, actor y fecha | **`R_COLLECTIVE_HISTORY`** (nueva, F06 §7.2) | Consulta histórica autorizada y tendencias descriptivas | DIRECTIVA y ADMINISTRADOR del tenant, con la política vigente (§5) |

**Lo que el historial NO incorpora:** identidades, importes privados, parcelas, fotos, facturas, proveedores, lotes, operaciones individuales, costos ni ningún candidato DENY de la matriz F06.

**Por qué el historial no es anónimo.** Cada entrada visible apunta a una divulgación (`releaseId`). Esa divulgación conserva, en la memoria, la cantidad de cada aportación, y la aportación lleva el `memberId`. Dentro del servidor, la versión sellada **es vinculable** al agricultor a través de la memoria. Por eso:
- conservar el historial es **conservar datos protegidos y vinculables**, no «sólo agregados anónimos»;
- la memoria de una campaña sellada se conserva mientras exista su versión sellada (FK `Restrict` y disparadores; §4);
- **no hay purga** de la memoria en este bloque (la M-2 de #159 se descarta).

**La memoria técnica no se usa como analítica.** Las tendencias leen sólo `CollectiveSeal`, `CollectiveSealEntry` y, de `CollectiveRelease`, el total, el número de aportantes y las fechas de la divulgación referenciada. **Nunca leen `CollectiveReleaseItem`.** La única lectura nueva de `CollectiveReleaseItem` es la de §5.2 (retirada tras el sellado), una finalidad de protección y no de análisis.

**No se añade historial al journal** (`SyncV1OperationJournal`, `R_CAUSAL`): el sellado no escribe en él. Para el sellado sólo se escribe el registro mínimo de `AuditLog` (§3.4).

## 3. Sellado manual

### 3.1 Quién

- Una cuenta **DIRECTIVA** o **ADMINISTRADOR** del **mismo tenant** que la campaña.
- Cualquiera de las dos sella sola: ninguna necesita que la otra repita o apruebe la acción.
- AGRICULTOR → 403.
- Otro tenant o campaña inexistente → 404, indistinguibles.
- La comprobación está **en el servidor** (`@Roles` y tenant de la sesión). Ocultar el botón en la Web no es la protección.

### 3.2 Precondiciones (en el servidor, en este orden)

1. **Ya sellada** → respuesta idempotente con la versión existente (`200`, `created: false`). No escribe nada.
2. Modo de divulgación `POLICY_PENDING` → `409 POLICY_PENDING`. No se sella una versión sin cifras autorizadas.
3. Campaña distinta de `CERRADA` → `409 CAMPAIGN_NOT_CLOSED`. Se exige el cierre por dos motivos:
   - sellar una campaña `ABIERTA` dejaría a los agricultores operando en una campaña que ya no admite publicaciones;
   - la revisión de #159 (hallazgo 2) mostró que actuar sobre una campaña abierta debilita la regla. `CERRADA` es terminal en el modelo vigente (`openCampaign` no la reabre).
4. Body inválido: `confirmed` distinto de `true` o `review_ref` sin formato → `422 CONFIRMATION_REQUIRED` / `400`. **Ninguna escritura.**
5. La revisión mostrada ya no coincide con el estado actual (`review_ref` distinto) → `409 SEAL_REVIEW_STALE`. **Ninguna escritura**: la transacción se revierte entera, también las divulgaciones que la decisión hubiera creado en ella.

### 3.3 Revisión previa obligatoria (`GET …/seal`)

Antes de sellar, la Web muestra lo que devuelve el servidor:
- **cobertura**: agricultores vinculados y agricultores dentro de cifras publicadas, la misma regla del resumen;
- **datos aceptados hasta**: la hora del servidor de la revisión. El sellado incluirá lo aceptado hasta el instante del sellado (§3.5);
- **conflictos o pendientes conocidos**, como booleanos, sin conteo:
  - `open_disputes`: alguna aportación de la campaña tiene una disputa abierta;
  - `pending_changes`: alguna cifra se muestra con cambios pendientes;
  - `cells_without_figure`: alguna celda no tiene cifra;
- **límites**, que la Web explica: el Central sólo conoce lo que los teléfonos publicaron y él aceptó, y **no puede afirmar que todos los teléfonos publicaron todo**;
- `review_ref`: la huella SHA-256 de esa revisión (§3.5). Se envía al confirmar.

La revisión ejecuta la misma decisión de divulgación que la lectura del resumen (`GET …/summary`), con sus efectos ya conocidos (puede crear o retirar divulgaciones). No es una vía nueva de divulgación: no devuelve cifras que el resumen no muestre.

### 3.4 Confirmación y auditoría mínima

`POST /collective/campaigns/:campaignId/seal` con body exacto `{ "confirmed": true, "review_ref": "<64 hex>" }`.

Se registra, con la hora **del servidor**:
- en `CollectiveSeal`: actor (`sealedByUserId`) y su rol en ese momento (`sealedByRole`), `sealedAt`, modo, política y umbral aplicados, y cobertura;
- en `AuditLog`: una fila con acción `OTRO`, entidad `CollectiveSeal`, su id, la campaña y el actor, con el resumen «Consolidado colectivo sellado (versión 1)». **Sin cifras**, sin `before`/`after` y sin cuerpo.

### 3.5 Atomicidad, idempotencia y concurrencia

Todo ocurre en **una transacción** (READ COMMITTED):
1. Bloqueo **exclusivo** `pg_advisory_xact_lock(hashtextextended('collective-seal:<tenant>:<campaign>', 0))`.
2. Si ya existe un sellado → se devuelve (idempotente).
3. Precondiciones de §3.2.
4. Bloqueo del resumen `collective:<tenant>:<campaign>`, el mismo que usa cada lectura del resumen.
5. La decisión de divulgación vigente, la misma función del resumen. Puede crear o retirar divulgaciones como cualquier lectura.
6. Comparación de `review_ref` con la huella recalculada.
7. Inserción de `CollectiveSeal`, de sus `CollectiveSealEntry` (una por celda del resumen) y de la fila de `AuditLog`.

Cualquier fallo revierte todo: no queda un sellado sin entradas, ni divulgaciones nuevas de una revisión rechazada.

**Garantías:**
- **Doble toque o dos actores a la vez:** el segundo espera el bloqueo, ve el sellado del primero y lo devuelve con `created: false`. La base lo garantiza también con `@@unique([tenantId, campaignId, version])` y `CHECK (version = 1)`.
- **Carrera con una publicación** (§7): cada `push` toma el mismo bloqueo en modo **compartido** antes de decidir. El sellado espera a que terminen los `push` en curso y los nuevos esperan al sellado. Cada operación queda claramente **antes** (incluida en la decisión) o **después** (rechazada o tratada según §7). No hay instantánea intermedia.
- **Orden de bloqueos sin ciclos.** El sellado toma `collective-seal` y después `collective`. El `push` toma la operación, después `collective-seal` compartido y después la fila de la aportación. El resumen sólo toma `collective`. Ningún camino toma estos bloqueos en orden inverso.

**Huella de revisión (`review_ref`).** SHA-256 de un JSON canónico con:
- la campaña;
- el modo y el umbral;
- la cobertura;
- los tres booleanos de §3.3;
- por cada celda, ordenadas: tipo, producto canónico, unidad, estado, `pending_changes` y la referencia interna de la divulgación mostrada.

No contiene cantidades de celdas suprimidas ni identidades, y no permite reconstruirlas.

## 4. Persistencia de la versión sellada

Migración aditiva reservada: `20261023100000_f07_collective_seal`.

```
CollectiveSeal
  id (uuid) · tenantId · campaignId · version (=1)
  sealedAt · sealedByUserId · sealedByRole (UserRole)
  disclosureMode · policy · threshold        -- con qué política se decidió
  linkedMembers · membersWithContribution · suppressedCells   -- cobertura al sellar
  openDisputes · reviewRef (char 64)
  @@unique([tenantId, campaignId, version])

CollectiveSealEntry   -- una por celda del resumen en el instante del sellado
  sealId · projectionType · canonicalProductId · baseUnit   (PK compuesta)
  status (DISCLOSED | SUPPRESSED_UNDER_THRESHOLD | SUPPRESSED_REVISION | OVERFLOW)
  releaseId (sólo y siempre si DISCLOSED) → CollectiveRelease (Restrict)
  pendingChanges
  visibilityWithdrawnAt (null; §5.2)
```

**Invariantes en la base:**
- Disparadores y restricciones, como en `20261016043000`:
  - `CollectiveSeal`: sin UPDATE ni DELETE;
  - `CollectiveSealEntry`: sin DELETE. El único UPDATE admitido marca `visibilityWithdrawnAt` de NULL a una fecha, una sola vez y sin tocar otra columna.
- `CHECK (("status" = 'DISCLOSED') = ("releaseId" IS NOT NULL))` y `CHECK ("version" = 1)`.
- Una entrada sólo puede apuntar a una divulgación **de la misma campaña y tenant** (disparador en INSERT).
- **Ninguna divulgación nueva en una campaña sellada**: un disparador sobre `CollectiveRelease` rechaza INSERT, y cualquier UPDATE de `withdrawnAt`, si la campaña tiene sellado. Así, aunque un defecto del código volviera a llamar a la decisión, la base impide recalcular la versión sellada.

**Datos que no se copian:** las entradas no duplican el total ni las aportaciones. La cifra sale de la divulgación referenciada, que ya es inmutable. No se crea ningún campo nuevo en el payload Mobile.

## 5. Lectura de una versión sellada

### 5.1 Sin recálculo ni escrituras ocultas

En una campaña sellada, **ninguna lectura** ejecuta la decisión de divulgación, crea o retira divulgaciones, ni escribe nada:
- `GET …/summary` y `summary.csv`;
- `GET …/seal`;
- la lista, el detalle y el CSV de las propuestas;
- las tendencias.

Las lecturas sirven la versión sellada con la política **vigente** aplicada (§5.2).

Generar un borrador nuevo de propuesta sobre una campaña sellada **sí** escribe el borrador (es una acción expresa), pero toma las celdas de la versión sellada: no crea divulgaciones.

### 5.2 Visibilidad: la política vigente puede retirar, nunca añadir

Una entrada sellada `DISCLOSED` se sirve con su cifra sólo si se cumple **todo** esto:
1. el modo vigente autoriza cifras (`PROVISIONAL_SYNTHETIC`; en `POLICY_PENDING` ninguna cifra, en ningún canal);
2. su número de aportantes alcanza el **umbral vigente**. Si se elevara k, las cifras selladas por debajo pasan a `SUPPRESSED_UNDER_THRESHOLD`;
3. no tiene `visibilityWithdrawnAt`.

**Retirada del aportante tras el sellado** (`WITHDRAWN_AFTER_SEAL`):
- Si un agricultor emite un `CANCEL` aceptado (APPLIED) o en conflicto (CONFLICT) sobre una aportación incluida en la divulgación de una entrada sellada, esa entrada pierde la visibilidad.
- La marca se escribe **en la misma transacción del `push`**, serializada con el sellado.
- El dato sellado (estado, divulgación y cifra) **no cambia**.

**Cambios de elegibilidad tras el sellado** (baja del Member o de su cuenta, cambio de rol) **no retiran** cifras selladas. Motivo: si lo hicieran, un ADMINISTRADOR podría desactivar a un agricultor y observar qué cifras históricas desaparecen, y así deducir en qué productos participó. La versión sellada recoge la elegibilidad que había al sellar. Las **reasociaciones canónicas** posteriores tampoco afectan a la versión sellada.

**Una entrada nunca gana visibilidad:**
- no hay forma de borrar `visibilityWithdrawnAt`;
- una entrada suprimida al sellar sigue suprimida;
- una ausencia sigue siendo «sin dato», nunca cero.

Señal aceptada, como en F07-POL-01 §6: una retirada revela que algo cambió en esa celda, no cuánto ni quién.

**Cobertura sellada.** `linked_members`, `members_with_contribution` y `suppressed_cells` son los del instante del sellado. Se rotulan «al sellar» y **no se recalculan**: recalcularlos tras una retirada revelaría cuántos agricultores había en esa celda.

## 6. Correcciones privadas tras el sellado (RF-03)

- Una corrección o una operación tardía privada es del agricultor y vive en Mobile.
- No cambia la versión sellada ni se publica automáticamente.
- Si el teléfono intenta publicar un valor nuevo de esa campaña, recibe `CAMPAIGN_SEALED` (§7). La interfaz Mobile (sesión A) explica que el histórico colectivo sellado no se actualiza y no reasigna el aporte a otra campaña.

## 7. Sync v1: publicación nueva, replay y retirada en una campaña sellada

Es la enmienda de F05 (§8) y de la matriz (C16b, C16c). La decisión se toma dentro de la transacción del `push`, después del bloqueo compartido de §3.5.

| Caso | Resultado | Disposición | Efectos |
|---|---|---|---|
| **Replay** de una intención ya resuelta antes del sellado (mismo `operationId` y misma huella) | El **resultado original guardado** (APPLIED/OK, CONFLICT o REJECTED) | La original | Ninguno. El sellado no lo convierte en error: el journal responde antes de mirar la campaña (`EXISTING_SAME_FINGERPRINT`) |
| Mismo `operationId` con otro contenido | `REJECTED / IDEMPOTENCY_MISMATCH` (sin cambios) | `MOVE_TO_TERMINAL_FAILURE` | Ninguno |
| **PUBLISH o SUPERSEDE nuevos** en una campaña sellada | **`REJECTED / CAMPAIGN_SEALED`** | `MOVE_TO_TERMINAL_FAILURE` | Se guarda el resultado en el journal, como cualquier rechazo. **Sin** cambios en la aportación, la versión sellada ni las divulgaciones. Si se repite, devuelve el mismo rechazo |
| **CANCEL** en una campaña sellada | La decisión causal de siempre: APPLIED, CONFLICT o REJECT | La de siempre | La retirada se aplica a la aportación (`R_CURRENT`), sin borrar `R_CAUSAL`, y la entrada sellada afectada pierde la visibilidad (§5.2). **El snapshot sellado no cambia** |
| Referencia inexistente, unidad o cantidad inválidas | Los códigos de siempre, **antes** que `CAMPAIGN_SEALED` | — | — |

**Precedencia:** `CAMPAIGN_SEALED` va antes que `CAMPAIGN_NOT_OPEN`. Una campaña sellada siempre está cerrada (§3.2), pero el código más preciso permite a Mobile explicar el motivo.

**Mobile** (lo construye A, no este contrato):
- trata `CAMPAIGN_SEALED` como «requiere intervención»: fallo terminal, sin backoff infinito ni reasignación a otra campaña;
- conserva el dato local intacto.

**Compatibilidad:** una app anterior a ese cambio no conoce el código. Por F05 §8, lo trata como desconocido, no lo retira y reintenta. El servidor responde siempre el mismo rechazo guardado, sin duplicar efectos. Es una limitación declarada del entorno sintético hasta que se integre el cambio Mobile.

**No se suprimen las garantías causales:**
- CANCEL sigue dominando a sus antecesores;
- un antecesor cancelado no resucita;
- la retirada de un aportante sigue siendo posible en una campaña cerrada o sellada (F06 §6).

## 8. Consultas de tendencias (primera entrega)

`GET /collective/trends` y `GET /collective/trends.csv` (DIRECTIVA/ADMINISTRADOR, tenant de la sesión, `no-store`). Filtro opcional `projection_type`.

**Alcance exacto:**
- necesidad declarada (`DECLARED_NEED`);
- consumo publicado (`CONSUMPTION_TOTAL`);
- cobertura y disponibilidad de cifras por campaña, producto y unidad.

**Respuesta:**
- `campaigns[]`, ordenadas por fecha de inicio. Cada una lleva:
  - su referencia, nombre y estado;
  - `seal`, o null si no está sellada;
  - la cobertura al sellar.
- `series[]`: una serie por tipo × producto canónico × unidad base. Cada punto lleva:
  - la campaña;
  - el estado (§5.2, más `NOT_SEALED` y `NO_DATA`);
  - sólo para un punto visible: el total en unidad base y en L/KG, los aportantes y `data_as_of`.

**Reglas:**
- **Sólo versiones selladas** aportan cifras. Una campaña sin sellar aparece como `NOT_SEALED`, sin cifras, para no ejecutar la decisión de divulgación desde una consulta histórica.
- **La misma política** que el resumen sellado (§5.2), también en el CSV, celda por celda. Una celda suprimida o retirada no lleva cifra en ningún canal.
- **Nunca se suma entre campañas, productos, unidades o tipos.** No hay totales, medias, diferencias ni tasas calculadas en el servidor ni en el navegador.
- **Ausencia ≠ cero:**
  - `NO_DATA`: la versión sellada no tiene esa celda;
  - `NOT_SEALED`: no hay versión.
- **Masa y volumen**, separados: `ML` y `G` son series distintas.
- **Necesidad y consumo**, separados: no se resta uno del otro.
- **Un cambio de cobertura no prueba un cambio de consumo individual.** La Web lo explica junto a cada serie y muestra la cobertura de cada campaña.
- **Las tendencias no eluden las protecciones de diferencias:**
  - cada cifra servida es una cifra ya decidida por la regla de combinaciones dentro de su campaña;
  - las aportaciones son de una sola campaña, así que dos campañas no comparten columnas que restar;
  - la consulta no publica ninguna cifra nueva.

  Riesgo que se acepta, como en F07-POL-01 §0: el conocimiento externo de que los demás aportantes no cambiaron entre campañas.
- **No incluye** forecasting, dosis recomendadas, ahorro, reparto, pagos ni notificaciones a agricultores.

## 9. API (resumen)

| Método y ruta | Roles | Escribe |
|---|---|---|
| `GET /collective/campaigns/:id/seal` | DIRECTIVA, ADMINISTRADOR | Sin sellar: lo mismo que una lectura del resumen. Sellada: nada |
| `POST /collective/campaigns/:id/seal` | DIRECTIVA, ADMINISTRADOR | El sellado, sus entradas y la auditoría, en una transacción |
| `GET /collective/campaigns/:id/summary` y `.csv` | ídem | Sellada: nada. Añade el campo `seal` y la columna `seal_ref` |
| `GET /collective/campaigns/:id/proposals`, `GET /collective/proposals/:id` y `/csv` | ídem | **Nada**, sellada o no (§10, hallazgo 3) |
| `POST /collective/campaigns/:id/proposals` | ídem | El borrador. Sin sellar, además, la decisión del resumen; sellada, sólo el borrador |
| `GET /collective/trends` y `.csv` | ídem | Nada |

`seal` (en el resumen, la propuesta y las tendencias):
`{ seal_ref, version, sealed_at, accepted_until, sealed_by: { user_ref, name, role } }`.
`accepted_until` es igual a `sealed_at`: el Central incluyó lo que había aceptado hasta ese instante.

## 10. Observaciones de la revisión de #159 y cómo se resuelven

| # | Observación (comentario de C sobre `b5b2804`) | Resolución en este contrato |
|---|---|---|
| 1 | Se citaba una hoja §2.2 que no existe | Las notas nuevas citan la comparación de k como **BE #161, `docs/evidence/F07_POL_01_COMPARACION_K.md`, pendiente de integrar**, en condicional. No se inventa un §2.2 |
| 2 | Eliminar sin sellar con la campaña abierta debilitaba la regla | No hay eliminación. El sellado exige `CERRADA` (§3.2) y, una vez sellada, la base impide nuevas divulgaciones (§4) |
| 3 | Discrepancia con F06 §7.1: leer propuestas ejecutaba `decide()` | Se declara (F06 §7.2). **Se corrige en el código:** leer una propuesta sin sellar usa la misma decisión en modo sólo lectura, sin crear ni retirar divulgaciones (una cifra nueva aparece como `SUPERSEDED`, sin valor). Una sellada usa la versión sellada |
| 4 | «Hoy no hay copias del Central» era más fuerte que su fuente | Se dice: «no hay un procedimiento documentado de copia y restauración del Central (manual técnico §9.3); no se verificó si el proveedor hace copias» |
| 5 | El §6.1 de la hoja quedó en medio del texto anterior | La nota nueva de la hoja va **después** de las viñetas originales del §6 |
| 6 | M-3 frente a la eliminación | Ya no aplica: no hay eliminación ni seudonimización. Se conserva el vínculo y se declara (§2) |
| 7 | La comprobación tras restaurar no descontaba eliminaciones | Ya no hay eliminaciones. Restaurar una copia del Central anterior a un sellado o a una divulgación sigue siendo un riesgo: falla cerrado según la propuesta de #159 §5, que se mantiene como **pendiente** |
| 8 | La política repetía «una docena» sin la nota | F07-POL-01 §11 añade la nota de los tres números distintos |

## 11. Pruebas que acreditan este contrato

Se ejecutan con PostgreSQL desechable y cuentas sintéticas (`collective-seal.postgres.spec.ts`), con un oráculo escrito antes de medir:
- sellan ambos roles; AGRICULTOR y otro tenant no;
- una confirmación ausente, una revisión obsoleta y un fallo transaccional inyectado no dejan efecto parcial;
- el sellado concurrente y la doble solicitud producen un solo sellado;
- la carrera entre `push` y sellado: cada publicación queda antes (incluida) o después (`CAMPAIGN_SEALED`);
- el replay anterior al sellado conserva su resultado;
- la publicación nueva se rechaza sin duplicar ni alterar el snapshot;
- CANCEL y cambios de elegibilidad no filtran cifras;
- las lecturas no escriben (recuento de filas antes y después);
- la comparación histórica, el CSV y la propuesta aplican la misma política, también a las celdas suprimidas y retiradas;
- la migración desde la base previa conserva los datos y los disparadores rechazan mutaciones.

La Web prueba estados, confirmación, cobertura y falta de red (Vitest).
