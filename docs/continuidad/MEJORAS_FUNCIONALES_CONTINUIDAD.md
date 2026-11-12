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
- **Etapas 1–3: cerradas** el 2026-11-12 (emulador, no teléfono físico). Contratos E2 y E3 **aceptados en las reglas acordadas**; reglas añadidas pendientes en `docs/architecture/E2_E3_CONTRASTE_ACEPTACION_2026-11-12.md` §3.
- **Etapa 4: aplazada** por decisión del autor (2026-11-12). Se mantienen los avisos internos (E2-D15); sin push, correo ni recordatorios nuevos. No bloquea el cierre.

## 3. Ramas, worktrees y commits (nada publicado salvo la rama de evidencia)

| Repo | Worktree | Rama | Desde | Commits |
|---|---|---|---|---|
| Back/Web | `_wt/ET1-BE` | `feat/etapa1-identificacion-productos` | `11bffd7` | … `ee1ecc1` |
| Back/Web | `_wt/ET2-BE` (**checkout actual**: la rama de etapa 3) | `feat/etapa2-convocatorias` | `62779e8` + ET1 | … `01bcdeb` (sin cambios) |
| Back/Web | `_wt/ET2-BE` | `feat/etapa3-estimacion-borrador` | `01bcdeb` | `0db2d0f` back E2-P2/P3 · `f673f95` back E3 · `5d760b6` web E2-P3 · `2a25386` web E3 · `2eb3ef7` · `3b2099b` · `b77965e` · `8bf84f9` E3 en módulo propio · `29c559e` `219d959` `e60df32` E3-P1 (1 + 1b) · `e2d7cdc` porcentaje · `c87c352` `91e9ef2` `fa44b5f` E3-P2 origen · `a7e3983` prueba CONV-2 · (+ docs, evidencia y guiones de esta sesión) |
| Mobile | `_wt/ET1-MOB` | `feat/etapa1-productos-identificacion-foto` | `73a927b` | … `bce8e59` |
| Mobile | `_wt/ET2-MOB` (**checkout actual**: la rama nueva) | `feat/etapa2-convocatorias` | `bce8e59` | `6bac5a3` (sin cambios) |
| Mobile | `_wt/ET2-MOB` | `feat/etapa2-historial-colaboradores` | `6bac5a3` | `16c002c` historial y CONV-2 · `fa0fdc4` consent en historial · `b55e5af` texto de coordinación · `01b2576` quién ve sus datos |
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
| Back `npm test` completo con todas las suites PostgreSQL (`a7e3983`) | **952 pasan**, 0 fallan, 13 omitidas (84 suites; bases: `agro_et2_test` para las que crean su base; `agro_f02_test` para F02-D y F02-FINAL; `agro_f02v2_test` para F02 auth-v2) |
| Back E2 / E3 / F12-EST-08 PostgreSQL | 21/21 · 11/11 · 7/7 |
| Web completa (`a7e3983`) | 540/540; lint 0 errores; build correcto |
| Mobile completa (`01b2576`) | 2985 pasan, 3 omitidas; `flutter analyze` sin problemas |
| Recorridos reales | E3 y E2 §10 en API + Web + emulador (evidencia E3) |

## 6. Limitaciones y decisiones pendientes

1. Nada probado en teléfono físico.
2. **E3-P1 resuelta (2026-11-12, opción 1 + 1b):** no se calcula ninguna diferencia; la vista muestra el alcance de cada cifra (F12 §2 enmendado). Medición: la necesidad la declaran más agricultores que los de cualquier cifra de consumo.
3. **E3-P2 resuelta (2026-11-12):** origen inmutable de cada convocatoria (E2 §10.5), migración `20261112000000_e3p2_call_origin` aplicada en `agro_demo`.
4. Contratos aceptados en las reglas acordadas; **pendientes de tu visto bueno**: reglas añadidas N1–N8 y menores (contraste §3), incluido el umbral 3 y el texto exacto de CONV-2.
5. Migración v16 → v17 con datos e historial con convocatorias antiguas: sólo en pruebas automatizadas (ver evidencia §4).
6. Rendimiento de `estimation-link` (~2,5 s con 11 líneas).
7. Observaciones menores: observaciones E1 previas (hoja de foto sin refresco, etc.). El texto en singular del teléfono se corrigió en `b55e5af`.
8. `call_id` como clave global de la copia local del teléfono (E2-R25).

## 7. Siguiente paso concreto

1. Revisar las reglas añadidas pendientes (contraste §3) y la revisión manual de la evidencia §3c.
2. Etapa 4 aplazada: no abrir sin un encargo nuevo.
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

## 9. Actualización del 2026-11-12 (decisiones N1–N8, m1–m11, P-B, P-C y Excel único)

**Esta sección prevalece sobre las anteriores.** Evidencia: `docs/evidence/E2_PC_N7_EXCEL_2026-11-12.md`. Contrato: E2 §11.

