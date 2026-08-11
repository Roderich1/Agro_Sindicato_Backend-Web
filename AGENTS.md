# AGENTS.md

## Proposito del repositorio

Este repositorio contiene el MVP del sistema de gestion de agroquimicos del Sindicato 19 de Agosto, San Julian, Santa Cruz, Bolivia.

El MVP actual se limita a:

- `Back`: API NestJS, Prisma y PostgreSQL.
- `Web`: PWA React/Vite para agricultores, directiva y administrador.
- `docker-compose.yml`: entorno local con PostgreSQL, API y web.

El perfil original menciona app Android, ingreso por voz, IA predictiva y evaluacion formal. Para este MVP esos puntos quedan fuera de alcance funcional. No implementes React Native, Whisper, Prophet/FastAPI ni flujos de pruebas academicas SUS/MAPE salvo que el usuario lo pida explicitamente. La verificacion tecnica del codigo si sigue siendo obligatoria cuando se cambie codigo.

## Roles y dominio

Roles del sistema:

- `AGRICULTOR`: gestiona su inventario individual, compras, cuentas por pagar y sincronizacion.
- `DIRECTIVA`: consulta inventario global y registra compras conjuntas para agricultores.
- `ADMINISTRADOR`: administra usuarios y puede acceder a vistas operativas.

Conceptos principales:

- Tenant: representa el sindicato o unidad organizativa. El frontend nunca debe enviar `tenantId`.
- Producto: agroquimico con unidad, categoria, stock minimo y dias de alerta de vencimiento.
- Lote: stock concreto de un producto, asociado a agricultor, vencimiento, almacen y cantidad.
- Campana agricola: periodo operativo creado por directiva o administrador. Las operaciones nuevas se asocian a la campana activa cuando corresponde.
- Parcela: terreno fisico del agricultor. Si tiene historial se inactiva, no se elimina.
- Cultivo por campana: relacion entre parcela, campana y cultivo sembrado.
- Aplicacion: uso de agroquimico en una parcela/cultivo; genera salida de inventario.
- Movimiento: entrada, salida o ajuste de inventario.
- Compra: individual o conjunta, al contado o credito.
- Cuenta por pagar: deuda generada por compras a credito.
- FDS/toxicologia: datos tecnicos del producto; no incluye SENASAG en el flujo decidido.
- Calendario: vencimientos, pagos proximos, aplicaciones, compras programadas, stock bajo y cierres de campana.
- Bitacora: registro de acciones importantes para trazabilidad.
- Sincronizacion: cola de operaciones offline enviada a la API cuando vuelve la conectividad.

## Alcance del MVP

Cubrir:

- Autenticacion con JWT, refresh token por cookie y control de roles.
- Gestion de usuarios por administrador.
- Campanas agricolas creadas por directiva/administrador.
- Parcelas de agricultores y cultivos asignados por campana.
- Inventario individual por agricultor: productos, stock inicial, entradas, salidas, lotes, ajustes, alertas de stock minimo y vencimiento.
- Aplicaciones de agroquimicos a parcelas con salida automatica de stock.
- FDS, categoria toxicologica y QR por producto/lote.
- Compras individuales con proveedor, productos, costos, lotes y cuenta por pagar cuando aplica.
- Proveedores.
- Pagos parciales y totales de cuentas por pagar.
- Panel de directiva con inventario global y compras conjuntas.
- Calendario operativo, reportes por campana y bitacora.
- Sincronizacion offline-online mediante endpoint de operaciones.
- PWA web con rutas protegidas y experiencia usable para agricultores y directiva.

Fuera de alcance salvo pedido explicito:

- Modulo de ingreso por voz.
- IA predictiva o modelos de demanda.
- App Android/React Native.
- Microservicio Python/FastAPI/Prophet.
- Evaluacion academica formal con usuarios, SUS o MAPE.

## Estructura

