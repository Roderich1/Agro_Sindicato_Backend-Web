# Evidencia — P-A: sustitución de la persona responsable (A1 + B1 + C1) y Excel con cifras desactualizadas

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-12 (UTC−4 en las capturas; marcas UTC en los JSON) |
| Back / Web | `_wt/ET2-BE`, rama `feat/etapa3-estimacion-borrador`: `49ed870` (Back P-A), `3fab972` (Web P-A + Excel), `d5dc9cc` (corrección del Excel tras abrirlo + guiones) |
| Mobile | `_wt/ET2-MOB`, rama `feat/etapa2-historial-colaboradores`: `4a3f1ad` (contrato 3, v19), `2cc7e39` (nombre del reporte + muestra Excel) |
| Entorno | AISLADO: contenedor `agro_et1_pg` (15434, base `agro_demo`), API 3350 desde `dist` de `49ed870`, Web 5175 (Vite). Datos sintéticos. No se tocó la DEMO oficial |
| Decisión | Encargo del autor del 2026-11-12 («Continúa con P-A. Elijo A1 + B1 + C1…») |
| Contrato | `docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md` §12 |
| Carpeta | `docs/evidence/e2_pa_2026-11-12/` |

Lo **real** (API, base y Web del entorno aislado, Excel abierto en Microsoft Excel, emulador) está separado de lo **simulado** (pruebas automatizadas). El recorrido en el **emulador** (no en un teléfono físico) se hizo por la tarde: ver §7.

## 1. Recorrido real (API, base y Web)

Convocatoria «Convocatoria P-A sustitución (sintética)» (`123434f8…`), abierta por «Responsable PA (sintética)», con «Consultar participantes» concedido a Administración DEMO y «Administrar» a Directiva DEMO, y dos participaciones (agricultor1 por el contrato 3 y ampliada; agricultor2 por el contrato 2). Guion `tool/etapa3/pa_walk.cjs setup`.

| # | Paso | Quién / cómo | Resultado | Archivo |
|---|---|---|---|---|
| 1 | Conceder «Sustituir responsable» | Administración PA 2, en la Web | Concedido a Directiva DEMO con motivo; historial con actor y motivo | `pa_w01–w03`, `web_pa_permiso.json` |
| 2 | Antes de inhabilitar | API como Directiva DEMO | `can_substitute_responsible: false` (la responsable sigue habilitada) | `api_pa_01_antes_inhabilitar.txt` |
| 3 | Inhabilitar a la responsable | API real de usuarios (`PATCH /users/:id/deactivate`) | `eligible_now: false` | `api_pa_02_inhabilitar.txt` |
| 4 | Responsable inhabilitada | Web como Directiva DEMO | Aviso nuevo; **sin** «Cerrar» ni «Cancelar» (N2 rechazada); permisos «Suspendido» | `pa_w04` |
| 5 | Sustituir | Web: sucesora, motivo y confirmación | Sucesora PA es la responsable (versión 2); la convocatoria sigue `OPEN` con el mismo plazo; evento «Responsable sustituida» con el motivo y «2 permisos suspendidos» | `pa_w05`, `pa_w06`, `web_pa_sustituir.json` |
| 6 | Vista de la sucesora | Web como Sucesora PA | 0 filas de participantes, «2 participaciones pendientes de que sus agricultores autoricen…», total «no visible» (`RESTRICTED`), «2 permisos … esperan su revisión» | `pa_w07` |
| 7 | Revisar delegaciones | Web como Sucesora PA | Confirmado «Consultar participantes» de Administración DEMO; retirado «Administrar» de Directiva DEMO. Historial: GRANTED ×2, SUSPENDED ×2, CONFIRMED, REVOKED | `pa_w08`, `pa_w09`, `web_pa_sucesora.json` |
| 8 | Agricultor por contrato | API (`pa_walk.cjs farmer`, `e2_contract_probe.cjs`) | Contrato 3: `responsible.version 2`, `responsible_authorization {authorized:false, version:1}`; contrato 2 y 1: sin esas claves | `api_pa_03_agricultor.txt` |
| 9 | Las cantidades no autorizan | API, contratos 2 y 3 | Modificar: `ACCEPTED`, sigue sin autorizar | idem |
| 10 | Ampliar sin autorizar (app contrato 2) | API | `409 AUTHORIZATION_REQUIRED` (reintento: igual) | idem |
| 11 | Autorización pendiente para la anterior | API, `responsible_version: 1` | `409 RESPONSIBLE_CHANGED`, versión vigente 2 | idem |
| 12 | Autorizar sólo a la nueva | API, versión 2 | `ACCEPTED`, `authorized: true, version: 2`, alcance `RESPONSIBLE_ONLY` (no amplía); reintento con el mismo id: 200 | idem |
| 13 | Después | API | Sucesora: 1 participante visible y 1 pendiente; colaboradora confirmada: 0 visibles (la autorizada es sólo para la responsable), 1 pendiente; responsable anterior reactivada: `PARTICIPANTS_FORBIDDEN`, sin administrar | `api_pa_06_despues.txt` |
| 14 | Concurrencia real | Dos sustituciones a la vez (dos personas con el permiso) en otra convocatoria | Una `200`, la otra `409 RESPONSIBLE_CHANGED`; reintento del ganador `200` sin segundo cambio; mismo id con otro motivo `409 REQUEST_ID_REUSED`; 1 registro y 1 evento | `api_pa_05_concurrencia.txt` |

