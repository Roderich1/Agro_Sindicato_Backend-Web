# Temporadas y clasificación inicial de campañas (EST-D-02, Refs #175) — evidencia

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-02, de las 13:40Z a las 14:10Z (UTC) |
| Base | Rama de #190 (`feat/f12-est-05-runs`) en `05e2b3a`: código `dc84f0a` más documentación. **No es `main`** |
| Rama | `feat/f12-est-seasons-classifications` (PR de continuación, borrador, apilado sobre #190) |
| Código verificado | `2eac025` (verificación completa sobre `15b09b9`; `2eac025` solo cambia la prueba) |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200, Node 25.9.0, Prisma 6.19.3. PostgreSQL 16.13 **desechable** en Docker (`agro_f12_est05b_pg`, con `--rm`), solo con datos sintéticos |
| Issue | Refs #175, como propuesta de asignación. No se cierra |

## 1. Por qué es una continuación y no parte de #190

- **El contrato las especifica.** Las cuatro operaciones del §4.1, `POST`/`GET /estimation/seasons` y `POST`/`GET /estimation/campaign-classifications`, vienen de EST-D-02, decidida por el autor el 2026-11-01.
- **Ningún issue las incluye.** #175 a #184 se redactaron antes de EST-D-02, y el contrato (§11.4) solo asignó a #178 las rutas de corrección. Ponerlas en #190 ampliaría #178 sin decisión.
- **Se vinculan a #175**, el issue más cercano: series de campañas comparables de una misma temporada. Esa asignación es una propuesta para Roderich; si prefiere un issue propio, solo cambia el enlace.
- **Depende de #190:** usa el caso de uso de clasificaciones (correcciones e historial), el controlador y el validador de esquemas que trae #190.
  - **Si #190 se integra antes:** este PR se vuelve a basar en `main`, sin reescribir su historia.
  - **Si no se integra:** este PR no puede integrarse solo.

## 2. Qué se construye

- **`POST /estimation/seasons`:**
  - registra una temporada (clave, definición y duración en días) una sola vez y responde 201;
  - una clave repetida en el sindicato da 409 `SEASON_KEY_TAKEN`;
  - valida la clave sin espacios al principio ni al final, de 1 a 64 caracteres, la definición no vacía de hasta 500 y la duración entera positiva.
- **`GET /estimation/seasons`:** las temporadas del sindicato, por orden de registro.
- **`POST /estimation/campaign-classifications`:** registra la versión 1 de la clasificación de una campaña.
  - 404 `CAMPAIGN_NOT_FOUND` o `SEASON_NOT_FOUND` si son de otro sindicato o no existen;
  - 409 `CAMPAIGN_ALREADY_CLASSIFIED` si la campaña ya tiene alguna versión, incluso corregida: se corrige con `/corrections`, de #190.
- **`GET /estimation/campaign-classifications`:** la versión vigente de cada campaña clasificada, por fecha de inicio de la campaña.
  - Con `season_ref`, solo las de esa temporada; 404 `SEASON_NOT_FOUND`.
  - Una campaña cuya versión vigente no tiene temporada no aparece: está sin clasificar.
- **Escrituras simultáneas:** dos registros de la misma clave, o dos clasificaciones de la misma campaña, dejan una fila y responden 409 al otro. La base lo garantiza con sus índices únicos.
- **Nada se modifica ni se borra.** Los disparadores existentes lo impiden, y la prueba lo comprueba.
- **No cambia** ninguna migración, el esquema, la vigencia ni el cálculo.
- **`openapi:check`** compara ahora once operaciones con el código. Solo la descarga sigue especificada.

## 3. Pruebas (`f12-est-seasons.postgres.spec.ts`, 3 pruebas, por HTTP contra PostgreSQL)

| Comprobación | Resultado |
|---|---|
| Sin credencial; Agricultor | 401; 403 «No tienes permisos para esta acción» |
| Clave con espacios, vacía o de 65 caracteres; definición en blanco o de 501; duración 0, 1,5 o texto; campo extra; versión 2 | 400, sin escribir nada |
| Temporada válida (Directiva y Administrador) | 201 `Season`, con `created_by_role` |
| Misma clave en el sindicato; en otro sindicato | 409 `SEASON_KEY_TAKEN`; 201 (las claves son por sindicato) |
| Dos registros simultáneos de una clave nueva | Un 201 y un 409 |
| Lista de temporadas | Las tres del sindicato en orden; el otro sindicato solo ve la suya |
| Clasificar una campaña inexistente, de otro sindicato, o con una temporada de otro sindicato | 404, sin escribir nada |
| Clasificación válida; una segunda; una campaña corregida antes | 201 versión 1, vigente; 409 `CAMPAIGN_ALREADY_CLASSIFIED`; 409 |
| Dos clasificaciones simultáneas de la misma campaña | Un 201 y un 409; una sola versión |
| Lista de clasificaciones, también por temporada | Solo las vigentes con temporada; la campaña corregida a «sin temporada» no aparece; la ganadora de la carrera aparece en su temporada |
| Pedir una estimación para la campaña clasificada por HTTP; para la que quedó sin temporada | 202 `QUEUED`; 422 `TARGET_CAMPAIGN_NOT_CLASSIFIED` |
| `UPDATE` de una temporada; `DELETE` de una clasificación | Rechazados por la base («… es inmutable») |

Cada cuerpo se contrasta con su esquema de la especificación: `Season`, `SeasonList`, `Classification`, `ClassificationList` y `Error`.

**Fallo conservado.** En la primera ejecución, la prueba suponía cuál de las dos clasificaciones simultáneas ganaba la carrera. Se corrigió para seguir a la ganadora real, y después pasó tres veces seguidas.

## 4. Verificación sobre `15b09b9`

**Verificación completa sobre `15b09b9`** (los pasos de `backend-f02.yml` y `web.yml`, contra bases recién migradas):

```text
npx prisma validate / generate / npm run build                          → exit 0
npm test -- --runInBand        → 458 passed, 332 skipped, 790 total
npx prisma migrate deploy (bases vacías)                               → 16 migraciones, exit 0
npx prisma migrate diff … --exit-code                                  → «No difference detected.»
npm run openapi:check  → exit 0; «… etapa PARTIALLY_IMPLEMENTED: 11 operaciones implementadas y comparadas con el código»
npx eslint src/modules/estimation …                                    → exit 0
auth-v2 12 · current-auth-context 25 · f02-final 3 · sync-v1-journal 30 · adversarial 41 · references 7 · f06 16
product-reconciliation 5 · backups 68 · legacy 29 · f81 7 · gaps 2
f07-web-proposal 12 · f07-acceptance 6 · f07-collective-seal 22 · f12-est-01 13 · f12-est-02-series 4
f12-est-05-runs 14 · f12-est-seasons 3                                 → passed
```

**Alteraciones del código, una por caso, restaurado después:**
- **Sobre `15b09b9`:** de cinco, **cuatro fallaron y una sobrevivió**: quitar la traducción a 409 del conflicto de clave repetida. Los dos registros simultáneos por HTTP no llegaron a solaparse, y la comprobación previa ya respondía el 409.
- **Corrección, en `2eac025` (solo cambia la prueba):** dos casos deterministas hacen que la comprobación previa no vea la fila existente, y la ruta tiene que responder 409 por el índice único de la base, para la clave y para la versión 1.
- **Sobre `2eac025`:** las cinco alteraciones fallan, sin errores de compilación. La suite de temporadas pasa 3/3, y el resto de las unitarias pasan en cada ejecución alterada.
  - Clasificaciones simultáneas sin traducir el conflicto.
  - Claves simultáneas sin traducir el conflicto.
  - La lista incluye versiones no vigentes.
  - Temporadas de todos los sindicatos.
  - Temporada de otro sindicato admitida al clasificar.

**HEAD de código probado:** `2eac025`. La verificación completa se hizo sobre `15b09b9`, y `2eac025` solo añade los dos casos de la prueba.

## 5. Límites

- Solo HOST y datos sintéticos.
- **El orden de las listas no lo fija el contrato:** temporadas por registro y clasificaciones por inicio de campaña.
- No se implementa la descarga, que depende de EST-D-08, 10 y 12, ni ningún cliente.
- No se modificaron el Word, diapositivas, instrumentos, pilotos ni gates.
