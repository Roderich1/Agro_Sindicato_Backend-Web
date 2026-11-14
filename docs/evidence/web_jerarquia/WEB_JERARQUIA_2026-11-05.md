# Web de la Directiva: jerarquía de las pantallas para la defensa (2026-11-05)

**Rama:** `feat/web-defensa-jerarquia` (worktree `_wt/WEB-JERARQUIA`).
**Punto de partida:** PR #203 (`feat/web-defensa-simplificacion`, abierto, en borrador, `mergeable`), HEAD **`1a0becb5027b8f1ebd0a99fb117c4288971027d3`** (banner «Modo provisional» ya retirado; ningún aviso sustituto).
**Commit de código verificado:** **`39601fbf605ad987233d3f8360a0ecfe095960ec`**.
**Alcance:** sólo `Web/src` (React) y sus pruebas. Sin cambios de API, Backend, migraciones, permisos ni política; sin tocar el móvil, el POCO, la DEMO oficial ni el PR #172. No se fusiona a `main`.

## 1. Archivos modificados (commit 39601fb)

| Archivo | Cambio |
|---|---|
| `Web/src/pages/collective-summary.page.tsx` | Resumen de campaña: indicadores (`StatTile`), barras por producto y unidad (`ComparisonBars`), «Revisar borrador», consumo en una línea si no hay |
| `Web/src/pages/joint-proposal.page.tsx` | Compra conjunta: último borrador abierto al entrar; cantidad declarada grande; referencia secundaria; «Historial» plegado con huella y borradores anteriores; «Descargar Excel» + «Exportar CSV» |
| `Web/src/pages/collective-trends.page.tsx` | Historial entre campañas: gráfico de columnas primero, selector de dato y de producto, sólo campañas selladas; «Ver fuentes y cobertura» con tablas |
| `Web/src/pages/estimation.page.tsx` | Estimación: producto, resultado, estimación, último consumo observado y vigencia; «Ver cálculo y fuentes» por fila (naive, α, serie, cobertura, ejecución); ejecuciones anteriores plegadas; exportaciones |
| `Web/src/pages/coverage.page.tsx` | «Agricultores y sincronización»: cobertura agregada con enlace al resumen y sección preparada para el seguimiento operativo (sesión 3), sin datos |
| `Web/src/components/collective-ui.tsx` | `StatTile`, `Collapsible`, `ComparisonBars`, `QuantityCell size="lg"` |
| `Web/src/components/export-buttons.tsx` (nuevo) | «Descargar Excel» principal y CSV secundario |
| `Web/src/lib/exports.ts` (nuevo) | Punto de enganche del módulo de Excel (sesión 2) y `saveBlob` |
| `Web/src/components/app-shell.tsx` | Menú: Resumen de campaña · Compra conjunta · Agricultores · Historial · Estimación del consumo · Reconciliación · Campañas |
| `Web/src/pages/collective-trends.page.test.tsx`, `joint-proposal.reference.test.tsx` | Pruebas adaptadas al gráfico único con selector y al borrador que se abre al entrar |

## 2. Comprobaciones (en `Web/`, commit 39601fb)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `npx vitest run` | 17 archivos, **170 pruebas, 170 pasan** | 2026-11-05 17:08:28Z |
| `npx eslint .` | 0 errores, 2 avisos preexistentes en main (`react-refresh/only-export-components` en los contextos) | 17:08:52Z |
| `npm run build` (`tsc -b && vite build`) | OK (435 ms); PWA 28 entradas (743 KiB) | 17:09:07Z |

## 3. Recorrido en Edge (sin interfaz, 1366×650, copia sintética aislada)

Entorno: copia aislada de la DEMO del PR #201 (clon del volumen `agro_demo_pgdata` → `agro_webdef_pgdata`, PostgreSQL 55510, API `Back/dist` de main en 3340, Web de esta rama en **http://127.0.0.1:5197** con `VITE_API_PROXY_TARGET=http://127.0.0.1:3340`). Las acciones que escriben (generar borrador o estimación) sólo tocan esa copia. Guion reproducible: `recorrido-defensa.mjs`; registro: `recorrido-jerarquia.log` (17:1xZ).

Orden ensayado **Resumen → Borrador → Excel → Historial → Estimación → Agricultores** (más Campañas y Reconciliación):

