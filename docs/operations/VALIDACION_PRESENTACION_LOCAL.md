# Validación local de Agrocuentas para presentación

Validación del 26 de noviembre de 2026, hora de Bolivia. Base `agrocuentas_presentacion_valle`, instalación `valle-local`, sindicato `valle-claro` y manifiesto `valle-claro-v1`. Backend probado desde la imagen final sobre PostgreSQL 16.13 y Web desde `dist` a través de un proxy HTTPS de loopback que aplicó las reglas compiladas por `@vercel/routing-utils`. Backend/Web partió de `d11de04ca18bef7ae4cee436b583ee7b9f3c902b`. El contrato Mobile corresponde a `f80a598c81bf5b239880b2be4884f0223b28d9f8` y se verificó por HTTPS desde un cliente de prueba.

## Cantidades de la primera carga

Se creó un sindicato, una temporada, cinco clasificaciones, 27 cuentas habilitadas y 15 productos. La distribución de cuentas es 1 de Administración, 2 de Directiva y 24 de Agricultura. Quedaron 23 agricultores con al menos un aporte en cada campaña. La cuenta reservada para activar una instalación Mobile vacía quedó sin registro de cliente, aportes ni participación. Se verificaron cero compras, pagos, cuentas por pagar y movimientos de stock en la base central.

| Ciclo agrícola | Período | Estado y versión histórica | Necesidades activas | Consumos activos | Celdas divulgadas de necesidad / consumo | Ceros explícitos | Retiros del histórico | Convocatorias y registros de participación |
|---|---|---|---:|---:|---:|---:|---:|---|
| 2022 | 2022-11-05 a 2023-02-02 | Cerrada, versión 1 | 31 | 30 | 12 / 13 | 1 | 0 | Cerrada, 7 registros, 1 retirado |
| 2023 | 2023-11-05 a 2024-02-02 | Cerrada, versión 1 | 30 | 32 | 12 / 13 | 1 | 1 | Ninguna |
| 2024 | 2024-11-05 a 2025-02-02 | Cerrada, versión 1 | 31 | 34 | 12 / 13 | 1 | 0 | Cancelada, 2 registros |
| 2025 | 2025-11-05 a 2026-02-02 | Cerrada, versión 1 | 30 | 35 | 12 / 12 | 0 | 0 | Ninguna |
| 2026 | 2026-11-05 a 2027-02-02 | Abierta | 32 | 38 | 13 / 13 | 2 | 0 | Abierta, 8 registros. Borrador, 0 registros |

La campaña activa es **Ciclo agrícola 2026** y la convocatoria utilizable es **Compra conjunta de nutrición mineral**, con plazo hasta el 9 de diciembre de 2026 a las 20:00 de Bolivia. Los períodos de las campañas son los del escenario. Las operaciones de apertura, revocación y cierre conservan la fecha efectiva de la importación.

El trabajador de Estimación completó su trabajo con 14 resultados. Doce quedaron en `ESTIMATED` y `CURRENT` con cuatro fuentes verificadas. Dos quedaron en `INSUFFICIENT_DATA` por falta de verificación de la última campaña pertinente, para Aceite agrícola mineral y Quelato de hierro soluble. El Corrector líquido de calcio aporta necesidad y queda fuera del cálculo por consumo. Se mantuvieron los mínimos y criterios del algoritmo.

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| Imagen final | `npm run db:deploy` aplicó 25 migraciones. El comando de carga y su ayuda funcionaron desde la imagen. El servidor arrancó en el puerto configurado y respondió a `/api/v1/health`. |
| Plan y aplicación | Los recuentos de sindicato, cuenta y manifiesto quedaron en `[0, 0, 0]` tras el plan. La aplicación generó un manifiesto y 27 contraseñas distintas con hash bcrypt. |
| Reejecución | El comando devolvió `already_loaded`. Conservó un borrador de 13 líneas creado después por API. Siguieron existiendo exactamente 27 cuentas, 15 productos, 5 campañas, 4 convocatorias y 1 manifiesto. Se conservó el archivo privado de credenciales. |
| Protecciones | Rechazó el slug discordante, el nombre de base diferente del indicado en la URL y una base migrada con un registro ajeno. Ante un archivo de credenciales ya ocupado, revirtió sindicato, cuentas, productos, campañas y manifiesto. |
| Respaldo y trabajador de convocatorias | Se restauró una copia aislada con `pg_dump` y `pg_restore`. En esa copia, el trabajador cerró automáticamente una convocatoria independiente, con corte en el plazo exacto. La convocatoria de presentación siguió abierta. |
| Web HTTPS | Login de Administración y Directiva, renovación al recargar el Histórico por enlace directo, cookie `HttpOnly`, `Secure`, `SameSite=Strict` con ruta `/api/v1/auth`, logout y retiro de cookie. CORS aceptó el origen configurado. La ruta de API inexistente devolvió 404 en JSON con `private, no-store`. |
| Mobile HTTPS | Login y renovación Auth V2 por cuerpo con una cuenta de Agricultor, registro y vinculación de cliente, referencias de sincronización y convocatoria abierta visible. La compilación contra el dominio público corresponde al paso de despliegue. |
| Permisos y cifras | Administración obtuvo el detalle de las personas que autorizaron su identificación y un conteo para los aportes de solo totales. Directiva consultó el agregado y la ruta de detalle respondió 403. Las 26 celdas del Resumen activo coincidieron en suma, unidad y número de aportantes con PostgreSQL. |
| Histórico y Excel | Cuatro sellos de versión 1. Cero publicado con valor `0`, ausencia `NO_DATA` y retiro `WITHDRAWN_AFTER_SEAL` con valor nulo. El botón del Histórico descargó un XLSX con cuatro hojas XML válidas. |
| Comprobaciones automatizadas | Backend compilación, lint, OpenAPI y 623 pruebas. PostgreSQL 176 pruebas en 13 suites. Web compilación, lint y 726 pruebas. |

La configuración del proxy se verificó en local. Repetir la comprobación de Vercel y Railway con sus dominios y TLS públicos cuando estén disponibles. La instalación local utilizó el núcleo sin proveedores de fotos ni respaldos de Mobile. El respaldo comprobado corresponde a PostgreSQL.
