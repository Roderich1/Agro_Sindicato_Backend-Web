# User Requirements Specification — F01

Estos IDs fueron creados como identificadores de ingeniería de F01 a partir de la baseline vigente. Todos están `BASELINED`; ninguno acredita implementación.

## URS-MOB-01 — Gestión individual en contexto de campaña

- **ID:** `URS-MOB-01`
- **Title:** Gestión individual en contexto de campaña
- **Statement:** El agricultor debe poder organizar su gestión individual de agroquímicos dentro del contexto de campaña aplicable desde Mobile.
- **Source:** [`CURRENT_SCOPE.md` §§2–3](../scope/CURRENT_SCOPE.md); ADR-001, Mobile responsibilities.
- **Related OE:** OE3
- **Owner:** Mobile/Flutter
- **Privacy impact:** Alto; el detalle individual permanece local salvo proyección aprobada.
- **Implementation phase:** F04 y dominio Mobile vigente.
- **Verification target:** REVIEW, UNIT, DEVICE
- **Status:** `BASELINED`

## URS-MOB-02 — Operaciones individuales de agroquímicos

- **ID:** `URS-MOB-02`
- **Title:** Inventario, compras, transferencias y aplicaciones individuales
- **Statement:** El agricultor gestiona desde Mobile el inventario/stock, compras, transferencias y aplicaciones dentro del contexto de campaña. Lotes y movimientos, si se utilizan, son detalles de implementación y no requisitos funcionales independientes.
- **Source:** [`CURRENT_SCOPE.md` §3](../scope/CURRENT_SCOPE.md); [`CAPABILITY_DISPOSITION_MATRIX.md`](../scope/CAPABILITY_DISPOSITION_MATRIX.md).
- **Related OE:** OE3
- **Owner:** Mobile/Flutter
- **Privacy impact:** Alto; el detalle operativo individual no se proyecta por defecto.
- **Implementation phase:** Dominio Mobile vigente; realineación coordinada por #81.
- **Verification target:** UNIT, INT, DEVICE
- **Status:** `BASELINED`

## URS-MOB-03 — Necesidad declarada

- **ID:** `URS-MOB-03`
- **Title:** Declaración explícita de necesidad por agricultor y campaña
- **Statement:** El agricultor debe poder registrar explícitamente su necesidad de producto en el contexto de campaña y unidad aplicable; la declaración no debe inferirse como predicción o recomendación.
- **Source:** [`CURRENT_SCOPE.md` §8](../scope/CURRENT_SCOPE.md); [`DATA_BOUNDARY_MATRIX.md`](../scope/DATA_BOUNDARY_MATRIX.md).
- **Related OE:** OE3, OE4
- **Owner:** Mobile origina; Central recibe sólo proyección autorizada.
- **Privacy impact:** Medio; cruza la frontera únicamente con finalidad y autorización aplicables. Consentimiento formal sólo si lo exige un requisito aprobado.
- **Implementation phase:** F06; Mobile issue `Roderich1/AppMovilAgroquimico#34`.
- **Verification target:** CONTRACT, INT, E2E
- **Status:** `BASELINED`

## URS-MOB-04 — Operación con conectividad intermitente

- **ID:** `URS-MOB-04`
- **Title:** Persistencia local y conservación de operaciones pendientes
- **Statement:** El agricultor debe poder continuar la operación individual local ante conectividad intermitente y conservar de forma recuperable las operaciones pendientes de sincronización.
- **Source:** [`CURRENT_SCOPE.md` §§3,6](../scope/CURRENT_SCOPE.md); ADR-001, Sync boundary.
- **Related OE:** OE3
- **Owner:** Mobile/Flutter
- **Privacy impact:** Alto; el outbox puede contener datos privados y requiere minimización al proyectar.
- **Implementation phase:** F05; Mobile issues #29–#31.
- **Verification target:** UNIT, DEVICE, RECONCILIATION
- **Status:** `BASELINED`

## URS-SYNC-01 — Sincronización autorizada y segura

- **ID:** `URS-SYNC-01`
- **Title:** Sincronización segura al recuperar conectividad
- **Statement:** Al recuperar conectividad, Mobile debe poder sincronizar información autorizada con Central sin duplicar efectos y con resultado trazable.
- **Source:** [`CURRENT_SCOPE.md` §6](../scope/CURRENT_SCOPE.md); ADR-001; [`TRANSITION_PLAN.md`](../scope/TRANSITION_PLAN.md).
- **Related OE:** OE2, OE4, OE5
- **Owner:** Mobile y Central
- **Privacy impact:** Crítico; sólo puede transmitirse una whitelist mínima autorizada.
- **Implementation phase:** F05; Backend issues #16–#18 y Mobile issues #29–#31.
- **Verification target:** CONTRACT, INT, E2E, SECURITY, RECONCILIATION
- **Status:** `BASELINED`

## URS-WEB-01 — Consulta colectiva para Directiva/Admin

- **ID:** `URS-WEB-01`
- **Title:** Consulta Web de información colectiva autorizada
- **Statement:** Directiva/Admin debe consultar campañas, agricultores vinculados, consumo autorizado, necesidades consolidadas y estado de sincronización mediante una Web online-first.
- **Source:** [`CURRENT_SCOPE.md` §5](../scope/CURRENT_SCOPE.md); ADR-001, Web responsibilities.
- **Related OE:** OE4
- **Owner:** Web Directiva/Admin y Central
- **Privacy impact:** Alto; las vistas deben impedir exposición de detalle privado innecesario.
- **Implementation phase:** F07; issues #23–#25.
- **Verification target:** REVIEW, CONTRACT, E2E, SECURITY, USABILITY
- **Status:** `BASELINED`

