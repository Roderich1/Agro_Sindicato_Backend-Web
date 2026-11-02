# F12-EST-01 (#174): conciliación del contrato INT-09 con las decisiones del autor — evidencia

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-02, de las 00:46Z a las 01:35Z (UTC); noche del 2026-11-01 en Bolivia |
| Base | Backend `origin/main` `b81ff23`, sin cambios desde el bloque anterior |
| Rama | `feat/f12-est-01-contrato-int09`, sobre `059b014` |
| Código verificado | `c957330` |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200, Node 25.9.0, Prisma 6.19.3. PostgreSQL 16.13 **desechable** en Docker (`agro_f12_est01b_pg`, 127.0.0.1:55498, con `--rm`), solo con datos sintéticos. Secretos JWT efímeros, generados en cada ejecución y nunca escritos |
| Issue | Refs #174. No se cierra con este trabajo |
| Decisiones | EST-D-01 a 05, EST-D-09 y EST-D-13, del autor (contrato §11.1) |
| Documento | `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`, leído desde una copia de texto; no se modifica |

## 1. Qué cambia y en qué estado

| Pieza | Cambio | Estado |
|---|---|---|
| [ADR-004](../adr/ADR-004-estimacion-exploratoria-ses-naive.md) | Incluye la estimación SES/naive y reconoce SES como pronóstico estadístico. Mantiene excluidos ARIMA, Prophet, redes neuronales, variables externas y recomendaciones automáticas. Conserva literal el texto anterior | Documento |
| `CURRENT_SCOPE.md` §11 y `AGENTS.md`, `Back/AGENTS.md`, `Web/AGENTS.md` | Exclusión acotada, con enlace a ADR-004 | Documento |
| Contrato | Temporadas, fuente sellada, trabajos por lotes, cobertura desconocida, perfil del Agricultor, §11 con lo decidido, pendiente e incompatible | **Especificación** |
| OpenAPI | 8 rutas y 37 esquemas. `POST /runs` pasa a `POST /jobs` (202); se añaden temporadas, clasificaciones y `GET /jobs/{jobId}`; `Coverage` solo `UNKNOWN` | **Especificado, no implementado** |
| Migración `20261101233651_f12_est_01_estimation` | Reescrita en el mismo archivo, porque no está en `main` ni en ninguna base que no sea desechable. Siete tablas | **Ejecutada** en PostgreSQL desechable |
| `openapi-f12-estimation.cjs` | Comprobaciones nuevas. La ausencia de rutas pasa a ser una comprobación **de etapa** | **Ejecutado** |
| Suite `f12-est-01-estimation-schema.postgres.spec.ts` | De 9 a 11 pruebas | **Ejecutada** |
| Trabajador por lotes, rutas, cálculo SES/naive y clientes | — | **No construidos** |

**Ningún rechazo HTTP está probado**, porque no hay controladores. El 403, el 202 al encolar, el 409 `POLICY_PENDING`, el 422 `TARGET_CAMPAIGN_NOT_CLASSIFIED`, los perfiles y la retirada de cifras al leer están **solo especificados** (contrato §12).

## 2. EST-D-09: lo que se comprobó en F07

**Fuentes leídas:** `collective-summary.use-case.ts` (`linkedMembers()`, `publishedMembers()` y `servedSealed()`), `collective-seal.use-case.ts` y la migración `20261023100000_f07_collective_seal`.

**Qué hay.** `CollectiveSeal` guarda una sola cobertura **por campaña**, fijada al sellar:
- **`linkedMembers` (M):** Members `AGRICULTOR` activos, con cuenta activa, en el momento del sellado.
- **`membersWithContribution` (N):** Members distintos de alguna cifra publicada de la campaña, **de necesidad o de consumo**. Incluye los de una cifra anterior que se sigue mostrando (`SHOW_PRIOR`).

**Fechas.** La regla de F10-SEC-02 es de `b02f2b0` (2026-10-16) y el sellado, de `cd3583a` y `943f578` (2026-10-23). Todos los sellados usan la regla actual.

**Qué no hay.** No existe una cobertura del consumo, ni por campaña ni por cifra. No se usaron como sustituto `CollectiveRelease.contributorCount` ni la membresía actual.

**Resultado:**
- no hay columnas de cobertura;
- la API da `Coverage.status = UNKNOWN`;
- el contrato §3.1 propone la modificación mínima del sellado F07 para fuentes futuras, sin construirla.

## 3. Migración: coincidencia con Prisma y aditividad

