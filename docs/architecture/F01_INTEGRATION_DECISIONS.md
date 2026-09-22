# Decisiones de integración F01

Este registro complementa ADR-001 `ACCEPTED`. Congela decisiones arquitectónicas necesarias para evaluar #8, sin definir schema, DTOs, APIs ni proveedores finales y sin iniciar #81.

## DEC-F01-01 — Account/User, Member y Person

- **Decision ID:** `DEC-F01-01`
- **Problem:** Identidad/autenticación, pertenencia organizacional e información humana estaban mezcladas conceptualmente.
- **Decision:** Account/User representa autenticación/cuenta; Member representa pertenencia al Sindicato/tenant y estado/rol organizacional; Person representa una persona sólo cuando el dominio la requiere. Una Person no implica cuenta. Relaciones familiares privadas Mobile no se centralizan por defecto.
- **Rationale:** Separa seguridad, membresía y dominio humano, y evita copiar relaciones privadas sin finalidad.
- **Delegated details:** Mapping físico Prisma, cardinalidades, lifecycle y migración.
- **Responsible phase/issues:** F02, Backend #10 y #14.
- **Verification before implementation:** Modelo conceptual revisado; reglas de ownership y migración reversible aprobadas.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-02 — Device/clientId

- **Decision ID:** `DEC-F01-02`
- **Problem:** Se necesita identidad estable para idempotencia sin depender de identificadores sensibles de hardware.
- **Decision:** `clientId` es un identificador lógico de cliente/instalación Mobile, no IMEI, serial ni fingerprint. Se combina con contexto autenticado para idempotencia.
- **Rationale:** Permite reintentos y rotación sin seguimiento de hardware.
- **Delegated details:** Generación, registro, rotación, revocación, recuperación y asociación exacta.
- **Responsible phase/issues:** F02 #11; uso protocolar F05 #16–#17.
- **Verification before implementation:** Threat model, contrato de registro y casos de reinstalación/cambio de dispositivo revisados.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-03 — Versionado de Sync

- **Decision ID:** `DEC-F01-03`
- **Problem:** Un contrato implícito impide evolucionar Mobile y Central de forma segura.
- **Decision:** El contrato de Sync debe ser explícitamente versionado y soportar versiones paralelas durante transición.
- **Rationale:** Evita big-bang y permite rollback/compatibilidad temporal.
- **Delegated details:** Versión inicial, envelope, DTOs, compatibilidad y deprecación.
- **Responsible phase/issues:** F05 #16; coordinación #81.
- **Verification before implementation:** Contract review, matriz de compatibilidad y rollback aprobados.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-04 — Idempotencia, ACK y retry

- **Decision ID:** `DEC-F01-04`
- **Problem:** Reintentos por timeout pueden duplicar efectos de negocio o retirar operaciones antes de confirmación.
- **Decision:** Repetir una misma operación lógica no produce efectos duplicados. Su identidad considera como mínimo el contexto tenant/user/client/operation definido por F02/F05. ACK expresa resultado del servidor y sólo autoriza retirar la operación local según protocolo.
- **Rationale:** Garantiza retry seguro y trazabilidad de aceptación/rechazo.
- **Delegated details:** Formato de operationId, estados ACK, ventanas, códigos y política de retry/backoff.
- **Responsible phase/issues:** F05 #16–#18 y GATE-F05 #19.
- **Verification before implementation:** Casos duplicate/timeout/500/refresh/reorder definidos como contract tests.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-05 — Conflictos y reconciliación

- **Decision ID:** `DEC-F01-05`
- **Problem:** Last-write-wins indiscriminado puede perder información o ocultar divergencias.
- **Decision:** Cada tipo proyectado define estrategia explícita; no se adopta last-write-wins universal. Conflictos no resueltos conservan trazabilidad y permanecen reconciliables.
- **Rationale:** Las reglas dependen de semántica, autoridad y sensibilidad del dato.
- **Delegated details:** Estrategia por tipo, snapshots mínimos, UX y resolución automatizable/manual.
- **Responsible phase/issues:** F05 #18; F06 #20–#21; Mobile #31.
- **Verification before implementation:** Catálogo de conflictos, autoridad por campo y dataset de reconciliación aprobados.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-06 — Declared Need

