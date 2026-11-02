// F12-EST-01 (#174): comprueba la especificación INT-09 v1
// (docs/api/openapi-f12-estimation.json), que se escribe a mano porque las
// rutas todavía no existen. `openapi.cjs --check` sólo compara los archivos
// generados desde el código: sin este script, un archivo nuevo en docs/api/
// no se leería. Esto valida la ESPECIFICACIÓN y su coherencia con el esquema
// y la migración, no un comportamiento: ningún rechazo HTTP queda probado
// aquí, y `x-roles` es una anotación (no hay @Roles todavía que contrastar).
// El bloque 8 es una comprobación de ESTA ETAPA (especificado, no
// implementado), no una prohibición de implementar INT-09: F12-EST-05 la
// sustituye por la comparación con el OpenAPI generado desde el código.
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { resolve } = require("node:path");

const read = (path) => readFileSync(resolve(__dirname, path), "utf8");
const spec = JSON.parse(read("../../docs/api/openapi-f12-estimation.json"));
const generated = JSON.parse(read("../../docs/api/openapi-f02.json"));
const prisma = read("../prisma/schema.prisma");
const migrationDir = readdirSync(resolve(__dirname, "../prisma/migrations")).find((name) => name.endsWith("_f12_est_01_estimation"));
assert.ok(migrationDir, "Falta la migración f12_est_01_estimation");
const migration = read(`../prisma/migrations/${migrationDir}/migration.sql`);
const schemas = spec.components.schemas;
/** El enum de un esquema, también anulable. */
const enumOfNullable = (schema) => schema.enum ?? schema.allOf?.[0]?.enum;

// 1. Documento y estado declarado.
assert.equal(spec.openapi, "3.0.3");
assert.equal(spec.info["x-contract-version"], 1);
assert.deepEqual(spec.components.securitySchemes.bearer, { type: "http", scheme: "bearer", bearerFormat: "JWT" });

// 2. Toda referencia resuelve; ningún $ref lleva hermanos (OAS 3.0.3 los
// ignora: un $ref anulable va en allOf); todo objeto con propiedades es
// cerrado y sus obligatorios existen.
const refs = new Set();
const walk = (node, at) => {
  if (Array.isArray(node)) return node.forEach((child, i) => walk(child, `${at}[${i}]`));
  if (!node || typeof node !== "object") return;
  if (node.$ref) {
    const name = node.$ref.replace("#/components/schemas/", "");
    assert.ok(schemas[name], `${at}: referencia sin resolver ${node.$ref}`);
    assert.deepEqual(Object.keys(node), ["$ref"], `${at}: $ref con hermanos ignorados`);
    refs.add(name);
  }
  if (node.type === "object" && node.properties) {
    assert.equal(node.additionalProperties, false, `${at}: objeto abierto`);
    for (const key of node.required ?? []) assert.ok(key in node.properties, `${at}: obligatorio inexistente ${key}`);
  }
  for (const [key, child] of Object.entries(node)) walk(child, `${at}.${key}`);
};
walk(spec, "#");

