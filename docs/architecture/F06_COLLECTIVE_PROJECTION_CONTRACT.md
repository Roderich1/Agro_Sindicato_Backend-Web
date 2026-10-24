# F06-COLL-01 — Contrato de proyección colectiva mínima

Estado: **propuesta documental para auditoría independiente**, issue [#20](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/20). `ALLOW` identifica una decisión propuesta en este contrato; no habilita endpoints ni acredita implementación, autorización de producción o aceptación de F06.

Baselines de lectura: Backend/Web `6fa1c0c0083965b7d8da0b8ac3cd1907a418f29e`; Mobile `278cbd32dc59b26824f59fcefb77bebbc3cecb95`. La [matriz de campos](F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md) es la whitelist exhaustiva de negocio; la [evidencia](../evidence/F06_COLL_01.md) contiene trazabilidad, hallazgos y controles.

## 1. Autoridad y finalidad

Rigen [ADR-001](../adr/ADR-001-mobile-individual-system-of-record.md), [CURRENT_SCOPE](../scope/CURRENT_SCOPE.md), las matrices de alcance y [F01](F01_INTEGRATION_DECISIONS.md), incluidos sus ajustes semánticos. El código histórico no crea requisitos. Mobile conserva autoridad sobre operaciones individuales; Central conserva identidad, membresía, catálogos y campañas compartidas. Central custodia únicamente una proyección autorizada para planificación, visualización y reportes colectivos. Web es consumidor Directiva/Admin online-first.

Regla: **DENY por defecto**. Sólo entran campos con finalidad, trazabilidad, propietario, acceso, minimización y retención definidos. No hay réplica de SQLite, sincronización financiera, forecasting, IA, recomendación, aportes comunales (retirados, ADR-002), operación individual desde Web ni publicación implícita desde backup.

| Decisión | Finalidad concreta | Respaldo y consumidor |
| --- | --- | --- |
| COLL-01 | Total de consumo físico por campaña/producto/unidad para lectura colectiva | OE4/OE5; URS-WEB-01, URS-REP-01; SRS-COLL-01/03, SRS-REP-01; DEC-F01-07/08. Web F07 #23–25/#28; consolidación F06 #21. |
| COLL-02 | Total expresamente solicitado por agricultores para preparar una propuesta humana | OE3/OE4; URS-MOB-03, URS-WEB-01, URS-JP-01; SRS-COLL-02, SRS-JP-02; DEC-F01-06/07/11. Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34); Web F07 #26–28. |
| COLL-03 | Referencias y cantidades exactas sin identidad privada redundante | OE2/OE4/OE5; URS-PRIV-01, URS-SEC-01; SRS-IAM-02, SRS-COLL-01, SRS-PRIV-01; DEC-F01-01/07/08. F05 #16, F06 #21. |
| COLL-04 | Sustitución/cancelación causal sin duplicar ni reactivar aportes obsoletos | OE2/OE4/OE5; URS-SYNC-01; SRS-SYNC-01/02; DEC-F01-04/05. F05 #16–18. |
| COLL-05 | Retención por finalidad, auditoría mínima y separación del backup | OE2/OE4/OE5; URS-PRIV-01, URS-BKP-01; SRS-AUDIT-01, SRS-BKP-01/02; DEC-F01-08/09/10. F06 #20, F08 #40, F10 #45. |

Los identificadores OE/URS/SRS/DEC remiten a [URS](../requirements/URS.md), [SRS](../requirements/SRS.md), [TRACEABILITY_MATRIX](../requirements/TRACEABILITY_MATRIX.md) y F01; no se crean requisitos académicos adicionales.

## 2. Tipos y whitelist exacta

Se proponen **dos tipos**, cada uno con exactamente cuatro campos de negocio para publicar o sustituir un valor:

| Tipo | Campos ALLOW | Semántica |
| --- | --- | --- |
| `CONSUMPTION_TOTAL` | `campaign_ref`, `product_ref`, `base_unit`, `quantity_base` | Total físico acumulado vigente, neto de reversión, de aplicaciones confirmadas del agricultor autorizado en una campaña y producto. |
| `DECLARED_NEED` | `campaign_ref`, `product_ref`, `base_unit`, `quantity_base` | Cantidad total vigente solicitada expresamente por el agricultor para una campaña y producto. |

No se proyectan eventos de aplicación, lotes, compras o movimientos. `quantity_base` de consumo es un agregado derivado localmente, no una línea de SQLite renombrada. No se exige publicar si el agricultor no ha emitido una intención autorizada. Ausencia de publicación significa **desconocido**, nunca cero.

| Campo | Tipo de dominio | Validación y normalización |
| --- | --- | --- |
| `campaign_ref` | Referencia central opaca y estable; actualmente UUID en Backend | Debe resolver a una campaña del tenant efectivo. El ID entero local y el nombre no son referencias centrales ni admiten emparejamiento heurístico. |
| `product_ref` | Referencia central opaca y estable; actualmente UUID en Backend | Debe resolver al producto central del mismo tenant y tener vinculación local verificada. No enviar nombre, ingrediente ni ficha del catálogo. |
| `base_unit` | Enum `ML` o `G` | `ML` = mililitros; `G` = gramos. Mobile almacena 1000 unidades base por `L`/`KG`. Validar dimensión contra la unidad del catálogo central; no convertir masa en volumen ni estimar densidad. |
| `quantity_base` | Entero exacto no negativo | Cero es una declaración explícita válida, no ausencia. Prohibidos negativos, fracciones de unidad base, NaN, infinito y redondeos silenciosos. F05 definirá codificación y límites numéricos compatibles sin pérdida de precisión. |