Nota del paso 14: el primer intento (primera línea del archivo) no midió la carrera porque la segunda persona no tenía el permiso (`403 SUBSTITUTION_FORBIDDEN`); se le concedió por la API y se repitió.

## 2. Excel del borrador con cifras desactualizadas (real) y revisión abierta en Excel

- Para tener cifras desactualizadas reales se corrigió por la API la clasificación de «Invierno 2023 (DEMO)» (campaña sintética cerrada) a «sin clasificar», con motivo. La referencia fijada del borrador `84e18f96…` pasó a tener 7 líneas `OUTDATED` (`CLASSIFICATION_CORRECTED`, `comparable: false`) — `api_pa_04_desactualizada.txt`, captura `pa_x01_borrador.png`.
- El Excel se descargó desde la Web real (`propuesta-84e18f96-….xlsx`) y se **abrió en Microsoft Excel** con `tool/etapa3/excel_open_check.ps1` (sólo lectura): capturas de la ventana por hoja y lo que Excel informa (filtro, inmovilizado, rango, formatos) en `excel_abierto/`.
- Primera apertura (`excel_abierto/antes/`, libro `antes-propuesta-84e18f96.xlsx`): la fila «Cifras desactualizadas» de la portada cortaba el principio del texto (estilo centrado sin ajuste) y la columna de etiquetas cortaba las que llevan la zona horaria. Corregido en `d5dc9cc`; segunda apertura (`excel_abierto/r1/`): texto completo y etiquetas enteras.
- Comprobado a la vista: «Desactualizada» resaltado en «Estado» y «Vigencia» con su motivo; sin diferencia ni porcentaje; referencia y versión del borrador y de la referencia, «Referencia fijada el» y «Ejecución fijada del» como fechas; hojas de datos con filtro e inmovilizado (`excel_open_check.json`). Las cifras se escriben exactas (hasta 9 decimales, por ejemplo `428.92938509`): legible pero largo (diseño anterior, sin cambio).

## 3. Excel de Mobile (generado por el código de la app, abierto en Excel)

No se generó en un teléfono (§5). `tool/pa/excel_muestra_test.dart` usa el servicio real de reportes (`ReportExportService` → `XlsxReportGenerator`) con datos sintéticos (nombres largos, decimales, fechas) y los archivos se abrieron en Excel (`excel_abierto/r2–r4`). Bien: filtro e inmovilizado, fechas `dd/mm/aaaa`, decimales (`17.625` L, `2,175.81` Bs). Corregido (`2cc7e39`): el estado de cuenta se llamaba `estado-de-cuenta-Ana Mar-a … -sint-tica-2.xlsx` (tildes cambiadas por guiones y la fecha cortada por el límite de 80); ahora `estado-de-cuenta-Ana Maria Quispe Mamani de la Comunidad-2026-11-12.xlsx` (`mobile_excel/`). Anotado sin corregir: nombres largos de producto y etiquetas del resumen cortados por el ancho fijo de columna.