// 3. Rutas, métodos, roles y respuestas exactos. Ninguna operación de
// modificación. Las operaciones que calculan o entregan cifras responden 409
// POLICY_PENDING: la política vigente se aplica también al consultar.
const DIR = ["DIRECTIVA", "ADMINISTRADOR"];
const ALL = ["AGRICULTOR", "DIRECTIVA", "ADMINISTRADOR"];
const op = (roles, statuses, figures = false) => ({ roles, statuses, figures });
const expected = {
  "/api/v1/estimation/jobs": { post: op(DIR, ["200", "202", "400", "401", "403", "404", "409", "422"], true) },
  "/api/v1/estimation/jobs/{jobId}": { get: op(DIR, ["200", "400", "401", "403", "404"]) },
  "/api/v1/estimation/seasons": { post: op(DIR, ["201", "400", "401", "403", "409"]), get: op(DIR, ["200", "401", "403"]) },
  "/api/v1/estimation/campaign-classifications": {
    post: op(DIR, ["201", "400", "401", "403", "404", "409"]),
    get: op(DIR, ["200", "400", "401", "403", "404"]),
  },
  "/api/v1/estimation/campaign-classifications/{campaignId}/corrections": { post: op(DIR, ["201", "400", "401", "403", "404", "409", "422"]) },
  "/api/v1/estimation/campaign-classifications/{campaignId}/history": { get: op(DIR, ["200", "400", "401", "403", "404"]) },
  "/api/v1/estimation/runs": { get: op(DIR, ["200", "400", "401", "403", "404", "409"], true) },
  "/api/v1/estimation/runs/{runId}": { get: op(DIR, ["200", "400", "401", "403", "404", "409"], true) },
  "/api/v1/estimation/results": { get: op(ALL, ["200", "400", "401", "403", "404", "409"], true) },
  "/api/v1/estimation/download": { get: op(ALL, ["200", "400", "401", "403", "404", "409"], true) },
};
assert.deepEqual(Object.keys(spec.paths).sort(), Object.keys(expected).sort());
const operationIds = new Set();
for (const [path, methods] of Object.entries(spec.paths)) {
  assert.deepEqual(Object.keys(methods).sort(), Object.keys(expected[path]).sort(), `${path}: métodos`);
  for (const forbidden of ["put", "patch", "delete"]) assert.ok(!(forbidden in methods), `${path}: ${forbidden} no admitido`);
  for (const [method, operation] of Object.entries(methods)) {
    const where = `${method.toUpperCase()} ${path}`;
    const want = expected[path][method];
    assert.ok(operation.operationId && !operationIds.has(operation.operationId), `${where}: operationId`);
    operationIds.add(operation.operationId);
    assert.deepEqual(operation.security, [{ bearer: [] }], `${where}: bearer`);
    assert.deepEqual(operation["x-roles"], want.roles, `${where}: roles`);
    assert.deepEqual(Object.keys(operation.responses).sort(), want.statuses.slice().sort(), `${where}: respuestas`);
    if (want.figures) assert.match(operation.responses["409"].description, /POLICY_PENDING/, `${where}: 409 sin POLICY_PENDING`);
  }
}
// EST-D-04: pedir una estimación encola un trabajo (202); no calcula en la petición.
const generate = spec.paths["/api/v1/estimation/jobs"].post;
assert.equal(generate.requestBody.content["application/json"].schema.$ref, "#/components/schemas/GenerateRequest");
for (const status of ["200", "202"]) assert.equal(generate.responses[status].content["application/json"].schema.$ref, "#/components/schemas/Job");
assert.match(generate.responses["403"].description, /No tienes permisos para esta acción/);
assert.match(generate.responses["403"].description, /No se ejecuta ni se registra/);
assert.match(generate.responses["422"].description, /TARGET_CAMPAIGN_NOT_CLASSIFIED/);
assert.deepEqual(schemas.GenerateRequest.required, ["contract_version", "request_id", "target_campaign_ref"]);
assert.deepEqual(schemas.ErrorCode.enum.slice().sort(), [
  "CAMPAIGN_ALREADY_CLASSIFIED", "CAMPAIGN_NOT_FOUND", "CLASSIFICATION_NOT_FOUND", "CLASSIFICATION_STALE", "CLASSIFICATION_UNCHANGED",
  "JOB_NOT_FOUND", "POLICY_PENDING", "PRODUCT_NOT_ESTIMABLE",
  "PRODUCT_NOT_FOUND", "REQUEST_ID_REUSED", "RUN_NOT_FOUND", "SEASON_KEY_TAKEN", "SEASON_NOT_FOUND",
  "TARGET_CAMPAIGN_NOT_CLASSIFIED", "TARGET_CAMPAIGN_NOT_ELIGIBLE", "TARGET_CAMPAIGN_NOT_FOUND",
]);
// EST-D-02: una temporada es explícita (clave, definición y duración) y
// las ejecuciones la identifican; ninguna operación la modifica.
assert.deepEqual(schemas.SeasonCreateRequest.required, ["contract_version", "key", "definition", "duration_days"]);
assert.deepEqual(schemas.SeasonRef.required, ["season_ref", "key", "definition", "duration_days"]);
for (const name of ["RunSummary", "Run"]) assert.equal(schemas[name].properties.season.$ref, "#/components/schemas/SeasonRef", `${name}.season`);
// EST-D-14: una corrección es una versión nueva con motivo; ejecuciones y
// puntos citan la versión que usaron.
assert.deepEqual(schemas.ClassificationCorrectionRequest.required, ["contract_version", "previous_classification_ref", "season_ref", "reason"]);
for (const key of ["classification_ref", "version", "previous_classification_ref", "reason", "current"]) assert.ok(key in schemas.Classification.properties, `Classification.${key}`);
for (const name of ["RunSummary", "Run"]) assert.ok("target_classification_ref" in schemas[name].properties, `${name}.target_classification_ref`);
assert.ok("classification_ref" in schemas.SeriesPoint.properties, "SeriesPoint.classification_ref");
// EST-D-09: la cobertura es la que registró el sellado (IDENTIFIED con N y M,
// o UNKNOWN con su motivo), mide participación y no se compara con ningún mínimo.
assert.deepEqual(schemas.Coverage.properties.status.enum, ["IDENTIFIED", "UNKNOWN"]);
assert.deepEqual(enumOfNullable(schemas.Coverage.properties.unknown_reason), ["SEALED_BEFORE_COVERAGE", "POPULATION_MISMATCH", "NOT_SEALED"]);
assert.deepEqual(schemas.Coverage.properties.measures.enum, ["PARTICIPATION_NOT_COMPLETENESS"]);
for (const name of ["Coverage", "SpanCoverage", "CampaignCoverage"]) {
  for (const key of Object.keys(schemas[name].properties)) assert.ok(!/percent|ratio|minimum|threshold|share/i.test(key), `${name}.${key}: sin mínimo ni porcentaje`);
}
assert.equal(schemas.InstitutionalResult.properties.coverage.$ref, "#/components/schemas/SpanCoverage");
// EST-D-15 y 16: una parada lleva lo observado; los intentos tienen máximo.
assert.ok(schemas.Job.properties.stop_evidence, "Job.stop_evidence");
assert.equal(schemas.Job.properties.stop_evidence.allOf?.[0]?.$ref, "#/components/schemas/StopEvidence");
assert.ok("max_attempts" in schemas.Job.properties, "Job.max_attempts");
// Retención: la del período académico, con la institucional pendiente en GOV-02.
assert.match(spec.info["x-retention"] ?? "", /GOV-02/);
assert.match(spec.info["x-retention"] ?? "", /no hay una conservación perpetua aprobada/);
// EST-D-05: el perfil del Agricultor declara la exigencia de política institucional.
for (const route of ["/api/v1/estimation/results", "/api/v1/estimation/download"]) {
  assert.match(spec.paths[route].get["x-policy-requirement"] ?? "", /política\s+institucional/, `${route}: exigencia de política`);
}

