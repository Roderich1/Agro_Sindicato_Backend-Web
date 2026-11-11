# Rediseño de la Web institucional: cierre con comprobación en el emulador Android (2026-11-11)

Complementa `04_ENTREGA_FINAL_2026-11-10.md`. Cambio de instrucción del autor: el POCO no estaba disponible; la comprobación se hizo en Chrome dentro del emulador Android existente. **Nada de lo que sigue se presenta como prueba en teléfono físico.**

## 1. Ajustes posteriores a la entrega final (etapas 3 y 4)

| Sesión | Commits | Qué cambió |
|---|---|---|
| B | `c9e6316`, `ab59fb2`, `daad4bf`, `6506376` | **Consultas a campañas en caché:** `CampaignProvider` pide `GET /campaigns` y `GET /campaigns/active` una sola vez por identidad (guarda contra StrictMode), expone `campaigns`/`refreshCampaigns`; `useSelectedCampaign` lee del contexto; Campañas sólo consulta al servidor con filtro o búsqueda (con espera de 350 ms); crear/editar/abrir/cerrar refrescan. `fmtCampaignDay` delega en `fmtCalendarDate`. Búsqueda de Campañas con `enterKeyHint`/`inputMode`/`type="search"`. Pruebas de permisos por rol (Directiva y Administrador ven las acciones; Agricultor «Sólo consulta»). |
| C | `72b45c7`, `a00d074` | Búsquedas del catálogo con `enterKeyHint`/`inputMode`/`autoComplete="off"`; sombra lateral en tablas con desplazamiento; **primera columna fija** (`position: sticky`) en las tablas del histórico (series y campañas, `min-w` reducido), detalle de ejecución y borradores. |
| A | `3976db8`, `0bc3e0e`, `1a85b5a`, `6e3f098` | **H1** menú del teléfono con entrada de historial propia: Atrás de Android lo cierra, cerrarlo deshace la entrada, bfcache no lo restaura abierto. **H2** horizontal con alto ≤ 500 px: sin barra inferior, cabecera compacta no fija, diálogo del menú desplazable. Sombra lateral común en `.ui-table-scroll` y cabecera de tabla translúcida. **N2** `interactive-widget=resizes-content` en el viewport y margen de desplazamiento en los campos del inicio de sesión. **H4** acciones de `PageHeader` alineadas a la izquierda por debajo de `sm`. |
| Coordinadora | fusiones `a8a281e`, `0a1f775`, `5ea1616`, `57e79e8` | Integración; validación conjunta. |

**Validación de la composición final `57e79e8`** (`_wt/WEBR-INT/Web`): lint 0 errores (2 avisos preexistentes), `tsc -b` OK, **vitest 48 archivos / 408 pruebas, 408 pasan**, `npm run build` OK. Autor Roderich1 en todos los commits, sin trailers (comprobado sobre `8568fd1..HEAD`).

## 2. Tres niveles de comprobación, separados

### (a) Pruebas automatizadas (vitest + jsdom, 408)
Reglas de datos y estados (ninguna celda no divulgada muestra número ni cero; L y KG separados; «Datos insuficientes» no es cero; `fmtPercent` nulo con denominador 0), navegación y permisos por rol (menú por tareas, guardas, redirecciones con consulta, Agricultor sin menú), componentes `ui/` (ocho estados, selector con varias campañas abiertas), una sola `GET /campaigns` y `/campaigns/active` por sesión (también con StrictMode), ninguna escritura al montar ninguna vista, menú del teléfono con historial, formatos UTC de fechas de campaña.

### (b) Navegador de escritorio con viewport móvil (Edge sin interfaz, puppeteer-core)
Recorridos de A, B, C y de la coordinadora sobre la copia «rica» (`*_capturas_rica/`, `int_capturas_rica/`) y `break-ui` con fixtures (`*_capturas/`): cifras cotejadas con la API, 0 escrituras de negocio, sin desplazamiento horizontal a 1366/390/320 px y zoom 200 %, teclado y `prefers-reduced-motion` emulados. Son emulación de escritorio.

