# Rediseño de la Web (v2): verificación en el navegador contra la API real

- **Fecha real:** 2026-11-13. Recorridos entre las 11:27 y las 12:01 UTC (07:27–08:01 en La Paz); instantánea inicial de la base a las 11:08 UTC.
- **Commit probado:** `06283da` (integración `feat/web-rediseno-v2`), servido por la Web de revisión del orquestador en `http://127.0.0.1:5177` (Vite en modo desarrollo desde `_wt/WEB2-INT`, con `<StrictMode>`), con proxy a la API aislada **3350** y la base sintética `agro_demo` (contenedor `agro_et1_pg`, 15434). **No** es la DEMO oficial. No se levantó ni se detuvo ningún servidor.
- **Rama de esta evidencia:** `docs/web-rediseno-v2-verificacion` (`_wt/WEB2-VERIF`), sin cambios de código de la Web.
- **Navegador:** Edge sin interfaz (puppeteer-core 23.11.1), zona horaria `America/La_Paz`. «Teléfono» = ventana de **390 px de ancho**, no un teléfono físico. «Zoom 200 %» = ventana de 720×450 a 2x, no el zoom real del navegador.
- **Credenciales:** la herramienta fija una contraseña aleatoria de un solo uso en la base aislada para cada inicio de sesión y no la imprime ni la captura (cuentas `directiva`, `admin`, `admin2`, `suc` y `agricultor3`). Ningún token ni contraseña aparece en los registros.
- **API real frente a simulado:** los recorridos 1–10 y `capturas/` salen de la API real, sin `simulate`. La ronda posterior de estados SIMULADOS (al final de este documento, carpeta `simulados/`, código `1b7fbb4`) usa respuestas simuladas, y cada archivo lleva «SIMULADO» en el nombre.

## Herramientas

| Archivo | Qué hace |
|---|---|
| `tool/web_rediseno_v2/verif_v.mjs` | Copia de `capture_base.mjs` (BASE) con pasos de comprobación: `assert` (evalúa y registra), `apiLog` (método, ruta y **estado HTTP** de cada llamada `/api`), `download` (descarga real con CDP), `mark` (abre con Enter y marca el control para comprobar el retorno del foco), `focusInfo`, `tab`, `setValue`, `selectByText`, `waitPath`. Escribe `_verificacion.json` (registro de cada paso) y `_capturas.json` |
| `tool/web_rediseno_v2/estado_v.cjs` | Instantánea de **sólo lectura** de la base: recuentos de compras, deudas, pagos, lotes, movimientos, convocatorias, cierres y bitácora; convocatorias; titulares del permiso; solicitudes de identificación. Sin correos ni credenciales. Salidas en `estado/` |
| `tool/web_rediseno_v2/xlsx_v.py` | Abre cada descarga con `zipfile` (sin instalar nada) y comprueba `xl/workbook.xml`, el tipo `spreadsheetml` y las hojas |
| `tool/web_rediseno_v2/plan_v_*.mjs` | Un plan por recorrido (abajo) |

Comando de cada recorrido (variables con `source _wt/ET2-BE/tool/etapa3/e3env.sh`, sin imprimirlas):

```bash
WEB_URL=http://127.0.0.1:5177 node tool/web_rediseno_v2/verif_v.mjs tool/web_rediseno_v2/plan_v_<nombre>.mjs docs/evidence/rediseno-web-v2/verificacion
node tool/web_rediseno_v2/estado_v.cjs docs/evidence/rediseno-web-v2/verificacion/estado/<NN>-<momento>.json
```

`_verificacion.json` guarda las 19 ejecuciones con su hora de inicio y fin; las repeticiones están explicadas en cada recorrido.

## Defectos encontrados

Ordenados por importancia. «Captura» es relativa a esta carpeta.

