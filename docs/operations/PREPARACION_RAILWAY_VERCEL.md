# Preparación de Agrocuentas para Railway y Vercel

Partir del mismo commit de Backend/Web para los dos servicios. Esta guía se verificó en un entorno local aislado. Los orígenes de ejemplo son marcadores reservados.

## Railway

1. Crear un servicio de PostgreSQL privado para esta instalación. Crear una base dedicada, por ejemplo `agrocuentas_presentacion_valle`, y un usuario que pueda migrar ese esquema. Usar conexión privada desde la misma red de Railway. Mantener restringido el acceso al servicio y a sus variables.
2. Crear un servicio Backend con raíz `/Back`. Railway detecta el `Dockerfile` de esa raíz. El Dockerfile fija la imagen Node, usa `npm ci`, genera Prisma, compila y conserva el CLI de Prisma y las migraciones en la imagen final.
3. Configurar las variables de la tabla siguiente. En **Settings → Deploy** poner **Pre-deploy Command** en `npm run db:deploy`, con un límite de 300 segundos como punto de partida. Ese comando ejecuta `prisma migrate deploy` en la imagen final y bloquea el inicio si falla. El arranque usa el CMD de la imagen, `node dist/main.js`, o `npm run start:prod` si se necesita indicar un comando. El servidor escucha en `0.0.0.0:$PORT`. Configurar **Healthcheck Path** como `/api/v1/health`.
4. Reservar el origen HTTPS público del Backend y el origen de la Web. Configurar CORS con los orígenes HTTPS concretos. Comprobar la salud con el host público y usar una consulta institucional autenticada para verificar PostgreSQL. El endpoint de salud solo responde por el proceso HTTP. La inicialización de Prisma y la activación registrada de la política ocurren antes de escuchar.
5. Mantener los dos trabajadores dentro del servicio. La estimación procesa trabajos de la cola PostgreSQL. El otro finaliza convocatorias vencidas con el límite registrado. Tras la carga, confirmar el estado del trabajo de estimación y la traza del cierre automático. Para volúmenes empezar con una réplica. Los comandos de predespliegue se ejecutan sin el volumen montado.

