# GATE-F08 (#41) — Decisión para el alcance académico reducido con datos sintéticos

## Identificación y autoridad

- **Proyecto:** Agrocuentas, Proyecto de Grado 2026.
- **Fase:** F08, respaldo privado y recuperación (ADR-002). **Gate:** [#41](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/41).
- **Fecha de la decisión:** **2026-10-16**, zona `America/La_Paz`. La sesión A de Claude Code la registra el mismo día (2026-10-17 UTC).
- **Procedencia.** Decisión de **Roderich1, propietario del proyecto**, por **delegación técnica**. Consta en `_briefs/CIERRE_TECNICO_Y_EVALUACION_AGROCUENTAS_2026-10-16.md` §1, «F08 y Mobile #36»:

  > «Se autoriza a A a registrar GATE-F08 (#41) = Passed, exclusivamente para el alcance académico reducido de desarrollo con datos sintéticos, apoyándose en las evidencias de F08 y F10 ya integradas y en el diferimiento aprobado de BKP-06.»
- **Lo que esta decisión no es:**
  - no es una inspección personal del autor;
  - no es una revisión ni una aprobación del tutor;
  - no es una aprobación institucional;
  - no es una firma digital.

  Ninguna revisión se atribuye personalmente a Roderich ni al tutor.

## Decisión

- `GATE_F08 = PASSED`
- `SCOPE = ACADEMIC_REDUCED_SYNTHETIC_DATA_ONLY`
- `EVIDENCE = VERIFIED`
- `PRODUCTION_ADMISSION = NOT_GRANTED`

**Base de referencia:**
- Backend `main` **`ed069a695eb9f8bdc318bfd16efc0071fcdced25`**, con CI 38977769791 SUCCESS;
- Mobile `main` **`dff6802ac68d647d40887a4ee298c5ff171d4937`**, con CI 38977755502 SUCCESS.

**Las evidencias físicas conservan sus SHA específicos.** Ninguna ejecución antigua se reatribuye al merge final:
- E2E del turno 2: MOB `dc1b6eb` + BE `a45ab83`;
- comprobación focalizada: MOB `2f4b634` + BE `e027938`;
- Backend integrado: `e027938`.

## Fundamento: criterios de #41 frente a la evidencia

| Criterio de #41 | Evidencia | Procedencia |
|---|---|---|
| El respaldo queda asociado a la identidad y la propiedad, con metadatos de integridad; un fallo de generación o transferencia no sustituye una copia válida anterior | [`F08_BACKUP.md`](F08_BACKUP.md): SHA-256 verificado por el servidor; staging y `rename` atómico; una subida cortada queda FAILED y la copia previa sigue intacta. Relectura tras un AVAILABLE ambiguo ([`F08_BACKEND_INTEGRADO_F10.md`](F08_BACKEND_INTEGRADO_F10.md), suite PostgreSQL 22/22 sobre `e027938`) | HOST (PostgreSQL y disco reales) y API compilada |
| Restaurar una copia propia en un teléfono limpio da un estado coherente verificado por SHA-256, y la sincronización posterior no duplica ni pierde operaciones | **E2E en una instalación limpia del mismo POCO:** 29 tablas y 3 fotos PASS; ningún push al restaurar; un único push del mismo `operationId` al liberar; Central sin duplicados (Mobile `F08_MOBILE_RESTORE.md` §5). La instalación limpia del mismo POCO es la **condición equivalente aprobada** (#36, cerrada). Liberación y refresco, en el caso D de Mobile `F10_RESTORE_DEVICE.md` | DEVICE: POCO X5 Pro 5G, Android 12 |
| Una copia ajena, alterada o incompatible se rechaza sin reemplazar parcialmente el estado activo | **Ajena, alterada y bomba de expansión:** rechazadas antes de sustituir, en el POCO (casos C y C34 de `F10_RESTORE_DEVICE.md`). **Rollback** tras un fallo provocado después de sustituir: 29 tablas y 3 fotos iguales (caso B). **Esquema más nuevo:** rechazo cubierto **sólo en host** (límite que se conserva). **WAL:** discriminado en host con `journal_mode=WAL` (MOB #91, `F10_RESTORE_WAL_ROLLBACK.md`). En el POCO se comprobaron la ruta modificada y el rollback con su diario real, que es de reversión | DEVICE y HOST, separadas |
| Por la API, cada usuario sólo accede a sus propias copias | Otro Member u otro tenant: 404 indistinguible. Directiva y Administrador: 403. Más una prueba de mutación (`F08_BACKUP.md`). Comprobación previa 12/12 contra `e027938` (`F08_BACKEND_INTEGRADO_F10.md`) | HOST y API compilada |
| Cada tarea enlaza PR, pruebas y evidencia; lo negativo o NOT_MEASURED se registra tal cual; la restauración en dispositivo tiene evidencia DEVICE | BE #37, #38 y #39 y MOB #35: cerrados por BE #114 y MOB #90. **MOB #36 cerrado** con la equivalencia y sus límites. **BE #40 (BKP-06) abierto y diferido** (siguiente sección). Los NOT_MEASURED se conservan en la sección de límites | — |

**Revisión al registrar la decisión** (2026-10-17 UTC):
- Leí `F08_GATE.md`, `F08_BACKUP.md`, `F08_BACKEND_INTEGRADO_F10.md` y Mobile `F10_RESTORE_DEVICE.md`, y confirmé el estado de cada tarea con `gh`.
- **No encontré ningún defecto crítico nuevo ni una discrepancia material con la evidencia.**
- **Dos discrepancias de trámite**, que no cambian la decisión:
  - el ítem del Project de #41 estaba en `Status = Backlog`, no en `Validation` como decía el acta;
  - el cuerpo de #41 conserva una sección antigua con la numeración F09, anterior a ADR-002. Es historial y no se borra.

## BKP-06 (#40): diferimiento aprobado, no implementación completa

- Roderich decidió el 2026-10-16 diferir **únicamente** la retención, la purga y la reconciliación de huérfanos (`F08_GATE.md`, criterio 6).
- **No se difieren**, porque están implementadas y probadas:
  - la integridad;
  - el aislamiento;
  - la exclusión de escrituras;
  - la recuperación segura ante fallos.
- En F10 se añadieron el inventario de huérfanos y una limpieza acotada (BE #119, `c8cbf67`), sin purga automática.
- **#40 permanece abierta** para el proveedor productivo, el cifrado para datos reales, la retención institucional y la operación de producción. Este gate **no transforma su diferimiento en implementación completa.**

## Límites que se conservan

- **Un solo modelo de teléfono:** el POCO X5 Pro 5G con MIUI.
  - **No se afirma compatibilidad física con otro modelo.**
  - Un segundo teléfono no era condición de esta decisión.
- **Sólo en host:** el rechazo de una copia de esquema o formato más nuevo, y la discriminación del defecto WAL. **El POCO usa diario de reversión.**
- **Fallo provocado:** el del caso B es un archivo fabricado, no un fallo espontáneo.
- **Copias `.previo`:** se acumulan en la app; su retención queda para #40.
- **Almacenamiento:** sin cifrado en reposo en el servidor y sólo con el adaptador de disco de desarrollo.
  - No hay proveedor remoto ni despliegue.
  - La admisión productiva está cerrada salvo `BACKUP_PRODUCTION_ADMISSION=enabled`, que sólo se usa en entornos desechables.
  - **No se declara aptitud productiva.**
- **Límites técnicos:** corte de 300 s por petición en el servidor (100 MB exigen unos 2,7 Mbit/s sostenidos). El hash del manifiesto no es una firma.
- **DEC-F01-10:** documentación completada después de implementar. Resuelto por Roderich con la opción 2 (`F08_GATE.md`); no se da por cumplido retroactivamente.
- **Fases vecinas:** F03, F04 y F06 no cambian por cerrar F08. GATE-F10 (#49) sigue Pending.

## Registro en GitHub

Esta decisión entra en `main` por un PR con `Closes #41`. En el Project #3, el ítem de #41 pasa a `Gate = Passed`, `Evidence = Verified` y `Status = Done`. La sesión A registra la operación el 2026-10-17 UTC, por la delegación citada.
