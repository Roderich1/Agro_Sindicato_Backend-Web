# Índice de capturas

Capturas de la Web **real** de esta composición (ver README), salvo el grupo 99, que está rotulado. 
Escritorio a 1440 px de ancho; «móvil» a 390 px de ancho (las primeras con emulación táctil de Puppeteer; las rehechas, sólo con el ancho: el diseño de la Web depende del ancho). 
Página completa salvo en diálogos, que muestran la ventana visible. Datos sintéticos del entorno aislado.

Columnas: archivo(s) · ruta · rol · estado · qué muestra.

## 1. Inicio de sesión y acceso por rol

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_inicio_sesion__escritorio.png](capturas/01_acceso/01_inicio_sesion__escritorio.png) · [01_inicio_sesion__movil.png](capturas/01_acceso/01_inicio_sesion__movil.png) | `/login` | Sin sesión | vacío | Inicio de sesión (vacío) |
| [02_inicio_sesion_error__escritorio.png](capturas/01_acceso/02_inicio_sesion_error__escritorio.png) | `/login` | Sin sesión | error | Credenciales incorrectas (cuenta inexistente, sintética) |
| [03_agricultor_sin_acceso_web__escritorio.png](capturas/01_acceso/03_agricultor_sin_acceso_web__escritorio.png) · [03_agricultor_sin_acceso_web__movil.png](capturas/01_acceso/03_agricultor_sin_acceso_web__movil.png) | `/sin-acceso-web` | AGRICULTOR | sin permiso | Una cuenta AGRICULTOR al iniciar sesión: aviso breve, sin menú ni datos, con «Cambiar de cuenta» y «Cerrar sesión» |

## 2. Resumen, selección de campaña y cobertura

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_resumen_directiva__escritorio.png](capturas/02_resumen/01_resumen_directiva__escritorio.png) · [01_resumen_directiva__movil.png](capturas/02_resumen/01_resumen_directiva__movil.png) | `/colectivo/resumen` | DIRECTIVA (Directiva DEMO) | — | Resumen con la campaña activa (Directiva) |
| [02_cobertura__escritorio.png](capturas/02_resumen/02_cobertura__escritorio.png) · [02_cobertura__movil.png](capturas/02_resumen/02_cobertura__movil.png) | `/colectivo/cobertura` | DIRECTIVA (Directiva DEMO) | — | Cobertura (agricultores vinculados y con aporte) |
| [03_resumen_administrador__escritorio.png](capturas/02_resumen/03_resumen_administrador__escritorio.png) | `/colectivo/resumen` | ADMINISTRADOR (Administración DEMO) | — | Resumen (Administrador) |

## 3. Necesidades declaradas, borrador y referencia histórica

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_necesidades_y_propuestas__escritorio.png](capturas/03_propuestas/01_necesidades_y_propuestas__escritorio.png) · [01_necesidades_y_propuestas__movil.png](capturas/03_propuestas/01_necesidades_y_propuestas__movil.png) | `/colectivo/propuestas` | DIRECTIVA (Directiva DEMO) | — | Necesidades y propuestas de la campaña activa |
| [02_borrador_referencia_desactualizada__escritorio.png](capturas/03_propuestas/02_borrador_referencia_desactualizada__escritorio.png) · [02_borrador_referencia_desactualizada__movil.png](capturas/03_propuestas/02_borrador_referencia_desactualizada__movil.png) | `/colectivo/propuestas?campaign=<id>` | DIRECTIVA (Directiva DEMO) | referencia desactualizada | Borrador vigente con referencia histórica fijada; líneas «Desactualizada» sin diferencia |
| [03_detalle_calculo__escritorio.png](capturas/03_propuestas/03_detalle_calculo__escritorio.png) | `/colectivo/propuestas?campaign=<id>` | DIRECTIVA (Directiva DEMO) | detalle abierto | Detalle del cálculo de la referencia (ejecución, parámetros, historial del vínculo) |
| [04_historial_borradores__escritorio.png](capturas/03_propuestas/04_historial_borradores__escritorio.png) | `/colectivo/propuestas?campaign=<id>` | DIRECTIVA (Directiva DEMO) | detalle abierto | Historial y trazabilidad de borradores |
| [05_seleccion_para_convocatoria__escritorio.png](capturas/03_propuestas/05_seleccion_para_convocatoria__escritorio.png) | `/colectivo/propuestas?campaign=<id>` | DIRECTIVA (Directiva DEMO) | selección | Selección guardada de productos del borrador para llevar a una convocatoria |
| [06_borrador_generado__escritorio.png](capturas/03_propuestas/06_borrador_generado__escritorio.png) | `/colectivo/propuestas?campaign=<id>` | DIRECTIVA (Directiva DEMO) | borrador nuevo | Borrador nuevo generado con el botón explícito (entorno sintético) |
| [07_referencia_calculando__escritorio.png](capturas/03_propuestas/07_referencia_calculando__escritorio.png) | `/colectivo/propuestas?campaign=<id>` | DIRECTIVA (Directiva DEMO) | calculando | Borrador nuevo: se pidió la referencia histórica y se está calculando |
| [08_referencia_vinculada__escritorio.png](capturas/03_propuestas/08_referencia_vinculada__escritorio.png) · [08_referencia_vinculada__movil.png](capturas/03_propuestas/08_referencia_vinculada__movil.png) | `/colectivo/propuestas?campaign=<id>` | DIRECTIVA (Directiva DEMO) | referencia vigente | Borrador con la referencia histórica fijada recién calculada |

