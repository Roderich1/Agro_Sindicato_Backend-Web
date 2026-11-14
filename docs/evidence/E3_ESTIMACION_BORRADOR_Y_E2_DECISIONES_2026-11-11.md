# E3 — Consumo estimado en el borrador, y decisiones E2-P2/E2-P3: recorrido real y pruebas (2026-11-11, noche)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-11 23:20Z – 2026-11-12 00:40Z (UTC); en Bolivia, 2026-11-11 de 19:20 a 20:40 |
| Procedencia | **API real** aislada (PostgreSQL 15434, API 3350) + **Web real** (Vite 5175, Edge sin interfaz) + **EMULADOR** Pixel_8, app «AC ET1» (`.et1`). **No es un teléfono físico.** Datos **sintéticos** (siembra «rica» del entorno aislado); la DEMO oficial no se tocó |
| Código | Back/Web `feat/etapa3-estimacion-borrador` (desde `01bcdeb`): `0db2d0f`, `f673f95`, `5d760b6`, `2a25386`, `2eb3ef7`, `3b2099b`, `b77965e`, `8bf84f9`. Mobile `feat/etapa2-historial-colaboradores` (desde `6bac5a3`): `16c002c`, `fa0fdc4` |
| Migraciones aplicadas en el entorno | `20261111230000_e2_historial_colaboradores`, `20261111233000_e3_proposal_estimation_link` (aditivas; API recompilada y reiniciada con el código final `8bf84f9`) |
| APK | `.et1` profile x64 desde Mobile `fa0fdc4`, SHA-256 `953471aa…3ca7`, atada al túnel temporal (cerrado al terminar) |
| Contratos | `docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md` §10, `docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md` |
| Capturas | `e3_estimacion_borrador/` (Web `w*`, `e2_w*`; emulador `emu_*`) |
| Guiones | `tool/etapa3/{web_e3.mjs, web_e2_colab.mjs, e3_job.cjs, counts.sql, e3env.sh}`, `tool/etapa2/participate_e2.cjs` (`E2_CONSENT`) |

## 1. Etapa 3 en la Web real

| # | Paso | Resultado |
|---|---|---|
| 1 | Abrir «Necesidades y propuestas» y recargar dos veces | Sólo `GET` (`proposals`, `estimation-link`, `selection`); **ningún `prepare`** al montar ni al recargar. Las peticiones salen duplicadas por React StrictMode del modo desarrollo |
| 2 | «Generar borrador» (campaña abierta Invierno 2026 DEMO) | Borrador nuevo de 11 líneas: 7 con necesidad publicada, 4 ocultas por la política; franja «Sin referencia de consumo estimado» (`w01`) |
| 3 | «Obtener referencia» | Las ejecuciones existentes no eran compatibles con el borrador nuevo → `REQUESTED_JOB`; «Calculando…» y sondeo de lectura cada 3 s (`w02`); el trabajador F12 lo completó y la referencia quedó **fijada** (`LINKED`): ejecución `c0d32611` (`w03`) |
| 4 | Estado por línea | «Vigente» con cifra en las 6 con resultado `ESTIMATED`; «Datos insuficientes» con su motivo en 5 (p. ej. «Hay menos de tres campañas comparables consecutivas con consumo comprobado»); las necesidades ocultas siguen ocultas |
| 5 | Comparación | Una sola nota: «No se calcula la diferencia: no hay datos para comprobar que la necesidad y la estimación cubran a las mismas personas.» (E3-P1). Ninguna diferencia, porcentaje ni semáforo |
| 6 | «Ver cálculo» | Método y versión (SES_NAIVE F12-EST-04/1), temporada, campaña objetivo y período (22 oct 2026 – 21 mar 2027), política (F07-POL-01, PROVISIONAL_SYNTHETIC, umbral 3), parámetros, línea base naive y α por producto, cobertura del tramo por campaña («13 de 15… Mide participación, no integridad») y fuentes (ejecución, serie, versión y huella) (`w04`) |
| 7 | Otra ejecución desde la ruta técnica (`POST /estimation/jobs`, mismos productos; `e3_job.cjs`) | Ejecución nueva `d4ce8614`. La referencia del borrador **no cambió sola**: siguió en `c0d32611`, las 6 líneas con cifra pasaron a «Desactualizada» (sin diferencia) y apareció «Actualizar referencia» con `NEWER_RUN` (`w05`) |
| 8 | «Actualizar referencia» | Vínculo 2: `UPDATE` → `LINK_EXISTING_RUN` `d4ce8614`; líneas «Vigente» y sin actualización pendiente (`w06`). El vínculo 1 queda en el historial |
| 9 | Marcar Herbicida DEMO y Urea DEMO, «Guardar selección», «Preparar convocatoria (2 productos)» | `PUT selection`; el formulario de convocatorias se abrió con la campaña, el borrador como origen y esos dos productos; se completó nombre, plazo y responsable y se creó el borrador de convocatoria: **0 participantes**; su referencia es la necesidad divulgada del borrador (189,8 L, 1.046,7 KG), **no** la estimación (`w07`–`w09`) |

