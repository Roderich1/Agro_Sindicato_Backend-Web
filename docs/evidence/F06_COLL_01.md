# Evidencia F06-COLL-01 — propuesta para auditoría independiente

Fecha de ejecución: 2026-10-06, America/La_Paz. Clasificación de entrega: `F06_COLL_01_CONTRACT_READY_FOR_AUDIT`. **No equivale a contrato aprobado, aceptación de #20 ni PASS de un gate.**

## 1. Preflight y aislamiento

| Control | Resultado observado |
| --- | --- |
| Backend remoto main | `6fa1c0c0083965b7d8da0b8ac3cd1907a418f29e`, exacto al prompt; contiene higiene PR #97. |
| Mobile remoto main | `278cbd32dc59b26824f59fcefb77bebbc3cecb95`, exacto al prompt. |
| Fetch Backend | `git fetch --all --prune` antes de trabajo documental; referencias remotas verificadas. |
| Branch de trabajo | `docs/f06-coll-01-collective-projection`, creada desde el SHA Backend indicado, en worktree nuevo inicialmente limpio. |
| Mobile | Lectura del objeto Git `278cbd32…` mediante `git show`/`git grep`/`git ls-tree`; no checkout, edición, fetch ni uso de su working copy como baseline. |
| Cambios locales previos | Conservados en los worktrees originales Backend y Mobile; no se incorporan al PR. |
| Issues leídos completos | Backend #20, #81, #16, #17, #18, #19, #21, #22 mediante GitHub API; estados OPEN y cuerpos capturados antes de cambios de tablero. |
| F02 histórico | El SHA formal histórico `a09876106dd696868217b301a9abf9125ac6d01d` sigue siendo evidencia histórica; no sustituye la baseline main de este trabajo. |

La publicación se condiciona a repetir la verificación de ambas referencias remotas y los controles documentales de §8. Si Backend cambia antes de publicar, detener con `F06_COLL_01_BASELINE_CHANGED`. HEAD final y enlace PR se registran en la metadata del PR draft y el comentario de #20; no se incluye el SHA autorreferencial del commit dentro de este archivo.

## 2. Fuentes autoritativas Backend leídas

Todos estos archivos existentes quedan intactos:

| Fuente | Uso en la decisión |
| --- | --- |
| [ADR-001](../adr/ADR-001-mobile-individual-system-of-record.md) | Autoridad Mobile individual, Central compartida/colectiva, Web Directiva; Sync separado de backup. |
| [CURRENT_SCOPE](../scope/CURRENT_SCOPE.md) | Finalidades académicas y límites actuales. |
| [CAPABILITY_DISPOSITION_MATRIX](../scope/CAPABILITY_DISPOSITION_MATRIX.md) | Capacidades Live frente a deuda legacy; no resucitar finanzas, forecasting o Web agricultor. |
| [DATA_BOUNDARY_MATRIX](../scope/DATA_BOUNDARY_MATRIX.md) | Candidatos PROPOSED/TBD no son permisos; exactitud delegada a #20. |
| [LEGACY_CONTRACT_CONSUMERS](../scope/LEGACY_CONTRACT_CONSUMERS.md) | Consumidores que no pueden retirarse por conveniencia documental. |
| [TRANSITION_PLAN](../scope/TRANSITION_PLAN.md) | Cambio gradual, rollback y retiro contractual separado. |
| [F01_INTEGRATION_DECISIONS](../architecture/F01_INTEGRATION_DECISIONS.md) | DEC-F01-01–12 y aclaración posterior al gate; separación identidad/dominio; default deny. |
| [URS](../requirements/URS.md) | Necesidad explícita, consumo/colectivos, privacy, security, backup y reports. |
| [SRS](../requirements/SRS.md) | SRS-COLL-01/02/03, SRS-SYNC-01/02, SRS-IAM-02, SRS-JP-01/02, SRS-AUDIT-01. |
| [TRACEABILITY_MATRIX](../requirements/TRACEABILITY_MATRIX.md) | OE → URS → SRS → fase/issue; baseline no acredita implementación. |
| [F02_AUTHORIZATION_MATRIX](../security/F02_AUTHORIZATION_MATRIX.md) | Contexto autenticado y acceso legacy temporal no equivalentes al permiso de destino. |
| [DEVELOPMENT_CONTROLS](../security/DEVELOPMENT_CONTROLS.md) / AGENTS.md | Preservar cambios ajenos, no secretos/datos privados en evidencia, proporcionalidad de controles. |

