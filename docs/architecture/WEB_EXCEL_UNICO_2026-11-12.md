# Web: Excel como única exportación para el usuario (2026-11-12)

> **Nota de sustitución (2026-11-13).** La fila de portada «Umbral de privacidad» pasa a «Política aplicada» (la política y, sólo con `F07-POL-01`, su umbral). No se añade exportación de convocatorias. Rige [E4](E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md) §1.4 y §5.1 (decisiones del autor del 2026-11-13; autoría en E4 §0). El texto siguiente se conserva como historia: describe el comportamiento anterior a E4, que sigue en el código hasta que E4 se implemente.

| Campo | Valor |
|---|---|
| Fecha | 2026-11-12 (redacción e implementación en el árbol de trabajo, sin commit) |
| Base | `_wt/ET2-BE`, rama `feat/etapa3-estimacion-borrador`, HEAD `152bce9` |
| Decisión | Encargo del autor del 2026-11-12: «Excel como única opción de exportación para el usuario». Sustituye además la regla N8 (rechazada) para el Excel del borrador de propuesta |
| Alcance | Sólo la Web (`Web/**`). Las rutas CSV del servidor (`GET /collective/:campaignId/summary.csv`, `GET /collective/trends.csv`, `GET /collective/proposals/:id/csv`) las retira otra sesión en `Back/**` |
| Fuera de alcance | Mobile (sus reportes CSV/PDF de §4.3 del manual F11 no cambian); la copia sin conexión de la estimación (`estimation-copy*`), que no es una exportación; importadores y formatos internos |

## 1. Inventario

| Vista | CSV que había | Origen del CSV | Excel | Qué pasa ahora |
|---|---|---|---|---|
| Resumen colectivo | Sin botón en la Web (la ruta `summary.csv` existía en el servidor) | Servidor | `lib/collective-summary-xlsx.ts` | Sólo Excel; se completaron las columnas que sólo daba el CSV del servidor |
| Tendencias / Histórico sellado | «Exportar CSV» | Servidor (`collectiveService.trendsCsv` → `GET /collective/trends.csv`) | `lib/trends-xlsx.ts` | Retirado el botón y `trendsCsv`; Excel completado (hoja «Campañas» y columnas) |
| Estimación del consumo | «Exportar CSV de la consulta» | Navegador (`lib/estimation-csv.ts`, sobre la respuesta en memoria) | `lib/estimation-xlsx.ts` | Retirados el botón y `estimation-csv.ts`; Excel completado |
| Borrador de propuesta | «Exportar CSV» | Servidor (`collectiveService.proposalCsv` → `GET /collective/proposals/:id/csv`, con la estimación **vigente** en columnas `estimation_*`) | `lib/joint-purchase-xlsx.ts` + `lib/joint-purchase-excel-export.ts` | Retirados el botón y `proposalCsv`; el Excel pasa a la referencia **fijada** (E3) y se completa (§3) |

Piezas comunes: `components/export-buttons.tsx` (ya sin `onCsv`/`csvLabel`; muestra el error si el servidor rechaza la exportación), `lib/exports.ts` (despacho; se retiró `saveBlob`, que sólo usaban los CSV), `lib/xlsx-common.ts`, `lib/xlsx-writer.ts`. Todas las hojas de datos llevan encabezados con autofiltro e inmovilizados (`dataSheet`).

## 2. Equivalencias columna a columna

Reglas comunes del libro (sin cambios): una cifra sólo se escribe si el servidor la publicó y es válida; una ausencia es una celda vacía con su explicación, nunca un cero; los estados se rotulan en español (`STATUS_LABEL`) y su explicación distingue los que comparten rótulo (`SUPPRESSED_REVISION` y `NO_DATA`: «Sin cifra publicada» con motivos distintos). La unidad base y la cantidad en unidad base no tienen columna propia: la cantidad del libro está en L o KG, exacta (`quantity_base` / 1000 desplazando la coma sobre el string), y sólo se escribe si es coherente con la base.

### 2.1 Resumen colectivo (`summary.csv` → «Resumen», «Necesidad declarada», «Consumo publicado»)