| Id | Lámina | Pantalla | Pasos | Qué se esperaba | Qué se vio | Captura / registro |
|---|---|---|---|---|---|---|
| **V-1** | 07 y 29 (U.3) | Borrador de compra con `?borrador=` | Directiva → `/campaigns/<Invierno 2026>` → «Abrir el borrador del 11 nov de 2026, 7:45 p. m.» (`?borrador=84e18f96…`) | Se abre **ese** borrador, con la pestaña «Borrador anterior» | Se muestra el **más reciente** (12 nov, 4:39 p. m.) y la pestaña dice «Borrador actual»; la URL conserva `borrador=84e18f96`. Orden de las lecturas: `84e18f96` y después `4bf1a6b6`, que pisa a la primera. Causa probable: `loadHistory` consume `wantedDraft` en la primera ejecución del efecto y la segunda abre `list[0]` porque `shownRef` sigue en `null` (`pages/joint-proposal.page.tsx:245-251`). Se reprodujo 3 veces en la Web de revisión (desarrollo, `StrictMode` ejecuta el efecto dos veces). **No se comprobó en el build de producción**: puede no ocurrir allí, pero basta cualquier segunda ejecución del efecto | `uniones/u3-borrador-anterior__escritorio.png`; `_verificacion.json`, `plan_v_uniones_u3.mjs` (sonda «qué borradores se pidieron») |
| **V-2** | 21, 22, 28, 31, 32, 44 (y 09–20) | Compras conjuntas, Catálogo, Campañas, Bitácora, Usuarios | Ingresar (cae en el Resumen) y navegar a esas vistas | H-03: «En una página sin respuesta colectiva (Usuarios, Bitácora) no aparece» | El chip «Datos sintéticos» aparece en las cinco vistas (1 por vista) | `_verificacion.json`, `plan_v_hallazgos.mjs` «D1 chip en …»; `hallazgos/41-campanas-barra__movil.png` |
| **V-3** | 26 | Estimación del consumo | Directiva → Histórico → Estimación del consumo | Cifra legible («≈ 19,5 kg»), como redondea el Borrador | «19,530798848 KG», «13,563649863 L», «411,938805299 KG» (6 cifras con 9 decimales) | `hallazgos/26-estimacion-decimales__escritorio.png` |
| **V-4** | 03, 06, 12, 25, 26, 35, 36, 40 | Cifras en kilogramos (Resumen, Borrador, Estimación, Histórico, convocatorias) | Abrir esas vistas | «kg», como en las láminas | «KG» (Resumen 5, Borrador 6, Estimación 6, Histórico 11; ninguna «kg»). Viene de `lib/quantity.ts` (`PRESENTATION_UNIT`); no está registrado como diferencia | `_verificacion.json` «D2 unidades en …» |
| **V-5** | 40, 41, 42, 44 | Barra inferior a 390 px | Ir a Campañas (o Histórico, Bitácora, Usuarios) | «Más» marcado como sección actual | Ninguna pestaña marcada; «Más» sólo se marca con el menú abierto | `hallazgos/41-campanas-barra__movil.png`; «D4 «Más» marcado en Campañas» |

Diferencias menores sin registrar (no rompen nada; se dejan para el orquestador):

- **D6** Campañas: «Otras campañas · 1 abierta · 11 cerradas» con 11 filas debajo (cuenta también la activa de la tarjeta superior).
- **D5** Catálogo a 390: pestañas sin «Productos · 12» ni «1 nombre unido» (sólo «Por identificar · N pendientes»).
- **D10** Nueva convocatoria: «Responsable» empieza en «Seleccione…»; las láminas 15.1 y 45 proponen «Directiva DEMO (usted)».
- **D12** Usuarios: lista completa (22) sin «Se muestran 10 de 22».
- **Fecha y hora** (`datetime-local`): al pasar con Tab a los subcampos internos, el campo deja de cumplir `:focus-visible` y pierde el anillo (`outline: none`) en el segundo subcampo. Es el control nativo de Chromium; conviene revisarlo a ojo.

Lo que las comparativas marcaban como posible defecto y **no** se confirmó sobre `06283da`: D7 (no hay enlace repetido en el Histórico), D8 (la lista de productos del formulario a 390 px mide 286 px y se alcanza desplazando el diálogo), D9 (la barra pegada «Preparar convocatoria» sólo tapa la franja de la referencia en la primera pantalla; al final de la página no tapa nada). Ver `../comparativas/README.md` §«Confirmación sobre 06283da».

## Recorridos

### 1. Inicio de sesión por rol — `plan_v_acceso.mjs` · API real · 11:27–11:29 UTC

| Paso | Resultado | Llamadas relevantes |
|---|---|---|
| Directiva ingresa | Va a `/colectivo/resumen` («Resumen de la campaña»); menú con Resumen, Borrador de compra, Compras conjuntas, Catálogo (insignia 6), Histórico, Campañas, Bitácora. **Sin Usuarios** | `POST /auth/login 200`, `GET …identification-requests?status=PENDING`, `GET /campaigns`, `…/summary`, `…/seal` |
| Administración ingresa | Igual, **con Usuarios** | Las mismas |
| Agricultor ingresa | `/sin-acceso-web`: «Esta cuenta utiliza la aplicación móvil.», botones «Cambiar de cuenta» y «Cerrar sesión», 0 menús | **Sólo** `POST /auth/login 200` (y los dos `POST /auth/refresh 401` previos de la página de ingreso). Ninguna llamada de datos |
| Agricultor pide `/colectivo/resumen`, `/users`, `/campaigns` | Las tres terminan en `/sin-acceso-web` | **Ninguna** llamada |
| «Cambiar de cuenta» | `/login` («Ingresar») | `POST /auth/logout 204` |
| Agricultor (2.º ingreso) → «Cerrar sesión» | `/login` | `POST /auth/logout 204` |

