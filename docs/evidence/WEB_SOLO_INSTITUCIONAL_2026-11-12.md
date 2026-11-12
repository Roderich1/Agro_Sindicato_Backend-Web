# Evidencia: la Web es sólo de Directiva y Administración (vistas del agricultor retiradas)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-12 |
| Decisión | Del autor, 2026-11-12: la Web es exclusivamente para Directiva y Administración; el agricultor usa exclusivamente la app móvil |
| Rama y commit | `chore/web-solo-institucional` (worktree `_wt/WEB-SOLO-INST`), desde `9dc80f0`; código en **`741e730`** |
| Entorno de la prueba en navegador | Vite en `127.0.0.1:5176` sobre `741e730`, con proxy a la API aislada 3350 (contenedor `agro_et1_pg`, datos sintéticos). Edge sin interfaz. Sin túnel; DEMO oficial no tocada |

## 1. Auditoría antes de borrar

**Método.** Grafo de importaciones de `Web/src`: importaciones estáticas y dinámicas `import()`, rutas de `App.tsx` y pruebas. Se calcularon los módulos que **sólo** se alcanzan desde las páginas del agricultor. No se borró nada por palabra clave.

**A. Retirado** (sin consumidores fuera de las vistas del agricultor):

- **Páginas:** `dashboard`, `plots`, `applications`, `reports`, `inventory`, `purchases` y `sync`, todas `pages/*.page.tsx`.
- **Guarda y cola:** `components/farmer-route.tsx` y su prueba; `lib/offline-queue.ts`.
- **Servicios:** `applications`, `plots`, `reports` y `sync`.
- **Tipos:** `applications`, `plots`, `reports` y `sync`.
- **Dentro de servicios compartidos, sólo lo que usaban esas páginas:**
  - `lotsService` y `adjustmentsService`;
  - las operaciones de stock de `inventoryService`, salvo `globalStock`;
  - `suppliersService`;
  - `purchasesService.create` y `.get`;
  - los tipos que quedaron sin uso (cargas y consultas de lotes, ajustes, stock, alertas, movimientos y proveedores).
- **Bandera y menú:** `legacyFarmerWebEnabled`, la bandera `VITE_LEGACY_FARMER_WEB`, `LEGACY_MENU`, los ítems del menú heredado, la barra inferior del agricultor y el contador de la cola en el armazón.
- **Campañas:** el aviso «Puede consultar las campañas…», que sólo veía el agricultor.

**B. Conservado: compartido o necesario para la gestión institucional.**

- Rótulos y colores del rol AGRICULTOR en el armazón: los usa **Usuarios** para listar las cuentas de agricultor.
- Vistas que muestran agricultores con permiso o en agregado:
  - participantes y consentimiento en convocatorias;
  - cobertura;
  - nombres en el Calendario;
  - identificación de productos («El agricultor verá la nota en su teléfono»).
- `productsService` (catálogo) e `inventoryService.globalStock`.
- `payablesService` y `purchasesService.list` / `.createJoint`, que usa la página heredada `pages/directiva.page.tsx`. Esa página está **sin ruta desde la etapa 2 del rediseño**; es institucional, no del agricultor, así que queda **fuera de este alcance** y se anota como candidata a retirar en otra decisión.
- Calendario (`/calendar`): pantalla heredada, accesible por URL a Directiva y Administración. No es exclusiva del agricultor.

**C. Conservado: controles que reconocen al AGRICULTOR para bloquearlo.**

- `CollectiveRoute`, `PrivateRoute`, `AdminRoute` y `RoleRoute`.
- `homePathFor` y `menuPathsFor`, que dan el aviso y un menú vacío.
- `CampaignProvider`, que no pide campañas para un rol no colectivo.
- Guardas defensivas en Campañas, Detalle de campaña y Calendario.
- El servidor sigue decidiendo los permisos: no se tocó ninguna validación.

**D. Contratos generados.** No aplica: los tipos de la Web están escritos a mano. Los snapshots OpenAPI del Back no se tocaron.

**Dependencias de `package.json`.** Ninguna era exclusiva de lo retirado (axios, React, router, Tailwind, PWA).

## 2. Comportamiento nuevo

- **Aviso** `/sin-acceso-web`: «Esta cuenta utiliza la aplicación móvil.» y «La Web está disponible para Directiva y Administración.».
  - Botones: «Cambiar de cuenta» (cierra la sesión y abre el inicio de sesión) y «Cerrar sesión».
  - Sin menú, sin enlaces y sin enlace de descarga, porque no hay uno oficial comprobado.
