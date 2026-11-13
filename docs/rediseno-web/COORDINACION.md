# Rediseño de la Web (v2): coordinación

Lo edita sólo el orquestador (sesión `proyectoagro-5c`, worktree `_wt/WEB2-INT`). Encargo del autor del 2026-11-13: implementar el diseño del ZIP «Agrocuentas · Rediseño de la Web-png» (51 láminas y un laboratorio que no forma parte de la Web). La implementación y las integraciones entre ramas de trabajo están autorizadas. **No** están autorizados la fusión a main, el despliegue, los cambios en la DEMO oficial, en Flutter ni en el documento de grado.

## 1. Base común

- **Composición verificada el 2026-11-13.** `chore/web-solo-institucional` `cff4fbd` contiene:
  - la Web limpia: sin vistas del agricultor, sin `directiva.page` y sin Calendario;
  - las etapas 1–3, P-A y Excel, por `9dc80f0` de `feat/etapa3-estimacion-borrador`;
  - el rediseño v1 (`b08ab6d`/`11bffd7`).

  Lo único posterior es `1f529b7`, que sólo trae documentación de P-A. La rama `docs/web-redesign-input` (`36931b4`) es material de diseño y no cambia código.
- **Base del rediseño v2: `e8a440f`** (`feat/web-rediseno-v2`), que es `cff4fbd` más la fusión de `1f529b7`.
- **Backend:** el de la base, sin cambios. Su `Back/src` es igual al de `9dc80f0`/`1f529b7`. Este encargo **no cambia Backend, permisos ni contratos**.
- **Láminas:** copia local, no versionada, en `ProyectoAgro/_artefactos/web_rediseno_2/laminas/NN.png`, con su índice `INDICE.md`.
  - Escritorio a 1440 px y teléfono a 390 px, ambos a 2x.
  - Las vistas de teléfono representan la Web adaptable, no Flutter.
  - `laboratorio.png` no forma parte de la Web.
  - Las láminas guían la presentación. Los contratos vigentes y las reglas aprobadas definen el comportamiento.

## 2. Ramas y worktrees

| Sesión | Rama | Worktree | Estado |
|---|---|---|---|
| Orquestador | `feat/web-rediseno-v2` (integración) | `_wt/WEB2-INT` | base `e8a440f` |
| BASE (agente del orquestador) | `feat/web-rediseno-v2-base` | `_wt/WEB2-BASE` | tema, tipografía, componentes, armazón y navegación, acceso y aviso al agricultor |
| A: consulta y propuestas | `feat/web-rediseno-v2-a` | `_wt/WEB2-A` | se crea desde la base visual publicada |
| B: compras conjuntas | `feat/web-rediseno-v2-b` | `_wt/WEB2-B` | ídem |
| C: catálogo y administración | `feat/web-rediseno-v2-c` | `_wt/WEB2-C` | ídem |

## 3. Responsables y archivos

Rutas bajo `Web/src/`. Nadie edita archivos de otro. Pruebas nuevas junto a su archivo. Adaptar una prueba existente sólo cambia cómo se llega o un texto renombrado, **nunca** lo que se comprueba, y se declara. Las pruebas de permisos no se debilitan ni se eliminan.

| Sesión | Archivos |
|---|---|
| **Orquestador / BASE** | `App.tsx`, `main.tsx`, `index.css`, `components/ui/**`, `components/app-shell.tsx`, `components/collective-ui.tsx`, las guardas (`private-route`, `collective-route`, `admin-route`, `redirect-with-query`, `legacy-directiva-redirect`), `lib/navigation.ts`, `contexts/**`, `pages/login.page.tsx`, `pages/web-not-for-farmers.page.tsx`, `test/**`, `package.json`/lock, `public/**`, fuentes y licencias, `docs/rediseno-web/**` |
| **A** | `pages/collective-summary.page.tsx`, `coverage.page.tsx`, `joint-proposal.page.tsx`, `estimation.page.tsx`, `estimation-copy.page.tsx`, `history.page.tsx`, `collective-trends.page.tsx`; `components/coverage-card.tsx`, `estimation-copy-view.tsx`, `estimation-figure.tsx`, `needs-bars.tsx`, `seal-panel.tsx`, `export-buttons.tsx`; nuevos `components/a/**` |
| **B** | `pages/joint-purchase-calls.page.tsx`, `joint-purchase-call-detail.page.tsx`, `joint-purchase-call-form.tsx`, `substitution-permissions-section.tsx`; `lib/joint-purchase-call-text.ts`; nuevos `components/b/**` |
| **C** | `pages/catalog.page.tsx`, `products.page.tsx`, `product-reconciliation.page.tsx`, `product-identification.page.tsx`, `campaigns.page.tsx`, `campaign-detail.page.tsx`, `campaign-dates.ts`, `users.page.tsx`, `audit-logs.page.tsx`; `components/product-form.tsx`; nuevos `components/c/**` |
| **Nadie** | `services/**` y `types/**`. Las llamadas, contratos y validaciones se conservan; si hace falta algo nuevo, se pide al orquestador con el caso concreto. Tampoco se tocan `Back/**`, `src/dev/**` (prototipos de laboratorio fuera de producción) ni Flutter |

