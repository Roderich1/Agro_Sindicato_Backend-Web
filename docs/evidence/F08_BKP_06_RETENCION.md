# F08-BKP-06 (#40): retención de las copias verificadas más recientes — evidencia

- **Fecha:** 2026-10-19 (America/La_Paz). Sesión C, con la política que aprobó Roderich Rendón el mismo día y que transmitió la sesión A.
- **Base:** Backend `main` `23ffaa2`.
- **Código:** `2aaf67dc461fdbc4705bea019ab9d2b5feca81e0`. Las notas fechadas de la documentación están en `3258fe6`.
- **Diseño:** [`F08_BKP_06_RETENCION.md`](../architecture/F08_BKP_06_RETENCION.md), revisado por la sesión B (LISTO sobre `15ec735`).
- **Entorno:** host Windows 11, Node 25.9.0, PostgreSQL 16 (`postgres:16-alpine`) desechable en Docker local, y el adaptador de disco de desarrollo.
- **No es B2:** no se ejecutó nada contra Backblaze B2, ni real ni simulado, en esta parte. **Sin dispositivo.**
- **Alcance:** este archivo no cambia el estado del issue, del Project ni de los gates.

## Qué se implementó

| Pieza | Archivo |
|---|---|
| Migración `20261019150000_f08_bkp06_retention`:<ul><li>`purgePending BOOLEAN NOT NULL DEFAULT false` y `deletionReason VARCHAR(16)`;</li><li>un `CHECK` para que una fila `AVAILABLE` nunca tenga purga pendiente;</li><li>otro para que `deletionReason` valga sólo `OWNER` o `RETENTION`, y sólo en filas `DELETED`.</li></ul>No rellena nada a posteriori. | `Back/prisma/migrations/…/migration.sql`, `schema.prisma` |
| Purga comprobada y reconciliación: `purgePending()`. Una fila `DELETED` llama a `remove`; una `FAILED`, a `discardStaged` y después a `remove`. La marca sólo se limpia cuando el almacenamiento confirma. | `application/backup-retention.ts` |
| **Subida:**<ol><li>cierra las abandonadas (`FAILED ABANDONED`, pendientes);</li><li>reconcilia las purgas del Member;</li><li>reserva bajo el bloqueo del Member: 409 `BACKUP_UPLOAD_IN_PROGRESS` si hay otra en curso, 503 si *A* + *P* > N;</li><li>**completa y rota en una sola transacción**: `AVAILABLE` y retirada de las sobrantes, nunca la nueva;</li><li>purga las retiradas.</li></ol>**Fallo:** la fila queda `FAILED` con `purgePending` y se purga. **`DELETE`:** bajo el mismo bloqueo, `OWNER`. | `application/backups.service.ts` |
| Código cerrado `BACKUP_UPLOAD_IN_PROGRESS`. `BACKUP_QUOTA_EXCEEDED` se conserva en el enum, pero ya no se emite. Descripciones nuevas de 201, 409 y 503. | `backup-http-error.ts`, `backups-openapi.schemas.ts`, `backups.controller.ts`, `docs/api/openapi-f0{2,8}*.json` |
| Aserciones de contrato de la OpenAPI: el 409 incluye `BACKUP_UPLOAD_IN_PROGRESS`, `BACKUP_QUOTA_EXCEEDED` sigue en el enum y la descripción del 201 menciona la retirada. | `Back/scripts/openapi-contract.cjs` |
| `backups:inventory -- --reconcile [--apply]`: muestra las purgas pendientes por motivo; sin `--apply` es un *dry-run*. No imprime identificadores. | `cli/backups-inventory.ts` |

## Prueba que se sustituye

«limits the copies in use per Member (409) and frees a slot on deletion» (`backups.postgres.spec.ts`) probaba el contrato anterior: con N copias, 409 `BACKUP_QUOTA_EXCEEDED`. **Se sustituyó porque ese contrato cambió**, y no se presenta como la misma prueba. En su lugar queda un comentario que remite a T-R1, T-R1b y C1.

