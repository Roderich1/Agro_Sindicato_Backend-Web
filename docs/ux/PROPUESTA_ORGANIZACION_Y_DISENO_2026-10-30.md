# Organización y diseño unificado de Agrocuentas: propuesta revisable (2026-10-30)

- **Estado:** propuesta para revisión de Roderich Rendón. **No está implementada** salvo las cuatro correcciones del bloque A, que van en su propio PR de Mobile.
- **Base contrastada:** Mobile `main` `186f4739` y Backend/Web `main` `9233acc2`, comprobados con `git fetch` el 2026-10-30.
- **Fuentes:**
  - la revisión integral del 2026-10-26 (`_briefs/REVISION_INTEGRAL_MOB_2026-10-26/`, hallazgos A-xx, B-xx, C-xx, D-xx y E-xx);
  - tres inventarios del código hechos el 2026-10-30: rutas y accesos de Mobile, rutas y permisos de la Web, y avisos de aprobación en ambos;
  - lo que se vio en el recorrido de exploración del 2026-10-29.
- **Prototipo navegable:** [`prototipo/index.html`](prototipo/index.html). Usa datos sintéticos y no se conecta a nada.
- **Lo que no cambia:** este documento no toca ninguna regla. FIFO, contabilidad, imputación, sincronización, permisos, cifrado, divulgación, gates, Project e instrumentos humanos quedan igual. F09 (voz) sigue en pausa y conserva su acceso.

**Procedencia de cada afirmación:**
- **[C]**: código;
- **[EMU]**: emulador;
- **[TEL]**: teléfono físico;
- **[P]**: persona en sesión.

En este bloque sólo hay **[C]**: no se ejecutó nada en el emulador ni en un teléfono, y no participó ninguna persona. Lo que esta revisión atribuye a personas sale de X01 y X02 y del recorrido del autor, y se cita como tal.

---

## 1. Qué se quiere resolver

La revisión integral y el recorrido del autor coinciden: un agricultor con poca experiencia en aplicaciones **busca demasiado y decide de más**.

- **«Lo del sindicato» está repartido** entre Inicio, Planificación, Sincronización y Más.
- **Más está a dos niveles** (Operaciones › Más). El respaldo local sólo se encuentra en un icono sin texto dentro de Cuentas.
- **El FAB «Nuevo» no es coherente:** cuatro de sus cinco opciones abren listados y «Pago» sólo abre Cuentas.
- **Productos y personas no ofrecen acciones.** Para registrar algo de un producto que ya se está mirando hay que volver a Inicio y elegirlo otra vez.
- **En la Web**, la Directiva tiene un menú plano de 7 entradas sin agrupar. Además:
  - la Bitácora y el Calendario sólo se abren escribiendo la URL;
  - el CSV del resumen existe en el servidor y no tiene botón;
  - Cobertura vuelve a ejecutar la misma decisión de divulgación que el Resumen.

**Principios** (los mismos para Mobile y Web):
1. **Una pregunta, un lugar.** Cada tarea tiene un sitio principal. Los accesos secundarios abren **el mismo** formulario, no otro.
2. **Acciones desde el contexto.** Desde un producto o una persona se registra lo que corresponde a ese producto o esa persona. Lo que llega elegido desde el contexto **se ve y se puede cambiar**: «Producto: Glifosato Demo · Cambiar». Nunca se rellena nada que la persona no haya visto (sin selecciones silenciosas, B-08).
3. **Consultar no escribe.** Todo detalle nuevo es de sólo lectura. Lo comprueba una prueba que vuelca las tablas antes y después.
4. **Ninguna función desaparece.** Cada una tiene una fila en los mapas §3 y §5.
5. **El texto no se encoge para caber.** Se parte en líneas o la fila se reorganiza.

---

## 2. Mobile: contraste de la propuesta «Inicio / Productos / Cuentas / Sindicato / Más»