Registro en la base (sin datos de agricultores):

```text
seq 1  INITIAL  REQUEST_JOB        trabajo 35928634 → COMPLETED → ejecución CALCULATED   23:45:44Z
seq 2  UPDATE   LINK_EXISTING_RUN  ejecución d4ce8614                                    23:51:41Z
```

**Sin efectos** (huella antes de obtener la referencia y después de crear la convocatoria, `tool/etapa3/counts.sql`): `StockMovement` 0, `Purchase` 0, `PayableAccount` 0, `Payment` 0, `InventoryLot` 0, `SyncV1Contribution` 446, `JointPurchaseProposalLine` 31, `JointPurchaseParticipation` 2, suma de cantidades de participación 40000: **idénticas**.

**Hallazgos del recorrido, corregidos** (`3b2099b`): la celda mostraba la estimación con todos sus decimales («428,92938509 KG», visible en `w03`); ahora «≈ 428,9 KG» con la exacta en el título y en «Ver cálculo». El aviso «Cálculo solicitado… consulta su estado» quedaba visible después de terminar; ahora lo sustituye el resultado.

## 2. Decisiones E2 en API, Web y emulador

| # | Paso | Resultado |
|---|---|---|
| 1 | Abrir la convocatoria (responsable) | `OPEN`; «Sus permisos: Administrar la convocatoria y Consultar participantes y cantidades» |
| 2 | Agricultor3 por la API con **CONV-1** (teléfono sin actualizar) y agricultor4 con **CONV-2** | Ambas `ACCEPTED`; el servidor guarda la versión de cada una |
| 3 | Emulador: instalación de la APK nueva y activación de `agricultor15` (titular «Rosa Vargas sintetica») | La app `.et1` **no estaba** instalada en este arranque del emulador (los demás paquetes sí): instalación nueva, no actualización. La migración v16 → v17 con datos sólo está probada en las pruebas automatizadas |
| 4 | Emulador: «Compras conjuntas» | La app acepta la lista con `CONV-2` y `history`; la convocatoria abierta como «Nueva», la cerrada de la etapa 2 entre las recientes y la sección «Historial» (`emu_01`) |
| 5 | Emulador: «Consultar historial» | `GET /me/joint-purchase-calls/history` 200 por el túnel; «No hay más convocatorias anteriores en el sindicato» (`emu_02`). En los datos sintéticos no hay convocatorias de más de 180 días (no se cambia el reloj): la paginación con datos sólo está probada en las pruebas automatizadas |
| 6 | Emulador: participar 12 L + 15 KG | Diálogo con el texto **CONV-2** exacto y «Confirmar» inactivo hasta marcar «Entiendo y acepto» (`emu_03`); «Participación recibida · El sindicato tiene: 12 L…, 15 KG…» (`emu_04`); servidor: `CONV-2` |
| 7 | Responsable concede «Consultar participantes y cantidades» a Administración | `POST …/collaborators` 200 (`e2_w10`) |
| 8 | Responsable vs colaboradora | Responsable: las 3 personas y los totales 25 L (3) y 25 KG (2) (`e2_w11`). Administración: sólo las 2 con CONV-2, «1 participación aceptada con un consentimiento anterior: sólo la ve la persona responsable», total de Herbicida oculto («incluye participaciones… que usted no puede ver»), total de Urea visible (`e2_w12`) |
| 9 | Revocación en vivo | Administración con la página abierta (4 filas por persona); la responsable retira el permiso en otra sesión; la página de Administración seguía mostrando las 4 filas hasta recuperar el foco; al recuperarlo pidió el detalle (`can_view_participants: false`), borró nombres y cantidades (0 filas) y mostró el texto exacto del contrato (`e2_w13`, `e2_w14`) |
| 10 | Cierre manual por la responsable | Consolidado: 3 personas, Herbicida 25 L, Urea 25 KG (`e2_w15`) |
| 11 | Consolidado visto por Administración (tuvo y perdió el permiso) | Herbicida: «Total visible sólo para la persona responsable» aunque hay 3 personas (regla «después de una revocación»); Urea: bajo el umbral (2 personas); sin detalle por persona (`e2_w16`) |
| 12 | Emulador tras el cierre | «Convocatoria cerrada», «Incluida en el consolidado al cierre: 12 L de Herbicida DEMO, 15 KG de Urea DEMO» (`emu_05`) |