**Resultado: correcto.** Capturas: `acceso/`.

### 2. Resumen → Borrador y Excel — `plan_v_resumen_borrador.mjs` · API real · 11:29–11:31 UTC

- **Enlaces del Resumen:** «Revisar borrador» → `/colectivo/propuestas?campaign=<id>`. «Para atender»: «Revisar el borrador de compra» (mismo destino), «2 cifras muestran el valor anterior…» (sin enlace) y «6 productos por identificar» → `/colectivo/catalogo?vista=identificacion`. Los tres destinos se abrieron y mostraron «Borrador de compra» y «Por identificar».
- **Abrir el borrador sólo hace GET:** `proposals`, `proposals/<id>`, `selection`, `estimation-link` (cada uno dos veces por `StrictMode`).
- **Excel:** cuatro vistas lo ofrecen y las cuatro descargan un XLSX real. Cada descarga vuelve a pedir el dato al servidor (`GET …/summary`; `GET proposals/<id>` + `estimation-link`; `GET /collective/trends`; `GET /estimation/…`).

  | Vista | Archivo | Hojas (`zipfile`) |
  |---|---|---|
  | Resumen | `resumen-invierno-2026-demo.xlsx` (34 927 B) | Resumen, Necesidad declarada, Consumo publicado |
  | Borrador | `propuesta-4bf1a6b6-….xlsx` (54 578 B) | Borrador, Necesidades, Consumo estimado, Historial de la referencia |
  | Histórico sellado | `tendencias-consumo-publicado.xlsx` (145 322 B) | Tendencias, Por campaña, Detalle, Campañas |
  | Estimación | `estimacion-invierno-2026-demo.xlsx` (102 328 B) | Estimación, Resultados, Serie observada |

  Los cuatro empiezan por `PK\x03\x04`, `testzip()` sin errores, contienen `xl/workbook.xml` y `[Content_Types].xml` declara `spreadsheetml` (`descargas_xlsx.txt`, con SHA-256; archivos en `descargas/`).
- **Sin CSV:** en Resumen, Borrador, Histórico, Estimación, Cobertura, Compras conjuntas, Catálogo, Campañas y Bitácora no hay ningún enlace, botón u opción con «CSV» ni el texto «CSV» en la página; la única exportación es «Descargar Excel».

**Resultado: correcto.**

### 3. Convocatoria nueva de principio a fin — `plan_v_convocatoria.mjs` · API real · 11:32–11:33 UTC

| Paso | Estado en lista / detalle | Llamadas |
|---|---|---|
| U.1 «Preparar convocatoria →» desde el borrador | Abre el formulario en `/colectivo/compras-conjuntas?nueva=1&campana=…&propuesta=…&productos=…`, con «De un borrador de compra» elegido, el borrador «12 nov, 4:39 p. m. · 11 líneas», 1 línea marcada (la selección guardada) y el aviso «No se crea nada…». **Cancelado sin enviar** | Sólo GET (`eligible-responsibles`, `substitution-permissions`, lista, `proposals`, `proposals/<id>`) |
| «Nueva convocatoria» con «Recorrido v2 (sintética)», límite 20 nov 2026 18:00, responsable «Directiva DEMO (usted)», «Del catálogo» → Fertilizante foliar DEMO · L | — | Sólo GET |
| «Crear borrador» | La Web abre el **detalle** (no vuelve a la lista): «Borrador»; Actividad «Borrador creado» y «Responsable asignada» | **`POST /joint-purchase-calls 201`** y GET del detalle y colaboradores |
| «Abrir convocatoria…» | Diálogo con el botón **desactivado** hasta marcar «Confirmo que se abre…»; foco inicial dentro (la casilla) | — |
| «Abrir convocatoria» | Detalle «Abierta», «Pedido hasta ahora · Sin pedidos todavía»; lista: «Abiertas · reciben pedidos», «Participan 0» | **`POST …/open 200`** + GET detalle, `participants` (es la responsable), `collaborators` |
| «Cerrar y consolidar…» | Botón desactivado hasta la casilla; texto «No es una compra: no genera pagos ni deudas» | — |
| «Cerrar convocatoria» | Detalle «Cerrada»; «Consolidado al cierre · Pedidos recibidos hasta el 13 nov 2026, 07:33 · Fertilizante foliar DEMO · Nadie lo pidió · 0 L» (0 real: nadie participó); Actividad con creada, abierta y cerrada; lista: «Terminadas · Cerrada el 13 nov 2026 · 0 participantes» | **`POST …/close 200`** + GET detalle y `closing` |
| Bitácora | Tres filas: creado, abierta, cerrada (Directiva DEMO · Invierno 2026) | GET `/audit-logs` |

