# Variantes del Resumen: prototipos para la elección del autor (sesión A, 2026-11-10)

> **Nota (etapa 2, 2026-11-10):** el autor eligió la variante 2 («Analítica comparativa»), que la sesión B llevó al Resumen real. La superficie de prototipos (`/prototipos/resumen` y `Web/src/dev/prototypes/`) **se retiró en el commit `63e67b7`**. Este documento y sus capturas se conservan como evidencia.

Rama `feat/web-rediseno-a-sistema-navegacion`. Las capturas se tomaron con el código de `fc3c6a4`, el 2026-11-10 a las 23:10 hora de Bolivia (2026-11-11 03:10 UTC). Hay datos sintéticos y nada se toma de un servidor de datos. **La variante no está elegida: la elige el autor.**

## Cómo abrirlo

- Ruta: `http://127.0.0.1:5171/prototipos/resumen`. Sólo existe con `import.meta.env.DEV`. Una compilación de producción en el scratchpad no contenía ni el texto «Operativa compacta» ni `proto-picker`.
- Arranque (en `Web/`): `VITE_API_PROXY_TARGET=http://127.0.0.1:9 npx vite --host 127.0.0.1 --port 5171 --strictPort`. El proxy apunta a un puerto cerrado, así que ninguna petición llega a un servidor.
- Selector: es la píldora oscura de abajo al centro, copiada de `prototype/PICKER.md`. Las teclas son `1`, `2`, `←` y `→`. `?v=1|2` recuerda la elección. No hay botón de repetir porque ninguna variante anima su entrada. En pantallas de hasta 1023 px el selector sube arriba (`data-position="top"`), que es la única modificación que admite la especificación, para no tapar la barra inferior.
- Datos: `?datos=worst|empty|one`, o el conmutador en una línea encima de la vista. Sin parámetro se usa `demo`. Los fixtures están en `Web/src/dev/prototypes/resumen/fixtures.ts` con la forma de `CollectiveSummary` y `Campaign[]`:
  - demo: 6 productos (4 en L y 2 en KG), uno oculto por privacidad, uno con cambios pendientes, cobertura 6 de 9 y campaña ABIERTA.
  - worst: nombres largos, `123456789012` y `25`, un cero divulgado, 3 estados restringidos, versión sellada, cobertura 0 de 0 y dos campañas ABIERTA.

## Variantes

| # | Variante | Eje | Cuándo es la elección correcta | Su coste |
|---|---|---|---|---|
| 1 | Operativa compacta | Densidad y acción | La Directiva revisa la campaña para decidir y quiere todo en una pantalla: indicadores pequeños, tabla con la cifra exacta, aportantes y fecha, y lo pendiente al lado. Es una herramienta de uso diario. | Comparar productos cuesta más: hay que leer cifras, no hay barras. A 390 px la tabla se desplaza a lo ancho dentro de su contenedor. |
| 2 | Analítica comparativa | Jerarquía y comparación | Se presenta la campaña (proyector, reunión) y lo importante es ver qué producto pesa más dentro de su unidad. Cobertura y sello quedan muy visibles. | Ocupa más alto: a 1366×768 hace falta desplazarse para ver todo. Lo pendiente queda como lista secundaria al final. |

Las dos usan el mismo fixture, `components/ui` y las mismas reglas:

- L y KG nunca se suman ni comparten escala.
- Una celda no divulgada muestra el motivo de `statusReason`, sin cifra, barra ni cero.
- Un cero divulgado por el servidor se escribe «0 L» y no lleva barra.
- Sin denominador no hay porcentaje: en el peor caso aparece «0 de 0» sin «%».
- No hay umbrales de color.
- El título es «Necesidades declaradas por producto».
- Las acciones pendientes citan el dato del que salen.
- Hay un solo `h1` (`PageHeader`).

Las variantes difieren en la distribución (tabla y columna lateral frente a tarjetas y barras) y en la jerarquía, no en el color. Una prueba lo comprueba (`harness.test.tsx`).

## Capturas (`a_capturas/`)

Se generan con `a_capturas-resumen.mjs` (puppeteer-core y Edge sin interfaz) y las métricas quedan en `a_capturas/resultados.json`.

| Archivo | Qué muestra |
|---|---|
| `operativa_*.png`, `analitica_*.png` | Página completa a 1366×768, 1920×1080, 390×844 y 320×568 |
| `*_1366x768_pantalla.png` | Sólo lo visible sin desplazarse, a 1366×768 |
| `*_worst.png`, `*_empty.png` | Peor caso y vacío, a 1366×768 y 390×844 |
| `*_reduced-motion.png` | `prefers-reduced-motion: reduce` emulado |
| `operativa_390x844_menu.png` | Menú desplegable del teléfono abierto |

Resultados medidos:

