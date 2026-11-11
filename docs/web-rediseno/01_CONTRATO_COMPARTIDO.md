# Contrato compartido del rediseño de la Web institucional (Directiva) — 2026-11-10

Este contrato lo administra la sesión coordinadora (sesión 0). Las sesiones A, B y C lo adoptan tal cual; cualquier cambio se pide a la coordinadora con una descripción concreta (qué, por qué, qué archivos) y se aplica aquí antes de usarse. Nadie cambia un contrato unilateralmente.

Base de código: `8568fd1` (`feat/web-defensa-panel`). Alcance: sólo `Web/` (React 19 + Vite 8 + Tailwind 4 + react-router 7, pruebas con vitest + Testing Library). **Sin cambios en `Back/`, contratos de API, permisos del servidor, migraciones, la app Flutter ni su integración de voz.** Sin dependencias nuevas sin acuerdo de la coordinadora (ni biblioteca de componentes, ni de animación, ni de gráficos).

## 1. Reglas que prevalecen (resumen operativo)

1. **Datos**: la Web sólo presenta lo que el servidor decide. No suma, no promedia, no deduce cifras ocultas, no mezcla L y kg, no convierte ausencia en cero, no presenta propuestas como compras, no suma estimaciones a necesidades ni propuestas, no calcula estimaciones (ADR-004, INT-09). Si un dato no existe en la API, se documenta como faltante: **no se inventa** endpoint, cifra ni cálculo.
2. **Divulgación**: todo lo que muestre una cifra pasa por los estados del servidor (`DISCLOSED`, `SUPPRESSED_UNDER_THRESHOLD`, `SUPPRESSED_REVISION`, `OVERFLOW`, `WITHDRAWN*`, `SUPERSEDED`, `POLICY_PENDING`, `NO_DATA`, `NOT_SEALED`). Un estado no divulgado nunca muestra número, barra, ni cero; muestra su motivo (`statusReason`). Gráficos, tarjetas, textos automáticos y exportaciones respetan las mismas restricciones que las tablas. No se muestran identidades ni cantidades adicionales porque haya espacio.
3. **Permisos**: mover una pantalla no cambia quién puede usarla. Las guardas de ruta actuales (`CollectiveRoute`, `AdminRoute`, `RoleRoute`, `PrivateRoute`, `FarmerRoute`) se conservan por ruta; la autorización real sigue en el servidor. Las rutas antiguas siguen funcionando (redirección o misma ruta).
4. **Escrituras**: cargar una vista no dispara ninguna petición de escritura (ni `POST` de borradores, estimaciones, sellado, asociaciones, productos ni campañas). Toda acción de negocio conserva su confirmación humana actual (sellar, asociar, inactivar, cerrar campaña, generar borrador/estimación bajo botón explícito).
5. **Accesibilidad**: controles con nombre accesible, foco visible, orden lógico de tabulación, iconos siempre con texto cuando transmiten significado, contraste AA sobre fondos claros, sin información sólo por color, soporte de zoom 200 % y `prefers-reduced-motion`.
6. **Movimiento**: breve y funcional. Nada de contadores animados, efectos decorativos, portadas comerciales, `transition: all`, bucles infinitos (salvo indicadores de carga), ni animación en acciones de teclado o de alta frecuencia (cambio de ruta, pestañas, filas). Duraciones ≤ 200 ms, `ease-out` en entradas; `prefers-reduced-motion` conserva opacidad/color y quita movimiento.
7. **Textos**: español, trato de «usted», sin jerga técnica en la interfaz normal (`DISCLOSED`, `seal_ref`, SES, α, etc. sólo en «Ver detalle»/fuentes y método cuando ya existan). «Necesidades declaradas por producto» cuando eso es lo que muestran los datos. No llamar «rango histórico» a una estimación puntual.

## 2. Navegación por tareas: rutas y nombres de secciones