**Sin compras, deudas ni inventario:** las únicas escrituras fueron las tres de `/joint-purchase-calls…`. En la base, antes (`estado/01-antes-convocatoria.json`) y después (`estado/02-despues-convocatoria.json`): compras 0 → 0, ítems 0 → 0, cuentas por pagar 0 → 0, pagos 0 → 0, lotes 0 → 0, movimientos 0 → 0; convocatorias 11 → 12, cierres 4 → 5, bitácora 101 → 104. Ninguna convocatoria existente cambió.

**Avisos de la herramienta:** la captura «lista en borrador» no existe porque la Web abre el detalle al crear (se renombró a `convocatoria/02-tras-crear-detalle`); el paso «Descartar» de U.1 no hizo falta (cancelar con el formulario preajustado no pidió confirmación). **Resultado: correcto.**

### 4. Participantes y consentimiento — `plan_v_participantes.mjs` · API real, sólo lectura · 11:34–11:36 UTC

| Cuenta · convocatoria | Qué se ve | ¿Pide `/participants`? |
|---|---|---|
| Directiva · P-C y N7 (responsable, abierta) | «Usted ve nombres y cantidades por ser la responsable, y sólo de quienes la autorizaron», tabla con 2 participantes y cantidades; total «Herbicida DEMO · 2 personas · 11 L» | Sí (`200`), tiene el permiso |
| Directiva · Compra desde propuesta E3 (responsable, cerrada) | Consolidado con totales y «Detalle por participante» con la misma frase | No: usa `GET …/closing` |
| Directiva · P-A concurrencia (sin permiso) | «Usted no tiene el permiso «Consultar participantes y cantidades»… Participan 0 personas»; totales «No disponible mientras esté abierta» | **No** |
| Sucesora · P-A app anterior (nueva responsable) | «Fungicida DEMO · 3 personas · Restringido para su acceso · Faltan autorizaciones de agricultores»; «3 participaciones pendientes de que sus agricultores autoricen…: sus datos no se muestran»; tarjeta «Su acceso como nueva responsable» | Sí (`200`), y la Web no muestra datos de quien no la autorizó |
| Administración PA 2 · P-A concurrencia (lámina 16) | Como la Directiva sin permiso | **No** |
| Administración PA 2 · P-C y N7 (permiso retirado, 17) | Totales «Total no disponible para su acceso actual» (estado, no 0); «Su acceso»: «Retirado por Directiva DEMO el 13 nov, 06:27» | **No** |
| Administración · Compra desde propuesta E3 (18) | «Totales que su acceso permite ver»: Herbicida «Total no disponible para su acceso actual», Urea «Oculto por umbral · Lo pidieron menos de 3 personas» | **No** (`closing`) |
| Administración · Herbicidas invierno 2026 (19, cierre automático) | Los dos productos «Oculto por umbral» | **No** (`closing`) |

En ninguna vista sin acceso se escribió una cantidad «0» en lugar del estado. **Resultado: correcto.** Nota: la cuenta `admin` tuvo el permiso en «Compra desde propuesta E3» y se lo retiraron (dato previo), así que la lámina 18 exacta (nunca lo tuvo, con un total VISIBLE) sigue sin captura.

### 5. P-A — `plan_v_pa.mjs` y `plan_v_pa_retirar.mjs` · API real · 11:37–11:40 UTC

- **Lámina 20 (responsable no habilitada, «Convocatoria de demostración…»), Directiva con el permiso:** chip «Responsable no habilitada» y aviso «Nadie puede administrarla…» con «Sustituir responsable…». El diálogo ofrece Administración DEMO, Administración PA 2 y Sucesora PA; **Directiva DEMO no aparece** y la ayuda lo explica: «Usted no aparece en la lista: quien sustituye no puede nombrarse como nueva persona responsable…». «Sustituir responsable» siguió **desactivado** con persona y sin motivo, y con persona y motivo sin casilla; se activó sólo con las tres. **No se pulsó.** Esc con cambios pidió «Hay cambios sin guardar. ¿Descartarlos?»; «Descartar cambios» cerró y el foco volvió a «Sustituir responsable…». Llamadas: sólo GET (ningún `POST …/responsible`).
- **Lámina 14 (nueva responsable, «P-A app anterior»):** la responsable (Sucesora) está habilitada, así que no hay aviso ni «Sustituir responsable…» (la sustitución B1 sólo existe para una responsable no habilitada). No hay diálogo que comprobar en este estado.
- **Usuarios, como Administración:** panel con Directiva DEMO y Administración PA 2. «Conceder el permiso»: la lista sólo ofrece a Sucesora PA (excluye a quien concede y a quienes ya lo tienen); botón desactivado sin persona, sin motivo o sin casilla. Concedido con motivo → `POST /joint-purchase-substitution-permissions 200`; Sucesora aparece con «Concedido el 13 nov 2026 por Administración DEMO · Motivo: …».
- **La Directiva lo ve** en Compras conjuntas → «Ver quién lo tiene»: los tres titulares, Sucesora incluida (sólo GET).
- **Retirada:** la primera pasada no la hizo (la herramienta buscaba el diálogo como `role="dialog"`; es `role="alertdialog"`) y el permiso quedó concedido 2 min 18 s. La segunda pasada (`plan_v_pa_retirar.mjs`) lo retiró con motivo y casilla → `POST …/revoke 200`. Quedan Directiva DEMO y Administración PA 2. **El historial conserva** «Concedido · Sucesora PA» y «Retirado · Sucesora PA», con actor, fecha y motivo (`pa/31-retirado-historial`), y la bitácora tiene las dos filas.

