# F07 — Web Directiva/Administrador, reconciliación y propuesta conjunta en borrador

- **Fecha real:** 2026-10-16 (America/La_Paz). Ejecución automatizada por Claude Code (sesión B) con autorización delegada para construir. Sin revisión de Roderich ni del tutor.
- **Rama:** `feat/f07-web-directiva`, base `063437d`, con `main` integrado mediante merges: `6e9e33d` (#112, #113) y `56d5317` (`c656921`, #115).
- **Issues:** #23, #24, #25 (parcial), #26, #27, #108; #28 (CSV de la propuesta); Refs #29 (GATE-F07, Pending).
- **Política de divulgación:** F07-POL-01 **no aprobada** (#107). Las cifras sólo se ven con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` y datos sintéticos. Sin esa variable, o en producción, el servidor no publica cifras.

## 1. Qué se construyó

### Backend

| Pieza | Comportamiento |
|---|---|
| `JointPurchaseProposal` / `JointPurchaseProposalLine` | Borrador (`DRAFT` es el único estado). La línea **no guarda cantidades**: referencia la divulgación (`CollectiveRelease`) que el resumen decidió publicar. CHECK en la base: `releaseId` presente si y sólo si la línea es `DISCLOSED`. |
| `POST /collective/campaigns/:id/proposals` | Ejecuta la decisión del resumen dentro de su transacción y bloqueo, y guarda sólo las celdas `DECLARED_NEED`. En `POLICY_PENDING` responde 409 y no guarda nada. |
| `GET /collective/campaigns/:id/proposals` | Historial: fecha, autor, huella y número de líneas. Sin cantidades. |
| `GET /collective/proposals/:id` y `/csv` | Antes de servir, vuelve a decidir con la política del resumen, dentro de su bloqueo. Una línea muestra su cifra **sólo si la celda muestra ahora esa misma divulgación**. Si la celda no muestra ninguna cifra, la línea sale `WITHDRAWN`; si muestra otra más reciente, `SUPERSEDED`. En ambos casos va sin cantidad y con la huella oculta. `pending_changes` se toma de la celda actual. En `POLICY_PENDING` todas las líneas salen sin cifra, sin cobertura y sin huella. El CSV sale de la misma vista y neutraliza textos que una hoja de cálculo ejecutaría como fórmula. |
| Huella | SHA-256 de una serialización canónica, ordenada por producto y unidad, de lo que el resumen publicó: estado, total sólo si `DISCLOSED`, `pending_changes` y cobertura. Un total oculto nunca entra. |
| `GET /collective/product-associations/catalog` | Denominaciones del tenant: nombre, unidad, unidad base y activo. Sin stock ni otros datos legacy. |
| Historial de asociaciones | Añade `actor_name` y `closed_by_name` (Directiva/Administrador, no agricultores). |
| Roles | `DIRECTIVA` y `ADMINISTRADOR` del mismo tenant (ADR-003). `AGRICULTOR` 403, otro tenant 404 indistinguible, sin sesión 401. |

La propuesta usa la **necesidad declarada**. No resta stock privado y no se llama «necesidad neta»: RF-32 (Could) queda **no implementado**, porque F06 deniega `declared_stock`.

No hay recomendaciones automáticas ni compras ejecutadas. Generar un borrador no crea compras, lotes, movimientos, deudas ni pagos.

### Web

| Ruta | Contenido |
|---|---|
| `/colectivo/resumen` | Selector de campaña (filtro visible), aviso del modo de divulgación y cobertura «N de M agricultores vinculados» («ausencia = desconocido, no cero»). Tablas separadas de necesidad declarada y consumo. |
| `/colectivo/propuestas` | Generar borrador, detalle, historial con huella y autor, y CSV pedido al servidor. |
| `/colectivo/cobertura` | Sólo el conteo agregado. No lista agricultores. |
| `/colectivo/reconciliacion` | Asociar, corregir y deshacer, con motivo y casilla de confirmación explícita. Historial con «anterior → nuevo», actor, fecha y motivos. Sólo se ofrecen canónicos de la misma dimensión. |

- **Menú congelado de DIRECTIVA y ADMINISTRADOR:** resumen, propuestas, cobertura, reconciliación y campañas, más usuarios para el ADMINISTRADOR. Las pantallas legacy salen del menú.
- **Las rutas no cambian la autorización.** `CollectiveRoute` redirige a quien no tiene esos roles, pero quien decide es el servidor.
- **Estados que maneja la UI:**
  - `POLICY_PENDING`;
  - `SUPPRESSED_UNDER_THRESHOLD`: «menos de k», sin la cifra ni el conteo exacto;
  - `SUPPRESSED_REVISION`;
  - cifra anterior con `pending_changes`;
  - cero explícito;
  - ausencia: sin celda, con un aviso de que no es cero;
  - `OVERFLOW`;
  - `WITHDRAWN` y `SUPERSEDED`, sin cifra y con «huella oculta»;
  - errores 403/404/409, y sin conexión: no se encola nada.
- **Cantidades:**
  - se presentan sólo con BigInt y strings, sin `Number` ni `parseFloat`;
  - si el valor no es un entero exacto, o no coincide con la presentación del servidor, se muestra un error en vez de una cifra;
  - nunca se suma ni se resta en el navegador.
- **Cola offline:** no se usa ni se amplía.

## 2. Defecto corregido tras la revisión de A

- **Qué decía la versión anterior.** Esta evidencia, en `ba14a20`/`5987fa0`, afirmaba que una cifra retirada no se servía. **Era incorrecto.**
- **Por qué.**
  - `render()` comprobaba sólo `release.withdrawnAt`.
  - El resumen sólo retira la **última** divulgación de una celda. Una divulgación anterior (R1), sustituida por R2, conserva `withdrawnAt = null` para siempre.
  - Con P1 sobre R1, k cambios que publican R2 y una cancelación que retira R2, P1 seguía sirviendo la cifra de R1 en JSON y CSV.
  - Lo encontró la sesión A al revisar #116 (`PARALELO_CONTROL.md`, «REVISIÓN_A_B»).
- **Corrección (`6db54b5`).** La línea sirve la cifra sólo si la decisión actual del resumen muestra esa misma `releaseId`; si no, sale `WITHDRAWN` o `SUPERSEDED`, sin cifra y con la huella oculta.
- **Regresión completa, decidida por Roderich.** Va por la API real en PostgreSQL y recorre dos caminos:
  - retirada de la última divulgación;
  - R1 → R2 → retirada.

  En cada camino, después de la retirada, ninguna respuesta nueva contiene la cantidad retirada ni la huella que la cubría: detalle, listado/historial (`GET …/proposals`) y CSV de cada borrador anterior, un borrador nuevo con su CSV, y el resumen JSON/CSV. La comprobación la hace el servidor, no la interfaz.
- **Prueba en rojo antes del arreglo** (`dee81dc`, ejecutada contra el caso de uso de `5987fa0`). Fallan los dos caminos:
  - **R1 → R2:** esperado `status: "SUPERSEDED", quantity_base: null, contributors: null`; recibido `status: "DISCLOSED", quantity_base: "6000", contributors: 3`.
  - **Retirada de la última divulgación:** la cantidad ya no salía, pero el detalle seguía publicando la huella SHA-256 que la cubría (`inputs_fingerprint` no nulo). Con un espacio de valores pequeño, esa huella permite comprobar candidatos.
- **En verde con la corrección.** Resultados en §3.

## 3. Verificación ejecutada

- **SHA verificado:** `dee81dcb0355be973fd5c7c7b0ad9e5836873b8f`, en la rama `feat/f07-web-directiva`. Es el último commit de código; lo que sigue son sólo documentos. Incluye los merges de `main` `6e9e33d` y `56d5317`.
- **Fecha:** 2026-10-16. Verificación de 17:52:25Z a 17:55:22Z; recorrido de 17:55:22Z a 17:57:29Z.
- **Entorno propio de la sesión B:**
  - PostgreSQL 16 en el contenedor `agro_b_web_pg` (`127.0.0.1:55442`), con bases nuevas por suite;
  - API en 3112 y Web en 5174;
  - Node v25.9.0 en local. El CI usa Node 22.
- **Secretos:** se generan en memoria en cada corrida y no aparecen en archivos ni logs.

### 3.1 Backend

| Comando | Resultado |
|---|---|
| `npx prisma validate` | OK |
| `prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code` (tras el merge) | «No difference detected» |
| `npm run build` | OK |
| `npx eslint` sobre los archivos cambiados | 0 problemas. `eslint src` completo mantiene el error preexistente `structuredClone` de `inventory-adjustment.use-case.ts`, ya presente en la base `063437d` |
| `npm test -- --runInBand` | 199 pasan, 150 omitidas (las `*.postgres.spec.ts` sin URL). Incluye `domain/proposal.spec.ts` y la prueba de neutralización de #115 |
| `npm run openapi:check` | Snapshots coinciden; aserciones F02, F05 y F06 OK (con las rutas nuevas) |
| `auth-v2.postgres.spec.ts` | 12/12 |
| `current-auth-context.postgres.spec.ts` | 25/25 |
| `f02-final-integration.postgres.spec.ts` | 3/3 |
| `sync-v1-journal.postgres.spec.ts` | 30/30 (9 migraciones, la de F07 la última) |
| `sync-v1-adversarial.postgres.spec.ts` | 41/41 |
| `sync-v1-references.postgres.spec.ts` | 7/7 |
| `f06-coll-05-collective-aggregate.postgres.spec.ts` | 15/15 (con la prueba de migración tomada de `9b0a2ba`) |
| `product-reconciliation.postgres.spec.ts` | 5/5 |
| **`f07-web-proposal.postgres.spec.ts`** (nueva) | **12/12** |

Lo que comprueba `f07-web-proposal.postgres.spec.ts`. Todo pasa por la API real, con contribuciones publicadas mediante `POST /sync/v1/push`.

1. **Etapa RAW frente al oráculo D4** ([`test-support/d4`](../../Back/src/modules/collective/test-support/d4/README.md), copias literales de Mobile `74d5539` con su SHA-256):
   - celdas del resumen y líneas de la propuesta idénticas al oráculo;
   - los totales ocultos (Belator 7000, Bellator 4000…) no aparecen en el JSON ni en el CSV;
   - Urea 25000/3 incluye un cero explícito;
   - la necesidad cancelada queda ausente;
   - cobertura 3 de 4.
2. **Regeneración:** otro borrador con las mismas líneas, el mismo orden y la misma huella. El historial no lleva cantidades.
3. **Sin efectos:** compras, ítems, asignaciones, participantes, lotes, movimientos, cuentas por pagar, pagos, contribuciones (estado, cantidad y secuencia), journal y catálogo quedan iguales antes y después de generar, consultar y exportar. Las líneas guardadas no tienen ninguna columna de cantidad.
4. **Etapa CANONICAL** tras confirmar Bellator → Belator:
   - resumen y propuesta regenerada iguales al oráculo (Belator 11000/3);
   - cambia sólo la huella de C1; la línea de Urea y la huella de C2 no cambian;
   - el borrador RAW anterior sigue mostrando sólo lo que mostró.
5. **Roles:** DIRECTIVA y ADMINISTRADOR del tenant acceden. AGRICULTOR recibe 403 en siete rutas, sin cifras; el tenant ajeno, 404 en las rutas de campaña y propuesta, y no ve el catálogo ni las asociaciones del tenant A; sin sesión, 401.
6. **Cliente Auth V1 de la Web:** `POST /auth/login` accede a la propuesta.
7. **Catálogo:** sólo nombre, unidad, unidad base y activo. Historial con nombres de actores.
8. **Cambios pendientes y desbordamiento:**
   - con cambios pendientes se mantiene la cifra anterior (6000, `pending_changes`) y 6500 no aparece;
   - con `OVERFLOW` no hay cifra;
   - el CSV neutraliza `=Campana, con fórmula`.
9. **Retiro de la última divulgación:** si un aportante cancela, los borradores anteriores sirven `WITHDRAWN` sin 25000, aunque nadie haya pedido el resumen. Después, la regresión completa de §2: detalle, listado/historial y CSV de todos los borradores de la campaña, un borrador nuevo con su CSV y el resumen JSON/CSV, sin 25000 y sin las huellas anteriores.
10. **Divulgación antigua (añadida tras la revisión de A).** Secuencia: P1 sobre R1 (6000) → k cambios publican R2 (6600) → cancelación que retira R2.
    - R1 conserva `withdrawnAt = null`.
    - P1 sale primero `SUPERSEDED` y luego `WITHDRAWN`.
    - La misma regresión completa, sin 6000 ni 6600 y sin las huellas de P1 y P2.
11. **`POLICY_PENDING`:** generar responde 409 sin guardar. Los borradores existentes no muestran cifras, cobertura ni huella, y el tenant ajeno sigue en 404.
12. **Logs:** no contienen cantidades.

### 3.2 Web

| Comando | Resultado |
|---|---|
| `npm ci` (desde limpio) | OK |
| `npm run lint` | 0 errores, 2 avisos preexistentes (`contexts/*`) |
| `npm run build` | OK |
| `npm test` (vitest) | 33/33 en 5 archivos |

Qué cubren las pruebas de UI (HTTP simulado):

- **Aritmética exacta:** más allá de 2^53 y en int64 máximo; rechazo de `-1`, `1.5`, `1e3`, `010` y `NaN`; error si la presentación del servidor no coincide.
- **Rutas y menú por rol.**
- **Resumen:**
  - `POLICY_PENDING`;
  - una celda suprimida que, aun recibiendo un total por error, no lo muestra;
  - revisión, desbordamiento, cero, cambios pendientes y ausencia;
  - error 403 y sin conexión, sin escribir `localStorage`;
  - un `?campaign=` que no es UUID se ignora.
- **Propuesta:**
  - generar;
  - 409 `POLICY_PENDING`;
  - borrador abierto bajo `POLICY_PENDING`;
  - `WITHDRAWN` y `SUPERSEDED` sin cifra y con «huella oculta»;
  - historial sin cantidades;
  - CSV pedido al servidor.
- **Reconciliación:**
  - no se envía sin canónico, motivo y casilla;
  - sólo candidatos de la misma dimensión;
  - unidad no vinculable;
  - canónico con alias;
  - historial;
  - deshacer;
  - un 409 de reconciliación se presenta como cambio concurrente, no como política pendiente.

### 3.3 Recorrido Web con datos sintéticos

- **Comando:** orquestador local de la sesión B. Pasos:
  1. base nueva y `prisma migrate deploy`;
  2. API `node dist/main.js` en 3112 con `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`;
  3. `vite` en 5174 con `VITE_API_PROXY_TARGET`;
  4. `F07_SYNTHETIC_SEED=yes node Back/scripts/f07-synthetic-seed.cjs`: publica 27 operaciones del dataset D4 por la API, al ritmo del throttler;
  5. `node docs/evidence/f07/walkthrough.mjs provisional`;
  6. reinicio de la API **sin** el modo provisional y `walkthrough.mjs pending`.
- **Navegador:** Edge sin interfaz, mediante `puppeteer-core` 25.12.0 instalado fuera del repo.
- **Resultado:** **provisional 24/24, pending 3/3**. Detalle en [`walkthrough-provisional.json`](img/f07/walkthrough-provisional.json) y [`walkthrough-pending.json`](img/f07/walkthrough-pending.json).
- **Correcciones hechas por el propio recorrido:**
  - tras el login, la Web enviaba a todos a `/dashboard`; corregido en `ba14a20`;
  - el guion leía el historial antes de que se recargara; corregido en `534adb8` (el producto mostraba las huellas correctas);
  - el resto de los intentos fallidos fueron errores del guion de navegación, también corregidos.
  - Ninguno se presenta como evidencia.

| Comprobación | Resultado |
|---|---|
| Directiva aterriza en `/colectivo/resumen`; menú congelado (resumen, propuestas, cobertura, reconciliación, campañas) | OK |
| RAW: Urea necesidad 25 KG / 3; Belator y Bellator ocultos sin cifra; consumo Glifosato 8,25 L / 3; necesidad de Glifosato cancelada ausente; cobertura 3 de 4 | OK |
| Propuesta RAW: 3 líneas, sólo Urea con cifra; regenerar sin cambios da la misma huella | OK |
| Reconciliación: sin la casilla no se puede confirmar; asociación Bellator → Belator con historial | OK |
| CANONICAL: necesidad de Belator 11 L / 3, consumo 8 L / 3, Bellator sin fila propia | OK |
| Propuesta regenerada: Belator 11 L; la huella cambia; CSV del servidor con `Belator,ML,L,DISCLOSED,11000,11,3` | OK |
| ADMINISTRADOR: menú de Directiva más Usuarios | OK |
| AGRICULTOR: redirigido fuera de `/colectivo`, sin vistas colectivas en el menú | OK |
| API (cliente Auth V1): AGRICULTOR 403, tenant ajeno 404 y sin sesión 401 en `summary` y `proposals`; ninguna respuesta denegada contiene cifras | OK |
| `POLICY_PENDING`: aviso sin tablas; generar se rechaza sin guardar; un borrador anterior no muestra cifras | OK |

Capturas en `docs/evidence/img/f07/`, generadas por el guion y revisadas por Claude; no las revisó una persona:

| Archivo | SHA-256 |
|---|---|
| `01-resumen-c1-raw.png` | `318f9189ab6ebbbc9c8dad3ff9fa00d41a574f7cfdedd831c8e6d9a2937d1fa6` |
| `02-propuesta-c1-raw-regenerada.png` | `c7c6cc2673a379f8f527e8517fd609215750381cd2dc350e815692301cf6797a` |
| `03-reconciliacion-confirmacion.png` | `80d47835393eebcd632cc32a81618d9c39e13a330532a8f552ccdb928faabf0e` |
| `04-reconciliacion-historial.png` | `6e4c7f77064af15ad481265c5988cde789e97d998de70f4f506d073b81e22373` |
| `05-resumen-c1-canonico.png` | `46891bd5e5d2e6c42b09fdded1ec80383ed371c983a4510068d21a36b14c1cb7` |
| `06-propuesta-c1-canonica.png` | `60cc01200dcd2c874397c87ba2b320d4cbfac3bfe7a09edbc9d7245373c84064` |
| `07-cobertura.png` | `ad6901e1adda329e0115145e4e032ac0d7b06f4dde82a5699100a748fd541a1b` |
| `08-menu-administrador.png` | `5aa102b2a0582cee7229c7e055c957947cd4128fd2c779d39f68c8ba1ba54d80` |
| `09-agricultor-redirigido.png` | `dc97110597a1ffdb378ebc0984d88d9b27610ad57fe6f4d1372320f99016e281` |
| `10-resumen-policy-pending.png` | `45da113d2091be22944be9256111e7af5392b61115dded42cdab27b9b5c96bfa` |
| `11-propuesta-policy-pending.png` | `dd7f87889a4abd85da151b1aa642a5905860ebe26f3a787b2ae7d5ed7b098747` |
| `propuesta-c1-canonica.csv` | `34bb7f67503e5c288883ce6566fae954c7fdd6559f08505dac528bbc4d500c32` |

La captura 09 muestra el panel legacy del agricultor. Esas pantallas siguen existiendo para la transición (#81) y no forman parte de F07.

### 3.4 CI del PR #116

- **HEAD `818e980`:**
  - run 38937972272 «Backend F02 verification»: **success**;
  - run 38937972190 «Web F07 verification»: **failure**. El job `web` pasó. En `f07-proposal-postgres`, la prueba de roles falló con `ECONNRESET` porque lanzaba 21 peticiones supertest en paralelo.
- **Corrección `f18c4a0`:** las mismas peticiones, en serie. Sin cambios de producto. En local, 11/11.
- **HEAD `f18c4a0`:** run 38938428604 «Backend F02 verification» **success**; run 38938428597 «Web F07 verification» **success** (jobs `web` y `f07-proposal-postgres`). En ese commit seguía presente el defecto descrito en §2.
- **Commit de código final `dee81dc`:** run 38943005476 «Backend F02 verification» **success**; run 38943005472 «Web F07 verification» **success**. Los commits posteriores son sólo documentos y no disparan los workflows por sus filtros de ruta.

## 4. Límites y pendientes

- **#25:** no hay estado por agricultor ni última sincronización individual, por decisión de alcance; sólo cobertura agregada.
- **#23:**
  - las rutas legacy (`/inventory`, `/purchases`, `/sync`, `/plots`, `/applications`, `/calendar`, `/reports`, `/directiva`, `/audit-logs`) siguen existiendo y sus endpoints responden según sus guardas heredadas;
  - sacarlas del menú **no** corrige su exposición, que se revisa en #45/#81;
  - la cola offline Web no se retiró.
- **RF-22:** no hay detalle por agricultor.
- **RF-32:** necesidad neta no implementada.
- **#108:**
  - no hay sugerencias por similitud, que son opcionales;
  - no hay eventos de `audit-logs` legacy: el historial de asociaciones es la auditoría de este flujo.
- **Pruebas de UI:** son focalizadas, con HTTP simulado (vitest + Testing Library + jsdom). No hay pruebas E2E en CI. El recorrido real se automatizó con Edge sin interfaz y no lo revisó una persona.
- **Bitácora heredada:** queda fuera del menú institucional porque guarda snapshots `before`/`after` (#45).