| Pestaña propuesta | Qué resuelve | Riesgo o coste | Ajuste recomendado |
|---|---|---|---|
| **Inicio** | Hoy Inicio mezcla sesión, cuatro accesos, cifras, inventario, aplicaciones recientes y saldos. La propuesta lo centra en **comprar y usar productos** | Si se quitan las cifras, se pierden consultas que hoy se usan | Arriba, dos acciones grandes: **«Registrar compra»** y **«Registrar uso»** (aplicación). Debajo, «Campaña activa». Después, **«Cuánto queda»** (5 productos) y **«Registros recientes»** (compras, aplicaciones, pagos y pases, mezclados por fecha, cada uno tocable). Las tarjetas de importes pasan a Cuentas. El aviso de sesión sólo aparece si exige una acción |
| **Productos** | Hoy son Inventario y Operaciones › Compras/Aplicaciones/Planificación/Transferencias. Reúne «qué tengo» y «qué hice con cada producto» | Si los listados de operaciones quedan escondidos, cuesta revertir o pagar una compra | Dos vistas en la misma pestaña: **«Productos»** (saldo, tocar abre el detalle con movimientos) y **«Registros»** (Compras · Aplicaciones · Pases · Planes, en pestañas). El detalle de producto ofrece **«Comprar»**, **«Registrar uso»**, **«Pasar a otra persona»** (sólo COMPARTIDA) y **«Planificar»**, cada una con el producto ya visible y cambiable |
| **Cuentas** | Hoy son las pestañas Personas y Cuentas, separadas. Para pagar a una persona hay que ir a Cuentas y para ver sus chacos a Personas | Personas desaparece como pestaña. La bitácora del chaco queda un nivel más abajo | Cuentas = **«Personas y cuentas»**: la lista con el saldo de cada persona. El detalle de persona conserva sus pestañas (Resumen, Chacos, Aplicaciones, Inventario, Cuenta) y suma **«Registrar pago»**, **«Pasar producto»** y **«Registrar uso»** para esa persona. En PROPIA se ve la tarjeta del titular y sus chacos |
| **Sindicato** | «Lo del sindicato» deja de estar en 4 sitios. Se ve el estado de los envíos sin buscarlo | Una pestaña más para quien nunca se vincula | Una pantalla con el **estado en palabras** («Guardado en el teléfono», «Enviado, sin confirmación», «Aceptado por el sindicato», «Rechazado: qué hacer»), **«Enviar ahora»**, Necesidades, Consumo, Vínculos y **«Verificar acceso en línea»**, que sale de Inicio. Sin vínculo, un único paso: «Vincular con el sindicato» |
| **Más** | Hoy se llega por Operaciones › Más | Ninguno: pasa a primer nivel | Administrar datos, Reportes, **Respaldos** (una sola pantalla «en este teléfono» y «en la nube»; el respaldo local sale del icono de Cuentas), PIN del titular, Operaciones tardías, Modo de uso y Registrar por voz (F09 en pausa: el acceso se conserva tal como está) |
| **FAB «Nuevo»** | Lo sustituyen las acciones de Inicio y las del contexto | Quien ya lo usaba lo buscará | Retirarlo (A-01). Cada listado conserva su botón «Nueva compra», «Nueva aplicación», etc., que abre el formulario. **Decisión de Roderich**, porque X01 y X02 se hicieron con el FAB |

**Recomendación:** adoptar la propuesta con los ajustes de la tabla. Quedan dos decisiones para Roderich: retirar el FAB y llamar a la pestaña «Cuentas» o «Personas».

**Antes de implementarlo**, hay que tener en cuenta:
- **Instrumentos humanos.** Las tarjetas T1–T6 y el guion del facilitador (`docs/evaluation/usabilidad/`) nombran las pestañas actuales. **No se tocan aquí.** Si se adopta la propuesta, hay que preparar una versión nueva para la siguiente ronda y no cambiar la de una ronda ya hecha.
- **Pruebas que fijan rótulos.** La navegación tiene pruebas que fijan los rótulos actuales (`app_shell`, `navigation_*`, `regression_widget_test`). Se actualizan en el mismo PR que cambie la navegación.

