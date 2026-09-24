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
const clientResponse = spec.paths["/api/v1/auth/clients"].post.responses["201"].content["application/json"].schema;
assert.ok(v1Response.properties.accessToken);
assert.ok(v1Response.properties.user);
assert.deepEqual(v2Response.properties.contractVersion.enum, [2]);
assert.ok(v2Response.properties.context.properties.member);
assert.ok(v2Response.properties.context.properties.session);
assert.ok(v2Response.properties.refreshToken);
assert.ok(clientResponse.properties.registrationId);
for (const response of [v1Response, v2Response, clientResponse]) {
  const serialized = JSON.stringify(response);
  for (const secret of ["passwordHash", "clientIdHash", "rawRefreshToken"]) {
    assert.ok(!serialized.includes(secret), `${secret} must not appear in public response`);
  }
}
assert.ok(spec.info.description.includes("legacy"));
process.stdout.write("F02 OpenAPI contract assertions passed.\n");
