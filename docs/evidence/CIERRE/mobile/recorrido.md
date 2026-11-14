# CIERRE: recorrido Mobile en el emulador (M1–M7)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-13: de 23:43 a 00:41 UTC del 14 (de 19:43 a 20:41 en La Paz) |
| Dispositivo | AVD propio `Cierre_Pixel8` (Android 16, x86_64, 1080×2400, 8 GB de datos, `hw.keyboard=no`), `emulator-5560`, creado por el orquestador. Zona `America/La_Paz`. No se usó ningún teléfono físico. `emulator-5556` no se tocó. |
| Primer intento | AVD `Pixel_8`, `emulator-5558`: ver «Intentos» al final y la carpeta `intento_5558/` |
| API | 3400 real (`acc_api`, Back `7afd574` de `_wt/CIERRE-BE`), tenant sintético `e4-ver1`. El teléfono la alcanza por el túnel HTTPS autorizado por el autor el 2026-11-13; el origen no se publica. |
| Web | Vite 5184 (integración final) contra la API 3400 |
| APK (sin modelos de voz) | `anterior507`: Mobile `507efc8`, SHA-256 `02f8dc137038b2cc9b420ccfbc583e3c6709b82ba25d8f6c948acf5335bfad79`. `final`: Mobile `aeeb4f0`, SHA-256 `f7c160211522c6c359eaa6f9eaa4c8b73df447a2d861ca1cdb9283065e5176a3`. Los SHA-256 se calcularon en esta sesión antes de instalar. Para M6, `final-voz`: el mismo `aeeb4f0` con los modelos de voz, SHA-256 `5d86f1ea34948b8841a71c14ae627b8dfb8360603f26b2ad81ca217706e02b4d`, instalada con `install -r` y **es la que queda instalada**. |
| Gate | Pending: lo decide Roderich. |

**Secretos**
- La contraseña de F3 es de un solo uso. La teclea `tool/cierre/cierre_env.sh credential F3` dentro del proceso, sólo si el campo enfocado es un `EditText` con `password="true"`, y nunca se imprime.
- `credential_adb.cjs` se adaptó para aceptar también `emulator-5560`.
- Ninguna captura muestra la pantalla de activación con la clave escrita: `M1_01` se tomó antes de escribir.
- Las consultas a la API (`tool/cierre/participantes_cc.cjs`) sólo guardan estado HTTP, primer nombre y cantidades.
- La Web se capturó con `tool/e4/capture_e4.mjs` y el plan `tool/cierre/plan_movil_cierre.mjs`.

**Discrepancias con el plan:**
- **F3 no participa en CA.** Por indicación del orquestador, M3 y M7 se hicieron en **CC** («E4V Abierta D3», OPEN, F3 con `CONV-1`).
- **Datos de F3 al empezar** (consulta en sólo lectura):
  - CB («E4V Cerrada A1», CLOSED): `CONV-1`/`RESPONSIBLE_ONLY`;
  - CC: `CONV-1`/`RESPONSIBLE_ONLY`, 0,8 KG de Fertilizante.