Las dos pruebas que simulan un fallo al marcar `AVAILABLE` («…its bytes are removed» y «an ambiguous AVAILABLE update that did commit…») siguen comprobando lo mismo. Sólo cambia cómo se inyecta el fallo: ahora es sobre la transacción de finalización (`test-support/backup-test-hooks.ts`), porque la marca `AVAILABLE` ya no es una llamada suelta.

## Comandos y resultado (árbol idéntico a `2aaf67d`: se ejecutaron justo antes del commit, sin cambios después; base desechable)

```text
npx tsc --noEmit -p tsconfig.json                                   → sin errores
npx eslint <archivos cambiados>                                      → sin avisos
npm run openapi:check                                                → snapshots iguales; F02, F05, F06 y F08 contract assertions passed
F08_BKP_PG_TEST_URL=<base desechable> npx jest src/modules/backups --runInBand --verbose --testTimeout=60000
  → Test Suites: 6 passed, 6 total; Tests: 75 passed, 75 total
```

La URL de la base de pruebas se pasó por variable de entorno y no se escribe aquí. La suite completa del Backend corre en el CI del PR. La nueva prueba se llama `retention.backups.postgres.spec.ts`, así que la recoge el paso existente `F08_BKP_PG_TEST_URL=… npx jest backups.postgres.spec.ts`.

**Primera corrida:** dio 13 de 16. Los tres fallos (C2, C5 y C6) eran de la propia prueba. supertest sólo envía la petición cuando se la espera, así que las subidas que debían quedar detenidas en el `commit` nunca empezaron, y las esperas que quedaron sin usar arrastraron a C5 y C6. Se corrigió la prueba, no el código, y la corrida de arriba es la posterior.

## Casos de `retention.backups.postgres.spec.ts` (16/16 PASS, N = 3)

