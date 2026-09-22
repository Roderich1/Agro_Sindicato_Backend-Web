# Software Requirements Specification — F01

Estos requisitos del sistema derivan de los URS F01 y de la arquitectura aceptada. Definen obligaciones verificables sin congelar prematuramente tablas, DTOs o proveedores. Todos están `BASELINED`, no implementados.

## SRS-IAM-01 — Separación Account/User, Member y Person

- **ID:** `SRS-IAM-01`
- **Title:** Separación conceptual de identidad, pertenencia y persona
- **Statement:** Account/User representa autenticación y cuenta; Member representa pertenencia al Sindicato/tenant y estado/rol organizacional; Person representa información humana sólo cuando el dominio la requiere. Una Person no implica una cuenta y las relaciones familiares privadas Mobile no se centralizan por defecto. No se imponen nombres de tablas.
- **Source:** `URS-SEC-01`; ADR-001; `DEC-F01-01`; issue #8.
- **Related OE:** OE2, OE4
- **Owner:** Central
- **Privacy impact:** Alto; evita centralizar perfiles/relaciones privadas sin finalidad.
- **Implementation phase:** F02, issue #10.
- **Verification target:** REVIEW, CONTRACT, UNIT, SECURITY
- **Status:** `BASELINED`

## SRS-IAM-02 — Autorización derivada del contexto

- **ID:** `SRS-IAM-02`
- **Title:** Tenant, usuario, rol y ownership desde contexto autenticado
- **Statement:** Central debe derivar tenant, usuario, rol y ownership del contexto autenticado y validar cada recurso; IDs enviados por el cliente no sustituyen autorización.
- **Source:** `URS-SEC-01`; ADR-001; `DEC-F01-08`.
- **Related OE:** OE2, OE4, OE5
- **Owner:** Central
- **Privacy impact:** Crítico; controla aislamiento horizontal y multi-tenant.
- **Implementation phase:** F02, issues #12–#14.
- **Verification target:** UNIT, INT, SECURITY
- **Status:** `BASELINED`

## SRS-DEVICE-01 — Identidad lógica del cliente

- **ID:** `SRS-DEVICE-01`
- **Title:** clientId lógico sin fingerprint de hardware
- **Statement:** `clientId` debe identificar lógicamente una instalación/cliente Mobile, nunca IMEI, serial u otro fingerprint de hardware, y asociarse centralmente al contexto autenticado requerido para idempotencia.
- **Source:** `URS-SYNC-01`; `DEC-F01-02`; issue #8.
- **Related OE:** OE2, OE4
- **Owner:** Mobile genera/retiene; Central registra/asocia.
- **Privacy impact:** Alto; identificador seudónimo sujeto a rotación y minimización.
- **Implementation phase:** F02 #11; integración F05.
- **Verification target:** CONTRACT, UNIT, INT, SECURITY, DEVICE
- **Status:** `BASELINED`

## SRS-MOB-01 — Persistencia local y outbox

- **ID:** `SRS-MOB-01`
- **Title:** Persistencia offline-first y outbox atómica
- **Statement:** Mobile debe persistir el dominio individual localmente y conservar en outbox las operaciones proyectables hasta que un ACK autorizado permita retirarlas, incluso entre cierres o fallos de conectividad.
- **Source:** `URS-MOB-01`, `URS-MOB-02`, `URS-MOB-04`; ADR-001.
- **Related OE:** OE3
- **Owner:** Mobile/Flutter
- **Privacy impact:** Alto; el outbox debe proteger datos y no ampliar la whitelist central.
- **Implementation phase:** F05; Mobile #30–#31.
- **Verification target:** UNIT, DEVICE, RECONCILIATION
- **Status:** `BASELINED`

## SRS-SYNC-01 — Contrato versionado y whitelist

