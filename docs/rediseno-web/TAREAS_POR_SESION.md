# Tareas por sesión: rediseño de la Web (v2)

Inventario hecho el 2026-11-13 sobre `_wt/WEB2-INT` en `50aa672`. Rutas relativas a `Web/src/`.

- El detalle de cada lámina está en `MATRIZ_LAMINAS.md`. Los hallazgos (H-NN) están en `HALLAZGOS_FUNCIONALES.md`.
- Se respetan el reparto de archivos de `docs/rediseno-web/COORDINACION.md` §3 y las reglas de §5, que prevalecen sobre las láminas.
- Nadie toca `services/**`, `types/**` ni `Back/**`. Todas las tareas usan llamadas que ya existen.

## Orden global recomendado

1. **O (BASE) publica:**
   - los tokens;
   - los componentes de §O.1;
   - el armazón y la navegación de §O.2 y §O.3.
2. **A, B y C trabajan en paralelo sobre la base.** En cada sesión, primero la pantalla principal y luego sus estados y diálogos.
3. **Las uniones (§U) se cierran al final**, con los contratos de parámetros fijados aquí desde el principio para no bloquear a nadie.

---

## O · Orquestador / BASE

**Archivos:** `App.tsx`, `index.css`, `components/ui/**`, `components/app-shell.tsx`, `components/collective-ui.tsx`, las guardas, `lib/navigation.ts`, `contexts/**`, `pages/login.page.tsx`, `pages/web-not-for-farmers.page.tsx` y `lib/axios.ts`.

> `lib/axios.ts` no figura en la tabla de COORDINACION §3. Se le asigna a O por ser infraestructura compartida.

### O.1 Tema y componentes compartidos

Se publican en `components/ui/README.md`.

**Tokens**
- verde oscuro de cabecera y menú;
- lima como acento primario;
- ámbar para avisos;
- rosa o rojo para lo destructivo;
- gris para lo deshabilitado;
- tipografía;
- radios;
- foco visible.

**Componentes que piden varias sesiones**

| Componente | Detalle | Láminas | Lo usan |
|---|---|---|---|
| Cabecera oscura de página («hero») | Antetítulo, título, chips, fila de datos clave con la primera cifra en lima y acciones | 03, 10–20, 28, 29 | A, B, C |
| Chips de estado | Abierta, Cerrada, Sellada · versión N, Borrador, Cancelada, Responsable no habilitada y Solo consulta. El chip **punteado** «sin cifra» lleva el texto del estado (Oculta, Oculto por umbral, Restringido, No disponible mientras esté abierta, Total no disponible) | 03, 05 §13, 18, 19 | A, B, C |
| Pestañas con contador | «Borradores anteriores (4)», «Pendientes (6)», «Todas 9» | 06, 07, 09, 23, 31, 39 | A, B, C |
| Línea de pasos | Abierta → Cerrada → Sellada | 03, 29 | A, C |
| Diálogo y hoja inferior | Foco al abrir, Esc y «Cancelar», retorno del foco | 15, 30, 33, 34, 46 | B, C |
| Patrón «confirmación con motivo» | Texto, motivo obligatorio u opcional, casilla y botón deshabilitado hasta cumplirse (H-16) | 15, 30, 33, 34, 46 | B, C |
| `DataState` | Cargando, vacío, sin conexión, error del servidor, sin permiso, servidor ocupado (429), política pendiente | 05 §1–9 | A, B, C |
| Barra inferior de selección | No tapa la última fila | 06, 36 | A |
| Línea de tiempo «Actividad» | — | 10–20 | B (si no la promueve, la hace B en `components/b/`) |
| Avatar con iniciales | Calculadas del nombre: no copiar el «RV» de la muestra | — | — |
| Lista en tarjetas para pantallas estrechas | — | — | — |

### O.2 Armazón y navegación

Láminas 03–34 (escritorio) y 35–51 (teléfono).

**`lib/navigation.ts`**
- Etiquetas: Resumen, **Borrador de compra** (= `/colectivo/propuestas`), Compras conjuntas, **Catálogo** y **Histórico**.
- Grupo **«SINDICATO»**: Campañas · Usuarios · Bitácora.
- Se conservan todas las rutas y las redirecciones (`/colectivo/tendencias`, `/colectivo/estimacion`, `/colectivo/productos`, `/colectivo/reconciliacion`, `/calendar` y `/directiva`).
- Usuarios sólo para ADMINISTRADOR. Bitácora para DIRECTIVA y ADMINISTRADOR.
- Se adaptan las pruebas de `app-shell.test.tsx` sólo en textos y orden, y se declara.

