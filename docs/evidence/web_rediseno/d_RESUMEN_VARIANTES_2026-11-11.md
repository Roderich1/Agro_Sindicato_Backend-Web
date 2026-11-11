# Resumen colectivo: diagnóstico de la vista actual y tres composiciones para elegir (2026-11-11)

Rama `feat/web-rediseno-integracion` (worktree `_wt/WEBR-INT`). Punto de partida comprobado en el árbol local: `b08ab6d` (árbol limpio, sin stash). Este bloque toca **sólo** la vista Resumen: el código nuevo vive en `Web/src/dev/prototypes/resumen/` y la página de desarrollo `Web/src/dev/resumen-prototipos.html`; el Resumen real (`pages/collective-summary.page.tsx`) **no se ha modificado** y las demás vistas, el menú, `Back/`, Flutter, la voz, la autenticación y la DEMO oficial no cambian. Todo local: sin push, PR, fusiones, cierres de issues ni cambios al documento de grado.

**La variante no está elegida: la elige el autor.** Nada de lo que sigue declara una variante aprobada.

## 1. Estado de partida: el Resumen real con datos del entorno aislado

Capturas en `d_capturas_antes/` (Edge sin interfaz, sesión real de Directiva en la copia «rica», API 3342, sólo lectura; contraseña por `password-pipe`, nunca impresa; `captura.log` y `*_metrics.json` con las medidas; el JSON del resumen capturado es sintético y queda en `resumen_json_sintetico.json`). Escrituras registradas: sólo `POST /auth/login` y `POST /auth/refresh`.

| Medida (campaña activa «Invierno 2026 (DEMO)», 10 necesidades, 5 consumos) | 1366×768 | 390×844 |
|---|---|---|
| Alto total de la página | 2 242 px (2,9 pantallas) | 3 049 px (3,6 pantallas) |
| Texto en `main` | 3 783 caracteres | 3 783 |
| Encabezados (h1–h3) | 9 | 9 |
| Contenedores con borde que compiten | 6 | 6 |
| Botones y enlaces | 5 | 5 |
| Chips de estado («Publicado», «Oculto por privacidad») | 17 | 17 |
| Párrafos de más de 60 caracteres | 9 | 9 |
| Filas con barra visibles en la primera pantalla | 2 (de 7 publicadas) | 0 |

**Qué ocupa la primera pantalla (1366×768, `1366_resumen_activa_pantalla.png`):** título, un párrafo introductorio, el selector con dos chips, tres acciones del mismo peso visual, la línea «Cifra más reciente…», dos tarjetas grandes (cobertura y «Sin sellar» a 36 px como si fuera una cifra), la cabecera de la sección de necesidades con un párrafo de método y, al final, dos filas y media del gráfico. El contenido principal empieza a 600 px.

**Qué se repite:** el estado de la campaña aparece cuatro veces (selector, chip «Abierta», «Activa» en la barra superior y otra vez «Abierta» dentro de «Versión sellada»); «datos hasta 5 nov de 2026…» aparece en cada una de las 10 filas más la línea «Cifra más reciente»; «Publicado» en cada fila publicada (7 + 5 chips que no distinguen nada); el motivo completo «Menos de 3 agricultores aportaron: la cifra no se publica para no revelar aportes individuales» cuatro veces; «aportantes no revelados» cuatro veces.

**Qué compite:** seis superficies con borde del mismo rango (dos tarjetas, necesidades, consumo, sellado y el aviso), tres botones alineados sin jerarquía clara y nueve encabezados. «Consumo publicado» tiene el mismo tamaño y tratamiento que la necesidad, aunque es dato secundario; «Pendiente según los datos» (lo que requiere atención) está al final, a 2 018 px, como lista de viñetas.

**Textos que explican procesos en lugar de ayudar:** «Cada unidad tiene su propia escala (litros y kilogramos no se comparan ni se suman); ordenado por nombre del producto»; «Ausencia de aporte = desconocido, no cero. No es el total del sindicato» (permanente); «Consumo que los agricultores registraron y publicaron desde la app. Es un dato distinto de la necesidad declarada: no se resta ni se compara con ella»; «Sellado de la versión colectiva: todavía no se puede sellar · Sólo se sella una campaña cerrada. Cerrar y sellar son pasos distintos» (para una campaña abierta); «(cambios pendientes del servidor)» como fuente entre paréntesis.

**Qué puede pasar a detalle sin perder acceso:** la fecha y los aportantes de cada fila (a una tabla completa), el consumo publicado (plegado), las definiciones y advertencias metodológicas (plegadas, a un clic), el panel de sellado cuando no se puede sellar.

**Qué debe conservarse:** selector de campaña con `?campaign=`; «Actualizar», «Descargar Excel», «Revisar borrador»; «Ver cobertura»; el panel real de sellado con su confirmación cuando la campaña está cerrada y sin sellar; cobertura «n de m» con porcentaje sólo si hay denominador y «Cobertura al sellar» en una versión sellada; versión sellada (número, fecha, persona, «datos aceptados hasta», referencia); la cifra exacta, aportantes, «datos hasta» y la marca de cambios pendientes por fila; el motivo de cada fila sin cifra; el consumo publicado aparte; «Cifra más reciente» como máximo de `data_as_of`; los avisos sustentados por datos (sin campaña activa, cerrada sin sellar, cambios pendientes); los ocho estados (cargando, sin registros, sin coincidencias, error, sin permiso, restringido, insuficiente, desactualizado); `POLICY_PENDING` sin cifras ni cobertura; una sola lectura de `summary` por campaña y visita, sin sondeo.