- **ID:** `SRS-SYNC-01`
- **Title:** Sincronización versionada de proyecciones permitidas
- **Statement:** Sync debe usar un contrato explícitamente versionado y una whitelist de tipos/campos; no debe replicar SQLite completa y debe admitir evolución paralela compatible.
- **Source:** `URS-SYNC-01`, `URS-PRIV-01`; `DEC-F01-03`, `DEC-F01-07`.
- **Related OE:** OE2, OE4, OE5
- **Owner:** Mobile y Central
- **Privacy impact:** Crítico; limita el cruce de la frontera.
- **Implementation phase:** F05 #16; whitelist exacta F06 #20.
- **Verification target:** REVIEW, CONTRACT, INT, SECURITY
- **Status:** `BASELINED`

## SRS-SYNC-02 — Idempotencia, ACK, retry y conflicto

- **ID:** `SRS-SYNC-02`
- **Title:** Protocolo idempotente y reconciliable
- **Statement:** Sync debe representar `clientId`, identidad lógica de operación, idempotencia, ACK, retry seguro y conflicto/reconciliación. Repetir la misma operación lógica no puede duplicar efectos; un ACK sólo permite retirar la operación local cuando el protocolo lo autoriza. El DTO exacto queda en F05.
- **Source:** `URS-SYNC-01`; `DEC-F01-04`, `DEC-F01-05`.
- **Related OE:** OE2, OE4, OE5
- **Owner:** Mobile y Central
- **Privacy impact:** Alto; snapshots/conflictos deben minimizarse y conservar trazabilidad.
- **Implementation phase:** F05 #16–#18; reconciliación F06 #21.
- **Verification target:** CONTRACT, UNIT, INT, E2E, RECONCILIATION
- **Status:** `BASELINED`

## SRS-COLL-01 — Proyección colectiva mínima

- **ID:** `SRS-COLL-01`
- **Title:** Sólo proyección mínima y autorizada
- **Statement:** Sólo una proyección colectiva mínima, autorizada, con finalidad aprobada y definida por whitelist puede cruzar de Mobile a Central.
- **Source:** `URS-SYNC-01`, `URS-PRIV-01`; ADR-001; `DEC-F01-07`, `DEC-F01-08`.
- **Related OE:** OE2, OE4, OE5
- **Owner:** Mobile y Central
- **Privacy impact:** Crítico; aplica default deny.
- **Implementation phase:** F06 #20; transporte F05.
- **Verification target:** REVIEW, CONTRACT, SECURITY, E2E
- **Status:** `BASELINED`

## SRS-COLL-02 — Semántica de necesidad declarada

- **ID:** `SRS-COLL-02`
- **Title:** Necesidad explícita, contextual y no predictiva
- **Statement:** Declared Need debe nacer como declaración explícita del agricultor y asociarse a campaña, producto y unidad cuando aplique; no es forecasting, predicción, IA ni recomendación.
- **Source:** `URS-MOB-03`; [`CURRENT_SCOPE.md` §8](../scope/CURRENT_SCOPE.md); `DEC-F01-06`.
- **Related OE:** OE3, OE4
- **Owner:** Mobile origina; Central persiste proyección autorizada.
- **Privacy impact:** Medio; requiere finalidad y contexto sin copiar dominio privado.
- **Implementation phase:** F06 #20 y Mobile #34.
- **Verification target:** CONTRACT, UNIT, INT, E2E
- **Status:** `BASELINED`

## SRS-COLL-03 — Consumo colectivo minimizado

- **ID:** `SRS-COLL-03`
- **Title:** Agregación de consumo sólo desde información autorizada
- **Statement:** El consumo colectivo debe derivarse únicamente de información autorizada y mínima; no debe exponer detalle privado cuando un agregado sea suficiente.
- **Source:** `URS-WEB-01`, `URS-PRIV-01`, `URS-REP-01`; ADR-001.
- **Related OE:** OE4, OE5
- **Owner:** Central
- **Privacy impact:** Alto; riesgo de reidentificación por granularidad.
- **Implementation phase:** F06 #20–#21; Mobile #32–#33.
- **Verification target:** CONTRACT, INT, E2E, SECURITY, RECONCILIATION
- **Status:** `BASELINED`

## SRS-WEB-01 — Web Directiva online-first