Registro de la convocatoria: `JointPurchaseCallAccessEvent` `GRANTED` 00:00:52Z y `REVOKED` 00:03:47Z (actor la responsable); historial `ACCESS_GRANTED`/`ACCESS_REVOKED` con el nombre institucional y el permiso; `AuditLog` de concesión y retiro; ningún nombre ni cantidad de agricultores.

**Hallazgo del recorrido, corregido** (`b77965e`): tras la revocación, el panel «Colaboradores» seguía mostrando el permiso retirado y «Renunciar a este permiso» mientras el encabezado decía «Sus permisos: Ninguno» (`e2_w14`). Ahora se vuelve a pedir esa lista; la prueba nueva falla sin el arreglo. Repetido en real sobre la convocatoria **cerrada** (concesión y revocación en vivo con el consolidado a la vista): 4 filas antes del foco, 0 después y panel sin colaboradores (`e2_w17`, `e2_w18`).

Túnel: sólo `/api/v1/` por la compuerta (`/`, `/docs`, `/docs-json` → 404), cerrado al terminar.

## 3. Pruebas automatizadas

| Ámbito | Comando | Resultado |
|---|---|---|
| Back completo, con todas las suites PostgreSQL | `npx jest --runInBand` con `*_PG_TEST_URL` del contenedor aislado | Segunda ejecución, con `8bf84f9` y una base propia para cada suite que la necesita: **84 suites y 945 pruebas pasan**, 0 fallan; 2 suites (13 pruebas) omitidas por diseño, entre ellas la de almacenamiento B2 real, que exige credenciales externas. Primera ejecución: 902 pasan y 43 fallan en 5 suites (abajo) |
| Back E2 PostgreSQL | `joint-purchase-calls.postgres.spec.ts` | 21/21 |
| Back E3 PostgreSQL | `e3-proposal-estimation-link.postgres.spec.ts` | 11/11 (tras el traslado de módulo) |
| Back E3 dominio | `proposal-link.spec.ts` | 10/10 |
| Back F12-EST-08 (regresión) | `f12-est-08-proposal-reference.postgres.spec.ts` | 7/7 |
| OpenAPI | `openapi:check` (instantáneas, contrato F06/F08, F12) | correcto |
| Web completa | `npx vitest run --no-file-parallelism` | 53 archivos, **532/532**; `npm run lint` 0 errores (7 avisos previos, ajenos); `npm run build` correcto |
| Web tras el último arreglo | `joint-purchase-call-detail.page.test.tsx` | 40/40 (más tsc y eslint) |
| Mobile completa | `flutter test --concurrency=2` | **2982** pasan, 3 omitidas, salida 0 |
| Mobile análisis | `flutter analyze` | «No issues found!» |

**Fallos de la primera ejecución completa del Back y su causa** (no se ocultaron ni se quitaron aserciones):
1. `estimation/application/insert-only.spec.ts`: **defecto real**. E3 estaba dentro del módulo de estimación, que F12 garantiza de sólo inserción y sin PUT/PATCH/DELETE. Corregido trasladando E3 a `src/modules/proposal-estimation/` (`8bf84f9`); la prueba de F12 no se tocó.
2. `sync-v1-journal.postgres.spec.ts`: aserción **desactualizada desde E1** (esperaba 16 migraciones; hay 20). No aparecía antes porque las suites PostgreSQL se saltan sin su URL. Ahora comprueba las 20 y el nombre de las cuatro nuevas.
3. `auth-v2`, `current-auth-context`, `f02-final-integration`: **configuración de la ejecución**, no código: esperan una base propia ya migrada y yo les había dado la base compartida. Con `agro_f02_test` y `agro_f02v2_test` (creadas y migradas en el contenedor aislado) pasan 12/12, y las demás.

