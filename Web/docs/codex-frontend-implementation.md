# Guia Codex para implementar el flujo frontend

## Objetivo

Esta guia convierte el flujo backend ya terminado en una ruta de implementacion frontend para la PWA React/Vite. Debe leerse antes de pedir o ejecutar fases de frontend, junto con:

- `Back/docs/Flujo.md`
- `Back/docs/modelo-datos-flujo.md`
- `Back/docs/codex-backend-implementation.md`
- `docs/ai/frontend-guidelines.md`
- `docs/ai/offline-sync-guidelines.md`

La meta es que Codex avance por fases, respete roles, use bien los endpoints backend y no pierda el flujo funcional decidido.

## Principios obligatorios

- El backend es la fuente de verdad para tenant, permisos, campana activa, stock, pagos y reportes.
- El frontend nunca envia `tenantId`.
- Las paginas usan servicios de `Web/src/services`; no construyen URLs dispersas.
- Los contratos viven en `Web/src/types`; si cambia una respuesta o payload, se actualizan tipos, servicios y UI juntos.
- El access token se mantiene en memoria con `Web/src/lib/axios.ts`; el refresh token se maneja por cookie con `withCredentials`.
- Cada pantalla debe tener carga, vacio, error visible y exito cuando aplique.
- La UI debe ser operativa, clara y rapida; no crear landing pages dentro de la app.
- Todo texto visible nuevo debe estar en espanol claro.
- Para roles, la UI oculta acciones no permitidas, pero nunca reemplaza las validaciones del backend.
- Para datos monetarios y cantidades recibidas como `Decimal`, normalizar antes de calcular o mostrar totales.

## Regla central de campana

Al iniciar sesion o entrar al layout privado, el frontend debe consultar `GET /campaigns/active` y exponer la campana activa en un estado compartido o hook. Las operaciones normales usan la campana activa del backend por defecto; solo se envia `campaignId` cuando el flujo lo requiere, por ejemplo reportes historicos o consulta de campanas cerradas.

Comportamiento esperado:

- Si no hay campana activa, mostrar aviso y deshabilitar acciones que requieren campana.
- Si el backend responde que la campana esta cerrada, mostrar error claro y no reintentar automaticamente.
- El agricultor consulta campanas y campana activa, pero no crea ni abre campanas.
- Directiva y administrador pueden crear, editar, abrir y cerrar campanas.
- Reportes permiten seleccionar campanas activas o cerradas.

## Mapa de modulos frontend

Archivos base actuales:

- `Web/src/App.tsx`: rutas y proteccion por rol.
- `Web/src/components/app-shell.tsx`: layout y navegacion.
- `Web/src/contexts/auth.context.tsx`: sesion.
- `Web/src/lib/axios.ts`: cliente HTTP.
- `Web/src/services`: llamadas API.
- `Web/src/types`: contratos.
- `Web/src/pages`: pantallas.

Modulos nuevos o ampliados sugeridos:

- `campaigns`: campanas y campana activa.
- `plots`: parcelas.
- `crops`: cultivos.
- `plot-crop-assignments`: cultivo por parcela y campana.
- `inventory`: productos, FDS, toxicologia, QR, lotes, movimientos, entradas, salidas y ajustes.
- `applications`: aplicaciones de agroquimicos.
- `procurement`: proveedores, compras individuales, conjuntas, programadas y recepciones.
- `accounts-payable`: cuentas por pagar y pagos.
- `calendar`: calendario operativo.
- `reports`: consultas agregadas.
- `audit-logs`: bitacora.
- `sync`: cola offline y sincronizacion.

## Endpoints esperados

Campanas:

- `GET /campaigns`
- `GET /campaigns/active`
- `POST /campaigns`
- `PATCH /campaigns/:id`
- `POST /campaigns/:id/open`
- `POST /campaigns/:id/close`

Parcelas y cultivos:

- `GET /plots`
- `POST /plots`
- `PATCH /plots/:id`
- `POST /plots/:id/deactivate`
- `GET /crops`
- `POST /crops`
- `PATCH /crops/:id`
- `GET /plot-crop-assignments`
- `POST /plot-crop-assignments`
- `PATCH /plot-crop-assignments/:id`

Inventario:

- `GET /inventory/products`
- `POST /inventory/products`
- `PATCH /inventory/products/:id`
- `POST /inventory/products/:id/deactivate`
- `GET /inventory/lots`
- `PATCH /inventory/lots/:id`
- `GET /inventory/stock`
- `GET /inventory/global-stock`
- `GET /inventory/alerts`
- `POST /inventory/entries`
- `POST /inventory/exits`
- `POST /inventory/adjustments`

Aplicaciones:

- `GET /applications`
- `POST /applications`
- `GET /applications/:id`
- `POST /applications/:id/cancel`

Compras y proveedores:

