# Web de la Directiva: panel institucional para la defensa (2026-11-05)

**Rama local:** `feat/web-defensa-panel` (worktree `_wt/WEB-PANEL`). No publicada ni fusionada: la publicación y la fusión quedan reservadas al autor.
**SHA base:** `0c2d27fa59bfdfca73b13313ca0649436c90348c` (HEAD de `feat/web-defensa-jerarquia`, PR #205 en borrador, que a su vez parte de `feat/web-defensa-simplificacion` #203 `1a0becb` y de `origin/main` `5973b49`). `main` local: `383be48`.
**SHA final del código:** **`b45d0c367d0dd913904c81485d07a8145c424737`** (`feat(web): panel institucional de la Directiva para la defensa`).
**Alcance:** sólo presentación e interacción en `Web/` (React) y sus pruebas. Sin cambios de API, permisos, cálculos, formatos CSV ni reglas de divulgación; el móvil, la DEMO oficial y el PR #172 no se tocaron. Datos sintéticos en todas las comprobaciones.

## 1. Vistas y archivos modificados

| Archivo | Cambio |
|---|---|
| `Web/src/components/app-shell.tsx` | Menú lateral compacto (240 px) y agrupado: Resumen colectivo · Propuesta conjunta · Tendencias · Estimación del consumo · Cobertura; «Gestión»: Campañas · Equivalencias de productos · Usuarios (sólo Administrador). Rutas y permisos (`menuPathsFor`) sin cambios. Nombre del sindicato bajo el logo en varias líneas (antes se truncaba). Cabecera con etiqueta «Datos sintéticos» cuando el servidor declara `PROVISIONAL_SYNTHETIC`, campaña activa y estado de conexión. |
| `Web/src/lib/data-mode.ts` (nuevo) | Modo de divulgación comunicado por las vistas al recibir cada respuesta; el armazón lo muestra sin deducirlo en el navegador. |
| `Web/src/components/collective-ui.tsx` | Estados «Oculto por privacidad» / «Sin cifra publicada»; barra de campaña con «Activa» o «Consultando una campaña distinta de la activa»; selector de campaña simplificado (nombre · estado); tarjeta compacta de cobertura con «Ver cobertura»; `SegmentedControl` (opciones visibles, `aria-pressed`); `SectionHeader` con `badge`; cifras más grandes. |
| `Web/src/components/export-buttons.tsx` | Exportaciones siempre con peso secundario; «Descargar Excel» sólo aparece cuando `excelExport.download` está integrado (sigue el enganche de #205/#206). |
| `Web/src/pages/collective-summary.page.tsx` | Resumen colectivo: cobertura compacta, «Necesidad declarada» primero (producto, cantidad con unidad, aportantes, barra sólo con cifra publicada), «Consumo publicado» aparte con estado vacío breve; conteo «n con cifra publicada · n ocultos por privacidad · n sin cifra publicada». Única acción primaria: «Revisar borrador». |
| `Web/src/pages/joint-proposal.page.tsx` | Propuesta conjunta: el último borrador se carga por consulta al elegir la campaña (nunca se genera al entrar, refrescar ni cambiar); «Generar borrador» primario y «Exportar CSV» secundario; «Borrador · campaña», fecha y líneas; columnas «Necesidad declarada» y «Referencia de consumo» separadas; historial, huella y trazabilidad plegados. Las respuestas tardías se descartan por contexto (identidad, campaña, borrador). |
| `Web/src/pages/collective-trends.page.tsx` | Tendencias: gráfico antes de la tabla; dos opciones visibles (abre con «Consumo publicado»); selector de producto; unidad, campañas (en dos líneas) y valores visibles; sólo cifras publicadas, huecos sin cero; «Ver campañas y cobertura» plegado; estado vacío que dice el filtro aplicado. |
| `Web/src/pages/estimation.page.tsx` | Estimación: selector y «Generar estimación» arriba; filtros y estado del trabajo compactos; tabla con cifra grande, «Línea base: último consumo publicado» (el `naive_base` de la API, con la campaña de la serie), vigencia y «Ver detalle» (serie observada, método α, cobertura, ejecución). «Datos insuficientes» ocupa el lugar de la cifra con su motivo; «De una ejecución anterior» junto a la vigencia. CSV de la consulta y copia sin conexión siguen separados. |
| `Web/src/pages/coverage.page.tsx` | «Cobertura»: tarjetas sin repetir la campaña; seguimiento de sincronización plegado (sitio para la consulta de #207, sin datos inventados). |
| `Web/src/pages/campaigns.page.tsx` | Campañas (Gestión): la activa destacada arriba, «Historial de campañas» debajo con filtros compactos; sin tarjetas de conteo. |
| `Web/src/pages/product-reconciliation.page.tsx` | «Equivalencias de productos» (Gestión): pendientes de asociar primero, equivalencias vigentes, historial plegado. |
| Pruebas | `components/app-shell.test.tsx` (nuevo: menú agrupado, rutas, nombre sin truncar, etiqueta «Datos sintéticos»); `collective-summary.page.test.tsx` (nuevo caso: «Oculto por privacidad» / «Sin cifra publicada» / cero divulgado, tarjeta de cobertura y acción primaria); `joint-proposal.page.test.tsx` (nuevo caso: apertura automática del último borrador sin generar y respeto de un borrador histórico); `collective-trends.page.test.tsx` (opciones visibles, orden gráfico → tabla); textos renombrados («Generar borrador», «Consumo publicado», «Referencia de consumo», «Datos insuficientes» en la celda de la cifra). |

## 2. Lint, pruebas y build (`Web/`, SHA `b45d0c3`)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `npx vitest run` | 18 archivos, **177 pruebas, 177 pasan** | 2026-11-05 18:04:39Z |
| `npx eslint .` | **0 errores**, 2 avisos preexistentes en main (`react-refresh/only-export-components` en los contextos) | 18:05Z |
| `npm run build` (`tsc -b && vite build`) | OK (378 ms); PWA 26 entradas (748 KiB) | 18:05Z |

## 3. Recorrido en el navegador (Edge sin interfaz, datos sintéticos)

Entorno: copia aislada de la DEMO del PR #201 (volumen `agro_webdef_pgdata`, PostgreSQL 55510, API `Back/dist` en 3340 con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`), Web de esta rama en **http://127.0.0.1:5198** (`VITE_API_PROXY_TARGET=http://127.0.0.1:3340`). Sesión de la Directiva sintética; la contraseña de un solo uso llega por `password-pipe` y no se imprime. Guion: `recorrido-panel.mjs` (variables de entorno documentadas en su cabecera); registro: `recorrido-panel.log`. Ejecución: 2026-11-05 18:05:39Z → 18:06:30Z, **36 comprobaciones, 0 fallos**.

**1366 × 768, zoom 100 %** (sin desplazamiento inicial se ven título, filtro o acción principal y el comienzo del resultado):

| Vista | Captura | Comienzo del resultado | Comprobado |
|---|---|---|---|
| Resumen colectivo | `1-resumen-1366x768.png` (+ `-completa`) | primera fila de necesidad a 374 px | única acción primaria «Revisar borrador»; «Datos sintéticos» en la cabecera; nombre del sindicato completo; menú en el orden pedido; Herbicida DEMO **250 L · 5 aportantes** y Fungicida DEMO **53 L · 3** publicados; Insecticida DEMO «Oculto por privacidad» sin cantidad ni cero; cobertura «6 de 6 agricultores vinculados con cifras publicadas» con «Ver cobertura» |
| Propuesta conjunta (desde «Revisar borrador») | `2-propuesta-1366x768.png`, `2b-propuesta-historial-1366x768.png` | primera línea a 460 px | el último borrador se abrió por consulta (**ningún POST** a `/proposals`); «Borrador · Invierno 2026 (DEMO)» con fecha; «Generar borrador» única primaria; columna «Referencia de consumo» separada (111 L vigente para Herbicida; «Datos insuficientes» para los otros); «Exportar CSV» pidió el CSV al servidor (**200**) |
| Tendencias | `3-tendencias-1366x768.png`, `3b-tendencias-necesidad-1366x768.png` | gráfico de 310 a 596 px, completo sin desplazarse | abre con «Consumo publicado»; gráfico antes de «Ver campañas y cobertura» (plegado); Fungicida 30 L · 36 L en 2017/2018 y «sin cifra» en 2015/2016 (huecos, no ceros); la 2026 sin sellar no se dibuja; con «Necesidad declarada» el estado vacío dice el filtro aplicado |
| Estimación del consumo | `4-estimacion-1366x768.png`, `4b-estimacion-detalle-1366x768.png` | primer resultado a 453 px | «Generar estimación» arriba; Herbicida **111 L** estimados frente a la línea base **116 L** (consumo publicado en Invierno 2018), ambos de la API; Fungicida e Insecticida «Datos insuficientes» con motivo y sin cifra |
| Cobertura · Campañas · Equivalencias | `5-cobertura…`, `6-campanas…`, `7-equivalencias-1366x768.png` | 225 · 310 · 212 px | campaña activa destacada y historial debajo; pendientes de asociar primero |

**1920 × 1080:** `1-resumen-1920x1080.png`, `2-propuesta-1920x1080.png`, `3-tendencias-1920x1080.png`, `4-estimacion-1920x1080.png`: resultado visible y sin desbordamiento horizontal.
**Ancho reducido (390 × 844):** `1-resumen-390.png`, `2-propuesta-390.png`, `4-estimacion-390.png`: sin desplazamiento horizontal de la página; menú lateral oculto y barra inferior con las cuatro vistas principales; título de la cabecera completo.

Revisión visual de las capturas: sin truncamientos (el nombre del sindicato y las campañas del gráfico se parten en líneas), cifras grandes y oscuras sobre superficies claras, una sola acción verde por pantalla.

## 4. Cambios de campaña, respuestas tardías, estados vacíos, errores y política pendiente

Cubiertos por las pruebas unitarias con respuestas simuladas del servidor (todas en verde): cambio de campaña e identidad con descarte de respuestas tardías (`joint-proposal.reference.test.tsx`), apertura automática del último borrador y respeto de un borrador histórico (`joint-proposal.page.test.tsx`), estados vacíos («Eso no significa cero», «Sin series selladas» con el filtro aplicado, «Sin ejecuciones»), errores 403 y sin conexión sin datos residuales (resumen, tendencias, estimación), `POLICY_PENDING` sin cifras ni cobertura y con el aviso conservado (resumen, propuesta, tendencias, estimación). Las cifras, conteos y permisos mostrados son siempre los de la respuesta de la API: la Web no suma, no deduce y no fija valores (el 111 L / 116 L del herbicida proviene de la ejecución de la copia sintética).

## 5. Conceptos que se mantienen separados

Necesidad declarada (resumen y propuesta), consumo publicado (resumen y tendencias), propuesta de compra conjunta (borrador, nunca una compra) y estimación del consumo (referencia aparte, con su línea base). Ninguna ausencia o cifra oculta se muestra como cero; «Oculto por privacidad» y «Sin cifra publicada» conservan su motivo sin exponer ni inferir cantidades ni aportantes suprimidos.

## 6. Pendiente y limitaciones

- **Sin publicar:** la rama es local; no se creó PR ni se fusionó (reservado al autor). Para llevarla a un PR, partir de `feat/web-defensa-jerarquia` (#205) o integrarla en la rama de revisión prevista allí.
- «Descargar Excel» no aparece hasta integrar el módulo de #206 (`excelExport.download`); «Cobertura» deja plegado el seguimiento de sincronización hasta integrar la consulta de #207.
- Verificado en Edge de escritorio sin interfaz (1366×768, 1920×1080, 390×844) con datos sintéticos; no en otros navegadores ni en un teléfono real.
- La pantalla «Cobertura» sigue en el menú principal (quinta) porque su ruta y permiso se conservan; el guion sólo exige que «Ver cobertura» enlace a ella.

---

## 7. Exportación a Excel con la identidad de Agrocuentas (2026-11-05, tarde)

**Commits locales posteriores (misma rama `feat/web-defensa-panel`, sin publicar):** `d336837` (Estimación sin textos explicativos), `885c0a9` (fusión de `feat/web-compra-conjunta-xlsx`, PR #206, sin conflictos) y **`837eb57`** (libros Excel para las cuatro vistas). El CSV no cambia: es texto plano y el formato del servidor se conserva; la presentación cuidada va en el `.xlsx`, que se arma en el navegador con las mismas respuestas de la API que muestra la pantalla.

### 7.1 Qué entrega «Descargar Excel»

| Vista | Archivo | Hojas |
|---|---|---|
| Resumen colectivo | `resumen-<campaña>.xlsx` | **Resumen** (portada: campaña, versión, cobertura, conteos, umbral) · **Necesidad declarada** · **Consumo publicado** |
| Propuesta conjunta | `propuesta-<ref>.xlsx` | **Borrador** (portada) · **Necesidades** · **Referencia de consumo** (si se cargó la referencia del mismo borrador) |
| Tendencias | `tendencias-<dato>.xlsx` | **Tendencias** (portada con campañas, versión y cobertura) · **Por campaña** (matriz producto × campaña sellada) · **Detalle** |
| Estimación del consumo | `estimacion-<campaña>.xlsx` | **Estimación** (portada) · **Resultados** (estimación, línea base, vigencia, α, ejecución) · **Serie observada** |

Diseño común (`Web/src/lib/xlsx-writer.ts`, `xlsx-common.ts`): banda superior verde oscuro `#0F1D15` «AGROCUENTAS · PANEL DE LA DIRECTIVA», título en esmeralda `#047857` de 18 pt, subtítulo, ficha de datos con etiquetas, leyenda «Cómo leer este libro»; hojas de datos con encabezados blancos sobre esmeralda, filtro automático, fila inmovilizada, estados «Publicado»/«Vigente» en verde y «Oculto por privacidad»/«Sin cifra publicada»/«Datos insuficientes» en ámbar, cifras en negrita, fechas en hora de Bolivia (UTC−4), pestañas de color, cuadrícula oculta en las portadas e impresión apaisada ajustada al ancho. Sin dependencias nuevas ni fórmulas.

Reglas (iguales a la pantalla): sólo se escribe una cifra publicada y válida; una celda vacía nunca es cero y la columna «Explicación» dice por qué; nada se suma, promedia ni recalcula; necesidad declarada, consumo publicado, borrador y estimación van en hojas distintas. En `POLICY_PENDING` el libro sale sin cifras y lo explica.

### 7.2 Comprobaciones (`Web/`, commit `837eb57`)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `npx vitest run` | 22 archivos, **215 pruebas, 215 pasan** (nuevas: `collective-xlsx.test.ts`, `exports.test.ts`; adaptadas: `joint-purchase-xlsx.test.ts`) | 2026-11-05 18:44Z |
| `npx eslint .` | 0 errores, 2 avisos preexistentes | 18:44Z |
| `npx tsc -b` · `npm run build` | OK | 18:45Z |

### 7.3 Descarga real y apertura en Microsoft Excel

`descargar-excel.mjs` inicia sesión como Directiva en la copia sintética (Web 5198 → API 3340), navega por la SPA y pulsa «Descargar Excel» en Resumen, Propuesta, Tendencias y Estimación; `excel-pdf.ps1` abre cada libro con Excel 16.0 (COM, sólo lectura), cuenta hojas y celdas numéricas y exporta a PDF; `excel-png.ps1` captura cada hoja como imagen. Ejecución 2026-11-05 18:46Z → 18:47Z sobre `837eb57`. Resultado (`excel/descargas.log`, `excel/excel-lectura.txt`): cuatro libros de 3 hojas, **sin reparación** (`error*.xml` en `%TEMP%`: antes 0, después 0). Cifras leídas por Excel iguales a las del servidor: Resumen Fungicida 53 L · 3, Herbicida 250 L · 5, Insecticida celda vacía «Oculto por privacidad»; Tendencias Herbicida 96 · 120 · 104 · 116 L y Fungicida 30 · 36 L con huecos en 2015/2016; Estimación Herbicida 111 L frente a línea base 116 L, Fungicida e Insecticida «Datos insuficientes» sin cifra; Propuesta 53 L y 250 L con referencia 111 L vigente. Muestras y capturas en `excel/` (`*.xlsx`, `*-1-*.png` portadas, `*-2-*`/`*-3-*` hojas de datos).

### 7.4 Limitaciones

- Verificado en Excel 16.0 de escritorio (Windows); no en LibreOffice ni en Excel en línea.
- El CSV del servidor sigue sin BOM (decisión pendiente del autor, ver PR #206).

---

## 8. Gestión → Productos (2026-11-05, tarde)

**Commit de código:** **`0ff70c4`** (`feat(web): Gestión → Productos para la Directiva y el Administrador`), misma rama local `feat/web-defensa-panel`, sin publicar. Sólo `Web/`: usa `productsService` y los endpoints existentes (`GET`/`POST`/`PATCH /inventory/products`, `POST /inventory/products/:id/deactivate`), que el servidor ya restringe a Directiva y Administrador. Sin cambios de Backend, contratos ni móvil.

| Archivo | Cambio |
|---|---|
| `Web/src/lib/navigation.ts`, `Web/src/App.tsx` | Ruta `/colectivo/productos` dentro de `CollectiveRoute`; en el menú, antes de `/campaigns` |
| `Web/src/components/app-shell.tsx` | «Productos» primero en el grupo «Gestión» |
| `Web/src/pages/products.page.tsx` (nuevo) | Acción primaria «Nuevo producto»; activos con nombre, unidad y categoría; «Editar» e «Inactivar» (con confirmación); «Ver inactivos»; enlace «Ver equivalencias» |
| `Web/src/components/product-form.tsx`, `Web/src/lib/product-text.ts` (nuevos) | Formulario compartido: nombre y unidad (L o kg) obligatorios, opcionales plegados; aviso de nombre repetido sin distinguir mayúsculas ni tildes (también contra inactivos); 409 del servidor con mensaje claro; al editar la unidad se muestra fija |
| `Web/src/pages/product-reconciliation.page.tsx` | En «Asociar…», «¿No está en la lista? Crear producto distinto…» con la unidad de la denominación; al crear vuelve al selector con el producto elegido y la asociación sigue pidiendo motivo y confirmación |
| Pruebas | `products.page.test.tsx` (nuevo, 8 casos), creación desde la denominación en `product-reconciliation.page.test.tsx`, ruta y menú en `collective-route.test.tsx` y `app-shell.test.tsx` |

La unidad se guarda como `L` o `kg`, los dos valores que el servidor convierte a una unidad base vinculable (`baseUnitForCentralUnit`: L → mL, KG → g). Editar no envía `unit`, para no romper vínculos con cifras, equivalencias y declaraciones ya recibidas.

### 8.1 Comprobaciones (`Web/`, commit `0ff70c4`)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `npx vitest run` | 23 archivos, **225 pruebas, 225 pasan** | 2026-11-05 19:11Z |
| `npx eslint .` | 0 errores, 2 avisos preexistentes | 19:11Z |
| `npx tsc -b` · `npm run build` | OK | 19:11Z |

### 8.2 Verificación con datos sintéticos (Edge sin interfaz + API, copia aislada 5198 → 3340)

Guion `productos-roles.mjs`; registros `productos/productos-directiva.log` (19:13:15Z) y `productos/productos-agricultor.log` (19:15:50Z → 19:16:13Z). 11 comprobaciones (7 de la Directiva y 4 del Agricultor), 0 fallos.

| Rol | Comprobado | Resultado |
|---|---|---|
| Directiva | «Productos» en Gestión, antes de Campañas; abre `/colectivo/productos` | OK |
| Directiva | «FUNGICIDA DEMO» avisado como repetido y botón bloqueado | OK |
| Directiva | Crea «Adherente prueba Web 191317» (L, Coadyuvante): `POST /inventory/products` → **201**; aparece en el listado (`8c-productos-creado-1366x768.png`) | OK |
| Directiva | «Inactivar» pide confirmación; el producto pasa a «Ver inactivos» | OK |
| Agricultor | Abre `/colectivo/productos` → redirigido a `/sin-acceso-web`, sin catálogo (`8d-productos-agricultor.png`) | OK |
| Agricultor | `POST /inventory/products` con su token → **403**; la búsqueda no encuentra el nombre: nada se creó | OK |

La primera ejecución de la parte del Agricultor falló por el guion (reutilizaba el perfil del navegador con la sesión de la Directiva); se corrigió con un contexto de navegador propio y se repitió sólo esa parte (`ONLY=agricultor`), sin crear otro producto.

**Efecto en la copia sintética:** queda un producto inactivo «Adherente prueba Web 191317» en el volumen aislado `agro_webdef_pgdata` (no en la DEMO oficial). Aparece en «Ver inactivos» y en Equivalencias como denominación inactiva. La contraseña sintética de `agricultor1` en esa copia se restableció con `password-pipe`.