**Diagnóstico:** la vista funciona y sus pruebas pasan, pero visualmente sigue siendo la misma distribución de antes (cabecera → dos tarjetas → secciones apiladas → lista al pie), con mucho texto permanente, demasiadas superficies del mismo rango y la información que requiere atención al final. Funcionar y leerse claro son criterios distintos.

Observación de comportamiento (no corregida aquí, fuera del alcance visual): al cambiar de una campaña sin sellar a otra, el Resumen real monta el panel de sellado de la campaña nueva con el resumen de la anterior todavía en pantalla, lo que produce un `GET …/seal` adicional antes del `GET …/summary` (se ve en `captura.log`: `seal` de `a484…` antes de su `summary`). El arnés del prototipo evita el caso montando el panel sólo cuando el resumen mostrado es el de la campaña seleccionada.

## 2. Skills consultadas

Repositorio `https://github.com/emilkowalski/skills`, commit `715c180` («Update README.md», 2026-11-09 13:07 +0100; `git fetch` del 2026-11-11 no trajo cambios). Leídas: `emil-design-eng/SKILL.md`, `apple-design/SKILL.md`, `prototype/SKILL.md` + `PICKER.md`, `break-ui/SKILL.md` + `CATALOG.md`, `pick-ui-library/SKILL.md`. No se usó Taste Skill ni otra colección.

| Skill | Cómo se aplicó |
|---|---|
| emil-design-eng | Jerarquía por tamaño y peso (cifras grandes sin tarjeta, etiquetas breves), un solo acento, nada de `transition: all`, sin animación en el cambio de orden ni en cifras y barras (se usan decenas de veces), respuesta al pulsar heredada de `.ui-press`, movimiento reducido respetado. |
| apple-design | Claridad y simplicidad sin minimalismo: el camino común primero y lo avanzado un nivel más abajo (plegables «Ver»); controles con etiqueta directa («Mayor a menor / Por nombre»); nada de transparencias ni desenfoques sobre cifras; tipografía con tracking y leading según tamaño (las cifras en `tabular-nums`). No se imita iOS. |
| prototype | Tres direcciones con eje nombrado (lectura de un vistazo / qué hacer ahora / necesidad frente a referencia), una a la vez a tamaño real dentro del armazón, selector literal de `PICKER.md` (copiado sin adaptar: teclas 1–4, ←/→, `?v=`), sin repetición porque ninguna variante anima su entrada. Fase 6 (promover) **no ejecutada**: espera la elección. |
| break-ui | Conjuntos de datos con valores plausibles o del límite del contrato (nombres de 70 caracteres, `123456789012`, `25`, cero publicado, tres estados restringidos, 29 productos, cobertura `0 de 0`, `1 de 1`, `51 de 1.284`), vacío, uno, error, sin permiso, sin campañas, carga; conmutador dev-only de datos; revisión a 320, 390, 1366, 1920 y zoom 200 %. Hallazgos en §6. |
| pick-ui-library | Primero lo instalado: Tailwind 4 + `components/ui` (PageHeader, CampaignSelector, Section, Collapsible, DataState, DataTable, SegmentedControl, StatusChip). Las barras son `div` con ancho en porcentaje (sin recharts: no hay series ni ejes que lo justifiquen); sin motion, clsx ni cva: ninguna capacidad imprescindible faltaba. **No se instaló ninguna dependencia.** |

## 3. Cómo abrir las variantes

- Vite ya está arrancado para la revisión: `http://127.0.0.1:5174/src/dev/resumen-prototipos.html` (página aparte de la aplicación, como `break-ui.html`; sólo existe con `import.meta.env.DEV` y `vite build` no la incluye). La aplicación real sigue en `http://127.0.0.1:5174/colectivo/resumen` sin cambios.
- Selector: píldora oscura abajo al centro (arriba en teléfono): **1 Actual · 2 Panorama · 3 Acción · 4 Comparación**; teclas `1`–`4` o `←`/`→`; `?v=` conserva la elección. «Actual» es `CollectiveSummaryPage` real con los mismos datos, para comparar antes/después sin cambiar de pestaña.
- Datos: la fila punteada de arriba o `?datos=demo|worst|muchos|sellada|cerrada|politica|vacia|una|estimacion-error|error|sinpermiso|sincampanas|cargando`. Todos sintéticos (`dev/fixtures/*` y `prototypes/resumen/datasets.ts`), con la forma exacta de los contratos; ninguna petición sale a un servidor (las pruebas lo comprueban espiando XHR y `fetch`) y toda escritura se rechaza.
- `?campaign=` funciona como en la vista real; el panel de sellado es el componente real (`SealPanel`) con su confirmación, leyendo el estado del fixture.

## 4. Las tres composiciones