**Solicitudes:** un componente, token, ruta o cambio en un archivo ajeno se pide al orquestador en el informe de la entrega, o por mensaje si bloquea. Mientras tanto, se usa un widget privado en el archivo propio. Un componente reutilizable puede ir en `components/<a|b|c>/`; el orquestador decide si lo promueve a `components/ui/`.

## 4. Contratos de componentes compartidos

Los publica BASE en `components/ui/README.md`, con firma, variantes, accesibilidad y ejemplo de cada componente. Mientras se construye, valen los del rediseño v1 (`docs/web-rediseno/01_CONTRATO_COMPARTIDO.md` §3). Las sesiones adoptan **sólo** los componentes publicados y no crean duplicados.

## 5. Reglas funcionales (prevalecen sobre las láminas)

- **Web sólo para Directiva y Administración.** El AGRICULTOR sólo ve el aviso de la app móvil, con «Cambiar de cuenta» y «Cerrar sesión». Usuarios sigue con los permisos actuales de Administración. No vuelven las páginas del agricultor, el Calendario ni el panel antiguo de compras y pagos. Las redirecciones de rutas antiguas se conservan.
- **Exportación:** sólo Excel; no se reintroduce CSV.
- **Llamadas reales:** se conservan las llamadas, validaciones y reglas. Nada de datos fijos ni botones decorativos. Las cifras siguen los estados del servidor: oculta no es cero, ausencia no es cero. La Web no calcula diferencias ni porcentajes sin comparabilidad autorizada, no suma la estimación a la necesidad y no recupera datos restringidos con cálculos propios.
- **Estimación:** se conservan la referencia fijada al borrador y sus estados, el alcance de cada cifra, los métodos, parámetros, fuentes e historial en el detalle técnico, y las condiciones de sesión de la copia sin conexión.
- **Convocatorias:**
  - crear una convocatoria no ejecuta compras, no genera deudas ni toca inventarios;
  - se conservan el origen y la selección originales (E3-P2), el cierre automático, los estados y el consolidado;
  - administración, consulta de participantes y consentimiento individual van separados;
  - el cierre no garantiza ver todos los totales: la visibilidad sigue al servidor por usuario y producto.
- **P-A:**
  - hace falta un permiso específico para sustituir;
  - la sucesora debe estar habilitada y ser del sindicato;
  - no hay autosustitución;
  - se exigen motivo y auditoría;
  - las delegaciones quedan suspendidas hasta su revisión;
  - no hay acceso retroactivo;
  - autorizar no cambia cantidades ni reabre la convocatoria.
- **Catálogo e identificación:**
  - las fotos son privadas y se ven con acceso autorizado;
  - no se revela quién envió una solicitud si el contrato lo prohíbe;
  - una sugerencia nunca pasa a vínculo automático;
  - se conserva la confirmación del agricultor;
  - «Corregir vínculo» sólo se implementa si existe esa operación; si no, se documenta la diferencia.
- **Sin cambios en Backend, permisos ni contratos para parecerse a una lámina.** Si falta una capacidad, se registra la diferencia y se sigue con lo independiente.

## 6. Calidad visual (todas las sesiones)

- **Tamaños y estados:**
  - escritorio amplio (1440), portátil (1280) y tablet (820);
  - teléfono por ancho de navegador (390): eso no es un teléfono físico;
  - zoom al 200 %, teclado y foco visible;
  - nombres largos, cifras grandes, unidades mezcladas, listas extensas, vacío y error.
- **No se admite:**
  - texto encimado o controles recortados;
  - botones fijos que tapen la última fila;
  - desplazamiento horizontal de la página entera;
  - alturas rígidas;
  - información que sólo se ve al pasar el ratón.
- **Tablas:** el encabezado sigue asociado a su valor. En pantallas estrechas se usan tarjetas o un desplazamiento local.
- **Diálogos:** foco al abrir, Esc o «Cancelar» para cerrar, y el foco vuelve al control que lo abrió. Se conservan los borradores y las confirmaciones existentes.
- **Diferencias con las láminas:** no se copian defectos gráficos del PNG. Las diferencias intencionales se registran en la matriz.

## 7. Recursos, puertos y servicios

