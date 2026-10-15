const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const spec = JSON.parse(readFileSync(resolve(__dirname, "../../docs/api/openapi-f02.json"), "utf8"));
const required = {
  "/api/v1/auth/login": ["post", "200", "401"],
  "/api/v1/auth/refresh": ["post", "200", "401"],
  "/api/v1/auth/logout": ["post", "204", "401"],
  "/api/v1/auth/me": ["get", "200", "401"],
  "/api/v1/auth/v2/login": ["post", "200", "401"],
  "/api/v1/auth/v2/refresh": ["post", "200", "400", "401"],
  "/api/v1/auth/v2/logout": ["post", "204"],
  "/api/v1/auth/v2/me": ["get", "200", "401"],
  "/api/v1/auth/v2/session/client": ["post", "201", "401", "404", "409"],
  "/api/v1/auth/clients": ["post", "201", "400", "401", "409"],
  "/api/v1/auth/clients/{id}/revoke": ["post", "201", "400", "401", "404"],
};

for (const [path, [method, ...statuses]] of Object.entries(required)) {
  const operation = spec.paths[path]?.[method];
  assert.ok(operation, `Missing ${method.toUpperCase()} ${path}`);
  for (const status of statuses) {
    assert.ok(operation.responses[status], `Missing ${status} on ${path}`);
  }
}
const schemes = spec.components.securitySchemes;
assert.equal(schemes.bearer.type, "http");
assert.equal(schemes.refresh_token.name, "refresh_token");
assert.equal(schemes.refresh_token_v2.name, "refresh_token_v2");
for (const path of ["/api/v1/auth/login", "/api/v1/auth/v2/login"]) {
  assert.deepEqual(spec.paths[path].post.security ?? [], [], `${path} must be public`);
}
for (const path of ["/api/v1/auth/me", "/api/v1/auth/v2/me", "/api/v1/auth/clients"]) {
  const operation = spec.paths[path].get;
  assert.ok(operation.security?.some((security) => "bearer" in security), `${path} requires bearer`);
}
assert.deepEqual(spec.paths["/api/v1/auth/logout"].post.security, [{ bearer: [] }]);
for (const path of ["/api/v1/auth/v2/refresh", "/api/v1/auth/v2/logout"]) {
  assert.deepEqual(spec.paths[path].post.security, [{ refresh_token_v2: [] }, {}]);
}
assert.ok(spec.paths["/api/v1/auth/v2/login"].post.requestBody);
assert.ok(spec.paths["/api/v1/auth/v2/refresh"].post.requestBody);
assert.ok(spec.paths["/api/v1/auth/clients"].post.requestBody);
const v1Response = spec.paths["/api/v1/auth/login"].post.responses["200"].content["application/json"].schema;
const v2Response = spec.paths["/api/v1/auth/v2/login"].post.responses["200"].content["application/json"].schema;
const v2MeResponse = spec.paths["/api/v1/auth/v2/me"].get.responses["200"].content["application/json"].schema;
const bindResponse = spec.paths["/api/v1/auth/v2/session/client"].post.responses["201"].content["application/json"].schema;
const clientResponse = spec.paths["/api/v1/auth/clients"].post.responses["201"].content["application/json"].schema;
assert.ok(v1Response.properties.accessToken);
assert.ok(v1Response.properties.user);
assert.deepEqual(v1Response.properties.user.properties.tenant.required, ["id", "name", "slug"]);
assert.deepEqual(v2Response.properties.contractVersion.enum, [2]);
assert.deepEqual(v2MeResponse.required, ["account", "member", "tenant", "role", "session"]);
assert.deepEqual(v2MeResponse.properties.account.required, ["id", "name", "email", "isActive"]);
assert.deepEqual(v2MeResponse.properties.member.required, ["id", "role", "isActive"]);
assert.deepEqual(v2MeResponse.properties.tenant.required, ["id", "name", "slug", "isActive"]);
assert.deepEqual(v2MeResponse.properties.session.required, ["id", "status", "refreshTransport", "createdAt", "lastSeenAt", "expiresAt", "clientRegistrationId"]);
assert.equal(v2MeResponse.properties.session.properties.clientRegistrationId.nullable, true);
assert.deepEqual(v2MeResponse.properties.session.properties.status.enum, ["ACTIVE"]);
assert.deepEqual(v2Response.properties.context, v2MeResponse);
assert.deepEqual(spec.paths["/api/v1/auth/v2/refresh"].post.responses["200"].content["application/json"].schema.properties.context, v2MeResponse);
assert.ok(v2Response.properties.refreshToken);
assert.deepEqual(bindResponse.required, ["registrationId", "status"]);
assert.equal(bindResponse.properties.registrationId.format, "uuid");
assert.deepEqual(bindResponse.properties.status.enum, ["ACTIVE"]);
assert.ok(clientResponse.properties.registrationId);
for (const path of ["/api/v1/auth/v2/refresh", "/api/v1/auth/v2/logout"]) {
  assert.equal(spec.paths[path].post.requestBody.required, false, `${path} body is optional`);
}
for (const response of [v1Response, v2Response, v2MeResponse, bindResponse, clientResponse]) {
  const serialized = JSON.stringify(response);
  for (const secret of ["passwordHash", "clientIdHash", "rawRefreshToken"]) {
    assert.ok(!serialized.includes(secret), `${secret} must not appear in public response`);
  }
}
assert.ok(spec.info.description.includes("legacy"));
process.stdout.write("F02 OpenAPI contract assertions passed.\n");

