# Publicación automática del consumo: propuesta de decisión

- **Estado: Proposed.** Es una propuesta para que Roderich Rendón decida. No es una decisión, no cambia ningún gate y no se presenta como aceptada ni verificada.
- **Fecha:** 2026-11-05. Redactada por Claude Code a pedido de Roderich.
- **Pedido:** «Para la publicación automática de consumo, revisa el contrato y prepara una propuesta separada: autorización al vincular, alcance de consumo futuro, envío sin duplicados, revocación y tratamiento de pendientes. No actives envíos automáticos ni cambies la política en este lote.»
- **Base de lectura:** Backend/Web `main` `5973b49`; Mobile `main` `279b46b` (sólo lectura).
- **Requisitos que toca:** RF-13, RF-16 y RF-24 (publicación del consumo, Mobile `docs/evidence/F06-COLL-03_sincronizacion_consumo_colectivo.md`); RF-18 y CU-11 (sincronización); RF-22, RF-24 y CU-13 (vista agregada); RNF-05 (política de divulgación); RF-03, RN-15 y RN-16 (operación tardía y coherencia temporal); CU-05 (modo de uso); RU-18 y RU-19 (lectores); INT-09 (la estimación lee consumo publicado y sellado).
- **Issues relacionados:** [Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33) (publicación de consumo), [Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31) (worker), #16/#17 (contrato y servidor Sync v1), #107 (política de divulgación), #45 (F10-SEC-02).

## Lo que este lote no hace