- **ID:** `SRS-WEB-01`
- **Title:** Web no operativa para agricultor
- **Statement:** Web debe ser online-first para Directiva/Admin, no un segundo cliente operativo del agricultor, y no mantener cola offline de operaciones de negocio.
- **Source:** `URS-WEB-01`; ADR-001, Web responsibilities; [`CAPABILITY_DISPOSITION_MATRIX.md`](../scope/CAPABILITY_DISPOSITION_MATRIX.md).
- **Related OE:** OE4
- **Owner:** Web
- **Privacy impact:** Alto; reduce duplicidad de autoridad y exposición privada.
- **Implementation phase:** F07 #23–#25; coordinación #81.
- **Verification target:** REVIEW, E2E, SECURITY, USABILITY
- **Status:** `BASELINED`

## SRS-JP-01 — Cálculo determinista de necesidad neta

- **ID:** `SRS-JP-01`
- **Title:** Necesidad neta con unidades compatibles
- **Statement:** Cuando exista `declared_stock` compatible, el sistema debe calcular `net_need = max(0, declared_need - declared_stock)` y rechazar o separar unidades incompatibles.
- **Source:** `URS-JP-01`; [`CURRENT_SCOPE.md` §8](../scope/CURRENT_SCOPE.md).
- **Related OE:** OE4
- **Owner:** Central
- **Privacy impact:** Medio; utiliza declaraciones autorizadas, no inventario detallado implícito.
- **Implementation phase:** F07 #26; contrato de datos F06 #20.
- **Verification target:** UNIT, CONTRACT, E2E
- **Status:** `BASELINED`

## SRS-JP-02 — Propuesta sin efectos individuales

- **ID:** `SRS-JP-02`
- **Title:** Consolidación, propuesta y decisión humana
- **Statement:** La compra conjunta debe seguir consolidación → propuesta → revisión humana y no crear automáticamente compra individual, lote, movimiento, deuda ni pago.
- **Source:** `URS-JP-01`; ADR-001; `DEC-F01-11`.
- **Related OE:** OE4
- **Owner:** Central y Web Directiva
- **Privacy impact:** Alto; evita efectos privados no consentidos.
- **Implementation phase:** F07 #27–#28.
- **Verification target:** UNIT, CONTRACT, E2E, REVIEW
- **Status:** `BASELINED`

## SRS-PRIV-01 — Default deny para datos privados

- **ID:** `SRS-PRIV-01`
- **Title:** Exclusión explícita de datos privados
- **Statement:** Por defecto no deben proyectarse ubicación precisa, notas privadas, relaciones familiares, fotografías/facturas, proveedores/precios privados, deudas, pagos, detalle de lotes, movimientos, aplicaciones detalladas, audio/transcripción ni binario de backup.
- **Source:** `URS-PRIV-01`; [`CURRENT_SCOPE.md` §10](../scope/CURRENT_SCOPE.md); `DEC-F01-08`.
- **Related OE:** OE2, OE4, OE5
- **Owner:** Mobile, Central y Web según frontera.
- **Privacy impact:** Crítico; lista mínima de exclusión predeterminada.
- **Implementation phase:** F06 #20; auditoría F10 #45.
- **Verification target:** REVIEW, CONTRACT, SECURITY, E2E
- **Status:** `BASELINED`

## SRS-AUDIT-01 — Auditoría minimizada

- **ID:** `SRS-AUDIT-01`
- **Title:** Trazabilidad sin copiar payload privado
- **Statement:** La auditoría central debe registrar identidad contextual, acción, resultado y referencias necesarias para trazabilidad sin copiar indiscriminadamente payloads privados, secretos o binarios.
- **Source:** `URS-SEC-01`, `URS-PRIV-01`; ADR-001, Central responsibilities.
- **Related OE:** OE4, OE5
- **Owner:** Central
- **Privacy impact:** Alto; logs son una superficie de exposición y retención.
- **Implementation phase:** F06; política y pruebas F10 #44–#45.
- **Verification target:** UNIT, INT, SECURITY, REVIEW
- **Status:** `BASELINED`

## SRS-BKP-01 — Separación Backup/Sync