**Resultado: correcto.**

### 6. Identificación con foto — `plan_v_identificacion.mjs` · API real · 11:40–11:41 UTC

- **Foto:** en «Herbicida 48 SL del agro (etiqueta)» (única pendiente con foto), abrir la solicitud **no** pide la foto; «Ver la foto» hace `GET …/photo 200` con la sesión y la imagen carga como `blob:` (`naturalWidth` 640, `naturalHeight` 480). La misma ruta pedida **sin** la cabecera de sesión responde **401**. Esc cierra y el foco vuelve a «Ver la foto». **La foto no se capturó ni se guardó.** El panel no nombra a quien la envió («El agricultor no envió una foto» es el texto de la solicitud sin foto).
- **Identificación de una sola solicitud:** «Fertilizante foliar artesanal ZZ» (sin foto, recibida el 12 nov) → «Ya está en el catálogo» → producto «Fertilizante foliar artesanal ZZ (KG)» (otra solicitud idéntica ya se había unido a él el 11 nov). Ningún parecido venía elegido; el botón siguió desactivado hasta tener producto, motivo y casilla. «Confirmar identificación» → `POST …/link 200`.
- **Después:** insignia del menú **6 → 5** («Por identificar 5 (5 pendientes)»), «Pendientes (5)», y «Ya identificados (4)» la incluye. En la base: `f6991bbd` pasa a `LINKED` con el producto `41b006e7`.

**Resultado: correcto.**

### 7. Campañas, Usuarios y Bitácora — `plan_v_admin.mjs` y `plan_v_bitacora.mjs` · API real · 11:41–11:44 UTC

- **Campañas (Directiva):** «Nueva campaña» y «Editar» de la activa abren con el foco en «Nombre»; «Crear campaña» desactivado sin datos; el estado no es editable («Se cambia con «Cerrar campaña»»). Esc cierra y el foco vuelve al botón. «Cerrar campaña…» existe y **no se pulsó**. Sólo GET.
- **Usuarios (Administración):** «Nuevo usuario» (rol propuesto «Directiva», botón desactivado), «Editar a Sucesora PA» (correo de sólo lectura, H-13), «Contraseña de …» (con «Repetir la contraseña») y «Desactivar a …» (`alertdialog`, «Volver» / «Desactivar»): todos abren con el foco dentro, se cierran con Esc y devuelven el foco. Sólo GET.
- **Bitácora (Directiva):** 107 filas agrupadas por día. «Tipo de acción: Convocatorias» filtra en el navegador (31 filas, sin llamada, H-28); «Persona» va al servidor (`?actorUserId=`); campaña y fechas también (`?campaignId=&from=…T04:00:00.000Z&to=…T03:59:59.999Z`, el día en hora de La Paz). Con fechas sin acciones: «Sin acciones para estos filtros». «Detalle» abre «Qué pasó» (Acción, Cuándo, Quién, Dónde, «Ver datos técnicos»), con el foco dentro; Esc devuelve el foco a «Detalle».
- La primera pasada de la Bitácora no pudo volver a «Todas las personas» (fallo de la herramienta con la opción de valor vacío, corregido) y no tenía filas que abrir; se repitió con `plan_v_bitacora.mjs`.

**Resultado: correcto.**

### 8. Uniones §U — `plan_v_uniones.mjs` y `plan_v_uniones_u3.mjs` · API real, sólo lectura · 11:44–11:48 UTC

| Unión | Resultado |
|---|---|
| U.7 Campaña → Resumen | «Ver resumen» → `/colectivo/resumen?campaign=<id>` ✔ |
| U.2 Campaña → Histórico / Cobertura | Activa y cerrada (Invierno 2025): «Ver el histórico sellado» → `/colectivo/historico?vista=tendencias&campaign=<id>` y «Ver cobertura» → `/colectivo/cobertura?campaign=<id>` ✔ |
| U.3 Detalle de campaña → borrador concreto | Los cuatro enlaces llevan `?borrador=<id>` ✔, pero el borrador anterior no se muestra: **V-1** ✘ |
| U.9 «Cómo se calculó» → Estimación | «Ver la estimación completa» → `/colectivo/historico?vista=estimacion&campaign=<id>` («Estimación del consumo») ✔ |
| U.5 Catálogo → Identificación y equivalencias | Menú y pestañas a `?vista=productos|equivalencias|identificacion` ✔; Resumen «N productos por identificar» → identificación ✔ (recorrido 2); la insignia baja tras identificar ✔ (recorrido 6) |
| U.1 Borrador → convocatoria | ✔ (recorrido 3) |
| U.4 Usuarios ↔ permiso | ✔ (recorrido 5) |
| U.6 Convocatoria → participantes, permisos y actividad | ✔ (recorridos 3 y 4) |
| U.8 Resumen sin campaña activa → Campañas | No comprobado: la base tiene una campaña activa y no se simuló |