- **No activa ningún envío automático.** No hay código, ni bandera, ni configuración nueva.
- **La política vigente no cambia:** el consumo se publica sólo cuando el agricultor pulsa «Publicar» (Mobile #33).
- No modifica contratos, OpenAPI, esquema, Web ni Mobile.
- No crea issues ni toca el Project.

## 0. Resumen de la recomendación

| Tema | Recomendación |
|---|---|
| Autorización al vincular | Autorización **opcional, desactivada por defecto, por campaña**, que da el titular con su PIN al vincular la campaña o después. Se guarda sólo en el teléfono. Sólo para `CONSUMPTION_TOTAL`, nunca para `DECLARED_NEED`. |
| Alcance del consumo futuro | Campañas autorizadas que estén **activas en el teléfono y abiertas en Central**. El total de la campaña incluye las aplicaciones anteriores a la autorización, porque es un total acumulado; la pantalla lo muestra antes de autorizar. Sólo aplicaciones confirmadas y no revertidas del titular. Nunca campañas cerradas, selladas ni períodos históricos. |
| Envío sin duplicados | Sin cambios en el wire. Se recalcula en el ciclo del worker, con la misma vista y el mismo planner que la publicación manual. Un total sustituye al anterior. Lo no enviado se reescribe o se descarta; lo enviado conserva su `operationId`. Tras un conflicto o un rechazo, el envío automático se detiene en esa contribución. |
| Revocación | Desactivarla corta las intenciones nuevas al instante. Lo que nunca salió se descarta, con confirmación y a la vista. Lo que ya salió se concilia con el mismo ID. Lo aceptado en Central **se queda** salvo que el titular elija también «Retirar del sindicato» (CANCEL), que se ofrece aparte. |
| Pendientes | Cierre de campaña, operación tardía, cambio de titular y restauración **suspenden** el envío automático sin reasignar nada. Una reversión baja el total con SUPERSEDE, o con 0 si se revirtió todo. Un cambio de modo de uso no cambia los totales y sólo muestra un aviso. |

## 1. Qué hay hoy

**Publicación explícita (Mobile #33).** `lib/presentation/screens/consumption_publish_screen.dart` muestra una vista previa que no escribe nada. Sólo «Publicar» encola, y sólo los totales que cambiaron. El diálogo dice «Cada total sustituye al anterior; no se suma».

`lib/data/sync/consumption_publisher.dart`:
- `preview()` es de sólo lectura;
- `publish(confirmed)` recalcula en la misma transacción y no escribe nada si la vista previa quedó desactualizada (`_sameProposal`);
- encola con `planIntention` y `SyncOutboxStore.applyPlan`;
- `resolveConflict` y `withdraw` piden una decisión expresa del titular.

**Cálculo del total.** `lib/domain/sync/consumption_projection.dart` es una función pura. Suma, por campaña y producto vinculados:
- sólo las aplicaciones `CONFIRMED` y no revertidas;
- sólo las del **titular** (`ownerPersonId`); las de familiares o terceros se excluyen (RF-16);
- con aritmética exacta: un total por encima de int64 se excluye por `overflow`, nunca se trunca.

**Envío.** `lib/services/sync/sync_worker.dart` envía como máximo una intención por contribución, y la sucesora sólo tras el ACK de su antecesora. Funciona sólo con la app en primer plano (`lib/presentation/widgets/sync_lifecycle.dart`). El backoff sigue F05 §11 con los valores de Mobile #31: base 2 s, ×2 por intento, tope 15 min.

**Recepción en Central.** `Back/src/modules/sync-v1/application/push-operation.use-case.ts`:
- revalida la autorización en cada operación, dentro de la transacción (Member `AGRICULTOR` activo, sesión y registro de cliente);
- responde un replay con el resultado guardado;
- rechaza valores nuevos con `CAMPAIGN_SEALED` o `CAMPAIGN_NOT_OPEN`;
- admite CANCEL en una campaña cerrada;
- sustituye el total, nunca lo suma.

Central no sabe, ni necesita saber, si una intención nació de un botón o de una regla.

## 2. Encaje con los contratos y discrepancias

Según `CLAUDE.md`, si el pedido contradice un contrato, **gana el contrato**. La publicación automática choca hoy con cuatro textos vigentes:

| # | Texto vigente | Qué dice | Consecuencia |
|---|---|---|---|
| C-1 | F06 §2 (`F06_COLLECTIVE_PROJECTION_CONTRACT.md`) | «No se exige publicar si el agricultor no ha emitido una intención autorizada.» | Admite una intención **autorizada**. No dice si una autorización permanente lo es. Hay que aclararlo por enmienda. |
| C-2 | F06 §8 y F05 §11 | Tras restaurar, «cualquier publicación posterior exige intención explícita». | Una autorización guardada en SQLite viaja en el respaldo. Al restaurar no puede reactivarse sola. |
| C-3 | F05 §5 (`F05_SYNC_V1_PUSH_ACK_CONTRACT.md`) | «Generar UUID v4 una vez al confirmar una intención»; «el worker no genera uno para escapar a conflicto, rechazo o incertidumbre». | Un productor automático puede generar IDs para totales nuevos, pero **nunca** para rehacer una intención rechazada o en conflicto. |
| C-4 | Mobile `docs/architecture/F04_RF13_RF03_ACTOR_Y_TARDIAS.md` §2.3–§2.4 (decisión del autor del 2026-10-23) | Confirmar una operación tardía «no encola nada»; «la publicación de consumo sigue siendo una acción expresa del agricultor». | La primera frase se mantiene con esta propuesta. La segunda habría que enmendarla. |

Otras restricciones que la propuesta respeta sin cambios:
- **Sin servicio de consentimiento en Central.** Lo dicen F06 §4, la aclaración posterior de ADR-001 y DEC-F01-08. La autorización vive en Mobile. No es un «consentimiento formal», salvo que #45 lo exija (F06 §4).
- **`DECLARED_NEED` siempre expresa** (F06 §3). Queda fuera de toda automatización.
- **«Futuro» no puede partir el total** (F06 §2). `CONSUMPTION_TOTAL` es el «total físico acumulado vigente» de la campaña y el producto. No hay un total «sólo desde hoy», así que «futuro» se resuelve por campaña (§4).
- **Retirar no borra la memoria de divulgación** (F06 §7.1 y §7.2). `R_DISCLOSURE_MEMORY` y el historial sellado no se olvidan de forma selectiva. Un CANCEL sólo retira la visibilidad de las cifras selladas que incluían ese aporte.

**Conclusión:** sin una enmienda de C-1, C-2 y C-4 decidida por Roderich, la publicación automática no se puede habilitar. La propuesta describe esa enmienda; no la aplica.

## 3. Autorización al vincular

### 3.1 Qué garantiza hoy

- Cada vínculo de campaña o producto nace de una elección confirmada, nunca por nombre (`lib/data/sync/central_binding_store.dart`, `central_binding_screen.dart`, F05-SYNC-08).
- La compatibilidad del período se comprueba al vincular, al refrescar y en cada lectura (D-F04-C2, RN-15).
- Hay una credencial local del titular (PIN) con autorizaciones de un solo uso por propósito. Ejemplos: `REVERSE_APPLICATION` y `CONFIRM_LATE_OPERATION` (`lib/services/auth/local_owner_credential.dart`; Mobile F03 §4).
- Central revalida al Member en cada operación (F05 §3).

### 3.2 Hueco

- No existe una autorización **permanente** ni un registro de cuándo, quién y para qué campaña se dio.
- Vincular una campaña hoy no implica publicar nada.
- En modo compartido, otra persona puede usar el teléfono. Sin PIN, cualquiera podría activar la publicación del titular.

### 3.3 Opciones

| Opción | A favor | En contra |
|---|---|---|
| A. Global, al activar la app | Un solo paso | Cubre campañas que aún no existen. Mezcla la activación (F03) con la divulgación. Revocar es todo o nada. |
| **B. Por campaña, al vincularla o después (recomendada)** | Encaja con la unidad del total (F06 §6). El texto puede mostrar el total actual. Se revoca por campaña. | Un paso por campaña (pocas al año). |
| C. Por campaña y producto | Máximo control | Muchas decisiones; los productos vinculados después quedan en un limbo. |

**Recomendación (B):**
- Un interruptor «Enviar mi consumo automáticamente en esta campaña», **apagado por defecto**, en la pantalla del vínculo de campaña y en la de publicación.
- Al encenderlo:
  - se muestra la vista previa actual, con el total que se enviará y lo que se excluye;
  - se explica qué se envía, qué no y cómo retirarlo;
  - el titular confirma con su PIN, con un propósito nuevo de un solo uso, por ejemplo `AUTHORIZE_AUTO_CONSUMPTION`, y `subjectRef = campaign:<id>`.
- Se guarda en una tabla local nueva, `auto_publication_authorizations`, con estas columnas:
  - el vínculo de titular;
  - la campaña local y la `campaign_ref`;
  - `granted_at`, `revoked_at` y el motivo de fin;
  - el actor, como en `reversal_audit`.
  
  La tabla es inmutable salvo para cerrar la autorización. No se envía a Central y no amplía la whitelist F06.
- Sin vínculo de titular o sin PIN enrolado no se puede autorizar (como en F04 §1.3).

### 3.4 Decisiones de Roderich

- **D-1.** ¿Una autorización permanente, revocable y por campaña cuenta como «intención autorizada» para `CONSUMPTION_TOTAL` (C-1)? Si la respuesta es no, la propuesta termina aquí.
- **D-2.** ¿Granularidad A, B o C?
- **D-3.** ¿PIN del titular o una confirmación simple?
- **D-4.** ¿La autorización local basta como «autorización aplicable», o el contexto académico exige consentimiento formal antes de habilitarla (F06 §4, #45)?

## 4. Alcance del consumo futuro

### 4.1 Qué garantiza hoy

- Sólo cuentan las aplicaciones confirmadas, no revertidas y del titular (`consumption_projection.dart`).
- Una aplicación multiproducto aporta a cada producto.
- Sólo se publican campañas y productos con vínculo válido. Un vínculo bloqueado por período se muestra con su total real y no se envía (D-F04-C2).
- Central rechaza valores nuevos en campañas cerradas (C16) o selladas (C16b), en `F05_SYNC_V1_RETRY_IDEMPOTENCY_MATRIX.md`.
- Las operaciones tardías se confirman sólo en campañas `CLOSED` y no encolan nada (F04 §2.3).
- Un período histórico local no tiene `campaign_ref` y nunca se publica (F04 §2.5).

### 4.2 Hueco

- `ConsumptionPublisher._compute` recorre **todas** las aplicaciones de todas las campañas vinculadas. Un productor automático sin filtro intentaría publicar campañas viejas, que Central rechazaría.
- No hay regla sobre los productos que se vinculan después de autorizar.

### 4.3 Opciones y recomendación

| Pregunta | Opciones | Recomendación |
|---|---|---|
| ¿Qué campañas? | (a) sólo la activa; (b) todas las autorizadas | **(b) limitada:** autorizadas, `ACTIVE` en el teléfono y con vínculo válido. Si Central la cerró, el rechazo `CAMPAIGN_NOT_OPEN` detiene esa contribución (§5). |
| ¿Consumo anterior a la autorización dentro de la campaña? | (a) incluido; (b) excluido | **(a), por obligación del contrato:** el total es acumulado (F06 §2). Excluirlo sería otro tipo de dato. La pantalla muestra el total completo antes del PIN. |
| ¿Campañas pasadas? | (a) nunca; (b) a pedido | **(a) nunca en automático.** Siguen con la publicación manual de hoy, que Central acepta sólo si la campaña sigue abierta. |
| ¿Productos vinculados después? | (a) entran con aviso; (b) piden otra confirmación | **(a):** cada vínculo de producto ya es una elección expresa. Si la campaña tiene el envío automático encendido, el diálogo de vínculo lo avisa. |
| ¿Fechas? | — | Las de la campaña, con la retención por período de D-F04-C2 sin cambios. |

### 4.4 Decisiones de Roderich

- **D-5.** ¿Se acepta que el primer envío incluya el consumo ya registrado en la campaña, mostrado antes de autorizar?
- **D-6.** ¿Los productos vinculados después de autorizar entran con aviso (a) o piden otra confirmación (b)?

## 5. Envío sin duplicados

### 5.1 Qué garantiza hoy

| Garantía | Dónde |
|---|---|
| `operationId` UUID v4 generado una vez; los reintentos llevan el mismo envelope | F05 §5 y §11; `lib/domain/sync/operation_id.dart`; `SyncOutboxStore.markSending` registra el intento antes de enviar |
| Central deduplica por (tenant, Member, `operationId`) con huella HMAC; el replay da `ALREADY_APPLIED` | F05 §5; matriz C02–C07; `push-operation.use-case.ts` |
| Un total sustituye al anterior (SUPERSEDE), no se suma; una reversión puede bajarlo | F06 §6; F05 §6; `push-operation.use-case.ts` («A total replaces the previous one») |
| Una intención no enviada se reescribe o se descarta sin nuevo ID; una enviada nunca cambia | `lib/domain/sync/intention_planner.dart` (`RewritePlan`, `DiscardPlan`) |
| Un solo envío en vuelo por contribución; la sucesora espera el ACK | `SyncOutboxStore.readyToSend` y `sync_worker.dart` |
| Sin red: la intención queda en la outbox; `OUTCOME_UNKNOWN` se reenvía igual | F05 §11; matriz C03–C06 |
| Un conflicto no se resuelve solo | `ResolveConflictFirstPlan`; F05 §6 |

### 5.2 Hueco

1. **No hay disparador:** nada recalcula ni encola sin el botón.
2. **Rechazo y nuevo ID.** `SyncOutboxStore.latestEffective` ignora las filas `REJECTED`, `FAILED` y `DISCARDED`. Tras un rechazo terminal (por ejemplo `CAMPAIGN_NOT_OPEN`), un recálculo planificaría sobre la última aceptada y crearía un `operationId` **nuevo** con el mismo contenido. En la publicación manual eso es una decisión humana nueva. En la automática sería «generar un ID para escapar a un rechazo» (C-3).
3. **Cadencia.** Publicar tras cada aplicación acerca `data_as_of` a la hora de la aplicación (§8).

### 5.3 Opciones

| Opción | A favor | En contra |
|---|---|---|
| A. Encolar en la misma transacción que confirma o revierte la aplicación | Atómico, como la necesidad declarada | Mete Sync en `agro_repository`. Un fallo del planner podría deshacer la aplicación. Una intención por aplicación. |
| **B. Recalcular al inicio del ciclo del worker (recomendada)** | No toca la transacción de la aplicación. Reúne varias aplicaciones en un total. Reutiliza `_compute` y `planIntention`. Permite una ventana de cadencia. | El envío espera al siguiente ciclo, sólo con la app en primer plano. |
| C. Sólo un recordatorio («tiene consumo sin publicar») | Sin cambio de contrato | No es automático. Sirve de alternativa si D-1 es «no». |

**Recomendación (B), con estas reglas:**
- **Momento.** Al inicio de cada ciclo, y como máximo una vez por ventana (D-7):
  - en una transacción bajo `DatabaseReplacementGuard`, con la compuerta de activación;
  - recalcula sólo las campañas autorizadas y vigentes;
  - aplica `planIntention` a las filas que cambiaron, como hace `publish()`.
- **Lo que no se envía:**
  - `unchanged` no envía nada;
  - un total que vuelve al valor aceptado antes de salir se descarta (`DiscardPlan`).
- **Parada por contribución.** Si la última intención de la contribución terminó en `REJECTED`, `FAILED`, `CONFLICT` o en una retención por período, el productor automático no planifica nada en ella. Queda «requiere su decisión» en la pantalla de publicación, donde decide el titular.
- **La aplicación nunca falla por la publicación.** Un error del recálculo se registra y se reintenta en el ciclo siguiente.
- **Sin cambios en Central ni en el wire:** seis claves, `contractVersion = 1`, sin un campo «origen». Así Central no distingue lo manual de lo automático, lo que también reduce lo que sabe.

### 5.4 Decisiones de Roderich

- **D-7.** Cadencia:
  - (a) en cada ciclo;
  - (b) ventana mínima, por ejemplo una vez al día;
  - (c) ventana más un retardo aleatorio acotado.
  
  Se recomienda (b) o (c), con el valor fijado antes de medir. Conviene ese número porque la cadencia afecta a la privacidad (§8).
- **D-8.** ¿Opción B o, si D-1 es «no», sólo el recordatorio C?

## 6. Revocación

### 6.1 Qué garantiza hoy

- **CANCEL retira el aporte** sin cantidad y deja un tombstone que impide la resurrección (F06 §6; F05 §6; matriz C12–C13).
- **CANCEL vale aunque la campaña esté cerrada** (C18) **o sellada** (C16c). En la sellada sólo retira la visibilidad de las cifras que incluían el aporte.
- **Pausas sin borrar nada:**
  - revocación de sesión o cliente → `AUTH_PAUSED` (C22, C23, C40; `SyncOutboxStore`);
  - cambio de titular → `OWNER_PAUSED` (`pauseOtherOwners`);
  - restauración → `RESTORE_PAUSED`.
- **En Mobile, «Retirar del sindicato» existe sólo para totales con vínculo bloqueado** (`ConsumptionPreviewRow.canWithdraw`).

### 6.2 Hueco

- No hay forma de desactivar una autorización, porque no existe.
- No hay una retirada general de un total vigente con vínculo válido.
- Falta decir qué pasa con lo encolado por la regla automática.

### 6.3 Opciones

| Al revocar | Opciones | Recomendación |
|---|---|---|
| Intenciones nuevas | — | Se cortan en la misma transacción que cierra la autorización. |
| Pendientes nunca enviados (`PENDING`, `attempts = 0`) | (a) descartarlos; (b) dejarlos salir; (c) preguntar uno por uno | **(a), con la lista a la vista y confirmación.** Central queda como antes. El titular puede publicarlos a mano. |
| Ya enviados sin resultado (`SENDING`, `OUTCOME_UNKNOWN`) | — | **Se concilian con el mismo ID** (F05 §5 y §11). No se pueden retirar del cable. Si Central los aceptó, cuentan como aceptados. |
| Totales aceptados en Central | (a) se quedan; (b) CANCEL automático; (c) se ofrece CANCEL aparte | **(c).** Revocar el envío automático no es retirar lo ya publicado. «Retirar del sindicato» se ofrece como segunda decisión expresa, por campaña, con PIN. |
| Memoria de divulgación y sellado | — | **No se borran de forma selectiva** (F06 §7.1 y §7.2). El texto de la autorización lo dice **antes** de autorizar. |
| Credenciales revocadas en Central | — | No es una revocación del agricultor. La cola se pausa y la retirada sigue la política central (F06 §6). |

### 6.4 Decisiones de Roderich

- **D-9.** ¿Se descartan los pendientes nunca enviados (a), se dejan salir (b) o se pregunta uno por uno (c)?
- **D-10.** ¿Se ofrece «Retirar del sindicato» para cualquier total vigente, no sólo para los bloqueados? Implica ampliar `canWithdraw` y su pantalla.
- **D-11.** ¿Revocar pide PIN? Se recomienda que no: retirar el permiso no debe costar más que darlo. Retirar datos (CANCEL) sí pide PIN.

## 7. Tratamiento de pendientes

| Situación | Qué garantiza hoy | Propuesta para el modo automático |
|---|---|---|
| **Revocación** | — | §6.3. |
| **Cambio de titular** | Las intenciones del vínculo anterior pasan a `OWNER_PAUSED`; no se reasignan ni se borran (F05 C38) | La autorización **termina** con el vínculo de titular (`revoked_at`, motivo `OWNER_CHANGED`). No pasa al titular nuevo. |
| **Restauración** | Todo lo enviable pasa a `RESTORE_PAUSED` hasta que el titular lo libere (F05 §11; F06 §8) | La autorización restaurada queda **suspendida**. Reanudarla pide PIN (C-2). Liberar la cola no la reactiva. |
| **Cambio de modo de uso** (personal ↔ compartido, CU-05) | El total sólo cuenta líneas del titular en los dos modos (RF-16) | No suspende. Muestra un aviso: «su envío automático sigue activo; sólo cuentan sus aplicaciones». |
| **Paso de automático a manual** | — | Es una revocación (§6). La pantalla manual sigue igual. |
| **Cierre de la campaña en el teléfono** | Sin compras ni aplicaciones ordinarias nuevas; la retención por período sigue | El productor deja de recalcularla. Los pendientes no enviados de esa campaña se tratan como en D-9. |
| **Cierre o sellado en Central** | `REJECTED / CAMPAIGN_NOT_OPEN` o `CAMPAIGN_SEALED`, terminales, sin reintento (C16, C16b) | Se para la contribución (§5.3). Se muestra el mensaje de F04 §2.4. **No se genera otro ID.** |
| **Operación tardía en revisión** | El borrador no afecta al consumo; confirmarla no encola nada (F04 §2.3) | Sin cambio. La campaña es `CLOSED`, así que queda fuera del alcance (§4.3). |
| **Aplicación revertida (RF-13)** | El total baja; si todo se revirtió, pasa a 0 sin CANCEL (`_compute`) | Igual. Antes de salir, el planner reescribe o descarta. Después del ACK, va un SUPERSEDE con el total menor. En una campaña cerrada, nada automático. |
| **Conflicto (`CONTESTED`)** | El total no cuenta; decide el titular (`resolveConflict`) | Se para la contribución hasta que el titular decida. |
| **Vínculo inválido por período** | Retenido; lo que ya salió se concilia por GET (D-F04-C2) | Sin cambio. Nada automático sale por POST. |

**Decisiones de Roderich:**
- **D-12.** ¿Termina la autorización con el cambio de titular y queda suspendida tras restaurar, como se propone?
- **D-13.** ¿El cambio de modo de uso sólo avisa o también suspende?

## 8. Privacidad y divulgación (F07)

- **Lo que no cambia:**
  - mismos cuatro campos (F06 §2);
  - mismos lectores, DIRECTIVA y ADMINISTRADOR del tenant (F07 §1; RU-18 y RU-19);
  - umbral k = 3 provisional y regla de combinaciones (F07 §3 y §9);
  - un cambio de un solo Member deja la cifra anterior con `pending_changes` (F07 §5).
- **Lo que aumenta:**
  - más sustituciones, y por tanto más `pending_changes` y más divulgaciones en `R_DISCLOSURE_MEMORY`;
  - `data_as_of` (F07 §2) se acercaría a la hora de cada aplicación. F06 §5 separa la frescura de `applied_at`, y F07 §6 acepta sólo la hora de la última aceptación como señal.
  
  La ventana de D-7 reduce esa correlación.
- **Lo que mejora:** más agricultores con aporte vigente. Eso sube la cobertura «N de M» y la serie que lee la estimación (INT-09, sólo lo publicado y sellado).
- **Datos reales:** su divulgación sigue sin aprobar (`POLICY_PENDING`, F07 encabezado; #107).
  - **D-14.** ¿El modo automático queda limitado al entorno sintético hasta que #107 se decida? Se recomienda que sí.

## 9. Qué cambiaría si se acepta

| Ámbito | Cambio | Dónde |
|---|---|---|
| Contrato | Enmienda fechada, sin borrar texto: en `CONSUMPTION_TOTAL`, una autorización vigente, por campaña y revocable del titular cuenta como intención autorizada. No vale para `DECLARED_NEED`. No sobrevive a una restauración ni a un cambio de titular. | F06 §2, §4 y §8 |
| Contrato | Aclaración: un productor automático no genera IDs tras `REJECTED`, `FAILED` o `CONFLICT` de la misma contribución | F05 §5 y §11 |
| Contrato Mobile | Enmienda de «acción expresa» en F04 §2.4; la regla de tardías no cambia | `docs/architecture/F04_RF13_RF03_ACTOR_Y_TARDIAS.md` |
| Backend | **Ninguno en el wire ni en la base.** Opcional: casos HOST de muchas sustituciones del mismo Member en la regla de combinaciones (ya hay base en `disclosure-policy.spec.ts`) | — |
| Web | Ninguno | — |
| Mobile | Tabla local de autorizaciones (migración); propósito de PIN nuevo; interruptor y textos en el vínculo de campaña y en la publicación; paso automático al inicio del ciclo; parada por contribución; revocación con su lista; «Retirar del sindicato» ampliado (D-10); suspensión al restaurar o cambiar de titular | `central_binding_screen.dart`, `consumption_publish_screen.dart`, `consumption_publisher.dart`, `sync_worker.dart`, `sync_outbox_store.dart`, `local_owner_credential.dart` |
| Decisión | Registrar la decisión de Roderich como ADR en `docs/adr/` | Ver D-15 |

- **D-15.** Si se acepta, ¿con qué número de ADR? En Backend el siguiente libre es ADR-005. Mobile ya usa ADR-005 para la voz local en la rama `feat/voz-local-continua`, así que conviene un título inequívoco.

## 10. Plan de pruebas

Estas pruebas no se han ejecutado: son la propuesta para cuando haya implementación.

### 10.1 HOST (Mobile, `flutter test`)

| # | Caso | Resultado esperado |
|---|---|---|
| H1 | Sin autorización: confirmar y revertir aplicaciones | Ninguna fila nueva en `sync_outbox` (regresión de la política vigente) |
| H2 | Autorización sin PIN, con PIN vencido o con el PIN de otro propósito | No se guarda nada |
| H3 | Autorizada: tres aplicaciones antes del ciclo | Un solo PUBLISH con la suma exacta |
| H4 | Una aplicación revertida antes de que salga | `RewritePlan` con el mismo `operationId`, o `DiscardPlan` si vuelve al valor aceptado |
| H5 | Reversión después del ACK | SUPERSEDE con el total menor; con todo revertido, 0 y no CANCEL |
| H6 | Reintentos, `OUTCOME_UNKNOWN` y cierre entre el ACK y la retirada | Mismo ID y envelope (C02–C06, reutilizando las pruebas de #31) |
| H7 | `REJECTED / CAMPAIGN_NOT_OPEN` y otro ciclo | No se crea otro `operationId`; la contribución queda parada |
| H8 | `CONFLICT` | Nada automático hasta `resolveConflict` |
| H9 | Campaña `CLOSED` en el teléfono y operación tardía confirmada | Nada encolado (regresión de F04 §2.3) |
| H10 | Vínculo retenido por período | Nada sale por POST; la conciliación por GET sigue igual |
| H11 | Revocar con pendientes no enviados, enviados y aceptados | Descarte sólo de los no enviados; los enviados conservan su ID; ningún CANCEL sin elegirlo |
| H12 | Cambio de titular y restauración | Autorización terminada o suspendida; `OWNER_PAUSED` y `RESTORE_PAUSED` sin cambios |
| H13 | Modo compartido con aplicaciones de familiares | No cuentan (RF-16) |
| H14 | Fallo inyectado en el recálculo | La aplicación queda confirmada; el ciclo siguiente reintenta |
| H15 | Ventana de cadencia (D-7) con reloj falso | No más de un recálculo por ventana |
| H16 | Envelope | Sólo las seis claves y los cuatro campos; ningún campo «origen» |

En las pruebas de pantalla, mantener al mínimo las consultas a SQLite: las pantallas de sincronización son sensibles a consultas añadidas.

### 10.2 Backend (HOST, PostgreSQL)

No hace falta un caso nuevo de protocolo. Si se quiere, se puede añadir una secuencia larga de SUPERSEDE de un Member en una celda con k = 3. Lo esperado: una sola cifra nueva, publicada sólo con k cambios demostrados (F07 §9).

### 10.3 Dispositivo o emulador

- **Recorrido 1:** autorizar con PIN, aplicar sin red, volver a tener red con la app en primer plano, y comprobar en la Web la cifra o su `pending_changes`.
- **Recorrido 2:** revocar con un pendiente sin enviar y comprobar que no llega a Central.
- **Recorrido 3:** cerrar la campaña en Central y comprobar «requiere intervención» sin reintentos.
- **Recorrido 4:** restaurar un respaldo con la autorización activa y comprobar que queda suspendida.
- **Registro:** modelo del dispositivo, SHA de la APK y fecha real, en `docs/evidence/`.

## 11. Decisiones que sólo puede tomar Roderich

| # | Decisión | Recomendación |
|---|---|---|
| D-1 | ¿Una autorización permanente cuenta como intención autorizada en `CONSUMPTION_TOTAL`? | Sí, sólo con las enmiendas de §9 |
| D-2 | Granularidad | Por campaña |
| D-3 | Credencial al autorizar | PIN del titular |
| D-4 | ¿Autorización aplicable o consentimiento formal (#45)? | Resolverlo antes de habilitar |
| D-5 | ¿El primer envío incluye el consumo previo de la campaña? | Sí, mostrado antes |
| D-6 | Productos vinculados después | Entran con aviso |
| D-7 | Cadencia | Ventana mínima, con el valor fijado antes de medir |
| D-8 | ¿Recálculo en el worker o sólo recordatorio? | Recálculo en el worker (B) |
| D-9 | Pendientes no enviados al revocar | Descartar con lista y confirmación |
| D-10 | «Retirar del sindicato» para cualquier total | Sí |
| D-11 | ¿PIN para revocar? | No; sí para retirar datos |
| D-12 | Cambio de titular y restauración | Terminar o suspender |
| D-13 | Cambio de modo de uso | Sólo aviso |
| D-14 | ¿Sólo entorno sintético hasta #107? | Sí |
| D-15 | Número y título del ADR si se acepta | Título inequívoco |

Con cualquier decisión, la política vigente sigue siendo la publicación explícita hasta que se implemente y se verifique lo aceptado.
