# Sesión C: recorrido con la copia «rica» (2026-11-10, 23:30 hora de La Paz; 2026-11-11 03:34 UTC)

**Qué se ejecutó.** Commit `2ee8a55` (rama C con `feat/web-rediseno-integracion` fusionada). Vite en `Web/` con `VITE_API_PROXY_TARGET=http://127.0.0.1:3342` (copia sintética «rica», PG 15433; **no** la DEMO oficial), Edge sin interfaz (puppeteer-core) con `prefers-reduced-motion: reduce`. Guion: `c_capturas_rica/recorrido-c.mjs`; salida: `c_capturas_rica/recorrido-c.log`; 28 capturas `c_capturas_rica/<vista>-{1366,390,320,1366-zoom200}.png`. Emulación de escritorio: **no** se declara probado en un teléfono.

**Inicio de sesión.** Directiva `directiva.demo@example.test`; la contraseña de un solo uso llegó por `tool/demo/demo-central.cjs password-pipe directiva` (con `DEMO_API` y `DEMO_PG_ADMIN_URL` apuntando a la copia «rica»), no se imprimió ni se guardó. Un primer intento falló sin iniciar sesión porque faltaba `DEMO_API` (la herramienta apunta por defecto al puerto 3330, apagado); se repitió con `DEMO_API=http://127.0.0.1:3342/api/v1`.

**Sólo lectura.** Se navegó dentro de la SPA (`pushState`), sin recargas. Tras iniciar sesión la Web abre el Resumen: su lectura (`GET …/summary`) **se abortó a propósito** en el navegador (sin sellar, esa lectura ejecuta la decisión de divulgación en el servidor); por eso hay 3 errores de consola, todos de esa lectura abortada. No se generaron borradores ni estimaciones, no se asoció nada, no se creó ni editó ningún producto.

## Resultado: 100 comprobaciones, 0 fallas

| Vista | Qué se cotejó con la respuesta JSON de la API |
|---|---|
| Necesidades y propuestas, «Invierno 2026 (DEMO)» (último borrador `ec6b0fe8` abierto por consulta, sin `POST`) | 10 líneas: 7 necesidades publicadas iguales a `quantity_base` (p. ej. 773,6 KG, 1.105,9 KG, 20,3 L); 3 ocultas sin cifra; 7 referencias iguales a `estimate_base` (p. ej. 392 KG, 14,108231248 L); rótulo «Estimación del consumo (referencia)»; diferencia mostrada exactamente en las 7 líneas comparables (ESTIMATED + CURRENT + > 0 + necesidad publicada) y en ninguna otra (p. ej. «381,6 KG menor»); ningún porcentaje; «Vigencia evaluada el …» visible; enlace a `/colectivo/historico?vista=estimacion&campaign=…` |
| Necesidades y propuestas, «Invierno 2025 (DEMO)» | Sin borrador: estado «Todavía no hay borradores…», sin cifras ni `POST` |
| Histórico sellado (`?vista=tendencias`) | 12 campañas, 9 series; 81 cifras publicadas de la tabla iguales a `total_base`; huecos sin cifra; gráfico (Abono NPK) con 11 columnas iguales a la API; `document.getAnimations()` vacío |
| Estimación (`?vista=estimacion`, a la que se llegó con el teclado: foco en «Estimación del consumo» + Enter) | «Invierno 2026 (DEMO)»: 7 estimaciones y 7 líneas base iguales a la API (p. ej. 70,964490102 L y 57,2 L); «Insecticida DEMO» y «Azufre mojable DEMO» (`INSUFFICIENT_DATA`) muestran «Datos insuficientes» sin cifra; «Vigencia evaluada el …» visible |
| Catálogo, Productos | 11 activos = API; 5 grupos por categoría; búsqueda en mayúsculas («ABONO») encuentra «Abono NPK 15-15-15 DEMO»; texto sin coincidencias → estado propio; «Quitar filtros» devuelve los 11 |
| Catálogo, Equivalencias | 1 equivalencia vigente = API |

**Anchos.** En las 7 composiciones capturadas, la página no se desplaza a lo ancho a 1366, 390, 320 px ni a 683 px (= zoom 200 %); las tablas secundarias se desplazan dentro de su contenedor.

**Peticiones HTTP (todas).** `GET`: campaigns (6), campaigns/active (1), proposals (3), proposal (2), estimation-reference (2), trends (2), estimation results/runs/run (2 cada una), inventory/products (2), product-associations y su catálogo (4 cada una), summary (1, abortada). `POST`: sólo `/auth/login` (1) y `/auth/refresh` (2). **Escrituras de negocio: 0.** Las lecturas aparecen duplicadas por el modo estricto de React en desarrollo.

**Teclado.** El cambio de vista con Enter funciona. Doce pulsaciones de Tab en Equivalencias recorrieron búsqueda → región de la tabla → «Asociar…» (×9) → región siguiente, todas con foco visible (contorno o sombra).

## Límites de este recorrido

- La copia «rica» no tiene nombres de producto con tildes: la búsqueda sin tildes se comprobó aquí sólo con mayúsculas; con tildes, en las pruebas (`catalog.page.test.tsx`, fixture `worst`).
- La única campaña con resultados de estimación es también la que tiene «Datos insuficientes»: una sola captura cubre los dos casos.
- No se probó en un teléfono ni con lector de pantalla.
