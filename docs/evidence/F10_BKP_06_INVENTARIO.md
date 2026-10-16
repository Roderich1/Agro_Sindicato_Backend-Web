# F10 — BKP-06 acotado: inventario y limpieza de restos del respaldo privado (BE #40)

**Origen:** Live. **Fecha real:** 2026-10-16 (America/La_Paz). **Gate relacionado:** #41 (GATE-F08), **Pending**. #40 sigue **abierta**: este PR no la cierra.

**Trazabilidad:** RF-27, RNF-10 y DAT-14.

## 1. #40: lo demostrado y lo pendiente

| Criterio de #40 | Estado | Dónde |
|---|---|---|
| Una copia propia íntegra se restaura en un estado coherente | Demostrado en host y en el POCO, sobre las versiones ejecutadas | MOB `F08_MOBILE_RESTORE.md` §5 |
| Copia ajena: rechazo sin exponer nada | Demostrado: API con 404 indistinguible; móvil con rechazo por titular | `F08_BACKUP.md` y MOB `f04_restore_*` |
| Integridad o versión incompatibles: rechazo sin reemplazo parcial | Demostrado en host: SHA-256 exterior e interior, esquema. Extracción acotada en MOB #92 | MOB `backup_restore_sha256_test`, `F10_BACKUP_EXTRACT_LIMITS.md` |
| Fallo a mitad: rollback con el estado previo disponible | **Host:** MOB #91, incluido el caso WAL. **DEVICE:** pendiente del turno de A | MOB `F10_RESTORE_WAL_ROLLBACK.md` |
| Restore más sync: sin un segundo efecto remoto | Demostrado: RESTORE_PAUSED y un único push con el mismo `operationId` al liberar. En el POCO, sobre las versiones ejecutadas | MOB `F08_MOBILE_RESTORE.md` §5 y MOB #93 |
| El binario no está en PostgreSQL | Demostrado | `backups.postgres.spec.ts` |
| «Una copia válida anterior no se elimina hasta que la nueva quede verificada» | Se cumple **porque no existe ninguna purga de copias válidas**. Este PR tampoco la introduce | Este documento |
| **Retención y purga de copias** | **Diferidas.** No hay un plazo institucional aprobado y no se inventa ninguno | — |
| **Reconciliación de huérfanos** | **Este PR, acotado:** inventario, dry-run y limpieza explícita de restos | Este documento |

## 2. Qué añade este PR

`src/modules/backups/application/backup-inventory.ts` clasifica cada fila de `BackupMetadata` y cada archivo del almacenamiento en 13 categorías:
- **AVAILABLE:** `availableOk`, `…MissingObject`, `…SizeMismatch`;
- **UPLOADING, FAILED y DELETED:** con o sin objeto;
- **archivos:** `unreferencedObject`, `unexpectedObjectFile`, `stagingPart` y `unexpectedStagingFile`.

`cleanupBackupLeftovers` sólo puede eliminar **objetos de copias DELETED o FAILED, objetos sin fila y parciales de staging**.

**Lo que nunca toca:**
- **Ninguna copia AVAILABLE.** Si a una le falta el objeto o tiene otro tamaño, se informa con el código de salida 3, para revisión humana.
- **Ninguna fila de metadatos.** Las filas son el rastro.
- **Los objetos de filas UPLOADING:** podrían pertenecer a una subida que acaba de confirmarse.
- **Los archivos con nombres fuera de la estructura.**

**Controles:**
- **Umbral de antigüedad obligatorio**, sin valor por defecto y de **al menos 60 minutos**, que es `BACKUP_UPLOAD_ABANDON_MS`: el plazo tras el cual el propio servicio ya considera abandonada una subida. Es un límite técnico, no un plazo de retención.
- **Dry-run por defecto:** sólo `--apply` borra.
- **Recomprobación** de la fila y del archivo justo antes de cada borrado. Si un candidato cambió, se conserva.
- **Idempotente:** una segunda ejecución no hace nada más.

