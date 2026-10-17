# Propuestas de decisión: GATE-F03, GATE-F05 y GATE-F06

- **Fecha:** 2026-10-17. Redactadas por la sesión A de Claude Code, por la delegación técnica de Roderich.
- **Naturaleza:** propuestas. **No cambian ningún gate.** Los tres siguen **Pending** hasta la decisión explícita de Roderich, que se registra con su fecha real en el archivo de decisión de cada fase.
- **Fuera de esta propuesta:**
  - la revisión del tutor (se registra en GOV-01, BE #105);
  - la inspección personal de Roderich (no consta);
  - la validación institucional (no consta).
- **Base:** BE `main` `e4b9c29`, MOB `main` `8a2c558`.
  - Se revisaron las actas versionadas, sin repetir pruebas por rutina.
  - No se añade una prueba de carga concurrente como criterio de F05.
  - La columna Mobile de #18 se conserva tal como está: 18 PASS y 22 NOT_MEASURED.

## GATE-F03 (MOB #23): activación online y sesión offline

**Acta:** MOB `docs/evidence/GATE_F03_EVALUATION.md` (MOB #105, `2df6033`), con la sesión física del 2026-10-17 (`F03_F04_DEVICE_2026-10-17.md`).

| Criterio de #23 | Estado en el acta | Procedencia |
|---|---|---|
| 1. #18 AUTH-01 | Cumplido para el gate. Hueco: 403/404 y `ApiEndpointConfig.fromEnvironment` sin prueba | CI + DEVICE indirecto |
| 2. #19 AUTH-02 | Cumplido. Residuales 19-C y 19-F | DEVICE |
| 3. #20 AUTH-03 | Cumplido. Residuales: Auto Backup, D2D y corte de energía | DEVICE |
| 4. #21 AUTH-04 | Cumplido. Residual 21-E | DEVICE |
| 5. #22 AUTH-05 | Cumplido (401 real en #71) | DEVICE |
| 6. Primera instalación con Internet, operación sin red, refresh inválido sin destruir SQLite | Cumplido (#76 con sus 5 criterios en el POCO; #71) | DEVICE + CI |

**Propuesta:**
- **Passed para el alcance académico**, con los residuales NOT_MEASURED del acta como límite declarado:
  - 19-C y 19-F;
  - 21-E;
  - Auto Backup, D2D y corte de energía;
  - logcat de valores opacos del 2026-10-15;
  - un solo modelo de teléfono.
- Con la decisión, **cerrar #76** (dry-run B1).
- Lo que haría falta para no aceptar el límite: medir 19-C (corte de red durante la activación), que es el residual de mayor riesgo para RF-01. No se mide por rutina.

**Lo que no cambia:** #18–#22 siguen Partial porque sus evidencias están en `docs/evolution/features/`, y #18 tiene huecos de prueba. Pasar alguna a `Verified` exige un archivo en `docs/evidence/`.

## GATE-F05 (BE #19): sincronización

**Acta:** BE `docs/evidence/F05_GATE_EVALUATION.md`, con la nota de base del 2026-10-17 (§«Nota de base»).

| Criterio de #19 | Estado en el acta | Procedencia |
|---|---|---|
| 1. ACK perdido y reenvío: un solo efecto | Evidenciado | CI + DEVICE (C01–C06) |
| 2. Mismo `operationId` con otro contenido: rechazo distinguible | Evidenciado en CI. En DEVICE, NOT_MEASURED (C08): la app no puede generar ese envío, porque el trigger lo impide | CI |
| 3. Estados distinguibles, nunca un éxito no aceptado | Evidenciado en CI. En DEVICE se vieron pendiente, sincronizada, en conflicto y requiere intervención; falta «rechazada» | CI + DEVICE parcial |
| 4. Campos fuera de la whitelist no se persisten | Evidenciado por esquema cerrado; logcat limpio en DEVICE | CI + DEVICE |
| 5. Sale de Pending sólo con resultados ejecutados | Hay resultados ejecutados | — |

**Propuesta:**
- **Passed para el alcance académico.** Los cinco criterios de #19 tienen evidencia ejecutada. Los huecos de dispositivo (C08 y «rechazada») quedan como límite declarado. La prueba de carga **no** es criterio de #19.
- **#18:** las respuestas inyectadas prueban el cliente; las acciones reales prueban Central. La columna Mobile queda con 18 PASS y 22 NOT_MEASURED, que no se convierten en PASS ni en N/A. Dos opciones:
  - **(a)** cerrar #18 con `Evidence = Partial` y las 22 filas como límite declarado. Su 10.º criterio («registrar los 40 casos con su resultado») se cumple;
  - **(b)** dejar #18 abierta como deuda declarada.
  - Se propone (a). Si se quiere medir algo antes, que sea C29 (429/Retry-After), por riesgo.
- **Residual nuevo, detectado en F04 el 2026-10-17 (D-F04-C2):**
  - el vínculo de campaña con Central no comprueba que el período local quepa en el central;
  - por eso se pudo publicar consumo con fechas locales fuera del período central;
  - no es criterio de #19, pero afecta a la coherencia temporal de lo publicado (RN-15).
  - Se propone registrarlo como límite de F05, o abrir una tarea de F05 si Roderich elige corregirlo.

## GATE-F06 (BE #22): proyección colectiva y reconciliación

**Acta:** BE `docs/evidence/GATE_F06.md`, con la actualización del 2026-10-17 (BE #131): regresión D4 en PASS sobre `e2263b0` + `ce5678f`, con CSV idénticos byte a byte a los del 2026-10-16.

| Criterio de #22 | Estado en el acta |
|---|---|
| 1. Diferencia 0 por campaña, producto y unidad | Evidenciado (27/27; Central 26/26 frente al oráculo) |
| 2. Reenvío o ACK perdido sin volver a sumar | Evidenciado |
| 3. Concurrentes incompatibles: conflicto, sin reemplazo silencioso | Evidenciado, **con la reescritura delegada** («la cifra se retira» en vez de «el agregado no cambia») |
| 4. Fuera de la whitelist o backup: rechazo; restaurar no publica | Evidenciado (también en DEVICE, C35) |
| 5. Sin publicación: desconocido, no cero | Evidenciado (semántica de cobertura de #126) |
| 6. Sólo totales derivados, sin datos privados | Evidenciado en la API. Discrepancia de nombres y metadatos aceptada por delegación |
| 7. Sin evidencia ejecutada, Pending | Hay evidencia ejecutada |

**Propuesta:**
- **Passed para el alcance académico, con datos sintéticos y la política provisional k = 3**, condicionado a dos ratificaciones de Roderich:
  - **(1)** la reescritura del criterio 3: el aporte en disputa sale del cálculo y la cifra de su celda se retira hasta una intención válida del propietario;
  - **(2)** la aceptación del criterio 6: `projection_type` + `total_base`, con cobertura, conteos y `data_as_of` como metadatos sujetos a la política.
- Si no se ratifica alguna, el gate sigue Pending y el criterio afectado vuelve a su texto original.
- Las discrepancias en que ganó el contrato (#32 c1, #33) se ratifican en el mismo acto.
- **Lo que no habilita:** la divulgación real sigue cerrada (`POLICY_PENDING`) hasta #107, que es de F07 y requiere una validación institucional real.

## Resumen

| Gate | Propuesta | Condición | Lo que lo dejaría en Pending |
|---|---|---|---|
| F03 (MOB #23) | Passed académico | Aceptar los residuales NOT_MEASURED | Querer medir 19-C u otro residual antes |
| F05 (BE #19) | Passed académico | Aceptar C08 y «rechazada» sin DEVICE; decidir #18 (a)/(b); registrar D-F04-C2 | Querer filas de #18 medidas antes |
| F06 (BE #22) | Passed académico (sintético, k = 3) | Ratificar los criterios 3 y 6 y las discrepancias de #32/#33 | No ratificar la reescritura del criterio 3 |
