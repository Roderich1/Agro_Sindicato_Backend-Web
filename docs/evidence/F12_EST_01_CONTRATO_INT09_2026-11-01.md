# F12-EST-01 (#174): contrato INT-09, permisos y esquema de la estimación — evidencia

| Campo | Valor |
|---|---|
| Fecha real | Del 2026-11-01 a las 23:00Z al 2026-11-02 a las 00:25Z (UTC); tarde del 2026-11-01 en Bolivia |
| Base | Backend `origin/main` `b81ff23` |
| Rama | `feat/f12-est-01-contrato-int09` |
| Código verificado | `acc04fa` |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200, Node 25.9.0, Prisma 6.19.3. PostgreSQL 16.13 **desechable** en Docker (`agro_f12_est01_pg`, 127.0.0.1:55498), solo con datos sintéticos |
| Issue | Refs #174. No se cierra con este trabajo |
| Mobile | `main` `4ca2088`, solo leído; no cambia |
| Documento | `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`, leído desde una copia; no se modifica |

## 1. Qué se entrega y en qué estado

| Pieza | Estado |
|---|---|
| `docs/architecture/F12_EST_01_ESTIMATION_CONTRACT.md` | Contrato v1: **especificación** |
| `docs/api/openapi-f12-estimation.json` | OpenAPI 3.0.3 escrito a mano: **especificado, no implementado** (`x-implementation-status`) |
| `Back/scripts/openapi-f12-estimation.cjs`, dentro de `openapi:check` | **Ejecutado** |
| Migración `20261101233651_f12_est_01_estimation` y modelos Prisma | **Ejecutada** en PostgreSQL desechable |
| Suite `f12-est-01-estimation-schema.postgres.spec.ts` | **Ejecutada** |
| Rutas, casos de uso, cálculo SES/naive y clientes | **No construidos** (F12-EST-02 a 08) |

**Ningún rechazo HTTP está probado**: no hay controladores. El 403, el 409 `POLICY_PENDING`, los perfiles y la retirada de cifras al leer están **solo especificados** (contrato §12).

## 2. Qué valida realmente `openapi:check`

**Antes de este bloque**, `npm run openapi:check` era `openapi.cjs --check` y `openapi-contract.cjs`.
- **Primer script:** arranca Nest, genera el OpenAPI desde los decoradores y compara el texto exacto de cuatro archivos: `openapi-f02`, `-f05-sync-v1`, `-f06-collective` y `-f08-backups`.
- **Segundo script:** hace aserciones sobre esos mismos cuatro.
- **Consecuencia:** un archivo nuevo en `docs/api/` **no se leía**. Que `openapi:check` pase sobre la API existente no demostraba nada del contrato nuevo.

**Ahora** `openapi:check` añade `openapi-f12-estimation.cjs`. Este script comprueba la especificación, no un comportamiento:
- **Forma:** versión 3.0.3 y estado declarado; referencias resueltas y ningún `$ref` con hermanos; objetos cerrados.
- **Operaciones:** rutas y métodos exactos, sin `PUT`, `PATCH` ni `DELETE`; bearer; `x-roles` por operación, que es una anotación; 400, 401, 403, 404 y 409 `POLICY_PENDING` en todas.
- **Errores y privacidad:** los códigos de error; ningún campo de aportes ni de aprobación, en esquemas y parámetros.
- **Perfiles:** los de lectura no alcanzan la serie, y el del Agricultor no lleva naive ni cobertura.
- **Copia descargada:** con sus campos obligatorios.
- **Coherencia:** enums iguales a los del esquema Prisma y códigos cerrados iguales a los de la migración; ninguna columna de vigencia ni de aprobación.
- **Estado de la implementación:** **ninguna ruta `/api/v1/estimation` en `openapi-f02.json`**, que se genera desde el código.

**Salida** sobre `acc04fa`, con la base migrada desechable:

```text
npm run openapi:check                                              → exit 0
OpenAPI snapshots match generated documents.
F02 OpenAPI contract assertions passed.
F05 Sync v1 OpenAPI contract assertions passed.
F06 collective OpenAPI contract assertions passed.
F08 backups OpenAPI contract assertions passed.
openapi-f12-estimation: 4 rutas, 29 esquemas, 29 referenciados; especificado, no implementado
```