| Columna del CSV | En el Excel |
|---|---|
| `campaign_ref` | Portada, «Referencia de la campaña» (**nuevo**) |
| `campaign` | Portada, «Campaña», y títulos de hoja |
| `disclosure` | Portada, «Cifras» sólo con `POLICY_PENDING` (el modo provisional no se rotula, decisión previa fijada en las pruebas) |
| `policy`, `approved` | Constantes del contrato (`F07-POL-01`, `false`); la política se nombra en el subtítulo |
| `threshold` | Portada, «Umbral de privacidad» |
| `linked_members`, `members_with_contribution`, `suppressed_cells` | Portada, «Cobertura» / «Cobertura al sellar» (texto) |
| `seal_ref` | Portada, «Referencia de la versión sellada» (**nuevo**) |
| `seal_version`, `sealed_at` | Portada, «Versión» y «Sellada el» |
| `projection_type` | La hoja («Necesidad declarada» o «Consumo publicado») |
| `product_ref` | Columna «Referencia del producto» (**nueva**, J) |
| `product_name` | «Producto» (A) |
| `base_unit`, `total_base` | Ver reglas comunes |
| `presentation_unit` | «Unidad» (C) |
| `status` | «Estado» (D) y «Explicación» (E) |
| `total_presentation` | «Cantidad» (B) |
| `contributors` | «Aportantes» (F), sólo publicada |
| `data_as_of` | «Datos hasta» (G), sólo publicada |
| `released_at` | «Publicado el» (**nueva**, I), sólo publicada |
| `pending_changes` | «Cambios pendientes» Sí/No (**nueva**, H) y, si está publicada, en «Explicación» |

### 2.2 Tendencias (`trends.csv` → «Tendencias», «Por campaña», «Detalle», «Campañas»)

| Columna del CSV | En el Excel |
|---|---|
| `disclosure`, `policy`, `approved` | Como en 2.1 |
| `threshold` | Portada, «Umbral de privacidad» (**nuevo**) |
| `projection_type` | Portada, «Dato», y nombre del archivo |
| `notice` | Portada, «Aviso del servidor» |
| Bloque de campañas: `campaign_ref`, `campaign`, `campaign_status`, `start_date`, `seal_ref`, `seal_version`, `sealed_at`, `linked_members`, `members_with_contribution`, `suppressed_cells` | Hoja **nueva** «Campañas»: Campaña, Estado, Inicio (día de calendario), Versión sellada, Sellada el, Agricultores vinculados, Con cifras publicadas, Filas sin cifra (Sí/No), Referencia de la campaña, Referencia de la versión sellada. La portada sigue resumiéndolas en texto |
| Series: `product_ref` | «Detalle», «Referencia del producto» (**nueva**, J) |
| `product_name`, `presentation_unit` | «Detalle» A y D; «Por campaña» A y B |
| `campaign_ref` | «Detalle», «Referencia de la campaña» (**nueva**, K) |
| `campaign` | «Detalle» B; columnas de «Por campaña» |
| `seal_ref` | «Detalle», «Referencia de la versión sellada» (**nueva**, L) |
| `status` | «Detalle» E y F (explicación) |
| `total_base`, `base_unit` | Ver reglas comunes |
| `total_presentation` | «Detalle» C y celdas de «Por campaña» |
| `contributors`, `data_as_of` | «Detalle» G y H, sólo publicada |
| `pending_changes` | «Detalle», «Cambios pendientes» (**nueva**, I) |

### 2.3 Estimación del consumo (`estimation-csv.ts` → «Estimación», «Resultados», «Serie observada»)

| Columna del CSV | En el Excel |
|---|---|
| `target_campaign_ref` | Portada, «Referencia de la campaña objetivo» (**nuevo**) |
| `target_name` | Portada, «Campaña objetivo» |
| `season_key` | Portada, «Temporada» |
| `evaluated_at` | Portada, «Vigencia evaluada el» |
| `product_ref` | «Resultados», «Referencia del producto» (**nueva**, O) |
| `product_name` | «Producto» (A) |
| `base_unit`, `estimate_base`, `naive_base` | «Estimación» (B) y «Línea base» (C) en L/KG exactos; ver reglas comunes |
| `presentation_unit` | «Unidad» (D) |
| `status` | «Estado» (E) |
| `reason_code` | «Motivo» (F), en texto |
| `method` | «Método» (**nueva**, M) |
| `run_ref` | «Ejecución (referencia)» (L) |
| `generated_at` | «Ejecución del» (K) |
| `span_length` | «Campañas observadas» (J): ahora sale del resultado, como el CSV (antes, sólo del detalle de la ejecución) |
| `coverage_status` | «Cobertura del tramo» (**nueva**, N) |
| `validity`, `validity_reason` | «Vigencia» (G) y «Motivo de la vigencia» (H) |

