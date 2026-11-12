# Web/AGENTS.md

## Alcance

La Web React/Vite es online-first y está destinada a Directiva/Admin. No reemplaza Flutter ni es un segundo cliente operativo del agricultor. Lea [`docs/scope/CURRENT_SCOPE.md`](../docs/scope/CURRENT_SCOPE.md).

La Web es exclusivamente de Directiva y Administración (decisión del autor del 2026-11-12). Las pantallas del agricultor (inventario, parcelas, aplicaciones, compras, reportes, cola offline) se retiraron; una cuenta AGRICULTOR sólo ve el aviso de que usa la app móvil. Sigue como legacy el Calendario (accesible por URL, fuera del menú; su retirada está recomendada y pendiente del autor). La página heredada `directiva.page.tsx` se retiró el 2026-11-12. No las use como precedente para funciones nuevas.

## Reglas

- Enfocar la UI en campañas compartidas, vínculos, agregados autorizados, necesidades declaradas, última sincronización, planificación, propuestas, reportes y auditoría.
- No añadir CRUD operativo del agricultor ni nuevas escrituras privadas.
- No expandir cola offline/PWA; un service worker no cambia la autoridad de datos.
- No mostrar detalle privado cuando basta un agregado y no enviar `tenantId` desde el cliente.
- No implementar aportes comunales (retirados, ADR-002), voz autónoma ni pronósticos fuera de la consulta de la estimación SES/naive de INT-09 ([ADR-004](../docs/adr/ADR-004-estimacion-exploratoria-ses-naive.md)). La Web no calcula estimaciones ni las suma a necesidades o propuestas.
- Las propuestas colectivas no crean efectos individuales automáticos.
- Mantener servicios/tipos/rutas coherentes mientras existan consumidores legacy; su retirada sigue `TRANSITION_PLAN.md`.

## Verificación

Cuando cambie código, ejecute lint/build y verificación visual pertinente. Los cambios documentales no justifican afirmar pruebas funcionales.