- `Back/src/modules/iam`: login, refresh, logout, guards, roles.
- `Back/src/modules/users`: administracion de usuarios.
- `Back/src/modules/inventory`: productos, lotes, stock, movimientos, alertas y ajustes.
- `Back/src/modules/procurement`: proveedores, compras individuales y conjuntas.
- `Back/src/modules/accounts-payable`: cuentas por pagar y pagos.
- `Back/src/modules/sync`: operaciones offline y estado de sincronizacion.
- `Back/prisma/schema.prisma`: modelo canonico de datos.
- `Back/docs/Flujo.md`: flujo funcional decidido.
- `Back/docs/modelo-datos-flujo.md`: modelo de datos del flujo ampliado.
- `Back/docs/codex-backend-implementation.md`: guia por fases para implementar el flujo backend con Codex.
- `Web/src/lib/axios.ts`: cliente HTTP, access token en memoria y refresh.
- `Web/src/contexts/auth.context.tsx`: sesion de usuario.
- `Web/src/services`: acceso a API.
- `Web/src/pages`: pantallas por modulo.
- `docs/ai`: guias para usar Codex y otras herramientas de IA en este proyecto.

## Comandos

Desde la raiz:

```bash
docker compose up --build
```

Backend:

```bash
cd Back
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
npm run build
npm run test
```

Frontend:

```bash
cd Web
npm install
npm run dev
npm run lint
npm run build
```

Servicios esperados:

- Web Docker: `http://localhost:8080`
- Web dev: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- PostgreSQL: `localhost:5432`

## Reglas de trabajo para Codex

- Lee primero el archivo mas especifico de instrucciones: este archivo, luego `Back/AGENTS.md` o `Web/AGENTS.md` si trabajas en esas carpetas.
- Antes de modificar una funcionalidad, identifica el modulo, rol y flujo de datos afectado.
- Mantiene el alcance del MVP. Si el usuario pide "prediccion", "voz" o "app movil", confirma si quiere salir del alcance actual.
- No hagas refactors amplios si el pedido es puntual.
- No cambies secretos, credenciales ni configuraciones de produccion sin indicacion explicita.
- No reviertas cambios existentes del usuario.
- Usa `rg` para buscar archivos o texto.
- Usa `apply_patch` para ediciones manuales.
- Si agregas endpoints, actualiza DTOs, use cases, servicios web y documentacion relacionada.
- Si cambias contratos API, actualiza `Web/src/types`, `Web/src/services` y las guias en `Back/docs` o `docs/ai` cuando corresponda.
- El frontend no debe depender de `tenantId` enviado por el cliente; el backend lo resuelve desde el token.
- Conserva la separacion por roles. No mezcles permisos de agricultor y directiva sin revisar guards, rutas y UI.
- Usa texto en espanol claro para la interfaz. Al editar archivos existentes con mojibake, evita empeorar la codificacion.

## Verificacion esperada

Cuando cambies backend:

- Ejecuta `npm run build` en `Back`.
- Ejecuta `npm run test` si tocaste logica de negocio, DTOs, auth, Prisma o sincronizacion.
- Revisa Swagger mentalmente o con el navegador si cambias endpoints.

Cuando cambies frontend:

- Ejecuta `npm run lint` en `Web`.
- Ejecuta `npm run build` en `Web`.
- Si cambias vistas, levanta la app y verifica en navegador los flujos afectados.

Cuando cambies ambos:

- Verifica contrato API: payload, respuesta, estados de error, roles y refresco de sesion.
- Prueba al menos el camino feliz y un error visible para el usuario.

## Documentos utiles

- `docs/ai/README.md`
- `docs/ai/mvp-scope.md`
- `docs/ai/prompting-guide.md`
- `docs/ai/architecture-guidelines.md`
- `docs/ai/backend-guidelines.md`
- `docs/ai/frontend-guidelines.md`
- `docs/ai/offline-sync-guidelines.md`
- `docs/ai/security-and-ai-guidelines.md`
- `docs/ai/definition-of-done.md`
