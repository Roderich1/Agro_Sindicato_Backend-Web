# Alcance técnico vigente de Agrocuentas

## 1. Purpose

Este documento representa el alcance técnico vigente. La existencia de capacidades legacy en código, base de datos o documentación no las convierte en requisitos actuales. Hasta que una transición sea implementada y verificada, el código describe el estado desplegable y este documento describe el destino autorizado.

## 2. Academic Boundary

**Sistema:** Agrocuentas.

**Objetivo:** gestión individual de agroquímicos y planificación colectiva del Sindicato 19 de Agosto.

La frontera es: **Flutter/Mobile → proyección autorizada → Backend central → Web Directiva online-first**.

## 3. Mobile / Flutter

Flutter es el sistema de registro individual y offline-first. Es autoridad, cuando corresponda, sobre campañas personales/locales, chacos o parcelas, inventario individual, lotes, movimientos, compras individuales, distribución/asignación, transferencias, aplicaciones, necesidades declaradas, datos familiares privados, comprobantes/fotografías, outbox local y voz asistida.

Si se utiliza captura por voz, el flujo obligatorio es:

`speech → draft → preview editable → confirmación humana → operación`

Nunca se permite `speech → efecto automático`.

## 4. Central Backend

El Backend es responsable de Tenant/Sindicato, identidad, Account/User, Member/Person cuando quede formalizado, sesiones, dispositivos/clientId, campañas compartidas, catálogos compartidos, vínculo/consentimiento, sync idempotente, recepción de proyección mínima, consumo colectivo autorizado, recepción y persistencia de la proyección autorizada de necesidad declarada, estado de última sincronización, propuesta de compra conjunta, auditoría central minimizada y metadata de backup privado.

No es autoridad sobre todo el dominio privado móvil. Los contratos actuales más amplios son legacy y deben migrarse mediante [TRANSITION_PLAN.md](TRANSITION_PLAN.md).

## 5. Web Directiva

La Web es online-first y está destinada a Directiva/Admin. Permite campañas compartidas, agricultores vinculados, consumo consolidado autorizado, necesidades declaradas consolidadas, última sincronización, planificación colectiva, propuesta de compra conjunta, reportes y auditoría autorizada.

No debe proporcionar CRUD operativo de agricultor. Las pantallas actuales que lo hacen son transición legacy, no precedente para expansión.

## 6. Synchronization

Sync no es replicación de SQLite. El flujo autorizado es:

`operación local → outbox local → proyección autorizada → contrato versionado → idempotencia → ACK del servidor → reconciliación`

La proyección debe ser mínima, consentida, versionada y recuperable ante reintentos. La definición de payload, conflictos y retención permanece sujeta a F02/F05/F06.

## 7. Backup

Backup no es Sync. El backup es owner-scoped, privado, orientado a recuperación y separado del dataset colectivo. El Backend puede conservar metadata central; el contenido no puede utilizarse automáticamente como proyección colectiva.

## 8. Declared Need

La necesidad declarada nace en Mobile como declaración explícita del agricultor. El Backend no es su autoridad originaria: recibe y persiste sólo la proyección autorizada para consolidación. No es forecast, predicción ni recomendación. Cuando aplique y las unidades sean compatibles:

`net_need = max(0, declared_need - declared_stock)`

La procedencia de `declared_stock`, sus unidades y su consentimiento deben quedar formalizados antes de implementar el contrato.

## 9. Collective Purchase

El flujo comienza como:

`necesidades declaradas → consolidación determinista → propuesta → revisión/decisión humana`

La propuesta no crea automáticamente lote, movimiento de stock, cuenta por pagar, pago ni compra individual.

## 10. Privacy Boundary

No sincronizan por defecto: ubicación precisa de parcelas, notas privadas, relaciones familiares, fotografías/facturas, proveedores y precios privados, deudas, pagos, inventario detallado por lote, movimientos, aplicaciones detalladas, recordatorios, audio/transcripción y el binario de backup. Sólo una proyección aprobada, necesaria y consentida puede cruzar la frontera central.

## 11. Explicit Out-of-Scope

- forecasting o predicción mediante IA;
- recomendaciones agronómicas automáticas;
- aportes comunales, tesorería, banca y conciliación;
- contabilidad general, nómina y facturación electrónica;
- ERP agrícola;
- web operativa offline completa;
- voz autónoma.

## 12. Historical Compatibility

El código y los documentos legacy se preservan para compatibilidad, evidencia y transición. No autorizan funciones nuevas. Ante contradicción prevalecen este documento, las decisiones aprobadas y los issues de gobierno. No se elimina un contrato hasta identificar consumidores, migrarlos, bloquear escrituras legacy, reconciliar y cumplir retención/exportación.

## 13. Governance

- [#79 F01-SCOPE-01](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/79): alcance funcional vigente.
- [#80 F01-SCOPE-02](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/80): frontera de datos y autoridad.
- [#81 ALIGN-TECH-01](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81): transición técnica cross-cutting; permanece bloqueada hasta contar con contratos y gates.

F01 cubre análisis, documentación, arquitectura y baseline; F02 identidad, membership, ownership y device; F03 autenticación/sesión Mobile; F04 modos y dominio Mobile; F05 sincronización; F06 proyección colectiva; F07 Web Directiva y planificación/compra conjunta; F08 está fuera de alcance; F09 backup privado; F10 QA, seguridad, UX, performance y evaluación; F11 release, documentación final y trazabilidad final. Los contratos se asignan a la fase de la capacidad responsable. PRE-VOICE/EVO gobierna la voz Mobile existente y #81 coordina la realineación cross-cutting.
