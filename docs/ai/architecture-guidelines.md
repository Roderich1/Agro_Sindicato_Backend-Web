# Guia de arquitectura

## Vista general

El MVP usa arquitectura cliente-servidor:

- Web PWA React/Vite.
- API NestJS con prefijo `/api/v1`.
- PostgreSQL con Prisma.
- Docker Compose para entorno local.

No hay microservicio Python ni app Android en el MVP actual.

## Principios

- Dominio primero: campanas, parcelas, inventario, compras, cuentas, aplicaciones, calendario, reportes, usuarios y sincronizacion.
- Contratos explicitos: DTOs backend y tipos frontend deben coincidir.
- Multirol: cada flujo debe validar permiso en backend y en UI.
- Multitenant: `tenantId` sale del token, no del cliente.
- Offline consciente: las operaciones que puedan originarse sin conexion deben ser idempotentes.
- Cambios chicos y verificables.

## Flujo de datos

1. Usuario inicia sesion en Web.
2. API devuelve access token y cookie de refresh.
3. Frontend guarda access token en memoria.
4. Axios agrega `Authorization`.
5. Backend resuelve `tenantId` y `sub` desde JWT.
6. Use case aplica regla de negocio.
7. Prisma persiste en PostgreSQL.
8. Frontend refresca estado y muestra resultado.

## Modulos y responsabilidades

### IAM

- Login.
- Refresh.
- Logout.
- Guards JWT.
- Decoradores de roles y usuario actual.

### Users

- Crear, listar, actualizar, desactivar usuarios.
- Resetear password.
- Mantener roles validos.

### Inventory

- Catalogo de productos.
- FDS, categoria toxicologica, instrucciones de seguridad y QR.
- Lotes.
- Stock inicial.
- Entradas.
- Salidas.
- Ajustes.
- Alertas.
- Inventario global.

### Campaigns and plots

- Campanas agricolas creadas por directiva/administrador.
- Parcelas del agricultor.
- Cultivos asignados por parcela y campana.
- Bloqueo de operaciones normales en campanas cerradas.

### Applications

- Aplicaciones de agroquimicos a parcelas.
- Relacion con campana, cultivo, producto/lote y movimiento de salida.
- Historial por parcela, cultivo y campana.

### Procurement

- Proveedores.
- Compras individuales.
- Compras conjuntas.
- Distribucion por agricultor.
- Compras programadas y recepcion parcial.

### Accounts payable

- Cuentas generadas por compras a credito.
- Pagos parciales.
- Pago total.
- Estado de deuda.

### Sync

- Recibir operaciones offline.
- Marcar aplicadas, conflicto o rechazadas.
- Consultar estado.

### Calendar and audit

- Eventos operativos: vencimientos, pagos proximos, aplicaciones, compras programadas, stock bajo y cierres de campana.
- Bitacora de acciones importantes para trazabilidad.

## Reglas de cambio

- Cambios de modelo empiezan en Prisma y se reflejan en DTOs, use cases, servicios y UI.
- Cambios de endpoint deben actualizar Swagger por decoradores y tipos frontend.
- Cambios de UI que creen datos deben validar antes de enviar.
- Cambios de roles deben revisar `App.tsx`, guards, controladores y menus.
- Cambios offline deben revisar idempotencia, orden y conflictos.
- Cambios de campana deben revisar asociacion automatica de `campaignId`, estado de campana y reportes.

## Decisiones que requieren confirmacion

- Nueva dependencia de produccion.
- Cambio de ORM, base de datos o estructura de tenant.
- Nueva arquitectura de microservicios.
- Integrar voz o IA predictiva.
- Cambiar estrategia de auth.
- Borrar o reemplazar modulos existentes.
