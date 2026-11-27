# Carga de datos de presentación de Agrocuentas

`valle-claro-v1` contiene identidades, cantidades y autorizaciones ficticias, creadas para mostrar los flujos de la aplicación. El dominio de los correos es `valle-claro.example.invalid`. Los registros carecen de valor como evidencia empírica o aprobación institucional. El manifiesto interno `PresentationInstallation` guarda el conjunto, la instalación, la base, el sindicato, la fecha de referencia y las cantidades comprobadas por campaña. El reporte de la CLI refleja la carga inicial.

## Preparar, planificar y aplicar

1. En PostgreSQL aislado, crear una base vacía dedicada con nombre `agrocuentas_presentacion_*` y esquema `public`. Mantener la aplicación detenida durante la primera carga. En la imagen final del Backend, asignar a `DATABASE_URL` la conexión a esa base y ejecutar `npm run db:deploy`.
2. En el proceso de carga, asignar a `PRESENTATION_DATABASE_URL` la conexión autorizada a esa misma base. El cargador usa esta variable y comprueba tanto su ruta como la identidad devuelta por PostgreSQL. Configurar `SYNC_V1_FINGERPRINT_KEY`, `SYNC_V1_FINGERPRINT_KEY_VERSION` y `SYNC_V1_PRODUCTION_ADMISSION=enabled` con los valores del servicio. Mantener el archivo de variables fuera del repositorio.
3. Elegir un ID para la instalación, el slug del sindicato y la fecha local actual en formato `YYYY-MM-DD`. El ejemplo usa una variable de fecha para que sus plazos sigan vigentes al ejecutar el comando. Si se usa la fecha de una carga anterior, conservarla en cualquier verificación posterior de esa instalación.

```sh
FECHA_REFERENCIA="$(date +%F)"
npm run presentation:load -- --installation valle-local --database agrocuentas_presentacion_valle --tenant valle-claro --reference "$FECHA_REFERENCIA"
```

4. Revisar el plan. La transacción de planificación es de solo lectura. Si hay datos ajenos o el manifiesto corresponde a otra selección, el comando se detiene. Con el plan revisado, obtener y verificar un respaldo privado previo a la carga. Preparar un directorio de credenciales fuera del repositorio al que solo tenga acceso el operador. Si se ejecuta en Docker, montar ese directorio como `/private` con permiso de escritura para el proceso. En Windows, restringir la ACL del directorio privado.
5. Repetir con `--apply` y la ruta absoluta de un archivo nuevo. Para Docker, añadir el comando siguiente a `docker run --rm --network RED_DE_LA_BASE --env-file ARCHIVO_PRIVADO --mount type=bind,source=DIRECTORIO_PRIVADO,target=/private IMAGEN`. Sustituir cada marcador por la configuración local. Para ejecutar directamente desde `Back`, instalar con `npm ci`, generar Prisma, compilar y sustituir `/private` por el directorio privado del equipo.

```sh
npm run presentation:load -- --installation valle-local --database agrocuentas_presentacion_valle --tenant valle-claro --reference "$FECHA_REFERENCIA" --apply --credentials /private/valle-claro.presentation-credentials.json
```

6. Guardar el archivo de acceso en el gestor autorizado. Cada cuenta tiene una contraseña aleatoria independiente con hash bcrypt. La consola emite el manifiesto técnico y las cantidades. Una segunda ejecución con los mismos parámetros informa `already_loaded` y conserva las modificaciones y credenciales existentes. Arrancar el servicio y esperar a que el trabajador procese el trabajo de Estimación.

## Procedencia y verificaciones

- Prisma inserta el sindicato, las identidades, el catálogo y las sesiones técnicas necesarias para enviar Sync v1. Estas sesiones se revocan durante la carga. Las proyecciones, revocaciones, convocatorias, participaciones y cierres pasan por los servicios de aplicación dentro de la transacción. Los eventos registran la hora efectiva de importación y a los actores ficticios. Las fechas del escenario pertenecen a los períodos, temporadas y plazos. La carga carece de integraciones de notificación.
- Las cinco campañas empiezan en la misma época del año, duran 90 días y comparten una temporada. La cuarta campaña histórica complementa las fuentes de estimación. Las celdas de productos comparables se derivan de cantidades publicadas en `ML` o `G`. El histórico usa el sellado vigente y aplica el retiro posterior. Las celdas con cobertura insuficiente conservan la clasificación del algoritmo.
- En Web usar Administración para ver el detalle permitido de la convocatoria abierta. Entrar después como Directiva para revisar el agregado. En Resumen y Cobertura elegir la campaña abierta. En Necesidades y borradores generar un borrador a partir de las necesidades registradas. En Histórico seleccionar producto y exportar Excel. En el panel Estimación verificar las fuentes de Ciclo agrícola y los resultados con cobertura suficiente.
- Para Mobile reservar `irene.robles@valle-claro.example.invalid` y arrancar una instalación nueva y vacía. La cuenta carece de aportes y participaciones previas. El cargador solo genera registros de los contratos centrales. En el teléfono se pueden crear las compras, el inventario y las aplicaciones privadas durante el recorrido.

## Respaldo y recuperación

1. Antes de aplicar, crear un respaldo desde un cliente PostgreSQL compatible, por ejemplo `pg_dump --format=custom --file=/ruta/privada/antes.dump`. Configurar la conexión mediante un perfil seguro o variables privadas de libpq. Verificar el archivo con `pg_restore --list /ruta/privada/antes.dump`. Guardar PostgreSQL y los archivos privados por separado.
2. Si falla la carga, volver a ejecutar el plan con los mismos parámetros. Si devuelve `already_loaded`, la transacción quedó confirmada. Conservar el archivo privado de esa ejecución. Si devuelve `plan`, la base está vacía. El archivo puede haberse creado antes de un fallo de confirmación. Mantenerlo privado y usar una ruta nueva al reintentar.
3. Para recuperar el respaldo, restaurarlo primero en otra base PostgreSQL dedicada y vacía, por ejemplo con `pg_restore --exit-on-error --single-transaction --dbname=NUEVA_BASE /ruta/privada/antes.dump`. Comparar cuentas, campañas y manifiesto antes de redirigir la conexión del servicio. Para reanudar una instalación que ya se había cargado, conservar el nombre original de la base en el servidor restaurado junto con su archivo de credenciales y claves del servicio. Mantener la base original como respaldo hasta verificar el nuevo servicio.

Consultar [las cantidades y verificaciones de la carga local](VALIDACION_PRESENTACION_LOCAL.md).