### (c) Chrome ejecutado dentro del emulador Android (`e_EMULADOR_2026-11-11.md`, 51 capturas reales `screencap`)
Entorno: AVD `Pixel_8` existente (sin borrar datos), Android 16, Chrome 156.0.8078.47, 1080×2400 a 420 dpi (411×808 px CSS), teclado físico desactivado. Tráfico: `adb reverse tcp:5174` → Vite en el host (`127.0.0.1:5174`) → proxy `/api` → API aislada `127.0.0.1:3342` (copia «rica»). Sin túnel público ni PostgreSQL expuesto; la DEMO oficial no se tocó. Prueba de destino: sólo `:3342` escucha (ni 3330/3331/5190 ni el destino por defecto del proxy); el cuerpo de `/api/v1/health` visto en Chrome es el de 3342. Control: toques, teclas y rotación por `adb`; capturas por `screencap`; CDP (`adb forward … chrome_devtools_remote`) sólo para evaluar el DOM, navegar y registrar método/estado/ruta de las peticiones (sin cabeceras ni cuerpos). Contraseñas de un solo uso por la tubería `password-pipe`/`credential` (nunca impresas, guardadas ni capturadas; desviación anotada en §9 del informe: en la re-verificación el campo se tecleó desde la tubería tras confirmar por CDP que el campo enfocado era el de contraseña).

| Punto | Sobre `0a1f775` (primera pasada) | Sobre `57e79e8` (re-verificación) |
|---|---|---|
| 1 Inicio y cierre de sesión | Pasa: `POST 204 /auth/logout` → `/login`; `/colectivo/resumen` vuelve a `/login` sin datos | — |
| 2 Menú y selección de campaña | Pasa; `?campaign=` cambia y «Distinta de la activa» en texto. Defecto H1 (Atrás con menú abierto). El selector nativo no se dibuja en el emulador (elegido con D-pad) | **H1 corregido**: Atrás cierra el menú sin cambiar la ruta; después lleva a la ruta anterior real |
| 3 Resumen, necesidades, propuestas, histórico | Pasa; cifras iguales a la API: Resumen 2025 9/9 + cobertura, Resumen 2026 10/10 (3 ocultas sin número, 2 con cambios pendientes), propuestas 10/10 con diferencias 381,6 y 604,3 KG, series 12/12, estimación 9/9 con 2 «Datos insuficientes», campañas 12/12, catálogo 11/11 | — |
| 4 Tablas con desplazamiento interno | Pasa: contenedor se desplaza, la página no (`scrollWidth = innerWidth`), sombra visible. Defecto H3 (se pierde la primera columna) | **H3 corregido**: primera columna fija y legible en histórico y borradores |
| 5 Filtros y campos con teclado | Parcial: `enterkeyhint=search`, `visualViewport.scale = 1`, «Sin coincidencias» y «Quitar filtros» correctos; **Gboard dejó de dibujarse en el emulador**, el teclado real no se pudo probar (N2 queda sin confirmar) | igual |
| 6 Vertical y horizontal | Pasa sin desbordes; defecto H2 (poco alto en horizontal, menú recortado) | **H2 corregido**: sin barra inferior, cabecera compacta, contenido a 327 px, menú desplazable |
| 7 Pulsaciones, foco y menús | Pasa: sin resaltado gris, `:active` `scale(0.98)`, Tab recorre selector → acciones → enlaces → barra inferior con foco visible | H4 corregido (acciones alineadas a la izquierda) |
| 8 Superposiciones y desbordes | Pasa en todas las vistas, vertical y horizontal | — |
| 9 Navegación repetida | Pasa: 2 vueltas, 24 GET 200, **0 `GET /campaigns`**, 0 `/campaigns/active`, 0 `429`, 0 escrituras (único 429: `POST /auth/login` por reingreso rápido) | Pasa: 12 GET 200, 0 campañas, 0 `429` |

Hallazgo que queda: **H5** en modo desarrollo (StrictMode) Necesidades, Histórico y Catálogo piden cada GET dos veces; no ocurre en producción y no afecta a `/campaigns`. Candidato a mejora.

## 3. Pendiente sólo con hardware (o con un emulador sin los fallos observados)

- Teclado virtual real: N2 (campo de contraseña bajo el teclado) y la barra inferior con el teclado abierto.
- Selector nativo de campaña elegido por toque.
- Sensación táctil, muesca e indicador reales, rendimiento, TalkBack, `theme-color`.

Impedimentos del emulador, no de la Web: el selector nativo no se dibuja (tampoco con un `<select>` mínimo), Gboard dejó de mostrarse, «Aw, Snap», caída de `NetworkService`, congelamientos y ANR recuperados sin borrar datos.

## 4. Estado del entorno al cerrar

Emulador `Pixel_8` encendido con rotación restaurada; Vite 5174 detenido por la coordinadora; `agro_rica_pg` (PG 15433, API 3342) en marcha; DEMO oficial sin tocar (hay que relanzarla con el lanzador del autor). Ramas locales sin push, PR ni fusión a `main`.