- `GET /suppliers`
- `POST /suppliers`
- `PATCH /suppliers/:id`
- `POST /purchases`
- `POST /purchases/joint`
- endpoints de programacion y recepcion si el backend los expone.

Cuentas por pagar:

- `GET /accounts-payable`
- `POST /accounts-payable/:id/payments`
- `POST /accounts-payable/:id/pay-total`

Calendario:

- `GET /calendar/events`
- `POST /calendar/events/:id/complete`
- `POST /calendar/events/:id/cancel`

Reportes:

- endpoints bajo `/reports` segun contrato backend.

Bitacora:

- `GET /audit-logs`

Sincronizacion:

- `POST /sync/operations`
- `GET /sync/operations`

## Fase 0. Base frontend de contratos

Objetivo:

- Crear o actualizar tipos por dominio en `Web/src/types`.
- Crear servicios por dominio en `Web/src/services`.
- Mantener compatibilidad con `Web/src/lib/axios.ts`.
- Preparar helpers para errores, fechas, cantidades y monedas.

Reglas:

- No usar `unknown` en servicios si ya se conoce el contrato.
- No duplicar tipos entre paginas.
- No poner logica de negocio pesada dentro de componentes.
- No enviar `tenantId`.

Verificacion:

```bash
cd Web
npm run lint
npm run build
```

Done:

- Servicios compilan.
- Tipos representan payloads y respuestas backend.
- No hay llamadas API directas desde paginas nuevas.

## Fase 1. Layout, navegacion y contexto de campana

Objetivo:

- Mostrar campana activa en el layout.
- Crear ruta/pagina de campanas para directiva y administrador.
- Ajustar menu por rol.
- Bloquear acciones que requieren campana activa.

Roles:

- `AGRICULTOR`: ve campana activa y listado de campanas.
- `DIRECTIVA`, `ADMINISTRADOR`: crean, editan, abren y cierran campanas.

Pruebas minimas:

- Agricultor no ve acciones de crear/abrir/cerrar.
- Directiva abre/cierra campana desde UI.
- Sin campana activa, formularios dependientes muestran aviso.

## Fase 2. Parcelas, cultivos y asignacion

Objetivo:

- Implementar CRUD visual de parcelas del agricultor.
- Implementar catalogo simple de cultivos.
- Asignar cultivo principal a una parcela dentro de la campana activa.

Reglas:

- Agricultor solo ve y modifica sus parcelas.
- Parcela con historial se inactiva.
- Directiva consulta global, pero no modifica parcelas privadas salvo flujo explicito.
- No asignar cultivo si no hay campana activa.

UX esperada:

- Tabla/lista de parcelas.
- Formulario corto para nombre, ubicacion/superficie si existe en contrato.
- Selector de cultivo y campana cuando aplique.

## Fase 3. Productos, FDS, toxicologia y QR

Objetivo:

- Ampliar la pantalla de productos con datos tecnicos.
- Mostrar FDS como URL/nombre.
- Mostrar categoria toxicologica.
- Mostrar/generar QR segun endpoint disponible.

Reglas:

- No incluir SENASAG.
- Producto con historial se inactiva.
- QR duplicado debe mostrar error claro del backend.

UX esperada:

- Badges de toxicologia.
- Acceso visible a FDS.
- Accion para copiar/ver QR si backend devuelve identificador o URL.

## Fase 4. Inventario por campana

Objetivo:

- Ajustar entradas, salidas, ajustes, lotes y movimientos a campana activa.
- Incorporar `reasonType`.
- Mantener stock actual aunque cambie o cierre la campana.

Reglas:

- Salida no deja stock negativo.
- Entrada simple pide motivo.
- Ajuste pide motivo.
- Error de campana cerrada se muestra sin perder datos del formulario.

UX esperada:

- Formularios de entrada, salida y ajuste separados o con tabs.
- Selector de lote opcional; si no se elige, backend usa vencimiento mas cercano.
- Tabla de movimientos con campana, tipo, motivo y fecha.

## Fase 5. Aplicaciones de agroquimicos

Objetivo:

- Registrar aplicacion a parcela/cultivo/campana.
- Mostrar descuento de stock y movimiento relacionado.
- Permitir anulacion con motivo.

Reglas:

- Validar en UI que exista parcela y cultivo asignado, pero confiar en backend para la decision final.
- No aplicar sobre parcela ajena.
- No aplicar en campana cerrada.

UX esperada:

- Flujo guiado: parcela, cultivo asignado, producto/lote, dosis/cantidad, fecha y notas.
- Resumen previo con producto, cantidad a descontar y parcela.
- Historial filtrable por parcela, cultivo y campana.

## Fase 6. Compras, recepciones y cuentas por pagar

Objetivo:

- Soportar compras individuales y conjuntas.
- Mostrar compras programadas y recepcion parcial si el backend lo expone.
- Conectar compras a credito con cuentas por pagar.

