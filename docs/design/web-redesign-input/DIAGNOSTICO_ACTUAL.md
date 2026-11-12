# Diagnóstico breve de la Web actual

Composición `9dc80f0`. Cada punto dice de dónde sale:

- **(captura …)**: se ve en la captura indicada de `capturas/`.
- **(recorrido)**: se observó al ejecutar la Web.
- **(código)**: sale de leer el código y no se reprodujo con datos.

Nada de esto se corrigió durante la preparación.

## 1. Problemas visuales y de redacción

### Información repetida

- **«No crea compras… / no es una compra»** aparece en el subtítulo de Necesidades y propuestas, en la nota del borrador, en el detalle de campaña y en el consolidado de cada convocatoria (capturas `03_propuestas/02`, `05_convocatorias/03`).
- **«Ausencia de aporte = desconocido, no cero»** se repite en las tarjetas de cobertura, en los estados vacíos y en cada fila oculta (captura `02_resumen/01`).
- **«Revisar borrador»** sale como botón principal del Resumen y otra vez como aviso fijo en «Pendiente según los datos» (captura `02_resumen/01`).
- **Doble encabezado** en los contenedores: «Histórico y estimaciones» seguido de «Histórico sellado», y «Catálogo y equivalencias» seguido de «Productos por identificar». Cada uno trae su propio subtítulo (capturas `08_historico/01`, `07_catalogo/04`).
- **La campaña** aparece en la barra superior, en el selector con sus chips y, en Compras conjuntas, en una columna que siempre tiene el mismo valor (captura `05_convocatorias/01`).
- **«Queda en el historial y en la bitácora»** se repite bajo cada campo de motivo (capturas `06_permisos_psa/02`, `07_catalogo/08`).

### Exceso de texto

- **Avisos de varias frases** antes de la acción: responsable inhabilitada (4 frases), sustitución (5 viñetas), sellado (párrafo y 5 viñetas) y la nota al pie del consumo estimado (2 párrafos) (capturas `06_permisos_psa/01`, `02`, `03_propuestas/08`).
- **Subtítulos de unas 300 letras** en «Productos por identificar» y en «Equivalencias» (capturas `07_catalogo/02`, `04`).
- **Filas ocultas por privacidad** con dos líneas explicativas cada una, iguales en todas (captura `02_resumen/01`).

### Botones que compiten

- **Necesidades y propuestas** junta en la misma pantalla «Generar borrador» (principal), «Descargar Excel», «Obtener / Actualizar referencia», «Quitar referencia» (un enlace), «Guardar selección» y «Preparar convocatoria (N)». Son cuatro operaciones que escriben (captura `03_propuestas/08`).
- **Detalle de convocatoria** reúne arriba «Cerrar», «Cancelar convocatoria» (en rojo) y, en otros estados, «Editar», «Abrir» o «Sustituir responsable». Más abajo, Colaboradores tiene otro botón principal, «Conceder permiso» (capturas `05_convocatorias/02`, `04`).
- **Por identificar** muestra cuatro botones iguales en cada solicitud. Tres de ellos abren el mismo diálogo, cada uno en otra pestaña (captura `07_catalogo/04`).
- **Resumen** presenta «Revisar borrador» (principal) y, más abajo, «Sellar esta versión…», que también es principal (código; el sellado necesita una campaña cerrada).

### Nombres poco comprensibles

- **Términos técnicos de la estimación:** «SES», «naive», «α», «ejecución», «huella», «canónico», «denominación», «dimensión» (capturas `03_propuestas/03`, `07_catalogo/02`, `08_historico/02`).
- **Códigos internos en el texto:** «Política de divulgación pendiente (F07-POL-01)» (captura `99_simulados/01_resumen_politica`) y `PROVISIONAL_SYNTHETIC` en «Ver cálculo» (captura `03_propuestas/03`).
- **Bitácora:** filtro «Entidad» con nombres de tablas, JSON en bruto en «Antes» y «Después» y palabras sin tilde: «bitacora», «Accion», «Despues» (captura `10_administracion/04`; código).
- **El mismo rótulo para dos estados:** «Sin cifra publicada» vale tanto para «en revisión» como para «sin dato» (código).
- **«Cancelar convocatoria»** es una acción de negocio, y en los diálogos de esa pantalla el botón para salir se llama «Volver». En otras pantallas, ese mismo botón se llama «Cancelar» (capturas `05_convocatorias/08`, `07_catalogo/06`).

### Cifras y formato

- **Decimales sin redondear:** «19,530798848 KG» en Estimación (captura `08_historico/02`) y «411.938805299» en el Excel (captura `04_excel/03`).
- **Unidades escritas de dos maneras:** «kg» y «KG» en la misma tabla (captura `07_catalogo/02`).
- **Campos de fecha y hora** con «mm/dd/aaaa», el orden de EE. UU., en el formulario de convocatoria, en Campañas y en Calendario. Depende del navegador, pero choca con «dd/mm» en el resto (capturas `05_convocatorias/06`, `10_administracion/06`).

