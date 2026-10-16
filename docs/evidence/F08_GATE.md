# GATE-F08 (#41) — Acta técnica propuesta

**Gate: Pending.** Status: Validation.

Esta acta la redactó la sesión de Claude Code el 2026-10-16. Recoge la evidencia técnica disponible y lo que falta. No es una decisión: sólo Roderich Rendón puede, con confirmación explícita, marcar el gate como Passed, Failed o Waived. Tampoco es una inspección personal, una firma institucional ni una revisión del tutor.

**Trazabilidad:** RF-26, RF-27, RNF-04, RNF-10, DAT-14, CU-14 y CU-15.

## Criterios (alcance reducido del brief D6) y estado de la evidencia

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Subida con el SHA-256 verificado en el servidor | Verificado por pruebas con PostgreSQL real, disco real y la API compilada | [`F08_BACKUP.md`](F08_BACKUP.md), PR BE de F08 |
| 2 | Aislamiento por dueño: otro Member u otro tenant reciben 404 indistinguible; Directiva y Administrador, 403 | Verificado por pruebas y en la comprobación previa contra la API compilada | `F08_BACKUP.md` |
| 3 | Restauración en un teléfono limpio con los mismos conteos y fotos | **NOT_MEASURED en dispositivo.** Cubierto con pruebas automatizadas sobre base real: teléfono nuevo del mismo Member, comparación de todas las tablas y fotos con las transformaciones esperadas. El E2E en el POCO está preparado (`tool/f08_bkp/`) y pendiente del turno que asigna A. | Mobile `docs/evidence/F08_MOBILE_RESTORE.md` |
| 4 | Restaurar no publica | Verificado por pruebas: RESTORE_PAUSED antes de liberar la exclusión, ningún push al abrir la app y liberación sólo con el acceso verificado del titular. **Dispositivo pendiente** (paso 2.6–2.7 del procedimiento). | Mobile `F08_MOBILE_RESTORE.md` |
| 5 | El backup no toca Sync | Verificado: filas completas de Sync v1, colectivas y auditoría idénticas antes y después de todas las operaciones de backup | `F08_BACKUP.md` |
| 6 | BKP-06 diferido con justificación | **Propuesto, pendiente de decisión.** #40 (retención, purga y reconciliación de huérfanos, prioridad P2) pasaría a F10. Las garantías críticas de restauración —hash, validación, rollback, exclusión y restore + sync sin reenvío— **no se difieren**: están implementadas en Mobile. | Este documento |

## Limitaciones que el gate debe considerar

- No hay cifrado en reposo en el servidor.
- Sólo existe el adaptador de disco de desarrollo. No hay proveedor remoto ni despliegue real.
- El hash del manifiesto interno no es una firma. Contra la sustitución de la copia remota protege el hash que registró el servidor.
- La reinstalación del paquete aislado en el mismo POCO no prueba un segundo modelo de teléfono.

## Pendiente antes de una decisión

1. Ejecutar el E2E del POCO (turno de A) y registrar el resultado tal como salga, PASS o FAIL.
2. Revisar e integrar los PR de F08. Integrarlos no cierra el gate.
3. Decidir el diferimiento de #40.