La primera pasada de U.3 abrió el borrador más reciente por un selector de la herramienta (`:last-of-type`); `plan_v_uniones_u3.mjs` se ejecutó 3 veces (una con un error de la sonda) y las tres mostraron V-1.

### 9. Teléfono (390 px) y zoom al 200 % — `plan_v_telefono.mjs` y `plan_v_telefono_borrador.mjs` · API real · 11:49–11:58 UTC

- **Desplazamiento horizontal:** 22 medidas (10 rutas a 390, 10 a 720×450, Usuarios en ambas): `scrollWidth = clientWidth` en todas.
- **Última fila:** ninguna barra fija tapa el último contenido al final de la página. La primera medida dio «tapada» en Por identificar, Histórico y Usuarios por contar contenido de `<details>` cerrados y celdas pegadas de una tabla; repetida sin ellos (`plan_v_hallazgos.mjs`): no tapada. El Borrador se volvió a medir con el borrador cargado: no tapado (`telefono/36-borrador-final`).
- **Barra inferior:** Resumen, Borrador, Compras, Catálogo, Más; marca la sección actual en las cuatro primeras, no en las de «Más» (**V-5**).
- **«Más»:** Histórico y estimaciones, Campañas, Bitácora, las cuatro tareas, «Cerrar sesión»; con Administración, también Usuarios. Esc lo cierra y el foco vuelve a «Más». Al 200 %: botón «Menú» con el mismo contenido.
- **Un diálogo por área** (se cerraron sin enviar, el foco volvió al botón): B «Nueva convocatoria» a pantalla completa (390×844) y «Cancelar la convocatoria» como hoja inferior; C «Nueva campaña», «Nuevo producto» y «Nuevo usuario». Ninguno desborda en horizontal. **Área A no tiene diálogo alcanzable con estos datos**: su único diálogo es «Sellar las cifras», que exige una campaña cerrada sin sellar, y las 11 cerradas están selladas.

**Resultado: correcto salvo V-5.**

### 10. Teclado y foco — `plan_v_teclado.mjs` (+ los diálogos de los recorridos 3, 5, 6, 7 y 9) · API real · 11:56–11:58 UTC

- **Tab desde el inicio** en Ingresar (O), Resumen (A), Compras conjuntas (B), Nombres equivalentes y Bitácora (C): el primer elemento es «Saltar al contenido» y cada control enfocado cumple `:focus-visible` con anillo de 2 px (tinta sobre fondo claro, lima sobre la barra oscura). En Ingresar, «Ingresar» está desactivado sin datos y Tab lo salta.
- **Pestañas del Borrador:** «Cómo se calculó» recibe el foco y la flecha izquierda pasa a «Borradores anteriores».
- **Diálogos:** «Nueva convocatoria», «Conceder permiso» (B), «Nueva campaña», «Editar campaña», «Nuevo usuario», «Editar usuario», «Contraseña», «Desactivar», «Qué pasó» (C), «Ver la foto» (C), «Sustituir a la responsable» y «Conceder «Sustituir responsable»» (B): el foco empieza dentro y, al cerrar con Esc, vuelve al botón que lo abrió. En «Conceder permiso», 12 Tab siguen dentro del diálogo (foco atrapado).
- «Unir con…» (C) no se abrió: la herramienta buscaba «Unir con» y el nombre accesible es «Unir «X» con…». Los diálogos de C quedan cubiertos por Campañas y Usuarios.
- Ver el aviso sobre `datetime-local` en «Defectos».

**Resultado: correcto.**

### Capturas para las comparativas — `plan_v_capturas.mjs` · 11:59–12:01 UTC