## 3b. E3-P1 decidida (opción 1 + 1b), 2026-11-12

Medición previa en el mismo borrador (`tool/etapa3/e3p1_poblaciones.sql`, sólo recuentos): en los 7 productos con estimación la necesidad la declaran 4 a 11 agricultores y cada cifra de consumo del tramo viene de 3 a 6; en ninguna campaña coinciden (`docs/architecture/E3_P1_OPCIONES_ALCANCE_COMPARABLE.md`). Decisión de Roderich: seguir sin calcular la diferencia y mostrar el alcance conocido de cada cifra.

Código: Back `29c559e`, Web `219d959`, corrección `e60df32` (cifra retenida → «Restringida»; la nota ya no afirma que los grupos sean distintos, sólo que no se puede comprobar). Pruebas: módulo E3 29/29 (incluye `insert-only` de F12), OpenAPI coincide, Web E3 43/43; suite Web completa del agente 533/533 antes de la corrección de texto.

Recorrido real (API recompilada y reiniciada con `e60df32`, Web 5175): Herbicida «189,8 L · 11 aportantes» frente a «70,5 L · Vigente · Cifras de 4 a 6 agricultores por campaña (11 campañas)»; Mancozeb «25,3 KG · 4 aportantes» frente a «≈ 20,6 KG · Cifras de 3 a 5 agricultores por campaña (11 campañas)»; las líneas con datos insuficientes no llevan alcance de estimación; una sola nota sobre la tabla (`w10_e3p1_alcance_de_cada_cifra.png`).

## 3c. Cierre de las etapas 1–3 (2026-11-12): E3-P2, verificación de CONV-2 y del alcance, aceptación

**Código probado:** Back/Web `a7e3983` (API recompilada desde ese commit y reiniciada; migración `20261112000000_e3p2_call_origin` aplicada en `agro_demo`; Web Vite sobre el mismo árbol). Mobile `01b2576` (APK `.et1` SHA-256 `bab62b81…daecdb`, actualización sobre la instalación existente, con los datos conservados).

**E3-P2 en real (Web + API):**
1. «Preparar convocatoria» con Fungicida DEMO y Fertilizante foliar DEMO marcados → `PUT selection` (revisión 2) → convocatoria creada: «Origen: Creada desde el borrador de propuesta del 11 nov de 2026, 7:45 p. m. (selección guardada n.º 2)», 0 participantes (`w11`).
2. La responsable cambia los productos del borrador de convocatoria (Fertilizante + Coadyuvante, `PATCH` 200) y guarda otra selección en el borrador de propuesta (revisión 3) → el origen **no cambia** (mismo JSON: `PROPOSAL`, revisión 2, coincidía, Fertilizante@4 y Fungicida@5) y `origin_differs_from_current: true`; la Web: «Los productos se editaron después de crearla; origen: Fertilizante foliar DEMO, Fungicida DEMO» (`w12`).
3. Las convocatorias anteriores muestran «Origen no registrado» (no se reconstruye nada).

**CONV-2 en real (emulador):** la participación de Rosa (aceptada con `CONV-2`) muestra «Pueden ver su nombre y sus cantidades la persona responsable (Directiva DEMO) y las personas de la Directiva o la Administración que ella autorice para esta convocatoria.» y el aviso corregido de coordinación (`emu_06`). El caso `CONV-1` y la reaceptación se probaron en PostgreSQL y en pantallas Mobile, no en el emulador. El emulador volvió a quedar en negro (Flutter) y se reinició con `adb reboot`, conservando los datos.

**Alcance de la estimación:** comprobado en el código y en la base (contrato E3-R15): el rango proviene sólo de la ejecución fijada; la base impide que cambie después; sin cifra no hay rango.

**Aceptación:** `docs/architecture/E2_E3_CONTRASTE_ACEPTACION_2026-11-12.md`: reglas acordadas aceptadas; tres diferencias materiales corregidas (porcentaje en la Web, E3-P2, quién ve los datos en el teléfono); reglas añadidas no aprobadas, listadas como pendientes. Etapa 4 aplazada.