- **Ruta comodín `*`:** cualquier ruta desconocida o antigua lleva a la pantalla inicial de la sesión (Resumen, aviso o inicio de sesión). Antes, una ruta sin registro dejaba la página en blanco.
- **Backend y Mobile sin cambios:**
  - `git diff 9dc80f0 741e730 -- Back` está vacío, y el commit sólo toca `Web/` y `docs/`;
  - autenticación, sesiones de la app, sincronización, identificación y fotos, participación y consentimientos siguen igual;
  - la restricción de la Web no deshabilita cuentas: cerrar la sesión de la Web no toca la cuenta.

## 3. Pruebas automáticas (Web, `741e730`)

| Comprobación | Resultado |
|---|---|
| `npx tsc -b` | sin errores |
| `npx eslint .` | 0 errores; 7 avisos, los mismos que en `9dc80f0`, en archivos no tocados |
| `npx vitest run --no-file-parallelism` | **54 archivos, 586 pruebas, todas pasan** (en `9dc80f0`: 568; se retiraron las de la bandera y se añadieron las de acceso) |
| `npx vite build` | correcto |

Pruebas que demuestran el bloqueo:

- **`components/__tests__/web-access-by-role.test.tsx`**, nueva, con la tabla de rutas real (`AppRoutes`):
  - una cuenta AGRICULTOR que entra por cualquiera de 22 rutas (antiguas, institucionales, de administración y desconocidas) sólo ve el aviso, sin navegación ni enlaces, y **sin ninguna llamada a la API**;
  - el aviso tiene exactamente «Cambiar de cuenta» y «Cerrar sesión» y no ofrece descargas;
  - los dos botones cierran la sesión, y «Cambiar de cuenta» lleva a `/login`;
  - Directiva y Administración en una ruta antigua vuelven al Resumen;
  - sin sesión, se va a `/login`.
- **`routes-roles.test.tsx`, `collective-route.test.tsx` y `app-routes.test.ts`:**
  - se conservan los bloqueos del AGRICULTOR;
  - se retiraron los casos de la bandera;
  - `App.tsx` no tiene rutas propias del agricultor ni `FarmerRoute`, y sí la ruta comodín.

## 4. Prueba en el navegador (real, entorno aislado)

Registro completo en `web_solo_institucional_2026-11-12/navegador_acceso_por_rol.txt`: ruta final, título, número de `nav` y enlaces, y llamadas a la API, sin cabeceras ni cuerpos.

| Caso | Resultado |
|---|---|
| AGRICULTOR inicia sesión | `/sin-acceso-web`, título «Esta cuenta utiliza la aplicación móvil.», 0 `nav`, 0 enlaces. API: sólo `auth/login` y `auth/refresh` |
| AGRICULTOR por URL directa: `/dashboard`, `/inventory`, `/purchases`, `/sync`, `/plots`, `/applications`, `/reports`, `/colectivo/resumen`, `/colectivo/compras-conjuntas`, `/colectivo/catalogo?vista=identificacion`, `/campaigns`, `/calendar`, `/audit-logs`, `/users` | Las 14 terminan en el aviso. API: sólo `auth/refresh`, **ninguna consulta institucional** |
| «Cambiar de cuenta» | `/login`; API: `auth/logout` |
| «Cerrar sesión» | `/login`; API: `auth/logout` |
| DIRECTIVA | Resumen con menú; `/inventory` y `/users` vuelven al Resumen; cerrar sesión lleva a `/login` |
| ADMINISTRADOR | Resumen con menú; `/users` abre Usuarios; `/sync` vuelve al Resumen; cerrar sesión lleva a `/login` |

Nota del recorrido: con el límite de 20 autenticaciones por minuto del entorno, la ronda de recargas seguidas perdió la sesión a mitad. En desarrollo, cada recarga renueva la sesión dos veces por el doble efecto de React StrictMode. Esas URL se repitieron con más espacio entre recargas. Perder la sesión llevó a `/login`, nunca a un acceso.

## 5. Límites

- No se probó la app móvil en un dispositivo para esta tarea: no cambió ni el Back ni Mobile.
- `pages/directiva.page.tsx` (institucional, sin ruta) y el Calendario (heredado, por URL) siguen en la Web: quedan para otra decisión.
- Las pruebas del navegador usan el servidor de desarrollo, no un build de producción.