| Vista | Documento / ventana | Llega al final | Última acción alcanzable | Excel |
|---|---|---|---|---|
| Resumen de campaña (`1-resumen.png`) | 958 / 650 px | sí (308 px) | «Revisar borrador» (barra) y panel de sellado | — |
| Compra conjunta, abierto desde «Revisar borrador» (`2-borrador.png`, `2b-…-historial.png`) | 1073–1196 / 650 | sí | «Ver» del historial plegado | deshabilitado: «Disponible cuando se integre el módulo de exportación a Excel (sesión 2).» |
| Historial (`3-historial.png`, `3c-…-consumo.png`, `3d-…-consumo-2.png`, `3b-…-fuentes.png`) | 650–882 / 650 | sí | «Ver fuentes y cobertura» | deshabilitado (ídem) |
| Estimación (`4-estimacion.png`, `4b-…-calculo.png`) | 1103–1874 / 650 | sí (1224 px con todo desplegado) | «Descargar copia para consultar sin conexión» | deshabilitado (ídem) |
| Agricultores y sincronización (`5-agricultores.png`) | 670 / 650 | sí | «Ver el resumen de la campaña» | — |
| Campañas · Reconciliación | 865 · 978 / 650 | sí | «Editar» · «Asociar…» | — |

Cifras comprobadas contra el servidor (mismas que `demo.sh verify`): Herbicida 250 L · 5 aportantes, Fungicida 53 L · 3, Insecticida «Oculto» sin barra ni cero; cobertura 6 de 6; historial de consumo Herbicida 96 · 120 · 104 · 116 L sobre las cuatro campañas selladas (la abierta 2026 no se dibuja); estimación Herbicida 111 L con último consumo observado 116 L · Invierno 2018, Fungicida e Insecticida «Datos insuficientes» con motivo.

## 4. Conceptos que se mantienen separados

Necesidad declarada (resumen y borrador), consumo registrado (resumen e historial), propuesta de compra conjunta (borrador, nunca una compra) y estimación del consumo (referencia aparte). Ninguna ausencia o cifra oculta se muestra como cero ni se dibuja; las filas conservan su motivo («Menos de 3 agricultores aportaron…», «Datos insuficientes», «Cifra retirada», vigencia). No hay sumas entre productos, unidades ni campañas.

## 5. Instrucciones para la sesión de integración

1. **Rama de revisión:** crear `review/defensa-web` desde `feat/web-defensa-jerarquia` (`39601fb`) y traer encima los commits de las otras sesiones; no fusionar a `main`.
2. **Excel (sesión 2):** asignar `excelExport.download` en `Web/src/lib/exports.ts` (firma `(kind: 'summary' | 'proposal' | 'trends' | 'estimation', ref: string) => Promise<void>`; `ref` es el id de campaña, de borrador, el tipo de tendencia o la campaña objetivo). `ExportButtons` habilita «Descargar Excel» en cuanto `download` no es `null`; no hay que tocar las vistas. El CSV sigue saliendo del servidor.
3. **Seguimiento operativo (sesión 3):** sustituir el `EmptyState` de la sección «Seguimiento de sincronización» en `Web/src/pages/coverage.page.tsx` (`data-testid="sync-tracking"`) por la tabla que alimente la consulta nueva; la cobertura agregada queda como está. No inventar estados: cada fila debe venir del servidor.
4. **Levantar y recorrer:** `cd Web && VITE_API_PROXY_TARGET=http://127.0.0.1:<API> npx vite --port 5197 --strictPort --host 127.0.0.1` contra una copia sintética; después `node docs/evidence/web_jerarquia/recorrido-defensa.mjs 650 <carpeta>` con `WEB_URL`, `BROWSER_PATH`, `PUPPETEER_HOME`, `BE_DIR`, `DEMO_PG_ADMIN_URL` y `DEMO_API`. Navegar siempre dentro de la SPA: `/auth/refresh` admite 5 por minuto.
5. **Comprobaciones mínimas antes de integrar:** `npx vitest run`, `npx eslint .`, `npm run build` en `Web/`.
6. **Textos que las pruebas fijan:** «Generar propuesta (borrador)», «Exportar CSV», «Exportar CSV de la consulta», «Descargar copia para consultar sin conexión», «Ver», «Ver detalle», etiquetas «Campaña», «Dato», «Producto», regiones «Necesidad declarada» y «Consumo registrado», y los `data-testid` (`coverage`, `cell-*`, `line-*`, `result-*`, `trend-chart`, `trend-point`, `series-*`, `point-*`, `campaign-*`, `sources`, `sync-tracking`, `export-buttons`).

## 6. Limitaciones

- «Descargar Excel» queda deshabilitado hasta el módulo de la sesión 2; «Agricultores» no muestra seguimiento hasta la consulta de la sesión 3.
- Verificado con datos sintéticos en Edge de escritorio (1366×650 y 1366×900); no en teléfono ni en otros navegadores.
- La referencia de consumo del borrador sigue en una columna (más estrecha y en gris): se consideró moverla bajo cada fila, pero la columna mantiene visibles la fecha y la vigencia que pidió el guion.