```text
npx prisma validate                                                → «The schema at prisma\schema.prisma is valid 🚀»
npx prisma migrate deploy (bases vacías f02_auth_v2, f02_auth_context, f02_final) → exit 0, 14 migraciones
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url <desechable> --exit-code                   → exit 0, «No difference detected.»
```

El DDL de Prisma se generó con `prisma migrate diff --from-schema-datamodel <schema de main> --to-schema-datamodel prisma/schema.prisma --script`. La parte escrita a mano son las restricciones, los disparadores y el índice parcial, que Prisma no modela.

**Suite PostgreSQL: 11 de 11.**
1. Crea una base nueva con las **13 migraciones anteriores**.
2. Siembra datos sintéticos: dos sindicatos, roles, una Directiva inactiva, otra con la cuenta desactivada, una de otro sindicato, campañas cerradas (selladas, sin sellar y sin clasificar), divulgaciones de consumo y **cuatro sellados F07**: uno con una entrada suprimida y otro con la visibilidad de una entrada retirada. También una fila de `DemandForecast`.
3. Aplica la migración nueva.

| Prueba | Qué demuestra |
|---|---|
| Aditiva | Filas de campañas, productos, asociaciones, contribuciones, divulgaciones, **sellados con sus entradas** y `DemandForecast` idénticas. Columnas, restricciones, índices y disparadores de todas las tablas previas idénticos. **Cero clasificaciones** tras la migración |
| Sin vigencia, aprobación ni cobertura | Las siete tablas existen; ninguna columna contiene `validity`, `vigenc`, `approv`, `aprob`, `coverage` ni `cobertura` |
| Temporadas y clasificaciones (EST-D-02, EST-D-13) | Se rechazan:<ul><li>clave vacía o con espacios, definición vacía, duración 0, clave repetida;</li><li>AGRICULTOR, Member inactivo, cuenta desactivada u otro sindicato, como autor de una temporada o como clasificador;</li><li>campaña o temporada de otro sindicato;</li><li>una segunda clasificación;</li><li>UPDATE, DELETE y TRUNCATE.</li></ul>ADMINISTRADOR, aceptado |
| RN-26 y clasificación | Cero comprobado, ausencia y dato oculto distinguidos. Se rechazan:<ul><li>formas mezcladas y cifra distinta de la divulgada;</li><li>otro sindicato y producto no canónico;</li><li>campaña antigua **sellada pero sin clasificar**, campaña de otra temporada y temporada de otro sindicato;</li><li>ausencia sin sellado en una campaña sellada</li></ul> |
| Fuente sellada (EST-D-03) | Se rechazan:<ul><li>consumo comprobado sin sellado;</li><li>divulgación que no es entrada del sellado, entrada con la visibilidad retirada y sellado de otra campaña;</li><li>oculto sin sellado o con una celda visible o ausente;</li><li>ausencia que el sellado sí tiene.</li></ul>Se aceptan oculto suprimido, oculto retirado y ausencia sellada. Sellado y divulgación se conservan en cada punto |
| Versiones de serie | Escritura una vez; puntos solo en su transacción; v2 sin anterior, salto de versión u otra temporada rechazados; un solo sucesor |
| Trabajos (EST-D-04) | Se rechazan:<ul><li>AGRICULTOR, otro sindicato, Member inactivo y cuenta desactivada;</li><li>campaña objetivo ajena o **sin clasificar**;</li><li>trabajo que no nace en cola y `productRefs` no lista;</li><li>`requestId` repetido;</li><li>cambiar la petición y transiciones QUEUED→COMPLETED o RUNNING→QUEUED;</li><li>intentos que bajan o que no suben;</li><li>`COMPLETED` sin ejecución y `NOT_EXECUTED` sin código o con código ajeno;</li><li>cambiar un trabajo terminado, DELETE y TRUNCATE;</li><li>**un trabajo con ejecución, que solo pasa a `COMPLETED`**</li></ul> |
| Ejecuciones (EST-D-04, EST-D-13) | Se rechazan:<ul><li>trabajo en cola, otra campaña objetivo u otro solicitante;</li><li>h ≠ 1, `FAILED` sin código o con código ajeno, `POLICY_PENDING`;</li><li>otra temporada;</li><li>solicitante que pierde el Member, o la cuenta, entre la cola y el registro (el trabajo termina `NOT_EXECUTED` sin ejecución).</li></ul>DIRECTIVA y ADMINISTRADOR, aceptados |
| RN-28 | Cifras solo en `ESTIMATED`; **motivo de su estado**; tramo de al menos 3; `FAILED` sin cifras; serie de otra temporada rechazada; `INCOMPATIBLE_DATA` + `COVERAGE_UNKNOWN` sin cifras; nada añadido después |
| Cadena | Una raíz por campaña objetivo, un sucesor, ningún antecesor posterior ni de otra campaña, **una ejecución por trabajo** |
| Inmutabilidad | UPDATE, DELETE y TRUNCATE rechazados en series, puntos, ejecuciones y resultados; datos intactos |