06 y 08 a página entera, 51 y 49 (desplazado hasta el motivo) a 390, 48 (Administración PA 2) y 50 (Sucesora) a 390. Para la lámina 01 se guardó la copia de la estimación y se cerró la sesión: Ingresar **no** muestra el aviso, porque cerrar la sesión retira la copia (F12-EST-07-WEB #180, `contexts/auth.context.tsx`); el aviso sólo sale si la sesión se pierde sin cerrarla. No es un defecto; la lámina 01 con el aviso queda sin captura.

## Datos sintéticos creados o cambiados (base `agro_demo` aislada)

| Qué | Detalle | Cómo |
|---|---|---|
| Convocatoria «Recorrido v2 (sintética)» (`bffce00b`) | Campaña Invierno 2026 (DEMO); responsable Directiva DEMO; Fertilizante foliar DEMO; límite 20 nov 2026 18:00 (La Paz). Creada, abierta y **cerrada** manualmente (cierre con 0 participantes). Producto libre de nuevo tras el cierre | Interfaz, Directiva |
| Permiso «Sustituir responsable» | Concedido a Sucesora PA (sintética) a las 11:37:32 UTC y retirado a las 11:39:50 UTC por Administración DEMO, con motivo. Titulares finales = los iniciales (Directiva DEMO y Administración PA 2). Quedan 2 eventos en el historial del permiso | Interfaz, Administración |
| Solicitud de identificación `f6991bbd` | «Fertilizante foliar artesanal ZZ» → `LINKED` con el producto «Fertilizante foliar artesanal ZZ» (`41b006e7`) a las 11:41:02 UTC. Pendientes 6 → 5 | Interfaz, Directiva |
| Bitácora | 101 → 107 filas (3 de la convocatoria, 2 del permiso, 1 de la identificación) | Consecuencia de lo anterior |
| Contraseñas | `directiva`, `admin`, `admin2`, `suc` y `agricultor3` tienen un hash aleatorio de un solo uso fijado por la herramienta (como en las demás sesiones) | `verif_v.mjs` |

Sin cambios: compras, ítems, cuentas por pagar, pagos, lotes y movimientos (0 en todo el recorrido), productos (13 activos), las convocatorias que ilustran las láminas 10–20 y la selección guardada del borrador. Instantáneas en `estado/` (`00-antes` … `07-final`).

## No verificado y por qué

- **Build de producción:** sólo se probó la Web de revisión (Vite de desarrollo con `StrictMode`). V-1 puede no reproducirse en producción.
- **Teléfono físico, tableta y zoom real del navegador:** sólo anchos de ventana.
- **Lámina 30.3 «Sellar las cifras» y Resumen §10–§11 con la API real:** no hay campaña cerrada sin sellar; sellar o cerrar la campaña activa estaba fuera del encargo. Se capturaron después con respuestas SIMULADAS (ver la ronda simulada).
- **Resumen §2–§6 y §12, U.8 con la API real:** exigen datos que no existen. §2–§5, §12 y U.8 se capturaron después con respuestas SIMULADAS; §6 «sin conexión» sigue sin captura.
- **Lámina 18 exacta:** ninguna cuenta ADMINISTRADOR habilitada sin historial de permisos en una convocatoria cerrada con un total VISIBLE.
- **Lámina 01 con el aviso de copia:** por diseño sólo tras perder la sesión sin cerrarla (ver arriba).
- **Foto real (33.5):** privada; sólo se comprobó que carga autorizada y que sin sesión da 401.
- **Diálogo «Unir con…»** con teclado (ver recorrido 10).
- **Sustitución efectiva:** no se envió (encargo: cancelar sin enviar).

## Ronda de estados SIMULADOS — `plan_v_simulados.mjs` y `plan_v_simulados_u8.mjs` · 2026-11-13, 15:22–15:27 UTC

- **Código:** integración `65be8bf` (código `1b7fbb4`, con V-1…V-5 y D6 corregidos), fusionada en esta rama; la Web 5177 ya lo servía.
- **Qué es simulado:** sólo las respuestas listadas abajo, con el paso `simulate` de `verif_v.mjs` (ahora admite una lista de reglas `{url, method, body}`; cada respuesta simulada queda en el registro de llamadas con «SIMULADO»). Los cuerpos salen de `tool/web_rediseno_v2/fixtures_v.json`, que genera `fixtures_v.mjs` importando los fixtures de la Web con el quitado de tipos de Node: `dev/fixtures/summary-fixtures.ts` (`empty`, `worst`, `worstPolicyPending`, `worstClosedUnsealed`, `worstSealed`), `campaigns-fixtures.ts` (`empty`, `worst`) y `proposal-fixtures.ts` (`demo` y `linkViewFor`/`linkOf` con los mismos argumentos que `joint-proposal.estimation-link.test.tsx`), más `CATALOG` copiado de `products.page.test.tsx`. Derivados sin campos nuevos: «todo oculto» = las celdas `SUPPRESSED_UNDER_THRESHOLD` de `worst`; «sin campaña activa» = `worst` sin la activa y `active: null`; la campaña del borrador = la activa de `demo` con el id `PROPOSAL_CAMPAIGN_REF`.
- **Real:** inicio de sesión, `/auth/refresh` (una recarga por escenario, porque la campaña activa se lee al cargar), la insignia «Por identificar» y todo lo no listado.
- **Nada se escribió:** en toda la ronda no hubo ninguna llamada que no fuera GET, salvo `/auth/refresh`.

| Estado | Respuestas simuladas | Resultado | Captura (`simulados/`) |
|---|---|---|---|
| 05 §2 sin campañas | `GET /campaigns` = `[]`, `GET /campaigns/active` = `null` | «Todavía no hay campañas» con «Ir a Campañas»; «Para atender»: «Sin campaña activa… Ir a Campañas». «Ir a Campañas» lleva a `/campaigns` («No hay campaña activa», «Todavía no hay campañas») | `05-s2_sin_campanas__SIMULADO__escritorio.png` |
| U.8 sin campaña activa | campañas de `worst` sin la activa, `active` = `null`, resumen `worstSealed` | «Para atender»: «Sin campaña activa: los agricultores no pueden registrar hasta que se abra una. Ir a Campañas» → `href="/campaigns"`; el clic lleva a `/campaigns` | `05-u8_sin_activa__SIMULADO__{escritorio,movil}.png`, `u8-campanas-destino__SIMULADO__escritorio.png` |
| 05 §3 sin cifras | `S.empty` | Cobertura «0 de 7», «Ninguna…», «Ausencia de aporte = desconocido, no cero» | `05-s3_sin_cifras__SIMULADO__escritorio.png` |
| 05 §4 todo oculto | `worst` con sólo celdas ocultas | Aviso `all-hidden`, sin cifras | `05-s4_todo_oculto__SIMULADO__escritorio.png` |
| 05 §5 política pendiente | `S.worstPolicyPending` | `policy-pending`, sin cifras ni cobertura, sin «Datos sintéticos» | `05-s5_politica_pendiente__SIMULADO__escritorio.png` |
| 05 §10 cerrada sin sellar | `S.worstClosedUnsealed` (`can_seal: true`, revisión) | «Siguiente paso: sellar las cifras», pasos Abierta → **Cerrada** → Sellada, «Sellar esta versión…» | `05-s10_cerrada_sin_sellar__SIMULADO__{escritorio,movil}.png` |
| 30.3 «Sellar esta versión» | la misma revisión | Foco inicial en la casilla; revisión **sin números** (H-04: «0 de 0 agricultores…», «Hay productos sin cifra»); «Sellar» desactivado hasta la casilla. Se cerró con Esc (el foco volvió a «Sellar esta versión…») y `apiLog` = **ninguna llamada**: sin `POST …/seal` | `30-3-sellar-dialogo__SIMULADO__escritorio.png` |
| 05 §11 sellada | `S.worstSealed` | «Cifras fijadas», versión sellada, «Cobertura al sellar» | `05-s11_sellada__SIMULADO__{escritorio,movil}.png` |
| 05 §12 referencia (6) | borrador `demo` + `estimation-link` en NONE, CALCULATING, LINKED, LINKED con `update.available` (NEWER_RUN), RESTRICTED (`POLICY_PENDING`) y UNAVAILABLE (NOT_EXECUTED) | «Sin referencia… Obtener referencia»; «Calculando la referencia… En cola»; «Consumo estimado fijado…»; «Consumo estimado desactualizado… Actualizar · Quitar»; «Referencia restringida… no se muestra ninguna cifra ni recuento»; «El cálculo no se completó… Reintentar». No se pulsó ningún botón | `05-12-referencia-{NONE,CALCULATING,LINKED,LINKED_DESACTUALIZADA,RESTRICTED,UNAVAILABLE}__SIMULADO__escritorio.png` |
| 21/39 productos inactivos | `GET /inventory/products` = `CATALOG` (2 activos y «Retirado sintético» inactivo) | «Ver productos inactivos (1)» abre la lista de sólo lectura con «Inactivo» y la fecha de modificación; sin reactivar. Sin chip «Datos sintéticos» (V-2 corregido) | `21-productos-inactivos__SIMULADO__{escritorio,movil}.png` |

Medidas: sin desplazamiento horizontal en los 7 escenarios del Resumen a 1440.

**Avisos de la herramienta:** en la primera pasada, U.8 se comprobó antes de que se dibujara «Para atender» y el clic no encontró el elemento (la captura `u8-campanas-destino` de esa pasada mostraba aún el Resumen); se repitió con `plan_v_simulados_u8.mjs`, que espera al elemento, y las capturas se sobrescribieron. En esa repetición, la comprobación del destino falló por una expresión regular mal escapada en el plan, pero `waitPath ^/campaigns` se cumplió y la captura muestra `/campaigns` (`_capturas.json`: `ruta /campaigns`). El registro de llamadas lista cada respuesta simulada dos veces: una con «SIMULADO» y otra sin la marca, emitida por el navegador para la misma petición.

**Queda sin captura:** 05 §6 «sin conexión» (no estaba en el encargo de esta ronda; requiere cortar la red, no una respuesta).
