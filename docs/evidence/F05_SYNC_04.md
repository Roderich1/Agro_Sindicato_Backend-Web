# Evidencia F05-SYNC-04 — contrato técnico para auditoría

Clasificación de entrega: `F05_SYNC_04_CONTRACT_READY_FOR_AUDIT`. Propuesta documental; no contrato implementado, aprobación formal de #16, producción ni PASS de gates. Preflight iniciado el 2026-10-06; entrega el 2026-10-07, America/La_Paz.

## 1. Baselines y preflight

| Control | Observación |
| --- | --- |
| Backend remoto main | `5bcaf3548a0ca31f6271060d5badfa89996f1c25`, exacto tras `git fetch --all --prune`. |
| Mobile remoto main | `278cbd32dc59b26824f59fcefb77bebbc3cecb95`, exacto; sólo lectura, sin checkout/fetch/edición del working copy Mobile. |
| Worktree | Nuevo y limpio desde el SHA Backend; branch `docs/f05-sync-04-versioned-push-ack`. Cambios previos de otros worktrees conservados. |
| #16 | OPEN, siete checkboxes sin marcar; no se edita su body ni se cierra. |
| Lectura remota completa | #16, #17, #18, #19, #20, #81; complementos #21/#22 y [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#30](https://github.com/Roderich1/AppMovilAgroquimico/issues/30)/[Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31). Snapshots externos conservados antes de mutar Project. |
| #20 / contrato F06 | CLOSED/completed, 7/7; [cierre formal](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/20#issuecomment-6028210379), [PR #98 merged](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/pull/98). Los tres documentos F06 integrados son historia documental intacta; su antigua etiqueta de propuesta se interpreta con esa aceptación posterior. |
| #81 | OPEN/Blocked; F01/F02/F06 aceptados, F05 #16 aún sin marcar. No se modifica body, comentarios ni campos de #81. |
| Gates | #19 GATE-F05 y #22 GATE-F06 OPEN/Pending; intactos. |

Antes de publicar se revalidan las referencias exactas Backend/Mobile. Si Backend main difiere, detener con `F05_SYNC_04_BASELINE_CHANGED`; no rebasar a otra base para simular cumplimiento. HEAD final y PR draft se registran en metadata/comentario de #16, evitando un SHA autorreferencial dentro de este commit.

## 2. Auditoría del Sync legacy

Lectura estática, **sin ejecutar tests ni requests de negocio**. Código histórico no es requisito académico ni evidencia de protocolo aprobado.

| Hallazgo | Fuente exacta / impacto |
| --- | --- |
| Controller/rutas | `Back/src/modules/sync/api/rest/sync.controller.ts`: Controller sync, POST/GET operations, Agricultor para ambos. `Back/src/main.ts` aplica prefijo api/v1: ruta real `/api/v1/sync/operations`, el shorthand de alcance `/sync/operations` es relativo. |
| DTO/batch | `Back/src/modules/sync/application/dto/sync-operations.dto.ts`: clientId string libre de hasta 120, operations array, clientOperationId string hasta 120, enum de nueve operaciones, payload Record<string,unknown>. Sin contractVersion/causal/operationId v4 target. |
| Tipos actuales | INITIAL_STOCK, PLOT_CREATE, PLOT_UPDATE, PLOT_DEACTIVATE, PLOT_CROP_ASSIGN, STOCK_ENTRY, STOCK_EXIT, AGROCHEMICAL_APPLICATION, PAYMENT_CREATE. **LEGACY**, excluidos de v1. |
| Idempotencia actual | `sync-operations.use-case.ts`: lookup tenantId/userId/clientId/entityId(clientOperationId); createPendingOperation y recuperación de P2002; Prisma unique `(tenantId,userId,clientId,entityId)`. No comparación de contenido canónico del retry; duplicate devuelve estado existente incluso si PENDIENTE. Cambio de cliente altera la clave legacy. |
| Persistencia/atomicidad | Use case crea SyncOperation PENDIENTE con payload/campaignId, llama a use case de dominio y luego actualiza APLICADA/appliedAt. Son pasos separados; no existe una transacción común de proyección target + resultado/idempotencia. Los casos de crash/concurrencia no se presentan como resueltos por esa implementación. |
| Conflicts | En errores de negocio 400/404/409 persiste CONFLICTO y SyncConflict.clientSnapshot con payload; serverSnapshot con mensaje/contexto. GET devuelve snapshots. No hay causal v1 ni resolución mínima owner-scoped del contrato propuesto. |
| Logging | Controller loguea userId/tenantId/raw clientId/count. Use case conserva errorMessage y snapshots; `Back/src/bootstrap/http-exception-logging.filter.ts` registra URL/IP/mensaje de excepción. Target exige códigos/contexto mínimos y evitar copiar cuerpos/valores a logs/filtros. No se modifica logging aquí. |
| Dependencias privadas | `Back/src/modules/sync/sync.module.ts`: InventoryModule, PlotsModule, ApplicationsModule, AccountsPayableModule. Dispatcher llama esos dominios; target no usa sus efectos privados para aceptar proyecciones. |
| Consumers Web | `Web/src/services/sync.service.ts`, `types/sync.ts`, `pages/sync.page.tsx`, `lib/offline-queue.ts`; servicio GET/POST legado, cola localStorage y retirada por status APLICADA. Lectura de service/types/queue y [inventario legacy](../scope/LEGACY_CONTRACT_CONSUMERS.md). No se reutiliza como outbox Mobile ni se amplía la Web operativa. |
| Prisma | `Back/prisma/schema.prisma`: todos los campos SyncOperation/SyncConflict se clasifican en §13 del contrato; AuthSession/Member/ClientRegistration son autoridad de contexto, no campos Mobile libres. No hay tablas/cambios físicos propuestos en esta entrega. |
| IAM actual | `Back/src/modules/iam/application/types/authenticated-principal.type.ts`, `jwt-payload.type.ts`, `services/current-auth-context.resolver.ts`: principal incluye Member/contexto y registro de sesión; F02 revalida DB. TokenVersion/ver Auth no son versión wire Sync; sesión sin registro enlazado no cumple la precondición nueva de v1. |

