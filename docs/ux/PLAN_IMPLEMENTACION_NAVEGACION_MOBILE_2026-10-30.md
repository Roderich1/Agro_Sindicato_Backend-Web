# Plan de implementación: navegación móvil aprobada (bloque separado de C1)

- **Decisión de Roderich (2026-10-30):** estructura **Inicio / Productos / Cuentas / Sindicato / Más**. Se elimina el botón global «Nuevo». Las acciones frecuentes van en Inicio y en su contexto. «Más» es accesible directamente. La pestaña se llama «Cuentas» y debe permitir encontrar a las personas y sus movimientos sin perder la gestión de personas. La decisión aprueba la organización; **no declara validado visualmente el prototipo**.
- **Base prevista:** Mobile `main` después de integrar el PR #162 (C1). Rama propuesta: `feat/ux-navegacion-cinco-pestanas`, en `_wt/A-UX-NAV`.
- **Fuera de este plan:** FIFO, contabilidad, sincronización, permisos, cifrado, reglas de negocio, gates, Project e instrumentos humanos. F09 (voz) sigue en pausa: conserva su acceso en Más tal como está.
- **Instrumentos humanos:** las tarjetas T1–T6 y el guion nombran las pestañas actuales; no se tocan. Una ronda nueva con personas necesita una versión nueva de esos instrumentos, aparte.

## 1. Bloques (cada uno un PR, con revisión cruzada y CI)

| # | Bloque | Qué cambia | Archivos principales | Pruebas | Riesgo |
|---|---|---|---|---|---|
| N1 | **Barra de cinco pestañas y Más directo** | `AppShell.destinations` = Inicio, Productos (`/inventario`), Cuentas (`/liquidacion`), Sindicato (`/sincronizacion`), Más (`/mas`). Se retira el FAB global y su hoja «Nuevo». `/operaciones` deja de ser pestaña y redirige a Productos › Registros. Con letra grande en pantalla estrecha sólo la pestaña activa muestra su etiqueta (las demás la conservan para el lector de pantalla); se retira `_fittedLabelStyle` | `lib/presentation/app_shell.dart`, `lib/app.dart` (redirect), `lib/presentation/screens/operations_screen.dart` (se conserva como vista «Registros», ver N3) | `test/ui_polish_test.dart`, `test/f10_x01_inicio_mas_test.dart`, `test/app_shell_*`, nuevas: pestañas por ancho y escala | Medio: muchas pruebas fijan rótulos y rutas |
| N2 | **Inicio** | Dos acciones grandes («Registrar compra», «Registrar uso»), campaña activa, «Cuánto queda» (5 productos, tocables) y «Registros recientes» (compras, aplicaciones, pagos y pases por fecha, tocables; la compra abre el detalle de C1). Las tarjetas de importes y «Principales saldos» pasan a Cuentas. «Verificar acceso en línea» pasa a Sindicato; el bloque de sesión sólo se muestra si exige una acción | `dashboard_screen.dart`, `agro_repository.dart` (una consulta de «registros recientes» de sólo lectura, con límite) | `test/dashboard_*`, `test/f10_x01_inicio_mas_test.dart`; nueva: registros recientes mezclados por fecha, sin escrituras | Bajo (lectura) |
| N3 | **Productos = Inventario + Registros** | Pestaña con dos vistas: «Productos» (inventario actual) y «Registros» (Compras · Aplicaciones · Pases · Planes, hoy en Operaciones). El detalle de producto añade acciones de contexto: «Comprar», «Registrar uso», «Pasar a otra persona» (sólo COMPARTIDA), «Planificar». Cada formulario recibe el producto **visible y cambiable** («Producto: X · Cambiar»): ninguna selección silenciosa | `inventory_screen.dart`, `inventory_detail_screen.dart`, `purchase_form_screen.dart`, `application_form_screen.dart`, `transfer_form_screen.dart`, `plan_form_screen.dart` (parámetro opcional `initialProductId`), `app.dart` (query `?producto=`) | Nuevas: el formulario abierto desde el producto muestra el producto y permite cambiarlo; sin producto preseleccionado cuando se abre desde Inicio (B-08) | Medio: toca los cuatro formularios; sólo el valor inicial, no la validación ni el guardado |
| N4 | **Cuentas = Personas y cuentas** | Lista de personas con saldo (hoy Cuentas), cabecera con los importes que salen de Inicio, «Costos» plegable (chaco y producto). Tocar la persona abre su detalle (hoy `/personas/:id`, con Resumen, Chacos, Aplicaciones, Inventario y Cuenta) y suma «Registrar pago», «Pasar producto» y «Registrar uso». «Administrar datos › Personas» sigue siendo el alta y la edición. `/personas` redirige a `/liquidacion` | `settlements_screen.dart`, `person_detail_screen.dart`, `persons_screen.dart` (se conserva la lista para Administrar datos), `app.dart` | `test/payment_dialog_test.dart`, `test/personal_mode_flows_test.dart`, `test/e15_*`, `test/d04_*`; nuevas: acciones del detalle de persona respetan la modalidad (PROPIA: sólo titular) | Medio: Cuentas tiene pruebas con settle fijo; mantener las consultas al mínimo |
| N5 | **Sindicato** | Pantalla única: estado en palabras («Guardado en el teléfono», «Enviado, sin confirmación», «Aceptado por el sindicato», «Rechazado: qué hacer», «Conflicto: decida en…»), «Enviar ahora», y accesos a Necesidades, Consumo, Vínculos y Verificar acceso en línea. Planificación conserva sólo un enlace a Necesidades. El banner del shell sigue igual | `sync_status_screen.dart` (hub), `planning_screen.dart`, `dashboard_screen.dart`, `app.dart` | `test/sync_screens_*`, `test/f10_mensajes_*`; nuevas: estados en palabras por fila | Medio: `sync_screens` y `f10_mensajes` usan settle fijo; no añadir consultas |
| N6 | **Más** | Respaldos en una pantalla («En este teléfono»: exportar y restaurar, que salen del icono de carpeta de Cuentas; «En la nube»), Reportes, Administrar datos, PIN del titular, Operaciones tardías, Modo de uso, Registrar por voz (sin cambios) | `more_screen.dart`, `settlements_screen.dart` (mover `_backup`/`_restore` a una pantalla propia), nueva `backups_screen.dart` | `test/f04_admin_owner_restore_ui_test.dart` (abre la restauración desde Cuentas: cambia el punto de entrada), `test/backup_*` | Medio (A-02): mover `_backup/_restore` sin cambiar `BackupService` ni `GuardedRestore` |
| N7 | **Tokens de diseño** | `ThemeData` con los tokens de la propuesta §5 (colores, tipografía, radios, botones) y retirada de los textos de menos de 13 px y del `FittedBox` del importe | `lib/app.dart`, `settlements_screen.dart`, `applications_screen.dart` | Pruebas de widget existentes (sin cambios de texto) | Bajo |

