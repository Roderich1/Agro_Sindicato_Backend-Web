# Rediseño de la Web (v2): sesión BASE, evidencia del 2026-11-13

- **Rama y base:** `feat/web-rediseno-v2-base`, partiendo de `50aa672`.
- **Worktree:** `_wt/WEB2-BASE`.
- **Encargo del orquestador:** tokens, tipografía, componentes compartidos, armazón y navegación, Ingresar y el aviso para la cuenta de agricultor. Se añaden después el inventario §O (insignia «Por identificar») y H-17.
- **Fuera de alcance:** no se cambian Backend, permisos, contratos, `services/**` ni `types/**`. No hay push ni PR.

## 1. Commits

| SHA | Qué hace |
|---|---|
| `c7893bc` | Tokens y tipografías: `index.css` con la identidad de las láminas, fuentes autoalojadas con OFL y procedencia (`Web/public/fonts/LICENSES.md`), sin Google Fonts, favicon con la marca |
| `fa1f93c` | Componentes compartidos de `components/ui` (restilizados y nuevos), `collective-ui` (sólo estilo) y README de contrato |
| `7836c4f` | Armazón y navegación: barra lateral, barra superior, barra inferior, «Más», `navigation.ts` y contexto de la insignia «Por identificar» |
| `bb9ce09` | H-17: un 429 al renovar la sesión no la cierra (`lib/axios.ts`) |
| `18f4554` | Ingresar (01) y aviso para la cuenta de agricultor (02) |
| `2df7ecb` | Pruebas: adaptadas y nuevas |
| `7b3e03b` | Compatibilidad de `Modal` (`aria-label`) y de `StatusChip` (punto como pseudoelemento) con las pruebas de las vistas; campos de Ingresar a 16 px |
| `1b15cc3` | Esta evidencia (primera entrega) |
| `a3047a6` | Corrección 1 del orquestador: sin franja superior en escritorio; «Datos sintéticos» en `PageHeader` y `HeroPanel` (`SyntheticDataChip`); conexión en la tarjeta de usuario y, en teléfono, sólo «Sin conexión» |
| `79ed788` | Corrección 2: el service worker precachea las `.ttf`; manifiesto con `theme_color #0f2a1d` y `background_color #f2f4ee` |

## 2. Verificación sobre `7b3e03b` (2026-11-13, carpeta `Web/`)

| Comando | Resultado |
|---|---|
| `npx tsc -b` | Sin salida, código 0 |
| `npx eslint .` | `✖ 7 problems (0 errors, 7 warnings)`. Son los mismos 7 avisos previos: `react-refresh/only-export-components` en `auth.context`, `campaign.context` y `src/dev/**` |
| `npx vite build` | `✓ built`. El precache del PWA tiene 30 entradas. `dist/fonts/` contiene las 5 TTF y las licencias |
| `npx vitest run --no-file-parallelism`, 2.ª y última ejecución completa | `Test Files 58 passed (58)` · `Tests 633 passed (633)` (base: 589) |

La 1.ª ejecución completa, sobre `2df7ecb`, dio `2 failed | 631 passed`:

- `collective-summary.fixtures.test.tsx` buscaba que una celda no tuviera ningún nodo `aria-hidden`, y el punto de `StatusChip` lo era.
- `product-identification.page.test.tsx` leía `aria-label` del diálogo de `Modal`.

Las dos se corrigieron en el componente (`7b3e03b`), no en las pruebas.

### Verificación de las correcciones sobre `79ed788` (2026-11-13)

| Comando | Resultado |
|---|---|
| `npx tsc -b` | código 0 |
| `npx eslint .` | `✖ 7 problems (0 errors, 7 warnings)` (los mismos 7) |
| `npx vite build` | `✓ built`; `precache 35 entries (1071.70 KiB)`; `dist/sw.js` incluye `fonts/DMSans-400/500/700.ttf` y `fonts/BricolageGrotesque-700/800.ttf`; `dist/manifest.webmanifest` con `theme_color #0f2a1d` y `background_color #f2f4ee` |
| `npx vitest run` focalizado: `app-shell.test`, `components/ui`, `components/__tests__`, `collective-ui.test`, `contexts`, `lib/axios.refresh.test`, `pages/estimation-copy.page.test`, `lib/estimation-copy.test`, `lib/estimation-copy.revocation.test` (`--no-file-parallelism`) | `Test Files 25 passed (25)` · `Tests 228 passed (228)` |

La suite completa no se volvió a ejecutar (la ejecuta el orquestador al integrar).

## 3. Capturas

**Entorno:**
- Vite propio en `127.0.0.1:5180` con `VITE_API_PROXY_TARGET=http://127.0.0.1:3350`.
- API aislada 3350 y base sintética `agro_demo`, que **no** es la DEMO oficial.
- Edge sin interfaz, mediante `tool/web_rediseno_v2/capture_base.mjs`. Es una copia de `_wt/WEB-DESIGN-INPUT/tool/web_design/capture.mjs` con tres añadidos: el ancho de 1280, el paso `viewport` y los pasos `key` y `measure`.