| # | Variante | Eje | Cuándo es la elección correcta | Su coste |
|---|---|---|---|---|
| 2 | Panorama | Lectura de un vistazo | Se presenta la campaña (reunión, proyector) y lo primero es ver cuánto pesa cada producto dentro de su unidad: indicadores sobre el lienzo sin cajas, un solo gráfico ancho con litros y kilogramos lado a lado, casi nada de texto; atención en una franja de una línea; consumo, tabla con fechas y definiciones plegados. | Lo que hay que hacer (sellar, revisar) no tiene protagonismo: aparece como franja o al pie; con un solo producto por unidad el gráfico queda vacío de contexto. |
| 3 | Acción | Qué hacer ahora | La Directiva entra a trabajar: columna derecha fija con el siguiente paso (borrador, sellado o abrir campaña) con su botón, lo que requiere atención y el sellado cuando corresponde; indicadores compactos en caja y necesidades en lista densa. En el teléfono la columna de acción va primero. | Dos columnas estrechan el gráfico en escritorio; con pocos avisos la columna derecha queda corta y la cabecera pierde el botón primario (vive en la columna). |
| 4 | Comparación | Necesidad frente a referencia | La campaña objetivo ya tiene estimación del consumo y la decisión mira las dos cifras: por cada producto, la necesidad con su barra y, al lado, la estimación con su vigencia («Vigente», «Desactualizado», «Sin estimación», «Datos insuficientes», «Cifra retirada»); indicador propio de vigencia y aviso cuando está desactualizada. | Exige una lectura más (`GET /estimation/results`) por campaña y visita; sin estimación la vista se reduce a una lista densa; es la más alta y la que más texto conserva. |

Las tres muestran el mismo conjunto de datos y conservan las mismas capacidades (una prueba compara las cifras publicadas entre las tres y comprueba cada control); difieren en distribución, jerarquía y densidad, no en color. Reglas comunes, heredadas del Resumen vigente:

- L y KG nunca comparten lista ni escala; no hay totales por encima de cada producto ni suma entre unidades.
- Una fila sin cifra muestra su estado y su motivo, sin número, barra ni cero; «0 L» publicado se escribe y no lleva barra.
- Orden por defecto «Mayor a menor» **dentro de cada unidad**, filas sin cifra al final; «Por nombre» a un clic. No se llama prioridad: es una ordenación de lectura. (Comparación arranca «Por nombre» para alinear con la referencia.)
- Cobertura «n de m» con porcentaje sólo con denominador > 0; «Cobertura al sellar» en una versión sellada; sin umbrales de color.
- «Cifra más reciente: datos hasta …» es el máximo de `data_as_of` de las cifras publicadas (regla de presentación declarada; el resumen no tiene marca global, matriz R11). No se muestra la hora de la consulta.
- Los avisos sólo salen de datos del servidor (campaña activa `null`, `CERRADA` sin `seal`, `pending_changes`, y en Comparación `validity = OUTDATED` o fallo de la consulta); ninguno se deduce de cantidades ni recomienda compras.
- `POLICY_PENDING`: sin cifras, sin cobertura, sin indicador de necesidades; los estados error, sin permiso, sin campañas y cargando usan `DataState`.
- Sin animaciones en cifras, barras ni cambio de orden; `prefers-reduced-motion` respetado (nada se mueve salvo el resalte del selector del arnés, que ya lo respeta).

## 5. Qué queda visible y qué pasa a detalle

| Información | Antes (vista actual) | Panorama | Acción | Comparación |
|---|---|---|---|---|
| Campaña, estado, activa | selector + 3 chips + barra | selector + chips (igual) | igual | igual |
| Acciones | 3 botones del mismo rango | Actualizar (ligero), Excel (secundario), **Revisar borrador** (primario) | Actualizar y Excel en cabecera; el primario vive en «Siguiente paso» | como Panorama |
| Cobertura | tarjeta con 2 líneas de advertencia | indicador sin caja + nota breve + «Ver cobertura» | indicador en caja 2×2 | indicador en franja |
| Necesidades (conteo) | en la nota de sección | indicador «n de m productos con cifra» | ídem | ídem |
| Versión / sellado | «Sin sellar» a 36 px + panel al pie | indicador en texto; panel real al pie sólo si procede | indicador; panel en la columna de acción | indicador; panel al pie |
| Cifra más reciente | línea bajo las acciones | indicador | indicador | en la nota de la sección |
| Gráfico de necesidades | barras finas de 3 líneas por fila, chip por fila | **centro**: barras altas, cifra al lado, dos columnas (L / KG) | lista densa en una columna | fila con barra, cifra y estimación al lado |
| Aportantes y «datos hasta» por fila | permanente en cada fila | tabla completa (plegada) | tabla completa (plegada) | tabla completa (plegada) |
| Motivo de una fila sin cifra | permanente | permanente (chip + motivo) | permanente | permanente |
| Cambios pendientes | nota ámbar por fila + aviso | marca «cifra anterior» por fila + franja de atención | marca + aviso en columna | marca + aviso |
| Consumo publicado | sección completa | plegado (con conteo) | plegado | plegado |
| Pendiente según los datos | lista al pie | franja de una línea bajo los indicadores | **columna «Requiere atención» + «Siguiente paso»** | lista bajo la sección (incluye vigencia de la estimación) |
| Definiciones y método | repartidas en notas permanentes | «Qué significan estas cifras» (plegado) | ídem | ídem |
| Estimación del consumo | no se muestra | no se muestra | no se muestra | **columna por producto + indicador + aviso** |

Nada que condicione la lectura de una cifra queda oculto: los motivos de supresión, «Hay filas sin cifra…», «Fijada al sellar», «cifra anterior» y los estados de vigencia siguen a la vista; sólo las definiciones generales, las fechas por fila y el consumo pasan a un clic.

