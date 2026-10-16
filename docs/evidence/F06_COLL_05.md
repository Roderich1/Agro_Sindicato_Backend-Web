# F06-COLL-05 (#21) — Consolidación colectiva y reconciliación

- **Fecha real:** 2026-10-16.
- **Rama:** `feat/f06-consolidacion` (PR #110). Código en `3c01a160713a7712e13608731df18f4ae4eb0790`.
- **Requisitos:** RF-24, RF-33, RF-34, RNF-05, RNF-12; CU-18; RU-18/RU-19 (ADR-003).
- **Revisión:** técnica automatizada. Hay autorización delegada para ejecutar; no hay revisión del autor ni del tutor.

## Qué se implementó

**Módulo `collective`**, de sólo lectura sobre `SyncV1Contribution`:

- `GET /api/v1/collective/campaigns/:id/summary` y `…/summary.csv`, para `DIRECTIVA` y `ADMINISTRADOR` del mismo tenant.
- **Qué entra en el cálculo:**
  - sólo aportaciones `ACTIVE` con cantidad, de Members y cuentas activos;
  - `CANCELLED`, `CONTESTED` y `NEVER_PUBLISHED` quedan fuera.
- **Cómo se agrupa:** por proyección × producto canónico vigente × unidad base, con suma `BigInt` y control de desbordamiento.
- **Divulgación:** se decide en el servidor con F07-POL-01, **provisional** y no aprobada. Por defecto el modo es `POLICY_PENDING`: sin celdas en ningún canal.

**Reconciliación canónica** (base de CU-18):

- `ProductCanonicalAssociation`: una sola asociación vigente por producto (índice único parcial). Se corrige cerrando la vigente y abriendo otra.
- **Historial inmutable:** triggers impiden borrar y sólo permiten cerrar.
- **Asociación explícita:** exige confirmación y motivo, sin cadenas, sólo dentro de la misma dimensión de unidad, y serializada con un advisory lock.
- `GET/POST /api/v1/collective/product-associations` y `POST …/:productId/close`.

**Historial de publicaciones del agregado:** `CollectiveRelease` y `CollectiveReleaseItem`, inmutables salvo la retirada, que se marca una sola vez.

**Migración:** `20261016043000_f06_collective_consolidation` (expand-only). OpenAPI F06 regenerada con aserciones.

## Verificación automatizada

CI del PR #110 sobre `3c01a16`, run [38847561897](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/actions/runs/38847561897) (`success`):

| Paso | Resultado |
|---|---|
| `prisma validate`, `generate`, `build` | OK |
| `npm test` | 32 suites pasan, 8 omitidas; 189 pruebas pasan, 132 omitidas (las de PostgreSQL corren aparte) |
| `openapi:check` | snapshots iguales; aserciones F02, F05 y F06 OK |
| PostgreSQL: auth-v2 / current-auth-context / f02-final | 12 / 25 / 3 |
| PostgreSQL: journal / adversarial / references (F05) | 30 / 41 / 7 |
| PostgreSQL: `f06-coll-05-collective-aggregate.postgres.spec.ts` | 9/9 |
| PostgreSQL: `product-reconciliation.postgres.spec.ts` | 5/5 |
| SonarCloud | `success` |

**Mutaciones** (2026-10-16 04:51Z):

- Contra `3c01a16` y una base desechable del contenedor `agro_f06d4_pg`, por reemplazo exacto y con restauración byte a byte verificada.
- Se detectaron las 12:
  - D1: sin el filtro de Member o cuenta activos;
  - D2: cuenta aportaciones, no Members distintos;
  - D3: una baja no retira la cifra;
  - D4: basta un Member cambiado para publicar una cifra nueva;
  - D5: usa también asociaciones cerradas;
  - D6: la unidad no separa celdas;
  - D7: sin detectar el desbordamiento;
  - D8: modo provisional también en producción;
  - D9: sin comprobar la dimensión;
  - D10: se permiten cadenas;
  - D11: AGRICULTOR lee el consolidado;
  - D12: la campaña no se filtra por tenant.

## Criterios de #21

| Criterio | Evidencia | Tipo | Resultado |
|---|---|---|---|
| Dataset sólo con datos ALLOW | El dataset es local. Lo que viaja es el envelope de 4 campos (Mobile, «el envelope lleva sólo los cuatro campos de F06»). Las columnas de journal y contribución omiten payload y secretos (journal spec) | CI | PASS |
| PUBLISH, SUPERSEDE y CANCEL actualizan proyección y agregado | Reconciliación: PUBLISH de 26 aportaciones y CANCEL de una necesidad ya sincronizada. SUPERSEDE en `f06-coll-05…` («two answers never differ…») y en Central físico durante D3 | Corrida local + CI + D3 físico | PASS |
| Replay o reintento sin doble suma | Reconciliación: 27 respuestas perdidas y reenviadas, más 27 reenvíos literales; el journal sigue en 27 y el agregado es idéntico. «Desde otra instalación del mismo Member» lo cubre `sync-v1-adversarial.postgres.spec.ts` «C10 another ACTIVE installation of the same Member replays the same ID…» | Corrida local + CI | PASS |
| Fork → `CONTESTED` y excluido, sin LWW | `f06-coll-05…` «cancellation, dispute and membership change withdraw the figure»; adversarial «C11 order a→b», «C11 order b→a (symmetric)», «C11 concurrent successors…» | CI | PASS |
| Decisión humana → nueva intención causal | Adversarial «C14 resolution with the current head and reference, then a late replay and a fenced successor» y «C15 an obsolete reconciliation reference: RECONCILIATION_STALE…»; Mobile `resolveConflict` del consumo («un conflicto bloquea ese total…») | CI | PASS |
| `CANCELLED` no resucita | Adversarial «C12 CANCEL accepted and an old APPLIED replay…» y «C13 … CANCELLED_PREDECESSOR, no resurrection» | CI | PASS |
| Cross-tenant, cross-Member o revocado → sin efecto | `f06-coll-05…` «authorization…»; adversarial C22/C40, C23, C34, C35; suites F02 | CI | PASS |
| Ausencia = desconocida; sólo el cero declarado es cero | `f06-coll-05…` «threshold, explicit zero, absence and coverage»; reconciliación: C1/Urea llega a 3 aportantes gracias al 0 explícito, y la cobertura es 3 de 12 | CI + corrida local | PASS |
| Total exacto; no se mezclan unidades; overflow determinista | `disclosure-policy.spec.ts` (ML y G) y `f06-coll-05…` «an int64 overflow is reported, never truncated»; reconciliación con diferencia 0 | CI + corrida local | PASS |
| Sin efectos en inventario, compras o deudas; ningún dato DENY | `f06-coll-05…` «is read-only over contributions…»; adversarial F05 «privacy and individual domain…»; Mobile «…sin tocar el inventario» | CI | PASS |

**Discrepancia anotada.** El issue pedía la spec en `src/modules/sync-v1/infrastructure/`. Está en `src/modules/collective/`, porque el módulo nuevo es de sólo lectura y está separado de Sync v1.

## Reconciliación

Ver [F06_RECONCILIATION.md](F06_RECONCILIATION.md):

- diferencia 0 en las 27 celdas;
- dos ejecuciones con reenvíos; agregado idéntico;
- Central 26/26 frente al oráculo escrito a mano.

## Límites

- La divulgación provisional (k = 3) no está aprobada ([F07_POL_01](F07_POL_01.md)). Las cifras reales siguen deshabilitadas.
- **Pendiente (ADR-003).** Los endpoints heredados que exponen datos centrales antiguos a DIRECTIVA y ADMINISTRADOR no se revisaron aquí.
- La pantalla Web de reconciliación (CU-18) es de F07/D5.