- **Estado:** etapas 1–3 implementadas y verificadas técnicamente (pruebas y emulador), **sin cierre funcional**: P-A (sustitución de responsable) espera decisión. Ver `docs/architecture/E2_PA_SUSTITUCION_RESPONSABLE_OPCIONES.md`, §7.
- **Commits Back/Web** (`feat/etapa3-estimacion-borrador`):
  - `1ff5ccf` P-C/N1/N2/m6/m11/N7
  - `eeaf327` CSV retirado del servidor
  - `7acf0a1` Web Excel único y P-B
  - `bcd8b62` m10
  - `ea53c0b` contrato
  - `e3cd538` anexos
  - `5b394f2` aviso de participaciones ocultas y guiones
  - evidencia: commit siguiente
- **Commits Mobile** (`feat/etapa2-historial-colaboradores`):
  - `a0c37fa` reportes en Excel
  - `9cb6d7b` P-C, `CONV-3`, contrato 2, **esquema v18**
  - `e1f6e25` prueba de esquema
- **Migración nueva:** `20261112120000_e2_pc_consent_decisions`, aplicada en `agro_demo`, `agro_et2_test` y `agro_f02_test`.
- **Contrato de las rutas del agricultor:** cabecera `X-Joint-Purchase-Contract: 2`. Sin ella, la forma del contrato 1 con `CONV-1` (APK anterior).
- **Rediseño móvil** (sesión de `_wt/RDM-MOB`):
  - fusionó `9cb6d7b` y `e1f6e25` en `feat/rediseno-movil`;
  - su API corre con un Back congelado (`_wt/RDM-BE`) desde `ea53c0b`, con `prisma migrate deploy`;
  - la sesión C no reescribe las pantallas de convocatorias hasta integrar estos cambios;
  - `test/support` es del orquestador: se tocaron `e2_joint_purchase_fixtures.dart` y `xlsx_reader.dart` (nuevo), y se le avisó.
- **Emulador:**
  - queda instalada `.et1o` (agricultor13, versión `e1f6e25`);
  - se desinstaló la `.et1u` propia;
  - `/data` tiene unos 800 MB libres;
  - el emulador es compartido con el rediseño: avisar antes de usarlo.
- **Trampas nuevas:**
  - el `dist` incremental queda incompleto si no se borra `tsbuildinfo` («Cannot find module accounts-payable»);
  - en la activación, «Continuar» no activa: el botón es «Activar»;
  - el emisor envía solo al reconectar;
  - las respuestas del diario vuelven en `jsonb` con las claves reordenadas: comparar en forma canónica.
- **Siguiente paso:** el autor decide P-A (A1/A2/A3, B1/B2/B3, C1/C2/C3 y si se admite en convocatorias cerradas) y la limitación 3 de la evidencia (cifras OUTDATED en el Excel). Después, implementar P-A y declarar el cierre funcional si no queda nada pendiente.

## 10. Actualización del 2026-11-12 (tarde): P-A implementada (A1 + B1 + C1) y Excel con desactualizadas

- **Hecho:** P-A según el contrato E2 §12. Back `49ed870`, Web `3fab972` + `d5dc9cc`, Mobile `4a3f1ad` + `2cc7e39` (contrato 3, esquema v19). Evidencia `docs/evidence/E2_PA_SUSTITUCION_2026-11-12.md`.
- **Regla aplicada por prudencia, pendiente de confirmar por el autor:** quien sustituye no puede nombrarse a sí misma sucesora (`SUCCESSOR_NOT_ELIGIBLE`).
- **Pendiente:** recorrido en el teléfono (el Pixel_8 se colgó al arrancar; sus procesos quedaron abiertos hasta que alguien con permiso los cierre); APK anteriores en un dispositivo después de una sustitución; en la app contrato 2, el texto de «quién ve sus datos» queda más permisivo de lo real tras una sustitución (necesita actualizar). Anotado: `PATCH` de la responsable en un borrador no suspende las delegaciones del borrador (comportamiento anterior).
- **Rediseño móvil:** integrar Mobile `4a3f1ad` y `2cc7e39` y Back `49ed870` (o posterior). El widget `JointPurchaseResponsibleReview` se llama en un solo sitio del detalle; además el botón «ampliar» se oculta con `needsResponsibleReview`. Pruebas focalizadas: `test/e2_pa_responsible_test.dart`, `test/e2_joint_purchase_*_test.dart`, `test/migration_test.dart`, `test/rec_039_schema_constraints_test.dart`, `test/report_*_test.dart`.
- **Entorno aislado:** sigue arriba (contenedor 15434, API 3350, Web 5175). Túnel abierto el 2026-11-12 (cerrar con `et2.sh untunnel`). Guiones: `tool/etapa3/pa_walk.cjs`, `web_pa.mjs`, `excel_open_check.ps1`.