## 6. Comprobación visual (break-ui)

Revisado en Edge sin interfaz (puppeteer-core) sobre la página de desarrollo, con los 13 conjuntos de datos, a 1366×768, 1920×1080, 390×844, 320×568 y 683×384 (= 1366 con zoom del 200 %), con `prefers-reduced-motion: reduce`, con los plegables abiertos y con recorrido por teclado (Tab hasta 60 paradas, anotando si el foco es visible). Medidas automáticas por captura en `d_capturas_variantes/resultados.json`: desplazamiento horizontal de la página, elementos que sobresalen del ancho, número de `h1`, errores de consola, peticiones a `/api`.

**Resultado:** 88 capturas; en ninguna hay desplazamiento horizontal, errores de consola ni peticiones a la API; siempre un solo `h1`. Con el teclado, cada variante recorre 36–37 controles dentro de `main` (selector, botones, enlaces, segmentos de orden, plegables, región desplazable de la tabla) y todos muestran el foco (`outline` de 2 px); «Actual», 31.

| Caso (datos) | Qué se comprobó | Resultado en las tres variantes |
|---|---|---|
| Normales (`demo`) | Primera pantalla, jerarquía | Campaña, indicadores y parte del gráfico en la primera pantalla (Panorama 2 barras, Acción 1, Comparación 0 pero cabecera de la tabla); ver §7. |
| Ninguna campaña (`sincampanas`) | Estado vacío con acción | «No hay campañas» con «Ir a Campañas»; sin selector ni cifras. |
| Sin aportes (`vacia`) | Ausencia ≠ cero | «Sin necesidades publicadas» (sin «0»), cobertura «0 de 7», ningún «Cifra más reciente». |
| Nombres largos, decimales, cantidades grandes, unidades distintas (`worst`) | Partición y alineación | `123.456.789,012 L` y `0,025 KG` exactas; los nombres de 70 caracteres parten en 2–3 líneas sin desbordar; L y KG en listas separadas; el cero publicado «0 L» sin barra; «Fuera de rango», «Sin cifra publicada» y «Oculto por privacidad» con su motivo. |
| Muchos productos (`muchos`, 29 necesidades) | Lectura y alto | Panorama 1 908 px (frente a 4 314 px de la vista actual); 26 barras ordenadas por unidad; filas sin cifra al final. |
| Estimación ausente / desactualizada / en error (`sellada`, `worst`, `estimacion-error`) | Sólo Comparación | «Sin estimación para esta campaña» con enlace a Histórico; «Desactualizado», «Sustituido», «Datos insuficientes», «Cifra retirada» por fila; con error, aviso y «Reintentar», y el resto de la vista intacta. |
| Datos restringidos (`politica`) | `POLICY_PENDING` | Estado «Información restringida»; sin cifras, cobertura ni indicador de necesidades; versión y sellado bloqueado visibles. |
| Error de consulta / sin permiso (`error`, `sinpermiso`) | Estados | «Sin conexión…» con «Reintentar»; «Sin permiso» sin reintento; nada residual. |
| Cerrada sin sellar / sellada (`cerrada`, `sellada`) | Sellado real | Aviso «Campaña cerrada sin sellar» → `#sellado` con el panel real y su confirmación; en la sellada, «Versión 1 sellada» con fecha, persona y referencia, «Cobertura al sellar» y sin panel. |
| Zoom 200 % (683×384) | Reflujo | Una columna, sin desbordes; el selector de prototipos sube arriba. |
| Teléfono (390 y 320) | Una columna | Nombre, barra y cifra apilados; en Comparación la referencia lleva su rótulo «Estimación del consumo:»; Acción pone la columna de acción primero. |
| Movimiento reducido | Sin movimiento | Nada se anima en las variantes; el resalte del selector del arnés se desactiva. |

Hallazgos (ninguno «roto»):

| # | Gravedad | Dónde | Qué pasa | Propuesta |
|---|---|---|---|---|
| D1 | Feo | Panorama y Comparación, indicador «Cobertura» a 1366 | La nota («Hay filas sin cifra… Mide participación…») ocupa 3–4 líneas y desnivela la fila de indicadores. | Dejar en la nota sólo la advertencia condicional («Hay filas sin cifra…» / «Fijada al sellar») y mover «ausencia = desconocido» a «Qué significan estas cifras». Decisión de texto para el autor. |
| D2 | Feo | Acción, columna izquierda a 1366 | Los indicadores en 2×2 dejan espacio vacío a la derecha de cada uno. | Aceptable; alternativa: 4 en fila con cifras más pequeñas. |
| D3 | Frágil | Comparación, filas con referencia a 390 px | Cada fila ocupa 4–5 líneas; con 29 productos la página mide 5 081 px. | En teléfono, mostrar la referencia sólo al abrir la fila, o conservar la variante para escritorio. |
| D4 | Frágil | Las tres, orden «Mayor a menor» | Con muchas filas sin cifra al final, el motivo completo se repite en cada una. | Repetir sólo el chip y dar el motivo una vez por estado al pie del grupo. |
| D5 | Frágil | Selector de campaña, nombres de 158 caracteres | El `<select>` recorta el nombre (ya conocido: decisión B1 del bloque anterior). | Sin cambio en este bloque. |

