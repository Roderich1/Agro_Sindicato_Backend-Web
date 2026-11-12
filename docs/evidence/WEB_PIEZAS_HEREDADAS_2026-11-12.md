# Revisión de las dos piezas heredadas de la Web: Calendario y `directiva.page.tsx`

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-12 |
| Encargo | Autor, 2026-11-12: revisar el Calendario (recomendar sin borrar) y retirar `directiva.page.tsx` si no tiene consumidores |
| Rama | `chore/web-solo-institucional` (worktree `_wt/WEB-SOLO-INST`) |
| Commit de código | `754cb25`, sólo `directiva.page.tsx` y sus dependencias exclusivas. El Calendario no se tocó |

## 1. Calendario (`/calendar`, «Agenda y alertas»)

### Qué es hoy

- **Acceso.** `PrivateRoute`: DIRECTIVA y ADMINISTRADOR, por URL. No está en el menú institucional.
  - El servidor (`calendar-events.controller.ts`) admite `AGRICULTOR`, `DIRECTIVA` y `ADMINISTRADOR`.
  - La Web ya no deja entrar al AGRICULTOR (`741e730`).
- **Lo que ve un rol institucional.** Sólo eventos **sin dueño** del tipo `CIERRE_CAMPANA` (`PUBLIC_EVENT_TYPES`, regla F10-SEC-02 #45), es decir, el «Cierre estimado de <campaña>» de las campañas **abiertas con fecha estimada de fin**. Los eventos privados del agricultor (vencimiento de lote, stock bajo, aplicación, pago, compra) nunca le llegan.
- **Acciones reales.**
  - Filtros: Campaña, Tipo, Estado (por defecto Pendiente), Desde y Hasta.
  - Tarjetas: «Eventos visibles», «Próximos 7 días» y «Pendientes vencidos».
  - Por evento, «Completar» o «Cancelar», con confirmación. **Sólo cambian el estado del recordatorio; no cierran ni modifican la campaña.**
  - Al cerrar una campaña desde Campañas, el servidor marca solo su evento como `COMPLETADO` (`campaign-management.use-case.ts`).

### Llamadas a la API que hace la página

| Llamada | Para qué | Observación |
|---|---|---|
| `GET /calendar/events?campaignId&type&status&from&to` | Lista | **Escribe:** antes de listar, el servidor crea o actualiza los recordatorios de cierre de las campañas abiertas (`syncCampaignClosingEvents`). Para un rol institucional no sincroniza lotes ni stock |
| `GET /campaigns` | Filtro de campaña | — |
| `GET /users` | Poner nombre al dueño de cada evento | **Inútil para estos roles:** los eventos que reciben no tienen dueño. Trae la lista completa de usuarios sin necesidad |
| `POST /calendar/events/:id/complete` y `/cancel` | Marcar el recordatorio | Sin efecto en la campaña |

La app móvil **no** usa `/calendar`: no aparece en `lib/` del rediseño integrado.

### Duplicidades y problemas

- **Duplica Campañas:**
  - la lista de Campañas ya muestra el «fin estimado» de cada campaña y el aviso de fin vencido (`OverdueNote`);
  - la cabecera de la campaña activa muestra «fin estimado»;
  - el Detalle de campaña tiene «Fin estimado».
- **No cubre las convocatorias:** las fechas límite de las convocatorias **no** son eventos del calendario. No hay duplicidad con ellas, pero tampoco aporta nada sobre ellas.
- **El filtro «Tipo» engaña:** ofrece seis tipos, pero un rol institucional sólo recibe `CIERRE_CAMPANA`, así que los otros cinco siempre salen vacíos.
- **Tiene restos del agricultor:** el nombre del dueño y la rama `isFarmer` ya no se alcanzan.
- **Fuera del rediseño:** no usa `PageHeader` (no tiene título `h1`) y conserva el estilo anterior al rediseño.

### Recomendación: retirarlo de la Web, sin integrarlo

**Qué se perdería al retirarlo:**

- marcar a mano como «completado» o «cancelado» el recordatorio de cierre estimado de una campaña. No cambia nada más: ni la campaña ni ningún dato;
- una lista de cierres estimados filtrable por rango de fechas;
- los contadores «Próximos 7 días» y «Pendientes vencidos» de esos cierres.

**Qué no se perdería:**

- la fecha estimada de fin y el aviso de fin vencido, que siguen en Campañas y en su detalle;
- el cierre real de la campaña, que se hace en Campañas;
- nada del agricultor, que usa la app.

**Integrarlo no aporta:** su único contenido institucional ya está en Campañas. Si el autor quiere un aviso de «cierres próximos» en Campañas o en el Resumen, sería un **cambio funcional pendiente** (presentación de una fecha que la API ya da), no una integración del Calendario.

**Si se retira:**

- se quita la página, su ruta, `calendar.service.ts` y `types/calendar.ts` de la Web, y la ruta comodín lleva a cada sesión a su inicio;
- el módulo `calendar` del Backend **no** se toca en esa tarea: lo usan los productores de eventos heredados y las pruebas F10-SEC-02. Su retirada sería otra decisión, con reauditoría de consumidores (`LEGACY_CONTRACT_CONSUMERS.md`).

**Estado:** sin cambios. **Pendiente de la decisión del autor.**

## 2. `pages/directiva.page.tsx`: retirada

**Comprobaciones:**

- **Referencias:** ninguna importación estática ni dinámica (`import()`), y ningún `import.meta.glob`.
  - `App.tsx` no la importa. `/directiva` es `LegacyDirectivaRedirect`, que lleva a `/colectivo/propuestas` y conserva `?campaign=`.
  - La única mención era una prueba que exige que `App.tsx` **no** la renderice; se conserva.
- **Accesibilidad real:** ninguna ruta la muestra, así que no entraba en el build de producción (Vite sólo empaqueta lo importado).
- **Contenido:** la pantalla heredada «Panel Directiva», que ejecutaba compras conjuntas reales y pagos. El camino vigente es el borrador de propuesta, sin efectos.

**Dependencias exclusivas, según el grafo de importaciones de `Web/src`:**

| Retirado | Motivo |
|---|---|
| `pages/directiva.page.tsx` | Sin consumidores |
| `services/accounts-payable.service.ts` | Sólo lo usaba esa página |
| `services/procurement.service.ts` | Sólo lo usaba esa página (`list` y `createJoint` de compras) |
| `inventoryService` en `services/inventory.service.ts` | Sólo le quedaba `globalStock`, que usaba esa página |
| `CriticalityBadge` en `components/app-shell.tsx` | Sólo lo usaba esa página |
| `types/accounts-payable.ts`, `types/procurement.ts`, y en `types/inventory.ts` los tipos de lotes, stock y movimientos y sus reexportaciones | Quedaron sin uso |

**Conservado, porque es compartido:**

- `productsService`, del catálogo;
- en `app-shell`: `UserAvatar`, `ROLE_COLORS`, `EmptyState`, `SkeletonRow`, `StatCard`, `StatusBadge` y `Notice`, que usan Usuarios, Bitácora, Calendario y otras vistas;
- los nombres de entidad «InventoryLot», «StockMovement» y «PayableAccount» del filtro de la Bitácora: son textos de la auditoría, no tipos;
- los tipos de `common.ts` que ya estaban sin uso en `9dc80f0`: no forman parte de este alcance.

**El Backend no cambia:** `/purchases`, `/purchases/joint`, `/accounts-payable` e `/inventory/global-stock` siguen como estaban.

## 3. Pruebas (Web, `754cb25`)

| Comprobación | Resultado |
|---|---|
| `npx tsc -b` | sin errores |
| `npx eslint .` | 0 errores; 7 avisos, los mismos que antes y en archivos no tocados |
| `npx vitest run --no-file-parallelism` | 54 archivos, **586 pruebas, todas pasan** |
| `npx vite build` | correcto |

No se rehicieron capturas: ninguna pantalla visible cambió. La página retirada no tenía ruta, y la captura del Calendario (`10_administracion/06`) sigue siendo válida.

## 4. Calendario retirado de la Web (autorización del autor, 2026-11-12)

- **Retirado:**
  - `pages/calendar.page.tsx`, `services/calendar.service.ts` y `types/calendar.ts`;
  - la página perezosa en `App.tsx`.

  El grafo de importaciones confirmó que eran exclusivos. Los componentes del armazón que también usaba (`EmptyState`, `SkeletonRow`, `StatCard`, `StatusBadge`, `Notice`) y `listUsers` siguen, porque los usan la Bitácora, Usuarios y otras vistas. `fmtCalendarDate` (fechas de campaña) no tiene relación con el Calendario y se conserva.
- **Enlace antiguo:** `/calendar` → `<PrivateRoute><Navigate to="/campaigns" /></PrivateRoute>`:
  - Directiva y Administración llegan a Campañas;
  - el AGRICULTOR ve el aviso;
  - sin sesión, se va a `/login`.
- **Se conserva en Campañas:** la fecha estimada de fin, el aviso de fin vencido y el «fin estimado» de la campaña activa y del detalle. No se añadió ningún calendario ni aviso nuevo.
- **Sin cambios:** el Backend, Mobile, los eventos existentes y sus datos.
- **Pruebas** (código en el commit indicado en la sección 5):
  - `tsc -b` sin errores;
  - `eslint .` con 0 errores (los 7 avisos de antes);
  - `vitest` 54 archivos, **589 pruebas, todas pasan**;
  - `vite build` correcto.
- **Pruebas nuevas:**
  - `web-access-by-role.test.tsx`: Directiva y Administración en `/calendar` llegan a `/campaigns` **sin ninguna llamada a `/calendar` ni a `/users`**; el AGRICULTOR en `/calendar` sigue viendo el aviso;
  - `app-routes.test.ts`: `App.tsx` ya no tiene página ni servicio del calendario.

## 5. Verificación en el navegador (Calendario retirado, `d5569a7`)

Vite de `chore/web-solo-institucional` en `127.0.0.1:5176`, con proxy a la API aislada 3350 y datos sintéticos. El registro está en `web_piezas_heredadas_2026-11-12/navegador_calendario_retirado.txt`.

| Caso | Resultado | Llamadas a la API al abrir `/calendar` |
|---|---|---|
| DIRECTIVA abre `/calendar` por URL | Llega a `/campaigns` (título «Campañas», con menú) | `auth/refresh`, `GET /campaigns/active` y `GET /campaigns`. **Ni `/calendar/events` ni `/users`** |
| ADMINISTRADOR abre `/calendar` por URL | Llega a `/campaigns` | Las mismas: **ni `/calendar/events` ni `/users`** |
| AGRICULTOR abre `/calendar` por URL | Aviso «Esta cuenta utiliza la aplicación móvil.», sin menú ni enlaces | Sólo `auth/refresh` |

**Evidencia histórica:** la captura del Calendario tal como era antes de retirarlo, con Directiva y datos sintéticos, se conserva en `web_piezas_heredadas_2026-11-12/calendario_retirado/`. Se retiró del material de diseño vigente.
