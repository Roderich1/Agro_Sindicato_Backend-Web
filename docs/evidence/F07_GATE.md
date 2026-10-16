# GATE-F07 (#29) — Acta de evaluación técnica (propuesta)

- **Estado propuesto:** `Status = Validation`, `Gate = Pending`, `Evidence = Partial`.
- **Esta acta no aprueba el gate.** Sólo Roderich Rendón, con confirmación explícita, puede registrar Passed, Failed o Waived.
- **Redactada:** 2026-10-16 por Claude Code (sesión B), con autorización delegada para construir. Es una evaluación técnica automatizada; no hubo inspección personal de capturas por Roderich ni revisión del tutor.
- **Base evaluada:** rama `feat/f07-web-directiva`, código `ba14a20` (PR draft, sin fusionar). Resultados en [F07_WEB.md](F07_WEB.md).
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
| 9 | Si F07-POL-01 o F07-REC-01 siguen abiertos, el gate sigue Pending | F07-POL-01 (#107) abierta; F07-REC-01 (#108) implementada en este PR, sin fusionar | Gate **Pending** |

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
- Las celdas suprimidas no muestran el conteo exacto de aportantes (decisión del 2026-10-16 registrada en la continuación de tres sesiones).

## Discrepancias que decide Roderich

1. **#108 excluye el «solo rol técnico de Administrador» (RN-23); ADR-003 (2026-10-15) da al ADMINISTRADOR del tenant las funciones de Directiva.** Se siguió ADR-003, que es posterior. Hay que actualizar el texto de #108.
2. **#25 pide estado por agricultor y última sincronización.** No se implementa por la decisión de alcance: sólo conteos agregados.
3. **RF-22, detalle por agricultor «cuando el permiso lo habilite».** No existe tal permiso; no se implementa.
4. **#23 pide retirar o desactivar la cola offline Web y revisar las páginas legacy.** No se amplía ni se usa en las páginas nuevas, pero sigue existiendo para la transición (#81). #23 queda parcial.

## Por qué `Evidence = Partial`

- El código está en un PR draft sin fusionar; no hay CI de `main` integrado con este código.
- La política F07-POL-01 no está aprobada: las cifras sólo se demostraron con datos sintéticos.
- Las capturas del recorrido son automatizadas (Edge sin interfaz); nadie las revisó en persona.