## M1: versión anterior (507efc8), activación de F3 y registros con varias personas. **Pasa**

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| `install-app anterior507` (instalación nueva de `.cierre`) | `Success` (00:08 UTC) | — | emulador |
| Activar en línea como `e4-ver1-f3@example.test` | Correcta, por el túnel | `M1_01_activar.png`, `M1_02_titular.png` | emulador + API real |
| Titular «F3 sintetico VER1», modalidad **Compartido**, PIN «Ahora no» | «Titular vinculado. Usa inventario compartido» | `M1_03_titular_compartido.png`, `M1_04_inicio_inicial.png` | emulador |
| Campaña local «Campana local CIERRE» (desde 13/11/2026) | Hace falta: sin campaña activa, la compra no deja confirmar («No hay una campaña activa…», visto en 5558) | — | emulador |
| Compra | «Proveedor sintetico CIERRE», «Herbicida local CIERRE» (Glifosato, L), 10 L × 25 Bs = **250 Bs**, para F3, pagada en efectivo | `M1_05_compra_confirmar.png` | emulador |
| Aplicación | «Chaco Norte CIERRE» (2 ha), 3 L → **75 Bs**, «Costo propio … en la cuenta de F3» | `M1_06_aplicacion_confirmar.png` | emulador |
| Plan | Chaco Norte, 2 ha, 1,5 L/ha → «Necesita 3 L · Cubierto · hay 7 L» → «Plan guardado.» | `M1_07_plan.png` | emulador |
| Cifras | **Inicio**: Por cobrar 0,00; Compras 250,00 Bs; Pagado a proveedores 250,00 Bs; Pagos recibidos 0,00; «Nada pendiente por ahora». **Almacén**: 1 producto, existencia 7 L, valor 175,00 Bs, previsto en planes 3 L (quedarían 4 L), 1 lote sin fecha. **Actividad**: plan 3 L por hacer; aplicación 3 L 75,00 Bs; compra 250,00 Bs Pagada | `M1_08_actividad.png`, `M1_09_almacen.png`, `M1_10_inicio.png` | emulador |
| Compras conjuntas en la versión anterior | «Esta versión de la aplicación ya no puede leer las compras conjuntas del sindicato. Actualice la aplicación…» (esperado; E4 2.2) | `M1_11_sindicato_anterior.png`, `M1_12_convocatorias_anterior.png` | emulador + API real |
| Base del teléfono antes de actualizar | `user_version` **19**, 44 tablas; 20 tablas con filas. Copia con `run-as`; sólo se cuentan filas | `datos/M2_conteos_antes_v19.json` | emulador |

## M2: actualización con `install -r` a la final (aeeb4f0). **Pasa**

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| `am force-stop`, copia de la base, `install-app final` | `Success` (00:17:49 UTC). `lastUpdateTime` 20:08:49 → 20:17:49 (hora de La Paz). Sin desinstalar | — | emulador |
| Abrir la app | **No pide reactivar** ni titular: entra en Inicio con «Campaña activa: Campana local CIERRE» | `M2_01_inicio_tras_actualizar.png` | emulador |
| Cifras | **Idénticas a M1**: Compras 250,00; Pagado 250,00; Por cobrar 0,00; Almacén 7 L / 175,00 Bs / previsto 3 L; Actividad: el mismo plan, aplicación y compra | `M2_01…`, `M2_02_actividad.png`, `M2_03_almacen.png` | emulador |
| Esquema medido | `user_version` **19 → 20**, tablas 44 → 45 (nueva `joint_purchase_access_ops`, vacía). Las otras 44 tablas tienen el mismo número de filas. No hay pantalla de versión: se midió en una copia de la base | `datos/M2_conteos_antes_v19.json`, `datos/M2_conteos_despues.json` | emulador |

## M3: aviso de revisión y autorización `CONV-4` a la Administración en CC. **Pasa**

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| Inicio justo después de actualizar | «Nada pendiente por ahora»: todavía no se habían consultado las convocatorias | `M2_01…` | emulador |
| Sindicato › Actualizar → Inicio | «Revise quién puede ver su participación en **2** compras conjuntas» (CB y CC), además de «Nueva convocatoria: E4V Abierta D1… (y 3 más)» | `M3_01_inicio_aviso.png` | emulador + API real |
| Tocar el aviso | Abre **Compras conjuntas**; CC lleva «Participación recibida / Revisar autorización» | `M3_02_compras_conjuntas.png` | emulador |
| Detalle de CC › «Quién ve sus datos» | «Su participación se registró con un texto anterior… nadie de la Directiva ni de la Administración ve su nombre ni sus cantidades hasta…» + «Revisar quién puede ver mi participación» | `M3_03_CC_detalle.png`, `M3_04_CC_quien_ve.png` | emulador |
| Revisar | Texto CONV-4 («Las personas de Administración habilitadas… La Directiva podrá consultar los totales por producto…»), casilla «Entiendo y acepto…» **sin marcar**, «Autorizar» **deshabilitado** hasta marcarla, «Sus cantidades no cambian.» | `M3_05_conv4_sin_marcar.png`, `M3_06_conv4_marcada.png` | emulador |
| Autorizar **en modo avión** (para ver el estado previo al acuse) | «**Pendiente de envío**: autorizar a la Administración… Hasta que el sindicato la reciba, **no está aplicada** y rige lo que se indica arriba», con «Enviar ahora». Arriba sigue el texto anterior. En la base sigue `RESPONSIBLE_ONLY`/`CONV-1`/0 | `M3_07_pendiente_sin_conexion.png` | emulador + base (lectura) |
| Quitar el modo avión (00:21:20 UTC) | Envío **automático**, sin pulsar «Enviar ahora». A las 00:22:01 la base tiene `ADMINISTRATION`/`CONV-4`/secuencia 1. La app muestra «La Administración habilitada de su sindicato puede ver su nombre y sus cantidades… Su última decisión… **está aplicada** en el sindicato» y «Retirar la autorización» | `M3_08_aplicada.png` | emulador + API real |
| API, antes (00:06 UTC) | CC: A1 `/participants` 200 → sólo F2 [1500]; D1 **403** `PARTICIPANTS_FORBIDDEN`; `pending_consent_count` 1 | `datos/M3_api_antes.json` | API real |
| API, después | CC: A1 200 → **F2 [1500] y F3 [800]**; D1 **403** `PARTICIPANTS_FORBIDDEN`, `can_view_participants` false; `pending_consent_count` 0. CA no cambió: A1 sólo ve F1; D1 recibe 403 | `datos/M3_api_despues.json` | API real |
| Inicio después | «Revise quién puede ver su participación en **una** compra conjunta» (2 → 1; queda CB) | `M3_09_inicio_aviso_despues.png` | emulador |

