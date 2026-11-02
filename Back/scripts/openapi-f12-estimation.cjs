// F12-EST-01 (#174): comprueba la especificación INT-09 v1
// (docs/api/openapi-f12-estimation.json), que se escribe a mano porque las
// rutas todavía no existen. `openapi.cjs --check` sólo compara los archivos
// generados desde el código: sin este script, un archivo nuevo en docs/api/
// no se leería. Esto valida la ESPECIFICACIÓN y su coherencia con el esquema
// y la migración, no un comportamiento: ningún rechazo HTTP queda probado
// aquí, y `x-roles` es una anotación (no hay @Roles todavía que contrastar).
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

// 1. Documento y estado declarado.
assert.equal(spec.openapi, "3.0.3");
assert.equal(spec.info["x-contract-version"], 1);
assert.equal(spec.info["x-implementation-status"], "SPECIFIED_NOT_IMPLEMENTED");
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

// 3. Rutas, métodos y roles exactos. Ninguna operación de modificación.
const expected = {
  "/api/v1/estimation/runs": { post: ["DIRECTIVA", "ADMINISTRADOR"], get: ["DIRECTIVA", "ADMINISTRADOR"] },
  "/api/v1/estimation/runs/{runId}": { get: ["DIRECTIVA", "ADMINISTRADOR"] },
  "/api/v1/estimation/results": { get: ["AGRICULTOR", "DIRECTIVA", "ADMINISTRADOR"] },
  "/api/v1/estimation/download": { get: ["AGRICULTOR", "DIRECTIVA", "ADMINISTRADOR"] },
};
assert.deepEqual(Object.keys(spec.paths).sort(), Object.keys(expected).sort());
const operationIds = new Set();
for (const [path, methods] of Object.entries(spec.paths)) {
  assert.deepEqual(Object.keys(methods).sort(), Object.keys(expected[path]).sort(), `${path}: métodos`);
  for (const forbidden of ["put", "patch", "delete"]) assert.ok(!(forbidden in methods), `${path}: ${forbidden} no admitido`);
  for (const [method, operation] of Object.entries(methods)) {
    const where = `${method.toUpperCase()} ${path}`;
    assert.ok(operation.operationId && !operationIds.has(operation.operationId), `${where}: operationId`);
    operationIds.add(operation.operationId);
    assert.deepEqual(operation.security, [{ bearer: [] }], `${where}: bearer`);
    assert.deepEqual(operation["x-roles"], expected[path][method], `${where}: roles`);
    for (const status of ["400", "401", "403", "404", "409"]) assert.ok(operation.responses[status], `${where}: falta ${status}`);
    // La política de divulgación vigente se aplica también al consultar.
    assert.match(operation.responses["409"].description, /POLICY_PENDING/, `${where}: 409 sin POLICY_PENDING`);
  }
}
const generate = spec.paths["/api/v1/estimation/runs"].post;
for (const status of ["200", "201", "422"]) assert.ok(generate.responses[status], `POST runs: falta ${status}`);
assert.equal(generate.requestBody.content["application/json"].schema.$ref, "#/components/schemas/GenerateRequest");
assert.match(generate.responses["403"].description, /No tienes permisos para esta acción/);
assert.match(generate.responses["403"].description, /No se ejecuta ni se registra/);
assert.deepEqual(schemas.GenerateRequest.required, ["contract_version", "request_id", "target_campaign_ref"]);
assert.deepEqual(schemas.ErrorCode.enum.slice().sort(), [
  "POLICY_PENDING", "PRODUCT_NOT_ESTIMABLE", "PRODUCT_NOT_FOUND", "REQUEST_ID_REUSED", "RUN_NOT_FOUND",
  "RUN_SUCCESSION_CONFLICT", "TARGET_CAMPAIGN_NOT_ELIGIBLE", "TARGET_CAMPAIGN_NOT_FOUND",
]);

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
const checkList = (column) => {
  const match = migration.match(new RegExp(`"${column}" IN \\(([^)]*)\\)`));
  assert.ok(match, `Migración: falta la lista cerrada de ${column}`);
  return match[1].split(",").map((item) => item.trim().replace(/^'|'$/g, ""));
};
assert.deepEqual(enumOf(schemas.ResultDetail.properties.reason_code), checkList("reasonCode"));
assert.deepEqual(enumOf(schemas.RunSummary.properties.failure_code), checkList("failureCode"));
const validity = ["NOT_USABLE", "SUPERSEDED", "OUTDATED", "CURRENT"];
for (const [schema, key] of [["ResultDetail", "validity"], ["InstitutionalResult", "validity"], ["FarmerResult", "validity"], ["InstitutionalDownloadedResult", "validity_at_download"], ["FarmerDownloadedResult", "validity_at_download"]]) {
  assert.deepEqual(schemas[schema].properties[key].enum, validity, `${schema}.${key}`);
}
for (const model of ["ConsumptionSeries", "SeriesPoint", "EstimationRun", "EstimationResult"]) {
  const block = prisma.match(new RegExp(`model ${model} \\{([^}]*)\\}`));
  assert.ok(block, `Prisma: falta model ${model}`);
  const fields = block[1].split("\n").map((line) => line.trim().split(/\s+/)[0]).filter((name) => /^[a-z]/.test(name ?? ""));
  for (const field of fields) assert.ok(!/validity|vigencia|approv/i.test(field), `${model}.${field}: no se almacena`);
}

// 8. Especificado, no implementado: el documento generado desde el código no
// tiene rutas de estimación. Al implementarlas, este bloque debe cambiar.
// Depende de que `openapi.cjs --check` haya pasado antes (orden de openapi:check).
const implemented = Object.keys(generated.paths).filter((path) => path.startsWith("/api/v1/estimation"));
assert.deepEqual(implemented, [], "Hay rutas de estimación implementadas: actualizar F12 y este script");

process.stdout.write(`openapi-f12-estimation: ${Object.keys(spec.paths).length} rutas, ${Object.keys(schemas).length} esquemas, ${refs.size} referenciados; especificado, no implementado\n`);
