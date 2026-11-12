# Material de entrada para el rediseño de la Web de Agrocuentas

Material para rediseñar la Web de la Directiva en Claude Design y revisarlo en ChatGPT. Recoge la **interfaz real** de la composición actual, recorrida y capturada el 2026-11-12, con datos sintéticos. No es una propuesta de diseño.

## Orden de lectura

1. **[BRIEF_CLAUDE_DESIGN.md](BRIEF_CLAUDE_DESIGN.md)**: quién usa la Web, tareas, reglas que el diseño debe conservar y objetivo visual. Es breve; si se lee una sola cosa, que sea esta.
2. **[INDICE_CAPTURAS.md](INDICE_CAPTURAS.md)**: las capturas por recorrido, con ruta, rol y estado.
3. **[INVENTARIO_VISTAS.md](INVENTARIO_VISTAS.md)**: cada pantalla con sus pestañas, diálogos y estados; roles, datos y acciones.
4. **[DIAGNOSTICO_ACTUAL.md](DIAGNOSTICO_ACTUAL.md)**: problemas visuales, funcionales y faltantes de la API, con ejemplos.
5. **[LIMITACIONES.md](LIMITACIONES.md)**: qué no cubre este material.

## Versiones

| Pieza | Valor |
|---|---|
| Composición | Rama `feat/etapa3-estimacion-borrador`, commit **`9dc80f0`** (worktree `_wt/ET2-BE`), **más** la limpieza **`741e730`** y **`754cb25`** de la rama `chore/web-solo-institucional` (worktree `_wt/WEB-SOLO-INST`): la Web es sólo de Directiva y Administración y se retiraron las vistas del agricultor. Este paquete está en la rama `docs/web-redesign-input`, que parte de `9dc80f0` e integra esa limpieza (worktree `_wt/WEB-DESIGN-INPUT`) |
| Web en ejecución | Servidor de desarrollo Vite en `127.0.0.1:5175`, que sirve el árbol de `_wt/ET2-BE` en `9dc80f0` (sin cambios locales en `Web/src`), para las capturas institucionales. La limpieza no cambia ninguna pantalla institucional; el aviso del agricultor (`01_acceso/03`) y la verificación de acceso por rol se hicieron con Vite en `127.0.0.1:5176` sobre `741e730`. No es un build de producción |
| API en ejecución | NestJS en el puerto 3350, desde el `dist` compilado el 2026-11-12 a las 12:03 a partir de `49ed870`. Entre `49ed870` y `9dc80f0`, `Back/src` sólo añade una prueba (`joint-purchase-calls.postgres.spec.ts`): el código de la API en ejecución es el de la composición |
| Base | PostgreSQL del contenedor aislado `agro_et1_pg` (puerto 15434, sólo en `localhost`, base `agro_demo`), con 23 migraciones aplicadas; la última es `20261112180000_e2_pa_responsible_substitution` |
| Datos | Sintéticos: el sindicato «Sindicato DEMO · datos sintéticos», con 15 cuentas de agricultor, 5 de Directiva y 2 de Administrador, 12 campañas «Invierno 2015–2026 (DEMO)», convocatorias en todos los estados, productos por identificar y estimaciones. No hay datos reales ni de la DEMO oficial |
| Navegador | Microsoft Edge sin interfaz (Puppeteer), idioma `es-BO`, zona `America/La_Paz` |

### Código frente a proceso

- El **código** de la composición es `9dc80f0`.
- Los **procesos** que se capturaron son Vite, que sirve ese árbol, y la API compilada desde `49ed870`, con la misma lógica de `Back/src`.
- No se volvió a compilar nada para esta preparación.

## Composición: funcionalidades presentes

Se comprobó en Git que `9dc80f0` contiene `main` (`5973b49`) y `feat/web-rediseno-integracion` (`11bffd7`), con `git merge-base --is-ancestor`. También se revisaron todas las ramas locales y remotas con commits que no están en `9dc80f0`. Las que tocan `Web/src` o `Back/src` **no se integraron**, por estos motivos:

| Rama | Contenido | Motivo para no integrarla |
|---|---|---|
| `feat/ux-web-menu-avisos-csv` (9 commits, 2026-10-30) | Menú agrupado, avisos y CSV | Superada: el rediseño Web rehízo el menú y el CSV se retiró a favor de Excel (`eeaf327`, `7acf0a1`) |
| `feat/directiva-agricultores-sincronizacion` (`7fd3365`) | Estado de sincronización **por agricultor** | No aprobada: `F10_SEC_02_ROUTES.md` limita #25 a la cobertura agregada; el detalle por agricultor queda bloqueado por la política de divulgación |
| `feat/f07-variante-necesidad-inmediata` (`46565f3`) | Variante experimental «threshold-only» | Ensayo, no adoptado |

No hizo falta crear una rama de composición: todo lo terminado está en `9dc80f0`. No hubo conflictos.

