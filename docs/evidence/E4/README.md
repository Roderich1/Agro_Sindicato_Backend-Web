# E4: verificación conjunta del acceso por rol y la retirada de K = 3 (Web, API real y Mobile en emulador)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-13, de 21:05 a 22:11 UTC (de 17:05 a 18:11 en La Paz) |
| Rama | `docs/acceso-rol-sin-k-verificacion` (worktree `_wt/ACC-VERIF`), desde `05a4ab9`. Sin push. |
| Backend probado | `05a4ab9`. La API 3400 ejecuta el `dist` de `_wt/ACC-A/Back` (`da9c510`). `git diff da9c510 05a4ab9 -- Back` sale vacío. |
| Web probada | `05a4ab9` (Vite de `_wt/ACC-INT/Web` en 5184, con proxy a 3400) |
| Mobile probada | Versión nueva: `08bb6f7346168961460d0c23d4f690835d7e008c`, HEAD de `_wt/ACC-MOB` (`feat/acceso-rol-sin-k-mob`) al compilar. Versión anterior: `507efc8def8447130a8c520049c31515d969dd5c`, en un worktree temporal `--detach` ya borrado. |
| Dispositivo | Emulador AVD `Pixel_8` (Android 16 / API 36, x86_64, 1080×2400), `emulator-5558`. No se usó ningún teléfono físico. |
| Contrato | `docs/architecture/E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md` (§2, §5, §7, §8, §11) y `E4_EJEMPLOS_RESPUESTAS.md` |
| Datos | Sólo sintéticos. Tenant `e4-ver1`, creado en esta sesión. |
| Gate | Pending: lo decide Roderich. |

**Secretos.** No hay contraseñas, tokens ni el origen del túnel en este directorio, en las capturas ni en la salida de las herramientas. Cada inicio de sesión fija una contraseña nueva de un solo uso y la teclea dentro del mismo proceso: `tool/e4/e4_lib.cjs`, `capture_e4.mjs` y `credential_adb.cjs`. En el emulador, `credential_adb.cjs` sólo teclea si el campo enfocado es un `EditText` con `password="true"`. Ninguna captura de Mobile muestra la pantalla de activación con la clave. `17_tunel_peticiones.log` sólo tiene método, ruta (con los UUID ocultos) y estado: `grep -c trycloudflare` → 0.

## 1. Entorno y cambios de entorno