### 2.4 Borrador de propuesta (`proposals/:id/csv` → «Borrador», «Necesidades», «Consumo estimado», «Historial de la referencia»)

| Columna del CSV | En el Excel |
|---|---|
| `proposal_ref` | Portada, «Referencia del borrador» |
| `status`, `basis` | Portada, «Estado del borrador» y «Base» |
| `campaign_ref` | Portada, «Referencia de la campaña» (**nuevo**) |
| `campaign` | Portada, «Campaña» |
| `generated_at`, `generated_by` | Portada, «Generado el» y «Generado por» |
| `inputs_fingerprint` | Portada, «Huella de las entradas» |
| `disclosure`, `policy`, `approved` | Como en 2.1 |
| `linked_members`, `members_with_contribution`, `coverage_basis` | Portada, «Cobertura» (texto) |
| `seal_ref` | Portada, «Referencia de la versión sellada» (**nuevo**) |
| `seal_version`, `sealed_at` | Portada, «Versión sellada» y «Sellada el» |
| `notice` | Portada, «Aviso del servidor» |
| Líneas: `position` | «Necesidades», «N.º de línea» (**nueva**, J) |
| `product_ref` | «Necesidades», «Referencia del producto» (**nueva**, K) |
| `product_name`, `presentation_unit`, `quantity_presentation` | A, C y B |
| `base_unit`, `quantity_base` | Ver reglas comunes |
| `status` | D y E (explicación) |
| `contributors`, `data_as_of` | F y G, sólo publicada |
| `released_at` | «Publicado el» (**nueva**, I), sólo publicada |
| `pending_changes` | «Cambios pendientes» (**nueva**, H) |
| `estimation_reference`, `estimation_availability`, `estimation_evaluated_at`, `estimation_season`, `estimation_notice` | **No se conservan tal cual:** eran la estimación **vigente al exportar** (F12-EST-08). El Excel lleva la **referencia fijada** (E3): estado, versión, fecha, temporada, vigencia evaluada y aviso de la referencia (§3) |
| `estimation_absence`, `estimation_status`, `estimation_reason_code`, `estimation_estimate_base`, `estimation_validity`, `estimation_validity_reason`, `estimation_method`, `estimation_run_ref`, `estimation_run_generated_at` | Hoja «Consumo estimado» por línea (estado, explicación, cifra, vigencia y motivo) y portada (método, ejecución y su fecha), de la referencia **fijada** |
| `estimation_run_relation` | Sin equivalente: la vista E3 no lo da. La portada muestra la fecha de la ejecución fijada y la del borrador |

## 3. Excel del borrador de propuesta (sustituye N8)

**Datos.** Al pulsar «Descargar Excel», `downloadProposalExcel` pide con la sesión del usuario `GET /collective/proposals/{id}` y `GET /collective/proposals/{id}/estimation-link`; nada sale de lo que la pantalla tenga en memoria. Un 401, 403 o 404 en cualquiera de las dos rechaza la exportación (no se descarga nada y el botón dice por qué); otro fallo de la referencia deja el libro sin estimación y la portada lo dice («No se usa ninguna otra estimación en su lugar»). Ya no se consulta `estimation-reference` (F12-EST-08).

