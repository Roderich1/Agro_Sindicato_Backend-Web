# Inventario de vistas de la Web de Agrocuentas

Insumo para el rediseño de la Web en Claude Design. Describe lo que hace el código, no lo que debería hacer.

- **Fuente:** `_wt/ET2-BE/Web/src`, rama `feat/etapa3-estimacion-borrador`, commit `9dc80f0`, más la limpieza `741e730` y `754cb25` (rama `chore/web-solo-institucional`): **la Web es sólo de Directiva y Administración** (decisión del autor del 2026-11-12) y se retiraron las vistas del agricultor. Redactado leyendo el código; después se recorrió la Web en ejecución y las capturas de INDICE_CAPTURAS.md confirman las pantallas principales.
- **Fecha de redacción:** 2026-11-12.
- **Convenciones:** «la persona» cuando no se sabe el género. «(no verificado)» marca lo que el código no deja claro. Los permisos que decide el servidor se indican como tales: la Web sólo oculta botones o rutas.

---

## 1. Tabla resumen

| # | Pantalla (nombre visible) | Ruta | Roles | En el menú |
|---|---|---|---|---|
| 1 | Resumen | `/colectivo/resumen` | DIRECTIVA, ADMINISTRADOR | Sí |
| 2 | Campañas | `/campaigns` | DIRECTIVA, ADMINISTRADOR | Sí |
| 3 | Detalle de campaña | `/campaigns/:id` | Igual que Campañas | No (se abre desde Campañas) |
| 4 | Necesidades y propuestas | `/colectivo/propuestas` | DIRECTIVA, ADMINISTRADOR | Sí |
| 5 | Compras conjuntas (lista) | `/colectivo/compras-conjuntas` | DIRECTIVA, ADMINISTRADOR | Sí |
| 6 | Detalle de convocatoria | `/colectivo/compras-conjuntas/:id` | DIRECTIVA, ADMINISTRADOR + permisos por convocatoria | No (se abre desde la lista) |
| 7 | Histórico y estimaciones (`?vista=tendencias` \| `estimacion`) | `/colectivo/historico` | DIRECTIVA, ADMINISTRADOR | Sí |
| 8 | Catálogo y equivalencias (`?vista=productos` \| `equivalencias` \| `identificacion`) | `/colectivo/catalogo` | DIRECTIVA, ADMINISTRADOR | Sí |
| 9 | Cobertura | `/colectivo/cobertura` | DIRECTIVA, ADMINISTRADOR | No (enlace desde Resumen y Detalle de campaña) |
| 10 | Bitácora | `/audit-logs` | DIRECTIVA, ADMINISTRADOR | Sí (grupo «Administración») |
| 11 | Usuarios | `/users` | Sólo ADMINISTRADOR | Sí (grupo «Administración», sólo ADMINISTRADOR) |
| 12 | Ingresar (inicio de sesión) | `/login` | Sin sesión | No |
| 13 | Aviso «Esta cuenta utiliza la aplicación móvil» | `/sin-acceso-web` | Cualquier rol no colectivo (AGRICULTOR) | No |
| 14 | Estimación del consumo descargada (copia sin conexión) | `/estimacion/copia-sin-conexion` | Sin guarda de ruta; muestra datos sólo con un contexto local vigente | No (enlaces desde Ingresar y Estimación) |
| 15 | Calendario operativo («Agenda y alertas») | `/calendar` | DIRECTIVA, ADMINISTRADOR | No (pantalla heredada, por URL) |

No hay vistas del agricultor: las páginas `/dashboard`, `/plots`, `/applications`, `/reports`, `/inventory`, `/purchases` y `/sync` y la bandera `VITE_LEGACY_FARMER_WEB` se retiraron el 2026-11-12 (`741e730`). Una cuenta AGRICULTOR, entre por donde entre, sólo llega al aviso de la pantalla 13.

Rutas que sólo redirigen (no son pantallas): `/`, `/colectivo/tendencias`, `/colectivo/estimacion`, `/colectivo/productos`, `/colectivo/reconciliacion`, `/directiva` y cualquier otra ruta (`*`) (ver §5).

---

## 2. Estructura del menú tal como la arma el código

Fuente: `lib/navigation.ts` (`COLLECTIVE_MENU`, `LEGACY_MENU`, `menuPathsFor`) y `components/app-shell.tsx` (`NAV_GROUPS`, `NAV_ITEMS`, `MOBILE_PATHS_*`).

**Barra lateral (escritorio, ≥ lg, 248 px fija)**
- Cabecera: logotipo, «Agrocuentas» y el nombre del sindicato (se parte en líneas, nunca se recorta).
- Grupo sin título, en este orden: Resumen · Campañas · Necesidades y propuestas · Compras conjuntas · Histórico y estimaciones · Catálogo y equivalencias.
- Grupo «Administración»: Bitácora · Usuarios (Usuarios sólo para ADMINISTRADOR).
- Pie: iniciales, nombre y rol de la persona, botón «Cerrar sesión».
- Ítem activo: también se marca en subrutas y en rutas antiguas (`also`): Resumen se marca en Cobertura; Histórico en `/colectivo/tendencias` y `/colectivo/estimacion`; Catálogo en `/colectivo/productos` y `/colectivo/reconciliacion`; Compras conjuntas en el detalle de una convocatoria.

**Teléfono (< lg)**
- Barra superior con el botón «Abrir menú»: abre un diálogo modal «Menú» con el mismo contenido de la barra lateral y el botón «Cerrar menú». El menú ocupa una entrada del historial: el gesto Atrás lo cierra.
- Barra inferior «Navegación rápida» con 4 accesos: Resumen · Campañas · Necesidades · Histórico. Compras conjuntas, Catálogo, Bitácora y Usuarios sólo están en el menú desplegable.

**Barra superior (todas las pantallas con armazón)**
- Rótulo de la sección (el de la tarea del menú; «Administración» para Bitácora y Usuarios).
- Etiqueta «Datos sintéticos» cuando la última respuesta colectiva leída declaró el modo `PROVISIONAL_SYNTHETIC`.
- Enlace a Campañas con la campaña activa («Activa · nombre», «Campaña…» mientras carga o «Sin campaña activa»). Oculto en pantallas < sm.
- Estado de conexión: «En línea» (oculto < sm) o «Sin conexión» (siempre visible).
- No lleva el título: cada pantalla pone su único `h1` con `PageHeader`. El título de la pestaña del navegador es «<título> · Agrocuentas».

