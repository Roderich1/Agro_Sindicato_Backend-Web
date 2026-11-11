# Rediseño de la Web institucional: entrega final de la etapa (2026-11-10/11)

Rama de integración `feat/web-rediseno-integracion` (worktree `_wt/WEBR-INT`), base `8568fd1`. Todo local: sin push, PR, despliegues, fusiones a `main`, cierres de issues ni cambios al documento de grado. Sin cambios en `Back/`, contratos de API, permisos del servidor, la app Flutter ni su integración de voz. Sin dependencias nuevas.

## 1. Variante elegida y aplicada

El autor eligió **«Analítica comparativa»** (`a_VARIANTES_RESUMEN_2026-11-10.md`). B la aplicó al Resumen real (`bd27a34`, componente propio `needs-bars.tsx`) conservando sus reglas funcionales; A retiró la superficie de prototipos (`63e67b7`): `grep` de `/prototipos`, `proto-picker` y `dev/prototypes` en `Web/src` vacío. Las capturas de las variantes se conservan como evidencia.

## 2. Ramas y fusiones

| Rama | Etapa 1 | Etapa 2 | Fusionada en integración |
|---|---|---|---|
| A `feat/web-rediseno-a-sistema-navegacion` | `fd6e290`…`dba2fa7` | `9e07985`…`1eddb60` | `304a61a`, `8e814b6` |
| B `feat/web-rediseno-b-resumen-campanas` | `68fc2e6`…`ecdddc8` | `dab716a`…`4344eea` | `8413b6a`, `c3ed8ac` |
| C `feat/web-rediseno-c-necesidades-catalogo` | `c86db5e`…`8606d01` | `5f03f44`…`b319806` | `de0efca`, `1d31538` |
| Coordinadora (en integración) | docs `a5a2b33`, `c9a6c11`, `1d82981`, `e7f1b3a`, `f213f6b`; rutas `70545e5` | `7d09b1e` (guardas con alto dinámico y spinner con movimiento reducido) | — |

Fusiones `--no-ff`, sin conflictos. Autor de todos los commits: la identidad git configurada (Roderich1), sin `Co-Authored-By` ni «Generated with» (comprobado por rama).

## 3. Validación de la composición final (`_wt/WEBR-INT/Web`, tras `7d09b1e`)

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 errores, 2 avisos preexistentes (`react-refresh/only-export-components` en los contextos) |
| `npx tsc -b` | OK |
| `npx vitest run` | **47 archivos, 396 pruebas, 396 pasan** (base de partida: 23 archivos, 225) |
| `npm run build` | OK |

## 4. Recorridos con datos del servidor (copia aislada «rica», API 3342; sólo lectura)

Cuatro recorridos con Edge sin interfaz (puppeteer-core), inicio de sesión por la tubería `password-pipe` (contraseñas nunca impresas), navegación dentro de la SPA, `prefers-reduced-motion` emulado, anchos 1366×768, 390×844 y 320×568 y zoom 200 %:

| Recorrido | Qué cubrió | Resultado |
|---|---|---|
| B (`b_RECORRIDO_RICA_2026-11-10.md`, 22 PNG) | Resumen de tres campañas (abierta sin sellar, dos selladas), detalle, Cobertura, Campañas | 33 filas cotejadas con el JSON de `summary`, todas iguales; 12 campañas; teclado con foco visible; sin desplazamiento horizontal; 0 escrituras de negocio |
| C (`c_RECORRIDO_RICA_2026-11-10.md`, 28 PNG) | Propuestas (con y sin borrador), Histórico `?vista=tendencias` y `?vista=estimacion`, Catálogo | 100 comprobaciones, 0 fallas: 7 necesidades y 7 referencias iguales a la API, diferencia sólo en las 7 líneas comparables y nunca en las ocultas, 81 cifras y 11 columnas del gráfico iguales, 7 estimaciones y 7 líneas base iguales, «Datos insuficientes» sin cifra; 0 escrituras |
| A (`a_RECORRIDO_RICA_2026-11-10.md`, 21 PNG) | Menú por tareas, grupo Administración, redirecciones con `?campaign=`, Cobertura por enlace, un solo `h1`, menú del teléfono y barra inferior, teclado, zoom, rol Agricultor | 81 correctas, 2 «fallas» = los dos `401` esperados de `POST /auth/refresh` en `/login` sin sesión; agricultor1 llega a `/sin-acceso-web` sin menú y sin ninguna lectura de la API |
| Coordinadora, composición final (`int_capturas_rica/`, 21 PNG + `recorrido.log`) | Mismo guion de A sobre la rama integrada completa (`7d09b1e`) | 81 correctas, mismas 2 «fallas» de consola (401 de `auth/refresh` sin sesión); 0 escrituras de negocio; agricultor1 sin menú ni datos. Se observaron respuestas `429` de `GET /campaigns` por el límite de 20 peticiones por minuto de la API: el guion repite y las comprobaciones pasaron, pero cada vista vuelve a pedir `/campaigns` (`useSelectedCampaign`); mejora pendiente (abajo). |

Las escrituras registradas en los cuatro recorridos son sólo `POST /auth/login` y `POST /auth/refresh`. Ninguna vista dispara una escritura de negocio al cargar. Observación anotada: `GET …/summary` de una campaña sin sellar ejecuta en el servidor la decisión de divulgación (comportamiento previo, F07); el Resumen y el detalle la piden una sola vez por visita.

**Nada de esto se probó en un teléfono real**: todo es emulación de escritorio. Lo que necesita dispositivo: zonas seguras con muesca e indicador, barra inferior con el teclado abierto, hover que no se quede pegado, sensación al pulsar, que los campos no amplíen la página, `theme-color`.

