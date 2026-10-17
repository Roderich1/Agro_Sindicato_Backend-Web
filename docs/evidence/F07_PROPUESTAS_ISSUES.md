# F07 — Propuestas de texto y cierre de issues (para A)

Preparadas por la sesión B el 2026-10-17 (UTC). **B no las aplica.**
- A las revisa, imprime el dry-run y aplica sólo lo autorizado.
- Ningún cuerpo se reemplaza: se **añade** una sección «Actualización 2026-10-17» al final, y el texto anterior queda íntegro como antecedente.
- Sin cambios de gate.
- Las referencias a evidencia usan `main` `e2263b0` para lo que ya está integrado. Lo que cita `f07-acceptance` llega con este PR (#128): esos textos dicen «`main` tras integrar #128 (`<SHA>`)», y A completa el SHA al integrar. #23 depende del PR #127.

Resumen:

| Issue | Acción propuesta | Condición |
|---|---|---|
| #23 | Comentario y cierre | Al integrar #127 |
| #24 | Añadir «Actualización» (RF-22 agregado) + comentario y cierre | Al integrar este PR (aceptación) |
| #25 | Comentario y cierre | Ya se cumple la condición del cuerpo (#126 en `e2263b0`) |
| #26 | Añadir «Actualización» (corrige «NOT_STARTED») + comentario y cierre | Al integrar este PR |
| #27, #28 | Comentario y cierre | Al integrar este PR |
| #107 | Comentario con el paquete; **sigue abierto** | — |
| #29 | Comentario de estado; **sigue abierto y Pending** | — |

---

## #23 — comentario (y cierre al integrar #127)

*Nota del 2026-10-17:*
- #23 se cerró a las 14:43:05Z al integrarse #127 (`9df7888`, `Closes #23`).
- El texto siguiente ya no es una propuesta de cierre: puede publicarse como comentario de evidencia, citando además el recorrido 25/25 de #132 (`81fae93`), o descartarse.
- En los demás textos, `<SHA>` es `cab433d`, el merge de #128.


```text
**Cierre (2026-10-17 UTC, por la revisión de la sesión B y la integración de #127).** Los criterios vigentes están cumplidos en `main` con la PHASE 5 del plan de transición:

| Criterio | Evidencia |
|---|---|
| Sin rol de Directiva o Administrador: redirigido, sin menú ni datos | `routes-roles.test.tsx`, `farmer-route.test.tsx`, `collective-route.test.tsx`; recorrido de la Web compilada 22/22 (`docs/evidence/F07_WEB_01.md` §6) |
| Directiva y Administrador: sólo vistas colectivas (ADR-003) | Menú congelado (`collective-route.test.tsx`) |
| PWA sin conexión: nada se encola y se informa | `collective-summary.page.test.tsx`, `routes-roles.test.tsx`; recorrido «Generar propuesta» sin red |
| Sin cola de negocio en uso | `/sync` no se ofrece; el `AppShell` no lee la cola |
| Pruebas sin debilitar las previas | 70/70; las que cambian de expectativa conservan el caso anterior con el flag de rollback |

- **Rollback:** compilar con `VITE_LEGACY_FARMER_WEB=enabled` o revertir.
- **No cambia el API:** el bloqueo de escrituras legacy es la PHASE 6 y la retirada, la PHASE 9 (#81, que sigue abierto).
- **Consumidores:** `LEGACY_CONTRACT_CONSUMERS.md`.
- **Gate:** GATE-F07 (#29) sigue Pending por #107.
```

## #24 — sección añadida al final del cuerpo

```text
---

## Actualización 2026-10-17: criterio de detalle individual (RF-22)

La registra la sesión B; la decisión es la del 2026-10-16 (`docs/evidence/F07_GATE.md`, «Decisiones del 2026-10-16»), la misma de #25. **El texto anterior se conserva arriba como antecedente.**

- **Lo que cambia:** el criterio «Dada una Directiva sin permiso de detalle individual… Con ese permiso, recibe además el detalle por agricultor (RF-22)» se evalúa sólo en su parte agregada.
- **Lo que no se habilita:** no existe un permiso de detalle por agricultor. Su variante con permiso es alcance condicionado y no habilitado, y no se crea un permiso para satisfacer el texto antiguo.
- **Criterio vigente:** dada una Directiva o un Administrador del tenant, cuando consultan el consumo, entonces reciben sólo agregados por celda, separados de las necesidades declaradas, sin datos por agricultor.
```

## #24 — comentario de cierre

```text
**Cierre (2026-10-17 UTC).** Criterios evidenciados en `main` tras integrar #128 (`<SHA>`) y en la aceptación de F07 (`docs/evidence/F07_CIERRE_MATRIZ.md`, sección #24):

| Criterio | Evidencia |
|---|---|
| Sólo la versión vigente | `f07-acceptance.postgres.spec.ts`: SUPERSEDE, reintento y CANCEL. Oráculo D4 (`f07-web-proposal`) |
| Ausencia ≠ cero; cobertura | Aceptación; `f06-coll-05` «threshold, explicit zero, absence and coverage»; Web «ausencia… no es cero» |
| Unidades incompatibles separadas | Aceptación «units…»; `disclosure-policy.spec` «never adds ML and G» |
| Detalle individual | Sólo agregado. El detalle por agricultor no está habilitado (Actualización 2026-10-17) |
| Necesidades y consumo separados | Aceptación (celdas distintas); Web (regiones «Necesidad declarada» y «Consumo») |
| Filtros y actualidad | Campaña visible; `data_as_of` = última aceptación (aceptación, JSON y CSV) |

La divulgación real sigue cerrada (`POLICY_PENDING` en producción) hasta #107.
```

## #25 — comentario de cierre

```text
**Cierre (2026-10-17 UTC).** Se cumple la condición de la «Actualización 2026-10-16»: la corrección de la cobertura (hallazgo (b) de la revisión de #45) está integrada y verificada en `main` `e2263b0` (PR #126). Las pruebas de aceptación citadas abajo llegan con #128 (`main` tras integrarlo, `<SHA>`).

| Criterio vigente | Evidencia |
|---|---|
| Sin datos no cuenta como cero; la cobertura lo cuenta como «sin cifras» | `f07-acceptance.postgres.spec.ts` (`linked_members` > `members_with_contribution`) |
| Filtros, fecha y cobertura agregada sin revelar conteos de celdas suprimidas | `f10-sec-02-disclosure-gaps` «coverage does not reveal the exact contributor count…»; aceptación «coverage counts only the Members inside published figures (#126)» (`suppressed_cells` sin conteo); propuesta con `coverage.basis` |
| AGRICULTOR 403 | `f06-coll-05` «authorization…»; `f07-web-proposal` «roles and tenant…» |

- **Alcance no construido:** el estado por agricultor y la última sincronización de cada uno siguen siendo alcance condicionado y no habilitado; no se creó ningún permiso.
- **Evidencia:** `docs/evidence/F07_CIERRE_MATRIZ.md`.
```

## #26 — sección añadida al final del cuerpo

```text
---

## Actualización 2026-10-17: estado de implementación

La registra la sesión B. **El texto anterior se conserva arriba como antecedente.**

- **Lo que corrige:** la frase «`IMPLEMENTATION = NOT_STARTED`» de la normalización describía el estado anterior a la implementación.
- **Cómo está hoy:** la consolidación determinista de `DECLARED_NEED` está implementada en el resumen colectivo (F06 #21, F07 #116) y corregida en F10-SEC-02 (#118, #126). Está integrada en `main` `e2263b0`.
- **Evidencia por criterio:** `docs/evidence/F07_CIERRE_MATRIZ.md`, sección #26.
- **Lo que no se implementa:** `net_need` (RF-32), porque F06 deniega `declared_stock`.
```

## #26 — comentario de cierre

```text
**Cierre (2026-10-17 UTC).** Los nueve criterios están evidenciados en `main` tras integrar #128 (`<SHA>`), en `f06-coll-05`, `f07-web-proposal`, `f10-sec-02-*` y la aceptación `f07-acceptance` (`docs/evidence/F07_CIERRE_MATRIZ.md`, sección #26):
- sólo vigentes, sin duplicar reenvíos;
- CANCELLED y CONTESTED fuera;
- ausencia ≠ cero y cero explícito;
- unidades y productos separados;
- otro tenant excluido;
- `OVERFLOW` explícito;
- sin datos por agricultor;
- sin compras, lotes, movimientos, deudas ni pagos, y sin `declared_stock`.

**Límites:** la salida no se llama `net_need`, y la divulgación numérica sigue la política F07-POL-01 (#107), que sigue abierta: sin cifras reales en producción.
```

## #27 — comentario de cierre

```text
**Cierre (2026-10-17 UTC).** Propuesta de compra conjunta sin IA evidenciada en `main` tras integrar #128 (`<SHA>`):

| Criterio | Evidencia |
|---|---|
| Determinista | `f07-web-proposal` «regeneration… same lines, order and fingerprint»; `proposal.spec` |
| Sólo vigentes; unidades separadas; ausencia ≠ cero con cobertura y actualidad | `f07-acceptance` y `f07-web-proposal` |
| Sin compra, inventario, deuda, pago, lote ni movimiento; estado `DRAFT` | `f07-web-proposal` «generation creates no…»; aceptación (conteos idénticos) |
| Sin rol de Directiva: rechazo | `f07-web-proposal` «roles and tenant…» |
| Sin ahorros no medidos | Aceptación (JSON y CSV sin ahorros, precios ni costos) |

**Sin transición a efectos individuales:** no existe ninguna acción que convierta un borrador en compra, y `POST /purchases/joint` está cerrado (403, #118).

**Evidencia:** `docs/evidence/F07_CIERRE_MATRIZ.md`, sección #27.
```

## #28 — comentario de cierre

```text
**Cierre (2026-10-17 UTC).** Reporte y exportación: `GET /collective/campaigns/:id/summary.csv` y `GET /collective/proposals/:id/csv` salen de la misma decisión que el JSON (F07-POL-01 R8).
- Necesidad declarada, sin forecasting.
- Sólo vigentes, unidades separadas y cobertura.
- Sin efectos individuales ni ahorros.
- Neutralizan fórmulas.

**Evidencia:**
- `f06-coll-05` «JSON and CSV carry the same decisions; no individual data»;
- `collective-config.spec`, `proposal.spec` (CSV);
- `f07-acceptance` (CSV del resumen y de la propuesta = JSON);
- `docs/evidence/F07_CIERRE_MATRIZ.md`, sección #28.
```

## #107 — comentario (sigue abierto)

```text
**Estado (2026-10-17 UTC): construcción lista / validación institucional pendiente.**

- **Paquete de decisión:** `docs/evidence/F07_POL_01_PAQUETE_DECISION.md`, con la política vigente (incluida la regla de combinaciones de #126, §9 de `F07_AGGREGATE_DISCLOSURE_POLICY.md`), k = 3 propuesto, límites, casos resueltos y las validaciones necesarias.
- **Decisiones registradas hasta hoy:** son técnicas y delegadas por Roderich para datos sintéticos.
- **Lo que no consta:**
  - la decisión de Roderich como autor para datos reales («Verificado por Roderich Rendón (autor) el <fecha real>»);
  - una validación de la Directiva del Sindicato;
  - la revisión del tutor.

Producción sigue sin cifras (`POLICY_PENDING`). El issue sigue abierto y GATE-F07 (#29) sigue Pending.
```

## #29 — comentario de estado (sigue abierto, Pending)

```text
**Estado (2026-10-17 UTC, revisión de la sesión B sobre `main` `e2263b0` + #127):**
- Los criterios 1–8 están evidenciados en lo técnico (`docs/evidence/F07_CIERRE_MATRIZ.md`).
- El criterio 9 no se cumple: #108 está cerrado, pero **#107 sigue abierto**, a falta de la decisión y de la validación institucional.
- El gate sigue **Pending**. Esta revisión no propone Passed.
- La divulgación real sigue cerrada.
```
