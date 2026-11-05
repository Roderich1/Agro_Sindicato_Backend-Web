# Web de la Directiva: simplificación para la defensa (2026-11-05)

**Rama:** `feat/web-defensa-simplificacion` (worktree `_wt/WEB-DEFENSA`, desde `origin/main` 5973b49).
**Commit verificado:** `b5afd30f71aa5fb48c9f939f55a780962982cfbd`.
**Alcance:** sólo `Web/` (React), sus pruebas y esta evidencia. Sin cambios de API, Backend, migraciones, permisos, política de divulgación ni app móvil.
**Datos:** copia aislada de la DEMO sintética del PR #201 (ver §1). Ningún dato real.

## 1. Entorno

La DEMO oficial (`tool/demo/demo.sh`, API 3330 y Web 5190) la usa la sesión de la app móvil y se detuvo a las 14:34Z. Para no interferir y para poder ensayar acciones que escriben (generar borrador, generar estimación), se montó una **copia aislada**:

| Pieza | Valor |
|---|---|
| Volumen | `agro_webdef_pgdata`, clon de `agro_demo_pgdata` (`docker run --rm -v agro_demo_pgdata:/from:ro -v agro_webdef_pgdata:/to alpine cp -a /from/. /to/`, 66 MB) |
| PostgreSQL | contenedor `agro_webdef_pg`, 127.0.0.1:55510 |
| API | `_wt/DEMO-BE/Back/dist` (Back idéntico a main en 5973b49), 127.0.0.1:3340, mismas variables que `demo.sh up` |
| Web | Vite del worktree, http://127.0.0.1:5195, `VITE_API_PROXY_TARGET=http://127.0.0.1:3340` |

`demo-central.cjs verify` contra la copia (2026-11-05 15:13:33Z, tras el recorrido; igual al de las 14:44Z salvo «trabajos de estimación», registros que sólo se añaden y no cambian cifras):

```
Members activos: AGRICULTOR 6, DIRECTIVA 1, ADMINISTRADOR 1
campaña Invierno 2015…2018 (DEMO): CERRADA, sellada · Invierno 2026 (DEMO): ABIERTA
  Fungicida DEMO · DECLARED_NEED: DISCLOSED 53 L · aportantes 3
  Herbicida DEMO · DECLARED_NEED: DISCLOSED 250 L · aportantes 5
  Insecticida DEMO · DECLARED_NEED: SUPPRESSED_UNDER_THRESHOLD (sin cifra)
aportaciones: DECLARED_NEED ACTIVE 10, CONSUMPTION_TOTAL ACTIVE 18
sellados: 4; trabajos de estimación: COMPLETED 5
```

Las contraseñas de un solo uso de la Directiva DEMO y la Administración DEMO salieron sólo por la tubería `password-pipe` hacia el navegador automatizado; no se imprimieron ni se guardaron.

## 2. Comprobaciones (en `Web/`, commit b5afd30)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `npx vitest run` | 17 archivos, **170 pruebas, 170 pasan** | 2026-11-05 15:12:54Z |
| `npx eslint .` | 0 errores, 2 avisos preexistentes (`react-refresh/only-export-components` en `auth.context.tsx` y `campaign.context.tsx`, ya presentes en main) | 15:13:03Z |
| `npm run build` (`tsc -b && vite build`) | OK (366 ms); PWA 27 entradas precacheadas (733 KiB) | 15:13:17Z |

Pruebas ajustadas (dos cadenas): etiqueta del selector «Campaña (filtro aplicado)» → «Campaña» (`joint-proposal.reference.test.tsx`) y región «Consumo» → «Consumo registrado» (`collective-summary.page.test.tsx`). Ningún `data-testid` ni mensaje de estado cambió.

## 3. Recorrido en el navegador (Edge sin interfaz, 1366×900, datos sintéticos)

`recorrido-directiva.log` y `recorrido-admin.log` (15:09–15:11Z) registran, por rol, la URL, el `h1` y el tamaño del texto de cada vista. Navegación dentro de la SPA (menú lateral y selector de campaña), con el mismo perfil institucional.

**Directiva** — menú: Resumen colectivo · Necesidades y propuesta · Cobertura · Tendencias · Estimación del consumo · Reconciliación · Campañas.
**Administrador** — el mismo menú más Usuarios; las vistas colectivas se muestran igual; Campañas y Usuarios conservan sus acciones (`admin-campanas.png`, `admin-usuarios.png`).

Comprobado en cada vista prioritaria:

