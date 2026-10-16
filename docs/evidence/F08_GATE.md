# GATE-F08 (#41) — Acta técnica propuesta

**Gate: Pending.** Status: Validation.

Esta acta la redactó la sesión de Claude Code el 2026-10-16. Recoge la evidencia técnica disponible y lo que falta. No es una decisión: sólo Roderich Rendón puede, con confirmación explícita, marcar el gate como Passed, Failed o Waived. Tampoco es una inspección personal, una firma institucional ni una revisión del tutor.

**Trazabilidad:** RF-26, RF-27, RNF-04, RNF-10, DAT-14, CU-14 y CU-15.

## Criterios (alcance reducido del brief D6) y estado de la evidencia

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Subida con el SHA-256 verificado en el servidor | Verificado sobre BE `15c8cf4` por `backups.postgres.spec.ts` (PostgreSQL y disco reales) y por la comprobación previa contra la API compilada. Esa comprobación usó `api_preflight.cjs` de MOB `2b3a0ce` (SHA-256 `3670d68c…`); el comando y la salida están en `F08_BACKUP.md` | [`F08_BACKUP.md`](F08_BACKUP.md), PR BE #114 |
| 2 | Aislamiento por dueño: otro Member u otro tenant reciben 404 indistinguible; Directiva y Administrador, 403 | Verificado con las mismas pruebas y la misma comprobación previa, más una prueba de mutación que detecta la fuga. Las tres llevan SHA, comando y salida en `F08_BACKUP.md` | `F08_BACKUP.md` |
| 3 | Restauración en un teléfono limpio con los mismos conteos y fotos | **PASS en dispositivo, en una instalación limpia del mismo POCO** (2026-10-16, turno 2 de A). POCO X5 Pro 5G `22101320G`, Android 12, paquete aislado `.f08bkp` de MOB `dc1b6eb` (SHA-256 de la APK `ba9d317f…7247`) y BE `a45ab83`. La comparación de 29 tablas y 3 fotos da PASS, con sólo las transformaciones previstas. *Antecedente:* NOT_MEASURED hasta este turno, con cobertura sólo automatizada. **Equivalencia registrada el 2026-10-16 (F10)**, por delegación técnica de Roderich: la desinstalación y reinstalación de sólo `.f08bkp` en el mismo POCO, con nueva activación y recuperación desde el servicio, se acepta como la «condición equivalente aprobada» de #36. No demuestra otro modelo de teléfono ni supone inspección personal de capturas. El PASS se conserva sobre las versiones ejecutadas (MOB `dc1b6eb`, BE `a45ab83`); la comprobación focalizada contra el Backend integrado `e027938` está en [`F08_BACKEND_INTEGRADO_F10.md`](F08_BACKEND_INTEGRADO_F10.md). | Mobile `docs/evidence/F08_MOBILE_RESTORE.md` §5 (MOB #90, `977b585`) |
| 4 | Restaurar no publica | Verificado por pruebas y **en dispositivo** (2026-10-16): ningún `POST /sync/v1/push` al restaurar ni al reabrir (0 peticiones en 80 s). La necesidad pendiente quedó RESTORE_PAUSED y, al liberarla con la verificación del titular, salió un único push con el mismo `operationId`. Central sin duplicados. | Mobile `F08_MOBILE_RESTORE.md` §5 |
| 5 | El backup no toca Sync | Verificado: filas completas de Sync v1, colectivas y auditoría idénticas antes y después de todas las operaciones de backup | `F08_BACKUP.md` |
| 6 | BKP-06 diferido con justificación | **Decidido por Roderich (2026-10-16):** #40 se difiere a F10 **únicamente** para retención, purga y reconciliación de huérfanos. **No se difieren** la integridad, el aislamiento, la exclusión de escrituras ni la recuperación segura ante fallos, que están implementados y probados. *F10 (2026-10-16):* inventario de huérfanos y limpieza acotada (dry-run por defecto, umbral ≥ 60 min, nunca toca AVAILABLE ni filas, sin purga automática) en BE #119 (`c8cbf67`); la retención y la purga de copias siguen sin plazo aprobado. #40 sigue abierta. | [`F08_BACKUP_THREAT_MODEL.md`](../architecture/F08_BACKUP_THREAT_MODEL.md) §6 |

## Discrepancia con el contrato: DEC-F01-10

[DEC-F01-10](../architecture/F01_INTEGRATION_DECISIONS.md) exige, como **verificación previa a la implementación**, tres cosas definidas:
- el modelo de amenaza;
- la decisión de proveedor;
- la integridad y la restauración de extremo a extremo.

CURRENT_SCOPE §7 delega en F08 el proveedor, el almacenamiento físico, el cifrado, el ciclo de vida y la retención.

Esta entrega implementó la API y el adaptador de disco de desarrollo **sin** un modelo de amenaza escrito ni una decisión de proveedor registrada. La integridad está implementada y probada. La restauración de extremo a extremo está probada automáticamente; en dispositivo seguía pendiente cuando se redactó esta sección. *Actualización del 2026-10-16:* E2E en dispositivo PASS (criterio 3).

Lo que limita el alcance de esta discrepancia:
- **la producción queda cerrada** salvo `BACKUP_PRODUCTION_ADMISSION=enabled`, que no está autorizado;
- no se declara proveedor ni despliegue;
- el cifrado en reposo figura como limitación.

