# F10 — Suplemento de base para la repetición acotada del núcleo sin voz (2026-10-18)

- **Qué es:** el registro que exige el protocolo `F10_PROTOCOLOS_EVALUACION.md` v1.3 §0.1 («si se integra una corrección antes de medir, la sesión A fija y publica la base nueva… se repite sólo lo afectado») y el guion `F10_GUION_REVISION_ENTREGABLES.md` §5.2 («fijar una base nueva y repetir sólo lo afectado… sin mezclar series»). Fija la **base nueva**, qué se repite y qué no, el teléfono disponible y los entornos.
- **Qué no es:** no cambia ningún umbral, repetición, dataset, percentil ni criterio de la v1.3 (§0 «Los umbrales de esta versión no se cambian después de obtener resultados»). No es una versión nueva del protocolo. No es una ratificación del tutor, una aprobación institucional ni una inspección personal del autor. No mide usabilidad (RNF-07) ni voz (F09).
- **Preparado por** la sesión A de Claude Code el 2026-10-18 (America/La_Paz), por la instrucción de Roderich Rendón del mismo día («bloque técnico F10 del núcleo… suplemento previo revisado por B/C, APK profile, R1–R4 y compatibilidad Mobile para A; R5a/R5b y W1–W5 para B; revisión de C… HONOR es A4/A4-F, no A1; incluye M4 y M7. R6 conserva su evidencia histórica»). **Revisión técnica previa de las sesiones B y C:** la versión `93c90c1` (15:13Z) tuvo el LISTO de B y de C antes de la primera medición de la serie 2 (M1 de A4, 15:19:51Z; R5 de B, 15:27:39Z); las versiones posteriores (`f3f7b18`, `731e548`) sólo añaden el párrafo de preparación de campañas de §3 y se revisaron después, como se detalla por versión y por bloque medido en §8. **El HEAD final no fue revisado antes de toda medición y no se afirma lo contrario.**
- **Issues:** BE #48 (F10-QA-04, rendimiento); compatibilidad RNF-08 sin issue propio; GATE-F10 BE #49 sigue **Pending**.

## 1. Base nueva (verificada el 2026-10-18 UTC)