## 4. Exportación Excel (abierta en Microsoft Excel)

Archivos descargados desde la Web con «Descargar Excel» y abiertos en Microsoft Excel (sólo lectura). Se recortó la barra de título de Excel (mostraba la cuenta de Office del equipo). Las tres primeras capturas del borrador anterior (`05`–`07`) son de la revisión del 2026-11-12 (`d5dc9cc`), con el mismo código de exportación que esta composición.

| Archivo | Qué muestra |
|---|---|
| [01_borrador_portada__excel.png](capturas/04_excel/01_borrador_portada__excel.png) | Portada del Excel del borrador actual: campaña, borrador, referencia fijada, fechas |
| [02_borrador_necesidades__excel.png](capturas/04_excel/02_borrador_necesidades__excel.png) | Hoja «Necesidades» (filtro e inmovilizado) |
| [03_borrador_consumo_estimado__excel.png](capturas/04_excel/03_borrador_consumo_estimado__excel.png) | Hoja «Consumo estimado» de la referencia fijada (estados y vigencia) |
| [04_borrador_historial_referencia__excel.png](capturas/04_excel/04_borrador_historial_referencia__excel.png) | Hoja «Historial de la referencia» |
| [05_desactualizada_01__excel.png](capturas/04_excel/05_desactualizada_01__excel.png) | Borrador anterior con 7 líneas «Desactualizada»: portada con el aviso |
| [06_desactualizada_02__excel.png](capturas/04_excel/06_desactualizada_02__excel.png) | Borrador anterior: hoja «Necesidades» |
| [07_desactualizada_03__excel.png](capturas/04_excel/07_desactualizada_03__excel.png) | Borrador anterior: «Consumo estimado» con «Desactualizada» y sin diferencia |

