# F12-EST-08 (#181): la estimación como referencia separada en la propuesta conjunta — evidencia

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-03, de las 10:40Z a las 11:55Z (UTC) |
| Base | `main` `670902d` (tras Backend-Web#197) |
| Rama | `feat/f12-est-08-referencia-propuesta` |
| Código probado | Servicio y Web `b3af766`; texto de la vigencia `9fbfd40`; suite reforzada, CI y recorrido `1f55988` (**HEAD probado**). El commit de esta evidencia solo añade documentos y salidas |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200 y Node 25.9.0. PostgreSQL 16.13 **desechable** (`agro_f12_est08_pg`, `--rm`, solo en 127.0.0.1, autenticación `trust`: sin contraseña). Microsoft Edge 156.0.4314.58 sin interfaz, con puppeteer-core 25.16.0 instalado fuera del proyecto. Solo datos sintéticos. La contraseña de un solo uso, los secretos JWT y la clave de huella de Sync v1 son efímeros y nunca se escriben |
| Issue | Refs #181 (Backend). **No se cierra.** No es el PR Mobile #181 |
| Contrato | `F12_EST_01_ESTIMATION_CONTRACT.md` §7.1, §12 y la revisión decimocuarta |
| Diseño | Prototipo W3 (figura 3.27) y 3.12.4.5 del documento `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`, leído desde una copia de trabajo (sha256 `964286d1ebf7b56d…`). **No se modifica** |

## 1. Qué se construye

| Pieza | Estado |
|---|---|
| `GET /api/v1/collective/proposals/{id}/estimation-reference` | **Nuevo.** Por cada línea del borrador, el resultado de `GET /estimation/results` para la campaña del borrador y el mismo producto canónico y unidad. Incluye su ejecución, fecha, vigencia y relación con el borrador (`BEFORE_PROPOSAL` o `AFTER_PROPOSAL`), o el motivo de su ausencia (`NO_RESULT` o `POLICY_PENDING`). La respuesta lleva `label: "Estimación del consumo"`, `evaluated_at` y un aviso fijo. Roles: DIRECTIVA y ADMINISTRADOR. Solo lectura |
| `GET /api/v1/collective/proposals/{id}/csv` | **Ampliado.** Conserva filas, columnas y valores, y añade al final 5 columnas `estimation_*` en la cabecera y 10 en cada línea. La ruta, sus cabeceras y sus roles no cambian. Pasa al módulo de estimación, que ya depende del colectivo, para no crear una dependencia circular |
| Origen de la cifra | `EstimationReadsUseCase.results`, sin cambios: la misma selección, vigencia, política y permisos. **No hay otro cálculo ni otro almacenamiento** |
| Huella del borrador | `proposalFingerprint` **no se toca**. Ni el borrador ni sus líneas guardan nada de la estimación |
| Web | Columna «Estimación del consumo (referencia)», separada con borde y fondo propios. Cada celda muestra la cifra o el motivo, la vigencia y la ejecución con su fecha y relación con el borrador. La nota inferior enlaza con «Estimación del consumo». Descarta las respuestas que llegan después de cambiar de campaña, de identidad o de borrador |
| OpenAPI | `openapi-f02.json` y `openapi-f06-collective.json` regenerados. `openapi-contract.cjs` exige la ruta nueva con una forma cerrada, la etiqueta, la relación, las ausencias y la ausencia de naive, cobertura, serie y datos por Member |
| CI | `backend-f02.yml` ejecuta la suite nueva con PostgreSQL |

**Lo que no se hace:**
- no se suma la estimación a líneas ni totales;
- no se usa como cantidad solicitada;
- no se generan compras, lotes, movimientos, deudas ni pagos;
- no cambian el motor, las semillas ni los resultados de la evaluación sintética (F12-EST-09).

## 2. Contraste con el prototipo W3

**Dónde está.** En 3.12.5, en la «Figura No 3.27 Prototipos conceptuales W2 y W3», cuyo texto dice: «La propuesta muestra, como columna de referencia, la estimación del consumo para el mismo producto y campaña; esa columna no se suma a la necesidad declarada ni cambia las líneas del borrador». Es un prototipo conceptual con datos ilustrativos.

| Elemento de W3 | Pantalla (`9fbfd40`) | Resultado |
|---|---|---|
| Columna «Estimación (referencia)» a la derecha de las líneas | «Estimación del consumo (referencia)», última columna, separada con borde y fondo | **Coincide.** El nombre añade «del consumo», como se pidió |
| «295 L» en una fila publicada | «111 L» con el valor base (111.000 mL), la vigencia («Vigente») y «Ejecución del … · anterior al borrador» | **Coincide**, con la vigencia y la procedencia que exige el contrato |
| «Datos insuficientes» | «Datos insuficientes», con su motivo y «No utilizable» | **Coincide** |
| «—» en la fila «Oculto» | La fila oculta muestra su propia referencia: «Sin estimación» si ninguna ejecución la incluye, o la cifra si existe, precedida de «La necesidad de esta fila no está divulgada. Lo que sigue es la estimación del consumo: no la sustituye ni se suma a la propuesta.» | **Diferencia deliberada, aprobada por el autor el 2026-11-03 (§7).** La referencia es por producto y pasa sus propios controles de permisos y divulgación. No revela la necesidad oculta, porque solo usa cifras de consumo ya publicadas y selladas. El Word no se modifica |
| Nota: «La columna “Estimación” es una referencia… no se suma… ni cambia las líneas del borrador. Detalle en “Estimación del consumo”» | El mismo mensaje, que añade «no es la cantidad solicitada» y enlaza con la pantalla | **Coincide** |
| «Misma huella = mismas entradas autorizadas y mismas líneas» | Sin cambios en el historial | **Coincide** |
| «Exportar CSV» | El CSV añade la referencia en columnas `estimation_*` | **Coincide.** W3 no detalla el contenido |
| Apariencia | La del sistema visual existente | **No se iguala**, como en W4 (F12-EST-06) |

## 3. PostgreSQL real por HTTP: `f12-est-08-proposal-reference.postgres.spec.ts`

**Datos.** Todos sintéticos y creados por la API real:
- **INVIERNO:** cuatro campañas cerradas y selladas con Herbicida, 96, 120, 104 y 116 L, el ejemplo de 3.12.5. Fungicida solo aparece en las dos últimas.
- **Campaña objetivo T, abierta:** necesidad declarada por tres agricultores, publicada por Sync v1:
  - Herbicida: 30, 40 y 50 L;
  - Fungicida: 0,5, 0,7 y 0,8 L;
  - Insecticida: solo dos aportantes, bajo el umbral.
- **Filas privadas sembradas** de un agricultor: una compra, su ítem, su deuda, un lote y un movimiento.

**Comando:**
```
F12_EST_PG_TEST_URL=<postgres desechable> F12_DEMO_OUT=../docs/evidence/f12_est_08/demo-postgres.json \
  npx jest src/modules/estimation/infrastructure/f12-est-08-proposal-reference.postgres.spec.ts --runInBand
```

**Resultado sobre `1f55988`:** **7/7** (11:26:46Z–11:27:04Z). La demostración está en [`f12_est_08/demo-postgres.json`](f12_est_08/demo-postgres.json).

| Criterio | Resultado |
|---|---|
| Borrador **sin** estimación (P0) y **con** estimación disponible (P1): mismos totales y huella de líneas | **Cumple.** Misma `inputs_fingerprint` (64 hex), mismas líneas (posición, producto, unidad, estado, cantidad y aportantes) y mismo total servido, **122000 mL**. Las filas guardadas de `JointPurchaseProposalLine` son idénticas. P0 leído después de existir la estimación da exactamente el mismo JSON |
| Estimación insuficiente | **Cumple.** Fungicida: `INSUFFICIENT_DATA` con `SPAN_TOO_SHORT`, sin cifra, `NOT_USABLE`/`NO_FIGURE`. Insecticida: `NO_RESULT`. Nunca un cero |
| Sustituida | **Cumple.** Tras una segunda ejecución, la referencia muestra la nueva (`AFTER_PROPOSAL`) y ninguna línea lleva `SUPERSEDED`. La anterior sigue `SUPERSEDED`/`LATER_RUN` en su detalle |
| Desactualizada | **Cumple.** Al clasificar otra campaña: `OUTDATED`/`SOURCES_CHANGED`, con la cifra |
| Fuente retirada | **Cumple.** Un agricultor cancela su consumo tras el sellado (F07 retira la visibilidad): `OUTDATED`/`SOURCES_WITHDRAWN`, `estimate_base` nulo. El CSV no contiene `111000` |
| Permisos y aislamiento | **Cumple.** En las dos rutas: 401 sin sesión, 403 del Agricultor con el cuerpo del `RolesGuard`, 404 en los dos sentidos entre sindicatos, 404 para un identificador inexistente y 400 para uno que no es UUID. El Administrador lee como la Directiva. Ninguna de estas peticiones cambia ninguna tabla |
| Política pendiente | **Cumple.** `availability: POLICY_PENDING`, todas las líneas con `absence: POLICY_PENDING` y sin cifra. El CSV responde 200 sin ninguna cifra de necesidad ni de estimación |
| Exportación consistente con la referencia mostrada | **Cumple.** Sin las columnas añadidas, el CSV es `proposalCsv(vista JSON)` campo a campo. Las columnas `estimation_*` son las de la referencia JSON leída en el mismo estado; `estimation_evaluated_at` es su propio momento, igual o posterior. Se comprobó sin estimación, con estimación, desactualizada, retirada y sellada |
| Tablas privadas idénticas | **Cumple.** Con filas sembradas (compra 1, ítem 1, deuda 1, lote 1, movimiento 1), el md5 de `Purchase`, `PurchaseItem`, `PurchaseItemAllocation`, `PurchaseParticipant`, `InventoryLot`, `StockMovement`, `PayableAccount` y `Payment` es igual al empezar y al terminar la suite. En medio hubo generaciones, ejecuciones, retiradas, un sellado y todas las lecturas. Generar un borrador solo cambia `CollectiveRelease`, `CollectiveReleaseItem`, `JointPurchaseProposal` y `JointPurchaseProposalLine` |
| Propuesta sellada sin recálculo ni modificación | **Cumple.** Tras cerrar y sellar T por la API, la vista sirve el sellado, con las mismas líneas y la misma huella que antes. Tres rondas de vista, referencia y CSV no cambian **ninguna** tabla (md5 de todas), y la fila del borrador con sus líneas queda igual. La referencia sigue indicando su ejecución y `evaluated_at` |

**Alteraciones temporales (revertidas)**, para comprobar que la suite las detecta:

| Alteración | Resultado |
|---|---|
| Relación con el borrador invertida | 3 pruebas fallan |
| Sin política: se propaga el 409 en lugar de servir el borrador | 1 falla |
| La cifra de la estimación ocupa la columna de necesidad del CSV | 3 fallan |
| Una ausencia de cifra se entrega como `0.000000` | 2 fallan |
| (Una quinta alteración no compilaba y se descartó) | — |

**Fallo intermitente, sin causa confirmada.**
- **Qué pasó:** en una ejecución local, la primera tras sembrar las filas privadas, la prueba «sustituida» agotó sus 5 s. La siguiente, «desactualizada y retirada», también falló; usa la ejecución R2 que crea la anterior, aunque no comprobé que esa sea la razón.
- **Repeticiones:** la prueba suele tardar 230–350 ms. No se reprodujo en las 13 ejecuciones siguientes, incluida la final.
- **Lo que no hice:** no subí el límite ni añadí esperas, y no lo atribuyo a ninguna causa.

## 4. Suites completas

| Suite | Correctas | Omitidas | Fallidas |
|---|---|---|---|
| Backend `npx jest --runInBand`, todas las suites PostgreSQL habilitadas salvo B2 real y la comparación de k, sobre `1f55988`, **última ejecución** (11:38Z–11:42Z) | **794** | **13** | **0** |
| La misma orden sobre la **base** `670902d`, a continuación (11:42Z–11:48Z) | 787 | 13 | 0 |
| La misma orden sobre `1f55988`, ejecución anterior (11:28Z–11:33Z) | 793 | 13 | **1** |
| `f12-est-05-runs` sola, 5 veces en la rama y 5 en la base, alternadas | 18 ×5 / 18 ×5 | 0 | 0 |
| Backend sobre el árbol de `b3af766`, sin nada en paralelo (11:04Z–11:08Z) | 794 | 13 | 0 |
| Backend, primera ejecución sobre ese árbol **con** las pruebas de la Web corriendo a la vez (10:56Z–11:02Z) | 792 | 13 | **2** |
| `f06-coll-05-collective-aggregate` sola, tres veces | 16 ×3 | 0 | 0 |
| Web `npx vitest run`, sobre `1f55988` | **169** | **0** | **0** |
| Web, pruebas de la propuesta sobre `9fbfd40` | 16 | 0 | 0 |
| `npm run openapi:check` | Pasa: F02, F05, F06 (con la ruta nueva), F08 y F12 en etapa `IMPLEMENTED` | — | — |

**Omitidas:** las 13 son de `b151-b2-real.postgres.spec.ts`, que necesita B2 real y no se habilita, y de `f07-pol-01-k-comparison.postgres.spec.ts`, que necesita su propio entorno.

**Tiempos de 5 s agotados.** Ninguno se reprodujo al repetir y no se subió ningún límite.

| Dónde | Prueba | Contexto | Al repetir |
|---|---|---|---|
| Suite completa | Dos de `f06-coll-05`, que consulta el resumen colectivo y no toca propuestas ni estimación | Con las pruebas de la Web corriendo a la vez | Sola, 3 de 3. La suite completa sin carga pasó entera |
| Suite completa sobre `1f55988` | «asociación posterior a la ejecución», de `f12-est-05-runs` | Sin carga. La prueba usa `/estimation/runs` y no las rutas de este cambio | 5 de 5 en la rama y 5 de 5 en la base, con duraciones equivalentes (204–406 ms); después, la suite completa pasó entera en la rama y en la base |
| Suite nueva | La de §3 | — | Ver §3 |

**Causa sin confirmar.** Las tres ocurrieron en suites distintas y no se reprodujeron en aislamiento. No las atribuyo a este cambio ni las clasifico como preexistentes.

**Web:** `eslint` sin errores. Las 2 advertencias son de `auth.context.tsx` y `campaign.context.tsx`, que no se tocan. `tsc -b` sin errores.

**Pruebas de componentes** (`joint-proposal.reference.test.tsx`, 8):
- columna separada e identificada, con vigencia y ejecución;
- la necesidad no cambia y no aparece ninguna suma;
- insuficiente, desactualizada, retirada, sustituida, política pendiente y error de carga.

**Respuestas diferidas:**
- la referencia de la campaña anterior llega con el borrador de la otra ya abierto;
- el borrador de la campaña anterior llega tarde, y no se pide su referencia;
- llega la referencia de otro borrador abierto antes;
- cambia la identidad de la sesión.

Al retirar cada guarda de la pantalla, falla la prueba correspondiente.

## 5. Recorrido de navegador contra el backend real (`f12_est_08/recorrido/`)

**Herramientas:** [`recorrido.sh`](f12_est_08/recorrido.sh), [`control-sintetico.cjs`](f12_est_08/control-sintetico.cjs) y [`recorrido-web.mjs`](f12_est_08/recorrido-web.mjs).
- Compila el backend y la Web y siembra una base nueva con los generadores sintéticos de las suites, más filas privadas.
- Arranca `node dist/main.js` con su trabajador y `vite preview` con proxy a esa API.
- Los agricultores sintéticos publican la necesidad por Sync v1.
- La estimación la pide la Directiva desde su pantalla, y la calcula el trabajador del proceso real.
- Las órdenes de control simulan en la base la clasificación de otra campaña y la retirada que escribe F07.
- La respuesta diferida se provoca **reteniendo en el navegador** la petición de la referencia. El service worker de la PWA se omite para que esa retención sea determinista.

**Comando:** `PG_ADMIN_URL=… BROWSER_PATH=… PUPPETEER_HOME=… bash docs/evidence/f12_est_08/recorrido.sh docs/evidence/f12_est_08/recorrido`

**Ejecución final:** sobre `1f55988`, de 11:27:04Z a 11:28:29Z (`version.txt`; `status` solo lista las salidas de esta misma ejecución).

| Fase | Comprobaciones |
|---|---|
| Directiva, modo provisional | **29/29** |
| Administrador | **1/1** |
| Política pendiente | **2/2** |

Los detalles están en `recorrido-*.json`, las respuestas reales del servidor resumidas (sin cabeceras ni tokens) en `respuestas-*.json`, y los CSV descargados en `downloads-*`.

| Paso | Captura | Resultado |
|---|---|---|
| Borrador sin estimación | `01` | Cada línea dice «Sin estimación», sin ningún cero. Herbicida: 120 L. Insecticida, oculto bajo el umbral |
| La Directiva genera la estimación | `02` | El trabajador real la termina |
| Borrador con estimación (P1) | `03` | Misma huella, mismas líneas y mismo total (122000 mL) que P0. Herbicida: «111 L · Vigente · anterior al borrador», y su necesidad sigue en 120 L (no aparece 231). Fungicida: «Datos insuficientes» con su motivo. Insecticida: «Sin estimación» |
| Borrador anterior (P0) | `04` | La misma ejecución, marcada «posterior al borrador» |
| CSV de P1 | `downloads-provisional/01-…` | Columnas del borrador iguales al JSON y `estimation_*` iguales a la referencia del servidor |
| Otra campaña clasificada | `05` | «Desactualizado» con su motivo, con la cifra |
| Fuente retirada | `06` y `02-…csv` | «Cifra retirada», sin 111. El CSV sigue igual al servidor y sin la cifra |
| Respuesta diferida | `07` | Se retuvo la referencia de P1. Se cambió a la otra campaña y se generó su borrador (60 L). La referencia retenida se liberó después y **no aparece**: la celda sigue en «Sin estimación» |
| Campaña sellada | `08` y `03-…csv` | T1 se cierra y se sella por la API. Al consultar el borrador, la referencia y el CSV, solo cambia `RefreshToken`: la recarga de la página renueva la sesión del navegador, que no es la propuesta. La suite de PostgreSQL comprueba por HTTP que no cambia ninguna tabla. Mismas líneas y huella que antes del sellado |
| Tablas privadas | — | El md5 de las 8 tablas no cambia en todo el recorrido, con filas sembradas (compra, ítem, deuda, lote y movimiento: 1 cada una) |
| Administrador | `09` | La misma referencia separada |
| Política pendiente | `10` y `downloads-pending/01-…` | Sin cifra, con el motivo. El CSV se sigue descargando, con `POLICY_PENDING` |

**Fallos del recorrido durante su preparación** (ensayos con salida en la carpeta temporal, no publicados):
- **Primer ensayo:** el guion no detectó el segundo CSV porque tenía el mismo nombre que el primero. Se corrigió numerando cada descarga.
- **Segundo ensayo:** la comprobación del sellado exigía que no cambiara ninguna tabla y falló por `RefreshToken`. Se acotó a «ninguna salvo las de sesión», y el detalle registra cuáles cambian.

## 6. Límites

- **Solo HOST.** No hay DEVICE ni EMULADOR. Mobile no muestra propuestas y no cambia.
- **La exportación evalúa la vigencia al exportar.** Si entre la consulta en pantalla y la exportación se calcula otra ejecución, el CSV lleva la nueva, identificada por `estimation_run_ref` y `estimation_evaluated_at`. No se fija a lo mostrado.
- **Referencia de un borrador histórico:** se muestra la vigente al consultar, no la que existía al generarlo, identificada con su ejecución y su relación con el borrador. Reconstruir la de entonces sería otra consulta, que no se construyó.
- **La vista y la referencia del CSV se leen en dos pasos**, sin una transacción común. Cada parte es coherente consigo misma.
- **En el recorrido, la retirada y la clasificación se simulan en la base.** En la suite de PostgreSQL, la retirada llega por una cancelación real de Sync v1.
- **El service worker se omite en el recorrido.** No se prueba aquí.
- **La política es `F07-POL-01` en modo `PROVISIONAL_SYNTHETIC`:** solo datos sintéticos y no aprobada. Nada de esto habilita datos reales.
- **Los tiempos de 5 s agotados de §3 y §4** quedan sin causa confirmada.
- **Hallazgo aparte, sin causa confirmada:** `f10_x01_pago_datos_test` (Mobile). No se toca en este bloque, porque no hay relación demostrada.
- **F12-EST-10 y la decisión de GATE-F12** quedan para el cierre posterior. No cambia ningún gate.

## 7. Decisión del autor sobre las filas ocultas y comprobación acotada (2026-11-03)

**Decisión.**
- La estimación se muestra como referencia independiente aunque la necesidad de la fila esté oculta, siempre que la permitan sus propios controles de divulgación y autorización.
- Es una diferencia deliberada respecto a W3 y queda registrada en el contrato §7.1. El Word no se modifica.

**Cambios** (sobre `af38134`):
- **Pantalla:** en una fila con la necesidad no divulgada, la celda de la referencia empieza con «La necesidad de esta fila no está divulgada. Lo que sigue es la estimación del consumo: no la sustituye ni se suma a la propuesta.».
- **Suite de PostgreSQL:** se añade Acaricida, con consumo sellado por tres agricultores en las cuatro campañas y necesidad declarada solo por dos.
- **Pruebas de componentes:** se añade una para este caso.
- **Sin cambios** en el servicio, en el CSV ni en la huella.

| Comprobación pedida | Prueba | Resultado |
|---|---|---|
| Necesidad oculta y estimación permitida: referencia separada para los roles autorizados | **Nueva.** En `f12-est-08-proposal-reference.postgres.spec.ts`, «with an estimation available…»: la línea Acaricida es `SUPPRESSED_UNDER_THRESHOLD`, sin cantidad ni aportantes; su referencia es `ESTIMATED`, `CURRENT`, con cifra igual a `/estimation/results`, idéntica para la Directiva y el Administrador. El Agricultor recibe 403 (prueba «rejects…»). En el CSV, la fila tiene la necesidad vacía (ni la estimación ni un cero) y la cifra solo en `estimation_estimate_base`. Componentes: «necesidad oculta con estimación permitida…» (si se retira la advertencia, falla) | 7/7 y 17/17 |
| Necesidad visible y fuente de consumo retirada: ninguna cifra de estimación | **Ya existía:** «marks the reference OUTDATED… withheld when a source is withdrawn». Herbicida, con 120 L publicados, da `SOURCES_WITHDRAWN` y `estimate_base` nulo, y el CSV no contiene `111000`. Recorrido, paso 7 | Pasa |
| Política pendiente: ninguna cifra de referencia | **Ya existía:** «with the policy pending…». `availability: POLICY_PENDING` y todas las líneas sin cifra. Recorrido, fase *pending* | Pasa |
| Iguales líneas, totales y huella funcional | **Ya existía**, ahora con Acaricida: P0 y P1 tienen la misma `inputs_fingerprint`, las mismas líneas y el mismo total servido (122000 mL; Acaricida, oculto, no suma). Las filas guardadas son idénticas | Pasa |

**Ejecuciones sobre `0c33c2a`:**

| Suite | Correctas | Omitidas | Fallidas |
|---|---|---|---|
| `f12-est-08-proposal-reference.postgres.spec.ts` (12:07:25Z–12:07:52Z; demostración regenerada en `demo-postgres.json`) | 7 | 0 | 0 |
| Web `npx vitest run` | 170 | 0 | 0 |

La línea oculta Acaricida recibe la referencia `ESTIMATED` 3701.025000 mL. El total servido sigue en 122000 mL y la huella de P0 y P1 es la misma. El código del servicio no cambia desde `1f55988`, cuya suite completa del Backend figura en §4.

**Recorrido de navegador:** no se repitió. El de §5 es sobre `1f55988`, y su fila oculta (Insecticida) no tiene estimación. La advertencia nueva solo está cubierta por las pruebas de componentes y por la suite de PostgreSQL, en lo que respecta a los datos.

**Tiempos agotados:** se conservan como fallos sin causa confirmada (§3 y §4). No se aumentó ningún límite ni se tocó ninguna prueba ajena.

