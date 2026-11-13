# Rediseño de la Web (v2): sesión A, evidencia del 2026-11-13

- **Rama y worktree:** `feat/web-rediseno-v2-a` en `_wt/WEB2-A`, desde `77195bf` (BASE) más la fusión `76beffd` (correcciones de BASE).
- **Alcance:** láminas 03, 04, 05 §1–12, 06, 07, 08, 25, 26, 27, 35, 36, 40 y 51; uniones U.1, U.2, U.3, U.5, U.8 y U.9.
- **Fuera de alcance:** sin cambios en Backend, `services/**`, `types/**`, permisos ni contratos. Sin push ni PR.

## 1. Commits

| SHA | Qué hace |
|---|---|
| `c6660c0` | Resumen (03, 35), estados 05 §1–11, panel de sellado con `ConfirmDialog` y Cobertura (04) |
| `ee77ea3` | Borrador de compra (06, 07, 08, 36, 51), U.3 `?borrador=` y H-09 |
| `157899c` | Histórico sellado (25, 40), Estimación del consumo (26) y copia sin conexión (27) |
| `aef9fa4` | Ajustes tras comparar con 25 y 26; plan de la pasada final |
| `c881941` | El sellado bloqueado conserva «todavía no se puede sellar» (lo comprueba `src/dev`) |

## 2. Verificación (2026-11-13, carpeta `Web/`, sobre `c881941`)

| Comando | Resultado |
|---|---|
| `npx tsc -b` | Sin salida, código 0 |
| `npx eslint <los 30 archivos de src tocados por A>` | Sin salida, código 0 |
| `npx vitest run src/pages/collective-summary src/pages/coverage src/pages/joint-proposal src/pages/estimation src/pages/history src/pages/collective-trends src/components/needs-bars src/components/seal-panel src/pages/campaign-detail` (antes de `c881941`) | `Test Files 18 passed (18)` · `Tests 161 passed (161)` |
| `npx vitest run src/dev/prototypes/resumen/harness.test.tsx src/components/seal-panel src/pages/collective-summary src/pages/campaign-detail` (sobre `c881941`) | `Test Files 6 passed (6)` · `Tests 74 passed (74)` |
| `npx vitest run src/components/__tests__ src/App src/components/app-shell src/components/redirect-with-query src/components/collective-route` | `Test Files 6 passed (6)` · `Tests 117 passed (117)` |
| `npx vitest run src/contexts/campaign.context.test.tsx` | **1 fallo**: espera un `h1` /Necesidades/ en `/colectivo/propuestas`; el título de la lámina 06 es «Borrador de compra». El archivo es del orquestador (ver el informe) |

No se ejecutó la suite completa (la corre el orquestador).

## 3. Capturas

- **Herramienta:** `tool/web_rediseno_v2/capture_base.mjs` (de BASE) con `plan_a_resumen.mjs`, `plan_a_borrador.mjs` y `plan_a_historico.mjs`.
- **Entorno:** Vite propio en 5181 → API aislada 3350 (datos sintéticos), Edge sin interfaz, cuenta `directiva` con contraseña de un solo uso que no se imprime. Vite 5181 detenido al terminar.
- **Anchos:** 1440, 1280, 820 y 390 por ancho de navegador (no es un teléfono físico), y 720×450 a 2x para el zoom al 200 %.
- **Simuladas** (nombre con `SIMULADO`): 05 §1 cargando, §7 error 500, §8 403 y §9 429, con respuestas falsas sólo de `GET …/summary`.
- **Escrituras:** ninguna en el servidor. «Guardar copia» hace `GET /estimation/download` y guarda sólo en el navegador de captura, que se descarta. Una casilla del borrador se marcó sin guardar.
- **Llamadas al entrar** (registro del plan): el borrador sólo hace `GET` (`proposals`, `proposal`, `estimation-link`, `selection`); abrir el detalle técnico añade `GET /estimation/runs/<id>`. El histórico y la estimación también sólo `GET`.
- **Desplazamiento horizontal:** `MEDIDA` sin desbordar en Resumen, Borrador, Histórico y Estimación a 1440, 390 y 200 %. La primera pasada del Borrador desbordaba a 1440 (1482 px) por celdas `ui-num` sin salto; se corrigió antes de `ee77ea3`.
- `_capturas.json` acumula las pasadas, también las repetidas; vale la última de cada archivo.

| Carpeta | Contenido |
|---|---|
| `resumen/` | 03 a 1440, 1280 y 820; búsqueda, filtro «Ocultas» y «Sin coincidencias» (05) |
| `estados/` | 05 §1, §7, §8 y §9 (simulados) |
| `cobertura/` | 04 a 1440 y 1280 |
| `borrador/` | 06 (1440, 1280 y 820), barra con un cambio sin guardar, 07, 08 y el detalle técnico abierto |
| `historico/` | 25 con «Consumo publicado» y con «Necesidad declarada» |
| `estimacion/` | 26 y «Llevarla sin conexión» tras guardar la copia |
| `copia/` | 27, estados 1 (copia legible), 2 (sesión abierta sin copia) y 3 (sin sesión) |
| `telefono/` | 35, 04, 36, 51, 40 y 26 a 390 |
| `zoom200/` | Resumen, Borrador e Histórico al 200 % |

En las capturas de página entera, la barra lateral y la barra inferior fijas, y la barra pegajosa del borrador, quedan donde estaban en la primera pantalla: es un efecto de la captura.

Las capturas del Resumen se tomaron antes de `c881941`: el panel de sellado bloqueado decía «Sellar: disponible al cerrar.» y ahora añade «; todavía no se puede sellar.».
