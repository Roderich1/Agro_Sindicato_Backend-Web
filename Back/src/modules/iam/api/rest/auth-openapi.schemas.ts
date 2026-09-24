import { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

export const v1UserResponseSchema: SchemaObject = {
  type: "object",
  required: ["id", "name", "email", "role", "tenantId", "tenant"],
  properties: {
    id: { type: "string" }, name: { type: "string" }, email: { type: "string" },
    role: { type: "string" }, tenantId: { type: "string" },
    tenant: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } } },
  },
};

export const v1AuthResponseSchema: SchemaObject = {
  type: "object",
  required: ["accessToken", "user"],
  properties: {
    accessToken: { type: "string", description: "Bearer V1; refresh se entrega solo en cookie HttpOnly." },
    user: v1UserResponseSchema,
  },
};

const context = {
  type: "object" as const,
  properties: {
    account: { type: "object" as const, properties: { id: { type: "string" as const }, name: { type: "string" as const }, email: { type: "string" as const }, isActive: { type: "boolean" as const } } },
    member: { type: "object" as const, properties: { id: { type: "string" as const }, role: { type: "string" as const }, isActive: { type: "boolean" as const } } },
    tenant: { type: "object" as const, properties: { id: { type: "string" as const }, name: { type: "string" as const }, slug: { type: "string" as const }, isActive: { type: "boolean" as const } } },
    role: { type: "string" as const },
    session: { type: "object" as const, properties: { id: { type: "string" as const }, status: { type: "string" as const }, refreshTransport: { type: "string" as const, enum: ["COOKIE", "BODY"] }, createdAt: { type: "string" as const, format: "date-time" }, lastSeenAt: { type: "string" as const, format: "date-time" }, expiresAt: { type: "string" as const, format: "date-time" }, clientRegistrationId: { type: "string" as const, nullable: true } } },
  },
};

export const v2AuthResponseSchema: SchemaObject = {
  type: "object",
  required: ["contractVersion", "accessToken", "refreshTransport", "sessionExpiresAt", "context"],
  properties: {
    contractVersion: { type: "integer", enum: [2] },
    accessToken: { type: "string", description: "Bearer JWT con memberId, sessionId y ver=2." },
    refreshTransport: { type: "string", enum: ["COOKIE", "BODY"] },
    sessionExpiresAt: { type: "string", format: "date-time" },
    context,
    refreshToken: { type: "string", description: "Solo aparece con transporte BODY; COOKIE usa refresh_token_v2 HttpOnly." },
  },
};

export const clientRegistrationResponseSchema: SchemaObject = {
  type: "object",
  required: ["registrationId", "status", "createdAt", "lastSeenAt", "revokedAt"],
  properties: {
    registrationId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ACTIVE", "REVOKED"] },
    createdAt: { type: "string", format: "date-time" },
    lastSeenAt: { type: "string", format: "date-time" },
    revokedAt: { type: "string", format: "date-time", nullable: true },
  },
};
