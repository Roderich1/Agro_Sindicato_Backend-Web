# F08-BKP-06 (#40): retención de copias privadas — diseño

- **Fecha:** 2026-10-19. Sesión C, sobre Backend `main` `23ffaa2`.
- **Estado:** diseño para revisión de la sesión B. **Todavía no hay código.**
- **Dueños:**
  - C: la política y el servicio (`backups.service.ts`), la retención y el inventario.
  - B: el adaptador B2, `backups.module.ts`, `backups-config.ts` y `env.schema.ts`.
  - A: el número de la migración y la integración, en serie.
- **Política:** la aprobó Roderich Rendón el 2026-10-19 como decisión técnica del autor **para la entrega académica**. No es un plazo institucional para datos reales.

## 1. De dónde se parte

- `reserve()` cuenta las filas `UPLOADING` y `AVAILABLE` del Member bajo `pg_advisory_xact_lock`. Con 5 (`BACKUP_MAX_ACTIVE_PER_MEMBER`, por defecto 5) responde **409 `BACKUP_QUOTA_EXCEEDED`**.
- La app (MOB `463d3ec`, `remote_backup_api.dart`) muestra entonces «Ya tiene el máximo de copias en el servidor. Elimine una antes de subir otra.». Por eso **es el agricultor quien borra una copia válida** para poder subir la siguiente (`F08_BKP_06_CONTRASTE.md` §2).
- Si falla el borrado del objeto, el que pide el propietario o el que se intenta tras una subida fallida, queda un huérfano que nadie registra. Sólo lo ve el inventario manual (`backups:inventory`, BE #119).
- No existe adaptador remoto: sólo `LocalDiskBackupStorage`.

## 2. Reglas

Cada regla se puede comprobar con una prueba (§9). *A*, *U* y *P* son conteos por Member:
- *A*: filas `AVAILABLE`;
- *U*: filas `UPLOADING` no abandonadas;
- *P*: filas `DELETED` o `FAILED` con bytes que todavía pueden existir en el almacenamiento (§3).

| | Regla |
|---|---|
| R1 | Tras cada subida verificada se conservan las **N** copias `AVAILABLE` más recientes del Member (N = `BACKUP_MAX_ACTIVE_PER_MEMBER`, 5 por defecto). Las demás se retiran. Ninguna caduca por edad: sin subidas nuevas, nada se retira. |
| R2 | La retención **nunca deja al Member sin su última copia válida**. Sólo retira copias cuando *A* > N ≥ 1, nunca la copia recién verificada y siempre empezando por la más antigua. |
| R3 | **Una sola subida provisional por Member a la vez** (*U* ≤ 1), con el tope de tamaño de siempre (`BACKUP_MAX_BYTES`). No hace falta borrar una copia válida para subir su reemplazo. |
| R4 | Una copia anterior sólo se retira cuando la nueva ya está **íntegra y `AVAILABLE`**: su SHA-256 recalculado coincide, su objeto está confirmado y su fila marcada. Las dos cosas ocurren en la misma transacción, así que la lista nunca muestra más de N copias ni menos de las que corresponden. |
| R5 | **Cota de bytes por Member:** *A* + *U* + *P* ≤ N + 1 en todo momento. Con los valores por defecto son 6 objetos, a lo sumo 6 × 100 MB. Cuando falla una limpieza se conserva ese exceso acotado, queda registrado (§4) y se reconcilia. No hay crecimiento ilimitado. |
| R6 | Una subida abandonada (`UPLOADING` con más de `BACKUP_UPLOAD_ABANDON_MS`) se cierra como `FAILED ABANDONED`, y sus bytes se limpian sin tocar nunca una transferencia activa (§5). |
| R7 | El `DELETE` del propietario conserva su contrato: 204, borrado lógico inmediato y borrado de los bytes. Puede borrar **también su última copia**. R2 sólo protege frente a la retención automática. |

Se reutilizan los estados `UPLOADING`, `AVAILABLE`, `FAILED` y `DELETED`, sin valores nuevos en el enum.

## 3. Esquema: dos columnas (migración `20261019150000_f08_bkp06_retention`, asignada por A)

```sql
ALTER TABLE "BackupMetadata"
  ADD COLUMN "purgePending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletionReason" VARCHAR(16),
  ADD CONSTRAINT "BackupMetadata_purgePending_check"
    CHECK (NOT "purgePending" OR "status" IN ('DELETED', 'FAILED')),
  ADD CONSTRAINT "BackupMetadata_deletionReason_check"
    CHECK ("deletionReason" IS NULL OR ("status" = 'DELETED' AND "deletionReason" IN ('OWNER', 'RETENTION')));
```

**Por qué hace falta un cambio de esquema:**
- **`purgePending`.** Sin esta columna, *P* no se puede contar sin listar el almacenamiento, y R5 no se podría hacer cumplir dentro del bloqueo. Vale `true` desde que una fila pasa a `DELETED` o `FAILED` hasta que el adaptador confirma que **no queda ningún byte** de su clave (§6). El `CHECK` garantiza en la base que **una fila `AVAILABLE` nunca tiene una purga pendiente**: ninguna limpieza puede apuntar a una copia válida.
- **`deletionReason`.** Distingue el borrado del propietario de la retención (R7). Sin ella, la evidencia y el inventario no pueden demostrar que la retención no tocó lo que no le correspondía.

**Filas anteriores:** quedan con `purgePending = false` y `deletionReason = NULL`, sin rellenar nada a posteriori. Sus posibles huérfanos se siguen tratando con el inventario y la limpieza manual de BE #119, como hasta ahora (§10).

## 4. Subida con rotación

1. **Reconciliar antes del bloqueo.** Se reintenta la purga de las filas del Member con `purgePending` (como mucho N + 1; ver §6).
2. **Reservar** (transacción con `pg_advisory_xact_lock` del Member, como hoy):
   - se cierran las subidas abandonadas: `FAILED`, `ABANDONED` y `purgePending = true`;
   - si *U* ≥ 1, se responde **409 `BACKUP_UPLOAD_IN_PROGRESS`**;
   - si *A* + *P* > N, se responde **503 `BACKUP_STORAGE_UNAVAILABLE`**: hay purgas que el almacenamiento todavía no aceptó, y aceptar la subida rompería R5;
   - si no, se crea la fila `UPLOADING`. Desde ahí *A* + *U* + *P* ≤ N + 1.
3. **Transferir y verificar** en streaming, como hoy (`stage`, `Sha256Meter` y SHA-256). Cada salida con error marca la fila `FAILED` con `purgePending = true` y llama enseguida a `discardStaged` y `remove`, que son idempotentes. Si las dos confirman, se pone `purgePending = false`.
4. **Confirmar el objeto** con `commit()`, como hoy.
5. **Completar y rotar**, en **una** transacción con el mismo bloqueo:
   - `UPLOADING` → `AVAILABLE` sobre su id. Si no cambia exactamente 1 fila, se sigue el camino actual: la fila fue abandonada y se borran sus bytes;
   - se leen las `AVAILABLE` del Member en el orden de la lista (`createdAt desc, id desc`) y se excluye la nueva. Sobran las que pasan de N − 1;
   - esas filas pasan, con `WHERE status = 'AVAILABLE'`, a `DELETED`, con `deletedAt`, `deletionReason = 'RETENTION'` y `purgePending = true`.
6. **Purgar fuera de la transacción**, con `remove(key)` para cada retirada:
   - si funciona, `purgePending = false`;
   - si falla, la fila queda pendiente y se registra en el log sólo el nombre del error, nunca claves ni identificadores (como hoy).

   La respuesta es **201**, la misma vista de siempre, aunque falle la purga: la copia nueva sí quedó guardada.

**Si falla la transacción del paso 5:** se vuelve a leer la fila, como hoy en `METADATA_UPDATE_FAILED`.
- Si la fila está `AVAILABLE`, la rotación también se confirmó, porque iba en la misma transacción. Las retiradas quedan `purgePending` y se reconcilian en la siguiente subida.
- Si la fila sigue `UPLOADING`, no se retiró nada.

**Concurrencia con el borrado del propietario:** el `DELETE` del propietario pasa a tomar el mismo bloqueo del Member. Si no lo hiciera, un `DELETE` simultáneo de otra copia y una rotación calculada sobre un conteo viejo dejarían N − 1 copias.

## 5. Abandono sin borrar una transferencia activa (R6)

Que una fila tenga más de `BACKUP_UPLOAD_ABANDON_MS` (60 min) **no basta** para concluir que su transferencia terminó. Este diseño la hace terminar por construcción:
- **Plazo propio de cada subida.** `BACKUP_UPLOAD_DEADLINE_MS` = 30 min, una constante que B añade en `backups-config.ts` y `env.schema.ts` dentro de #147 (decisión de A), con la comprobación de que es menor que `ABANDON_MS`. #148 la consume por ese nombre.
  - Si se alcanza con el cuerpo aún en curso, el servicio destruye su `Sha256Meter`. Así `stage` falla y la fila queda `FAILED`.
  - Para el `commit` y las llamadas posteriores, el adaptador aplica sus propios plazos por petición (pregunta Q5 a B).
- **Cota actual de la transferencia HTTP.** `main.ts` no configura tiempos, así que el `requestTimeout` por defecto de Node corta la petición a los 5 min. Es el mismo valor que cita el cliente MOB.
- **Conclusión:** una fila `UPLOADING` con más de 60 min ya no tiene ninguna escritura en curso.
- **Revalidaciones que se mantienen:**
  - el paso a `FAILED` es condicional (`WHERE status = 'UPLOADING'`);
  - la finalización de una subida que llegue tarde no cambia ninguna fila y borra sus propios bytes;
  - la limpieza manual sigue exigiendo una antigüedad mínima de 60 min y vuelve a comprobar el candidato justo antes de borrarlo.

## 6. Purga y reconciliación

**Qué se reconcilia:** cada fila con `purgePending = true` y con `status` en (`DELETED`, `FAILED`). El estado se vuelve a leer antes de actuar, y el `CHECK` del §3 impide además que sea `AVAILABLE`.
- **Fila `DELETED`:** se llama a `remove(key)`.
- **Fila `FAILED`:** se llama a `discardStaged(key)` y después a `remove(key)`.
- Si el adaptador confirma, `purgePending = false` (`WHERE id AND purgePending`). Es idempotente aunque dos procesos reconcilien la misma fila a la vez.

**Cuándo se reconcilia:**
- antes de cada subida del Member (§4, paso 1);
- tras cada `DELETE` del propietario, como hoy, pero ahora queda registrado;
- con una orden del operador, `backups:inventory -- --reconcile [--apply]`, que sin `--apply` sólo planifica (*dry-run*).

**Inventario:** suma el recuento de purgas pendientes por motivo (`OWNER`, `RETENTION` o `FAILED`), sin claves ni identificadores. **La limpieza manual sigue sin tocar ninguna copia `AVAILABLE` ni borrar filas.**

## 7. B2 con «Keep all versions» (coordinación con B)

En un bucket versionado, que un nombre deje de listarse **no demuestra** que sus bytes se purgaron. Se distinguen tres niveles:

| Nivel | Qué es | Quién lo produce |
|---|---|---|
| **Borrado lógico** | La fila está `DELETED` o `FAILED`. La API ya no la lista ni la sirve. | El servicio |
| **Marcador de borrado** | Un `DeleteObject` sin `VersionId` oculta el nombre, pero la versión con los bytes sigue en el bucket. | Nunca el servicio ni el adaptador |
| **Versión física** | Cada versión con bytes de `objects/<key>`, o de su staging. Sólo desaparece con un `DeleteObject` que lleve su `VersionId`. | La purga |

**Lo que el servicio necesita del adaptador.** Es un contrato del puerto. Su forma la fija el diseño de B en BE #147, que sube el staging como un objeto propio, `staging/<key>.<hex>.part`, y hace el `commit` con un `CopyObject` de la versión fijada. Los requisitos R-a a R-d son los de mi revisión de #147.
- **`remove(key)`** (R-a):
  - borra **cada versión y cada marcador** del nombre exacto (`ListObjectVersions` con el filtro `Key === name` y `DeleteObject` con `VersionId`);
  - vuelve a listar, recorriendo todas las páginas, y sólo termina bien si no queda ninguno; si queda alguno, lanza un error;
  - un nombre ausente no es error;
  - un fallo se propaga, y el servicio deja la fila pendiente.
- **`discardStaged(key)`** (R-a y R-b):
  - aborta todo multipart incompleto de `staging/<key>.*.part` (`ListMultipartUploads` y `AbortMultipartUpload`);
  - purga las versiones de esos objetos de staging y lo comprueba como `remove`;
  - es idempotente.
- **`stage()`:** sólo termina, bien o con error, cuando no queda ninguna petición de escritura en curso.
- **`commit()`** (R-c):
  - deja visible el objeto final y **sólo termina bien cuando ha purgado y comprobado el staging**;
  - si esa purga falla, lanza un error: la fila queda `FAILED` con `purgePending` y la reconciliación retira el final y el staging. Así ningún resto de una copia `AVAILABLE` queda fuera de la cota R5.
  - Si un reintento del `CopyObject` crea una segunda versión del final, `remove` las purga todas. Cada fila tiene su propia clave UUID, así que **nunca hay dos versiones legítimas del mismo nombre**: una versión extra es siempre resto de un reintento.
- **Plazos** (R-d): cada petición que no transporta el cuerpo del cliente tiene un tope total, además del de inactividad. El peor caso de `commit` (cabeceras, copia, comprobación y purga del staging), con sus reintentos, queda por debajo de `BACKUP_UPLOAD_DEADLINE_MS`.
- **`list()` del inventario:**
  - con B2, cada versión es una entrada: `ListObjectVersions` sobre `objects/` y `staging/`, y `ListMultipartUploads` sobre `staging/`;
  - `StoredBackupFile` gana los campos opcionales `versionId`, `hidden`, `deleteMarker` e `incompleteUpload` (#147 §8). El disco no los rellena, así que su salida no cambia;
  - el inventario agrupa por clave y clasifica con la versión vigente, como hoy;
  - las versiones ocultas, los marcadores y los multipart incompletos se cuentan aparte, en las categorías `hiddenVersion` e `incompleteUpload`. El CLI sólo las imprime si hay alguna, y con disco nunca las hay;
  - la limpieza manual de una clave `DELETED`, `FAILED` o sin fila usa `remove` o `discardStaged`, que purgan también las versiones ocultas. Las versiones ocultas de una copia `AVAILABLE`, por ejemplo una copia duplicada por un reintento, sólo se informan y nunca se tocan;
  - la autoridad sobre las filas con `purgePending` sigue siendo la reconciliación.

**Lo que no se hace:**
- no se depende de una regla de *lifecycle* del bucket ni se cambia ninguna regla del bucket;
- no se purgan copias reales.

**Prefijo:** todo vive bajo el prefijo configurado (`ensayo-f08/` en el ensayo). El servicio nunca ve ese prefijo.

**Object Lock:** si el bucket tuviera Object Lock o retención de versiones, `remove` fallaría. La fila quedaría pendiente y R5 frenaría las subidas siguientes con 503, sin perder copias válidas. Es un resultado que se registraría tal cual en el ensayo.

## 8. Contrato de la API y de la app

**Garantía del 201 con rotación:** una respuesta 201 que retira copias **nunca** retira una antes de que la nueva esté verificada y `AVAILABLE`. El orden es fijo:
1. el SHA-256 recalculado coincide con el declarado;
2. `commit()` confirma el objeto;
3. una única transacción, bajo el bloqueo del Member, marca la nueva `AVAILABLE` y retira las sobrantes, con la condición `WHERE status = 'AVAILABLE'`.

Si falla cualquiera de los pasos 1 a 3, no se retira nada (T-R2 y T-R4). La purga física de las retiradas viene después de esa transacción. Si falla, la copia nueva sigue `AVAILABLE` y la retirada queda pendiente (R5).

**Cambia el contrato** (A lo aceptó el 2026-10-19). Explícitamente:

| Caso | Hasta `23ffaa2` | Con este diseño |
|---|---|---|
| `POST` con N copias `AVAILABLE` | 409 `BACKUP_QUOTA_EXCEEDED` | **201**. La copia más antigua se retira: deja de listarse, y su `GET …/content` y su `DELETE` responden 404, como cualquier copia eliminada. |
| `POST` con otra subida del Member en curso | 201 mientras *A* + *U* < N | **409 `BACKUP_UPLOAD_IN_PROGRESS`** (código nuevo) |
| `POST` con purgas pendientes que superan la cota | No existía | 503 `BACKUP_STORAGE_UNAVAILABLE` (código existente, causa nueva) |
| `BACKUP_QUOTA_EXCEEDED` | Se emitía | **Deja de emitirse.** Se conserva en el enum de OpenAPI marcado como «ya no se emite», para no romper a quien lo reconozca. |
| `GET` (lista), `GET …/content` y `DELETE` | — | Sin cambios de forma ni de códigos. La lista nunca pasa de N. |

Las formas de las respuestas no cambian.

**La app no necesita cambios** (MOB `463d3ec` se mantiene):
- **Subida con N copias:** recibe 201 y vuelve a pedir la lista (`remote_backup_screen.dart:78`), así que la copia retirada desaparece de la pantalla. La app ya no pide al agricultor que borre una copia válida.
- **`409 BACKUP_UPLOAD_IN_PROGRESS`:** la app no conoce el código y lo trata como `unavailable` («El servicio de respaldos no está disponible ahora»). Como el resultado es incierto, consulta la lista y busca su SHA-256 (`remote_backup_service.dart`, `uploadNew`), que es justo lo que conviene si la otra subida termina bien. Además, desde un mismo teléfono no puede ocurrir: la pantalla bloquea una segunda subida con `_busy`.
- **El texto de `quotaExceeded`** («Elimine una…») queda inalcanzable. Retirarlo sería una mejora móvil opcional, no necesaria.

**Herramientas:**
- `tool/f08_bkp/api_preflight.cjs` (MOB) hace 2 subidas y no prueba la cuota, así que no le afecta.
- `docs/api/openapi-f08-backups.json` se regenera.
- `F08_BACKUP_THREAT_MODEL.md` (T6) y `F08_BACKUP.md` (fila «Cupo») reciben una **nota fechada**. Su texto histórico no se reescribe.

**Prueba que cambia:** «limits the copies in use per Member (409) and frees a slot on deletion» (`backups.postgres.spec.ts:394`) prueba el contrato anterior y por eso se sustituye por T-R1, T-R1b y C1 del §9. En el PR y en la evidencia se dirá así, sin presentarla como la misma prueba. La OpenAPI (`docs/api/openapi-f08-backups.json`) documenta el cambio.

## 9. Pruebas antes del cierre

**Dónde se ejecutan:**
- en local, sólo las suites afectadas: `backups.postgres.spec.ts`, `inventory.backups.postgres.spec.ts` y los `*.spec.ts` de `backups`;
- la suite completa, en el CI (`backend-f02.yml` ya ejecuta `backups.postgres.spec.ts`).

**Con qué almacenamiento:**
- el adaptador de disco;
- y, para las versiones, el **«doble S3 en memoria»** de #147 con su adaptador. T-B2 se ejecuta cuando #147 esté integrado; el doble **no se llama B2**.

Hasta que exista la clave restringida a `ensayo-f08/`, no se hace nada contra B2 real.

**Funcionales:**

| ID | Caso |
|---|---|
| T-R1 | Con N copias, una subida da 201. Quedan exactamente las N más recientes. La más antigua queda `DELETED`/`RETENTION`, sin objeto y con `purgePending = false`. |
| T-R1b | Con N − 1 copias, una subida no retira nada. |
| T-R1c | Sin subidas no se retira nada, aunque las copias sean viejas: no hay caducidad por edad. |
| T-R2 | Con N = 1, la copia anterior sólo se retira cuando la nueva está `AVAILABLE`. Una subida fallida (422, 413 o corte) con N copias no retira ninguna. |
| T-R4 | Si falla el `commit` o el paso a `AVAILABLE`, ninguna copia anterior cambia, ni su fila ni su objeto. |
| T-R5 | *P* = 1 por dos causas distintas: `remove` falla durante la rotación, o fallan `discardStaged` y `remove` tras una subida fallida (observación 2 de B). En ambos casos:<ul><li>en el caso de la rotación, la subida da 201;</li><li>la retirada queda `purgePending`;</li><li>con el almacenamiento todavía fallando, la siguiente subida da 503 y no escribe nada;</li><li>al recuperarse, la siguiente subida reconcilia y continúa;</li><li>en ningún momento hay más de N + 1 objetos del Member.</li></ul> |
| T-R7 | El propietario puede borrar su última copia (204). La retención nunca deja en 0 a un Member que tenía copias. |
| T-B2 | En el nivel del servicio, con un doble **del puerto** que imita versiones:<ul><li>tras la retirada y la reconciliación quedan 0 versiones de la clave;</li><li>un `remove` que lanza un error porque su comprobación final todavía ve una versión deja la fila con `purgePending`;</li><li>un `commit` que lanza un error porque falla la purga del staging deja la fila `FAILED` con `purgePending`, sin retirar ninguna copia anterior;</li><li>el inventario informa de `hiddenVersion`.</li></ul>La mutación «`remove` sin `VersionId`» y los casos de API S3 (paginación, multipart abierto) se fijan en el contrato del adaptador de #147, sobre su doble S3. Cuando estén integrados los dos PR, A puede pedir una prueba que una ambos. |

**Concurrencia:**

| ID | Caso |
|---|---|
| C1 | Dos `POST` simultáneos del mismo Member, con N copias: uno da 201 y el otro 409 `BACKUP_UPLOAD_IN_PROGRESS`. Al final hay N copias y una única retirada. |
| C2 | Con N copias, termina una subida mientras el propietario borra una de las anteriores (la más antigua u otra): quedan exactamente N (N + 1 − 1), sin que la retención retire ninguna. |
| C3 | Una descarga compite con la retirada de esa copia: responde 404 o una transferencia que el cliente rechaza por SHA-256. Nunca da 500 ni sirve bytes ajenos. |
| C4 | Subidas simultáneas de dos Members: ninguno bloquea ni rota las copias del otro. |
| C5 | Un `UPLOADING` reciente nunca se cierra ni se descarta (ni al reservar, ni con la limpieza o la reconciliación del operador). Uno de más de 60 min se cierra como `ABANDONED` y su staging se limpia. Una finalización que llega tarde no resucita la fila. |
| C6 | La reconciliación del operador corre en paralelo con una rotación: es idempotente y nunca toca una fila `AVAILABLE`. El `CHECK` rechaza `purgePending` en una fila `AVAILABLE`. |

**Mutaciones** (se revierten y no se commitean):
- quitar el bloqueo del `DELETE`: C2 debe fallar;
- rotar antes de marcar `AVAILABLE`: T-R4 debe fallar;
- no contar *P* al reservar: T-R5 debe fallar;
- un `remove` sin `VersionId`: T-B2 debe fallar.

## 10. Fuera de este PR: el resto externo de #40

1. **Ensayo contra B2 real.** Hace falta que Roderich cree una *Application Key* restringida al prefijo `ensayo-f08/`, con `listFiles`, `readFiles`, `writeFiles` y `deleteFiles`, y que `_wt/tools/secretos-b2/comprobar_b2.ps1` lo muestre. Hasta entonces, sólo pruebas locales, sin llamarlas B2.
2. **Política institucional de retención para datos reales**: plazo, número de copias y purga. Decide Roderich con la institución. Las 5 copias de este diseño valen sólo para la entrega académica.
3. **Cifrado en reposo** que se exija para datos reales (del proveedor o del cliente). Decide Roderich. Este diseño no cambia la configuración del bucket.
4. **Operación productiva:**
   - la admisión (`BACKUP_PRODUCTION_ADMISSION` sigue cerrada);
   - la monitorización;
   - la ejecución periódica de `--reconcile`;
   - el contrato con el proveedor;
   - la comunicación al colectivo (DEC-F01-10).
5. **Reglas y contenido del bucket fuera de `ensayo-f08/`:** versiones, *lifecycle* y Object Lock. No se tocan.
6. **Huérfanos anteriores a esta migración** (`purgePending = false`): siguen con el inventario y la limpieza manual de BE #119.
7. **Copia tardía después de un `commit` agotado** (observación 1 de B). Si el presupuesto de 180 s del `commit` vence mientras B2 todavía copia en el servidor, la fila queda `FAILED` con `purgePending`. Si la purga termina antes de que aparezca la copia, queda un objeto final sin fila pendiente. Es improbable con copias de 100 MB o menos. Se declara como límite: lo detecta el inventario (`failedWithObject`, también por versión) y lo retira la limpieza manual.
8. **Retención de las copias `.previo` que acumula la app.** Es Mobile, fuera de este PR del Backend.
9. **Estado del issue, del Project y de los gates:** los decide Roderich.

## 11. Preguntas para B

- **Q1.** Respondida por #147: staging como objeto propio y `commit` con `CopyObject` de la versión fijada.
- **Q2.** Aceptada por B: `remove` y `discardStaged` vuelven a listar al final y lanzan un error si queda algo; `stage` aborta y espera.
- **Q3.** Respondida: campos opcionales por versión, como recoge el §7.
- **Q4.** Decidida por A: B la añade en #147 y #148 la consume. El orden de integración es #147 y después #148.
- **Q5.** Respondida: 10 s de conexión, 60 s de inactividad, 3 intentos. Presupuestos totales: `commit` 180 s; `remove`, `discardStaged` y `removeStagedFile` 120 s; `open` 60 s hasta las cabeceras. Todo queda por debajo de los 30 min del plazo de subida.
- **Pendiente de confirmar en #147 (R-c):** que `commit` lance un error, y no se dé por bueno, cuando falla la purga comprobada del staging.