**Operador:**
```
npm run backups:inventory                                              # inventario
npm run backups:inventory -- --cleanup --older-than-minutes 1440       # plan (dry-run)
npm run backups:inventory -- --cleanup --older-than-minutes 1440 --apply
```
Lee `DATABASE_URL` y `BACKUP_STORAGE_DIR` del entorno. Imprime sólo conteos y bytes por categoría, sin claves, identificadores de personas ni rutas. Sale con 2 si los argumentos no son válidos y con 3 si hay anomalías en copias AVAILABLE. **No hay ejecución automática** ni tarea programada.

El puerto `BackupStorage` no cambia. La capacidad de listar es una interfaz aparte, `BackupStorageInventory`, que implementa el adaptador de disco: un proveedor futuro no está obligado a ofrecerla.

## 3. Pruebas

Las ejecutó la sesión C el 2026-10-16, sobre el árbol de este PR. `main` era `e027938`.

| Comando | Resultado |
|---|---|
| `F08_BKP_PG_TEST_URL=… npx jest inventory.backups.postgres.spec.ts --runInBand`, con PostgreSQL desechable `agro_c_bkp_pg` y una carpeta temporal real | **6/6** |
| `F08_BKP_PG_TEST_URL=… npx jest backups.postgres.spec.ts --runInBand`, el patrón de la CI, que ahora ejecuta las dos suites | **28/28** (22 + 6) |
| `npx jest local-disk-backup-storage.spec.ts backups-inventory.spec.ts` | 16/16 |
| `npx jest`, unitarias | 227 pasan / 178 omitidas |
| `npm run build` (tras borrar `*.tsbuildinfo`) | `dist/modules/backups/cli/backups-inventory.js` generado |
| `npm run openapi:check`, contra una base desechable migrada | OK; la API no cambia |
| `npx eslint src/modules/backups` | Sin avisos |
| Comando real compilado contra una base nueva con las 10 migraciones y una carpeta vacía | Inventario `{}` con salida 0; plan en dry-run con salida 0; `--cleanup --apply` sin umbral, salida 2 con el uso |

**Casos de la suite PostgreSQL:**
- **Inventario:** clasifica las 13 categorías sin modificar archivos ni filas.
- **Umbral:** se rechazan 0, 1, 59 y 60.5.
- **Dry-run:** planifica sólo lo antiguo y no borra.
- **Carrera:** el objeto de una copia DELETED se reescribe entre el plan y el borrado y se conserva.
- **`--apply`:** elimina sólo los restos. Las copias AVAILABLE, las UPLOADING con objeto, lo reciente y los archivos ajenos siguen. Las filas quedan idénticas y la segunda ejecución no hace nada.
- **Comando:** sólo imprime conteos, sin claves ni identificadores, sale con 3 ante anomalías AVAILABLE y valida los argumentos.

**Mutaciones:**

| Mutación | Resultado |
|---|---|
| Sin la recomprobación previa al borrado | 2 fallos |
| `availableSizeMismatch` como categoría limpiable | 3 fallos |

## 4. Límites

- Sólo el adaptador de disco de desarrollo. **No hay proveedor productivo ni cifrado en reposo**, y la producción sigue cerrada.
- No se ejecutó contra el almacenamiento del ensayo (`agro_c_f08e2e_pg`) ni contra ningún otro entorno conservado: no se borró nada fuera de las bases y carpetas desechables de las pruebas.
- **Retención y purga de copias válidas:** pendientes de una decisión con plazo aprobado. Al implementarlas, la nueva copia debe quedar AVAILABLE y verificada antes de retirar la anterior.
- El nombre del spec (`inventory.backups.postgres.spec.ts`) se eligió para que lo ejecute el paso ya existente de la CI (`npx jest backups.postgres.spec.ts`) **sin modificar el workflow**.