| ID | Qué comprueba |
|---|---|
| T-R1/T-R1b | Hasta N copias no se retira nada. La subida siguiente da 201: quedan exactamente las N más recientes y la más antigua queda `DELETED`/`RETENTION`, sin purga pendiente ni objeto. Esa copia responde 404 al descargarla y al borrarla. Las demás siguen íntegras. |
| T-R1c | Copias con 3 años de antigüedad no se retiran: un 422 no retira nada, y una tercera subida deja las tres. |
| T-R2 | Con N = 1:<ul><li>ni un 422 ni un fallo de `commit` (503) retiran la copia;</li><li>durante la transacción que completa la nueva, otra conexión sigue viendo la anterior `AVAILABLE`;</li><li>al terminar, la anterior queda `RETENTION`.</li></ul> |
| T-R4 | Si falla la marca `AVAILABLE`: 500, ninguna copia cambia y la fila nueva queda `FAILED METADATA_UPDATE_FAILED` sin bytes. Si la transacción se confirmó pero se informó un fallo (caso ambiguo): 201, la retirada queda pendiente con su objeto (N + 1) y la subida siguiente la purga primero (N). |
| T-R5 (rotación) | Con `remove` fallando:<ul><li>la subida da 201 y la retirada queda pendiente (N + 1 objetos);</li><li>la siguiente da 503 `BACKUP_STORAGE_UNAVAILABLE`, sin crear fila ni objeto;</li><li>al recuperarse, la siguiente reconcilia y da 201. Quedan N objetos y ninguna purga pendiente.</li></ul> |
| T-R5 (subida fallida) | Con `remove` y `discardStaged` fallando, un 422 deja la fila `FAILED` con `purgePending`, y la subida siguiente da 503. Al recuperarse, 201. |
| T-R7 | El propietario borra su única copia: 204, lista vacía, `OWNER` sin purga pendiente y sin objeto. |
| C1 | Con una subida a medio cuerpo, otra subida del mismo Member da 409 `BACKUP_UPLOAD_IN_PROGRESS`. La primera termina con 201: N copias y exactamente una retirada, la más antigua. |
| C2 | **Borrado antes de la finalización** (subida detenida en el `commit`): quedan N y ninguna retirada por retención. **Borrado durante la finalización:** el `DELETE` espera el bloqueo del Member (400 ms sin terminar), después termina con 204 y queda una retirada `RETENTION` (la más antigua) y una `OWNER`: N − 1 `AVAILABLE`, el mismo resultado que si se hubieran ejecutado en serie. |
| C3 | Una descarga que compite con la retirada de esa misma copia responde 404 `BACKUP_NOT_FOUND`, no 500. |
| C4 | Las subidas simultáneas de dos Members rotan, cada una, sólo las copias propias. |
| C5 | Una fila `UPLOADING` reciente bloquea con 409 y no se cierra, y su staging sigue. Con más de 60 min, se cierra como `FAILED ABANDONED` y su staging se purga. Una subida detenida en el `commit` que entretanto se cierra como abandonada termina con 503, no se lista y no deja objeto. |
| C6 | El `CHECK` rechaza `purgePending` y `deletionReason` en una fila `AVAILABLE`. Dos reconciliaciones en paralelo confirman 2 purgas en total y no tocan ninguna fila ni ningún objeto `AVAILABLE`. |
| T-B2 (servicio) | Un `commit` que hace visible el objeto y después lanza un error (como R-c de #147): 503, `FAILED STORAGE_COMMIT_FAILED`, objeto purgado y ninguna copia anterior retirada. |
| Operador | `--reconcile` sin `--apply` cuenta (`"OWNER": 1`) sin purgar. Con `--apply` confirma 1 purga y el objeto desaparece. La salida no contiene ids, claves, Member, tenant ni la ruta. |
| Logs | Se registra «Backup retention purge pending» sin ids de copia, claves, Members, tokens ni la ruta de almacenamiento. |

## Mutaciones (locales, revertidas; `git status` limpio al terminar)

| ID | Mutación en `backups.service.ts` | Resultado de la suite de retención |
|---|---|---|
| M1 | `DELETE` sin el bloqueo del Member | **falla** C2 (1 de 16) |
| M2 | Retirar al **reservar**, antes de que la nueva esté verificada | **fallan** 10 de 16 (T-R1, T-R2, T-R4, T-R5, C2, C3, C6, T-B2…) |
| M3 | No contar las purgas pendientes en la cota | **fallan** las dos T-R5 y C6 (3) |
| M4 | No excluir la copia nueva de las sobrantes | **fallan** 12 de 16 |
| M5 | No reconciliar antes de admitir una subida | **fallan** 5 (las dos T-R5, T-R4, C5, C6) |
| M6 | Una subida fallida no queda con `purgePending` | **fallan** 3 (T-R5 de subida fallida, T-R4, T-B2) |

La mutación «`remove` sin `VersionId`» pertenece al adaptador B2 y la fija el contrato de pruebas de BE #147, sobre su doble S3.

## Actualización del 2026-10-19: merge de `main` con BE #147 y lo que dependía de él

Las secciones anteriores describen `2aaf67d` y se conservan tal cual.

**CI de `7b3ace9`** (run 39277701496): **falló**. `sync-v1-journal.postgres.spec.ts` contaba exactamente 11 migraciones y la migración de retención es la 12.ª. En local sólo se habían ejecutado las suites de `backups`, así que el fallo no apareció antes. Se corrigió la prueba, que ahora espera 12 con `_f08_bkp06_retention` al final; en local da 30/30.

**Commits:**
- `a151488`: merge de `origin/main` `6141572` (BE #147), sin rebase. El único conflicto estaba en los imports de `cli/backups-inventory.ts` y se conservan `storageFromEnv` y `--reconcile`;
- `df26c3a`: lo que dependía de #147.

**Qué se añadió en `df26c3a`:**
- **Plazo de subida** (`BackupsConfig.uploadDeadlineMs`, 30 min por defecto, que define #147). Al vencer, destruye el `Sha256Meter`. La fila queda `FAILED UPLOAD_DEADLINE` con sus bytes purgados, y la respuesta es 503 `BACKUP_STORAGE_UNAVAILABLE` con `Connection: close`. Junto con los topes del adaptador (el `commit` de B2, 180 s), una fila con más de 60 min ya no tiene ninguna escritura en curso.
- **Inventario:**
  - las versiones ocultas y los marcadores van a `hiddenVersion` y sólo se informan;
  - los multipart sin completar van a `incompleteUpload`, una categoría que la limpieza acotada puede abortar con el umbral de antigüedad y la nueva comprobación;
  - con el disco no aparecen nunca.
- **`b2-retention.backups.postgres.spec.ts`** (5 casos). Usa el adaptador `S3BackupStorage` sobre el «doble S3 en memoria» de #147, **que no es B2**:

| Caso | Qué comprueba |
|---|---|
| Rotación | La copia retirada queda con 0 versiones. Las N vigentes tienen una versión cada una, y no queda ningún staging. |
| El proveedor rechaza los borrados por `VersionId` | La retirada queda pendiente con su versión (N + 1) y la subida siguiente da 503. Al recuperarse, se reconcilia: N y 0 versiones de la retirada. |
| `commit` cuya purga del staging falla (R-c) | 503, la fila queda `FAILED STORAGE_COMMIT_FAILED` con `purgePending`, y no se retira ninguna copia. La siguiente subida la reconcilia: sin final ni staging. |
| Plazo de subida (300 ms en la prueba) | Con medio cuerpo y nada más: 503, `FAILED UPLOAD_DEADLINE`, sin versiones ni multipart de esa clave, y la copia anterior sigue. |
| Inventario | Una versión ocultada por un tercero (2 entradas, 300 bytes) aparece como `hiddenVersion` y no como objeto sin fila. Un multipart abierto (200 bytes) aparece como `incompleteUpload`. La limpieza aborta el multipart y **no** toca la versión oculta. |

**Comandos y resultado** (árbol de `df26c3a`, base desechable):

```text
npx tsc --noEmit -p tsconfig.json                                     → sin errores
npm run openapi:check                                                 → snapshots iguales; F02, F05, F06 y F08 passed
F08_BKP_PG_TEST_URL=<base> npx jest src/modules/backups --runInBand    → 10 suites, 153 pruebas, todas PASS
F05_SYNC_05A_PG_TEST_URL=<base> npx jest sync-v1-journal.postgres.spec.ts → 30/30
npx eslint <archivos de backups cambiados>                            → 2 errores no-undef: AbortController (mi prueba B2) y NodeJS (CLI que viene de #147)
```

Los `no-undef` de globales de Node y Jest (`AbortSignal`, `afterEach`, `NodeJS`…) también aparecen en los archivos de `main` que entraron con #147. Es un hueco de la configuración de ESLint, que el CI no ejecuta. En el servicio se evitó importando `clearTimeout` y `setTimeout` de `node:timers`, y en la prueba B2, importando `afterEach` de `@jest/globals`.

**Mutaciones nuevas** (revertidas, `git status` limpio):

| ID | Mutación | Resultado (`b2-retention`) |
|---|---|---|
| M7 | El plazo de subida no destruye el medidor | **falla** «an upload cut at its deadline…» (1 de 5) |
| M8 | El inventario no separa las versiones ocultas | **falla** «the inventory reports hidden versions…» (1 de 5) |

## Lo que esta evidencia no cubre

- **`stillCandidate`** sigue haciendo un `list()` completo por candidato: con B2 son O(n²) llamadas en una limpieza grande. Es correcto, pero caro, y se declara.
- **El doble S3** imita la API S3, no a B2. El comportamiento real del bucket (versiones, Object Lock, SSE-B2 y tiempos) queda para el ensayo con la clave restringida a `ensayo-f08/`.

**Nada contra B2 real** hasta que exista la clave restringida a `ensayo-f08/`.

**Huérfanos anteriores a la migración** (`purgePending = false`): siguen con la limpieza manual de BE #119.

**Fuera de este trabajo, según el §10 del diseño:**
- la política institucional de retención para datos reales;
- el cifrado en reposo;
- la operación productiva (la admisión sigue cerrada);
- las copias `.previo` de la app.