### Información importante escondida

- **El permiso del sindicato «Sustituir responsable»** está plegado al final de la lista de Compras conjuntas, no en Administración (captura `06_permisos_psa/06`).
- **«Cobertura»** no está en el menú: sólo se llega con el enlace «Ver cobertura».
- **Las tablas completas por producto del Histórico** están dentro de «Ver campañas y cobertura»; el gráfico muestra un solo producto (capturas `08_historico/01`, `03`).
- **«Corregir vínculo…»** sólo está dentro del plegable «Identificadas» (captura `07_catalogo/09`).
- **En el teléfono**, Compras conjuntas y Catálogo no están en la barra inferior (código; capturas móviles).

### Navegación fragmentada

- **Tres contenedores con vistas** (`?vista=`) y varias rutas antiguas que redirigen a ellos (INVENTARIO §5).
- **El detalle de campaña** lista sus borradores sin enlace a cada uno, y «Ver» de un borrador anterior no cambia la URL: no se puede volver a un borrador concreto (código).
- **El Calendario** («Agenda y alertas») es una pantalla heredada fuera del menú. Se llega por URL y ofrece «Completar» y «Cancelar» sobre el cierre de la campaña (captura `10_administracion/06`). Para la Directiva repite el «fin estimado» de Campañas, y «Completar» no cierra la campaña. Se recomienda retirarlo; la decisión es del autor (`docs/evidence/WEB_PIEZAS_HEREDADAS_2026-11-12.md`).

## 2. Problemas funcionales (la interfaz dice una cosa y el sistema hace otra)

- **Equivalencias.** La tabla «Pendientes de asociar» incluye productos que no están pendientes, como «Herbicida DEMO — Canónico de 1 denominación», con «Asociar…» desactivado. El conteo de la nota sólo cuenta los pendientes (captura `07_catalogo/02`; código).
- **La sesión se cierra ante un límite de peticiones.** Si la renovación de la sesión recibe `429` (límite de 20 por minuto), la Web manda a la pantalla de inicio de sesión como si la sesión hubiera vencido. En la preparación ocurrió varias veces al recargar seguido (recorrido: registro de la API con `POST /auth/refresh 429`; código `lib/axios.ts`).
- **«Hora del servidor».** El formulario y el detalle dicen «hora del servidor», pero los campos y las fechas usan la zona horaria del navegador (código).
- **«Nueva convocatoria»** está activa para una campaña cerrada o cancelada; el rechazo llega al enviar el formulario (código).
- **«Preparar convocatoria (N)»** usa la selección **guardada**, no la marcada. Con cambios sin guardar, el botón se desactiva y una línea pequeña lo explica (captura `03_propuestas/05`).
- **Tres formas de crear un producto con resultados distintos:**
  - «Nuevo producto», en Productos;
  - «Crear producto distinto…», dentro de Asociar;
  - «Crear producto colectivo», en Por identificar, que además lo vincula (capturas `07_catalogo/07`, `10`, `11`).
- **Campañas.** «Abrir» puede mostrarse en una campaña abierta que no es la activa, y «Cerrar» sólo aparece en la activa (código; no se verificó si el servidor permite varias abiertas).
- **El Histórico sellado ignora la campaña elegida** y muestra todas las campañas; la vista de Estimación sí la respeta (código).
- **Usuarios.** «Nuevo usuario» propone «Agricultor» por defecto. Desactivar se hace con un botón y reactivar con una casilla dentro de «Editar» (código).

## 3. Lo que la API no ofrece

Si el diseño lo propone, es un **cambio funcional pendiente**:

- **Exportaciones.** No hay Excel de convocatorias, del consolidado al cierre, de la bitácora ni de las campañas. No hay ningún PDF.
- **Sincronización.** No hay estado por agricultor (última sincronización, envíos pendientes): el plegable «Seguimiento de sincronización» de Cobertura queda vacío. Tampoco hay «registros locales» sin publicar.
- **Lista de convocatorias.** No hay totales: sólo el número de participantes, por diseño.
- **Campañas.** No hay reabrir ni cancelar una campaña. Tampoco hay un `GET` del detalle: la pantalla lo compone a partir de varias consultas.
- **Equivalencias.** No hay vista previa del efecto de asociar o deshacer.
- **Catálogo.** No hay reactivación de productos ni historial de cambios.
- **Bitácora.** Muestra como máximo 300 entradas, sin paginación ni búsqueda por texto.
- **Por diseño (privacidad):** no se informa quién aportó cada cifra agregada ni quién reportó un producto por identificar.
- **Estimación.** No se puede saber antes de pedirla si la campaña está clasificada en una temporada: se descubre con el rechazo.