**Submenús**

| Menú | Entrada | Destino |
|---|---|---|
| Catálogo | Productos | `/colectivo/catalogo?vista=productos` |
| | Nombres equivalentes | `?vista=equivalencias` |
| | Por identificar | `?vista=identificacion` |
| Histórico | Histórico sellado | `/colectivo/historico?vista=tendencias` |
| | Estimación del consumo | `?vista=estimacion` |

El ítem activo depende de la ruta y del parámetro `vista`.

**Insignia «Por identificar» (H-02)**
- Sale de `identificationService.list('PENDING')`, una vez al montar el armazón.
- Se vuelve a pedir con una señal que publica O. Propuesta: un pequeño contexto o evento en `contexts/**`, por ejemplo `notifyIdentificationChanged()`, que C llama tras vincular, crear, posponer o corregir.
- Sin respuesta no hay insignia, y nunca se muestra «0» como dato.
- Va en «Catálogo» con el menú plegado y en «Por identificar» con el menú desplegado.

**Resto del armazón**
- Menú lateral plegable (botón «<»).
- Tarjeta de usuario con «salir».
- La chapa «Datos sintéticos» se conserva, alimentada por `lib/data-mode.ts` (H-03).

### O.3 Teléfono

**Barra inferior** (hoy lleva Resumen, Campañas, Necesidades e Histórico: `app-shell.tsx:176`)
- Pasa a ser Resumen · Borrador · Compras · Catálogo · **Más**.
- No debe tapar contenido.

**Pantalla u hoja «Más»** (lámina 43; en 44, Usuarios para ADMINISTRADOR)
- Histórico y estimaciones · Campañas · Bitácora · [Usuarios].
- Tarjeta de usuario y «Cerrar sesión».
- Elegir entre una hoja sin ruta nueva o una ruta propia. Si es una ruta, se añade a `App.tsx` con `CollectiveRoute`.

### O.4 Acceso

- **Ingresar** (01): `login.page.tsx`. Se conservan el aviso condicional de la copia sin conexión y «Mostrar».
- **Aviso para una cuenta de agricultor** (02): `web-not-for-farmers.page.tsx`.

### O.5 Corrección compartida

**H-17.** En `lib/axios.ts:65-76`, un 429 en `/auth/refresh` no debe borrar el token ni llevar a `/login`. Se propaga como «servidor ocupado» para que cada página muestre «Reintentar».

### O.6 Integración

- La suite completa y el build.
- La matriz `docs/rediseno-web/MATRIZ_LAMINAS.md`, que puede partir de este inventario.

---

## A · Consulta y propuestas

**Archivos:**
- `pages/collective-summary.page.tsx`, `coverage.page.tsx`, `joint-proposal.page.tsx`, `estimation.page.tsx`, `estimation-copy.page.tsx`, `history.page.tsx` y `collective-trends.page.tsx`;
- `components/coverage-card.tsx`, `estimation-copy-view.tsx`, `estimation-figure.tsx`, `needs-bars.tsx`, `seal-panel.tsx` y `export-buttons.tsx`;
- `components/a/**`.

### A.1 Resumen (03, 35)

**Cabecera oscura**
- Selector de campaña y chips (Abierta, Campaña activa).
- Recargar · Descargar Excel · «Revisar borrador →».
- «Cobertura N de M», que enlaza a Cobertura.
- Necesidades publicadas, Ocultas por privacidad y Cifra más reciente.

**Necesidades declaradas**
- Buscador y filtros Todos / Litros / Kilogramos / Ocultas, en cliente.
- Dos columnas por unidad, con barras dentro de su unidad.
- Chip «Cifra anterior · hay cambios sin publicar» (`pending_changes`).
- Rótulos por estado (H-06).
- Nota sobre el umbral (`disclosure.threshold`).

**Columna lateral**
- **«Para atender» (H-07)**: revisar el borrador; N cifras con valor anterior; N productos por identificar con `identificationService.list('PENDING')`. Se conservan «Sin campaña activa» y «Campaña cerrada sin sellar».
- **«Consumo publicado»**: celdas `CONSUMPTION_TOTAL`.
- **«Versión de las cifras»** (H-05): estado de la campaña + `seal`.