## URS-JP-01 — Planificación colectiva de compra

- **ID:** `URS-JP-01`
- **Title:** Propuesta de compra basada en necesidades declaradas
- **Statement:** Directiva debe poder preparar una propuesta colectiva determinista a partir de información autorizada y necesidades declaradas, someterla a revisión humana y decidir sin efectos individuales automáticos.
- **Source:** [`CURRENT_SCOPE.md` §9](../scope/CURRENT_SCOPE.md); ADR-001; issue #80.
- **Related OE:** OE4
- **Owner:** Central y Web Directiva
- **Privacy impact:** Alto; la consolidación debe minimizar y evitar reidentificación innecesaria.
- **Implementation phase:** F07; issues #26–#28.
- **Verification target:** UNIT, CONTRACT, E2E, REVIEW
- **Status:** `BASELINED`

## URS-PRIV-01 — Privacidad por defecto

- **ID:** `URS-PRIV-01`
- **Title:** Exclusión predeterminada de información privada
- **Statement:** La información privada del agricultor no debe formar parte de la proyección colectiva por defecto; cada inclusión requiere finalidad y autorización aplicables.
- **Source:** [`CURRENT_SCOPE.md` §10](../scope/CURRENT_SCOPE.md); ADR-001, Privacy boundary; [`DATA_BOUNDARY_MATRIX.md`](../scope/DATA_BOUNDARY_MATRIX.md).
- **Related OE:** OE2, OE4, OE5
- **Owner:** Mobile, Central y Web según frontera.
- **Privacy impact:** Crítico; requisito de minimización y default deny.
- **Implementation phase:** F06; evaluación F10 issues #44–#45.
- **Verification target:** REVIEW, CONTRACT, SECURITY, E2E
- **Status:** `BASELINED`

## URS-BKP-01 — Recuperación privada autenticada

- **ID:** `URS-BKP-01`
- **Title:** Recuperación owner-scoped después de pérdida o cambio de dispositivo
- **Statement:** El propietario debe poder recuperar su información privada mediante un mecanismo autenticado, verificable y separado de la sincronización colectiva.
- **Source:** [`CURRENT_SCOPE.md` §7](../scope/CURRENT_SCOPE.md); ADR-001, Backup boundary.
- **Related OE:** OE2, OE5
- **Owner:** Mobile y servicio de recuperación privada; ubicación física y metadata exacta delegadas a F09.
- **Privacy impact:** Crítico; el binario es privado y owner-scoped.
- **Implementation phase:** F09; issues #37–#40 y Mobile #35–#36.
- **Verification target:** BACKUP_RESTORE, SECURITY, DEVICE
- **Status:** `BASELINED`

## URS-VOICE-01 — Captura por voz opcional y segura

- **ID:** `URS-VOICE-01`
- **Title:** Voz sólo como captura asistida
- **Statement:** Si se utiliza voz, debe producir un draft, permitir preview editable y requerir confirmación humana antes de cualquier operación; nunca produce efectos automáticamente.
- **Source:** [`CURRENT_SCOPE.md` §3](../scope/CURRENT_SCOPE.md); ADR-001; Mobile PRE-VOICE issues #10–#17.
- **Related OE:** OE3
- **Owner:** Mobile/Flutter
- **Privacy impact:** Alto; audio y transcripción, si existen, no se proyectan por defecto ni se exige persistirlos.
- **Implementation phase:** PRE-VOICE/EVO; no F04.
- **Verification target:** UNIT, DEVICE, SECURITY, USABILITY
- **Status:** `BASELINED`

## URS-SEC-01 — Acceso central contextual

- **ID:** `URS-SEC-01`
- **Title:** Autorización por identidad, tenant, vínculo, rol y ownership
- **Statement:** El acceso central debe limitarse mediante el contexto autenticado y las reglas de tenant/vínculo, rol y ownership aplicables al recurso.
- **Source:** ADR-001, Data ownership/Privacy boundary; issue #8; issues F02 #10–#14.
- **Related OE:** OE2, OE4, OE5
- **Owner:** Central; Web/Mobile como clientes no confiables para autorización.
- **Privacy impact:** Crítico; evita acceso horizontal y cross-tenant.
- **Implementation phase:** F02; evaluación F10 #44.
- **Verification target:** UNIT, INT, SECURITY
- **Status:** `BASELINED`

## URS-REP-01 — Reportes colectivos autorizados

- **ID:** `URS-REP-01`
- **Title:** Consolidados y reportes para planificación
- **Statement:** Directiva debe obtener reportes y consolidados construidos exclusivamente con información central autorizada para apoyar la planificación colectiva.
- **Source:** [`CURRENT_SCOPE.md` §5](../scope/CURRENT_SCOPE.md); [`CAPABILITY_DISPOSITION_MATRIX.md`](../scope/CAPABILITY_DISPOSITION_MATRIX.md).
- **Related OE:** OE4, OE5
- **Owner:** Central y Web Directiva
- **Privacy impact:** Alto; los agregados no deben revelar detalle privado innecesario.
- **Implementation phase:** F07 #28; evaluación F10.
- **Verification target:** CONTRACT, E2E, SECURITY, REVIEW
- **Status:** `BASELINED`