| Sección (menú) | Ruta canónica | Guarda | Contenido | Rutas antiguas |
|---|---|---|---|---|
| **Resumen** | `/colectivo/resumen` | `CollectiveRoute` | Campaña seleccionada y estado, última actualización, pocos indicadores, necesidades declaradas por producto y unidad, acciones pendientes sustentadas en datos, enlaces al detalle. Cobertura compacta integrada. | misma ruta |
| **Campañas** | `/campaigns` (listado) y **`/campaigns/:id`** (detalle, nuevo) | `PrivateRoute` (se conserva: el servidor admite lectura a los tres roles; crear/editar/abrir/cerrar sólo Directiva y Administrador, `Back/src/modules/campaigns/api/rest/campaigns.controller.ts:48-93`) | Listado con búsqueda, filtros, creación y acciones actuales; detalle con datos generales, participación (cobertura), versión sellada y propuestas vinculadas cuando la API los dé. Sin reapertura. | misma ruta; el detalle es nuevo |
| **Necesidades y propuestas** | `/colectivo/propuestas` | `CollectiveRoute` | Necesidades declaradas de la campaña, borrador vigente, generación explícita, revisión/confirmación humana, historial de borradores, referencia de estimación separada (F12-EST-08 ya consumido por `collectiveService.proposalEstimationReference`). | misma ruta |
| **Histórico y estimaciones** | **`/colectivo/historico`** (nuevo contenedor) con `?vista=tendencias` \| `?vista=estimacion` (`SegmentedControl`, por defecto `tendencias`) | `CollectiveRoute` | Vista «Histórico sellado» = cuerpo actual de `collective-trends.page.tsx`; vista «Estimación del consumo» = cuerpo actual de `estimation.page.tsx`. | `/colectivo/tendencias` → `/colectivo/historico?vista=tendencias`; `/colectivo/estimacion` → `/colectivo/historico?vista=estimacion` (con `<Navigate replace>` conservando los demás parámetros de consulta) |
| **Catálogo y equivalencias** | **`/colectivo/catalogo`** (nuevo contenedor) con `?vista=productos` \| `?vista=equivalencias` (por defecto `productos`) | `CollectiveRoute` | Vista «Productos» = cuerpo actual de `products.page.tsx`; vista «Equivalencias» = cuerpo actual de `product-reconciliation.page.tsx`. Confirmación humana e historial se conservan. | `/colectivo/productos` → `?vista=productos`; `/colectivo/reconciliacion` → `?vista=equivalencias` |
| **Administración** (grupo) | `/users` (Usuarios, sólo `ADMINISTRADOR`, `AdminRoute`) · `/audit-logs` (Bitácora, `RoleRoute` DIRECTIVA/ADMINISTRADOR) | existentes | Sin cambios funcionales. El grupo sólo aparece si el rol tiene al menos un ítem. | mismas rutas |
| Cobertura | `/colectivo/cobertura` | `CollectiveRoute` | **Sale del menú**, sigue existiendo y enlazada desde Resumen («Ver cobertura») y desde el detalle de campaña. | misma ruta |
| Copia sin conexión | `/estimacion/copia-sin-conexion` | ninguna (por diseño F12-EST-07) | Sin cambios. | misma ruta |
| Legacy agricultor | `/dashboard`, `/plots`, … , `/directiva` | `FarmerRoute` / redirección | Sin cambios; fuera del menú salvo `VITE_LEGACY_FARMER_WEB=enabled`. | — |

Reglas de implementación:
- `Web/src/lib/navigation.ts` es la **única** fuente de rutas y del menú (`COLLECTIVE_PATHS`, `COLLECTIVE_MENU`, `menuPathsFor`, `homePathFor`). Añadir ahí `history: '/colectivo/historico'`, `catalog: '/colectivo/catalogo'`, `campaignDetail: (id) => '/campaigns/' + id`. Conservar las claves antiguas (`trends`, `estimation`, `products`, `reconciliation`) apuntando a sus rutas antiguas, para que las pruebas y los enlaces existentes sigan válidos; las redirecciones viven en `App.tsx`.
- El parámetro `?campaign=<uuid>` (hook `useSelectedCampaign`) sigue siendo la forma de llevar la campaña entre vistas; los contenedores conservan los parámetros al cambiar `?vista=`.
- `homePathFor` sigue devolviendo `/colectivo/resumen` para Directiva/Administrador.
- Barra inferior en teléfono (≤ `lg`): Resumen · Campañas · Necesidades · Histórico (cuatro ítems máximo, etiquetas visibles, sin truncar); el resto por el menú desplegable.