**El script falla de verdad.** Se probaron 13 alteraciones de una copia de la especificación, restaurada después. Todas salen con `exit=1` y un mensaje identificable:

| Alteración | Mensaje |
|---|---|
| `DELETE` en una ejecución | `/api/v1/estimation/runs/{runId}: métodos` |
| Campo `approved_by` en el perfil del Agricultor | `schemas.FarmerResult: campo prohibido approved_by` |
| Objeto abierto (`Coverage`) | `#.components.schemas.Coverage: objeto abierto` |
| `naive_base` en el perfil del Agricultor | `FarmerResults: naive_base no es del Agricultor` |
| Puntos de la serie en el perfil del Agricultor | `FarmerResults no debe alcanzar SeriesPoint` |
| `kind` distinto del enum de Prisma | `Expected values to be strictly deep-equal` |
| AGRICULTOR en los roles de generación | `POST /api/v1/estimation/runs: roles` |
| `may_be_outdated` no fijo | `Expected values to be strictly deep-equal` |
| Referencia sin resolver | `… referencia sin resolver #/components/schemas/NoExiste` |
| `nullable` junto a `$ref` | `… $ref con hermanos ignorados` |
| Motivo fuera de la lista de la migración | `Expected values to be strictly deep-equal` |
| Consulta sin 409 | `GET /api/v1/estimation/results: falta 409` |
| Parámetro `member_id` | `/api/v1/estimation/runs: parámetro prohibido member_id` |

## 3. Migración: coincidencia con Prisma y aditividad

**Coincidencia con Prisma.** Se comprobó con una base sombra desechable:

```text
prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url <desechable> --exit-code                    → exit 0, «No difference detected.»
prisma validate                                                     → «The schema at prisma\schema.prisma is valid»
prisma migrate deploy (base vacía)                                  → «14 migrations found», todas aplicadas
```

El índice parcial `EstimationRun_one_root_per_target` es solo de SQL, como el precedente `ProductCanonicalAssociation_one_active_per_product`, y Prisma no lo modela.

**Suite `f12-est-01-estimation-schema.postgres.spec.ts`:** 9 de 9.
1. Crea una base nueva con las **13 migraciones anteriores**.
2. Siembra datos sintéticos: dos sindicatos, roles, campañas, productos, una asociación canónica, consumos publicados y una fila de `DemandForecast`.
3. Aplica la migración nueva.

| Prueba | Qué demuestra |
|---|---|
| Aditiva | Las filas de campañas, productos, asociaciones, contribuciones, divulgaciones y `DemandForecast` son idénticas. **Columnas, restricciones, índices y disparadores de todas las tablas previas** son idénticos (`information_schema`, `pg_constraint`, `pg_indexes` y `pg_trigger`) |
| Sin vigencia ni aprobación | Las cuatro tablas existen y ninguna columna contiene `validity`, `vigenc`, `approv` ni `aprob` |
| RN-26 | Cero comprobado, ausencia y dato oculto quedan distinguidos. Se rechazan: ausencia u oculto con cantidad o divulgación; comprobado sin cantidad o sin divulgación; negativo; cobertura N > M; cifra distinta de la divulgada vigente; campaña de otro sindicato; producto no canónico |
| Sellado | Un punto con sellado exige la entrada `DISCLOSED` visible de ese sellado. Se rechazan otra divulgación y el sellado de otra campaña |
| Versiones de serie | Escritura una vez; puntos solo en su transacción; v2 sin anterior, salto v1→v3 u otro ámbito rechazados; un solo sucesor |
| Solicitante | AGRICULTOR, Member de otro sindicato, Member inactivo, campaña ajena, h ≠ 1, `FAILED` sin código o con código ajeno y `POLICY_PENDING` rechazados; DIRECTIVA y ADMINISTRADOR aceptados |
| RN-28 | Cifras, ajuste y métricas solo en `ESTIMATED`; motivo de la lista cerrada; tramo de al menos 3; ejecución `FAILED` sin cifras; serie del mismo ámbito; producto canónico; sin resultados posteriores a la ejecución |
| Cadena | Una raíz por campaña objetivo, un sucesor por ejecución, ningún antecesor posterior ni de otra campaña, `requestId` único |
| Inmutabilidad | UPDATE, DELETE y TRUNCATE rechazados en las cuatro tablas («… es inmutable»); los datos siguen intactos |