Referencias operativas [Dockerfiles de Railway](https://docs.railway.com/builds/dockerfiles), [pre-deploy](https://docs.railway.com/deployments/pre-deploy-command), [PostgreSQL](https://docs.railway.com/databases/postgresql), [volúmenes](https://docs.railway.com/volumes). La guía define los valores del panel para evitar depender del formato heredado de configuración de Railway.

### Variables del servicio Backend

| Variable | Valor o procedencia | Secreta |
|---|---|---|
| `NODE_ENV` | `production`, indicado en el Dockerfile | No |
| `PORT` | Puerto asignado por Railway, tomado al arrancar | No |
| `DATABASE_URL` | URL privada de PostgreSQL, con la base explícita de esta instalación y esquema `public`. Una referencia como `${{Postgres.DATABASE_URL}}` sirve si apunta exactamente a esa base | Sí |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Dos secretos aleatorios independientes. Usar al menos 32 bytes aleatorios por valor | Sí |
| `COOKIE_SECURE` | `true`, obligatorio para arrancar en producción | No |
| `CORS_ORIGIN` | Origen HTTPS de Vercel, por ejemplo `https://agrocuentas-web.example.invalid`. Lista de orígenes exactos separados por comas para entornos autorizados, sin ruta ni barra final | No |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Opcionales. Valores por defecto `15m` y `7d`. Una cantidad entera positiva seguida de `s`, `m`, `h` o `d` | No |
| `SYNC_V1_FINGERPRINT_KEY` | Requerida para Sync v1 y para la carga. Base64 estándar de al menos 32 bytes aleatorios | Sí |
| `SYNC_V1_FINGERPRINT_KEY_VERSION` | Entero positivo. Empezar en `1` y aumentar al rotar | No |
| `SYNC_V1_FINGERPRINT_PREVIOUS_KEYS` | Opcional. Versiones conservadas para los reenvíos, con formato `versión=base64,versión=base64`. Mantener las claves mientras puedan reaparecer operaciones de esas versiones | Sí |
| `SYNC_V1_PRODUCTION_ADMISSION` | `enabled` para la instalación de presentación autorizada. Se requiere junto con la clave y la versión. Deshabilitado, el servidor rechaza las escrituras Sync v1 | No |
| `LEGACY_PRIVATE_WRITES_ROLLBACK` | Mantener `disabled` o ausente | No |
| `ESTIMATION_WORKER`, `ESTIMATION_WORKER_INTERVAL_MS` | Habilitado por defecto, intervalo de 5000 ms. `ESTIMATION_WORKER=enabled` lo hace explícito. Ajustar el intervalo solo cuando haga falta | No |
| `ESTIMATION_LEASE_MS`, `ESTIMATION_MAX_PRODUCTS`, `ESTIMATION_MAX_ATTEMPTS` | Parámetros opcionales del trabajador. Consultar los valores y rangos en `estimation-config.ts` y `env.schema.ts` | No |
| `JOINT_PURCHASE_CLOSE_INTERVAL_MS` | 60000 ms por defecto. Un valor positivo mantiene el trabajador habilitado. `0` y `disabled` lo apagan | No |

Generar los dos secretos JWT y la clave Sync v1 en un gestor de contraseñas o una terminal privada. Ejecutar el comando una vez por cada valor.

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64')"
```

Guardar los valores en Railway y en el gestor autorizado, con acceso restringido. Mantenerlos estables entre versiones. Una rotación de JWT puede invalidar sesiones. La rotación de Sync v1 necesita preservar la versión anterior y su clave para reconocer reintentos legítimos. Las variables secretas quedan fuera de `VITE_*`, Git y las salidas de CI.

### Fotos y respaldos privados

Elegir por separado el almacenamiento de cada función. La carga de presentación no necesita archivos.

Para el proveedor B2, seguir la [guía de bucket privado, permisos, rotación y comprobación real](ALMACENAMIENTO_BACKBLAZE_B2.md). Incluye las variables que se añaden al Backend en Railway y el estado de la validación.

| Variable | Uso |
|---|---|
| `PRODUCT_PHOTO_STORAGE_PROVIDER=disk`, `PRODUCT_PHOTO_STORAGE_DIR` | Archivos privados de identificación en un directorio absoluto de volumen persistente, por ejemplo `/data/fotos` |
| `BACKUP_STORAGE_PROVIDER=disk`, `BACKUP_STORAGE_DIR` | Respaldos en otro directorio del volumen, por ejemplo `/data/respaldos` |
| `PRODUCT_PHOTO_STORAGE_PROVIDER=b2`, `PRODUCT_PHOTO_S3_PREFIX` | Prefijo privado de fotos, por ejemplo `fotos-producto/` |
| `BACKUP_STORAGE_PROVIDER=b2`, `BACKUP_S3_PREFIX` | Otro prefijo, por ejemplo `copias-privadas/` |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET` | Valores reales del almacenamiento B2. El endpoint debe ser un origen HTTPS |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Credenciales secretas de B2 limitadas a las operaciones y objetos necesarios. El código reutiliza estas variables en los dos adaptadores B2 |
| `BACKUP_PRODUCTION_ADMISSION`, `BACKUP_REQUIRE_CLIENT_ENCRYPTION` | Respaldos deshabilitados hasta configurar y comprobar el proveedor. Para admitir respaldos en producción, habilitar la admisión y exigir cifrado del cliente con `true` |
| `BACKUP_MAX_BYTES`, `BACKUP_MAX_ACTIVE_PER_MEMBER`, `BACKUP_UPLOAD_DEADLINE_MS` | Límites opcionales de copias y subida definidos en el esquema |
| `PRODUCT_PHOTO_SWEEP_INTERVAL_MS`, `PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK` | Mantenimiento y retención opcionales. Sin intervalo, ejecutar `npm run product-photos:sweep` cuando corresponda |

Respaldar el volumen o el bucket además de PostgreSQL cuando estas funciones se habiliten. Verificar escritura, lectura autorizada, rechazo de otra cuenta y persistencia tras reiniciar. La verificación local de esta entrega cubre el funcionamiento del núcleo sin proveedores de archivos configurados.

## Vercel

1. Seleccionar la raíz `Web` y Node 22. `Web/vercel.json` fija framework Vite, instalación `npm ci`, construcción `npm run build` y salida `dist`.
2. Reemplazar **`https://agrocuentas-api.example.invalid`** en el destino de la primera regla `rewrites` de **`Web/vercel.json`** por el origen público HTTPS de Railway. Conservar el sufijo `/api/:path*`. La Web sigue solicitando `/api/v1` al origen de Vercel, por lo que no necesita variables Vite de producción. En desarrollo se conserva `VITE_API_PROXY_TARGET`.
3. Verificar un enlace directo como `/colectivo/resumen` y que `/api/v1/ruta-inexistente` devuelva el error de API. Las rutas de API se reenvían primero y quedan excluidas del fallback de la SPA y del service worker. Los errores y respuestas de API llevan `private, no-store`. Los archivos estáticos mantienen su tratamiento separado.
4. Iniciar sesión con Administración y Directiva. Verificar que la cookie Web `refresh_token` sea `HttpOnly`, `Secure`, `SameSite=Strict` y de ruta `/api/v1/auth`. Recargar un enlace directo para comprobar renovación y, tras logout, comprobar que la cookie se borra. Auth V2 por cookie usa `refresh_token_v2` con ruta `/api/v1/auth/v2`. Mobile usa Auth V2 por cuerpo bajo TLS.

Referencias [reglas y sintaxis de Vercel](https://vercel.com/docs/project-configuration/vercel-json), [rewrites externos y caché](https://vercel.com/docs/routing/rewrites).

## Mobile

En un checkout limpio de Mobile, después de verificar el origen público, usar `flutter pub get` y compilar la variante que corresponda. Para depuración, por ejemplo:

```sh
flutter build apk --debug --dart-define=AGRO_API_BASE_URL=https://agrocuentas-api.example.invalid
```

Sustituir el origen completo por el origen HTTPS real de Railway, sin sufijo `/api/v1`. Usar el lanzador estándar de Flutter y el certificado público del servidor. Para un release distribuible, preparar la firma en el entorno privado de compilación. Usar una instalación separada, vacía y una cuenta de agricultor proporcionada por el cargador. Las compras y aplicaciones se crean en el teléfono durante el recorrido.

Seguir el [procedimiento de carga única y recuperación](CARGADOR_PRESENTACION.md) para habilitar las cuentas y los datos de esta instalación.

Durante el despliegue, ejecutar esa carga de forma manual desde un proceso autorizado que tenga acceso a la red privada de PostgreSQL. Usar la misma imagen del Backend y un directorio privado montado para recuperar el archivo de credenciales. Mantener inactivas las escrituras del servicio hasta terminar el plan, el respaldo y la aplicación. Configurar `PRESENTATION_DATABASE_URL` en ese proceso de carga. El servicio normal solo usa `DATABASE_URL`.