Diferencias con target son deuda de transición #81, no contradicción que obligue a versionar payloads privados como v1. El título/tuple histórico de #17 no congela clientId como parte de la nueva clave: #16 define tenant/Member/operationId y conserva validación/registro del cliente como contexto, conforme al handoff F01/F02. No se cambia wording de #17 ni decisiones baselined.

## 3. Fuentes autoritativas y audit de frontera

| Fuente obligatoria | Decisión derivada |
| --- | --- |
| [SRS](../requirements/SRS.md) | SRS-MOB-01 outbox hasta ACK; SRS-SYNC-01/02 versión/whitelist/idempotencia/retry/conflicto; SRS-DEVICE-01 identidad lógica; SRS-IAM-02 contexto; SRS-COLL-01/SRS-PRIV-01/SRS-AUDIT-01 minimización. |
| [URS](../requirements/URS.md) | URS-MOB-04 continuidad local; URS-SYNC-01 no duplicación; URS-PRIV-01 y URS-SEC-01 finalidad/ownership. |
| [F01_INTEGRATION_DECISIONS](../architecture/F01_INTEGRATION_DECISIONS.md) | DEC-F01-02–05 versión, cliente contextual, ACK/idempotencia y autoridad de conflicto; DEC-F01-07–10 privacidad/retención/backup; DEC-F01-12 coexistencia/rollback. |
| [F06 contract](../architecture/F06_COLLECTIVE_PROJECTION_CONTRACT.md) | INPUT_FOR_F05_SYNC_04: dos tipos, cuatro campos, CANCEL sin cantidad, propiedad/referencias, causalidad, revocación, retención y casos de pérdida/concurrencia. |
| [F06 field matrix](../architecture/F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md) | 126 filas/22 columnas; ALLOW 8, DENY 118, CONDITIONAL 0. Negativas relevantes examinadas; no se amplía whitelist. |
| [F06 evidence](F06_COLL_01.md) | IDs locales, personas privadas y productor de necesidad aún no observado en Mobile baseline; código legacy no basta para autorizar envío. Evidencia histórica, no pruebas ejecutadas de v1. |
| [CURRENT_SCOPE](../scope/CURRENT_SCOPE.md) / [DATA_BOUNDARY](../scope/DATA_BOUNDARY_MATRIX.md) | Mobile SoR individual, referencias centrales, Web Directiva; PROPOSED/TBD no permite campos; stock condicional no se incluye. |
| [LEGACY_CONTRACT_CONSUMERS](../scope/LEGACY_CONTRACT_CONSUMERS.md) / [TRANSITION_PLAN](../scope/TRANSITION_PLAN.md) | Inventario de lectores/escritores, paralelo/cutover, reconciliación y retención antes de contract/remove; rollback conserva outbox e identidades. |

Lectura Mobile al SHA exacto reutiliza la frontera auditada en F06 y verifica sólo fuentes necesarias para v1: `lib/data/app_database.dart`, `agro_repository.dart`, `installation_client_id_store.dart`, `lib/domain/money.dart`, `lib/services/auth/auth_v2_models.dart`, `secure_session_store.dart`. IDs locales no se globalizan por conveniencia. Client lógico F02 separado de SQLite/backup, tokens en store seguro, cantidades base enteras L/KG→ML/G. No se modifican ni inspeccionan datos privados reales.