Lo que aguantó: cifras extremas, cero publicado, tres estados restringidos, nombres largos, 29 productos, `0 de 0`, `1 de 1`, singulares («1 aportante», «1 producto»), política pendiente, error, sin permiso, sin campañas, carga, zoom 200 % y 320 px.

## 7. Capturas y medidas

Carpeta `d_capturas_variantes/` (113 archivos; mismos datos y mismo tamaño para cada comparación; el selector de prototipos aparece en las capturas porque es cromo fijo del arnés, no parte del diseño). Nombres: `<variante>_<tamaño>_<datos>_pantalla.png` (lo visible sin desplazarse) y `_completo.png` (página entera); `_abierto` con los plegables abiertos; `_teclado` tras el recorrido con Tab; `_reduced-motion`. `actual_*` es la vista vigente con los mismos datos.

Comparación con los mismos datos (`demo`) a 1366×768, medida sobre el DOM (texto visible = sin el contenido de los plegables cerrados ni el cromo del arnés):

| | Actual | Panorama | Acción | Comparación |
|---|---|---|---|---|
| Alto de la página | 1 363 px | 1 142 px | 1 144 px | 1 459 px |
| Texto visible permanente | 2 240 car. | 1 455 | 1 491 | 2 087 |
| Encabezados | 8 | 5 | 6 | 5 |
| Cifras de producto en la primera pantalla | 1 | 2 | 1 | 0 (cabecera de tabla visible) |
| Qué cabe en la primera pantalla | título, párrafo, 2 tarjetas, cabecera de sección y 1 fila | título, 4 indicadores, gráfico con 2 barras (L y KG) | título, 4 indicadores, 1 barra, siguiente paso y sellado | título, 4 indicadores, tabla comparativa (cabecera) |

Peor caso (`worst`, 8 necesidades) y muchos productos (`muchos`, 29):

| | Actual | Panorama | Acción | Comparación |
|---|---|---|---|---|
| Alto, `worst` | 1 987 px | 1 391 | 1 476 | 1 903 |
| Alto, `muchos` | 4 314 px | 1 908 | 2 108 | 2 802 |
| Texto visible, `muchos` | 6 273 car. | 2 869 | 2 904 | 5 185 |

Teléfono 390×844 (`demo` / `worst`): Actual 2 047 / 2 974 px; Panorama 1 946 / 2 532; Acción 2 032 / 2 638; Comparación 2 262 / 3 032.

Antes/después con datos del servidor: `d_capturas_antes/1366_resumen_activa_pantalla.png` frente a `d_capturas_variantes/panorama_1366x768_demo_pantalla.png` (y las otras dos variantes). La campaña y las cifras difieren (servidor frente a fixture); la comparación con datos idénticos es la variante «Actual» del propio arnés.

Todo se observó en emulación de escritorio (Edge) con viewports de teléfono; **nada se declara probado en un teléfono.**

**Validación del código del prototipo (`_wt/WEBR-INT/Web`):** `npx tsc -p tsconfig.app.json --noEmit` OK; `npm run lint` 0 errores (7 avisos `react-refresh/only-export-components`: 2 preexistentes y 5 en archivos del prototipo, que son sólo de desarrollo); `npm run build` OK y `dist/` no contiene la página ni el selector; pruebas del arnés `harness.test.tsx` 21/21 (reglas de datos en las tres variantes, controles conservados, estados, sellado, orden, referencia de estimación, selector). Suite completa: ver el cierre de este documento.

## 8. Recomendación (no es una elección)

Recomiendo **Panorama** para el Resumen de la Directiva, por estas razones:

1. Cumple el objetivo de los 15 segundos con la primera pantalla: campaña, participación, cuántos productos tienen cifra, versión y, debajo, el gráfico con las dos unidades lado a lado. Es la que más barras muestra sin desplazarse a 1366×768 y la de menos texto permanente.
2. Es la que más se aleja de la distribución anterior (sin tarjetas apiladas, sin secciones equivalentes, atención en una franja), que era la queja principal.
3. No exige lecturas nuevas al servidor ni cambia el control de peticiones: integra con una sola `GET …/summary` por campaña y visita, como hoy.
4. Lo que se pierde respecto a «Acción» (el siguiente paso con botón grande) se recupera con poco: la franja de atención ya enlaza al sellado y «Revisar borrador» sigue siendo el primario de la cabecera.

**Acción** es la mejor opción si la Directiva usa el Resumen sobre todo para operar (sellar, revisar borradores, abrir campañas) más que para leer cifras; su coste es un gráfico más estrecho en escritorio. **Comparación** sólo tiene sentido si la estimación del consumo se ejecuta de forma habitual para la campaña activa: hoy, con la copia «rica», mostraría «Sin estimación» y añadiría una petición por visita; su columna de referencia podría incorporarse más adelante como detalle plegado de cualquiera de las otras dos.

Si el autor prefiere una mezcla (por ejemplo, Panorama con la columna de «Siguiente paso» de Acción en escritorio), es una cuarta composición: se puede construir en otra ronda antes de integrar.

## 9. Lo que no se pudo mostrar por falta de datos existentes