- Ninguna captura desplaza la página a lo ancho, en ninguno de los 4 anchos.
- Hay un solo `h1` por vista.
- A 1366×768, la variante 1 termina en 750 px, dentro de la pantalla. La página mide 782 px por el margen inferior de 32 px, y la cuenta incluye la franja del arnés, de unos 40 px.
- A 1366×768, la variante 2 termina en 1229 px y necesita desplazarse.
- A 1920×1080 caben las dos.
- Cada carga registra 2 errores de consola, ambos `502` de `POST /api/v1/auth/refresh`. Esa petición la hace el `AuthProvider` de la aplicación al cargar, no el prototipo, y el proxy la manda a un puerto cerrado. El arnés no hace ninguna petición; las pruebas lo comprueban espiando XHR y `fetch`.
- En las capturas de página completa, los elementos fijos (barra lateral, barra inferior y selector) aparecen en la posición de la ventana. Es un efecto de la captura, no un defecto.
- Todo se observó en emulación de escritorio. **No se declara probado en un teléfono.**

## Autorrevisión del movimiento (`review-animations`)

Alcance: `Web/src/index.css`, `Web/src/components/ui/**`, `Web/src/components/app-shell.tsx`, `login.page.tsx`, `users.page.tsx` y el arnés de prototipos.

| Antes | Después | Por qué |
|---|---|---|
| `fadeIn` 300 ms (`animate-fade-in`) al montar páginas | Eliminado | Cambio de ruta, más de 100 veces al día: no se anima |
| `float`, `pulse-soft`, `shimmer` en bucle infinito | Eliminados; `.skeleton` estático | Decoración en bucle sobre elementos persistentes |
| `slideInRight` 350 ms (panel lateral legacy) | 180 ms, `translateX(16px)` + opacidad, `--ease-out`; con movimiento reducido sólo opacidad | Ocasional, da continuidad espacial; dentro del presupuesto de 300 ms |
| `fadeSlide` 200 ms y `scaleIn` 250 ms (avisos) | Sólo opacidad, 120 ms, `--ease-out` | Aparición tras una acción: se reduce a la versión mínima que evita un cambio brusco |
| Botones con `transition-all duration-200`, degradado y sombras crecientes | `.ui-press`: `transform`, `background-color`, `border-color` y `color` a 120 ms `--ease-out`; `:active` `scale(0.98)`; sin escala con movimiento reducido | Nada de `transition: all`; la respuesta al pulsar cae en los 100–160 ms recomendados |
| Barra lateral con `transition-all duration-300`, cabecera con blur y degradado | Sin transición; superficies sólidas | La navegación es de alta frecuencia; el blur no tenía función |
| `SegmentedControl` con `transition-colors` | Sin transición | Pestañas: alta frecuencia |
| Transiciones de foco (`input-icon`, `skip-link`) | Eliminadas | Las acciones de teclado no se animan |
| Hover de filas con `transition` | Cambio de color instantáneo y sólo con `(hover: hover) and (pointer: fine)` | Superficie que el cursor barre decenas de veces |
| Spinners de carga (`DataState`, inicio de sesión, usuarios) | Se conservan (bucle de un indicador de carga) con `motion-reduce:animate-none` | Bucle permitido para la carga; con movimiento reducido dejan de girar y queda el texto «Cargando…» |

Veredicto por nivel:

1. Regresiones que rompan la sensación: ninguna.
2. Simplificaciones pendientes:
   - `animate-fade-slide`/`animate-scale-in` quedan como fundido puro de 120 ms. El estándar marca los fundidos sin transformación, pero mantenerlos es una decisión de `remove-animations` (versión mínima en una superficie frecuente). Borrarlos es la alternativa si se prefiere.
   - Las páginas legacy del agricultor (`dashboard`, `inventory`, `purchases`, `applications`) conservan `transition-all`, `animate-pulse` y degradados de Tailwind. Están fuera del alcance de A y el contrato dice que no se tocan.
3. Rendimiento: sólo se anima `transform` y `opacity`, salvo los colores de `.ui-press` y el `width` del resalte del selector. Ese `width` es una excepción documentada en `PICKER.md`, en un cromo de desarrollo de 28 px.
4. Interrupción y tiempos: el panel lateral legacy usa keyframes y no es interrumpible, pero se abre una vez y no de forma repetida, así que se acepta. La pulsación es simétrica, lo que es correcto para un clic simple (no es una acción mantenida).
5. Origen y coherencia:
   - El menú del teléfono aparece sin animación. Es una decisión de frecuencia: el estándar admitiría 200–500 ms para un cajón.
   - Los colores de hover usan `--ease-out` y no `ease`; a 120 ms la diferencia es imperceptible.
6. Accesibilidad:
   - `prefers-reduced-motion` conserva color y opacidad y quita el movimiento.
   - Los hovers de Tailwind 4 se aplican sólo con `(hover: hover)`, aunque no exigen `(pointer: fine)`. Los hovers propios de `index.css` sí lo exigen.
   - El selector de prototipos (cromo DEV, especificación literal) usa blur y una transición de 250 ms, y respeta el movimiento reducido.

**Decisión: Approve.** No queda movimiento en acciones de teclado ni de alta frecuencia en los archivos de A, todas las duraciones son de 200 ms o menos con `--ease-out` y el movimiento reducido se respeta. La comprobación fina (cámara lenta, cuadro a cuadro, sensación al pulsar con el dedo) queda pendiente en un teléfono real.