## 4. Pruebas (simuladas)

| Suite | Resultado |
|---|---|
| Back, E2 PostgreSQL (`joint-purchase-calls.postgres.spec.ts`) | 31/31 (4 nuevas de P-A: A1; B1 en abierta con condiciones, reintentos, delegaciones y C1; borrador, cerrada y cancelada; concurrencia) |
| Back, dominio (`call-domain.spec.ts`, `visibility-matrix.spec.ts`) | 71/71 (matriz C1 de 11 casos) |
| Back, E3 PostgreSQL | 24/24 |
| Web, páginas de convocatorias y permiso | 72/72 (3 nuevas de P-A en el detalle, 2 de la sección del permiso) |
| Web, Excel | 37/37 (nueva: desactualizada y comparable → sin diferencia; portada la cuenta) |
| Mobile, E2 + P-A + migración | 87/87 en E2 y P-A; v18 → v19 conserva lo pendiente y no rellena |
| Mobile, reportes | 47/47 (nombre con tildes y con persona larga) |
| Suites completas | ver §6 |

## 5. Límites de esta evidencia

- **Teléfono (actualizado en §7):** en la primera ronda el recorrido en el emulador no se hizo. El AVD Pixel_8 (`emulator-5554`) se colgó al arrancar («bad color buffer handle», hilos de QEMU sin respuesta) y no pude cerrarlo (sin permiso para detener procesos). La APK `AC ET1 PA` (`.et1`, Mobile `4a3f1ad`, atada al túnel de ese día) se compiló pero no se instaló. La parte visible de Mobile está probada sólo con pruebas de widget y de almacén/emisor.
- **APK anteriores reales:** no se comprobaron después de una sustitución en un dispositivo; sí la forma de los contratos 1 y 2 por la API real (pasos 8–10).
- La APK `.et1` queda atada al túnel del 2026-11-12: para recorrerla otro día hay que compilarla de nuevo.
- Los datos del entorno aislado cambiaron (clasificación corregida, personas y convocatorias PA, un permiso concedido): son sintéticos y sólo de ese entorno.

## 6. Suites completas sobre el código final (secuenciales, 2026-11-12)

| Suite | Código | Comando | Resultado |
|---|---|---|---|
| Back | `d5dc9cc` | `npx jest --maxWorkers=3` con las variables `*_PG_TEST_URL` hacia el contenedor aislado | 86 suites pasan, 1 omitida; 999 pruebas pasan, 6 omitidas. La omitida es `backups/b151-b2-real.postgres.spec.ts` (necesita el almacenamiento B2 real, pendiente). 147 s |
| Web | `d5dc9cc` | `npx vitest run --no-file-parallelism` | 54 archivos, 566 pruebas, todas pasan |
| Mobile | `2cc7e39` | `flutter test` | 3043 pasan, 3 omitidas por condición previa (`date_display_test`: sólo en America/La_Paz; `f06_reconciliation_integration_test`: sin base de integración). 4 min 08 s |

Tiempos de espera: en esta corrida no hubo ninguno. En la del 2026-11-12 por la mañana fallaron por tiempo `current-auth-context` y `f81-phase6` con los trabajadores por defecto, y pasaron solas (25/25 y 7/7). Esta vez se limitó a 3 trabajadores y pasaron dentro de la suite completa. Eso apunta a la carga del equipo, pero **no** lo prueba: no se midió la causa.

## 7. Decisión del autor sobre la autosustitución y recorrido en el emulador (2026-11-12, tarde)

Decisión del autor: quien ejecuta la sustitución **no** puede nombrarse a sí misma; otra persona habilitada con el permiso sí puede nombrarla; sin otra persona elegible se informa del bloqueo, sin excepción automática ni accesos nuevos. Recorrido en **emulador** Android (AVD `Pixel_8` y `RDM_Pixel8`, x86_64): **no** es una prueba en teléfono físico.

### 7.1 Cambios y pruebas (simuladas)