## 5. Convocatorias: creación, apertura, cierre, cancelación y participantes

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_lista__escritorio.png](capturas/05_convocatorias/01_lista__escritorio.png) · [01_lista__movil.png](capturas/05_convocatorias/01_lista__movil.png) | `/colectivo/compras-conjuntas` | DIRECTIVA (Directiva DEMO) | — | Lista de convocatorias (varias, con nombres largos y todos los estados) |
| [02_abierta_responsable__escritorio.png](capturas/05_convocatorias/02_abierta_responsable__escritorio.png) · [02_abierta_responsable__movil.png](capturas/05_convocatorias/02_abierta_responsable__movil.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA (Directiva DEMO) | abierta | Convocatoria abierta vista por su responsable: productos, participantes según consentimiento, colaboradores e historial |
| [03_cerrada_consolidado__escritorio.png](capturas/05_convocatorias/03_cerrada_consolidado__escritorio.png) · [03_cerrada_consolidado__movil.png](capturas/05_convocatorias/03_cerrada_consolidado__movil.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA (Directiva DEMO) | cerrada | Convocatoria cerrada con consolidado (no es una compra) |
| [04_borrador_desde_propuesta__escritorio.png](capturas/05_convocatorias/04_borrador_desde_propuesta__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA (Directiva DEMO) | borrador | Borrador creado desde una propuesta (origen visible) |
| [05_abrir_confirmacion__escritorio.png](capturas/05_convocatorias/05_abrir_confirmacion__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA (Directiva DEMO) | diálogo | Confirmación para abrir la convocatoria (no se confirma) |
| [06_nueva_desde_catalogo__escritorio.png](capturas/05_convocatorias/06_nueva_desde_catalogo__escritorio.png) · [06_nueva_desde_catalogo__movil.png](capturas/05_convocatorias/06_nueva_desde_catalogo__movil.png) | `/colectivo/compras-conjuntas` | DIRECTIVA (Directiva DEMO) | formulario | Formulario de convocatoria nueva (desde el catálogo; no se crea) |
| [07_sin_permiso_participantes__escritorio.png](capturas/05_convocatorias/07_sin_permiso_participantes__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | ADMINISTRADOR (Administración DEMO) | sin permiso | Otra persona de la Directiva/Administración sin permiso de la responsable: no ve participantes |
| [08_cancelar_confirmacion__escritorio.png](capturas/05_convocatorias/08_cancelar_confirmacion__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | ADMINISTRADOR (Administración DEMO) | diálogo | Cancelar una convocatoria abierta: motivo y confirmación |
| [09_cancelada__escritorio.png](capturas/05_convocatorias/09_cancelada__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | ADMINISTRADOR (Administración DEMO) | cancelada | Convocatoria cancelada (operación hecha en el entorno sintético) |
| [10_nueva_desde_propuesta__escritorio.png](capturas/05_convocatorias/10_nueva_desde_propuesta__escritorio.png) · [10_nueva_desde_propuesta__movil.png](capturas/05_convocatorias/10_nueva_desde_propuesta__movil.png) | `/colectivo/compras-conjuntas?nueva=1&campana=<id>&propuesta=<id>&productos=<id>&campaign=<id>` | DIRECTIVA (Directiva DEMO) | formulario | Formulario de convocatoria precargado desde el borrador (no se crea) |

## 6. Permisos, delegaciones y sustitución de responsable (P-A)

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_responsable_inhabilitada__escritorio.png](capturas/06_permisos_psa/01_responsable_inhabilitada__escritorio.png) · [01_responsable_inhabilitada__movil.png](capturas/06_permisos_psa/01_responsable_inhabilitada__movil.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA (Directiva DEMO) | responsable inhabilitada | Responsable que ya no está habilitada: aviso, permisos suspendidos, sin Cerrar ni Cancelar; nombre largo |
| [02_sustituir_dialogo__escritorio.png](capturas/06_permisos_psa/02_sustituir_dialogo__escritorio.png) · [02_sustituir_dialogo__movil.png](capturas/06_permisos_psa/02_sustituir_dialogo__movil.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA (Directiva DEMO) | diálogo | Diálogo de sustitución: implicaciones, quien sustituye no figura (nota), motivo y confirmación (no se envía) |
| [03_sucesora_restringida__escritorio.png](capturas/06_permisos_psa/03_sucesora_restringida__escritorio.png) · [03_sucesora_restringida__movil.png](capturas/06_permisos_psa/03_sucesora_restringida__movil.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA, nueva responsable (Sucesora PA) | restringido | Nueva responsable: datos restringidos hasta que cada agricultor la autorice; permisos suspendidos por revisar |
| [04_revisar_permiso__escritorio.png](capturas/06_permisos_psa/04_revisar_permiso__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA, nueva responsable (Sucesora PA) | diálogo | Revisión de un permiso suspendido: confirmar (no se envía) |
| [05_sucesora_tras_autorizacion__escritorio.png](capturas/06_permisos_psa/05_sucesora_tras_autorizacion__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA, nueva responsable (Sucesora PA) | parcialmente restringido | Tras la revisión: un participante autorizó a la nueva responsable, otros pendientes; historial de permisos |
| [06_permiso_sustituir_sindicato__escritorio.png](capturas/06_permisos_psa/06_permiso_sustituir_sindicato__escritorio.png) · [06_permiso_sustituir_sindicato__movil.png](capturas/06_permisos_psa/06_permiso_sustituir_sindicato__movil.png) | `/colectivo/compras-conjuntas` | ADMINISTRADOR (Administración DEMO) | abierto | Permiso del sindicato «Sustituir responsable» (Administrador): titulares e historial |
| [07_conceder_permiso_dialogo__escritorio.png](capturas/06_permisos_psa/07_conceder_permiso_dialogo__escritorio.png) | `/colectivo/compras-conjuntas` | ADMINISTRADOR (Administración DEMO) | diálogo | Conceder el permiso a una persona concreta, con motivo (no se envía) |

## 7. Catálogo, equivalencias y productos por identificar

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_catalogo__escritorio.png](capturas/07_catalogo/01_catalogo__escritorio.png) · [01_catalogo__movil.png](capturas/07_catalogo/01_catalogo__movil.png) | `/colectivo/catalogo` | DIRECTIVA (Directiva DEMO) | — | Catálogo y equivalencias (vista inicial) |
| [02_equivalencias__escritorio.png](capturas/07_catalogo/02_equivalencias__escritorio.png) · [02_equivalencias__movil.png](capturas/07_catalogo/02_equivalencias__movil.png) | `/colectivo/catalogo?vista=equivalencias` | DIRECTIVA (Directiva DEMO) | — | Equivalencias |
| [03_productos__escritorio.png](capturas/07_catalogo/03_productos__escritorio.png) · [03_productos__movil.png](capturas/07_catalogo/03_productos__movil.png) | `/colectivo/catalogo?vista=productos` | DIRECTIVA (Directiva DEMO) | — | Productos del sindicato |
| [04_por_identificar__escritorio.png](capturas/07_catalogo/04_por_identificar__escritorio.png) · [04_por_identificar__movil.png](capturas/07_catalogo/04_por_identificar__movil.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | pendientes | Productos por identificar, con y sin foto, nombres largos |
| [05_ver_foto__escritorio.png](capturas/07_catalogo/05_ver_foto__escritorio.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | foto | Foto de etiqueta enviada por el agricultor (imagen sintética) |
| [06_vincular_dialogo__escritorio.png](capturas/07_catalogo/06_vincular_dialogo__escritorio.png) · [06_vincular_dialogo__movil.png](capturas/07_catalogo/06_vincular_dialogo__movil.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | diálogo | Identificar: vincular a un producto existente (candidatos, motivo, confirmación; no se envía) |
| [07_crear_producto_colectivo_dialogo__escritorio.png](capturas/07_catalogo/07_crear_producto_colectivo_dialogo__escritorio.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | diálogo | Identificar: crear producto colectivo y vincular (no se envía) |
| [08_dejar_pendiente_dialogo__escritorio.png](capturas/07_catalogo/08_dejar_pendiente_dialogo__escritorio.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | diálogo | Identificar: dejar pendiente con nota |
| [09_tras_dejar_pendiente_e_identificadas__escritorio.png](capturas/07_catalogo/09_tras_dejar_pendiente_e_identificadas__escritorio.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | pendiente con nota | Tras dejar una solicitud pendiente con nota (operación en el entorno sintético); identificadas desplegadas |
| [10_nuevo_producto_dialogo__escritorio.png](capturas/07_catalogo/10_nuevo_producto_dialogo__escritorio.png) | `/colectivo/catalogo?vista=productos` | DIRECTIVA (Directiva DEMO) | diálogo | Nuevo producto del catálogo (no se crea) |
| [11_asociar_dialogo__escritorio.png](capturas/07_catalogo/11_asociar_dialogo__escritorio.png) | `/colectivo/catalogo?vista=equivalencias` | DIRECTIVA (Directiva DEMO) | diálogo | Asociar un producto a uno del catálogo (equivalencia; no se envía) |

## 8. Histórico y estimaciones

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_historico_tendencias__escritorio.png](capturas/08_historico/01_historico_tendencias__escritorio.png) · [01_historico_tendencias__movil.png](capturas/08_historico/01_historico_tendencias__movil.png) | `/colectivo/historico` | DIRECTIVA (Directiva DEMO) | — | Histórico y estimaciones: tendencias selladas |
| [02_estimacion__escritorio.png](capturas/08_historico/02_estimacion__escritorio.png) · [02_estimacion__movil.png](capturas/08_historico/02_estimacion__movil.png) | `/login` | DIRECTIVA (Directiva DEMO) | — | Histórico y estimaciones: estimación del consumo |
| [03_tendencias_fuentes__escritorio.png](capturas/08_historico/03_tendencias_fuentes__escritorio.png) | `/colectivo/historico?vista=tendencias` | DIRECTIVA (Directiva DEMO) | detalle abierto | Tendencias con «Ver campañas y cobertura» desplegado |
| [04_estimacion_ejecuciones__escritorio.png](capturas/08_historico/04_estimacion_ejecuciones__escritorio.png) | `/colectivo/historico?vista=estimacion` | DIRECTIVA (Directiva DEMO) | detalle abierto | Estimación del consumo con ejecuciones anteriores desplegadas |
| [05_copia_sin_conexion__escritorio.png](capturas/08_historico/05_copia_sin_conexion__escritorio.png) · [05_copia_sin_conexion__movil.png](capturas/08_historico/05_copia_sin_conexion__movil.png) | `/estimacion/copia-sin-conexion` | DIRECTIVA (Directiva DEMO) | copia | Copia descargada de la estimación, legible sin conexión (fuera del menú) |

## 9. Campañas

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_campanas__escritorio.png](capturas/09_campanas/01_campanas__escritorio.png) · [01_campanas__movil.png](capturas/09_campanas/01_campanas__movil.png) | `/campaigns` | DIRECTIVA (Directiva DEMO) | — | Campañas |
| [02_detalle_campana_abierta__escritorio.png](capturas/09_campanas/02_detalle_campana_abierta__escritorio.png) · [02_detalle_campana_abierta__movil.png](capturas/09_campanas/02_detalle_campana_abierta__movil.png) | `/campaigns/<id>` | DIRECTIVA (Directiva DEMO) | abierta | Detalle de la campaña activa (abierta): datos, sellado, borradores |
| [03_detalle_campana_cerrada__escritorio.png](capturas/09_campanas/03_detalle_campana_cerrada__escritorio.png) | `/campaigns/<id>` | DIRECTIVA (Directiva DEMO) | cerrada | Detalle de una campaña cerrada |
| [04_nueva_campana_dialogo__escritorio.png](capturas/09_campanas/04_nueva_campana_dialogo__escritorio.png) | `/campaigns` | DIRECTIVA (Directiva DEMO) | diálogo | Nueva campaña (no se crea) |

## 10. Administración, auditoría y pantallas fuera del menú

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_bitacora_directiva__escritorio.png](capturas/10_administracion/01_bitacora_directiva__escritorio.png) · [01_bitacora_directiva__movil.png](capturas/10_administracion/01_bitacora_directiva__movil.png) | `/audit-logs` | DIRECTIVA (Directiva DEMO) | — | Bitácora (Directiva) |
| [02_usuarios_directiva_redirige__escritorio.png](capturas/10_administracion/02_usuarios_directiva_redirige__escritorio.png) | `/colectivo/resumen` | DIRECTIVA (Directiva DEMO) | sin permiso | La Directiva no entra a Usuarios: vuelve a su inicio |
| [03_usuarios__escritorio.png](capturas/10_administracion/03_usuarios__escritorio.png) · [03_usuarios__movil.png](capturas/10_administracion/03_usuarios__movil.png) | `/users` | ADMINISTRADOR (Administración DEMO) | — | Usuarios (sólo Administrador) |
| [04_bitacora_detalle__escritorio.png](capturas/10_administracion/04_bitacora_detalle__escritorio.png) | `/audit-logs` | DIRECTIVA (Directiva DEMO) | diálogo | Detalle de un registro de la bitácora |
| [05_nuevo_usuario_dialogo__escritorio.png](capturas/10_administracion/05_nuevo_usuario_dialogo__escritorio.png) | `/users` | ADMINISTRADOR (Administración DEMO) | diálogo | Nuevo usuario (sólo Administrador; no se crea, sin contraseña escrita) |
| [06_calendario_fuera_del_menu__escritorio.png](capturas/10_administracion/06_calendario_fuera_del_menu__escritorio.png) | `/calendar` | DIRECTIVA (Directiva DEMO) | heredada | Calendario operativo (pantalla heredada, fuera del menú colectivo; se llega por URL) |

## 99. Estados NO reales: fixtures del código y respuestas simuladas

**No son capturas del entorno real.** `__FIXTURE`: página real montada por las páginas de desarrollo del código (`src/dev/resumen-prototipos.html?v=1`, `src/dev/break-ui.html`) con datos fijos y sin API; la barra inferior «Actual · Panorama…» es del arnés. `__SIMULADO`: Web y sesión reales, con una respuesta de la API sustituida por el guion (error 500/503 o lista vacía).

| Archivo(s) | Ruta | Rol | Estado | Qué muestra |
|---|---|---|---|---|
| [01_resumen_cargando__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_cargando__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=cargando&campaign=<id>` | Sin sesión | cargando | Resumen real montado con el fixture «cargando» (src/dev/resumen-prototipos.html, sin API) |
| [01_resumen_cerrada__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_cerrada__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=cerrada&campaign=<id>` | Sin sesión | cerrada | Resumen real montado con el fixture «cerrada» (src/dev/resumen-prototipos.html, sin API) |
| [01_resumen_error__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_error__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=error&campaign=<id>` | Sin sesión | error | Resumen real montado con el fixture «error» (src/dev/resumen-prototipos.html, sin API) |
| [01_resumen_politica__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_politica__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=politica&campaign=<id>` | Sin sesión | politica | Resumen real montado con el fixture «politica» (src/dev/resumen-prototipos.html, sin API) |
| [01_resumen_sellada__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_sellada__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=sellada&campaign=<id>` | Sin sesión | sellada | Resumen real montado con el fixture «sellada» (src/dev/resumen-prototipos.html, sin API) |
| [01_resumen_sincampanas__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_sincampanas__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=sincampanas` | Sin sesión | sincampanas | Resumen real montado con el fixture «sincampanas» (src/dev/resumen-prototipos.html, sin API) |
| [01_resumen_sinpermiso__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_sinpermiso__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=sinpermiso&campaign=<id>` | Sin sesión | sinpermiso | Resumen real montado con el fixture «sinpermiso» (src/dev/resumen-prototipos.html, sin API) |
| [01_resumen_vacia__FIXTURE__escritorio.png](capturas/99_simulados/01_resumen_vacia__FIXTURE__escritorio.png) | `/src/dev/resumen-prototipos.html?v=1&datos=vacia&campaign=<id>` | Sin sesión | vacia | Resumen real montado con el fixture «vacia» (src/dev/resumen-prototipos.html, sin API) |
| [02_propuestas_peor_caso__FIXTURE__escritorio.png](capturas/99_simulados/02_propuestas_peor_caso__FIXTURE__escritorio.png) · [02_propuestas_peor_caso__FIXTURE__movil.png](capturas/99_simulados/02_propuestas_peor_caso__FIXTURE__movil.png) | `/src/dev/break-ui.html?datos=worst&pantalla=propuestas` | Sin sesión | peor caso | Necesidades y propuestas con el fixture «worst» (nombres largos, estados extremos; src/dev/break-ui.html) |
| [03_propuestas_vacia__FIXTURE__escritorio.png](capturas/99_simulados/03_propuestas_vacia__FIXTURE__escritorio.png) | `/src/dev/break-ui.html?datos=empty&pantalla=propuestas` | Sin sesión | vacío | Necesidades y propuestas sin datos (fixture «empty») |
| [04_historico_peor_caso__FIXTURE__escritorio.png](capturas/99_simulados/04_historico_peor_caso__FIXTURE__escritorio.png) | `/src/dev/break-ui.html?datos=worst&pantalla=historico` | Sin sesión | peor caso | Histórico con el fixture «worst» |
| [05_catalogo_peor_caso__FIXTURE__escritorio.png](capturas/99_simulados/05_catalogo_peor_caso__FIXTURE__escritorio.png) | `/src/dev/break-ui.html?datos=worst&pantalla=catalogo` | Sin sesión | peor caso | Catálogo con el fixture «worst» (muchos productos, nombres largos) |
| [06_convocatorias_error__SIMULADO__escritorio.png](capturas/99_simulados/06_convocatorias_error__SIMULADO__escritorio.png) | `/colectivo/compras-conjuntas` | DIRECTIVA (Directiva DEMO) | error | Lista de convocatorias cuando la API responde 500 (respuesta simulada) |
| [07b_convocatoria_error_503__SIMULADO__escritorio.png](capturas/99_simulados/07b_convocatoria_error_503__SIMULADO__escritorio.png) | `/colectivo/compras-conjuntas/<id>` | DIRECTIVA (Directiva DEMO) | error | Detalle de convocatoria cuando la API responde 503 tras la espera (respuesta simulada) |
| [08_por_identificar_error__SIMULADO__escritorio.png](capturas/99_simulados/08_por_identificar_error__SIMULADO__escritorio.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | error | Por identificar cuando la API responde 500 (respuesta simulada) |
| [09_por_identificar_vacio__SIMULADO__escritorio.png](capturas/99_simulados/09_por_identificar_vacio__SIMULADO__escritorio.png) | `/colectivo/catalogo?vista=identificacion` | DIRECTIVA (Directiva DEMO) | vacío | Por identificar sin solicitudes (respuesta simulada: lista vacía) |
