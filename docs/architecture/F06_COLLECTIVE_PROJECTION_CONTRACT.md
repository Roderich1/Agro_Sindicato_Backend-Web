# F06-COLL-01 — Contrato de proyección colectiva mínima

Estado: **propuesta documental para auditoría independiente**, issue [#20](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/20). `ALLOW` identifica una decisión propuesta en este contrato; no habilita endpoints ni acredita implementación, autorización de producción o aceptación de F06.

Baselines de lectura: Backend/Web `6fa1c0c0083965b7d8da0b8ac3cd1907a418f29e`; Mobile `278cbd32dc59b26824f59fcefb77bebbc3cecb95`. La [matriz de campos](F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md) es la whitelist exhaustiva de negocio; la [evidencia](../evidence/F06_COLL_01.md) contiene trazabilidad, hallazgos y controles.

## 1. Autoridad y finalidad

Rigen [ADR-001](../adr/ADR-001-mobile-individual-system-of-record.md), [CURRENT_SCOPE](../scope/CURRENT_SCOPE.md), las matrices de alcance y [F01](F01_INTEGRATION_DECISIONS.md), incluidos sus ajustes semánticos. El código histórico no crea requisitos. Mobile conserva autoridad sobre operaciones individuales; Central conserva identidad, membresía, catálogos y campañas compartidas. Central custodia únicamente una proyección autorizada para planificación, visualización y reportes colectivos. Web es consumidor Directiva/Admin online-first.

Regla: **DENY por defecto**. Sólo entran campos con finalidad, trazabilidad, propietario, acceso, minimización y retención definidos. No hay réplica de SQLite, sincronización financiera, forecasting, IA, recomendación, F08, operación individual desde Web ni publicación implícita desde backup.

| Decisión | Finalidad concreta | Respaldo y consumidor |
| --- | --- | --- |
| COLL-01 | Total de consumo físico por campaña/producto/unidad para lectura colectiva | OE4/OE5; URS-WEB-01, URS-REP-01; SRS-COLL-01/03, SRS-REP-01; DEC-F01-07/08. Web F07 #23–25/#28; consolidación F06 #21. |
| COLL-02 | Total expresamente solicitado por agricultores para preparar una propuesta humana | OE3/OE4; URS-MOB-03, URS-WEB-01, URS-JP-01; SRS-COLL-02, SRS-JP-02; DEC-F01-06/07/11. Mobile #34; Web F07 #26–28. |
| COLL-03 | Referencias y cantidades exactas sin identidad privada redundante | OE2/OE4/OE5; URS-PRIV-01, URS-SEC-01; SRS-IAM-02, SRS-COLL-01, SRS-PRIV-01; DEC-F01-01/07/08. F05 #16, F06 #21. |
| COLL-04 | Sustitución/cancelación causal sin duplicar ni reactivar aportes obsoletos | OE2/OE4/OE5; URS-SYNC-01; SRS-SYNC-01/02; DEC-F01-04/05. F05 #16–18. |
| COLL-05 | Retención por finalidad, auditoría mínima y separación del backup | OE2/OE4/OE5; URS-PRIV-01, URS-BKP-01; SRS-AUDIT-01, SRS-BKP-01/02; DEC-F01-08/09/10. F06 #20, F09 #40, F10 #45. |

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

`DECLARED_NEED` requiere entrada o confirmación expresa del agricultor: intención de solicitar esa cantidad total para el contexto indicado. No nace de un plan, dosis teórica, pronóstico, existencias, gasto, recomendación o cálculo automático. Confirmar una aplicación no equivale a declarar una necesidad. Mobile #34 debe crear esta capacidad; no existe un productor vigente de esta proyección en la baseline auditada.

`declared_stock` = **DENY**; no se crea un tercer tipo. SRS-JP-01 condiciona su fórmula a un stock declarado compatible **si F06 lo aprueba**. Su existencia como ejemplo/propuesta en F01/DATA_BOUNDARY no basta para incluirlo. Esta decisión no contradice la condición: sin stock aprobado, el total solicitado no se denomina `net_need`, no se resta inventario privado y no se supone stock cero. F07 #26 conserva la evaluación del algoritmo que dependa de esa condición; cualquier ampliación requiere requisito, finalidad y revisión propia de #20.

La propuesta colectiva es un draft sujeto a revisión humana. No crea compra individual, lote, movimiento, deuda, pago ni efecto sobre SQLite (DEC-F01-11; SRS-JP-02).

## 4. Propietario, identidad y autorización

El aporte se atribuye al **Member agricultor efectivo** de la sesión autenticada y su tenant; Account/Member/Session/ClientRegistration se validan en Central conforme a F02. `clientId` es identidad lógica de instalación, no identidad humana ni autorización. Tenant, Account, Member, rol, propietario y dispositivo no se admiten como campos redundantes del payload de negocio. F05 debe representar y validar su contexto sin confiar en IDs declarados por el cliente.

Mobile debe demostrar qué operaciones pertenecen a ese agricultor. La SQLite actual contiene `person_id` de familiares/terceros y no presenta una vinculación verificada de esos registros con Member/Account. Por tanto:

- No atribuir todas las aplicaciones de una instalación al usuario que inicia sesión.
- No crear Person central a partir de personas o relaciones locales.
- No publicar aplicaciones ajenas, aunque el dispositivo o una cuenta Directiva pueda leerlas localmente.
- Hasta disponer de referencias centrales y prueba de propiedad, la publicación falla cerrada. Adaptadores: Mobile #29/#32/#33; productor de necesidad: Mobile #34. Son precondiciones de los dos tipos, no campos `CONDITIONAL` ni autorización de un nuevo payload.
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

La publicación de valores numéricos exige una política aprobada que evalúe grupos pequeños, comparación entre consultas y filtros que permitan inferir un aporte individual. No se fija aquí un umbral arbitrario de anonimato. **Sin esa política, no habilitar divulgación numérica en Web/reportes**. Responsable: Roderich1 en F10 #45, con implementación F06 #21/F07 #23–25/#28. Consolidar internamente no equivale a permiso para divulgar.

`last_sync`/frescura es hora de aceptación central derivada, no `applied_at`, fecha de compra ni un timestamp privado aportado. Indica frescura, no completitud del inventario local. Un cambio de membresía o revocación exige reevaluar el acceso y la contribución bajo la política; nunca abrir lectura cross-tenant.

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
| `R_PRIVATE_LOCAL` | Dato individual o candidato excluido | Central no lo admite: cero retención en proyección y en logs/cuarentena del Sync. Conservación local pertenece a Mobile. | Roderich1: Mobile #29/#32–34; F06 #20/F10 #45 boundary. Sin periodo central. |
| `R_BACKUP_F09` | Backup privado del propietario | No ingresar al Sync; F09 define conservación, restore, integridad, cifrado y purga. No aplicar retención de proyección al backup. | Roderich1: F09 #37–40, especialmente #40. `PERIOD_DELEGATED` a F09. |

En rechazo por campos privados, la auditoría registra clasificación y referencia mínima segura, **no el valor rechazado ni el cuerpo**. No guardar conflictos como snapshots completos de SQLite. Los datos mínimos de conflicto sólo los consulta el propietario autorizado o el proceso central que necesite resolverlo; Directiva recibe estado autorizado sin cantidades individuales.

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
| Plot/Application legacy | `BLOCK_WRITES_LATER` | Bloquear escritores individuales sólo tras reemplazo aprobado, inventario de consumidores y rollback. Mobile #32/#33; #81. |
| Inventory/lots/movements legacy | `BLOCK_WRITES_LATER` | No autoridad central de inventario privado; corte de escritores separado de retiro de tablas. #81 tras #16. |
| Purchase/procurement legacy | `ADAPT_LATER` | Propuesta colectiva sin efectos individuales automáticos; consumidores y endpoints se migran en F07 #26–28/#81. |
| PayableAccount/Payment legacy | `REMOVE_LATER` | Sin destino Live; retiro contractual/consumidores antes de schema. #81; no DROP aquí. |
| Calendar legacy | `REMOVE_LATER` | No nuevo consumidor ni proyección por su mera existencia. #81 y matriz de disposición. |
| DemandForecast legacy | `REMOVE_LATER` | Forecasting fuera de alcance; no migrar a necesidad declarada. #81. |
| Cola offline Web | `REMOVE_LATER` | Web Directiva/Admin online-first; retirar mediante transición de consumidores. F07 #23–25/#81. |
| Backup privado | `NO_RELATION` | Ruta F09 separada; no reemplazarla por Sync. |

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
