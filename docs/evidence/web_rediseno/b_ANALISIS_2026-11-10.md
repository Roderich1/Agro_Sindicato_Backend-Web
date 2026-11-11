# Sesión B — Análisis de Resumen, Campañas y Cobertura (2026-11-10)

Rama `feat/web-rediseno-b-resumen-campanas`, base `8568fd1`. Lectura del código de la base y de `docs/web-rediseno/01_CONTRATO_COMPARTIDO.md` y `02_MATRIZ_DATOS_WEB.md` (filas R*, C*, V*). Sin código en este paso. Referencia de validación en la base: `npx vitest run` → 23 archivos, 225 pruebas, 225 pasan (ejecutado en este worktree el 2026-11-10).

## 1. Qué muestra hoy cada vista

| Vista | Hoy (`8568fd1`) | Problemas frente al contrato |
|---|---|---|
| Resumen (`collective-summary.page.tsx`) | Barra `CollectiveToolbar` (selector, estado, «Activa»/«distinta de la activa»), «Actualizar», «Descargar Excel», «Revisar borrador». Aviso de política, `SealBanner`, `CoverageBanner` con «Ver cobertura», «Necesidad declarada» (barras por unidad, `countsNote`), «Consumo publicado» (tabla), `SealPanel` si no está sellada. | Sin «última actualización» ni «datos hasta» de cabecera; sin acciones pendientes; error sin «Reintentar»; «Cargando…» suelto; sin estado «Sin campaña activa»; rótulo «Necesidad declarada» en lugar de «Necesidades declaradas por producto»; «aportantes» sin plural («1 aportantes»). |
| Campañas (`campaigns.page.tsx`) | Tarjeta de campaña activa, búsqueda y filtro de estado (en el servidor), tabla Nombre/Estado/Inicio/**Cierre**/Acciones, crear, editar, abrir, cerrar con confirmación, `MANAGER_ROLES`. | Columna «Cierre» mezcla `closedAt ?? estimatedEndDate` (matriz C4); «Sin campañas» igual con y sin filtros; error sin «Reintentar»; trato de «tú» («Puedes consultar…»); sin enlace al detalle; sin indicador de fin estimado vencido. |
| Detalle de campaña | No existe (matriz C2: no hay `GET /campaigns/:id`). | — |
| Cobertura (`coverage.page.tsx`) | `StatTile` «N de M» y «Vinculados al sindicato», hueco «Seguimiento de sincronización» (`data-testid="sync-tracking"`). | Sin cargando ni reintento; no distingue «aportes aceptados» de «registros locales»; la cifra M se repite en dos tarjetas. |

## 2. Qué pide el brief y qué dato lo respalda

| Indicador o bloque | Dato | Fila de la matriz | Disponibilidad |
|---|---|---|---|
| Campaña seleccionada y estado | `GET /campaigns` + `summary.campaign` | R1 | Disponible |
| «Sin campaña activa» | `GET /campaigns/active` → `null` | R2 | Disponible |
| Varias `ABIERTA` a la vez | `GET /campaigns`; la regla «una activa» la aplica la API, no la base | R3, C3 | Disponible; la Web no supone una sola |
| Última actualización global | — | **R11** | **No disponible.** Sustituto declarado (regla de presentación): «Cifra más reciente: datos hasta <máximo de `data_as_of` entre las cifras publicadas>», sólo si hay cifras `DISCLOSED`; si está sellada, «datos aceptados hasta» del sello (R12) |
| «Datos hasta» por cifra | `cells[].data_as_of` | R9 | Disponible |
| Productos con cifra publicada / ocultos por privacidad / sin cifra | conteo de `cells[].status` (no de cantidades) | R8 | Disponible (conteo de filas, no suma de cifras) |
| Cobertura «N de M» | `summary.coverage` | V1, V2, V3 | Disponible; `null` bajo `POLICY_PENDING` |
| Versión sellada o «sin sellar» | `summary.seal` | R12 | Disponible |
| Necesidades declaradas por producto y unidad | `cells[DECLARED_NEED]` | R5, R7 | Disponible (sólo modo sintético) |
| Consumo publicado (aparte) | `cells[CONSUMPTION_TOTAL]` | R6 | Disponible |
| «Hay cambios recibidos sin publicar» | `cells[].pending_changes` | R10 | Disponible |
| «Campaña cerrada sin sellar» | `Campaign.status === 'CERRADA'` y `summary.seal === null` | C3, R12, R13 | Disponible |
| Cierre registrado / fin estimado | `closedAt`, `estimatedEndDate` | **C4** | Parcial: ambos campos existen; «Fin estimado vencido · sin cierre registrado» es **regla de presentación** de la Web (`ABIERTA` y fecha estimada anterior a hoy), no un dato del servidor |
| Detalle de campaña | fila de `GET /campaigns` + `summary(id)` + `sealState(id)` (si no está sellada) + `proposals(id)` | **C2** | Se compone; no hay `GET /campaigns/:id` |
| Propuestas vinculadas | `GET …/proposals` (`ProposalSummary[]`) | Tabla C | Disponible, sólo lectura |
| Quién cerró la campaña | `closedById` no se sirve | **C5** | No disponible (sólo bitácora) |
| Reabrir o cancelar | — | **C10** | No disponible: no se ofrece |
| Sellado en el listado de campañas | — | **C11** | Parcial: no se muestra en el listado; sí en el detalle (`summary.seal`) |
| Aportes aceptados frente a registros locales | — | **V9** | No disponible: se dice en texto |
| Último envío por agricultor | `7fd3365` no integrado | **V7**, V10 | No disponible: se conserva el hueco honesto |
| Totales del sindicato, sumas entre productos o unidades | — | R14 | Prohibido |

## 3. Riesgo que condiciona el diseño

`GET /collective/campaigns/:id/summary` sobre una campaña **sin sellar** ejecuta la decisión de divulgación en el servidor y puede crear o retirar divulgaciones internas (tabla C de la matriz; F07 sellado:104,367-369). `GET …/seal` sellable hace lo mismo. Por eso: una sola llamada a `summary` por visita y por campaña (sin sondeo ni recarga automática); «Actualizar» queda como acción explícita; el detalle llama a `sealState` sólo si la campaña no está sellada, igual que `SealPanel`.

## 4. Faltantes concretos (sin inventar)

R11 (marca global), C2 (detalle por id), C4 (vencimiento: sólo regla de presentación), C5 (actor del cierre), C10 (reabrir/cancelar), C11 (sello en el listado), V7/V10 (sincronización por agricultor), V9 (registros locales). Ninguno se sustituye con un cálculo propio salvo las dos reglas de presentación declaradas en §2.

## 5. Observación para la sesión A

`fmtDate` (`Web/src/lib/format.ts:28-35`) formatea en la zona local un valor guardado como medianoche UTC (`new Date('2026-10-15')` en el servidor, `campaign-management.use-case.ts:79-80`). En Bolivia (UTC−4) muestra el día anterior. La regla «fin estimado vencido» de B compara la parte de fecha UTC del dato, que es la fecha que introdujo la persona.