## 5. Cambios visuales frente a cambios funcionales

**Visuales (presentación, sin cambiar datos ni reglas):** tokens de un acento sobre fondos claros, superficies sólidas, movimiento ≤ 200 ms con `ease-out` y `prefers-reduced-motion`, base táctil; `components/ui`; barra lateral clara, menú del teléfono como diálogo, barra inferior con zonas seguras; `PageHeader` con un solo `h1` y barra superior con la sección del menú por tareas; Resumen con la variante elegida; Campañas y detalle; Cobertura; propuestas con `DataTable`; contenedores con `SegmentedControl`; gráfico sin animación y con barras horizontales en estrecho; estados con icono y texto; arreglos de break-ui (desbordes, plurales, miles, `tabular-nums`).

**Funcionales (se declaran como tales):**
- Navegación: menú por tareas, Bitácora de vuelta al menú (su ruta y guarda no cambian), Cobertura fuera del menú (ruta conservada), rutas nuevas `/colectivo/historico`, `/colectivo/catalogo`, `/campaigns/:id` y redirecciones de las antiguas con `RedirectWithQuery` (también `/directiva` conserva `?campaign=`).
- Resumen: «Cifra más reciente» (máximo de `data_as_of` de las cifras publicadas; regla de presentación declarada), acciones pendientes sólo con datos, orden por nombre, una sola lectura de `summary` por visita (antes StrictMode la duplicaba en desarrollo).
- Campañas: columnas «Fin estimado» y «Cierre registrado» separadas; «Fin estimado vencido · sin cierre registrado» (regla de presentación declarada: ABIERTA, sin `closedAt`, día UTC del fin estimado anterior a hoy); fechas de calendario en UTC; detalle compuesto (lista + `summary` + `sealState` + `proposals`); varias ABIERTA listadas.
- Cobertura: `fmtPercent` sólo con denominador > 0; «registros locales» declarados no disponibles.
- Propuestas: rótulo del contrato «Estimación del consumo (referencia)» (F12:665); diferencia necesidad/estimación sólo cuando producto, unidad y campaña coinciden, la referencia es ESTIMATED y CURRENT y > 0, con BigInt y sin porcentaje.
- Histórico/estimación: `evaluated_at` visible; «Datos insuficientes» con motivo; aviso del 422 de clasificación.
- Catálogo: búsqueda sin tildes, agrupación, «Quitar filtros», estados 403/error; «Efecto antes/después» mostrado como «No disponible».
- Bitácora con `PageHeader`; guardas con alto dinámico.

Permisos: `menuPathsFor` sigue siendo la fuente; las guardas por ruta se conservan; el servidor autoriza. Confirmaciones de negocio (sellar, asociar, inactivar, cerrar campaña, generar borrador/estimación) intactas.

## 6. Faltantes que requieren trabajo funcional posterior (no simulados)

Los de `03_PRIMERA_ENTREGA` §7 (sincronización por agricultor `7fd3365`, `GET /campaigns/:id`, quién cerró, sello en el listado, temporadas/clasificaciones, marca global de actualización, fuentes completas de series, historial del catálogo y reactivar, impacto de equivalencias, estado de decisión de propuestas), más:
- **Campañas en caché**: cada vista pide `GET /campaigns`; con el límite de 20 peticiones por minuto de la API aparecen `429` en recorridos rápidos. Candidato: leer la lista una vez en `CampaignProvider` (archivo de B; cambio funcional, no hecho en este bloque).
- `AuthProvider` lanza `POST /auth/refresh` sin cookie al abrir `/login` (dos 401 en consola); decidir si se evita.
- Adoptar `fmtCalendarDate` (A) en `campaign-dates.ts` (B) y `enterKeyHint="search"` en las búsquedas del catálogo (C): pendientes menores.
- Decisiones del autor abiertas en los `*_BREAK_UI`: columna mínima para «0 L» en el gráfico; tablas secundarias con desplazamiento interno; corte a barras horizontales en `sm` o `md`; «Abrir» en una ABIERTA no activa y «Editar» deshabilitado en cerradas; nombre repetido en el detalle.

## 7. Rutas de revisión

- Código: `_wt/WEBR-INT` (o cada rama A/B/C). Levantar: `cd Web && VITE_API_PROXY_TARGET=http://127.0.0.1:3342 npx vite --port 5174` contra la copia «rica» (`scratchpad/webr/rica_local.sh up`, PG 15433) o contra la DEMO oficial una vez relanzada (3330; sólo lectura).
- Capturas: `docs/evidence/web_rediseno/{a,b,c}_capturas/`, `{a,b,c}_capturas_rica/`, `int_capturas_rica/`; variantes en `a_capturas/`.
- Informes por sesión: `docs/evidence/web_rediseno/{a,b,c}_INFORME_2026-11-10.md`, `*_ANALISIS_*`, `*_BREAK_UI_*`, `*_RECORRIDO_RICA_*`.
- Contratos y matriz: `docs/web-rediseno/00…03`.

## 8. Skills utilizadas

`emilkowalski/skills` `715c1807`: `emil-design-eng` (componentes e interacción), `prototype` + `PICKER.md` (variantes del Resumen), `break-ui` + `CATALOG.md` (peor caso en B y C), `mobile-native` (base táctil y revisión del armazón), `review-animations` + `STANDARDS.md` (autorrevisión de A sobre la composición: Approve), `remove-animations` (poda de `index.css`). Ninguna otra; sin «Taste Skill». Las reglas de Agrocuentas prevalecieron (p. ej., sin animación en avisos de datos, sin umbrales de color, sin porcentajes engañosos).
