# Limitaciones de este material

## Qué cubre y qué no

- **Web de la Directiva y del Administrador.** Las vistas del agricultor se retiraron del código (`741e730`); no hay nada que capturar de ellas. El aviso para una cuenta AGRICULTOR se capturó con la rama limpia (Vite en 5176).
- **Servidor de desarrollo.** La Web se capturó con Vite en modo desarrollo, no con un build de producción. El código es el mismo, pero no se midieron tiempos ni el comportamiento del service worker.
- **Ancho móvil.** Las capturas «móvil» se hicieron a 390 px en Edge de escritorio, no en un teléfono. Las primeras se tomaron con la emulación táctil de Puppeteer y las rehechas sólo con el ancho. El diseño de la Web depende del ancho.
- **Estados no reproducibles con el entorno real.** Están en `capturas/99_simulados/` y rotulados:
  - `__FIXTURE`: páginas de desarrollo del propio código, con datos fijos y sin API. Cubren los estados del Resumen (carga, error, sin permiso, sin campañas, política pendiente, vacío, campaña cerrada, versión sellada) y el peor caso de Propuestas, Histórico y Catálogo.
  - `__SIMULADO`: Web real con una respuesta sustituida (error de la lista de convocatorias, detalle con 503, Por identificar con error y vacío).
  - En la captura `99_simulados/07b`, el retraso no llegó a mostrar el estado de carga: se vio directamente el error. No hay captura del estado «Cargando…» del detalle de convocatoria.
- **Estados que no se capturaron:**
  - **Sellado de una versión:** necesita una campaña cerrada sin sellar y el sellado activado en el servidor. Sólo aparece la línea «todavía no se puede sellar».
  - **«Sin personas disponibles» en la sustitución:** el sindicato de prueba tiene varias personas elegibles. El texto está en el contrato y en las pruebas.
  - **Pérdida de un permiso mientras la página está abierta**, cierre manual de una convocatoria abierta y su consolidado recién hecho. Hay un consolidado de una convocatoria ya cerrada en `05_convocatorias/03`.
  - **Referencia histórica «Restringida» o «no se completó»:** el peor caso del fixture de Propuestas muestra estados extremos, pero no se comprobó uno por uno.
  - **Foto retirada o con error** en Por identificar.
- **Excel.** Se abrió en Microsoft Excel el del borrador actual, recién descargado. Los del Resumen, el Histórico y la Estimación no se abrieron en esta preparación. Las capturas `04_excel/05`–`07` (borrador con cifras desactualizadas) son de la revisión del 2026-11-12 sobre `d5dc9cc`, que tiene el mismo código de exportación.
- **Accesibilidad y rendimiento.** No se midieron (contraste, lector de pantalla, tiempos). Sólo se registró lo evidente en las capturas.

## Datos

- **Origen:** los datos son sintéticos, de un entorno aislado que lleva varios días de recorridos.
- **Nombres de prueba:** algunos nombres de convocatorias delatan pruebas anteriores («P-A concurrencia», «CONV-1 a CONV-2»).
- **Estados creados para esta preparación:** se crearon a propósito algunos estados (ver README, «Operaciones hechas»). Las cifras no representan a un sindicato real.
- **Cuentas:** los correos visibles son de `example.test`. Las contraseñas de las cuentas sintéticas se cambiaron por claves de un solo uso que no se guardaron.

## Proceso

- **Rondas de captura fallidas:** las primeras rondas perdieron la sesión por el límite de autenticación del entorno. Las capturas que mostraban la pantalla de inicio de sesión se borraron y se rehicieron, y un detector comprobó que no queda ninguna.
- **Inventario a partir del código:** el inventario de vistas se redactó leyendo el código. Las capturas lo confirman en lo principal. Lo marcado «(no verificado)» sigue sin comprobar. El Calendario se retiró de la Web; su captura se conserva sólo como evidencia histórica, fuera del paquete.
- **Diagnóstico:** señala problemas, pero no propone ni aplica correcciones.
