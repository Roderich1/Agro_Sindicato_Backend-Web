# Propuesta de cierre de #108 y del alcance agregado de #25 / RF-22

Preparada por la sesión B el 2026-10-17 (UTC) para la sesión A, que actualiza los issues y el Project. Sigue las decisiones de cierre del 2026-10-16 (delegación técnica de Roderich, `_briefs/CIERRE_TECNICO_Y_EVALUACION_AGROCUENTAS_2026-10-16.md` §1, «F07, reconciliación y cobertura»).

No es una aprobación del tutor ni de la Directiva. **No crea ningún permiso de detalle por agricultor y no construye las sugerencias opcionales.** GATE-F07 (#29) sigue Pending por #107.

## 1. #108 F07-REC-01: alineación con ADR-003

**Decisión aplicada:**
- DIRECTIVA y ADMINISTRADOR del mismo tenant ejercen la reconciliación;
- el AGRICULTOR recibe 403;
- otro tenant no ve ni modifica la asociación;
- el rol institucional no da acceso a operaciones ni a respaldos privados.

Esto último lo hacen cumplir F10-SEC-02 (`F10_SEC_02_ROUTES.md`, `F10_SEC_02_PROJECTION.md`) y F08.

**Texto propuesto para el criterio de roles.** Se conserva el anterior como antecedente.

> ~~Dados un AGRICULTOR o un ADMINISTRADOR sin permiso funcional de Directiva, cuando intentan asociar o corregir, entonces responde 403 sin efecto.~~ *(Antecedente, anterior a ADR-003 del 2026-10-15.)*
>
> Dado un AGRICULTOR, cuando intenta consultar, asociar o corregir, entonces responde 403 sin efecto. La DIRECTIVA y el ADMINISTRADOR del mismo tenant (ADR-003) pueden reconciliar; otro tenant no ve ni modifica la asociación (404 indistinguible de inexistente). El rol institucional no concede acceso a operaciones ni respaldos privados.

En «No incluye: acceso por el solo rol técnico de Administrador (RN-23)», se propone sustituir el texto por: «RN-23: el rol técnico no da acceso a operaciones privadas; el ADMINISTRADOR del tenant ejerce las funciones de Directiva (ADR-003)».

**Criterios y evidencia existente.** Rutas relativas a `Back/src/modules/`.

| Criterio de #108 | Evidencia (prueba → caso) | Estado |
|---|---|---|
| Belator y Bellator bajo un canónico; unidades compatibles; nombres originales sin cambio | `inventory/infrastructure/product-reconciliation.postgres.spec.ts` «Belator and Bellator under one canonical product, names untouched»; `collective/f07-web-proposal.postgres.spec.ts` «CANONICAL stage…» (oráculo D4: Belator 11 L / 8 L) | Evidenciado |
| Sin confirmación no se consolida nada | `inventory/application/use-cases/product-reconciliation.use-case.spec.ts`, caso «without confirmation» (`CONFIRMATION_REQUIRED`); Web: «Confirmar asociación» deshabilitado sin la casilla (`F10_COMPATIBILIDAD_WEB.md` W4) | Evidenciado. **Las sugerencias por similitud eran opcionales y no se construyen** |
| Corrección con historial (actor, fecha y motivo) y nueva asociación vigente | `product-reconciliation.postgres.spec.ts` «a correction closes the current row with actor, date and reason, and opens another» | Evidenciado |
| Una denominación sin reconciliar aparece por separado, nunca asignada en silencio | `collective/f06-coll-05-collective-aggregate.postgres.spec.ts` «aliases: confirmed association…»; Web W2/W4 (Bellator propio antes, agrupado después) | Evidenciado |
| AGRICULTOR 403; DIRECTIVA y ADMINISTRADOR del tenant (ADR-003) | `product-reconciliation.postgres.spec.ts` «only compatible units, only the tenant, only the Directiva or its ADMINISTRADOR»; `f07-web-proposal` «roles and tenant…» | Evidenciado |
| Otro tenant no ve ni asocia | Ídem (404 para el producto de otro tenant) | Evidenciado |
| Auditoría: actor, fecha, resultado y entidad, sin datos privados | Historial de asociaciones con `actor_name`, fechas y motivo (`f07-web-proposal` «the reconciliation catalogue exposes name and unit only, and history names actors») | Evidenciado |
| *(F10-SEC-02)* Una reasociación no publica una cifra que aísle a un agricultor | `collective/f10-sec-02-disclosure-gaps.postgres.spec.ts` (p→r) y `domain/disclosure-policy.spec.ts` (regla entre claves) | Primera corrección en `b02f2b0`, **eludible** (bypass3 y base3, halladas en la revisión de A). Comprobación exacta por rango en `0b29aab`, completada en `045d41d` tras la revisión final de A (celdas de una misma lectura, coste acotado y fail-closed). Ver `F10_SEC_02_PROJECTION.md` H1, §4 y §6. Pendiente de la revisión de A y de integrar |

**Propuesta:** cerrar #108 cuando se integre este PR, si A comprueba los criterios. Las sugerencias por similitud quedan registradas como «opcional, no construido».

## 2. #25 F07-WEB-03 y RF-22: alcance agregado para PG 2026

**Decisión aplicada.** #25 se resuelve con cobertura agregada.
- La información por agricultor (estado «sin datos», última sincronización de cada uno) queda **condicionada / no habilitada**, fuera de esta entrega, y no pasa a ser un Must nuevo.
- RF-22 queda construido y verificado en su parte agregada; su variante de detalle individual depende de una autorización funcional que no existe.

**Cambio de significado de la cobertura (F10-SEC-02, `b02f2b0`).** A lo registrará en #25:
- **Antes:** «N de M agricultores vinculados aportaron datos». N contaba también a los aportantes de celdas suprimidas, y con una sola celda revelaba su conteo exacto (H2).
- **Ahora:** «N de M agricultores vinculados con cifras publicadas». N cuenta sólo a los Members dentro de una cifra publicada; `suppressed_cells` avisa, sin conteo, de que hay filas sin cifra. La ausencia sigue sin mostrarse como 0.
- **Propuestas ya guardadas:** no se reescriben. Los borradores sintéticos anteriores conservan el conteo calculado con la semántica antigua (`JointPurchaseProposal.membersWithContribution`).

**Criterios de #25: propuesta.** Se conserva la redacción anterior como antecedente.

| Criterio | Alcance PG 2026 | Evidencia |
|---|---|---|
| Un agricultor sin datos no cuenta como cero | **Agregado:** la ausencia de aporte es desconocida, no cero; no hay fila por agricultor | `f06-coll-05` «threshold, explicit zero, absence and coverage»; Web W2 |
| Fecha de la última sincronización aceptada de cada agricultor | **Condicionado / no habilitado.** Sólo el «Datos aceptados hasta» agregado de cada celda publicada | `F07_WEB.md`; `F07_GATE.md` §límites |
| Filtros, actualidad y cobertura junto a las vistas consolidadas | **Agregado:** campaña elegida, «Datos aceptados hasta» y cobertura «N de M con cifras publicadas» | Web W2 (`F10_COMPATIBILIDAD_WEB.md`); `collective-summary.page.test.tsx` |
| Cobertura respecto de un subconjunto | No aplicable: no hay consulta por subconjunto de agricultores | — |
| Rechazo de un usuario sin permiso de Directiva | **AGRICULTOR 403.** El ADMINISTRADOR del tenant accede (ADR-003; el «Administrador sin permiso funcional independiente» del texto anterior queda como antecedente) | `f07-web-proposal` «roles and tenant…» |

**Propuesta:** actualizar el alcance y los criterios de #25 como en la tabla y cerrarla para PG 2026 con la cobertura agregada. La parte por agricultor queda como «condicionada, no habilitada» y no se traslada a un Must nuevo.

## 3. Lo que no cambia

- GATE-F07 (#29) sigue **Pending** mientras #107 (F07-POL-01) esté abierta. Este cierre no registra ninguna aprobación institucional de divulgación.
- k = 3 sólo para la demostración sintética; la divulgación real sigue cerrada.
