# Rediseño de la Web (v2): entrega para la revisión del autor

**Fecha real:** 2026-11-13.

**Estado:** implementado, integrado y verificado. La aceptación visual y funcional del autor está **pendiente**: que las pruebas pasen no equivale a esa aceptación.

## 1. Rama y composición
- **Rama de integración:** `feat/web-rediseno-v2`, en el worktree `_wt/WEB2-INT`.
  - Es local: sin push, sin PR, sin fusión a main y sin despliegue.
  - **Código probado: `d9ab720`** (último cambio de código: `1e295a9`). Los commits posteriores sólo añaden documentación y evidencia.
- **Base:** `e8a440f`, es decir, `chore/web-solo-institucional` `cff4fbd` más la documentación `1f529b7`. Contiene:
  - la Web limpia, sin vistas del agricultor, sin `directiva.page` y sin Calendario;
  - las etapas 1–3, P-A y Excel;
  - el rediseño v1.
- **Backend:** sin cambios en este encargo. La API aislada ejecuta el `dist` de `_wt/ET2-BE`. Su `Back/src` es igual al de la base.
- **Integraciones:**

  | Pieza | Commits |
  |---|---|
  | BASE | `77195bf`, `76beffd`, `0945dd1` |
  | C | `ed048cd`, `dae88df` |
  | B | `284174a`, `d6485b9` |
  | A | `e02972f`, `06283da`, `1b7fbb4` |
| Correcciones menores de C (D5, D12) | `d9ab720` |
  | Uniones y correcciones del orquestador | `016b0d3`, `5c6f867`, `690cbfa` |
  | Verificación | `1483b78` |

  El detalle está en `COORDINACION.md` §9.

## 2. Cómo acceder (entorno aislado, datos sintéticos)
- **Web:** `http://127.0.0.1:5177`. Es el Vite de `_wt/WEB2-INT`, con proxy a la API `http://127.0.0.1:3350`, que usa PostgreSQL `agro_et1_pg` en el puerto 15434 con la base `agro_demo`.
  - **No es la DEMO oficial:** ésa está en 3330/5190 y no se tocó.
- **Cuentas sintéticas:**
  - `directiva.demo@example.test` (Directiva);
  - `admin.demo@example.test` (Administración);
  - `agricultor3.demo@example.test` (agricultor; sólo ve el aviso);
  - para P-A: `responsable.pa`, `sucesora.pa` y `admin2.pa`, todas `@example.test`.
- **Contraseñas:**
  - no hay contraseñas fijas en ningún archivo, y las herramientas fijan una de un solo uso en la base aislada sin mostrarla;
  - para entrar a mano: `bash _wt/ET2-BE/tool/etapa2/et2.sh password-pipe <rol> | clip`. Fija una contraseña de un solo uso en la base aislada y la deja en el portapapeles, sin mostrarla en pantalla ni escribirla en archivos. Los roles están en la cabecera del script.
- **Arranque tras un reinicio:**
  1. `bash _wt/ET2-BE/tool/etapa2/et2.sh up`. Repítalo si el primer arranque falla porque la base todavía está iniciándose.
  2. `cd _wt/WEB2-INT/Web && VITE_API_PROXY_TARGET=http://127.0.0.1:3350 npx vite --host 127.0.0.1 --port 5177 --strictPort`.

## 3. Matriz de las 51 láminas
`MATRIZ_LAMINAS.md` relaciona cada lámina con:
- la ruta o el componente, el rol o estado y la sesión;
- en §Seguimiento, la implementación, la prueba y la captura.

Las 51 láminas están implementadas. Las que no tienen captura con la API real están cubiertas por pruebas y se enumeran en §7.

## 4. Comparativas
`docs/evidence/rediseno-web-v2/comparativas/NN.png` pone cada lámina al lado de su implementación. El veredicto de cada una está en `comparativas/README.md`: 8 coinciden, 43 coinciden con diferencias documentadas o debidas a los datos, y ninguna no coincide.

Capturas por área: `docs/evidence/rediseno-web-v2/{base,a,b,c,verificacion,orquestador}/`, cada carpeta con su README.