**Guardas de ruta** (`components/*-route.tsx`)
- `CollectiveRoute`: DIRECTIVA o ADMINISTRADOR; otro rol va a su pantalla inicial; sin sesión, a `/login`.
- `AdminRoute`: sólo ADMINISTRADOR.
- `RoleRoute` (Bitácora): DIRECTIVA o ADMINISTRADOR.
- `PrivateRoute` (Campañas, Detalle de campaña, Calendario): DIRECTIVA o ADMINISTRADOR; otro rol, al aviso.
- Pantalla inicial (`homePathFor`): DIRECTIVA y ADMINISTRADOR → Resumen; otro rol → `/sin-acceso-web`.
- Ruta comodín (`*`): cualquier ruta desconocida o antigua lleva a la pantalla inicial de la sesión (o a `/login`).
- El servidor sigue decidiendo los permisos: las guardas sólo evitan mostrar y consultar.

---

## 3. Elementos comunes a varias pantallas

- **Selector de campaña** (`CampaignSelector`): lista todas las campañas («nombre · estado · Activa»); al lado, el estado y «Activa» o «Distinta de la activa». La elección se guarda en la URL como `?campaign=<uuid>`. Sin parámetro, se usa la campaña activa o la primera de la lista. Lo usan Resumen, Necesidades y propuestas, Compras conjuntas, Cobertura y Estimación.
- **Estados de datos** (`DataState`): «Cargando…», «Sin registros», «Sin coincidencias» (con «Quitar filtros»), «No se pudo cargar la información» (con «Reintentar»), «Sin permiso», «Información restringida», «Datos insuficientes» y «Resultado desactualizado». Ningún estado muestra un cero en lugar de una cifra ausente.
- **Estado de una cifra colectiva** (`StatusChip`): Publicado · Oculto por privacidad · Sin cifra publicada · Fuera de rango · Retirado · Sustituido · Política pendiente · Retirado tras sellar · Sin sellar. Cada uno trae un motivo en texto (`statusReason`).
- **Aviso de política pendiente** (`DisclosureNotice`): con el modo `POLICY_PENDING` aparece «Política de divulgación pendiente (F07-POL-01)…» y no se muestra ninguna cifra.
- **Descargar Excel** (`ExportButtons`): botón secundario único («Descargar Excel» → «Preparando…»). Al pulsarlo repite las consultas al servidor y arma el libro en el navegador. Hay Excel en Resumen, Necesidades y propuestas (borrador), Histórico sellado y Estimación. Si falla: mensaje rojo junto al botón; con política pendiente, «no se exporta ninguna cifra». **No hay ninguna exportación a PDF ni a CSV** en la Web.
- **Ventanas modales** (`Modal`): título, botón «Cerrar» (×), Escape y clic fuera cierran.
- **Errores de red**: «Sin conexión con el servidor. La Web no guarda operaciones para después: vuelva a intentarlo en línea.»

---

## 4. Pantallas

### 4.1 Resumen — `/colectivo/resumen`

- **Rol:** DIRECTIVA y ADMINISTRADOR. Sellar: cualquiera de los dos, sin otro permiso; el servidor comprueba el rol, el sindicato y el estado.
- **Objetivo:** ver, por campaña, cuánto declaró necesitar cada producto, la cobertura de participación y si la versión está sellada.
- **Datos:**
  - «Cifra más reciente: datos hasta <fecha>» (la fecha más reciente entre las cifras publicadas).
  - Tarjeta «Cobertura»: «N de M agricultores vinculados con cifras publicadas (porcentaje)» y notas («Ausencia de aporte = desconocido, no cero…»).
  - Tarjeta «Versión sellada»: «Versión N sellada», fecha, quién, «datos aceptados hasta», referencia corta; o «Sin sellar» con el estado de la campaña.
  - «Necesidades declaradas por producto»: conteo («5 productos con cifra publicada · 1 oculto por privacidad»), barras por producto agrupadas por unidad («Litros (L)», «Kilogramos (KG)»), orden alfabético, cifra exacta, aportantes y fecha por fila.
  - «Consumo publicado»: misma lista sin barras.
  - «Pendiente según los datos»: lista de avisos con su fuente entre paréntesis.
- **Acciones:** «Actualizar» · «Descargar Excel» · «Revisar borrador» (principal; va a Necesidades y propuestas) · «Ver cobertura» · enlaces de los avisos («Ir a Campañas», «Ir al sellado», «Abrir Necesidades y propuestas»).
- **Panel «Sellado de la versión colectiva»** (al final, sólo si no está sellada):
  - Si no se puede sellar: una línea «todavía no se puede sellar» con los motivos (sellado desactivado en el servidor, política pendiente, campaña no cerrada).
  - Si se puede: revisión (cobertura, datos aceptados hasta, avisos de conflictos, cambios pendientes y filas sin cifra) y el botón «Sellar esta versión…».
  - Diálogo «Confirmar el sellado»: casilla «Revisé la cobertura y los avisos…», botones «Cancelar» y «Sellar». Si la revisión quedó obsoleta, el servidor no sella y el panel se recarga con el motivo.
- **Estados:**
  - Carga.
  - Error o «Sin permiso» (403) con «Reintentar».
  - Error de la lista de campañas.
  - «No hay campañas».
  - «Sin necesidades publicadas… Eso no significa cero».
  - «Sin consumo publicado…».
  - Filas ocultas por umbral (motivo y «aportantes no revelados», sin número).
  - Cambios pendientes: se muestra la cifra anterior con un aviso.
  - Política pendiente: aviso y **ninguna sección de cifras** (necesidades y consumo sólo se dibujan en el modo sintético).
  - «Dato no válido recibido del servidor».
  - Sin campaña activa: aviso en «Pendiente según los datos».
  - Campaña cerrada sin sellar: aviso.
- **Relacionadas:** → Necesidades y propuestas, Cobertura, Campañas. ← pantalla inicial tras ingresar; Detalle de campaña («Ver resumen»); Cobertura («Ver el resumen»).

### 4.2 Campañas — `/campaigns`

