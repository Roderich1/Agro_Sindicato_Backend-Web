# Rediseño de la Web institucional: primera entrega (2026-11-10, noche)

Sesión coordinadora. Todo es local: sin push, PR, despliegues, fusiones a `main`, cierres de issues ni cambios al documento de grado. Las sesiones A, B y C corrieron en paralelo como agentes (modelo Opus 5.5) sobre worktrees propios; la coordinación (Fable 5.1) revisó cada rama antes de integrarla.

## 1. Estado local identificado

Ver `00_ESTADO_LOCAL_2026-11-10.md`. Base de todo: `8568fd1` (`feat/web-defensa-panel`), no `main`. El trabajo local posterior a `main` se conservó; lo que no entra en la base queda documentado (endpoint `7fd3365` de sincronización por agricultor, sólo Back y sin integrar).

## 2. Matriz de datos y restricciones

`02_MATRIZ_DATOS_WEB.md`: 78 filas; 50 DISPONIBLE, 11 PARCIAL, 17 NO DISPONIBLE (6 prohibidas por diseño, 1 concepto inexistente). Sección E: faltantes con la regla que los condiciona. Nada de lo NO DISPONIBLE se simuló en la interfaz.

## 3. Distribución de archivos y responsabilidades

`01_CONTRATO_COMPARTIDO.md` §6 (más `Web/src/pages/campaign-dates.ts`, de B, añadido a petición suya). Rutas y redirecciones de `App.tsx`: coordinadora.

## 4. Ramas, commits y validación

| Rama | Worktree | Commits sobre la base | Validación real (`Web/`) |
|---|---|---|---|
| `feat/web-rediseno-a-sistema-navegacion` | `_wt/WEBR-A` | `fd6e290` … `dba2fa7` (11) | lint 0 errores (2 avisos preexistentes), `tsc` OK, vitest 38 archivos / 312 |
| `feat/web-rediseno-b-resumen-campanas` | `_wt/WEBR-B` | `68fc2e6` … `ecdddc8` (12, incluye fusión de A) | lint 0, `tsc` OK, vitest 42 / 342 |
| `feat/web-rediseno-c-necesidades-catalogo` | `_wt/WEBR-C` | `c86db5e` … `8606d01` (12, incluye fusión de A) | lint 0, `tsc` OK, vitest 39 / 312 |
| `feat/web-rediseno-integracion` | `_wt/WEBR-INT` | docs `a5a2b33`, `c9a6c11`, `1d82981`; fusiones `304a61a` (A), `de0efca` (C), `8413b6a` (B); rutas `70545e5` | lint 0 errores (2 avisos preexistentes), `tsc` OK, **vitest 47 archivos / 390 pruebas, 390 pasan**, `npm run build` OK (168 módulos). Base de partida: 225 pruebas. |

Todos los commits son de la identidad git configurada (Roderich1), sin `Co-Authored-By` ni «Generated with» (comprobado en cada rama con `git log --format=%B`). Las fusiones fueron `--no-ff` y sin conflictos.

Incidencia de herramientas: `vitest` 5 exige el caché de dependencias `Web/node_modules/.vite`; sin él, toda la suite falla con «Cannot read properties of undefined (reading 'config')». El `node_modules` de `WEBR-INT` se copió incompleto (la copia coincidió con una ejecución de pruebas en `WEB-PANEL`); se reemplazó por el de `WEBR-B` y se restauró el caché. No afecta al código.

## 5. Qué contiene la composición integrada

