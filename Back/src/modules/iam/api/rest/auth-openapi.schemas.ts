import { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

export const v1UserResponseSchema: SchemaObject = {
  type: "object",
  required: ["id", "name", "email", "role", "tenantId", "tenant"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
    role: { type: "string" },
    tenantId: { type: "string" },
    tenant: {
      type: "object",
      required: ["id", "name", "slug"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        slug: { type: "string" },
      },
    },
  },
};

export const v1AuthResponseSchema: SchemaObject = {
  type: "object",
  required: ["accessToken", "user"],
  properties: {
    accessToken: {
      type: "string",
      description: "Bearer V1; refresh se entrega solo en cookie HttpOnly.",
    },
    user: v1UserResponseSchema,
  },
};

export const v2ContextResponseSchema: SchemaObject = {
  type: "object",
  required: ["account", "member", "tenant", "role", "session"],
  properties: {
    account: {
      type: "object",
      required: ["id", "name", "email", "isActive"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        isActive: { type: "boolean" },
      },
    },
    member: {
      type: "object",
      required: ["id", "role", "isActive"],
      properties: {
        id: { type: "string" },
        role: {
          type: "string",
          enum: ["AGRICULTOR", "DIRECTIVA", "ADMINISTRADOR"],
        },
        isActive: { type: "boolean" },
      },
    },
    tenant: {
      type: "object",
      required: ["id", "name", "slug", "isActive"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        slug: { type: "string" },
        isActive: { type: "boolean" },
      },
    },
    role: {
      type: "string",
      enum: ["AGRICULTOR", "DIRECTIVA", "ADMINISTRADOR"],
    },
    session: {
      type: "object",
      required: [
        "id",
        "status",
        "refreshTransport",
        "createdAt",
        "lastSeenAt",
        "expiresAt",
        "clientRegistrationId",
      ],
      properties: {
        id: { type: "string" },
        status: {
          type: "string",
          enum: ["ACTIVE"],
          description:
            "El contexto se entrega solo para sesiones activas; el modelo persistido tambien contempla REVOKED y COMPROMISED.",
        },
        refreshTransport: { type: "string", enum: ["COOKIE", "BODY"] },
        createdAt: { type: "string", format: "date-time" },
        lastSeenAt: { type: "string", format: "date-time" },
        expiresAt: { type: "string", format: "date-time" },
        clientRegistrationId: { type: "string", nullable: true },
      },
    },
  },
};

export const v2AuthResponseSchema: SchemaObject = {
  type: "object",
  required: [
    "contractVersion",
    "accessToken",
    "refreshTransport",
    "sessionExpiresAt",
    "context",
  ],
  properties: {
    contractVersion: { type: "integer", enum: [2] },
    accessToken: {
      type: "string",
      description: "Bearer JWT con memberId, sessionId y ver=2.",
    },
    refreshTransport: { type: "string", enum: ["COOKIE", "BODY"] },
    sessionExpiresAt: { type: "string", format: "date-time" },
    context: v2ContextResponseSchema,
    refreshToken: {
      type: "string",
      description:
        "Solo aparece con transporte BODY; COOKIE usa refresh_token_v2 HttpOnly.",
    },
  },
};

export const bindSessionClientResponseSchema: SchemaObject = {
  type: "object",
  required: ["registrationId", "status"],
  properties: {
    registrationId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ACTIVE"] },
  },
};

export const clientRegistrationResponseSchema: SchemaObject = {
  type: "object",
  required: [
    "registrationId",
    "status",
    "createdAt",
    "lastSeenAt",
    "revokedAt",
  ],
  properties: {
    registrationId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ACTIVE", "REVOKED"] },
    createdAt: { type: "string", format: "date-time" },
    lastSeenAt: { type: "string", format: "date-time" },
    revokedAt: { type: "string", format: "date-time", nullable: true },
  },
};