## M4: compra sin conexión. **Pasa en lo local; el envío al sindicato no aplica a las compras**

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| Sindicato antes | «Nada por enviar / Necesidad declarada y consumo» | `M4_00_sindicato_antes.png` | emulador |
| Modo avión (zona restablecida a La Paz) → compra 4 L × 30 Bs = **120 Bs**, pagada en efectivo | Guardada; Inicio: Compras 370,00, Pagado 370,00 | `M4_01_compra_sin_conexion.png`, `M4_02_inicio_tras_compra.png` | emulador |
| `am force-stop` (sin proceso después) y reabrir sin conexión | La compra sigue: Inicio 370,00 / 370,00; Actividad con la compra de 120,00 Bs Pagada y la de 250,00 Bs | `M4_03_reabierta_sin_conexion.png`, `M4_04_actividad_reabierta.png` | emulador |
| Estado de envío | Sindicato › Envíos: «Necesidad declarada y consumo: se envían sólo sus totales…», «Todavía no hay nada que enviar al sindicato.» | `M4_05_sindicato_sin_conexion.png`, `M4_06_estado_envios.png` | emulador |
| Quitar el modo avión (zona restablecida) → «Enviar pendientes» | Sigue «Todavía no hay nada que enviar». En la base, `SyncV1Contribution` y `SyncV1OperationJournal` de F3 siguen en 0 antes y después | `M4_07_estado_envios_con_conexion.png` | emulador + base (lectura) |

La app no envía las compras al sindicato: sólo comparte totales de necesidad declarada y de consumo, y aquí no se había creado ninguno. El paso del plan «la sincronización la envía» no aplica a una compra: no hay estado de envío que capturar, y no lo cuento como defecto. El envío sin conexión sí se probó con las convocatorias (M3 y M5).

