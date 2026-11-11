# Sesión B — Recorrido de sólo lectura con la copia «rica» (2026-11-10, 23:30 UTC−4)

Código: rama `feat/web-rediseno-b-resumen-campanas` en `bd27a34` (integración `f213f6b` fusionada + Resumen «Analítica comparativa»). Vite de este worktree (`127.0.0.1:5172`, `VITE_API_PROXY_TARGET=http://127.0.0.1:3342`). Copia «rica»: API 3342, PG 15433. Edge sin interfaz (puppeteer-core), `prefers-reduced-motion: reduce` emulado en todo el recorrido. Inicio de sesión de la Directiva con la contraseña de un solo uso de `password-pipe` (`DEMO_PG_ADMIN_URL` y `DEMO_API` apuntando a la copia rica); la contraseña no se imprimió ni se guardó. Navegación siempre dentro de la SPA. La DEMO oficial (3330) no se usó.

Registro completo: `b_capturas_rica/recorrido-rica.log`; todas las peticiones (método y ruta): `b_capturas_rica/peticiones.txt`; 22 capturas `b_capturas_rica/*.png`. El guion (fuera del repositorio) queda en el scratchpad de la sesión.

## Resultado: todas las comprobaciones OK

| Vista | Qué se comprobó | Resultado real |
|---|---|---|
| Resumen, «Invierno 2026 (DEMO)» (ABIERTA, activa, sin sellar) | Cada fila contra el JSON de `GET …/summary`: cifra exacta (réplica de `formatQuantity`), aportantes, barra sólo en necesidades > 0; filas no publicadas sin número, barra ni cero | 15 de 15 filas iguales (11 publicadas, 4 ocultas por privacidad); cobertura «13 de 15» = API; «Cifra más reciente» presente; «Sin sellar»; «Pendiente según los datos»: cambios sin publicar (2 filas) y revisar borrador |
| Resumen, «Invierno 2025 (DEMO)» (CERRADA, sellada v1) | Ídem | 9 de 9 filas iguales; cobertura «14 de 14» = API; «Versión 1 sellada» |
| Resumen, «Invierno 2024 (DEMO)» (CERRADA, sellada v1) | Ídem | 9 de 9 filas iguales; cobertura «13 de 14» = API |
| Campañas | Filas = API; «Activa» sólo con `isActive`; «Fin estimado vencido» según la regla; «Cerrada el …» sólo con `closedAt` | 12 filas = 12 campañas; 1 activa; 0 vencidas (ninguna ABIERTA con fin estimado pasado: coincide con la regla); «Cerrada el …» exactamente en las filas con `closedAt` |
| Detalle `/campaigns/:id` (desde «Ver detalle») | Ruta, título, cobertura | Ruta correcta; `h1` = nombre; cobertura «13 de 15» = API; 2 borradores listados |
| Cobertura (desde «Ver cobertura» del detalle) | Cifra y hueco de sincronización | «13 de 15» = API; «Todavía sin consulta del servidor» |
| Teclado (Resumen, 1366) | Tab desde el inicio del contenido | Orden: selector de campaña → Actualizar → Descargar Excel → Revisar borrador → Ver cobertura → Abrir Necesidades y propuestas; todas con foco visible (contorno) |
| Anchos | 1366×768, 390×844, 320×568; zoom 200 % (683×384, DSF 2) en el Resumen | Sin desplazamiento horizontal de la página en ninguna captura (la píldora de la cabecera ya corregida por A no desborda a zoom 200 %) |

## Peticiones

- 20 peticiones a la API: 17 `GET`, 3 `POST`, todas de sesión (`/auth/refresh` ×2 al abrir `/login`, `/auth/login` ×1). **Escrituras de negocio: 0** (ni borradores, ni campañas, ni sellado, ni estimaciones).
- `GET …/summary`: 5, una por vista visitada (Resumen de las tres campañas, detalle y Cobertura de la activa). **Observación:** sobre «Invierno 2026 (DEMO)», sin sellar, cada una de esas lecturas ejecuta la decisión de divulgación en el servidor (matriz, tabla C). Es la lectura existente de la Web y no se bloqueó; la Web no la repite por StrictMode ni la recarga sola.
- Además, `password-pipe` fija una contraseña de un solo uso para la Directiva en la base de la copia rica (es su mecanismo de inicio de sesión).

## Errores de consola

2, ambos «Failed to load resource: 401» de `/auth/refresh` al abrir `/login` sin sesión (esperado). Ninguno de la aplicación.

## Lo que no se pudo cubrir

- La copia rica no tiene ninguna campaña sin cifras ni PLANIFICADA ni con fin estimado vencido: esos estados quedan cubiertos sólo por las pruebas con fixtures y el break-ui (`b_BREAK_UI_2026-11-10.md`).
- La copia tiene 12 campañas (no 11): 1 ABIERTA activa y 11 CERRADAS; sólo se visitaron 3 resúmenes para no ejecutar decisiones de divulgación de más.
- Todo es emulación de escritorio: **nada probado en teléfono**.