- **Sistema visual (A):** tokens de un solo acento (verde institucional) sobre fondos claros y superficies sólidas; movimiento reducido a ≤ 200 ms con `ease-out` y `prefers-reduced-motion`; base táctil (`mobile-native`); `components/ui` (PageHeader, CampaignSelector, DataState con los ocho estados, StatusChip, KpiTile, Section, DataTable, SegmentedControl, Collapsible, Button, Notice) con 63 pruebas; `fmtPercent` que devuelve `null` con denominador 0.
- **Navegación por tareas (A):** Resumen · Campañas · Necesidades y propuestas · Histórico y estimaciones · Catálogo y equivalencias · Administración (Bitácora; Usuarios sólo Administrador). Barra lateral clara, menú del teléfono como diálogo accesible, barra inferior de cuatro ítems con zonas seguras. Permisos sin cambios: `menuPathsFor` sigue siendo la fuente, las guardas por ruta se conservan y la Cobertura sale del menú pero mantiene su ruta y sus enlaces.
- **Rutas (coordinadora):** `/colectivo/historico?vista=tendencias|estimacion`, `/colectivo/catalogo?vista=productos|equivalencias`, `/campaigns/:id`. Las rutas antiguas (`/colectivo/tendencias`, `/colectivo/estimacion`, `/colectivo/productos`, `/colectivo/reconciliacion`) redirigen con `RedirectWithQuery` conservando la cadena de consulta.
- **Resumen (B):** campaña y estado, «Cifra más reciente: datos hasta …» (máximo de `data_as_of` de las cifras publicadas; no aparece si no hay ninguna), indicadores sin duplicar, «Necesidades declaradas por producto» con L y KG en escalas separadas y orden por nombre, acciones pendientes sólo cuando el dato existe, cobertura compacta con enlace. Una sola llamada a `summary` por visita (antes StrictMode la duplicaba en desarrollo, y esa lectura ejecuta la decisión de divulgación en el servidor).
- **Campañas (B):** búsqueda, filtros, crear, editar, abrir, cerrar y permisos conservados; «Fin estimado» y «Cierre registrado» en columnas separadas; «Fin estimado vencido · sin cierre registrado» sólo en campañas ABIERTA con fecha pasada; varias ABIERTA listadas, «Activa» sólo con `isActive`; sin reapertura ni cancelación. Detalle compuesto (fila de la lista + resumen + sellado + borradores) porque no existe `GET /campaigns/:id`.
- **Cobertura (B):** definición y denominador del contrato, sin porcentaje con M = 0, sin umbrales de color, «aportes aceptados» distinguidos de «registros locales» (no disponibles, dicho en texto), hueco de sincronización conservado sin datos.
- **Necesidades y propuestas (C):** rótulo del contrato F12 «Estimación del consumo (referencia)»; diferencia necesidad/estimación sólo cuando producto, unidad y campaña coinciden, la referencia es ESTIMATED y CURRENT y mayor que cero, calculada sobre strings con BigInt y nunca en porcentaje; sin edición de cantidades, sin módulo de compra, sin estado de aprobación (no existe).
- **Histórico y estimaciones (C):** vistas extraídas (`CollectiveTrendsView`, `EstimationView`); vigencia con `evaluated_at`; `run_ref` y método en «Ver detalle»; huecos rotulados; sin estimaciones ni descargas al abrir; «Datos insuficientes» nunca como cero.
- **Catálogo y equivalencias (C):** búsqueda sin tildes (nombre, comercial, ingrediente), agrupación por categoría/unidad, «Sin coincidencias» con «Quitar filtros», confirmación humana e historial conservados; «Efecto antes/después» mostrado como «No disponible».
- **Estados:** cargando, sin registros, sin coincidencias, error con «Reintentar», sin permiso, restringido, datos insuficientes, desactualizado, en todas las vistas de esta etapa; ninguno como «0».
- **break-ui:** informes `docs/evidence/web_rediseno/b_BREAK_UI_*.md` y `c_BREAK_UI_*.md` con capturas del peor caso a 320, 390 y 1366 px y zoom 200 % (emulación de escritorio con fixtures); defectos claros corregidos (`bb34ba7`, `5c7a0a5`); decisiones abiertas listadas en su Parte 2.

## 6. Dos variantes del Resumen (pendientes de elección del autor)

`docs/evidence/web_rediseno/a_VARIANTES_RESUMEN_2026-11-10.md` y `a_capturas/`. Ruta DEV `/prototipos/resumen` (sin sesión ni API; fixtures sintéticos; selector de `PICKER.md`; `?datos=worst|empty|one`).