- **Rol:** DIRECTIVA y ADMINISTRADOR crean, editan, abren y cierran (lo comprueba el servidor). La página conserva una guarda defensiva («Sólo consulta») para un rol sin gestión, que la ruta ya no deja entrar.
- **Objetivo:** gestionar las campañas compartidas del sindicato y abrir su detalle.
- **Datos:**
  - Tarjeta «Campaña activa»: nombre, «Activa», inicio y fin estimado. Si el fin estimado ya pasó sin cierre registrado, «Fin estimado vencido · sin cierre registrado» (regla de la Web, no un dato del servidor).
  - «Historial de campañas»: conteo por estado. Si hay varias abiertas, lo advierte.
  - Tabla: Campaña (con notas), Estado (+ «Activa»), Inicio, Fin estimado, Cierre registrado, Acciones.
- **Acciones:**
  - «Nueva campaña» (principal).
  - «Buscar» (espera a que la persona deje de escribir) y filtro «Estado».
  - «Actualizar».
  - Por fila: «Ver detalle», «Editar» (desactivado si está cerrada o cancelada), «Abrir» (si no es la activa y no está cerrada ni cancelada), «Cerrar» (sólo la activa).
- **Diálogos:**
  - «Nueva campaña» / «Editar campaña»: Nombre*, Inicio*, Fin estimado, Notas; botón «Crear» o «Actualizar».
  - «Cerrar campaña»: aviso «Cerrar no es sellar y no se puede reabrir», «Motivo o notas», botón «Cerrar campaña».
- **Estados:** «Cargando campañas…», error o «Sin permiso» con «Reintentar», «Todavía no hay campañas», «Sin coincidencias» con «Quitar filtros», mensaje de éxito («Campaña creada.», etc.) y error dentro de cada diálogo.
- **Relacionadas:** → Detalle de campaña. ← menú; enlace de la campaña activa en la barra superior; «Ir a Campañas» del Resumen; «Volver a Campañas».
- No existen reabrir ni cancelar una campaña (no hay rutas en la API).

### 4.3 Detalle de campaña — `/campaigns/:id`

- **Rol:** el de Campañas. La página conserva una guarda defensiva (secciones colectivas con «Sin permiso» para un rol no colectivo), que la ruta ya no deja entrar.
- **Objetivo:** ver en un solo lugar los datos de una campaña, su participación, su versión sellada y sus borradores de propuesta.
- **Datos:**
  - «Datos generales»: nombre, estado, si es la activa, inicio, fin estimado (con el aviso de vencido), cierre registrado y notas.
  - «Participación»: tarjeta de cobertura completa, con las definiciones de «Vinculados» y «Con cifras publicadas».
  - «Versión sellada»: versión, fecha, quién y datos aceptados hasta; o «Sin sellar» con el mismo panel de sellado del Resumen.
  - «Propuestas vinculadas»: tabla Generado el · Por · Líneas.
- **Acciones:**
  - «Volver a Campañas» y «Ver resumen».
  - Las mismas de cada fila de Campañas: Editar, Abrir, Cerrar (con sus diálogos).
  - «Ver cobertura».
  - «Abrir en Necesidades y propuestas».
  - Sellar (panel).
  - Las filas de borradores **no son enlaces** a cada borrador.
- **Estados:**
  - «Cargando la campaña…».
  - «Campaña no encontrada» (antes de decirlo, vuelve a pedir la lista una vez).
  - Error de la lista.
  - «Cargando participación y versión…».
  - Error o «Sin permiso» de la participación.
  - «Cargando borradores…», «Sin borradores» y error de los borradores.
- **Relacionadas:** ← Campañas («Ver detalle»). → Resumen, Cobertura, Necesidades y propuestas.

### 4.4 Necesidades y propuestas — `/colectivo/propuestas`

- **Rol:** DIRECTIVA y ADMINISTRADOR. Generar, fijar la referencia y guardar la selección: el servidor autoriza.
- **Objetivo:** revisar o generar un borrador de propuesta de compra conjunta a partir de las necesidades declaradas, compararlo con la estimación de consumo y elegir productos para una convocatoria.
- **Datos:**
  - Al entrar se abre el último borrador de la campaña. Nunca se genera uno solo.
  - Encabezado «Borrador · <campaña>»: «Generado el … por … No crea compras, lotes, movimientos, deudas ni pagos.».
  - Franja «Cobertura al generar el borrador (fecha)».
  - Resumen de líneas: «N productos en el borrador: X con cifra publicada y Y sin cifra…».
  - Franja de la referencia de consumo estimado (ver «Estados de la referencia»).
  - Tabla de líneas: Producto (estado + casilla «Llevar a convocatoria»), «Necesidad declarada» (cifra grande, fecha, aportantes o «Aportantes no revelados») y «Consumo estimado» (cifra redondeada con la exacta en el `title`, «Vigente»/«Desactualizada», alcance y diferencia porcentual sólo si el servidor declara que las cifras son comparables).
  - Nota al pie sobre qué es el «Consumo estimado» y «Vigencia evaluada el …».
  - Plegables: «Ver cálculo» (método, temporada, campaña objetivo, política, ejecución, parámetros, línea base, cobertura del tramo, fuentes e historial de la referencia) e «Historial y trazabilidad (N borradores)» (huella; tabla Generado el · Por · Huella · Líneas · «Ver»).
- **Acciones:**
  - «Generar borrador» (principal; «Trabajando…» mientras tanto).
  - «Descargar Excel» del borrador mostrado.
  - Franja de la referencia: «Obtener referencia», «Actualizar referencia», «Quitar referencia» (enlace de texto), «Reintentar». Mientras se calcula, un botón desactivado «Calculando…».
  - Barra de selección: casillas «Llevar a convocatoria», «Guardar selección», «Preparar convocatoria (N productos)» (sólo con la selección guardada y sin cambios pendientes).
  - «Ver» un borrador anterior del historial.
  - Enlace «Detalle en “Estimación del consumo”».
- **Estados de la referencia** (franja):
  - Cargando.
  - Error con «Reintentar».
  - «Sin referencia de consumo estimado», o un bloqueo: política pendiente, campaña no elegible, campaña sin temporada, ningún producto estimable.
  - «Calculando la referencia…»: la vista consulta cada pocos segundos mientras la pestaña está visible; si una consulta falla, se detiene y pide «Reintentar».
  - «Referencia fijada».
  - «El cálculo de la referencia no se completó» (con el motivo).
  - «Referencia restringida».
  - Avisos tras cada acción: la referencia cambió desde otra pestaña, «No había nada que actualizar», el cálculo terminó sin cifras utilizables.