| Commit | Qué | Comprobación |
|---|---|---|
| `8cc8c4f` | Web: quien sustituye no aparece en la lista y se le explica por qué (`substitute-self-note`); si sólo es elegible ella o no hay nadie, se informa del bloqueo y no se puede enviar (`substitute-no-candidates`). Prueba PostgreSQL nueva: la autosustitución da `422 SUCCESSOR_NOT_ELIGIBLE` sin registro ni cambio de versión, y otra titular del permiso sí la nombra (registro con actor, anterior y nueva). Contrato §12.7 y continuidad. El código del Back no cambia (el bloqueo ya estaba en `49ed870`) | E2 PostgreSQL 32/32; Web completa `npx vitest run --no-file-parallelism` 568/568 (54 archivos); `tsc -b` sin errores; `eslint .` 0 errores (7 avisos anteriores, en archivos no tocados) |
| `fce0b0c` y el commit de esta evidencia | Guiones: `pa_walk.cjs selfsub`, `PA_CALL`/`PA_RESP`; `web_pa.mjs` registra la nota y la lista del diálogo | — |

Mobile no cambió: valen las suites del §6 y la del rediseño sobre `91f2e73` (3055 pasan, 3 omitidas, 0 fallan, informada por esa sesión).

### 7.2 App integrada (rediseño + P-A): recorrido de la sesión del rediseño

Lo hizo la sesión del rediseño en `emulator-5556` (`RDM_Pixel8`), contra su Back aislado actualizado a `49ed870` (23 migraciones, sin fallidas, datos conservados), con la APK «AC RDM» compilada de `91f2e73` (SHA-256 `6e82fd2b…da88`, `lastUpdateTime` 17:53:29, esquema 19). Su evidencia está en `_wt/RDM-MOB`, commit `33482cb`: `docs/evidence/rediseno-movil/2026-11-12/integracion/README.md` y `pa_api.txt` (no se copian aquí). Resultado que informó:

| Punto | Resultado |
|---|---|
| a. Sustitución por una persona autorizada | `200`, versión 1→2, sigue `OPEN` |
| b. Autosustitución | `422 SUCCESSOR_NOT_ELIGIBLE`, versión sigue en 1 |
| c. Delegaciones | eventos `SUSPENDED:PARTICIPANTS` y `SUSPENDED:MANAGE`; la sucesora tiene 2 por revisar |
| d. Datos restringidos | la sucesora ve 0 participantes y 3 pendientes; el teléfono muestra la tarjeta y «Revisar autorización» |
| e. Autorización y cantidades | modificar 10→12 KG no autoriza (sigue versión 1); autorizar deja 12 KG y pasa a versión 2, «aplicada en el sindicato» |
| f. Convocatoria cerrada | sustitución `200` y sigue `CLOSED`; autorizar desde el teléfono no la reabre; consolidado guardado 4000/1 y `/closing` idéntico al del cierre |

### 7.3 App anterior (contrato 2) en el Pixel_8: recorrido propio (real)

Entorno aislado de §1 (API 3350 con el `dist` de `49ed870`; Web 5175 con `8cc8c4f`). Túnel HTTPS temporal sólo hacia `/api/v1/` por la compuerta, con autenticación; PostgreSQL y la DEMO oficial no se expusieron; **cerrado** al terminar.

El Pixel_8 que se había colgado respondía de nuevo (arrancado, escritorio visible, sin instalaciones en curso). La sesión del rediseño lo cerró con `adb emu kill` (sin wipe) y se volvió a arrancar conservando sus datos (`-gpu swiftshader_indirect`). No se tocó `emulator-5556`.

La APK anterior se compiló de nuevo **del mismo SHA**, porque el origen del túnel va dentro de la APK: paquete `.et1o`, Mobile `e1f6e25` (contrato 2, esquema 18), SHA-256 `229a002f4a020c6f91879bb3cc758f0614afa1c05922f7a4dfdefb1dd2d680c0`. Se instaló con `adb install -r` sobre la misma, conservando sus datos (`lastUpdateTime` 14:14:24; primera instalación 08:09:26). Cuenta agricultor13. Carpeta `e2_pa_2026-11-12/emu_app_anterior/`.