**Orden sugerido:** N1 → N6 → N5 → N3 → N4 → N2 → N7. N1 primero porque fija las rutas; N2 al final porque depende del detalle de producto (N3) y de Cuentas (N4).

## 2. Mapa de rutas (ninguna función desaparece)

| Ruta hoy | Después | Nota |
|---|---|---|
| `/` | `/` (Inicio nuevo) | — |
| `/operaciones` | redirige a `/inventario?vista=registros` | «Más» deja de colgar de aquí |
| `/mas` | `/mas` (pestaña) | — |
| `/inventario`, `/inventario/:id` | iguales (pestaña Productos) | detalle con acciones de contexto |
| `/compras`, `/aplicaciones`, `/planificacion`, `/transferencias` | iguales, dentro de Productos › Registros | listados sin cambios |
| `/compras/detalle/:id` | igual (C1) | — |
| `/personas` | redirige a `/liquidacion` | la lista de alta/edición queda en Administrar datos |
| `/personas/:id`, `/chacos/:id` | iguales | — |
| `/liquidacion` | `/liquidacion` (pestaña Cuentas) | — |
| `/sincronizacion`, `/sincronizacion/consumo`, `/planificacion/necesidades`, `/sindicato/vinculos` | iguales, bajo la pestaña Sindicato | — |
| `/respaldo-remoto` | `/mas/respaldos` (una pantalla con las dos vías); la ruta antigua redirige | — |
| `/reportes`, `/catalogos`, `/modo`, `/titular/pin`, `/operaciones/tardias`, `/voz` y rutas de voz | iguales, desde Más | F09 sin cambios |
| Rutas de acceso (`/acceso`, `/activar`, `/titular`, `/reauth`, `/recuperar`) | iguales | fuera de las pestañas |

## 3. Qué no se decide aquí

- Si «Registros recientes» de Inicio muestra 5 o 10 filas.
- El rótulo exacto de «Registrar uso» frente a «Registrar aplicación» (el prototipo usa «Registrar uso (aplicación)»).
- La versión nueva de los instrumentos de evaluación.