// 4. Sin aportes individuales, identificadores de tenant del cliente ni
// aprobación manual, en esquemas y en parámetros. `member_ref` sólo
// identifica a quien descarga.
const forbiddenNames = /^(memberId|member_id|user_id|userId|tenantId|tenant_id|contributors?|contributor_count|contributorCount|quantity_by_member)$|approv/i;
const scan = (node, at, owner) => {
  if (Array.isArray(node)) return node.forEach((child, i) => scan(child, `${at}[${i}]`, owner));
  if (!node || typeof node !== "object") return;
  if (node.properties) {
    for (const name of Object.keys(node.properties)) {
      assert.ok(!forbiddenNames.test(name), `${at}: campo prohibido ${name}`);
      if (name === "member_ref") assert.equal(owner, "Subject", `${at}: member_ref fuera de Subject`);
    }
  }
  for (const [key, child] of Object.entries(node)) scan(child, `${at}.${key}`, owner);
};
for (const [name, schema] of Object.entries(schemas)) scan(schema, `schemas.${name}`, name);
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const operation of Object.values(methods)) {
    for (const parameter of operation.parameters ?? []) assert.ok(!forbiddenNames.test(parameter.name), `${path}: parámetro prohibido ${parameter.name}`);
  }
}

// 5. Perfiles. El del Agricultor no alcanza la serie, el tramo, la línea base
// naive (última cifra publicada) ni la cobertura; ningún perfil de consulta
// o copia alcanza la serie.
const reachable = (start) => {
  const seen = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.$ref) {
      const name = node.$ref.replace("#/components/schemas/", "");
      if (!seen.has(name)) { seen.add(name); visit(schemas[name]); }
    }
    Object.values(node).forEach(visit);
  };
  visit(schemas[start]);
  return seen;
};
const propertyNames = (names) => new Set([...names].flatMap((name) => Object.keys(schemas[name].properties ?? {})));
for (const start of ["InstitutionalResults", "FarmerResults", "InstitutionalDownload", "FarmerDownload"]) {
  const seen = reachable(start);
  for (const hidden of ["SeriesPoint", "Span", "SeriesRef", "ResultDetail", "Run"]) assert.ok(!seen.has(hidden), `${start} no debe alcanzar ${hidden}`);
}
for (const start of ["FarmerResults", "FarmerDownload"]) {
  const seen = reachable(start);
  seen.add(start);
  assert.ok(!seen.has("Coverage"), `${start} no debe alcanzar Coverage`);
  const names = propertyNames(seen);
  for (const hidden of ["naive_base", "coverage", "points", "span", "fit_criterion", "alpha"]) assert.ok(!names.has(hidden), `${start}: ${hidden} no es del Agricultor`);
}
for (const [route, a, b] of [["/api/v1/estimation/results", "InstitutionalResults", "FarmerResults"], ["/api/v1/estimation/download", "InstitutionalDownload", "FarmerDownload"]]) {
  const schema = spec.paths[route].get.responses["200"].content["application/json"].schema;
  assert.deepEqual(schema.oneOf, [{ $ref: `#/components/schemas/${a}` }, { $ref: `#/components/schemas/${b}` }], `${route}: perfiles`);
  assert.equal(schema.discriminator.propertyName, "profile");
}