### A.2 Estados del Resumen (05 §1–11)

Con el `DataState` de O:
- cargando;
- sin campañas, con «Ir a Campañas»;
- sin datos publicados;
- todo oculto;
- política pendiente;
- sin conexión, error del servidor y 429: se distinguen por el error de axios (hoy sólo `error` y `forbidden`, `collective-summary.page.tsx:40,59`);
- sin permiso;
- cerrada y lista para sellar;
- sellada.

### A.3 Panel y diálogo de sellado (05 §10–11, 30.3)

- Archivo: `components/seal-panel.tsx`, con «Sellar esta versión…».
- El diálogo lleva la cobertura y «Datos aceptados hasta». Los avisos **sin número** salen de los booleanos de `review` (H-04). Casilla obligatoria.
- **Se exporta para que C lo use en el detalle de campaña (29).**

### A.4 Cobertura (04)

- Tres tarjetas: Vinculados, Con cifras publicadas y Quién aportó (texto fijo).
- «Volver al resumen».

### A.5 Borrador de compra: «Borrador actual» (06, 36)

- **Cabecera:**
  - selector de campaña;
  - «Generado el … por … · al generarlo, N de M…» (`coverage` + `basis`);
  - Descargar Excel y «Generar borrador nuevo».
- **Franja de la referencia de consumo estimado.** Seis estados (05 §12): NONE con «Obtener», CALCULATING, LINKED vigente, desactualizada con «Actualizar», RESTRICTED y fallida con «Reintentar». También «Quitar».
- **Tabla** Llevar · Producto · Necesidad declarada · Consumo estimado, con el alcance (`scope`) y sin diferencia (H-09: no se traslada `percentText`).
- **Barra inferior:** «N producto(s) elegido(s)», que se guarda con `PUT …/selection`, y «Preparar convocatoria →» (§U.1).

### A.6 Pestaña «Borradores anteriores (N)» (07)

- Lista con «Actual» y «Anterior». «Abrir» o «Ver» cambia el borrador mostrado.
- **Aceptar un parámetro de URL para abrir un borrador concreto** (§U.3). Propuesta: `?campaign=<id>&borrador=<proposalId>`.

### A.7 Pestaña «Cómo se calculó» (08, 51)

- **En pocas palabras.**
- **Con qué datos:** calculado, temporada, rangos de campañas y aportantes (mínimo y máximo de los `scope`), sin estimación por estado.
- **Referencia del borrador:** fijada, por quién y estado.
- **Detalle técnico:** método, «Se compara con» y versión del cálculo (`run.method_version`).
- «Ver la estimación completa» lleva a `/colectivo/historico?vista=estimacion&campaign=`.

### A.8 Histórico sellado (25, 40)

- Consumo publicado / Necesidad declarada.
- Selector de producto y Descargar Excel.
- Barras por campaña sellada, con huecos rotulados.
- **Cobertura de cada campaña visible** (F07 §8).
- **No** se pinta «Campaña más alta» ni «El mayor consumo fue…» hasta que el autor decida (H-10).
- «Ver campañas y cobertura» lleva a `/campaigns`.

### A.9 Estimación del consumo (26)

- **Tabla:** Producto · Consumo estimado · Último consumo publicado (con la campaña) · Estado. Se conservan todos los estados de vigencia y resultado.
- **Acciones:** «Generar estimación», «Descargar Excel» y «Guardar copia».
- «Cálculos anteriores» con `counts`, que abre el detalle de la ejecución.

### A.10 Copia sin conexión (27)

Tres estados:
- copia legible, con el aviso «Puede estar desactualizada»;
- sin copia;
- sesión cerrada o de otra persona, con «Ir a Ingresar».

---

## B · Compras conjuntas

**Archivos:** `pages/joint-purchase-calls.page.tsx`, `joint-purchase-call-detail.page.tsx`, `joint-purchase-call-form.tsx` y `substitution-permissions-section.tsx`; `lib/joint-purchase-call-text.ts`; `components/b/**`.

### B.1 Lista (09, 37)

