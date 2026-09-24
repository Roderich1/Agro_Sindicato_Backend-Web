# F01 — Corrigendum semántico posterior al gate

## Identidad y autoridad

- Fecha: 2026-09-24.
- Baseline de `main`: `8d021eedaf14bbaf066f0134fb95979ace457a54` (merge de PR #89).
- Issue: [F01-CORR-01 #90](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/90).
- Rama: `docs/f01-semantic-corrigendum`.
- Alcance: documentación y gobierno; no se reabre GATE-F01 ni se inicia F02-D/#12.

El Proyecto de Grado académico vigente es la autoridad sobre OE1–OE5, alcance, responsabilidades Mobile/Central/Web y capacidades requeridas. Las decisiones y requisitos F01 formalizan, detallan y trazan esa autoridad; no añaden capacidades por la mera existencia de código o schema. La interpretación académica de este corrigendum fue fijada por el propietario en #90. El DOCX de perfil anterior y las guías marcadas `HISTORICAL / OBSOLETE` se conservan como evidencia de formulaciones previas; no se citan como fuente para crear un nuevo requisito Live.

Clasificaciones utilizadas: `OK_CURRENT_REQUIREMENT`, `LEGACY_HISTORICAL`, `OPTIONAL_EXAMPLE`, `OVERSTATEMENT_TO_FIX`, `NO_LIVE_TARGET` y `DELEGATED_DETAIL`. Una fila `OVERSTATEMENT_TO_FIX` describe un hallazgo **anterior** a esta PR; su corrección figura en la columna siguiente. Tras el scan final no queda un hallazgo de esa clase sin corregir en la documentación activa auditada.

## Hallazgos y disposición

| Archivo | Sección / formulación previa | Clasificación | Corrección o lectura vigente | Fuente de autoridad |
|---|---|---|---|---|
| `docs/scope/README.md`; `docs/requirements/README.md` | F01 figuraba como fuente primaria de capacidad | OVERSTATEMENT_TO_FIX | Jerarquía explícita: PG académico → interpretación vigente → F01 formaliza/traza → legacy evidencia | PG vigente; #90 |
| `docs/scope/CURRENT_SCOPE.md` §3 | “campañas personales/locales” bajo autoridad Mobile | OVERSTATEMENT_TO_FIX | Central/Directiva define campaña compartida; Mobile usa/cachea el contexto offline | PG vigente; #90 |
| `docs/scope/CURRENT_SCOPE.md` §3; `docs/requirements/URS.md` URS-MOB-02 | Lotes y movimientos presentados como capacidades Mobile obligatorias | OVERSTATEMENT_TO_FIX | Inventario/stock, compra, transferencia y aplicación son capacidades; lotes/movimientos son detalles técnicos condicionales | PG vigente; OE3; #90 |
| `docs/scope/CAPABILITY_DISPOSITION_MATRIX.md` `accounts-payable` | Target Mobile y “finanzas individuales privadas” | OVERSTATEMENT_TO_FIX → NO_LIVE_TARGET | Backend/Web legacy; target ninguno Live; `REMOVE_FROM_LIVE_SCOPE` con retiro controlado | PG vigente; #90; #81 |
| `docs/scope/CAPABILITY_DISPOSITION_MATRIX.md` `Purchase/Payable/Payment` | Modelos agrupados con target Mobile | OVERSTATEMENT_TO_FIX | Filas separadas: `Purchase` individual Mobile; propuesta Central/Web; `PayableAccount/Payment` sin target Live | PG vigente; #90 |
| `docs/scope/DATA_BOUNDARY_MATRIX.md` payable/payment | “PostgreSQL legacy / SQLite target”, owner Mobile | OVERSTATEMENT_TO_FIX → NO_LIVE_TARGET | Sólo PostgreSQL legacy hasta retiro; no traslado a SQLite/Mobile | PG vigente; #90; #81 |
| `docs/scope/LEGACY_CONTRACT_CONSUMERS.md` `/accounts-payable/*` | Replacement “Operación Mobile” | OVERSTATEMENT_TO_FIX → NO_LIVE_TARGET | Ningún replacement Live; inventario de consumidores conservado para exportación, retención y retirada segura | PG vigente; #90; #81 |
| `docs/scope/TRANSITION_PLAN.md` | “backup metadata” en API paralela podía parecer arquitectura fijada | OVERSTATEMENT_TO_FIX → DELEGATED_DETAIL | F01 fija recuperación privada separada de Sync; metadata/provider/almacenamiento físico se deciden en F09 | PG vigente; URS-BKP-01; #90 |
| `docs/scope/CURRENT_SCOPE.md` §§4,6,8,10; `docs/requirements/URS.md` URS-MOB-03 | Consentimiento mencionado como mecanismo aprobado | OVERSTATEMENT_TO_FIX | Finalidad y autorización aplicables; consentimiento formal sólo con requisito legal/académico aprobado | PG vigente; #90 |
| `docs/scope/DATA_BOUNDARY_MATRIX.md` declared stock | “Compartida por consentimiento” y cálculo implícito | OVERSTATEMENT_TO_FIX → DELEGATED_DETAIL | `declared_stock`, shape y unidades sujetos al contrato F06; `net_need` sólo si se aprueba y es compatible | PG vigente; DEC-F01-06; F06 #20 |
| `docs/scope/CURRENT_SCOPE.md` §10; `docs/requirements/SRS.md` SRS-PRIV-01 | Enumeración de datos podía leerse como features obligatorios | OVERSTATEMENT_TO_FIX → OPTIONAL_EXAMPLE | Exclusión condicional si existen; enumeración no crea captura/persistencia; deuda/pago además sin target Live | PG vigente; URS-PRIV-01; #90 |
| `docs/requirements/SRS.md` SRS-JP-01 | `declared_stock` parecía parte fija de F01 | OVERSTATEMENT_TO_FIX → DELEGATED_DETAIL | Cálculo condicionado al contrato F06 aprobado y unidades compatibles | PG vigente; F06 #20; #90 |
| `docs/requirements/SRS.md` SRS-BKP-01/02; `docs/requirements/URS.md` URS-BKP-01 | Storage/metadata Central como obligación fija | OVERSTATEMENT_TO_FIX → DELEGATED_DETAIL | Recuperación remota privada, autenticada, íntegra y separada de Sync; detalles físicos, cifrado y metadata exacta en F09 | PG vigente; F09 #37–#40; #90 |
| `docs/requirements/TRACEABILITY_MATRIX.md` | Trazas podían heredar la semántica ampliada de URS/SRS | DELEGATED_DETAIL | Nota de lectura condiciona SRS-PRIV, `declared_stock` y backup F09; IDs/OE sin cambios | PG vigente; #90 |
| `docs/architecture/F01_INTEGRATION_DECISIONS.md` DEC-F01-06/08/10/11 | Consentimiento, metadata/storage, deuda/pago en decisión congelada | LEGACY_HISTORICAL | Texto original preservado; tabla `Post-gate clarification` fija interpretación posterior por decisión | #8; #9; PG vigente; #90 |
| `docs/adr/ADR-001-mobile-individual-system-of-record.md` | Pagos Mobile, consentimiento Central, metadata y lista privada | LEGACY_HISTORICAL | `ACCEPTED` y texto de 2026-09-21 intactos; clarificación fechada al final | ADR-001; PR #82; PG vigente; #90 |
| `docs/scope/CAPABILITY_DISPOSITION_MATRIX.md` calendar/CalendarEvent | Sin target Live | OK_CURRENT_REQUIREMENT / NO_LIVE_TARGET | Se conserva `REMOVE_FROM_LIVE_SCOPE`; no se traslada a Mobile | PG vigente; #81 |
| `docs/scope/CAPABILITY_DISPOSITION_MATRIX.md` DemandForecast | Sin target Live | OK_CURRENT_REQUIREMENT / NO_LIVE_TARGET | Se conserva la exclusión de forecasting/IA | PG vigente; #81 |
| `docs/requirements/URS.md` URS-VOICE-01; `docs/requirements/SRS.md` SRS-VOICE-01 | Voz condicional y confirmación humana | OK_CURRENT_REQUIREMENT | Se preserva; audio/transcripción sólo son ejemplos privados si existen | PG vigente; PRE-VOICE/EVO |

## Búsqueda residual

Se inspeccionaron `docs/scope/`, `docs/requirements/`, `docs/architecture/F01_INTEGRATION_DECISIONS.md` y `docs/adr/ADR-001-mobile-individual-system-of-record.md` con patrones `accounts-payable|PayableAccount|Payment|deuda|pago|financier|consentimiento|campañas personales|campañas locales|factura|relaciones familiares|metadata|storage|lote|movimiento|audio|transcrip|calendar|calendario` (sin distinguir mayúsculas). Las ocurrencias restantes se clasifican por conjunto semántico; ninguna requiere borrado mecánico:

| Ubicación residual | Clasificación | Por qué permanece |
|---|---|---|
| Texto original de DEC-F01-01/06/08/10/11 y ADR-001 | LEGACY_HISTORICAL | Aceptación histórica preservada; la aclaración posterior aparece visible en ambos documentos. |
| `CURRENT_SCOPE`, URS/SRS, matrices y aclaraciones que mencionan consentimiento formal | DELEGATED_DETAIL | Sólo condicional a requisito legal/académico aprobado; autorización/finalidad gobiernan ahora. |
| `CURRENT_SCOPE`, SRS-PRIV, matriz de datos y ADR aclarado: relaciones, notas, fotos/facturas, lotes/movimientos, audio/transcripción | OPTIONAL_EXAMPLE | Protección si existen; ninguna mención crea captura o persistencia. |
| Matrices, inventario de consumidores y plan: `accounts-payable`, `PayableAccount`, `Payment`, deuda/pago | LEGACY_HISTORICAL / NO_LIVE_TARGET | Nombres/consumidores observados y retiro controlado; compra individual aparece separada. |
| Matrices e inventario: `calendar`/`CalendarEvent` | NO_LIVE_TARGET | Sin target Live y sin migración a Mobile. |
| Matriz de capacidades: `DemandForecast` | NO_LIVE_TARGET | Placeholder histórico; forecasting no se implementa. |
| Scope, URS/SRS, plan y aclaraciones: `metadata`/`storage` de backup | DELEGATED_DETAIL | F09 decide ubicación, forma física y metadata exacta. |
| `CURRENT_SCOPE` y ADR aclarado: “campañas personales/locales” | LEGACY_HISTORICAL / OK_CURRENT_REQUIREMENT | Sólo se nombra para negar esa autoridad; campaña compartida Central es el contexto. |
| `LEGACY_CONTRACT_CONSUMERS` y `DOCUMENT_DISPOSITION_MATRIX` | LEGACY_HISTORICAL | Inventario de nombres de módulos, endpoints y archivos; no target de producto. |

`OVERSTATEMENT_TO_FIX` residual en documentación activa auditada: **0**. Las ocurrencias originales de ADR/DEC permanecen como `LEGACY_HISTORICAL` con interpretación posterior explícita.

## Preservación y compatibilidad

- [#8](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/8#issuecomment-5819916172): aclaración posterior del término “consentimiento”; issue cerrado y comentarios previos intactos.
- [#9 GATE-F01](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/9#issuecomment-5819916547): comentario post-gate; `Passed / Verified / Done` se conserva.
- [#80](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/80#issuecomment-5819916916): aclaración de vínculo/autorización y separación Purchase/Payable/Payment; cierre histórico intacto.
- [#81](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81): permanece `OPEN / Blocked`; retirar payables/pagos centrales es un target correcto, sin modificar dependencias.
- [Mobile #34](https://github.com/Roderich1/AppMovilAgroquimico/issues/34#issuecomment-5819917218): “deudas familiares/liquidaciones/fotos” son exclusiones condicionales, no features exigidas; sin cambios de código Mobile.

La aclaración no exige rediseño de entregas F02 integradas:

- **F02-A compatible:** Account/User y Member centrales permanecen; `Person` sigue condicional y `PERSON_NOT_MATERIALIZED`.
- **F02-B compatible:** clientId lógico y ClientRegistration siguen respondiendo a identidad/idempotencia; no dependen de un consent service ni de Payable/Payment.
- **F02-C compatible:** AuthSession, refresh V1/V2 y client binding permanecen; la ventana de access legacy y delegación a #12 siguen documentadas.

No se identificó incompatibilidad que exija cambio de schema o código. #12 sigue `OPEN / Ready`, #14 Backlog, GATE-F02 Pending y #81 Blocked.

## Integridad de la entrega

`NO_PRODUCT_CODE_CHANGED`: sólo archivos `docs/`. `NO_SCHEMA_CHANGED` y `NO_MIGRATION_CHANGED`: ningún archivo `Back/prisma/` modificado. `NO_DATA_CHANGED`: no se ejecutó mutación de bases. No se cambiaron paquetes ni dependencias. Este corrigendum no es una nueva decisión de producto ni reescribe commits, tags, fechas o evidencia negativa. Las validaciones documentales se registran en la PR; no se presentan tests de producto como evidencia nueva de esta entrega.

| Control documental | Resultado |
|---|---|
| `git diff --check` y diff staged | PASS; sin whitespace defectuoso |
| Links locales en los 13 archivos de documentación cambiados | PASS; 43 destinos existentes |
| Scan UTF-8 de prefijos U+00C3, U+00C2, U+00E2 y U+FFFD | PASS; 0 ocurrencias sospechosas |
| Archivos de producto, Prisma, migraciones y paquetes en diff | 0 |
| Revisión de términos residuales | Clasificados arriba; `OVERSTATEMENT_TO_FIX` activo sin resolver = 0 |