Las unidades centrales fuera de `L`/`KG` o sin equivalencia verificada a `ML`/`G` no son admitidas por este contrato. No se suman productos distintos ni dimensiones incompatibles. Mostrar litros/kilogramos en Web es una conversión de presentación, no otro campo Mobile.

`CANCEL` identifica el aporte mediante `campaign_ref`, `product_ref`, `base_unit` y el tipo ya seleccionado; **no lleva `quantity_base` ni una explicación privada**. La acción, la causalidad y la identidad de operación pertenecen a F05, no son campos adicionales de negocio. La selección del tipo tampoco define aquí un envelope.

## 3. Necesidad declarada y stock

`DECLARED_NEED` requiere entrada o confirmación expresa del agricultor: intención de solicitar esa cantidad total para el contexto indicado. No nace de un plan, dosis teórica, pronóstico, existencias, gasto, recomendación o cálculo automático. Confirmar una aplicación no equivale a declarar una necesidad. Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34) debe crear esta capacidad; no existe un productor vigente de esta proyección en la baseline auditada.

`declared_stock` = **DENY**; no se crea un tercer tipo. SRS-JP-01 condiciona su fórmula a un stock declarado compatible **si F06 lo aprueba**. Su existencia como ejemplo/propuesta en F01/DATA_BOUNDARY no basta para incluirlo. Esta decisión no contradice la condición: sin stock aprobado, el total solicitado no se denomina `net_need`, no se resta inventario privado y no se supone stock cero. F07 #26 conserva la evaluación del algoritmo que dependa de esa condición; cualquier ampliación requiere requisito, finalidad y revisión propia de #20.

La propuesta colectiva es un draft sujeto a revisión humana. No crea compra individual, lote, movimiento, deuda, pago ni efecto sobre SQLite (DEC-F01-11; SRS-JP-02).

## 4. Propietario, identidad y autorización

El aporte se atribuye al **Member agricultor efectivo** de la sesión autenticada y su tenant; Account/Member/Session/ClientRegistration se validan en Central conforme a F02. `clientId` es identidad lógica de instalación, no identidad humana ni autorización. Tenant, Account, Member, rol, propietario y dispositivo no se admiten como campos redundantes del payload de negocio. F05 debe representar y validar su contexto sin confiar en IDs declarados por el cliente.

Mobile debe demostrar qué operaciones pertenecen a ese agricultor. La SQLite actual contiene `person_id` de familiares/terceros y no presenta una vinculación verificada de esos registros con Member/Account. Por tanto:

- No atribuir todas las aplicaciones de una instalación al usuario que inicia sesión.
- No crear Person central a partir de personas o relaciones locales.
- No publicar aplicaciones ajenas, aunque el dispositivo o una cuenta Directiva pueda leerlas localmente.
- Hasta disponer de referencias centrales y prueba de propiedad, la publicación falla cerrada. Adaptadores: Mobile [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33); productor de necesidad: Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34). Son precondiciones de los dos tipos, no campos `CONDITIONAL` ni autorización de un nuevo payload.
- Un registro confirmado y no revertido puede contribuir al total sólo después de ese filtro de propiedad y la vinculación campaña/producto/unidad. No copiar `productCostReport`, que en la baseline suma personas sin ese filtro.

| Actor | Permiso de destino | Límite |
| --- | --- | --- |
| Agricultor autenticado y Member activo | Publicar, sustituir o cancelar **su** aporte autorizado; consultar su aceptación/conflicto mínimo | Sólo su tenant, referencias válidas y propiedad probada. Otro agricultor/tenant se rechaza. |
| Directiva/Admin online | Leer consolidado autorizado de su tenant; preparar propuesta humana | No escribir aportes del agricultor, editar datos locales, consultar detalles privados ni usar acceso legacy como permiso de destino. |
| Procesamiento Central | Validar contexto, conservar aporte mínimo, consolidar y generar metadatos mínimos | No convertirse en autoridad del dato individual ni ejecutar operaciones privadas. |

La autorización aplicable debe comprobarse en cada operación y lectura; revocación/inactividad corta acceso futuro. No se inventa un servicio de consentimiento, ni se afirma que existe consentimiento formal implementado. Si una aprobación legal/académica exige consentimiento formal, F10 #45 debe precisar la regla antes de habilitar el uso afectado. No equiparar rol, login o posesión del UUID a autorización de todos los datos.

## 5. Privacidad y consumidores

Los aportes son **datos vinculables protegidos**, aun sin nombres: Central requiere atribución interna mínima para reemplazar correctamente un aporte. Un total pequeño tampoco es automáticamente anónimo.

Central F06 #21 puede consolidar únicamente por campaña/producto/unidad dentro del tenant autorizado. La salida Web permitida por finalidad es `consumed_total_base` o `declared_need_total_base` con sus referencias y unidad; son resultados **derivados en Central**, no campos nuevos de entrada Mobile. No exponer Member/Account/clientId, cantidades por agricultor, nombre/familia, finca, movimientos, costos ni filtros por persona/dispositivo. El listado de agricultores vinculados de URS-WEB-01 se resuelve desde IAM con autorización propia; no autoriza unirlo a cantidades individuales.

