# Flujo funcional decidido

Este documento describe el flujo funcional que se usara como base para ampliar el sistema. La directiva controla las campanas agricolas y el agricultor trabaja sobre sus parcelas, inventario, compras, salidas, aplicaciones, pagos, calendario y reportes.

## Agricultor

El agricultor no crea campanas. Trabaja con la campana activa definida por directiva o administrador.

### Inicio / resumen

- Ver campana activa actual.
- Ver alertas principales: stock bajo, productos por vencer y pagos proximos.
- Ver ultimas compras, ultimas salidas/aplicaciones y saldo pendiente.
- Ver accesos rapidos: nueva compra, nueva salida, nueva aplicacion y registrar pago.

### Mis parcelas

- Crear sus parcelas.
- Editar datos de parcela.
- Desactivar una parcela si ya no la usa.
- Evitar eliminar parcelas con historial; se usa inactivar para no perder reportes.
- Ver historial de cultivos por campana.

### Cultivos por campana

- Ver campanas creadas por directiva.
- En la campana activa, asignar cultivo a cada parcela.
- Cambiar cultivo mientras la campana este abierta.
- Ver que cultivo tuvo cada parcela en campanas anteriores.
- No crear campanas.

La parcela es el lugar fisico. El cultivo se registra por campana:

```text
Parcela + Campana = Cultivo asignado
```

### Inventario

- Ver sus productos y lotes disponibles.
- Ver cantidad, unidad, vencimiento, almacen, estado y stock minimo.
- Ver productos con stock bajo.
- Ver productos vencidos o proximos a vencer.
- Ver ficha del agroquimico: FDS, categoria toxicologica, ingrediente activo, unidad y tipo de producto.
- Generar o ver QR por lote/producto.
- Escanear QR para consultar informacion rapida.

No se incluye registro SENASAG en este flujo.

### Compras individuales

- Registrar compra propia.
- Elegir proveedor.
- Elegir si es contado o credito.
- Registrar productos comprados, cantidades, precios y vencimientos.
- Generar lotes automaticamente desde la compra.
- Si es credito, generar cuenta por pagar.
- Ver historial de compras por campana.
- Ver compras programadas o pendientes si se incluye planificacion.

### Entradas

- Registrar entradas simples cuando no vienen de una compra completa.
- Ejemplos: donacion, sobrante recibido, correccion autorizada o devolucion.
- Asociar entrada a producto, lote y campana.
- Pedir motivo obligatorio para trazabilidad.

### Salidas

- Registrar salidas por aplicacion a parcela.
- Registrar salidas simples sin demasiado contexto.
- Usar motivos simples:
  - Aplicacion en parcela.
  - Perdida o derrame.
  - Vencimiento.
  - Prestamo o entrega.
  - Ajuste.
  - Otro.
- Si la salida es por aplicacion, asociarla a parcela, cultivo y campana.
- Descontar stock automaticamente.

### Aplicaciones

- Registrar aplicacion de agroquimico a una parcela.
- Seleccionar campana, parcela, cultivo, producto/lote y cantidad usada.
- Registrar dosis, plaga/enfermedad objetivo y observaciones.
- Opcional: clima o responsable.
- Crear automaticamente una salida de inventario.
- Ver historial de aplicaciones por parcela y campana.

### Cuentas por pagar y pagos

- Ver deudas pendientes.
- Ver compras a credito.
- Registrar pagos parciales o totales.
- Ver fecha de vencimiento del pago.
- Ver estado: pendiente, parcial, pagado o vencido.
- Recibir alertas de pagos proximos.

### Calendario

- Ver vencimientos de productos.
- Ver pagos proximos.
- Ver aplicaciones registradas.
- Ver compras programadas.
- Ver alertas de stock.
- Filtrar por campana, tipo de evento o fecha.

### Reportes

- Reporte de inventario actual.
- Reporte por campana activa.
- Reportes de campanas cerradas.
- Compras por campana.
- Aplicaciones por parcela/cultivo.
- Movimientos de inventario.
- Productos vencidos o por vencer.
- Cuentas por pagar y pagos.
- Exportar PDF/Excel cuando se implemente esa capacidad.

### Sincronizacion offline

- La funcionalidad offline pertenece a la PWA web, no al backend.
- El backend siempre queda desplegado y disponible por internet.
- La PWA debe detectar si esta sin conexion.
- La PWA guarda operaciones en una cola local persistente cuando no hay conexion.
- La PWA permite ver operaciones pendientes de sincronizar.
- Cuando vuelve internet, la PWA envia la cola al backend mediante `POST /sync/operations`.
- El backend valida, aplica de forma idempotente y responde si cada operacion fue aplicada, rechazada o quedo en conflicto.
- La PWA elimina de su cola local solo operaciones aplicadas o duplicadas ya aplicadas.
- La PWA debe mostrar errores de sincronizacion de forma entendible.