## 3. Componentes y tipos compartidos (propiedad de la sesión A)

Ubicación: `Web/src/components/ui/` (nuevo). Exportaciones mínimas que B y C adoptan al integrar; A publica primero `Web/src/components/ui/README.md` con la firma de cada uno (contrato mínimo) y después la implementación. Hasta recibirlo, B y C pueden maquetar con los componentes actuales de `app-shell.tsx` y `collective-ui.tsx`, sin crear duplicados propios.

| Componente | Firma mínima | Notas |
|---|---|---|
| `PageHeader` | `{ title: string; subtitle?: ReactNode; campaign?: ReactNode; actions?: ReactNode }` | Título de la vista, selector de campaña a la izquierda, **una** acción primaria a la derecha. |
| `CampaignSelector` | `{ campaigns: Campaign[]; selected: string \| null; onSelect(id); showActiveBadge?: boolean }` | Sustituye a `CampaignPicker`/`CollectiveToolbar`; muestra nombre · estado; «Activa» o «Distinta de la activa» como texto, no sólo color. **No asume una única campaña abierta**: si hay varias `ABIERTA`, la lista las muestra todas y la «activa» es sólo la que el servidor marca `isActive`. |
| `DataState` | `{ state: 'loading' \| 'empty' \| 'no-match' \| 'error' \| 'forbidden' \| 'restricted' \| 'insufficient' \| 'stale'; title?: string; description?: ReactNode; onRetry?(); compact?: boolean }` | Un solo componente para los ocho estados de §4, con icono + texto (nunca sólo color, nunca un «0»). |
| `StatusChip` | `{ status: AnyStatus \| CampaignStatus \| string; threshold?: number \| null }` | Unifica `StatusBadge` de `collective-ui.tsx` y de `app-shell.tsx`; texto + `title` con el motivo. |
| `KpiTile` | `{ label: string; value: ReactNode; note?: ReactNode; tone?: 'default' \| 'muted' \| 'attention'; testId?: string }` | Evolución de `StatTile`; sin contadores animados. |
| `Section` / `SectionHeader` | como hoy en `collective-ui.tsx` (`title`, `note`, `actions`, `badge`) | Tarjeta de sección con borde, sin cristal/blur. |
| `DataTable` | `{ caption?: string; minWidth?: number; children }` | Contenedor de tabla legible: cabecera fija en desplazamiento, `tabular-nums` en cifras, desplazamiento horizontal interno a ≤ 390 px, filas sin hover animado. |
| `SegmentedControl` | como hoy (`label`, `options`, `value`, `onChange`, `testId`), con `aria-pressed` | Opciones visibles para las vistas de los contenedores. |
| `Collapsible` | como hoy (`details/summary`) | Secciones secundarias plegadas. |
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'; size?: 'md' \| 'sm'` o las clases `buttonClass`/`secondaryButtonClass`/`dangerButtonClass` re-exportadas con los tokens nuevos | Estado `:active` con `scale(0.98)` ≤ 160 ms; foco visible. |
| `Notice` | como hoy (`kind: ok \| error \| info \| warn`) | Con icono + texto. |

Tokens (A, en `Web/src/index.css`): paleta de un solo acento (verde institucional actual `#047857`/`#059669` sobre fondos claros `#f8faf4`/blanco), neutros `slate`, superficies sólidas (sin `backdrop-filter` ni degradados decorativos), radios 8/12 px, sombras suaves, tipografía Inter (ya cargada), escala de espaciado Tailwind, `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--duration-fast: 120ms`, `--duration-base: 180ms`. Se eliminan de `index.css` los keyframes y utilidades sin uso (float, gradient-shift, shimmer decorativo, toast-in/out si nadie los usa) tras comprobarlo con `grep`.

