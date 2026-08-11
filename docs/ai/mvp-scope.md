# Alcance MVP

## Contexto

El perfil academico original propone una plataforma con app Android para agricultores, PWA para directiva, backend central, ingreso por voz, prediccion de demanda y evaluacion formal.

El MVP de este repositorio adapta ese alcance a:

- Backend NestJS + Prisma + PostgreSQL.
- Web PWA React/Vite para agricultores, directiva y administrador.
- Operacion offline por cola de operaciones web.

## Objetivo general adaptado

Construir una plataforma web progresiva y un backend central para registrar, consultar y sincronizar la gestion de agroquimicos del Sindicato 19 de Agosto, reduciendo perdidas por vencimiento, compras duplicadas y desorganizacion financiera, y dando a la directiva una vista consolidada para planificar compras colectivas.

## Objetivos incluidos

### OE1. Requerimientos y procesos

Traducir procesos manuales de registro, compra, control de stock y deudas a flujos digitales claros.

Evidencia en el producto:

- Pantallas de inventario, compras, cuentas, proveedores, directiva y usuarios.
- DTOs y endpoints por flujo de negocio.
- Documentacion de alcance y contratos.

### OE2. Arquitectura

Mantener arquitectura modular por capas con API central, PWA y PostgreSQL.

Evidencia en el producto:

- Modulos NestJS separados.
- Contratos API tipados en frontend.
- Separacion por roles.
- Prisma como modelo canonico.

### OE3. Inventario individual

Desarrollar registro de entradas, salidas, aplicaciones, compras al contado y credito, cuentas pendientes, stock minimo, vencimientos, lotes, ajustes, FDS, categoria toxicologica y QR.

Evidencia en el producto:

- `inventory`.
- `procurement`.
- `accounts-payable`.
- `Back/docs/Flujo.md`.
- `Back/docs/modelo-datos-flujo.md`.
- `Web/src/pages/inventory.page.tsx`.
- `Web/src/pages/purchases.page.tsx`.

### Campanas, parcelas y cultivos

Gestionar campanas agricolas creadas por directiva/administrador, parcelas del agricultor y cultivos asignados por campana.

Evidencia en el producto:

- `AgriculturalCampaign`.
- `Plot`.
- `Crop`.
- `PlotCropAssignment`.
- Reportes filtrados por campana.

### OE6. Panel consolidado de directiva

Desarrollar vista global de inventario y compras conjuntas.

Evidencia en el producto:

- `GET /inventory/global-stock`.
- `POST /purchases/joint`.
- `Web/src/pages/directiva.page.tsx`.

### Calendario, reportes y trazabilidad

Mostrar eventos operativos derivados de vencimientos, pagos proximos, aplicaciones, compras programadas, stock bajo y cierres de campana. Registrar bitacora para operaciones importantes.

Evidencia en el producto:

- `CalendarEvent`.
- `AuditLog`.
- Reportes por agricultor, campana, parcela, cultivo, compras, pagos y movimientos.

### Sincronizacion offline

Aunque en el perfil aparece como parte de varios objetivos, en este MVP debe mantenerse como capacidad transversal.

Evidencia en el producto:

- `POST /sync/operations`.
- `GET /sync/operations`.
- `Web/src/pages/sync.page.tsx`.

## Objetivos excluidos del MVP

### Ingreso por voz

No implementar en este MVP:

- React Native.
- Expo.
- Whisper.
- Parser de voz.
- Captura de audio.

Si el usuario pide voz, primero confirmar si desea abrir una fase posterior.

### IA predictiva

No implementar en este MVP:

- Prophet.
- FastAPI.
- Entrenamiento o inferencia de series temporales.
- Graficos o resultados predictivos.
- Metricas MAPE.

Los modelos `DemandForecast` o modulo `demand-forecasting` pueden permanecer como placeholder, pero no deben guiar nuevas tareas salvo pedido explicito.

### Pruebas academicas formales

No implementar como alcance funcional:

- SUS con usuarios.
- MAPE.
- Evaluacion de campo en San Julian.

Nota: esto no elimina la verificacion tecnica del software. Para cambios de codigo se siguen ejecutando build, lint y tests disponibles.

## Criterio de priorizacion

Orden para decidir trabajo:

1. Seguridad y datos correctos.
2. Reglas de inventario y finanzas.
3. Campanas, parcelas y aplicaciones.
4. Flujo usable para agricultor.
5. Flujo consolidado para directiva.
6. Offline y recuperacion de errores.
7. Pulido visual y rendimiento.

## No hacer sin confirmacion

- Agregar dependencias grandes.
- Cambiar base de datos o romper migraciones.
- Cambiar modelo de roles.
- Introducir IA, voz o app movil.
- Hacer refactors masivos.
- Borrar datos, semillas o reportes existentes.
