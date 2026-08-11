# Web/AGENTS.md

## Alcance del frontend

PWA React/Vite para agricultores, directiva y administrador. Esta web reemplaza, para el MVP, la app movil mencionada en el perfil academico.

Vistas principales:

- `login.page.tsx`: inicio de sesion.
- `dashboard.page.tsx`: resumen inicial.
- `inventory.page.tsx`: inventario individual del agricultor.
- `purchases.page.tsx`: compras, proveedores y cuentas por pagar.
- `directiva.page.tsx`: inventario global y compras conjuntas.
- `sync.page.tsx`: operaciones offline y sincronizacion.
- `users.page.tsx`: usuarios para administrador.

## Patrones

- Usar `Web/src/lib/axios.ts` para llamadas HTTP.
- Mantener tipos en `Web/src/types`.
- Mantener acceso API en `Web/src/services`.
- Las paginas deben usar servicios, no construir URLs dispersas.
- Mantener rutas protegidas en `App.tsx`.
- No enviar `tenantId` desde el frontend.
- Access token vive en memoria; refresh token via cookie `withCredentials`.
- Si cambias respuestas API, actualiza tipos y UI al mismo tiempo.
- Para implementar el flujo ampliado, leer primero `Web/docs/codex-frontend-implementation.md`.
- Avanzar por fases del documento frontend; no intentar mezclar todo el flujo en una sola pantalla.
- La campana activa se consulta al backend y se muestra en la experiencia privada cuando el flujo lo requiera.

## UX del MVP

- La interfaz debe ser operativa, clara y rapida para usuarios rurales.
- Priorizar tablas escaneables, formularios simples, mensajes de error comprensibles y estados de carga.
- Mantener contraste, foco visible y navegacion por teclado.
- Evitar textos decorativos extensos dentro de la app.
- Para acciones destructivas o financieras, mostrar validaciones visibles.
- Para directiva, mantener foco en datos agregados y decisiones: agricultor, producto, stock, vencimiento, proveedor, deuda.
- Para agricultor, mantener foco en tareas diarias: registrar compra, entrada, salida, lote, pago y sincronizacion.

## Offline/PWA

- PWA esta configurada en `vite.config.ts`.
- El backend siempre esta desplegado en internet; la parte offline pertenece a la PWA web.
- Si implementas cola offline, usa almacenamiento persistente del navegador.
- Cada operacion offline debe tener `clientOperationId` unico y un `clientId` estable.
- No borrar operaciones locales hasta recibir `APLICADA`.
- Mostrar conflictos y rechazos con accion clara para revisar, editar o descartar.

## Codificacion

- Evita introducir mojibake. Guarda archivos en UTF-8.
- Al crear textos nuevos, usa espanol claro. Si un archivo existente tiene codificacion rota, no amplifiques el problema.
- Mantener formularios controlados y validaciones de minimos antes de llamar a la API.
- Reutilizar componentes de `components/app-shell.tsx` cuando sea razonable.

## Comandos

```bash
npm run lint
npm run build
npm run dev
```

Ejecuta `npm run lint` y `npm run build` despues de cambios frontend.

## Documentos de flujo

- `Back/docs/Flujo.md`: flujo funcional decidido.
- `Back/docs/modelo-datos-flujo.md`: modelo de datos backend.
- `Back/docs/codex-backend-implementation.md`: fases backend ya implementadas o por verificar.
- `Web/docs/codex-frontend-implementation.md`: fases frontend para consumir correctamente el backend.
- `docs/ai/offline-sync-guidelines.md`: reglas de sincronizacion PWA.
