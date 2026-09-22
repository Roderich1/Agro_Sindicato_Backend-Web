# AGENTS.md

## Autoridad documental

Lea primero `docs/scope/CURRENT_SCOPE.md` y las matrices de `docs/scope/`. Flutter/Mobile es el cliente del agricultor y sistema de registro individual offline-first; Backend es el servicio central de proyección autorizada; Web es online-first para Directiva/Admin.

El código, schema y documentos legacy describen compatibilidad/transición, no requisitos nuevos. No los expanda sin una decisión e issue aprobados.

## Límites obligatorios

- No reintroducir forecasting, predicción o recomendaciones automáticas.
- No reintroducir F08/aportes, tesorería, banca o contabilidad.
- No construir Web como cliente operativo del agricultor ni ampliar su cola offline.
- No convertir sync en réplica total de SQLite ni proyectar datos privados por conveniencia.
- No mezclar backup privado con sync/proyección colectiva.
- La voz sólo crea un draft editable; toda operación exige confirmación humana.
- Una propuesta colectiva no crea automáticamente compra individual, lote, movimiento, deuda o pago.

## Trabajo en este repositorio

Respete `Back/AGENTS.md` o `Web/AGENTS.md` según la carpeta. Identifique autoridad del dato, consumidor legacy, issue responsable y rollback antes de cambiar contratos. No retire rutas, columnas o tablas en la misma entrega que introduce el reemplazo. Preserve cambios del usuario y verifique en proporción al cambio.
