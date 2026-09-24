# ADR-001: Mobile as Individual System of Record and Central as Authorized Collective Projection

- **Status:** ACCEPTED
- **Decision date:** 2026-09-21
- **Accepted through:** F01 scope/architecture review and PR #82
- **Decision owners:** revisión F01

**Lectura vigente:** la aceptación histórica se conserva. La [clarificación posterior](#clarificación-posterior--2026-09-24) delimita formulaciones que excedían el alcance académico; no altera retrospectivamente esta decisión.

## Context

El repositorio conserva una implementación donde Backend y Web cubren operaciones individuales. El alcance académico vigente separa la gestión privada offline-first de la planificación colectiva.

## Problem

Se necesita una autoridad inequívoca para datos individuales, una proyección central mínima y una Web que no se convierta en segundo cliente operativo del agricultor.

## Decision

Se acepta que Flutter/Mobile sea el sistema de registro individual y offline-first; el Backend central gestione identidad, compartidos, proyección colectiva autorizada, sync idempotente, propuesta colectiva y metadata de backup; y Web sea un cliente online-first de Directiva/Admin.

Esta aceptación define exclusivamente la arquitectura target. La implementación legacy todavía existe; aceptar el ADR no elimina APIs, tablas ni consumidores. La transición se ejecutará posteriormente mediante sus fases responsables y [#81](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81) permanece bloqueado.

## Data ownership

Mobile conserva autoridad sobre el dominio privado individual. Central conserva identidad, pertenencia, catálogos/campañas compartidos, consentimiento, proyecciones colectivas, estado de sync y auditoría minimizada. Toda excepción requiere contrato aprobado.

## Mobile responsibilities

Operación individual offline-first, outbox, inventario/lotes/movimientos privados, compras y pagos individuales, parcelas/aplicaciones, evidencia privada y origen de las necesidades declaradas. Si se utiliza voz, siempre requiere preview editable y confirmación humana.

## Central responsibilities

IAM, tenant/membership, dispositivos, contratos versionados e idempotentes, ACK/reconciliación, recepción y persistencia de la proyección autorizada —incluida la necesidad declarada originada por el agricultor—, consolidación determinista, propuesta colectiva, auditoría minimizada y metadata de backup.

## Web responsibilities

Experiencia online-first para Directiva/Admin: campañas, vínculos, agregados autorizados, necesidades, sincronización, planificación, propuestas, reportes y auditoría. No CRUD operativo del agricultor.

## Sync boundary

Sync transporta proyecciones autorizadas, no replica SQLite. Requiere versión de contrato, idempotencia, consentimiento, ACK, conflictos y reconciliación.

## Backup boundary

Backup es privado y orientado a recuperación. Su metadata puede ser central; su contenido no alimenta automáticamente la proyección colectiva.

## Privacy boundary

Datos familiares, notas, ubicación precisa, documentos, deuda/pagos, detalle de lotes/movimientos/aplicaciones y audio permanecen privados salvo aprobación explícita de una proyección mínima.

## Alternatives considered

### A. Central backend como sistema completo de registro

Es compatible con parte del legacy, pero excede la frontera académica vigente y centraliza datos privados que no necesita la Directiva. No se afirma que sea técnicamente imposible.

### B. Web/PWA como segundo cliente del agricultor

Reutiliza la implementación existente, pero duplica autoridad operativa y amplía superficie offline/privacidad fuera del alcance. No se afirma que sea técnicamente imposible.

### C. Replicar SQLite completa

Simplificaría algunas lecturas centrales, pero confunde sync con réplica/backup y viola minimización. No se afirma que sea técnicamente imposible.

### D. Autoridad móvil + proyecciones centrales mínimas

Es la alternativa seleccionada porque mantiene la operación rural offline, reduce datos centrales y limita la Web al propósito colectivo vigente.

## Consequences

Se requieren contratos paralelos, versionados y verificables; coexistencia temporal del legacy; UX de reconciliación; y decisiones explícitas sobre consentimiento, retención y unidades. Se evita expandir capacidades legacy como requisitos nuevos.

## Migration implications

No habrá `DROP` en la entrega que introduce reemplazos. Se identificarán consumidores, se añadirá API paralela, se hará backfill controlado, se migrarán Mobile y Web, se bloquearán escrituras legacy y sólo después se considerará retiro.

## Risks

Duplicidad temporal, divergencia de autoridades, proyección excesiva, backfill incorrecto, consumidores ocultos, pérdida de auditabilidad y adopción prematura antes de aprobación.

## Superseded architecture

Este ADR sustituye como guía activa la arquitectura PWA operativa para agricultor descrita en documentos históricos; no borra su evidencia, no cambia por sí mismo el código y no afirma que la migración técnica esté implementada.

## Related issues

[#7](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/7), [#8](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/8), [#79](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/79), [#80](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/80), [#81](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81).

## Clarificación posterior — 2026-09-24

Esta sección pertenece al corrigendum [F01-CORR-01 #90](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/90). Conserva el texto y la aceptación de 2026-09-21 como evidencia histórica; no afirma que el ADR siempre hubiera usado la interpretación siguiente ni reescribe el historial Git.

- **Autoridad de campaña:** la campaña compartida puede ser definida centralmente. Mobile usa/cachea ese contexto offline; no se deduce una autoridad de campañas personales/locales.
- **Dominio Mobile:** compra individual, inventario/stock, transferencias, aplicaciones y necesidades declaradas permanecen en su alcance. Las referencias originales a “pagos individuales” no crean un target Mobile para `PayableAccount`/`Payment`, que son legacy sin target Live. Lotes/movimientos son detalles técnicos condicionales, no capacidades académicas independientes. `Person` y relaciones familiares tampoco son obligatorios por su mención.
- **Autorización:** “consentimiento” en data ownership, sync y consecuencias significa finalidad y autorización aplicables; no aprueba un consent service/record formal. Consentimiento formal sólo si existe requisito legal o académico aprobado.
- **Backup:** F01 fija recuperación remota privada owner-scoped, autenticación, integridad, separación lógica/de servicio de Sync y ninguna alimentación automática de proyección. La metadata central, el almacenamiento físico, provider, cifrado, lifecycle, retención y formato quedan a F09.
- **Ejemplos privados y voz:** la lista original de datos familiares, deuda/pagos, lotes/movimientos y audio describe protección **si esos datos existen**, no requisitos de captura/persistencia. Deuda/pagos no tienen target Live. La voz es opcional; si se usa, exige draft editable y confirmación humana, sin imponer persistencia de audio o transcripción.

Esta aclaración es documental; no modifica schema, migraciones, producto ni la compatibilidad de F02-A/B/C.