Reglas:

- Agricultor crea compras individuales.
- Directiva/administrador crean compras conjuntas.
- Compra a credito genera cuenta por pagar.
- Recepcion genera entrada/lote.

UX esperada:

- Formulario de compra con proveedor, items, pago y vencimiento.
- Para compra conjunta: asignaciones por agricultor y validacion de cantidades exactas.
- Vista de cuentas por pagar con pago parcial y pago total.

## Fase 7. Calendario operativo

Objetivo:

- Mostrar eventos automaticos y permitir completar/cancelar.
- Filtrar por fecha, tipo, estado y campana.

Eventos:

- vencimiento de lote
- pago proximo
- aplicacion
- compra programada
- stock bajo
- cierre de campana

Reglas:

- Agricultor ve eventos propios.
- Directiva ve eventos globales.
- No duplicar eventos en UI; backend usa `sourceEntity` y `sourceEntityId`.

## Fase 8. Reportes

Objetivo:

- Crear pantallas de reportes listas para consumo del frontend.
- Evitar calculos duplicados si el backend ya entrega agregados.

Reportes prioritarios:

- inventario actual
- inventario por campana
- inventario por agricultor
- compras por campana
- compras conjuntas
- aplicaciones por parcela/cultivo
- consumo por producto
- consumo por cultivo
- productos vencidos/proximos
- cuentas por pagar y pagos
- bitacora por campana

Reglas:

- Agricultor solo ve datos propios.
- Directiva agrupa por agricultor y campana.
- PDF/Excel queda para despues si aun se esta validando la informacion.

## Fase 9. Bitacora

Objetivo:

- Mostrar consulta de acciones importantes.
- Permitir filtros para directiva y administrador.

Reglas:

- Agricultor no necesita ver toda la bitacora.
- Directiva/administrador filtran por agricultor, campana, entidad o accion.
- No tratar la bitacora como feed principal de trabajo.

## Fase 10. Sincronizacion offline PWA

Objetivo:

- Extender la cola offline para operaciones nuevas.
- Mantener idempotencia y recuperacion de conflictos.

Operaciones candidatas:

- `PLOT_CREATE`
- `PLOT_UPDATE`
- `PLOT_DEACTIVATE`
- `PLOT_CROP_ASSIGN`
- `STOCK_ENTRY`
- `STOCK_EXIT`
- `AGROCHEMICAL_APPLICATION`
- `PAYMENT_CREATE`

Reglas:

- El backend siempre esta desplegado en internet; offline pertenece a la PWA.
- Generar `clientId` estable por navegador/dispositivo.
- Generar `clientOperationId` unico por accion.
- Guardar cola en almacenamiento persistente.
- Sincronizar en orden de creacion.
- Quitar de cola solo cuando backend devuelva `APLICADA` o duplicado ya aplicado segun contrato.
- Mantener conflictos visibles y accionables.
- No duplicar stock al reintentar.

UX esperada:

- Indicador online/offline.
- Contador de operaciones pendientes.
- Boton de sincronizar.
- Lista de conflictos con opcion de revisar, reintentar o descartar.

## Fase 11. Pulido UX y cierre

Objetivo:

- Revisar consistencia visual, responsive, accesibilidad y mensajes.
- Confirmar que el frontend usa correctamente el backend completo.

Checklist:

- No se envia `tenantId`.
- Todas las rutas privadas estan protegidas.
- Menu y botones respetan roles.
- Cada servicio usa `api` de `Web/src/lib/axios.ts`.
- Cada pagina tiene carga, vacio y error.
- Los formularios no pierden datos ante error de backend.
- Campana activa se muestra y se respeta.
- Campana cerrada bloquea operaciones normales.
- Offline no duplica operaciones.
- Reportes no recalculan agregados que ya entrega backend.
- Textos visibles estan en espanol claro.
- `npm run lint` pasa.
- `npm run build` pasa.

## Prompts recomendados para continuar

Para implementar una fase:

```text
Implementa la Fase X de Web/docs/codex-frontend-implementation.md.
Lee primero Web/AGENTS.md, Back/docs/Flujo.md y los contratos backend necesarios.
Actualiza tipos, servicios, rutas, paginas y documentacion si corresponde.
No envies tenantId desde frontend.
Ejecuta npm run lint y npm run build en Web.
```

Para revisar una fase:

```text
Revisa la Fase X del frontend con enfoque de bugs, roles, tenantId, campana activa, errores API, offline y UX.
No cambies codigo si no encuentras un problema concreto.
```

Para agregar una pantalla:

```text
Crea la pantalla de [modulo] siguiendo Web/docs/codex-frontend-implementation.md.
Usa servicios en Web/src/services, tipos en Web/src/types y rutas protegidas por rol.
```
