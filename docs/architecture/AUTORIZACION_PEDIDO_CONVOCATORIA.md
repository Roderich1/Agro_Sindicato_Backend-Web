# Autorización para confirmar pedidos en convocatorias

Un pedido con cantidades solo se confirma cuando el agricultor permite que la Administración habilitada de su propio sindicato vea su nombre y las cantidades solicitadas por producto para preparar la entrega. La Directiva mantiene el acceso agregado de E4. Esta regla no crea listados de logística ni exportaciones identificadas. En la Web se reutilizan los detalles de participantes y cierre, y el aviso de los pedidos pendientes para reparto se basa en el recuento ya publicado por el Backend.

## Contrato de escritura

- `PUT /api/v1/me/joint-purchase-calls/{id}/participation` con líneas exige el alcance vigente `ADMINISTRATION`. Flutter solicita una casilla sin marcar al faltar ese alcance y envía `consent: {version: "CONV-5", accepted_at: "..."}` solo cuando el agricultor acepta el texto del pedido. La fecha corresponde a la acción en el teléfono. El servidor comprueba que sea compatible con la apertura y la hora de recepción, con cinco minutos de tolerancia de reloj para `CONV-4` y `CONV-5`.
- Una participación activa con `ADMINISTRATION` y el texto `CONV-4` o `CONV-5` conserva su autorización al editar cantidades. Una participación retirada o con alcance insuficiente exige la aceptación explícita `CONV-5`. La renovación y las nuevas cantidades se confirman en una sola transacción. Se conserva la aceptación original y se registra la nueva decisión en el diario de autorizaciones. Una aceptación local anterior a una revocación recibida por el servidor no restaura el acceso.
- La respuesta por falta de autorización es `409 ORDER_CONSENT_REQUIRED`. El agricultor puede revisar las cantidades y preparar una nueva operación con otra aceptación. El reintento exacto conserva la respuesta registrada y no repite ninguna escritura. Los contratos 1 a 3 reciben `409 APP_UPDATE_REQUIRED` al intentar confirmar un pedido nuevo. Entre los clientes de contrato 4, una aceptación inicial explícita `CONV-4` sigue siendo válida porque abarca el mismo nombre, cantidades y finalidad. Una operación pendiente con `CONV-1/2/3` no se convierte automáticamente.
- Los listados y el historial conservan la forma del contrato 4. El titular puede autorizar a Administración mediante `POST …/participation/consent` sobre una participación anterior. Una vez aplicado `ADMINISTRATION`, cualquier intento de reducir el acceso devuelve `409 ORDER_CONSENT_LOCKED`, incluso después del cierre. Las participaciones históricas que ya carecían de ese permiso conservan su alcance. Retirar la participación sigue disponible según sus reglas y quita sus cantidades del reparto; el permiso registrado se conserva.

## Orden de despliegue

1. Desplegar Backend y Web con este cambio. El Backend reconoce `CONV-5` y sigue interpretando las participaciones y operaciones antiguas según su versión. No se requiere migración ni carga de datos.
2. Verificar la API y la visibilidad institucional con cuentas de prueba. Confirmar el rechazo `ORDER_CONSENT_REQUIRED` y el acceso de Administración antes de distribuir la APK.
3. Distribuir la APK actualizada. Los agricultores pueden revisar y volver a confirmar los pedidos pendientes que solo tenían una autorización antigua. Las participaciones ya aceptadas conservan su autorización original.

Este documento actualiza el requisito de confirmación y el retiro de autorización de [E4 §3.3 y §4.2](E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md). El acceso identificado, la regla de totales y los cierres siguen rigiéndose por E4.