**Resolución, decidida por Roderich el 2026-10-16 (opción 2):** completar la documentación antes de integrar #114. El modelo de amenaza está en [`F08_BACKUP_THREAT_MODEL.md`](../architecture/F08_BACKUP_THREAT_MODEL.md), con fecha real 2026-10-16. Contiene:
- datos protegidos y límites de confianza;
- amenazas, cada una con sus controles, las pruebas que los respaldan y el riesgo residual;
- la decisión de almacenamiento: disco local sólo para desarrollo y pruebas, con el proveedor productivo pendiente;
- las condiciones para admitir datos reales.

La discrepancia queda así: **documentación completada después de implementar**. El documento registra la omisión original. DEC-F01-10 no se modifica ni se da por cumplida retroactivamente. La admisión productiva sigue cerrada.

## Limitaciones que el gate debe considerar

- No hay cifrado en reposo en el servidor.
- Sólo existe el adaptador de disco de desarrollo. No hay proveedor remoto ni despliegue real, y la producción está cerrada por defecto.
- El servidor corta cada subida a los 300 s, lo que con 100 MB exige unos 2,7 Mbit/s sostenidos (ver `F08_BACKUP.md`).
- El hash del manifiesto interno no es una firma. Contra la sustitución de la copia remota protege el hash que registró el servidor.
- La reinstalación del paquete aislado en el mismo POCO no prueba un segundo modelo de teléfono.
- **Riesgo WAL de la copia de rollback (hallazgo de F10, 2026-10-16).** En MOB `4f203c7`, `_restoreExclusively` copia la base actual (`.previo`) **antes** de cerrarla y sin consolidar el `-wal`; el rollback borra los diarios y vuelve a esa copia, que puede no contener las últimas transacciones confirmadas. Reproducido a nivel SQLite en la revisión de F10 y confirmado en el código por la sesión A; no es una reproducción en el POCO. La corrección es MOB #91 (y la extracción acotada, MOB #92).
  *Actualización (2026-10-16, 22:16Z):* MOB #91, #92 y #93 fusionados (`main` `2f4b634`). La copia `.previo` se toma con checkpoint verificado y cierre, en exclusión de escrituras; si la preparación falla, no hay reemplazo. Regresión en host con `journal_mode=WAL`: roja sobre `4f203c7` y verde con la corrección. **En el POCO no se reproduce el defecto:** la base usa diario de reversión (`01 01`, `-journal`, sin `-wal`); la comprobación focalizada en el teléfono cubre la ruta corregida, el rollback y los negativos (Mobile `docs/evidence/F10_RESTORE_DEVICE.md`, MOB #95).

## Pendiente antes de una decisión

*Actualizado el 2026-10-16.* El texto anterior pedía ejecutar el E2E del POCO, integrar los PR de F08, decidir el diferimiento de #40 y decidir la discrepancia con DEC-F01-10. Esos cuatro puntos ya están resueltos:

- **E2E del POCO:** PASS (criterios 3 y 4), registrado tal como salió en Mobile `F08_MOBILE_RESTORE.md` §5.
- **Integración:**
  - BE #114 en `ba51c70` y MOB #90 en `4f203c7`, ambos con CI en verde sobre su HEAD final;
  - #37, #38, #39 y #35 cerrados por esos merges; #36 sigue abierta;
  - integrar no cierra el gate.
- **#40 (BKP-06):** lo decidió Roderich (criterio 6).
- **DEC-F01-10:** lo decidió Roderich, con la opción 2 y el modelo de amenaza.

**Sigue pendiente** (actualizado el 2026-10-16, bloque F10):

1. ~~Decisión sobre la equivalencia de la reinstalación (#36).~~ **Decidida el 2026-10-16** (criterio 3). La corrección del riesgo WAL (MOB #91) y la extracción acotada (#92) están integradas y la comprobación focalizada en el POCO dio PASS en la ruta corregida, el rollback y los negativos (ver «Riesgo WAL» arriba y MOB #95). El cierre de #36 se registra en el issue con esa evidencia y sus límites.
2. **GATE-F08 sigue Pending.** Las causas técnicas de F10 (copia de rollback y extracción) están corregidas e integradas; la decisión sobre el gate (Passed, Failed o Waived) es de Roderich, con el alcance, las versiones y los riesgos aceptados; esta acta no la toma.
3. ~~No medido en dispositivo: copia ajena, alterada o incompatible y rollback.~~ **Medido el 2026-10-16** en el mismo POCO (`.f10bkp`, MOB `2f4b634`, BE `e027938`): alterada y ajena rechazadas antes de sustituir; bomba de expansión rechazada por límites; rollback tras un fallo provocado después de sustituir con 29 tablas y 3 fotos iguales. **Sigue sin medir en dispositivo:** una copia de esquema o formato más nuevo (sólo prueba de host) y un segundo modelo de teléfono. El defecto WAL no se reproduce en ese teléfono.
4. **Observaciones del E2E para F10:** el refresco de la lista de Sincronización tras liberar y el README §1.4 (OUTCOME_UNKNOWN) los corrige MOB #93 (integrado en `2f4b634`; refresco comprobado en el POCO, caso D).
5. **Diferencia de versión del E2E:** cerrada con la comprobación focalizada contra `e027938` ([`F08_BACKEND_INTEGRADO_F10.md`](F08_BACKEND_INTEGRADO_F10.md)); el PASS físico sigue atribuido a `a45ab83`.
6. **Condiciones antes de admitir datos reales** (`F08_BACKUP_THREAT_MODEL.md` §5): ninguna se cumple hoy. La admisión productiva sigue cerrada. El proveedor productivo y el cifrado quedan fuera de este bloque académico.
7. **BE #117** (fusionado en `e027938`) cambió también `.gitattributes` (`docs/api/openapi-f08-backups.json text eol=lf`), además del acta; `openapi:check` en local sobre `e027938`: OK.