---

## 3. Mobile: dónde queda cada función

Procedencia **[C]**, de `lib/app.dart`, `app_shell.dart` y las pantallas de Mobile `186f473` con este bloque. Ninguna fila se pierde. **«=»** significa que la función no cambia de sitio.

| Función actual | Hoy | Propuesta |
|---|---|---|
| Registrar compra | Inicio · FAB «Compra» · Compras «Nueva compra» · voz | Inicio «Registrar compra» · Productos › detalle «Comprar» · Registros › Compras «Nueva compra» · voz (=) |
| Ver compras | Operaciones › Compras | Productos › Registros › Compras |
| **Detalle de compra** (nuevo, A2) | Compras › tocar la tarjeta | = (y desde «Registros recientes» de Inicio) |
| Pago posterior al proveedor | ⋮ de la tarjeta de Compras | = |
| Ver factura | ⋮ de Compras · detalle de compra | = |
| Revertir compra | ⋮ de Compras (motivo + PIN) | = |
| Registrar aplicación | Inicio · FAB · Aplicaciones «Registrar» · voz | Inicio «Registrar uso» · detalle de producto · detalle de persona · Registros › Aplicaciones (=) |
| Revertir aplicación | ↩ en Aplicaciones | = (Registros › Aplicaciones) |
| Planificación, nuevo plan, aplicar plan | Operaciones › Planificación · FAB | Registros › Planes · detalle de producto «Planificar» |
| Transferencia nueva o revertir (COMPARTIDA) | Operaciones › Transferencias · FAB | Registros › Pases · detalle de producto «Pasar a otra persona» · detalle de persona «Pasar producto» |
| Inventario y detalle con movimientos | Pestaña Inventario · Inicio | Pestaña Productos |
| Personas y detalle (5 pestañas) | Pestaña Personas | Pestaña Cuentas (Personas y cuentas) |
| Bitácora de chaco | Persona › Chacos | = |
| Registrar pago a una persona (único, A1) | Cuentas ⋮ · FAB «Pago» (sólo abre Cuentas) | Cuentas ⋮ · detalle de persona «Registrar pago» |
| Estado de cuenta, ver y exportar | Cuentas ⋮ · Persona › Cuenta | = |
| Consumo y costos propios del titular (E-15) | Tarjeta en Cuentas | = |
| Costo por chaco y por producto | Final de Cuentas | Cuentas › «Costos» (misma pantalla, sección plegable) |
| Cifras de Inicio (compras, pagado, por cobrar, pagos recibidos) | Inicio | Cabecera de Cuentas |
| Principales saldos | Inicio | Cuentas (es la misma lista, ordenada) |
| Exportar o restaurar respaldo local | Icono de carpeta en Cuentas | Más › Respaldos › «En este teléfono» |
| Respaldo en la nube | Más · carpeta de Cuentas | Más › Respaldos › «En la nube» |
| Reportes CSV/PDF | Más › Reportes | = (Más ya en primer nivel) |
| Administrar datos (catálogos) | Más › Administrar datos | = |
| Modo de uso | Más | = |
| PIN del titular | Más · al revertir · oferta en la activación (E-12) | = |
| Operaciones tardías y período histórico | Más | = |
| Registrar por voz (F09, en pausa) | Más · micrófono en los formularios | = (sin cambios) |
| Enviar al sindicato (Sincronización) | Inicio · banner del shell | Pestaña Sindicato |
| Necesidades declaradas | Planificación · Sincronización | Sindicato › Necesidades |
| Consumo para el sindicato | Sólo desde Sincronización | Sindicato › Consumo |
| Vincular con el sindicato | Más · Sincronización · Necesidades · Consumo | Sindicato › Vínculos (los enlaces internos se conservan) |
| Verificar acceso en línea / Volver a autenticar | Sólo Inicio | Sindicato (y en Inicio sólo si exige una acción) |
| Activar, recuperar, elegir titular | Inicio · `/acceso` | = (son pantallas de acceso fuera de las pestañas) |
| Liberar envíos restaurados | Sincronización | Sindicato |

