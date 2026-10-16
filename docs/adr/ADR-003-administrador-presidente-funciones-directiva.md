# ADR-003: El presidente usa una cuenta ADMINISTRADOR con las funciones de DIRECTIVA

- **Estado:** Aceptada
- **Fecha de la decisión:** 2026-10-15 (confirmación de Roderich Rendón, autor). Registrada el 2026-10-16.
- **Autor:** Roderich Rendón
- **Requisitos:** RU-18, RU-19 (Cap. III v1.5)
- **Relacionado:** [ADR-001](ADR-001-mobile-individual-system-of-record.md); [`F06_COLLECTIVE_PROJECTION_CONTRACT.md`](../architecture/F06_COLLECTIVE_PROJECTION_CONTRACT.md) §5; [`F07_AGGREGATE_DISCLOSURE_POLICY.md`](../architecture/F07_AGGREGATE_DISCLOSURE_POLICY.md)

## Contexto

En la institución piloto, el presidente del sindicato administra los accesos y, a la vez, consulta la información colectiva. Duplicar cuentas (una ADMINISTRADOR y otra DIRECTIVA para la misma persona) complica la operación y no aporta control. RU-18 exige que el rol administrativo no conceda acceso a las operaciones privadas de negocio de los agricultores.

RU-18 y RU-19 quedan confirmados por el autor el 2026-10-15. Esa confirmación no es una revisión del tutor ni de la Directiva, y el resto de la URS y la SRS sigue como propuesta.

## Decisión

1. El presidente usa **una sola cuenta con rol `ADMINISTRADOR`**. Dentro de **su propio tenant**, esa cuenta ejerce todas las funciones de `DIRECTIVA`:
   - administración de accesos;
   - consultas colectivas autorizadas;
   - reconciliación de productos;
   - propuestas de compra conjunta.
2. Ese rol **no** concede acceso a los respaldos privados (F08) ni a las operaciones individuales de otros agricultores. Sigue sin poder publicar aportes en nombre de un agricultor: Sync v1 exige un Member `AGRICULTOR`.
3. Se usa el modelo de roles existente (`UserRole`). No se crea un rol nuevo ni un indicador de «presidente».

## Verificación en el código (2026-10-16, rama `feat/f06-consolidacion`)

| Superficie | Roles admitidos | Prueba |
|---|---|---|
| `GET /api/v1/collective/campaigns/:id/summary` y `.csv` | DIRECTIVA, ADMINISTRADOR del mismo tenant; AGRICULTOR → 403; otro tenant → 404 | `f06-coll-05-collective-aggregate.postgres.spec.ts` |
| `GET/POST /api/v1/collective/product-associations` | DIRECTIVA, ADMINISTRADOR del mismo tenant; AGRICULTOR → 403 | `product-reconciliation.postgres.spec.ts` |
| Sync v1 (`/api/v1/sync/v1/*`) | sólo Member AGRICULTOR con sesión v2 enlazada a su ClientRegistration | `SyncV1AuthGuard`; suites `sync-v1-*.postgres.spec.ts` |

## Consecuencias

- Los endpoints nuevos de F06/F07 aceptan `DIRECTIVA` y `ADMINISTRADOR` juntos, siempre restringidos al tenant autenticado.
- **Pendiente.** Algunos módulos heredados, anteriores a ADR-001, admiten DIRECTIVA y ADMINISTRADOR sobre datos centrales heredados: `applications`, `reports`, `accounts-payable`, `audit-logs` y `sync` antiguo. Esta ADR no los cambia ni los da por conformes con RU-18. Su revisión queda para F10-SEC-02 (#45).
- No confundir este rol central con el rol privado local `ADMIN` de `persons` en Mobile, que sólo describe quién paga a proveedores dentro de un hogar.