## M5: cambio de modo con y sin pendientes; modo individual. **Pasa, con un hallazgo (H1)**

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| Provocar un envío pendiente: modo avión → CC › Modificar, 0,8 → **0,9 KG** | «Guardada en el teléfono: pendiente de envío al sindicato. Su autorización no cambia.» y «Pendiente de envío (se reintentará)» | `M5_01_CC_pendiente_envio.png` | emulador |
| Ajustes y datos › Modo de uso, con ese pendiente | **No se bloquea ni se avisa.** Dice «El cambio está disponible. No borra ni reasigna registros y no necesita conexión.», con el botón «Pasar a modo individual». El diálogo de confirmación no menciona envíos pendientes. Pulsé **Cancelar** (H1) | `M5_02_modo_con_pendiente.png`, `M5_03_confirmar_con_pendiente.png` | emulador |
| Quitar el modo avión | Envío automático: a las 00:28:47 UTC la base tiene 900 en la línea de F3 en CC; la app, «Participación recibida», 0,9 KG | `M5_04_CC_enviada.png` | emulador + base (lectura) |
| Cifras con varias personas, antes de cambiar | Compras 370,00; Pagado 370,00; Almacén 11 L, 295,00 Bs, previsto 3 L | `M5_05…`, `M5_06…` | emulador |
| Sin pendientes → «Pasar a modo individual» → Confirmar | Activo: «En uso / Modo individual». La pestaña Personas pasa a llamarse **Chacos** | `M5_07_modo_sin_pendientes.png`, `M5_08_modo_individual_activo.png` | emulador |
| Inicio individual | «Costo de productos aplicados · Campana local CIERRE 75,00 Bs», «Compras · Campana… 370,00 Bs», «Debe a proveedores 0,00 Bs», **«Revise quién puede ver su participación en una compra conjunta»** (queda CB) | `M5_09_inicio_individual.png` | emulador |
| Compra individual | 2 L × 40 Bs = 80 Bs, «entra a su almacén», sin elegir persona, pagada | `M5_10_compra_individual.png` | emulador |
| Aplicación individual | Chaco Norte, 1 L → 25,00 Bs («sale de su almacén… consumo propio») | `M5_11_aplicacion_individual.png` | emulador |
| Plan individual | 1 L/ha × 2 ha = 2 L, «Tiene 12 L · alcanza» → guardado | `M5_12_plan_individual.png`, `M5_13_…`, `M5_14_actividad_individual_todo.png` (los 5 registros y los 2 planes) | emulador |
| Chacos › Chaco Norte › costos | Detalle: «Costo aplicado 100,00 Bs», «Por ha del chaco (2 ha) 50,00 Bs», 2 planes por hacer, aplicaciones de 1 L (25 Bs) y 3 L (75 Bs). Costos: 100,00 Bs, 2 aplicaciones, 4 ha tratadas en total | `M5_15_chacos.png`, `M5_16_chaco_detalle.png`, `M5_17_costos.png` | emulador |
| Cifras individuales | Almacén 12 L, 350,00 Bs, previsto en planes 5 L; Inicio: costo aplicado 100,00, compras 450,00 | `M5_18…`, `M5_19…` | emulador |
| Volver a varias personas | «Se habilitan responsables y transferencias. Todo el historial sigue asociado al titular.» → Confirmar | `M5_20_confirmar_varias.png` | emulador |
| Cifras con varias personas después | Compras 450,00; Pagado 450,00; Por cobrar 0,00; Almacén 12 L, 350,00 Bs, previsto 5 L; Actividad con los 2 planes, las 2 aplicaciones y las 3 compras, ahora con «F3 sintetico VER1». Coinciden con el modo individual y con lo registrado: nada se perdió ni se reasignó | `M5_21_inicio_varias_despues.png`, `M5_22_almacen_varias_despues.png` | emulador |

## M6: panel de voz con modelos (APK `final-voz`). **Pasa**

Hubo dos tandas. La primera, abajo en «M6 (primera tanda, sin modelos)», no pudo llegar a «Escuchando». La segunda usa la APK **`final-voz`**: el mismo código `aeeb4f0` con los modelos de voz y las libs x86_64 dentro, unos 340 MB, SHA-256 `5d86f1ea34948b8841a71c14ae627b8dfb8360603f26b2ad81ca217706e02b4d` (calculado en esta sesión).