---

## 4. Web de la Directiva: organización

**Hoy** [C]:
- **Menú plano** con 7 entradas: Resumen, Propuesta, Cobertura, Tendencias, Reconciliación, Campanas y Usuarios (este sólo para el Administrador).
- **Páginas sin entrada en el menú:** la Bitácora (`/audit-logs`) y el Calendario (`/calendar`). Las dos están protegidas para DIRECTIVA y ADMINISTRADOR, pero sólo se abren por URL.
- **Barra inferior en móvil:** no incluye Tendencias, Campañas ni Usuarios.

**Propuesta** (menú agrupado; no cambia ningún permiso del servidor):

| Grupo | Páginas | Roles (los mismos del servidor) |
|---|---|---|
| **Resumen** | Resumen colectivo, que incluye la **cobertura** como bloque (hoy es una página aparte que vuelve a decidir lo mismo) y el sellado | DIRECTIVA, ADMINISTRADOR |
| **Necesidades y propuestas** | Necesidad declarada por producto, **propuesta conjunta** (borrador, historial y CSV) | DIRECTIVA, ADMINISTRADOR |
| **Histórico y tendencias** | Tendencias entre campañas y versiones selladas | DIRECTIVA, ADMINISTRADOR |
| **Equivalencias** | «Reconciliación de denominaciones», que pasa a llamarse **«Equivalencias de productos»** (Bellator = Belator) | DIRECTIVA, ADMINISTRADOR |
| **Administración** | Campañas (DIRECTIVA y ADMINISTRADOR), Usuarios (sólo ADMINISTRADOR), **Bitácora** (hoy sin entrada; propuesta: en el menú para los dos roles) | según cada página |

**Decisiones abiertas para Roderich (no se cambian aquí):**
1. **Calendario** (`/calendar`). Su GET crea eventos `CIERRE_CAMPANA` para los roles institucionales: una consulta que escribe. Se deja **fuera del menú** hasta decidir si se mantiene.
2. **CSV del resumen.** `GET …/summary.csv` existe pero no tiene botón. Llama al mismo `execute` que el JSON, así que **también persiste divulgación** [C: `collective.controller.ts:40-58`, `collective-summary.use-case.ts`, `persist: true`]. Hay dos opciones: que el botón exporte lo ya mostrado sin una segunda decisión, o leer sin persistir. La segunda cambia el comportamiento del servidor, así que queda fuera de este bloque.
3. **Resumen y Cobertura juntos.** Hoy cada una ejecuta `decide` con persistencia. Al abrir el Resumen de una campaña cerrada, el GET del sellado también decide. Unir Resumen y Cobertura en una página reduce las lecturas que escriben, **sin cambiar la regla**.

**Dónde queda cada página de la Web:**

