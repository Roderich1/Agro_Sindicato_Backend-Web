# F10 — Suplemento de base para la serie 3 acotada (POCO, A1/A1-F) tras la corrección de MOB #129 (2026-10-18)

- **Qué es:** registro exigido por el protocolo v1.3 §0.1 y el guion §5.2 para una repetición acotada tras integrar una corrección (MOB #129, presentación con fuente grande). Fija la base nueva, el equipo, qué se repite y con qué fin observable, y qué no se repite. Encargo de Roderich Rendón del 2026-10-18 (§3 «A realiza la repetición física acotada»), con su indicación posterior: el POCO es el teléfono conectado; el HONOR ya no lo está.
- **Qué no es:** no cambia umbrales, repeticiones ni criterios de la v1.3; no decide GATE-F10 (BE #49); no declara RNF-08 cumplido globalmente; no mide usabilidad ni voz. **A4/A4-F (HONOR) no se repiten con el POCO** (simétrico a «el POCO no se considera repetido mediante el HONOR»): el NO CUMPLE de A4-F en M8 de la serie 2 se conserva tal cual hasta una repetición real en el HONOR.

## 1. Base de la serie 3

| Componente | Serie 2 | **Serie 3** | Comprobación |
|---|---|---|---|
| Mobile | `ad5b43d` | **`9cbd565`**, HEAD del PR MOB #131 (`fix/f10-compat-129-presentacion`, sobre `main` `1a29869`); **código de `lib/` = `27c4654`** (los commits posteriores sólo tocan `test/` y `docs/evidence/`). Cambios de `lib/` frente a `ad5b43d`, sólo presentación: `lib/presentation/app_shell.dart`, `screens/dashboard_screen.dart`, `screens/purchase_form_screen.dart`, `widgets/adaptive_entity_picker.dart`, `widgets/common.dart`. **Estado de integración:** PR #131 con LISTO de B (sobre `a833df7`, `lib` idéntico) y CI `a833df7` 39163641147 SUCCESS; la integración a `main` la hace A con CI verde de `9cbd565` o, si el control de permisos la rechaza (como a MOB #128), queda para Roderich. Como `main` no cambió desde `1a29869`, el árbol del merge es el de `9cbd565`: la APK se compila desde `9cbd565` y la evidencia registra el SHA del merge si existe al medir | CI de `a833df7` SUCCESS; CI de `9cbd565` (docs) en curso al escribir esto; `git diff --stat 27c4654 9cbd565 -- lib` vacío (verificado por A) |
| Backend + Web | `6c54c00` (código `cab433d`) | **la misma**; `main` posterior sólo añade docs (#139, #140) | `git log cab433d..origin/main -- Back/src Back/prisma Web/src` vacío |
| Protocolo | v1.3 `9bfcad2` | la misma | — |
| Herramientas | `tool/f10_eval/` de `758d9fe` (PR #128) | **PR #128 no está integrado** (merge rechazado por el control de permisos; queda para Roderich). Se usa la herramienta de la rama `eval/f10-serie2-mobile-tools` en `758d9fe` copiada al entorno local (no cambia `lib/`), con los valores por defecto del POCO (1080 px, regiones de la serie 1, `pointer_location` como inicio); el instrumento de R2 necesita «Confirmar compra» (MOB #103), que la herramienta de `main` (`ad5b43d`) no reconoce | SHA de la herramienta `758d9fe` registrado en la evidencia |

## 2. Equipo: POCO X5 Pro 5G como A1 / A1-F (DEVICE)

- `ro.product.model` 22101320G, Android 12 / API 31, MIUI V14, 1080×2400, 440 dpi (≈ 392,7×872,7 px lógicos a DPR 2,75), barra de navegación de tres botones, 120 Hz. Mismo equipo de la serie 1.
- A1 = `font_scale` 1,0 (valor propio del equipo, se confirma antes); A1-F = `font_scale` 1,3 (se anota y se restaura).
- Copia aislada nueva `com.comunidad.agro.agroquimicos.f10eval3` («Agrocuentas F10-EVAL3»), profile, compilada desde el worktree limpio de la base con `build_profile_apk.sh`; `aapt2` y SHA-256 antes de instalar; `pm list packages` después (app normal, `.f10eval`, `.f10c23x/y`, `.f10s18*`, `.f03*`, `.f04*`, `.f06d4`, `.f08bkp`, `.f10bkp` intactas). Activación con una cuenta sintética y siembra DS-V (`seed_dsv_mobile.dart`, semilla 20261016): preparación, no caso M1.
- Entorno nuevo `agro_a_f10eval3_pg` / `agro_a_f10eval3_pgdata`, PG 55457, API 3134, observador 3135; Backend `6c54c00` compilado; `NODE_ENV=production`; sin túnel salvo que se necesite red (R4 no se repite). Entornos de las series 1 y 2 intactos.

## 3. Qué se repite y con qué fin observable

| Caso | Se repite | Alcance y fin observable | Motivo |
|---|---|---|---|
| **M8 Presentación, A1 y A1-F** | **Sí** | Todas las pantallas afectadas por #129 y #97: Inicio (tarjetas, FAB «Nuevo», último elemento de las listas y desplazamiento), Nueva compra (selector de producto, cabecera «Productos (n)», barra de título), Nueva aplicación, Sincronización, barra de pestañas; con escala 1,0 y 1,3. Criterio v1.3 M8: sin controles tapados ni textos cortados; además, sin palabras partidas de forma incomprensible y nombre de producto legible completo en el contexto de selección | corrección integrada; A1-F NO CUMPLE M8 (#97) sólo se cierra midiendo aquí |
| **Flujo de compra (M3) en A1-F** | **Sí, si** #129 cambió selectores o botones del formulario de compra | compra de 2 líneas completada sin errores (+1 compra, +2 líneas) | verificar que el flujo puede completarse |
| **R1 arranque N0, A1** | **Sí**, 10 + 1 | **Fin completo de §1.5:** tarjetas con importes **y filas de la tabla de existencias**, sin indicador de carga. **Comprobación previa hecha el 2026-10-18 ~20:20Z en el POCO con la copia de la serie 1 (`.f10eval`, `dff6802`, fuente 1,0, sin medir):** bajo la cabecera «Inventario proyectado» y el buscador entra en pantalla la **primera fila** de la tabla («DSV-001 Producto sintético», y 1 982–2 040 px) con las etiquetas de sus celdas («Físico · Comprometido · Proyección») cortadas por la barra de pestañas (y ≥ 2 050); los valores de esa fila quedan bajo la barra. **Método propuesto para revisión:** fin = primer cuadro estable en que, además de las tarjetas con importes, aparece la primera fila de la tabla con su nombre (la fila se construye con sus valores en el mismo cuadro: nombre y valores salen de la misma consulta y del mismo elemento de la lista; lo que la barra de pestañas tapa es recorte, no carga pendiente). Región de fin: 0,700–1080×1350 como en la serie 1 (cubre tarjetas, cabecera y la primera fila). **No se cuenta la cabecera como filas.** Si B o C consideran que una fila con los valores tapados no es «tabla con filas», la alternativa es un gesto de desplazamiento inyectado a un tiempo fijo tras el arranque, registrado en el vídeo y **contado dentro del tiempo medido** (no se excluye); se decide antes de medir y se escribe aquí. La comprobación se repite sobre la copia `.f10eval3` (la corrección de #129 puede mover el botón «Nuevo» o la tabla) con un volcado y un cuadro antes de la serie | R1 de la serie 2 quedó BLOQUEADA por fin parcial; base nueva |
| **R2-b compra 2 líneas N0** | **Sólo si** #129 cambió el formulario de compra (widgets o recorrido medido) | como la serie 1 (instrumento R2-b) | — |
| **R3 saldo DSV-001** | **Sólo si** cambian sus componentes o el recorrido medido | como la serie 1 | — |
| R4, R5, R6 | **No** | — | sin cambio que los afecte |
| M1, M2, M4–M7 | **No** | conservan sus resultados (serie 1 sobre `dff6802` para A1/A1-F; serie 2 para A4/A4-F) | fuera del alcance acotado |
| A2, A3, A5, A4/A4-F | **No** | permanecen como están | equipo no conectado / sin imagen |

**Campañas:** la DS-V sembrada (desde el 30/09/2025, sin fin) contiene la fecha de hoy, así que una compra de R2 (si se repite) cae en ella sin preparación; no hay vínculo central ni R4. No se repite la preparación de la serie 2.

## 4. Ventanas

V0: B y C revisan este suplemento (y A no mide). V1: A prepara entorno, APK, activación, siembra, ensayo de herramienta (sin series). V3: A mide R1 (y R2/R3 si aplica) con B y C sin compilar ni medir. V4: M8 A1 y A1-F (y M3 si aplica). V5: revisión de C; B revisa también. GATE-F10 sigue Pending.

## 5. Evidencia

`docs/evidence/F10_RENDIMIENTO_MOBILE_S3.md`, `docs/evidence/F10_COMPATIBILIDAD_MOBILE_S3.md` (A1/A1-F tras #129, M8 y, si aplica, M3), `docs/evidence/f10_eval_s3/` (CSV saneados, condiciones). Los archivos de las series 1 y 2 no se editan. Un fallo se conserva en su fila; ningún umbral cambia; procedencia DEVICE.

## 6. Revisión previa (fechas reales, por versión)

| Sesión | Versión | Hora UTC | Resultado |
|---|---|---|---|
| B | | | |
| C | | | |