## 3. Inventario técnico Backend/Web inspeccionado (read-only)

Los archivos de código describen estado actual, **no fuentes de requisitos nuevos**. Rutas relativas a Backend baseline:

| Área | Rutas inspeccionadas | Hallazgo relevante |
| --- | --- | --- |
| Schema | `Back/prisma/schema.prisma` | Campaña/producto/crop centrales; Plot/Application/Inventory/Payable/Payment/Calendar/Forecast legacy; SyncOperation guarda `payload`, SyncConflict snapshots; AuditLog admite before/after/metadata. |
| Sync | `Back/src/modules/sync/application/dto/sync-operations.dto.ts`; `use-cases/sync-operations.use-case.ts` | Operaciones históricas de stock, plots, aplicaciones y pagos; payloads amplios y efectos privados. No es implementación de los dos tipos propuestos. |
| Campaign | `Back/src/modules/campaigns/application/services/campaign-context.service.ts`; `use-cases/campaign-management.use-case.ts` | Campaña central habilitada por estado `ABIERTA` y `isActive`; no equiparar ACTIVE local por nombre. |
| Product | `Back/src/modules/inventory/application/use-cases/product-catalog.use-case.ts` | Ficha compartida incluye campos legacy de stock; su presencia no autoriza proyección de inventario privado. |
| Crop/plots | `Back/src/modules/plots/application/use-cases/plot-flow.use-case.ts` | Separar Crop de catálogo central de parcela/propiedad individual. No hacen falta para los totales autorizados. |
| Inventory | `Back/src/modules/inventory/application/use-cases/inventory-stock.use-case.ts`; `inventory-lot.use-case.ts` | Stock/lotes individuales centrales existentes son consumidores de transición, no nuevas entidades target. |
| Applications | `Back/src/modules/applications/application/use-cases/applications.use-case.ts`; `dto/application.dto.ts` | Detalle operativo histórico diferente de aplicación multiproducto Mobile; no replicarlo ni publicar dosis/costos. |
| Reports | `Back/src/modules/reports/application/use-cases/reports.use-case.ts` | Reportes legacy mezclan detalle operativo/financiero; no copiar dataset a vistas F07. |
| Procurement | `Back/src/modules/procurement/application/use-cases/create-joint-purchase.use-case.ts` | Flujo legacy crea efectos individuales (lotes, movimientos, cuentas/calendario); propuesta target prohíbe esos efectos automáticos. |
| Audit | `Back/src/modules/audit-logs/application/use-cases/list-audit-logs.use-case.ts` | Retorna información/snapshots amplios; nueva auditoría debe minimizar, sin retirar endpoint aquí. |
| Web | Inventario de consumidores en LEGACY_CONTRACT_CONSUMERS y estructura `Web/src` | Stock, compras/cuentas y cola offline existentes no constituyen permiso del contrato target. Su retiro se delega a #81/F07. |

## 4. Inventario Mobile y evidencia negativa