| # | Variante | Eje | Cuándo es la elección correcta | Coste |
|---|---|---|---|---|
| 1 | Operativa compacta | Densidad y acción | Uso diario para decidir: indicadores pequeños, tabla con cifra exacta, aportantes y fecha, columna «Pendiente». Cabe en 1366×768 sin desplazarse. | Comparar cuesta más (sin barras); a 390 px la tabla se desplaza dentro de su contenedor. |
| 2 | Analítica comparativa | Jerarquía y comparación | Presentación (proyector, reunión): barras por producto dentro de su unidad, cifras grandes, cobertura y sello como tarjetas. | Más alto (1229 px a 1366×768); lo pendiente queda como lista secundaria al final. |

Las dos usan el mismo fixture y las mismas reglas; difieren en distribución y jerarquía, no en color. Al elegir, A promueve la variante al Resumen real (B la aplica) y se borran los prototipos.

## 7. Faltantes que requieren trabajo funcional posterior (no se simularon)

| Dato | Qué haría falta | Matriz |
|---|---|---|
| Agricultores vinculados y último envío aceptado | Integrar `7fd3365` (Back) + servicio Web | V7, V10 |
| Detalle de campaña del servidor | `GET /campaigns/:id` (hoy compuesto en la Web) | C2 |
| Quién cerró la campaña | Servir `closedById` o enlazar la bitácora | C5 |
| Sello en el listado de campañas | `seal` en `GET /campaigns` | C11 |
| Temporadas y clasificaciones en la Web | Servicios `GET /estimation/seasons`, `/campaign-classifications` (existen en Back) | C12, H10, H12 |
| Marca global de actualización del resumen | Campo en `CollectiveSummary` | R11 |
| Fuentes completas de una serie | Exponer `ConsumptionSeries.sources` | H8 |
| Historial del catálogo y reactivar producto | AuditLog en el caso de uso; ruta de reactivación | K6, K5 |
| Impacto antes/después de una equivalencia | Vista previa que no divulgue nada nuevo (F07-POL-01 §9) | K12 |
| Estado de decisión de una propuesta | No definido por ningún contrato | P6 |

Discrepancia de contrato corregida en la Web: F12:665 fija el rótulo «Estimación del consumo (referencia)»; la prueba `joint-proposal.reference.test.tsx` se ajustó por ese motivo.

## 8. Peticiones entre sesiones resueltas o pendientes

- B y C → A: la píldora de campaña activa de la cabecera desborda a 1366 px con zoom 200 % y nombre largo (`min-w-0` + `truncate` + `title`); `fmtDate` muestra el día anterior para fechas a medianoche UTC (B lo resolvió localmente con `campaign-dates.ts`; falta decidir si `format.ts` incorpora `fmtCalendarDate`); separador de miles en `CoverageBanner` (`collective-ui.tsx`); enlaces internos de C a `COLLECTIVE_PATHS.estimation`/`.reconciliation` (funcionan por redirección; cambiar a las claves nuevas). **Pendientes para la etapa siguiente.**
- Decisiones abiertas para el autor (Parte 2 de los break-ui): columna mínima para «0 L» en el gráfico; tablas secundarias con desplazamiento interno; corte a barras horizontales en `sm` o `md`; «Abrir» en una ABIERTA no activa y «Editar» deshabilitado en cerradas (se conserva lo que había); nombre repetido en el detalle.

## 9. Limitaciones

- Todo lo visual se observó en emulación de escritorio (Edge sin interfaz, jsdom) con fixtures sintéticos; **nada probado en teléfono ni con datos del servidor** en esta etapa (Docker y las API estaban apagados cuando las sesiones capturaron; la copia «rica» volvió a estar disponible al final).
- Fundidos de 120 ms en avisos y el selector de prototipos (cromo DEV) son el único movimiento restante en los archivos de A; las páginas legacy del agricultor conservan el suyo (fuera de alcance).
- Las variantes y los prototipos son código DEV y no entran en la compilación de producción (comprobado por A en el paquete).