- Selector de campaña y «+ Nueva convocatoria», desactivado si la campaña no está ABIERTA (H-29).
- **Filtros con contador:** Todas, Abiertas, Borradores, Cerradas y Canceladas, en cliente.
- **Secciones:**
  - «Abiertas · reciben pedidos»: Cierra, Participan y Responsable;
  - «Borradores · los agricultores aún no los ven», con «Revisar y abrir»;
  - «Terminadas».
- «Usted es responsable» se deduce de `responsible.user_ref` frente a `user.id`.
- **H-11:**
  - el chip «Responsable no habilitada» espera la decisión del autor (se recomienda mostrarlo sólo en el detalle);
  - en Terminadas se muestra la responsable, no quién canceló.
- **Franja «Permiso «Sustituir responsable»»:** «N personas…» y «Ver quién lo tiene ›» (§U.4).

### B.2 Formulario de crear y editar (15.1, 34.1, 45)

- **Crear:** campaña de sólo lectura; nombre; fecha y hora límite (texto de H-14); responsable (`eligible-responsibles`; ayuda de H-15); productos «Del catálogo» o «De un borrador de compra».
- **Editar:** sólo DRAFT.
- Se conservan el origen y la selección (E3-P2) y el preajuste desde el borrador (§U.1).

### B.3 Detalle: estructura común (10–20, 38, 48, 50)

- **Cabecera:** «← Compras conjuntas», chips, datos clave según el estado y acciones según `can_manage` y `can_cancel_or_close`.
- **Tarjeta de productos y totales**, según el estado:

  | Estado | Título | Datos |
  |---|---|---|
  | DRAFT | «Productos» | Origen y «Necesidad declarada en el borrador» |
  | OPEN | «Pedido hasta ahora» | `totals_source = LIVE` |
  | CLOSED | «Consolidado al cierre» | `GET …/closing` |
  | CANCELLED | «Los pedidos quedaron sin efecto» | — |

  Los totales siguen los estados de 05 §13: VISIBLE, UNDER_THRESHOLD, RESTRICTED y RESPONSIBLE_ONLY (abierta o cerrada).
- **«Quién pidió» / «Detalle por participante»:**
  - con `can_view_participants`, se pide `GET …/participants` o `closing.participants`;
  - si no, el aviso según el caso (sin permiso, retirado, suspendido o pendientes de autorización);
  - los avisos `hidden_notice` y `pending_authorization_notice` del servidor.
- **Columna derecha:**
  - «Quién más puede verla», «Su acceso» o «Permisos por revisar · N» / «Permisos suspendidos · N» (`GET …/collaborators`);
  - «Cómo funciona el acceso» (plegable);
  - «Actividad» (`history` + `responsible_changes`, con «Sistema» si el actor es `null`);
  - «Qué sigue» en CLOSED;
  - nota «no es una compra».

### B.4 Estados que se cubren y se prueban

| Lámina | Estado |
|---|---|
| 10 | Borrador |
| 11 y 38 | Abierta, responsable |
| 12 | Cerrada con consolidado, cierre manual |
| 13 | Cancelada con motivo |
| 14 y 50 | Nueva responsable: `responsible_changes`, `pending_authorization_count`, revisión CONFIRM/RETIRE |
| 16 | Sin permiso de participantes |
| 17 y 48 | Permiso retirado: se deduce de `collaborators.history` con `REVOKED` para `user.id` |
| 18 | Cerrada sin permiso de detalle |
| 19 | Cerrada con menos de 3, cierre automático |
| 20 | Responsable no habilitada, con «Sustituir responsable…» y «Renunciar» |

### B.5 Diálogos

| Lámina | Diálogo |
|---|---|
| 15.2 | Abrir |
| 15.3 | Cerrar y consolidar |
| 15.4 y 46 | Cancelar con motivo |
| 15.5 | Conceder permiso |
| 15.6 y 49 | Sustituir responsable (`request_id` y `expected_responsible_version`; 409 `RESPONSIBLE_CHANGED`) |
| 34.2 | Retirar o renunciar al permiso |

Botón deshabilitado hasta cumplir las condiciones (H-16).

### B.6 Componente del permiso «Sustituir responsable»

`substitution-permissions-section.tsx` pasa a ser un componente reutilizable con dos modos:
- **lectura**, para la Directiva, en Compras conjuntas;
- **gestión**, para ADMINISTRADOR con `can_grant`: conceder con motivo obligatorio y retirar.

Lo incrusta C en Usuarios (§U.4).