- **Estados por línea:**
  - Sin referencia, Calculando…, Datos insuficientes (con motivo), «Error: sin cifra», «Sin resultado», «Restringida», «Sin cifra».
  - Cifra con «Vigente» o «Desactualizada» (con el motivo).
  - Si la necesidad de la fila no está divulgada, aviso de que la estimación no la sustituye.
- **Otros estados:**
  - «Cargando…».
  - «Todavía no hay borradores para esta campaña».
  - «Sin necesidades declaradas publicadas» (borrador sin líneas).
  - Política pendiente: «no se genera ni se guarda ninguna propuesta con cifras».
  - «Sin permiso».
  - Error del historial con «Reintentar».
  - Selección: cargando, error con «Reintentar», «(cambios sin guardar)», selección cambiada por otra persona («se cargó la vigente»).
  - «Huella oculta» si alguna cifra del borrador ya no se publica.
- **Relacionadas:** ← Resumen («Revisar borrador»), Detalle de campaña, `/directiva`. → Compras conjuntas con el formulario precargado (`?nueva=1&campana=&propuesta=&productos=`), Histórico y estimaciones (`?vista=estimacion`).

### 4.5 Compras conjuntas (lista de convocatorias) — `/colectivo/compras-conjuntas`

- **Rol:** DIRECTIVA y ADMINISTRADOR ven la lista y pueden crear un borrador; el servidor valida.
  - Permiso del sindicato «Sustituir responsable» (sección plegada al final): cualquier persona colectiva ve quién lo tiene y su historial.
  - Sólo una persona Administrador habilitada lo concede o lo retira (`can_grant`). Quien lo tiene puede renunciar.
- **Objetivo:** ver las convocatorias de la campaña elegida y crear una nueva.
- **Datos:** subtítulo explicativo. Sección «Convocatorias» («Campaña «…»») con la tabla Nombre (enlace) · Estado · Campaña · Fecha límite · Responsable · Participantes (sólo el número; nunca nombres).
- **Acciones:**
  - «Nueva convocatoria» (principal; activa con cualquier campaña elegida, sin mirar su estado).
  - Filtro «Estado»: Todas · Borrador · Abierta · Cerrada · Cancelada.
  - Clic en el nombre → detalle.
  - Plegable «Permiso «Sustituir responsable»»: «Conceder el permiso», «Retirar» / «Renunciar», plegable «Historial del permiso».
- **Diálogos:**
  - **«Nueva convocatoria»** (`JointPurchaseCallForm`):
    - Campos: Nombre (hasta 120), «Fecha y hora límite» (con la nota «Hora del servidor del sindicato…»), Responsable (con el aviso de lo que podrá ver) y Productos.
    - Origen de los productos: «Del catálogo» (búsqueda + casillas; sólo activos, en L o KG, no asociados) o «Tomar productos de un borrador de propuesta» (selector de borrador + líneas con su cifra como referencia).
    - Botones «Cancelar» y «Crear borrador».
    - Si la persona nombra responsable a otra, aparece un paso previo «Antes de guardar: dejará de administrar este borrador» con la lista de lo que pierde y los botones «Volver» y «Confirmar».
    - Desde «Preparar convocatoria»: aviso «Preparada desde un borrador de propuesta…» y, si algún producto no es línea del borrador, «N productos indicados… no se preseleccionaron».
  - **«Conceder «Sustituir responsable»»:** Persona (sin uno mismo ni quienes ya lo tienen), Motivo (280), casilla de confirmación, «Volver» y «Conceder el permiso».
  - **«Retirar el permiso» / «Renunciar al permiso»:** Motivo (opcional), casilla, botón de peligro.
- **Estados:**
  - Cargando y error con «Reintentar».
  - «Sin permiso» (sin reintentar).
  - «Sin convocatorias».
  - «Sin coincidencias» con «Quitar filtros».
  - «Sin campañas».
  - «No se pudo preparar la convocatoria…» (parámetros inválidos).
  - En el formulario: errores por campo, error del servidor por código (p. ej. producto ya en otra convocatoria abierta, campaña no elegible), «Sin productos disponibles», «Sin borradores de propuesta», aviso de que no se pudo comprobar qué productos son denominaciones asociadas.
  - Sección del permiso: «Nadie lo tiene», «No habilitada: el permiso no se ejerce», «Sin personas disponibles».
- **Relacionadas:** ← menú; «Preparar convocatoria» de Necesidades y propuestas; «Volver a las convocatorias». → Detalle de convocatoria (al crear se abre el detalle con el mensaje «Borrador «…» creado. Los agricultores todavía no lo ven…»).

### 4.6 Detalle de convocatoria — `/colectivo/compras-conjuntas/:id`

- **Rol y permisos** (los decide el servidor; la Web lee `can_*` del detalle):
  - Persona **responsable**: administra (editar, abrir, cerrar, cancelar), ve participantes y concede o retira permisos.
  - Colaborador con **«Administrar la convocatoria»** (`MANAGE`): edita el borrador, abre, cancela y cierra. No ve participantes ni concede permisos.
  - Colaborador con **«Consultar participantes y cantidades»** (`PARTICIPANTS`): ve nombres y cantidades, sólo de quienes lo autorizaron (ver «Consentimiento»).
  - Resto de la Directiva o la Administración: sólo el número de participantes y los totales que permita el umbral al cierre. Ve «Sólo la persona responsable o quien tenga el permiso…».
  - **«Sustituir responsable»** (permiso del sindicato): muestra el botón «Sustituir responsable» cuando la responsable ya no está habilitada (`can_substitute_responsible`).
  - Con la responsable inhabilitada nadie administra por su rol (`can_cancel_or_close` existe en el tipo; cuándo lo envía el servidor: no verificado).
- **Consentimiento y versión de la responsable (P-A):**
  - La lista sólo trae lo autorizado. Las participaciones autorizadas «sólo para la persona responsable» se cuentan aparte: «N participaciones autorizadas sólo para la persona responsable: sólo las ve ella».
  - Tras una sustitución, las participaciones que esperan que su agricultor autorice a la nueva responsable se avisan: «N participaciones pendientes de que sus agricultores autoricen a la persona responsable actual: sus datos no se muestran».
  - Los totales que incluyen participaciones ocultas para quien consulta se reemplazan por un texto («Total visible sólo para la persona responsable…» o «Total no visible: incluye participaciones cuyos agricultores aún no autorizaron…»).