**Límite.** La base solo comprueba la aritmética del tramo, no que sus posiciones sean comprobadas, contiguas y finales. Eso es de F12-EST-03 (contrato §6.2).

## 4. Pruebas existentes afectadas y regresión

**Dos pruebas cambian:**
- `sync-v1-journal.postgres.spec.ts` pasa de 13 a 14 migraciones.
- `f07-collective-seal.postgres.spec.ts` construye su base previa **sin** las migraciones posteriores al sellado. La nueva referencia a `CollectiveSeal` y habría fallado en una base sin esa tabla.

**El flujo `backend-f02.yml`** ejecuta la suite nueva con su propia base.

**Suites de PostgreSQL ejecutadas sobre `acc04fa`**, con una base migrada nueva:

```text
f12-est-01-estimation-schema        9 passed
sync-v1-journal                    30 passed
f07-collective-seal                20 passed
f06-coll-05-collective-aggregate   16 passed
backups                            68 passed
f10-sec-02-legacy-boundary         29 passed
f10-sec-02-disclosure-gaps          2 passed
product-reconciliation              5 passed
sync-v1-adversarial                41 passed
sync-v1-references                  7 passed
f81-phase6-legacy-writes            7 passed
```

**Resto de comprobaciones:**

```text
npm run build                                                         → exit 0
npm test -- --runInBand          → 41 suites passed, 23 skipped; 420 passed, 305 skipped (PostgreSQL sin URL)
npx eslint (las tres suites tocadas)                                  → sin hallazgos
```

**Prettier.** No se aplicó a la suite nueva: las suites vecinas (`f07-collective-seal`, `f06-coll-05` y `sync-v1-test-app`) tampoco lo cumplen en `main`, y la CI no lo exige.

## 5. Revisión

Otro agente de esta misma sesión hizo una lectura de contraste **antes del primer commit**; no es una revisión independiente.

**Encontró cinco bloqueantes**, corregidos en `acc04fa`:
1. El Agricultor habría recibido `naive_base`, que es la última cifra publicada.
2. La política vigente no se aplicaba al leer.
3. La selección de la consulta contradecía la vigencia, porque una `FAILED` posterior ocultaba un resultado vigente.
4. `UNIT_NOT_LINKABLE` no cabía en la clave primaria.
5. El CHECK de las cifras era más débil que el texto.

**Menores corregidos:**
- una sola raíz por campaña objetivo;
- la cifra del punto igual a la divulgada vigente;
- la entrada sellada;
- el Member activo y el producto canónico;
- los códigos cerrados;
- `TRUNCATE`;
- `requestHash` para la idempotencia;
- `$ref` anulables con `allOf`;
- los textos de 401 y 403;
- el código `POLICY_PENDING`, igual al existente;
- el prefijo `EST-D`;
- aserciones con el nombre de la restricción;
- la comprobación completa de aditividad;
- pruebas de sellado, de otro sindicato, de Member inactivo, de antecesor posterior y de salto de versión.

**Menores declarados, sin cambio** (están en el contrato):
- el sellado no se exige en todo consumo comprobado (EST-D-03);
- la cobertura no se exige punto a punto (EST-D-09);
- la semántica del tramo es de F12-EST-03;
- `x-roles` es una anotación;
- el permiso fino de estimación (EST-D-13).

## 6. Límites

- Solo HOST, con datos sintéticos.
- **El contrato no está implementado.** Nada de §1 «no construido» se prueba aquí.
- **Discrepancia con el alcance del repositorio.** `CURRENT_SCOPE.md` §11 y los `AGENTS.md` siguen excluyendo el «forecasting» (EST-D-01). Este bloque no los modifica.
- La base PostgreSQL usada es desechable y se elimina al terminar.
