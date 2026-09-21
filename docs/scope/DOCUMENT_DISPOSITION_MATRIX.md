# Matriz de disposición documental

Clasificación cerrada: `ACTIVE_CURRENT`, `ACTIVE_REQUIRES_ALIGNMENT`, `HISTORICAL_OBSOLETE`, `HISTORICAL_REFERENCE`, `EVIDENCE_ONLY`, `UNDECIDED`. La columna “Classification” expresa el resultado después de esta PR; los archivos alineados dejan de estar pendientes.

| Path | Current claim | Problem | Classification | Disposition | Replacement document | Action in this PR | Future action |
|---|---|---|---|---|---|---|---|
| `README.md` | Entrada al monorepo PWA | No declara frontera vigente | ACTIVE_CURRENT | ACTIVE_REWRITE | `docs/scope/CURRENT_SCOPE.md` | Alineado | Mantener breve |
| `AGENTS.md` | Web/PWA también para agricultor | Instrucción activa inválida | ACTIVE_CURRENT | ACTIVE_REWRITE | `docs/scope/` | Alineado | Revisar con cada decisión |
| `Back/AGENTS.md` | Backend como registro completo | Confunde legacy con requisito | ACTIVE_CURRENT | ACTIVE_REWRITE | `docs/scope/` | Alineado | Añadir reglas al aprobar contratos |
| `Web/AGENTS.md` | Web reemplaza Mobile y opera offline | Contradice autoridad Mobile | ACTIVE_CURRENT | ACTIVE_REWRITE | `docs/scope/` | Alineado | Mantener Web Directiva |
| `Back/README.md` | API del MVP web completo | No distingue destino/legacy | ACTIVE_CURRENT | ACTIVE_REWRITE | `CURRENT_SCOPE.md` | Alineado | Actualizar sólo con cambios reales |
| `Web/README.md` | README genérico Vite | No documenta producto | ACTIVE_CURRENT | ACTIVE_REWRITE | `CURRENT_SCOPE.md` | Alineado | Mantener setup real |
| `docs/scope/**` | Baseline vigente | Nuevo | ACTIVE_CURRENT | NO_CHANGE | Sí mismo | Creado | Evolucionar por decisiones aprobadas |
| `docs/adr/ADR-001-*` | Decisión propuesta | Requiere review | ACTIVE_CURRENT | NO_CHANGE | Sí mismo | Creado PROPOSED | Aceptar sólo tras review/merge |
| `docs/ai/README.md` | Índice de guías históricas como activas | Puede dirigir trabajo incorrecto | ACTIVE_CURRENT | ACTIVE_REWRITE | `docs/scope/README.md` | Alineado como índice histórico | Simplificar tras transición |
| `docs/ai/architecture-guidelines.md` | PWA y backend central operativo | Arquitectura sustituida | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `docs/ai/backend-guidelines.md` | Reglas del dominio individual central | Alcance legacy | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `docs/ai/frontend-guidelines.md` | Offline pertenece a PWA | Contradice Web online-first | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `docs/ai/mvp-scope.md` | PWA sustituye app Mobile | Contradice alcance vigente | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `docs/ai/offline-sync-guidelines.md` | Cola Web y `PAYMENT_CREATE` | Proyecta datos privados | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar para análisis legacy |
| `docs/ai/project-profile-analysis.md` | Mobile/voz/forecast fuera; PWA completa | Decisión anterior | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `docs/ai/definition-of-done.md` | DoD del MVP Web anterior | Gates no vigentes | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Crear DoD nuevo cuando se apruebe F02 |
| `docs/ai/prompting-guide.md` | Prompts para MVP Back+Web | Instrucciones obsoletas | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `docs/ai/ai-workflow-checklists.md` | Checklist del alcance anterior | Excluye Mobile/voz en general | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `docs/ai/security-and-ai-guidelines.md` | Seguridad del MVP anterior | Mezcla controles útiles y alcance viejo | HISTORICAL_REFERENCE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Reincorporar controles mediante F09 |
| `Back/docs/Flujo.md` | Flujo agricultor completo central/PWA | No vigente | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `CURRENT_SCOPE.md` | Banner | Preservar |
| `Back/docs/modelo-datos-flujo.md` | Modelo central ampliado | No define autoridad vigente | HISTORICAL_REFERENCE | HISTORICAL_BANNER | Matrices scope | Banner | Usar sólo en inventario legacy |
| `Back/docs/codex-backend-implementation.md` | Plan del backend anterior | Podría reactivar scope viejo | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `TRANSITION_PLAN.md` | Banner | Preservar |
| `Back/docs/frontend-directiva-sync-ag2.md` | Compra conjunta con efectos y cola Web | Contradice propuesta sin efectos | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | Matrices scope | Banner | Preservar para consumidores |
| `Back/docs/frontend-hu16-hu20.md` | Contratos HU legacy | No es alcance vigente | HISTORICAL_REFERENCE | HISTORICAL_BANNER | `LEGACY_CONTRACT_CONSUMERS.md` | Banner | Preservar hasta retiro |
| `Back/docs/frontend-inventory-ag2.md` | CRUD inventario Web | Autoridad pasa a Mobile | HISTORICAL_REFERENCE | HISTORICAL_BANNER | `LEGACY_CONTRACT_CONSUMERS.md` | Banner | Preservar hasta retiro |
| `Back/docs/frontend-procurement-payables-inventory-ag2.md` | Compras/deudas Web | Datos privados fuera de Web | HISTORICAL_REFERENCE | HISTORICAL_BANNER | `LEGACY_CONTRACT_CONSUMERS.md` | Banner | Preservar hasta retiro |
| `Web/docs/codex-frontend-implementation.md` | Fases de PWA operativa | Contradice Web Directiva | HISTORICAL_OBSOLETE | HISTORICAL_BANNER | `TRANSITION_PLAN.md` | Banner | Preservar |
| `Back/src/bootstrap/README.md` | Marcador técnico interno | Sin afirmación de alcance | ACTIVE_CURRENT | NO_CHANGE | N/A | Sin cambio | Mantener con código |
| `Back/src/shared/README.md` | Marcador técnico interno | Sin afirmación de alcance | ACTIVE_CURRENT | NO_CHANGE | N/A | Sin cambio | Mantener con código |
| `rcr-Perfil_de_proyecto_de_grado_v8.docx` | Perfil académico previo con Mobile, voz, forecast y otros procesos | Binario histórico; no equivale a baseline aprobada | HISTORICAL_REFERENCE | NO_CHANGE | `CURRENT_SCOPE.md` | No se modifica el binario | Conservar como evidencia; nueva versión fuera de esta PR |
| `jmeter-tests/reporte/sbadmin2-1.0.7/**` | Documentación vendorizada del reporte | No define alcance del producto | EVIDENCE_ONLY | NO_CHANGE | N/A | Sin cambio | No editar manualmente |

No quedaron documentos `UNDECIDED`: cada documento de proyecto auditado tiene una clasificación. Los archivos vendorizados se agrupan porque comparten origen y disposición.