- **Compras conjuntas, actividad reciente y tendencias**: no hay endpoint de compras conjuntas ni de actividad; las tendencias existen sólo entre versiones selladas (`GET /collective/trends`) y viven en Histórico. No se añadió ningún bloque ni tarjeta «próximamente».
- **Borradores de propuesta en el Resumen**: `GET …/proposals` existe pero el Resumen no lo pide; mostrar «último borrador del 9 nov» exigiría una lectura más. No se incluyó; «Revisar borrador» enlaza a la vista que sí lo lee.
- **Fecha de actualización global del resumen**: no existe (matriz R11); se muestra sólo el máximo de `data_as_of` con su rótulo literal.
- **Registros locales sin publicar y sincronización por agricultor**: no disponibles (matriz V7/V9); ningún indicador los representa.
- **Estimación en Comparación**: `GET /estimation/results` es una lectura existente, sin efectos (no encola trabajos: el cálculo se pide sólo en Histórico). En la copia «rica» no hay ejecuciones para la campaña activa, así que con datos del servidor la columna mostraría «Sin estimación para esta campaña»; la referencia sólo se ve con los fixtures.
- **Conteo de aportantes de filas ocultas y totales del sindicato**: prohibidos (F10-SEC-02, F07-POL-01 R14).

## 10. Cierre de la primera entrega

- Suite completa de la Web sobre esta composición: `npx vitest run --no-file-parallelism` → **49 archivos, 432 pruebas, 432 pasan** (411 anteriores + 21 del arnés). En este worktree, vitest 5 con el paralelismo por defecto falla entera («Vitest failed to find the current suite») incluso sin los archivos nuevos, mientras que en `_wt/WEBR-B` corre en paralelo sin problema: es un defecto del entorno de este worktree, no de las pruebas; se anota como limitación y se usa un solo proceso.
- Ninguna escritura al servidor ni efecto al abrir la vista; sin dependencias nuevas; `Back/`, Flutter, voz, autenticación y la DEMO oficial sin cambios.
- Siguiente paso: **la elección del autor**. Después: integrar sólo la variante elegida en `pages/collective-summary.page.tsx` (componentes propios del Resumen), retirar la página de prototipos, contrastar cifras con la API de la copia «rica», pruebas, lint, tipos y build, y entregar evidencia visual y funcional por separado.

## 11. Segunda entrega (2026-11-11, tarde): la propuesta de tablero ejecutivo y la variante D «Ejecutivo»

Tras la primera entrega, el autor envió una propuesta de «dashboard ejecutivo» con siete bloques (estado operativo, centro de alertas, productos prioritarios, comparación con la referencia histórica, compras conjuntas, resumen de tendencias, actividad reciente), una lista de lo que debe salir del tablero y una estructura nueva del menú. Antes de dibujar nada se contrastó cada bloque con lo que la API sirve hoy a la Directiva (matriz `docs/web-rediseno/02_MATRIZ_DATOS_WEB.md`, controladores del Back y reglas §4 y §7 del encargo). El resultado es una cuarta composición, **D «Ejecutivo»**, que materializa la propuesta con datos reales y deja fuera, con su razón, lo que no tiene dato, permiso o regla.

### 11.1 Contraste de la propuesta con los datos y permisos existentes