Referencias técnicas primarias verificadas: [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.4) UUID v4; [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259.html#section-4) JSON; [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) HTTP/Retry-After; [SQLite datatypes](https://www.sqlite.org/datatype3.html) enteros. No son requisitos funcionales nuevos; fundamentan representación/interop técnica.

## 4. Trazabilidad de decisiones target

| Decisión | OE → URS | SRS / DEC | Fuente de existencia/frontera | Consumidor / implementación |
| --- | --- | --- | --- | --- |
| SYNC-V1-01: ruta v1 + contractVersion 1; coexistencia | OE2/OE4/OE5 → URS-SYNC-01 | SRS-SYNC-01; DEC-F01-03/12 | main.ts prefijo; TRANSITION_PLAN | #17; clientes [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#30](https://github.com/Roderich1/AppMovilAgroquimico/issues/30)/[Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31). |
| SYNC-V1-02: tenant/Member/registro desde sesión | OE2/OE4/OE5 → URS-SEC-01 | SRS-IAM-02/SRS-DEVICE-01; DEC-F01-02/08 | Principal/resolver F02; AuthSession/ClientRegistration | #17/#18; F10 #44. |
| SYNC-V1-03: UUID v4, clave tenant/Member/operationId, fingerprint mínimo | OE2/OE4/OE5 → URS-SYNC-01/PRIV-01 | SRS-SYNC-02/SRS-AUDIT-01; DEC-F01-04/07/08 | F06 contribución distinta de identidad técnica; unique legacy no target | #17 atomicidad/seguridad; Mobile outbox; #18 mismatch/concurrencia. |
| SYNC-V1-04: antecesor aceptado/fork/fences/resolución explícita | OE2/OE4/OE5 → URS-SYNC-01/PRIV-01 | SRS-SYNC-02/SRS-COLL-01; DEC-F01-05 | F06 §6 sin LWW universal/ancestro reactivado | #17/#18; #21 exclusión de controvertido/cancelado. |
| SYNC-V1-05: payload exacto y cantidad decimal wire int64 | OE4/OE5 → URS-WEB-01/REP-01/PRIV-01; OE3/OE4 → URS-MOB-03 | SRS-COLL-01/02/03/SRS-SYNC-01; DEC-F01-06/07 | F06 delega codificación/límites a F05; Mobile money/SQLite; catálogos centrales | #17; Mobile bindings/outbox; #21 agregación exacta. |
| SYNC-V1-06: ACK/disposition, consulta mínima, commit antes de respuesta | OE2/OE4/OE5 → URS-SYNC-01; OE3 → URS-MOB-04 | SRS-SYNC-02/SRS-MOB-01; DEC-F01-04/05 | Legacy pending/apply/update separados; F06 casos de ACK perdido | #17/#18; [Roderich1/AppMovilAgroquimico#30](https://github.com/Roderich1/AppMovilAgroquimico/issues/30)/[Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31). |
| SYNC-V1-07: one-operation, retry/jitter/Retry-After/refresh | OE2/OE4/OE5 → URS-SYNC-01; OE3 → URS-MOB-04 | SRS-SYNC-02/SRS-MOB-01; DEC-F01-04 | Matriz adversarial; no batch heredado ni número arbitrario de días | #18; worker [Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31). |
| SYNC-V1-08: mínima metadata, sin bodies/backup, garantía replay antes de purga | OE2/OE4/OE5 → URS-PRIV-01/SEC-01; OE2/OE5 → URS-BKP-01 | SRS-PRIV-01/SRS-AUDIT-01/SRS-BKP-01/02; DEC-F01-08/09/10 | F06 R_CURRENT/R_CAUSAL/R_AUDIT; negativos legacy snapshots/logging | #17; #18; F10 #45/F09 #40; #81 retiro posterior. |

Los URS abreviados con prefijo común remiten a los IDs completos de URS. Follow-ups Mobile no son issues Backend; los destinos reales se verificaron por API y aparecen cualificados en §6.

## 5. Decisiones difíciles y límites explícitos

- **Concurrencia online:** no se puede anticipar un sucesor aún no recibido. Un receipt APPLIED permanece histórico; un fork detectado después bloquea el valor colectivo como CONTESTED, sin convertir llegada en vencedor final ni guardar cantidades antiguas para rollback. GET separa receipt y estado. El propietario resuelve con nueva intención y referencia causal opaca vigente; se prueban ambos órdenes y fork tardío en #18. Es precisión técnica de conflicto F06, no ampliar campos de negocio.
- **Cancelación:** replay de un APPLIED antiguo nunca toca el tombstone; sucesor atrasado recibe conflicto sin reactivar. Re-publicar necesita una decisión nueva contra el CANCEL aceptado. Referencias/fences no autorizan acceder por UUID.
- **Admisión:** campos privados/sintaxis fuera de esquema dan error de request seguro, sin journal/fingerprint de valores prohibidos. ACK final de dominio sólo para operación admitida. Un rechazo de mutación de ID no reemplaza el resultado original.
- **Cantidad:** entero de dominio se serializa como decimal string exacta y se acota a int64; no son nuevo campo o cálculo privado. Límites de request/backoff son decisiones operativas futuras, no periodos de retención inventados.
- **Retención:** PERIOD_DELEGATED. UUID v4 no permite fechar intenciones; purgar y después aceptar cualquier ID desconocido como nuevo no es seguro. Antes de producción/purga, #17/F10 #45 deben demostrar fences/garantía de admisión del horizonte; mientras no exista, no purgar metadata causal. No usar historial de payloads como solución.
- **Productores:** el contrato no acredita bindings/ownership/outbox ni necesidad explícita implementados. F06 precondiciones siguen fallando cerradas; Auth versión y Sync versión son namespaces independientes.
- **Gobierno:** #16 sigue OPEN/unchecked; #19/#22 Pending y #81 Blocked. Nada de implementación runtime, tests ejecutados, merge o retiro legacy en esta entrega.

## 6. Handoffs con identidad remota verificada

| Issue | Título real / entrega |
| --- | --- |
| [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29) | F05-SYNC-01 Introducir IDs globales sólo donde la sincronización los requiere: campaign/product refs y operationId; no todos los IDs SQLite. |
| [Roderich1/AppMovilAgroquimico#30](https://github.com/Roderich1/AppMovilAgroquimico/issues/30) | F05-SYNC-02 Implementar outbox SQLite atómica: intención/propietario/recibo/estado durable; ningún token. |
| [Roderich1/AppMovilAgroquimico#31](https://github.com/Roderich1/AppMovilAgroquimico/issues/31) | F05-SYNC-03 Worker de retry/backoff y estados de sincronización: disposition, misma intención, consulta/ref, pausa auth/conflicto. |
| Backend #17 | Persistencia/atomicidad/idempotencia/causalidad y consulta target. |
| Backend #18 | Ejecutar 40 escenarios del contrato/matriz; demostrar effect_count ≤1 y aceptación =1; no resultados falsos aquí. |
| Backend #21 | Reconciliación de una contribución autorizada vigente; nunca réplica de SQLite. |

## 7. Validación documental y publicación

Entrega exacta de tres archivos nuevos, sin editar documentos F01/F02/F06 ni fuentes existentes:

1. `docs/architecture/F05_SYNC_V1_PUSH_ACK_CONTRACT.md`
2. `docs/architecture/F05_SYNC_V1_RETRY_IDEMPOTENCY_MATRIX.md`
3. `docs/evidence/F05_SYNC_04.md`

Controles requeridos: `git diff --check`/status; scope exacto; UTF-8 y enlaces locales/cross-repo; ejemplos JSON parseables con campos/UUIDs sintéticos correctos; matriz 40 filas/11 columnas sin celdas vacías; consistencia de códigos/outcomes/dispositions y preservación del contrato/matriz F06 8/118/0. Registro detallado externo, sin introducir un cuarto artefacto repo.

No guard documental dedicado aplicable localizado. Workflow `.github/workflows/backend-f02.yml` tiene filtros Back/API/security/testing/F02 evidence; estos tres Markdown F05 no lo activan. Si SonarCloud se ejecuta, registrar su ID/HEAD/conclusión como calidad/regresión documental, **no prueba del protocolo**. No ejecutar app tests, build, Prisma, migraciones, DB ni E2E.

```text
NO_CODE_CHANGES
NO_PRISMA_CHANGES
NO_MIGRATIONS
NO_DATA_CHANGES
NO_MOBILE_CHANGES
```

PR draft, base main, un commit preferido, título `F05-SYNC-04: define versioned push/ACK contract (#16)`. Cuando esté listo se publica el comentario autorizado `F05_SYNC_04_READY_FOR_INDEPENDENT_AUDIT` con PR/HEAD/baselines/rutas/clave/ACK y no implementación. No cerrar ni marcar #16; Project Backlog → In Progress → In Review/Evidence Partial, Gate actual N/A conservado. No Done/Verified ni merge.

## Impact on ALIGN-TECH-01 #81

El último bloqueador contractual tiene una definición candidata, no aceptación. Sólo auditoría independiente + merge + aceptación formal de #16 permiten evaluar su desbloqueo. Criterios/campos/comments de #81 siguen intactos: OPEN/Blocked, Evidence Pending, Gate N/A. La sección del contrato distingue lo reemplazable del trabajo todavía requerido de #17/#18/Mobile/#21/retención/cutover; no se ejecuta ese plan.

Siguiente acción: `INDEPENDENT_AUDIT_F05_SYNC_04`.