// 6. Copia descargada (DAT-20, RN-30), en los dos perfiles.
for (const download of ["InstitutionalDownload", "FarmerDownload"]) {
  for (const key of ["scope", "subject", "downloaded_at", "target", "results", "may_be_outdated", "notice", "storage", "profile"]) {
    assert.ok(schemas[download].required.includes(key), `${download}: falta ${key}`);
  }
  assert.deepEqual(schemas[download].properties.may_be_outdated.enum, [true]);
}
assert.deepEqual(schemas.Storage.properties.backup.enum, ["EXCLUDED_FROM_PRIVATE_BACKUP"]);
assert.equal(schemas.Notice.enum.length, 1);
for (const result of ["InstitutionalDownloadedResult", "FarmerDownloadedResult"]) {
  for (const key of ["generated_at", "validity_at_download", "run_ref", "status"]) assert.ok(schemas[result].required.includes(key), `${result}: falta ${key}`);
}

// 7. Coherencia con el esquema Prisma y con la migración: mismos estados,
// mismos códigos cerrados y ninguna columna de vigencia o aprobación.
const prismaEnum = (name) => {
  const block = prisma.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  assert.ok(block, `Prisma: falta enum ${name}`);
  return block[1].split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//"));
};
const enumOf = (schema) => schema.enum ?? schema.allOf?.[0]?.enum;
assert.deepEqual(schemas.SeriesPoint.properties.kind.enum, prismaEnum("SeriesPointKind"));
for (const name of ["ResultDetail", "InstitutionalResult", "FarmerResult", "InstitutionalDownloadedResult", "FarmerDownloadedResult"]) {
  assert.deepEqual(schemas[name].properties.status.enum, prismaEnum("EstimationResultStatus"), `${name}.status`);
}
for (const name of ["RunSummary", "Run"]) assert.deepEqual(schemas[name].properties.outcome.enum, prismaEnum("EstimationRunOutcome"), `${name}.outcome`);
assert.deepEqual(schemas.Job.properties.status.enum, prismaEnum("EstimationJobStatus"), "Job.status");
// La cobertura que guarda el sellado: IDENTIFIED se sirve igual; POPULATION_MISMATCH, como UNKNOWN con ese motivo.
assert.deepEqual(prismaEnum("ConsumptionCoverageStatus"), ["IDENTIFIED", "POPULATION_MISMATCH"]);
assert.ok(schemas.Coverage.properties.unknown_reason.enum.includes("POPULATION_MISMATCH"));
const checkList = (column) => {
  const match = migration.match(new RegExp(`"${column}" IN \\(([^)]*)\\)`));
  assert.ok(match, `Migración: falta la lista cerrada de ${column}`);
  return match[1].split(",").map((item) => item.trim().replace(/^'|'$/g, ""));
};
assert.deepEqual(enumOf(schemas.ResultDetail.properties.reason_code), checkList("reasonCode"));
assert.deepEqual(enumOf(schemas.RunSummary.properties.failure_code), checkList("failureCode"));
assert.deepEqual(enumOf(schemas.Job.properties.stop_code), checkList("stopCode"));
const validity = ["NOT_USABLE", "SUPERSEDED", "OUTDATED", "CURRENT"];
for (const [schema, key] of [["ResultDetail", "validity"], ["InstitutionalResult", "validity"], ["FarmerResult", "validity"], ["InstitutionalDownloadedResult", "validity_at_download"], ["FarmerDownloadedResult", "validity_at_download"]]) {
  assert.deepEqual(schemas[schema].properties[key].enum, validity, `${schema}.${key}`);
}
const models = ["ComparabilitySeason", "CampaignSeasonClassification", "ConsumptionSeries", "SeriesPoint", "EstimationJob", "EstimationRun", "EstimationResult"];
for (const model of models) {
  const block = prisma.match(new RegExp(`model ${model} \\{([^}]*)\\}`));
  assert.ok(block, `Prisma: falta model ${model}`);
  const fields = block[1].split("\n").map((line) => line.trim().split(/\s+/)[0]).filter((name) => /^[a-z]/.test(name ?? ""));
  for (const field of fields) assert.ok(!/validity|vigencia|approv/i.test(field), `${model}.${field}: no se almacena`);
  // EST-D-09: ninguna cobertura sin fuente verificable.
  for (const field of fields) assert.ok(!/coverage|cobertura/i.test(field), `${model}.${field}: cobertura sin fuente`);
}

// 8. Comprobación de esta etapa (F12-EST-01: especificado, no implementado),
// no una prohibición de implementar INT-09. Mientras la especificación se
// declare SPECIFIED_NOT_IMPLEMENTED, el documento generado desde el código no
// tiene rutas de estimación. F12-EST-05, al implementarlas, cambia el estado y
// sustituye este bloque por la comparación con el OpenAPI generado. Depende de
// que `openapi.cjs --check` haya pasado antes (orden de openapi:check).
const stage = spec.info["x-implementation-status"];
const implemented = Object.keys(generated.paths).filter((path) => path.startsWith("/api/v1/estimation"));
if (stage === "SPECIFIED_NOT_IMPLEMENTED") {
  assert.deepEqual(implemented, [], "Etapa F12-EST-01: hay rutas de estimación implementadas; al implementarlas, cambie x-implementation-status y esta comprobación");
} else {
  assert.fail(`Etapa ${stage}: F12-EST-05 debe sustituir esta comprobación por la comparación con el OpenAPI generado`);
}

process.stdout.write(`openapi-f12-estimation: ${Object.keys(spec.paths).length} rutas, ${Object.keys(schemas).length} esquemas, ${refs.size} referenciados; etapa ${stage}: especificado, no implementado\n`);