- **API 3400.** Base `acc_api` en `agro_acc_pg` (15440), con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`, `COLLECTIVE_SEALING=enabled` y `COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02`.
- **Reinicio de la API, autorizado por el orquestador, a las 2026-11-13T21:20:14Z.**
  - Motivo: estaba arrancada sin `SYNC_V1_FINGERPRINT_KEY` y todo `POST /sync/v1/push` respondía `503 TEMPORARILY_UNAVAILABLE` (ver `datos/03_convocatorias.json`, pasos «push»). Sin eso no se podían crear por la API real las aportaciones colectivas de 1 y 2 aportantes.
  - Cómo se reinició: con `tool/e4/acc_api.sh restart`. El proceso se detuvo por el PID del puerto, sin leer su línea de comandos. Se arrancó con el mismo entorno que la evidencia del Backend §6, más `SYNC_V1_FINGERPRINT_KEY` (generada en el proceso), `SYNC_V1_FINGERPRINT_KEY_VERSION=1` y `SYNC_V1_PRODUCTION_ADMISSION=enabled`. Los secretos se **exportan** dentro de una subshell que hace `exec node`, así que no aparecen en la línea de comandos de ningún proceso.
  - **Los JWT emitidos antes de esa hora dejaron de valer.**
  - El arranque registró `policy=F07-POL-02 (unchanged)`. `CollectiveDisclosurePolicyActivation` sigue con una sola fila (20:55:47, de la sesión de Backend): no se insertó ninguna activación nueva.
  - La API queda encendida (PID 28872).
- **Web.** Vite en 5184 (PID 6620), detenido al terminar.
- **Túnel HTTPS** (autorizado por el autor para esta verificación): túnel → observador 3401 → compuerta 3402 (sólo `/api/v1/`) → 3400. Se abrió con `tool/e4/acc_env.sh tunnel` y se cerró con `untunnel`. Los dos APK llevan compilado ese origen, que ya está cerrado: hay que recompilarlos para otro uso.
- **Emulador.** `emulator -avd Pixel_8 -port 5558 -dns-server 8.8.8.8,1.1.1.1 -no-snapshot-load`, detenido con `adb -s emulator-5558 emu kill`. No se tocaron `emulator-5556` (RDM_Pixel8), los puertos 3330, 3350, 3370 y 3390, ni ninguna otra app. La app `.acc` (etiqueta «AC E4») queda instalada en el AVD `Pixel_8`, con sus datos sintéticos.
- **Suite de Mobile.** Antes de cada compilación, `tasklist | grep -ci flutter_tester` → 0.

## 2. Datos creados (todos por la API real salvo que se diga otra cosa)

| Qué | Cómo | Archivo |
|---|---|---|
| Tenant `e4-ver1` y otro sindicato `e4-ver1-b`; D1, D2 (Directiva), A1, A2 (Administración), DB (otro sindicato), F1–F3 (agricultores); campaña ABIERTA; productos «Herbicida/Fertilizante sintético E4 VER1» | `Back/scripts/e4-acc-synthetic-walk.cjs` (siembra Prisma del Backend, `E4_SYNTHETIC_SEED=yes`, `E4_LABEL=VER1`, sin `E4_WALK`) con `E4_PASSWORD` generada en la shell y descartada | `datos/01_siembra_VER1.json` |
| Directiva **D3** | `POST /users` como A1 | `datos/03_convocatorias.json` |
| Dos productos por convocatoria («Herbicida/Fertilizante E4V <clave>») | `POST /inventory/products` como A1. Un producto sólo puede estar en una convocatoria abierta: el primer intento falló con `409 PRODUCT_IN_OPEN_CALL` | `datos/02_convocatorias_intento1.json`, `datos/03_…` |
| 7 convocatorias (detalle abajo) | `POST /joint-purchase-calls`, `/open`, `/close`, `/cancel`. Participaciones con `PUT /me/joint-purchase-calls/:id/participation` de sesiones de app reales (login V2 BODY + registro de cliente + vínculo) | `datos/03_convocatorias.json` |
| D3 deshabilitada | `PATCH /users/:id/deactivate` como A1 | ídem |
| Aportaciones colectivas | `POST /sync/v1/push` con sesión de app, después del reinicio: F1 `DECLARED_NEED` Herbicida E4V CB 5000 ML; F1 y F2 `DECLARED_NEED` Fertilizante E4V CB 4000 y 6000 G; F1 `CONSUMPTION_TOTAL` Herbicida E4V CB 2000 ML. Todas `APPLIED`. (`L.ids()` eligió por orden alfabético los productos de CB) | `datos/04_aportes_sync.json` |
| Teléfono (versión anterior): activación de F1, titular «F1 sintetico VER1» (modo propio, sin PIN), proveedor, producto local «Herbicida local E4», campaña local «Campana local E4» y una compra de 5 L por 200 Bs pagada en efectivo | En la app `.acc` 507efc8 | `datos/10_conteos_antes_v19.json` |

| Clave | Nombre | Responsable | Participaciones (alcance resultante) | Estado |
|---|---|---|---|---|
| CA | E4V Abierta D1 | D1 (Directiva) | F1 CONV-4 [P1 1 L, P2 2 kg] (`ADMINISTRATION`); F2 CONV-3 contrato 3 [P2 3 kg] (`RESPONSIBLE_ONLY`) | OPEN |
| CB | E4V Cerrada A1 | A1 (Admin) | F1 CONV-3 contrato 3 [P1 1 L, P2 0,5 kg]; F2 CONV-4 [P1 2 L]; F3 CONV-1 sin cabecera [P1 3 L, P2 0,7 kg] | CLOSED (por A1) |
| CC | E4V Abierta D3 | D3, luego D1 (sustitución) | F2 CONV-4 [P1 1,5 L]; F3 CONV-1 [P2 0,8 kg] | OPEN |
| CD | E4V Cerrada D3 | D3, luego D2 (sustitución) | F1 CONV-4 [P1 1,2 L]; F2 CONV-4 [P1 1,3 L] | CLOSED (por D3) |
| CM1 | E4V Movil nueva | A2 | F2 CONV-4 [P1 1 L]; F1 desde el teléfono (abajo) | OPEN |
| CM2 | E4V Movil anterior | A2 | F1 CONV-3 contrato 3 [P1 2 L], como escribiría una app anterior | OPEN |
| CX | E4V Cancelada | D1 | F1 CONV-3 contrato 3 [P1 0,9 L] | CANCELLED |

## 3. Resultados por caso

«Real» = API real 3400 y Web o app reales. No se simuló ninguna respuesta en este recorrido. El encargo cita «§13»; esa sección no está en el repositorio, así que los casos se ordenan por las Partes 1 y 2 del encargo y por E4 §8.

### Parte 1: Web por rol (real; capturas en `web/`, a 1440 y 390 px salvo indicación)

| # | Caso | Resultado | Pruebas |
|---|---|---|---|
| 1.1 | Directiva responsable (D1 en CA) y no responsable (D1 en CB; D2 en CA y CB): lista y detalle, sin tabla de participantes; total provisional `ROLE_CONSENT` (Herbicida CA, 1 persona, 1 L), `PENDING_CONSENT` (Fertilizante CA), consolidado `PREVIOUS_POLICY_K3` (Herbicida CB, 3 personas, 6 L, «Visible por la regla anterior: lo pidieron 3 o más personas») | **Pasa** | `D1_lista`, `D1_CA`, `D1_CB`, `D2_CA`, `D2_CB`, `D1_CD`, `D1_CX` |
| 1.1b | La Directiva nunca pide `/participants`, y ningún cuerpo JSON que recibe une nombre y cantidad | **Pasa.** El registro de peticiones de D1 y D2 no tiene `/participants`. Se inspeccionaron 31 respuestas de D1, 14 de D2 y 9 de D1 en lo colectivo: 0 hallazgos (nombres de F1–F3, `participants` con filas, nombre unido a cantidad). `/closing` llega a la Directiva sin detalle | `_registro.json` (`apiLog`, `bodies`) |
| 1.1c | Responsable no habilitada (CC): la Directiva ve la explicación para pedir a la Administración, sin botón | **Pasa** («…pida la intervención de una persona de la Administración del sindicato.») | `D1_CC` |
| 1.2a | Administración no responsable (A1 en CA): sólo F1 (CONV-4), aviso de 1 pendiente, F2 ausente | **Pasa** | `A1_CA` |
| 1.2b | Administración responsable (A1 en CB cerrada): sólo F2. Herbicida `PENDING_CONSENT` porque A1 ve a F2 por nombre, mientras la Directiva ve `PREVIOUS_POLICY_K3` (E4 §5.2, punto 2). Aviso de 2 pendientes | **Pasa** | `A1_CB` |
| 1.2c | «Sustituir responsable…» en una no habilitada: A1 lo ejecuta en **CC (abierta)** → D1 y en **CD (cerrada)** → D2, con sucesora, motivo, casilla y confirmación | **Pasa.** Versión 1 → 2, historial «Responsable sustituida» con el motivo, aviso de `MANAGE` suspendidos | `A1_CC_sustituir_listo`, `A1_CC_sustituida`, `A1_CD_sustituir_listo`, `A1_CD_sustituida`; `datos/06_…`, `datos/07_…` |
| 1.2d | Autosustitución prohibida | **Pasa.** En la Web, A1 no figura entre las candidatas (A2, D1, D2). Por la API, A1 → A1 da `422 SUCCESSOR_NOT_ELIGIBLE` y D1 (Directiva) da `403 SUBSTITUTION_FORBIDDEN`; la responsable sigue en la versión 1 | `A1_CC_dialogo_sustituir`, `datos/05_sustitucion_prohibiciones.json` |
| 1.2e | La sustitución no cambia cantidades ni consolidado | **Pasa.** CC: Herbicida 1500 `VISIBLE`, Fertilizante `PENDING_CONSENT`, cantidades [1500], igual antes y después. CD: 2500 / 0 `VISIBLE`, `cutoff_at` y líneas del cierre idénticos, cantidades [1200, 1300] | `datos/06_…` frente a `datos/07_…` |
| 1.3 | Sin paneles retirados: el diálogo de conceder (D1 responsable) sólo ofrece «Administrar la convocatoria»; ningún texto «Consultar participantes y cantidades»; en Usuarios no se gestiona el permiso «Sustituir responsable» y su historia queda «(ya no se usa)», de sólo lectura | **Pasa** | `D1_CA_conceder`, `A1_usuarios` |
| 1.4a | K = 3 retirado en lo colectivo: en Resumen, Herbicida con 1 agricultor (5 L) y Fertilizante con 2 (10 kg), «Política aplicada: F07-POL-02 (totales sin nombres, sin mínimo de aportantes)»; ni «umbral» ni «anónim»; consumo 2 L con 1 agricultor | **Pasa** (D1 y A1) | `D1_resumen`, `A1_resumen` |
| 1.4b | Cobertura con F07-POL-02 (2 de 3 vinculados) | **Pasa**, pero la página no muestra «Política aplicada» (observación O1) | `D1_cobertura` |
| 1.4c | El Excel del resumen no lleva «umbral» ni «anónimo» (leído con `zipfile`) | **Pasa.** 3 hojas, 180 cadenas: «umbral» 0, «anónim» 0, nombres de agricultores 0; «Política aplicada» = «F07-POL-02 (totales sin nombres, sin mínimo de aportantes)» | `descargas/resumen_D1.xlsx`, `datos/08_excel_resumen.json` (`tool/e4/xlsx_e4.py`) |
| 1.4d | Datos sellados con F07-POL-01 siguen como estaban | **No verificable aquí.** `acc_api` no tiene ningún `CollectiveSeal` y no se selló nada. Lo cubren las pruebas del Backend (§8.11) | — |
| 1.5a | Cambio de rol (A1 pasa a A2 a Directiva por `PATCH /users/:id`) con la Web de A2 abierta en CA: la comprobación al recuperar el foco relee el detalle (`can_view_participants: false`), borra nombres y cantidades y explica «Ya no puede ver el detalle identificado…». No se vuelve a pedir `/participants` | **Pasa** | `A2_rol_1_antes`, `A2_rol_2_directiva` (sólo 1440) |
| 1.5b | Vuelta a Administración | La Web no se actualiza sola: la comprobación sólo corre mientras se ven participantes. Hace falta recargar (observación O5) | `A2_rol_3_admin_otra_vez` |
| 1.5c | Deshabilitación (A1 desactiva a A2) mientras A2 ve el detalle: la consulta siguiente da 401, falla la renovación y la Web pasa a `/login`, sin nombres a la vista | **Pasa** (401, como precisa E4 §11.1) | `A2_deshabilitada_viendo` (sólo 1440). Los 3 «hallazgos» de `bodies` en ese bloque son la respuesta de `/participants` que A2 recibió legítimamente **antes**, siendo Administración |

### Parte 2: Mobile en el emulador (real, por el túnel; capturas en `mobile/`)

| # | Caso | Resultado | Pruebas |
|---|---|---|---|
| 2.1 | APK de la versión anterior (`507efc8`, `.acc`) contra la API nueva: activación de F1 y compra | Activación OK; compra guardada (200 Bs) | `02_anterior507_*` |
| 2.2 | La versión anterior no puede leer la lista | Muestra «Esta versión de la aplicación ya no puede leer las compras conjuntas del sindicato. Actualice la aplicación. Lo guardado en el teléfono, incluido lo pendiente…». **No hay reintentos de escritura**, pero sigue consultando la lista una vez por minuto mientras está abierta (observación O2) | `01_anterior507_convocatorias_actualizar.png`; `datos/17_tunel_peticiones.log` (21:44–21:53) |
| 2.3 | Actualización con `adb install -r` sin desinstalar: filas conservadas y esquema v20 | **Pasa.** `user_version` 19 → 20, tablas 44 → 45 (nueva `joint_purchase_access_ops`, vacía). Mismos conteos en las 12 tablas con datos: purchases 1, purchase_items 1, purchase_allocations 1, provider_payments 1, inventory_lots 1, inventory_movements 1, products 1, suppliers 1, campaigns 1, persons 1, owner_bindings 1, app_settings 4 | `datos/10_conteos_antes_v19.json`, `datos/11_conteos_despues_v20.json` (`tool/e4/db_counts.py` sobre copias hechas con `run-as`, en sólo lectura y sin imprimir contenido) |
| 2.4 | La participación antigua sigue y pide «Revisar quién puede ver mi participación» | **Pasa.** CM2 (abierta) y CB (cerrada) llevan «Revisar autorización» en la lista y, en el detalle, «Su participación se registró con un texto anterior…» con la acción. CX (cancelada) no ofrece la acción y sus botones están deshabilitados (pero hay un texto defectuoso, D2) | `04_nueva_lista_*`, `06_CM2_*`, `05_cancelada_*` |
| 2.5 | `CONV-4` con su ayuda | **Pasa.** El texto y la ayuda mostrados coinciden con E4 §4.1. Casilla sin marcar, «Autorizar» deshabilitado hasta marcarla, «Sus cantidades no cambian.» | `07_revisar_conv4_sin_conexion.png`, `13_CM1_consentimiento_conv4.png` |
| 2.6 | Aceptar sin conexión (modo avión) → «pendiente» | **Pasa.** «Pendiente de envío: autorizar a la Administración… Hasta que el sindicato la reciba, no está aplicada y rige lo que se indica arriba.» Arriba sigue el texto anterior | `08_*`, `08b_*` |
| 2.7 | Con conexión, se aplica y la Administración lo ve en la Web | **Pasa.** `POST …/consent` 200; «Su última decisión… está aplicada»; A1 ve a F1 en CM2 | `09_autorizacion_aplicada.png`, `web/movil_autorizada_CM2` |
| 2.8 | Cambiar cantidades sin que cambie el consentimiento | **Pasa.** De 2 L a 3 L con `PUT` 200; en la base, `ADMINISTRATION`/`CONV-4`/secuencia 1 (con `consentVersion` CONV-3 como historia); A1 ve [3000] | `10_modificar_cantidades.png`, `datos/12_CM2_tras_modificar.json` |
| 2.9 | Retirar la autorización conservando la participación (`TOTALS_ONLY`); la Web deja de mostrar el detalle a la Administración | **Pasa** en lo funcional: `TOTALS_ONLY`/secuencia 2/`ACTIVE`; A1 no ve a F1; el total de 3 L sigue `VISIBLE`. **Defecto de texto en la Web** (D1) | `11_*`, `12_*`, `web/movil_retirada_CM2`, `datos/13_…` |
| 2.10 | Nueva participación con `CONV-4` (CM1) | **Pasa** (4 L y 10 kg, «Participación recibida») | `13_*`, `14_*` |
| 2.11 | Convocatoria cerrada (CB): revisar sin reabrirla | **Pasa.** La huella MD5 de `JointPurchaseCallClosing`, `…Line` y `…Participant` es la misma antes y después (`15b8c345…`), con el estado CLOSED. A1 pasa a ver a F1 y F2 (F3 sigue sin autorizar); la Directiva sigue con `PREVIOUS_POLICY_K3` 6 L. La decisión tuvo que enviarse con «Enviar ahora» (observación O3) | `17_*`, `18_*`, `18b_*`, `19_*`, `web/movil_revisada_cerrada_CB`, `datos/15_…`, `datos/16_…` |
| 2.12 | Envíos con el modo avión: dos cambios de cantidad y una retirada en medio, sin conexión | **Pasa.** Lo pendiente se muestra como pendiente (cantidades y retirada) y el texto de arriba sigue siendo el aplicado. Al reconectar: un `PUT` (6 L) y luego `consent`; estado final 6 L + 10 kg y `TOTALS_ONLY` (observación O4) | `15_*`, `16_*`, `16b_*` |
| 2.13 | Envío atrasado y repetido (con una segunda sesión de app de F1, por la API real) | **Pasa.** `ADMINISTRATION` con una secuencia ya usada → `409 STALE_SEQUENCE` y el alcance sigue `TOTALS_ONLY`. El mismo `operation_id` repetido → la misma respuesta. El mismo `operation_id` con otro cuerpo → `409 OPERATION_ID_REUSED`. A1 sigue sin ver a F1 en CM1 | `datos/14_envios_atrasados_repetidos.json` |

### APK

| APK | Código | SHA-256 |
|---|---|---|
| `agrocuentas.acc-anterior507.apk` (profile x64, «AC E4») | Mobile `507efc8` | `cddcb6ad10a1279f2ffd9800c6a67787f673b3101e00e42d9b47592c0127e90b` |
| `agrocuentas.acc-nueva.apk` (profile x64, «AC E4») | Mobile `08bb6f7` | `84d61c13cf2d76eaf2e22f1b5632da58c7335e87a7a19570ecfe51c088993369` |

Las dos llevan compilado el origen del túnel del 2026-11-13, ya cerrado. No se versionan: están en `%TEMP%/agro_acc_verif/apk`. Si cambia el origen, el SHA-256 del archivo cambia aunque el código sea el mismo.

## 4. Defectos

**D1 — Web: texto falso en una participación `TOTALS_ONLY`** (prioridad media-baja)

- **Pasos.** F1 retira su autorización en CM2 desde el teléfono (2.9). A1 abre CM2 en la Web.
- **Esperado.** El total de Herbicida (3 L) es visible y la participación aceptó `CONV-4` y luego la retiró. El texto no debería decir que tiene una autorización «anterior» ni que los totales están pendientes.
- **Visto.** En «Pedido hasta ahora»: «1 participación tiene una autorización anterior y espera la nueva de su agricultor. Los totales pendientes se mostrarán cuando todas las participaciones del producto tengan la autorización nueva.» Es falso: no es anterior, el total ya se muestra y el agricultor decidió retirarla. Debajo de «Quién pidió» aparece además «1 participación sin la autorización vigente…».
- **Causa probable.** `pending_consent_count` cuenta también `TOTALS_ONLY` (E4 §8.2) y la Web usa siempre el texto de «autorización anterior».
- **Captura.** `web/movil_retirada_CM2__escritorio.png`

**D2 — Mobile: en una convocatoria cancelada se invita a una revisión que no existe** (prioridad baja)

- **Pasos.** Con la app nueva, abrir CX (cancelada, participación CONV-3) y bajar a «Quién ve sus datos».
- **Esperado.** Con la acción de revisar ausente en `CANCELLED` (correcto según E4 §8), el texto no debería pedir que se haga.
- **Visto.** «…nadie de la Directiva ni de la Administración ve su nombre ni sus cantidades hasta que usted revise quién puede ver su participación. Mientras tanto, los totales…», sin ninguna acción para hacerlo.
- **Captura.** `mobile/05_cancelada_quien_ve.png`

## 5. Observaciones (no son defectos según el contrato, o no está claro que lo sean)

- **O1.** La página Cobertura no muestra «Política aplicada»; Resumen y el Excel sí. La evidencia de la Web dice que la muestran «Resumen, cobertura, tendencias…».
- **O2.** La app anterior (`507efc8`) consulta `GET /me/joint-purchase-calls` cada ~60 s mientras está abierta: 10 veces en 10 minutos, todas con 200 y forma 4. Cada vez muestra «Actualice la aplicación». No es un reintento con espera creciente ni una escritura, pero no se detiene.
- **O3.** Con la app nueva, una decisión tomada en línea quedó pendiente más de 3 minutos (de 22:06 a 22:09) hasta pulsar «Enviar ahora». El envío automático (`jointPurchaseQueued`) sólo corre con un acceso verificado en memoria, y el token había caducado: el envío manual empezó con `POST /auth/v2/refresh`. Lo pendiente se mostró siempre como pendiente.
- **O4.** Sin conexión, la cola juntó dos cambios de cantidad en un solo `PUT` y lo envió antes que la retirada, aunque la retirada se decidió entre los dos cambios. El estado final es el correcto.
- **O5.** Tras pasar a Directiva, la barra lateral sigue diciendo «Administrador» y enseña «Usuarios» hasta recargar. Al volver a Administración, el detalle no se actualiza solo (la comprobación periódica se apaga cuando `can_view_participants` es falso). Lo mostrado nunca fue más de lo permitido.
- **O6.** En CD (cerrada), un producto sin ninguna participación sale `VISIBLE` con «0» y `ROLE_CONSENT` («Nadie lo pidió»). E4 §11.2 lo precisa sólo para `DRAFT`; parece coherente (cero real).

## 6. No verificado y por qué

- **Datos sellados con `F07-POL-01`:** no hay ningún sellado en `acc_api` y no se selló nada. Tampoco se probaron el sellado ni las tendencias con `F07-POL-02`.
- **Actualización con una participación anterior guardada en el teléfono:** la app anterior no puede leer la API nueva (2.2), así que antes de actualizar no tenía filas de convocatorias en local. Las participaciones antiguas (CM2, CB, CX) se crearon por la API real con el contrato 3, que es la escritura que hace una app anterior. Se comprobó cómo las presenta la app nueva, no la conservación local de una participación v19. La migración v19 → v20 con convocatorias la cubre `migration_test.dart` de Mobile, que no se ejecutó aquí.
- **Envíos repetidos o atrasados del propio teléfono:** con el modo avión no se pudo provocar un duplicado ni un atraso. Se probaron con una segunda sesión de app de F1 por la API real (2.13).
- **Aviso de Inicio** («convocatorias que piden revisar»): no se capturó.
- **Excel de Administración:** sólo se leyó el de la Directiva; la primera descarga falló por la configuración del navegador sin interfaz, antes de corregir `capture_e4.mjs`.
- **Teléfono físico:** sólo el emulador.

## 7. Herramientas (`tool/e4/`)

| Herramienta | Qué hace |
|---|---|
| `e4_lib.cjs` | Utilidades comunes: sesiones institucionales y de app con contraseñas de un solo uso, HTTP con reintento en 429 |
| `datos_e4.cjs` | Convocatorias, productos, D3 y aportaciones (`crear`, `aportes`, `leer`) |
| `sustitucion_api.cjs` | Prohibiciones de la sustitución y estado antes y después |
| `envios_api.cjs` | Envíos atrasados y repetidos |
| `capture_e4.mjs` | Copia adaptada de `tool/web_rediseno_v2/capture_base.mjs`. Añade `bodies`, `text`, `download`, `admin`, `focus` y `url` |
| `plan_convocatorias.mjs`, `plan_sustitucion.mjs`, `plan_colectivo.mjs`, `plan_excel.mjs`, `plan_rol.mjs`, `plan_deshabilitar.mjs`, `plan_movil_web.mjs` | Planes de captura |
| `ids_e4.mjs` | Identificadores de las convocatorias |
| `xlsx_e4.py`, `db_counts.py` | Lectura del Excel y conteo de filas de la base del teléfono |
| `acc_api.sh` | Reinicio de la API 3400 |
| `acc_env.sh` | Copia adaptada de `rdm_env.sh`, que no se tocó: túnel 3401/3402, `build-app`, `install-app`, `credential` |
| `acc_ui.sh` | Copia adaptada de `rdm_ui.sh`, con guarda de primer plano y filtro de cadenas tipo clave |
| `credential_adb.cjs` | Teclea la contraseña de un solo uso en el emulador sin mostrarla |

Comandos: `E4_LABEL=VER1 node tool/e4/capture_e4.mjs tool/e4/plan_<…>.mjs docs/evidence/E4`, y `bash tool/e4/acc_env.sh tunnel | build-app <etiqueta> | install-app <etiqueta> | untunnel`.