| # | Paso | Quién / cómo | Resultado | Archivo |
|---|---|---|---|---|
| g1 | Convocatoria nueva «Convocatoria P-A app anterior (sintética)» con Responsable PA 3; «Consultar participantes» a Administración DEMO y «Administrar» a Directiva DEMO; agricultor1 (contrato 3, ampliada) y agricultor2 (contrato 2) por la API | `PA_CALL=… PA_RESP=resp3 pa_walk.cjs setup` | Abierta, versión 1 | `api_g01_…` |
| g2 | La app anterior lee la lista y participa con 5 L («Entiendo y acepto») | Emulador | «Participación recibida · El sindicato tiene: 5 L»; «Sólo la persona responsable (Responsable PA 3) puede ver…» | `g01`–`g03` |
| g3 | Inhabilitar a la responsable | API real de usuarios | `eligible_now: false` | `api_g01_…` |
| g4 | Autosustitución: Directiva DEMO (titular del permiso) se nombra a sí misma | API (`selfsub`) | `422 SUCCESSOR_NOT_ELIGIBLE`; responsable y versión 1 sin cambio; 0 registros de cambio | `api_g01_…` |
| g5 | Sustituir | Web como Directiva DEMO | En el diálogo, Directiva DEMO no figura entre las opciones y aparece la nota «Usted no aparece en la lista: quien sustituye no puede nombrarse…». Sucesora PA queda como responsable (versión 2); 2 permisos suspendidos | `web/pa_w04–w06`, `web/web_pa_sustituir.json` |
| g6 | Lo que ve cada persona | API | Sucesora: 0 participantes, 3 pendientes, total `RESTRICTED`; Administración y Directiva DEMO: `PARTICIPANTS_FORBIDDEN` | `api_g02_…` |
| g7 | App anterior tras «Actualizar» | Emulador | Muestra «Responsable: Sucesora PA» y **«Sólo la persona responsable (Sucesora PA) puede ver su nombre y sus cantidades»**: el texto es más permisivo que lo real, porque la sucesora no ve nada hasta que el agricultor la autorice. Ver §7.4 | `g04` |
| g8 | «Modificar» a 7 L desde la app anterior | Emulador | `PUT … 200`; servidor: 7000 (base), `RESPONSIBLE_ONLY`, autorizada para la versión **1** con la vigente en 2: cambiar cantidades **no** autoriza | `g05`, `api_g03_…` |
| g9 | «Autorizar también a la Directiva o la Administración» desde la app anterior (casilla marcada) | Emulador | `POST …/consent 409` **una sola vez**, sin reintentos (`requests_tunel.log`). La app dice «El sindicato no aplicó su última decisión sobre quién ve sus datos (AUTHORIZATION_REQUIRED). Rige lo que se indica arriba.» Servidor sin cambio (alcance, versión 1, 7 L) | `g06`, `g07`, `api_g03_…` |
| g10 | Después | API | La sucesora sigue con 0 participantes y 3 pendientes; total `RESTRICTED` | `api_g03_…` |

### 7.4 Límites que quedan

- **App anterior (contrato 2):** el comportamiento es **seguro**: no amplía, no autoriza a la sucesora al cambiar cantidades ni con «Autorizar también», no reintenta y no restaura accesos. Pero **no puede representar** la autorización de la nueva responsable: su texto dice que la sucesora «puede ver» los datos cuando no es así, y el agricultor no puede autorizarla desde esa versión. Se mantiene la restricción y **hace falta actualizar la app**; la app integrada sí lo resuelve (§7.2 d–e).
- El recorrido de la app integrada (§7.2) lo hizo la sesión del rediseño en su emulador y su entorno; aquí se resume lo que informó, con su commit de evidencia.
- No se probó en un teléfono físico. El caso de una autorización sin red que llega después de otra sustitución no se recorrió en el emulador: lo cubren sólo las pruebas automáticas (`e2_pa_responsible_test.dart` y la prueba PostgreSQL de B1).
- Los datos del entorno aislado cambiaron: convocatoria «app anterior», Responsable PA 3 inhabilitada y contraseñas de un solo uso en cuentas sintéticas. Sólo ese entorno.