| Componente | Base medida en la serie 1 (2026-10-17) | **Base de la serie 2** | Comprobación |
|---|---|---|---|
| Mobile | `dff6802` (código `2f4b634`) | **`ad5b43d97b15e55c2b8a86bd7e0fcfa5602b68dd`** (= merge de MOB #126). `main` es `1a29869`, que sólo añade `docs/evidence/` (`git log ad5b43d..origin/main -- lib/ android/ pubspec.yaml`: vacío) | CI del runtime 39124111274 SUCCESS (1521 pasan, 4 omitidas, 78 regionales, build release); CI documental 39134406174 SUCCESS |
| Backend + Web | `ed069a6` (código `c8cbf67`) | **`6c54c0072d2140db4be448d5f81d4e5ed498a260`** (código = `cab433d`, merge de PR #128; `git log cab433d..origin/main -- Back/src Back/prisma Web/src`: vacío) | «Backend F02 verification» 39069713881 SUCCESS sobre `6e4a0e2` y 39050197493 sobre `cab433d`; «Web F07 verification» 39050197509 SUCCESS sobre `cab433d` (último run en `main`; `Web/src` sin cambios desde `9df7888`, run 39041936690 SUCCESS); #136, #137 y #138 sólo docs |
| Protocolo | v1.3 `9bfcad2` | **la misma v1.3**, sin cambios | — |
| Herramientas | Mobile `tool/f10_eval/` (`24ded8e`, `4a9c396`, `2be7789`); Backend `tool/f10_eval_web/` y `Back/scripts/f10-dsv-central-seed.cjs` (`21e41e0` para R5; `0b332da` para B1/B2) | Las mismas, ya integradas en `main` de ambos repos (`tool/f10_eval/` en `ad5b43d`; `tool/f10_eval_web/` y el generador en `6c54c00`). Los ajustes necesarios (resolución y coordenadas del HONOR en A; contenedor, puertos y etiqueta por variables de entorno en B, rama `eval/f10-serie2-central-web`) se versionan en ramas de herramientas y **no cambian el código medido** (`lib/`, `Back/src`, `Web/src`, `Back/prisma`); cada serie registra el SHA de la herramienta | — |

**Cambios de código entre las dos bases** (resumen; el detalle con SHA está en `_briefs` de A y en los PR):

- Mobile, 61 commits con merges (49 sin) en `lib/ android/ pubspec.yaml` (+12 576/−454): campaña por fecha efectiva, fecha editable, cierre explícito y activación anticipada (MOB #110, #124, #126); período local contenido en el central, retención y conciliación (#116); modo propio y liquidación (#102, #107); legibilidad #97 (#103); mensajes de autorización (#96); área exacta (#115); **voz F09** (#99, #100, #101, #104, #109, #112; 25 commits sin merges: `lib/voice*`, `VoiceSpeechBridge.kt`, `VoiceSpeechEngine.kt`, `MainActivity.kt`, `AndroidManifest.xml`).
- Backend/Web, 22 commits con merges (21 sin) en `Back/src Back/prisma Web/src` (+1 834/−137): residuos de F10-SEC-02 en el resumen colectivo, política de divulgación, diferenciación y propuesta, con **una migración nueva** `20261017020156_f10_proposal_coverage_basis` (BE #126); la Web deja de ser cliente operativo del agricultor, guardas y navegación (BE #127/#128). **Sin cambios** en `Back/src/modules/sync-v1` (salvo un spec) ni en `Back/src/modules/backups`.
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
- **M1 en A4-F.** La copia `.f10eval2` se instala y activa en V1 con `font_scale` 1,0 (M1 de A4) y conserva sus datos para las series y M2–M8. Para M1 de A4-F se sigue el precedente de la serie 1 (A1-F con `.f10c23x`): una **segunda copia del mismo código** `ad5b43d`, sufijo `.f10eval2f` y etiqueta propia, compilada en profile con el mismo script, instalada y activada con `font_scale` 1,3 y otra cuenta sintética; se declara como desviación (APK distinta sólo por sufijo y etiqueta, con su SHA-256). M2–M8 de A4-F se ejecutan en `.f10eval2` con `font_scale` 1,3, como en la serie 1.
- **Procedencia:** DEVICE. Operación por `adb -s <serial>` (el serial sólo en los scripts locales, fuera del repositorio), datos sintéticos, APK profile aislada.
- **Particularidades conocidas del equipo** (de los ensayos F09-ENS-01 y F04-REP-01; se declaran): el modo avión conserva la Wi‑Fi (N0 exige además `svc wifi disable`, restaurado después); la franja de gestos (y ≥ ~1 500) manda la app al fondo; SwiftKey autocorrige; la búsqueda del sistema captura texto si la app pierde el foco; `screenrecord`, `show_touches` y `pointer_location` **se comprueban en el ensayo de herramienta** antes de las series (en el POCO `show_touches` no se grababa y se usó `pointer_location`).
- **Copia aislada nueva:** `com.comunidad.agro.agroquimicos.f10eval2` («Agrocuentas F10-EVAL2»), modo **profile**, compilada desde el worktree limpio de `ad5b43d` con `tool/f10_eval/build_profile_apk.sh` (sufijo y etiqueta temporales, revertidos). El sufijo `.f10eval` de la v1.3 queda reservado a la serie 1 (copia y entorno conservados del POCO, §0.4 «ningún entorno conservado se detiene, borra ni reutiliza»). Antes de instalar: `aapt2 dump badging` (paquete, `minSdk`, `targetSdk`), SHA-256. Después: `pm list packages` con la app normal, `.f09voz` y `.f04date` intactas.
- **Dataset:** DS-V Mobile (§1.4), `seed_dsv_mobile.dart`, semilla 20261016, sembrado sobre la base de la copia activada con una cuenta sintética; conteos e `integrity_check` comprobados en el equipo.
- **Preparación de R4 y M6 bajo D-F04-C2 (hallazgo de V1: la opción deshabilitada se observó en la pantalla «Vincular con el sindicato» a las 15:33Z del 2026-10-18 y se comunicó a B y C a las 15:37Z; párrafo añadido en `f3f7b18` 15:37Z y corregido en `731e548` 15:44Z, antes de la preparación de las 17:10Z y de medir R2 y R4; aclaración posterior a los umbrales ya fijados en la v1.3, que no cambia ninguno).** Con MOB #116 integrado, el vínculo que la serie 1 hizo entre la campaña local DS-V (desde el 30/09/2025, sin fin) y «Campana Verano 2026» (01/01–30/06/2026, la única ABIERTA del seed demo del servidor de A, que es el mismo seed que usó la serie 1) **ya no se ofrece**: la pantalla «Vincular con el sindicato» deshabilita la opción porque el período local no cabe en el central. No es un defecto: es la regla de contención de D-F04-C2. Para medir R4 y M6 **sin intervención SQL y sin cambiar DS-V Mobile ni el seed del servidor**, se hace, **después de R1 y R3 (sólo lectura) y antes de R2, fuera de toda serie** (las compras de R2, fechadas hoy, impedirían cerrar la DS-V con un fin anterior; corrección de la revisión de C), con acciones legítimas de la aplicación y de la API, registradas con sus conteos antes y después: (a) en el servidor de A, con la cuenta sintética ADMINISTRADOR por la API (`POST /campaigns/{id}/close` y `/open`), cerrar «Campana Verano 2026» (terminó el 30/06/2026) y abrir «Campana Invierno 2026» (01/07–30/11/2026, PLANIFICADA en el seed), que contiene la fecha de hoy: es la transición que haría la Directiva; (b) en la app, cerrar la campaña local DS-V con fin efectivo 17/10/2026 (posterior a su última operación, 15/10/2026, y no posterior a hoy; #124), crear y activar una campaña local «Campaña DSV S2» con inicio 18/10/2026 (día inicial inclusive, #125) y fin previsto 30/11/2026, contenida en la central; (c) vincular esa campaña y DSV-001 por la pantalla. R4 declara necesidades de DSV-001 en esa campaña, con el mismo instrumento que la serie 1 (que no elige campaña: la necesidad va a la campaña que contiene hoy; se confirma en el ensayo de herramienta antes de R4). R1 y R3 se miden antes, con la campaña DS-V tal como la deja la siembra, y R1 no se repite después; la compra de ensayo de herramienta de R2, R2, R4 y las compras/aplicaciones de M3/M4 caen en «Campaña DSV S2» vinculada a «Invierno 2026», no en la DS-V. La evidencia registra el cierre de la DS-V (conteos y huella de la base antes y después) y las llamadas de la cuenta ADMIN con su hora UTC. Clasificación: preparación declarada como desviación de estado, no cambio de dataset (seed, semilla, generador y operaciones DS-V intactos; la serie 1 también hizo los vínculos por la interfaz fuera de la siembra).

## 4. Entornos nuevos (§0.4: contenedor, volumen y puertos nuevos por sesión)

| Sesión | Contenedor / volumen | Puertos | Backend | Notas |
|---|---|---|---|---|
| **A** (Mobile) | `agro_a_f10eval2_pg` / `agro_a_f10eval2_pgdata` | PG 55455, API 3130, observador 3131 | `6c54c00` compilado (código = `cab433d`; el `dist` se compiló sobre el checkout `6e4a0e2`, de código idéntico), `NODE_ENV=production`, 11 migraciones, túnel HTTPS temporal | `BACKUP_PRODUCTION_ADMISSION=enabled` y `SYNC_V1_PRODUCTION_ADMISSION=enabled` sólo aquí (sintético); `BACKUP_MAX_ACTIVE_PER_MEMBER=20` como la v1.3 (M7 sube pocas copias; no se mide R6) |
| **B** (central y Web) | `agro_b_f10eval2_pg` / `agro_b_f10eval2_pgdata` | PG 55456, API 3132, Web 4178 | `6c54c00` compilado (código = `cab433d`); **R5 y W1–W5 con `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`** (desviación declarada de la v1.1 §0.4, como en la serie 1, sin cambio) | DS-V Central con el generador de B (`f10-dsv-central-seed.cjs`), semilla 20261016; registrar la migración 11 (`coverage_basis`) en la cuenta de migraciones |

Los entornos de la serie 1 (`agro_a_f10eval_pg`, `agro_b_f10eval_pg`) no se tocan.

## 5. Ventanas de tiempo en el PC (un solo PC; las series de tiempo no se solapan)

| Ventana | Quién | Qué | Condición para los demás |
|---|---|---|---|
| V0 | B y C | Revisión de este suplemento | A prepara entorno y APK sin medir |
| V1 | A | Entorno A, APK profile, instalación, M1 (activación), siembra DS-V, **ensayo de herramienta** en el HONOR (fuera de las series) | B puede preparar su entorno y compilar; **sin series de tiempo** |
| V2 | **B** | **R5b y R5a** (10 + 10 + 10) | A y C **no compilan, no miden ni levantan servicios**; A no opera el teléfono con carga en el PC |
| V3 | **A** | **R1, R2, R3** en N0 (10 + 1, 10, 10); línea base del túnel; **R4** en N1 (10 + 1) | B y C sin compilaciones, suites ni navegadores automatizados |
| V4 | A ‖ B | A: compatibilidad **M2–M8 en A4** y **M1–M8 en A4-F** (M1 con `.f10eval2f`, §3); B: **W1–W5** en B1/B2 (funcional, no de tiempo) | pueden solaparse: ninguna mide tiempos |
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

## 8. Revisión previa, por versión y por bloque medido (fechas reales, UTC del 2026-10-18)

Precisado el 2026-10-18 (~20:15Z) por la revisión de Roderich Rendón: la tabla anterior daba horas aproximadas sin distinguir versiones: el «~15:45Z» de B procedía del propio mensaje de B de las 15:11:25Z, que daba una hora estimada incorrecta («Fecha de la revisión: ~15:45Z») copiada aquí, cuando la hora real de ese envío es 15:11:25Z; el «~15:20Z» de C era una aproximación de A; se sustituye por los hechos registrados en los commits (`git log`) y en las marcas temporales de los mensajes entre sesiones. Donde no hay registro se dice.

**Versiones del documento (hora del commit):**

| Versión | Hora | Qué cambia |
|---|---|---|
| `2940a66` | 15:03:38Z | texto inicial (§1–§8) |
| `ad4aa84` | 15:11:06Z | correcciones de C: código Backend = `cab433d`, serial fuera, M1 de A4-F con `.f10eval2f` |
| `93c90c1` | 15:13:35Z | correcciones de B: runs de CI exactos, herramientas de B en `main`, `NODE_ENV` también en W1–W5. **Desde aquí no cambian §1, §2, §4, §5, §6 ni §7** (base, qué se repite, umbrales por referencia a la v1.3, entornos, ventanas) |
| `f3f7b18` | 15:37:35Z | **sólo** añade el párrafo de §3 «Preparación de R4 y M6 bajo D-F04-C2» (hallazgo de V1) |
| `731e548` | 15:44:00Z | **sólo** corrige ese párrafo con el orden R1 → R3 → preparación → R2 → R4 (corrección bloqueante de C). `git diff --stat 93c90c1 731e548`: 1 archivo, 1 inserción |
| HEAD de esta precisión | ver el PR | cabecera, §3 (hora del hallazgo) y este §8; ningún cambio en §1, §2, §4–§7 |

**Revisiones (marca temporal del mensaje de la sesión revisora):**

| Sesión | Versión | Hora | Resultado | Observaciones atendidas |
|---|---|---|---|---|
| C | `2940a66` → `ad4aa84` | **15:12:33Z** (envío del LISTO de C a A; su dictamen previo a B se encoló a las 15:10:01Z según el registro de B, y el aviso a B de ese LISTO, a las 15:12:45Z) | LISTO sobre `ad4aa84`, condicionado a dos correcciones y una precisión, aplicadas en `ad4aa84` | §1 y §4: código Backend = `cab433d`, no `6e4a0e2`, y CI Web sólo sobre `cab433d`; §3: serial retirado; §3 y §5: M1 de A4-F con una segunda copia `.f10eval2f`; menores: recuentos con y sin merges, 25 commits de voz |
| B | `2940a66` → `93c90c1` | dictamen **15:11:25Z** (tres correcciones y dos precisiones sobre `2940a66`); LISTO sobre `93c90c1` **15:15:08Z** (envíos de B) | LISTO sobre `93c90c1`; correcciones aplicadas en `93c90c1` | §3: serial fuera; §1: runs de CI exactos (Backend F02 39069713881 sobre `6e4a0e2`; Web F07 39050197509 sobre `cab433d`); §1: herramientas de B integradas en `main` y SHA de la serie 1 (`21e41e0` R5, `0b332da` B1/B2); §4: `NODE_ENV` también en W1–W5 |
| C | `93c90c1` | **15:14:57Z** (envío de C) | LISTO sobre `93c90c1` | — |
| C | `731e548` | **17:10:22Z** (envío de C): **después de R1 (17:03–17:05Z) y de R3 (17:06–17:08Z), 27 s antes de la preparación (17:10:49Z)** | LISTO sobre `731e548` (orden corregido, transición central por API, cierre DS-V 17/10, «Campaña DSV S2», desviación de estado) | — |
| B | `731e548` | — | **No revisó `731e548` ni `f3f7b18`.** A las 18:27:34Z, al aplicar una nota de C en BE #140, comprobó que `git diff 93c90c1..731e548` añade una sola línea (el párrafo de §3): verificación de alcance, no un LISTO | — |

**Qué estaba revisado antes de cada bloque medido:**

| Bloque | Inicio | Versión vigente y revisada en ese momento | Condiciones del bloque que dependen del suplemento |
|---|---|---|---|
| V1 de A: M1 de A4 (activación), siembra DS-V, ensayo de herramienta (sin series de tiempo) | 15:19:51Z | `93c90c1`, LISTO de C (15:14:57Z) y de B (15:15:08Z) | §3 (A4/A4-F, copia `.f10eval2`), §4 entorno A |
| V2 de B: R5b, R5a frío y caliente | 15:27:39Z – 15:36:05Z | `93c90c1`, LISTO de B y de C | §1 base `6c54c00`, §2 (R5 se repite), §4 entorno B (`NODE_ENV`). **Entre `93c90c1` y `731e548` no cambió ninguna condición ni criterio de R5** (el único cambio es el párrafo Mobile de §3), por lo que R5 **no se repite** por esta precisión documental |
| V3 de A: R1 y R3 | 17:03:21Z – 17:08Z | `731e548` existía (15:44Z); su único añadido (§3 preparación) no afecta a R1 ni R3 (sólo lectura, DS-V tal como la deja la siembra); el LISTO de C sobre `731e548` (17:10:22Z) llegó después de R1 y R3 | §2 (R1/R3 se repiten), §3 equipo |
| V3 de A: preparación de campañas (fuera de serie) | 17:10:49Z – 17:18:51Z | `731e548` con LISTO de C (17:10:22Z) | §3 párrafo de preparación |
| V3 de A: R2 y R4 | 17:22:52Z – 18:05Z | `731e548` con LISTO de C | §2, §3 |
| V4 de B: W1–W5 | 18:07:31Z – 18:17:45Z | `731e548` existía; B revisó `93c90c1`; el añadido no afecta a W1–W5 | §2, §4 |
| V4 de A: M2–M8 de A4 y M1–M8 de A4-F | 18:07:30Z – 18:42:40Z | `731e548` con LISTO de C | §3 |

Lo que este §8 no hace: no convierte una revisión de `93c90c1` en una revisión del HEAD final, no retrofecha ninguna, y no decide GATE-F10 (#49).