- **Decision ID:** `DEC-F01-06`
- **Problem:** La necesidad del agricultor podía confundirse con forecasting o recomendación.
- **Decision:** Declared Need es una declaración explícita originada por el agricultor; no se infiere, no es forecasting, predicción, IA ni recomendación.
- **Rationale:** Mantiene intención humana y alcance académico vigente.
- **Delegated details:** Shape exacta, unidades, actualización/cancelación, historial y consentimiento.
- **Responsible phase/issues:** F06 #20; Mobile #34; cálculo F07 #26.
- **Verification before implementation:** Contextos campaña/producto/unidad y reglas de consentimiento aprobados.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-07 — Frontera de proyección

- **Decision ID:** `DEC-F01-07`
- **Problem:** Replicar el dominio SQLite completo centralizaría información privada innecesaria.
- **Decision:** La proyección se rige por whitelist y minimización; no replica SQLite completa.
- **Rationale:** Central sólo necesita datos para finalidades colectivas aprobadas.
- **Delegated details:** Whitelist exacta de campos/tipos, granularidad y transformaciones.
- **Responsible phase/issues:** F06 #20; transporte F05 #16; coordinación #81.
- **Verification before implementation:** Data/privacy review y contrato de proyección aprobados.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-08 — Privacidad y autorización

- **Decision ID:** `DEC-F01-08`
- **Problem:** La mera existencia de datos legacy no autoriza su exposición o uso colectivo.
- **Decision:** Se aplica default deny. Toda proyección requiere finalidad colectiva aprobada y autorización aplicable; F01 no inventa un mecanismo legal nuevo.
- **Rationale:** Aplica minimización y separa disponibilidad técnica de legitimidad de acceso.
- **Delegated details:** Consentimiento/autorización exactos, revocación, evidencia y claims.
- **Responsible phase/issues:** F06 #20; F02 #12; evaluación F10 #44–#45.
- **Verification before implementation:** Privacy review, matriz actor/recurso/acción y negative tests definidos.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-09 — Retención

- **Decision ID:** `DEC-F01-09`
- **Problem:** Fijar plazos arbitrarios sin finalidad, riesgo y obligaciones validadas produciría una política falsa.
- **Decision:** Cada clase de datos debe tener política explícita de retención antes de producción o retiro; F01 no fija períodos numéricos sin fundamento.
- **Rationale:** Convierte el vacío en obligación gobernada y evita números inventados.
- **Delegated details:** Duración, evento inicial, archivo, borrado, excepción legal y evidencia por clase.
- **Responsible phase/issues:** Proyección F06 #20; backup F09 #40; evaluación F10 #45.
- **Verification before implementation:** Política por clase aprobada y procedimientos de export/delete/rollback probados antes de contract/removal.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-10 — Almacenamiento de Backup

- **Decision ID:** `DEC-F01-10`
- **Problem:** Confundir backup con Sync expondría el binario privado como dataset colectivo.
- **Decision:** Sync y Backup son distintos. Central conserva metadata; el contenido privado es owner-scoped y usa una abstracción de almacenamiento dedicada. No alimenta automáticamente proyecciones.
- **Rationale:** Separa recuperación privada de colaboración y permite cambiar provider.
- **Delegated details:** Provider, cifrado, URL/streaming, checksums, lifecycle y costos.
- **Responsible phase/issues:** F09 #37–#40 y Mobile #35–#36.
- **Verification before implementation:** Threat model, provider decision, integridad y restore end-to-end definidos.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-11 — Compra colectiva