Tipos compartidos: no se crean tipos nuevos de API; se usan `Web/src/types/*.ts` tal cual. Si una sesión necesita un tipo de presentación (p. ej. `DataStateKind`), vive en `Web/src/components/ui/types.ts` (A).

## 4. Estados de datos y permisos (obligatorios en toda vista)

| Estado | Cuándo | Texto base (ajustable por vista) | Nunca |
|---|---|---|---|
| Cargando | petición en curso | «Cargando…» con indicador | esqueletos que no coincidan con el resultado |
| Sin registros | respuesta vacía sin filtros | «Todavía no hay … en esta campaña. Eso no significa cero.» | un «0» como cifra |
| Sin coincidencias | respuesta vacía con filtro/búsqueda | «Ningún … coincide con el filtro aplicado (…).» con acción «Quitar filtros» | confundirlo con «sin registros» |
| Error recuperable | red/5xx | mensaje de `collectiveError`/`extractError` + «Reintentar» | datos residuales de la carga anterior |
| Sin permiso | 403 o rol no admitido | «Su rol no tiene acceso a esta información.» | mostrar parcialmente |
| Información restringida | celda/línea con estado distinto de `DISCLOSED` | `statusReason(status, threshold)` | número, barra o cero |
| Datos insuficientes | la API lo declara (estimación) | «Datos insuficientes» + motivo de la API | tratarlo como cero o como «sin datos» genérico |
| Resultado desactualizado | la API lo declara (`pending_changes`, ejecución anterior, versión sustituida, vigencia vencida) | «De una ejecución anterior» / «Hay cambios recibidos que aún no alcanzan el umbral» | ocultar la fecha |

Permisos en la interfaz: el botón de una acción que el rol no puede ejecutar **no se muestra** (o se muestra deshabilitado con texto «Sólo consulta», como hoy en Campañas), pero la vista de lectura se conserva.

## 5. Formatos

| Dato | Función | Regla |
|---|---|---|
| Cantidades colectivas (enteros base en string) | `formatQuantity(base, unit, serverPresentation)` de `lib/quantity.ts` | BigInt, nunca `Number`; `L`/`KG` por unidad; **nunca se suman** ni se mezclan unidades en una misma escala, barra o total. |
| Estimaciones (decimal base) | `formatDecimalQuantity`, `formatBaseValue` | Sin redondeo propio. |
| Fechas y horas | `fmtDateTime` (`lib/collective-text.ts`, es-BO medium/short), `fmtDate` (`lib/format.ts`) | Siempre con «datos hasta» / «sellada el» / «generado el»; no relativas («hace 3 días») salvo acompañadas de la fecha. |
| Porcentajes | `fmtPercent(numerator: number, denominator: number): string \| null` (A la añade a `lib/format.ts`) | `Intl.NumberFormat('es-BO', { style: 'percent', maximumFractionDigits: 0 })`; devuelve `null` si el denominador es 0 o alguno no es finito, y la vista entonces **no** muestra porcentaje. Sólo para la cobertura (`members_with_contribution / linked_members`) y para diferencias de estimación cuando producto, unidad, período y alcance sean comparables y la referencia no sea cero ni ausente. |
| Conteos | `Intl.NumberFormat('es-BO')` y plurales explícitos (`1 producto` / `2 productos`) | `tabular-nums`. |
| Dinero | no aparece en las vistas colectivas de esta etapa | — |

Cobertura: definición y denominador del contrato (`Coverage.linked_members` = agricultores vinculados activos; `members_with_contribution` = dentro de cifras publicadas, F10-SEC-02). No se fija ningún número de miembros, no se inventan umbrales de color, no se convierte una cobertura alta en «datos suficientes». «Aportes aceptados» (lo que el servidor consolidó) se distingue de «registros locales» (lo que un teléfono tiene sin publicar); lo segundo **no está disponible** en la API y no se muestra.

## 6. Propiedad de archivos (un único responsable por archivo)

