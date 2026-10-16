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

// F06 collective summary (#21) and F07-REC-01 associations (#108): routes,
// statuses, bearer, closed shapes and no figures per Member.
const f06 = JSON.parse(readFileSync(resolve(__dirname, "../../docs/api/openapi-f06-collective.json"), "utf8"));
const f06Required = [
  ["/api/v1/collective/campaigns/{campaignId}/summary", "get", "200", "401", "403", "404"],
  ["/api/v1/collective/campaigns/{campaignId}/summary.csv", "get", "200", "401", "403", "404"],
  ["/api/v1/collective/product-associations", "get", "200", "401", "403"],
  ["/api/v1/collective/product-associations", "post", "200", "401", "403", "404", "409", "422"],
  ["/api/v1/collective/product-associations/{productId}/close", "post", "200", "401", "403", "404", "422"],
  // F07 #108 catalogue and #26/#27 draft joint purchase proposals.
  ["/api/v1/collective/product-associations/catalog", "get", "200", "401", "403"],
  ["/api/v1/collective/campaigns/{campaignId}/proposals", "post", "201", "401", "403", "404", "409"],
  ["/api/v1/collective/campaigns/{campaignId}/proposals", "get", "200", "401", "403", "404"],
  ["/api/v1/collective/proposals/{proposalId}", "get", "200", "401", "403", "404"],
  ["/api/v1/collective/proposals/{proposalId}/csv", "get", "200", "401", "403", "404"],
];
assert.deepEqual(
  Object.keys(f06.paths).sort(),
  [...new Set(f06Required.map(([path]) => path))].sort(),
);
for (const [path, method, ...statuses] of f06Required) {
  const operation = f06.paths[path]?.[method];
  assert.ok(operation, `Missing ${method.toUpperCase()} ${path}`);
  assert.deepEqual(spec.paths[path][method], operation, `${path} differs from the main snapshot`);
  assert.ok(operation.security?.some((security) => "bearer" in security), `${path} requires bearer`);
  for (const status of statuses) assert.ok(operation.responses[status], `Missing ${status} on ${path}`);
}
const summary = f06.paths["/api/v1/collective/campaigns/{campaignId}/summary"].get.responses["200"].content["application/json"].schema;
assert.equal(summary.additionalProperties, false);
assert.deepEqual(summary.required, ["contractVersion", "campaign", "disclosure", "coverage", "cells"]);
assert.deepEqual(summary.properties.disclosure.properties.approved.enum, [false]);
const cell = summary.properties.cells.items;
assert.equal(cell.additionalProperties, false);
assert.deepEqual(Object.keys(cell.properties).sort(), [...cell.required].sort());
for (const forbidden of ["memberId", "member_ref", "accountId", "clientId", "quantity_base"]) {
  assert.ok(!(forbidden in cell.properties), `Cell must not expose ${forbidden}`);
}
assert.ok(f06.paths["/api/v1/collective/campaigns/{campaignId}/summary.csv"].get.responses["200"].content["text/csv"]);
// F07 #27: closed proposal shapes, DRAFT only, declared need, no per-Member data.
const proposal = f06.paths["/api/v1/collective/proposals/{proposalId}"].get.responses["200"].content["application/json"].schema;
assert.equal(proposal.additionalProperties, false);
assert.deepEqual(Object.keys(proposal.properties).sort(), [...proposal.required].sort());
assert.deepEqual(proposal.properties.status.enum, ["DRAFT"]);
assert.deepEqual(proposal.properties.basis.enum, ["DECLARED_NEED"]);
const line = proposal.properties.lines.items;
assert.equal(line.additionalProperties, false);
assert.deepEqual(Object.keys(line.properties).sort(), [...line.required].sort());
// A figure the summary no longer shows is WITHDRAWN or SUPERSEDED, and the
// fingerprint that covers it can be hidden (null).
for (const state of ["WITHDRAWN", "SUPERSEDED", "POLICY_PENDING"]) assert.ok(line.properties.status.enum.includes(state));
assert.equal(proposal.properties.inputs_fingerprint.nullable, true);
for (const forbidden of ["memberId", "member_ref", "accountId", "clientId", "net_need", "declared_stock"]) {
  assert.ok(!(forbidden in line.properties), `Proposal line must not expose ${forbidden}`);
}
const history = f06.paths["/api/v1/collective/campaigns/{campaignId}/proposals"].get.responses["200"].content["application/json"].schema;
assert.ok(!("lines" in history.items.properties) && !("quantity_base" in history.items.properties));
assert.ok(f06.paths["/api/v1/collective/proposals/{proposalId}/csv"].get.responses["200"].content["text/csv"]);
process.stdout.write("F06 collective OpenAPI contract assertions passed.\n");
