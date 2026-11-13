# Rediseño de la Web (v2): sesión C (catálogo y administración), evidencia del 2026-11-13

- **Rama y worktree:** `feat/web-rediseno-v2-c` en `_wt/WEB2-C`, desde `77195bf` (BASE integrada) más la fusión de `76beffd` (correcciones de BASE).
- **Código verificado:** `779eea3`.
- **Alcance:** láminas 21–24, 28–34 (salvo 30.3, de A, incrustado sin editar; y 34.1–34.2, de B), 39, 41, 42, 44 y 47.
- **Fuera de alcance:** no se cambian Backend, permisos, contratos, `services/**` ni `types/**`. Sin push ni PR.

## 1. Verificación (2026-11-13, carpeta `Web/`, sobre `779eea3`)

| Comando | Resultado |
|---|---|
| `npx tsc -b` | sin errores (código de salida 0) |
| `npx eslint src/components/c src/components/product-form.tsx` + las 9 páginas de C + `src/pages/*.test.tsx` | sin avisos (0) |
| `npx vitest run` de los 12 archivos de C y de rutas/roles (`products`, `catalog`, `product-reconciliation`, `product-identification`, `campaigns`, `campaign-detail`, `campaign-dates`, `users`, `audit-logs`, `routes-roles`, `web-access-by-role`, `substitution-permissions-section`) | 12 archivos, 128 pruebas, todas pasan |

La suite completa y el build no se ejecutaron aquí: los corre el orquestador.

## 2. Capturas

- **Entorno:** Vite propio en 5183 (`VITE_API_PROXY_TARGET=http://127.0.0.1:3350`) contra la API aislada 3350 y la base sintética `agro_demo` (15434). No es la DEMO oficial.
- **Herramienta:** `tool/web_rediseno_v2/capture_base.mjs` (de BASE, sin cambios), con los planes `plan_c_vistas.mjs` y `plan_c_repaso.mjs`. Edge sin interfaz, zona horaria America/La_Paz.
- **Datos:** los sintéticos existentes, comprobados antes con `tool/web_rediseno_v2/inspect_c.mjs` (sólo lectura): 6 solicitudes por identificar (1 con foto, 1 con nota), 3 identificadas, 1 campaña abierta y activa, 11 cerradas y selladas, 13 productos activos, 1 unión vigente, 22 cuentas. **No se creó ni modificó nada** en la aplicación: los diálogos se abrieron y se cerraron sin enviar. La herramienta fija contraseñas de un solo uso para iniciar sesión, como en BASE; no se imprimen ni se capturan.
- **Índice:** `_capturas.json` (ruta, rol, descripción y si es simulada).
- **SIMULADO:** `estados/21-productos-error__SIMULADO` (500 en productos), `estados/32-bitacora-ocupado__SIMULADO` (429) y `dialogos/33.5-foto-no-disponible__SIMULADO` (404 de la foto). La foto real de la etiqueta es privada: no se fotografía para la evidencia.
- **Desplazamiento horizontal** (paso `measure`): sin desbordamiento a 390 px en catálogo (tres vistas), campañas, bitácora y usuarios, y al 200 % (720 px) en catálogo y campañas.