**La suite falla de verdad.** Se retiraron de la migración, una a una, nueve protecciones, restaurándola después. Cada retirada hace fallar al menos una prueba (`exit=1`):

| Protección retirada | Resultado |
|---|---|
| Sellado obligatorio del consumo comprobado (CHECK) | 1 fallida, 10 superadas |
| Punto de una campaña clasificada en la temporada de la serie | 1 fallida, 10 superadas |
| Comprobación de la entrada sellada de un dato oculto | 1 fallida, 10 superadas |
| Transiciones del trabajo | 1 fallida, 10 superadas |
| Ejecución solo con un trabajo en curso | 1 fallida, 10 superadas |
| Cuenta activa en `estimation_is_active_member` | 3 fallidas, 8 superadas |
| Campaña objetivo clasificada en la temporada de la ejecución | 1 fallida, 10 superadas |
| Ausencia sin sellado en una campaña sellada | 1 fallida, 10 superadas |
| Trabajo con ejecución que pasa a `NOT_EXECUTED` | 1 fallida, 10 superadas |

La séptima no fallaba en la primera tanda, porque ninguna campaña estaba en VERANO. Se añadió una campaña a esa temporada y ahora falla.

**Límites:**
- Que un consumo comprobado sea de una campaña CERRADA no se puede probar: F07 solo sella campañas CERRADAS y no deja cambiar el estado de una campaña sellada.
- El CHECK que impide AGRICULTOR en `EstimationRun` tampoco se alcanza, porque el trabajo ya lo impide.
- Ambos quedan como defensa redundante (contrato §6.3).

## 4. Qué valida ahora `openapi:check`

```text
npm run openapi:check (base f02_final migrada, JWT efímeros)           → exit 0
OpenAPI snapshots match generated documents.
F02 OpenAPI contract assertions passed.
F05 Sync v1 OpenAPI contract assertions passed.
F06 collective OpenAPI contract assertions passed.
F08 backups OpenAPI contract assertions passed.
openapi-f12-estimation: 8 rutas, 37 esquemas, 37 referenciados; etapa SPECIFIED_NOT_IMPLEMENTED: especificado, no implementado
```

**Lo nuevo frente al bloque anterior:**
- el conjunto **exacto** de respuestas por operación;
- 409 `POLICY_PENDING` solo en las operaciones con cifras;
- `POST /jobs` con 202 y el esquema `Job`;
- la temporada explícita en peticiones y ejecuciones;
- `Coverage` solo `UNKNOWN` y sin cifras;
- la exigencia de política en las rutas del Agricultor;
- `EstimationJobStatus` igual a Prisma y `stopCode` igual a la migración;
- ninguna columna de cobertura en los siete modelos.

**Bloque 8, comprobación de etapa.** Mientras la especificación declare `SPECIFIED_NOT_IMPLEMENTED`, `openapi-f02.json` no tiene rutas de estimación. Con otro estado, el script falla y pide que F12-EST-05 sustituya la comprobación. No prohíbe implementar INT-09.

**Veintitrés alteraciones** de una copia de la especificación, o del esquema Prisma, restauradas después. Todas salen con `exit=1`:

| Alteración | Mensaje |
|---|---|
| `DELETE` en una ejecución | `/api/v1/estimation/runs/{runId}: métodos` |
| `approved_by` en el perfil del Agricultor | `schemas.FarmerResult: campo prohibido approved_by` |
| `Coverage` abierto | `#.components.schemas.Coverage: objeto abierto` |
| `naive_base` en el perfil del Agricultor | `FarmerResults: naive_base no es del Agricultor` |
| Puntos de la serie en el perfil del Agricultor | `FarmerResults no debe alcanzar SeriesPoint` |
| `kind` distinto de Prisma | `Expected values to be strictly deep-equal` |
| AGRICULTOR en `POST /jobs` | `POST /api/v1/estimation/jobs: roles` |
| `may_be_outdated` no fijo | `Expected values to be strictly deep-equal` |
| Referencia sin resolver | `… referencia sin resolver #/components/schemas/NoExiste` |
| `nullable` junto a `$ref` | `… $ref con hermanos ignorados` |
| Motivo fuera de la migración | `Expected values to be strictly deep-equal` |
| Consulta sin 409 | `GET /api/v1/estimation/results: respuestas` |
| Parámetro `member_id` | `/api/v1/estimation/runs: parámetro prohibido member_id` |
| `POST /runs`, es decir, cálculo en la petición | `/api/v1/estimation/runs: métodos` |
| 201 en lugar de 202 al encolar | `POST /api/v1/estimation/jobs: respuestas` |
| Cobertura con cifra N | `Expected values to be strictly deep-equal` |
| Estado de trabajo distinto de Prisma | `Job.status` |
| Código de parada fuera de la migración | `Expected values to be strictly deep-equal` |
| Sin exigencia de política del Agricultor | `/api/v1/estimation/results: exigencia de política` |
| Estado `IMPLEMENTED` sin sustituir la comprobación | `Etapa IMPLEMENTED: F12-EST-05 debe sustituir esta comprobación …` |
| Clave libre en lugar de temporada | `RunSummary.season` |
| Temporada sin duración obligatoria | `Expected values to be strictly deep-equal` |
| Columna `coverageReported` en `SeriesPoint` (Prisma) | `SeriesPoint.coverageReported: cobertura sin fuente` |

## 5. Regresión

Se reprodujeron los pasos de `backend-f02.yml` y el paso del sellado F07 de `web.yml`, contra bases recién migradas:

```text
npx prisma generate / npm run build                                   → exit 0
npm test -- --runInBand  → 41 suites passed, 23 skipped; 420 passed, 307 skipped, 727 total (PostgreSQL sin URL)
npx eslint src/modules/estimation                                     → exit 0
auth-v2 12 · current-auth-context 25 · f02-final-integration 3
sync-v1-journal 30 · sync-v1-adversarial 41 · sync-v1-references 7
f06-coll-05-collective-aggregate 16 · product-reconciliation 5 · backups 68
f10-sec-02-legacy-boundary 29 · f81-phase6-legacy-writes 7 · f10-sec-02-disclosure-gaps 2
f07-collective-seal 20 · f12-est-01-estimation-schema 11                → todas «passed», ninguna fallida
```

**Lint.** `eslint` sobre `scripts/*.cjs` da `no-undef` (`__dirname`, `process`) también en `scripts/openapi.cjs` de `main`: los scripts no están en la configuración de lint, y la CI no los revisa.

## 6. Revisión

Otro agente de esta misma sesión hizo una lectura de contraste **antes del commit**. No es una revisión independiente.

**Encontró dos bloqueantes**, corregidos en `c957330` y con prueba y alteración propias:
1. Un trabajo con su ejecución ya registrada podía pasar a `NOT_EXECUTED`.
2. Una campaña sellada admitía `NO_RECORD` sin citar su sellado, y así una cifra comprobada se podía degradar a ausencia.

**Menores corregidos:**
- el motivo emparejado con su estado;
- otro intento exige más intentos;
- un trabajo solo para campañas objetivo clasificadas;
- `SHOW_PRIOR` en la descripción de N;
- `generatedAt` no lo impone la base;
- `product_refs` nulo descrito igual en todas partes;
- el texto del 409, que hablaba de política «no aprobada»;
- la comprobación de etapa ya no está fijada dos veces;
- la atribución de los CHECK en §6.2;
- la redacción de `CURRENT_SCOPE` cubre otros métodos estadísticos;
- pruebas de cuenta desactivada y de otro sindicato.

**Declarados, sin cambio** (contrato §11.2 y §11.3):
- las paradas sin ejecución por permiso, política o campaña (EST-D-15) y los límites del lote (EST-D-16), reglas propias del contrato no decididas por el autor;
- las cláusulas de `F06_COLLECTIVE_PROJECTION_CONTRACT.md` §1 y `F07_SEALED_HISTORY_CONTRACT.md` §8, no modificadas por falta de autorización.

## 7. Límites

- Solo HOST, con datos sintéticos.
- **El contrato no está implementado.** Nada de lo «no construido» del §1 se prueba aquí.
- **RN-25 frente a EST-D-09.** Con las fuentes actuales, ningún resultado puede ser `ESTIMATED`: todos serían `INCOMPATIBLE_DATA` con `COVERAGE_UNKNOWN` (contrato §11.3).
- La base PostgreSQL es desechable y se elimina al terminar.