- **Entorno aislado (propio, ya en marcha):**
  - PostgreSQL `agro_et1_pg` en 15434, base sintética `agro_demo`, que **no** es la DEMO oficial;
  - API en 3350 (Back de `49ed870`, igual al de la base);
  - variables en `_wt/ET2-BE/tool/etapa3/e3env.sh`.
- **Web de revisión del orquestador:** Vite en **5177** desde `_wt/WEB2-INT`, con proxy a 3350.
- **Las sesiones no levantan servidores.** Para capturas usan su propio Vite **sólo en el puerto asignado** (A 5181, B 5182, C 5183, BASE 5180), contra la API 3350, y lo detienen al terminar. El límite de autenticación es de 20 por minuto: se navega con `pushState` y se reutiliza la sesión.
- **Fuera de alcance:** la DEMO oficial (3330/5190), el entorno móvil (3370/15436, `emulator-5556`), 5175 (Vite de ET2-BE) y los servicios de otras sesiones. No se detienen.
- **Carga del equipo:**
  - cada sesión ejecuta un proceso pesado a la vez (`vitest` focalizado, `tsc`, `eslint` de lo tocado);
  - la suite completa y el build final los hace el orquestador, de uno en uno;
  - nada de `npm install` de paquetes nuevos sin acuerdo; `npm ci --prefer-offline` sólo en el worktree propio.
- **Commits:** locales, con la identidad git configurada y **sin trailers**. Sin push ni PR.

## 8. Matriz

`docs/rediseno-web/MATRIZ_LAMINAS.md`: lámina → ruta/componente → rol/estado → sesión → implementación → prueba → captura.

## 9. Entregas, revisiones e integraciones

| Fecha | Qué | Commit | Notas |
|---|---|---|---|
| 2026-11-13 | Base `e8a440f` y este documento | `50aa672` | Suite de la Web en la base: 54 archivos, 589/589 |
| 2026-11-13 | Inventario: matriz, hallazgos y tareas | `b9fd3d3` | Sólo lectura. Decisiones del autor: H-10, H-11 y H-08 (provisionales según la propuesta) |
| 2026-11-13 | BASE integrada | `77195bf` (fusión de `1b15cc3`) | Según la sesión: 633/633, tsc limpio, eslint 0 errores (7 avisos previos), build correcto. Revisión: la franja superior de escritorio no está en las láminas y vuelve a BASE para quitarla |
| 2026-11-13 | Encargo común y arranque de A, B y C | `c9abb34` | Ramas `feat/web-rediseno-v2-{a,b,c}` desde `77195bf` |
| 2026-11-13 | Correcciones de BASE (franja superior, fuentes sin conexión, zoom y tableta) | `76beffd` | Revisadas con captura |
| 2026-11-13 | Reinicio del equipo | — | Docker y los servicios se relevantaron. Las sesiones se reanudaron tras un 403 transitorio de la API del modelo |
| 2026-11-13 | C integrada | `ed048cd` | Revisada contra la lámina 28 |
| 2026-11-13 | B y A integradas, y U.4 en Usuarios | `284174a`, `e02972f`, `016b0d3` | Revisadas contra la lámina 11. Recorrido del orquestador: 96 de 96 sin observaciones (`e286b9f`) |
| 2026-11-13 | BASE, rondas 2 y 3 | `0945dd1` | Margen del héroe, Stepper, desplazamiento, cámara, pestañas en píldora, `DataTable`, `PageHeader` pegado, `Dialog` a pantalla completa, `QuantityFigure` y `CampaignPill` |
| 2026-11-13 | Adopción en C, B y A, y correcciones del orquestador en `PageHeader` y `Tabs` | `5c6f867`, `d6485b9`, `06283da` | — |
| 2026-11-13 | **Comprobaciones sobre `06283da`** | — | `tsc` 0; `eslint` 0 errores (7 avisos previos); `vite build` correcto (5 fuentes precacheadas); `vitest` **69 archivos, 700/700** |
| 2026-11-13 | Verificación con escritura y comparativas | `1483b78` | Recorridos con la API real y 51 comparativas. Defectos V-1…V-5 y D6 |
| 2026-11-13 | Correcciones: V-5 y V-2 (orquestador), D6 y V-2 (C), V-1 y V-3 (A) | `690cbfa`, `dae88df`, `1b7fbb4` | V-4 («KG») queda como diferencia intencional (E3-R8). Comprobado de nuevo en el navegador (`orquestador/recheck_v.json`) |
| 2026-11-13 | **Comprobaciones finales sobre `1b7fbb4`** | — | `tsc` 0; `eslint` 0 errores (7 avisos previos); build correcto; `vitest` **69 archivos, 706/706**; recorrido 96/96 sin observaciones |
| 2026-11-13 | Entrega para la revisión del autor | — | `docs/rediseno-web/ENTREGA.md` |