- **Objetivo:** seguir y administrar una convocatoria: sus datos, productos, participantes o consolidado, colaboradores e historial.
- **Datos:**
  - Encabezado: nombre y estado (Borrador, Abierta, Cerrada o Cancelada).
  - «Datos de la convocatoria»: Campaña, Responsable («(ya no está activa)»), Fecha límite «(hora del servidor)», Abierta el, Cerrada el, Cancelada el, Motivo de la cancelación, Origen (catálogo o borrador y su selección; «Los productos se editaron después de crearla…»), Sustitución (quién, a quién, cuándo, por decisión de quién y motivo), Participantes, Colaboradores, «Sus permisos».
  - «Productos»: Producto · Unidad · Referencia · «Total solicitado» (sólo abierta; total o texto de retención, más «· N personas»).
  - «Participantes (lista provisional)» (abierta) o «Participantes (convocatoria cancelada, sin consolidado)»: Nombre · Producto · Cantidad solicitada · Estado (Vigente/Retirada) · Aceptada el.
  - «Consolidado al cierre» (cerrada): tarjetas Corte, Modo de cierre (Manual o «Automático, al vencer la fecha límite») y Participantes; tabla Producto · Cantidad solicitada (total) · Personas; «Detalle por participante» si hay permiso.
  - «Colaboradores»: Nombre · Rol · Permisos (quién lo concedió y cuándo; «Suspendido…» si espera revisión o si la responsable no está habilitada); plegable «Historial de permisos».
  - Plegable «Historial» de la convocatoria (evento, fecha, quién o «Automático (servidor)»).
- **Acciones** (cada una según permiso y estado):
  - Borrador: «Editar» y «Abrir».
  - Abierta: «Cerrar».
  - Borrador o abierta: «Cancelar convocatoria».
  - «Sustituir responsable».
  - «Conceder permiso» (responsable; no en cancelada).
  - «Retirar» un permiso; «Renunciar a este permiso» (el propio colaborador).
  - «Confirmar» o «Retirar» un permiso que espera revisión (nueva responsable).
  - «Volver a las convocatorias».
  - Sin exportación a Excel ni a PDF.
- **Diálogos:**
  - «Editar borrador de convocatoria» (el mismo formulario de la lista, con «Guardar borrador»).
  - «Abrir la convocatoria»: implicaciones y casilla «Confirmo que se abre…»; botones «Volver» y «Abrir convocatoria».
  - «Cerrar la convocatoria»: «Se consolidan las participaciones… No se puede reabrir.»; casilla; «Cerrar convocatoria».
  - «Cancelar la convocatoria»: texto según el estado, Motivo obligatorio (280), casilla, «Cancelar convocatoria» (peligro).
  - «Conceder permiso»: Persona, permiso (radio con su descripción), casilla; «Conceder permiso».
  - «Retirar el permiso» / «Renunciar a este permiso».
  - «Confirmar el permiso» / «Retirar el permiso» (revisión de delegaciones de la responsable anterior).
  - «Sustituir a la persona responsable»: implicaciones, «Nueva persona responsable», nota de que quien sustituye no puede nombrarse, Motivo (280), casilla; «Sustituir responsable».
- **Estados:**
  - Cargando y error con «Reintentar».
  - «Sin permiso» (403) o convocatoria inexistente (404): no queda nada a la vista.
  - Un fallo pasajero no borra la vista ya cargada.
  - Avisos: «Ya no puede administrar esta convocatoria: el permiso cambió…», «Ya no puede conceder ni retirar permisos…», responsable inhabilitada, permisos pendientes de revisión, «Ya no tiene permiso para ver a los participantes…» (borra nombres y cantidades de la página).
  - Mientras hay participantes a la vista, el permiso se vuelve a comprobar cada 60 s y al recuperar el foco.
  - «Sin participantes» («Todavía nadie confirmó…» o «No hay participaciones que usted pueda ver»).
  - «Sin cantidades solicitadas» al cierre.
  - «Sin colaboradores», «Sin eventos», «Sin productos».
  - Sustitución: «Sin personas disponibles» (dos textos: nadie más elegible, o sólo quien sustituye).
- **Relacionadas:** ← lista de convocatorias (y tras crear un borrador). → lista.

### 4.7 Histórico y estimaciones — `/colectivo/historico`

Contenedor con un selector «Vista»: «Histórico sellado» (`?vista=tendencias`, por defecto) y «Estimación del consumo» (`?vista=estimacion`). Cambiar de vista conserva `?campaign=`. Encabezado propio: «Histórico y estimaciones» y un subtítulo; cada vista trae su propio encabezado (h2) con título y subtítulo.

#### 4.7.a Vista «Histórico sellado» (`?vista=tendencias`)

- **Rol:** DIRECTIVA y ADMINISTRADOR. Sólo lectura.
- **Objetivo:** comparar, campaña por campaña, las cifras de las versiones selladas de un producto.
- **Datos:**
  - Selector «Dato»: «Consumo publicado» (por defecto) o «Necesidad declarada». Selector «Producto».
  - Gráfico de columnas por campaña sellada, con la cifra encima. Los huecos se rotulan: «oculto», «en revisión», «fuera de rango», «retirado», «sin dato», «sin sellar». En teléfono, barras horizontales.
  - Plegable «Ver campañas y cobertura»: aviso del servidor; tabla «Campañas, versión y cobertura»; una tabla por producto (Campaña · Total publicado · Aportantes).
- **Acciones:** «Descargar Excel» del tipo de dato elegido. No depende de la campaña elegida.
- **Estados:** carga; error con «Reintentar»; «Sin permiso»; «Sin series selladas»; política pendiente (aviso, sin gráfico ni tablas por producto); «Sin campañas».

#### 4.7.b Vista «Estimación del consumo» (`?vista=estimacion`)

