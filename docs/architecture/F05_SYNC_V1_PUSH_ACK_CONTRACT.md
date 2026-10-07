# F05-SYNC-04 — Sync Contract v1: push / ACK

Estado: **contrato técnico propuesto para auditoría independiente**, [#16](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/16). Congela decisiones wire para implementación posterior; no define endpoints desplegados, tablas nuevas ni PASS de protocolo. Backend baseline `5bcaf3548a0ca31f6271060d5badfa89996f1c25`; Mobile read-only `278cbd32dc59b26824f59fcefb77bebbc3cecb95`.

## 1. Purpose, autoridad y non-goals

Entregar una intención mínima desde Mobile y obtener evidencia duradera de aceptación sin duplicación, aun ante pérdida de red, refresh o cambio de instalación. Mobile conserva el dominio individual; Central valida identidad/referencias y custodia la proyección; Web no escribe aportes individuales.

El [contrato F06](F06_COLLECTIVE_PROJECTION_CONTRACT.md), su [matriz](F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md) y el cierre formal de [#20](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/20#issuecomment-6028210379) permanecen intactos. Su texto histórico de propuesta no revoca la aprobación posterior. Tipos `CONSUMPTION_TOTAL` / `DECLARED_NEED`, whitelist 8/118/0, ownership, unidades ML/G, privacidad, retención y necesidad humana explícita no se rediseñan.

Fuentes: [SRS](../requirements/SRS.md) SRS-MOB-01, SRS-SYNC-01/02, SRS-DEVICE-01, SRS-IAM-02, SRS-COLL-01, SRS-PRIV-01, SRS-AUDIT-01; [URS](../requirements/URS.md) URS-SYNC-01/MOB-04/PRIV-01/SEC-01; [F01](F01_INTEGRATION_DECISIONS.md) DEC-F01-02–05/07–10/12. Trazabilidad y evidencia negativa: [F05_SYNC_04](../evidence/F05_SYNC_04.md); casos futuros: [matriz adversarial](F05_SYNC_V1_RETRY_IDEMPOTENCY_MATRIX.md).

Fuera de entrega: implementar #17/#18, Flutter/outbox, Prisma/migraciones/DB, retirar contratos legacy, reabrir #20, habilitar producción, cambiar gates o desbloquear #81. No se envía stock declarado, finanzas, eventos individuales ni backup; no se calcula necesidad neta ni se infiere necesidad desde consumo/stock.

## 2. Legacy vs target y rutas

| Estado | Ruta / comportamiento |
| --- | --- |
| `LEGACY` | `POST /sync/operations` y `GET /sync/operations`, relativas al prefijo actual. Rutas externas reales: `/api/v1/sync/operations` (`Back/src/main.ts` usa `api/v1`). |
| `TARGET — NOT_IMPLEMENTED` | `POST /api/v1/sync/v1/push`; una operación por request, `contractVersion = 1` obligatorio. |
| `TARGET — NOT_IMPLEMENTED` | `GET /api/v1/sync/v1/operations/{operationId}`; consulta mínima de resultado y estado causal, owner-scoped. |

El segmento API `api/v1` y el segmento de contrato `sync/v1` son versiones distintas. El path selecciona la interpretación y el campo permite validar/persistir esa versión; no existe incompatibilidad con la convención actual. No se envuelve el DTO histórico ni se hace fallback automático a legacy. No se eliminan ni modifican rutas actuales ni se anuncia una fecha de retiro.

Legacy recibe `{clientId, operations:[{clientOperationId, operation, payload}]}`. Tipos existentes: INITIAL_STOCK, PLOT_CREATE, PLOT_UPDATE, PLOT_DEACTIVATE, PLOT_CROP_ASSIGN, STOCK_ENTRY, STOCK_EXIT, AGROCHEMICAL_APPLICATION, PAYMENT_CREATE. Su lista no entra en v1. La [evidencia](../evidence/F05_SYNC_04.md#2-auditoría-del-sync-legacy) documenta idempotencia, persistencia, transacciones, logging y consumidores actuales.

## 3. Authentication context

HTTPS y sesión F02 vigente mediante su transporte autenticado. El Authorization del transporte nunca se copia a JSON, outbox, ACK, conflicto ni audit log. Derivar y revalidar Account activo, Member agricultor activo, Tenant activo, AuthSession vigente y ClientRegistration ACTIVE enlazada a esa sesión/Member/tenant. Una sesión sin registro enlazado no admite v1.

No hay campos wire `tenantId`, `accountId`, `memberId`, `ownerUserId`, `role`, `clientId` ni `clientRegistrationId` en el envelope o payload. Central deriva el cliente lógico desde AuthSession → ClientRegistration y registra su referencia interna protegida. Su hash de UUID F02 no es fingerprint físico. Cambiar cliente válido del **mismo** Member no cambia la clave de intención; otro Member/tenant no hereda el outbox ni autoriza un replay. La versión del token/contrato Auth F02 no es contractVersion de Sync: no comparar esos namespaces ni exigir que sus números coincidan.

Revalidar autorización antes de consultar deduplicación, resultado o estado causal; un ACK histórico no elude revocación. Directiva/Admin no publica en nombre del agricultor. Sin bindings centrales/proof de propiedad local previstos por F06 no se habilita el productor. Esa precondición se demuestra con adaptadores y pruebas Mobile, no añadiendo Person, IDs locales o una supuesta atestación privada al envelope.

## 4. Envelope exacto, representación y whitelist

JSON UTF-8, un objeto, **exactamente seis claves obligatorias**; objetos cerrados en todos los niveles. Rechazar arrays/batch, claves duplicadas, campos desconocidos, tipos incorrectos y JSON mal formado. No coaccionar strings/números ni omitir campos extra. Esta restricción evita la ambigüedad de claves duplicadas documentada en [RFC 8259 §4](https://www.rfc-editor.org/rfc/rfc8259.html#section-4).

| Clave | Tipo / valores exactos |
| --- | --- |
| `contractVersion` | Número entero JSON `1`. |
| `operationId` | UUID v4 canónico lowercase con guiones, generado aleatoriamente una sola vez por Mobile; [RFC 9562 §5.4](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.4). |
| `projectionType` | `CONSUMPTION_TOTAL` o `DECLARED_NEED`. |
| `action` | `PUBLISH`, `SUPERSEDE` o `CANCEL`. |
| `causal` | Objeto cerrado con **ambas** claves `predecessorOperationId` y `reconciliationReference`; cada una UUID v4 canónico o `null`. No timestamps/contadores. |
| `payload` | Objeto cerrado con la whitelist de negocio según acción. |

| Acción | Campos exactos del payload |
| --- | --- |
| PUBLISH / SUPERSEDE | `campaign_ref`, `product_ref`, `base_unit`, `quantity_base`. |
| CANCEL | `campaign_ref`, `product_ref`, `base_unit`; quantity_base debe estar **ausente**, no null/cero. |

`campaign_ref` y `product_ref`: UUID central canónico lowercase con guiones, no IDs SQLite ni nombres. `base_unit`: enum ML/G. `quantity_base`: entero exacto de dominio, **string decimal wire** con formato `0` o `[1-9][0-9]*`, sin signo, exponente, fracciones, espacios ni ceros iniciales; máximo `9223372036854775807`. El máximo preserva el rango de INTEGER SQLite de 64 bits [documentado](https://www.sqlite.org/datatype3.html); la representación string evita pérdida al pasar por Number de JavaScript. Agregación y sumas usan aritmética exacta con comprobación de overflow; no convertir a float ni truncar. Un valor fuera de rango se rechaza como QUANTITY_INVALID. No cambia la semántica F06 de entero no negativo.

Campaign/product del tenant efectivo y dimensiones L→ML / KG→G verificadas; no convertir masa/volumen ni inferir densidad. Cero es valor explícito, ausencia es desconocido, cancelación retira. El outbox de ambas proyecciones almacena totales, nunca deltas. Fechas y frescura son derivadas del servidor, no campos de negocio Mobile.

Todos los ejemplos siguientes son **sintéticos**, sin identidades reales ni credenciales:

```json
{
  "contractVersion": 1,
  "operationId": "11111111-1111-4111-8111-111111111111",
  "projectionType": "DECLARED_NEED",
  "action": "PUBLISH",
  "causal": {"predecessorOperationId": null, "reconciliationReference": null},
  "payload": {
    "campaign_ref": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "product_ref": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "base_unit": "ML",
    "quantity_base": "1250"
  }
}
```

```json
{
  "contractVersion": 1,
  "operationId": "22222222-2222-4222-8222-222222222222",
  "projectionType": "DECLARED_NEED",
  "action": "SUPERSEDE",
  "causal": {"predecessorOperationId": "11111111-1111-4111-8111-111111111111", "reconciliationReference": null},
  "payload": {
    "campaign_ref": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "product_ref": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "base_unit": "ML",
    "quantity_base": "1000"
  }
}
```

```json
{
  "contractVersion": 1,
  "operationId": "33333333-3333-4333-8333-333333333333",
  "projectionType": "DECLARED_NEED",
  "action": "CANCEL",
  "causal": {"predecessorOperationId": "22222222-2222-4222-8222-222222222222", "reconciliationReference": null},
  "payload": {
    "campaign_ref": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "product_ref": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "base_unit": "ML"
  }
}
```

## 5. Operation identity y comparación de contenido

Clave única lógica: **`(effectiveTenantId, effectiveMemberId, operationId)`**. No incluye instalación, AuthSession, endpoint, versión o número de request. Account/User no sustituye al Member efectivo. El cliente lógico sigue representado/validado/registrado como contexto, conforme a F01/F02; no se elimina del control de seguridad por excluirlo de la clave.

Generar UUID v4 una vez al confirmar una intención y persistirla duraderamente. Retry, reinicio, red, refresh, timeout, 500 o ACK perdido conservan **idénticos ID, versión, acción, causal y payload**. Nunca derivar ID de fecha, cantidad, hash, entero SQLite, hardware o clientId. Una corrección/decisión humana nueva obtiene otro ID; el worker no genera uno para escapar a conflicto, rechazo o incertidumbre. Cambio de propietario pausa el outbox anterior, no lo reatribuye.

Para envelopes estructuralmente válidos, comparar todos los campos semánticos. Canonización normativa: JSON compacto UTF-8 del array en este orden, sin espacios ni escapes innecesarios (los valores permitidos son ASCII):

`[contractVersion,operationId,projectionType,action,predecessorOperationId,reconciliationReference,campaign_ref,product_ref,base_unit,quantity_base_or_null]`.

Para CANCEL, el último elemento es null únicamente en ese vector interno; el payload wire no contiene quantity_base. Orden de claves/whitespace JSON no cambian la intención. El servidor conserva sólo un fingerprint **HMAC-SHA-256** de ese vector, identificado por versión de clave interna, no el array ni un snapshot histórico. La clave secreta no viaja wire ni aparece en ejemplos/logs; #17 gestiona su custodia/rotación compatible con la retención, revisión F10 #44/#45. El fingerprint es metadata protegida para igualdad, no dato anónimo ni sustituto de operationId; no se devuelve en ACK. El propósito es detectar mutación sin conservar cantidades anteriores ni permitir diccionario público de cantidades de baja entropía.

| Registro previo bajo la misma clave | Resultado |
| --- | --- |
| APPLIED y fingerprint igual | ALREADY_APPLIED; mismo serverAcceptedAt y resultado lógico, cero nueva aplicación. |
| CONFLICT / REJECTED y fingerprint igual | Mismo outcome/código/referencia persistidos; no re-evaluar ni aplicar por un cambio posterior de catálogo. |
| Cualquier resultado final y contenido distinto | REJECTED / IDEMPOTENCY_MISMATCH; no sobrescribir el registro original. |
| Procesamiento concurrente todavía sin resultado final confirmado | RETRYABLE / OPERATION_IN_PROGRESS, sin autorización para retirar el outbox. |
| Sin registro final y envelope válido | Intentar una sola transición atómica bajo exclusión por clave y contribución. |

Autorización va primero; lookup/fingerprint de resultado existente va **antes** de revalidar reglas mutables de campaña para una intención ya aceptada. Así, cerrar campaña o cancelar después no convierte un replay autorizado de un commit histórico en otra aplicación. Un envelope inválido sobre una clave ya registrada nunca puede cambiar su resultado: responder rechazo seguro, IDEMPOTENCY_MISMATCH cuando se puede establecer divergencia.

Envelopes no admitidos por sintaxis/whitelist no crean journal de proyección ni fingerprint de valores privados: HTTP de request failure (§9), cero efectos y audit mínimo de código. No prometen un ACK duradero. Su corrección exige revisión del productor e intención nueva explícita; nunca retry automático ilimitado ni reutilización automática del ID. La igualdad canónica aplica a operaciones admitidas por el esquema cerrado, no a blobs arbitrarios.

## 6. Causalidad, estados y resolución

Contribución lógica distinta de la clave anterior: `(tenant, Member, projectionType, campaign_ref, product_ref, base_unit)`. Sólo un aporte vigente; cambiar dispositivo no crea otro. Estados de destino: NEVER_PUBLISHED, ACTIVE, CANCELLED, CONTESTED. CANCELLED es tombstone causal sin cantidad; CONTESTED no divulga ni contabiliza una cantidad controvertida como ganadora.

| Acción / estado previo | predecessorOperationId | reconciliationReference | Efecto aceptable |
| --- | --- | --- | --- |
| PUBLISH inicial / NEVER_PUBLISHED | null | null | Un total ACTIVE y un head aceptado. |
| SUPERSEDE / ACTIVE | Head aceptado anterior del mismo propietario y contribución | null | Reemplazar total; no sumarlo. Consumo puede disminuir por reversión local. |
| CANCEL / ACTIVE | Head vigente a retirar | null | Excluir cantidad y avanzar a tombstone CANCELLED. |
| PUBLISH nuevo tras CANCELLED | ID del CANCEL aceptado vigente, **no null** | null si no hay disputa | Intención humana nueva; nunca resurrección por replay del PUBLISH antiguo. |
| Resolución de CONTESTED | Head aceptado que devuelve la consulta owner-scoped | Referencia opaca vigente emitida por Central para esa disputa | Nueva intención SUPERSEDE o CANCEL confirmada por propietario; fija un total o retirada y cierra/fencea esa rama. |
| Resolución de disputa mientras sigue CANCELLED | CANCEL aceptado vigente | Referencia de disputa vigente | PUBLISH humano nuevo o CANCEL que reafirma la retirada; jamás reactivar automáticamente. |

El antecesor debe ser una operación **aceptada**, del mismo tenant/Member/contribución; no un intento rechazado/conflictivo, ID local o fecha. Antecesor ajeno/inexistente o cambio de dimensiones se rechaza sin exponer referencias de terceros. Mobile no envía un sucesor hasta tener ACK/consulta que confirme al antecesor; drafts offline posteriores esperan esa dependencia. Un antecesor propio conocido como todavía en procesamiento puede dar DEPENDENCY_PENDING, no un falso commit.

Dos intenciones diferentes que parten del mismo head no se fusionan ni se tratan como duplicado por tener igual cantidad. Sin autorización causal común, se consideran sucesores en disputa. **No se elige por llegada, timestamp, UUID, cantidad ni instalación.**

La detección puede ocurrir después del ACK del primer sucesor: un sistema online no puede conocer un request futuro. La primera aceptación conserva su recibo histórico APPLIED; cuando se observa una bifurcación no resuelta se marca la contribución CONTESTED y se excluye del consolidado en la misma transacción que registra el conflicto mínimo. No se declara al primer sucesor vencedor final ni se revoca/re-aplica su intención. Un ACK APPLIED prueba commit de esa intención, no que su cantidad siga siendo vigente para siempre. GET distingue el recibo histórico del estado actual. No se conserva una cantidad antigua para rollback ni se reconstruye desde SQLite.

La segunda intención recibe CONFLICT / CAUSAL_FORK y ninguna aceptación de su cantidad. Una rama tardía que contradice ancestry no fenceada también exige reconciliación; #17 conserva suficientes enlaces causales mínimos, sin historial de payloads. El propietario obtiene una referencia opaca de disputa y el head aceptado, decide en Mobile y emite una **nueva** intención con ambos. La referencia vincula contexto, contribución y conjunto causal vigente; si cambió la disputa, CONFLICT / RECONCILIATION_STALE y volver a consultar. La resolución válida fencea las ramas anteriores: sucesores atrasados de ellas no vuelven a competir automáticamente.

Una CANCEL aceptada mantiene retirada aunque llegue un sucesor atrasado: éste recibe CONFLICT / CANCELLED_PREDECESSOR, sin cambiar el tombstone ni activar cantidad. El replay de una operación antigua ya APPLIED responde ALREADY_APPLIED y no altera nada. Cualquier re-publicación exige la nueva intención causal del propietario descrita en la tabla. Una cancelación concurrente aún no aceptada puede provocar CONTESTED (cero contribución activa), hasta una retirada/resolución explícita; no se inventa su aceptación.

Campaña ABIERTA/isActive y producto válido compatible son precondiciones de PUBLISH/SUPERSEDE nuevas. CANCEL autorizado puede retirar en campaña cerrada. Revocación de identidad corta el acceso; la depuración pasa por política responsable, no por bypass. F06 retención/divulgación siguen vigentes.

## 7. ACK exacto y disposition

Response de POST procesado: un único objeto ACK cerrado, **siete claves obligatorias**:

| Campo | Regla |
| --- | --- |
| contractVersion | Entero JSON 1. |
| operationId | UUID exacto de la intención contestada. |
| outcome | APPLIED, ALREADY_APPLIED, CONFLICT, REJECTED o RETRYABLE. |
| disposition | RETIRE_FROM_OUTBOX, KEEP_FOR_RETRY, KEEP_FOR_RECONCILIATION o MOVE_TO_TERMINAL_FAILURE. |
| serverAcceptedAt | Timestamp UTC `YYYY-MM-DDTHH:mm:ss.sssZ` de aceptación duradera para APPLIED/ALREADY_APPLIED; null para los demás. No inventarlo antes de commit. |
| code | Código del conjunto cerrado de §8; sin mensajes libres/valores privados. |
| reconciliationReference | UUID v4 opaco o null; obligatorio no-null en CONFLICT, null en otros outcomes. Su posesión no autoriza acceso. |

| outcome | disposition obligatoria | Mobile |
| --- | --- | --- |
| APPLIED | RETIRE_FROM_OUTBOX | Persistir recibo autorizado y retirada local atómicamente. |
| ALREADY_APPLIED | RETIRE_FROM_OUTBOX | Igual; no aplicar nuevamente el dominio individual. |
| CONFLICT | KEEP_FOR_RECONCILIATION | Pausar esa intención; consultar y pedir decisión humana. |
| REJECTED | MOVE_TO_TERMINAL_FAILURE | No retry automático; conservar evidencia local mínima segura. |
| RETRYABLE | KEEP_FOR_RETRY | Mismos bytes semánticos/ID; backoff. No es un recibo final duradero. |

```json
{
  "contractVersion": 1,
  "operationId": "11111111-1111-4111-8111-111111111111",
  "outcome": "APPLIED",
  "disposition": "RETIRE_FROM_OUTBOX",
  "serverAcceptedAt": "2026-01-01T00:00:00.000Z",
  "code": "OK",
  "reconciliationReference": null
}
```

Validar autenticidad del transporte, versión, ID y combinación outcome/disposition/campos antes de retirar. HTTP 2xx genérico, cuerpo incompleto, ID diferente, timestamp null en APPLIED o disposition contradictoria => **OUTCOME_UNKNOWN local**: mantener misma intención y consultar/reintentar. No borrar SQLite ni ejecutar compra/stock/pago como reacción al ACK.

Resultados finales APPLIED/CONFLICT/REJECTED de una intención nueva admitida y su metadata se persisten antes de contestar. IDEMPOTENCY_MISMATCH es rechazo de un intento de mutación: conserva el resultado original sin crear otro resultado final para la misma clave; sólo registra metadata mínima segura de ese rechazo. Sólo APPLIED/ALREADY_APPLIED con identidad válida autorizan retirada; pasar a fallo terminal o reconciliación no es confirmación de efecto exitoso.

## 8. Códigos de operación y conflicto mínimo

Conjunto cerrado por outcome:

| outcome | code |
| --- | --- |
| APPLIED / ALREADY_APPLIED | OK |
| CONFLICT | CAUSAL_FORK, STALE_PREDECESSOR, CANCELLED_PREDECESSOR, RECONCILIATION_STALE |
| REJECTED | IDEMPOTENCY_MISMATCH, CAMPAIGN_NOT_OPEN, REFERENCE_UNAVAILABLE, UNIT_INCOMPATIBLE, QUANTITY_INVALID, INVALID_PREDECESSOR, INVALID_TRANSITION, OWNERSHIP_NOT_PROVEN, PURPOSE_NOT_AUTHORIZED, CAUSAL_FENCED |
| RETRYABLE | OPERATION_IN_PROGRESS, DEPENDENCY_PENDING, TRANSIENT_UNAVAILABLE |

REFERENCE_UNAVAILABLE combina inexistente, ajeno/inactivo sin confirmar existencia cross-tenant. STALE_PREDECESSOR se usa para un antecesor propio conocido que ya no es el head y necesita revisión; un fork comprobado usa CAUSAL_FORK. CAUSAL_FENCED rechaza antecedentes ya cerrados por resolución explícita. Unknown code/outcome no autoriza retirada local.

Registro de conflicto mínimo: contexto interno tenant/Member, operationId, projectionType, action, conflictCode, referencia opaca de reconciliación/estado, createdAt y resolvedAt nullable; vínculos causales opacos indispensables. Sin quantities, nombres, snapshots, JSON completo ni secretos. resolvedAt se genera al aceptar una resolución; no cambia retroactivamente el ACK original de la intención en conflicto. Ref nueva tras cambios de disputa invalida resoluciones obsoletas.

## 9. HTTP model y consulta owner-scoped

Todo body de error de request tiene exactamente `{contractVersion, operationId, errorCode, disposition}`: contractVersion 1 del controlador y operationId **siempre null**, sin ACK/outcome/serverAcceptedAt. La correlación la conserva Mobile por el request único, sin reflejar input no autorizado. No demuestra commit ni ausencia de commit. Cache-Control: no-store para ACK/error/GET; sin bodies/headers sensibles en access logs.

```json
{
  "contractVersion": 1,
  "operationId": null,
  "errorCode": "CONTRACT_VERSION_MISMATCH",
  "disposition": "KEEP_FOR_RECONCILIATION"
}
```

| HTTP / condición | Body / errorCode | Acción local |
| --- | --- | --- |
| 200 POST: operación admitida con resultado final | ACK APPLIED/ALREADY_APPLIED/CONFLICT/REJECTED | Exclusivamente según ACK válido. Rechazo/conflicto no son 409/HTTP éxito de dominio. |
| 200 POST: dependencia/claim transitorio conocido | ACK RETRYABLE | KEEP_FOR_RETRY; no persistir como resultado final. |
| 400: JSON/estructura/enum/UUID/whitelist inválidos; batch | Error INVALID_REQUEST o FIELD_NOT_ALLOWED | MOVE_TO_TERMINAL_FAILURE; no almacenar body rechazado ni crear journal de proyección. |
| 422: path v1 con contractVersion distinto de 1 | Error CONTRACT_VERSION_MISMATCH | KEEP_FOR_RECONCILIATION; detener worker de esa versión, sin reinterpretar ni fallback. |
| 401: falta/expira credencial | Error AUTH_REQUIRED; WWW-Authenticate correspondiente | KEEP_FOR_RETRY, condicionado a refresh/reautenticación segura; no bucle auth. |
| 403: sesión, Member, registro o permiso inválido/revocado | Error AUTH_CONTEXT_FORBIDDEN | KEEP_FOR_RECONCILIATION; detener envíos, no destruir/transferir outbox ni reactivar registro. |
| 415: Content-Type no JSON | Error UNSUPPORTED_MEDIA_TYPE | MOVE_TO_TERMINAL_FAILURE; revisar productor. |
| 413: límite de request seguro excedido | Error REQUEST_TOO_LARGE | MOVE_TO_TERMINAL_FAILURE; no guardar body; límite operativo documentado por #17, sin introducir batch. |
| 429: rate limit | Error RATE_LIMITED y Retry-After cuando disponible | KEEP_FOR_RETRY; mismo ID; respetar demora. |
| 503: mantenimiento/transitorio sin resultado confirmado | Error TEMPORARILY_UNAVAILABLE; Retry-After si conocido | KEEP_FOR_RETRY; nunca afirmar que no pudo haber commit por el status. |
| 500, timeout, corte, respuesta ilegible o proxy ajeno al esquema | ACK no confiable/ausente | OUTCOME_UNKNOWN; KEEP_FOR_RETRY con mismo ID o GET. Nunca generar nuevo ID. |
| 404: GET operación ajena/inexistente/no visible | Error OPERATION_NOT_FOUND, operationId null | KEEP_FOR_RETRY; no prueba de que un request anterior falló ni permiso para duplicarlo. |
| 404: ruta de versión no soportada | Error de routing seguro | KEEP_FOR_RECONCILIATION; no degradar a legacy. |

Matriz de request-error disposition wire: INVALID_REQUEST/FIELD_NOT_ALLOWED/UNSUPPORTED_MEDIA_TYPE/REQUEST_TOO_LARGE → MOVE_TO_TERMINAL_FAILURE; AUTH_REQUIRED/RATE_LIMITED/TEMPORARILY_UNAVAILABLE/OPERATION_NOT_FOUND → KEEP_FOR_RETRY; CONTRACT_VERSION_MISMATCH/AUTH_CONTEXT_FORBIDDEN → KEEP_FOR_RECONCILIATION. Errores externos/no autenticables se tratan como incertidumbre local, no se confía en su disposition.

GET evalúa la misma autorización y usa el store autoritativo de resultados, no una réplica atrasada. Búsqueda por tenant/Member/operationId; no lista global ni búsqueda por UUID sin ownership. Devuelve 404 indistinguible para otro propietario/tenant. Si existe registro final, HTTP 200 devuelve exactamente `{ack, contribution}`: ack con §7 (APPLIED persistido se presenta como ALREADY_APPLIED); contribution contiene **exactamente** `status`, `headOperationId`, `reconciliationReference`, o es null si ese resultado rechazado no permite resolver una contribución propia con seguridad. UUIDs de head/ref o null, estado NEVER_PUBLISHED/ACTIVE/CANCELLED/CONTESTED. No cantidad ni payload. Una reserva aún en curso devuelve ACK RETRYABLE dentro de la misma forma, contribution nullable hasta resolver su contribución con seguridad; este null no autoriza retirada. Registro ausente/expurgado no se presenta como commit.

```json
{
  "ack": {
    "contractVersion": 1,
    "operationId": "22222222-2222-4222-8222-222222222222",
    "outcome": "ALREADY_APPLIED",
    "disposition": "RETIRE_FROM_OUTBOX",
    "serverAcceptedAt": "2026-01-01T00:01:00.000Z",
    "code": "OK",
    "reconciliationReference": null
  },
  "contribution": {
    "status": "CONTESTED",
    "headOperationId": "22222222-2222-4222-8222-222222222222",
    "reconciliationReference": "44444444-4444-4444-8444-444444444444"
  }
}
```

El ejemplo prueba un recibo histórico y un conflicto posterior, no dos valores activos. Una consulta con ack CONFLICT histórico y contribution ya resuelta tampoco autoriza re-enviar esa intención; Mobile reconcilia usando el recibo de su nueva resolución. GET v1 sólo interpreta registros contractVersion 1; un registro de otra versión responde error de versión 422, no se convierte silenciosamente.

## 10. Una operación por request y atomicidad

**v1 no admite batch**: un envelope, un operationId, un ACK, una unidad de durabilidad. Se evita ocultar resultados parciales y confundir deduplicación por lote. No es prohibición de transporte futuro v2; v2 no se diseña aquí.

Requisitos conceptuales #17: exclusión/unique de intención por tenant/Member/operationId; exclusión de contribución para validar ancestry/head; revalidación de auth/referencias al decidir; commit atómico del resultado final, fingerprint, referencias/contexto causal, transición de proyección o bloqueo de conflicto, y metadata mínima de auditoría. Sólo después del commit se contesta aceptación. Aceptación y marcador idempotente no pueden quedar en commits independientes como legacy.

Una caída antes del commit no deja una aceptación parcial. Una caída después deja resultado recuperable. Dos retries simultáneos convergen al mismo resultado; uno puede recibir OPERATION_IN_PROGRESS antes de confirmarlo. No liberar claims expirados para re-aplicar sin comprobar resultado/proyección. Locks, aislamiento, tablas, lease/recuperación y diseño físico se implementan en #17; deben satisfacer estas invariantes, no son código de esta entrega.

`business_effect_count` cuenta **una transición aceptada de esta intención** (incluido cancelar o sustituir por igual cantidad), no sus requests, ACKs, logs o marcadores de disputa. Siempre ≤1; si APPLIED, =1. CONFLICT/REJECTED final =0 para aceptación del contenido de esa intención; un fence de reconciliación es metadata de seguridad, no aplicación de su cantidad. No se infiere que una cantidad aceptada siga vigente tras una intención posterior o disputa. Outbox/ACK nunca crean efectos privados individuales.

## 11. Retry, refresh y outbox

Timeout/500 ambiguo: conservar same operationId/envelope, consultar o reenviar. Nunca interpretar network failure como rechazo definitivo, ni un GET 404 como permiso para crear otra intención. Si un response valido de RETRYABLE fue emitido y luego se obtuvo commit por otra ejecución concurrente, el siguiente retry descubre ese resultado final.

Backoff exponencial con jitter acotado, demora mínima positiva, máximo operativo configurable y presupuesto de intentos por ciclo; agotarlo pausa/reprograma y conserva intención, no la descarta. Estado de intentos/demora durable entre reinicios. Nada de busy loop, timers negativos o retry automático de CONFLICT/REJECTED. Valores numéricos de base/cap/presupuesto son `IMPLEMENTATION_DECISION` de [Mobile #31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31), documentados/medidos; no periodos arbitrarios de retención.

Con Retry-After válido, esperar al menos su demora además del backoff: `delay = max(backoff_with_bounded_jitter, server_delay)`. Soportar delay-seconds y HTTP-date según [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3); para fecha usar tiempo servidor/Date cuando sea confiable, sin retry anticipado por skew. Si la espera supera una ventana del worker, persistir próximo intento; el cap de backoff no acorta la espera del servidor. Header ilegible no habilita un bucle inmediato.

Refresh/relogin no modifica intención, causal ni versión. Persistir fuera del outbox credenciales mediante el mecanismo seguro F02/F03; nunca enviarlas como campos. Revocación detiene worker; reautenticar el mismo propietario con cliente ACTIVE puede consultar/re-enviar el ID original. Otro tenant/Member no lo adopta. Restore no publica ni importa automáticamente pendientes privados; verificar propietario, referencias y causalidad antes de liberar una intención ya existente.

## 12. Privacy y retención idempotente

Default DENY en esquema y autorización. No admitir ni almacenar para debug/quarantine/errores payloads privados; sin nombres, Person/familia, finca/localización, eventos crudos, inventario, stock declarado, compras, precios, proveedores, pagos, lotes/movimientos, notas, archivos, PDFs/CSV, audio, backups, tokens ni hardware IDs. ACK/GET/conflictos no contienen payload original, cantidades, raw clientId o snapshots. Un campo de identidad extra se rechaza, aunque coincida con sesión.

**Sync payload MUST NOT contain backup binary.**

**Backup restore MUST NOT implicitly publish private backup contents into collective projections.**

Separar R_CURRENT (único estado de negocio mínimo vigente) de R_CAUSAL (clave, fingerprint, versión de clave, vínculos/fences, resultado mínimo) y R_CENTRAL_AUDIT. Audit permitido: actor/contexto interno, tenant, operationId/ref opaca, projectionType, action, outcome/code y tiempo servidor. No quantity_base por defecto; nunca full body, free-text errors, Authorization, IP/UA/hardware por conveniencia. Rechazos de datos privados conservan sólo código seguro y contexto autorizado, sin valores ni nombres de propiedades libres.

`PERIOD_DELEGATED`: F06 #20/clases, F05 #17 garantía replay y F10 #45 validan periodos antes de producción/purga. No basta borrar un registro por TTL: entonces un replay histórico podría parecer nuevo. Antes de eliminar evidencias, #17 debe conservar un fence mínimo que rechace intentos fuera de su horizonte o demostrar que **ninguna operación desconocida de ese horizonte puede aceptarse como nueva**. UUID v4 no contiene fecha fiable; fecha del cliente no sirve para ese proof. Hasta disponer de garantía y política aprobadas, no purgar R_CAUSAL ni habilitar producción. Si esa garantía se pierde durante operación, el guard de admisión devuelve 503/TEMPORARILY_UNAVAILABLE, sin aceptar IDs desconocidos como nuevos, hasta restaurar la garantía; Mobile conserva mismos IDs y backoff. No retener cuerpos completos para solucionar retención. Tombstones/fences sobreviven lo necesario para impedir resurrección; expiración del soporte v1 no elimina ese deber.

## 13. Legacy persistence — clasificación campo por campo

REUSE significa concepto compatible que podrá reusarse tras validación, no permiso para cambiar schema hoy. ADAPT_LATER exige semántica/ownership nuevos; DO_NOT_USE_TARGET excluye del store target; REMOVE_LATER sólo tras cutover/retención/rollback #81.

| Modelo.campo / constraint actual | Disposición | Regla target |
| --- | --- | --- |
| SyncOperation.id | REUSE | Referencia interna opaca; no identifica intención humana por sí sola. |
| SyncOperation.tenantId | REUSE | Contexto autenticado, no valor libre del cliente. |
| SyncOperation.campaignId | ADAPT_LATER | Referencia validada de contribución; no extracción desde payload arbitrario. |
| SyncOperation.userId | ADAPT_LATER | Member efectivo obligatorio; FK User legacy no equivale al scope target. |
| SyncOperation.clientId | DO_NOT_USE_TARGET | No raw UUID/log ni identidad de operación; referencia interna a ClientRegistration contextual. |
| SyncOperation.entityName | ADAPT_LATER | ProjectionType cerrado, sin nombres de tablas SQLite. |
| SyncOperation.entityId | ADAPT_LATER | operationId UUID v4 obligatorio; no entero local/target entityId. |
| SyncOperation.operation | ADAPT_LATER | PUBLISH/SUPERSEDE/CANCEL únicamente. |
| SyncOperation.payload | DO_NOT_USE_TARGET | No request archive; sólo R_CURRENT separado y fingerprint/metadata mínimos R_CAUSAL. |
| SyncOperation.status | ADAPT_LATER | Resultado duradero del contrato; PENDIENTE legacy no es ACK de aceptación. |
| SyncOperation.errorMessage | DO_NOT_USE_TARGET | Código cerrado, sin texto de excepción/valores privados. |
| SyncOperation.createdAt | REUSE | Tiempo de servidor minimizado. |
| SyncOperation.appliedAt | ADAPT_LATER | serverAcceptedAt sólo después de aceptación atómica duradera. |
| SyncOperation.tenant / campaign / user / conflicts (relations) | ADAPT_LATER | Aislamiento de contexto/Member/refs; no inferir acceso desde relación legacy. |
| unique tenantId/userId/clientId/entityId | ADAPT_LATER | unique tenant/Member/operationId; instalación fuera de la clave. |
| SyncConflict.id | REUSE | Referencia opaca interna owner-scoped; no autorización por UUID. |
| SyncConflict.syncOperationId / syncOperation (relation) | ADAPT_LATER | Vincular a journal target y contexto efectivo, no registro abierto legacy. |
| SyncConflict.serverSnapshot | DO_NOT_USE_TARGET | Prohibido snapshot completo; referencias/estado mínimos. |
| SyncConflict.clientSnapshot | DO_NOT_USE_TARGET | Prohibido copiar payload o SQLite. |
| SyncConflict.resolvedPayload | DO_NOT_USE_TARGET | Resolución humana es nueva intención; sin archivo JSON completo de resultado privado. |
| SyncConflict.resolvedAt | REUSE | Fecha de cierre de disputa, no alteración del ACK histórico. |
| SyncConflict.createdAt | REUSE | Tiempo servidor mínimo. |
| Rutas, escritores y almacenes legacy ya migrados | REMOVE_LATER | Sólo #81 tras consumidores/cutover, reconciliación, retención y rollback probados; sin DROP ni fecha aquí. |

Faltan en legacy versión target, Member-key, fingerprint, causal/fences, referencia de registro contextual y transacción de recepción/resultado/proyección. Esta comparación no define migraciones ni modelos Prisma nuevos.

## 14. Compatibility/evolution

Convivencia por rutas explícitas; v1 conserva esquema/semántica mientras esté soportada, sin coerción silenciosa a v2/legacy. v2 es otra revisión futura, no un objeto abierto de v1. Una intención v1 mantiene contractVersion 1 en outbox y journal; no se migra su wire automáticamente después de envío. La clave tenant/Member/operationId abarca versiones para detectar reinterpretación con el mismo ID; no duplica aceptación por cambiar versión de ruta.

Versiones no soportadas fallan explícitamente y preservan la intención para reconciliación/upgrade gobernado. Retirar soporte requiere inventario de clientes/outboxes, garantía de replay, consulta/resolución, compatibilidad y rollback aprobados. Un test merge/head o un SyncOperation histórico no acredita el protocolo target.

## 15. Handoff de implementación

| Responsable | Entrada exacta / verificación posterior |
| --- | --- |
| [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29) | Bindings campaign_ref/product_ref y UUID v4 operationId; no globalizar todos los IDs SQLite ni equiparar Person con Member. |
| [Roderich1/AppMovilAgroquimico#30](https://github.com/Roderich1/AppMovilAgroquimico/issues/30) | Outbox atómico: operationId, versión, tipo, acción, causal, payload permitido, estado, scope del propietario/contexto interno y attempt metadata. Persistir intención una vez; recibo/retiro atómicos; sin tokens. Conservar referencias mínimas de recibo para GET/reconciliación posterior. |
| [Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31) | Worker respeta disposition, dependencia causal, mismo ID/versión, backoff/jitter/Retry-After, pausa auth/conflicto; GET mínimo y confirmación humana para nueva resolución. |
| Backend #17 | Implementar journal/unique/contexto, atomismo, fingerprint seguro, causal/fork/fences, consulta autoritativa y protección de retención; probar concurrencia y recuperación. Sin efectos de dominio individual. |
| Backend #18 | Suite completa de la [matriz](F05_SYNC_V1_RETRY_IDEMPOTENCY_MATRIX.md); adversarial timeout/ACK loss/500/refresh/concurrencia/mismatch/cancel/fork tardío/replay tras purga. Evidencia runtime futura, no PASS aquí. |
| Backend #21 | Reconciliar exactamente una contribución vigente por contexto; excluye CONTESTED/CANCELLED; totals exactos y frescura derivada. Dataset controlado según whitelist F06, no SQLite total. |

## Impact on ALIGN-TECH-01 #81

Tras auditoría independiente, merge y aceptación formal de #16 podrá evaluarse satisfecho el último **bloqueador contractual** F05 de #81. Este draft no lo desbloquea ni cambia casillas/campos. #20 permanece cerrado y aprobado; #81 OPEN/Blocked; #19 GATE-F05 y #22 GATE-F06 Pending sin modificaciones.

Quedan reemplazables conceptualmente DTO/push/list/idempotencia/payload/conflictos legacy para el flujo colectivo aprobado. Aún no pueden retirarse rutas, escritores, tablas ni cola Web: faltan #17 implementación, #18 suite, [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#30](https://github.com/Roderich1/AppMovilAgroquimico/issues/30)/[Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31)/adaptadores F06, #21 reconciliación, política de retención/divulgación y cutover/rollback de [TRANSITION_PLAN](../scope/TRANSITION_PLAN.md). #81 podrá planificar/coordinar su realineación tras aceptación; no implica ejecutar big-bang, DROP, migraciones o producción por aprobar este documento.

Siguiente acción: `INDEPENDENT_AUDIT_F05_SYNC_04`. No merge, implementación ni comienzo de #81 en esta entrega.
