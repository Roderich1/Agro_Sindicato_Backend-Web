# Variante «threshold-only» para la necesidad declarada: ensayo con datos sintéticos (2026-11-05)

**Rama:** `feat/f07-variante-necesidad-inmediata` (worktree `_wt/B-POL-VARIANTE`, desde `origin/main` 5973b49).
**Commit de código verificado:** `46565f3` (sólo `Back/src/modules/collective`, `Back/src/config/env.schema.ts` y `tool/experiments/`).
**Estado:** variante **experimental, no aprobada**. #107 (F07-POL-01) sigue abierto; la divulgación real sigue deshabilitada; la variante se ignora en producción. No se tocó la DEMO oficial, el móvil ni el PR #172.

## 1. Qué cambia y qué no

| Celda / canal | Regla |
|---|---|
| `DECLARED_NEED` con `COLLECTIVE_DECLARED_NEED_RULE=threshold-only` (sólo fuera de producción) | **Sólo la regla 1 (k = 3):** con tres agricultores distintos se publica el total **actual** en cada lectura; con menos, se oculta (`SUPPRESSED_UNDER_THRESHOLD`) y se retira la cifra anterior. Un estado idéntico al de la última cifra la repite sin nueva divulgación. |
| `DECLARED_NEED` sin la variable (o en producción) | Regla vigente de combinaciones (F10-SEC-02, §9 de la política). |
| `CONSUMPTION_TOTAL` | Regla vigente, siempre. |
| Sellado (revisión y sellado) | Regla vigente, siempre: `collective-seal.use-case` fuerza `combinations`, así que una versión sellada nunca depende de la variante. |
| Tendencias y estimación | Leen versiones selladas: sin cambio. |

**Lo que la variante revela (por diseño, a evaluar):** comparar dos cifras consecutivas de la misma celda da el cambio neto de quien entró, salió o cambió. En el ensayo, 30 L y luego 38 L revelan **+8 L**: la necesidad declarada por el cuarto agricultor, a cualquier lector autorizado (Directiva o Administrador) que guardara la cifra anterior. La regla vigente evita exactamente eso manteniendo 30 L «con cambios pendientes» hasta que cambien al menos k agricultores. Ninguna de las dos reglas hace anónimos los datos (§0 de la política).

## 2. Pruebas unitarias (en `Back/`, commit 46565f3)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `npx jest src/modules/collective --testPathIgnorePatterns postgres` | 5 suites, **55 pruebas, 55 pasan** (14 nuevas en `disclosure-policy.spec.ts`: dos → oculto, tres → 30 L, cuarto → 38 L al instante frente a `SHOW_PRIOR` pendiente con la regla vigente, reenvío sin nueva divulgación, retirada bajo el umbral con retiro de la cifra anterior, y `decideCells` aplicando la variante sólo a `DECLARED_NEED`) | 2026-11-05 16:38:52Z |
| `npm run build` (`nest build`) | OK | 16:37:02Z |
| `npx eslint "src/modules/collective/**/*.ts" src/config/env.schema.ts` | 0 errores en los archivos tocados del módulo; `env.schema.ts:87 'URL' is not defined` es **preexistente** en main (línea idéntica, fuera del cambio) | 16:39:05Z |

## 3. Ensayo contra el Backend real (copia sintética aparte)

Copia **independiente** de la DEMO: volumen `agro_webdef2_pgdata` (clon de `agro_demo_pgdata`), contenedor `agro_webdef2_pg` en 55511, API `Back/dist` de esta rama en 3341 con las mismas variables que `demo.sh up` más `COLLECTIVE_DECLARED_NEED_RULE`, Web en 5196. `supervisor-extracto.log`: identidad `tenant demo-sintetico` comprobada; arranques 16:39:29Z (threshold-only), 16:40:56Z (combinations, control) y 16:41:07Z (threshold-only de nuevo).

Guion: `tool/experiments/necesidad-umbral.cjs` (derivado de `tool/demo/demo-central.cjs`): cada aporte es un `POST /sync/v1/push` real (sesión v2 del agricultor sintético, `operationId` determinista), cada retirada un `CANCEL` causal sobre su `PUBLISH`, y cada lectura un `GET /collective/campaigns/:id/summary` como la Directiva. Nada se calcula ni se simula en el navegador. Campaña «Invierno 2026 (DEMO)», productos nuevos «Acaricida … (DEMO)» en L (10 L = 10 000 mL). Contraseñas de un solo uso sólo en memoria.

### 3.1 Variante `threshold-only` (`experimento-threshold-only.log`, 16:39:46–16:39:50Z)

| Paso | Aportes activos | Respuesta del servidor |
|---|---|---|
| 1 | Beto 10 L | `SUPPRESSED_UNDER_THRESHOLD`, sin cifra |
| 2 | + Carmen 15 L | `SUPPRESSED_UNDER_THRESHOLD`, sin cifra |
| 3 | + Darío 5 L | **`DISCLOSED` 30 L · 3 aportantes** |
| 4 | + Elena 8 L | **`DISCLOSED` 38 L · 4 aportantes**, actualizado en la misma lectura |
| 5 | reenvío de Elena (mismo `operationId`) | ACK `ALREADY_APPLIED/OK`; sigue **38 L · 4** (no se duplica) |
| 6 | `CANCEL` de Elena | **30 L · 3**, `data_as_of` vuelve al del paso 3 |
| 7 | `CANCEL` de Darío | **`SUPPRESSED_UNDER_THRESHOLD`**, sin cifra (quedan 2) |

### 3.2 Control con la regla vigente (`experimento-combinations.log`, 16:40:57–16:41:00Z)

Misma secuencia sobre «Acaricida CTRL (DEMO)» con la API reiniciada en `combinations`:

| Paso | Respuesta |
|---|---|
| 1–2 | ocultas |
| 3 | `DISCLOSED` 30 L · 3 |
| 4 | **`DISCLOSED` 30 L · 3 · cambios pendientes** (el +8 L de un solo agricultor no se publica) |
| 5 | igual que 4 (`ALREADY_APPLIED`) |
| 6 | 30 L · 3, sin pendientes (vuelve exactamente al estado publicado) |
| 7 | `SUPPRESSED_UNDER_THRESHOLD` |

La diferencia entre ambas está sólo en el paso 4: es la decisión que #107 debe tomar.

### 3.3 Web

`experimento-web-hasta-4.log`: tercer producto «Acaricida WEB (DEMO)» dejado en el paso 4. `web-resumen-variante-38L.png` (Edge sin interfaz, Directiva, http://127.0.0.1:5196/colectivo/resumen, 16:4xZ): la fila muestra «Publicado · 38 L · 4 · 5 nov de 2026, 12:41 p. m.» con la Web de `main` sin cambios; las filas de VAR y CTRL aparecen «Oculto» porque terminaron con dos aportantes. La Web sólo muestra lo que decidió el servidor.

## 4. Limitaciones

- Datos sintéticos; k = 3 provisional. La variante no se habilita en producción (`CollectiveConfig` la ignora con `NODE_ENV=production` y lo registra).
- No se ensayó el sellado de una campaña con celdas decididas por la variante; por código, la revisión y el sellado fuerzan la regla vigente, con cobertura unitaria indirecta (`decideCells` sin opción = regla vigente).
- No se midió la regla de combinaciones frente a la memoria de divulgación (§10 de la política) con la variante activa: las divulgaciones que la variante crea quedan en `CollectiveRelease` y la regla vigente las tiene en cuenta si se desactiva la variable.
- No es una revisión de privacidad ni una aprobación: sólo mide el comportamiento pedido.