---

## C · Catálogo y administración

**Archivos:** `pages/catalog.page.tsx`, `products.page.tsx`, `product-reconciliation.page.tsx`, `product-identification.page.tsx`, `campaigns.page.tsx`, `campaign-detail.page.tsx`, `campaign-dates.ts`, `users.page.tsx` y `audit-logs.page.tsx`; `components/product-form.tsx`; `components/c/**`.

### C.1 Contenedor del catálogo

- El submenú (O) sustituye al `SegmentedControl` (`catalog.page.tsx:42`). Se mantiene `?vista=productos|equivalencias|identificacion`.
- En teléfono, pestañas Productos · N / Nombres equivalentes / Por identificar · N (39).

### C.2 Productos (21, 39)

- Buscador y agrupación por categoría, por unidad o sin agrupar.
- «Editar» e «Inactivar» en cada fila.
- «Ver productos inactivos»: `isActive=false`, sólo lectura, sin reactivar (H-19).
- **Diálogos:**
  - 30.4 Nuevo producto (decidir si se conserva «Nombre comercial»);
  - 34.4 Editar, con la unidad bloqueada;
  - 30.5 Inactivar.

### C.3 Nombres equivalentes (22)

- «Nombres unidos», con «Corregir…» (re-asociar: H-01) y «Separar…».
- «Historial de cambios» (`associations.history`).
- «Nombres sueltos»: excluye los canónicos y los alias vigentes, con «Unir con…».
- **Diálogos:** 30.6 Unir y 34.5 Separar.

### C.4 Por identificar (23, 24, 47, 33.5)

- **Pendientes:**
  - la lista lleva el chip «Falta información» y «con foto»;
  - el panel muestra «El agricultor lo llamó», ingrediente, unidad, recibido y la foto (blob, modal 33.5);
  - tres opciones: vincular (con los candidatos, `matched_on` y el buscador), crear (nombre e ingrediente; la lámina no los dibuja) y posponer con nota;
  - motivo y casilla.
- **Ya identificados:**
  - la lista muestra el producto y la fecha (H-12);
  - el panel «Corregir la identificación» usa `link` / `RELINKED`.
- Tras cada acción, avisar al armazón para refrescar la insignia (§U.5).
- Nunca se muestra quién reportó (H-20).

### C.5 Campañas (28, 41)

- **Tarjeta activa:** «Cerrar campaña…» y «Ver detalle».
- **«Anteriores · N»:** buscador, filtro de estado y chips «Cerrada» y «Sellada · versión N» (H-25: con `collectiveService.trends(null)`, una llamada).
- Se conservan PLANIFICADA y «Abrir campaña».
- La cobertura **no** va en la lista (H-18).
- **Diálogos:** 30.1 Nueva campaña y 30.2 Cerrar campaña.

### C.6 Detalle de campaña (29)

- **Cabecera:** «← Campañas», chips, fechas, «Editar» (34.3), «Cerrar campaña…» y «Ver resumen».
- **Tarjeta «Participación»**, de `GET …/summary`.
- **Tarjeta «Versión de las cifras»**, con el `seal-panel` de A: «Sellar: disponible al cerrar» o el diálogo 30.3.
- **Tarjeta «Borradores de compra»:** «Abrir el más reciente» y filas que abren un borrador concreto (§U.3).
- Enlace al Histórico (§U.2).

### C.7 Usuarios (31, 44)

- «N cuentas activas de M» y pestañas por rol con contador, en cliente.
- Buscador, «(usted)», Activa o Inactiva, «Editar» y «Contraseña».
- **Panel del permiso «Sustituir responsable»:** el componente de B en modo gestión (§U.4).
- **Diálogos:**
  - 33.1 Nuevo usuario (rol por defecto: decidir; la lámina propone Directiva);
  - 33.2 Contraseña, con repetición en cliente;
  - 33.3 Desactivar;
  - 34.6 Editar: correo de sólo lectura (H-13), «Cuenta activa» = `isActive`.

### C.8 Bitácora (32, 42)

- Agrupada por día.
- **Filtros:** campaña, persona (incluidos los inactivos), acción y fechas. En teléfono, chips por categoría agrupados en cliente (H-28).
- La fila lleva la descripción legible a partir de `summary` y `entityName`, más «persona · ámbito».
- «Se muestran las últimas 300».
- **Diálogo 33.4 «Qué pasó»:** Acción, Cuándo, Quién, Dónde y Nota (`metadata.reason`). «Ver datos técnicos» muestra el antes, el después y los metadatos.
- Las acciones sin `AuditLog` no se inventan (H-08).