| Bloque propuesto | Qué existe hoy | En la variante D | Por qué |
|---|---|---|---|
| Campaña activa | `GET /campaigns/active` + `summary.campaign` (R1, R2) | Tarjeta «Campaña consultada» con su estado y si es la activa | Dato disponible. |
| Cobertura y participantes (61 %, 45/74) | `summary.coverage` (`members_with_contribution` de `linked_members`, porcentaje sólo con denominador > 0) | Una sola tarjeta «Cobertura»: «6 de 9 (67 %)» + aviso de filas sin cifra | Son el mismo dato; el encargo pide combinarlos (§4). |
| Productos reportados | Celdas `DECLARED_NEED` del resumen (R5, R8) | Tarjeta «Necesidades declaradas»: publicadas de total, ocultas por privacidad, sin cifra | Dato disponible; ningún conteo de aportantes de filas ocultas. |
| Compras conjuntas activas (tarjeta y sección) | `GET /purchases` y `GET /purchases/:id` son **sólo AGRICULTOR** (`purchases.controller.ts:29-45`, F10-SEC-02 #45, ADR-003); la Directiva sólo tiene `POST /purchases/joint`, cerrado; no existen «participantes» ni «fecha de cierre» | **No se muestra** | Sin lectura para la Directiva. Añadirla es un cambio en `Back/` (fuera de este bloque, §8) y una decisión de política (los datos de compra son privados). |
| Centro de alertas 🟢🟡🔴 | Estados reales: sin campaña activa; campaña cerrada sin sellar; cambios recibidos sin publicar; estimación desactualizada; fallo de una lectura; sin necesidades publicadas | «Requiere atención»: avisos con color y texto (amarillo = atención, rojo = error, gris = información), fuente del dato y acción existente | Sólo hechos del servidor (§4). «Cobertura suficiente para consolidar» exigiría un umbral que no existe (§7); «compra conjunta cierra en 4 días» no tiene dato; «denominaciones pendientes de reconciliación» no es un estado del servidor (K9: los candidatos se derivan en el cliente y CU-18 no admite sugerencias automáticas). |
| Productos prioritarios / ranking de demanda | Celdas publicadas, ordenables por cantidad **dentro de cada unidad** | «Mayor necesidad declarada»: las cinco primeras por unidad, el resto a un clic («Ver 12 productos más en litros (2 sin cifra)»); orden «Mayor a menor» / «Por nombre» | Litros y kilogramos no entran en un ranking único ni el orden se llama prioridad de compra (§4). |
| Comparación con la referencia histórica | `GET /estimation/results?target_campaign_ref=` (F12-EST-08: referencia, nunca se suma) | Tabla «Necesidad declarada y estimación del consumo»: dos columnas distintas, vigencia y fecha de cada estimación, ausencias con su motivo («Sin estimación», «Datos insuficientes», «Cifra retirada») | Dato disponible. **Sin observaciones automáticas** («125 % superior»): sería un cálculo y un porcentaje nuevos (§4, §7) y una lectura de la estimación como meta, que RN-29/F12 prohíben. Si el autor las quiere, hay que decidir la regla y escribirla en el contrato antes. |
| Resumen de tendencias (🟢 estable, 🟡 +18 %) | `GET /collective/trends` existe (series por producto entre versiones selladas) y tiene su vista en Histórico | Sólo el enlace «Tendencias» en «Dónde seguir» | Un hallazgo con porcentaje o la palabra «estable» es un cálculo y un umbral nuevos (§7). La serie completa ya se ve en `/colectivo/tendencias`. |
| Actividad reciente | `GET /audit-logs?campaignId=` (C14): la Directiva ve las entradas sin `ownerUserId`; el Back escribe crear, actualizar, abrir y cerrar campaña y el sellado (`campaign-management.use-case.ts`, `collective-seal.use-case.ts`) | «Actividad reciente»: las 5 entradas más recientes de la campaña (acción, resumen del servidor, fecha, responsable) y «Ver bitácora» | Dato disponible. **No** registra la generación de borradores ni las equivalencias (K6: el catálogo no escribe bitácora): «Borrador consolidado generado» y «Asociación de denominaciones confirmada» del ejemplo no pueden aparecer hoy. Es una lectura más por visita. |
| Sacar del tablero: metodología, historial técnico, sellados y auditorías, tendencias, reconciliación | — | Definiciones, tabla completa y consumo plegados; sellado al final (sigue siendo la única forma de sellar desde el Resumen); nada de reconciliación ni tendencias | Coincide con §4–§5 del encargo. |
| Estructura final del menú | Menú vigente: Resumen, Campañas, Necesidades y propuestas, Histórico y estimaciones (con Tendencias y Estimación dentro), Catálogo y equivalencias; Administración: Bitácora, Usuarios | **Sin cambios** | El encargo limita este bloque al Resumen (§8). Además «Compras conjuntas» no tendría lista que abrir y «Tendencias» ya vive bajo Histórico. Queda como decisión aparte. |

### 11.2 Composición de la variante D «Ejecutivo»

- **Cabecera** igual a las otras: título, selector de campaña, Actualizar, Excel, «Revisar borrador».
- **Cuatro tarjetas** (`KpiTile` de `components/ui`): Campaña consultada · Cobertura · Necesidades declaradas · Versión (en ámbar sólo cuando la campaña está cerrada sin sellar, con el texto que lo dice).
- **Dos columnas en escritorio** (`minmax(0,1fr) 22rem`): a la izquierda «Mayor necesidad declarada» (barras compactas, cinco por unidad) y debajo la tabla necesidad/estimación con el pie de vigencia; a la derecha «Requiere atención» (o una línea «Ningún estado requiere atención…» cuando no hay hechos), «Actividad reciente» y «Dónde seguir» (Necesidades y propuestas, Ver cobertura, Histórico y estimaciones, Tendencias, Campañas: todas rutas existentes). En teléfono: una columna, con la atención antes de las barras.
- **Plegado**: Consumo publicado, Tabla completa (cifras, aportantes y fechas), Qué significan estas cifras; después el panel real de sellado (`#sellado`).
- **Lecturas por visita**: `GET …/summary` + `GET /estimation/results` + `GET /audit-logs?campaignId=` (una vez por campaña; «Actualizar» las repite). Las dos extra no tienen efectos ni encolan trabajos. Ninguna escritura.
- Código: `Web/src/dev/prototypes/resumen/ejecutivo.tsx` (nuevo), `parts.tsx` (`AttentionNotices`, `ActivityList`, `EstimationFooter` compartido), `model.ts` (`executiveAttention`, `recentActivity`, `activityLabel`), `datasets.ts` (bitácora sintética por conjunto; el conjunto «Lecturas extra en error» hace fallar estimación y bitácora a la vez), `stubs.ts` (`auditLogsService.list` sustituido), `harness.tsx` (variante 5 con `activity: true`).

### 11.3 Comprobación visual (break-ui) de la variante D

30 capturas en `d_capturas_ejecutivo/` (`resultados.json` con las medidas): demo a 1366, 1920, 390, 320 y zoom 200 %, movimiento reducido, plegables abiertos, recorrido por teclado, y los 12 conjuntos restantes a 1366 más «Peor caso» y «Muchos productos» a 390. Resultado: **0 desbordamientos horizontales de la página, 0 errores de consola, 0 peticiones a `/api`, un solo `h1`**. A 390 px los únicos elementos más anchos que la ventana son las celdas de la tabla necesidad/estimación y de la tabla completa, dentro de su propio contenedor con desplazamiento (`ui-table-scroll`), como en las otras variantes.

| Medida (prototipo con la franja de datos sintéticos incluida) | Actual | Panorama | Acción | Comparación | **Ejecutivo** |
|---|---|---|---|---|---|
| Demo, 1366×768: alto de página | 1 363 px | 1 142 px | 1 144 px | 1 459 px | **1 633 px** |
| Demo, 1366×768: caracteres visibles | 2 240 | 1 455 | 1 491 | 2 087 | **4 584** |
| Muchos productos, 1366×768: alto | 4 314 px | 1 908 px | 2 108 px | 2 802 px | **3 198 px** |
| Peor caso, 390×844: alto | — | — | — | 5 081 px | **4 787 px** |

Lectura: es la variante más densa, por diseño (la propuesta pide más bloques permanentes: atención, actividad, referencia). Las barras entran en la primera pantalla a 1366 sólo sin la franja del prototipo; a 1920 entran dos. Con 29 productos, la tabla necesidad/estimación lista los 26 publicados completos (3 198 px frente a 1 908 px de Panorama); plegarla por defecto bajaría la altura pero escondería la referencia que la propuesta quiere visible: decisión del autor.

Ajustes hechos tras la primera captura: barras en una sola columna dentro de la columna izquierda (a dos columnas el motivo de las filas ocultas se apretaba en 8 líneas), nota de cobertura acortada (la tarjeta medía 210 px), columna «Producto» de la tabla con ancho mínimo en teléfono (partía «Glifosato» en dos líneas).

Hallazgos abiertos de esta variante (ninguno rompe):

| # | Tipo | Dónde | Qué pasa | Qué haría |
|---|---|---|---|---|
| D6 | Feo | Tarjeta «Campaña consultada», nombre de 158 caracteres | La tarjeta crece a 7 líneas y estira la fila de tarjetas. | Recortar a 3 líneas con el nombre completo en `title`, o mostrar sólo el estado y dejar el nombre al selector. |
| D7 | Feo | «Actividad reciente» con nombres largos de campaña | Cada entrada repite el nombre completo de la campaña (viene en `summary` del servidor) y ocupa 6 líneas. | Omitir el nombre cuando coincide con la campaña consultada (el servidor no separa acción y nombre: habría que recortar el texto literal). |
| D8 | Frágil | Tabla necesidad/estimación a 390 px | Desplazamiento horizontal dentro de la tabla; en Comparación la misma información va en filas apiladas. | Si se elige D, apilar las columnas en teléfono como en Comparación. |

### 11.4 Pruebas

- `harness.test.tsx`: 30 pruebas (21 anteriores extendidas a la variante 5 + 9 nuevas de D): mismas cifras publicadas que las otras variantes; tarjetas; referencia sin diferencias ni porcentajes; bitácora de **esa** campaña, más reciente primero, cinco de siete, sin correos; corte a cinco por unidad y «Ver N productos más»; vacía (aviso «Sin necesidades publicadas todavía» con enlace); lecturas extra en error (dos avisos y el resto de la vista intacta); sellada (entrada «Otro · Consolidado colectivo sellado (versión 1)»); sin «Próximamente» ni «Compras conjuntas»; ninguna petición.
- Suite completa de la Web: ver el cierre de abajo (§11.6).

### 11.5 Lo que la propuesta pide y hoy no se puede mostrar (decisiones del autor, fuera de este bloque)

1. **Compras conjuntas** para la Directiva: haría falta un endpoint de lectura nuevo en `Back/` y una decisión de política sobre qué partes de una compra conjunta son colectivas (hoy toda compra es privada por F10-SEC-02).
2. **Observaciones automáticas** («125 % superior a la referencia») y **hallazgos de tendencias** («incremento del 18 %», «tendencia estable»): cálculos y umbrales nuevos; exigen regla escrita (qué se compara, con qué vigencia, qué cuenta como «estable») y revisión frente a RN-29 antes de programarlos.
3. **Denominaciones pendientes de reconciliación**: el servidor no tiene ese estado; mostrarlo obligaría a inventar la regla en el cliente.
4. **«Cobertura suficiente para consolidar»**: no hay umbral de cobertura definido en ningún contrato.
5. **Actividad de borradores y equivalencias**: el Back no las escribe en la bitácora (P3, K6).
6. **Menú**: cambio aparte del Resumen; «Compras conjuntas» no tendría destino.

### 11.6 Cierre de la segunda entrega

- Cómo abrir: `http://127.0.0.1:5174/src/dev/resumen-prototipos.html?v=5&datos=demo` (tecla `5`; las otras variantes siguen en `1`–`4`).
- Suite completa de la Web sobre esta composición: `npx vitest run --no-file-parallelism` → **49 archivos, 441 pruebas, 441 pasan** (432 anteriores + 9 nuevas; las 21 del arnés ahora cubren la variante 5). `tsc` sin errores; `eslint` 0 errores (las 5 advertencias `react-refresh` de antes); `vite build` correcto y la página de prototipos sigue fuera de `dist/`.
- Ninguna escritura al servidor ni efecto al abrir la vista; sin dependencias nuevas; `Back/`, Flutter, voz, autenticación, la DEMO oficial y el menú sin cambios.
- Recomendación (sigue sin ser una elección): si el autor quiere el tablero de su propuesta, **D «Ejecutivo»** es lo más cercano que los datos permiten hoy, a cambio de ser la vista más densa y de dos lecturas más por visita; si pesa la lectura en 15 segundos, **Panorama** sigue siendo la más breve. Lo que falta de la propuesta (compras conjuntas, porcentajes automáticos, tendencias con hallazgos, denominaciones pendientes, menú) son decisiones aparte, listadas en §11.5.