Se instaló con `CIERRE_SERIAL=emulator-5560 cierre_env.sh install-app final-voz` (`install -r`, 00:44 UTC). Antes se hizo `force-stop` y una copia de la base. No hubo audio real: el micrófono del emulador sólo captó silencio.

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| Abrir la app tras `install -r final-voz` | No pide reactivar. Cifras iguales: Compras 450,00, Pagado 450,00, Almacén 12 L / 350,00 Bs / previsto 5 L, aviso de revisión en 1 compra conjunta | `M6_10_inicio_tras_final_voz.png` | emulador |
| Varias personas: Registrar compra › «Completar por voz» | Panel «Micrófono apagado» con un ejemplo «…para Rosa» y «Hablar» | `M6_11_panel_voz_varias_modelos.png` | emulador |
| «Hablar» | Android pide «Allow AC CIERRE to record audio?». Se concedió sólo a `.cierre` («While using the app»): `RECORD_AUDIO granted=true` | `M6_12_permiso_microfono.png` | emulador |
| Hoja nueva | Hoja oscura **«Escuchando» / «Diga producto, cantidad, precio y para quién»**, con **Cancelar** y **Terminar** y «Nada se guarda solo: usted revisa y confirma.» | `M6_13_escuchando_varias.png` | emulador |
| Cancelar | «Dictado cancelado: el formulario no cambió.» | `M6_14_cancelado_varias.png` | emulador |
| Otra vez «Hablar» → «Terminar» | **«Procesando tu voz»** / «Los datos aparecerán en el formulario para que los revise.», con Cancelar y «Lo que ya escribió a mano se conserva.» A los 15 s: «No cambió el formulario: no se reconoció nada que completar.» (sólo había silencio). Se salió con Volver sin confirmar | `M6_15_procesando_varias.png`, `M6_16_resultado_sin_cambios_varias.png` | emulador |
| Modo individual: Registrar compra › voz › «Hablar» (ya sin pedir permiso) | **«Escuchando» / «Diga producto, cantidad y precio»** (sin «para quién»), con Cancelar y Terminar | `M6_17_panel_voz_individual_modelos.png`, `M6_18_escuchando_individual.png` | emulador |
| Cancelar; después «Hablar» → «Terminar» | «Dictado cancelado: el formulario no cambió.». Luego «Procesando tu voz» → «No cambió el formulario: no se reconoció nada que completar.». Se salió sin confirmar | `M6_19_cancelado_individual.png`, `M6_20_procesando_individual.png`, `M6_21_resultado_sin_cambios_individual.png` | emulador |
| Volver a modo con varias personas | «En uso / Modo con varias personas»; Inicio con Compras 450,00 y Pagado 450,00 | `M6_22_inicio_varias_final.png` | emulador |
| ¿Se escribió algo en la base? | **No.** Se compararon copias de la base antes de instalar `final-voz` y después de M6: `user_version` 20/20, 45 tablas, los mismos conteos en todas, y el mismo contenido (MD5 por tabla) salvo `app_settings`. Ahí sólo cambió la clave `operation_mode_changed_at`, por los dos cambios de modo de esta prueba (el valor no se imprime). Ninguna compra nueva | `datos/M6_conteos_antes_voz.json`, `datos/M6_conteos_despues_voz.json` | emulador |

Observación: la hoja «Procesando tu voz» es clara, y la de «Escuchando», oscura.

## M6 (primera tanda, sin modelos): no se pudo ver la hoja «Escuchando»; el aviso es correcto

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| Varias personas: Registrar compra › micrófono de la barra superior | Panel «Completar por voz / Micrófono apagado», «Diga, por ejemplo «Doce litros de herbicida a ciento dieciocho, de Agroinsumos, para Rosa»», «Hablar», «Nada se guarda solo: usted revisa y confirma.» | `M6_01_panel_voz_varias.png` | emulador |
| «Hablar» | «La voz no está disponible en este teléfono. Complete el formulario a mano.» No se llega a «Escuchando». No se pidió el permiso del micrófono (`RECORD_AUDIO granted=false`) | `M6_02_voz_no_disponible_varias.png` | emulador |
| Cerrar el panel y salir | Nada guardado: el formulario se cierra sin pedir descartar e Inicio sigue en 450,00 | — | emulador |
| Modo individual: lo mismo | Ejemplo sin «para quién»: «Doce litros de herbicida a ciento dieciocho, de Agroinsumos». «Hablar» lleva al mismo aviso | `M6_03_panel_voz_individual.png`, `M6_04_voz_no_disponible_individual.png` | emulador |

Las APK se compilaron sin modelos de voz, y el código (`purchase_form_screen.dart`, `voice_form_dictation.dart`) sólo muestra la hoja oscura «Escuchando» con la guía «Diga producto, cantidad, precio y para quién» (o «…cantidad y precio» en modo individual) y Cancelar/Terminar **mientras graba**. Por eso no se pudo ver esa hoja. La app explica que falta la voz, y el orquestador indicó que eso no es un defecto. Tampoco hubo audio real. Al final la app quedó en modo con varias personas.

## M7: comunicación Web después de M3. **Pasa**

Ejecución: `E4_LABEL=VER1 E4_BACK_DIR=<CIERRE-BE>/Back WEB_URL=http://127.0.0.1:5184 node tool/e4/capture_e4.mjs tool/cierre/plan_movil_cierre.mjs docs/evidence/CIERRE/mobile/web_M7`. La salida está en `web_M7_salida.txt`.