### Matriz de validación

| Componente | Commit probado | Comprobación ejecutada | Resultado | Pendiente |
|---|---|---|---|---|
| Back completo (con todas las suites PostgreSQL; bases propias para F02) | `a7e3983` | `npx jest --runInBand` | **952 pasan**, 0 fallan, 13 omitidas (84 suites; 2 omitidas por diseño, entre ellas B2 real) | — |
| Back E2 + E3-P2 + CONV-2 | `a7e3983` | `joint-purchase-calls` (PostgreSQL y dominio) | 58/58 | — |
| Back E3 + alcance + F12 `insert-only` | `e60df32` (sin cambios posteriores en `proposal-estimation/`) | `jest src/modules/proposal-estimation` + `insert-only.spec.ts` | 29/29; incluidos en la ejecución completa de `a7e3983` | — |
| OpenAPI | `c87c352` (regenerado) y `e60df32` | `openapi.cjs --check`, `openapi-contract.cjs`, `openapi-f12-estimation.cjs` | coinciden | — |
| Web completa | `a7e3983` | `vitest --no-file-parallelism`, `npm run lint`, `npm run build` | **540/540**; 0 errores (7 avisos previos ajenos); build correcto | — |
| Mobile completa | `01b2576` | `flutter test --concurrency=2`, `flutter analyze` | **2985 pasan**, 3 omitidas; sin problemas | — |
| Recorrido E3-P2 | `a7e3983` | Web + API reales | origen registrado e inmutable tras editar | — |
| Recorrido CONV-2 en el teléfono | `01b2576` | Emulador (no teléfono físico) | texto por función correcto para `CONV-2` | `CONV-1` sólo en pruebas automatizadas |
| Recorridos E3, E3-P1, E2 §10 | `3b2099b`…`e60df32` | API + Web + emulador (§1, §2, §3b) | correctos | Lo indicado en §4 |

Cambios desde la versión recorrida en §1–§3b que no se volvieron a recorrer en pantalla: `e2d7cdc` (porcentaje con cifras comparables; hoy ninguna línea lo es, cubierto por pruebas Web), `c87c352`/`91e9ef2`/`fa44b5f` (E3-P2, recorrido arriba), `a7e3983` (sólo pruebas).

## 3d. Comprobaciones pedidas el 2026-11-12 (porcentaje, actualización con datos, historial, CONV-1 → CONV-2)

**Porcentaje (Back/Web `a7e3983`; banco de pruebas `acd9840`):**
- El servidor fija `populationVerified: false` y la comparación no recibe recuentos: la igualdad de aportantes no puede habilitarla.
- Borrador real del recorrido (API, 2026-11-12): 11 líneas, 7 con estimación, **0 comparables, 0 con diferencia absoluta o porcentual**, todas con el único bloqueo `POPULATION_NOT_VERIFIED`; ninguna con recuentos iguales.
- **Prueba de presentación (no evidencia de comparabilidad):** conjunto sintético `comparable` del banco de pruebas de desarrollo (`/src/dev/break-ui.html?datos=comparable`): «… supera en 15 L … Diferencia: +5% respecto de la estimación.», «… inferior en 2,501 KG … Diferencia: −9% …», «Porcentaje no definido: la estimación es cero.» (`prueba_presentacion_comparable_ARNES_NO_DATOS_REALES.png`).

**Emulador, instalación aislada nueva `.et1u` («AC ET1 U»), cuenta `agricultor14` (titular «Nestor Copa sintetico»)** — APK anterior desde Mobile `6bac5a3` (E2, esquema v16, SHA-256 `8029423d…dfae`) y actual desde `01b2576` (SHA-256 `f9f00ae8…f78a`), ambas atadas al túnel temporal (cerrado al terminar). Capturas en `e3_estimacion_borrador/actualizacion_et1u/`.

