# Recorrido de la sesión A con datos del servidor: copia «rica» (2026-11-10)

## Entorno y alcance

- **Fecha.** 2026-11-10, de 23:30 a 23:45 hora de Bolivia (2026-11-11 03:30–03:45 UTC).
- **Rama.** `feat/web-rediseno-a-sistema-navegacion`. Tiene fusionada `feat/web-rediseno-integracion` (`f213f6b`, que trae B, C y las rutas) y las correcciones de A hasta `265bf57`. Durante el recorrido, Vite aplicó en caliente `0e0d1c8` (sólo relleno de la zona segura del menú del teléfono).
- **Datos.** Copia «rica»: API `127.0.0.1:3342`, PostgreSQL 15433, datos sintéticos.
- **Web.** Vite en 5171 con `VITE_API_PROXY_TARGET=http://127.0.0.1:3342`. Al terminar se detuvo y el puerto quedó libre.
- **Navegador.** Edge sin interfaz, con puppeteer-core.
- **Guion.** `a_recorrido-rica.mjs`, con `PACE_MS=15000`. La API limita a 20 peticiones por minuto por IP: una primera pasada a 2,5 s por vista recibió `429` en lecturas y por eso se repitió con pausas.
- **Inicio de sesión.** `directiva.demo@example.test` y `agricultor1.demo@example.test`, con contraseñas de un solo uso por `password-pipe` (`DEMO_API` y `DEMO_PG_ADMIN_URL` de la copia «rica»). No se imprimieron ni se guardaron. `password-pipe` fija una contraseña nueva en la copia «rica»: es la única escritura en la base, y es de credenciales, no de negocio.
- **Modo.** Sólo lectura. Navegación dentro de la SPA (`pushState` + `popstate` o clic en el menú), sin recargas.
- **Resultado.** 81 comprobaciones correctas y 2 fallidas. El detalle está en `a_capturas_rica/recorrido.log`.
- **Limitación.** Es emulación de escritorio: **no se declara probado en un teléfono**.

## Resultados

| Comprobación | Resultado |
|---|---|
| Menú de la Directiva | «Resumen · Campañas · Necesidades y propuestas · Histórico y estimaciones · Catálogo y equivalencias · Bitácora». Grupo «Administración» presente y sin «Usuarios» (rol Directiva) |
| Cada ítem lleva a su vista | 6 de 6. Un solo `h1` por vista (Resumen, Campañas, Necesidades y propuestas, Histórico y estimaciones, Catálogo y equivalencias, Bitácora), un ítem activo y sin desplazamiento horizontal a 1366 px |
| Redirecciones con `?campaign=` | `/colectivo/tendencias` → `/colectivo/historico?campaign=…&vista=tendencias`<br>`/colectivo/estimacion` → `…&vista=estimacion`<br>`/colectivo/productos` → `/colectivo/catalogo?…&vista=productos`<br>`/colectivo/reconciliacion` → `…&vista=equivalencias`<br>`/directiva` → `/colectivo/propuestas?campaign=…`, tras la corrección `51f8f4b`. En la primera pasada perdía `?campaign=` |
| Cobertura | Se abre por el enlace del Resumen (`/colectivo/cobertura`), con un `h1`. No está en el menú |
| Teclado | Tab llega a «Campañas» en el menú lateral, con foco visible (`outline: solid`), y Enter la abre |
| Zoom 200 % (683×384 CSS a escala 2) | Resumen, Campañas, Necesidades, Histórico y Catálogo sin desplazamiento horizontal. La cabecera no desborda: la campaña activa ocupa una línea recortada con `title` |
| Teléfono 390 y 320 px | Barra inferior «Resumen · Campañas · Necesidades · Histórico» con etiquetas sin recortar. El menú abre con el foco dentro, 25 Tab no salen de él y Escape lo cierra devolviendo el foco a «Abrir menú». El selector de campaña no desborda (374/390 y 304/320). Resumen, Campañas, Necesidades e Histórico sin desplazamiento horizontal |
| `prefers-reduced-motion` | `.ui-press` transiciona sólo color, fondo, borde, contorno y opacidad (sin `transform`) |
| Escrituras (Directiva) | 0 de negocio. Las únicas peticiones no GET fueron `POST /auth/login` y 8 `POST /auth/refresh` |
| Consola (Directiva) | **FALLA**: 2 errores `401` de `POST /auth/refresh` en `/login`, antes de iniciar sesión. Es la comprobación de sesión anónima del `AuthProvider` (no había sesión previa) y se repite por el doble efecto en desarrollo. Después de iniciar sesión, ninguna respuesta de error. Ya no hay `502` |
| agricultor1 | Entra al aviso `/sin-acceso-web`, sin ningún `nav`. `/colectivo/historico?campaign=…` lo devuelve al aviso. Ninguna petición GET a la API (ni datos colectivos ni campañas) y 0 escrituras |
| Consola (agricultor1) | **FALLA**: los mismos 2 `401` de la comprobación anónima en `/login` |

Hallazgos de la primera pasada, ya corregidos:
- `/audit-logs` sin `h1`, corregido en `a9cc369`.
- `/directiva` sin `?campaign=`, corregido en `51f8f4b`.

Las 2 fallas que quedan son los `401` esperados de la comprobación de sesión anónima. Para no contarlos como errores, el `AuthProvider` tendría que no llamar a `refresh` sin una cookie de sesión. Ese archivo no es de A: queda como observación para la coordinadora.