Repositorio [AppMovilAgroquimico](https://github.com/Roderich1/AppMovilAgroquimico/tree/278cbd32dc59b26824f59fcefb77bebbc3cecb95), exclusivamente SHA auditado:

| Rutas/elementos inspeccionados | Evidencia y límite |
| --- | --- |
| `lib/data/app_database.dart`, creación y upgrades, schemaVersion 6 | Personas, farms, campañas/productos locales, planes, compras, allocations, pagos, lotes/movimientos, aplicaciones multiproducto/FIFO, cuentas, transferencias y settings. IDs de negocio enteros locales. Ningún equivalente central se deduce automáticamente. |
| `lib/data/agro_repository.dart`, catálogos y campañas | Local ACTIVE/PLANNED/CLOSED; productos L/KG con ML/G. No binding central aprobado visible en este schema. |
| `lib/domain/models.dart`, `lib/domain/money.dart` | PersonRole ADMIN/FAMILY/THIRD_PARTY, settlement policies, drafts privados; 1000 base units por L/KG. Magnitudes monetarias/fx no son unidades físicas. |
| Repository `confirmApplication`, `reverseApplication` | Confirmación usa persona/chaco/campaña, varias líneas, lotes/costos/cuentas; reversión local debe excluir consumo vigente. No atribuir todas las personas de instalación al login. |
| Repository `addPlanMulti`, `inventorySummary`, `personStockSummary` | Plan calcula necesidad teórica por dosis/área; stock comprometido/proyectado y saldos de inventario permanecen privados. No son declaración explícita. |
| Repository `productCostReport`, statements/estado de cuenta | Reporte por producto/campaña suma cantidades y costos; no filtra por Member/Account ni demuestra propiedad de cada persona. No reutilizar ese reporte íntegro como adaptador de proyección. |
| Repository compras/allocations/transferencias/pagos | Datos financieros, destinatarios y FIFO reales pero privados; existencia no justifica centralización. |
| `lib/domain/read_models.dart`; `lib/services/reports/report_export_service.dart`, `csv_report_generator.dart`, `pdf_report_generator.dart` | Reportes/exportaciones individuales y archivos no son datasets colectivos autorizados. |
| `lib/services/auth/auth_v2_models.dart`, `auth_v2_api.dart`, `first_activation_coordinator.dart`, `secure_session_store.dart` | Account/Member/Tenant/Session/cliente autenticados separados de SQLite operativa; endpoints auth no implementan la proyección de negocio. Credenciales nunca se copian a payload/evidencia. |
| `lib/data/installation_client_id_store.dart` | UUID v4 lógico; sin fingerprint físico; almacenamiento fuera de SQLite/backup privado. Necesario como contexto F05, no como quinto campo de negocio. |
| `lib/data/backup_service.dart` | ZIP `.agrobackup`, schema/archivos/manifiesto e integridad de recuperación privada; no proveedor de publicaciones colectivas. |

Búsqueda `git grep` en `lib` al SHA auditado de `declared_need`, `declared_stock`, `declaredNeed`, `DeclaredNeed`, `member_id`, `tenant_id`, `campaign_ref`, `product_ref`: **sin coincidencias**. El resultado no niega modelos IAM en camelCase; demuestra ausencia de esos productores/bindings en el dominio SQLite inspeccionado, complementada con lectura de schema/repositorio. No existe evidencia suficiente para afirmar que un adaptador de propiedad/referencias o una publicación colectiva estén implementados.

No se usaron datos de una SQLite real, fotos privadas, tokens, backups reales ni credenciales como evidencia. Los casos adversariales son invariantes de contrato futuros, **no resultados de pruebas ejecutadas**.

## 5. Trazabilidad de cada ALLOW

La [matriz](../architecture/F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md) tiene **126 filas y 22 columnas**: ALLOW **8**, DENY **118**, CONDITIONAL **0**. Cuatro nombres distintos de negocio, repetidos justificadamente por tipo. Toda inclusión sigue esta cadena:

| Decisión → campo | OE | URS | SRS | DEC | Archivo fuente | Consumidor | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| COLL-01/03 → CONSUMPTION_TOTAL.campaign_ref | OE4/OE5 | URS-WEB-01/REP-01/PRIV-01 | SRS-COLL-01/03; SRS-REP-01 | DEC-F01-07/08 | URS/SRS/F01; Mobile app_database/agro_repository; Backend campaign-context | F06 #21; Web total por campaña | Mobile [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33); Backend #16; F07 #23–25/#28 |
| COLL-01/03 → CONSUMPTION_TOTAL.product_ref | OE4/OE5 | URS-WEB-01/REP-01/PRIV-01 | SRS-COLL-01/03; SRS-REP-01 | DEC-F01-07/08 | URS/SRS/F01; Mobile application_items/products; Backend product-catalog | F06 #21; Web total por producto | Mobile [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33); Backend #16; F07 #23–25/#28 |
| COLL-01/03 → CONSUMPTION_TOTAL.base_unit | OE4/OE5 | URS-WEB-01/REP-01/PRIV-01 | SRS-COLL-01/03; SRS-REP-01 | DEC-F01-07/08 | URS/SRS/F01; Mobile app_database/money; Backend Product.unit | F06 #21; Web cantidad interpretable | Mobile [Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33); Backend #16; F07 #23–25/#28 |
| COLL-01/03 → CONSUMPTION_TOTAL.quantity_base | OE4/OE5 | URS-WEB-01/REP-01/PRIV-01 | SRS-COLL-01/03; SRS-REP-01 | DEC-F01-07/08 | URS/SRS/F01; Mobile confirmApplication/reverseApplication; application_items | F06 #21; Web consumo físico agregado | Mobile [Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33); Backend #16; F07 #23–25/#28 |
| COLL-02/03 → DECLARED_NEED.campaign_ref | OE3/OE4 | URS-MOB-03/JP-01/PRIV-01 | SRS-COLL-01/02; SRS-JP-02 | DEC-F01-06/07/08/11 | URS/SRS/F01/DATA; catálogos Mobile/Backend, productor futuro | F06 #21; Web propuesta por campaña | Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34)/[Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29); Backend #16; F07 #26–28 |
| COLL-02/03 → DECLARED_NEED.product_ref | OE3/OE4 | URS-MOB-03/JP-01/PRIV-01 | SRS-COLL-01/02; SRS-JP-02 | DEC-F01-06/07/08/11 | URS/SRS/F01/DATA; catálogos Mobile/Backend, productor futuro | F06 #21; Web propuesta por producto | Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34)/[Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29); Backend #16; F07 #26–28 |
| COLL-02/03 → DECLARED_NEED.base_unit | OE3/OE4 | URS-MOB-03/JP-01/PRIV-01 | SRS-COLL-01/02; SRS-JP-02 | DEC-F01-06/07/08/11 | URS/SRS/F01; Mobile app_database/money; Backend Product.unit | F06 #21; Web cantidad solicitada compatible | Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34); Backend #16; F07 #26–28 |
| COLL-02/03 → DECLARED_NEED.quantity_base | OE3/OE4 | URS-MOB-03/JP-01/PRIV-01 | SRS-COLL-01/02; SRS-JP-02 | DEC-F01-06/07/08/11 | URS/SRS/F01, especialmente DEC-F01-06; entrada expresa futura, no plan actual | F06 #21; Web propuesta humana | Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34); Backend #16; F07 #26–28 |

Los abreviados `URS-REP-01`, `URS-PRIV-01`, `URS-JP-01` son los IDs completos definidos en URS. Las rutas exactas de código están en §§3–4 y en el índice de fuentes de la matriz; código sólo prueba existencia/unidades, la autorización deriva de requisitos/decisiones.

## 6. Decisiones, incertidumbres y consistencia F01

| Asunto | Decisión / evidencia negativa | Responsable siguiente |
| --- | --- | --- |
| Necesidad declarada | Sólo origen expreso del agricultor; no productor vigente observado. Ausente ≠ cero; cancelada ≠ cero declarado. | Mobile [Roderich1/AppMovilAgroquimico#34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34). |
| declared_stock | DENY; sin finalidad/shape aprobadas suficientes para inclusión. SRS-JP-01 es condicional, no obligación de copiar inventario. No llamar net_need al total solicitado ni asumir stock cero. | F07 #26 evalúa fórmula bajo contrato aprobado; cualquier ampliación vuelve a F06 #20 con trazabilidad. |
| Referencias y propiedad | Enteros locales no son UUID centrales; personas locales no se vinculan automáticamente al login. Publicación falla cerrada hasta adaptadores demostrados. | Mobile [Roderich1/AppMovilAgroquimico#29](https://github.com/Roderich1/AppMovilAgroquimico/issues/29)/[Roderich1/AppMovilAgroquimico#32](https://github.com/Roderich1/AppMovilAgroquimico/issues/32)/[Roderich1/AppMovilAgroquimico#33](https://github.com/Roderich1/AppMovilAgroquimico/issues/33); F05 #16. |
| Person/familia | Person central sigue condicional; ninguna finalidad de estos dos tipos requiere nombres/relaciones. | F02/F06 sólo ante nueva finalidad aprobada. |
| Divulgación de agregados | No se afirma anonimato; riesgo de grupos pequeños/diferencia temporal. Sin política aprobada no habilitar salida numérica Web. | F10 #45; F06 #21; F07 #23–25/#28. |
| Retención | Inicio/finalidad/salida/clase/owner definidos; no números arbitrarios. Plazos y garantías replay `PERIOD_DELEGATED` antes de producción/removal. | Roderich1: F06 #20; F05 #16/#17; F09 #40; F10 #45 según clase. |
| Autorización/consentimiento | Exigir autorización aplicable; no inventar consentimiento formal ni servicio implementado. | F02 contexto; F10 #45 si requisito legal/académico aprobado exige consentimiento formal. |
| Conflicto | Causalidad y decisión del propietario por tipo; no LWW universal, suma o máximo; sin overwrite de SQLite. | F05 #16–18 y reconciliación F06 #21. |
| Auditoría | Sólo contexto/acción/resultado/referencias/hora derivados; no payloads/snapshots/secretos. | F05 #16; F10 #45; transición #81. |
| Compra/propuesta | Propuesta no crea compras, stock, deuda, pagos ni efectos privados. Legacy contrario se mantiene sólo hasta transición aprobada. | F07 #26–28/#81. |

`F01_CONSISTENCY_FINDING`: **ninguna contradicción material identificada**. Se contrastaron especialmente stock condicional (SRS-JP-01), Person condicional (DEC-F01-01), consentimiento según aclaración F01 y separación Sync/backup (DEC-F01-10). F01/F02 no se editan. Las incompatibilidades del código legacy con el target son hallazgos de transición; no se presentan como requisitos a conservar ni como fallos de gates históricos.

## 7. Handoff y gobernanza

El bloque exacto [INPUT_FOR_F05_SYNC_04](../architecture/F06_COLLECTIVE_PROJECTION_CONTRACT.md#input_for_f05_sync_04) entrega tipos, whitelist, exclusiones, autoridad, identidad de dominio, PUBLISH/SUPERSEDE/CANCEL, causalidad, privacidad/retención, consumidores, rechazos y casos adversariales. F05 conserva versión/envelope/clave técnica/ACK/retry/códigos/persistencia; este PR no los congela ni los implementa.

Impacto [#81](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81): queda **documentada como propuesta** la proyección mínima y su whitelist/exclusiones; su bloqueador #20 sólo se considera satisfecho tras auditoría independiente y aceptación/merge correspondiente. **#81 sigue Blocked** y el contrato Sync versionado #16 sigue pendiente. Ninguna casilla de #81 o #20 se marca. No se cambia ningún gate.

Project 3: opciones verificadas mediante `gh project field-list`: Status dispone de Backlog, In Progress, In Review, Validation, Blocked, Done; Evidence dispone de Pending, Partial, Verified, N/A. #20 empezó Backlog/Pending/Gate N/A; transición autorizada Backlog → In Progress → In Review, Evidence Partial por documentación candidata, jamás Verified/Done. Gate #20 N/A se conserva. #22 sigue Backlog/Pending/Gate Pending; #81 sigue Blocked/Pending/Gate N/A.

El comentario autorizado en #20, al existir el draft, registra `F06-COLL-01_READY_FOR_INDEPENDENT_AUDIT`, PR, HEAD, baselines, archivos, recuentos y controles de no implementación. El issue permanece OPEN con cuerpo/criterios originales. No se inicia #16, no se hace merge.

## 8. Validación documental y límites de evidencia

Controles de entrega: scope exacto de tres archivos nuevos; `git diff --check` sobre cambios staged; tablas de matriz con 22 celdas, recuentos 8/118/0, whitelist idéntica al contrato y trazabilidad de cada ALLOW; enlaces locales válidos; marcadores obligatorios y clases de retención presentes; codificación UTF-8; comparación de blobs para confirmar que los documentos baselined y código existente quedan intactos. Resultados detallados se conservan en el registro de ejecución externo al repositorio, sin introducir un cuarto artefacto.

No existe guard documental dedicado aplicable localizado en el inventario del repo. `.github/workflows/backend-f02.yml` filtra Back/docs API/security/testing/F02 evidence; este cambio de tres Markdown F06 no activa ese workflow por sus rutas. Cualquier check automático adicional será regresión/infraestructura y **no validación del contrato de privacidad**.

No se ejecutan app tests, build, Prisma, migraciones, base de datos ni suites de reconciliación. Son trabajo futuro; no se declara evidencia runtime o diferencia de reconciliación cero.

```text
NO_CODE_CHANGES
NO_PRISMA_CHANGES
NO_MIGRATIONS
NO_DATA_CHANGES
NO_MOBILE_CHANGES
```

Archivos exactos de la entrega:

1. `docs/architecture/F06_COLLECTIVE_PROJECTION_CONTRACT.md`
2. `docs/architecture/F06_COLLECTIVE_PROJECTION_FIELD_MATRIX.md`
3. `docs/evidence/F06_COLL_01.md`

Siguiente acción única: `INDEPENDENT_AUDIT_F06_COLL_01`.