- **ID:** `SRS-BKP-01`
- **Title:** Contratos y ciclos de vida separados
- **Statement:** Backup y Sync deben operar mediante contratos, almacenamiento, autorización y ciclos de vida separados; el contenido del backup no puede convertirse automáticamente en proyección colectiva.
- **Source:** `URS-BKP-01`; [`CURRENT_SCOPE.md` §7](../scope/CURRENT_SCOPE.md); `DEC-F01-10`.
- **Related OE:** OE2, OE5
- **Owner:** Mobile y servicio Central de backup.
- **Privacy impact:** Crítico; impide reutilización secundaria del contenido privado.
- **Implementation phase:** F09 #37–#40.
- **Verification target:** REVIEW, CONTRACT, SECURITY, BACKUP_RESTORE
- **Status:** `BASELINED`

## SRS-BKP-02 — Backup owner-scoped e íntegro

- **ID:** `SRS-BKP-02`
- **Title:** Recuperación autenticada con integridad verificable
- **Statement:** El backup debe ser owner-scoped y autenticado, y la restauración debe verificar integridad antes de reemplazar estado. Central puede conservar metadata; el provider/binario exacto queda delegado a F09.
- **Source:** `URS-BKP-01`; ADR-001; `DEC-F01-10`.
- **Related OE:** OE2, OE5
- **Owner:** Mobile y servicio Central de backup.
- **Privacy impact:** Crítico; contenido privado cifrado/protegido según diseño F09.
- **Implementation phase:** F09 #37–#40 y Mobile #35–#36.
- **Verification target:** BACKUP_RESTORE, SECURITY, DEVICE, E2E
- **Status:** `BASELINED`

## SRS-VOICE-01 — Voz opcional con confirmación

- **ID:** `SRS-VOICE-01`
- **Title:** Ningún efecto de voz sin preview y confirmación humana
- **Statement:** La captura por voz es opcional y sólo puede generar un draft; la persona debe revisar/editar y confirmar antes de cualquier efecto de negocio.
- **Source:** `URS-VOICE-01`; [`CURRENT_SCOPE.md` §3](../scope/CURRENT_SCOPE.md); ADR-001.
- **Related OE:** OE3
- **Owner:** Mobile/Flutter
- **Privacy impact:** Alto; audio/transcripción no se proyectan por defecto.
- **Implementation phase:** PRE-VOICE/EVO; Mobile issues #10–#17.
- **Verification target:** UNIT, DEVICE, SECURITY, USABILITY
- **Status:** `BASELINED`

## SRS-REP-01 — Reportes desde información autorizada

- **ID:** `SRS-REP-01`
- **Title:** Reportes Web sobre dataset central permitido
- **Statement:** Los reportes Web deben usar exclusivamente información central autorizada y aplicar agregación/minimización cuando el detalle individual no sea necesario.
- **Source:** `URS-REP-01`, `URS-PRIV-01`; ADR-001.
- **Related OE:** OE4, OE5
- **Owner:** Central y Web
- **Privacy impact:** Alto; los filtros/exportaciones pueden reidentificar.
- **Implementation phase:** F07 #28; evaluación F10 #45/#47.
- **Verification target:** CONTRACT, E2E, SECURITY, USABILITY
- **Status:** `BASELINED`

## SRS-TRANS-01 — Transición reversible

- **ID:** `SRS-TRANS-01`
- **Title:** Expand, backfill, switch y contract con rollback
- **Statement:** La transición legacy debe separar expand, backfill, switch y contract, con criterios y rollback; ningún `DROP` ocurre en la misma entrega que introduce el reemplazo.
- **Source:** [`TRANSITION_PLAN.md`](../scope/TRANSITION_PLAN.md); ADR-001; `DEC-F01-12`.
- **Related OE:** OE2, OE4, OE5
- **Owner:** #81 y fases responsables
- **Privacy impact:** Alto; evita pérdida o exposición durante coexistencia/migración.
- **Implementation phase:** #81 cross-cutting; F02/F05/F06/F07/F09; verificación F10.
- **Verification target:** REVIEW, INT, E2E, RECONCILIATION, BACKUP_RESTORE
- **Status:** `BASELINED`
