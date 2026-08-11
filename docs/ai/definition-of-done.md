# Definition of Done

## Para cualquier cambio

- El cambio respeta el alcance del MVP.
- No introduce voz, IA predictiva, app movil ni pruebas academicas salvo pedido explicito.
- No rompe roles existentes.
- No envia `tenantId` desde frontend.
- No introduce secretos.
- Los errores visibles son comprensibles.
- La documentacion relevante queda actualizada si cambia contrato o flujo.

## Backend

Listo cuando:

- `npm run build` pasa en `Back`.
- Tests relevantes pasan si se cambio logica.
- DTOs validan entrada.
- Use cases cubren reglas de negocio.
- Consultas filtran por tenant.
- Swagger queda coherente por tags y operaciones.
- Respuestas mantienen contrato esperado por frontend.

Para fases del flujo ampliado tambien debe cumplirse:

- Operaciones nuevas usan campana activa cuando corresponde.
- Campanas cerradas bloquean operaciones normales.
- Agricultor solo accede a datos propios con `ownerUserId`.
- Directiva/administrador solo acceden a datos del tenant.
- Escrituras multiples usan transaccion.
- Acciones criticas generan bitacora si aplica.
- Eventos de calendario no se duplican si se materializan.

## Frontend

Listo cuando:

- `npm run lint` pasa en `Web`.
- `npm run build` pasa en `Web`.
- La pantalla afectada muestra carga, exito, vacio y error cuando aplica.
- Los formularios validan minimos antes de enviar.
- La UI respeta roles.
- Tipos y servicios estan actualizados.
- No hay textos nuevos con codificacion rota.

## Full stack

Listo cuando:

- Payload frontend coincide con DTO backend.
- Respuesta backend coincide con tipos frontend.
- Camino feliz funciona.
- Error principal se muestra al usuario.
- Refresh de sesion sigue funcionando.
- No hay regresion en permisos.

## Offline

Listo cuando:

- Operacion tiene `clientOperationId`.
- Reintento no duplica datos.
- `APLICADA` elimina de cola.
- `CONFLICTO` se conserva para revision.
- `RECHAZADA` muestra razon.
- Operaciones nuevas incluyen `campaignId` o resuelven campana activa en backend cuando aplique.

## Seguridad

Listo cuando:

- No hay secretos en commits.
- No hay logs sensibles.
- Validaciones backend protegen campos extra.
- Roles estan aplicados en backend, no solo en UI.
- Datos de un tenant no pueden consultar otro tenant.
