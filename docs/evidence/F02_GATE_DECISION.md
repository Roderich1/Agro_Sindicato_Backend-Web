# GATE-F02 — decisión formal para el alcance académico

## Identificación y autoridad

- Proyecto: Agrocuentas — Proyecto de Grado 2026.
- Fase: F02, identidad y contratos centrales. Gate: [#15](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/15).
- Baseline evaluada: `main@8ccfe72171b0b682a981e00b8ce2807e99220b09`.
- Evaluación independiente: [PR #95](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/pull/95), integrada mediante merge `8ccfe72171b0b682a981e00b8ce2807e99220b09`; [informe íntegro](F02_GATE_EVALUATION.md).
- Fecha de la decisión comunicada: **2026-09-28**, zona `America/La_Paz`.
- Responsable de la decisión: **Roderich1, propietario del proyecto**. La autorización fue comunicada expresamente en la instrucción de ejecución de este cierre: «Sí, apruebo formalmente GATE-F02 = Passed exclusivamente para el alcance académico, con los riesgos y las limitaciones documentados». Este registro no representa una firma digital ni afirma que exista una aprobación independiente publicada en GitHub.

## Decisión y fundamento

- `GATE_F02 = PASSED`
- `SCOPE = ACADEMIC_F02_ONLY`
- `EVIDENCE = VERIFIED`
- `PRODUCTION_DEPLOYMENT_AUTHORIZATION = NOT_GRANTED`

La aprobación se limita a los criterios de identidad, Member, ClientRegistration, Session, contratos V1/V2 y autorización central definidos para F02. No declara terminado Agrocuentas, no inicia fases posteriores y no sustituye la autorización de producción.

Los cinco entregables [#10 F02-IAM-01](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/10), [#11 F02-IAM-02](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/11), [#13 F02-IAM-03](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/13), [#12 F02-IAM-04](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/12) y [#14 F02-IAM-05](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/14) están cerrados e integrados. La [evaluación independiente](F02_GATE_EVALUATION.md) contrastó las migraciones F02 expand-only y su rollback **de aplicación**, el contrato versionado V1/V2, rotación/revocación de sesión, registro lógico de cliente, contexto de autorización vigente, aislamiento de tenant/owner, OpenAPI y la evidencia DEVICE Mobile reutilizada. [La trazabilidad final](F02_FINAL_TRACEABILITY.md) registra **3/3** en la suite HTTP final, incluido COOKIE V2 con refresh y logout sin request body. No se identificó un defecto crítico demostrado dentro del alcance específico IAM-F02; esto no equivale a certificar seguridad global.

La evidencia de CI existente, verificada para este cierre pero **no reejecutada localmente**, es [Actions `main` run 36505282255](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/actions/runs/36505282255): `SUCCESS`, Prisma validate/generate, build y OpenAPI check aprobados; 105 pruebas normales aprobadas y 40 opt-in PostgreSQL omitidas en esa corrida. Estas últimas se ejecutaron **por separado**: F02-C 12/12, F02-D 25/25 e integración HTTP final 3/3. No se suman las 40 dos veces. En PR #95, Actions y SonarCloud fueron `SUCCESS`; en el merge de `main`, Actions fue `SUCCESS` y SonarCloud fue `NEUTRAL` con `Quality Gate not computed`. El resultado neutral no es un PASS de SonarCloud ni un fallo funcional demostrado. El sustento académico está en la evidencia técnica y contractual evaluada, no exclusivamente en SonarCloud.

## Restricciones y riesgos preservados

- [SEC-DEP-01 #94](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/94) permanece **OPEN / P1 / High**. La última auditoría documentada registra 15 findings de paquetes (10 High, 3 Moderate, 2 Low). La exposición efectiva de Nest/Multer, Swagger/YAML y demás rutas relevantes, las versiones corregidas, el plan de actualización y su regresión siguen pendientes. No se ha remediado #94 ni se autoriza producción por este gate.
- La evidencia física Mobile F02-B es **reutilizada**, no una nueva prueba DEVICE completa ni un E2E Mobile→Backend. El ZIP físico interno fue `NOT_READABLE_VIA_ADB`; la corrupción en dispositivo permanece `NOT_MEASURED`. Auth Mobile remota, registro remoto de ClientRegistration y almacenamiento seguro del refresh están delegados.
- El contrato Sync definitivo —DTO whitelist, ACK, conflictos, versionado y asociación con ClientRegistration/SyncOperation— está **delegado a F05**. No se declara implementado ni se inicia F05.
- Se verificó rollback **de aplicación** sobre esquema expandido; no se ejecutó ni se admite como probado un downgrade de base de datos (`NOT_MEASURED` / `NOT_SUPPORTED_BY_DESIGN`). Los upgrades históricos y las pruebas físicas no se repitieron para este documento.
- Los endpoints y datos privados centrales legacy siguen como compatibilidad temporal, no arquitectura objetivo. `Person` sólo se materializará si existe finalidad central aprobada. F06, F07, F09 y F10 continúan delegadas; la realineación [#81](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81) permanece **OPEN / Blocked** hasta satisfacer también sus dependencias F05 y F06. Esta decisión no habilita su ejecución.

La evaluación independiente conserva sus hallazgos y límites históricos. Esta decisión formal añade la aprobación expresa del propietario para **F02 académico solamente**; cualquier autorización de despliegue requiere un procedimiento y evidencia separados.