| Hoja | Contenido | Origen |
|---|---|---|
| «Borrador» (portada) | Campaña y su referencia, estado de la campaña y del borrador, referencia del borrador, base, generado el/por, versión sellada (y su fecha y referencia), cobertura, aviso, huella, exportado el. Referencia fijada: resumen según el estado (`NONE`, `CALCULATING`, `LINKED`, `UNAVAILABLE`, `RESTRICTED`), estado, «Versión de la referencia» (N.º `link.sequence`, modo, acción, quién), «Referencia fijada el» (`link.created_at`), «Ejecución fijada del» (`run.generated_at`), método y versión, temporada, `run_ref`, actualización disponible (que el libro no aplica), vigencia evaluada y aviso | `GET …/proposals/{id}` y `GET …/estimation-link` (`state`, `link`, `run`, `update`, `prepare_blocker`, `evaluated_at`, `notice`) |
| «Necesidades» | Producto, Cantidad, Unidad, Estado, Explicación, Aportantes, Datos hasta, Cambios pendientes, Publicado el, N.º de línea, Referencia del producto | `GET …/proposals/{id}` (`lines`) |
| «Consumo estimado» (sólo con un vínculo vigente) | Producto, Consumo estimado, Unidad, Estado (de la línea), Explicación, Vigencia, Motivo de la vigencia, Alcance de la estimación, Campañas del tramo, Aportantes por cifra (mín.) y (máx.), Aportantes de la necesidad, Comparable, Motivo de no comparar, Diferencia (del servidor), Diferencia porcentual (del servidor), Nota, Referencia del producto | `estimation-link` `lines[]` (`estimation`, `scope`, `comparison`), emparejadas por posición, producto y unidad como en la pantalla |
| «Historial de la referencia» (ídem) | N.º, Acción, Detalle, Fecha, Por, Ejecución, Trabajo, Vigente | `estimation-link` `history[]` |

**Reglas.**
- La cifra es `estimate_base` de la referencia fijada, sólo en `AVAILABLE` y `OUTDATED`. `OUTDATED` se escribe rotulada «Desactualizada» y sin diferencia, como en la pantalla (contrato E3 §4: «Sí, rotulada»). `RESTRICTED` (fuente retirada o política) y la referencia entera `RESTRICTED` no escriben cifra, alcance ni diferencia aunque llegaran por error.
- Sin referencia fijada (`NONE`) no hay hoja de estimación y la portada lo dice; no se sustituye por la más reciente.
- Diferencia y porcentaje sólo se **copian** del servidor si `comparison.comparable` es verdadero (hoy nunca: `POPULATION_NOT_VERIFIED`); el libro no calcula ninguno. Si no es comparable, «Motivo de no comparar» lleva el mensaje del servidor.
- El alcance (`scope`) va en columnas propias: rango de aportantes y campañas del tramo sólo con cifra exportada; aportantes de la necesidad sólo si la línea está divulgada.

**Lo que la API no da.** El borrador no tiene número de versión propio (es inmutable: lo identifican `proposal_ref` y la huella); la «versión» que se exporta es la de la referencia (`link.sequence`). La vista E3 no da `run_relation` (anterior o posterior al borrador).

## 4. Qué se retiró y qué se conservó

| Retirado | Motivo |
|---|---|
| Botones «Exportar CSV» (borrador, tendencias) y «Exportar CSV de la consulta» (estimación); props `onCsv`/`csvLabel` de `ExportButtons` | Excel único |
| `collectiveService.proposalCsv`, `collectiveService.trendsCsv` y sus stubs en `dev/prototypes/resumen/stubs.ts` | Sólo servían al CSV; las rutas se retiran en el servidor |
| `lib/estimation-csv.ts` (`resultsCsv`, `resultsRows`, `parseCsv`, `RESULTS_CSV_COLUMNS`) | Sólo lo usaba la exportación y su prueba |
| `saveBlob` de `lib/exports.ts` | Sólo lo usaban los CSV (el Excel usa `saveXlsx`) |

| Conservado | Motivo |
|---|---|
| `estimation-copy*` y «Descargar copia para consultar sin conexión» | No es una exportación (copia local de la sesión, RF-40) |
| `collectiveService.proposalEstimationReference` y su tipo | Contrato F12-EST-08 vigente en el servidor; lo usan los datos de prueba y el arnés `break-ui`. Ninguna vista ni exportación lo usa |
| Reportes CSV/PDF de Mobile | Fuera del alcance (sólo Web) |

## 5. Pruebas

