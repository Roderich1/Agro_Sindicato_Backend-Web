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

Lo **real** (API, base y Web del entorno aislado, Excel abierto en Microsoft Excel) está separado de lo **simulado** (pruebas automatizadas). El teléfono no se recorrió: ver §5.

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

- **Teléfono:** el recorrido en el emulador no se hizo. El AVD Pixel_8 (`emulator-5554`) se colgó al arrancar («bad color buffer handle», hilos de QEMU sin respuesta) y no pude cerrarlo (sin permiso para detener procesos). La APK `AC ET1 PA` (`.et1`, Mobile `4a3f1ad`, atada al túnel de ese día) se compiló pero no se instaló. La parte visible de Mobile está probada sólo con pruebas de widget y de almacén/emisor.
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
