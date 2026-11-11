# Rediseño de la Web institucional (Directiva): estado local de partida (2026-11-10)

Documento de la sesión coordinadora (sesión 0). Sólo describe lo comprobado en el repositorio local `Agro_Sindicato_Backend-Web` y sus worktrees; no se consultó el remoto ni se hizo push.

## 1. Repositorio Backend/Web

| Elemento | Estado comprobado |
|---|---|
| Clon principal `Agro_Sindicato_Backend-Web/` | `main` en `5973b49` (merge del PR #199). Sin cambios en archivos versionados; dos documentos sin seguimiento (`docs/GUIA_DEFENSA_BACKEND_*.md`) que no se tocan. |
| Versión más reciente del panel institucional | **`feat/web-defensa-panel` @ `8568fd1`** (worktree `_wt/WEB-PANEL`, árbol limpio, 2026-11-05). 19 commits sobre `main`, 0 por detrás. Contiene, en cadena: `feat/web-defensa-simplificacion` (`1a0becb`), `feat/web-defensa-jerarquia` (`0c2d27f`) y `feat/web-compra-conjunta-xlsx` (`920e308`, fusionada en `885c0a9`). Sólo toca `Web/`, `docs/` y `tool/demo-rica/`; **no cambia `Back/`**. |
| Otras ramas Web locales posteriores a `main`, **no** contenidas en la base | `feat/directiva-agricultores-sincronizacion` (`7fd3365`+docs): endpoint Back `collective-farmers.controller.ts` (agricultores vinculados y último envío aceptado), **sin parte Web** y **no desplegado** en la API de la DEMO. `feat/f07-variante-necesidad-inmediata` (`13afdc9`): variante experimental Back. `demo/oe3-demostracion` (`289b236`, worktree `_wt/DEMO-BE`): sólo `tool/demo`; tiene `tool/demo/demo.sh` modificado sin confirmar (puerto `DEMO_PGPORT`), que **no se toca**. `docs/propuesta-consumo-automatico` (`82960a2`): sólo docs. |
| Ramas UX antiguas | `feat/ux-web-organizacion-diseno` y `feat/ux-web-menu-avisos-csv` parten de `9233acc` (85 commits por detrás de `main`): prototipo y propuesta documental; no son base de código. |
| Instrucciones aplicables | `AGENTS.md` (raíz) y `Web/AGENTS.md` del repositorio; `CLAUDE.md` de la carpeta `ProyectoAgro` (reglas permanentes: autoría Roderich1 sin trailers, sin push/PR/fusiones, evidencia real, sin secretos). No hay `CLAUDE.md` dentro del repositorio. |

**Decisión de base:** todas las ramas del rediseño parten de **`8568fd1`**. No se usa `main` porque la versión vigente del panel contiene trabajo local posterior que se conserva.

## 2. Worktrees y ramas creados (desde `8568fd1`)

| Sesión | Worktree | Rama | Puerto Vite |
|---|---|---|---|
| A — sistema visual y navegación | `_wt/WEBR-A` | `feat/web-rediseno-a-sistema-navegacion` | 5171 |
| B — resumen y campañas | `_wt/WEBR-B` | `feat/web-rediseno-b-resumen-campanas` | 5172 |
| C — necesidades, propuestas, histórico y catálogo | `_wt/WEBR-C` | `feat/web-rediseno-c-necesidades-catalogo` | 5173 |
| 0 — integración | `_wt/WEBR-INT` | `feat/web-rediseno-integracion` | 5174 |

`Web/node_modules` se copió desde `_wt/WEB-PANEL` (misma `package-lock.json`); no se ejecutó `npm install`.

## 3. Referencia de validación en la base (`_wt/WEB-PANEL/Web`, `8568fd1`, 2026-11-10 21:29 UTC−4)

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 errores, 2 avisos preexistentes (`react-refresh/only-export-components` en los contextos) |
| `npx tsc -b` | OK |
| `npx vitest run` | 23 archivos, **225 pruebas, 225 pasan** |

## 4. Entornos disponibles para ver la Web

| Entorno | Qué es | Uso permitido en este bloque |
|---|---|---|
| DEMO oficial (`agro_demo_pg`, API **3330**, Web 5190 desde `_wt/DEMO-BE`) | Demostración del autor, datos sintéticos de la DEMO | **Sólo lectura desde la Web.** Prohibido generar borradores, estimaciones, productos, campañas o cualquier escritura. No rotar su contraseña (`password-pipe` la cambia): no iniciar sesión ahí desde guiones. |
| Copia aislada «rica» (`agro_rica_pgdata`, PG 55512, API **3342**, Web 5199 desde `_wt/WEB-PANEL`) | Copia sintética con 11 campañas (`tool/demo-rica/rica.sh`), aislada de la DEMO | Entorno de trabajo de las sesiones: `VITE_API_PROXY_TARGET=http://127.0.0.1:3342`. Inicio de sesión con `password-pipe` (nunca se imprime). Escrituras sólo si la función en prueba lo exige, y se informan. |
| Pruebas unitarias (`vitest` + jsdom) y fixtures | Respuestas simuladas | Casos extremos (`break-ui`) y variantes (`prototype`): siempre con fixtures sintéticos, nunca alterando datos de un servidor. |

## 5. Repositorio de skills consultado

`https://github.com/emilkowalski/skills`, commit **`715c1807e08c497cfd1dc4feb450a2a3300ef2a9`** (2026-11-09 13:07 +0100, «Update README.md»), clonado en el scratchpad de la sesión. Se leyeron íntegros antes de usarlos: `emil-design-eng`, `prototype` (+ `PICKER.md`), `break-ui` (+ `CATALOG.md`), `mobile-native`, `review-animations` (+ `STANDARDS.md`) y `remove-animations`. No se usa «Taste Skill» ni el resto de la colección. Observación: `prototype` y `review-animations` declaran `disable-model-invocation: true` (sólo bajo invocación explícita, como aquí); sus «respuestas iniciales» no aplican porque siempre se invocan con una tarea concreta. Las reglas de negocio, accesibilidad y arquitectura de Agrocuentas prevalecen sobre sus recomendaciones genéricas.