| Sesión | Archivos |
|---|---|
| **A** | `Web/src/index.css`, `Web/index.html` (meta `viewport`, `theme-color`), `Web/src/components/app-shell.tsx`, `Web/src/components/ui/**` (nuevo), `Web/src/lib/navigation.ts`, `Web/src/App.tsx` (rutas y redirecciones), `Web/src/lib/format.ts` (`fmtPercent`), `Web/src/components/collective-ui.tsx` (sólo para delegar en `ui/` sin romper exportaciones), pruebas de esos archivos, `Web/src/dev/prototypes/**` (variantes del Resumen, sólo DEV), `docs/evidence/web_rediseno/a_*`. |
| **B** | `Web/src/pages/collective-summary.page.tsx`, `Web/src/pages/campaigns.page.tsx`, `Web/src/pages/campaign-detail.page.tsx` (nuevo), `Web/src/pages/coverage.page.tsx`, `Web/src/components/seal-panel.tsx`, `Web/src/components/coverage-*.tsx` (nuevos), `Web/src/hooks/use-selected-campaign.ts`, `Web/src/contexts/campaign.context.tsx`, `Web/src/lib/collective-summary-xlsx.ts`, pruebas de esos archivos, `Web/src/dev/fixtures/summary-*.ts`, `campaigns-*.ts`, `docs/evidence/web_rediseno/b_*`. |
| **C** | `Web/src/pages/joint-proposal.page.tsx`, `Web/src/pages/collective-trends.page.tsx`, `Web/src/pages/estimation.page.tsx`, `Web/src/pages/history.page.tsx` (nuevo contenedor), `Web/src/pages/products.page.tsx`, `Web/src/pages/product-reconciliation.page.tsx`, `Web/src/pages/catalog.page.tsx` (nuevo contenedor), `Web/src/components/estimation-*.tsx`, `Web/src/components/product-form.tsx`, `Web/src/components/export-buttons.tsx`, `Web/src/lib/estimation-*.ts`, `Web/src/lib/trends-xlsx.ts`, `Web/src/lib/joint-purchase-*.ts`, `Web/src/lib/product-text.ts`, pruebas de esos archivos, `Web/src/dev/fixtures/proposal-*.ts`, `trends-*.ts`, `estimation-*.ts`, `catalog-*.ts`, `docs/evidence/web_rediseno/c_*`. |
| **0 (coordinadora)** | `docs/web-rediseno/**`, integración en `feat/web-rediseno-integracion`, `Web/src/services/**` y `Web/src/types/**` (sólo lectura para todos: cualquier cambio se pide a la coordinadora), `package.json`/`package-lock.json`. |

Ruta nueva en `App.tsx` que necesite B o C (detalle de campaña, contenedores): B/C escriben la **página**; A añade la **ruta** y la redirección a petición concreta por la coordinadora. Mientras tanto B/C prueban sus páginas con pruebas unitarias y, si hace falta verlas en el navegador, con una ruta temporal en su propio worktree que **no se incluye en el commit**.

Nadie edita un archivo ajeno. Si una sesión necesita un cambio en un archivo de otra, lo describe (archivo, línea, cambio, motivo) en su informe a la coordinadora.

## 7. Datos sintéticos, fixtures y prototipos

- Fixtures en `Web/src/dev/fixtures/*.ts`: objetos con la **misma forma** que los tipos de `Web/src/types/*.ts`. Cada módulo exporta al menos `demo` (parecido a la DEMO), `worst` (catálogo `break-ui`: nombres largos reales o plausibles como «Herbicida sistémico de amplio espectro para barbecho químico 480 g/L», un solo registro, cero registros, cantidades grandes `"123456789012"` y pequeñas `"25"`, L y KG mezclados, estados restringidos, `pending_changes`, varias campañas `ABIERTA`, sin estimación), `empty` y `one`.
- Las variantes del Resumen (sesión A) viven en `Web/src/dev/prototypes/` y se montan en la ruta `/prototipos/resumen` **sólo con `import.meta.env.DEV`**; usan los fixtures y **nunca** llaman a la API ni escriben. El selector sigue `PICKER.md` al pie de la letra. Se borran al promover la variante elegida.
- El conmutador «Datos de prueba / Peor caso / Vacío / Uno» de `break-ui` se implementa como parámetro `?datos=worst|empty|one` leído **sólo** en rutas `/prototipos/*` (DEV). Las vistas reales no leen ese parámetro.
- Nadie altera datos de un servidor para producir casos visuales.