| Acción | Resultado | Evidencia | Tipo |
|---|---|---|---|
| A1 (Administración) en CC | «Quién pidió»: **F2 sintético VER1** (Herbicida 1,5 L) y **F3 sintético VER1** (Fertilizante 0,9 KG, recibido 13 nov 20:28), «2 pedidos de 2 personas». «Pedido hasta ahora»: Herbicida 1,5 L y Fertilizante 0,9 KG, 1 persona cada uno. El texto esperado está | `web_M7/web/M7_A1_CC__escritorio.png`, `…__movil.png` | Web real |
| D1 (Directiva, responsable de CC) en CC | Sólo totales (1,5 L y 0,9 KG). «El detalle identificado sólo lo consulta la Administración… Participan 2 personas; sus nombres y cantidades no se muestran.» Ninguno de los textos prohibidos (nombres de F1–F3, «anónim», «umbral», «Consultar participantes y cantidades»). D1 **no pide** `/participants`. 9 respuestas JSON inspeccionadas: ningún hallazgo | `web_M7/web/M7_D1_CC__escritorio.png`, `…__movil.png`, `web_M7/_registro.json` | Web real |

## Hallazgos

**H1. El cambio de modo no avisa de envíos pendientes** (prioridad baja; hay que decidir el criterio)
- **Pasos:**
  1. Modo con varias personas y modo avión.
  2. Modificar una participación en una convocatoria abierta (queda «Pendiente de envío»).
  3. Ajustes y datos › Modo de uso.
- **Esperado según el plan:** que se bloquee o se explique.
- **Visto:** «El cambio está disponible. No borra ni reasigna registros y no necesita conexión.» La confirmación no menciona el pendiente.
- **Según el código** (`operation_mode_screen.dart`, `modePendings`), sólo bloquean la falta de titular y la actividad de terceros (existencias, planes o saldos de otras personas, v1.5 CU-05). Un envío pendiente no cuenta.
- **No se perdió nada:** el pendiente se envió solo al reconectar. El cambio de modo se hizo después, sin pendientes.
- Hay que decidir si el plan pide algo que el diseño no contempla o si falta el aviso.

**Observaciones (no son defectos):**
- **O1.** Con «1.5» (punto) el plan no lee la dosis («Necesita 0 L»); con «1,5» sí.
- **O2.** El aviso de Inicio aparece después de consultar las convocatorias (Sindicato › Actualizar), no al abrir la app recién actualizada.
- **O3.** En la versión anterior (507efc8, visto en 5558), sin campaña activa no se puede confirmar la compra. El aviso remite a «Más, Administrar datos», pero se llega por el chip de campaña de Inicio. En la versión final no se comprobó, porque la campaña ya existía.

## Intentos y cambios de entorno

- **Primer intento en `Pixel_8`/`emulator-5558` (23:43–00:05 UTC):**
  - Las APK de 340 MB, que llevaban los modelos de voz, no cabían («Requested internal only, but not enough space»).
  - El orquestador las recompiló sin modelos (las de la tabla de arriba).
  - Con ellas se instaló `anterior507` y se hizo M1 completo (mismas cifras: `intento_5558/`).
  - `install -r final` falló con `INSTALL_FAILED_INSUFFICIENT_STORAGE` (648M libres).
  - El orquestador apagó ese emulador y creó `Cierre_Pixel8` (`emulator-5560`). La `.cierre` de 5558 sigue instalada allí y no se volvió a usar.
- **Modo avión:** se activó y desactivó tres veces en 5560 (M3, M4, M5). Cada vez se restableció la zona `America/La_Paz` y se comprobó con `date`. Al terminar, `airplane_mode_on=0`.
- **Estado final:**
  - `.cierre` instalada en `emulator-5560` (APK `final-voz`, `aeeb4f0`), con sus datos, en modo con varias personas y con el permiso de micrófono concedido sólo a `.cierre`. El emulador queda encendido.
  - El túnel no se tocó.
  - No se tocó ninguna otra app.
- **Base del Central:** las únicas escrituras vienen de la app y de la API real:
  - la autorización CONV-4 de F3 en CC y su cambio a 0,9 KG;
  - las contraseñas de un solo uso de F3, A1 y D1, que fijan las herramientas.
