# Almacenamiento privado de Agrocuentas en Backblaze B2

El Backend usa dos instancias del mismo adaptador S3, una para respaldos F08 y otra para fotos de identificación E1. Ambas comparten bucket y credencial. Cada una tiene su propio prefijo. La Web y Mobile acceden mediante la API de Agrocuentas, con los controles de roles, sindicato y titularidad del Backend.

## Bucket y clave

1. Usar el bucket privado de la instalación. En Backblaze, comprobar **Private**, cifrado predeterminado SSE-B2 y **Keep all versions**. Revisar que los prefijos de Agrocuentas no estén alcanzados por reglas que oculten o expiren objetos activos. El adaptador confirma, enumera y purga por versión. Verificar en el panel que Object Lock, retención obligatoria y legal holds permitan esas eliminaciones. La operación normal del adaptador no requiere habilitar Object Lock ni modificar reglas globales. [Lifecycle de B2](https://www.backblaze.com/docs/cloud-storage-lifecycle-rules) · [Consulta de Object Lock](https://www.backblaze.com/docs/cloud-storage-enable-object-lock-with-the-native-api)
2. Crear una **Application Key** limitada a ese único bucket con `listFiles`, `readFiles`, `writeFiles` y `deleteFiles`. Configurar un prefijo de clave común a las dos ramas, por ejemplo `valle-claro-`. Usar `valle-claro-respaldos/` y `valle-claro-fotos/` en el Backend. Las variables de este código aceptan un solo segmento en minúsculas, números y guiones, terminado en `/`. La restricción B2 es por inicio del nombre y el prefijo común de la clave termina en guion. [Claves de aplicación](https://www.backblaze.com/docs/cloud-storage-application-keys)
3. Guardar el par `keyID` y `applicationKey` en el mecanismo privado autorizado. La aplicación usa `listFiles` para listar objetos, versiones y multipart pendientes, `readFiles` para HEAD/GET y para leer el origen de una copia, `writeFiles` para carga, copia, inicio, partes, finalización y cancelación multipart, y `deleteFiles` para borrar versiones concretas. La clave de ejecución puede prescindir de permisos para administrar buckets, reglas, retenciones, otras claves o listar todos los nombres de bucket. La revisión del bucket se hace con el panel u otra identidad de inspección. [Tabla de capacidades S3](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys)

## Variables del servicio Backend en Railway

Al desplegar, abrir **Variables** del servicio Backend con raíz `/Back` y añadir las siguientes. Guardar los dos valores del par de la clave como secretos del servicio.

| Variable | Configuración |
|---|---|
| `BACKUP_STORAGE_PROVIDER` | `b2` |
| `PRODUCT_PHOTO_STORAGE_PROVIDER` | `b2` |
| `BACKUP_S3_ENDPOINT` | Origen oficial S3 del bucket, `https://s3.REGION.backblazeb2.com`, sin ruta |
| `BACKUP_S3_REGION` | La región exacta de ese endpoint |
| `BACKUP_S3_BUCKET` | Nombre exacto del bucket privado |
| `BACKUP_S3_ACCESS_KEY_ID` | `keyID` de la nueva clave de esta instalación |
| `BACKUP_S3_SECRET_ACCESS_KEY` | `applicationKey` correspondiente |
| `BACKUP_S3_PREFIX` | `valle-claro-respaldos/`, o el prefijo de respaldos aprobado |
| `PRODUCT_PHOTO_S3_PREFIX` | `valle-claro-fotos/`, o el prefijo de fotos aprobado |
| `BACKUP_PRODUCTION_ADMISSION` | `enabled` cuando corresponda habilitar respaldos de la instalación |
| `BACKUP_REQUIRE_CLIENT_ENCRYPTION` | `true` |
| `PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK` | Opcional. 90 días por defecto, contados desde la última vinculación |
| `PRODUCT_PHOTO_SWEEP_INTERVAL_MS` | Opcional. Frecuencia del barrido entre 60000 y 604800000 ms. Con valor vacío, ejecutar `npm run product-photos:sweep` para la instalación correspondiente |
| `BACKUP_MAX_BYTES`, `BACKUP_MAX_ACTIVE_PER_MEMBER`, `BACKUP_UPLOAD_DEADLINE_MS` | Opcionales. Valores por defecto de 100 MiB, cinco respaldos activos y 30 minutos de plazo de transferencia |

Colocar las variables `BACKUP_S3_*` solo en el Backend. Con proveedor `b2`, completar la configuración del proveedor es obligatorio aunque existan directorios de disco. Los logs de configuración indican los nombres de las variables faltantes. Las rutas de almacenamiento responden `BACKUP_STORAGE_UNAVAILABLE` o `PHOTO_STORAGE_UNAVAILABLE` con HTTP 503 si falta el proveedor. La compuerta de respaldo exige habilitación expresa en producción.

Mobile cifra el archivo antes del envío con ChaCha20-Poly1305 y una clave por archivo derivada con HKDF. El servidor valida el formato externo, tamaño y SHA-256 y el adaptador almacena el sobre. SSE-B2 protege el objeto en el proveedor. En fotos, el Backend rechaza metadatos de imagen prohibidos, entrega el binario a Directiva o Administración del sindicato autorizado y retira la versión anterior al reemplazarlo. El barrido de E1 conserva las fotos pendientes, limpia huérfanos y staging antiguo y elimina las fotos vinculadas una vez vencido el plazo de conservación. [Configuración general de Railway y Vercel](PREPARACION_RAILWAY_VERCEL.md)

## Ensayo acotado desde Windows

Los prefijos de la comprobación inicial son `ensayo-valle-20261126a-respaldos/` y `ensayo-valle-20261126a-fotos/`. En cada ensayo posterior elegir una fecha y un sufijo nuevos. Usar una clave temporal con las cuatro capacidades y el prefijo común exacto `ensayo-valle-<ID>-`. El asistente privado del proyecto permite crearla desde una sesión autorizada y guardarla mediante DPAPI.

```powershell
# Desde la raíz del worktree de preparación
$helpers = Resolve-Path '..\tools\secretos-b2'
& "$helpers\crear_clave_final_rw.ps1" -Prefijo ensayo-valle-20261126a-
```

El asistente usa una credencial autorizada para crear claves. Introducirla únicamente en su entrada oculta. La clave nueva se guarda como `final-rw.clixml` en `%LOCALAPPDATA%\Agrocuentas\secretos`. Si ese nombre ya existe, usar otro archivo DPAPI, con el mismo formato, y seleccionarlo con `-Ruta`. Para el ensayo preparar un servidor PostgreSQL desechable con acceso por `127.0.0.1`. Cargar su URL administrativa, terminada en `/postgres`, en `B2_PRESENTATION_LOCAL_PG_URL` desde el almacén local privado.

```powershell
# Con Node 22 y las dependencias de Back instaladas, desde la raíz del worktree
$helpers = Resolve-Path '..\tools\secretos-b2'
$keyFile = Join-Path $env:LOCALAPPDATA 'Agrocuentas\secretos\final-rw.clixml'
$env:B2_PRESENTATION_RUN = '20261126a'
Push-Location Back
try {
  powershell -NoProfile -File "$helpers\con_b2.ps1" -Ruta $keyFile node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/modules/backups/b2-presentation.postgres.spec.ts
} finally {
  Pop-Location
  Remove-Item Env:B2_PRESENTATION_RUN
}
```

La suite valida alcance de la clave e inventarios vacíos antes de iniciar PostgreSQL. Arranca Nest con ambas instancias B2, una base nueva y cuentas ficticias. Comprueba subida cifrada multipart, rechazo de formato sin cifrar, confirmación, listado, tamaño, SHA-256, permisos, borrado por API, cancelación de staging, fotos con y sin metadatos prohibidos, descarga, reemplazo y retiro. La limpieza usa los identificadores creados por la prueba y comprueba versiones, marcadores y multipart dentro de cada prefijo. La base creada para la ejecución se elimina al finalizar.

Si quedan residuos, conservar el informe y los identificadores de objeto bajo esos prefijos. Repetir primero las inspecciones `node tool/f08_b2/s3_inspect.cjs versions` y `node tool/f08_b2/s3_inspect.cjs uploads` con `BACKUP_S3_PREFIX` puesto en el prefijo afectado y la credencial correspondiente inyectada con `con_b2.ps1`. Un operador autorizado puede eliminar las versiones concretas o cancelar los multipart confirmados del ensayo usando esos identificadores. Un 401 en `b2_authorize_account` ocurre antes de cualquier llamada al bucket. Si el 401 o 403 aparece al listar, copiar, descargar o borrar, revisar la operación concreta, la restricción del prefijo, las capacidades y la retención en B2 antes de reintentar.

## Rotación

Crear un par nuevo con el mismo bucket, prefijo común y capacidades de datos. Probar los permisos con una credencial temporal separada y objetos de ensayo. Sustituir juntos `BACKUP_S3_ACCESS_KEY_ID` y `BACKUP_S3_SECRET_ACCESS_KEY` en las variables del Backend cuando se autorice el despliegue. Mantener los prefijos de datos durante la rotación. Verificar ambas rutas y las transferencias pendientes tras activar el cambio. Conservar el par anterior en el gestor privado durante la comprobación y revocarlo cuando el servicio y los trabajos de limpieza usen el nuevo par. Si la comprobación falla, restaurar el par anterior mientras siga vigente.

## Resultado comprobado el 26 de noviembre de 2026

| Comprobación | Observación |
|---|---|
| B2 real, metadatos | Bucket privado, endpoint y región coherentes, SSE-B2 predeterminado y cero reglas de ciclo de vida. El estado de Object Lock quedó pendiente de confirmar en el panel porque la credencial de inspección carece de `readBucketRetentions`. |
| B2 real, prefijos de ensayo | `ListObjectVersions` y `ListMultipartUploads` devolvieron cero versiones, marcadores y cargas pendientes en ambos prefijos. |
| Clave temporal histórica | `b2_authorize_account` devolvió HTTP 401 `unauthorized`. El archivo privado registra una fecha de caducidad que ya pasó. |
| Clave de inspección | La autorización funciona y está acotada al bucket. Carece de restricción de prefijo, tiene capacidades administrativas y carece de `writeKeys`. El preflight del ensayo la rechazó antes de iniciar PostgreSQL o escribir en B2. |
| Configuración local | `%LOCALAPPDATA%\Agrocuentas\presentacion-valle\b2-configuracion-local.env` contiene los nombres y parámetros del ensayo, con la credencial pendiente de inyección desde DPAPI. Se conserva el archivo de arranque de la presentación. |
| Validación local | 189 pruebas pasaron en seis suites, con PostgreSQL aislado donde correspondía. Incluyen selección de proveedor, cifrado de respaldos, autorización, tratamiento de metadatos, reemplazo y barrido de fotos. |
| Escrituras en B2 real | Pendientes de una clave vigente con el prefijo y capacidades del ensayo. Subida, descarga, integridad, eliminación y cancelación reales quedan sin verificar. El trabajo de inspección fue de solo lectura. |