**Contraseñas:** la herramienta fija una contraseña aleatoria de un solo uso en la base aislada, la escribe en `#password` y no la imprime ni la captura. Ninguna captura muestra la contraseña.

**Vite:** se detuvo al terminar (PID propio en 5180). No se tocaron 3350, 15434 ni los servicios de otras sesiones.

**Pasadas:**

| Pasada | Código | Plan | Qué capturó |
|---|---|---|---|
| 1 | `2df7ecb` | `plan_base.mjs` | Todas las capturas salvo Ingresar |
| 2 | `2df7ecb` + campos de Ingresar a 16 px (después en `7b3e03b`) | `plan_base_medidas.mjs` | Medidas de desplazamiento horizontal a 390 px |
| 3 | Igual que la pasada 2 | `plan_base_ingresar.mjs` | `acceso/01-ingresar__*` definitivas |

| 4 | `79ed788` | `plan_base_correcciones.mjs` | `correcciones/*`, `zoom200/01-ingresar`, `zoom200/03-resumen*`, `tableta/*` y medidas a 720 y 820 px |
| 5 | `79ed788` | `plan_base_zoom_menu.mjs` | `zoom200/43-menu-mas*`: ventana visible, sin página completa |

El índice está en `_capturas.json`.

**Aviso:** las capturas de `armazon/`, `foco/`, `dialogos/` y `telefono/` son de la pasada 1 (`2df7ecb`). Las de escritorio aún muestran la franja superior, retirada en `a3047a6`. Las vigentes del escritorio están en `correcciones/`.

En la pasada 4, la captura de página completa de «Más» a 720×450 mezclaba el panel fijo con la página de detrás: es un efecto de la captura de página completa, no de la Web. Se repitió en la pasada 5 con la ventana visible, arriba, en las tareas repetidas y al final del panel.

### Desplazamiento horizontal a 390 px (pasada 2)

`document.documentElement.scrollWidth` frente a `clientWidth`: 390 = 390 en todas las rutas medidas:

- `/login`
- `/colectivo/resumen`
- `/colectivo/propuestas`
- `/colectivo/compras-conjuntas`
- `/colectivo/catalogo`
- `/colectivo/historico`
- `/campaigns`
- `/audit-logs`

El resultado: sin desplazamiento horizontal de la página.

Pasada 4: `/login` y `/colectivo/resumen` con zoom al 200 % (720 = 720) y en tableta (820 = 820). Tampoco hay desplazamiento horizontal.

### Comparación con las láminas

| Captura | Lámina | Lo que se vio |
|---|---|---|
| `acceso/01-ingresar__{escritorio,portatil,movil}` | 01 | Mitad oscura con la marca y «La Web de la Directiva», con «Directiva» en lima; tarjeta blanca con «Mostrar», el botón oscuro en píldora y la nota de ayuda. En teléfono, la franja oscura va arriba y la nota del agricultor abajo. El botón aparece en gris porque está **desactivado** sin datos: en la lámina sale activo. No hay aviso de copia sin conexión, porque en este navegador no existe la copia |
| `acceso/02-aviso-agricultor__*` | 02 | Fondo de tinta, tarjeta blanca, marca lima, «Cambiar de cuenta» (oscuro) y «Cerrar sesión» (con borde). Los textos son los funcionales vigentes, no los de la lámina (ver §4) |
| `armazon/03-resumen-directiva*__escritorio`, `__portatil` | 03 | Barra lateral con la marca y el sindicato de la sesión («Sindicato DEMO · datos sintéticos»), Resumen activo en lima, Catálogo con su insignia real «6», grupo Histórico, «SINDICATO» con Campañas y Bitácora, y tarjeta de usuario. La franja superior lleva la sección, «Datos sintéticos», la campaña activa y «En línea». El contenido es el Resumen v1 de A dentro del armazón nuevo: legible, sin solapes |
| `armazon/21-catalogo-grupo-abierto__escritorio` | 21 | Grupo Catálogo abierto, «Por identificar» activo (subítem oscuro elevado) con la insignia «6» (`GET …identification-requests?status=PENDING`) |
| `armazon/barra-plegada__escritorio` | 03 (botón «<») | Barra de 88 px, sólo con iconos; la insignia queda sobre el icono de Catálogo |
| `armazon/31-usuarios-administrador__escritorio` | 31 | El ADMINISTRADOR ve Usuarios dentro de «SINDICATO», activo |
| `foco/01-ingresar-foco-correo__escritorio` | — | Foco de teclado: anillo de tinta en el campo de correo. Es de la pasada 1, con el texto a 14 px |
| `foco/03-foco-barra-lateral__escritorio` | — | Foco de teclado: anillo lima en «Borrador de compra», sobre la barra oscura |
| `dialogos/30-nueva-campana-dialog__escritorio` | 30 | Diálogo real de Campañas (`Modal` → `Dialog`): título en Bricolage, campos, «X», velo verde y foco en «Nombre». No se envió |
| `telefono/35-resumen-telefono*__movil` | 35 | Barra superior oscura con la marca y «Datos sintéticos»; barra inferior con Resumen activo (pastilla oscura e icono lima), Borrador, Compras, Catálogo y Más. La última sección no queda tapada |
| `telefono/43-menu-mas-directiva__movil` | 43 | Cabecera oscura con el sindicato y «Más», tarjetas con icono, título, descripción y flecha (Histórico y estimaciones, Campañas, Bitácora), usuario «DD» y «Cerrar sesión». «Más» queda activo en la barra |
| `telefono/44-menu-mas-administrador__movil` | 44 | Igual que la anterior, más Usuarios |
| `telefono/46-dialogo-hoja-inferior__movil` | 46 | El mismo diálogo como hoja inferior, con asa, sobre el velo |
| `correcciones/03-resumen-sin-franja__{escritorio,portatil}` | 03 | Sin franja superior. «Datos sintéticos» arriba a la derecha de la cabecera de la vista (`PageHeader`). «En línea» con su punto bajo el rol, en la tarjeta de usuario. La campaña activa la muestra la vista (selector y chip «Activa») |
| `correcciones/25-historico-chip-unico__escritorio` | 25 | Contenedor con una vista anidada (`h2`): un solo «Datos sintéticos». Histórico abierto con «Histórico sellado» activo |
| `correcciones/barra-plegada-conexion__escritorio` | 03 | Barra plegada: con red, «En línea» sólo para lectores de pantalla |
| `zoom200/01-ingresar__zoom200` | 01 | Zoom al 200 %: la marca va arriba y la tarjeta después, sin solapes ni recortes |
| `zoom200/03-resumen*__zoom200` | 03 | Zoom al 200 %, horizontal de poco alto: barra superior no fija con «Menú», sin barra inferior, «Datos sintéticos» en la cabecera de la vista. Texto y botones sin recortes |
| `zoom200/43-menu-mas*__zoom200` | 43 | «Más» desde «Menú»: las otras secciones, las tareas de la barra inferior repetidas (sólo en horizontal), el usuario y «Cerrar sesión». El panel se desplaza dentro |
| `tableta/01-ingresar__tableta` | 01 | Tableta (820): la misma disposición que en teléfono, con la tarjeta centrada |
| `tableta/03-resumen-pantalla__tableta`, `tableta/43-menu-mas__tableta` | 35 y 43 | Barra superior oscura y barra inferior de cinco, con «Más» como en el teléfono |