| Lámina | Captura | Lo que se vio al compararla |
|---|---|---|
| 21 Catálogo · Productos | `catalogo/21-productos__{escritorio,portatil,tableta,movil}` | Igual a la lámina: búsqueda, «Por categoría / Por unidad / Sin agrupar», tarjetas por categoría en dos columnas, recuadro kg (ámbar) / L (gris), Editar e Inactivar. Los grupos van en orden alfabético |
| 21 inactivos | `catalogo/21-productos-inactivos` | Lista de sólo lectura abierta; la base no tiene productos inactivos: estado vacío real |
| 22 Nombres equivalentes | `catalogo/22-*` | Igual: tarjeta oscura con la unión (alias → nombre principal, fecha y quién), Corregir…/Separar…, «Historial de cambios», nombres sueltos con «Unir con…» y la nota del nombre principal excluido |
| 23 Por identificar | `catalogo/23-*` | Lista con «Falta información» y «con foto»; panel con «El agricultor lo llamó», datos, recuadro de la foto, las tres opciones, parecidos con su grado, búsqueda, motivo y casilla; botón desactivado hasta cumplirse |
| 24 Ya identificados | `catalogo/24-*` | Igual: filas «Identificado como … · fecha» y panel «Corregir la identificación» con producto correcto, motivo, texto de consecuencias y casilla. Sin «Directiva DEMO» en la fila (H-12) |
| 28 Campañas | `campanas/28-campanas__*` | Tarjeta oscura de la activa, «Otras campañas» con Cerrada y «Sellada · versión 1» y el aviso final. La tarjeta pone fechas y acciones en una segunda franja |
| 29 Detalle | `campanas/29-detalle-activa__*`, `29-detalle-sellada__*` | Igual: cabecera oscura con «← Campañas», chips, fechas, Editar / Cerrar campaña… / Ver resumen; Participación «14 de 15» con barra; Versión de las cifras con la línea de pasos y el panel de sellado de A; Borradores de compra con «Abrir el más reciente» |
| 30.1, 30.2, 30.4–30.6 | `dialogos/30.*` | Iguales en campos y botones; el botón de la acción queda desactivado hasta cumplir las condiciones |
| 31 Usuarios | `usuarios/31-*` | Filtros por rol con recuento, búsqueda, «(usted)», rol y estado, Editar/Contraseña/Desactivar; a la derecha el permiso «Sustituir responsable» (componente actual de B, plegado) |
| 32 Bitácora | `bitacora/32-bitacora__*` | Agrupada por día («Hoy», «Ayer»), hora, icono por tipo, texto del servidor, «persona · campaña o ámbito» y «Detalle» |
| 33.1–33.4 | `dialogos/33.*` | Iguales; el correo de «Editar usuario» va bloqueado (H-13) |
| 34.3–34.6 | `dialogos/34.*` | Iguales; la unidad y el estado van bloqueados |
| 39, 41, 42, 44, 47 (teléfono) | `*__movil`, `telefono/*` | Cabecera oscura pegada a la barra con la acción en lima; pestañas del catálogo; listas en tarjetas; «Más filtros» en la Bitácora |
| Foco | `foco/21-foco-teclado` | Anillo de foco visible con el teclado |
| Zoom 200 % | `zoom200/*` | Sin texto encimado ni controles recortados |

**Artefacto de la herramienta:** en algunas capturas de página entera la barra lateral aparece desplazada hacia abajo. Es la barra fija dibujada en la posición de desplazamiento que dejó la vista anterior (la herramienta navega con `pushState`), no un defecto de la vista.

## 3. Comportamiento conservado y cómo se comprobó

- Llamadas reales y sus cuerpos: pruebas de cada vista (crear/editar/inactivar producto, unir/corregir/separar, link/create-product/defer, crear/editar/abrir/cerrar campaña, crear/editar/contraseña/desactivar usuario).
- Confirmaciones: motivo y casilla obligatorios en identificar, unir, separar y corregir (H-16); «Volver» no envía nada.
- Sugerencias nunca elegidas por defecto ni convertidas en vínculo (prueba «Nada viene elegido»).
- La foto sólo se pide al pulsar «Ver la foto», como blob, y su URL local se revoca al cerrar (pruebas de la foto).
- Nunca se muestra quién reportó (prueba sin `request_id` ni correos).
- `notifyIdentificationChanged()` tras cada decisión (pruebas de vincular y corregir, U.5).
- Una sola lectura del resumen por visita del detalle (StrictMode) y una sola de `GET /collective/trends` en Campañas (H-25); sin cobertura en la lista (H-18).
- Usuarios: la Directiva no entra (`AdminRoute`) y no se piden las cuentas; nadie se desactiva ni se quita el rol de administrador.
- Bitácora: sólo las filas del servidor (H-08); campaña, persona y fechas van al servidor.