| # | Paso | Resultado |
|---|---|---|
| 1 | Versión anterior: activar, titular, «Compras conjuntas» | **No puede leer la lista con `CONV-2` publicado**: «No se pudo leer la lista del sindicato…». No pide actualizarse (corregido en E2 §10.2). Por eso no puede crear participaciones nuevas (`u01`) |
| 2 | Versión anterior, sin red: producto local «Herbicidal sintetico U» y «Pedir identificación al sindicato» | «Pendiente de envío» (`u02`). Base: esquema 16, 1 producto, 1 solicitud `PENDING_SEND` |
| 3 | `adb install -r` de la versión actual, sin red | Actualización real (instalada 04:49, actualizada 05:00 UTC). Base migrada a **17**; huella idéntica salvo el esquema; la solicitud sigue `PENDING_SEND` con el mismo identificador; la sesión y el titular se conservan |
| 4 | Con red: «Enviar ahora» | «Recibida por el sindicato · Esperando identificación» (`u03`) |
| 5 | «Compras conjuntas» → «Actualizar» | «Hay 1 convocatoria anterior que no está en este teléfono» (`u04`) |
| 6 | «Consultar historial» | `GET /me/joint-purchase-calls/history` 200; aparece «Convocatoria histórica sintética (sembrada para probar Historial)», cerrada el 20/03/2026 (`u05`). **Es una siembra sintética** (`tool/etapa3/seed_historica_180.sql`): creada como borrador, abierta y cerrada con fechas pasadas pasando todos los disparadores; no se cambió ningún reloj |
| 7 | Detalle de la histórica (participación `CONV-1`) | «Con el consentimiento que usted aceptó antes, sólo la persona responsable (Directiva DEMO) puede ver…» (`u06`); sin red sigue visible en «Historial» (`u07`) |
| 8 | Convocatoria abierta nueva; participación de `agricultor14` con **`CONV-1` enviada por la API** (simula un teléfono anterior: la versión anterior real no puede, ver paso 1) y de `agricultor5` con `CONV-2`; la responsable concede «Consultar participantes» a Administración | Administración ve sólo a Elena (`CONV-2`) y «1 participación aceptada con un consentimiento anterior: sólo la ve la persona responsable» (`web_admin_antes_de_conv2`); el teléfono muestra el texto de `CONV-1` (`u08`) |
| 9 | Teléfono: «Modificar» sin cambiar la cantidad (6 L), diálogo `CONV-2` con «Entiendo y acepto» marcado (`u09`) | «Participación recibida»; «Pueden ver su nombre y sus cantidades la persona responsable … y las personas … que ella autorice» (`u10`); servidor: `CONV-2`, secuencia 2 |
| 10 | Administración después | Ve a Néstor (6 L) y a Elena (4 L), sin ocultas (`web_admin_despues_de_conv2`) |

Nota: en la versión actual la aceptación de `CONV-2` ocurre **dentro** de «Modificar» (con la casilla explícita); no existe una aceptación separada de la modificación de cantidades. Es una de las diferencias con los criterios del 2026-11-12, pendiente de decisión.

## 4. Qué no se comprobó

- Teléfono físico.
- ~~Migración v16 → v17 con datos en el emulador~~: comprobada el 2026-11-12 (§3d).
- ~~Historial con más de 180 días~~: comprobado el 2026-11-12 con una convocatoria sembrada sintética (§3d).
- Diferencia entre necesidad y estimación en pantalla real: con los datos actuales nunca es comparable (E3-P1); el cálculo exacto, la estimación cero y la presentación con `comparable: true` están en pruebas automatizadas.
- Error del trabajador y política pendiente en real (inyectados sólo en pruebas automatizadas).
- La voz no cambió; ninguna captura muestra el panel de voz en uso.

## 5. Observaciones

- La vista `estimation-link` tarda unos 2,5 s con 11 líneas (recalcula la vigencia de F12 en cada lectura) (E3-R11).
- En el teléfono, una convocatoria cerrada muestra «Modificar» y «Retirar participación» desactivados junto a «Convocatoria cerrada: ya no admite cambios.». Es el diseño probado de la etapa 2 («botones desactivados con explicación»); no se cambió.
- El texto del teléfono «el responsable coordina la compra y la entrega» seguía en singular; corregido después del recorrido en Mobile `b55e5af` («la persona responsable y quienes ella autorice coordinan…»), con su prueba. La APK del recorrido es anterior a ese cambio.
- El limitador de inicios de sesión de la API (429) interrumpió dos pasos del guion por inicios seguidos; se repitieron espaciados.