### Reglas importantes para agricultor

- No eliminar datos historicos si tienen movimientos; inactivar parcelas, proveedores o productos.
- El sistema debe guardar quien hizo cada compra, salida, ajuste o pago, aunque el agricultor no vea toda la bitacora.

## Directiva

La directiva tiene una vista global y de control. No debe modificar todo lo privado del agricultor sin necesidad, pero si debe operar campanas, compras conjuntas y supervision.

### Inicio / panel general

- Ver campana activa.
- Ver total de agricultores activos.
- Ver inventario global del sindicato.
- Ver productos con stock bajo a nivel general.
- Ver productos vencidos o por vencer.
- Ver cuentas por pagar pendientes.
- Ver compras conjuntas recientes.
- Ver alertas generales.

### Gestion de campanas

- Crear campanas agricolas.
- Definir nombre: Invierno 2026, Verano 2026, etc.
- Definir fecha de inicio y fecha de cierre estimada.
- Abrir campana.
- Cerrar campana.
- Cambiar campana activa.
- Ver resumen de campana cerrada.
- Bloquear operaciones normales en campanas cerradas.
- Permitir correcciones solo con motivo.

### Seguimiento de agricultores

- Ver lista de agricultores.
- Ver parcelas registradas por agricultor.
- Ver cultivos asignados por campana.
- Ver inventario individual de cada agricultor.
- No crear parcelas del agricultor salvo que se decida permitir asistencia administrativa.

### Inventario global

- Ver stock total por producto.
- Ver stock agrupado por agricultor.
- Ver stock por lote.
- Ver vencimientos generales.
- Ver categorias toxicologicas.
- Ver FDS de productos.
- Ver QR de lotes/productos.
- Ver movimientos globales.
- Filtrar por campana, agricultor, producto, vencimiento o categoria.

### Compras conjuntas

- Crear compra conjunta.
- Seleccionar proveedor.
- Seleccionar productos, cantidades y costos.
- Seleccionar agricultores beneficiarios.
- Distribuir cantidades por agricultor.
- Registrar si cada agricultor paga al contado o a credito.
- Generar lotes para cada agricultor.
- Generar cuentas por pagar cuando corresponda.
- Ver estado de la compra conjunta: programada, recibida parcial, recibida, cerrada o cancelada.

### Compras programadas

- Planificar compras futuras.
- Registrar fecha estimada.
- Asociar agricultores interesados.
- Convertir una compra programada en compra real.
- Mostrar estas compras en calendario.

### Proveedores

- Crear proveedores.
- Editar proveedores.
- Inactivar proveedores.
- Ver historial de compras por proveedor.
- Ver productos comprados frecuentemente.
- Ver deuda relacionada con proveedor si aplica.

### Cuentas por pagar

- Ver deudas globales.
- Ver deudas por agricultor.
- Ver pagos realizados.
- Registrar pagos de compras conjuntas si la directiva cobra o administra esos pagos.
- Ver saldos pendientes.
- Ver pagos vencidos o proximos.
- Generar reporte de deudas.

### Reportes

- Reporte general de campana.
- Inventario global.
- Inventario por agricultor.
- Compras conjuntas.
- Compras individuales en modo consulta.
- Deudas por agricultor.
- Pagos recibidos.
- Productos vencidos o por vencer.
- Consumo por cultivo.
- Consumo por parcela.
- Movimientos de inventario.
- Exportar PDF/Excel cuando se implemente esa capacidad.

### Bitacora

- Ver quien hizo cada operacion.
- Ver fecha, usuario, modulo y accion.
- Ver cambios importantes: ajustes, cierres de campana, pagos, eliminacion/inactivacion.
- Filtrar por agricultor o campana.

## Reglas transversales

- Toda operacion pertenece a un tenant resuelto desde el token.
- Toda operacion nueva usa la campana activa por defecto cuando corresponde.
- El frontend no debe enviar `tenantId`.
- Las campanas cerradas no aceptan operaciones normales.
- El stock fisico sobrante continua existiendo al cerrar una campana.
- Las aplicaciones generan movimientos de salida.
- Los ajustes deben tener motivo y quedar en bitacora.
- Las compras a credito generan cuentas por pagar.
- Los pagos no pueden superar el saldo pendiente.