| Vista | Filtro de campaña | Acción principal | Estados sin cifra |
|---|---|---|---|
| Resumen colectivo | Invierno 2026 (abierta) y 2018 (cerrada y sellada) | Actualizar; sellado reducido a una línea mientras no se puede sellar; versión sellada en franja (`despues-resumen-sellado.png`) | Insecticida «Oculto» con el motivo del umbral; «Consumo registrado» sin aportaciones: «Eso no significa cero» |
| Necesidades y propuesta | Invierno 2026 | «Generar propuesta (borrador)» en la barra; «Ver último borrador» sin generar uno nuevo; «Exportar CSV» en el borrador | Necesidad oculta sin cifra; estimación de referencia «Datos insuficientes · No utilizable» sin cifra; «Sin estimación» |
| Estimación del consumo | Invierno 2026 y 2018 | «Generar estimación» + «Exportar CSV de la consulta» en la barra; campaña cerrada: botón deshabilitado y motivo (`despues-estimacion-cerrada.png`) | Fungicida «Datos insuficientes» con motivo, «Sin cifra», vigencia «No utilizable»; copia sin conexión con su aviso |

Las cifras mostradas coinciden con `verify` y con el guion de la DEMO (§6 de `docs/demo/DEMO_AGROCUENTAS.md`): Herbicida 250 L / 5 aportantes, Fungicida 53 L / 3, Insecticida oculto; estimación Herbicida SES 111 L, naive 116 L, α 0,50, serie 96 · 120 · 104 · 116 L.

## 4. Capturas antes / después

| Vista | Antes (main 5973b49, DEMO 5190) | Después (b5afd30, copia 5195) |
|---|---|---|
| Resumen colectivo | `antes-resumen.png` | `despues-resumen.png` |
| Necesidades y propuesta (borrador abierto) | `antes-propuestas-borrador.png` | `despues-propuestas-borrador.png` |
| Estimación del consumo | `antes-estimacion.png` | `despues-estimacion.png` |

Además: `despues-resumen-sellado.png`, `despues-estimacion-cerrada.png`, `admin-campanas.png`, `admin-usuarios.png`.

## 5. Qué se simplificó

- **Barra común** (`CollectiveToolbar`): la campaña elegida y su estado siempre a la vista; la acción principal de la vista a la derecha. La cabecera conserva la campaña **activa** del sindicato, rotulada «Activa» para no confundirla con el filtro.
- **Avisos**: la explicación de cada vista pasa a una línea de texto; el aviso «Modo provisional con datos sintéticos» se mantiene en una franja compacta en todas las vistas; errores, permisos, política pendiente, «Datos insuficientes», cifras ocultas o retiradas, vigencia y sin conexión conservan su mensaje.
- **Cobertura y versión sellada**: franjas de dos líneas en lugar de tarjetas con párrafo.
- **Tablas**: el estado va como etiqueta junto al producto y «datos hasta» bajo la cifra; Resumen pasa de 5 a 3 columnas, Propuesta de 6 a 4 (la estimación sigue en columna separada, rotulada «referencia»), Estimación de 9 a 7 (α, campañas observadas y cobertura se agrupan en «Serie observada»).
- **Estimación**: sin bloque «Organización» (ya está en el menú lateral) ni aviso grande; los productos a estimar se pliegan; el historial omite recuentos en cero; la copia sin conexión ocupa una tarjeta breve.
- **Propuesta**: acceso directo al último borrador; historial con enlace «Ver»; nota de la referencia en texto pequeño con enlace a Estimación.
- **Sellado**: una línea con los motivos mientras no se puede sellar; la revisión completa sólo cuando sellar es posible.
- **Textos**: «Campaña(s)», «Bitácora», «Período operativo»; marca «Agrocuentas» en menú, pestaña y login (el login describía un inventario con modo sin conexión que la Web institucional no tiene).

Conceptos que siguen separados y sin sumar: necesidad declarada, consumo registrado, propuesta de compra conjunta (borrador) y estimación del consumo. Ninguna ausencia se muestra como cero. Permisos, exportaciones CSV y la copia sin conexión no cambian.

## 6. Observaciones que exigen Backend o móvil (no resueltas aquí)

1. **`POST /auth/refresh` limitado a 5 por minuto por IP** (`@Throttle` en `auth.controller.ts`): varias pestañas o recargas rápidas de la Web expulsan la sesión (429 → inicio de sesión). Durante el recorrido automatizado obligó a navegar dentro de la SPA. Conviene revisar el límite o exceptuar el refresco.
2. **`notice` del servicio de estimación (INT-09)** repite la explicación de la vista («Referencia calculada a partir de cifras publicadas; no es una necesidad ni una propuesta…»). La Web lo sigue mostrando por contrato; acortarlo es decisión del Backend.
3. **Campaña activa vs. elegida**: la cabecera muestra la activa (`GET /campaigns/active`) y cada vista filtra por la elegida. No hace falta Backend; se rotuló «Activa» para distinguirlas.

## 7. Limitaciones

- Verificado con datos sintéticos en Edge de escritorio (1366×900); no se revisó en teléfono ni en Firefox/Safari.
- Las acciones que escriben (sellar, generar) se ejercitaron sólo contra la copia aislada; «Generar propuesta» y «Generar estimación» están cubiertas por las pruebas unitarias con servicios simulados y, en la copia, se comprobó el estado deshabilitado en campaña cerrada.
- La DEMO oficial (3330/5190) no se tocó; su base no se reinició ni se volvió a sembrar.
