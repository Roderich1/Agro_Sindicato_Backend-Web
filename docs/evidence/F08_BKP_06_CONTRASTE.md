# F08-BKP-06 (BE #40) — Contraste con `main` y con el diferimiento aprobado

Revisión documental de la sesión B, del 2026-10-17 (UTC), sobre `main` `e2263b04d96dd9f049a92046a45232af847ce0da`.

**Qué se hizo:**
- se leyó el código de `Back/src/modules/backups`;
- se tomaron los nombres de sus pruebas;
- se leyó el cliente móvil de `main` (`ce5678f`), sólo para la respuesta a la cuota;
- se contrastó con las actas de F08.

**Qué no se hizo:**
- no se ejecutaron pruebas ni se cambió código;
- no se contrata proveedor, ni se fija retención institucional, ni se ejecuta ninguna purga;
- no se reabre F08.

**Base del gate:** GATE-F08 (#41) es **Passed sólo para el alcance académico reducido con datos sintéticos** ([F08_GATE_DECISION.md](F08_GATE_DECISION.md)), con `PRODUCTION_ADMISSION = NOT_GRANTED`.

## 1. Cambios en `main` desde la decisión del gate

- En `Back/src/modules/backups`, desde `e027938` (Backend integrado de F08) hasta `e2263b0` sólo entraron los dos commits del inventario de BKP-06: `1861e11` y `afa2dac` (BE #119).
- Las rutas y los contratos de respaldo no cambiaron: `GET/POST /me/backups`, `GET /me/backups/:id/content` y `DELETE /me/backups/:id`.

## 2. Criterios de #40: terminado, diferido o pendiente productivo

| Criterio de #40 | Clasificación | Evidencia (`main`, salvo indicación) |
|---|---|---|
| Copia propia íntegra y compatible: el Backend la entrega y la restauración deja un estado coherente | **Terminado** (alcance académico) | Backend: `backups.postgres.spec.ts` «lists and serves only the owner's copies…» y «does not deliver a stored copy that no longer matches its SHA-256». Restauración: Mobile `F08_MOBILE_RESTORE.md` §5, en el POCO (29 tablas y 3 fotos PASS) |
| Copia de otro propietario: rechazo sin exponer metadatos ni contenido | **Terminado** | «… another Member or tenant gets an indistinguishable 404»; «Directiva and Administrador of the same tenant have no access to private copies» (403); revalidación del contexto Auth V2 en cada petición (6 casos) |
| Integridad o formato no coinciden: rechazo sin reemplazo parcial | **Terminado**, con un límite | Servidor: «rejects a SHA-256 mismatch with 422…» y «does not deliver a stored copy that no longer matches…». Móvil: copia ajena, alterada y bomba de expansión rechazadas en el POCO (casos C y C34). **Esquema más nuevo: sólo en host** (límite de F08_GATE_DECISION) |
| Fallo a mitad: rollback y estado previo disponible | **Terminado**, con un límite | Mobile: caso B en el POCO (fallo **provocado**, archivo fabricado) y WAL en host (MOB #91). Servidor: «a transfer cut by the client is recorded as FAILED and leaves no partial bytes», «if marking the copy AVAILABLE fails after the commit, its bytes are removed» y «an ambiguous AVAILABLE update that did commit keeps the copy and its bytes» |
| Política de retención: una copia válida anterior no se elimina hasta que la nueva quede verificada | **Se cumple por ausencia de purga**; la retención está **diferida** | Ni el servidor ni el móvil borran copias por su cuenta:<ul><li>con 5 copias en uso, la cuota responde 409 `BACKUP_QUOTA_EXCEEDED` («limits the copies in use per Member…»);</li><li>Mobile pide al usuario «Elimine una antes de subir otra» (`remote_backup_api.dart`);</li><li>una copia nueva sólo queda AVAILABLE tras verificar su SHA-256 en el servidor;</li><li>la limpieza de BKP-06 (`c8cbf67`) **nunca** toca copias AVAILABLE ni filas.</li></ul>**Pendiente:** el plazo de retención y la purga de copias válidas, que no tienen plazo aprobado |
| Restore completado y sync reanudada: sin un segundo efecto remoto | **Terminado** | Mobile: ningún push al restaurar; un único push del mismo `operationId` al liberar; Central sin duplicados (`F08_MOBILE_RESTORE.md` §5, MOB #93). Backend: «no backup operation touched Sync v1, collective or audit tables…» |
| El binario no está en PostgreSQL | **Terminado** | «uploads with SHA-256 verified by the server; the binary is on disk under a server key, never in PostgreSQL» |
| *Plantilla:* integrado por PR; casos nominales, límites y fallos; contratos y documentación; sin binario en PostgreSQL ni acceso ajeno | **Terminado** para lo anterior | BE #114 (F08), BE #119 (BKP-06 acotado); [F08_BACKUP.md](F08_BACKUP.md), [F10_BKP_06_INVENTARIO.md](F10_BKP_06_INVENTARIO.md) |

## 3. Separación

**Terminado e integrado** (alcance académico, datos sintéticos):
- integridad;
- aislamiento por propietario;
- exclusión de Directiva y Administrador;
- rechazo de copias ajenas, alteradas o con formato incompatible;
- recuperación segura ante fallos de subida y de restauración;
- restauración seguida de sync sin efectos duplicados;
- binario fuera de PostgreSQL;
- inventario de huérfanos y limpieza acotada, que es manual, con dry-run y nunca toca copias AVAILABLE.

**Diferido por decisión de Roderich (2026-10-16), sin implementarse:**
- retención y purga de copias válidas;
- reconciliación completa de huérfanos más allá de la limpieza acotada.

**Ciclo de vida productivo pendiente**, fuera del alcance habilitado; no se ejecuta por iniciativa propia:
- proveedor de almacenamiento remoto (hoy sólo el adaptador de disco de desarrollo);
- cifrado en reposo para datos reales;
- plazo institucional de retención y su purga;
- operación de producción y monitorización;
- admisión productiva, cerrada salvo `BACKUP_PRODUCTION_ADMISSION=enabled` en entornos desechables;
- retención de las copias `.previo` que acumula la app (Mobile).

## 4. Brechas obligatorias del alcance académico

**No se encontró ninguna brecha obligatoria nueva.** Los criterios de #40 no diferidos tienen evidencia en `main` o en Mobile, sobre sus SHA, y los límites ya constan en F08_GATE_DECISION:
- un solo modelo de teléfono;
- esquema más nuevo sólo en host;
- fallo provocado.

**Discrepancias documentales para A** (no cambian la decisión):
1. **`F10_BKP_06_INVENTARIO.md` §1** dice «DEVICE: pendiente del turno de A» para el rollback a mitad de restauración. Ese turno ya se hizo: caso B en el POCO, según `F08_GATE_DECISION.md`. Conviene añadir una nota fechada sin borrar el texto.
2. **El cuerpo de #40** conserva la sección antigua «Fase F09 / GATE-F09», anterior a ADR-002. Es historial; si se actualiza, debe ser con una «Actualización» que remita a este contraste y a la decisión del gate.

## 5. Propuesta para #40

**#40 sigue abierta.** Su cierre exige el ciclo de vida productivo (§3), que no está habilitado. Si A lo considera útil, comentario de estado (A lo aplica tras el dry-run):

```text
**Estado (2026-10-17 UTC, contraste de la sesión B sobre `main` `e2263b0`):**
- **Terminado (alcance académico, datos sintéticos):** integridad, aislamiento, rechazo de copias ajenas, alteradas o incompatibles, recuperación segura, restore + sync sin doble efecto, binario fuera de PostgreSQL, e inventario y limpieza acotada (BE #119).
- **Diferido** (decisión del 2026-10-16): retención y purga de copias válidas.
- **Pendiente productivo:** proveedor, cifrado para datos reales, retención institucional y operación.
- **Sin brechas obligatorias nuevas** para el alcance académico. GATE-F08 (#41) sigue Passed sólo para ese alcance.
- **Evidencia:** `docs/evidence/F08_BKP_06_CONTRASTE.md`.
```
