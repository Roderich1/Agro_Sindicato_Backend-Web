# Mejoras funcionales de Agrocuentas — documento de continuidad

Léase al empezar cada sesión y **verifíquese el estado real** (ramas, commits, contenedor, pruebas) antes de continuar. Actualizado al cierre de la segunda sesión del 2026-11-11 (noche; hasta 2026-11-12 00:40Z).

## 1. Objetivo y reglas acordadas

Implementar, sobre el código real de Mobile, Back y Web y conservando el trabajo local reciente (voz, formulario único, rediseño Web), las capacidades acordadas el 2026-11-11:

- **A/B. Productos e identificación con foto opcional** (etapa 1).
- **C/D/E. Convocatorias de compra conjunta** (etapa 2), con las decisiones E2-P1, E2-P2 y E2-P3 del autor.
- **F. Estimación integrada en el borrador** (etapa 3) y **avisos adicionales** (etapa 4, sin empezar).
- Transversales: sin push (la autorización de la rama de evidencia móvil **no** se extiende al código), PR, fusiones a `main`, despliegues, cierre de issues ni cambios al documento de grado; sin tocar voz ni formularios fuera del alcance; datos sintéticos y entornos aislados; no modificar la DEMO oficial; distinguir pruebas automatizadas, fallos inyectados, emulador y teléfono físico; commits como Roderich1 sin trailers.
- **Recursos:** el 2026-11-11 (noche) Roderich levantó la restricción de un agente a la vez (la RAM la saturaba el servidor Dart de VS Code; `ProyectoAgro/.vscode/settings.json` excluye `_wt`). Moderación igualmente con el emulador. La API limita los inicios de sesión (429): espaciar los guiones.

## 2. Etapa actual

- **Etapa 1: cerrada** (emulador, no teléfono).
- **Etapa 2: implementada**, con E2-P1/P2/P3 aplicadas (contrato E2 §10) y recorridas en API + Web + emulador.
- **Etapa 3: implementada** en Back y Web y recorrida en API + base + Web reales (`docs/evidence/E3_ESTIMACION_BORRADOR_Y_E2_DECISIONES_2026-11-11.md`). Contrato E3 **Propuesto**.
- Etapa 4: sin empezar.

## 3. Ramas, worktrees y commits (nada publicado salvo la rama de evidencia)

| Repo | Worktree | Rama | Desde | Commits |
|---|---|---|---|---|
| Back/Web | `_wt/ET1-BE` | `feat/etapa1-identificacion-productos` | `11bffd7` | … `ee1ecc1` |
| Back/Web | `_wt/ET2-BE` (**checkout actual**: la rama de etapa 3) | `feat/etapa2-convocatorias` | `62779e8` + ET1 | … `01bcdeb` (sin cambios) |
| Back/Web | `_wt/ET2-BE` | `feat/etapa3-estimacion-borrador` | `01bcdeb` | `0db2d0f` back E2-P2/P3 · `f673f95` back E3 · `5d760b6` web E2-P3 · `2a25386` web E3 · `2eb3ef7` · `3b2099b` · `b77965e` · `8bf84f9` E3 en módulo propio · `29c559e` `219d959` `e60df32` E3-P1 (1 + 1b) · (+ docs, evidencia y guiones de esta sesión) |
| Mobile | `_wt/ET1-MOB` | `feat/etapa1-productos-identificacion-foto` | `73a927b` | … `bce8e59` |
| Mobile | `_wt/ET2-MOB` (**checkout actual**: la rama nueva) | `feat/etapa2-convocatorias` | `bce8e59` | `6bac5a3` (sin cambios) |
| Mobile | `_wt/ET2-MOB` | `feat/etapa2-historial-colaboradores` | `6bac5a3` | `16c002c` historial y CONV-2 · `fa0fdc4` consent en historial · `b55e5af` texto de coordinación |
| Mobile | `_wt/EV-UI-MOB` | `evidence/ui-actual-2026-11-11` (**publicada**) | `279b46b` | sólo capturas |

## 4. Contratos y migraciones

- `docs/architecture/E1_IDENTIFICACION_PRODUCTOS_CONTRATO.md`.
- `docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md` (Propuesto; §10 decisiones del autor: historial, colaboradores `PARTICIPANTS`/`MANAGE`, CONV-2 sin retroactividad, matriz de visibilidad también tras el cierre y tras una revocación; §10.4 resoluciones E2-R18…R25).
- `docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md` (Propuesto; §10 resoluciones E3-R1…R12).
- Back: migraciones aditivas `…_e1_product_identification`, `…_e2_joint_purchase_calls`, `20261111230000_e2_historial_colaboradores`, `20261111233000_e3_proposal_estimation_link` (las cuatro aplicadas en `agro_demo` del entorno aislado). Módulo nuevo `src/modules/proposal-estimation/`.
- Mobile: esquema SQLite **v17** (`joint_purchase_calls.finished_at`, `joint_purchase_history_state`).
- API nueva: `/me/joint-purchase-calls/history`, `/joint-purchase-calls/{id}/collaborators[/revoke]`, `/collective/proposals/{id}/estimation-link[/prepare|/clear]`, `/collective/proposals/{id}/selection`.

