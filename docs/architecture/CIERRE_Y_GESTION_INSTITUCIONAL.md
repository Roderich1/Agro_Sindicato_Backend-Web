# Cierre de campaña y gestión institucional

Decisión vigente desde el encargo del 26 de noviembre de 2026. Actualiza las reglas de divulgación de F06 y F07, el cierre de campaña y la gestión de convocatorias de E2–E4. Los documentos de esas entregas registran sus reglas originales.

## Totales y resultados históricos

La regla vigente publica la suma de aportes autorizados con datos válidos desde el primer aporte. Usa el producto canónico y conserva las dimensiones y unidades. Un cero explícito es una cifra. Una ausencia queda vacía. Un total de un solo aporte puede permitir inferir una cantidad individual. Los identificadores de política y sus umbrales se conservan en registros técnicos para interpretar resultados anteriores. El modo actual de las respuestas es `APPROVED`. Las variables anteriores de política, datos sintéticos y sellado dejan de intervenir en estas decisiones.

`POST /api/v1/campaigns/:id/close` toma el bloqueo de campaña que comparte Sync v1. En una transacción actualiza el estado, registra el cierre y su evento de calendario, calcula el resultado colectivo y fija sus fuentes y cobertura. Un reintento devuelve el mismo cierre. La acción usa las operaciones que Central alcanzó a aceptar. `GET /api/v1/collective/campaigns/:id/close-preview` permite consultar la cobertura disponible sin escribir.

Sync v1 conserva su contrato. Después del cierre, `PUBLISH` y `SUPERSEDE` para esa campaña reciben el rechazo terminal `CAMPAIGN_SEALED`. La publicación privada conserva su campaña y sus datos locales. `CANCEL` y su validación causal siguen vigentes. Si un retiro afecta un total histórico, se oculta ese resultado y se preservan el registro original y sus fuentes para auditoría. Estimación conserva la distinción entre cero, ausencia y retiro.

## Convocatorias

Una cuenta institucional habilitada, vinculada al sindicato y con rol Administración o Directiva puede crear, editar borradores, abrir, cerrar y cancelar dentro de las transiciones válidas. La API vuelve a comprobar la afiliación y el estado de la cuenta para cada acción. Los campos de responsable y delegaciones, sus rutas anteriores y sus registros históricos se mantienen por compatibilidad. El campo `responsible_user_id` es opcional al crear. Para las solicitudes actuales el servidor registra al creador en el campo interno de compatibilidad.

Administración consulta en pantalla el detalle identificado con autorización vigente `ADMINISTRATION`. Directiva gestiona el ciclo y recibe el agregado permitido, incluso al cerrar. Los contratos Mobile 1–4 conservan sus campos y las reglas de evolución de consentimiento. Los registros de participación siguen separados de las cuentas privadas del agricultor.

## Regularización local de campañas anteriores

1. Conecte una API local con el código actualizado a una copia aislada de PostgreSQL. Inicie sesión con una cuenta institucional del sindicato. Cargue en la sesión de terminal `AGRO_HISTORY_DATABASE_URL`, `AGRO_HISTORY_API_URL` y `AGRO_HISTORY_ACCESS_TOKEN`. Use la misma base de datos en la API y el procedimiento.
2. Desde `Back`, ejecute `node scripts/regularize-campaign-history.cjs <tenant-id>`. El informe de solo lectura cuenta las campañas cerradas pendientes y muestra para cada una su fecha de cierre registrada, cobertura disponible hoy y número de cifras recuperables.
3. Tras revisar el informe, ejecute `node scripts/regularize-campaign-history.cjs <tenant-id> --apply <campaign-id>` para una campaña. El servidor vuelve a examinar los aportes disponibles y requiere que coincidan con la revisión. Las campañas sin cifras recuperables quedan pendientes.
4. Compruebe la fecha real de regularización y las referencias en `CollectiveSeal`, `CollectiveSealEntry` y `AuditLog`. Cada cifra apunta a su `CollectiveRelease`, y sus ítems indican el aporte, la secuencia y la cantidad registrada. Repita el comando para verificar que devuelve el histórico existente.

La fecha de regularización documenta cuándo se recuperaron los aportes que sobrevivían y seguían autorizados. La fecha de cierre anterior conserva su propio significado. Los resultados fijados previamente conservan su procedencia.
