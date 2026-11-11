# Sesión C: análisis de Necesidades y propuestas, Histórico y estimaciones, Catálogo y equivalencias (2026-11-10)

Lectura de código sobre `8568fd1` (rama `feat/web-rediseno-c-necesidades-catalogo`), contra el contrato compartido (`docs/web-rediseno/01_CONTRATO_COMPARTIDO.md`) y la matriz de datos (`02_MATRIZ_DATOS_WEB.md`, filas P, H, K). Sin código en este paso; no se consultó ningún servidor. Los números de línea son los de `8568fd1`.

## 1. Necesidades y propuestas (`/colectivo/propuestas`, `joint-proposal.page.tsx`)

| Qué muestra hoy | Qué pide el rediseño | Dato que lo respalda (matriz) | Observación |
|---|---|---|---|
| Barra con campaña y «Generar borrador» (:177-181); al entrar abre el último borrador por consulta, nunca `POST` (:121-147) | Campaña primero; acciones existentes visibles | P2, P3; regla F.17 | Se conserva tal cual. |
| Detalle del borrador: autor y fecha, cobertura al generar, tabla de líneas con necesidad, aportantes y «datos hasta» (:203-266) | Aportes aceptados (cifras publicadas) y sus «datos hasta» | P1, P5, P8 | Ya existe; «aportantes» y «datos hasta» por línea. |
| Columna «Referencia de consumo (estimación del servidor)» (:229) con cifra, vigencia, fecha de ejecución y relación con el borrador (:275-316) | Rótulo **«Estimación del consumo (referencia)»** (F12:665) | P9 | Discrepancia de contrato: gana F12:665. La API envía `label: 'Estimación del consumo'` (types/estimation.ts:238). |
| Nota de la referencia con `evaluated_at` y temporada (:318-343) | Vigencia evaluada y acceso a «Ver detalle» | P9, H5 | El enlace lleva a `/colectivo/estimacion`; tras el contenedor nuevo, a `/colectivo/historico?vista=estimacion`. |
| Exportar CSV (servidor) y Descargar Excel (`ExportButtons`, :211) | Conservar | P10 | Sin cambio. |
| Historial plegado con huella, autor, fecha, n.º de líneas (:346-399) | Conservar historial y huella | P2, P4 | «1 líneas» no tiene plural (:379). |
| — | Diferencia necesidad/estimación sólo si es comparable | P9 (misma línea, producto, unidad y campaña objetivo ya alineados por el servidor) | No existe hoy. Sólo con `ESTIMATED`, `CURRENT`, cifra > 0 y necesidad `DISCLOSED`; aritmética decimal sobre strings; sin porcentaje. |
| — | Estado de la propuesta (aprobada, rechazada) | **P6: sólo `DRAFT`** | Faltante: no se añade. |
| — | Versiones selladas de propuestas | **P7: no existe** | Faltante. |
| — | Necesidad neta | **P11: no disponible** (`declared_stock` DENY) | Faltante; la nota ya dice «no es una necesidad neta». |

## 2. Histórico y estimaciones (contenedor nuevo `/colectivo/historico`)