- **Decision ID:** `DEC-F01-11`
- **Problem:** El legacy puede crear efectos individuales durante una compra conjunta.
- **Decision:** El flujo target es proposal-first y decisión humana. Una propuesta no crea automáticamente compra individual, lote, movimiento, deuda ni pago.
- **Rationale:** Separa planificación colectiva de ejecución privada y consentimiento.
- **Delegated details:** Estados de propuesta, edición/aprobación, exportación y eventual handoff.
- **Responsible phase/issues:** F07 #26–#28; coordinación #81.
- **Verification before implementation:** State machine y pruebas de ausencia de efectos individuales aprobadas.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## DEC-F01-12 — Transición legacy

- **Decision ID:** `DEC-F01-12`
- **Problem:** Retirar contratos/tablas junto al reemplazo impide rollback y puede perder datos.
- **Decision:** La transición sigue expand → backfill → switch → contract con rollback. Ninguna migración destructiva acompaña la entrega que introduce el reemplazo.
- **Rationale:** Mantiene coexistencia verificable y retirada condicionada por evidencia.
- **Delegated details:** Secuencia por capacidad, flags, backfill, métricas, retención y runbooks.
- **Responsible phase/issues:** #81; F02/F05/F06/F07/F09; validación F10.
- **Verification before implementation:** Consumidores inventariados, rollback probado, reconciliación y criterios de contract aprobados.
- **Status:** `FROZEN_AT_ARCHITECTURE_LEVEL`

## Disposición de los antiguos vacíos de integración

| Tema | Disposición | Decisión F01 | Detalle delegado | Fase/issues | Precondición |
|---|---|---|---|---|---|
| Account/User/Member/Person | RESOLVED_F01 | Separación conceptual congelada | Mapping Prisma/lifecycle | F02 #10/#14 | Modelo y migración revisados |
| Device/clientId | DELEGATED_DETAIL | Identidad lógica, no hardware, ligada al contexto | Registro/rotación/recuperación | F02 #11; F05 #16/#17 | Threat model y contrato |
| Sync version | DELEGATED_DETAIL | Versionado explícito y coexistencia | Envelope/DTO/version inicial | F05 #16 | Contract review y rollback |
| Idempotencia/ACK/retry | DELEGATED_DETAIL | No duplicación y retiro sólo por ACK autorizado | Keys, estados y retry | F05 #16–#18 | Suite adversarial definida |
| Conflictos/reconciliación | DELEGATED_DETAIL | Estrategia por tipo; no LWW universal | Reglas/UX/snapshots | F05 #18; F06 #21 | Autoridad y dataset aprobados |
| Declared Need | RESOLVED_F01 | Declaración explícita, no IA/predicción | DTO, unidades e historial | F06 #20; Mobile #34 | Contrato y consentimiento |
| Projection boundary | DELEGATED_DETAIL | Whitelist y minimización, no réplica total | Campos/granularidad | F06 #20 | Privacy/data review |
| Privacy/authorization | DELEGATED_DETAIL | Default deny y finalidad aprobada | Mecanismo exacto | F02 #12; F06 #20 | Matriz de autorización |
| Retention | DELEGATED_DETAIL | Política obligatoria por clase, sin plazos inventados | Períodos y eventos concretos | F06 #20; F09 #40; F10 #45 | Política aprobada antes de producción/retiro |
| Backup storage | DELEGATED_DETAIL | Storage separado, owner-scoped, metadata central | Provider/cifrado/lifecycle | F09 #37–#40 | Restore e integridad definidos |
| Collective Purchase | RESOLVED_F01 | Proposal-first, revisión humana, sin efectos automáticos | State machine/handoff | F07 #26–#28 | Pruebas de ausencia de efectos |
| Legacy transition | DELEGATED_DETAIL | Expand/backfill/switch/contract con rollback | Plan por capacidad | #81 + fases responsables | Consumidores, backup y reconciliación |

`DELEGATED_DETAIL` no equivale a omisión: F01 fija la regla, identifica el aspecto delegado, asigna responsables y exige una precondición verificable.