---

## U · Uniones entre áreas (contratos de parámetros)

| # | Unión | Origen → destino | Contrato | Responsables |
|---|---|---|---|---|
| U.1 | Borrador → Crear convocatoria | A (06/36 «Preparar convocatoria →») → B (formulario 15.1/45) | Se mantiene el actual: `/colectivo/compras-conjuntas?nueva=1&campana=<campaignId>&propuesta=<proposalId>&productos=<refs>` (`joint-proposal.page.tsx:398`; `joint-purchase-calls.page.tsx:48-64, 244`). Usa la selección **guardada** (E3-R6). B abre el formulario con «De un borrador de compra» preseleccionado | A no cambia la URL. B conserva el preajuste |
| U.2 | Resumen y detalle de campaña ↔ Histórico | C (29) y A (03) → A (`/colectivo/historico`, `/colectivo/resumen`, `/colectivo/cobertura`) | `?campaign=<id>` (lo lee `hooks/use-selected-campaign.ts:63`); para el histórico, además `?vista=tendencias\|estimacion` | C usa los enlaces; A los acepta (ya existen) |
| U.3 | Detalle de campaña → un borrador concreto | C (29, filas de «Borradores de compra») → A (06/07) | **Nuevo en A:** `/colectivo/propuestas?campaign=<id>&borrador=<proposalId>`. Hoy `joint-proposal.page.tsx` no lee un parámetro de borrador. Mientras no exista, C enlaza sólo a `?campaign=` («Abrir el más reciente») | A añade el parámetro; C lo usa |
| U.4 | Usuarios ↔ permiso «Sustituir responsable» | C (31/44) incrusta el componente de B. B (09, «Ver quién lo tiene») lleva a su vista de lectura, que la Directiva también puede abrir | El componente de B recibe `userId` (ya lo hace: `joint-purchase-calls.page.tsx:237`) y un modo. `GET /joint-purchase-substitution-permissions` es para DIRECTIVA y ADMINISTRADOR (`substitution-permissions.controller.ts:25`); conceder y retirar, sólo con `can_grant` | B entrega el componente; C lo coloca. `/users` sigue siendo sólo de ADMINISTRADOR |
| U.5 | Catálogo → identificación y equivalencias, e insignia | C (23/24 y 22) ↔ O (insignia del menú) ↔ A («Para atender») | Destinos: `/colectivo/catalogo?vista=identificacion` («N productos por identificar» del Resumen) y `?vista=equivalencias`. C avisa al armazón tras cada acción de identificación (señal que publica O). A cuenta con el mismo servicio | O publica la señal; C la emite; A enlaza |
| U.6 | Convocatoria → participantes, permisos y actividad | Dentro de B (detalle) | Las secciones se cargan con `GET /:id`, `GET /:id/participants` (sólo con `can_view_participants`; nunca se pide sin permiso), `GET /:id/closing` (CLOSED) y `GET /:id/collaborators`. La actividad sale de `history` + `responsible_changes`. Tras cada acción (conceder, retirar, revisar, sustituir, abrir, cerrar o cancelar) se recargan el detalle y los colaboradores | B |
| U.7 | Campaña → Resumen | C (29 «Ver resumen») → A | `/colectivo/resumen?campaign=<id>` (ya existe, `campaign-detail.page.tsx:141`) | — |
| U.8 | Resumen y estados → Campañas | A (05 §2 «Ir a Campañas»; «Sin campaña activa») → C | `/campaigns` | — |
| U.9 | Borrador «Cómo se calculó» → Estimación | A → A | `/colectivo/historico?vista=estimacion&campaign=<id>` | — |

## Decisiones del autor que bloquean algo

| Hallazgo | Qué decide | Qué bloquea |
|---|---|---|
| H-10 | Destacar el máximo en el Histórico | A.8: sólo la tarjeta del máximo; el resto se puede hacer |
| H-11 | Chip «Responsable no habilitada» en la lista | B.1: sólo ese chip |
| H-08 | Registrar más acciones en la bitácora (cambio de Backend) | Nada en v2 |
