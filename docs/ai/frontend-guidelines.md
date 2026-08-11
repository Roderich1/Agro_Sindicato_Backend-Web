# Guia frontend

## Stack

- React.
- Vite.
- TypeScript.
- React Router.
- Tailwind CSS.
- Axios.
- Vite PWA Plugin.

## Organizacion

- `src/App.tsx`: rutas y proteccion por rol.
- `src/contexts/auth.context.tsx`: sesion.
- `src/lib/axios.ts`: cliente API y refresh.
- `src/services`: llamadas HTTP.
- `src/types`: contratos de datos.
- `src/pages`: pantallas.
- `src/components/app-shell.tsx`: layout y componentes reutilizables.
- `Web/docs/codex-frontend-implementation.md`: ruta por fases para implementar el flujo ampliado.

## Reglas de UI

- Construir pantallas operativas, no landing pages.
- Mantener formularios claros, con labels visibles y validaciones antes de guardar.
- Mostrar estados de carga, vacio, exito y error.
- Usar tablas para datos comparables.
- Usar badges para estado: criticidad, cuenta, rol.
- Evitar textos largos que expliquen el sistema dentro de la app.
- Mantener navegacion por teclado y foco visible.
- Usar `aria-label` en botones iconicos.
- Usar texto en espanol claro y consistente.

## Rutas y roles

- Agricultor y administrador: inventario, compras, sincronizacion.
- Directiva y administrador: panel directiva.
- Administrador: usuarios.
- Si se agrega una ruta, revisar `App.tsx` y menu en `AppShell`.

## Llamadas API

- Usar servicios de `src/services`.
- No llamar `fetch` directo salvo justificacion.
- No construir `tenantId` ni enviarlo.
- Manejar errores con `extractError`.
- Mantener access token en memoria mediante `lib/axios.ts`.
- Si una llamada puede devolver 401, confiar en interceptor de refresh.
- Consultar la campana activa desde el backend; no inventar campana en el cliente.
- Usar `campaignId` solo en consultas historicas, reportes o flujos donde el contrato lo pida.

## Tipos

- Actualizar `src/types` cuando cambie backend.
- Evitar `unknown` en servicios nuevos si ya se conoce contrato.
- Normalizar `Decimal` recibido como string antes de calculos visuales.
- Para fechas, mostrar con helpers de formato.

## PWA y offline

- No asumir conectividad.
- El backend esta online; la parte offline se resuelve en la PWA.
- Si una accion se envia offline, debe guardarse en cola persistente.
- Mostrar estado de sincronizacion.
- No duplicar operaciones al reintentar.

## Flujo ampliado

Antes de implementar campanas, parcelas, aplicaciones, calendario, reportes, bitacora o sincronizacion ampliada, leer `Web/docs/codex-frontend-implementation.md`. Ese documento define fases, endpoints esperados, roles y checklist para que el frontend use correctamente el backend terminado.

## Verificacion

```bash
npm run lint
npm run build
```

Si cambias UI visible, levantar `npm run dev` y revisar la pantalla afectada.