## 5. Pruebas (última ejecución real, 2026-11-11/12)

| Ámbito | Resultado |
|---|---|
| Back `npm test` completo con todas las suites PostgreSQL | **945 pasan**, 0 fallan, 13 omitidas (84 suites; bases: `agro_et2_test` para las que crean su base; `agro_f02_test` para F02-D y F02-FINAL; `agro_f02v2_test` para F02 auth-v2) |
| Back E2 / E3 / F12-EST-08 PostgreSQL | 21/21 · 11/11 · 7/7 |
| Web completa | 532/532; lint 0 errores; build correcto |
| Mobile completa | 2982 pasan, 3 omitidas; `flutter analyze` sin problemas |
| Recorridos reales | E3 y E2 §10 en API + Web + emulador (evidencia E3) |

## 6. Limitaciones y decisiones pendientes

1. Nada probado en teléfono físico.
2. **E3-P1 resuelta (2026-11-12, opción 1 + 1b):** no se calcula ninguna diferencia; la vista muestra el alcance de cada cifra (F12 §2 enmendado). Medición: la necesidad la declaran más agricultores que los de cualquier cifra de consumo.
3. **E3-P2**: si la selección de productos debe quedar como trazabilidad de la convocatoria.
4. Contratos E2 y E3 pendientes de aceptación; umbral de E2-P1 (3) revisable.
5. Migración v16 → v17 con datos e historial con convocatorias antiguas: sólo en pruebas automatizadas (ver evidencia §4).
6. Rendimiento de `estimation-link` (~2,5 s con 11 líneas).
7. Observaciones menores: observaciones E1 previas (hoja de foto sin refresco, etc.). El texto en singular del teléfono se corrigió en `b55e5af`.
8. `call_id` como clave global de la copia local del teléfono (E2-R25).

## 7. Siguiente paso concreto

1. Recoger la aceptación de los contratos E2 (§10) y E3, y decidir E3-P2.
2. Etapa 4 (avisos adicionales): contrato a partir de los avisos dentro de la app de E2-D15.
3. Si se acepta, preparar la integración de las ramas (sin fusionar sin visto bueno).

## 8. Comandos para retomar el entorno sin perder datos

```bash
# Git Bash. Mismos puertos y base para E1, E2 y E3.
bash _wt/ET2-BE/tool/etapa2/et2.sh up        # contenedor agro_et1_pg (15434), migraciones, API 3350 (dist de ET2-BE), Web 5175
bash _wt/ET2-BE/tool/etapa2/et2.sh status
bash _wt/ET2-BE/tool/etapa2/et2.sh down      # conserva el volumen agro_et1_pgdata
# Tras cambiar el Back: detener la API por su puerto, `npx prisma generate`, borrar tsbuildinfo, `npm run build`, `et2.sh up`.
# Túnel temporal (sólo /api/v1/ por la compuerta; cerrarlo al terminar):
bash _wt/ET2-BE/tool/etapa2/et2.sh tunnel | untunnel
bash _wt/ET2-BE/tool/etapa2/et2.sh build-app && bash _wt/ET2-BE/tool/etapa2/et2.sh install-app
# Recorridos E3 / E2 §10 (cargar antes `. _wt/ET2-BE/tool/etapa3/e3env.sh`):
#   node tool/etapa3/web_e3.mjs $OUT abrir|generar|obtener|calculo|actualizar|preparar …
#   node tool/etapa3/web_e2_colab.mjs $OUT abrir|conceder|ver|revocar-en-vivo <convocatoria> …
#   (desde Back/) node ../tool/etapa3/e3_job.cjs ; E2_CONSENT=CONV-1 node ../tool/etapa2/participate_e2.cjs <agricultorN> <call_id> 'Producto=litros'
#   docker exec -i agro_et1_pg psql -U postgres -d agro_demo -At < tool/etapa3/counts.sql
# Pruebas focalizadas:
#   Back: E2_PG_TEST_URL=postgresql://postgres@127.0.0.1:15434/agro_et2_test npx jest joint-purchase-calls.postgres.spec.ts --runInBand
#         E3_PG_TEST_URL=… npx jest e3-proposal-estimation-link.postgres.spec.ts --runInBand
#   Back openapi:check necesita las variables de arranque (DATABASE_URL, JWT_*, SYNC_V1_FINGERPRINT_KEY*) efímeras.
#   Web:  npx vitest run --no-file-parallelism <archivos>   (desde PowerShell: en Git Bash vitest falla con «failed to find the current suite»)
#   Mobile: flutter test --concurrency=2 <archivo>
```

La API arranca con secretos generados en el momento (nunca en archivos). La app aislada `.et1` del emulador quedó activada con `agricultor15` (titular «Rosa Vargas sintetica»), sin PIN.