## 4. Diferencias intencionales con las láminas

1. **Lámina 02, texto del aviso.** Se conservan `WEB_NOT_FOR_FARMERS_TITLE` («Esta cuenta utiliza la aplicación móvil.») y `_TEXT`, que son textos funcionales probados. La lámina dice «Esta cuenta se usa en la aplicación móvil / La Web es para la Directiva y la Administración del sindicato». Cambiarlos es decisión del autor.
2. **Escritorio sin barra superior, como en las láminas (corrección del 2026-11-13).**
   - «Datos sintéticos» (H-03) lo muestran solos `PageHeader` y `HeroPanel`, arriba a la derecha.
   - La conexión (`navigator.onLine`, dato previo al rediseño) va en la tarjeta de usuario.
   - La campaña activa la muestra cada vista.
3. **Contador del menú.** La insignia «Por identificar» sale de la API (H-02). Nunca se copia el «6» de la lámina: sin dato o con 0 no hay insignia.
4. **Sección «SINDICATO».** Agrupa Campañas, **Usuarios** (sólo ADMINISTRADOR) y Bitácora, según el inventario §O.2. La lámina 03 es de la Directiva y no muestra Usuarios. Ya no hay un grupo «Administración».
5. **Etiqueta «Borrador de compra»** para `/colectivo/propuestas`, como en la lámina 03. El rótulo largo de la franja y de «Más» es «Necesidades y borrador de compra». La página de A aún se titula «Necesidades y propuestas».
6. **Subvista «Nombres equivalentes»** en el menú, como en la lámina 21. El `SegmentedControl` de la página de C aún dice «Equivalencias».
7. **«Más» es un diálogo sin ruta nueva:** sigue la regla de Atrás de Android (H1 del emulador) y no añade rutas.
8. **Botones primarios desactivados** hasta cumplir las condiciones (H-16). Las láminas los dibujan activos.
9. **Campos con borde de 3,5:1** (WCAG 1.4.11), más marcado que el gris claro de las láminas.
10. **Sin enlace de descarga** de la app en Ingresar ni en el aviso.

## 5. Limitaciones

- **Capturas:** son del navegador a 390, 720 (zoom al 200 %) y 820 px, no de un teléfono ni de una tableta físicos.
- **Zoom al 200 %:** se emuló con una ventana de 720×450 a 2x, no con el zoom del navegador.
- **Fuentes sin conexión:** el precacheo de las `.ttf` se comprobó en el `sw.js` generado y con las pruebas de la copia, no abriendo la copia sin red en un navegador.
- **Contenido de las páginas:** es el del v1 dentro del armazón nuevo; lo rediseñan A, B y C.
