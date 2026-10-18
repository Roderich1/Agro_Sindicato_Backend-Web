# F10 — Suplemento de base para la repetición acotada del núcleo sin voz (2026-10-18)

- **Qué es:** el registro que exige el protocolo `F10_PROTOCOLOS_EVALUACION.md` v1.3 §0.1 («si se integra una corrección antes de medir, la sesión A fija y publica la base nueva… se repite sólo lo afectado») y el guion `F10_GUION_REVISION_ENTREGABLES.md` §5.2 («fijar una base nueva y repetir sólo lo afectado… sin mezclar series»). Fija la **base nueva**, qué se repite y qué no, el teléfono disponible y los entornos.
- **Qué no es:** no cambia ningún umbral, repetición, dataset, percentil ni criterio de la v1.3 (§0 «Los umbrales de esta versión no se cambian después de obtener resultados»). No es una versión nueva del protocolo. No es una ratificación del tutor, una aprobación institucional ni una inspección personal del autor. No mide usabilidad (RNF-07) ni voz (F09).
- **Preparado por** la sesión A de Claude Code el 2026-10-18 (America/La_Paz), por la instrucción de Roderich Rendón del mismo día («bloque técnico F10 del núcleo… suplemento previo revisado por B/C, APK profile, R1–R4 y compatibilidad Mobile para A; R5a/R5b y W1–W5 para B; revisión de C… HONOR es A4/A4-F, no A1; incluye M4 y M7. R6 conserva su evidencia histórica»). **Revisión técnica previa de las sesiones B y C antes de la primera medición;** su resultado se anota en §8.
- **Issues:** BE #48 (F10-QA-04, rendimiento); compatibilidad RNF-08 sin issue propio; GATE-F10 BE #49 sigue **Pending**.

## 1. Base nueva (verificada el 2026-10-18 UTC)