| Qué muestra hoy | Qué pide el rediseño | Dato | Observación |
|---|---|---|---|
| `collective-trends.page.tsx`: selector Consumo/Necesidad, producto, gráfico de columnas por campaña sellada, tablas por serie y campañas en «Ver campañas y cobertura» | Vista «Histórico sellado» del contenedor; gráfico sin animación, huecos sin cero, una escala por unidad, etiquetas en dos líneas, tabla equivalente | H1, H2; F07 sellado §8 | Ya cumple casi todo: una serie por gráfico (una unidad), huecos rotulados «sin cifra» (:328-330). El contrato F07 §8 pide que cada hueco se rotule **con su estado**: hoy dice siempre «sin cifra». A 320 px el SVG mide hasta 1000 px y depende de desplazamiento horizontal. |
| `estimation.page.tsx`: resultados por producto (SES, naive, vigencia, «De una ejecución anterior», «Ver detalle» con serie, α, cobertura, ejecución), historial de ejecuciones, detalle de ejecución, trabajo y copia sin conexión | Vista «Estimación del consumo»; mostrar `evaluated_at` junto a la vigencia | H4–H9, H11, H13 | **`evaluated_at` llega y no se muestra (H5).** «Ver detalle» no muestra `run_ref` (H6) ni la temporada del resultado. `HIDDEN` y `SOURCES_WITHDRAWN` ya sin número (estimation-figure.tsx:36-39). |
| Elegibilidad: sólo anticipa `PLANIFICADA`/`ABIERTA` (:55,116); «sin clasificar» se descubre con el 422 | Mismo manejo con texto claro | **H12: no hay servicio Web para `/estimation/campaign-classifications`** | Faltante; se pide a la coordinadora. |
| Temporadas y clasificaciones | — | **C12/H10: sin servicio Web** | Faltante. |
| Fuentes de la serie | — | **H8 parcial**: puntos y `source_hash`, no `ConsumptionSeries.sources` | Faltante. |
| Métricas `mae`/`wape`, `validations` | — | H7: llegan, no se muestran | Se dejan fuera: son técnicas; no hay decisión que las pida. |
| Promedios o tasas entre campañas; estimación sumada | — | H3, H14: prohibidos | No se añaden. |

## 3. Catálogo y equivalencias (contenedor nuevo `/colectivo/catalogo`)

| Qué muestra hoy | Qué pide el rediseño | Dato | Observación |
|---|---|---|---|
| `products.page.tsx`: tabla de activos (nombre, nombre comercial · ingrediente, unidad, categoría, Editar/Inactivar), inactivos plegados, «Nuevo producto» en la cabecera de `AppShell` | Vista «Productos»; agrupación, búsqueda (nombre, nombre comercial, ingrediente activo) sin mayúsculas ni tildes, estados «sin coincidencias» y «sin permiso» | K1–K4 | No hay búsqueda ni agrupación. `normalizeName` (product-text.ts:19-26) ya normaliza tildes. La agrupación posible con datos existentes: por `category` (opcional) o por `unit`. |
| — | Reactivar | **K5: no existe** | Faltante; no se simula. |
| — | Historial de cambios del catálogo | **K6: no existe** (sin AuditLog) | Faltante; no se simula. |
| `product-reconciliation.page.tsx`: pendientes, vigentes con Corregir/Deshacer, historial plegado; diálogos con motivo y confirmación | Vista «Equivalencias»; búsqueda y revisión; conservar confirmación e historial | K7–K11 | «Canónico de 1 denominación(es)» sin plural real (:118). Candidatos filtrados por dimensión en el cliente (K9), sin sugerencias: se conserva. |
| — | Impacto antes/después de una equivalencia | **K12: no existe** | Se muestra «No disponible» en texto dentro del diálogo; no se calcula nada. |

## 4. Estados (§4 del contrato) por vista, hoy

- Cargando: propuestas y tendencias, texto «Cargando…»; productos, filas esqueleto; equivalencias, **nada** (la tabla aparece vacía como «Todas las denominaciones están asociadas» antes de cargar).
- Sin registros / sin coincidencias: no hay filtros hoy salvo el tipo de dato en tendencias; «sin coincidencias» no existe.
- Sin permiso (403): se muestra como error genérico de `collectiveError` o `productError`; en catálogo y equivalencias no se distingue.
- Restringido, datos insuficientes, desactualizado: cubiertos en propuestas y estimación.

## 5. Decisiones de este bloque (sin inventar datos)

1. Diferencia necesidad/estimación: sólo texto absoluto en la misma unidad («la estimación es 12 L menor que la necesidad declarada»), calculada con `BigInt` escalado a 6 decimales; nunca porcentaje.
2. Rótulo de la referencia: «Estimación del consumo (referencia)» (F12:665). Cambia el texto que fija `joint-proposal.reference.test.tsx`.
3. Los contenedores leen `?vista=` y conservan los demás parámetros; las rutas antiguas y redirecciones son de la sesión A (`App.tsx`, `navigation.ts`).
4. Los componentes `ui/` de A no están en esta rama: se maqueta con `Notice`/`EmptyState` actuales, marcados `// ui: DataState`.
