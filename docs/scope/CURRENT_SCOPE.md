# Alcance técnico vigente de Agrocuentas

## 1. Purpose

Este documento interpreta el alcance técnico vigente bajo la autoridad del Proyecto de Grado académico. La existencia de capacidades legacy en código, base de datos o documentación no las convierte en requisitos actuales. Hasta que una transición sea implementada y verificada, el código describe el estado desplegable y este documento describe el destino autorizado. Véase el [corrigendum semántico posterior a F01](../evidence/F01_SEMANTIC_CORRIGENDUM.md).

## 2. Academic Boundary

**Sistema:** Agrocuentas.

**Objetivo:** gestión individual de agroquímicos y planificación colectiva del Sindicato 19 de Agosto.

La frontera es: **Flutter/Mobile → proyección autorizada → Backend central → Web Directiva online-first**.

## 3. Mobile / Flutter

Flutter es el sistema de registro individual y offline-first. El agricultor usa el contexto de campaña compartida definido centralmente, que Mobile puede conservar localmente para operar sin conexión; esto no crea una autoridad de campañas personales. Mobile gestiona inventario/stock, compras individuales, transferencias, aplicaciones y necesidades declaradas, y conserva operaciones pendientes ante conectividad intermitente. Parcelas/chacos y detalles como lotes o movimientos se modelan sólo cuando el flujo aprobado los necesita; nombrarlos no crea capacidades académicas independientes.

Si se utiliza captura por voz, el flujo obligatorio es:

`speech → draft → preview editable → confirmación humana → operación`

Nunca se permite `speech → efecto automático`.

## 4. Central Backend

El Backend es responsable de Tenant/Sindicato, identidad, Account/User, Member y Person sólo si el dominio la requiere, sesiones, dispositivos/clientId, campañas compartidas como contexto autoritativo, catálogos compartidos, vínculo y autorización aplicable, sync idempotente, recepción de proyección mínima, consumo colectivo autorizado, recepción y persistencia de la proyección autorizada de necesidad declarada, estado de última sincronización, propuesta de compra conjunta y auditoría central minimizada. El servicio de backup privado es separado de Sync; su metadata exacta se decide en F09.

No es autoridad sobre todo el dominio privado móvil. Los contratos actuales más amplios son legacy y deben migrarse mediante [TRANSITION_PLAN.md](TRANSITION_PLAN.md).

## 5. Web Directiva

La Web es online-first y está destinada a Directiva/Admin. Permite campañas compartidas, agricultores vinculados, consumo consolidado autorizado, necesidades declaradas consolidadas, última sincronización, planificación colectiva, propuesta de compra conjunta, reportes y auditoría autorizada.

No debe proporcionar CRUD operativo de agricultor. Las pantallas actuales que lo hacen son transición legacy, no precedente para expansión.

## 6. Synchronization

Sync no es replicación de SQLite. El flujo autorizado es:

`operación local → outbox local → proyección autorizada → contrato versionado → idempotencia → ACK del servidor → reconciliación`

La proyección debe ser mínima, autorizada según finalidad y alcance aprobados, versionada y recuperable ante reintentos. La definición de payload, conflictos y retención permanece sujeta a F02/F05/F06. El consentimiento formal sólo se incorpora si existe un requisito legal o académico aprobado.

## 7. Backup

Backup no es Sync. El backup remoto es privado, owner-scoped, autenticado, con integridad verificable y separado lógicamente de Sync y del dataset colectivo. Su contenido no alimenta automáticamente proyecciones. F09 decide provider, almacenamiento físico, metadata exacta, cifrado, lifecycle, retención y formato/binario.

## 8. Declared Need

La necesidad declarada nace en Mobile como declaración explícita del agricultor. El Backend no es su autoridad originaria: recibe y persiste sólo la proyección autorizada para consolidación. No es forecast, predicción ni recomendación. Sólo si el contrato F06 aprobado incluye `declared_stock` y unidades compatibles se aplica:

`net_need = max(0, declared_need - declared_stock)`

La procedencia de `declared_stock`, sus unidades, finalidad y autorización aplicable deben quedar formalizadas en F06 antes de implementar ese cálculo.

## 9. Collective Purchase

El flujo comienza como:

`necesidades declaradas → consolidación determinista → propuesta → revisión/decisión humana`

La propuesta no crea automáticamente compra individual ni efectos sobre inventario. Tampoco crea cuentas por pagar o pagos: `PayableAccount` y `Payment` son legacy sin target Live aprobado.

## 10. Privacy Boundary

No cruzan la frontera por defecto, cuando existan en componentes privados o legacy: ubicación precisa de parcelas, notas privadas, relaciones familiares, fotografías/facturas, proveedores y precios privados, detalle de lotes/movimientos/aplicaciones, recordatorios, audio/transcripción y binario de backup. Esta lista contiene ejemplos de datos protegidos; su mención **no crea una capacidad funcional ni obliga a capturarlos o persistirlos**. Deudas y pagos legacy tampoco tienen target Live aprobado. Sólo cruza una proyección mínima con finalidad y autorización aplicables; consentimiento formal cuando un requisito legal o académico aprobado lo exija.

## 11. Explicit Out-of-Scope

- forecasting o predicción mediante IA;
- recomendaciones agronómicas automáticas;
- aportes comunales, tesorería, banca y conciliación;
- contabilidad general, nómina y facturación electrónica;
- ERP agrícola;
- web operativa offline completa;
- voz autónoma.
- cuentas por pagar y pagos legacy como capacidades Live; una compra individual válida no implica deuda, pago ni contabilidad.

## 12. Historical Compatibility

El código y los documentos legacy se preservan para compatibilidad, evidencia y transición. No autorizan funciones nuevas. Ante contradicción prevalece el alcance académico vigente; este documento y las decisiones F01 lo formalizan sin ampliarlo. No se elimina un contrato hasta identificar consumidores, migrarlos, bloquear escrituras legacy, reconciliar y cumplir retención/exportación.

## 13. Governance

- [#79 F01-SCOPE-01](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/79): alcance funcional vigente.
- [#80 F01-SCOPE-02](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/80): frontera de datos y autoridad.
- [#81 ALIGN-TECH-01](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81): transición técnica cross-cutting; permanece bloqueada hasta contar con contratos y gates.

F01 cubre análisis, documentación, arquitectura y baseline; F02 identidad, membership, ownership y device; F03 autenticación/sesión Mobile; F04 modos y dominio Mobile; F05 sincronización; F06 proyección colectiva; F07 Web Directiva y planificación/compra conjunta; F08 está fuera de alcance; F09 backup privado; F10 QA, seguridad, UX, performance y evaluación; F11 release, documentación final y trazabilidad final. Los contratos se asignan a la fase de la capacidad responsable. PRE-VOICE/EVO gobierna la voz Mobile existente y #81 coordina la realineación cross-cutting.
