# GATE-F07 (#29) — Acta de evaluación técnica (propuesta)

- **Estado propuesto:** `Status = Validation`, `Gate = Pending`, `Evidence = Partial`.
- **Esta acta no aprueba el gate.** Sólo Roderich Rendón, con confirmación explícita, puede registrar Passed, Failed o Waived.
- **Redactada:** 2026-10-16 por Claude Code (sesión B), con autorización delegada para construir. Es una evaluación técnica automatizada; no hubo inspección personal de capturas por Roderich ni revisión del tutor.
- **Base evaluada:** rama `feat/f07-web-directiva`, último commit de código `dee81dc`, con CI de Backend y Web en verde. Al evaluarse era un PR draft sin fusionar; **se integró después** (ver «Estado de integración»). Resultados en [F07_WEB.md](F07_WEB.md).
- **Defecto corregido antes de esta evaluación.** La revisión de la sesión A sobre #116 encontró que un borrador podía servir una divulgación antigua sustituida y después retirada (R4/R8). Está corregido en `6db54b5` y cubierto por una regresión completa que fallaba con el código anterior ([F07_WEB.md](F07_WEB.md) §2). La versión anterior de la evidencia afirmaba lo contrario y se corrigió.
- **Política de divulgación:** F07-POL-01 sigue **sin aprobar** (#107). Todo lo que muestra cifras se ejecutó con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` y datos sintéticos. En producción no hay cifras.

## Criterios de #29

| # | Criterio | Evidencia | Dictamen técnico |
|---|---|---|---|
| 1 | Sólo versiones vigentes del mismo producto canónico y unidad; un agricultor sin declaración no es cero (RF-21, RF-24) | Dataset y oráculo D4 publicados por la API: etapas RAW y CANONICAL coinciden celda a celda (`f07-web-proposal.postgres.spec.ts`); necesidad cancelada ausente; agricultor F4 sin aportes sólo en la cobertura (3 de 4); recorrido Web | **Evidenciado** con datos sintéticos |
| 2 | Necesidad declarada diferenciada del forecasting | La propuesta usa `basis = DECLARED_NEED`; aviso fijo en pantalla y en el CSV: «no resta stock y no es necesidad neta»; sin recomendaciones ni predicciones | **Evidenciado** |
| 3 | Regla determinista con entradas, unidades, redondeos y salida definidos | Entradas: celdas `DECLARED_NEED` que el resumen decidió (F07-POL-01). Unidades base `ML`/`G`, nunca sumadas entre sí. Sin redondeo: enteros exactos y L/KG exactos con BigInt. Salida: líneas ordenadas + huella SHA-256 de las entradas autorizadas. Misma entrada → mismas líneas y huella (PostgreSQL y unitarias) | **Evidenciado** |
| 4 | Consumo agregado separado de las necesidades, sin datos privados (RF-22) | El resumen Web presenta «Necesidad declarada» y «Consumo» en tablas separadas; nunca se suman ni restan. No hay permiso de detalle por agricultor: el detalle individual **no se implementa** | **Evidenciado en lo agregado**; detalle individual de RF-22 no implementado (ver límites) |
| 5 | La propuesta conserva campaña, líneas y versión de necesidades; queda pendiente de revisión; no crea inventario, deuda, pago, lote ni movimiento (RF-23) | Estado único `DRAFT`; huella como versión de las entradas; conteo de filas de compras, ítems, asignaciones, participantes, lotes, movimientos, cuentas por pagar, pagos, contribuciones y journal idéntico antes y después en PostgreSQL real | **Evidenciado** |
| 6 | Cualquier efecto individual posterior exige confirmación humana y requisito aprobado | No existe ninguna acción que convierta un borrador en compra. La compra conjunta ejecutada legacy (`/directiva`, `CreateJointPurchaseUseCase`) no se usa y sale del menú | **Evidenciado por ausencia**; el flujo legacy sigue expuesto (ver límites) |
| 7 | Filtros, actualidad y cobertura en cada vista; sin ahorro no medido | Campaña como filtro visible; «datos aceptados hasta»; cobertura «N de M»; ninguna cifra económica | **Evidenciado** |
| 8 | La primitiva histórica `create-joint-purchase` no basta | La propuesta es un módulo nuevo; la primitiva no se reutiliza | **Evidenciado** |
| 9 | Si F07-POL-01 o F07-REC-01 siguen abiertos, el gate sigue Pending | F07-POL-01 (#107) abierta. F07-REC-01 (#108) implementada en #116, **fusionado en `71460bf`**; #108 sigue abierta (su texto frente a ADR-003 está por decidir) | Gate **Pending** |

## Criterios del brief D5 (adaptados)

| Criterio | Dictamen |
|---|---|
| (1) Navegación de Directiva congelada | Menú congelado para DIRECTIVA y ADMINISTRADOR (ADR-003). Las rutas legacy siguen existiendo |
| (2) Resumen = oráculo y supresión aplicada | Evidenciado (oráculo D4 RAW/CANONICAL) |
| (3) Propuesta determinista y sin efectos | Evidenciado |
| (4) Un agricultor no accede | API 403 y ruta Web redirigida; tenant ajeno 404; sin sesión 401 |
| (5) Limitaciones declaradas | Ver abajo |
| (6) Reconciliación confirmada, con historial, reflejada en el resumen (CU-18) | Evidenciado: Bellator → Belator confirmado en la Web; el resumen y la propuesta regenerada lo reflejan |

## Correcciones aplicadas al brief D5 (por instrucción de la sesión)

- **No** se implementó el párrafo que permitía incluir en la propuesta cantidades bajo el umbral. La propuesta, su detalle, su historial y su CSV siguen la misma política que el resumen; una línea suprimida sólo lleva estado y motivo.
- **No** se creó `GET /collective/members-status` ni ningún listado de quién aportó: la cobertura es sólo agregada (#25 queda parcial).
- Las celdas suprimidas no muestran el conteo exacto de aportantes. Es la decisión técnica delegada del 2026-10-16 «Celda suprimida: sin cantidad ni conteo exacto, con un motivo comprensible, nunca como cero», registrada en [F07_POL_01.md](F07_POL_01.md) («Decisiones técnicas delegadas (2026-10-16)») y en [F07_AGGREGATE_DISCLOSURE_POLICY.md](../architecture/F07_AGGREGATE_DISCLOSURE_POLICY.md) §7. No es una inspección personal de Roderich ni una revisión del tutor.

## Discrepancias que decide Roderich

1. **#108 excluye el «solo rol técnico de Administrador» (RN-23); ADR-003 (2026-10-15) da al ADMINISTRADOR del tenant las funciones de Directiva.** Se siguió ADR-003, que es posterior. Hay que actualizar el texto de #108.
2. **#25 pide estado por agricultor y última sincronización.** No se implementa por la decisión de alcance: sólo conteos agregados.
3. **RF-22, detalle por agricultor «cuando el permiso lo habilite».** No existe tal permiso; no se implementa.
4. **#23 pide retirar o desactivar la cola offline Web y revisar las páginas legacy.** No se amplía ni se usa en las páginas nuevas, pero sigue existiendo para la transición (#81). #23 queda parcial.

## Estado de integración (actualizado el 2026-10-16 por la sesión A, bloque F10)

Sólo se actualiza el estado; los dictámenes de arriba se conservan como se evaluaron sobre `dee81dc`.

- **#116 fusionado** en `main` en **`71460bf`** (2026-10-16 18:09:19Z), sobre el HEAD `406e025`, que respecto de `49b834d`/`dee81dc` sólo cambia documentación.
- **CI de `main`:**
  - sobre `71460bf`: «Backend F02 verification» run 38945151622 (`verify`) y «Web F07 verification» run 38945151723 (`web` y `f07-proposal-postgres`), **SUCCESS**;
  - sobre `ba51c70` (tras integrar F08): runs 38946474664 y 38946474741, **SUCCESS**.
- **Verificación local de `main` integrado** por la sesión A sobre `ba51c70`: unitarias 218 y las 10 suites PostgreSQL, incluida la de propuestas.
- **Después:** BE #118 (F10-SEC-02, rutas heredadas) se fusionó en **`f9ea66a`** (2026-10-16 21:29:05Z). Cierra en la API `POST /purchases/joint` y `GET /inventory/global-stock` (403 `LEGACY_ROUTE_CLOSED`), retira `currentStock` del catálogo y los conteos de registros privados de campañas y cultivos, y deja el inventario, las compras, las deudas, las aplicaciones, las parcelas y los reportes sólo para el AGRICULTOR sobre lo propio. Evidencia: [F10_SEC_02_ROUTES.md](F10_SEC_02_ROUTES.md). **#45 y #81 siguen abiertas** (pendientes en su §9).
- **Discrepancias #108/ADR-003 y #25/RF-22:** la referencia es la §8 de [F10_SEC_02_ROUTES.md](F10_SEC_02_ROUTES.md). No se implementa ningún permiso nuevo de detalle por agricultor. Las decide Roderich.

**Por qué el gate sigue Pending** (archivo de decisiones de F10): el criterio 9 exige resolver F07-POL-01 (#107) y F07-REC-01 (#108); la política de divulgación sólo está autorizada para demostración sintética, y las rutas heredadas siguen pendientes de #45/#81.

## Por qué `Evidence = Partial`

- ~~El código está en un PR draft sin fusionar; no hay CI de `main` integrado con este código.~~ Integrado en `71460bf` con CI de `main` en verde (ver «Estado de integración»).
- La política F07-POL-01 no está aprobada: las cifras sólo se demostraron con datos sintéticos.
- Las capturas del recorrido son automatizadas (Edge sin interfaz); nadie las revisó en persona.