## 8. Comandos de validación (en `Web/` del worktree propio)

```bash
npm run lint          # 0 errores (los 2 avisos preexistentes de los contextos se toleran)
npx tsc -b            # sin errores
npx vitest run        # todas las pruebas; las nuevas junto a su archivo (*.test.tsx)
npm run build         # tsc -b && vite build
VITE_API_PROXY_TARGET=http://127.0.0.1:3342 npx vite --host 127.0.0.1 --port <puerto de la sesión> --strictPort
```

Servidor de datos para ver la Web: la copia aislada «rica» (API **3342**, §4 de `00_ESTADO_LOCAL`). Inicio de sesión en guiones: copiar el bloque de `docs/evidence/web_panel_defensa/recorrido-panel.mjs` líneas 52–62 con `BE_DIR=<_wt/DEMO-BE>` y `DEMO_PG_ADMIN_URL=postgresql://postgres@127.0.0.1:15433/postgres` (la copia «rica» corre en el puerto 15433 porque 55512 cae en un rango reservado por Hyper‑V; se arranca con una copia local del script `rica.sh` fuera del repositorio); la contraseña llega por `password-pipe` y **no se imprime, no se guarda ni se pasa por el portapapeles**. Navegador: `BROWSER_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"`, `PUPPETEER_HOME=%LOCALAPPDATA%\Temp\agro_demo_web_tools`. Anchos a comprobar: 1366×768, 1920×1080, 390×844 y 320×568; zoom 200 %; teclado (Tab/Enter/Escape); `prefers-reduced-motion: reduce` (Puppeteer `page.emulateMediaFeatures`). Lo observado en emulación de escritorio **no** se declara probado en un teléfono.

## 9. Commits e informes

- Commits pequeños, un alcance claro, prefijo `feat(web): …`, `fix(web): …`, `test(web): …`, `docs(evidence): …`. Autor: la identidad git configurada (Roderich1). **Sin** `Co-Authored-By`, sin «Generated with Claude Code», sin enlaces de sesión. Comprobar con `git log -1 --format=%B`.
- Prohibido: `git push`, PR, fusionar a `main`, `reset --hard`, `rebase -i`, borrar cambios ajenos, reescribir commits ajenos, `git stash` a secas, tocar otros worktrees.
- Informe de cada sesión a la coordinadora (archivo `docs/evidence/web_rediseno/<letra>_INFORME_<fecha>.md` en su worktree + resumen en el mensaje final): commits (SHA y alcance), archivos modificados, pruebas ejecutadas con resultado real, capturas (ruta), dependencias de otras sesiones, cambios solicitados en archivos ajenos, pendientes y limitaciones, y la distinción entre cambios visuales y cambios funcionales.
- La coordinadora integra con `git merge --no-ff` (o cherry-pick) en `feat/web-rediseno-integracion`, resuelve conflictos según este contrato y ejecuta la validación conjunta.

## 10. Orden de trabajo

1. **A** publica el contrato mínimo de componentes (`ui/README.md` + firmas) y los tokens; después construye el armazón, la navegación y las dos variantes del Resumen (`/prototipos/resumen`).
2. **B** y **C**, en paralelo: análisis de sus módulos contra la matriz de datos (`02_MATRIZ_DATOS_WEB.md`), fixtures sintéticos, componentes específicos y pruebas; maquetan con los componentes actuales y adoptan `ui/` antes de integrar.
3. Elección de la variante del Resumen por el autor → la coordinadora lo comunica; A promueve la variante y B la aplica al Resumen real.
4. Integración, validación conjunta, capturas y entrega.