## 5. Pruebas sobre el código final `d9ab720`

| Comprobación | Resultado |
|---|---|
| `npx tsc -b` | sin errores |
| `npx eslint .` | 0 errores; 7 avisos, los mismos de la base |
| `npx vite build` | correcto; el service worker precachea las 5 fuentes |
| `npx vitest run --no-file-parallelism` | **69 archivos, 708/708** (la base tenía 589) |
| Recorrido del orquestador, `recorrido_o.mjs` con la API real | Directiva, Administración y Agricultor, 22 rutas, a 1440 y 390 px: **96 comprobaciones sin observaciones**. Sin errores de consola, llamadas fallidas, escrituras al cargar ni desplazamiento horizontal. Las redirecciones antiguas funcionan y el agricultor sólo ve el aviso (`orquestador/recorrido_final_d9ab720.json`) |
| Verificación con escritura, API real, sobre `06283da` | Está en `verificacion/README.md`: |
| | • **Acceso por rol:** el agricultor ve sólo el aviso, sin llamadas de datos. |
| | • **Excel:** 4 archivos XLSX válidos y ninguna opción CSV. |
| | • **Convocatoria «Recorrido v2 (sintética)»:** creada, abierta y cerrada sin compras, deudas ni inventario. |
| | • **Participantes:** se piden sólo con permiso. |
| | • **P-A:** sin autosustitución; motivo y casilla obligatorios; permiso concedido y retirado. |
| | • **Identificación con foto:** una solicitud identificada; la foto se carga sólo con la sesión. |
| | • **Diálogos, uniones, teclado y foco**, y **390 px y zoom al 200 %**. |
| | Los defectos que encontró (V-1, V-2, V-3, V-5) se corrigieron y volvieron a comprobarse en el navegador sobre `1b7fbb4` (`orquestador/recheck_v.json`) |

«Teléfono» significa aquí un navegador a 390 px de ancho. **No** se probó en un teléfono físico ni con un lector de pantalla real.

**Datos sintéticos creados o cambiados durante la verificación:**
- la convocatoria «Recorrido v2 (sintética)», creada, abierta y cerrada;
- un permiso de sustitución concedido y retirado a Sucesora PA;
- una solicitud de identificación identificada; la insignia pasó de 6 a 5;
- un permiso de B concedido y retirado para la lámina 17;
- contraseñas de un solo uso.

## 6. Diferencias intencionales con las láminas
Todas están documentadas con detalle en los README de evidencia de cada sesión.

**Reglas o contratos que ganan a la lámina**
- **Datos que las láminas muestran y la API no da:**
  - el máximo destacado del Histórico (H-10);
  - el chip «Responsable no habilitada» en la lista (H-11);
  - acciones que la Bitácora no registra (H-08);
  - quién identificó en la fila (H-12);
  - la edición del correo (H-13);
  - la reactivación de productos (H-19);
  - los conteos en el diálogo de sellar (H-04).
- **Estimación (E3-R7, E3-R8):** sin porcentaje; redondeada a la décima con la cifra exacta visible.
- **Unidad:** «KG» en mayúsculas, como en los contratos (E3-R8), y no «kg» como en las láminas.
- **«Datos sintéticos»:** sólo en las vistas con respuesta colectiva (H-03). No se ve en Compras conjuntas, Catálogo, Campañas, Usuarios ni Bitácora.
- **Aviso al agricultor:** conserva sus textos vigentes; la redacción de la lámina 02 es otra. Sin enlace de descarga.
- **Botones primarios:** desactivados hasta cumplir el motivo y la casilla (H-16).
- **Nueva convocatoria:** permitida también con campaña PLANIFICADA, según el contrato N1.

**Accesibilidad y legibilidad**
- Bordes de campo más marcados, con contraste 3,5:1.
- Campos de ingreso a 16 px.
- La foto se pide sólo al pulsar «Ver la foto».
- Las tablas pasan a tarjetas en estrecho.