## Capturas (`a_capturas_rica/`)

- `1366_*.png` (página completa): resumen, campañas, necesidades, histórico, catálogo, bitácora, cobertura y `resumen_reduced-motion`.
- `zoom200_*.png`: las cinco vistas al 200 %.
- `390_resumen.png`, `390_menu.png`, `320_resumen.png`, `320_menu.png`, `320_campaigns.png`, `320_propuestas.png` y `320_historico.png`.
- `agricultor_aviso.png`.

En las capturas de página completa, los elementos fijos aparecen en la posición de la ventana; es un efecto de la captura.

## `mobile-native`: síntomas revisados sobre el armazón y las vistas nuevas

| Síntoma | Estado | Dónde |
|---|---|---|
| Hover pegado tras tocar | Resuelto. Los `hover:` de Tailwind 4 sólo se aplican con `(hover: hover)`; los de `index.css`, con `(hover: hover) and (pointer: fine)` | `index.css`, todas las vistas |
| Destello al tocar | Resuelto: `-webkit-tap-highlight-color: transparent` | `index.css` |
| Altura con `100vh` | Armazón e inicio de sesión con `min-h-dvh`. **Petición**: `admin-route.tsx:11`, `private-route.tsx:11` y `web-not-for-farmers.page.tsx:16` usan `min-h-screen` (archivos sin dueño en §6) | — |
| Zoom al enfocar un campo | Campos a 16 px con `(pointer: coarse)`, fuera de capa para ganar a `text-sm`. Comprobado sólo en el código | `index.css` |
| Toque lento | `touch-action: manipulation` en botones, enlaces y `summary`; `:active` con `scale(0.98)`; desde `28d3190`, también sin selección ni menú de pulsación larga en enlaces con aspecto de botón | `index.css` |
| Pull-to-refresh | Se mantiene en el documento a propósito (la Web es un documento que se desplaza). `overscroll-behavior: contain` en las tablas, el menú del teléfono y el modal | `index.css`, `app-shell.tsx` |
| Muesca y zonas seguras | `viewport-fit=cover`; cabecera, márgenes laterales, barra inferior y, desde `0e0d1c8`, el pie del menú con `env(safe-area-inset-*)` | `index.html`, `index.css` |
| Pulsación larga selecciona texto | `user-select: none` sólo en controles | `index.css` |
| Carrusel | No hay. Las tablas usan desplazamiento nativo | — |
| `theme-color` | `#ffffff`, igual que la cabecera, con `color-scheme: light`; manifiesto también en `#ffffff` | `index.html`, `vite.config.ts` |
| Teclado del campo de búsqueda | **Petición a C**: `products.page.tsx:140` y `product-reconciliation.page.tsx:132` (`type="search"`) podrían llevar `enterKeyHint="search"` | — |
| Modal con el teclado abierto | Desde `28d3190`: alto máximo `100dvh - 2rem` con desplazamiento interno | `app-shell.tsx` |
| Hardware real | **Pendiente.** Hay que comprobar en un teléfono: zonas seguras, teclado con la barra inferior, hover, pulsación, zoom de campos y color de la barra | — |

## Revisión de movimiento de la composición integrada (`review-animations`)

Alcance: todo `Web/src` de las vistas de esta etapa, sobre `feat/web-rediseno-integracion` fusionada en A (`2da9e48`) más las correcciones de A:
- armazón y `components/ui/*`;
- vistas de B: Resumen, Campañas, detalle de campaña, Cobertura, `coverage-card`, `seal-panel`;
- vistas de C: Necesidades y propuestas, Histórico (tendencias y estimación), Catálogo (productos y equivalencias), `estimation-*`, `export-buttons`, `product-form`;
- Bitácora, Usuarios e inicio de sesión.

Barrido: `transition*`, `animate-*`, `duration-*`, `@keyframes`, `backdrop-blur`, `bg-gradient`, `hover:scale/translate/shadow`, `requestAnimationFrame` y `scrollIntoView` con `smooth`.

| Antes | Después | Por qué |
|---|---|---|
| Archivos de B y C: sin ninguna transición, animación, blur ni degradado | Sin cambios | Nada que corregir: el cambio de vista, de pestaña (`SegmentedControl`) y de fila es instantáneo |
| `components/admin-route.tsx:11` y `private-route.tsx:11`: `animate-spin` sin `motion-reduce` | **Petición** (archivos sin dueño en §6): añadir `motion-reduce:animate-none` | Con movimiento reducido el indicador debería quedar fijo junto al texto, como en `DataState`, el inicio de sesión y Usuarios |
| `users.page.tsx`: `animate-scale-in` en el aviso tras restablecer la contraseña | Se conserva: fundido de 120 ms (sólo opacidad) | Ocasional; evita una aparición brusca; con movimiento reducido no hay transformación |
| Menú del teléfono: aparición sin animación | Se conserva | Navegación frecuente: la respuesta instantánea gana a un cajón de 200–500 ms |
| Selector de prototipos (`picker.css`): blur y transición de 250 ms | Retirado con los prototipos | Era cromo de desarrollo; ya no existe |

**Veredicto: Approve.**
- No hay regresiones que rompan la sensación ni animaciones en acciones de teclado o de alta frecuencia.
- Todas las duraciones son de 200 ms o menos con `--ease-out`.
- El movimiento reducido se respeta: el recorrido midió `.ui-press` sin `transform` con `prefers-reduced-motion: reduce`.
- Queda sólo la petición de los dos spinners de las guardas.