La publicación de valores numéricos exige una política aprobada que evalúe grupos pequeños, comparación entre consultas y filtros que permitan inferir un aporte individual. No se fija aquí un umbral arbitrario de anonimato. **Sin esa política, no habilitar divulgación numérica en Web/reportes**. Responsable: Roderich1 en F10 #45, con implementación F06 #21/F07 #23–25/#28. Consolidar internamente no equivale a permiso para divulgar. Propuesta de esa política, **pendiente de aprobación**: [`F07_AGGREGATE_DISCLOSURE_POLICY.md`](F07_AGGREGATE_DISCLOSURE_POLICY.md) (#107).

`last_sync`/frescura es hora de aceptación central derivada, no `applied_at`, fecha de compra ni un timestamp privado aportado. Indica frescura, no completitud del inventario local. Un cambio de membresía o revocación exige reevaluar el acceso y la contribución bajo la política; nunca abrir lectura cross-tenant.

**Cambio del 2026-10-17 (PR #126, F10-SEC-02).** Se añade sin borrar el texto anterior.

**Cobertura** que acompaña al consolidado (`coverage`):
- `linked_members`: agricultores activos del tenant;
- `members_with_contribution`: cuenta **sólo los Members cuyas aportaciones están dentro de cifras publicadas**. Antes contaba a todos los aportantes, también los de celdas suprimidas, y con una sola celda suprimida revelaba su conteo exacto;
- `suppressed_cells` (booleano): avisa, sin conteo, de que alguna celda no tiene cifra.

**Cada borrador de propuesta** guarda la regla con la que se contó (`coverage.basis`):
- `PUBLISHED_FIGURES` para los nuevos;
- `ALL_CONTRIBUTORS` para los anteriores, que no se reescriben.

La cobertura es un metadato agregado sujeto a la misma política. No es un listado de agricultores ni una cifra por producto. Ver `F07_AGGREGATE_DISCLOSURE_POLICY.md` (R9 y §9).

Se excluyen finanzas, pagos, deudas, liquidaciones, proveedores, precios, costos, facturas, archivos, fotos, PDFs/CSV, coordenadas, parcelas, detalle de aplicaciones, personas/familiares, planes, lotes, movimientos, transferencias, audio, tokens y huellas físicas. La matriz enumera los candidatos relevantes. Cualquier campo no enumerado como ALLOW se rechaza, no se ignora silenciosamente ni se guarda para uso futuro.

## 6. Identidad de dominio, causalidad y conflictos

La contribución lógica es **un valor vigente por agricultor efectivo, tenant, tipo, campaña, producto y unidad**. Esta descripción identifica el objeto de dominio; **no define la tupla técnica de idempotencia**, versión del protocolo o formato del envelope de F05. Cambiar dispositivo no crea otro aporte sumable para la misma contribución.

| Intención de dominio | Resultado requerido |
| --- | --- |
| `PUBLISH` | Introduce una contribución vigente cuando no hay otra vigente y la causalidad autoriza el estado inicial. |
| `SUPERSEDE` | Sustituye el total vigente mediante una relación demostrable con su antecesor; no suma un delta ni conserva dos valores activos. Cambiar campaña/producto requiere cancelar el aporte anterior y publicar otro mediante intenciones explícitas. |
| `CANCEL` | Retira el aporte de los cálculos. Mantiene sólo la evidencia causal mínima necesaria para que una repetición obsoleta no lo reactive. No borra operaciones locales. |

F05 #16/#17 debe representar identidad lógica de intención, vínculo causal/antecesor y estado vigente/cancelado. **La cantidad o su igualdad no identifican una intención**. No se fija contador, reloj, campo de revisión, clave técnica, ACK, timeout ni secuencia wire. Una intención nueva de igual cantidad debe distinguirse de un reenvío de la misma intención.

| Tipo | Autoridad de contenido | Regla de conflicto |
| --- | --- | --- |
| `CONSUMPTION_TOTAL` | Mobile y agricultor sobre operaciones propias confirmadas/no revertidas | Recalcular localmente y sustituir el total mediante causalidad válida. Una reversión puede disminuirlo legítimamente. Central no impone máximo, hora más reciente ni su inventario legacy. |
| `DECLARED_NEED` | Declaración explícita del agricultor en Mobile | Sólo otra declaración confirmada puede sustituirla/cancelarla. Dos declaraciones concurrentes incompatibles quedan en conflicto hasta nueva decisión explícita del propietario. No inferir una solución a partir de stock o consumo. |
| Referencias y autorización | Central | Campaña/producto de otro tenant, inexistentes, inactivos/incompatibles o propiedad no comprobada se rechazan. No crear catálogos desde el payload ni remapear por nombre. |

Una campaña debe estar habilitada para contribuciones conforme a su autoridad central (`ABIERTA` y `isActive` en el modelo vigente). Una transición a cerrada impide una nueva publicación/sustitución ordinaria; el error requiere revisión del contexto, no reapertura automática. La cancelación del propietario sigue siendo una retirada, incluso para campaña cerrada, si su identidad/autorización siguen válidas. Con credenciales revocadas, la retirada/depuración se tramita por la política central responsable, nunca por un bypass anónimo.

**Nota del 2026-10-23 (campaña sellada; detalle en [`F07_SEALED_HISTORY_CONTRACT.md`](F07_SEALED_HISTORY_CONTRACT.md) §7).**
- **Sellado y cierre son estados distintos.** Sólo se sella una campaña cerrada.
- **Publicación o sustitución nuevas** en una campaña sellada: se rechazan con `CAMPAIGN_SEALED`. Es un fallo terminal; no se reabre la campaña ni se remapea a otra.
- **Replay** de una intención ya resuelta: devuelve su resultado original.
- **CANCEL del propietario:** sigue siendo una retirada válida. No altera la versión sellada; sólo retira la visibilidad de las cifras selladas que incluían esa aportación.

Concurrencia: dos sucesores incompatibles del mismo antecesor no se resuelven mediante LWW universal, suma, máximo ni hora de cliente. Central conserva sólo el conflicto mínimo autorizado y detiene esa actualización; Mobile presenta la decisión al propietario, que emite una nueva intención causal válida. Un antecesor obsoleto o cancelado no puede reactivarse por reenvío. Backend tampoco sobrescribe SQLite como solución de conflicto.

| Caso que F05 #18 debe cubrir | Invariante de este contrato |
| --- | --- |
| Request perdido antes de aceptación | Repetir la misma intención no genera aportes adicionales. |
| Aceptación central y ACK perdido | La repetición devuelve el resultado de esa intención; el total no se suma nuevamente. |
| Reenvío equivalente | Un único estado vigente; no duplicar efectos ni logs privados. |
| Misma identidad de intención con contenido diferente | Rechazar discrepancia; no aceptar mutación encubierta. |
| Operaciones concurrentes desde dos instalaciones | Conflicto explícito si causalidad incompatible; propietario decide. |
| 500 con resultado desconocido | Reconciliar la misma intención; no crear otra compra, aplicación o contribución. |
| Refresh de sesión | Revalidar tenant/Member y cliente; conservar identidad de la intención, no transferirla a otro propietario. |
| Cancelación y reenvío de una revisión antigua | Cancelación domina a sus antecedentes; no resurrección. |
| Cambio de dispositivo o restauración | Identidad humana y causalidad verificadas; no duplicar contribuciones ni importar todo el backup. |

## 7. Retención y auditoría mínima

Se fijan finalidad, inicio, salida y responsable; **no se inventan días**. `PERIOD_DELEGATED` significa política temporal pendiente de aprobación antes de producción o eliminación destructiva; no permiso de retención indefinida.

| Clase | Inicio / contenido permitido | Criterio de salida y minimización | Responsable / issue / plazo |
| --- | --- | --- | --- |
| `R_CURRENT` | Aceptación de un aporte vigente; cuatro campos y asociación interna imprescindible | Sustituido/cancelado sale inmediatamente del cálculo; no guardar historial de cantidades por conveniencia. Al terminar finalidad de campaña/reportes o autorización, eliminar o anonimizar de forma evaluada. Un agregado identificable no cuenta como anonimización. | Roderich1: F06 #20 política, #21 ejecución; F07 #28 finalidad de reportes; F10 #45 verificación. `PERIOD_DELEGATED`. |
| `R_CAUSAL` | Aceptación/supersesión/cancelación; referencias opacas, estado causal y resultado mínimo | No guardar payload completo. Retirar sólo cuando la ventana/garantía de replay de F05 permita rechazar de forma segura antecedentes obsoletos sin esos marcadores; nunca borrar tombstones dejando que reaparezcan cantidades. | Roderich1: F05 #16/#17 garantía replay, F06 #20 política, F10 #45 revisión. `PERIOD_DELEGATED`. |
| `R_CENTRAL_AUDIT` | Validación/aceptación/rechazo/retirada; actor/contexto interno, acción, resultado, referencia opaca y hora de servidor | Finalidad de accountability; no snapshots privados, cuerpos completos, secretos, notas o binarios. Separar accesos de auditoría del consumo Web. Eliminar/minimizar al terminar la finalidad aprobada. | Roderich1: F06 #20 política; SRS-AUDIT-01; F10 #45 verificación. `PERIOD_DELEGATED`. |
| `R_CENTRAL_REFERENCE` | Campaña/producto central ya existentes, no una copia nueva desde Mobile | Rige su política central y referencial; cancelar aporte no elimina catálogo. No duplicar fichas de catálogo en cada revisión. | Roderich1: autoridad Central, F06 #20/F05 #16 validación de referencias. Política central vigente; periodo fuera de esta proyección. |
| `R_PRIVATE_LOCAL` | Dato individual o candidato excluido | Central no lo admite: cero retención en proyección y en logs/cuarentena del Sync. Conservación local pertenece a Mobile. | Roderich1: Mobile [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33)/[Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34); F06 #20/F10 #45 boundary. Sin periodo central. |
| `R_BACKUP_F08` | Backup privado del propietario | No ingresar al Sync; F08 define conservación, restore, integridad, cifrado y purga. No aplicar retención de proyección al backup. | Roderich1: F08 #37–40, especialmente #40. `PERIOD_DELEGATED` a F08. |

En rechazo por campos privados, la auditoría registra clasificación y referencia mínima segura, **no el valor rechazado ni el cuerpo**. No guardar conflictos como snapshots completos de SQLite. Los datos mínimos de conflicto sólo los consulta el propietario autorizado o el proceso central que necesite resolverlo; Directiva recibe estado autorizado sin cantidades individuales.

### 7.1 Enmienda del 2026-10-19: memoria técnica de divulgación (`R_DISCLOSURE_MEMORY`)

**Qué es.** Una enmienda mínima de este §7, decidida por Roderich Rendón el 2026-10-19 («Decisiones sobre el contraste y siguiente trabajo acotado», §5) para resolver la contradicción entre `R_CURRENT` y el hallazgo M3 de F10-SEC-02 (`docs/evidence/F10_SEC_02_PROJECTION.md` §3). La redactó la sesión A de Claude Code; la revisan las sesiones B y C. No es una revisión del tutor ni una aprobación institucional.

**Desde cuándo.** Rige desde el **2026-10-19**, la fecha real de la enmienda. **No es un cumplimiento retroactivo:** entre la migración `20261016043000_f06_collective_consolidation` (2026-10-16) y esta fecha, el código guardó un historial de cantidades que `R_CURRENT` no admitía. Esa contradicción existió y queda registrada así. El texto anterior de la tabla no se reescribe, y no se afirma que el código haya prevalecido sobre el contrato sin enmendar.

**Qué cambia:**
- **`R_CURRENT` no cambia** y sigue rigiendo el aporte vigente (`SyncV1Contribution`): un aporte sustituido o cancelado sale de inmediato del cálculo, y la contribución no guarda un historial de cantidades por conveniencia.
- **Se crea una clase separada, `R_DISCLOSURE_MEMORY`**, para la memoria de las divulgaciones ya hechas. Su **única finalidad** es impedir que una cifra nueva, combinada con las que ya se divulgaron, permita inferir un aporte por diferencias, también entre claves (F07-POL-01, regla de combinaciones, `F07_AGGREGATE_DISCLOSURE_POLICY.md` §9). No sirve para reportes, auditoría, analítica ni ninguna otra finalidad.
- **Esta enmienda conserva M3 en el alcance sintético.** No autoriza una purga del historial para que desaparezca la contradicción.

| Clase | Inicio / contenido permitido | Criterio de salida y minimización | Responsable / issue / plazo |
| --- | --- | --- | --- |
| `R_DISCLOSURE_MEMORY` | Cada divulgación decidida por la política (`RELEASE`), con las aportaciones que la componían y la cantidad de cada una en ese momento. Detalle en la tabla siguiente | Sólo la usan la decisión de divulgación y la cobertura; la lectura de una propuesta sólo toma la cifra ya publicada, y su creación pasa por la misma decisión. Se conserva mientras el sistema siga tomando decisiones de divulgación sobre esa campaña. No se olvidan divulgaciones de forma selectiva. Su eliminación se trata de forma conjunta y autorizada (ver abajo) | Roderich1: F10 #45 verificación; F07 #107 política para datos reales. Datos sintéticos: durante el ensayo y la evaluación del entorno correspondiente. Datos reales: **ningún plazo aprobado; pendiente de #107; no hay datos reales admitidos** |

**Qué se conserva exactamente** (`Back/prisma/schema.prisma`, comprobado sobre el código de `f0b55ee`):

| Tabla | Campos | Vínculos internos |
| --- | --- | --- |
| `CollectiveRelease` | `id`, `tenantId`, `campaignId`, `canonicalProductId`, `projectionType`, `baseUnit`, `totalBase`, `contributorCount`, `dataAsOf`, `releasedAt`, `withdrawnAt` | Tenant, campaña y producto canónico; `JointPurchaseProposalLine.releaseId` señala la divulgación que respalda una línea de propuesta |
| `CollectiveReleaseItem` | `releaseId`, `contributionId`, `sequence` y `quantityBase` (la cantidad de **esa** aportación en **esa** divulgación; `NULL` en filas anteriores a `20261016150500_f07_pol_01_release_item_quantity`) | `contributionId` → `SyncV1Contribution`, que lleva el `memberId`. Por eso la memoria **está vinculada a cada agricultor** a través de su aportación |

**Lo que no es.** `CollectiveReleaseItem` guarda, por aportación, su identificador, su secuencia y su cantidad, no sólo un total agregado. **No es anónima** y no se describe como si sólo guardara cifras colectivas. El comentario del modelo `CollectiveRelease` en el esquema («no guarda cantidades por agricultor») es anterior a la migración `20261016150500` y está desfasado: esta sección describe el estado real.

**Inmutabilidad.** Los disparadores de `20261016043000` impiden borrar `CollectiveRelease` y sólo admiten marcar `withdrawnAt` una vez; `CollectiveReleaseItem` no admite ni UPDATE ni DELETE. Una divulgación retirada sigue en la memoria, porque su cifra ya pudo conocerse.

**Quién la lee y cómo se controla:**
- **Lectores en el servicio:** `CollectiveSummaryUseCase` (`Back/src/modules/collective/application/collective-summary.use-case.ts`). `releaseHistories()` lee las divulgaciones con sus filas y el `memberId` de cada aportación para aplicar la regla de combinaciones y la cobertura. `provisional()` crea las divulgaciones y marca su retirada. `JointPurchaseProposalUseCase`, al **leer** una propuesta, sólo toma de `CollectiveRelease` el total, el número de aportantes y las fechas de la divulgación que respalda cada línea, sin leer `CollectiveReleaseItem`. Al **crearla** (`POST …/proposals`), ejecuta `summary.decide()` en la misma transacción (`joint-purchase-proposal.use-case.ts:100`): pasa así por la misma decisión, que lee la memoria y puede crear o retirar divulgaciones.
- **Acceso:** las rutas que llegan a esos casos de uso (`GET /collective/campaigns/:campaignId/summary` y `summary.csv`, y las de propuestas bajo `/collective`) exigen DIRECTIVA o ADMINISTRADOR y el tenant de la sesión, y responden con `Cache-Control: no-store`.
- **Sin exposición:**
  - ninguna ruta, esquema OpenAPI, CSV ni pantalla Web devuelve `contributionId`, `sequence`, `quantityBase` por aportación ni el `memberId` de una divulgación;
  - el resumen y la propuesta sólo entregan los totales, el número de aportantes y las fechas que la política deja publicar;
  - los registros (`[COLLECTIVE SUMMARY]` y `[JOINT PROPOSAL]`) sólo llevan los identificadores del tenant, la campaña, la propuesta y el actor, y el número de celdas.

  Comprobado con búsquedas sobre `Back/src` y `Web/src` en `f0b55ee`. Es una lectura estática del código, no una prueba nueva.
- **No se amplía la entrada.** La whitelist del §2 (las ocho filas ALLOW de la matriz de campos) no cambia, y no se admiten nuevas operaciones privadas. La memoria se deriva de aportes ya admitidos; no es un canal de entrada.

**Cobertura: semántica vigente una vez integrado BE #157 (M5)**, que se integra antes que esta enmienda. No cambia los cálculos; la describen el §5 de este contrato y F07-POL-01 R9 y §9:
- `linked_members` cuenta los Members AGRICULTOR activos del tenant, con su cuenta activa.
- `members_with_contribution` es la unión de los Members que están dentro de las cifras que el resumen muestra en esa lectura:
  - los de una cifra nueva (`RELEASE`), según las aportaciones vigentes de esos mismos Members (BE #157, M5);
  - los de una cifra anterior que se sigue mostrando (`SHOW_PRIOR`), según la memoria de esa divulgación.
- Un Member que sólo está en celdas suprimidas no se cuenta. `suppressed_cells` avisa, sin conteo, de que alguna celda no tiene cifra.
- **Relación con la memoria:** la cobertura de una cifra ya publicada se obtiene de esa memoria. Por eso eliminarla de forma selectiva cambiaría también la cobertura y las cifras que la política deja ver.

**Datos sintéticos.** La memoria se conserva durante el ensayo y la evaluación del entorno correspondiente. Su eliminación posterior se trata de forma conjunta y autorizada, con todo el entorno o toda la campaña. No se olvidan divulgaciones anteriores de forma selectiva mientras el sistema siga tomando decisiones basadas en ellas.

**Datos reales: pendiente, sin aprobación.** Antes de admitir datos reales hace falta una política aprobada que fije la finalidad, la minimización, la duración y la salida de esta memoria. Es parte de la decisión de F07-POL-01 (#107) y de `docs/evidence/F07_POL_01_REVISION_INSTITUCIONAL.md` §4–5.
- `PERIOD_DELEGATED` no se convierte aquí en una retención indefinida autorizada.
- No se fija ningún número de días.
- Esta enmienda no aprueba la política F07-POL-01, no es una validación institucional y no habilita producción.

**Una alternativa futura sin memoria** tendría que demostrar antes que no debilita la protección frente a cifras que ya pudieron conocerse. Esta enmienda no la construye.

### 7.2 Enmienda del 2026-10-23: historial colectivo sellado (`R_COLLECTIVE_HISTORY`)

**Qué es.**
- Origen: las decisiones de Roderich Rendón del 2026-10-23: conservar el histórico colectivo para consultas y tendencias descriptivas, y sellar de forma manual.
- Detalle: [`F07_SEALED_HISTORY_CONTRACT.md`](F07_SEALED_HISTORY_CONTRACT.md).
- La redactó la sesión B de Claude Code. La revisan las sesiones A y C. No es una aprobación institucional.
- Rige desde el 2026-10-23. **No es retroactiva**, y el texto anterior de §7 y §7.1 no se reescribe.

**Nueva clase `R_COLLECTIVE_HISTORY`:**

| Clase | Inicio / contenido permitido | Criterio de salida y minimización | Responsable / issue / plazo |
|---|---|---|---|
| `R_COLLECTIVE_HISTORY` | El sellado manual de una campaña **cerrada** por DIRECTIVA o ADMINISTRADOR del tenant. Contenido: `CollectiveSeal`, con actor, rol, hora del servidor, modo, política, umbral, cobertura agregada, el booleano de disputas y la huella de revisión, y `CollectiveSealEntry`, con el estado por celda, la referencia a la divulgación mostrada, `pendingChanges` y la marca de retirada de visibilidad. Sin cantidades por aportación, identidades ni datos privados | Consulta histórica autorizada y tendencias descriptivas, con la política **vigente** al leer: puede retirar la visibilidad, nunca añadirla. Inmutable: sin UPDATE ni DELETE, salvo marcar la retirada de visibilidad. No hay purga en este bloque | Roderich1: F07 #107 (política para datos reales), F10 #45 (verificación). Datos sintéticos: se conserva mientras dure el entorno del ensayo. Datos reales: **sin plazo aprobado; no hay datos reales admitidos**. `PERIOD_DELEGATED` no se convierte en una conservación indefinida autorizada |

**Es vinculable.** Cada entrada visible apunta a una divulgación de `R_DISCLOSURE_MEMORY`, que guarda la cantidad de cada aportación con su Member. Conservar el historial es conservar **datos protegidos y vinculables**, no «sólo agregados anónimos». La Directiva sólo accede a las salidas colectivas que la política permite.

**Cambios en las clases existentes:**
- **`R_CURRENT`:**
  - la regla no cambia: un valor sustituido o cancelado sale del cálculo y la aportación no guarda un historial de cantidades;
  - el sellado **no añade versiones** de las aportaciones;
  - tras el sellado, la aportación vigente se conserva como soporte del vínculo de la memoria, que la referencia con FK `Restrict`, y **no se usa para ningún cálculo nuevo de esa campaña**;
  - la salida de `R_CURRENT` para una campaña sellada queda subordinada a la de su historial. No se borra por separado.
- **`R_DISCLOSURE_MEMORY` (§7.1)**, dos precisiones:
  1. **Lectores de `CollectiveReleaseItem`.** §7.1 decía que leer una propuesta no lee esa tabla. Desde esta enmienda la leen:
     - la decisión de divulgación, también en modo de sólo lectura para servir una propuesta sin sellar, con la misma finalidad de §7.1;
     - **nueva finalidad acotada:** la retirada de visibilidad. Sirve para saber a qué entradas selladas afecta el CANCEL de un aportante después del sellado.

     Las dos son de protección. **No** la convierten en analítica: las tendencias y la consulta histórica no leen `CollectiveReleaseItem`.
  2. **Duración:** la memoria de una campaña sellada se conserva mientras exista su versión sellada.
- **La propuesta M-2 de BE #159** («sellar y después eliminar de forma conjunta por campaña») se **descarta** por la decisión del 2026-10-23. No se adopta ningún plazo automático (30 días u otro) para borrar o sellar.
- **`R_CAUSAL` y el journal:** el sellado no añade historial al journal. El rechazo `CAMPAIGN_SEALED` se guarda como cualquier otro rechazo (F05 §8, enmienda del 2026-10-23).
- **`R_CENTRAL_AUDIT`:** una fila mínima de `AuditLog` por sellado, con actor, acción, entidad, campaña y hora, sin cifras.

**Discrepancia que se declara (regla 3 de CLAUDE.md).**
- §7.1 dice que «la lectura de una propuesta sólo toma la cifra ya publicada».
- En `769d441`, la lista, el detalle y el CSV de propuestas ejecutaban `summary.decide()`, que puede crear o retirar divulgaciones. Lo observó la revisión de #159 (hallazgo 3).
- **Desde esta enmienda,** leer una propuesta aplica la misma decisión en modo de sólo lectura, sin escribir. En una campaña sellada, sirve la versión sellada.
- Hasta esta fecha, el código contradecía el contrato, y así queda registrado.

**Copias del Central.** No hay un procedimiento documentado de copia y restauración del Central (manual técnico §9.3), y no se verificó si el proveedor hace copias. Una restauración anterior a un sellado o a una divulgación haría «olvidar» cifras ya conocidas. Su tratamiento (fallar cerrado y comprobar antes de reabrir la divulgación) sigue **pendiente** y no se construye en este bloque.

## 8. Sync y backup

Sync transporta únicamente intención autorizada sobre la whitelist; backup sirve para recuperación privada del propietario. Un archivo, manifiesto o clave de backup no es proyección.

**Sync payload MUST NOT contain backup binary.**

**Backup restore MUST NOT implicitly publish private backup contents into collective projections.**

Restaurar SQLite, fotos o identidades locales no autoriza re-publicación masiva. Cualquier publicación posterior exige intención explícita, referencias centrales, autorización y causalidad verificadas. `installationClientId` no proviene de IMEI/Android ID/MAC/serial; su registro seguro no lo convierte en campo de negocio.

## 9. Impacto legacy — disposición futura, sin cambios actuales

| Contrato/consumidor existente | Disposición | Cambio futuro requerido / responsable |
| --- | --- | --- |
| Identidad y registro lógico F02 | `KEEP` | Validar contexto de operación; sin ampliar payload. F05 #16/#17. |
| Campaign/Product/Crop central | `KEEP` | Reusar autoridad y referencias; separar stock legacy de catálogo. Crop no es dimensión de los dos tipos. |
| SyncOperation/SyncConflict legacy | `ADAPT_LATER` | Sustituir operación privada/payload libre/snapshots por contrato F05 y conflicto mínimo; gobernar transición en #81. No eliminación ahora. |
| Plot/Application legacy | `BLOCK_WRITES_LATER` | Bloquear escritores individuales sólo tras reemplazo aprobado, inventario de consumidores y rollback. Mobile [Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33); #81. |
| Inventory/lots/movements legacy | `BLOCK_WRITES_LATER` | No autoridad central de inventario privado; corte de escritores separado de retiro de tablas. #81 tras #16. |
| Purchase/procurement legacy | `ADAPT_LATER` | Propuesta colectiva sin efectos individuales automáticos; consumidores y endpoints se migran en F07 #26–28/#81. |
| PayableAccount/Payment legacy | `REMOVE_LATER` | Sin destino Live; retiro contractual/consumidores antes de schema. #81; no DROP aquí. |
| Calendar legacy | `REMOVE_LATER` | No nuevo consumidor ni proyección por su mera existencia. #81 y matriz de disposición. |
| DemandForecast legacy | `REMOVE_LATER` | Forecasting fuera de alcance; no migrar a necesidad declarada. #81. |
| Cola offline Web | `REMOVE_LATER` | Web Directiva/Admin online-first; retirar mediante transición de consumidores. F07 #23–25/#81. |
| Backup privado | `NO_RELATION` | Ruta F08 separada; no reemplazarla por Sync. |

Estas disposiciones son decisiones propuestas para planificación, no ejecución ni autorización para borrar contratos. [LEGACY_CONTRACT_CONSUMERS](../scope/LEGACY_CONTRACT_CONSUMERS.md) y [TRANSITION_PLAN](../scope/TRANSITION_PLAN.md) conservan autoridad sobre inventario, cambio gradual, validación y rollback.

## INPUT_FOR_F05_SYNC_04

Entrada exacta para [#16](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/16), utilizable después de auditoría independiente de #20:

1. **Tipos**: exclusivamente `CONSUMPTION_TOTAL` y `DECLARED_NEED`.
2. **Whitelist**: `campaign_ref`, `product_ref`, `base_unit`, `quantity_base` por tipo para PUBLISH/SUPERSEDE; CANCEL sólo las tres referencias/dimensión, sin cantidad. Ocho filas ALLOW en matriz. Rechazar cualquier otro campo, incluso anidado.
3. **Prohibiciones**: stock declarado, eventos crudos, Person/familia/plots, finanzas, archivos/audio/backup, tokens/huellas y fichas de catálogo. Identidad contextual no se duplica como campo de negocio. Default DENY también para campos no enumerados en matriz.
4. **Autoridad**: Mobile/propietario del contenido; Central de identidad, autorización, referencias y resultado aceptado; Web sólo consumidor colectivo autorizado.
5. **Identidad**: contribución única por agricultor efectivo/contexto y tipo/campaña/producto/unidad; prueba de propiedad de fuentes locales. F05 define identidad técnica estable de intención, envelope y formato; no usar nombre/local integer/valor/hora como sustituto.
6. **Operaciones de dominio**: PUBLISH, SUPERSEDE, CANCEL; cantidades son totales exactos, nunca deltas. Publicación ausente, cero explícito y cancelación son estados distintos.
7. **Causalidad/cancelación**: vínculo verificable con antecesor; una contribución vigente; reenvío idempotente; cancelación impide resurrección; divergencia concurrente exige resolución del propietario. F05 define representación y estrategia técnica, sin LWW universal.
8. **Privacidad/retención**: contexto validado por operación, valores privados no admitidos ni registrados; clases R_CURRENT/R_CAUSAL/R_CENTRAL_AUDIT; periodos y protección de divulgación pendientes de políticas identificadas antes de producción.
9. **Consumidores**: F06 #21 consolidación; F07 #23–25/#28 consumo/frescura colectivos; #26–28 necesidad explícita/propuesta humana, sin asumir stock ni crear efectos privados. Frescura y totales son derivados centrales.
10. **Rechazos obligatorios**: tenant/Member/cliente inválidos; referencias no vinculadas/ajenas/cerradas para nueva aportación; unidad incompatible; cantidad no exacta/negativa; propiedad no probada; intención repetida con contenido diferente; antecedente obsoleto/cancelado; campos extra/privados; backup; escritura Directiva como agricultor; productor de necesidad inferida. Conflicto concurrente no se acepta como reemplazo silencioso.
11. **F05 #18**: probar request/ACK perdidos, reenvío, concurrencia, 500 ambiguo, refresh, conflictos, cancelación y restore sin duplicación ni efectos privados (tabla §6).
12. **Delegación exclusiva F05**: versión/protocolo wire, envelope/DTO, tupla de idempotencia, ACK, códigos HTTP precisos, retry/backoff, persistencia técnica y migración. Este documento no los congela ni inicia su implementación.

## 10. Estado de auditoría y dependencias

#20 permanece OPEN; criterios sin marcar. No se modifica GATE-F06 #22. #81 sigue bloqueado: esta propuesta aporta la whitelist y exclusiones **pendientes de auditoría/merge**, pero no satisface operativamente el contrato Sync versionado de #16. Secuencia: #20 → auditoría independiente → #16 → auditoría independiente → revisar desbloqueo #81.

No hay `F01_CONSISTENCY_FINDING` material en las decisiones adoptadas: stock es condicional en SRS-JP-01, Person no se centraliza por existencia local y autorización aplicable no equivale a servicio de consentimiento. Las diferencias con código legacy son deuda de transición, no cambios retroactivos de F01/F02. Un auditor que identifique contradicción debe suspender la decisión afectada y registrar el finding; no corregir silenciosamente requisitos baselined.