**Presentación**
- **Cabeceras:** el título de `PageHeader` es `sm:text-4xl` y no `5xl`. Las vistas de C llevan la cabecera oscura en teléfono y clara en escritorio.
- **Teléfono:** la sustitución (49) y el formulario (45) son diálogos a pantalla completa, sin la «X»; se cierran con Cancelar o Esc. En «Más» se marca la sección actual.
- **Listas y filtros:**
  - la Bitácora agrupa por tipo de acción, filtrado en el navegador;
  - Campañas cuenta sólo las filas que lista;
  - Compras conjuntas filtra en el navegador con contadores.
- **Datos:** los nombres y números son los de la base sintética real, no los de las láminas.

## 7. Pendientes concretos
1. **Decisiones del autor**, aplicadas mientras tanto según la propuesta:
   - **H-10:** no se destaca el máximo del Histórico y se añade la cobertura de cada campaña.
   - **H-11:** «Responsable no habilitada» sólo en el detalle.
   - **H-08:** registrar más acciones en la Bitácora exige cambiar el Backend, fuera de este encargo.
2. **Estados sin datos en la API real:** capturados con respuestas **simuladas**, con «SIMULADO» en el nombre y fixtures de las propias pruebas, sin campos inventados (`verificacion/simulados/`):
   - Resumen 05 §2–§5, §10, §11 y §12 (seis estados de la referencia);
   - el diálogo de sellado 30.3, sin ningún envío;
   - U.8;
   - productos inactivos.

   Siguen sin imagen sólo 05 §6 («sin conexión», cubierto por pruebas) y la foto real (33.5), que es privada.
3. **Mejoras menores anotadas en `comparativas/README.md`:**
   - D5 (recuentos de las pestañas del catálogo) y D12 («Se muestran N de M»): **corregidos** en `1e295a9`;
   - D10: la responsable empieza en «Seleccione…»; elegirse a sí misma sigue siendo explícito;
   - el anillo de foco en el segundo subcampo de `datetime-local`, que es nativo del navegador.
4. **Ni teléfono físico ni lector de pantalla real.**
5. **Sin fusión a main ni despliegue:** necesitan su autorización.

## 8. Guía breve de revisión
1. **Ingresar** como Directiva. Luego, como agricultor: aviso, «Cambiar de cuenta» y «Cerrar sesión».
2. **Resumen**, comparado con las láminas 03 y 35:
   - la cabecera oscura con la cobertura, «Para atender» y «Versión de las cifras»;
   - «Revisar borrador» y Excel.
3. **Borrador de compra:**
   - las pestañas en píldora;
   - «Cómo se calculó», con la cifra redondeada y la exacta visible;
   - «Preparar convocatoria».
4. **Compras conjuntas:**
   - la lista;
   - «Recorrido v2 (sintética)», que está cerrada;
   - las convocatorias de P-A (nueva responsable, no habilitada, permiso retirado).
5. **Catálogo:** Productos, Nombres equivalentes, Por identificar con «Ver la foto» y Ya identificados.
6. **Histórico:** el sellado y la estimación.
7. **Campañas:** la lista y el detalle (borrador concreto, histórico, resumen).
8. **Usuarios,** como Administración, con el panel del permiso «Sustituir responsable». **Bitácora.**
9. **Teléfono:** reduzca la ventana a unos 390 px y revise la barra inferior, «Más» y los diálogos.

## 9. Servicios encendidos al terminar
| Servicio | Puerto | Origen | Nota |
|---|---|---|---|
| Web de revisión (Vite) | 5177 | `_wt/WEB2-INT/Web` | La de esta entrega |
| API aislada | 3350 | `_wt/ET2-BE` (`et2.sh up`) | Datos sintéticos |
| PostgreSQL `agro_et1_pg` | 15434 | Docker | Base `agro_demo`, sintética |
| Vite antiguo de ET2-BE | 5175 | `et2.sh up` | Lo arranca el mismo script; no forma parte del rediseño |

No están encendidos el entorno móvil (API 3370, `agro_rdm_pg` 15436, `emulator-5556`) ni el túnel: cayeron con el reinicio del equipo y este encargo no los necesitaba. Las sesiones A, B, C y BASE no dejaron servidores.
