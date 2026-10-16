# GATE-F08 (#41) — Acta técnica propuesta

**Gate: Pending.** Status: Validation.

Esta acta la redactó la sesión de Claude Code el 2026-10-16. Recoge la evidencia técnica disponible y lo que falta. No es una decisión: sólo Roderich Rendón puede, con confirmación explícita, marcar el gate como Passed, Failed o Waived. Tampoco es una inspección personal, una firma institucional ni una revisión del tutor.

**Trazabilidad:** RF-26, RF-27, RNF-04, RNF-10, DAT-14, CU-14 y CU-15.

## Criterios (alcance reducido del brief D6) y estado de la evidencia

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Subida con el SHA-256 verificado en el servidor | Verificado sobre BE `15c8cf4` por `backups.postgres.spec.ts` (PostgreSQL y disco reales) y por la comprobación previa contra la API compilada. Esa comprobación usó `api_preflight.cjs` de MOB `2b3a0ce` (SHA-256 `3670d68c…`); el comando y la salida están en `F08_BACKUP.md` | [`F08_BACKUP.md`](F08_BACKUP.md), PR BE #114 |
| 2 | Aislamiento por dueño: otro Member u otro tenant reciben 404 indistinguible; Directiva y Administrador, 403 | Verificado con las mismas pruebas y la misma comprobación previa, más una prueba de mutación que detecta la fuga. Las tres llevan SHA, comando y salida en `F08_BACKUP.md` | `F08_BACKUP.md` |
| 3 | Restauración en un teléfono limpio con los mismos conteos y fotos | **NOT_MEASURED en dispositivo.** Cubierto con pruebas automatizadas sobre base real: teléfono nuevo del mismo Member, comparación de todas las tablas y fotos con las transformaciones esperadas. El E2E en el POCO está preparado (`tool/f08_bkp/`) y pendiente del turno que asigna A. | Mobile `docs/evidence/F08_MOBILE_RESTORE.md` |
| 4 | Restaurar no publica | Verificado por pruebas: RESTORE_PAUSED antes de liberar la exclusión, ningún push al abrir la app y liberación sólo con el acceso verificado del titular. **Dispositivo pendiente** (paso 2.6–2.7 del procedimiento). | Mobile `F08_MOBILE_RESTORE.md` |
| 5 | El backup no toca Sync | Verificado: filas completas de Sync v1, colectivas y auditoría idénticas antes y después de todas las operaciones de backup | `F08_BACKUP.md` |
| 6 | BKP-06 diferido con justificación | **Decidido por Roderich (2026-10-16):** #40 se difiere a F10 **únicamente** para retención, purga y reconciliación de huérfanos. **No se difieren** la integridad, el aislamiento, la exclusión de escrituras ni la recuperación segura ante fallos, que están implementados y probados. | [`F08_BACKUP_THREAT_MODEL.md`](../architecture/F08_BACKUP_THREAT_MODEL.md) §6 |

## Discrepancia con el contrato: DEC-F01-10

[DEC-F01-10](../architecture/F01_INTEGRATION_DECISIONS.md) exige, como **verificación previa a la implementación**, tres cosas definidas:
- el modelo de amenaza;
- la decisión de proveedor;
- la integridad y la restauración de extremo a extremo.

CURRENT_SCOPE §7 delega en F08 el proveedor, el almacenamiento físico, el cifrado, el ciclo de vida y la retención.

Esta entrega implementó la API y el adaptador de disco de desarrollo **sin** un modelo de amenaza escrito ni una decisión de proveedor registrada. La integridad está implementada y probada. La restauración de extremo a extremo está probada automáticamente; en dispositivo sigue pendiente.

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

## Pendiente antes de una decisión

1. Ejecutar el E2E del POCO (turno de A) y registrar el resultado tal como salga, PASS o FAIL.
2. Revisar e integrar los PR de F08. Integrarlos no cierra el gate.
3. Decidir el diferimiento de #40.
4. Decidir el tratamiento de la discrepancia con DEC-F01-10.