- **Rol:** DIRECTIVA y ADMINISTRADOR (perfil institucional). Si el servidor responde con otro perfil, la vista lo trata como permiso perdido.
- **Objetivo:** pedir y consultar la estimación de consumo que calcula el servidor para una campaña, y guardar una copia para consultarla sin conexión.
- **Datos:**
  - «Resultados para <campaña>» con «Vigencia evaluada el … · temporada …».
  - Tabla: Producto · Estimación de consumo (cifra o «Datos insuficientes» con motivo) · «Línea base: último consumo publicado» · Vigencia (insignia; «De una ejecución anterior, no de la última solicitada»).
  - Por fila, plegable «Ver detalle»: serie observada, método «SES frente a la línea base naive · α», cobertura, ejecución.
  - Panel del trabajo: «Última solicitud: <estado>», intento N de M, horas; «se consulta el estado automáticamente».
  - Plegable «Ejecuciones anteriores (N)»: fecha, temporada y resultado.
  - Sección «Ejecución del …» (al abrir una): tabla por producto Campaña · Clase · Consumo publicado · En el tramo · Cobertura.
  - Panel «Copia para consultar sin conexión».
- **Acciones:**
  - «Generar estimación» (principal; sólo con la campaña planificada o abierta).
  - Plegable «Elegir productos» (casillas del catálogo; por defecto, todos los que tienen consumo publicado).
  - «Consultar estado ahora», «Descargar Excel», «Ver detalle», «Cargar más», «Cerrar detalle».
  - «Descargar copia para consultar sin conexión» y enlace «Ver las copias descargadas».
- **Estados:**
  - Carga.
  - «Sin conexión»: lo mostrado queda como «desactualizado», con un aviso; no se exporta ni se genera, y si hay copia, se muestra debajo.
  - «Sesión vencida», «Sin permiso».
  - «Información restringida» (política): borra lo mostrado y retira la copia local.
  - «No disponible» (404), «Solicitud no admitida», error general.
  - Campaña no elegible («Esta campaña está cerrada…»).
  - Aviso de que la campaña debe estar clasificada en una temporada y que la vista no puede comprobarlo antes.
  - Trabajo «no ejecutado» con su motivo; la consulta automática se detuvo por un error.
  - «Sin ejecuciones».
  - Mensajes al guardar la copia: guardada, se conserva una más reciente, la sesión cambió, campaña retirada, etc.
- **Relacionadas:** ← Necesidades y propuestas («Detalle en “Estimación del consumo”»), `/colectivo/estimacion`, pantalla de la copia («Volver a la estimación»). → Copia sin conexión.

### 4.8 Catálogo y equivalencias — `/colectivo/catalogo`

Contenedor con el selector «Vista»: «Productos» (`?vista=productos`, por defecto) · «Equivalencias» (`?vista=equivalencias`) · «Por identificar» (`?vista=identificacion`). Encabezado propio más el de cada vista (h2).

#### 4.8.a Vista «Productos»

- **Rol:** DIRECTIVA y ADMINISTRADOR. Crear, editar e inactivar los decide el servidor.
- **Objetivo:** mantener el catálogo de productos del sindicato sobre el que declaran los agricultores.
- **Datos:**
  - Conteo de productos activos.
  - Grupos (según «Agrupar por»: Categoría, Unidad o Sin agrupar), cada uno con la tabla Nombre (nombre comercial · ingrediente activo) · Unidad (con «no vinculable a cifras colectivas» si no es L ni kg) · Categoría · Acciones.
  - Plegable «Ver inactivos (N)» con la fecha de modificación.
- **Acciones:** «Nuevo producto» (principal) · «Buscar producto» (nombre, nombre comercial o ingrediente activo) · «Agrupar por» · por fila «Editar» e «Inactivar» · enlace «Ver equivalencias» dentro del subtítulo.
- **Diálogos:**
  - «Nuevo producto» / «Editar «…»»: Nombre* (aviso si ya existe), Unidad* (L o kg; fija al editar), plegable «Datos opcionales» (nombre comercial, ingrediente activo, categoría con sugerencias); «Crear producto» o «Guardar cambios».
  - «Inactivar «…»»: «No se borra… El sistema no ofrece reactivarlo después»; «Confirmar inactivación».
- **Estados:** carga; error o «Sin permiso»; «Todavía no hay productos activos»; «Sin coincidencias»; «No hay productos inactivos» o «Ningún inactivo coincide».

#### 4.8.b Vista «Equivalencias» (título interno «Equivalencias de productos»)

- **Rol:** DIRECTIVA y ADMINISTRADOR.
- **Objetivo:** asociar denominaciones distintas a un producto canónico para que sus cifras se agrupen.
- **Datos:**
  - «Pendientes de asociar» (conteo + tabla: denominación, unidad, «inactivo», estado «Unidad no vinculable», «Canónico de N denominaciones» o «Pendiente»).
  - «Equivalencias vigentes» (denominación → canónico, desde, quién).
  - Plegable «Historial» (vigencia, asociado por / motivo, cerrado por / motivo).
- **Acciones:** «Buscar denominación» · «Asociar…» (desactivado si la unidad no es vinculable o si ya es canónico de otras) · «Corregir…» · «Deshacer».
- **Diálogos:**
  - «Asociar «…»»: «Producto canónico» (misma dimensión, sin sugerencias), enlace «¿No está en la lista? Crear producto distinto…» (abre el formulario de producto con la unidad fija y el botón «Crear y volver al selector»), Motivo, aviso «Efecto en las cifras, antes y después: no disponible», casilla de confirmación; «Confirmar asociación».
  - «Deshacer «A → B»»: Motivo, aviso, casilla; «Deshacer asociación».
- **Estados:** carga; error o «Sin permiso»; «Todas las denominaciones están asociadas»; «No hay denominaciones asociadas»; «Sin cambios registrados»; «Sin coincidencias».

#### 4.8.c Vista «Por identificar» (título interno «Productos por identificar»)

- **Rol:** DIRECTIVA y ADMINISTRADOR. No se muestra quién reportó (la API no lo envía).
- **Objetivo:** decidir qué hacer con los productos que los agricultores reportaron desde el teléfono y que no están en el catálogo.
- **Datos:**
  - «Pendientes de identificar»: por solicitud, nombre local, ingrediente activo, unidad, «Recibida», foto («Con foto de la etiqueta», «Foto retirada» o «Sin foto») y la nota «Pendiente por falta de información: …».
  - Plegable «Identificadas» (se carga al abrirlo): «nombre → producto», tipo de resolución, fecha, «producto inactivo».