// F05 Sync Contract v1 (#17, #106): routes, statuses, bearer and closed shapes.
const f05 = JSON.parse(readFileSync(resolve(__dirname, "../../docs/api/openapi-f05-sync-v1.json"), "utf8"));
const f05Required = {
  "/api/v1/sync/v1/push": ["post", "200", "400", "401", "403", "413", "415", "422", "429", "503"],
  "/api/v1/sync/v1/operations/{operationId}": ["get", "200", "400", "401", "403", "404", "422", "429"],
  "/api/v1/sync/v1/references": ["get", "200", "401", "403", "429"],
};
assert.deepEqual(Object.keys(f05.paths).sort(), Object.keys(f05Required).sort());
for (const [path, [method, ...statuses]] of Object.entries(f05Required)) {
  const operation = f05.paths[path]?.[method];
  assert.ok(operation, `Missing ${method.toUpperCase()} ${path}`);
  assert.deepEqual(spec.paths[path][method], operation, `${path} differs from the main snapshot`);
  assert.ok(operation.security?.some((security) => "bearer" in security), `${path} requires bearer`);
  for (const status of statuses) assert.ok(operation.responses[status], `Missing ${status} on ${path}`);
}
const ack = f05.paths["/api/v1/sync/v1/push"].post.responses["200"].content["application/json"].schema;
assert.deepEqual(ack.required, ["contractVersion", "operationId", "outcome", "disposition", "serverAcceptedAt", "code", "reconciliationReference"]);
assert.equal(ack.additionalProperties, false);
const error = f05.paths["/api/v1/sync/v1/push"].post.responses["400"].content["application/json"].schema;
assert.deepEqual(error.required, ["contractVersion", "operationId", "errorCode", "disposition"]);
const envelope = f05.paths["/api/v1/sync/v1/push"].post.requestBody.content["application/json"].schema;
assert.equal(envelope.additionalProperties, false);
assert.deepEqual(envelope.required, ["contractVersion", "operationId", "projectionType", "action", "causal", "payload"]);
const references = f05.paths["/api/v1/sync/v1/references"].get.responses["200"].content["application/json"].schema;
assert.equal(references.additionalProperties, false);
assert.deepEqual(references.required, ["contractVersion", "campaigns", "products"]);
const campaign = references.properties.campaigns.items;
assert.equal(campaign.additionalProperties, false);
assert.deepEqual(campaign.required, ["campaign_ref", "name", "status", "start_date", "end_date", "accepts_contributions"]);
assert.deepEqual(Object.keys(campaign.properties).sort(), [...campaign.required].sort());
const product = references.properties.products.items;
assert.equal(product.additionalProperties, false);
assert.deepEqual(product.required, ["product_ref", "name", "unit", "base_unit", "is_active", "linkable"]);
assert.deepEqual(Object.keys(product.properties).sort(), [...product.required].sort());
process.stdout.write("F05 Sync v1 OpenAPI contract assertions passed.\n");