| Hoy | Propuesta |
|---|---|
| `/colectivo/resumen` | Resumen › Resumen colectivo (=) |
| `/colectivo/cobertura` | Resumen › bloque «Cobertura». La ruta se conserva y redirige |
| `/colectivo/propuestas` | Necesidades y propuestas (=) |
| `/colectivo/tendencias` | Histórico y tendencias (=) |
| `/colectivo/reconciliacion` | Equivalencias (la ruta se conserva) |
| `/campaigns` | Administración › Campañas (=) |
| `/users` | Administración › Usuarios (=, sólo ADMINISTRADOR) |
| `/audit-logs` (sólo por URL) | Administración › Bitácora (en el menú) |
| `/calendar` (sólo por URL) | Sin cambio hasta la decisión 1 |
| Rutas heredadas del agricultor (`/dashboard`, `/plots`, …) con `VITE_LEGACY_FARMER_WEB` | Sin cambio (heredadas y fuera de la frontera vigente, #81) |
| `/sin-acceso-web` | = |

**Hallazgos de la Web que no se corrigen aquí:**
- textos sin tilde ni ñ («Campanas», «Bitacora», «Accion», «Sincronizacion»);
- `text-[10px]` y `text-[11px]` en sobretítulos, insignias y notas;
- ninguna pantalla de catálogos utilizable para DIRECTIVA ni ADMINISTRADOR, aunque el servidor les permite editar productos y proveedores.

---

## 5. Diseño unificado (conceptual, Mobile y Web)

El objetivo es compartir **conceptos y valores**, no código: Flutter y React siguen con su propio sistema de componentes. Cada valor tiene su equivalente en `ThemeData` (Mobile) y en Tailwind o `index.css` (Web).

### 5.1 Color

| Token | Uso | Valor | Mobile hoy | Web hoy |
|---|---|---|---|---|
| `primario` | Acción principal, pestaña activa | `#2F6B3A` | semilla `#35693E` | emerald `#059669` |
| `primario-suave` | Fondo de selección, chips activos | `#DCEDD9` | derivado de la semilla | `emerald-50` |
| `fondo` | Fondo de página | `#F7F7F1` | `#F7F7F1` | `#F4F8F0` / `slate-50` |
| `superficie` | Tarjetas, diálogos y campos | `#FFFFFF` | blanco | `glass-card` blanco al 72 % |
| `texto` / `texto-2` | Texto y metadatos | `#1C2B1F` / `#4F5D52` | por defecto de M3 | `#0F172A` / `slate-500` |
| `borde` | Separadores, contorno de campos | `#D5DACF` | por defecto de M3 | `slate-200` |
| `ok` | Aceptado, Publicado, Confirmada | `#2E7D32` sobre `#E6F2E6` | verde suelto | emerald |
| `pendiente` | Guardado en el teléfono, cambios pendientes, en revisión | `#7A4F00` sobre `#FFF2D6` | `Colors.orange` | amber |
| `error` | Rechazado, error, acción destructiva | `#B3261E` sobre `#FCE8E6` | `colorScheme.error` | red |
| `info` | Contexto: datos sintéticos, ayuda | `#1E5A8A` sobre `#E5F0FA` | — | sky |
| `neutro` | Oculto, Revertida, Sin dato | `#4F5D52` sobre `#ECEFE8` | gris | slate |

**Reglas:**
- El color nunca es la única señal: siempre acompaña un texto («Revertida», «Oculto»).
- Contraste mínimo de 4,5:1 para el texto.
- Un único verde primario en las dos plataformas. La barra lateral oscura de la Web (`#0F1D15`) se conserva como `primario-oscuro`.

### 5.2 Tipografía

| Estilo | Tamaño/interlínea | Peso | Uso |
|---|---|---|---|
| Título de pantalla | 24/30 | 700 | Una vez por pantalla |
| Título de sección | 18/24 | 700 | Tarjetas y bloques |
| Cuerpo | 16/24 | 400 | Todo el texto de lectura (**mínimo** en Mobile) |
| Dato destacado | 20/26 | 800, cifras tabulares | Importes y cantidades principales |
| Etiqueta | 14/20 | 600 | Etiquetas de campos, botones y chips |
| Nota | 13/18 | 400 | Fechas y metadatos. **Nada por debajo de 13 px** |

- **Familia.** Mobile usa Roboto (la del sistema, sin descarga). La Web usa Inter, que ya tiene. Las cifras van tabulares en las dos.
- **Letra ampliada.** La escala del sistema se respeta siempre.
- **Barra de pestañas con letra grande.** Con 5 pestañas a 320–360 dp y letra ×1,3 o ×2,0, «Sindicato» no cabe en su hueco. Hoy la app reduce sólo esas etiquetas (`app_shell.dart`, `_fittedLabelStyle`). La propuesta es que **sólo la pestaña activa muestre su etiqueta** y las demás la conserven para el lector de pantalla, sin reducir la letra. El prototipo lo hace al elegir 320 dp y 200 %.
- **Palabras largas** (nombres de proveedores): se parten dentro de la palabra antes de desbordar la tarjeta. Mobile ya lo hace en `Text`; en la Web se usa `overflow-wrap: break-word`.
- **Lo que hoy reduce el texto y conviene corregir en otro bloque:** el `FittedBox` del importe en las tarjetas de Cuentas (reduce la letra) y el chip de 11 px de Aplicaciones en Mobile; los `text-[10px]`/`[11px]` en la Web.

### 5.3 Espaciado, forma y elevación

- **Espaciado:** rejilla de 4 (4 · 8 · 12 · 16 · 24 · 32). El margen lateral es de 16 en Mobile y de 24 en la Web. Entre tarjetas hay 12.
- **Radios:** 16 en tarjetas y diálogos, 12 en campos y botones, y completo en chips e insignias.
- **Elevación:** sin sombra en las tarjetas (como el `CardTheme` actual); se separan por el contraste con el fondo. Los diálogos y menús sí llevan sombra.

### 5.4 Botones

| Tipo | Cuándo | Aspecto |
|---|---|---|
| Principal | **Una** acción por pantalla o diálogo («Registrar compra», «Confirmar compra», «Registrar») | Relleno `primario`, alto mínimo de 48 en Mobile y 40 en la Web |
| Secundario | Alternativa que no avanza («Atrás», «Exportar CSV», «Actualizar») | Contorno `borde` |
| Texto | Cancelar, cerrar | Sin contorno |
| Destructivo | Revertir, desactivar, deshacer una asociación | Contorno `error`. Relleno `error` **sólo** en la confirmación final |

- **Rótulos:** verbo + objeto («Registrar pago», no «Aceptar»).
- **Mientras guarda:** el botón queda deshabilitado y muestra «Guardando…» hasta cerrar, sin doble toque (B-03).

### 5.5 Tarjetas y listas

- **Tarjeta tocable** (compra, producto, persona): toda la tarjeta abre su detalle. El menú ⋮ guarda las acciones secundarias. A2 ya lo aplica a las compras.
- **Orden de la tarjeta:** título (quién o qué), una línea de contexto (campaña, fecha, cantidad) y el estado en palabras. El dato principal va a la derecha **sin reducirse**: si no cabe, baja de línea.
- **Lateral:** sólo un icono o un estado de una palabra. **Nunca texto largo.** A3 lo corrigió en Transferencias.

### 5.6 Formularios

- **Campos vacíos al empezar.** Sin ejemplos que parezcan datos (A4 quitó «1.500,25»).
- **Etiqueta y unidad:** etiqueta que diga qué es («Importe del pago») y la unidad como sufijo (Bs, L, kg). El formato se explica sólo si la persona se equivoca, con el mensaje existente de `numeric_input`.
- **Errores:** debajo del campo, diciendo qué hacer. El diálogo no se cierra con un error.
- **Teclado y espacio:** teclado numérico para importes y cantidades. El contenido se desplaza con el teclado abierto y los botones quedan a la vista; este bloque lo corrigió en «Registrar pago».
- **Valores elegidos por contexto:** visibles y cambiables. Ninguna elección por omisión que la persona no haya visto.

### 5.7 Estados (un vocabulario por dominio, igual en las dos plataformas)

| Dominio | Estados y texto | Color |
|---|---|---|
| Operación local | «Confirmada» · «Revertida» (con quién la autorizó y por qué) | ok · neutro |
| Envío al sindicato (Mobile) | «Guardado en el teléfono» · «Enviado, sin confirmación» · «Aceptado por el sindicato · fecha» · «Rechazado: motivo y qué hacer» · «Conflicto: decida en …» | neutro · pendiente · ok · error · error |
| Cifra colectiva (Web) | «Publicado» · «Oculto (menos de 3)» · «Oculto (revisión)» · «Cambios pendientes» · «Sin dato» · «Política pendiente» | ok · neutro · pendiente · pendiente · neutro · neutro |
| Campaña | «Activa» · «Planificada» · «Cerrada» · «Sellada» | ok · info · neutro · neutro |

### 5.8 Mensajes

| Tipo | Forma | Ejemplo |
|---|---|---|
| Éxito | Aviso breve inferior, con lo que se escribió | «Pago de 50,00 Bs registrado a María. Imputado: Verano 2026 50,00 Bs.» |
| Error de la persona | Bajo el campo, sin cerrar | «Escriba el importe.» |
| Error del sistema | Bloque `error` con qué pasó y qué hacer | «No se pudo guardar. No se registró nada. Vuelva a intentarlo.» |
| Bloqueo del servidor | Bloque `info` o `error`, **una vez por pantalla**, sin códigos internos | ver §6 |
| Privacidad | Junto a lo que se oculta, una sola vez por celda | «Menos de 3 agricultores: no se publica para no revelar aportes.» |

---

## 6. Avisos de aprobación: clasificación y simplificación

Inventario **[C]** de Mobile `lib/` y de `Back/src` y `Web/src`. Clases:

- **A · decisión del autor:** reglas que Roderich fijó como autor (D-03, D-04, D-07, E-12, E-15) o decisiones de alcance (Cobertura sin lista de agricultores).
- **B · alcance académico sintético:** datos de prueba con un umbral provisional.
- **C · validación institucional pendiente para datos reales:** política F07-POL-01 no aprobada (#107). En producción el servidor responde `POLICY_PENDING`.
- **D · privacidad necesaria para decidir:** umbral, celdas ocultas, «no hace anónimos los datos».
- **E · bloqueo técnico del servidor:** admisión cerrada, sellado desactivado, 403.

**Lo que hay hoy:**
- **Mobile** no muestra ningún aviso de B ni de C. Muestra avisos A (D-03, D-07, E-15), D (respaldo cifrado, consumo sólo del titular) y E (503 y 403 como mensajes genéricos).
- **La Web** muestra B y C en las 4 páginas colectivas. Además:
  - el código «F07-POL-01» aparece en pantalla;
  - en el Resumen con `POLICY_PENDING` la política no aprobada se menciona 3 veces (aviso de página, panel de sellado y lista de bloqueos);
  - en una propuesta con `POLICY_PENDING`, cada línea lo repite 3 veces (insignia, texto de la celda y tooltip).

**Propuesta de textos** (no se cambia ningún bloqueo del servidor ni se inventa ninguna aprobación):

| Clase | Hoy | Propuesta | Dónde |
|---|---|---|---|
| C | «Política de divulgación pendiente (F07-POL-01). Mientras no se apruebe, el servidor no publica cifras colectivas…» | «**Sin cifras colectivas.** El uso de datos reales necesita una política de divulgación aprobada por la institución, y todavía no lo está. Esta pantalla no calcula ni estima totales.» El código F07-POL-01 pasa al pie («Referencia: F07-POL-01») | Una vez por página, arriba |
| B | «Modo provisional con datos sintéticos. Política F07-POL-01 no aprobada (umbral provisional k = 3). No usar para decisiones reales.» | «**Datos de prueba.** Cifras con datos sintéticos y un umbral provisional de 3 agricultores. No sirven para decisiones reales.» Se muestra también en Propuesta, que hoy no pasa el umbral | Una vez por página |
| C repetido | Panel de sellado: «…no habilita cifras reales…» + lista «La política … no está aprobada» | El panel dice sólo «Todavía no se puede sellar: falta la política de divulgación (ver arriba)». **Se conserva** «no hace anónimos los datos» | Panel de sellado |
| C repetido | Por línea de propuesta: insignia + texto + tooltip | Insignia «Política pendiente» por línea y **una** frase sobre la tabla | Propuesta |
| D | Celda oculta: texto + tooltip con la misma frase | Texto en la celda. El tooltip sólo si el texto se acorta en pantallas estrechas | Resumen, Tendencias, Propuesta |
| A repetido | Propuesta: aviso de página y `PROPOSAL_NOTICE` del servidor, casi iguales | Sólo el del servidor, que es el que viaja con el borrador y el CSV | Propuesta |
| A repetido (Mobile) | Diálogo de transferencia: dos frases sobre «no genera deuda» | «Entrega producto a X: no genera deuda ni cargo. El costo es sólo de referencia.» | Confirmar transferencia |
| D repetido (Mobile) | «No se comparte con el sindicato» 4 veces en el flujo del respaldo | Se conserva en el diálogo de subida y en la clave (son puntos de decisión) y se quita del subtítulo de Más | Respaldo en la nube |
| E (hueco) | Con la admisión de producción cerrada (`SYNC_V1_PRODUCTION_ADMISSION`), el teléfono dice «Sin respuesta del sindicato; se volverá a intentar» | Distinguirlo exige que el servidor envíe un motivo distinto del 503 transitorio. **Cambia el contrato F05**: queda anotado, no se propone hacerlo en este bloque | — |
| E (hueco) | Respaldo con la admisión de producción cerrada: «El servicio de respaldos no está disponible ahora.» | Lo mismo: cambio de contrato F08, anotado | — |

**No se fusionan:**
- el aviso B (es el único lugar donde se ve el alcance sintético);
- el rechazo 409 al generar una propuesta;
- el sellado desactivado y el 403;
- el aviso de privacidad por celda y el de cobertura antes de sellar;
- el rechazo de D-03 en Mobile.

---

## 7. Prototipo y verificación

**Prototipo:** [`prototipo/index.html`](prototipo/index.html) (un archivo, sin red). Contiene:
- **Mobile:** Inicio, Productos y su detalle, Cuentas con «Registrar pago», detalle de compra, Sindicato y Más.
- **Web:** Resumen colectivo y Propuesta conjunta.
- **Controles:** ancho 320, 360 o 412 dp y letra al 100, 130 o 200 %.

Los datos son sintéticos (Verano 2026, Glifosato Demo, Bellator, Mancozeb Demo) y no reproducen el entorno de nadie.

**Comprobado en este bloque:**

| Qué | [C] | [EMU] | [TEL] | [P] |
|---|---|---|---|---|
| A1–A4 y sus regresiones | Pruebas de widget y de repositorio (ver la evidencia de Mobile) | no ejecutado | no ejecutado | no |
| Pantallas estrechas, texto largo, teclado y letra ×1,3/×2,0 en las pantallas tocadas | Pruebas de widget a 320/360 dp. Encontraron dos defectos que ya existían y se corrigieron: el selector de campaña de Cuentas y el diálogo de pago con el teclado abierto | no | no | no |
| Navegación y diseño propuestos | Sólo el prototipo | no | no | no |

**Por qué el emulador quedó pendiente:**
- Una instalación nueva necesita activarse contra un Central por HTTPS.
- El único túnel autorizado es el del entorno de exploración, que es de Roderich. Activar ahí otra instalación lo modificaría.
- Queda pendiente de su indicación.

---

## 8. Cómo extenderlo (bloques sugeridos, cada uno un PR)

1. **Mobile: Más en primer nivel y Respaldos en una pantalla.** Mueve accesos sin cambiar lógica (A-02, A-18).
2. **Mobile: pestaña Sindicato.** Reúne Sincronización, Necesidades, Consumo, Vínculos y la verificación en línea (C-09). Cambian las pruebas de navegación.
3. **Mobile: Productos con «Registros» y acciones de contexto en el detalle.** El formulario recibe el producto visible y cambiable. Necesita pruebas de que no hay selección silenciosa.
4. **Mobile: Cuentas = Personas y cuentas, sin FAB.** Requiere la decisión del FAB.
5. **Web: menú agrupado, Bitácora en el menú y textos de §6.** Sin cambiar ningún permiso ni bloqueo.
6. **Ambas: tokens §5 en `ThemeData` y en `index.css`, y retirada de los textos de menos de 13 px.**
7. **Antes de la siguiente ronda con personas:** versión nueva de las tarjetas y del guion. **No** se modifican los instrumentos ya usados.