- **Acciones:** por solicitud «Ver foto» · «Vincular…» · «Crear producto colectivo…» · «Dejar pendiente…»; en identificadas, «Corregir vínculo…».
- **Diálogos:**
  - «Identificar «…»» (o «Corregir el vínculo de «…»»): datos de la solicitud, selector «Acción» (Vincular / Crear producto colectivo / Dejar pendiente; al corregir sólo Vincular) y plegable «Historial».
    - **Vincular:** «Sugerencias del servidor» (radio con parecido y en qué coincide; inactivos desactivados), «Buscar en el catálogo» + «Producto del catálogo», Motivo, casilla; «Confirmar vínculo».
    - **Crear producto colectivo:** nombre (aviso si ya existe, con «Vincular con “…”»), ingrediente activo, unidad fija, Motivo, casilla; «Crear y vincular». Si el servidor responde que el nombre está tomado, pasa a «Vincular».
    - **Dejar pendiente:** Nota, casilla («El agricultor verá la nota en su teléfono»); «Guardar como pendiente».
  - «Foto de «…»»: imagen pedida con la sesión, no se guarda; «Cerrar».
- **Estados:** carga; error o «Sin permiso»; «Nada pendiente»; «Ninguna identificada»; sugerencias cargando, con error o «Sin sugerencias»; «es el vínculo vigente: guardar no cambia nada»; error de la foto.

### 4.9 Cobertura — `/colectivo/cobertura`

- **Rol:** DIRECTIVA y ADMINISTRADOR. Fuera del menú.
- **Objetivo:** ver cuántos agricultores vinculados están dentro de las cifras publicadas de una campaña.
- **Datos:**
  - Tarjeta de cobertura completa (con definiciones; «Cobertura al sellar» si está sellada; «Cobertura no disponible» con política pendiente).
  - Sección «Aportes aceptados y registros locales»: texto que explica que los registros locales no están disponibles.
  - Plegable «Seguimiento de sincronización»: siempre «Todavía sin consulta del servidor».
- **Acciones:** selector de campaña · «Ver el resumen».
- **Estados:** carga; error o «Sin permiso»; «No hay campañas»; cobertura no disponible; sin agricultores vinculados (sin porcentaje).
- **Relacionadas:** ← «Ver cobertura» del Resumen y del Detalle de campaña. → Resumen.

### 4.10 Bitácora — `/audit-logs`

- **Rol:** DIRECTIVA y ADMINISTRADOR (`RoleRoute`).
- **Objetivo:** consultar las acciones importantes registradas por el servidor.
- **Datos:**
  - Tres tarjetas: «Acciones visibles», «Con campaña» y «Tipos de accion».
  - Fichas con los 6 tipos de acción más frecuentes.
  - Tabla: Fecha · Accion · Resumen (y claves de los metadatos) · Responsable · Agricultor · Campaña · Entidad (nombre técnico y su id) · Detalle.
- **Acciones:**
  - Filtros: Campaña, Responsable, Accion, Entidad (texto con sugerencias de nombres técnicos), Desde, Hasta.
  - «Actualizar».
  - «Ver» → diálogo «Detalle de bitacora» (resumen, acción, fecha, responsable, campaña y los bloques JSON «Antes», «Despues» y «Metadatos»).
- **Estados:** filas fantasma mientras carga; aviso de error; «Sin acciones registradas». Muestra como máximo las últimas 300 acciones, sin paginación.
- **Relacionadas:** ninguna enlazada.

### 4.11 Usuarios — `/users`

- **Rol:** sólo ADMINISTRADOR.
- **Objetivo:** administrar las cuentas de acceso del sindicato.
- **Datos:** buscador; contadores «N activos» y «N total». En escritorio, tabla Usuario (iniciales, nombre, «(usted)», correo) · Rol · Estado · Creado · Acciones; en teléfono, tarjetas.
- **Acciones:** «Nuevo usuario» (principal) · «Buscar» (nombre o correo) · por fila «Editar», «Contraseña» y «Desactivar» (desactivado si ya está inactivo o es la propia persona).
- **Diálogos:**
  - «Nuevo usuario»: Nombre, Email, Contraseña (8+), Rol (Agricultor por defecto); con Administrador, una casilla «Confirmo crear otro usuario con rol Administrador».
  - «Editar <nombre>»: Nombre, Email (no editable), Rol, casilla «Usuario activo» (no para uno mismo).
  - «Restablecer contraseña de <nombre>»: Nueva y Confirmar; mensaje «Contraseña actualizada correctamente.» y cierre automático.
  - «Desactivar usuario»: «¿Confirmas que deseas desactivar…?»; «Sí, desactivar».
- **Estados:** «Cargando usuarios…»; aviso de error; «No hay usuarios registrados» o «Sin resultados»; errores dentro de cada diálogo.

### 4.12 Ingresar — `/login`

- **Rol:** sin sesión. Con sesión, redirige a la pantalla inicial del rol.
- **Objetivo:** iniciar sesión.
- **Datos:** en escritorio, un panel informativo («Vistas colectivas del sindicato» y cuatro funciones). Formulario «Ingresar».
- **Acciones:** Correo electrónico, Contraseña, «Mostrar/Ocultar contraseña», «Ingresar» («Ingresando…»). Enlace «Consultarla sin conexión» si hay una copia de estimación legible en el navegador.
- **Estados:** «Correo o contraseña incorrectos…», «Demasiados intentos…» (429), «Error de conexión…», botón desactivado sin datos.
- **Relacionadas:** → pantalla inicial según el rol; → Copia sin conexión.

### 4.13 Aviso para una cuenta AGRICULTOR — `/sin-acceso-web`

- **Rol:** quien no es DIRECTIVA ni ADMINISTRADOR (el AGRICULTOR usa sólo la app móvil). Un rol colectivo es redirigido a su inicio.
- **Objetivo:** decir, sin más, que esa cuenta usa la app.
- **Datos:** «Esta cuenta utiliza la aplicación móvil.» y «La Web está disponible para Directiva y Administración.». Sin menú, sin enlaces, sin enlace de descarga y sin consultas institucionales: sólo se renueva la sesión.
- **Acciones:** «Cambiar de cuenta» (cierra la sesión y abre el inicio de sesión) y «Cerrar sesión». Cerrar la sesión de la Web no deshabilita la cuenta ni afecta a la app.
- **Se llega:** al iniciar sesión con esa cuenta y entrando por cualquier URL, incluidas las antiguas del agricultor y las institucionales (comprobado en el navegador, captura `01_acceso/03`).

### 4.14 Copia de la estimación sin conexión — `/estimacion/copia-sin-conexion`