Cada prueba que comprobaba un CSV comprueba ahora el Excel: `estimation-lib.test.ts` (cada columna del antiguo CSV de la consulta en el libro, con autofiltro), `collective-xlsx.test.ts` (columnas nuevas del resumen y de tendencias, hoja «Campañas»), `joint-purchase-xlsx.test.ts` y `joint-purchase-excel-export.test.ts` (referencia fijada distinta de la vigente → el libro lleva la fijada y no consulta la vigente; restringida o retirada → ausente; no comparable → sin diferencia ni porcentaje; comparable → se copia la del servidor; `NONE`, `CALCULATING`, sin respuesta y de otro borrador; 401/403/404 → nada se descarga; dos exportaciones → dos consultas), y las pruebas de página (`joint-proposal.page.test.tsx`, `estimation.page.test.tsx`, `history.page.test.tsx`).

## 7. Cifras desactualizadas y revisión abierta en Excel (decisión del autor del 2026-11-12, P-A §7)

- Las cifras `OUTDATED` de la referencia **fijada** se conservan en la hoja «Consumo estimado», rotuladas «Desactualizada», con su motivo («Vigencia», «Motivo de la vigencia» y la explicación) y nunca con diferencia ni porcentaje, **aunque el servidor declare comparables** las cifras: incluir la referencia no habilita la comparación (Web `3fab972`). La portada identifica el borrador (referencia), la versión de la referencia (N.º `link.sequence`), su fecha y su estado, y cuenta las líneas desactualizadas («Cifras desactualizadas»). No se sustituyen por una estimación nueva al exportar. Las retiradas o restringidas siguen sin exportarse.
- **Revisión abierta en Microsoft Excel** (2026-11-12, `docs/evidence/e2_pa_2026-11-12/excel_abierto/`): portada, «Necesidades», «Consumo estimado» e «Historial de la referencia» de un borrador real del entorno aislado con 7 líneas desactualizadas (tras una corrección real de la clasificación de una campaña sintética). Encontró dos defectos de presentación, corregidos en `d5dc9cc`: el aviso largo de la portada (estilo de atención centrado sin ajuste) cortaba el principio del texto, y la columna de etiquetas (34) cortaba las que llevan la zona horaria. Nuevo estilo `warnText` (atención, a la izquierda, con ajuste) y columna de etiquetas de 40. Filtros e inmovilizado en las hojas de datos; fechas como fechas; cifras exactas con sus decimales.
- Mobile, en la misma revisión: los reportes Excel (inventario, resumen de campaña, estado de cuenta) se abren con filtro e inmovilizado, fechas y decimales correctos. Defecto corregido en Mobile `2cc7e39`: el nombre del archivo del estado de cuenta perdía las tildes (las cambiaba por guiones) y, con un nombre largo, la fecha. Quedan anotados (no corregidos): nombres largos de producto y etiquetas del resumen cortados por el ancho fijo de columna.

## 8. Política aplicada en lugar del umbral (E4, 2026-11-13)

Implementado en la Web en `c9dba19` (rama `feat/acceso-rol-sin-k-b`, E4 §5.1 y §3.4):

- **Resumen:** la fila «Umbral de privacidad» de la portada se sustituye por «Política aplicada» (o «Política aplicada al sellar» en una campaña sellada), con el texto `F07-POL-01 (mínimo de 3 aportantes por cifra)` o `F07-POL-02 (totales sin nombres, sin mínimo de aportantes)`. Con `F07-POL-02` se añade «Totales con pocas personas» con el aviso de que, con pocas personas, un total sin nombres podría dejar deducir un aporte. El subtítulo nombra la política de la respuesta.
- **Tendencias:** la portada describe cada campaña sellada con su política y dice la configurada; la hoja «Campañas» tiene la columna nueva «Política al sellar» detrás de «Sellada el».
- **Borrador:** fila «Política aplicada» con la política con que se generó.
- **Estado:** `SUPPRESSED_UNDER_THRESHOLD` se escribe «Sin cifra (F07-POL-01)» con el motivo «Sin cifra según la política F07-POL-01 (mínimo de N aportantes)»; ya no «Oculto por privacidad». El aviso de cifra anterior dice «Hay cambios recibidos que todavía no se publican: se muestra la cifra anterior.»
- Sin cambios en lo demás: celda vacía y explicación para lo no publicado, cero frente a sin datos, unidades separadas y sin exportación de convocatorias.