| Funcionalidad | Commits principales (todos en `9dc80f0`) | Presente | Capturas |
|---|---|---|---|
| Rediseño Web previo (navegación, Resumen, Campañas, Necesidades, Catálogo) | `feat/web-rediseno-integracion` (`11bffd7`); fusiones `57e79e8`, `acab450` y `5ea1616` | Sí | todas |
| Identificación de productos y fotos | `f395fcd` (Back), `9672b80` (Web), `71f17de` (validación de la foto) | Sí | `07_catalogo/04`–`09` |
| Catálogo y equivalencias | `1499e07`, `72b45c7` (Web del rediseño) | Sí | `07_catalogo/01`–`03`, `10`, `11` |
| Convocatorias y participación | `74bae31` (Back), `f42ffe2` (Web) | Sí | `05_convocatorias/*` |
| Colaboradores y permisos por convocatoria | `0db2d0f` (Back), `5d760b6` y `b77965e` (Web) | Sí | `05_convocatorias/02`, `07`; `06_permisos_psa/*` |
| Consentimiento separado de las cantidades (P-C) | `1ff5ccf` (Back), `5b394f2` | Sí | `05_convocatorias/02`, `06_permisos_psa/03`, `05` |
| Sustitución de la persona responsable (P-A) | `49ed870` (Back), `3fab972` y `8cc8c4f` (Web) | Sí | `06_permisos_psa/*` |
| Estimación integrada en las propuestas (referencia fijada, E3-P1) | `f673f95` (Back), `2a25386`, `3b2099b` y `219d959` (Web) | Sí | `03_propuestas/02`, `03`, `07`, `08` |
| Origen de la convocatoria (E3-P2) | `c87c352`, `fa44b5f` (Back), `91e9ef2` (Web) | Sí | `05_convocatorias/04`, `10` |
| Exportación Excel y retirada del CSV | `eeaf327` (Back: rutas CSV retiradas), `7acf0a1` y `d5dc9cc` (Web) | Sí | `04_excel/*` y «Descargar Excel» en las pantallas |
| Web sólo de Directiva y Administración (vistas del agricultor retiradas; aviso para la cuenta AGRICULTOR) | `741e730` (rama `chore/web-solo-institucional`) | Sí | `01_acceso/03` |
| Página heredada `directiva.page.tsx` (sin ruta) retirada; Calendario revisado, con su retirada recomendada y pendiente del autor | `754cb25`, `b1bed3f` | Sí | sin cambios en las capturas |

La Web **no tiene ninguna exportación en PDF**: el PDF existe sólo en la app móvil.

## Comprobaciones hechas

- **Git:** contención de `main` y de la integración del rediseño; revisión de las ramas con commits fuera de la composición; ningún cambio local en `Web/src` ni en `Back/src`.
- **Entorno:** API 3350 con health 200; Web 5175 con 200; 23 migraciones aplicadas. Sin túnel y sin exponer PostgreSQL.
- **Capturas:** 109 PNG (102 de la Web, de ellas 17 de estados no reales rotulados, y 7 de Excel), revisadas en hojas de miniaturas. Un detector de la pantalla de inicio de sesión confirmó que ninguna captura con sesión quedó en `/login` (las primeras rondas sí; se rehicieron, ver LIMITACIONES). El índice coincide con los archivos.
- **Acceso por rol tras la limpieza (`741e730`):** Web completa 586/586, `tsc` y build correctos. En el navegador, una cuenta AGRICULTOR, al iniciar sesión y por 14 URL directas, sólo ve el aviso, sin consultas institucionales; Directiva y Administración entran con normalidad (evidencia `docs/evidence/WEB_SOLO_INSTITUCIONAL_2026-11-12.md`).
- **Excel:** el borrador actual se descargó desde la Web y se abrió en Microsoft Excel. Se capturó cada hoja y se registró el filtro y el panel inmovilizado (`capturas/04_excel/_excel_abierto_borrador.json`).
- **Datos sensibles:** sin contraseñas (se fijaron claves de un solo uso en la base aislada y nunca se escribieron en archivos), sin tokens ni datos reales. Se recortó la barra de título de Excel, que mostraba la cuenta de Office del equipo. Los correos visibles son sintéticos (`@example.test`).
- **Enlaces y ZIP:** ver la entrega.

## Operaciones hechas en el entorno sintético para poder capturar

Todas por la API real o la Web del entorno aislado, nunca en la DEMO oficial:

- solicitudes de identificación nuevas de un agricultor sintético, una con una foto de etiqueta generada para la prueba;
- una convocatoria de demostración con nombre largo y su responsable inhabilitada;
- la cancelación de una convocatoria de prueba;
- un borrador nuevo con «Generar borrador» y su referencia con «Obtener referencia»;
- una selección guardada;
- una solicitud dejada pendiente con nota;
- una copia de la estimación descargada en el navegador.

Los diálogos de creación (convocatoria, campaña, producto, usuario, permiso, sustitución) se capturaron **sin enviar**.

## Cómo regenerar

Las herramientas están en `tool/web_design/` de esta rama:

- `capture.mjs`, con los planes `plan_*.mjs`;
- `indice.py`, que genera el índice.

Las variables de entorno salen de `tool/etapa3/e3env.sh` de `_wt/ET2-BE`. Los IDs de los planes son del entorno aislado de esta fecha.

**Trampas del entorno:**
- La autenticación está limitada a 20 por minuto, y si el refresco de sesión falla, la Web cierra la sesión. Hay que navegar dentro de la aplicación, no recargar.
- La captura «móvil» debe cambiar sólo el ancho: si se activa la emulación táctil, Puppeteer recarga la página.