| Componente | Base medida en la serie 1 (2026-10-17) | **Base de la serie 2** | Comprobación |
|---|---|---|---|
| Mobile | `dff6802` (código `2f4b634`) | **`ad5b43d97b15e55c2b8a86bd7e0fcfa5602b68dd`** (= merge de MOB #126). `main` es `1a29869`, que sólo añade `docs/evidence/` (`git log ad5b43d..origin/main -- lib/ android/ pubspec.yaml`: vacío) | CI del runtime 39124111274 SUCCESS (1521 pasan, 4 omitidas, 78 regionales, build release); CI documental 39134406174 SUCCESS |
| Backend + Web | `ed069a6` (código `c8cbf67`) | **`6c54c0072d2140db4be448d5f81d4e5ed498a260`** (código = `6e4a0e2`; `git log 6e4a0e2..origin/main -- Back/src Back/prisma Web/src`: vacío) | «Backend F02 verification» y «Web F07 verification» en verde sobre el último cambio de código (`6e4a0e2`, PR #136); #137/#138 sólo docs |
| Protocolo | v1.3 `9bfcad2` | **la misma v1.3**, sin cambios | — |
| Herramientas | Mobile `tool/f10_eval/` (`24ded8e`, `4a9c396`, `2be7789`); Backend `feat/f10-eval-central-web` (`21e41e0`) | Las mismas, integradas en `main` Mobile (`tool/f10_eval/` en `ad5b43d`) y la rama de B. Cualquier ajuste (resolución del HONOR, coordenadas) se versiona en una rama de herramientas y **no cambia el código medido**; cada serie registra el SHA de la herramienta | — |

**Cambios de código entre las dos bases** (resumen; el detalle con SHA está en `_briefs` de A y en los PR):

- Mobile, 61 commits en `lib/ android/ pubspec.yaml` (+12 576/−454): campaña por fecha efectiva, fecha editable, cierre explícito y activación anticipada (MOB #110, #124, #126); período local contenido en el central, retención y conciliación (#116); modo propio y liquidación (#102, #107); legibilidad #97 (#103); mensajes de autorización (#96); área exacta (#115); **voz F09** (#99, #100, #101, #104, #109, #112, ≈30 commits: `lib/voice*`, `VoiceSpeechBridge.kt`, `VoiceSpeechEngine.kt`, `MainActivity.kt`, `AndroidManifest.xml`).
- Backend/Web, 22 commits en `Back/src Back/prisma Web/src` (+1 834/−137): residuos de F10-SEC-02 en el resumen colectivo, política de divulgación, diferenciación y propuesta, con **una migración nueva** `20261017020156_f10_proposal_coverage_basis` (BE #126); la Web deja de ser cliente operativo del agricultor, guardas y navegación (BE #127/#128). **Sin cambios** en `Back/src/modules/sync-v1` (salvo un spec) ni en `Back/src/modules/backups`.
- **La voz no es un protocolo F10** (§1.3, §3.2). Entra en la APK medida (tamaño, arranque, permisos) y se declara como **cambio de base**, no como caso. Ningún flujo de voz se ejecuta ni se evalúa en esta serie.

## 2. Qué se repite y qué no (una sola serie 2; no se mezcla con la serie 1)

| Medición | Serie 1 (histórica, se conserva con su SHA, fecha y equipo) | Serie 2 | Motivo |
|---|---|---|---|
| **R1** arranque N0, p90 ≤ 4 s, 10 + 1 | `dff6802`, POCO, CUMPLE | **Sí**, en A4 (HONOR) | arranque, base de datos y repositorio cambiados; voz registrada en el arranque |
| **R2** compra 2 líneas N0, p90 ≤ 1 s, 10 | `dff6802`, POCO, R2-b CUMPLE | **Sí**, instrumento de R2-b (contacto visible), fecha efectiva por defecto (hoy) | formulario de compra y `confirmPurchase` cambiados |
| **R3** saldo e historial `DSV-001`, p90 ≤ 1,5 s, 10 | `dff6802`, POCO, CUMPLE | **Sí** | pantalla y repositorio cambiados |
| **R4** sincronización explícita N1, p90 ≤ 10 s, 10 intenciones (≥ 60 s) | `dff6802`/`ed069a6`, POCO, CUMPLE | **Sí** (lado Mobile cambiado; el servidor sync-v1 no) | #116 y #96 |
| **R5a** Web resumen, frío ≤ 3 s / caliente ≤ 1,5 s, 10 + 10 | `ed069a6`, HOST, CUMPLE | **Sí**, sesión B sobre `6c54c00` | BE #126 y #127/#128; el guion §1/§5 lo exigía |
| **R5b** API summary, p90 ≤ 1 s, 10 | `ed069a6`, HOST, CUMPLE | **Sí**, sesión B | BE #126 |
| **R6** respaldos S1/S2/S3 | `dff6802`/`ed069a6`, POCO, CUMPLE | **No.** Se conserva la evidencia histórica tal cual | `backup_service.dart`, `backup_container_reader.dart` y `Back/src/modules/backups` sin cambios entre las bases. **No se convierte en medición del HONOR**; si alguna vez se repite, será otra serie declarada |
| **Compatibilidad Mobile** | A1, A1-F (POCO), A2 (AVD API 36) sobre `dff6802`; A3, A4, A5 NO EJECUTADAS | **Sí: configuración nueva A4 / A4-F (HONOR), flujos M1–M8 completos** (§3). A1/A1-F/A2 no se repiten en esta serie (equipo no disponible / fuera de la ventana); conservan su resultado histórico, incluido **A1-F NO CUMPLE M8** (#97), que **sólo se cierra midiéndolo en el POCO** | el HONOR es un equipo real nuevo; una configuración se declara compatible sólo si pasan **todos** sus flujos (§2.5), por eso no basta un subconjunto |
| **Compatibilidad Web** W1–W5 | B1/B2 sobre `ed069a6`, 4 × 30 CUMPLE | **Sí, completa (W1–W5, B1 y B2, 1366×768 y 1920×1080)**, sesión B sobre `6c54c00` | los cinco flujos están tocados por #126/#127/#128; el guion exigía al menos W2/W4 |
| **A3** (API 24, pantalla pequeña) | NO EJECUTADA (sin imagen) | **NO EJECUTADA** en esta serie, misma causa; no se sustituye por otra API | §2.2 |
| **A5** (otro teléfono) | NO EJECUTADA | **NO EJECUTADA** (sin equipo) | §2.2 |
| **Usabilidad RNF-07** | ninguna sesión | **No se inicia**; sin participantes | fuera de este bloque |
| **#18 tanda 1, C23, restauración F08** | PASS sobre sus bases | **No**: evidencia de F05/F08, cerrados | no se reabren |

**RNF-08 tras la serie 2:** se informa configuración por configuración. Aunque A4 y A4-F resulten compatibles, **RNF-08 no se declara cumplido globalmente** mientras A1-F siga NO CUMPLE en M8 sobre `dff6802` sin repetición, A3 y A5 sigan NO EJECUTADAS y A1/A2 no se hayan repetido sobre `ad5b43d`.

## 3. Equipo disponible: HONOR como A4 / A4-F (DEVICE)

- **Único teléfono conectado el 2026-10-18:** HONOR JDY-LX3P (`ro.product.model` JDY-LX3P), Android 16 / API 36, `wm size` 720×1612, densidad 320, es-BO, America/La_Paz. **El POCO X5 Pro 5G (A1) no está disponible** en esta ventana; por eso R1–R4 se miden en el HONOR y **no se comparan con la serie 1 del POCO**: son dos equipos y dos bases distintos. A1 conserva su evidencia.
- **Numeración:** A4 = HONOR con `font_scale` **1,0**; **A4-F** = HONOR con `font_scale` **1,3** (§2.2 A1-F). El ajuste propio del equipo es `font_scale` **1,45**: se anota y se **restaura** al terminar (§0.10). A5 sigue libre.
- **Flujos en A4 y A4-F: M1–M8 completos**, con **M4** (aplicación y rechazo por saldo, RN-03) y **M7** (subir y restaurar en el mismo paquete, con conteos iguales y 0 push) incluidos de forma explícita. En M7 la subida y la restauración son flujos funcionales de compatibilidad; **no se registran como tiempos de R6**.
- **Procedencia:** DEVICE. Operación por `adb -s AM7XCP4922400470` (el serial sólo en los scripts locales), datos sintéticos, APK profile aislada.
- **Particularidades conocidas del equipo** (de los ensayos F09-ENS-01 y F04-REP-01; se declaran): el modo avión conserva la Wi‑Fi (N0 exige además `svc wifi disable`, restaurado después); la franja de gestos (y ≥ ~1 500) manda la app al fondo; SwiftKey autocorrige; la búsqueda del sistema captura texto si la app pierde el foco; `screenrecord`, `show_touches` y `pointer_location` **se comprueban en el ensayo de herramienta** antes de las series (en el POCO `show_touches` no se grababa y se usó `pointer_location`).
- **Copia aislada nueva:** `com.comunidad.agro.agroquimicos.f10eval2` («Agrocuentas F10-EVAL2»), modo **profile**, compilada desde el worktree limpio de `ad5b43d` con `tool/f10_eval/build_profile_apk.sh` (sufijo y etiqueta temporales, revertidos). El sufijo `.f10eval` de la v1.3 queda reservado a la serie 1 (copia y entorno conservados del POCO, §0.4 «ningún entorno conservado se detiene, borra ni reutiliza»). Antes de instalar: `aapt2 dump badging` (paquete, `minSdk`, `targetSdk`), SHA-256. Después: `pm list packages` con la app normal, `.f09voz` y `.f04date` intactas.
- **Dataset:** DS-V Mobile (§1.4), `seed_dsv_mobile.dart`, semilla 20261016, sembrado sobre la base de la copia activada con una cuenta sintética; conteos e `integrity_check` comprobados en el equipo.

## 4. Entornos nuevos (§0.4: contenedor, volumen y puertos nuevos por sesión)

| Sesión | Contenedor / volumen | Puertos | Backend | Notas |
|---|---|---|---|---|
| **A** (Mobile) | `agro_a_f10eval2_pg` / `agro_a_f10eval2_pgdata` | PG 55455, API 3130, observador 3131 | `6c54c00` compilado (`dist` de `6e4a0e2`, código idéntico), `NODE_ENV=production`, 11 migraciones, túnel HTTPS temporal | `BACKUP_PRODUCTION_ADMISSION=enabled` y `SYNC_V1_PRODUCTION_ADMISSION=enabled` sólo aquí (sintético); `BACKUP_MAX_ACTIVE_PER_MEMBER=20` como la v1.3 (M7 sube pocas copias; no se mide R6) |
| **B** (central y Web) | `agro_b_f10eval2_pg` / `agro_b_f10eval2_pgdata` | PG 55456, API 3132, Web 4178 | `6c54c00` compilado; **R5 con `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`** (desviación declarada de la v1.1 §0.4, sin cambio) | DS-V Central con el generador de B (`f10-dsv-central-seed.cjs`), semilla 20261016; registrar la migración 11 (`coverage_basis`) en la cuenta de migraciones |

Los entornos de la serie 1 (`agro_a_f10eval_pg`, `agro_b_f10eval_pg`) no se tocan.

## 5. Ventanas de tiempo en el PC (un solo PC; las series de tiempo no se solapan)

| Ventana | Quién | Qué | Condición para los demás |
|---|---|---|---|
| V0 | B y C | Revisión de este suplemento | A prepara entorno y APK sin medir |
| V1 | A | Entorno A, APK profile, instalación, M1 (activación), siembra DS-V, **ensayo de herramienta** en el HONOR (fuera de las series) | B puede preparar su entorno y compilar; **sin series de tiempo** |
| V2 | **B** | **R5b y R5a** (10 + 10 + 10) | A y C **no compilan, no miden ni levantan servicios**; A no opera el teléfono con carga en el PC |
| V3 | **A** | **R1, R2, R3** en N0 (10 + 1, 10, 10); línea base del túnel; **R4** en N1 (10 + 1) | B y C sin compilaciones, suites ni navegadores automatizados |
| V4 | A ‖ B | A: compatibilidad **M2–M8 en A4** y **M1–M8 en A4-F**; B: **W1–W5** en B1/B2 (funcional, no de tiempo) | pueden solaparse: ninguna mide tiempos |
| V5 | C | Revisión de las evidencias de A y B; A integra las correcciones | — |

Cada ventana se anuncia por mensaje entre sesiones con hora UTC de inicio y fin; la evidencia registra quién estaba inactivo.

## 6. Evidencia que se producirá (§1.10, §2.6)

- Mobile: `docs/evidence/F10_RENDIMIENTO_MOBILE_S2.md` (R1–R4, serie 2) y `docs/evidence/F10_COMPATIBILIDAD_MOBILE_A4.md` (A4/A4-F), con CSV crudos sanitizados en `docs/evidence/f10_eval_s2/`. **Los archivos de la serie 1 no se editan**; se enlazan.
- Backend: `docs/evidence/F10_RENDIMIENTO_CENTRAL_WEB_S2.md` (R5a/R5b, serie 2) y `docs/evidence/F10_COMPATIBILIDAD_WEB_S2.md` (W1–W5), con sus `compat.json` y capturas, de la sesión B.
- Cada archivo: SHA de Backend/Web/Mobile, SHA-256 y modo de la APK, `minSdk`/`targetSdk`, imagen de PostgreSQL, `cloudflared`, navegador exacto, semilla, versión del protocolo (v1.3) y este suplemento (su SHA al integrarse), PC, equipo, condiciones, crudos, mediana, p90, máximo, errores, desviaciones. Resultados CUMPLE / NO CUMPLE / BLOQUEADA / NO EJECUTADA con procedencia DEVICE / HOST, sin mezclar.
- **Un fallo se conserva en su fila** y no desaparece por una repetición posterior (§0.8). **No se sube ningún umbral.**

## 7. Lo que este suplemento no hace

- No reabre F04, F05, F06 ni F08 ni repite sus ensayos aceptados. No decide GATE-F10 (#49), que sigue Pending; sólo Roderich lo decide.
- No habilita cifras reales (F07-POL-01, #107 abierto; GATE-F07 Pending). No recluta participantes ni programa usabilidad. No prepara corpus ni ensayos de voz (F09, último frente).
- No atribuye revisión personal, del tutor ni institucional.

## 8. Revisión previa (se completa con lo que ocurra; fechas reales)

| Sesión | Fecha (UTC) | Resultado | Observaciones atendidas |
|---|---|---|---|
| B | | | |
| C | | | |