- **Rol:** sin guarda de ruta. Sólo muestra las copias del contexto local vigente de una sesión institucional abierta en ese navegador; con otra identidad, otro sindicato u otro rol no muestra nada.
- **Objetivo:** leer sin conexión la última estimación descargada.
- **Datos:** página sin armazón (sin menú). Por copia:
  - período objetivo, temporada, quién y cuándo la descargó;
  - aviso destacado «Puede estar desactualizada»;
  - tabla Producto · Resultado · Estimación SES · Línea base naive · Generada el · Vigencia al descargar · Vigencia actual («Desconocida sin conexión»);
  - pie con el formato de la copia y cuándo deja de poder leerse.
- **Acciones:** «Volver a la estimación (requiere conexión)» o «Iniciar sesión (requiere conexión)».
- **Estados:** «No fue posible leer la copia…»; «No hay una copia accesible…»; «Al descargarla no había ninguna estimación…».

### 4.15 Calendario operativo — `/calendar`

- **Rol:** `PrivateRoute`: DIRECTIVA y ADMINISTRADOR pueden abrirla por URL aunque no esté en su menú. El servidor admite los tres roles.
- **Objetivo:** ver eventos (vencimientos de lote, pagos, aplicaciones, compras programadas, stock bajo, cierre de campaña) y marcarlos.
- **Datos:** tarjetas «Eventos visibles», «Próximos 7 días» y «Pendientes vencidos»; filtros Campaña, Tipo, Estado (Pendiente por defecto), Desde y Hasta; eventos agrupados por fecha.
- **Acciones:** «Completar» y «Cancelar» por evento → diálogo «Completar evento» / «Cancelar evento» («Volver», «Confirmar» / «Cancelar evento»).
- **Estados:** filas fantasma, error, «Sin eventos».
- Pantalla con el estilo anterior al rediseño: sin `PageHeader`, por lo que no tiene título visible (`h1`); la barra superior dice «Agenda y alertas».
- **Comprobado en el recorrido** (captura `10_administracion/06`): la Directiva la abre por URL y ve el evento «Cierre estimado de Invierno 2026 (DEMO)» con «Completar» y «Cancelar».
- **Revisión del 2026-11-12** (`docs/evidence/WEB_PIEZAS_HEREDADAS_2026-11-12.md`):
  - un rol institucional sólo recibe el recordatorio «Cierre estimado» de las campañas abiertas, el mismo dato que ya muestra Campañas;
  - «Completar» y «Cancelar» sólo cambian el estado del recordatorio, no la campaña;
  - el filtro «Tipo» ofrece cinco tipos que siempre salen vacíos;
  - `GET /users` no sirve de nada para estos roles;
  - la app móvil no usa `/calendar`.
  - **Recomendación: retirarlo de la Web**, pendiente de la decisión del autor.

### 4.16–4.22 Pantallas del agricultor: retiradas

Las pantallas `/dashboard`, `/plots`, `/applications`, `/reports`, `/inventory`, `/purchases` y `/sync`, su guarda `FarmerRoute`, la cola offline y los servicios y tipos que sólo ellas usaban se retiraron el 2026-11-12 (`741e730`). Sus rutas caen en la ruta comodín: el AGRICULTOR ve el aviso (§4.13) y la Directiva o la Administración vuelven a su Resumen.

---

## 5. Rutas que sólo redirigen

| Ruta | Destino |
|---|---|
| `/` | Pantalla inicial del rol (`homePathFor`) o `/login`. |
| `/colectivo/tendencias` | `/colectivo/historico?vista=tendencias` (conserva el resto de la consulta y el fragmento). |
| `/colectivo/estimacion` | `/colectivo/historico?vista=estimacion`. |
| `/colectivo/productos` | `/colectivo/catalogo?vista=productos`. |
| `/colectivo/reconciliacion` | `/colectivo/catalogo?vista=equivalencias`. |
| `*` (cualquier otra, incluidas las antiguas del agricultor) | Pantalla inicial de la sesión: Resumen, aviso (§4.13) o `/login`. |
| `/directiva` | `/colectivo/propuestas` (conserva `?campaign=`). La página heredada «Panel Directiva» (`pages/directiva.page.tsx`, que ejecutaba compras y pagos) se retiró el 2026-11-12 (`754cb25`): no tenía ruta ni consumidores. |

---

## 6. Funciones que existen fuera del menú principal

- **Cobertura** (`/colectivo/cobertura`): sólo por enlace.
- **Detalle de campaña** y **Detalle de convocatoria**: subrutas.
- **Copia de estimación sin conexión**: enlace en Ingresar («Consultarla sin conexión», sólo si hay copia) y en Estimación («Ver las copias descargadas»).
- **Aviso «sin acceso Web»** para el AGRICULTOR.
- **Calendario operativo**: accesible por URL para la Directiva y el Administrador.
- **Permiso del sindicato «Sustituir responsable»**: plegado al final de la lista de Compras conjuntas, no en Usuarios ni en Administración.
- **Componentes de página no enrutados**: `CollectiveTrendsPage`, `EstimationPage`, `ProductsPage` y `ProductReconciliationPage` envuelven las vistas en su propio armazón, pero `App.tsx` no los usa (sólo se usan las vistas dentro de los contenedores).
- **Páginas de desarrollo** (sólo con `npx vite`; `vite build` no las incluye):
  - `/src/dev/break-ui.html?datos=worst|demo|empty|one&pantalla=propuestas|historico|catalogo&vista=…`: Necesidades y propuestas, Histórico y Catálogo con datos sintéticos; rechaza toda escritura.
  - `/src/dev/resumen-prototipos.html?v=…&datos=…`: prototipos del Resumen (Panorama, Acción, Comparación, Ejecutivo); no es la pantalla real.

---

## 7. Lo que quedó «(no verificado)»

- Cuándo envía el servidor `can_cancel_or_close` a quien no es responsable ni tiene «Administrar».
- ~~El contenido del Calendario para la Directiva~~: comprobado en el recorrido (captura `10_administracion/06`). Sigue sin decidir si debe estar en la Web colectiva.
- Si la hora que se escribe y se muestra como «hora del servidor» en las convocatorias coincide con la del servidor: el campo `datetime-local` y las fechas usan la zona horaria del navegador.
- Si el botón «Abrir» de Campañas aparece en una campaña ya abierta que no es la activa: la condición del código (`!isActive && !terminal`) lo permite; no se comprobó si el servidor puede devolver varias campañas abiertas.
