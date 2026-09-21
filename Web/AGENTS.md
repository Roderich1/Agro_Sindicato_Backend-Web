# Web/AGENTS.md

## Alcance

La Web React/Vite es online-first y está destinada a Directiva/Admin. No reemplaza Flutter ni es un segundo cliente operativo del agricultor. Lea [`docs/scope/CURRENT_SCOPE.md`](../docs/scope/CURRENT_SCOPE.md).

Las pantallas actuales de inventario, parcelas, aplicaciones, compras, pagos, calendario y cola offline son legacy durante la transición. No las use como precedente para funciones nuevas.

## Reglas

- Enfocar la UI en campañas compartidas, vínculos, agregados autorizados, necesidades declaradas, última sincronización, planificación, propuestas, reportes y auditoría.
- No añadir CRUD operativo del agricultor ni nuevas escrituras privadas.
- No expandir cola offline/PWA; un service worker no cambia la autoridad de datos.
- No mostrar detalle privado cuando basta un agregado y no enviar `tenantId` desde el cliente.
- No implementar forecasting, F08/aportes ni voz autónoma.
- Las propuestas colectivas no crean efectos individuales automáticos.
- Mantener servicios/tipos/rutas coherentes mientras existan consumidores legacy; su retirada sigue `TRANSITION_PLAN.md`.

## Verificación

Cuando cambie código, ejecute lint/build y verificación visual pertinente. Los cambios documentales no justifican afirmar pruebas funcionales.
