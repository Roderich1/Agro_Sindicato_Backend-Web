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

El índice está en `_capturas.json`.

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

## 4. Diferencias intencionales con las láminas

1. **Lámina 02, texto del aviso.** Se conservan `WEB_NOT_FOR_FARMERS_TITLE` («Esta cuenta utiliza la aplicación móvil.») y `_TEXT`, que son textos funcionales probados. La lámina dice «Esta cuenta se usa en la aplicación móvil / La Web es para la Directiva y la Administración del sindicato». Cambiarlos es decisión del autor.
2. **Desktop sin barra superior en las láminas.** Se añade una franja clara mínima con la sección, «Datos sintéticos» (regla H-03, la declara el servidor), la campaña activa y la conexión.
   - La lámina pone «Datos sintéticos» dentro del hero. El armazón la muestra en todas las vistas, también en las que no tienen hero, así que la vista **no** debe repetirla.
3. **Contador del menú.** La insignia «Por identificar» sale de la API (H-02). Nunca se copia el «6» de la lámina: sin dato o con 0 no hay insignia.
4. **Sección «SINDICATO».** Agrupa Campañas, **Usuarios** (sólo ADMINISTRADOR) y Bitácora, según el inventario §O.2. La lámina 03 es de la Directiva y no muestra Usuarios. Ya no hay un grupo «Administración».
5. **Etiqueta «Borrador de compra»** para `/colectivo/propuestas`, como en la lámina 03. El rótulo largo de la franja y de «Más» es «Necesidades y borrador de compra». La página de A aún se titula «Necesidades y propuestas».
6. **Subvista «Nombres equivalentes»** en el menú, como en la lámina 21. El `SegmentedControl` de la página de C aún dice «Equivalencias».
7. **«Más» es un diálogo sin ruta nueva:** sigue la regla de Atrás de Android (H1 del emulador) y no añade rutas.
8. **Botones primarios desactivados** hasta cumplir las condiciones (H-16). Las láminas los dibujan activos.
9. **Campos con borde de 3,5:1** (WCAG 1.4.11), más marcado que el gris claro de las láminas.
10. **Sin enlace de descarga** de la app en Ingresar ni en el aviso.

## 5. Limitaciones

- **Capturas:** son del navegador a 390 px, no de un teléfono físico. No se midió el zoom al 200 % ni la tableta (820).
- **Fuentes sin conexión:** el service worker (`vite.config.ts`, no es de BASE) no precachea `.ttf`. Sin conexión, la copia de la estimación usa las fuentes del sistema.
- **Contenido de las páginas:** es el del v1 dentro del armazón nuevo; lo rediseñan A, B y C.
